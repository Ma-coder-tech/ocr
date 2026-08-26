import {
  buildCanonicalEconomicsV2EconomicAnalysis,
  type CanonicalEconomicChargeAdmission,
} from "./economicAnalysis.js";
import type { CanonicalEconomicsV2EconomicAnalysis } from "./economicTypes.js";
import type { CanonicalEconomicsV2PricingAnalysis } from "./pricingTypes.js";
import { fiservFeeLedgerOccurrences } from "./fiservAdapter.js";

const CAPABILITY_BOUND_LEDGER_ADMISSION_ID = "fiserv_runtime_fee_ledger_capability_v1";

/**
 * Carries only already-proven RB fee occurrence authority into RD. It can prove
 * that an amount contributes to statement processing cost, but it cannot prove
 * category, ownership, control, actionability, pricing architecture, or savings.
 */
export function buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(
  pricingAnalysis: CanonicalEconomicsV2PricingAnalysis,
): CanonicalEconomicsV2EconomicAnalysis {
  const foundation = pricingAnalysis.foundation;
  const feeTotal = capability(foundation, "fee_total");
  const feeDetail = capability(foundation, "fee_detail");
  const statementPeriod = capability(foundation, "statement_period");
  const admitted = foundation.templateCapability.identityStatus === "proven" &&
    foundation.templateCapability.admissionStatus === "admitted" &&
    foundation.templateCapability.admissionAuthority !== null;
  const feeTotalSupported = admitted && feeTotal?.status === "supported" && feeTotal.proofEvidenceRefs.length > 0 &&
    foundation.financialPopulations.totalStatementProcessingFees.status === "available" &&
    foundation.financialPopulations.totalStatementProcessingFees.provenanceStatus === "authoritative";

  if (!feeTotalSupported) return buildObservationalCanonicalEconomicsV2FromFiservPricing(pricingAnalysis);

  const detailSupported = feeDetail?.status === "supported" && feeDetail.proofEvidenceRefs.length > 0;
  const periodSupported = statementPeriod?.status === "supported" && statementPeriod.proofEvidenceRefs.length > 0 &&
    foundation.identity.statementPeriod !== null;
  const feeOccurrences = detailSupported && periodSupported
    ? fiservFeeLedgerOccurrences(foundation).filter((occurrence) =>
      occurrence.printedAmount !== null && occurrence.printedAmount.amountMinor !== 0 &&
      feeDetail.proofEvidenceRefs.includes(occurrence.evidenceRef),
    )
    : [];
  const charges = feeOccurrences.map((occurrence, index): CanonicalEconomicChargeAdmission => ({
    key: `capability_bound_charge_${index + 1}`,
    sourceOccurrenceRefs: [occurrence.id],
    contributingOccurrenceRef: occurrence.id,
    category: "unresolved_unclassified",
    categoryResolution: "unresolved",
    subtype: occurrence.semanticRole === "fee_credit" ? "fee_credit"
      : occurrence.semanticRole === "chargeback_fee" ? "chargeback_fee" : "unresolved",
    financialDirection: occurrence.semanticRole === "fee_credit" ? "credit" : "debit",
    uniqueEconomicOccurrenceProven: true,
    feeOccurrenceProven: true,
    directionProven: true,
    supportingDetailAdmission: {
      admissionId: `${CAPABILITY_BOUND_LEDGER_ADMISSION_ID}:${index + 1}`,
      evidenceRefs: [occurrence.evidenceRef],
      assertionBasis: "source_fact",
    },
    periodApplicability: "applicable",
    reconciliationRefs: occurrence.reconciliationRefs,
    derivabilityTier: "stated_on_statement",
    assertionBasis: "source_fact",
    confidence: "unavailable",
    limitations: [
      "This admitted fee occurrence contributes to statement processing cost only.",
      "Economic category, ownership, control, actionability, pricing architecture, benchmark position, and savings remain unresolved.",
    ],
  }));

  return buildCanonicalEconomicsV2EconomicAnalysis({
    pricingAnalysis,
    admissionProfile: {
      source: "runtime_capability",
      admissionId: CAPABILITY_BOUND_LEDGER_ADMISSION_ID,
      feeDetailCoverage: detailSupported && periodSupported ? "complete" : "incomplete",
      statementPeriodApplicabilityProven: periodSupported,
      evidenceRefs: unique([
        ...(feeTotal?.proofEvidenceRefs ?? []),
        ...(feeDetail?.proofEvidenceRefs ?? []),
        ...(statementPeriod?.proofEvidenceRefs ?? []),
      ]),
      limitations: [
        "Capability authority is claim-scoped to statement fee identity, amount, direction, coverage, and reconciliation.",
        "Unresolved economic semantics remain unresolved and cannot be inferred from source labels.",
      ],
    },
    charges,
    limitations: [
      "The capability-bound ledger proves statement-observed processing cost, not total acceptance cost.",
      "No fee category, participant, ownership, control, actionability, pricing, benchmark, or savings rule was introduced.",
    ],
  });
}

export function buildObservationalCanonicalEconomicsV2FromFiservPricing(
  pricingAnalysis: CanonicalEconomicsV2PricingAnalysis,
): CanonicalEconomicsV2EconomicAnalysis {
  const candidateOccurrences = pricingAnalysis.foundation.sourceModel.occurrences.filter((occurrence) =>
    occurrence.contributionRole !== "funding_only" && ["fee_charge", "fee_credit", "chargeback_fee"].includes(occurrence.semanticRole),
  );
  const charges = candidateOccurrences.map((occurrence, index): CanonicalEconomicChargeAdmission => ({
    key: `observed_charge_${index + 1}`,
    sourceOccurrenceRefs: [occurrence.id],
    contributingOccurrenceRef: occurrence.id,
    category: "unresolved_unclassified",
    categoryResolution: "unresolved",
    subtype: occurrence.semanticRole === "chargeback_fee"
      ? "chargeback_fee"
      : occurrence.semanticRole === "fee_credit"
        ? "fee_credit"
        : "unresolved",
    financialDirection: occurrence.semanticRole === "fee_credit" ? "credit" : "debit",
    uniqueEconomicOccurrenceProven: false,
    feeOccurrenceProven: false,
    directionProven: false,
    periodApplicability: "unproven",
    dependencyKeys: ["template_admission"],
    derivabilityTier: "requires_external_rule_or_schedule",
    assertionBasis: "source_fact",
    confidence: "unavailable",
    limitations: ["Fiserv evidence remains observational until a versioned source/template admission proves economic identity, direction, and coverage."],
  }));
  return buildCanonicalEconomicsV2EconomicAnalysis({
    pricingAnalysis,
    admissionProfile: {
      source: "observational",
      admissionId: "fiserv_economic_observation_v1",
      feeDetailCoverage: "unknown",
      statementPeriodApplicabilityProven: false,
      evidenceRefs: [],
      limitations: ["Customer-delivery scope is unchanged; this adapter does not admit a Fiserv template or expand processor support."],
    },
    dependencies: [{
      key: "template_admission",
      kind: "requires_versioned_source_template_admission",
      status: "required",
      limitations: ["A versioned admission must prove occurrence identity, fee direction, and economic coverage."],
    }],
    charges,
  });
}

function capability(
  foundation: CanonicalEconomicsV2PricingAnalysis["foundation"],
  id: "fee_total" | "fee_detail" | "statement_period",
) {
  return foundation.templateCapability.capabilities.find((item) => item.capability === id);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
