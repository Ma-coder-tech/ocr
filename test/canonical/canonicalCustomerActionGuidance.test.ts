import { describe, expect, it } from "vitest";
import { buildCanonicalAiCapabilities } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalCustomerState } from "../../src/canonical/customerStateResolver.js";
import { buildCanonicalFeeLedger } from "../../src/canonical/feeLedger.js";
import { buildCanonicalFeeOwnershipActionability } from "../../src/canonical/feeOwnershipActionability.js";
import { buildCanonicalOpportunityEngine, type CanonicalOpportunityInput } from "../../src/canonical/opportunityEngine.js";
import { selectedFact } from "../../src/canonical/facts.js";
import { validateCanonicalStatementAnalysis } from "../../src/canonical/validate.js";
import {
  WHOLE_STATEMENT_FEE_INTELLIGENCE_ACCEPTANCE_POLICY_VERSION,
  WHOLE_STATEMENT_FEE_INTELLIGENCE_COVERAGE_POLICY_VERSION,
  WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
} from "../../src/canonical/wholeStatementFeeIntelligenceReview.js";
import type { CanonicalAiCapabilityOutput, CanonicalOpportunityTargetProvenance, CanonicalStatementAnalysis, MoneyAmount } from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical customer action guidance", () => {
  it("creates verification guidance only with fee rows, Package D classification, evidence, and visible permission", () => {
    const analysis = analysisWithLedger();
    ready(analysis);

    expect(analysis.customerState.primaryState).toBe("verification_needed");
    expect(analysis.customerState.actionGuidance).toHaveLength(1);
    expect(analysis.customerState.actionGuidance[0]).toMatchObject({
      actionType: "verify_charge",
      feeRowRefs: [analysis.feeLedger.rows[0]!.id],
      verificationComponentRefs: [analysis.opportunityEngine.components[0]!.id],
      evidenceRefs: analysis.opportunityEngine.components[0]!.evidenceRefs,
    });
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });

  it("allows removal and repricing actions only from included eligible components with stronger support", () => {
    const removal = analysisWithLedger();
    addEligible(removal, "fee_removal");
    ready(removal);
    expect(removal.customerState.actionGuidance.map((action) => action.actionType)).toEqual(["request_removal"]);

    const repricing = analysisWithLedger();
    addEligible(repricing, "rate_repricing");
    ready(repricing);
    expect(repricing.customerState.actionGuidance.map((action) => action.actionType)).toEqual(["request_repricing"]);
    expect(validateCanonicalStatementAnalysis(repricing).validation.status).toBe("valid");
  });

  it("rejects action guidance without canonical support", () => {
    const analysis = analysisWithLedger();
    ready(analysis);
    analysis.customerState.actionGuidance[0]!.evidenceRefs = [];

    expect(() => validateCanonicalStatementAnalysis(analysis)).toThrow(/action .* lacks required canonical support|action guidance does not reconstruct/i);
  });

  it("does not create removal or repricing actions from unsupported authority and rejects duplicates", () => {
    const removalWithoutRemovability = analysisWithLedger();
    addMonetaryFeeRemoval(removalWithoutRemovability);
    ready(removalWithoutRemovability);
    expect(removalWithoutRemovability.customerState.actionGuidance).toEqual([]);

    const nonProcessorRepricing = analysisWithLedger();
    addEligible(nonProcessorRepricing, "rate_repricing");
    nonProcessorRepricing.opportunityEngine.components[0]!.ownership.economicBeneficiary = "third_party";
    nonProcessorRepricing.opportunityEngine.components[0]!.ownership.contractualController = "third_party";
    ready(nonProcessorRepricing);
    expect(nonProcessorRepricing.customerState.actionGuidance).toEqual([]);

    const duplicate = analysisWithLedger();
    addEligible(duplicate, "rate_repricing");
    ready(duplicate);
    duplicate.customerState.actionGuidance.push({ ...duplicate.customerState.actionGuidance[0]! });
    expect(() => validateCanonicalStatementAnalysis(duplicate)).toThrow(/duplicate action|action guidance does not reconstruct/i);
  });

  it.each([
    ["interchange fees", { label: "Visa Interchange Program Fee", section: "Interchange Charges" }],
    ["network fees", { label: "Visa NABU", section: "Card Brand Fees" }],
    ["taxes", { label: "State Tax", section: "Tax Government Fees" }],
    ["unknown ownership", { label: "Mystery Fee", section: "Fees" }],
    ["third-party products", { label: "Clover App Market Fee", section: "Fees" }],
    ["equipment/lease fees", { label: "Terminal Lease Fee", section: "Fees" }],
    ["compliance fees", { label: "PCI Non Compliance Fee", section: "Fees" }],
    ["contract-dependent service fees", { label: "Monthly Service Charge", section: "Fees" }],
    ["low-confidence classifications", { label: "Monthly CPU GTWY", section: "Fees", confidence: "low" as const }],
  ])("rejects unsupported removal and repricing actions for %s", (_name, row) => {
    for (const kind of ["fee_removal", "rate_repricing"] as const) {
      const analysis = analysisWithLedger(row);
      addEligible(analysis, kind);
      ready(analysis);

      expect(analysis.customerState.actionGuidance).toEqual([]);
    }
  });

  it("rejects AI-only suggestions as support for removal or repricing actions", () => {
    for (const kind of ["fee_removal", "rate_repricing"] as const) {
      const analysis = analysisWithLedger();
      addEligible(analysis, kind);
      const component = analysis.opportunityEngine.components[0]!;
      (component.targetProvenance as any).aiSourced = true;
      (component.target as any).aiSourced = true;
      ready(analysis);

      expect(analysis.customerState.actionGuidance).toEqual([]);
    }
  });
});

function addEligible(analysis: CanonicalStatementAnalysis, kind: CanonicalOpportunityInput["kind"]): void {
  const base = analysis.opportunityEngine.components[0]!;
  const result = kind === "fee_removal" ? money(120) : money(60);
  const input: CanonicalOpportunityInput = {
    id: `pkg_g_action_${kind}`,
    kind,
    eligibility: "deterministic",
    feeRowIds: [base.feeRowRefs[0]!.feeRowId],
    target:
      kind === "fee_removal"
        ? { type: "zero_removal", removalCondition: "Synthetic contract documents removability.", proofEvidenceRefs: base.evidenceRefs, aiSourced: false }
        : { type: "monetary", amount: money(5), unit: "monthly_charge", aiSourced: false },
    targetProvenance: provenance(analysis),
    cadence: { value: "monthly", proven: true, annualizationAllowed: true, frequencyPerYear: 12, proof: "fee_label_explicit", evidenceRefs: base.evidenceRefs, reason: "Synthetic monthly cadence.", aiSourced: false },
    calculation: { calculationRef: `calc_pkg_g_action_${kind}`, formulaCode: "opportunity_monthly_delta_times_12", inputRefs: [base.feeRowRefs[0]!.feeRowId], result, annualized: true, evidenceRefs: base.evidenceRefs },
    confidence: "high",
    evidenceRefs: base.evidenceRefs,
  };
  analysis.calculations.push(calc(input.calculation.calculationRef, base.evidenceRefs, base.observedAmount!.amount, kind === "fee_removal" ? money(0) : money(5), result));
  analysis.opportunityEngine = buildCanonicalOpportunityEngine({ feeLedger: analysis.feeLedger, feeOwnershipActionability: analysis.feeOwnershipActionability, evidence: analysis.evidence, statementPeriodVerified: true, opportunityInputs: [input] });
}

function addMonetaryFeeRemoval(analysis: CanonicalStatementAnalysis): void {
  const base = analysis.opportunityEngine.components[0]!;
  const input: CanonicalOpportunityInput = {
    id: "pkg_g_action_fee_removal_without_zero",
    kind: "fee_removal",
    eligibility: "deterministic",
    feeRowIds: [base.feeRowRefs[0]!.feeRowId],
    target: { type: "monetary", amount: money(5), unit: "monthly_charge", aiSourced: false },
    targetProvenance: provenance(analysis),
    cadence: { value: "monthly", proven: true, annualizationAllowed: true, frequencyPerYear: 12, proof: "fee_label_explicit", evidenceRefs: base.evidenceRefs, reason: "Synthetic monthly cadence.", aiSourced: false },
    calculation: { calculationRef: "calc_pkg_g_action_fee_removal_without_zero", formulaCode: "opportunity_monthly_delta_times_12", inputRefs: [base.feeRowRefs[0]!.feeRowId], result: money(60), annualized: true, evidenceRefs: base.evidenceRefs },
    confidence: "high",
    evidenceRefs: base.evidenceRefs,
  };
  analysis.calculations.push(calc(input.calculation.calculationRef, base.evidenceRefs, base.observedAmount!.amount, money(5), money(60)));
  analysis.opportunityEngine = buildCanonicalOpportunityEngine({ feeLedger: analysis.feeLedger, feeOwnershipActionability: analysis.feeOwnershipActionability, evidence: analysis.evidence, statementPeriodVerified: true, opportunityInputs: [input] });
}

function ready(analysis: CanonicalStatementAnalysis): void {
  analysis.aiCapabilities = buildCanonicalAiCapabilities({
    ...analysis,
    evidence: analysis.evidence,
    harnessInputs: [
      { capability: "full_statement_anomaly_review", status: "completed", output: anomalyOutput(analysis) },
      { capability: "whole_statement_fee_intelligence_review", status: "completed", output: wholeStatementOutput(analysis) },
    ],
  });
  analysis.customerState = buildCanonicalCustomerState({ ...analysis });
}

function analysisWithLedger(options: { label?: string; section?: string; confidence?: "high" | "medium" | "low" } = {}): CanonicalStatementAnalysis {
  const analysis = buildCanonicalStatementFactsFromParsedDocument(statement(), { sourceFileName: "package-g-actions.pdf", businessType: "restaurant", preferExtractedRows: true });
  analysis.identity.statementPeriod = selectedFact({ value: { start: "2026-01-01", end: "2026-01-31" }, confidence: "high", evidenceRefs: [analysis.evidence[0]!.id], selectionReason: "Synthetic verified period." });
  analysis.identity.processorFamily = selectedFact({ value: "fiserv", confidence: "high", evidenceRefs: [analysis.evidence[0]!.id], selectionReason: "Synthetic processor." });
  analysis.identity.processorName = selectedFact({ value: "Fiserv", confidence: "high", evidenceRefs: [analysis.evidence[0]!.id], selectionReason: "Synthetic processor." });
  const evidence = new Map();
  const calculations: any[] = [];
  analysis.feeLedger = buildCanonicalFeeLedger({
    doc: statement(),
    documentId: "doc_pkg_g_actions",
    matched: { driverId: "synthetic_parser", driverName: "Synthetic parser" },
    evidence,
    calculations,
    parserOutput: {
      feeLedger: {
        rows: [
          {
            description: options.label ?? "Monthly CPU GTWY",
            amount: 10,
            sourceSection: options.section ?? "Fees",
            evidenceLine: `${options.label ?? "Monthly CPU GTWY"} | -$10.00`,
            pageNumber: 1,
            confidence: options.confidence ?? "high",
          },
        ],
        controls: [{ label: "Total Fees", rowSum: 10, printedTotal: 10, delta: 0, evidenceLine: "Total Fees | -$10.00" }],
        printedTotal: 10,
        delta: 0,
      },
    },
  });
  analysis.evidence = [...analysis.evidence, ...evidence.values()];
  analysis.calculations = [...analysis.calculations, ...calculations];
  analysis.feeOwnershipActionability = buildCanonicalFeeOwnershipActionability(analysis.feeLedger, { processorFamily: "fiserv", statementPeriodStart: "2026-01-01" });
  analysis.opportunityEngine = buildCanonicalOpportunityEngine({ feeLedger: analysis.feeLedger, feeOwnershipActionability: analysis.feeOwnershipActionability, evidence: analysis.evidence, statementPeriodVerified: true });
  return analysis;
}

function anomalyOutput(analysis: CanonicalStatementAnalysis): CanonicalAiCapabilityOutput {
  const evidenceRef = analysis.evidence[0]!.id;
  return { type: "full_statement_anomaly_review", authoritative: false, evidenceRefs: [evidenceRef], factRefs: ["financialFacts.processedSales"], limitationCodes: [], observations: [{ id: "obs_actions", severity: "info", summary: "Synthetic core metrics are reviewed.", affectedFactRefs: ["financialFacts.processedSales"], evidenceRefs: [evidenceRef], authoritative: false }] };
}

function wholeStatementOutput(analysis: CanonicalStatementAnalysis): CanonicalAiCapabilityOutput {
  const rowRefs = analysis.feeLedger.rows.map((row) => row.id).sort();
  const occurrenceEvidence = new Map(analysis.feeLedger.sourceOccurrences.map((occurrence) => [occurrence.id, occurrence.evidenceRef]));
  const evidenceByRow = new Map(
    analysis.feeLedger.rows.map((row) => [
      row.id,
      [...new Set([...row.sourceOccurrenceIds.map((id) => occurrenceEvidence.get(id)).filter((id): id is string => Boolean(id)), ...row.contributionDecision.evidenceRefs])].sort(),
    ]),
  );
  return {
    type: "whole_statement_fee_intelligence_review",
    reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
    authoritative: false,
    evidenceRefs: [...new Set([...evidenceByRow.values()].flat())].sort(),
    factRefs: [],
    limitationCodes: [],
    reviewStatus: "completed",
    coverageProof: {
      policyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_COVERAGE_POLICY_VERSION,
      expectedFeeRowRefs: rowRefs,
      reviewedFeeRowRefs: rowRefs,
      missingFeeRowRefs: [],
      duplicatedFeeRowRefs: [],
      unknownFeeRowRefs: [],
      malformedFeeRowRefs: [],
      exactCoverage: true,
    },
    rowInterpretations: rowRefs.map((feeRowRef) => ({
      feeRowRef,
      proposedCategory: "processor_markup",
      likelyEconomicOwner: "processor",
      likelyContractualController: "merchant_contract",
      proposedActionabilityCeiling: "not_actionable",
      confidence: "high",
      conciseRationale: "Statement row label and section context support this semantic interpretation.",
      evidenceProvenance: "statement_evidence",
      evidenceRefs: evidenceByRow.get(feeRowRef) ?? [],
      externalSourceRef: null,
      conflicts: [],
      missingEvidence: [],
      recommendedDisposition: "supported",
      authoritative: false,
    })),
    acceptanceRecords: rowRefs.map((feeRowRef) => ({
      feeRowRef,
      policyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_ACCEPTANCE_POLICY_VERSION,
      status: "accepted",
      acceptedSemanticFields: {
        category: "processor_markup",
        likelyEconomicOwner: "processor",
        likelyContractualController: "merchant_contract",
        actionabilityCeiling: "not_actionable",
        evidenceProvenance: "statement_evidence",
      },
      evidenceRefs: evidenceByRow.get(feeRowRef) ?? [],
      externalSourceRef: null,
      reasonCodes: ["whole_statement_fee_intelligence_accepted"],
      conflicts: [],
      actionabilityCeiling: "not_actionable",
      immutableFeeRowRef: feeRowRef,
    })),
    reasonCodes: ["whole_statement_fee_intelligence_reviewed"],
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function provenance(analysis: CanonicalStatementAnalysis): CanonicalOpportunityTargetProvenance {
  return { sourceType: "merchant_contract", referenceId: "pkg_g_action_contract", version: "1.0.0", policyOwner: "rr_policy_owner", reviewer: "rr_reviewer", effectiveFrom: "2026-01-01", effectiveTo: null, applicableProcessor: "fiserv", applicableBusinessType: "restaurant", applicableChannel: "unknown", applicableCardEnvironment: "unknown", methodology: "Synthetic deterministic action support.", limitations: [], opportunityApproved: true, authoritativeForDeterministic: true, approvedForEstimate: false, evidenceRefs: [analysis.evidence[0]!.id], aiSourced: false };
}

function calc(id: string | null, evidenceRefs: string[], observed: MoneyAmount, target: MoneyAmount, result: MoneyAmount) {
  return { id: id!, formulaCode: "opportunity_monthly_delta_times_12" as const, formulaVersion: "canonical_opportunity_formula_v1", inputs: [{ label: "Observed monthly amount", value: observed, unit: "money" as const, evidenceRefs }, { label: "Target monthly amount", value: target, unit: "money" as const, evidenceRefs }], result, unit: "money" as const, roundingPolicy: "money_minor_units_usd_v1" };
}

function statement(): ParsedDocument {
  const lines = ["Merchant: Package G Actions", "Processor: Fiserv", "Total Amount Submitted | $1,000.00", "Fees Charged | -$30.00", "Monthly CPU GTWY | -$10.00"];
  return { sourceType: "pdf", headers: [], rows: lines.map((content) => ({ content, page: "page-1" })), textPreview: lines.join("\n"), extraction: { mode: "structured", qualityScore: 1, reasons: [], lineCount: lines.length, amountTokenCount: lines.length, hasExtractableText: true } };
}

function money(dollars: number): MoneyAmount {
  return { amountMinor: Math.round(dollars * 100), currency: "USD" };
}
