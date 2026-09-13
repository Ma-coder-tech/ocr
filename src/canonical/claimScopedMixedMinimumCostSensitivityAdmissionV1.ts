import { createHash } from "node:crypto";

import type { CommercialDecompositionContractV1, CommercialDecompositionRowV1 } from "./commercialDecompositionContractV1.js";
import { assessCanonicalExactCountRateArithmetic, type CanonicalExactCountRateArithmeticResult } from "./exactSourceArithmeticBridge.js";
import type { MoneyAmount } from "./types.js";
import type { CanonicalEconomicCharge, CanonicalEconomicsV2EconomicAnalysis } from "./v2/economicTypes.js";
import { sameDecimal } from "./v2/pricingMath.js";
import type { CanonicalPricingComponent } from "./v2/pricingTypes.js";

export const CLAIM_SCOPED_MIXED_MINIMUM_COST_SENSITIVITY_ADMISSION_V1 =
  "claim_scoped_mixed_minimum_cost_sensitivity_admission_2026_09_13_v1" as const;

export type MixedMinimumSensitivityBlockerV1 =
  | "RD_CHARGE_CARDINALITY_NOT_ONE"
  | "SOURCE_OCCURRENCE_NOT_UNIQUE"
  | "COMMERCIAL_ROW_NOT_UNIQUELY_LINKED"
  | "PRICING_COMPONENT_NOT_UNIQUELY_LINKED"
  | "RELATIONSHIP_NOT_EXPLICITLY_GOVERNED"
  | "FEE_NAME_ONLY_NOT_ADMISSIBLE"
  | "MINIMUM_THRESHOLD_OR_APPLIED_BASE_NOT_KNOWN"
  | "PER_EVENT_RATE_NOT_KNOWN"
  | "OPERAND_EVIDENCE_CONFLICT"
  | "OPERANDS_NOT_SAME_OCCURRENCE_COMPONENT"
  | "ARITHMETIC_DOES_NOT_REPRODUCE_CHARGE"
  | "MERCHANT_FACING_PROVIDER_CONTROL_NOT_SUPPORTED"
  | "EXACT_PROVIDER_CONTROLLED_DOLLARS_NOT_SUPPORTED"
  | "UNDERLYING_OR_SHARED_ECONOMICS_EXCLUDED"
  | "RATE_PLUS_ITEM_OR_SPLIT_REQUIRED"
  | "BUNDLED_TIER_OR_UNRESOLVED_COMPOSITE"
  | "DUPLICATE_REPEAT_OR_SUMMARY_AMBIGUITY"
  | "COUNT_OR_VOLUME_OVERLAP";

export type MixedMinimumSensitivityChargeBindingV1 = {
  rdEconomicChargeRef: string;
  rdSourceOccurrenceRefs: string[];
  commercialFeeRowRef: string | null;
  pricingPopulationRefs: string[];
  pricingComponentRefs: string[];
  amount: MoneyAmount;
  financialDirection: "debit" | "credit";
};

export type MixedMinimumSensitivityAdmissionRecordV1 = {
  admissionId: string;
  admissionBasis: "EXISTING_CURRENT_SENSITIVITY" | "CLAIM_SCOPED_EXTENSION";
  sensitivityClass: "MIXED_OR_MINIMUM";
  relationshipType: "minimum_applied_count";
  sourceDocumentRef: string;
  statementPeriod: { start: string; end: string } | null;
  rdChargeRef: string;
  sourceOccurrenceRef: string;
  commercialFeeRowRef: string;
  pricingComponentRef: string;
  referencedChargedAmountMinor: number;
  currency: "USD";
  operands: {
    appliedMinimumCount: number;
    perEventRateDollars: string;
    populationIdentity: "printed_minimum_applied_count";
  };
  arithmetic: CanonicalExactCountRateArithmeticResult & { status: "reproduces" };
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

export type MixedMinimumSensitivityExcludedCandidateV1 = {
  sourceDocumentRef: string;
  rdChargeRef: string;
  sourceOccurrenceRefs: string[];
  commercialFeeRowRef: string | null;
  pricingComponentRefs: string[];
  printedLabel: string | null;
  referencedChargedAmountMinor: number;
  governedMechanic: string | null;
  governedPopulation: string | null;
  appliedMinimumCount: number | null;
  perEventRateDollars: string | null;
  merchantFacingControlState: string | null;
  arithmetic: CanonicalExactCountRateArithmeticResult;
  blockers: MixedMinimumSensitivityBlockerV1[];
  evidenceRefs: string[];
};

export type ClaimScopedMixedMinimumCostSensitivityAdmissionV1 = {
  schemaVersion: typeof CLAIM_SCOPED_MIXED_MINIMUM_COST_SENSITIVITY_ADMISSION_V1;
  mode: "internal_offline";
  authority: "derived_claim_scoped_sensitivity_reference_only";
  sourceDocumentRef: string;
  statementPeriod: { start: string; end: string } | null;
  status: "ADMITTED" | "WITHHELD" | "NOT_APPLICABLE";
  admissions: MixedMinimumSensitivityAdmissionRecordV1[];
  excludedCandidates: MixedMinimumSensitivityExcludedCandidateV1[];
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
    volumeSensitivityMutationAllowed: false;
    sensitivityCreatesAdditiveDollars: false;
    feeNameInferenceAllowed: false;
    collectionInferenceAllowed: false;
    compositeOverlapAllowed: false;
    chargeSplittingAllowed: false;
    comparisonInputCount: 0;
    savingsOutputCount: 0;
    annualizationOutputCount: 0;
    aiOrWebOperationCount: 0;
    newKnowledgeAdmissionCount: 0;
    customerRoutingAllowed: false;
  };
  limitations: string[];
};

export function buildClaimScopedMixedMinimumCostSensitivityAdmissionV1(input: {
  economic: CanonicalEconomicsV2EconomicAnalysis;
  commercialDecomposition: CommercialDecompositionContractV1;
  chargedCostItems: MixedMinimumSensitivityChargeBindingV1[];
  existingMixedMinimumChargeRefs: string[];
  countDrivenChargeRefs: string[];
  volumeDrivenChargeRefs: string[];
}): ClaimScopedMixedMinimumCostSensitivityAdmissionV1 {
  const foundation = input.economic.pricingAnalysis.foundation;
  const architecture = input.economic.pricingAnalysis.pricingArchitecture;
  const sourceDocumentRef = foundation.identity.sourceDocumentRef;
  const supportedFiservFamily = /fiserv|first.?data/i.test([
    foundation.identity.processorFamily,
    input.commercialDecomposition.statement.processorFamily,
  ].filter(Boolean).join(" "));
  const rowsById = groupBy(input.commercialDecomposition.rows, (row) => row.feeRowId);
  const occurrencesById = new Map(foundation.sourceModel.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const chargesById = groupBy(input.economic.economicLayer.charges.filter(contributes), (charge) => charge.id);
  const componentsById = new Map(architecture.observedPricingComponents.map((component) => [component.id, component]));
  const itemCountByCharge = counts(input.chargedCostItems.map((item) => item.rdEconomicChargeRef));
  const occurrenceUseCount = counts(input.chargedCostItems.flatMap((item) => item.rdSourceOccurrenceRefs));
  const feeRowUseCount = counts(input.chargedCostItems.flatMap((item) => item.commercialFeeRowRef ? [item.commercialFeeRowRef] : []));
  const componentUseCount = counts(input.chargedCostItems.flatMap((item) => item.pricingComponentRefs));
  const existing = new Set(input.existingMixedMinimumChargeRefs);
  const countDriven = new Set(input.countDrivenChargeRefs);
  const volumeDriven = new Set(input.volumeDrivenChargeRefs);
  const admissions: MixedMinimumSensitivityAdmissionRecordV1[] = [];
  const excludedCandidates: MixedMinimumSensitivityExcludedCandidateV1[] = [];

  if (supportedFiservFamily) for (const item of input.chargedCostItems) {
    if (item.financialDirection !== "debit" || item.amount.amountMinor <= 0) continue;
    const rowMatches = item.commercialFeeRowRef ? rowsById.get(item.commercialFeeRowRef) ?? [] : [];
    const row = rowMatches.length === 1 ? rowMatches[0]! : null;
    const occurrences = item.rdSourceOccurrenceRefs.map((ref) => occurrencesById.get(ref)).filter(nonNullable);
    const itemComponents = item.pricingComponentRefs.map((ref) => componentsById.get(ref)).filter(nonNullable);
    const component = itemComponents.length === 1 ? itemComponents[0]! : null;
    const governedRelationship = isGovernedMinimumAppliedCount(row);
    const labelOnlyCandidate = /\bMIN(?:IMUM)?\b/i.test(row?.printedLabel ?? "");
    const componentCandidate = itemComponents.some((candidate) => candidate.componentKind === "minimum" ||
      candidate.basisType === "minimum_floor" || candidate.formulaRelationship === "minimum_floor");
    const governedMinimumCandidate = governedRelationship || row?.identity.exactValue === "monthly_minimum_shortfall" ||
      /minimum/i.test(row?.mechanicAndPopulation.mechanic ?? "");
    if (!governedMinimumCandidate && !componentCandidate && !labelOnlyCandidate && !existing.has(item.rdEconomicChargeRef)) continue;

    const charges = chargesById.get(item.rdEconomicChargeRef) ?? [];
    const charge = charges.length === 1 ? charges[0]! : null;
    const countsObserved = unique([
      ...occurrences.map((occurrence) => occurrence.printedCount),
      ...itemComponents.map((candidate) => candidate.appliedCount),
    ]);
    const ratesObserved = unique([
      ...occurrences.map((occurrence) => occurrence.printedRate),
      ...itemComponents.flatMap((candidate) => [candidate.rate, candidate.printedRate]),
    ]);
    const appliedMinimumCount = countsObserved.length === 1 ? countsObserved[0]! : null;
    const perEventRateDollars = ratesObserved.length === 1 ? ratesObserved[0]! : null;
    const arithmetic = assessCanonicalExactCountRateArithmetic({
      count: appliedMinimumCount,
      perEventRateDollars,
      chargedAmountMinor: item.amount.amountMinor,
    });
    const blockers: MixedMinimumSensitivityBlockerV1[] = [];

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
    if (!component || itemComponents.length !== 1 || componentUseCount.get(component.id) !== 1 ||
        component.observedAmount?.amountMinor !== item.amount.amountMinor) blockers.push("PRICING_COMPONENT_NOT_UNIQUELY_LINKED");
    if (!governedRelationship) blockers.push("RELATIONSHIP_NOT_EXPLICITLY_GOVERNED");
    if (labelOnlyCandidate && !governedRelationship) blockers.push("FEE_NAME_ONLY_NOT_ADMISSIBLE");
    if (appliedMinimumCount === null || !Number.isSafeInteger(appliedMinimumCount) || appliedMinimumCount < 0) {
      blockers.push("MINIMUM_THRESHOLD_OR_APPLIED_BASE_NOT_KNOWN");
    }
    if (perEventRateDollars === null) blockers.push("PER_EVENT_RATE_NOT_KNOWN");
    if (countsObserved.length > 1 || ratesObserved.length > 1 || itemComponents.some(rateEvidenceConflicts)) {
      blockers.push("OPERAND_EVIDENCE_CONFLICT");
    }
    if (!component || item.rdSourceOccurrenceRefs.length !== 1 || component.occurrenceRefs.length !== 1 ||
        component.occurrenceRefs[0] !== item.rdSourceOccurrenceRefs[0] || component.appliedCount !== appliedMinimumCount ||
        !component.rate || perEventRateDollars === null || !sameDecimal(component.rate, perEventRateDollars)) {
      blockers.push("OPERANDS_NOT_SAME_OCCURRENCE_COMPONENT");
    }
    if (arithmetic.status !== "reproduces") blockers.push("ARITHMETIC_DOES_NOT_REPRODUCE_CHARGE");
    if (!row || row.participants.merchantFacingPriceController.state !== "supported" ||
        row.participants.merchantFacingPriceController.value !== "acquiring_side_program") {
      blockers.push("MERCHANT_FACING_PROVIDER_CONTROL_NOT_SUPPORTED");
    }
    if (!row || row.economicLayer.state !== "supported" || row.economicLayer.value !== "acquiring_commercial" ||
        row.commercialDollarCategory !== "PROVIDER_CONTROLLED_VARIABLE" ||
        row.commercialDollarAttribution.kind !== "EXACT_PROVIDER_CONTROLLED_MERCHANT_PRICE" ||
        !row.claimPermissions.exactProviderControlledDollarsAllowed) {
      blockers.push("EXACT_PROVIDER_CONTROLLED_DOLLARS_NOT_SUPPORTED");
    }
    if (row && isUnderlyingSharedOrUpperBound(row)) blockers.push("UNDERLYING_OR_SHARED_ECONOMICS_EXCLUDED");
    if (requiresSplit(itemComponents)) blockers.push("RATE_PLUS_ITEM_OR_SPLIT_REQUIRED");
    if (isBundledTierOrComposite(itemComponents)) blockers.push("BUNDLED_TIER_OR_UNRESOLVED_COMPOSITE");
    if (hasRepresentationAmbiguity(charge, occurrences[0] ?? null, foundation.sourceModel.representationGroups)) {
      blockers.push("DUPLICATE_REPEAT_OR_SUMMARY_AMBIGUITY");
    }
    if (countDriven.has(item.rdEconomicChargeRef) || volumeDriven.has(item.rdEconomicChargeRef)) blockers.push("COUNT_OR_VOLUME_OVERLAP");

    const evidenceRefs = unique([
      ...item.rdSourceOccurrenceRefs.map((ref) => occurrencesById.get(ref)?.evidenceRef ?? null),
      ...(row?.evidenceRefs ?? []),
      ...itemComponents.flatMap((candidate) => candidate.evidenceRefs),
      ...(charge?.evidenceRefs ?? []),
    ]);
    if (blockers.length > 0 || !row || !charge || !component || appliedMinimumCount === null ||
        perEventRateDollars === null || arithmetic.status !== "reproduces") {
      excludedCandidates.push({
        sourceDocumentRef,
        rdChargeRef: item.rdEconomicChargeRef,
        sourceOccurrenceRefs: [...item.rdSourceOccurrenceRefs],
        commercialFeeRowRef: item.commercialFeeRowRef,
        pricingComponentRefs: itemComponents.map((candidate) => candidate.id),
        printedLabel: row?.printedLabel ?? null,
        referencedChargedAmountMinor: item.amount.amountMinor,
        governedMechanic: row?.mechanicAndPopulation.mechanic ?? null,
        governedPopulation: row?.mechanicAndPopulation.population ?? null,
        appliedMinimumCount,
        perEventRateDollars,
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
      sensitivityClass: "MIXED_OR_MINIMUM",
      relationshipType: "minimum_applied_count",
      sourceDocumentRef,
      statementPeriod: foundation.identity.statementPeriod ? { ...foundation.identity.statementPeriod } : null,
      rdChargeRef: item.rdEconomicChargeRef,
      sourceOccurrenceRef: item.rdSourceOccurrenceRefs[0]!,
      commercialFeeRowRef: row.feeRowId,
      pricingComponentRef: component.id,
      referencedChargedAmountMinor: item.amount.amountMinor,
      currency: "USD",
      operands: {
        appliedMinimumCount,
        perEventRateDollars,
        populationIdentity: "printed_minimum_applied_count",
      },
      arithmetic: arithmetic as CanonicalExactCountRateArithmeticResult & { status: "reproduces" },
      merchantFacingProviderControl: {
        state: "SUPPORTED",
        value: "acquiring_side_program",
        evidenceRefs: unique(row.evidenceRefs),
      },
      pricingPopulationRefs: unique(item.pricingPopulationRefs),
      evidenceRefs,
      additiveContributionMinor: 0,
      limitations: [
        "This record describes only the observed minimum-applied-count relationship in the current statement period.",
        "It references one existing RD charge and contributes no additive dollars or component split.",
        "It does not establish overpayment, avoidability, negotiability, provider profit, persistence, savings, or alternative-provider advantage.",
      ],
    });
  }

  const uniqueRefs = new Set(admissions.map((record) => record.rdChargeRef));
  if (uniqueRefs.size !== admissions.length) throw new Error("MIXED_MINIMUM_SENSITIVITY_DUPLICATE_RD_REFERENCE");
  const prior = admissions.filter((record) => record.admissionBasis === "EXISTING_CURRENT_SENSITIVITY");
  const added = admissions.filter((record) => record.admissionBasis === "CLAIM_SCOPED_EXTENSION");
  return deepFreeze({
    schemaVersion: CLAIM_SCOPED_MIXED_MINIMUM_COST_SENSITIVITY_ADMISSION_V1,
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
      volumeSensitivityMutationAllowed: false,
      sensitivityCreatesAdditiveDollars: false,
      feeNameInferenceAllowed: false,
      collectionInferenceAllowed: false,
      compositeOverlapAllowed: false,
      chargeSplittingAllowed: false,
      comparisonInputCount: 0,
      savingsOutputCount: 0,
      annualizationOutputCount: 0,
      aiOrWebOperationCount: 0,
      newKnowledgeAdmissionCount: 0,
      customerRoutingAllowed: false,
    },
    limitations: unique([
      "Admission is claim-scoped to mixed/minimum current-cost sensitivity and cannot mutate Canonical Economics V2, RC, RD, commercial classification, count sensitivity, or volume sensitivity.",
      "Only the independently governed minimum-applied-count relationship is admitted in v1; fee names, collection, and percentage or count arithmetic alone are insufficient.",
      "No composite overlap, rate-plus-item split, bundled-tier extraction, or additive minimum component is authorized.",
      !supportedFiservFamily ? "This package applies only to supported Fiserv-family statements." : null,
      excludedCandidates.length > 0 ? "Candidate minimum or mixed charges that fail one or more predicates remain excluded with explicit blockers." : null,
    ]),
  });
}

function isGovernedMinimumAppliedCount(row: CommercialDecompositionRowV1 | null): boolean {
  return row?.mechanicAndPopulation.mechanicState === "supported" &&
    row.mechanicAndPopulation.mechanic === "minimum_applied_count" &&
    row.mechanicAndPopulation.populationState === "supported" &&
    row.mechanicAndPopulation.population === "printed_minimum_applied_count";
}

function rateEvidenceConflicts(component: CanonicalPricingComponent): boolean {
  return Boolean(component.rate && component.printedRate && !sameDecimal(component.rate, component.printedRate));
}

function requiresSplit(components: CanonicalPricingComponent[]): boolean {
  if (components.length > 1) return true;
  return components.some((component) => component.appliedCount !== null && component.appliedBaseAmount !== null);
}

function isBundledTierOrComposite(components: CanonicalPricingComponent[]): boolean {
  return components.some((component) => component.componentKind === "bundled" ||
    component.formulaRelationship === "mutually_exclusive_tier" || component.formulaRelationship === "additive");
}

function isUnderlyingSharedOrUpperBound(row: CommercialDecompositionRowV1): boolean {
  return row.economicLayer.value !== "acquiring_commercial" ||
    row.commercialDollarCategory !== "PROVIDER_CONTROLLED_VARIABLE" ||
    row.commercialDollarAttribution.kind === "SHARED_BUNDLED_OR_UNRESOLVED" ||
    row.commercialDollarAttribution.kind === "PROVIDER_CONTROLLED_PRICE_UPPER_BOUND_ONLY" ||
    (row.claimPermissions.providerControlledUpperBoundAllowed && !row.claimPermissions.exactProviderControlledDollarsAllowed);
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
  return `mixed_minimum_sensitivity_${createHash("sha256").update(`${sourceDocumentRef}|${chargeRef}|${componentRef}`).digest("hex").slice(0, 24)}`;
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
