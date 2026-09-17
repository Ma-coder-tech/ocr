import { createHash } from "node:crypto";

import type { CommercialDecompositionContractV1, CommercialDecompositionRowV1 } from "./commercialDecompositionContractV1.js";
import {
  assessCanonicalExactVolumeRateArithmetic,
  type CanonicalExactVolumeRateArithmeticResult,
} from "./exactSourceArithmeticBridge.js";
import type { MoneyAmount } from "./types.js";
import type { CanonicalEconomicCharge, CanonicalEconomicsV2EconomicAnalysis } from "./v2/economicTypes.js";
import { normalizePrintedPricingRate, sameDecimal } from "./v2/pricingMath.js";
import type { CanonicalPricingComponent } from "./v2/pricingTypes.js";

export const CLAIM_SCOPED_VOLUME_DRIVEN_COST_SENSITIVITY_ADMISSION_V1 =
  "claim_scoped_volume_driven_cost_sensitivity_admission_2026_09_13_v1" as const;

export type VolumeDrivenSensitivityBlockerV1 =
  | "RD_CHARGE_CARDINALITY_NOT_ONE"
  | "SOURCE_OCCURRENCE_NOT_UNIQUE"
  | "COMMERCIAL_ROW_NOT_UNIQUELY_LINKED"
  | "VOLUME_COMPONENT_NOT_UNIQUELY_LINKED"
  | "BILLED_MONETARY_BASE_NOT_KNOWN"
  | "NORMALIZED_RATE_NOT_KNOWN"
  | "BASE_RATE_NOT_SAME_OCCURRENCE_COMPONENT"
  | "BASE_RATE_EVIDENCE_CONFLICT"
  | "BASE_TIMES_RATE_DOES_NOT_REPRODUCE_CHARGE"
  | "MERCHANT_FACING_PROVIDER_CONTROL_NOT_SUPPORTED"
  | "EXACT_PROVIDER_CONTROLLED_DOLLARS_NOT_SUPPORTED"
  | "ISSUER_INTERCHANGE_ECONOMICS_EXCLUDED"
  | "CARD_NETWORK_ECONOMICS_EXCLUDED"
  | "GOVERNMENT_REGULATORY_ECONOMICS_EXCLUDED"
  | "SHARED_BUNDLED_OR_UPPER_BOUND"
  | "DUPLICATE_REPEAT_OR_SUMMARY_AMBIGUITY"
  | "COUNT_DRIVEN_OR_COMPOSITE_OVERLAP";

export type VolumeDrivenSensitivityChargeBindingV1 = {
  rdEconomicChargeRef: string;
  rdSourceOccurrenceRefs: string[];
  commercialFeeRowRef: string | null;
  pricingPopulationRefs: string[];
  pricingComponentRefs: string[];
  amount: MoneyAmount;
  financialDirection: "debit" | "credit";
};

export type VolumeDrivenSensitivityAdmissionRecordV1 = {
  admissionId: string;
  admissionBasis: "EXISTING_CURRENT_SENSITIVITY" | "CLAIM_SCOPED_EXTENSION";
  sourceDocumentRef: string;
  statementPeriod: { start: string; end: string } | null;
  rdChargeRef: string;
  sourceOccurrenceRef: string;
  commercialFeeRowRef: string;
  pricingComponentRef: string;
  billedBase: MoneyAmount;
  normalizedRate: string;
  printedRate: string;
  printedRateUnit: "decimal" | "percent" | "basis_points";
  referencedChargedAmountMinor: number;
  currency: "USD";
  arithmetic: CanonicalExactVolumeRateArithmeticResult & { status: "reproduces" };
  economicClassification: {
    layer: "acquiring_commercial";
    dollarCategory: "PROVIDER_CONTROLLED_VARIABLE";
    dollarAttribution: "EXACT_PROVIDER_CONTROLLED_MERCHANT_PRICE";
  };
  merchantFacingProviderControl: {
    state: "SUPPORTED";
    value: "acquiring_side_program";
    evidenceRefs: string[];
  };
  pricingPopulationRefs: string[];
  evidenceRefs: string[];
  additiveContributionMinor: 0;
  limitations: string[];
};

export type VolumeDrivenSensitivityExcludedCandidateV1 = {
  sourceDocumentRef: string;
  rdChargeRef: string;
  sourceOccurrenceRefs: string[];
  commercialFeeRowRef: string | null;
  pricingComponentRefs: string[];
  printedLabel: string | null;
  billedBase: MoneyAmount | null;
  normalizedRate: string | null;
  printedRate: string | null;
  printedRateUnit: "decimal" | "percent" | "basis_points" | null;
  referencedChargedAmountMinor: number;
  economicLayer: string | null;
  commercialDollarCategory: string | null;
  merchantFacingControlState: string | null;
  arithmetic: CanonicalExactVolumeRateArithmeticResult;
  blockers: VolumeDrivenSensitivityBlockerV1[];
  evidenceRefs: string[];
};

export type ClaimScopedVolumeDrivenCostSensitivityAdmissionV1 = {
  schemaVersion: typeof CLAIM_SCOPED_VOLUME_DRIVEN_COST_SENSITIVITY_ADMISSION_V1;
  mode: "internal_offline";
  authority: "derived_claim_scoped_sensitivity_reference_only";
  sourceDocumentRef: string;
  statementPeriod: { start: string; end: string } | null;
  status: "ADMITTED" | "WITHHELD" | "NOT_APPLICABLE";
  admissions: VolumeDrivenSensitivityAdmissionRecordV1[];
  excludedCandidates: VolumeDrivenSensitivityExcludedCandidateV1[];
  aggregate: {
    candidateCount: number;
    admittedChargeCount: number;
    admittedReferencedAmountMinor: number;
    existingAdmissionCount: number;
    existingReferencedAmountMinor: number;
    newlyAdmittedChargeCount: number;
    newlyAdmittedReferencedAmountMinor: number;
    uniqueReferencedRdChargeCount: number;
    duplicateRdChargeReferenceCount: 0;
    additiveSensitivityAmountMinor: 0;
  };
  safety: {
    rdIsSoleAdditiveLedger: true;
    rdMutationAllowed: false;
    canonicalMutationAllowed: false;
    costStackCategoryMutationAllowed: false;
    countSensitivityMutationAllowed: false;
    sensitivityCreatesAdditiveDollars: false;
    feeNameInferenceAllowed: false;
    percentageAloneProvesProviderControl: false;
    compositeSensitivityAllowed: false;
    comparisonInputCount: 0;
    savingsOutputCount: 0;
    annualizationOutputCount: 0;
    aiOrWebOperationCount: 0;
    newKnowledgeAdmissionCount: 0;
    customerRoutingAllowed: false;
  };
  limitations: string[];
};

export function buildClaimScopedVolumeDrivenCostSensitivityAdmissionV1(input: {
  economic: CanonicalEconomicsV2EconomicAnalysis;
  commercialDecomposition: CommercialDecompositionContractV1;
  chargedCostItems: VolumeDrivenSensitivityChargeBindingV1[];
  existingVolumeDrivenChargeRefs: string[];
  countDrivenChargeRefs: string[];
}): ClaimScopedVolumeDrivenCostSensitivityAdmissionV1 {
  const foundation = input.economic.pricingAnalysis.foundation;
  const sourceDocumentRef = foundation.identity.sourceDocumentRef;
  const supportedFiservFamily = /fiserv|first.?data/i.test([
    foundation.identity.processorFamily,
    input.commercialDecomposition.statement.processorFamily,
  ].filter(Boolean).join(" "));
  const rowsById = groupBy(input.commercialDecomposition.rows, (row) => row.feeRowId);
  const occurrencesById = new Map(foundation.sourceModel.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const chargesById = groupBy(input.economic.economicLayer.charges.filter(contributes), (charge) => charge.id);
  const componentsById = new Map(input.economic.pricingAnalysis.pricingArchitecture.observedPricingComponents.map((component) => [component.id, component]));
  const itemCountByCharge = counts(input.chargedCostItems.map((item) => item.rdEconomicChargeRef));
  const occurrenceUseCount = counts(input.chargedCostItems.flatMap((item) => item.rdSourceOccurrenceRefs));
  const feeRowUseCount = counts(input.chargedCostItems.flatMap((item) => item.commercialFeeRowRef ? [item.commercialFeeRowRef] : []));
  const componentUseCount = counts(input.chargedCostItems.flatMap((item) => item.pricingComponentRefs));
  const existing = new Set(input.existingVolumeDrivenChargeRefs);
  const countDriven = new Set(input.countDrivenChargeRefs);
  const admissions: VolumeDrivenSensitivityAdmissionRecordV1[] = [];
  const excludedCandidates: VolumeDrivenSensitivityExcludedCandidateV1[] = [];

  if (supportedFiservFamily) for (const item of input.chargedCostItems) {
    if (item.financialDirection !== "debit" || item.amount.amountMinor <= 0) continue;
    const itemComponents = item.pricingComponentRefs.map((ref) => componentsById.get(ref)).filter(nonNullable);
    const percentageCandidates = itemComponents.filter(isPercentageVolumeCandidate);
    if (percentageCandidates.length === 0) continue;

    const rowMatches = item.commercialFeeRowRef ? rowsById.get(item.commercialFeeRowRef) ?? [] : [];
    const row = rowMatches.length === 1 ? rowMatches[0]! : null;
    const occurrences = item.rdSourceOccurrenceRefs.map((ref) => occurrencesById.get(ref)).filter(nonNullable);
    const charges = chargesById.get(item.rdEconomicChargeRef) ?? [];
    const charge = charges.length === 1 ? charges[0]! : null;
    const component = percentageCandidates.length === 1 ? percentageCandidates[0]! : null;
    const normalizedRate = normalizedComponentRate(component);
    const arithmetic = assessCanonicalExactVolumeRateArithmetic({
      billedBaseMinor: component?.appliedBaseAmount?.amountMinor ?? null,
      normalizedRate,
      chargedAmountMinor: item.amount.amountMinor,
    });
    const blockers: VolumeDrivenSensitivityBlockerV1[] = [];

    if (charges.length !== 1 || itemCountByCharge.get(item.rdEconomicChargeRef) !== 1 ||
        charge?.observedAmount?.amountMinor !== item.amount.amountMinor || charge?.financialDirection !== item.financialDirection) {
      blockers.push("RD_CHARGE_CARDINALITY_NOT_ONE");
    }
    if (item.rdSourceOccurrenceRefs.length !== 1 || occurrences.length !== 1 || occurrenceUseCount.get(item.rdSourceOccurrenceRefs[0] ?? "") !== 1 ||
        charge?.sourceOccurrenceRefs.length !== 1 || charge.sourceOccurrenceRefs[0] !== item.rdSourceOccurrenceRefs[0]) {
      blockers.push("SOURCE_OCCURRENCE_NOT_UNIQUE");
    }
    if (!row || rowMatches.length !== 1 || !row.contributesToCanonicalTotal || row.billedAmountMinor !== item.amount.amountMinor ||
        !item.commercialFeeRowRef || feeRowUseCount.get(item.commercialFeeRowRef) !== 1) blockers.push("COMMERCIAL_ROW_NOT_UNIQUELY_LINKED");
    if (!component || percentageCandidates.length !== 1 || componentUseCount.get(component.id) !== 1 ||
        component.observedAmount?.amountMinor !== item.amount.amountMinor) blockers.push("VOLUME_COMPONENT_NOT_UNIQUELY_LINKED");
    if (!component?.appliedBaseAmount || component.appliedBaseAmount.currency !== item.amount.currency ||
        !Number.isSafeInteger(component.appliedBaseAmount.amountMinor) || component.appliedBaseAmount.amountMinor < 0) {
      blockers.push("BILLED_MONETARY_BASE_NOT_KNOWN");
    }
    if (!normalizedRate) blockers.push("NORMALIZED_RATE_NOT_KNOWN");
    if (!component || item.rdSourceOccurrenceRefs.length !== 1 || component.occurrenceRefs.length !== 1 ||
        component.occurrenceRefs[0] !== item.rdSourceOccurrenceRefs[0] || component.basisType !== "volume") {
      blockers.push("BASE_RATE_NOT_SAME_OCCURRENCE_COMPONENT");
    }
    if (component && rateEvidenceConflicts(component)) blockers.push("BASE_RATE_EVIDENCE_CONFLICT");
    if (arithmetic.status !== "reproduces") blockers.push("BASE_TIMES_RATE_DOES_NOT_REPRODUCE_CHARGE");
    if (!row || row.participants.merchantFacingPriceController.state !== "supported" ||
        row.participants.merchantFacingPriceController.value !== "acquiring_side_program") {
      blockers.push("MERCHANT_FACING_PROVIDER_CONTROL_NOT_SUPPORTED");
    }
    if (!row || row.economicLayer.state !== "supported" || row.economicLayer.value !== "acquiring_commercial" ||
        row.commercialDollarCategory !== "PROVIDER_CONTROLLED_VARIABLE" ||
        row.commercialDollarAttribution.kind !== "EXACT_PROVIDER_CONTROLLED_MERCHANT_PRICE" ||
        !row.claimPermissions.exactProviderControlledDollarsAllowed) blockers.push("EXACT_PROVIDER_CONTROLLED_DOLLARS_NOT_SUPPORTED");
    addEconomicFirewallBlockers(row, blockers);
    if (hasRepresentationAmbiguity(charge, occurrences[0] ?? null, foundation.sourceModel.representationGroups)) {
      blockers.push("DUPLICATE_REPEAT_OR_SUMMARY_AMBIGUITY");
    }
    if (countDriven.has(item.rdEconomicChargeRef) || isComposite(itemComponents)) blockers.push("COUNT_DRIVEN_OR_COMPOSITE_OVERLAP");

    const evidenceRefs = unique([
      ...item.rdSourceOccurrenceRefs.map((ref) => occurrencesById.get(ref)?.evidenceRef ?? null),
      ...(row?.evidenceRefs ?? []),
      ...(component?.evidenceRefs ?? []),
      ...(charge?.evidenceRefs ?? []),
    ]);
    if (blockers.length > 0 || !row || !charge || !component || !normalizedRate || !component.appliedBaseAmount || arithmetic.status !== "reproduces") {
      excludedCandidates.push({
        sourceDocumentRef,
        rdChargeRef: item.rdEconomicChargeRef,
        sourceOccurrenceRefs: [...item.rdSourceOccurrenceRefs],
        commercialFeeRowRef: item.commercialFeeRowRef,
        pricingComponentRefs: percentageCandidates.map((candidate) => candidate.id),
        printedLabel: row?.printedLabel ?? null,
        billedBase: component?.appliedBaseAmount ? { ...component.appliedBaseAmount } : null,
        normalizedRate,
        printedRate: component?.printedRate ?? null,
        printedRateUnit: component?.printedRateUnit ?? null,
        referencedChargedAmountMinor: item.amount.amountMinor,
        economicLayer: row?.economicLayer.value ?? null,
        commercialDollarCategory: row?.commercialDollarCategory ?? null,
        merchantFacingControlState: row?.participants.merchantFacingPriceController.state ?? null,
        arithmetic,
        blockers: unique(blockers),
        evidenceRefs,
      });
      continue;
    }
    admissions.push({
      admissionId: admissionId(sourceDocumentRef, item.rdEconomicChargeRef, component.id),
      admissionBasis: existing.has(item.rdEconomicChargeRef) ? "EXISTING_CURRENT_SENSITIVITY" : "CLAIM_SCOPED_EXTENSION",
      sourceDocumentRef,
      statementPeriod: foundation.identity.statementPeriod ? { ...foundation.identity.statementPeriod } : null,
      rdChargeRef: item.rdEconomicChargeRef,
      sourceOccurrenceRef: item.rdSourceOccurrenceRefs[0]!,
      commercialFeeRowRef: row.feeRowId,
      pricingComponentRef: component.id,
      billedBase: { ...component.appliedBaseAmount },
      normalizedRate,
      printedRate: component.printedRate!,
      printedRateUnit: component.printedRateUnit!,
      referencedChargedAmountMinor: item.amount.amountMinor,
      currency: "USD",
      arithmetic: arithmetic as CanonicalExactVolumeRateArithmeticResult & { status: "reproduces" },
      economicClassification: {
        layer: "acquiring_commercial",
        dollarCategory: "PROVIDER_CONTROLLED_VARIABLE",
        dollarAttribution: "EXACT_PROVIDER_CONTROLLED_MERCHANT_PRICE",
      },
      merchantFacingProviderControl: {
        state: "SUPPORTED",
        value: "acquiring_side_program",
        evidenceRefs: unique(row.evidenceRefs),
      },
      pricingPopulationRefs: unique(item.pricingPopulationRefs),
      evidenceRefs,
      additiveContributionMinor: 0,
      limitations: [
        "This record describes only the observed charge's dependence on the preserved billed monetary base.",
        "It references an existing RD charge and contributes no additive dollars.",
        "It does not establish overpayment, persistence, avoidability, negotiability, profit, savings, or alternative-provider advantage.",
      ],
    });
  }

  const uniqueRefs = new Set(admissions.map((record) => record.rdChargeRef));
  if (uniqueRefs.size !== admissions.length) throw new Error("VOLUME_SENSITIVITY_DUPLICATE_RD_REFERENCE");
  const prior = admissions.filter((record) => record.admissionBasis === "EXISTING_CURRENT_SENSITIVITY");
  const added = admissions.filter((record) => record.admissionBasis === "CLAIM_SCOPED_EXTENSION");
  return deepFreeze({
    schemaVersion: CLAIM_SCOPED_VOLUME_DRIVEN_COST_SENSITIVITY_ADMISSION_V1,
    mode: "internal_offline",
    authority: "derived_claim_scoped_sensitivity_reference_only",
    sourceDocumentRef,
    statementPeriod: foundation.identity.statementPeriod ? { ...foundation.identity.statementPeriod } : null,
    status: !supportedFiservFamily ? "NOT_APPLICABLE" : admissions.length > 0 ? "ADMITTED" : "WITHHELD",
    admissions,
    excludedCandidates,
    aggregate: {
      candidateCount: admissions.length + excludedCandidates.length,
      admittedChargeCount: admissions.length,
      admittedReferencedAmountMinor: sum(admissions.map((record) => record.referencedChargedAmountMinor)),
      existingAdmissionCount: prior.length,
      existingReferencedAmountMinor: sum(prior.map((record) => record.referencedChargedAmountMinor)),
      newlyAdmittedChargeCount: added.length,
      newlyAdmittedReferencedAmountMinor: sum(added.map((record) => record.referencedChargedAmountMinor)),
      uniqueReferencedRdChargeCount: uniqueRefs.size,
      duplicateRdChargeReferenceCount: 0,
      additiveSensitivityAmountMinor: 0,
    },
    safety: {
      rdIsSoleAdditiveLedger: true,
      rdMutationAllowed: false,
      canonicalMutationAllowed: false,
      costStackCategoryMutationAllowed: false,
      countSensitivityMutationAllowed: false,
      sensitivityCreatesAdditiveDollars: false,
      feeNameInferenceAllowed: false,
      percentageAloneProvesProviderControl: false,
      compositeSensitivityAllowed: false,
      comparisonInputCount: 0,
      savingsOutputCount: 0,
      annualizationOutputCount: 0,
      aiOrWebOperationCount: 0,
      newKnowledgeAdmissionCount: 0,
      customerRoutingAllowed: false,
    },
    limitations: unique([
      "Admission is claim-scoped to volume-driven current-cost sensitivity and cannot mutate Canonical Economics V2, RC, RD, commercial classification, or count sensitivity.",
      "Percentage arithmetic alone never establishes provider control or provider-controlled dollars.",
      !supportedFiservFamily ? "This package applies only to supported Fiserv-family statements." : null,
      excludedCandidates.length > 0 ? "Candidate percentage charges that fail one or more predicates remain excluded with explicit blockers." : null,
    ]),
  });
}

function isPercentageVolumeCandidate(component: CanonicalPricingComponent): boolean {
  return component.basisType === "volume" || component.componentKind === "percentage" || component.componentKind === "basis_points" ||
    (component.appliedBaseAmount !== null && (component.rate !== null || component.printedRate !== null));
}

function normalizedComponentRate(component: CanonicalPricingComponent | null): string | null {
  if (!component?.rate || !component.printedRate || !component.printedRateUnit) return null;
  const normalized = normalizePrintedPricingRate(component.printedRate, component.printedRateUnit);
  return normalized && sameDecimal(normalized, component.rate) ? component.rate : null;
}

function rateEvidenceConflicts(component: CanonicalPricingComponent): boolean {
  if (!component.printedRate || !component.printedRateUnit || !component.rate) return false;
  const normalized = normalizePrintedPricingRate(component.printedRate, component.printedRateUnit);
  return normalized === null || !sameDecimal(normalized, component.rate);
}

function isComposite(components: CanonicalPricingComponent[]): boolean {
  return components.some((component) => component.appliedCount !== null || component.perItemAmount !== null || component.minimumAmount !== null ||
    component.fixedAmount !== null || component.basisType === "minimum_floor" || component.basisType === "transaction_count");
}

function addEconomicFirewallBlockers(row: CommercialDecompositionRowV1 | null, blockers: VolumeDrivenSensitivityBlockerV1[]): void {
  if (!row) return;
  if (row.economicLayer.value === "issuer_interchange" || row.commercialDollarCategory === "INCIDENCE_CONFIGURATION_OR_QUALIFICATION_SENSITIVE") {
    blockers.push("ISSUER_INTERCHANGE_ECONOMICS_EXCLUDED");
  }
  if (row.economicLayer.value === "card_network" || row.commercialDollarCategory === "UNDERLYING_EXTERNALLY_SET_NETWORK_OR_PROGRAM") {
    blockers.push("CARD_NETWORK_ECONOMICS_EXCLUDED");
  }
  if (row.economicLayer.value === "government_or_nonprocessing_pass_through" || row.commercialDollarCategory === "GOVERNMENT_NONPROCESSING_OR_OTHER") {
    blockers.push("GOVERNMENT_REGULATORY_ECONOMICS_EXCLUDED");
  }
  if (row.commercialDollarCategory === "SHARED_BUNDLED_OR_UNRESOLVED" ||
      row.commercialDollarAttribution.kind === "SHARED_BUNDLED_OR_UNRESOLVED" ||
      row.commercialDollarAttribution.kind === "PROVIDER_CONTROLLED_PRICE_UPPER_BOUND_ONLY" ||
      (row.claimPermissions.providerControlledUpperBoundAllowed && !row.claimPermissions.exactProviderControlledDollarsAllowed)) {
    blockers.push("SHARED_BUNDLED_OR_UPPER_BOUND");
  }
}

function hasRepresentationAmbiguity(
  charge: CanonicalEconomicCharge | null,
  occurrence: CanonicalEconomicsV2EconomicAnalysis["pricingAnalysis"]["foundation"]["sourceModel"]["occurrences"][number] | null,
  groups: CanonicalEconomicsV2EconomicAnalysis["pricingAnalysis"]["foundation"]["sourceModel"]["representationGroups"],
): boolean {
  if (!charge || !occurrence) return true;
  if (["repeated_representation", "control_only", "unresolved"].includes(occurrence.contributionRole)) return true;
  const related = groups.filter((group) => group.id === charge.representationGroupRef || group.occurrenceRefs.includes(occurrence.id));
  return related.some((group) => group.duplicateHandling === "unresolved");
}

function admissionId(sourceDocumentRef: string, chargeRef: string, componentRef: string): string {
  return `volume_sensitivity_${createHash("sha256").update(`${sourceDocumentRef}|${chargeRef}|${componentRef}`).digest("hex").slice(0, 24)}`;
}

function contributes(charge: CanonicalEconomicCharge): boolean {
  return (charge.contributionStatus === "contributes_classified" || charge.contributionStatus === "contributes_unresolved") &&
    charge.observedAmount !== null && (charge.financialDirection === "debit" || charge.financialDirection === "credit");
}

function counts(values: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const value of values) result.set(key(value), [...(result.get(key(value)) ?? []), value]);
  return result;
}

function nonNullable<T>(value: T | null | undefined): value is T { return value !== null && value !== undefined; }
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function unique<T>(values: Array<T | null | undefined>): T[] { return [...new Set(values.filter(nonNullable))]; }
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
