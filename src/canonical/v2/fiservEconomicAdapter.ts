import {
  buildCanonicalEconomicsV2EconomicAnalysis,
  type CanonicalEconomicChargeAdmission,
} from "./economicAnalysis.js";
import type { CanonicalEconomicsV2EconomicAnalysis } from "./economicTypes.js";
import type { CanonicalEconomicsV2PricingAnalysis } from "./pricingTypes.js";

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
