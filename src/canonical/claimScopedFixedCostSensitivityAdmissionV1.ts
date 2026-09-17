import { createHash } from "node:crypto";

import type { CommercialDecompositionContractV1, CommercialDecompositionRowV1 } from "./commercialDecompositionContractV1.js";
import type { MoneyAmount } from "./types.js";
import type { CanonicalEconomicCharge, CanonicalEconomicsV2EconomicAnalysis } from "./v2/economicTypes.js";
import type { CanonicalPricingComponent } from "./v2/pricingTypes.js";

export const CLAIM_SCOPED_FIXED_COST_SENSITIVITY_ADMISSION_V1 =
  "claim_scoped_fixed_cost_sensitivity_admission_2026_09_13_v1" as const;

export type FixedCostCadenceV1 = "monthly" | "statement_period" | "annual";
export type FixedCostRelationshipV1 =
  | "fixed_monthly"
  | "fixed_statement_period"
  | "fixed_annual"
  | "fixed_account"
  | "fixed_location"
  | "fixed_subscription";

export type FixedCostSensitivityBlockerV1 =
  | "RD_CHARGE_CARDINALITY_NOT_ONE"
  | "SOURCE_OCCURRENCE_NOT_UNIQUE"
  | "COMMERCIAL_ROW_NOT_UNIQUELY_LINKED"
  | "FIXED_AMOUNT_NOT_KNOWN"
  | "CADENCE_NOT_EXPLICIT_FROM_STATEMENT"
  | "CADENCE_NOT_APPROVED"
  | "FEE_NAME_ONLY_NOT_ADMISSIBLE"
  | "COUNT_GOVERNED_AMOUNT"
  | "VOLUME_OR_PERCENTAGE_GOVERNED_AMOUNT"
  | "MINIMUM_GOVERNED_AMOUNT"
  | "MIXED_OR_COMPOSITE_GOVERNED_AMOUNT"
  | "VARIABLE_OPERANDS_PRESENT"
  | "BUNDLED_DECOMPOSITION_REQUIRED"
  | "DUPLICATE_REPEAT_OR_SUMMARY_AMBIGUITY"
  | "COUNT_VOLUME_OR_MIXED_OVERLAP";

export type FixedCostSensitivityChargeBindingV1 = {
  rdEconomicChargeRef: string;
  rdSourceOccurrenceRefs: string[];
  commercialFeeRowRef: string | null;
  pricingPopulationRefs: string[];
  pricingComponentRefs: string[];
  amount: MoneyAmount;
  financialDirection: "debit" | "credit";
};

type SeparatedParticipantClaimV1 = {
  state: "SUPPORTED" | "CATEGORY_ONLY" | "UNKNOWN";
  value: string | null;
  evidenceRefs: string[];
};

type UnknownDispositionV1 = {
  state: "UNKNOWN";
  value: null;
  evidenceRefs: [];
  reason: string;
};

export type FixedCostSensitivityAdmissionRecordV1 = {
  admissionId: string;
  admissionBasis: "EXISTING_CURRENT_SENSITIVITY" | "CLAIM_SCOPED_EXTENSION";
  sensitivityClass: "FIXED_COST_DRIVEN";
  sourceDocumentRef: string;
  statementPeriod: { start: string; end: string } | null;
  rdChargeRef: string;
  sourceOccurrenceRef: string;
  commercialFeeRowRef: string;
  pricingPopulationRefs: string[];
  pricingComponentRefs: string[];
  referencedChargedAmountMinor: number;
  currency: "USD";
  fixedBehavior: {
    state: "PROVEN";
    relationship: FixedCostRelationshipV1;
    amountKnown: true;
    amountActivityIndependent: true;
    incidenceMayBeActivityConditioned: boolean;
  };
  cadence: {
    state: "PROVEN";
    type: FixedCostCadenceV1;
    source: "STATEMENT_EXPLICIT";
    evidenceRefs: string[];
  };
  economicCategory: {
    state: "PRESERVED_SEPARATELY";
    value: CommercialDecompositionRowV1["commercialDollarCategory"];
    evidenceRefs: string[];
  };
  merchantFacingControl: SeparatedParticipantClaimV1;
  priceSetter: SeparatedParticipantClaimV1;
  negotiability: UnknownDispositionV1;
  avoidability: UnknownDispositionV1;
  annualization: {
    allowed: false;
    annualizedAmountMinor: null;
  };
  evidenceRefs: string[];
  additiveContributionMinor: 0;
  limitations: string[];
};

export type FixedCostSensitivityExcludedCandidateV1 = {
  sourceDocumentRef: string;
  rdChargeRef: string;
  sourceOccurrenceRefs: string[];
  commercialFeeRowRef: string | null;
  pricingComponentRefs: string[];
  printedLabel: string | null;
  referencedChargedAmountMinor: number;
  detectedCadence: FixedCostCadenceV1 | null;
  cadenceStatementProven: boolean;
  economicCategory: string | null;
  merchantFacingControlState: string | null;
  merchantFacingControlValue: string | null;
  blockers: FixedCostSensitivityBlockerV1[];
  evidenceRefs: string[];
};

export type ClaimScopedFixedCostSensitivityAdmissionV1 = {
  schemaVersion: typeof CLAIM_SCOPED_FIXED_COST_SENSITIVITY_ADMISSION_V1;
  mode: "internal_offline";
  authority: "derived_claim_scoped_sensitivity_reference_only";
  sourceDocumentRef: string;
  statementPeriod: { start: string; end: string } | null;
  status: "ADMITTED" | "WITHHELD" | "NOT_APPLICABLE";
  admissions: FixedCostSensitivityAdmissionRecordV1[];
  excludedCandidates: FixedCostSensitivityExcludedCandidateV1[];
  aggregate: {
    candidateCount: number;
    admittedChargeCount: number;
    admittedReferencedAmountMinor: number;
    existingAdmissionCount: number;
    existingReferencedAmountMinor: number;
    newlyAdmittedChargeCount: number;
    newlyAdmittedReferencedAmountMinor: number;
    monthlyChargeCount: number;
    monthlyReferencedAmountMinor: number;
    statementPeriodChargeCount: number;
    statementPeriodReferencedAmountMinor: number;
    annualChargeCount: number;
    annualReferencedAmountMinor: number;
    controlUnknownChargeCount: number;
    controlUnknownReferencedAmountMinor: number;
    controlSupportedChargeCount: number;
    controlSupportedReferencedAmountMinor: number;
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
    mixedMinimumSensitivityMutationAllowed: false;
    sensitivityCreatesAdditiveDollars: false;
    providerControlRequiredForFixedBehavior: false;
    feeNameAloneProvesFixedBehavior: false;
    annualizationAllowed: false;
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

export function buildClaimScopedFixedCostSensitivityAdmissionV1(input: {
  economic: CanonicalEconomicsV2EconomicAnalysis;
  commercialDecomposition: CommercialDecompositionContractV1;
  chargedCostItems: FixedCostSensitivityChargeBindingV1[];
  existingFixedCostChargeRefs: string[];
  countDrivenChargeRefs: string[];
  volumeDrivenChargeRefs: string[];
  mixedMinimumChargeRefs: string[];
}): ClaimScopedFixedCostSensitivityAdmissionV1 {
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
  const existing = new Set(input.existingFixedCostChargeRefs);
  const claimedElsewhere = new Set([
    ...input.countDrivenChargeRefs,
    ...input.volumeDrivenChargeRefs,
    ...input.mixedMinimumChargeRefs,
  ]);
  const admissions: FixedCostSensitivityAdmissionRecordV1[] = [];
  const excludedCandidates: FixedCostSensitivityExcludedCandidateV1[] = [];

  if (supportedFiservFamily) for (const item of input.chargedCostItems) {
    if (item.financialDirection !== "debit" || item.amount.amountMinor <= 0) continue;
    const rowMatches = item.commercialFeeRowRef ? rowsById.get(item.commercialFeeRowRef) ?? [] : [];
    const row = rowMatches.length === 1 ? rowMatches[0]! : null;
    const label = row?.printedLabel ?? "";
    const cadence = cadenceFromStatementLabel(label);
    const itemComponents = item.pricingComponentRefs.map((ref) => componentsById.get(ref)).filter(nonNullable);
    if (!isFixedLookingCandidate(label, row, itemComponents, cadence) && !existing.has(item.rdEconomicChargeRef)) continue;

    const occurrences = item.rdSourceOccurrenceRefs.map((ref) => occurrencesById.get(ref)).filter(nonNullable);
    const charges = chargesById.get(item.rdEconomicChargeRef) ?? [];
    const charge = charges.length === 1 ? charges[0]! : null;
    const variable = variableMechanics(row, itemComponents, occurrences);
    const blockers: FixedCostSensitivityBlockerV1[] = [];

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
    if (!Number.isSafeInteger(item.amount.amountMinor) || item.amount.amountMinor <= 0 || item.amount.currency !== "USD") {
      blockers.push("FIXED_AMOUNT_NOT_KNOWN");
    }
    if (!cadence) blockers.push("CADENCE_NOT_EXPLICIT_FROM_STATEMENT");
    if (cadence && !["monthly", "statement_period", "annual"].includes(cadence)) blockers.push("CADENCE_NOT_APPROVED");
    if (!cadence && isFixedLookingLabel(label)) blockers.push("FEE_NAME_ONLY_NOT_ADMISSIBLE");
    if (variable.count) blockers.push("COUNT_GOVERNED_AMOUNT");
    if (variable.volume) blockers.push("VOLUME_OR_PERCENTAGE_GOVERNED_AMOUNT");
    if (variable.minimum) blockers.push("MINIMUM_GOVERNED_AMOUNT");
    if (variable.mixed) blockers.push("MIXED_OR_COMPOSITE_GOVERNED_AMOUNT");
    if (variable.hasOperands) blockers.push("VARIABLE_OPERANDS_PRESENT");
    if (variable.requiresDecomposition) blockers.push("BUNDLED_DECOMPOSITION_REQUIRED");
    if (hasRepresentationAmbiguity(charge, occurrences[0] ?? null, foundation.sourceModel.representationGroups)) {
      blockers.push("DUPLICATE_REPEAT_OR_SUMMARY_AMBIGUITY");
    }
    if (claimedElsewhere.has(item.rdEconomicChargeRef)) blockers.push("COUNT_VOLUME_OR_MIXED_OVERLAP");

    const evidenceRefs = unique([
      ...item.rdSourceOccurrenceRefs.map((ref) => occurrencesById.get(ref)?.evidenceRef ?? null),
      ...(row?.evidenceRefs ?? []),
      ...itemComponents.flatMap((component) => component.evidenceRefs),
      ...(charge?.evidenceRefs ?? []),
    ]);
    if (blockers.length > 0 || !row || !charge || !cadence) {
      excludedCandidates.push({
        sourceDocumentRef,
        rdChargeRef: item.rdEconomicChargeRef,
        sourceOccurrenceRefs: [...item.rdSourceOccurrenceRefs],
        commercialFeeRowRef: item.commercialFeeRowRef,
        pricingComponentRefs: itemComponents.map((component) => component.id),
        printedLabel: row?.printedLabel ?? null,
        referencedChargedAmountMinor: item.amount.amountMinor,
        detectedCadence: cadence,
        cadenceStatementProven: cadence !== null,
        economicCategory: row?.commercialDollarCategory ?? null,
        merchantFacingControlState: row?.participants.merchantFacingPriceController.state ?? null,
        merchantFacingControlValue: row?.participants.merchantFacingPriceController.value ?? null,
        blockers: unique(blockers),
        evidenceRefs,
      });
      continue;
    }

    const occurrenceEvidenceRefs = unique(item.rdSourceOccurrenceRefs.map((ref) => occurrencesById.get(ref)?.evidenceRef ?? null));
    const control = separatedParticipantClaim(row.participants.merchantFacingPriceController, row.evidenceRefs);
    const priceSetter = separatedParticipantClaim(row.participants.priceSetter, row.evidenceRefs);
    admissions.push({
      admissionId: admissionId(sourceDocumentRef, item.rdEconomicChargeRef, cadence),
      admissionBasis: existing.has(item.rdEconomicChargeRef) ? "EXISTING_CURRENT_SENSITIVITY" : "CLAIM_SCOPED_EXTENSION",
      sensitivityClass: "FIXED_COST_DRIVEN",
      sourceDocumentRef,
      statementPeriod: foundation.identity.statementPeriod ? { ...foundation.identity.statementPeriod } : null,
      rdChargeRef: item.rdEconomicChargeRef,
      sourceOccurrenceRef: item.rdSourceOccurrenceRefs[0]!,
      commercialFeeRowRef: row.feeRowId,
      pricingPopulationRefs: [...item.pricingPopulationRefs],
      pricingComponentRefs: itemComponents.map((component) => component.id),
      referencedChargedAmountMinor: item.amount.amountMinor,
      currency: "USD",
      fixedBehavior: {
        state: "PROVEN",
        relationship: relationshipFromLabel(label, cadence),
        amountKnown: true,
        amountActivityIndependent: true,
        incidenceMayBeActivityConditioned: /\bLOCATION\b/i.test(label),
      },
      cadence: {
        state: "PROVEN",
        type: cadence,
        source: "STATEMENT_EXPLICIT",
        evidenceRefs: occurrenceEvidenceRefs,
      },
      economicCategory: {
        state: "PRESERVED_SEPARATELY",
        value: row.commercialDollarCategory,
        evidenceRefs: unique(row.evidenceRefs),
      },
      merchantFacingControl: control,
      priceSetter,
      negotiability: unknownDisposition("The statement proves fixed behavior and cadence, not negotiability."),
      avoidability: unknownDisposition("The statement proves fixed behavior and cadence, not avoidability or removability."),
      annualization: { allowed: false, annualizedAmountMinor: null },
      evidenceRefs,
      additiveContributionMinor: 0,
      limitations: [
        "This record describes only the observed fixed charge and statement-proven cadence for the current statement period.",
        "Merchant-facing control, price setting, negotiability, avoidability, removability, future persistence, and future amount remain separate claims.",
        "It references one existing RD charge, contributes no additive dollars, and cannot support annual savings or an alternative-provider outcome.",
      ],
    });
  }

  const uniqueRefs = new Set(admissions.map((record) => record.rdChargeRef));
  if (uniqueRefs.size !== admissions.length) throw new Error("FIXED_COST_SENSITIVITY_DUPLICATE_RD_REFERENCE");
  const prior = admissions.filter((record) => record.admissionBasis === "EXISTING_CURRENT_SENSITIVITY");
  const added = admissions.filter((record) => record.admissionBasis === "CLAIM_SCOPED_EXTENSION");
  const monthly = admissions.filter((record) => record.cadence.type === "monthly");
  const statementPeriod = admissions.filter((record) => record.cadence.type === "statement_period");
  const annual = admissions.filter((record) => record.cadence.type === "annual");
  const controlSupported = admissions.filter((record) => record.merchantFacingControl.state === "SUPPORTED");
  const controlUnknown = admissions.filter((record) => record.merchantFacingControl.state !== "SUPPORTED");
  return deepFreeze({
    schemaVersion: CLAIM_SCOPED_FIXED_COST_SENSITIVITY_ADMISSION_V1,
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
      monthlyChargeCount: monthly.length,
      monthlyReferencedAmountMinor: sum(monthly.map((record) => record.referencedChargedAmountMinor)),
      statementPeriodChargeCount: statementPeriod.length,
      statementPeriodReferencedAmountMinor: sum(statementPeriod.map((record) => record.referencedChargedAmountMinor)),
      annualChargeCount: annual.length,
      annualReferencedAmountMinor: sum(annual.map((record) => record.referencedChargedAmountMinor)),
      controlUnknownChargeCount: controlUnknown.length,
      controlUnknownReferencedAmountMinor: sum(controlUnknown.map((record) => record.referencedChargedAmountMinor)),
      controlSupportedChargeCount: controlSupported.length,
      controlSupportedReferencedAmountMinor: sum(controlSupported.map((record) => record.referencedChargedAmountMinor)),
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
      mixedMinimumSensitivityMutationAllowed: false,
      sensitivityCreatesAdditiveDollars: false,
      providerControlRequiredForFixedBehavior: false,
      feeNameAloneProvesFixedBehavior: false,
      annualizationAllowed: false,
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
      "Admission is claim-scoped to fixed-cost behavior and cannot mutate Canonical Economics V2, RD, commercial classification, or another sensitivity family.",
      "Statement-explicit cadence plus a fixed known RD amount can establish fixed behavior even when merchant-facing control remains unknown.",
      "Fee-name intuition, one occurrence, externally supplied cadence, or the word fixed without statement-explicit cadence is insufficient.",
      "No annualization, opportunity total, component split, comparison, savings, or future-persistence claim is authorized.",
      !supportedFiservFamily ? "This package applies only to supported Fiserv-family statements." : null,
      excludedCandidates.length > 0 ? "Fixed-looking candidates that fail one or more predicates remain excluded with exact blockers." : null,
    ]),
  });
}

function cadenceFromStatementLabel(label: string): FixedCostCadenceV1 | null {
  if (/\b(?:MONTHLY|MTHLY|PER\s+MONTH)\b/i.test(label)) return "monthly";
  if (/\b(?:ANNUAL|ANNUALLY|YEARLY|PER\s+YEAR)\b/i.test(label)) return "annual";
  if (/\b(?:PER\s+STATEMENT|STATEMENT\s+(?:FEE|CHARGE))\b/i.test(label)) return "statement_period";
  return null;
}

function relationshipFromLabel(label: string, cadence: FixedCostCadenceV1): FixedCostRelationshipV1 {
  if (/\bLOCATION\b/i.test(label)) return "fixed_location";
  if (/\bACCOUNT\b/i.test(label)) return "fixed_account";
  if (/\bSUBSCRIPTION\b/i.test(label)) return "fixed_subscription";
  if (cadence === "statement_period") return "fixed_statement_period";
  if (cadence === "annual") return "fixed_annual";
  return "fixed_monthly";
}

function isFixedLookingCandidate(
  label: string,
  row: CommercialDecompositionRowV1 | null,
  components: CanonicalPricingComponent[],
  cadence: FixedCostCadenceV1 | null,
): boolean {
  if (cadence) return true;
  if (isFixedLookingLabel(label)) return true;
  const mechanic = `${row?.mechanicAndPopulation.mechanic ?? ""} ${row?.mechanicAndPopulation.population ?? ""}`;
  if (/fixed|periodic|monthly|annual|statement.?period/i.test(mechanic)) return true;
  return components.some((component) => component.componentKind === "subscription" || component.componentKind === "minimum" || component.componentKind === "bundled");
}

function isFixedLookingLabel(label: string): boolean {
  return /\b(?:FIXED|STATEME\w*|APPLICATION|LOCATION|SUBSCRIPTION|ACCOUNT|MAINTENANCE|SERVICE|SECURITY|COMPLIANCE|REGULATORY|MIN(?:IMUM)?)\b/i.test(label);
}

function variableMechanics(
  row: CommercialDecompositionRowV1 | null,
  components: CanonicalPricingComponent[],
  occurrences: CanonicalEconomicsV2EconomicAnalysis["pricingAnalysis"]["foundation"]["sourceModel"]["occurrences"],
): { count: boolean; volume: boolean; minimum: boolean; mixed: boolean; hasOperands: boolean; requiresDecomposition: boolean } {
  const mechanic = row?.mechanicAndPopulation.mechanic?.toLowerCase() ?? "";
  const count = /per[_ .-]?item|authorization|transaction|batch|request|count/.test(mechanic) ||
    components.some((component) => component.basisType === "transaction_count" || component.componentKind === "per_item" || component.perItemAmount !== null) ||
    occurrences.some((occurrence) => occurrence.printedCount !== null && occurrence.printedRate !== null);
  const volume = /rate[_ .-]*times[_ .-]*volume|ad\s+valorem|percentage/.test(mechanic) ||
    components.some((component) => component.basisType === "volume" || component.componentKind === "percentage" || component.appliedBaseAmount !== null) ||
    occurrences.some((occurrence) => occurrence.volumeBasis !== null && occurrence.printedRate !== null);
  const minimum = /minimum/.test(mechanic) || /\bMIN(?:IMUM)?\b/i.test(row?.printedLabel ?? "") ||
    components.some((component) => component.componentKind === "minimum" || component.basisType === "minimum_floor" || component.formulaRelationship === "minimum_floor");
  const mixed = components.length > 1 || components.some((component) => component.componentKind === "bundled" ||
    component.formulaRelationship === "additive" || component.formulaRelationship === "mutually_exclusive_tier" ||
    (component.appliedCount !== null && component.appliedBaseAmount !== null));
  const hasOperands = components.some((component) => component.appliedCount !== null || component.appliedBaseAmount !== null ||
    component.perItemAmount !== null || component.minimumAmount !== null) ||
    occurrences.some((occurrence) => occurrence.printedCount !== null || occurrence.volumeBasis !== null || occurrence.perItemAmount !== null);
  return { count, volume, minimum, mixed, hasOperands, requiresDecomposition: mixed };
}

function separatedParticipantClaim(
  claim: { state: string; value: string | null },
  evidenceRefs: string[],
): SeparatedParticipantClaimV1 {
  return {
    state: claim.state === "supported" ? "SUPPORTED" : claim.state === "category_only" ? "CATEGORY_ONLY" : "UNKNOWN",
    value: claim.value,
    evidenceRefs: claim.state === "unresolved" ? [] : unique(evidenceRefs),
  };
}

function unknownDisposition(reason: string): UnknownDispositionV1 {
  return { state: "UNKNOWN", value: null, evidenceRefs: [], reason };
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

function admissionId(sourceDocumentRef: string, chargeRef: string, cadence: FixedCostCadenceV1): string {
  return `fixed_cost_sensitivity_${createHash("sha256").update(`${sourceDocumentRef}|${chargeRef}|${cadence}`).digest("hex").slice(0, 24)}`;
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
