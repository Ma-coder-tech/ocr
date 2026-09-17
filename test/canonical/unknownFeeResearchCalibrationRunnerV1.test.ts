import { describe, expect, it, vi } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildInternalAnalystFindingV1 } from "../../src/canonical/internalAnalystFindingV1.js";
import type { RetrievedDocument } from "../../src/canonical/feeKnowledgeRetrieval.js";
import { runCalibratedUnknownFeeResearchV1 } from "../../src/canonical/unknownFeeResearchCalibrationRunnerV1.js";
import { buildUnknownFeeResearchPlanV1 } from "../../src/canonical/unknownFeeResearchCalibrationV1.js";
import { parsePdf } from "../../src/parser.js";
import { runUnknownFeeResearchCalibrationLiveV1 } from "../../scripts/evaluate-unknown-fee-research-calibration-live-v1.js";

const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };

describe("Unknown-Fee Research Calibration & Retrieval Strategy v1 runner", () => {
  it("fails before credential access unless the one-time live authorization token is present", async () => {
    await expect(runUnknownFeeResearchCalibrationLiveV1({ authorization: null })).rejects.toThrow("exact_product_authorization_required");
  });

  it("does no external work when Stage 0 says determinant sufficiency is already adequate", async () => {
    const { report, analysis } = await reportFor("Nov_2024_Statement.pdf", "restaurant_food_beverage");
    const row = analysis.feeLedger.rows.find((item) => item.selectedLabel.includes("AMEX SALES DISCOUNT"))!;
    const finding = report.findings.find((item) => item.sourceFeeRowId === row.id)!;
    const plan = buildUnknownFeeResearchPlanV1({
      feeRowId: row.id,
      printedLabel: row.selectedLabel,
      processorName: "Clover",
      statementYear: "2024",
      statementRole: row.role,
      determinant: finding.openWorldDeterminants!,
    });
    const search = vi.fn();
    const retrieve = vi.fn();
    const synthesize = vi.fn();
    const result = await runCalibratedUnknownFeeResearchV1({ plan, adapters: { search, retrieve, synthesize } });

    expect(result.stage0Decision).toBe("STOP_WITHOUT_EXTERNAL_RESEARCH");
    expect(result.operations).toEqual([]);
    expect(search).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
    expect(result.invariants).toEqual({
      canonicalMutationAllowed: false,
      reusableKnowledgeSelfAdmissionAllowed: false,
      searchUsefulnessSeparateFromAuthority: true,
      candidateCannotOverrideContradictoryStatementStructure: true,
    });
  });

  it("stops after two genuinely different empty shapes and never spends retrieval budget", async () => {
    const { report, analysis } = await reportFor("Nov_2024_Statement.pdf", "restaurant_food_beverage");
    const plan = planFor(report, analysis, "BATCH SETTLEMENT");
    const search = vi.fn(async () => []);
    const retrieve = vi.fn();
    const result = await runCalibratedUnknownFeeResearchV1({ plan, adapters: { search, retrieve } });

    expect(search).toHaveBeenCalledTimes(2);
    expect(retrieve).not.toHaveBeenCalled();
    expect(result.operations).toHaveLength(2);
    expect(result.stoppingDecision).toMatchObject({ stop: true, stoppingReason: "S3_TWO_DISTINCT_SHAPES_NO_USABLE_EVIDENCE" });
  });

  it("prioritizes document genres, separates utility from authority, and creates candidates without admission", async () => {
    const { report, analysis } = await reportFor("Nov_2024_Statement.pdf", "restaurant_food_beverage");
    const plan = planFor(report, analysis, "MONTHLY ADVANTAGE");
    const search = vi.fn(async ({ shape }: { shape: { kind: string } }) => shape.kind === "CODE_PROCESSOR_DOCUMENT_GENRE"
      ? [
          { url: "https://www.clover.com/merchant-application.pdf", title: "Clover merchant application", publisher: "Fiserv" },
          { url: "https://example.com/blog", title: "Fee blog", publisher: "Example" },
        ]
      : [{ url: "https://example.com/blog", title: "Fee blog", publisher: "Example" }]);
    const retrieve = vi.fn(async (candidate: { url: string }) => candidate.url.includes("clover.com")
      ? document(candidate.url, "Fiserv Clover MCVDB Monthly Advantage Fee merchant pricing schedule.")
      : document(candidate.url, "Generic advice without the fee code."));
    const synthesize = vi.fn(async ({ evidence }: { evidence: Array<{ url: string; boundedExcerpt: string }> }) => ({
      candidateInterpretations: [{ claim: "MCVDB may identify a Clover program charge.", affectedDeterminants: ["D1", "D2"] as Array<"D1" | "D2">, confidence: "medium" as const, competingInterpretation: "Program scope remains unverified.", sourceUrls: evidence.map((item) => item.url) }],
      determinantLift: ["D1", "D2"] as Array<"D1" | "D2">,
      actionLift: true,
      evidenceTierImproved: true,
    }));
    const result = await runCalibratedUnknownFeeResearchV1({ plan, adapters: { search, retrieve, synthesize } });

    expect(result.operations.length).toBeLessThanOrEqual(8);
    expect(result.operations.filter((operation) => operation.type === "search")).toHaveLength(plan.queryShapes.length);
    expect(result.operations.filter((operation) => operation.type === "candidate_synthesis")).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      url: "https://www.clover.com/merchant-application.pdf",
      lane: "processor_own",
      searchUseful: true,
      evidenceUseful: true,
      authorityState: "candidate_not_admitted",
    });
    expect(result.synthesis?.determinantLift).toEqual(["D1", "D2"]);
    expect(result.invariants.reusableKnowledgeSelfAdmissionAllowed).toBe(false);
    expect(synthesize.mock.calls[0]?.[0].evidence[0].boundedExcerpt).toContain("MCVDB Monthly Advantage");
  });
});

async function reportFor(file: string, businessType: "restaurant_food_beverage" | "ecommerce") {
  const parsed = await parsePdf(`test/fixtures/pdfs/${file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(parsed, { sourceFileName: file, businessType });
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
  return { analysis, report };
}

function planFor(
  report: ReturnType<typeof buildInternalAnalystFindingV1>,
  analysis: ReturnType<typeof buildCanonicalStatementFactsFromParsedDocument>,
  labelPart: string,
) {
  const row = analysis.feeLedger.rows.find((item) => item.selectedLabel.includes(labelPart));
  if (!row) throw new Error(`row missing: ${labelPart}`);
  const item = [...report.researchQueue.selected, ...report.researchQueue.deferred]
    .find((candidate) => candidate.question.feeRowRef === row.id);
  if (!item) throw new Error(`calibrated plan missing: ${labelPart}`);
  return item.calibration;
}

function document(url: string, text: string): RetrievedDocument {
  return {
    type: "fee_knowledge_retrieved_document",
    policyVersion: "fee_knowledge_retrieval_2026_03_14_v2",
    status: "retrieved_text",
    canonicalUrl: url,
    redirectChain: [],
    contentType: "text/html",
    byteLength: text.length,
    documentFingerprint: "a".repeat(64),
    title: "Test document",
    text,
    locators: [],
    reasonCodes: ["fee_knowledge_document_retrieved"],
  };
}
