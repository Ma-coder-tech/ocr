import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint } from "../../src/canonical/internalAnalystFindingV1.js";
import { buildUnknownFeeResearchPlanV1, DECISION_RELEVANT_STAGE0_WARRANT_GATE_V1 } from "../../src/canonical/unknownFeeResearchCalibrationV1.js";
import { parsePdf } from "../../src/parser.js";

const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };

describe("Decision-Relevant Stage-0 Warrant Gate v1", () => {
  it("reconciles the five Product controls without fee-specific warrant exceptions", async () => {
    const clover = await load("Nov_2024_Statement.pdf", "restaurant_food_beverage");
    const applicationStatement = await load("SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf", "other");
    const paysafe = await load("fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", "ecommerce");

    const monthly = control(clover, "MONTHLY ADVANTAGE FEE");
    expect(monthly.finding.openWorldDeterminants).toMatchObject({
      family: { state: "unresolved", value: null },
      d2MechanicAndPopulation: {
        mechanic: { state: "category_only", value: "rate_times_volume" },
        population: { state: "category_only", value: "printed_money_volume" },
      },
      d3Materiality: { volumeSensitivity: "proportional", annualizationAllowed: false },
      d4Actionability: { actionClass: "N7" },
    });
    expect(monthly.finding.printedArithmeticCorrectness.state).toBe("unresolved");
    expect(monthly.plan.stage0).toMatchObject({
      gateVersion: DECISION_RELEVANT_STAGE0_WARRANT_GATE_V1,
      decision: "RESEARCH",
      researchWarranted: true,
      proposedResearchFields: expect.arrayContaining(["exact_fee_identity", "economic_layer", "merchant_facing_price_controller"]),
    });
    expect(monthly.plan.stage0.whyResearchCouldChangeMerchantDecision.join(" ")).toContain("verification-only");

    const batch = control(clover, "BATCH SETTLEMENT FEE");
    expect(batch.finding.openWorldDeterminants).toMatchObject({
      family: { value: "F6" },
      d2MechanicAndPopulation: { mechanic: { value: "per_item" }, population: { value: "printed_item_count" } },
      d4Actionability: { actionClass: "N3" },
      determinantSufficiency: "DETERMINANT_SUFFICIENT",
    });
    expect(batch.finding.printedArithmeticCorrectness.value).toBe("reproduces");
    expectStoppedWithoutDecisionLoss(batch.plan);

    const application = control(applicationStatement, "APPLICATION FEE");
    expect(application.finding.openWorldDeterminants).toMatchObject({
      family: { state: "category_only", value: "F7" },
      d2MechanicAndPopulation: {
        mechanic: { value: "fixed_or_printed_charge" },
        population: { value: "current_statement_period_occurrence" },
      },
      d4Actionability: { actionClass: "N4" },
      determinantSufficiency: "DETERMINANT_SUFFICIENT",
    });
    expect(application.finding.practicalMerchantAction.value).toMatch(/waive|waiver/i);
    expect(JSON.stringify(application).toLowerCase()).not.toContain("one-time");
    expect(application.plan.stage0.unresolvedFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "recurrence", decisionRelevant: false }),
      expect.objectContaining({ field: "contractual_compliance", requiresMerchantDocument: true }),
    ]));
    expectStoppedWithoutDecisionLoss(application.plan);

    const nqual = control(paysafe, "AMEXCT043 - NQUAL DISC");
    expect(nqual.finding.openWorldDeterminants).toMatchObject({
      family: { value: "F5" },
      d2MechanicAndPopulation: {
        mechanic: { value: "ad valorem merchant-facing tier price" },
        population: { value: "printed tier-qualified merchant sales volume" },
      },
      d4Actionability: { actionClass: "N3" },
      determinantSufficiency: "DETERMINANT_SUFFICIENT",
    });
    expect(nqual.finding.printedArithmeticCorrectness.value).toBe("reproduces_with_rounding");
    expectStoppedWithoutDecisionLoss(nqual.plan);

    const cpu = control(paysafe, "CPU GTWY");
    expect(cpu.finding.openWorldDeterminants).toMatchObject({
      family: { value: "F9" },
      d2MechanicAndPopulation: { mechanic: { value: "authorization_events" } },
      d4Actionability: { actionClass: "N5" },
      determinantSufficiency: "DETERMINANT_SUFFICIENT",
    });
    expectStoppedWithoutDecisionLoss(cpu.plan);

    for (const loaded of [clover, applicationStatement, paysafe]) {
      expect(canonicalFinancialTruthFingerprint(loaded.analysis)).toBe(loaded.beforeFingerprint);
      expect(loaded.report.canonicalFinancialTruth).toMatchObject({ unchanged: true, mutationAllowed: false });
    }
  }, 45_000);

  it("preserves governed conflicts and routes them to adjudication instead of external research", async () => {
    const loaded = await load("Nov_2024_Statement.pdf", "restaurant_food_beverage");
    const monthly = control(loaded, "MONTHLY ADVANTAGE FEE");
    const reconciliation = {
      ...structuredClone(monthly.plan.stage0),
      establishedEvidence: monthly.plan.stage0.establishedEvidence,
      unresolvedFields: monthly.plan.stage0.unresolvedFields,
      governedConflicts: [{ field: "economic_layer", interpretations: ["card_network", "acquiring_commercial"], evidenceRefs: ["governed_a", "governed_b"] }],
      currentMerchantConclusion: {
        actionClass: monthly.finding.openWorldDeterminants!.d4Actionability.actionClass,
        action: monthly.finding.practicalMerchantAction.value!,
        confidence: monthly.finding.practicalMerchantAction.confidence,
      },
    };
    const plan = buildUnknownFeeResearchPlanV1({
      feeRowId: monthly.row.id,
      printedLabel: monthly.row.selectedLabel,
      processorName: loaded.analysis.identity.processorName.value,
      statementYear: "2024",
      statementRole: monthly.row.role,
      determinant: monthly.finding.openWorldDeterminants!,
      reconciliation,
    });
    expect(plan.stage0).toMatchObject({
      decision: "STOP_WITHOUT_EXTERNAL_RESEARCH",
      researchWarranted: false,
      adjudicationRequired: true,
      stoppingReason: "GOVERNED_EVIDENCE_CONFLICT",
      governedConflicts: [{
        field: "economic_layer",
        interpretations: ["card_network", "acquiring_commercial"],
        evidenceRefs: ["governed_a", "governed_b"],
      }],
    });
    expect(plan.queryShapes).toEqual([]);
  }, 20_000);
});

async function load(file: string, businessType: "restaurant_food_beverage" | "other" | "ecommerce") {
  const analysis = buildCanonicalStatementFactsFromParsedDocument(await parsePdf(`test/fixtures/pdfs/${file}`), { sourceFileName: file, businessType });
  const beforeFingerprint = canonicalFinancialTruthFingerprint(analysis);
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
  return { analysis, beforeFingerprint, report };
}

function control(loaded: Awaited<ReturnType<typeof load>>, labelPart: string) {
  const row = loaded.analysis.feeLedger.rows.find((item) => item.selectedLabel.includes(labelPart));
  if (!row) throw new Error(`control row missing: ${labelPart}`);
  const finding = loaded.report.findings.find((item) => item.sourceFeeRowId === row.id);
  const decision = loaded.report.researchQueue.stage0Decisions.find((item) => item.feeRowId === row.id);
  if (!finding?.openWorldDeterminants || !decision) throw new Error(`control finding missing: ${labelPart}`);
  return { row, finding, plan: decision.calibration };
}

function expectStoppedWithoutDecisionLoss(plan: ReturnType<typeof control>["plan"]) {
  expect(plan.stage0).toMatchObject({
    decision: "STOP_WITHOUT_EXTERNAL_RESEARCH",
    researchWarranted: false,
    adjudicationRequired: false,
    exactIdentityMateriallyChangesConclusion: false,
    proposedResearchFields: [],
    whyResearchCouldChangeMerchantDecision: [],
    stoppingReason: "S1_DETERMINANT_SUFFICIENCY",
  });
  expect(plan.queryShapes).toEqual([]);
  expect(plan.budget.maximumExternalOperations).toBe(0);
}
