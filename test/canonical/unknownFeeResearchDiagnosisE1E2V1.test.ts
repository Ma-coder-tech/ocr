import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildInternalAnalystFindingV1 } from "../../src/canonical/internalAnalystFindingV1.js";
import {
  buildMonthlyAdvantageManualPlanV1,
  E1_ADJUDICATIONS,
  runUnknownFeeResearchDiagnosisE1E2V1,
} from "../../scripts/evaluate-unknown-fee-research-diagnosis-e1-e2-v1.js";
import { parsePdf } from "../../src/parser.js";

const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };

describe("Unknown-Fee Research Diagnosis E1 + E2", () => {
  it("keeps E1 diagnostic adjudications separate from permanent runtime policy", () => {
    expect(E1_ADJUDICATIONS.filter((item) => item.decision === "RESEARCH_WARRANTED").map((item) => item.caseId)).toEqual(["monthly_advantage"]);
    expect(E1_ADJUDICATIONS.filter((item) => item.decision === "SUPPRESS_RESEARCH").map((item) => item.caseId)).toEqual([
      "batch_settlement",
      "application_fee_generic",
      "amexct043_nqual_coded",
      "cpu_gateway_stage0_control",
    ]);
    expect(E1_ADJUDICATIONS.every((item) => item.unresolvedAfterE1.length > 0)).toBe(true);
  });

  it("changes only the E2 query input while preserving the automated plan budget and evidence controls", async () => {
    const parsed = await parsePdf("test/fixtures/pdfs/Nov_2024_Statement.pdf");
    const analysis = buildCanonicalStatementFactsFromParsedDocument(parsed, { sourceFileName: "Nov_2024_Statement.pdf", businessType: "restaurant_food_beverage" });
    const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
    const row = analysis.feeLedger.rows.find((item) => item.selectedLabel.includes("MONTHLY ADVANTAGE FEE"))!;
    const automated = [...report.researchQueue.selected, ...report.researchQueue.deferred].find((item) => item.question.feeRowRef === row.id)!.calibration;
    const manual = buildMonthlyAdvantageManualPlanV1(automated);

    expect(manual.budget).toEqual(automated.budget);
    expect(manual.stage0).toEqual(automated.stage0);
    expect(manual.evidencePolicy).toEqual(automated.evidencePolicy);
    expect(manual.queryShapes.map((shape) => shape.query)).toEqual([
      "\"Monthly Advantage Fee\" payment processing",
      "\"Monthly Advantage Fee\" MCVDB",
      "\"Monthly Advantage Fee\" AMDS",
      "\"Monthly Advantage Fee\" \"merchant application\" \"Clover\" \"First Data\"",
    ]);
  }, 30_000);

  it("fails before credential access or provider work without the exact diagnostic authorization", async () => {
    await expect(runUnknownFeeResearchDiagnosisE1E2V1({ authorization: null })).rejects.toThrow("exact_product_authorization_required");
  });

  it("preserves the bounded live E2 result and canonical invariance", async () => {
    const result = JSON.parse(await readFile("evaluations/unknown-fee-research-diagnosis-e1-e2-v1/evaluation-2026-09-08.json", "utf8"));
    expect(result.e1.priorResearchCallsSuppressed).toEqual(["batch_settlement", "application_fee_generic", "amexct043_nqual_coded"]);
    expect(result.e1.suppressionsWithQualityLoss).toEqual([]);
    expect(result.e2.armA.operationCounts).toMatchObject({ searches: 4, documentFetches: 3, syntheses: 1, totalExternalOperations: 8 });
    expect(result.e2.armB.operationCounts).toMatchObject({ searches: 4, documentFetches: 3, syntheses: 1, totalExternalOperations: 8 });
    expect(result.e2.comparison.sameUsefulDocumentsDiscovered).toBe(true);
    expect(result.e2.armA.result.synthesis).toMatchObject({ determinantLift: [], actionLift: false, evidenceTierImproved: false });
    expect(result.e2.armB.result.synthesis).toMatchObject({ determinantLift: [], actionLift: false, evidenceTierImproved: false });
    expect(result.invariants.allCanonicalFinancialFingerprintsUnchanged).toBe(true);
  });
});
