import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildInternalAnalystFindingV1 } from "../../src/canonical/internalAnalystFindingV1.js";
import {
  buildUnknownFeeResearchPlanV1,
  classifyUnknownFeeSourceLaneV1,
  decideUnknownFeeResearchStopV1,
  summarizeUnknownFeeResearchQualityV1,
  type UnknownFeeResearchCaseMetricV1,
} from "../../src/canonical/unknownFeeResearchCalibrationV1.js";
import { parsePdf } from "../../src/parser.js";

const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };

describe("Unknown-Fee Research Calibration & Retrieval Strategy v1", () => {
  it("routes the two live-test fees through distinct processor-aware query shapes and stops already-usable exact pricing rows", async () => {
    const { analysis, report } = await reportFor("Nov_2024_Statement.pdf", "restaurant_food_beverage");
    const monthly = queueItem(report, analysis, "MONTHLY ADVANTAGE FEE");
    const batch = queueItem(report, analysis, "BATCH SETTLEMENT FEE");
    const salesDiscountRow = analysis.feeLedger.rows.find((row) => row.selectedLabel.includes("AMEX SALES DISCOUNT"))!;
    const salesDiscountFinding = report.findings.find((finding) => finding.sourceFeeRowId === salesDiscountRow.id)!;
    const salesDiscount = buildUnknownFeeResearchPlanV1({
      feeRowId: salesDiscountRow.id,
      printedLabel: salesDiscountRow.selectedLabel,
      processorName: "Clover",
      statementYear: "2024",
      statementRole: salesDiscountRow.role,
      determinant: salesDiscountFinding.openWorldDeterminants!,
    });

    expect(monthly.calibration).toMatchObject({
      primaryType: "A_PROPRIETARY_BRANDED",
      applicableTypes: expect.arrayContaining(["C_ABBREVIATED_CODED", "F_UNFAMILIAR_PER_ITEM_OR_RECURRING"]),
      stage0: { decision: "RESEARCH", exactIdentityMateriallyChangesConclusion: true },
      budget: { maximumSearchShapes: 4, maximumDocumentFetches: 3, maximumSynthesisCalls: 1, maximumExternalOperations: 8 },
    });
    expect(monthly.calibration.queryShapes.map((shape) => shape.kind)).toEqual([
      "EXACT_QUOTED_LABEL",
      "PROCESSOR_EXACT_LABEL",
      "CODE_PROCESSOR_DOCUMENT_GENRE",
      "SAME_PLATFORM_PUBLIC_STATEMENT",
    ]);
    expect(monthly.calibration.queryShapes.some((shape) => shape.query.includes("MCVDB") && shape.query.includes("AMDS") && shape.query.includes("Clover"))).toBe(true);
    expect(new Set(monthly.calibration.queryShapes.map((shape) => shape.query)).size).toBe(monthly.calibration.queryShapes.length);

    expect(batch.calibration).toMatchObject({
      primaryType: "F_UNFAMILIAR_PER_ITEM_OR_RECURRING",
      stage0: { decision: "RESEARCH", unresolvedMaterialDeterminant: true },
      budget: { maximumExternalOperations: 7 },
    });
    expect(batch.calibration.queryShapes.map((shape) => shape.kind)).toEqual([
      "EXACT_QUOTED_LABEL",
      "MECHANIC_POPULATION_HYPOTHESIS",
      "PROCESSOR_FEE_SCHEDULE",
    ]);
    expect(batch.calibration.queryShapes[1]?.query).toContain("individual_charge");

    expect(salesDiscount.stage0).toMatchObject({
      decision: "STOP_WITHOUT_EXTERNAL_RESEARCH",
      exactIdentityMateriallyChangesConclusion: false,
      stoppingReason: "S1_DETERMINANT_SUFFICIENCY",
    });
    expect(salesDiscount.queryShapes).toEqual([]);
  }, 30_000);

  it("distinguishes generic, coded, network-looking, service, and recurring research types without forcing research", async () => {
    const { analysis, report } = await reportFor("fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", "ecommerce");
    const additional = planFor(report, analysis, "**ADDITIONAL FEES", "Paysafe Payment Processing", "2025");
    const cpu = planFor(report, analysis, "CPU GTWY", "Paysafe Payment Processing", "2025");
    const network = planFor(report, analysis, "FIXED NETWORK CNP FEE", "Paysafe Payment Processing", "2025");

    expect(additional).toMatchObject({
      applicableTypes: expect.arrayContaining(["B_GENERIC_DESCRIPTIVE"]),
      stage0: { decision: "RESEARCH" },
    });
    expect(additional.budget.maximumSearchShapes).toBeLessThanOrEqual(3);
    expect(cpu).toMatchObject({
      applicableTypes: expect.arrayContaining(["C_ABBREVIATED_CODED", "E_THIRD_PARTY_OR_SERVICE"]),
      stage0: { decision: "STOP_WITHOUT_EXTERNAL_RESEARCH", stoppingReason: "S1_DETERMINANT_SUFFICIENCY" },
    });
    expect(network.applicableTypes).toContain("D_NETWORK_LOOKING");
    expect(network.queryShapes.some((shape) => shape.kind === "NETWORK_PERIOD_GEOGRAPHY_PRODUCT")).toBe(true);
  }, 30_000);

  it("enforces evidence-quality, stagnation, and operation-budget stops independently of search usefulness", async () => {
    const { analysis, report } = await reportFor("Nov_2024_Statement.pdf", "restaurant_food_beverage");
    const plan = queueItem(report, analysis, "MONTHLY ADVANTAGE FEE").calibration;

    expect(decideUnknownFeeResearchStopV1({
      plan,
      determinantSufficientAfterResearch: false,
      exactIdentityStillNecessary: true,
      executedDistinctQueryShapes: 2,
      usableEvidenceCount: 0,
      retrievedOnlyLowQualityOrDuplicativeEvidence: false,
      evidenceOrConfidenceTierImproved: false,
      externalOperations: 2,
    })).toMatchObject({ stop: true, stoppingReason: "S3_TWO_DISTINCT_SHAPES_NO_USABLE_EVIDENCE" });
    expect(decideUnknownFeeResearchStopV1({
      plan,
      determinantSufficientAfterResearch: false,
      exactIdentityStillNecessary: true,
      executedDistinctQueryShapes: 1,
      usableEvidenceCount: 1,
      retrievedOnlyLowQualityOrDuplicativeEvidence: true,
      evidenceOrConfidenceTierImproved: false,
      externalOperations: 3,
    })).toMatchObject({ stop: true, stoppingReason: "S4_SOURCE_QUALITY_FAILURE" });
    expect(decideUnknownFeeResearchStopV1({
      plan,
      determinantSufficientAfterResearch: true,
      exactIdentityStillNecessary: false,
      executedDistinctQueryShapes: 1,
      usableEvidenceCount: 1,
      retrievedOnlyLowQualityOrDuplicativeEvidence: false,
      evidenceOrConfidenceTierImproved: true,
      externalOperations: 3,
    })).toMatchObject({ stop: true, stoppingReason: "S1_DETERMINANT_SUFFICIENCY" });

    expect(classifyUnknownFeeSourceLaneV1({ url: "https://merchants.fiserv.com/fees.pdf", processorName: "Clover" })).toBe("processor_own");
    expect(classifyUnknownFeeSourceLaneV1({ url: "https://www.cloverhealth.com/providers/resources", processorName: "Clover" })).toBe("generic_or_ai_navigation");
    expect(classifyUnknownFeeSourceLaneV1({ url: "https://city.gov/procurement/addendum.pdf", processorName: "Clover" })).toBe("procurement_or_institutional");
    expect(classifyUnknownFeeSourceLaneV1({ url: "https://merchantmaverick.com/fees", processorName: "Clover" })).toBe("specialist_industry");
  }, 30_000);

  it("reports determinant/action lift, shape yield, source distribution, efficiency, wasted budget, and corrections", () => {
    const cases: UnknownFeeResearchCaseMetricV1[] = [
      {
        caseId: "one",
        primaryType: "A_PROPRIETARY_BRANDED",
        stage0Decision: "RESEARCH",
        externalOperations: 6,
        executedQueryShapes: [
          { kind: "EXACT_QUOTED_LABEL", usableEvidence: false },
          { kind: "PROCESSOR_MERCHANT_APPLICATION", usableEvidence: true },
        ],
        sources: [{ lane: "processor_own", useful: true, authorityAccepted: false }],
        determinantLift: ["D1", "D2"],
        actionLift: true,
        evidenceTierImproved: true,
        correctionState: "none",
      },
      {
        caseId: "two",
        primaryType: "C_ABBREVIATED_CODED",
        stage0Decision: "STOP_WITHOUT_EXTERNAL_RESEARCH",
        externalOperations: 0,
        executedQueryShapes: [],
        sources: [],
        determinantLift: [],
        actionLift: false,
        evidenceTierImproved: false,
        correctionState: "downgraded",
      },
    ];
    expect(summarizeUnknownFeeResearchQualityV1(cases)).toMatchObject({
      cases: 2,
      researchCases: 1,
      stage0Stops: 1,
      determinantLiftCases: 1,
      actionLiftCases: 1,
      evidenceTierImprovementCases: 1,
      researchEfficiency: { usefulCases: 1, totalExternalOperations: 6 },
      wastedBudgetRatePercent: 0,
      queryShapeYield: { PROCESSOR_MERCHANT_APPLICATION: { executed: 1, usableEvidence: 1 } },
      sourceQualityDistribution: { processor_own: { found: 1, useful: 1, authorityAccepted: 0 } },
      correctionTracking: { downgraded: 1, corrected: 0, reversed: 0 },
    });
  });
});

async function reportFor(file: string, businessType: "restaurant_food_beverage" | "ecommerce") {
  const document = await parsePdf(`test/fixtures/pdfs/${file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: file, businessType });
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
  return { analysis, report };
}

function queueItem(
  report: ReturnType<typeof buildInternalAnalystFindingV1>,
  analysis: ReturnType<typeof buildCanonicalStatementFactsFromParsedDocument>,
  labelPart: string,
) {
  const row = analysis.feeLedger.rows.find((item) => item.selectedLabel.includes(labelPart));
  if (!row) throw new Error(`row missing: ${labelPart}`);
  const item = [...report.researchQueue.selected, ...report.researchQueue.deferred].find((candidate) => candidate.question.feeRowRef === row.id);
  if (!item) throw new Error(`research plan missing: ${labelPart}`);
  return item;
}

function planFor(
  report: ReturnType<typeof buildInternalAnalystFindingV1>,
  analysis: ReturnType<typeof buildCanonicalStatementFactsFromParsedDocument>,
  labelPart: string,
  processorName: string,
  statementYear: string,
) {
  const row = analysis.feeLedger.rows.find((item) => item.selectedLabel.includes(labelPart));
  if (!row) throw new Error(`row missing: ${labelPart}`);
  const finding = report.findings.find((item) => item.sourceFeeRowId === row.id);
  if (!finding?.openWorldDeterminants) throw new Error(`finding missing: ${labelPart}`);
  return buildUnknownFeeResearchPlanV1({
    feeRowId: row.id,
    printedLabel: row.selectedLabel,
    processorName,
    statementYear,
    statementRole: row.role,
    determinant: finding.openWorldDeterminants,
  });
}
