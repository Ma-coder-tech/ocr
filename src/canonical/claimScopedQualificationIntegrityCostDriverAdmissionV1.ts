import { createHash } from "node:crypto";

import type { CommercialDecompositionContractV1, CommercialDecompositionRowV1 } from "./commercialDecompositionContractV1.js";
import type { CurrentRelationshipEconomicsProfileV1 } from "./currentRelationshipEconomicsProfileV1.js";
import type { CanonicalEconomicsV2EconomicAnalysis, CanonicalEconomicCharge } from "./v2/economicTypes.js";

export const CLAIM_SCOPED_QUALIFICATION_INTEGRITY_COST_DRIVER_ADMISSION_V1 =
  "claim_scoped_qualification_integrity_cost_driver_admission_2026_09_12_v1" as const;

export type QualificationIntegrityDriverFamilyV1 =
  | "NON_QUALIFIED"
  | "EIRF_QUALIFICATION_RESULT"
  | "QUALIFICATION_RESULT"
  | "DOWNGRADE_RESULT"
  | "INTEGRITY_CONDITION"
  | "MISUSE_CONDITION"
  | "PROGRAM_INTEGRITY_CONDITION";

export type QualificationIntegrityDriverFindingV1 = {
  driverId: string;
  driverFamily: QualificationIntegrityDriverFamilyV1;
  driverGroup: "QUALIFICATION_RESULT" | "INTEGRITY_OR_MISUSE";
  sourceDocumentRef: string;
  statementPeriod: { start: string; end: string } | null;
  printedLabels: string[];
  sourceOccurrenceRefs: string[];
  statementEvidenceRefs: string[];
  rdChargeRefs: string[];
  referencedChargedAmountMinor: number;
  currency: "USD";
  currentCostClassification: {
    productCostConcept: CurrentRelationshipEconomicsProfileV1["chargedCostProfile"]["items"][number]["productCostConcept"];
    mappingState: CurrentRelationshipEconomicsProfileV1["chargedCostProfile"]["items"][number]["mappingState"];
    commercialDollarCategory: CommercialDecompositionRowV1["commercialDollarCategory"];
    evidenceRefs: string[];
  };
  economicLayer: {
    state: "GOVERNED" | "UNRESOLVED";
    value: string | null;
    evidenceRefs: string[];
  };
  collector: DriverRoleConclusionV1;
  ruleSetter: DriverRoleConclusionV1;
  merchantFacingPriceController: DriverRoleConclusionV1;
  providerControl: DriverRoleConclusionV1;
  operationalInfluence: {
    state: "POSSIBLE_NOT_CAUSAL" | "UNKNOWN";
    evidenceRefs: string[];
    explanation: string;
  };
  causalReason: UnknownDriverConclusionV1;
  merchantResponsibility: UnknownDriverConclusionV1;
  controllability: UnknownDriverConclusionV1;
  avoidability: UnknownDriverConclusionV1;
  confidence: {
    state: "EXPLICIT_STATEMENT_CONDITION_BOUND_TO_RD";
    evidenceStatus: "STATEMENT_AND_GOVERNED_CONTEXT";
    limitations: string[];
  };
  additiveContributionMinor: 0;
  limitations: string[];
};

export type QualificationIntegrityDriverUnresolvedCandidateV1 = {
  sourceDocumentRef: string;
  printedLabel: string;
  rdChargeRefs: string[];
  referencedChargedAmountMinor: number;
  statementEvidenceRefs: string[];
  reasonCode: "AMBIGUOUS_QUALIFICATION_LIKE_LABEL_WITHOUT_EXPLICIT_SUPPORTED_CONDITION";
  limitations: string[];
};

export type ClaimScopedQualificationIntegrityCostDriverAdmissionV1 = {
  schemaVersion: typeof CLAIM_SCOPED_QUALIFICATION_INTEGRITY_COST_DRIVER_ADMISSION_V1;
  mode: "internal_offline";
  authority: "derived_claim_scoped_driver_reference_only";
  sourceDocumentRef: string;
  statementPeriod: { start: string; end: string } | null;
  status: "ADMITTED" | "WITHHELD";
  findings: QualificationIntegrityDriverFindingV1[];
  unresolvedCandidates: QualificationIntegrityDriverUnresolvedCandidateV1[];
  aggregate: {
    findingCount: number;
    uniqueReferencedRdChargeCount: number;
    referencedChargedAmountMinor: number;
    qualificationRelatedAmountMinor: number;
    integrityMisuseRelatedAmountMinor: number;
    additiveDriverAmountMinor: 0;
    duplicateRdChargeReferenceCount: 0;
  };
  safety: {
    rdIsSoleAdditiveLedger: true;
    rdMutationAllowed: false;
    canonicalMutationAllowed: false;
    driverCreatesAdditiveDollars: false;
    causalResponsibilityInferenceAllowed: false;
    controllabilityInferenceAllowed: false;
    avoidabilityInferenceAllowed: false;
    processorOrMerchantBlameAllowed: false;
    comparisonInputCount: 0;
    savingsOutputCount: 0;
    annualizationOutputCount: 0;
    aiOrWebOperationCount: 0;
    newKnowledgeAdmissionCount: 0;
    customerRoutingAllowed: false;
  };
  limitations: string[];
};

type DriverRoleConclusionV1 = {
  state: "GOVERNED" | "PARTIAL" | "UNKNOWN";
  value: string | null;
  evidenceRefs: string[];
  explanation: string;
};

type UnknownDriverConclusionV1 = {
  state: "UNKNOWN";
  value: null;
  evidenceRefs: string[];
  explanation: string;
};

type ExplicitDriverLabelDecisionV1 = {
  family: QualificationIntegrityDriverFamilyV1 | null;
  group: QualificationIntegrityDriverFindingV1["driverGroup"] | null;
  reasonCode: "EXPLICIT_SUPPORTED_CONDITION" | "AMBIGUOUS_QUALIFICATION_LIKE_LABEL" | "NOT_IN_SCOPE";
};

const EXPLICIT_DRIVER_RULES: Array<{
  family: QualificationIntegrityDriverFamilyV1;
  group: QualificationIntegrityDriverFindingV1["driverGroup"];
  pattern: RegExp;
}> = [
  { family: "PROGRAM_INTEGRITY_CONDITION", group: "INTEGRITY_OR_MISUSE", pattern: /\bPROGRAM\s+INTEGRITY\b/i },
  { family: "MISUSE_CONDITION", group: "INTEGRITY_OR_MISUSE", pattern: /\b(?:MISUSE(?:\s+OF)?\s+AUTH|AUTH(?:ORIZATION)?\s+MISUSE)\b/i },
  { family: "INTEGRITY_CONDITION", group: "INTEGRITY_OR_MISUSE", pattern: /\b(?:(?:TRANSACTION|TRAN|PROCESSING)\s+INTEGRITY|INTEGRITY\s+FEE(?:\s+DETAIL\s+REPORT)?)\b/i },
  { family: "NON_QUALIFIED", group: "QUALIFICATION_RESULT", pattern: /\bNON[\s-]*QUAL(?:IFIED)?\b/i },
  { family: "EIRF_QUALIFICATION_RESULT", group: "QUALIFICATION_RESULT", pattern: /\bEIRF\b/i },
  { family: "DOWNGRADE_RESULT", group: "QUALIFICATION_RESULT", pattern: /\bDOWNGRADE(?:D)?\b/i },
  { family: "QUALIFICATION_RESULT", group: "QUALIFICATION_RESULT", pattern: /\bQUAL(?:IFICATION)?[\s-]+RESULT\b/i },
];

const AMBIGUOUS_QUALIFICATION_LIKE_LABEL = /\b(?:STANDARD|QUAL(?:IFIED|IFICATION)?|INTEGRITY|MISUSE|EIRF|DOWNGRADE(?:D)?)\b/i;

export function classifyExplicitQualificationIntegrityDriverLabelV1(label: string): ExplicitDriverLabelDecisionV1 {
  const normalized = label.replace(/\s+/g, " ").trim();
  for (const rule of EXPLICIT_DRIVER_RULES) {
    if (rule.pattern.test(normalized)) return { family: rule.family, group: rule.group, reasonCode: "EXPLICIT_SUPPORTED_CONDITION" };
  }
  if (AMBIGUOUS_QUALIFICATION_LIKE_LABEL.test(normalized)) {
    return { family: null, group: null, reasonCode: "AMBIGUOUS_QUALIFICATION_LIKE_LABEL" };
  }
  return { family: null, group: null, reasonCode: "NOT_IN_SCOPE" };
}

export function buildClaimScopedQualificationIntegrityCostDriverAdmissionV1(input: {
  economic: CanonicalEconomicsV2EconomicAnalysis;
  currentRelationshipProfile: CurrentRelationshipEconomicsProfileV1;
  commercialDecomposition: CommercialDecompositionContractV1;
}): ClaimScopedQualificationIntegrityCostDriverAdmissionV1 {
  const sourceDocumentRef = input.economic.pricingAnalysis.foundation.identity.sourceDocumentRef;
  if (input.currentRelationshipProfile.sourceDocumentRef !== sourceDocumentRef) throw new Error("QUALIFICATION_DRIVER_PROFILE_SOURCE_MISMATCH");
  if (input.economic.validation.status !== "valid" || input.economic.economicLayer.validation.status !== "valid") {
    throw new Error("QUALIFICATION_DRIVER_REQUIRES_VALID_RD");
  }
  if (!/fiserv|first.?data/i.test([
    input.economic.pricingAnalysis.foundation.identity.processorFamily,
    input.commercialDecomposition.statement.processorFamily,
  ].filter(Boolean).join(" "))) throw new Error("QUALIFICATION_DRIVER_REQUIRES_SUPPORTED_FISERV_FAMILY");

  const contributingCharges = new Map(input.economic.economicLayer.charges.filter(contributes).map((charge) => [charge.id, charge]));
  const occurrences = new Map(input.economic.pricingAnalysis.foundation.sourceModel.occurrences.map((item) => [item.id, item]));
  const rows = new Map(input.commercialDecomposition.rows.map((row) => [row.feeRowId, row]));
  const findings: QualificationIntegrityDriverFindingV1[] = [];
  const unresolvedCandidates: QualificationIntegrityDriverUnresolvedCandidateV1[] = [];
  const usedChargeRefs = new Set<string>();

  for (const item of input.currentRelationshipProfile.chargedCostProfile.items) {
    if (item.financialDirection !== "debit" || item.amount.amountMinor <= 0 || !item.commercialFeeRowRef) continue;
    const row = rows.get(item.commercialFeeRowRef);
    if (!row || !row.contributesToCanonicalTotal || row.billedAmountMinor !== item.amount.amountMinor) continue;
    const decision = classifyExplicitQualificationIntegrityDriverLabelV1(row.printedLabel);
    if (decision.reasonCode === "NOT_IN_SCOPE") continue;
    const rdCharges = item.rdEconomicChargeRef ? [contributingCharges.get(item.rdEconomicChargeRef)].filter(Boolean) as CanonicalEconomicCharge[] : [];
    if (rdCharges.length !== 1) continue;
    const statementEvidenceRefs = unique(rdCharges.flatMap((charge) => charge.sourceOccurrenceRefs
      .map((ref) => occurrences.get(ref)?.evidenceRef ?? null)));
    if (statementEvidenceRefs.length === 0) continue;

    if (!decision.family || !decision.group) {
      unresolvedCandidates.push({
        sourceDocumentRef,
        printedLabel: row.printedLabel,
        rdChargeRefs: [item.rdEconomicChargeRef],
        referencedChargedAmountMinor: item.amount.amountMinor,
        statementEvidenceRefs,
        reasonCode: "AMBIGUOUS_QUALIFICATION_LIKE_LABEL_WITHOUT_EXPLICIT_SUPPORTED_CONDITION",
        limitations: [
          "A qualification-like word is not enough to establish a qualification, downgrade, integrity, or misuse driver.",
          "The RD charge and its economic classification remain unchanged.",
        ],
      });
      continue;
    }
    if (usedChargeRefs.has(item.rdEconomicChargeRef)) throw new Error("QUALIFICATION_DRIVER_DUPLICATE_RD_REFERENCE");
    usedChargeRefs.add(item.rdEconomicChargeRef);
    const governedEvidenceRefs = unique(row.evidenceRefs);
    const operationallyConditioned = decision.group === "INTEGRITY_OR_MISUSE" &&
      row.mechanicAndPopulation.mechanicState === "supported" && row.mechanicAndPopulation.populationState === "supported";
    findings.push({
      driverId: driverId(sourceDocumentRef, item.rdEconomicChargeRef, decision.family),
      driverFamily: decision.family,
      driverGroup: decision.group,
      sourceDocumentRef,
      statementPeriod: input.currentRelationshipProfile.statementPeriod ? { ...input.currentRelationshipProfile.statementPeriod } : null,
      printedLabels: [row.printedLabel],
      sourceOccurrenceRefs: [...rdCharges[0]!.sourceOccurrenceRefs],
      statementEvidenceRefs,
      rdChargeRefs: [item.rdEconomicChargeRef],
      referencedChargedAmountMinor: item.amount.amountMinor,
      currency: "USD",
      currentCostClassification: {
        productCostConcept: item.productCostConcept,
        mappingState: item.mappingState,
        commercialDollarCategory: row.commercialDollarCategory,
        evidenceRefs: unique([...item.evidenceRefs, ...row.evidenceRefs]),
      },
      economicLayer: economicLayer(row),
      collector: role(row.participants.collector, governedEvidenceRefs, "Collection is independent from economic control and responsibility."),
      ruleSetter: role(row.participants.ruleSetter, governedEvidenceRefs, "Rule-setting does not establish merchant-facing price control or merchant responsibility."),
      merchantFacingPriceController: role(row.participants.merchantFacingPriceController, governedEvidenceRefs, "Merchant-facing price control does not establish underlying rule-setting, retention, or avoidability."),
      providerControl: providerControl(row),
      operationalInfluence: operationallyConditioned ? {
        state: "POSSIBLE_NOT_CAUSAL",
        evidenceRefs: governedEvidenceRefs,
        explanation: "Governed mechanics associate the charge with an operational transaction condition, but the statement does not identify who caused that condition or whether it was controllable.",
      } : {
        state: "UNKNOWN",
        evidenceRefs: governedEvidenceRefs,
        explanation: "No claim-scoped evidence establishes merchant operational influence for this charged condition.",
      },
      causalReason: unknown("The statement identifies the charged condition but does not prove its transaction-level root cause.", statementEvidenceRefs),
      merchantResponsibility: unknown("Neither an explicit charged condition nor possible operational influence proves merchant responsibility.", statementEvidenceRefs),
      controllability: unknown("Control over the condition is not established by this single statement.", governedEvidenceRefs),
      avoidability: unknown("An observed qualification or integrity charge does not establish that the charge was preventable, removable, or avoidable.", governedEvidenceRefs),
      confidence: {
        state: "EXPLICIT_STATEMENT_CONDITION_BOUND_TO_RD",
        evidenceStatus: "STATEMENT_AND_GOVERNED_CONTEXT",
        limitations: [
          "Confidence applies only to the explicit charged-condition classification and exact RD binding.",
          "It does not apply to cause, responsibility, controllability, avoidability, correctness, savings, or a counterfactual price.",
        ],
      },
      additiveContributionMinor: 0,
      limitations: [
        "This driver record references an existing RD charge and creates no additive dollars.",
        "Economic-layer and participant conclusions are carried only where independently governed.",
        "No processor blame, merchant blame, overcharge, savings, comparison, or switching claim is permitted.",
      ],
    });
  }

  const allRefs = findings.flatMap((finding) => finding.rdChargeRefs);
  const qualificationRelatedAmountMinor = sum(findings.filter((finding) => finding.driverGroup === "QUALIFICATION_RESULT")
    .map((finding) => finding.referencedChargedAmountMinor));
  const integrityMisuseRelatedAmountMinor = sum(findings.filter((finding) => finding.driverGroup === "INTEGRITY_OR_MISUSE")
    .map((finding) => finding.referencedChargedAmountMinor));
  const result: ClaimScopedQualificationIntegrityCostDriverAdmissionV1 = {
    schemaVersion: CLAIM_SCOPED_QUALIFICATION_INTEGRITY_COST_DRIVER_ADMISSION_V1,
    mode: "internal_offline",
    authority: "derived_claim_scoped_driver_reference_only",
    sourceDocumentRef,
    statementPeriod: input.currentRelationshipProfile.statementPeriod ? { ...input.currentRelationshipProfile.statementPeriod } : null,
    status: findings.length > 0 ? "ADMITTED" : "WITHHELD",
    findings,
    unresolvedCandidates,
    aggregate: {
      findingCount: findings.length,
      uniqueReferencedRdChargeCount: new Set(allRefs).size,
      referencedChargedAmountMinor: sum(findings.map((finding) => finding.referencedChargedAmountMinor)),
      qualificationRelatedAmountMinor,
      integrityMisuseRelatedAmountMinor,
      additiveDriverAmountMinor: 0,
      duplicateRdChargeReferenceCount: 0,
    },
    safety: {
      rdIsSoleAdditiveLedger: true,
      rdMutationAllowed: false,
      canonicalMutationAllowed: false,
      driverCreatesAdditiveDollars: false,
      causalResponsibilityInferenceAllowed: false,
      controllabilityInferenceAllowed: false,
      avoidabilityInferenceAllowed: false,
      processorOrMerchantBlameAllowed: false,
      comparisonInputCount: 0,
      savingsOutputCount: 0,
      annualizationOutputCount: 0,
      aiOrWebOperationCount: 0,
      newKnowledgeAdmissionCount: 0,
      customerRoutingAllowed: false,
    },
    limitations: [
      "This artifact identifies explicit current-statement qualification and integrity charged conditions only.",
      "It is non-additive, internal/offline, and cannot change RD, canonical truth, commercial knowledge, comparison behavior, or customer routing.",
      "A driver finding is not proof of causal responsibility, controllability, avoidability, incorrect billing, or savings.",
    ],
  };
  assertClaimScopedQualificationIntegrityCostDriverAdmissionV1(result, input.economic);
  return deepFreeze(result);
}

export function assertClaimScopedQualificationIntegrityCostDriverAdmissionV1(
  result: ClaimScopedQualificationIntegrityCostDriverAdmissionV1,
  economic: CanonicalEconomicsV2EconomicAnalysis,
): void {
  const contributing = new Map(economic.economicLayer.charges.filter(contributes).map((charge) => [charge.id, charge]));
  const ids = result.findings.map((finding) => finding.driverId);
  if (new Set(ids).size !== ids.length) throw new Error("QUALIFICATION_DRIVER_ID_DUPLICATE");
  const refs = result.findings.flatMap((finding) => finding.rdChargeRefs);
  if (new Set(refs).size !== refs.length) throw new Error("QUALIFICATION_DRIVER_RD_DOUBLE_COUNT");
  for (const finding of result.findings) {
    if (finding.sourceDocumentRef !== result.sourceDocumentRef || finding.rdChargeRefs.length === 0 || finding.statementEvidenceRefs.length === 0) {
      throw new Error("QUALIFICATION_DRIVER_SOURCE_BINDING_INVALID");
    }
    const charges = finding.rdChargeRefs.map((ref) => contributing.get(ref));
    if (charges.some((charge) => !charge?.observedAmount || charge.financialDirection !== "debit")) {
      throw new Error("QUALIFICATION_DRIVER_RD_REFERENCE_INVALID");
    }
    if (sum(charges.map((charge) => charge!.observedAmount!.amountMinor)) !== finding.referencedChargedAmountMinor) {
      throw new Error("QUALIFICATION_DRIVER_AMOUNT_MISMATCH");
    }
    if (finding.additiveContributionMinor !== 0 || finding.causalReason.state !== "UNKNOWN" ||
        finding.merchantResponsibility.state !== "UNKNOWN" || finding.controllability.state !== "UNKNOWN" ||
        finding.avoidability.state !== "UNKNOWN") throw new Error("QUALIFICATION_DRIVER_PROHIBITED_CONCLUSION");
  }
  if (result.aggregate.findingCount !== result.findings.length ||
      result.aggregate.uniqueReferencedRdChargeCount !== new Set(refs).size ||
      result.aggregate.referencedChargedAmountMinor !== sum(result.findings.map((finding) => finding.referencedChargedAmountMinor)) ||
      result.aggregate.qualificationRelatedAmountMinor + result.aggregate.integrityMisuseRelatedAmountMinor !== result.aggregate.referencedChargedAmountMinor ||
      result.aggregate.additiveDriverAmountMinor !== 0 || result.aggregate.duplicateRdChargeReferenceCount !== 0) {
    throw new Error("QUALIFICATION_DRIVER_AGGREGATE_INVALID");
  }
  if (!result.safety.rdIsSoleAdditiveLedger || result.safety.rdMutationAllowed || result.safety.canonicalMutationAllowed ||
      result.safety.driverCreatesAdditiveDollars || result.safety.causalResponsibilityInferenceAllowed ||
      result.safety.controllabilityInferenceAllowed || result.safety.avoidabilityInferenceAllowed ||
      result.safety.processorOrMerchantBlameAllowed || result.safety.comparisonInputCount !== 0 ||
      result.safety.savingsOutputCount !== 0 || result.safety.annualizationOutputCount !== 0 ||
      result.safety.aiOrWebOperationCount !== 0 || result.safety.newKnowledgeAdmissionCount !== 0 ||
      result.safety.customerRoutingAllowed) throw new Error("QUALIFICATION_DRIVER_SAFETY_INVALID");
}

function economicLayer(row: CommercialDecompositionRowV1): QualificationIntegrityDriverFindingV1["economicLayer"] {
  const governed = row.economicLayer.state === "supported" && row.economicLayer.value !== null && row.economicLayer.value !== "LAYER_UNRESOLVED";
  return {
    state: governed ? "GOVERNED" : "UNRESOLVED",
    value: governed ? row.economicLayer.value : null,
    evidenceRefs: unique(row.evidenceRefs),
  };
}

function role(value: { state: string; value: string | null }, evidenceRefs: string[], explanation: string): DriverRoleConclusionV1 {
  const state = value.value === null || value.state === "unresolved" ? "UNKNOWN"
    : value.state === "supported" ? "GOVERNED" : "PARTIAL";
  return { state, value: value.value, evidenceRefs: unique(evidenceRefs), explanation };
}

function providerControl(row: CommercialDecompositionRowV1): DriverRoleConclusionV1 {
  const controller = row.participants.merchantFacingPriceController;
  const state = controller.value === null || controller.state === "unresolved" ? "UNKNOWN"
    : controller.state === "supported" ? "GOVERNED" : "PARTIAL";
  return {
    state,
    value: controller.value,
    evidenceRefs: unique(row.evidenceRefs),
    explanation: state === "UNKNOWN"
      ? "Provider control of this charged condition or underlying cost is not established."
      : "This conclusion is limited to the governed merchant-facing price-control scope and does not prove retention, causal responsibility, or avoidability.",
  };
}

function unknown(explanation: string, evidenceRefs: string[]): UnknownDriverConclusionV1 {
  return { state: "UNKNOWN", value: null, evidenceRefs: unique(evidenceRefs), explanation };
}

function contributes(charge: CanonicalEconomicCharge): boolean {
  return (charge.contributionStatus === "contributes_classified" || charge.contributionStatus === "contributes_unresolved") &&
    charge.observedAmount !== null && (charge.financialDirection === "debit" || charge.financialDirection === "credit");
}

function driverId(sourceDocumentRef: string, chargeRef: string, family: QualificationIntegrityDriverFamilyV1): string {
  return `qualification_driver_${createHash("sha256").update(`${sourceDocumentRef}|${chargeRef}|${family}`).digest("hex").slice(0, 24)}`;
}

function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }

function unique<T>(values: Array<T | null | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => value !== null && value !== undefined))];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
