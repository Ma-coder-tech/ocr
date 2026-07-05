import path from "node:path";
import { zodSchema } from "ai";
import { describe, expect, it } from "vitest";
import {
  buildFiservFeeAnalysisAiPacket,
  maybeRunFiservFeeAnalysisAiClassificationForParserOutput,
} from "../src/fiservFeeAnalysisAiClassification.js";
import { fiservFirstDataFullStatementDriver } from "../src/fiservFirstDataParser.js";
import { parsePdf } from "../src/parser.js";

const CLOVER_FULL_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "SAMPLE_MERCHANT4_CLOVER.pdf");

describe("Fiserv V2 AI fee classification", () => {
  it("builds an AI packet from V2 ai_candidate rows with statement and reference context", async () => {
    const doc = await parsePdf(CLOVER_FULL_PDF_PATH);
    const parsed = fiservFirstDataFullStatementDriver.parse(doc, { sourceFileName: "SAMPLE_MERCHANT4_CLOVER.pdf" });

    const packet = buildFiservFeeAnalysisAiPacket(parsed.fiservFeeAnalysisV2, {
      statementFamily: parsed.statementIdentity.statementFamily,
      visibleBrand: parsed.statementIdentity.visibleBrand,
      merchantName: parsed.statementIdentity.merchantName,
      merchantNumber: parsed.statementIdentity.merchantNumber,
      statementPeriodStart: parsed.statementIdentity.statementPeriodStart,
      statementPeriodEnd: parsed.statementIdentity.statementPeriodEnd,
      pricingModel: parsed.fiservFeeAnalysisV2.pricingModel.pricingModel,
      pricingModelAnalysisStatus: parsed.fiservFeeAnalysisV2.pricingModel.analysisStatus,
      totalVolume: parsed.selectedFinancials.totalVolume,
      totalFees: parsed.selectedFinancials.totalFees,
      effectiveRate: parsed.selectedFinancials.effectiveRate,
    });

    expect(packet.context).toMatchObject({
      statementFamily: "fiserv_first_data_full_statement",
      visibleBrand: "First Data / Fiserv-style card processing statement",
      pricingModel: "interchange_plus",
      pricingModelAnalysisStatus: "ic_plus_ready",
    });
    expect(packet.unresolvedRows).toHaveLength(5);
    expect(packet.unresolvedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardTypeSection: "VISA",
          description: "VISA ZERO ACCT VER DB FEE 2 TRANSACTIONS AT 0.03",
          amount: 0.06,
          count: 2,
          rate: 0.03,
        }),
      ]),
    );
    expect(packet.referenceHints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "VS-001",
          canonicalName: "Acquirer Processing Fee (APF) — Credit",
        }),
        expect.objectContaining({
          id: "VS-007",
          canonicalName: "Transaction Integrity Fee (TIF)",
        }),
      ]),
    );
  });

  it("applies mocked AI classifications to V2 rows without claiming pass-through proof", async () => {
    const doc = await parsePdf(CLOVER_FULL_PDF_PATH);
    const parsed = fiservFirstDataFullStatementDriver.parse(doc, { sourceFileName: "SAMPLE_MERCHANT4_CLOVER.pdf" });
    let prompt = "";

    const result = await maybeRunFiservFeeAnalysisAiClassificationForParserOutput(parsed, {
      enabled: true,
      provider: "anthropic",
      anthropicApiKey: "test-key",
      applyMinConfidence: "medium",
      modelName: "test-v2-model",
      sdk: {
        createAnthropic: () => () => ({ provider: "mock-anthropic" }),
        generateObject: async (options) => {
          prompt = String(options.prompt ?? "");
          const packet = JSON.parse(prompt.split("Structured packet:\n\n").at(-1) ?? "{}") as {
            unresolvedRows: Array<{ rowIndex: number; cardTypeSection: string | null; description: string }>;
          };
          return {
            object: {
              rows: packet.unresolvedRows.map((row) => {
                const isVisaIntegrity = row.description.includes("INTEGRITY");
                const isAmexProgram = row.cardTypeSection === "AMEX ACQ" && !row.description.includes("ACQUIRER TRANS FEE");
                const isAmexAcquirerTransaction = row.description.includes("ACQUIRER TRANS FEE");
                return {
                  rowIndex: row.rowIndex,
                  feeType: isAmexProgram ? "interchange" : "card_brand_network",
                  confidence: "high",
                  paidTo: isAmexProgram ? "issuer_or_interchange" : "card_network",
                  negotiability: "non_negotiable",
                  canonicalName: isVisaIntegrity
                    ? "Transaction Integrity Fee"
                    : isAmexProgram
                    ? "Amex OptBlue Restaurant Program Fee"
                    : isAmexAcquirerTransaction
                      ? "Amex Acquirer Transaction Fee"
                      : "Card Network Pass-Through Fee",
                  suggestedReferenceId: isVisaIntegrity ? "VS-007" : isAmexAcquirerTransaction ? "AX-002" : null,
                  proofStatus: "indeterminate",
                  assessment: isVisaIntegrity
                    ? {
                        paidToParty: "card_network",
                        passThroughProofPosture: "source_backed_math_candidate",
                        negotiability: "likely_non_negotiable",
                        avoidableLikelihood: "low",
                        merchantAction: "request_pass_through_documentation",
                        recommendation: "Verify the Transaction Integrity Fee against the Visa reference for the statement period.",
                        fixedFeeAssessment: null,
                        evidence: ["Visa integrity label, transaction count, stated per-item rate, and amount are present."],
                        sourceEvidence: {
                          sourceName: "Visa Transaction Integrity Fee",
                          referenceId: "VS-007",
                          referenceRate: 0.002,
                          statementRate: 0.002,
                          statementAmount: 0.01,
                          mathSummary: "5 transactions x $0.002 = $0.01.",
                          verificationNote: "AI supplied a source-backed math candidate; deterministic reference-rate verification remains final.",
                        },
                      }
                    : null,
                  reasonCodes: ["SECTION_AND_LABEL_MATCH"],
                  explanation: "Classified from card section, fee label, and row math. Rate proof remains separate.",
                };
              }),
            },
          };
        },
      },
    });

    const analysis = result.output.fiservFeeAnalysisV2;
    const aiRows = analysis.rows.filter((row) => row.matchMethod === "ai_classified");

    expect(prompt).toContain("Never return proven or likely");
    expect(prompt).toContain("source_backed_math_candidate");
    expect(result.ai).toMatchObject({
      status: "applied",
      provider: "anthropic",
      model: "test-v2-model",
      unresolvedInputRowCount: 5,
      suggestionCount: 5,
      appliedSuggestionCount: 5,
      skippedSuggestionCount: 0,
    });
    expect(analysis.ai).toMatchObject(result.ai);
    expect(analysis.normalization).toMatchObject({
      rowCount: 134,
      aiCandidateCount: 0,
      aiClassifiedCount: 5,
    });
    expect(aiRows).toHaveLength(5);
    expect(aiRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "VISA ZERO ACCT VER DB FEE 2 TRANSACTIONS AT 0.03",
          feeType: "card_brand_network",
          canonicalName: "Card Network Pass-Through Fee",
          referenceId: null,
          proofStatus: "indeterminate",
          rateComparison: "not_compared",
          aiAssessment: expect.objectContaining({
            paidToParty: "card_network",
            passThroughProofPosture: "not_enough_evidence",
          }),
        }),
      ]),
    );
    expect(aiRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalName: "Transaction Integrity Fee",
          referenceId: "VS-007",
          proofStatus: "indeterminate",
          aiAssessment: expect.objectContaining({
            passThroughProofPosture: "source_backed_math_candidate",
            sourceEvidence: expect.objectContaining({
              referenceId: "VS-007",
            }),
          }),
        }),
      ]),
    );
    expect(aiRows.map((row) => row.proofStatus)).not.toContain("proven");
    expect(aiRows.map((row) => row.proofStatus)).not.toContain("likely");
    expect(analysis.buckets.find((bucket) => bucket.feeType === "unknown")).toBeUndefined();
    expect(analysis.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "normalization_ai_candidates",
        }),
      ]),
    );
  });

  it("preserves AI fixed-fee avoidable assessment on processor fixed suggestions", async () => {
    const doc = await parsePdf(CLOVER_FULL_PDF_PATH);
    const parsed = fiservFirstDataFullStatementDriver.parse(doc, { sourceFileName: "SAMPLE_MERCHANT4_CLOVER.pdf" });
    let prompt = "";

    const result = await maybeRunFiservFeeAnalysisAiClassificationForParserOutput(parsed, {
      enabled: true,
      provider: "anthropic",
      anthropicApiKey: "test-key",
      applyMinConfidence: "medium",
      modelName: "test-v2-model",
      sdk: {
        createAnthropic: () => () => ({ provider: "mock-anthropic" }),
        generateObject: async (options) => {
          prompt = String(options.prompt ?? "");
          const packet = JSON.parse(prompt.split("Structured packet:\n\n").at(-1) ?? "{}") as {
            unresolvedRows: Array<{ rowIndex: number; amount: number; description: string }>;
          };
          const row = packet.unresolvedRows[0];
          return {
            object: {
              rows: [
                {
                  rowIndex: row.rowIndex,
                  feeType: "processor_fixed",
                  confidence: "high",
                  paidTo: "processor_or_iso",
                  negotiability: "negotiable",
                  canonicalName: "Unknown Fixed Processor Fee",
                  suggestedReferenceId: null,
                  proofStatus: "processor_controlled",
                  assessment: {
                    paidToParty: "processor_or_iso",
                    passThroughProofPosture: "not_applicable_processor_controlled",
                    negotiability: "likely_negotiable",
                    avoidableLikelihood: "high",
                    merchantAction: "request_fee_removal_or_reduction",
                    recommendation: `Ask the processor to remove or justify the ${row.amount.toFixed(2)} fixed fee.`,
                    fixedFeeAssessment: {
                      avoidable: "true",
                      recommendation: "No clear active service is identified; request removal or a written service description.",
                      confidence: "high",
                    },
                    evidence: [`${row.description} was treated as a processor-controlled fixed fee for this test.`],
                    sourceEvidence: {
                      sourceName: null,
                      referenceId: null,
                      referenceRate: null,
                      statementRate: null,
                      statementAmount: row.amount,
                      mathSummary: null,
                      verificationNote: "Fixed fee assessment is advisory and not pass-through proof.",
                    },
                  },
                  reasonCodes: ["UNKNOWN_FIXED_FEE_ASSESSMENT"],
                  explanation: "Label does not identify a card-brand pass-through source.",
                },
              ],
            },
          };
        },
      },
    });

    const fixedRow = result.output.fiservFeeAnalysisV2.rows.find((row) => row.feeType === "processor_fixed" && row.matchMethod === "ai_classified");

    expect(prompt).toContain("When classifying a row as processor_fixed");
    expect(fixedRow).toMatchObject({
      feeType: "processor_fixed",
      proofStatus: "processor_controlled",
      aiAssessment: {
        fixedFeeAssessment: {
          avoidable: "true",
          recommendation: "No clear active service is identified; request removal or a written service description.",
          confidence: "high",
        },
      },
    });
    expect(result.output.fiservFeeAnalysisV2.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidence: expect.arrayContaining([expect.stringContaining("Fixed fee avoidable assessment: true")]),
        }),
      ]),
    );
  });

  it("uses an OpenAI-compatible required nullable assessment schema", async () => {
    const doc = await parsePdf(CLOVER_FULL_PDF_PATH);
    const parsed = fiservFirstDataFullStatementDriver.parse(doc, { sourceFileName: "SAMPLE_MERCHANT4_CLOVER.pdf" });
    let capturedSchema: unknown = null;

    const result = await maybeRunFiservFeeAnalysisAiClassificationForParserOutput(parsed, {
      enabled: true,
      provider: "openai",
      openAiApiKey: "test-openai-key",
      openAiModelName: "gpt-test",
      sdk: {
        openai: (modelName: string) => ({ provider: "openai", modelName }),
        Output: {
          object: (options) => {
            capturedSchema = options.schema;
            return { outputKind: "object", ...options };
          },
        },
        generateObject: async () => {
          throw new Error("OpenAI should use generateText.");
        },
        generateText: async () => ({
          output: {
            rows: [],
          },
        }),
      },
    });

    expect(result.ai.status).toBe("no_usable_suggestions");
    expect(capturedSchema).toBeTruthy();

    const json = await zodSchema(capturedSchema as Parameters<typeof zodSchema>[0]).jsonSchema;
    const rowSchema = json.properties?.rows?.items;
    expect(rowSchema).toMatchObject({
      required: expect.arrayContaining(["assessment"]),
    });
    expect(JSON.stringify(rowSchema?.properties?.assessment)).not.toContain('"not":{}');
  });
});
