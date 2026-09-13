import { createHash } from "node:crypto";

import type { CommercialDecompositionContractV1, CommercialDecompositionRowV1 } from "./commercialDecompositionContractV1.js";
import { assessCanonicalExactCountRateArithmetic, type CanonicalExactCountRateArithmeticResult } from "./exactSourceArithmeticBridge.js";
import type { CanonicalStatementAnalysis, MoneyAmount } from "./types.js";
import type { CanonicalEconomicCharge, CanonicalEconomicsV2EconomicAnalysis } from "./v2/economicTypes.js";

export const CLAIM_SCOPED_COUNT_DRIVEN_COST_SENSITIVITY_ADMISSION_V1 =
  "claim_scoped_count_driven_cost_sensitivity_admission_2026_09_13_v1" as const;

export type CountDrivenSensitivityBlockerV1 =
  | "RD_CHARGE_CARDINALITY_NOT_ONE"
  | "SOURCE_OCCURRENCE_NOT_UNIQUE"
  | "COMMERCIAL_ROW_NOT_UNIQUELY_LINKED"
  | "EVENT_POPULATION_NOT_GOVERNED_EXPLICIT"
  | "COUNT_NOT_KNOWN"
  | "PER_EVENT_RATE_NOT_KNOWN"
  | "COUNT_RATE_EVIDENCE_CONFLICT"
  | "COUNT_TIMES_RATE_DOES_NOT_REPRODUCE_CHARGE"
  | "MERCHANT_FACING_PROVIDER_CONTROL_NOT_SUPPORTED"
  | "SHARED_BUNDLED_OR_UPPER_BOUND"
  | "DUPLICATE_REPEAT_OR_SUMMARY_AMBIGUITY"
  | "EVENT_POPULATION_NOT_PRESERVED_EXACTLY";

export type CountDrivenSensitivityChargeBindingV1 = {
  rdEconomicChargeRef: string;
  rdSourceOccurrenceRefs: string[];
  commercialFeeRowRef: string | null;
  pricingPopulationRefs: string[];
  pricingComponentRefs: string[];
  amount: MoneyAmount;
  financialDirection: "debit" | "credit";
};

export type CountDrivenSensitivityAdmissionRecordV1 = {
  admissionId: string;
  admissionBasis: "EXISTING_CURRENT_SENSITIVITY" | "CLAIM_SCOPED_EXTENSION";
  sourceDocumentRef: string;
  statementPeriod: { start: string; end: string } | null;
  rdChargeRef: string;
  sourceOccurrenceRef: string;
  commercialFeeRowRef: string;
  referencedChargedAmountMinor: number;
  currency: "USD";
  eventPopulation: {
    mechanic: string;
    identity: string;
    preservationStatus: "EXACT_GOVERNED_VALUE_PRESERVED";
    evidenceRefs: string[];
  };
  count: number;
  perEventRateDollars: string;
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

export type CountDrivenSensitivityExcludedCandidateV1 = {
  sourceDocumentRef: string;
  rdChargeRef: string;
  sourceOccurrenceRefs: string[];
  commercialFeeRowRef: string | null;
  printedLabel: string | null;
  referencedChargedAmountMinor: number;
  eventMechanic: string | null;
  eventPopulationIdentity: string | null;
  observedCount: number | null;
  observedPerEventRateDollars: string | null;
  arithmetic: CanonicalExactCountRateArithmeticResult;
  blockers: CountDrivenSensitivityBlockerV1[];
  evidenceRefs: string[];
};

export type ClaimScopedCountDrivenCostSensitivityAdmissionV1 = {
  schemaVersion: typeof CLAIM_SCOPED_COUNT_DRIVEN_COST_SENSITIVITY_ADMISSION_V1;
  mode: "internal_offline";
  authority: "derived_claim_scoped_sensitivity_reference_only";
  sourceDocumentRef: string;
  statementPeriod: { start: string; end: string } | null;
  status: "ADMITTED" | "WITHHELD" | "NOT_APPLICABLE";
  admissions: CountDrivenSensitivityAdmissionRecordV1[];
  excludedCandidates: CountDrivenSensitivityExcludedCandidateV1[];
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
    sensitivityCreatesAdditiveDollars: false;
    populationSubstitutionAllowed: false;
    feeNameInferenceAllowed: false;
    causalInferenceAllowed: false;
    merchantFaultInferenceAllowed: false;
    avoidabilityInferenceAllowed: false;
    negotiabilityInferenceAllowed: false;
    comparisonInputCount: 0;
    savingsOutputCount: 0;
    annualizationOutputCount: 0;
    aiOrWebOperationCount: 0;
    newKnowledgeAdmissionCount: 0;
    customerRoutingAllowed: false;
  };
  limitations: string[];
};

type Operand = {
  count: number;
  rate: string;
  sourceUnit: string | null;
  evidenceRefs: string[];
};

const COUNT_EVENT_MECHANICS = new Set([
  "authorization_events",
  "network_authorization_events",
  "clearing_or_data_records",
  "settled_transactions",
  "avs_requests",
  "batches",
  "settlement_batches",
  "refund_records",
  "dispute_or_exception_events",
  "per_item",
]);

export function buildClaimScopedCountDrivenCostSensitivityAdmissionV1(input: {
  economic: CanonicalEconomicsV2EconomicAnalysis;
  commercialDecomposition: CommercialDecompositionContractV1;
  chargedCostItems: CountDrivenSensitivityChargeBindingV1[];
  existingCountDrivenChargeRefs: string[];
  canonicalAnalysis?: CanonicalStatementAnalysis | null;
}): ClaimScopedCountDrivenCostSensitivityAdmissionV1 {
  const foundation = input.economic.pricingAnalysis.foundation;
  const sourceDocumentRef = foundation.identity.sourceDocumentRef;
  const supportedFiservFamily = /fiserv|first.?data/i.test([
    foundation.identity.processorFamily,
    input.commercialDecomposition.statement.processorFamily,
  ].filter(Boolean).join(" "));
  const rowsById = groupBy(input.commercialDecomposition.rows, (row) => row.feeRowId);
  const occurrencesById = new Map(foundation.sourceModel.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const chargesById = groupBy(input.economic.economicLayer.charges.filter(contributes), (charge) => charge.id);
  const itemCountByCharge = counts(input.chargedCostItems.map((item) => item.rdEconomicChargeRef));
  const occurrenceUseCount = counts(input.chargedCostItems.flatMap((item) => item.rdSourceOccurrenceRefs));
  const feeRowUseCount = counts(input.chargedCostItems.flatMap((item) => item.commercialFeeRowRef ? [item.commercialFeeRowRef] : []));
  const representationGroups = foundation.sourceModel.representationGroups;
  const canonicalSourceMatches = !input.canonicalAnalysis || input.canonicalAnalysis.identity.sourceDocumentRef === sourceDocumentRef;
  const sourceArithmetic = new Map((canonicalSourceMatches ? input.canonicalAnalysis?.feeLedger.partitionSourceProvenance.rowArithmetic ?? [] : [])
    .map((row) => [row.feeRowId, row]));
  const components = new Map(foundationPricingComponents(input.economic).map((component) => [component.id, component]));
  const existing = new Set(input.existingCountDrivenChargeRefs);
  const admissions: CountDrivenSensitivityAdmissionRecordV1[] = [];
  const excludedCandidates: CountDrivenSensitivityExcludedCandidateV1[] = [];

  if (supportedFiservFamily) for (const item of input.chargedCostItems) {
    if (item.financialDirection !== "debit" || item.amount.amountMinor <= 0) continue;
    const rowMatches = item.commercialFeeRowRef ? rowsById.get(item.commercialFeeRowRef) ?? [] : [];
    const row = rowMatches.length === 1 ? rowMatches[0]! : null;
    const occurrences = item.rdSourceOccurrenceRefs.map((ref) => occurrencesById.get(ref)).filter(nonNullable);
    const looksCountCandidate = Boolean(
      occurrences.some((occurrence) => occurrence.printedCount !== null) ||
      (row?.mechanicAndPopulation.mechanic && COUNT_EVENT_MECHANICS.has(row.mechanicAndPopulation.mechanic)) ||
      existing.has(item.rdEconomicChargeRef),
    );
    if (!looksCountCandidate) continue;

    const charges = chargesById.get(item.rdEconomicChargeRef) ?? [];
    const charge = charges.length === 1 ? charges[0]! : null;
    const operandEvidence = collectOperands({ item, row, occurrences, sourceArithmetic, components });
    const operands = operandEvidence.operands;
    const distinctOperands = uniqueBy(operands, (operand) => `${operand.count}|${operand.rate}`);
    const distinctCounts = [...new Set(operandEvidence.counts)];
    const distinctRates = [...new Set(operandEvidence.rates)];
    const operand = distinctOperands.length === 1
      ? distinctOperands[0]!
      : distinctOperands.length === 0 && distinctCounts.length === 1 && distinctRates.length === 1
        ? { count: distinctCounts[0]!, rate: distinctRates[0]!, sourceUnit: null, evidenceRefs: [] }
        : null;
    const arithmetic = assessCanonicalExactCountRateArithmetic({
      count: operand?.count ?? null,
      perEventRateDollars: operand?.rate ?? null,
      chargedAmountMinor: item.amount.amountMinor,
    });
    const blockers: CountDrivenSensitivityBlockerV1[] = [];
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
    if (!row || row.mechanicAndPopulation.mechanicState !== "supported" || row.mechanicAndPopulation.populationState !== "supported" ||
        !row.mechanicAndPopulation.mechanic || !row.mechanicAndPopulation.population || !COUNT_EVENT_MECHANICS.has(row.mechanicAndPopulation.mechanic)) {
      blockers.push("EVENT_POPULATION_NOT_GOVERNED_EXPLICIT");
    }
    if (distinctCounts.length !== 1 || !Number.isSafeInteger(distinctCounts[0]) || distinctCounts[0]! < 0) blockers.push("COUNT_NOT_KNOWN");
    if (distinctRates.length !== 1 || !distinctRates[0]) blockers.push("PER_EVENT_RATE_NOT_KNOWN");
    if (distinctOperands.length > 1 || distinctCounts.length > 1 || distinctRates.length > 1) blockers.push("COUNT_RATE_EVIDENCE_CONFLICT");
    if (arithmetic.status !== "reproduces") blockers.push("COUNT_TIMES_RATE_DOES_NOT_REPRODUCE_CHARGE");
    if (!row || row.participants.merchantFacingPriceController.state !== "supported" ||
        row.participants.merchantFacingPriceController.value !== "acquiring_side_program") blockers.push("MERCHANT_FACING_PROVIDER_CONTROL_NOT_SUPPORTED");
    if (row && isSharedBundledOrUpperBound(row)) blockers.push("SHARED_BUNDLED_OR_UPPER_BOUND");
    if (hasRepresentationAmbiguity(charge, occurrences[0] ?? null, representationGroups)) blockers.push("DUPLICATE_REPEAT_OR_SUMMARY_AMBIGUITY");
    if (!row || !operand || !populationPreserved(row, operand)) blockers.push("EVENT_POPULATION_NOT_PRESERVED_EXACTLY");

    const evidenceRefs = unique([
      ...item.rdSourceOccurrenceRefs.map((ref) => occurrencesById.get(ref)?.evidenceRef ?? null),
      ...(row?.evidenceRefs ?? []),
      ...operands.flatMap((candidate) => candidate.evidenceRefs),
      ...(charge?.evidenceRefs ?? []),
    ]);
    if (blockers.length > 0 || !row || !charge || !operand || arithmetic.status !== "reproduces") {
      excludedCandidates.push({
        sourceDocumentRef,
        rdChargeRef: item.rdEconomicChargeRef,
        sourceOccurrenceRefs: [...item.rdSourceOccurrenceRefs],
        commercialFeeRowRef: item.commercialFeeRowRef,
        printedLabel: row?.printedLabel ?? null,
        referencedChargedAmountMinor: item.amount.amountMinor,
        eventMechanic: row?.mechanicAndPopulation.mechanic ?? null,
        eventPopulationIdentity: row?.mechanicAndPopulation.population ?? null,
        observedCount: distinctCounts.length === 1 ? distinctCounts[0]! : null,
        observedPerEventRateDollars: distinctRates.length === 1 ? distinctRates[0]! : null,
        arithmetic,
        blockers: unique(blockers),
        evidenceRefs,
      });
      continue;
    }
    admissions.push({
      admissionId: admissionId(sourceDocumentRef, item.rdEconomicChargeRef, row.mechanicAndPopulation.population!),
      admissionBasis: existing.has(item.rdEconomicChargeRef) ? "EXISTING_CURRENT_SENSITIVITY" : "CLAIM_SCOPED_EXTENSION",
      sourceDocumentRef,
      statementPeriod: foundation.identity.statementPeriod ? { ...foundation.identity.statementPeriod } : null,
      rdChargeRef: item.rdEconomicChargeRef,
      sourceOccurrenceRef: item.rdSourceOccurrenceRefs[0]!,
      commercialFeeRowRef: row.feeRowId,
      referencedChargedAmountMinor: item.amount.amountMinor,
      currency: "USD",
      eventPopulation: {
        mechanic: row.mechanicAndPopulation.mechanic!,
        identity: row.mechanicAndPopulation.population!,
        preservationStatus: "EXACT_GOVERNED_VALUE_PRESERVED",
        evidenceRefs: unique(row.evidenceRefs),
      },
      count: operand.count,
      perEventRateDollars: operand.rate,
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
        "This record describes only the observed charge's dependence on the preserved billed event population.",
        "It references an existing RD charge and contributes no additive dollars.",
        "It does not establish excessive usage, causality, merchant fault, avoidability, negotiability, savings, or alternative-provider advantage.",
      ],
    });
  }

  const uniqueRefs = new Set(admissions.map((record) => record.rdChargeRef));
  if (uniqueRefs.size !== admissions.length) throw new Error("COUNT_SENSITIVITY_DUPLICATE_RD_REFERENCE");
  const prior = admissions.filter((record) => record.admissionBasis === "EXISTING_CURRENT_SENSITIVITY");
  const added = admissions.filter((record) => record.admissionBasis === "CLAIM_SCOPED_EXTENSION");
  return deepFreeze({
    schemaVersion: CLAIM_SCOPED_COUNT_DRIVEN_COST_SENSITIVITY_ADMISSION_V1,
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
      sensitivityCreatesAdditiveDollars: false,
      populationSubstitutionAllowed: false,
      feeNameInferenceAllowed: false,
      causalInferenceAllowed: false,
      merchantFaultInferenceAllowed: false,
      avoidabilityInferenceAllowed: false,
      negotiabilityInferenceAllowed: false,
      comparisonInputCount: 0,
      savingsOutputCount: 0,
      annualizationOutputCount: 0,
      aiOrWebOperationCount: 0,
      newKnowledgeAdmissionCount: 0,
      customerRoutingAllowed: false,
    },
    limitations: unique([
      "Admission is claim-scoped to count-driven current-cost sensitivity and cannot mutate Canonical Economics V2, RD, or the commercial cost-stack category.",
      "Every admitted population retains the exact governed population identity; no generic transaction substitution is permitted.",
      !supportedFiservFamily ? "This package applies only to supported Fiserv-family statements." : null,
      excludedCandidates.length > 0 ? "Candidate charges that fail one or more predicates remain excluded with explicit blockers." : null,
    ]),
  });
}

function collectOperands(input: {
  item: CountDrivenSensitivityChargeBindingV1;
  row: CommercialDecompositionRowV1 | null;
  occurrences: CanonicalEconomicsV2EconomicAnalysis["pricingAnalysis"]["foundation"]["sourceModel"]["occurrences"];
  sourceArithmetic: Map<string, CanonicalStatementAnalysis["feeLedger"]["partitionSourceProvenance"]["rowArithmetic"][number]>;
  components: Map<string, ReturnType<typeof foundationPricingComponents>[number]>;
}): { operands: Operand[]; counts: number[]; rates: string[] } {
  const operands: Operand[] = [];
  const observedCounts: number[] = [];
  const observedRates: string[] = [];
  for (const occurrence of input.occurrences) {
    const rate = occurrence.printedRate ?? (occurrence.perItemAmount ? minorToDollars(occurrence.perItemAmount.amountMinor) : null);
    if (occurrence.printedCount !== null) observedCounts.push(occurrence.printedCount);
    if (rate !== null) observedRates.push(rate);
    if (occurrence.printedCount !== null && rate !== null) operands.push({
      count: occurrence.printedCount,
      rate,
      sourceUnit: null,
      evidenceRefs: [occurrence.evidenceRef],
    });
  }
  const arithmetic = input.item.commercialFeeRowRef ? input.sourceArithmetic.get(input.item.commercialFeeRowRef) : null;
  if (arithmetic?.formulaBasis === "per_item" && arithmetic.itemCount !== null && arithmetic.printedPerItemRate?.normalizedFractionalRate) {
    observedCounts.push(arithmetic.itemCount);
    observedRates.push(arithmetic.printedPerItemRate.normalizedFractionalRate);
    operands.push({
      count: arithmetic.itemCount,
      rate: arithmetic.printedPerItemRate.normalizedFractionalRate,
      sourceUnit: "per_item",
      evidenceRefs: unique(Object.values(arithmetic.fieldEvidenceRefs).flat()),
    });
  }
  if (arithmetic?.formulaBasis === "source_units_times_per_unit" && arithmetic.sourceUnitBasis &&
      arithmetic.printedPerUnitRate?.normalizedFractionalRate) {
    const count = exactInteger(arithmetic.sourceUnitBasis);
    if (count !== null) observedCounts.push(count);
    observedRates.push(arithmetic.printedPerUnitRate.normalizedFractionalRate);
    if (count !== null) operands.push({
      count,
      rate: arithmetic.printedPerUnitRate.normalizedFractionalRate,
      sourceUnit: arithmetic.sourceUnit,
      evidenceRefs: unique(Object.values(arithmetic.fieldEvidenceRefs).flat()),
    });
  }
  for (const ref of input.item.pricingComponentRefs) {
    const component = input.components.get(ref);
    if (component?.basisType === "transaction_count") {
      if (component.appliedCount !== null) observedCounts.push(component.appliedCount);
      if (component.perItemAmount) observedRates.push(minorToDollars(component.perItemAmount.amountMinor));
      if (component.appliedCount !== null && component.perItemAmount) operands.push({
        count: component.appliedCount,
        rate: minorToDollars(component.perItemAmount.amountMinor),
        sourceUnit: "per_item",
        evidenceRefs: [...component.evidenceRefs],
      });
    }
  }
  return { operands, counts: observedCounts, rates: observedRates };
}

function populationPreserved(row: CommercialDecompositionRowV1, operand: Operand): boolean {
  const mechanic = row.mechanicAndPopulation.mechanic;
  const population = row.mechanicAndPopulation.population;
  if (!mechanic || !population) return false;
  if (!operand.sourceUnit || operand.sourceUnit === "per_item") return true;
  if (operand.sourceUnit === mechanic) return true;
  return operand.sourceUnit === "batches" && (mechanic === "batches" || mechanic === "settlement_batches");
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

function isSharedBundledOrUpperBound(row: CommercialDecompositionRowV1): boolean {
  return row.commercialDollarCategory === "SHARED_BUNDLED_OR_UNRESOLVED" ||
    row.commercialDollarAttribution.kind === "SHARED_BUNDLED_OR_UNRESOLVED" ||
    row.commercialDollarAttribution.kind === "PROVIDER_CONTROLLED_PRICE_UPPER_BOUND_ONLY" ||
    (row.claimPermissions.providerControlledUpperBoundAllowed && !row.claimPermissions.exactProviderControlledDollarsAllowed);
}

function foundationPricingComponents(economic: CanonicalEconomicsV2EconomicAnalysis) {
  return economic.pricingAnalysis.pricingArchitecture.observedPricingComponents;
}

function admissionId(sourceDocumentRef: string, chargeRef: string, population: string): string {
  return `count_sensitivity_${createHash("sha256").update(`${sourceDocumentRef}|${chargeRef}|${population}`).digest("hex").slice(0, 24)}`;
}

function exactInteger(value: string): number | null {
  if (!/^\d+(?:\.0+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function minorToDollars(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
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

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const candidate = key(value);
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });
}

function nonNullable<T>(value: T | null | undefined): value is T { return value !== null && value !== undefined; }
function unique<T extends string>(values: Array<T | null | undefined>): T[] {
  return [...new Set(values.filter((value): value is T => Boolean(value)))].sort();
}
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
