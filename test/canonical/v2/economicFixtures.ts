import {
  buildCanonicalEconomicsV2EconomicAnalysis,
  type BuildCanonicalEconomicsV2EconomicInput,
  type CanonicalEconomicChargeAdmission,
  type CanonicalEconomicsV2EconomicAnalysis,
  type CanonicalEconomicsV2PricingAnalysis,
} from "../../../src/canonical/v2/index.js";
import { buildPricing, percentagePopulationInput, pricingFoundation } from "./pricingFixtures.js";
import type { V2SyntheticStatementOptions } from "./fixtures.js";

export function economicPricing(options: V2SyntheticStatementOptions = {}): CanonicalEconomicsV2PricingAnalysis {
  const foundation = pricingFoundation(options);
  const inputs = percentagePopulationInput(foundation, [{
    key: "active_processing",
    dimensionValue: "admitted_synthetic_scope",
    rate: "0.02",
    underlying: "bundled_into_merchant_price",
  }]);
  return buildPricing({ foundation, ...inputs });
}

export function approvedEconomicInput(
  pricingAnalysis = economicPricing(),
  options: { feeDetailCoverage?: "complete" | "incomplete" | "unknown"; omitStatementFee?: boolean } = {},
): BuildCanonicalEconomicsV2EconomicInput {
  const foundation = pricingAnalysis.foundation;
  const feeOccurrences = foundation.sourceModel.occurrences.filter((occurrence) =>
    occurrence.pageNumber === 3 && occurrence.contributionRole !== "funding_only" &&
    ["fee_charge", "fee_credit", "chargeback_fee"].includes(occurrence.semanticRole),
  );
  const chargeback = feeOccurrences.find((occurrence) => occurrence.semanticRole === "chargeback_fee")!;
  const statementFee = feeOccurrences.find((occurrence) => occurrence.semanticRole === "fee_charge")!;
  const credit = feeOccurrences.find((occurrence) => occurrence.semanticRole === "fee_credit")!;
  const charges: CanonicalEconomicChargeAdmission[] = [
    admittedCharge("chargeback_fee", chargeback.id, "debit", "operational_exception_penalty_fee", "chargeback_fee"),
    ...(!options.omitStatementFee
      ? [admittedCharge("statement_fee", statementFee.id, "debit", "processor_service_administrative_cost", "service_admin")]
      : []),
    admittedCharge("fee_credit", credit.id, "credit", "processor_service_administrative_cost", "fee_credit"),
  ];
  for (const charge of charges) {
    const occurrence = foundation.sourceModel.occurrences.find((item) => item.id === charge.contributingOccurrenceRef)!;
    charge.supportingDetailAdmission!.evidenceRefs = [occurrence.evidenceRef];
  }
  if (!options.omitStatementFee) charges.find((charge) => charge.key === "statement_fee")!.roleClaimKeys = ["collector", "billing_intermediary", "beneficiary"];
  const evidenceRef = statementFee.evidenceRef;
  return {
    pricingAnalysis,
    admissionProfile: {
      source: "approved_synthetic",
      admissionId: "approved_synthetic_economic_v1",
      feeDetailCoverage: options.feeDetailCoverage ?? "complete",
      statementPeriodApplicabilityProven: true,
      evidenceRefs: [evidenceRef],
      limitations: [],
    },
    participants: [{
      key: "processor",
      identity: "Synthetic private processor identity",
      identityStatus: "proven",
      roles: ["processor_platform"],
      roleResolution: "proven",
      evidenceRefs: [evidenceRef],
      derivabilityTier: "stated_on_statement",
      assertionBasis: "source_fact",
      confidence: "unavailable",
    }],
    dependencies: [{
      key: "merchant_pricing_document",
      kind: "requires_merchant_pricing_document",
      status: "required",
      claimKeys: ["beneficiary"],
      limitations: ["Beneficiary remains unresolved without admitted merchant pricing evidence."],
    }],
    roleClaims: options.omitStatementFee ? [] : [
      {
        key: "collector",
        chargeKey: "statement_fee",
        dimension: "collector",
        participantKey: "processor",
        resolution: "proven",
        evidenceRefs: [evidenceRef],
        derivabilityTier: "stated_on_statement",
        assertionBasis: "source_fact",
        confidence: "unavailable",
      },
      {
        key: "billing_intermediary",
        chargeKey: "statement_fee",
        dimension: "billing_intermediary",
        participantKey: "processor",
        resolution: "proven",
        evidenceRefs: [evidenceRef],
        derivabilityTier: "stated_on_statement",
        assertionBasis: "source_fact",
        confidence: "unavailable",
      },
      {
        key: "beneficiary",
        chargeKey: "statement_fee",
        dimension: "economic_beneficiary",
        resolution: "unresolved",
        dependencyKeys: ["merchant_pricing_document"],
        derivabilityTier: "requires_merchant_pricing_document",
        assertionBasis: "source_fact",
        confidence: "unavailable",
      },
    ],
    charges,
  };
}

export function buildApprovedEconomics(
  pricingAnalysis = economicPricing(),
  options: { feeDetailCoverage?: "complete" | "incomplete" | "unknown"; omitStatementFee?: boolean } = {},
): CanonicalEconomicsV2EconomicAnalysis {
  return buildCanonicalEconomicsV2EconomicAnalysis(approvedEconomicInput(pricingAnalysis, options));
}

function admittedCharge(
  key: string,
  occurrenceRef: string,
  financialDirection: "debit" | "credit",
  category: CanonicalEconomicChargeAdmission["category"],
  subtype: CanonicalEconomicChargeAdmission["subtype"],
): CanonicalEconomicChargeAdmission {
  return {
    key,
    sourceOccurrenceRefs: [occurrenceRef],
    contributingOccurrenceRef: occurrenceRef,
    category,
    categoryResolution: "proven",
    subtype,
    financialDirection,
    uniqueEconomicOccurrenceProven: true,
    feeOccurrenceProven: true,
    directionProven: true,
    supportingDetailAdmission: {
      admissionId: `approved_synthetic_supporting_detail_${key}_v1`,
      evidenceRefs: [],
      assertionBasis: "source_fact",
    },
    periodApplicability: "applicable",
    derivabilityTier: "stated_on_statement",
    assertionBasis: "source_fact",
    confidence: "unavailable",
  };
}
