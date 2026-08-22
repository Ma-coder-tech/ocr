import { describe, expect, it } from "vitest";
import {
  buildCanonicalEconomicsV2EconomicAnalysis,
  buildObservationalCanonicalEconomicsV2FromFiservPricing,
} from "../../../src/canonical/v2/index.js";
import { approvedEconomicInput, economicPricing } from "./economicFixtures.js";

describe("Canonical Economics V2 RD participants and independent control roles", () => {
  it("keeps collector, intermediary, and beneficiary as independent claims", () => {
    const analysis = buildCanonicalEconomicsV2EconomicAnalysis(approvedEconomicInput());
    const claims = analysis.economicLayer.roleClaims;

    expect(claims.find((claim) => claim.dimension === "collector")).toMatchObject({
      resolution: "proven",
      participantRef: "economic_participant_001",
    });
    expect(claims.find((claim) => claim.dimension === "billing_intermediary")).toMatchObject({
      resolution: "proven",
      participantRef: "economic_participant_001",
    });
    expect(claims.find((claim) => claim.dimension === "economic_beneficiary")).toMatchObject({
      resolution: "unresolved",
      participantRef: null,
      dependencyRefs: ["economic_dependency_001"],
      derivabilityTier: "requires_merchant_pricing_document",
    });
    expect(claims.some((claim) => claim.dimension === "price_setter" || claim.dimension === "negotiator_change_authority")).toBe(false);
  });

  it("does not put processor-billed pricing into processor-controlled cost without a separate positive control claim", () => {
    const unresolvedInput = approvedEconomicInput();
    const statement = unresolvedInput.charges!.find((charge) => charge.key === "statement_fee")!;
    statement.category = "processor_acquirer_pricing";
    const unresolved = buildCanonicalEconomicsV2EconomicAnalysis(unresolvedInput);

    expect(bucket(unresolved, "processor_controlled_pricing").netAmount.amountMinor).toBe(0);
    expect(bucket(unresolved, "unresolved_cost").netAmount.amountMinor).toBe(3100);
    expect(unresolved.economicLayer.costStack.completeness).toBe("partial_but_financially_reconciled");

    const provenInput = approvedEconomicInput();
    const provenStatement = provenInput.charges!.find((charge) => charge.key === "statement_fee")!;
    const evidenceRef = provenInput.roleClaims![0]!.evidenceRefs![0]!;
    provenStatement.category = "processor_acquirer_pricing";
    provenStatement.roleClaimKeys = [...(provenStatement.roleClaimKeys ?? []), "price_setter"];
    provenInput.roleClaims!.push({
      key: "price_setter",
      chargeKey: "statement_fee",
      dimension: "price_setter",
      participantKey: "processor",
      resolution: "proven",
      evidenceRefs: [evidenceRef],
      derivabilityTier: "stated_on_statement",
      assertionBasis: "source_fact",
      confidence: "unavailable",
    });
    const proven = buildCanonicalEconomicsV2EconomicAnalysis(provenInput);

    expect(proven.validation.status).toBe("valid");
    expect(bucket(proven, "processor_controlled_pricing").netAmount.amountMinor).toBe(3100);
    expect(bucket(proven, "unresolved_cost").netAmount.amountMinor).toBe(0);
    expect(proven.economicLayer.costStack.completeness).toBe("complete");
  });

  it("downgrades AI, observational, and period-inapplicable role claims instead of creating canonical control", () => {
    const aiInput = approvedEconomicInput();
    const evidenceRef = aiInput.roleClaims![0]!.evidenceRefs![0]!;
    aiInput.roleClaims!.push({
      key: "ai_owner",
      chargeKey: "statement_fee",
      dimension: "economic_owner",
      participantKey: "processor",
      resolution: "proven",
      evidenceRefs: [evidenceRef],
      derivabilityTier: "inferable_from_statement_with_qualification",
      assertionBasis: "ai_hypothesis",
      confidence: "high",
    });
    aiInput.charges!.find((charge) => charge.key === "statement_fee")!.roleClaimKeys!.push("ai_owner");
    const ai = buildCanonicalEconomicsV2EconomicAnalysis(aiInput);
    expect(ai.economicLayer.roleClaims.find((claim) => claim.dimension === "economic_owner")).toMatchObject({
      resolution: "unresolved",
      participantRef: null,
    });

    const periodInput = approvedEconomicInput();
    periodInput.roleClaims!.push({
      key: "future_controller",
      chargeKey: "statement_fee",
      dimension: "contractual_controller",
      participantKey: "processor",
      resolution: "proven",
      effectiveFrom: "2027-01-01",
      evidenceRefs: [evidenceRef],
      derivabilityTier: "requires_external_rule_or_schedule",
      assertionBasis: "external_verified",
      confidence: "unavailable",
    });
    periodInput.charges!.find((charge) => charge.key === "statement_fee")!.roleClaimKeys!.push("future_controller");
    const period = buildCanonicalEconomicsV2EconomicAnalysis(periodInput);
    expect(period.economicLayer.roleClaims.find((claim) => claim.dimension === "contractual_controller")).toMatchObject({
      resolution: "unresolved",
      periodApplicability: "not_applicable",
      participantRef: null,
    });

    const observational = buildObservationalCanonicalEconomicsV2FromFiservPricing(economicPricing());
    expect(observational.validation.status).toBe("valid");
    expect(observational.economicLayer.charges.every((charge) => !charge.contributionStatus.startsWith("contributes_"))).toBe(true);
    expect(observational.economicLayer.costStack.completeness).toBe("financially_unreconciled");
  });
});

function bucket(analysis: ReturnType<typeof buildCanonicalEconomicsV2EconomicAnalysis>, kind: string) {
  return analysis.economicLayer.costStack.buckets.find((item) => item.kind === kind)!;
}
