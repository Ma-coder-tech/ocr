import path from "node:path";
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
                const isAmexProgram = row.cardTypeSection === "AMEX ACQ" && !row.description.includes("ACQUIRER TRANS FEE");
                const isAmexAcquirerTransaction = row.description.includes("ACQUIRER TRANS FEE");
                return {
                  rowIndex: row.rowIndex,
                  feeType: isAmexProgram ? "interchange" : "card_brand_network",
                  confidence: "high",
                  paidTo: isAmexProgram ? "issuer_or_interchange" : "card_network",
                  negotiability: "non_negotiable",
                  canonicalName: isAmexProgram
                    ? "Amex OptBlue Restaurant Program Fee"
                    : isAmexAcquirerTransaction
                      ? "Amex Acquirer Transaction Fee"
                      : "Card Network Pass-Through Fee",
                  suggestedReferenceId: isAmexAcquirerTransaction ? "AX-002" : null,
                  proofStatus: "indeterminate",
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
});
