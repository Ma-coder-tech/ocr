import { describe, expect, it } from "vitest";

import {
  AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1,
  AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
} from "../../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import {
  commercialSourceFingerprintsV1,
  createCommercialSourceGovernanceRegistryV1,
  governedCommercialComponentSemanticFingerprintV1,
  governedCommercialCompositionSemanticFingerprintV1,
  governedCommercialPolicySemanticFingerprintV1,
  evaluateCommercialPredicateV1,
  resolveGovernedCommercialOfferV1,
  sameCommercialSemanticMeaningV1,
  summarizeCommercialComponentCompletenessV1,
  validateCommercialSourceGovernanceRegistryV1,
  type CommercialOfferIdentityV1,
  type CommercialPriceComponentVersionV1,
  type CommercialSourceGovernanceRegistryV1,
} from "../../src/canonical/commercialSourceGovernanceV1.js";

const authority = "RateReveal_AuthorizeNet_Evidence_Completion_Pack_FINAL_Product_Adjudicated_v1.md#all";

describe("Commercial Source Governance Contract v1", () => {
  it("admits only the exact scoped Authorize.net Batch 1A values and preserves unknowns", () => {
    const registry = AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1;
    const known = registry.priceComponentVersions.filter((item) => item.completeness.state === "KNOWN");
    expect(known.map((item) => [item.componentIdentity, item.completeness.value])).toEqual([
      ["monthly_gateway_charge", { kind: "money", amountMinor: 2500, currency: "USD" }],
      ["returned_authorize_net_billing_payment_charge", { kind: "money", amountMinor: 2500, currency: "USD" }],
      ["late_payment_charge", { kind: "money", amountMinor: 2000, currency: "USD" }],
      ["abandoned_account_charge", { kind: "money", amountMinor: 1000, currency: "USD" }],
      ["gateway_transaction_charge", { kind: "money", amountMinor: 10, currency: "USD" }],
      ["gateway_batch_charge", { kind: "money", amountMinor: 10, currency: "USD" }],
      ["account_updater_successful_update_charge", { kind: "money", amountMinor: 25, currency: "USD" }],
    ]);
    expect(registry.priceComponentVersions.filter((item) => item.completeness.state === "KNOWN_ABSENT").map((item) => item.componentIdentity)).toEqual([
      "gateway_setup_charge",
      "service_reactivation_charge",
      "gateway_side_credit_card_discount_rate",
      "gateway_side_monthly_minimum",
      "gateway_side_chargeback_charge",
      "automated_recurring_billing_setup_charge",
      "automated_recurring_billing_monthly_charge",
      "customer_information_manager_monthly_charge",
      "advanced_fraud_detection_suite_monthly_charge",
    ]);
    expect(registry.priceComponentVersions.filter((item) => item.completeness.state === "UNKNOWN").map((item) => item.componentIdentity)).toEqual([
      "merchant_account_acquiring_percentage_charge",
      "merchant_account_acquiring_per_item_charge",
      "merchant_account_acquiring_chargeback_charge",
    ]);
    expect(registry.offerCompositionVersions.map((item) => item.offerIdentity.namedOffer)).toEqual(["Gateway only", "Account Updater"]);
    expect(registry.offerCompositionVersions.every((item) => item.offerIdentity.geography === "United States")).toBe(true);
    expect(registry.sourceObservations.map((item) => item.provenance.sourceLocator)).toEqual([
      "https://www.authorize.net/sign-up/pricing.html",
      "https://www.authorize.net/content/dam/documents/en/account-updater.pdf",
      "https://support.authorize.net/knowledgebase/Knowledgearticle/?code=KA-07342",
    ]);
    expect(registry.sourceObservations[2]?.provenance.publicationDate).toBeNull();
    expect(registry.sourceObservations[2]?.provenance.lastModifiedDate).toBe("2025-04-09");
    expect(registry.sourceObservations[0]?.sourceFaithfulExtract).toContain("no gateway contract requirement");
    expect(registry.sourceObservations[2]?.sourceFaithfulExtract).toContain("partner-sold accounts");
    expect(registry.permissions).toMatchObject({ customerComparatorClaimsAllowed: false, gradesAllowed: false, savingsAllowed: false, canonicalMutationAllowed: false });
  });

  it("never treats UNKNOWN as zero, KNOWN_ABSENT as UNKNOWN, or a partial offer as complete", () => {
    const summary = summarizeCommercialComponentCompletenessV1(AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1.priceComponentVersions);
    expect(summary.knownComponentSubtotalMinor).toBeNull();
    expect(summary.unknownComponentRefs).toHaveLength(3);
    expect(summary.knownAbsentComponentRefs).toHaveLength(9);
    expect(summary.completeForRequestedComponents).toBe(false);
    expect(summary.automaticLowerBoundAllowed).toBe(false);

    const syntheticAbsent = clone(AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1.priceComponentVersions[0]!);
    syntheticAbsent.componentVersionId = "synthetic_known_absent";
    syntheticAbsent.completeness = { state: "KNOWN_ABSENT", value: null, observedAbsentValue: { kind: "money", amountMinor: 0, currency: "USD" } };
    syntheticAbsent.f3GovernedSemantic = governedCommercialComponentSemanticFingerprintV1(syntheticAbsent);
    const absentSummary = summarizeCommercialComponentCompletenessV1([syntheticAbsent]);
    expect(absentSummary.knownAbsentComponentRefs).toEqual(["synthetic_known_absent"]);
    expect(absentSummary.unknownComponentRefs).toEqual([]);
  });

  it("keeps gateway, acquiring, billing-return, chargeback, and Account Updater populations distinct", () => {
    const registry = AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1;
    const byIdentity = new Map(registry.priceComponentVersions.map((item) => [item.componentIdentity, item]));
    expect(byIdentity.get("gateway_transaction_charge")).toMatchObject({ unit: "per_gateway_transaction", billedPopulation: "gateway_credit_card_transaction_events" });
    expect(byIdentity.get("gateway_transaction_charge")?.sourceFaithfulPopulationWording).toContain("refunds");
    expect(byIdentity.get("returned_authorize_net_billing_payment_charge")?.billedPopulation).toBe("returned_authorize_net_billing_debits");
    expect(byIdentity.get("gateway_side_chargeback_charge")?.completeness.state).toBe("KNOWN_ABSENT");
    expect(byIdentity.get("merchant_account_acquiring_chargeback_charge")?.completeness.state).toBe("UNKNOWN");
    expect(byIdentity.get("account_updater_successful_update_charge")).toMatchObject({ unit: "per_successful_update", billedPopulation: "successful_account_updates" });
    expect(registry.offerCompositionVersions[0]?.componentVersionRefs).not.toContain("commercial_component_authorize_net_account_updater_v1");
  });

  it("keeps public policy and merchant-specific availability orthogonal", () => {
    const draft = draftRegistry();
    const policy = draft.publicPolicyVersions[0]!;
    policy.status = "PUBLICLY_RESTRICTED_OR_REVIEW_REQUIRED";
    policy.sourceFaithfulWording = "Additional review is required.";
    policy.f3GovernedSemantic = policyFingerprint(policy);
    draft.merchantAvailabilityEvidence.push({
      evidenceId: "synthetic_formal_approved_offer",
      kind: "approved_application",
      merchantScopeRef: "synthetic_merchant_scope",
      sourceObservationRefs: [draft.sourceObservations[0]!.observationId],
      conditions: ["approval remains subject to the written terms"],
      effectivePeriod: unknownPeriod(),
      admission: admitted(),
    });
    const registry = createCommercialSourceGovernanceRegistryV1(draft);
    const result = resolveGovernedCommercialOfferV1({
      registry,
      identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
      asOf: "2026-09-10",
      mode: "current",
      merchantScopeRef: "synthetic_merchant_scope",
    });
    expect(result.status).toBe("resolved");
    expect(result.publicPolicyStatus).toBe("PUBLICLY_RESTRICTED_OR_REVIEW_REQUIRED");
    expect(result.merchantAvailabilityEvidence[0]?.kind).toBe("approved_application");
  });

  it("prevents direct, reseller, unknown-channel, gateway, and acquiring identity leakage", () => {
    const registry = AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1;
    const reseller = { ...AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, distributionChannel: "reseller" as const, sellerIdentity: "some_reseller" };
    const partner = { ...AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, distributionChannel: "bank_partner" as const, sellerIdentity: "some_partner" };
    const gatewayReseller = { ...AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, distributionChannel: "gateway_reseller" as const, sellerIdentity: "some_gateway_reseller" };
    const unknown = { ...AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, distributionChannel: "unknown" as const, sellerIdentity: "seller_not_established" };
    const acquiring = { ...AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, productScope: "acquiring_only" as const };
    for (const identity of [reseller, partner, gatewayReseller, unknown, acquiring]) {
      expect(resolveGovernedCommercialOfferV1({ registry, identity, asOf: "2026-09-10", mode: "current" }).status).toBe("unresolved_channel_or_identity");
    }
    const direct = resolveGovernedCommercialOfferV1({ registry, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" });
    expect(direct.status).toBe("resolved");
    const malformed = draftRegistry();
    malformed.offerCompositionVersions[0]!.componentVersionRefs.push("commercial_component_authorize_net_account_updater_v1");
    malformed.offerCompositionVersions[0]!.f3GovernedSemantic = governedCommercialCompositionSemanticFingerprintV1(malformed.offerCompositionVersions[0]!);
    const invalid = { contractVersion: registry.contractVersion, ...malformed, permissions: clone(registry.permissions) } as CommercialSourceGovernanceRegistryV1;
    expect(validateCommercialSourceGovernanceRegistryV1(invalid).map((item) => item.code)).toContain("offer_composition_identity_leak");
  });

  it("preserves raw observation changes without manufacturing semantic price versions", () => {
    const registry = AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1;
    const draft = draftRegistry();
    const prior = draft.sourceObservations[0]!;
    const changedExtract = `${prior.sourceFaithfulExtract} Page layout changed.`;
    draft.sourceObservations.push({
      ...clone(prior),
      observationId: "synthetic_cosmetic_capture_v2",
      observationVersion: 2,
      supersedesObservationId: prior.observationId,
      sourceFaithfulExtract: changedExtract,
      fingerprints: commercialSourceFingerprintsV1({ rawSourceDocument: "synthetic redesigned document", relevantCommercialExtract: changedExtract }),
    });
    const rebuilt = createCommercialSourceGovernanceRegistryV1(draft);
    expect(rebuilt.sourceObservations).toHaveLength(registry.sourceObservations.length + 1);
    expect(rebuilt.priceComponentVersions).toHaveLength(registry.priceComponentVersions.length);
    expect(sameCommercialSemanticMeaningV1(rebuilt.priceComponentVersions[0]!, registry.priceComponentVersions[0]!)).toBe(true);
    const reProvenanced = clone(registry.priceComponentVersions[0]!);
    reProvenanced.sourceObservationRefs = ["synthetic_cosmetic_capture_v2"];
    reProvenanced.f3GovernedSemantic = governedCommercialComponentSemanticFingerprintV1(reProvenanced);
    expect(reProvenanced.f3GovernedSemantic).toBe(registry.priceComponentVersions[0]!.f3GovernedSemantic);
    const wordingOnly = clone(registry.publicPolicyVersions[0]!);
    wordingOnly.sourceFaithfulWording = "Cosmetically revised wording with the same governed meaning.";
    wordingOnly.f3GovernedSemantic = governedCommercialPolicySemanticFingerprintV1(wordingOnly);
    expect(wordingOnly.f3GovernedSemantic).toBe(registry.publicPolicyVersions[0]!.f3GovernedSemantic);
  });

  it("creates distinct F1/F2/F3 behavior and requires semantic re-versioning for a price change", () => {
    const draft = draftRegistry();
    const prior = draft.priceComponentVersions.find((item) => item.componentIdentity === "gateway_transaction_charge")!;
    const successor = clone(prior);
    successor.componentVersionId = "synthetic_gateway_transaction_price_v2";
    successor.version = 2;
    successor.supersedesComponentVersionId = prior.componentVersionId;
    successor.completeness = { state: "KNOWN", value: { kind: "money", amountMinor: 11, currency: "USD" } };
    successor.f3GovernedSemantic = governedCommercialComponentSemanticFingerprintV1(successor);
    draft.priceComponentVersions.push(successor);
    const priorComposition = draft.offerCompositionVersions[0]!;
    const nextComposition = clone(priorComposition);
    nextComposition.compositionVersionId = "synthetic_gateway_offer_composition_v2";
    nextComposition.version = 2;
    nextComposition.supersedesCompositionVersionId = priorComposition.compositionVersionId;
    nextComposition.componentVersionRefs = priorComposition.componentVersionRefs.map((ref) => ref === prior.componentVersionId ? successor.componentVersionId : ref);
    nextComposition.f3GovernedSemantic = governedCommercialCompositionSemanticFingerprintV1(nextComposition);
    draft.offerCompositionVersions.push(nextComposition);
    const rebuilt = createCommercialSourceGovernanceRegistryV1(draft);
    expect(prior.f3GovernedSemantic).not.toBe(successor.f3GovernedSemantic);
    expect(rebuilt.offerCompositionVersions).toHaveLength(3);
  });

  it("fails historical replay closed for unknown effective dates and does not treat unverified old offers as current", () => {
    const registry = AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1;
    expect(resolveGovernedCommercialOfferV1({ registry, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2024-09-01", mode: "historical" }).status).toBe("unresolved_period");
    expect(resolveGovernedCommercialOfferV1({ registry, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status).toBe("resolved");
    const draft = draftRegistry();
    draft.offerCompositionVersions[0]!.verification = "verification_due_or_uncertain";
    draft.offerCompositionVersions[0]!.f3GovernedSemantic = governedCommercialCompositionSemanticFingerprintV1(draft.offerCompositionVersions[0]!);
    const stale = createCommercialSourceGovernanceRegistryV1(draft);
    expect(resolveGovernedCommercialOfferV1({ registry: stale, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status).toBe("unresolved_not_current");
    const supersededDraft = draftRegistry();
    supersededDraft.offerCompositionVersions[0]!.lifecycle = "superseded";
    const superseded = createCommercialSourceGovernanceRegistryV1(supersededDraft);
    expect(resolveGovernedCommercialOfferV1({ registry: superseded, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status).toBe("unresolved_not_current");
  });

  it("preserves same-scope conflicts without averaging or recency resolution", () => {
    const draft = draftRegistry();
    const prior = draft.priceComponentVersions.find((item) => item.componentIdentity === "gateway_transaction_charge")!;
    const competing = clone(prior);
    competing.componentVersionId = "synthetic_conflicting_gateway_transaction";
    competing.completeness = { state: "KNOWN", value: { kind: "money", amountMinor: 12, currency: "USD" } };
    competing.f3GovernedSemantic = governedCommercialComponentSemanticFingerprintV1(competing);
    draft.priceComponentVersions.push(competing);
    draft.conflicts.push({
      conflictId: "synthetic_same_scope_conflict",
      sameScopeKey: "authorize_net_direct_gateway_transaction_current",
      componentVersionRefs: [prior.componentVersionId, competing.componentVersionId],
      state: "unresolved",
      resolution: null,
    });
    const registry = createCommercialSourceGovernanceRegistryV1(draft);
    const result = resolveGovernedCommercialOfferV1({ registry, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" });
    expect(result.status).toBe("unresolved_conflict");
    expect(result.reasons.join(" ")).toContain("no value was averaged or selected");
    expect(result.componentVersionRefs).toEqual([]);
    expect(registry.conflicts).toHaveLength(1);
    const resolvedDraft = draftRegistry();
    resolvedDraft.priceComponentVersions.push(competing);
    resolvedDraft.conflicts.push({
      conflictId: "synthetic_resolved_same_scope_conflict",
      sameScopeKey: "authorize_net_direct_gateway_transaction_current",
      componentVersionRefs: [prior.componentVersionId, competing.componentVersionId],
      state: "resolved",
      resolution: { selectedComponentVersionRef: prior.componentVersionId, authorityRef: authority, resolvedAt: "2026-09-10T00:00:00.000Z", reason: "synthetic Product resolution" },
    });
    const resolved = createCommercialSourceGovernanceRegistryV1(resolvedDraft);
    expect(resolved.conflicts[0]?.state).toBe("resolved");
    expect(resolved.conflicts[0]?.componentVersionRefs).toHaveLength(2);
  });

  it("keeps starting-at and promotional observations partial and non-persistent", () => {
    const starting = clone(AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1.priceComponentVersions[0]!);
    starting.componentVersionId = "synthetic_starting_at";
    starting.pricePresentation = "starting_at";
    starting.directionalBound = "lower_bound";
    starting.f3GovernedSemantic = governedCommercialComponentSemanticFingerprintV1(starting);
    const summary = summarizeCommercialComponentCompletenessV1([starting]);
    expect(summary.completeForRequestedComponents).toBe(false);
    expect(summary.directionalBound).toBe("lower_bound");
    const promotion = AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1.promotionVersions[0]!;
    expect(promotion.status).toBe("unknown");
    expect(promotion.reversionTerms).toBeNull();
  });

  it("blocks AI self-admission and candidate consumption", () => {
    const draft = draftRegistry();
    draft.offerCompositionVersions[0]!.admission = {
      lifecycle: "candidate",
      authorityClass: null,
      authorityRef: null,
      admittedAt: null,
      proposedBy: "ai_or_research",
    };
    const candidate = createCommercialSourceGovernanceRegistryV1(draft);
    expect(resolveGovernedCommercialOfferV1({ registry: candidate, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status).toBe("unresolved_not_admitted");

    const invalid = clone(candidate) as CommercialSourceGovernanceRegistryV1;
    invalid.offerCompositionVersions[0]!.admission.lifecycle = "admitted";
    expect(validateCommercialSourceGovernanceRegistryV1(invalid).map((item) => item.code)).toContain("admission_missing_human_authority");
  });

  it("evaluates only governed structured qualification predicates and preserves missing facts", () => {
    const predicate = {
      op: "or" as const,
      conditions: [
        { op: "fact" as const, field: "monthly_volume_minor" as const, comparator: "gt" as const, value: 10_000_000 },
        { op: "and" as const, conditions: [
          { op: "fact" as const, field: "merchant_type" as const, comparator: "eq" as const, value: "restaurant" },
          { op: "fact" as const, field: "average_ticket_minor" as const, comparator: "lt" as const, value: 2500 },
        ] },
      ],
    };
    expect(evaluateCommercialPredicateV1(predicate, { monthly_volume_minor: 12_000_000 })).toBe("satisfied");
    expect(evaluateCommercialPredicateV1(predicate, { monthly_volume_minor: 5_000_000, merchant_type: "restaurant", average_ticket_minor: 2000 })).toBe("satisfied");
    expect(evaluateCommercialPredicateV1(predicate, { monthly_volume_minor: 5_000_000 })).toBe("unknown");
    expect(evaluateCommercialPredicateV1(predicate, { monthly_volume_minor: 5_000_000, merchant_type: "retail", average_ticket_minor: 2000 })).toBe("not_satisfied");

    const draft = draftRegistry();
    draft.predicateProposals.push({
      proposalId: "synthetic_ai_predicate_proposal",
      offerIdentity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
      sourceFaithfulWording: "Synthetic source wording retained for Product review.",
      proposedPredicate: predicate,
      sourceObservationRefs: [draft.sourceObservations[0]!.observationId],
      lifecycle: "pending_product_review",
      proposedBy: "ai_or_research",
      limitations: ["not governed authority"],
    });
    const pending = createCommercialSourceGovernanceRegistryV1(draft);
    expect(pending.predicateProposals).toHaveLength(1);
    expect(pending.publicPolicyVersions[0]!.normalizedPredicate).toBeNull();
    expect(resolveGovernedCommercialOfferV1({ registry: pending, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).publicPolicyStatus).toBe("PUBLIC_POLICY_UNKNOWN");
  });
});

function draftRegistry(): Omit<CommercialSourceGovernanceRegistryV1, "contractVersion" | "permissions"> {
  const registry = clone(AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1);
  return {
    sourceObservations: registry.sourceObservations,
    priceComponentVersions: registry.priceComponentVersions,
    publicPolicyVersions: registry.publicPolicyVersions,
    predicateProposals: registry.predicateProposals,
    merchantAvailabilityEvidence: registry.merchantAvailabilityEvidence,
    serviceScopeVersions: registry.serviceScopeVersions,
    promotionVersions: registry.promotionVersions,
    offerCompositionVersions: registry.offerCompositionVersions,
    conflicts: registry.conflicts,
  };
}

function policyFingerprint(policy: CommercialSourceGovernanceRegistryV1["publicPolicyVersions"][number]): string {
  return governedCommercialPolicySemanticFingerprintV1(policy);
}

function admitted() {
  return { lifecycle: "admitted" as const, authorityClass: "product_owner" as const, authorityRef: authority, admittedAt: "2026-09-10T00:00:00.000Z", proposedBy: "human" as const };
}

function unknownPeriod() { return { knowledge: "effective_period_unknown" as const, effectiveFrom: null, effectiveTo: null }; }
function clone<T>(value: T): T { return structuredClone(value); }
