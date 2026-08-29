import type { MoneyAmount } from "../types.js";
import type { CanonicalEconomicCostBucketKind, CanonicalEconomicsV2EconomicAnalysis } from "./economicTypes.js";
import type { CanonicalSynthesisProofAdmission } from "./synthesisAnalysis.js";
import type {
  CanonicalSynthesisCalculation,
  CanonicalSynthesisCalculationKind,
  CanonicalSynthesisClaimKind,
  CanonicalSynthesisDependency,
  CanonicalSynthesisProof,
  CanonicalSynthesisSemanticClaim,
} from "./synthesisTypes.js";

export type CanonicalSynthesisSemanticClaimAdmission = {
  key: string;
  kind: CanonicalSynthesisClaimKind;
  subjectKey: string;
  claimCode: string;
  populationRefs?: string[];
  occurrenceRefs?: string[];
  chargeRefs?: string[];
  pricingComponentRefs?: string[];
  roleClaimRefs?: string[];
  participantRefs?: string[];
  costBucketKind?: CanonicalEconomicCostBucketKind | null;
  moneyValue?: MoneyAmount | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  scopeCode?: string | null;
  recurrenceBasis?: CanonicalSynthesisSemanticClaim["recurrenceBasis"];
  occurrencesPerYear?: number | null;
  proof: CanonicalSynthesisProofAdmission;
};

export type CanonicalSynthesisCalculationAdmission = {
  key: string;
  kind: CanonicalSynthesisCalculationKind;
  subjectKey: string;
  driverKeys?: string[];
  populationRefs?: string[];
  inputClaimKeys?: string[];
  inputAmounts?: MoneyAmount[];
  resultAmount?: MoneyAmount | null;
  lowerResultAmount?: MoneyAmount | null;
  upperResultAmount?: MoneyAmount | null;
  allocationShares?: string[];
  residualContribution?: CanonicalSynthesisCalculation["residualContribution"];
  annualizationFactor?: number;
  periodStart: string;
  periodEnd: string;
  proof: CanonicalSynthesisProofAdmission;
};

export type SynthesisSemanticRegistryContext = {
  analysis: CanonicalEconomicsV2EconomicAnalysis;
  subjectIdByKey: Map<string, string>;
  driverIdByKey: Map<string, string>;
  dependencyIdByKey: Map<string, string>;
  dependencies: CanonicalSynthesisDependency[];
  authorityAllowed: boolean;
  contractV1Active?: boolean;
};

export type SynthesisSemanticRegistry = {
  claims: CanonicalSynthesisSemanticClaim[];
  calculations: CanonicalSynthesisCalculation[];
  claimIdByKey: Map<string, string>;
  calculationIdByKey: Map<string, string>;
  claimById: Map<string, CanonicalSynthesisSemanticClaim>;
  calculationById: Map<string, CanonicalSynthesisCalculation>;
};

export function buildSynthesisSemanticRegistry(
  claimAdmissions: CanonicalSynthesisSemanticClaimAdmission[],
  calculationAdmissions: CanonicalSynthesisCalculationAdmission[],
  context: SynthesisSemanticRegistryContext,
): SynthesisSemanticRegistry {
  const foundation = context.analysis.pricingAnalysis.foundation;
  const evidenceIds = new Set(foundation.sourceModel.evidence.map((item) => item.id));
  const occurrenceIds = new Set(foundation.sourceModel.occurrences.map((item) => item.id));
  const factIds = new Set(Object.values(foundation.financialPopulations).map((item) => item.id));
  const populationIds = new Set(context.analysis.pricingAnalysis.pricingArchitecture.pricingPopulations.map((item) => item.id));
  const componentIds = new Set(context.analysis.pricingAnalysis.pricingArchitecture.observedPricingComponents.map((item) => item.id));
  const chargeIds = new Set(context.analysis.economicLayer.charges.map((item) => item.id));
  const roleIds = new Set(context.analysis.economicLayer.roleClaims.map((item) => item.id));
  const participantIds = new Set(context.analysis.economicLayer.participants.map((item) => item.id));
  const bucketByKind = new Map(context.analysis.economicLayer.costStack.buckets.map((item) => [item.kind, item]));
  const dependencyById = new Map(context.dependencies.map((item) => [item.id, item]));
  const statementPeriod = foundation.identity.statementPeriod;
  const claimIdByKey = new Map(claimAdmissions.map((item, index) => [item.key, stableId("synthesis_claim", index)]));

  const claims = claimAdmissions.map((item): CanonicalSynthesisSemanticClaim => {
    const proof = normalizeProof(item.proof, evidenceIds, context.dependencyIdByKey);
    const populationRefs = validRefs(item.populationRefs ?? [], new Set([...factIds, ...populationIds]));
    const occurrenceRefs = validRefs(item.occurrenceRefs ?? [], occurrenceIds);
    const chargeRefs = validRefs(item.chargeRefs ?? [], chargeIds);
    const pricingComponentRefs = validRefs(item.pricingComponentRefs ?? [], componentIds);
    const roleClaimRefs = validRefs(item.roleClaimRefs ?? [], roleIds);
    const participantRefs = validRefs(item.participantRefs ?? [], participantIds);
    const requestedRefsValid = populationRefs.length === (item.populationRefs ?? []).length &&
      occurrenceRefs.length === (item.occurrenceRefs ?? []).length && chargeRefs.length === (item.chargeRefs ?? []).length &&
      pricingComponentRefs.length === (item.pricingComponentRefs ?? []).length && roleClaimRefs.length === (item.roleClaimRefs ?? []).length &&
      participantRefs.length === (item.participantRefs ?? []).length;
    const periodValid = item.kind === "future_notice_term"
      ? Boolean(item.periodStart && item.periodEnd && statementPeriod && item.periodStart > statementPeriod.end)
      : Boolean(item.periodStart && item.periodEnd && statementPeriod && item.periodStart === statementPeriod.start && item.periodEnd === statementPeriod.end);
    const subjectRef = context.subjectIdByKey.get(item.subjectKey) ?? "";
    const semanticValid = claimSemanticsValid(item, {
      populationRefs, occurrenceRefs, chargeRefs, pricingComponentRefs, roleClaimRefs, participantRefs, bucketByKind,
      analysis: context.analysis, contractV1Active: context.contractV1Active === true,
    });
    const supported = context.authorityAllowed && requestedRefsValid && Boolean(subjectRef) && periodValid &&
      proofPositive(proof, dependencyById) && semanticValid;
    const conflicting = proof.dependencyRefs.some((ref) => dependencyById.get(ref)?.status === "conflicting");
    return {
      id: claimIdByKey.get(item.key)!, kind: item.kind, subjectRef, claimCode: item.claimCode,
      status: supported ? "supported" : conflicting ? "conflicting" : "unavailable",
      populationRefs, occurrenceRefs, chargeRefs, pricingComponentRefs, roleClaimRefs, participantRefs,
      costBucketKind: item.costBucketKind ?? null, moneyValue: item.moneyValue ?? null,
      periodStart: item.periodStart ?? null, periodEnd: item.periodEnd ?? null, scopeCode: item.scopeCode ?? null,
      recurrenceBasis: item.recurrenceBasis ?? null, occurrencesPerYear: item.occurrencesPerYear ?? null,
      ...proof,
      limitations: unique([
        ...proof.limitations,
        ...(!supported ? ["Claim-specific semantic admission requirements were not satisfied."] : []),
      ]),
    };
  });
  const claimById = new Map(claims.map((item) => [item.id, item]));
  const calculationIdByKey = new Map(calculationAdmissions.map((item, index) => [item.key, stableId("synthesis_calculation", index)]));
  const calculations = calculationAdmissions.map((item): CanonicalSynthesisCalculation => {
    const proof = normalizeProof(item.proof, evidenceIds, context.dependencyIdByKey);
    const driverRefs = unique((item.driverKeys ?? []).map((key) => context.driverIdByKey.get(key)).filter(isString));
    const populationRefs = validRefs(item.populationRefs ?? [], new Set([...factIds, ...populationIds]));
    const inputClaimRefs = unique((item.inputClaimKeys ?? []).map((key) => claimIdByKey.get(key)).filter(isString));
    const annualizationFactor = item.annualizationFactor ?? 1;
    const result: CanonicalSynthesisCalculation = {
      id: calculationIdByKey.get(item.key)!, kind: item.kind, status: "invalid",
      subjectRef: context.subjectIdByKey.get(item.subjectKey) ?? "", driverRefs, populationRefs, inputClaimRefs,
      inputAmounts: item.inputAmounts ?? [], resultAmount: item.resultAmount ?? null,
      lowerResultAmount: item.lowerResultAmount ?? null, upperResultAmount: item.upperResultAmount ?? null,
      allocationShares: item.allocationShares ?? [], residualContribution: item.residualContribution ?? null,
      annualizationFactor, periodStart: item.periodStart, periodEnd: item.periodEnd, ...proof,
    };
    const refsValid = driverRefs.length === (item.driverKeys ?? []).length && populationRefs.length === (item.populationRefs ?? []).length &&
      inputClaimRefs.length === (item.inputClaimKeys ?? []).length && inputClaimRefs.every((ref) => claimById.get(ref)?.status === "supported");
    const periodValid = Boolean(statementPeriod && item.periodStart === statementPeriod.start && item.periodEnd === statementPeriod.end);
    const valid = context.authorityAllowed && Boolean(result.subjectRef) && refsValid && periodValid && proofPositive(proof, dependencyById) &&
      isCanonicalSynthesisCalculationSemanticallyValid(result);
    return {
      ...result,
      status: valid ? "valid" : "invalid",
      limitations: unique([...proof.limitations, ...(!valid ? ["Deterministic synthesis calculation validation failed."] : [])]),
    };
  });
  return {
    claims, calculations, claimIdByKey, calculationIdByKey, claimById,
    calculationById: new Map(calculations.map((item) => [item.id, item])),
  };
}

function claimSemanticsValid(
  item: CanonicalSynthesisSemanticClaimAdmission,
  refs: {
    populationRefs: string[]; occurrenceRefs: string[]; chargeRefs: string[]; pricingComponentRefs: string[];
    roleClaimRefs: string[]; participantRefs: string[];
    bucketByKind: Map<CanonicalEconomicCostBucketKind, CanonicalEconomicsV2EconomicAnalysis["economicLayer"]["costStack"]["buckets"][number]>;
    analysis: CanonicalEconomicsV2EconomicAnalysis; contractV1Active: boolean;
  },
): boolean {
  const anchored = refs.occurrenceRefs.length + refs.chargeRefs.length + refs.pricingComponentRefs.length > 0;
  switch (item.kind) {
    case "driver_population_identity": return refs.populationRefs.length > 0 && anchored;
    case "driver_cost_pool_relationship": {
      const bucket = item.costBucketKind ? refs.bucketByKind.get(item.costBucketKind) : null;
      return Boolean(bucket && refs.chargeRefs.length > 0 && refs.chargeRefs.every((ref) => bucket!.chargeRefs.includes(ref)));
    }
    case "driver_share_basis": return refs.populationRefs.length > 0 && anchored;
    case "attribution_relationship": return anchored && refs.populationRefs.length > 0;
    case "counterfactual_target":
    case "counterfactual_alternative_condition":
    case "counterfactual_assumption": return refs.populationRefs.length > 0 && anchored;
    case "cadence_recurrence": return Boolean(
      item.recurrenceBasis && item.occurrencesPerYear && item.occurrencesPerYear > 0 &&
      ["multi_statement_supported", "merchant_document_supported", "public_documentation_verified"].includes(item.proof.evidenceClass),
    );
    case "merchant_change_right": {
      if (refs.participantRefs.length === 0 || !anchored) return false;
      const merchantBound = refs.participantRefs.every((ref) => refs.analysis.economicLayer.participants.find((p) => p.id === ref)?.roles.includes("merchant"));
      if (refs.contractV1Active) return merchantBound && ["merchant_document_supported", "public_documentation_verified",
        "approved_knowledge_supported"].includes(item.proof.evidenceClass);
      return refs.roleClaimRefs.length > 0 && merchantBound &&
        refs.roleClaimRefs.every((ref) => {
          const role = refs.analysis.economicLayer.roleClaims.find((claim) => claim.id === ref);
          return role?.participantRef && refs.participantRefs.includes(role.participantRef) && role.resolution === "proven" &&
            role.periodApplicability === "applicable" && ["negotiator_change_authority", "contractual_controller"].includes(role.dimension);
        });
    }
    case "merchant_operational_controllability": return refs.participantRefs.some((ref) =>
      refs.analysis.economicLayer.participants.find((p) => p.id === ref)?.roles.includes("merchant"),
    ) && anchored && ["merchant_document_supported", "multi_statement_supported", "public_documentation_verified"].includes(item.proof.evidenceClass);
    case "refund_population": return refs.populationRefs.length >= 2 && refs.occurrenceRefs.length > 0;
    case "refund_underlying_cost_return":
    case "refund_processor_pricing_return":
    case "refund_percentage_basis":
    case "refund_scope": return refs.populationRefs.length > 0 && anchored;
    case "refund_return_fee":
    case "refund_retained_fee": return refs.chargeRefs.length > 0 && anchored;
    case "amex_acceptance_mapping": return refs.populationRefs.length > 0 && refs.occurrenceRefs.length > 0 && Boolean(item.scopeCode);
    case "amex_margin_component": return refs.chargeRefs.length > 0 && refs.roleClaimRefs.length > 0 && refs.roleClaimRefs.every((ref) => {
      const role = refs.analysis.economicLayer.roleClaims.find((claim) => claim.id === ref);
      return Boolean(role && refs.chargeRefs.includes(role.chargeRef) && role.resolution === "proven" && role.periodApplicability === "applicable" &&
        ["economic_owner", "economic_beneficiary", "price_setter"].includes(role.dimension));
    });
    case "service_charge_observed": return refs.chargeRefs.length > 0 && anchored;
    case "service_usage": return refs.chargeRefs.length > 0 && refs.occurrenceRefs.length > 0 && item.scopeCode === "usage_observed";
    case "service_duplication": return refs.chargeRefs.length > 0 && refs.occurrenceRefs.length > 0 && item.scopeCode === "duplication_relationship_observed";
    case "pricing_program_flow": return refs.populationRefs.length > 0 && anchored && Boolean(item.moneyValue && item.scopeCode);
    case "off_statement_presence":
    case "off_statement_absence": return ["merchant_document_supported", "multi_statement_supported"].includes(item.proof.evidenceClass) && anchored;
    case "future_notice_term": return refs.occurrenceRefs.length > 0;
    case "operational_association": return refs.populationRefs.length > 0 && anchored;
    case "operational_causality": return refs.populationRefs.length > 0 && anchored &&
      ["deterministically_derived", "merchant_document_supported", "multi_statement_supported", "public_documentation_verified"].includes(item.proof.evidenceClass);
    case "risk_population_compatibility": return refs.populationRefs.length === 4 && Boolean(item.scopeCode);
    case "theme_contribution": return anchored || refs.populationRefs.length > 0 || refs.roleClaimRefs.length > 0;
  }
}

export function isCanonicalSynthesisCalculationSemanticallyValid(item: CanonicalSynthesisCalculation): boolean {
  if (item.annualizationFactor <= 0 || !Number.isInteger(item.annualizationFactor)) return false;
  if (item.kind === "exclusive_driver_allocation") {
    const shares = item.allocationShares.map(Number);
    return item.driverRefs.length >= 2 && shares.length === item.driverRefs.length && shares.every((value) => Number.isFinite(value) && value >= 0) &&
      Math.abs(shares.reduce((sum, value) => sum + value, 0) - 1) < 1e-9 && item.residualContribution === "none";
  }
  if (item.kind === "driver_share") {
    return item.allocationShares.length === 2 && item.allocationShares.every((value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1);
  }
  if (item.kind === "counterfactual_exact_delta") {
    if (item.inputAmounts.length !== 2 || !item.resultAmount || item.lowerResultAmount || item.upperResultAmount) return false;
    const [observed, alternative] = item.inputAmounts;
    return sameCurrency(item.inputAmounts) && item.resultAmount.currency === observed!.currency &&
      item.resultAmount.amountMinor === (observed!.amountMinor - alternative!.amountMinor) * item.annualizationFactor;
  }
  if (item.kind === "counterfactual_bounded_delta") {
    if (item.inputAmounts.length !== 3 || !item.lowerResultAmount || !item.upperResultAmount || item.resultAmount) return false;
    const [observed, alternativeLow, alternativeHigh] = item.inputAmounts;
    if (!sameCurrency(item.inputAmounts) || item.lowerResultAmount.currency !== observed!.currency || item.upperResultAmount.currency !== observed!.currency) return false;
    const deltas = [observed!.amountMinor - alternativeLow!.amountMinor, observed!.amountMinor - alternativeHigh!.amountMinor]
      .map((value) => value * item.annualizationFactor).sort((a, b) => a - b);
    return item.lowerResultAmount.amountMinor === deltas[0] && item.upperResultAmount.amountMinor === deltas[1];
  }
  if (item.kind === "pricing_program_net_burden") {
    if (item.inputAmounts.length !== 5 || !item.resultAmount || !sameCurrency(item.inputAmounts)) return false;
    if (item.inputAmounts.some((value) => value.amountMinor < 0)) return false;
    const [fees, consumerRevenue, merchantRetained, thirdPartyRetention, offsets] = item.inputAmounts;
    return item.resultAmount.currency === fees!.currency && consumerRevenue!.amountMinor === merchantRetained!.amountMinor + thirdPartyRetention!.amountMinor &&
      item.resultAmount.amountMinor === fees!.amountMinor - merchantRetained!.amountMinor - offsets!.amountMinor;
  }
  return false;
}

function normalizeProof(
  input: CanonicalSynthesisProofAdmission,
  evidenceIds: Set<string>,
  dependencyIdByKey: Map<string, string>,
): CanonicalSynthesisProof {
  return {
    derivabilityTier: input.derivabilityTier, evidenceClass: input.evidenceClass, assertionBasis: input.assertionBasis,
    confidence: input.confidence ?? "unavailable", evidenceRefs: validRefs(input.evidenceRefs ?? [], evidenceIds),
    dependencyRefs: unique((input.dependencyKeys ?? []).map((key) => dependencyIdByKey.get(key)).filter(isString)),
    effectiveFrom: input.effectiveFrom ?? null, effectiveTo: input.effectiveTo ?? null, limitations: unique(input.limitations ?? []),
  };
}

function proofPositive(proof: CanonicalSynthesisProof, dependencyById: Map<string, CanonicalSynthesisDependency>): boolean {
  const truthfulExternalRoute = proof.assertionBasis === "external_verified" && (
    proof.evidenceClass === "public_documentation_verified" && proof.derivabilityTier === "requires_external_rule_or_schedule"
    || proof.evidenceClass === "merchant_document_supported" && proof.derivabilityTier === "requires_merchant_pricing_document"
    || proof.evidenceClass === "multi_statement_supported" && proof.derivabilityTier === "requires_additional_statement_history"
    || proof.evidenceClass === "approved_knowledge_supported" && ["requires_external_rule_or_schedule",
      "requires_merchant_pricing_document", "requires_additional_statement_history", "requires_processor_explanation"].includes(proof.derivabilityTier));
  return ["source_fact", "deterministic_math", "rule_application", "external_verified"].includes(proof.assertionBasis) &&
    (["stated_on_statement", "deterministically_derivable_from_statement", "inferable_from_statement_with_qualification"].includes(proof.derivabilityTier)
      || truthfulExternalRoute) &&
    ["statement_confirmed", "deterministically_derived", "approved_knowledge_supported", "public_documentation_verified", "merchant_document_supported", "multi_statement_supported"].includes(proof.evidenceClass) &&
    proof.evidenceRefs.length > 0 && proof.dependencyRefs.every((ref) => dependencyById.get(ref)?.status === "satisfied_by_admitted_evidence");
}

function sameCurrency(values: MoneyAmount[]): boolean {
  return values.length > 0 && values.every((value) => value.currency === values[0]!.currency);
}

function validRefs(values: string[], allowed: Set<string>): string[] { return unique(values.filter((value) => allowed.has(value))); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function isString(value: string | undefined): value is string { return typeof value === "string"; }
function stableId(prefix: string, index: number): string { return `${prefix}_${String(index + 1).padStart(3, "0")}`; }
