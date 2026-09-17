import { describe, expect, it } from "vitest";

import {
  DHARMA_HIGH_VOLUME_IDENTITY_V1,
  DHARMA_REFERRAL_CONTROL_IDENTITY_V1,
  DHARMA_STANDARD_RETAIL_IDENTITY_V1,
  DHARMA_STANDARD_VIRTUAL_IDENTITY_V1,
  HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1,
  HELCIM_DIRECT_PROCESSING_IDENTITY_V1,
} from "../../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import {
  evaluateCommercialOfferQualificationV1,
  evaluateCommercialPredicateV1,
  resolveGovernedCommercialOfferV1,
  validateCommercialSourceGovernanceRegistryV1,
} from "../../src/canonical/commercialSourceGovernanceV1.js";

const registry = HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1;
const components = new Map(registry.priceComponentVersions.map((item) => [item.componentVersionId, item]));

describe("Commercial Source Batch 1B — Helcim + Dharma", () => {
  it("is a valid, source-only, Product-admitted registry with customer claims disabled", () => {
    expect(validateCommercialSourceGovernanceRegistryV1(registry)).toEqual([]);
    expect(registry.sourceObservations).toHaveLength(12);
    expect(registry.offerCompositionVersions.map((x) => x.offerIdentity.namedOffer)).toEqual([
      "Helcim U.S. direct public processing", "Standard Retail / Storefront", "Standard Virtual / Online", "High Volume",
    ]);
    expect(registry.permissions).toMatchObject({ customerComparatorClaimsAllowed: false, gradesAllowed: false, savingsAllowed: false, switchingAdviceAllowed: false, canonicalMutationAllowed: false, aiSelfAdmissionAllowed: false });
  });

  it("preserves Helcim H1/H2 tier-5 scopes and refuses public-tier extrapolation above $5M", () => {
    const h1 = registry.sourceObservations.find((x) => x.observationId === "obs_helcim_h1_fee_disclosures_v1")!;
    const h2 = registry.sourceObservations.find((x) => x.observationId === "obs_helcim_h2_public_pricing_v1")!;
    expect(h1.sourceFaithfulExtract).toContain("$1,000,001+");
    expect(h2.sourceFaithfulExtract).toContain("$1M-$5M");
    expect(h2.sourceFaithfulExtract).toContain("above $5M");
    const tier5 = components.get("component_helcim_t5_card_present_rate_v1")!;
    expect(evaluateCommercialPredicateV1(tier5.applicabilityPredicate!, { three_month_rolling_card_volume_minor: 200_000_000, channel: "card_present" })).toBe("satisfied");
    expect(evaluateCommercialPredicateV1(tier5.applicabilityPredicate!, { three_month_rolling_card_volume_minor: 500_000_001, channel: "card_present" })).toBe("not_satisfied");
  });

  it("keeps Helcim CP/CNP populations, rolling-average mechanics, and exact tier values separate", () => {
    expect(components.get("component_helcim_t1_card_present_rate_v1")?.completeness).toEqual({ state: "KNOWN", value: { kind: "rate", basisPoints: 40, currency: null } });
    expect(components.get("component_helcim_t1_card_present_item_v1")?.completeness).toEqual({ state: "KNOWN", value: { kind: "money", amountMinor: 8, currency: "USD" } });
    expect(components.get("component_helcim_t1_card_not_present_rate_v1")?.completeness).toEqual({ state: "KNOWN", value: { kind: "rate", basisPoints: 50, currency: null } });
    expect(components.get("component_helcim_t1_card_not_present_item_v1")?.completeness).toEqual({ state: "KNOWN", value: { kind: "money", amountMinor: 25, currency: "USD" } });
    expect(components.get("component_helcim_t1_card_present_item_v1")?.unit).toBe("per_card_transaction");
    expect(JSON.stringify(components.get("component_helcim_t1_card_present_item_v1")?.applicabilityPredicate)).toContain("three_month_rolling_card_volume_minor");
  });

  it("keeps Helcim current zero fields scoped and does not infer optional services are all free", () => {
    const absent = registry.priceComponentVersions.filter((x) => x.offerIdentity.providerBrand === "helcim" && x.completeness.state === "KNOWN_ABSENT");
    expect(absent.map((x) => x.componentIdentity)).toEqual(["account_monthly_fee", "monthly_minimum", "statement_fee", "signup_setup_fee", "pci_compliance_fee", "cancellation_termination_fee", "card_customer_data_migration_fee", "annual_fee"]);
    expect(absent.every((x) => x.sourceObservationRefs.includes("obs_helcim_h2_public_pricing_v1"))).toBe(true);
  });

  it("preserves Helcim gross chargeback, conditional refund, and recurring applicability", () => {
    const chargeback = components.get("component_helcim_chargeback_gross_v1")!;
    expect(chargeback.completeness).toEqual({ state: "KNOWN", value: { kind: "money", amountMinor: 1500, currency: "USD" } });
    expect(chargeback.conditionalAdjustment).toMatchObject({ kind: "full_fee_refund", result: "net_zero_for_assessed_component" });
    expect(evaluateCommercialPredicateV1(chargeback.conditionalAdjustment!.condition, { chargeback_resolved_in_merchant_favor: true })).toBe("satisfied");
    const recurring = components.get("component_helcim_recurring_surcharge_v1")!;
    expect(recurring.completeness).toEqual({ state: "KNOWN", value: { kind: "rate", basisPoints: 40, currency: null } });
    expect(evaluateCommercialPredicateV1(recurring.applicabilityPredicate!, { transaction_is_recurring: false })).toBe("not_satisfied");
  });

  it("preserves Helcim prohibited, restricted, no-known-block, and approval as separate states", () => {
    const policies = registry.publicPolicyVersions.filter((x) => x.offerIdentity.providerBrand === "helcim");
    expect(policies.map((x) => x.status)).toEqual(["PUBLICLY_PROHIBITED", "PUBLICLY_RESTRICTED_OR_REVIEW_REQUIRED", "NO_KNOWN_PUBLIC_BLOCK"]);
    expect(registry.merchantAvailabilityEvidence).toEqual([]);
    expect(policies.find((x) => x.status === "NO_KNOWN_PUBLIC_BLOCK")?.sourceFaithfulWording).toContain("not approval");
  });

  it("admits exact Dharma plan prices and preserves per-authorization populations", () => {
    expectPlan("retail", 2000, 15, 25, 8, 8);
    expectPlan("virtual", 2000, 20, 30, 11, 11);
    expectPlan("high_volume", 1500, 10, 20, 8, 11);
    const auths = registry.priceComponentVersions.filter((x) => x.offerIdentity.providerBrand === "dharma_merchant_services" && x.componentIdentity.includes("authorization_fee") && x.admission.lifecycle === "admitted");
    expect(auths).not.toHaveLength(0);
    expect(auths.every((x) => x.unit === "per_authorization" && x.billedPopulation.includes("authorization"))).toBe(true);
    expect(auths.every((x) => !x.billedPopulation.includes("settled_sale"))).toBe(true);
  });

  it("implements Dharma High-Volume OR qualification with the exact-$25 boundary unresolved", () => {
    const composition = registry.offerCompositionVersions.find((x) => x.offerIdentity.namedOffer === "High Volume")!;
    expect(evaluateCommercialOfferQualificationV1(composition, { monthly_volume_minor: 10_000_001, transaction_count: 1, merchant_type: "retail", average_ticket_minor: 5000 })).toMatchObject({ state: "QUALIFIED" });
    expect(evaluateCommercialOfferQualificationV1(composition, { monthly_volume_minor: 1, transaction_count: 5001, merchant_type: "retail", average_ticket_minor: 5000 })).toMatchObject({ state: "QUALIFIED" });
    expect(evaluateCommercialOfferQualificationV1(composition, { monthly_volume_minor: 1, transaction_count: 1, merchant_type: "restaurant", average_ticket_minor: 2499 })).toMatchObject({ state: "QUALIFIED" });
    expect(evaluateCommercialOfferQualificationV1(composition, { monthly_volume_minor: 1, transaction_count: 1, merchant_type: "restaurant", average_ticket_minor: 2500 })).toMatchObject({ state: "UNRESOLVED_QUALIFICATION_BOUNDARY" });
    expect(evaluateCommercialOfferQualificationV1(composition, { monthly_volume_minor: 10_000_001, transaction_count: 1, merchant_type: "restaurant", average_ticket_minor: 2500 })).toMatchObject({ state: "QUALIFIED" });
    expect(evaluateCommercialOfferQualificationV1(composition, { monthly_volume_minor: 1, transaction_count: 1, merchant_type: "restaurant", average_ticket_minor: 2501 })).toMatchObject({ state: "NOT_QUALIFIED" });
  });

  it("keeps Dharma high-risk exclusion and may-apply restrictions distinct from rejection/approval", () => {
    const composition = registry.offerCompositionVersions.find((x) => x.offerIdentity.namedOffer === "High Volume")!;
    expect(evaluateCommercialOfferQualificationV1(composition, { known_high_risk: true, monthly_volume_minor: 20_000_000 })).toMatchObject({ state: "NOT_APPLICABLE" });
    const policies = registry.publicPolicyVersions.filter((x) => x.offerIdentity.namedOffer === "High Volume");
    expect(policies.find((x) => x.status === "PUBLICLY_RESTRICTED_OR_REVIEW_REQUIRED")?.sourceFaithfulWording).toContain("not automatic rejection");
    expect(policies.find((x) => x.status === "NO_KNOWN_PUBLIC_BLOCK")?.sourceFaithfulWording).toContain("not merchant approval");
  });

  it("keeps Dharma closure separate from ETF and PCI compliance separate from conditional non-compliance", () => {
    for (const plan of ["retail", "virtual", "high_volume"]) {
      expect(components.get(`component_dharma_${plan}_closure_v1`)?.completeness).toEqual({ state: "KNOWN", value: { kind: "money", amountMinor: 4900, currency: "USD" } });
      expect(components.get(`component_dharma_${plan}_early_termination_fee_absent_v1`)?.completeness.state).toBe("KNOWN_ABSENT");
      expect(components.get(`component_dharma_${plan}_pci_compliance_fee_absent_v1`)?.completeness.state).toBe("KNOWN_ABSENT");
      const noncompliance = components.get(`component_dharma_${plan}_pci_noncompliance_v1`)!;
      expect(noncompliance.completeness).toEqual({ state: "KNOWN", value: { kind: "money", amountMinor: 3995, currency: "USD" } });
      expect(evaluateCommercialPredicateV1(noncompliance.applicabilityPredicate!, { pci_non_compliant: false })).toBe("not_satisfied");
    }
  });

  it("preserves ambiguous Account Update as UNKNOWN, not zero or a mapped updater product", () => {
    const updater = components.get("component_dharma_retail_account_updater_unknown_v1")!;
    expect(updater.completeness).toEqual({ state: "UNKNOWN", value: null });
    expect(updater.sourceFaithfulPopulationWording).toContain("Account Update Fee: No");
  });

  it("retains calculator conflicts without overwriting plan pages or averaging", () => {
    expect(registry.conflicts).toHaveLength(3);
    expect(registry.conflicts.every((x) => x.state === "resolved" && x.resolution?.reason.includes("no averaging"))).toBe(true);
    expect(components.get("component_dharma_retail_monthly_v1")?.completeness).toEqual({ state: "KNOWN", value: { kind: "money", amountMinor: 2000, currency: "USD" } });
    expect(components.get("candidate_dharma_calculator_retail_monthly_v1")?.admission.lifecycle).toBe("candidate");
    expect(registry.offerCompositionVersions.flatMap((x) => x.componentVersionRefs).some((ref) => ref.startsWith("candidate_dharma_calculator"))).toBe(false);
  });

  it("isolates direct Dharma from referral and processing-platform identities", () => {
    expect(resolveGovernedCommercialOfferV1({ registry, identity: DHARMA_REFERRAL_CONTROL_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status).toBe("unresolved_channel_or_identity");
    for (const identity of [DHARMA_STANDARD_RETAIL_IDENTITY_V1, DHARMA_STANDARD_VIRTUAL_IDENTITY_V1, DHARMA_HIGH_VOLUME_IDENTITY_V1]) {
      expect(identity.sellerIdentity).toBe("dharma_direct");
      expect(identity.providerBrand).not.toMatch(/tsys|fiserv|first.data/i);
    }
    expect(registry.priceComponentVersions.some((x) => x.componentVersionId.includes("referral"))).toBe(false);
  });

  it("enforces current/historical behavior without projecting unknown-date Dharma or H2-only prices backward", () => {
    for (const identity of [DHARMA_STANDARD_RETAIL_IDENTITY_V1, DHARMA_STANDARD_VIRTUAL_IDENTITY_V1, DHARMA_HIGH_VOLUME_IDENTITY_V1]) {
      expect(resolveGovernedCommercialOfferV1({ registry, identity, asOf: "2026-09-10", mode: "current" }).status).toBe("resolved");
      expect(resolveGovernedCommercialOfferV1({ registry, identity, asOf: "2025-01-01", mode: "historical" }).status).toBe("unresolved_period");
    }
    expect(resolveGovernedCommercialOfferV1({ registry, identity: HELCIM_DIRECT_PROCESSING_IDENTITY_V1, asOf: "2025-01-01", mode: "historical" }).status).toBe("unresolved_period");
  });
});

function expectPlan(prefix: "retail" | "virtual" | "high_volume", monthly: number, vmdRate: number, amexRate: number, firstAuth: number, secondAuth: number): void {
  expect(components.get(`component_dharma_${prefix}_monthly_v1`)?.completeness).toEqual({ state: "KNOWN", value: { kind: "money", amountMinor: monthly, currency: "USD" } });
  expect(components.get(`component_dharma_${prefix}_vmd_margin_v1`)?.completeness).toEqual({ state: "KNOWN", value: { kind: "rate", basisPoints: vmdRate, currency: null } });
  expect(components.get(`component_dharma_${prefix}_amex_margin_v1`)?.completeness).toEqual({ state: "KNOWN", value: { kind: "rate", basisPoints: amexRate, currency: null } });
  const auths = registry.priceComponentVersions.filter((x) => x.componentVersionId.startsWith(`component_dharma_${prefix}_`) && x.componentIdentity.includes("authorization_fee"));
  expect(auths.map((x) => x.completeness.state === "KNOWN" && x.completeness.value.kind === "money" ? x.completeness.value.amountMinor : null)).toEqual([firstAuth, secondAuth]);
}
