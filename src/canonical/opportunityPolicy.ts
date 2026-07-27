import type {
  CanonicalEvidenceRecord,
  CanonicalFeeActionability,
  CanonicalFeeLedger,
  CanonicalFeeOwnership,
  CanonicalOpportunityCadence,
  CanonicalOpportunityComponent,
  CanonicalOpportunityEligibility,
  CanonicalOpportunityTarget,
  CanonicalOpportunityTargetProvenance,
  MoneyAmount,
} from "./types.js";

export const OPPORTUNITY_POLICY_VERSION = "canonical_opportunity_engine_v1" as const;
export const OPPORTUNITY_TARGET_POLICY_VERSION = "opportunity_target_policy_v1" as const;
export const OPPORTUNITY_CADENCE_POLICY_VERSION = "opportunity_cadence_policy_v1" as const;
export const OPPORTUNITY_BENCHMARK_POLICY_VERSION = "opportunity_benchmark_policy_v1" as const;
export const OPPORTUNITY_AI_BOUNDARY_POLICY_VERSION = "opportunity_ai_boundary_policy_v1" as const;

export const zeroMoney = (): MoneyAmount => ({ amountMinor: 0, currency: "USD" });

export function addMoney(amounts: Array<MoneyAmount | null | undefined>): MoneyAmount {
  const currencies = new Set(amounts.filter((amount): amount is MoneyAmount => Boolean(amount)).map((amount) => amount.currency));
  if (currencies.size > 1) {
    throw new Error("Package E does not permit implicit currency conversion.");
  }
  return {
    amountMinor: amounts.reduce((sum, amount) => sum + (amount?.amountMinor ?? 0), 0),
    currency: [...currencies][0] ?? "USD",
  };
}

export function absMoney(amount: MoneyAmount | null | undefined): MoneyAmount | null {
  if (!amount) return null;
  return { ...amount, amountMinor: Math.abs(amount.amountMinor) };
}

export const noTarget = (reason: string): CanonicalOpportunityTarget => ({
  type: "none",
  reason,
  aiSourced: false,
});

export const noTargetProvenance = (limitations: string[] = []): CanonicalOpportunityTargetProvenance => ({
  sourceType: "none",
  referenceId: null,
  version: null,
  policyOwner: null,
  reviewer: null,
  effectiveFrom: null,
  effectiveTo: null,
  applicableProcessor: null,
  applicableBusinessType: null,
  applicableChannel: null,
  applicableCardEnvironment: null,
  methodology: null,
  limitations,
  opportunityApproved: false,
  authoritativeForDeterministic: false,
  approvedForEstimate: false,
  evidenceRefs: [],
  aiSourced: false,
});

export function stableOpportunityId(parts: Array<string | number | null | undefined>): string {
  const body = parts
    .map((part) => String(part ?? "none").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""))
    .filter(Boolean)
    .join("_")
    .slice(0, 96);
  return body || "opportunity_component";
}

export function stableAggregationKey(feeRowIds: string[], kind: string, targetRef: string | null, formulaCode: string, cadenceValue: string): string {
  return stableOpportunityId(["agg", kind, [...feeRowIds].sort().join("_"), targetRef, formulaCode, cadenceValue]);
}

export function cadenceForFeeRow(input: {
  feeRowId: string;
  ledger: CanonicalFeeLedger;
  statementPeriodVerified: boolean;
  evidence: CanonicalEvidenceRecord[];
}): CanonicalOpportunityCadence {
  const row = input.ledger.rows.find((item) => item.id === input.feeRowId);
  const evidenceRefs = rowEvidenceRefs(input.feeRowId, input.ledger);
  const linkedToFeeRow = evidenceRefs.length > 0;
  const label = `${row?.selectedLabel ?? ""} ${evidenceRefs.map((ref) => input.evidence.find((item) => item.id === ref)?.customerSafe.excerpt ?? "").join(" ")}`;

  if (input.statementPeriodVerified && linkedToFeeRow && /\bmonthly\b|\bper\s+month\b|\/\s*mo\b/i.test(label)) {
    return {
      value: "monthly",
      proven: true,
      annualizationAllowed: true,
      frequencyPerYear: 12,
      proof: "fee_label_explicit",
      evidenceRefs,
      reason: "Printed fee label establishes monthly cadence and is linked to a verified statement period.",
      aiSourced: false,
    };
  }

  if (input.statementPeriodVerified && linkedToFeeRow && /\bannual\b|\byearly\b|per\s+year\b/i.test(label)) {
    return {
      value: "annual",
      proven: true,
      annualizationAllowed: true,
      frequencyPerYear: 1,
      proof: "fee_label_explicit",
      evidenceRefs,
      reason: "Printed fee label establishes annual cadence and is linked to a verified statement period.",
      aiSourced: false,
    };
  }

  if (input.statementPeriodVerified && linkedToFeeRow && /\bper\s+statement\b|\bstatement\s+fee\b/i.test(label)) {
    return {
      value: "statement_frequency",
      proven: true,
      annualizationAllowed: false,
      frequencyPerYear: null,
      proof: "fee_label_explicit",
      evidenceRefs,
      reason: "Printed label establishes statement-frequency cadence, but statement frequency is not proven monthly.",
      aiSourced: false,
    };
  }

  return {
    value: "unknown",
    proven: false,
    annualizationAllowed: false,
    frequencyPerYear: null,
    proof: "not_proven",
    evidenceRefs,
    reason: "Cadence is not proven by fee-specific label, contract, processor documentation, statement notice, or multi-statement evidence.",
    aiSourced: false,
  };
}

export function rowEvidenceRefs(feeRowId: string, ledger: CanonicalFeeLedger): string[] {
  const row = ledger.rows.find((item) => item.id === feeRowId);
  if (!row) return [];
  const occurrenceRefs = new Set(row.sourceOccurrenceIds);
  return ledger.sourceOccurrences.filter((occurrence) => occurrenceRefs.has(occurrence.id)).map((occurrence) => occurrence.evidenceRef);
}

export function isProtectedOwner(owner: string): boolean {
  return owner === "network" || owner === "card_brand" || owner === "issuer_or_interchange" || owner === "tax_or_government" || owner === "unknown";
}

export function defaultEligibility(input: {
  ownership: CanonicalFeeOwnership;
  actionabilityCeiling: CanonicalFeeActionability;
  hasObservedAmount: boolean;
}): { eligibility: CanonicalOpportunityEligibility; reasonCodes: string[] } {
  if (!input.hasObservedAmount) return { eligibility: "excluded", reasonCodes: ["missing_observed_amount"] };
  if (isProtectedOwner(input.ownership.economicBeneficiary)) return { eligibility: "excluded", reasonCodes: ["protected_or_unknown_owner"] };
  if (input.actionabilityCeiling !== "potentially_actionable") return { eligibility: "verification_only", reasonCodes: ["package_d_not_potentially_actionable"] };
  return { eligibility: "verification_only", reasonCodes: ["missing_approved_target_or_calculation"] };
}

export function targetSupportsDeterministic(provenance: CanonicalOpportunityTargetProvenance, target: CanonicalOpportunityTarget): boolean {
  if (target.type === "none") return false;
  if (target.type === "zero_removal" && target.proofEvidenceRefs.length === 0) return false;
  const authoritativeSources: Array<CanonicalOpportunityTargetProvenance["sourceType"]> = [
    "merchant_contract",
    "processor_pricing_schedule",
    "written_processor_confirmation",
    "statement_notice",
    "authoritative_network_government_regulatory",
  ];
  return authoritativeSources.includes(provenance.sourceType) && provenance.authoritativeForDeterministic && provenance.evidenceRefs.length > 0 && !provenance.aiSourced;
}

export function targetSupportsApprovedEstimate(provenance: CanonicalOpportunityTargetProvenance, target: CanonicalOpportunityTarget): boolean {
  if (target.type === "none") return false;
  if (provenance.sourceType === "benchmark_registry" && !provenance.opportunityApproved) return false;
  return provenance.opportunityApproved && provenance.approvedForEstimate && Boolean(provenance.referenceId && provenance.version) && !provenance.aiSourced;
}

export function componentAnnualAmount(component: CanonicalOpportunityComponent): MoneyAmount | null {
  if (component.inclusionStatus !== "included") return null;
  if (component.eligibility !== "deterministic" && component.eligibility !== "approved_estimate") return null;
  if (!component.cadence.annualizationAllowed) return null;
  return component.calculation.result;
}
