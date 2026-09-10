import { describe, expect, it } from "vitest";
import {
  evaluateCommercialComparatorDiagnosticCaseV1,
  evaluateDharmaPublishedQualificationV1,
  type CommercialComparatorDiagnosticCaseV1,
} from "../../scripts/lib/commercialComparatorEligibilityValidationV1.js";

describe("Commercial Comparator Eligibility Validation v1", () => {
  it("separates a conditional public offer from merchant-specific confirmed availability", () => {
    const conditional = evaluateCommercialComparatorDiagnosticCaseV1(fixture("conditional"));
    const confirmed = evaluateCommercialComparatorDiagnosticCaseV1(fixture("confirmed", {
      eligibilityStatus: "confirmed_available",
      merchantSpecificApprovalKnown: true,
      comparator: { sourceLane: "merchant_specific_quote" },
    }));

    expect(conditional.calculationPermitted).toBe(true);
    expect(conditional.permissions.conditionalScenarioAllowed).toBe(true);
    expect(conditional.permissions.confirmedAvailabilityLanguageAllowed).toBe(false);
    expect(confirmed.permissions.confirmedAvailabilityLanguageAllowed).toBe(true);
    expect(confirmed.permissions.expensiveOrReasonableGradeAllowed).toBe(false);
    expect(confirmed.permissions.preciseSavingsClaimAllowed).toBe(false);
  });

  it("rejects prohibited merchants without treating restricted or not-disqualified merchants as approved", () => {
    const prohibited = evaluateCommercialComparatorDiagnosticCaseV1(fixture("prohibited", { eligibilityStatus: "publicly_prohibited" }));
    const restricted = evaluateCommercialComparatorDiagnosticCaseV1(fixture("restricted", {
      eligibilityStatus: "restricted_additional_underwriting",
      offerQualification: "additional_underwriting",
    }));
    const screened = evaluateCommercialComparatorDiagnosticCaseV1(fixture("screened"));

    expect(prohibited.calculationPermitted).toBe(false);
    expect(restricted.calculationPermitted).toBe(true);
    expect(restricted.permissions.confirmedAvailabilityLanguageAllowed).toBe(false);
    expect(screened.permissions.confirmedAvailabilityLanguageAllowed).toBe(false);
  });

  it("enforces population, channel, model, Clover-channel, and upper-bound containment", () => {
    const overrides: Array<[string, Patch]> = [
      ["population", { populationCompatibility: "mismatch" }],
      ["channel", { channelCompatibility: "mismatch" }],
      ["model", { pricingModelCompatibility: "mismatch" }],
      ["clover", { merchantContextFacts: { partnerSoldClover: true }, comparator: { provider: "Clover Direct" } }],
      ["upper", { decompositionPermission: "provider_upper_bound_only" }],
    ];
    for (const [id, patch] of overrides) {
      expect(evaluateCommercialComparatorDiagnosticCaseV1(fixture(id, patch)).calculationPermitted).toBe(false);
    }
  });

  it("permits bounded mixed-channel arithmetic without dominant-channel substitution", () => {
    const result = evaluateCommercialComparatorDiagnosticCaseV1(fixture("mixed", {
      claimScope: "complete_total_cost",
      pricingModelCompatibility: "normalizable_complete",
      channelCompatibility: "unknown",
      decompositionPermission: "complete_total_cost",
      serviceScope: "matched",
      calculation: {
        kind: "mixed_channel_linear",
        cardPresentVolumeMinor: 4_000_000,
        cardPresentCount: 600,
        cardNotPresentVolumeMinor: 2_000_000,
        cardNotPresentCount: 400,
        unknownVolumeMinor: 6_000_000,
        unknownCount: 1_000,
        cardPresentBps: 230,
        cardPresentPerEventMinor: 10,
        cardNotPresentBps: 290,
        cardNotPresentPerEventMinor: 10,
        monthlyMinor: 0,
        currentAmountMinor: 400_000,
      },
    }));

    expect(result.calculation).toMatchObject({ state: "bounded", comparatorAmountMinor: null });
    expect(result.calculation.comparatorAmountRangeMinor?.low).toBeLessThan(result.calculation.comparatorAmountRangeMinor?.high ?? 0);
  });

  it("keeps non-comparator source lanes and retired bands from producing merchant comparisons", () => {
    for (const sourceLane of ["gateway_only", "company_yield", "wholesale_buy_rate", "retired_v1_v7_band"] as const) {
      const result = evaluateCommercialComparatorDiagnosticCaseV1(fixture(sourceLane, {
        comparator: { sourceLane },
        claimScope: sourceLane === "gateway_only" ? "complete_total_cost" : "provider_component_price",
      }));
      expect(result.calculationPermitted).toBe(false);
      expect(result.permissions.reusableKnowledgeAdmissionAllowed).toBe(false);
      expect(result.permissions.customerFacingAuthorityAllowed).toBe(false);
    }
  });

  it("uses Dharma's disjunctive qualification function without interpolation", () => {
    const volume = evaluateDharmaPublishedQualificationV1({ monthlyVolumeMinor: 12_000_000, monthlyTransactionCount: 1_000, averageTicketMinor: 12_000, businessType: "retail", riskOrFutureDeliveryReviewRequired: false });
    const count = evaluateDharmaPublishedQualificationV1({ monthlyVolumeMinor: 5_000_000, monthlyTransactionCount: 6_000, averageTicketMinor: 833, businessType: "retail", riskOrFutureDeliveryReviewRequired: false });
    const restaurant = evaluateDharmaPublishedQualificationV1({ monthlyVolumeMinor: 4_000_000, monthlyTransactionCount: 2_000, averageTicketMinor: 2_000, businessType: "restaurant_food_beverage", riskOrFutureDeliveryReviewRequired: false });
    const review = evaluateDharmaPublishedQualificationV1({ monthlyVolumeMinor: 12_000_000, monthlyTransactionCount: 1_000, averageTicketMinor: 12_000, businessType: "future_delivery", riskOrFutureDeliveryReviewRequired: true });

    expect(volume.qualifyingBases).toEqual(["monthly_volume_over_100k"]);
    expect(count.qualifyingBases).toEqual(["monthly_transactions_over_5000"]);
    expect(restaurant.qualifyingBases).toEqual(["low_ticket_restaurant"]);
    expect(review.status).toBe("additional_underwriting");
  });

  it("keeps period representativeness claim-specific and rejects synthetic authority", () => {
    const exactMonth = evaluateCommercialComparatorDiagnosticCaseV1(fixture("exact", { periodRepresentative: false }));
    const persistent = evaluateCommercialComparatorDiagnosticCaseV1(fixture("persistent", { periodUse: "persistent_or_annualized", periodRepresentative: false }));
    expect(exactMonth.calculationPermitted).toBe(true);
    expect(persistent.calculationPermitted).toBe(false);
    expect(() => evaluateCommercialComparatorDiagnosticCaseV1({ ...fixture("bad"), syntheticAuthority: null })).toThrow(/no evidence authority/i);
  });
});

type Patch = Partial<Omit<CommercialComparatorDiagnosticCaseV1, "merchantContextFacts" | "comparator">> & {
  merchantContextFacts?: Partial<CommercialComparatorDiagnosticCaseV1["merchantContextFacts"]>;
  comparator?: Partial<CommercialComparatorDiagnosticCaseV1["comparator"]>;
};

function fixture(caseId: string, patch: Patch = {}): CommercialComparatorDiagnosticCaseV1 {
  const base: CommercialComparatorDiagnosticCaseV1 = {
    caseId,
    fixtureKind: "synthetic_boundary",
    syntheticAuthority: "none",
    merchantContextFacts: { statementFile: null, businessType: "retail", riskContext: "synthetic", volumeMinor: 12_000_000, transactionCount: 2_000, averageTicketMinor: 6_000, channel: "card_present", partnerSoldClover: false },
    comparator: { provider: "Dharma", offer: "published High-Volume component", sourceLane: "current_public_offer", sourceRef: "product-authority", sourceCurrent: true, sourceCompleteness: "complete_for_claim", reusableKnowledgeAuthority: false },
    eligibilityStatus: "not_publicly_disqualified",
    merchantSpecificApprovalKnown: false,
    offerQualification: "qualified",
    claimScope: "provider_component_price",
    pricingModelCompatibility: "match",
    populationCompatibility: "match",
    channelCompatibility: "match",
    serviceScope: "fee_scope_matched",
    serviceScopeDifferences: [],
    decompositionPermission: "exact_provider_controlled_dollars",
    calculation: { kind: "linear_component", volumeMinor: 12_000_000, eventCount: 2_000, currentAmountMinor: 45_000, adValoremBps: 10, perEventMinor: 8, monthlyMinor: 1_500 },
    publicContractDirectComparabilityEstablished: false,
    periodUse: "exact_month",
    periodRepresentative: null,
  };
  return {
    ...base,
    ...patch,
    caseId,
    merchantContextFacts: { ...base.merchantContextFacts, ...patch.merchantContextFacts },
    comparator: { ...base.comparator, ...patch.comparator, reusableKnowledgeAuthority: false },
  };
}
