import { describe, expect, it } from "vitest";
import { wellsFargo2026ReferenceRateCatalog } from "../../../../src/referenceRateCatalogData.js";
import { loadFiservFeeReference } from "../../../../src/fiservFeeReference.js";
import {
  appendKnowledgeAuditEvent,
  closeKnowledgeUnknownQueueItem,
  compareLegacyKnowledgeSemantics,
  createKnowledgeUnknownQueueItem,
  fiservFeeReferenceEntryToKnowledgeCandidates,
  ingestKnowledgeCandidatePacket,
  knowledgeExact,
  knowledgePrivacySafeDiagnostics,
  knowledgeSemanticFingerprintFromEntry,
  knowledgeUnknownQueueForBoundary,
  observeKnowledgeV2ForGold,
  referenceRateRowToKnowledgeCandidates,
  resolveExplicitKnowledgeDependency,
  resolveKnowledge,
  unboundedKnowledgeScope,
  validateKnowledgeEntry,
  validateKnowledgeLibrary,
  validateKnowledgePromotion,
  type KnowledgeAuditEvent,
  type KnowledgeEntry,
} from "../../../../src/canonical/v2/index.js";
import { admittedKnowledge, knowledgeQuery, satisfiedKnowledgeCondition } from "./knowledgeFixtures.js";

function validPromotionEvent(overrides: Partial<KnowledgeAuditEvent> = {}): KnowledgeAuditEvent {
  return {
    eventId: "promotion-event", entryRef: "knowledge-v2", previousEntryRef: "knowledge-v1", eventType: "admitted",
    authorityClass: "authorized_domain_reviewer", authorityRef: "review-role-1", occurredAt: "2026-01-02T00:00:00Z",
    priorVersion: 1, nextVersion: 2, priorState: "verified", nextState: "admitted",
    priorVisibility: "reusable", nextVisibility: "reusable", reasonCodes: ["claim_evidence_verified"],
    policyVersion: "payments_knowledge_library_v0_2", ...overrides,
  };
}

function unknownFixture(overrides: Parameters<typeof knowledgeQuery>[0] = {}) {
  const query = knowledgeQuery(overrides);
  const unresolved = resolveKnowledge([], query);
  const item = createKnowledgeUnknownQueueItem({
    id: "unknown-opaque", query, resolution: unresolved,
    requiredSourceAuthorities: ["official_network_publication"], dependencyCodes: ["requires_network_schedule"],
    originatingFactKinds: ["economic_driver"], originatingCanonicalRefs: ["driver-opaque"],
    blockingEffect: "limits_authority", limitations: ["Source unavailable."],
  });
  return { query, unresolved, item };
}

describe("Payments Knowledge Library v0.2 bounded safety corrections", () => {
  it("fails closed for unknown claims, malformed same-kind values, extra payloads, malformed scope, and free-form roles", () => {
    const unknown = admittedKnowledge({ claimType: "unknown_claim" as never });
    expect(() => validateKnowledgeEntry(unknown)).not.toThrow();
    expect(validateKnowledgeEntry(unknown).issues.map((item) => item.code)).toContain("unknown_claim_type");
    expect(validateKnowledgeEntry(admittedKnowledge({
      claimType: "template_identity", value: { kind: "identity" } as never,
    })).issues.map((item) => item.code)).toEqual(expect.arrayContaining(["invalid_value_shape", "invalid_identity_value"]));
    expect(validateKnowledgeEntry(admittedKnowledge({
      claimType: "processor_term", value: { kind: "term", termCode: "refund", termValue: "returned", arbitraryPayload: { authority: true } } as never,
      evidence: [{ ref: "processor-publication", sourceAuthority: "processor_publication", private: false }],
    })).issues.map((item) => item.code)).toContain("invalid_value_shape");
    const missingScope = admittedKnowledge({ scope: { ...unboundedKnowledgeScope(), network: knowledgeExact("visa") } });
    delete (missingScope.scope as Partial<KnowledgeEntry["scope"]>).region;
    expect(validateKnowledgeEntry(missingScope).issues.map((item) => item.code)).toContain("invalid_scope_shape");
    expect(validateKnowledgeEntry(admittedKnowledge({
      claimType: "participant_control_role",
      value: { kind: "role", participantRole: "invented_owner", controlDimension: "fully_negotiable", state: "proven" } as never,
      evidence: [{ ref: "contract-evidence", sourceAuthority: "merchant_contract", private: false }],
    })).issues.map((item) => item.code)).toContain("invalid_role_value");
  });

  it("rejects unrelated target keys and unknown/malformed queries without throwing", () => {
    expect(validateKnowledgeEntry({ ...admittedKnowledge(), unrelatedTarget: "smuggled" } as never).issues.map((item) => item.code)).toContain("invalid_entry_shape");
    expect(() => resolveKnowledge([], { ...knowledgeQuery(), claimType: "unknown" as never })).not.toThrow();
    expect(resolveKnowledge([], { ...knowledgeQuery(), claimType: "unknown" as never }).status).toBe("unresolved_policy_rejection");
    expect(resolveKnowledge([], { ...knowledgeQuery(), asOf: "2026-02-30" }).status).toBe("unresolved_policy_rejection");
  });

  it("does not let approved internal manual mapping establish negotiability or a pricing-program rule", () => {
    const entry = admittedKnowledge({
      claimType: "pricing_program_rule", subjectCode: "program_negotiability",
      value: { kind: "rule", ruleCode: "negotiability", outcomeCode: "merchant_can_negotiate" },
      evidence: [{ ref: "manual-map", sourceAuthority: "approved_internal_manual_mapping", private: false }],
    });
    expect(validateKnowledgeEntry(entry).issues.map((item) => item.code)).toContain("evidence_policy_rejection");
    expect(resolveKnowledge([entry], knowledgeQuery({ claimType: "pricing_program_rule", subjectCode: "program_negotiability" })).status).toBe("unresolved_policy_rejection");
    const legitimateAlias = admittedKnowledge({
      claimType: "alias_identity", subjectCode: "visa_alias", value: { kind: "mapping", canonicalCode: "visa", sourceCode: "visa_alias" },
      evidence: [{ ref: "approved-alias-map", sourceAuthority: "approved_internal_manual_mapping", private: false }],
    });
    expect(validateKnowledgeEntry(legitimateAlias).valid).toBe(true);
  });

  it("requires deterministic condition evidence, matching scope, and matching period", () => {
    const callerAssertion = admittedKnowledge({
      admission: { ...admittedKnowledge().admission, lifecycle: "admitted_with_conditions", conditions: [{ code: "caller_says_true", satisfied: true }] as never },
    });
    expect(validateKnowledgeEntry(callerAssertion).issues.map((item) => item.code)).toContain("invalid_admission_condition");
    const wrongScope = admittedKnowledge({
      admission: { ...admittedKnowledge().admission, lifecycle: "admitted_with_conditions", conditions: [satisfiedKnowledgeCondition({ requiredScope: { network: "mastercard" } })] },
    });
    expect(resolveKnowledge([wrongScope], knowledgeQuery()).status).toBe("unresolved_scope_or_period");
    const expired = admittedKnowledge({
      admission: { ...admittedKnowledge().admission, lifecycle: "admitted_with_conditions", conditions: [satisfiedKnowledgeCondition({ effectiveTo: "2026-06-01" })] },
    });
    expect(resolveKnowledge([expired], knowledgeQuery()).status).toBe("unresolved_scope_or_period");
  });

  it("strictly validates entry dates while preserving closed-open historical behavior", () => {
    expect(validateKnowledgeEntry(admittedKnowledge({ effectiveFrom: "2026-02-30" })).issues.map((item) => item.code)).toContain("invalid_effective_date");
    const entry = admittedKnowledge({ effectiveFrom: "2026-04-01", effectiveTo: "2026-07-01" });
    expect(resolveKnowledge([entry], knowledgeQuery({ asOf: "2026-04-01" })).status).toBe("resolved_single");
    expect(resolveKnowledge([entry], knowledgeQuery({ asOf: "2026-07-01" })).status).toBe("unresolved_scope_or_period");
  });

  it("rejects cross-boundary, broader-scope, and circular supersession", () => {
    const accountA = admittedKnowledge({ id: "account-a-v1", version: 1, visibility: "account_private", tenantRef: "tenant-a", accountRef: "account-a", evidence: [{ ref: "private-a", sourceAuthority: "official_network_publication", private: true }] });
    const accountB = admittedKnowledge({ id: "account-b-v2", version: 2, visibility: "account_private", tenantRef: "tenant-b", accountRef: "account-b", evidence: [{ ref: "private-b", sourceAuthority: "official_network_publication", private: true }], supersedes: [accountA.id], effectiveFrom: "2026-07-01" });
    expect(validateKnowledgeLibrary([accountA, accountB]).issues.map((item) => item.code)).toContain("cross_boundary_supersession");
    const narrow = admittedKnowledge({ id: "narrow", version: 1, scope: { ...admittedKnowledge().scope, channel: knowledgeExact("card_present") } });
    const broad = admittedKnowledge({ id: "broad", version: 2, supersedes: [narrow.id], effectiveFrom: "2026-07-01" });
    expect(validateKnowledgeLibrary([narrow, broad]).issues.map((item) => item.code)).toContain("scope_incompatible_supersession");
    const cycleA = admittedKnowledge({ id: "cycle-a", version: 2, supersedes: ["cycle-b"], effectiveFrom: "2026-07-01" });
    const cycleB = admittedKnowledge({ id: "cycle-b", version: 1, supersedes: ["cycle-a"], effectiveFrom: "2026-07-01" });
    expect(validateKnowledgeLibrary([cycleA, cycleB]).issues.map((item) => item.code)).toContain("circular_supersession");
  });

  it("keeps a future successor from changing a historical query", () => {
    const prior = admittedKnowledge({ id: "prior", version: 1, effectiveFrom: "2026-01-01" });
    const future = admittedKnowledge({ id: "future", version: 2, effectiveFrom: "2027-01-01", supersedes: [prior.id], value: { ...prior.value, kind: "rate", rateBasisPoints: 18 } });
    expect(validateKnowledgeLibrary([prior, future]).valid).toBe(true);
    expect(resolveKnowledge([prior, future], knowledgeQuery({ asOf: "2026-08-01" })).selectedEntryRefs).toEqual(["prior"]);
  });

  it("rejects impossible promotions, automated authority, and recurrence-based admission", () => {
    const previous = admittedKnowledge({ id: "knowledge-v1", version: 1, admission: { lifecycle: "verified", authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] } });
    const next = admittedKnowledge({ id: "knowledge-v2", version: 2 });
    expect(validateKnowledgePromotion({ previous, next, event: validPromotionEvent({ priorState: "candidate" }) }).issues.map((item) => item.code)).toContain("audit_entry_state_mismatch");
    expect(validateKnowledgePromotion({ previous, next, event: validPromotionEvent({ authorityClass: null, authorityRef: "model" }) }).valid).toBe(false);
    expect(validateKnowledgePromotion({ previous, next, event: validPromotionEvent({ reasonCodes: ["repeated_observation" as never] }) }).issues.map((item) => item.code)).toEqual(expect.arrayContaining(["invalid_audit_reason", "unauthorized_promotion_reason"]));
  });

  it("requires explicit privacy and scope review and refuses recurrence globalization", () => {
    const previous = admittedKnowledge({
      id: "knowledge-v1", version: 1, visibility: "account_private", tenantRef: "tenant-a", accountRef: "account-a",
      evidence: [{ ref: "observed-private", sourceAuthority: "verified_cross_statement_observation", private: true }],
      admission: { lifecycle: "verified", authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] },
    });
    const next = admittedKnowledge({ id: "knowledge-v2", version: 2 });
    const result = validateKnowledgePromotion({ previous, next, event: validPromotionEvent({
      priorVisibility: "account_private", reasonCodes: ["claim_evidence_verified", "scope_evidence_reviewed", "privacy_reviewed"],
    }) });
    expect(result.issues.map((item) => item.code)).toContain("unsafe_scope_expansion");
    const accountB = admittedKnowledge({
      id: "knowledge-v2", version: 2, visibility: "account_private", tenantRef: "tenant-b", accountRef: "account-b",
      evidence: [{ ref: "private-b", sourceAuthority: "official_network_publication", private: true }],
    });
    expect(validateKnowledgePromotion({ previous: { ...previous, evidence: [{ ref: "private-a", sourceAuthority: "official_network_publication", private: true }] }, next: accountB, event: validPromotionEvent({
      priorVisibility: "account_private", nextVisibility: "account_private", authorityClass: "authorized_domain_reviewer",
    }) }).issues.map((item) => item.code)).toContain("cross_boundary_promotion");
  });

  it("rejects inconsistent audit versions, timestamps, state transitions, and missing authority", () => {
    const bad = validPromotionEvent({
      eventType: "rejected", occurredAt: "not-a-date", priorVersion: 9, nextVersion: 2,
      authorityClass: null, authorityRef: null,
    });
    expect(() => appendKnowledgeAuditEvent([], bad)).toThrow(/invalid_audit_timestamp/);
    expect(() => appendKnowledgeAuditEvent([], bad)).toThrow(/invalid_audit_version_order/);
    expect(() => appendKnowledgeAuditEvent([], bad)).toThrow(/audit_event_state_mismatch/);
    expect(() => appendKnowledgeAuditEvent([], bad)).toThrow(/missing_audit_admission_authority/);
  });

  it("binds unknown closure to claim, tenant/account, period, evidence, and dependency", () => {
    const { item } = unknownFixture();
    const otherTenantQuery = knowledgeQuery({ scope: { ...knowledgeQuery().scope, tenantRef: "tenant-b", accountRef: "account-b" } });
    const otherTenantResolution = resolveKnowledge([admittedKnowledge()], otherTenantQuery);
    expect(() => closeKnowledgeUnknownQueueItem(item, { resolution: otherTenantResolution, satisfiedDependencyCodes: ["requires_network_schedule"], originatingCanonicalRefs: ["driver-opaque"] })).toThrow("unknown_queue_resolution_mismatch");
    const otherClaimQuery = knowledgeQuery({ claimType: "processor_term", subjectCode: "refund_term" });
    const otherClaimEntry = admittedKnowledge({ claimType: "processor_term", subjectCode: "refund_term", value: { kind: "term", termCode: "refund", termValue: "returned" }, evidence: [{ ref: "processor-publication", sourceAuthority: "processor_publication", private: false }] });
    expect(() => closeKnowledgeUnknownQueueItem(item, { resolution: resolveKnowledge([otherClaimEntry], otherClaimQuery), satisfiedDependencyCodes: ["requires_network_schedule"], originatingCanonicalRefs: ["driver-opaque"] })).toThrow("unknown_queue_resolution_mismatch");
    const otherPeriodResolution = resolveKnowledge([admittedKnowledge()], knowledgeQuery({ asOf: "2026-09-01" }));
    expect(() => closeKnowledgeUnknownQueueItem(item, { resolution: otherPeriodResolution, satisfiedDependencyCodes: ["requires_network_schedule"], originatingCanonicalRefs: ["driver-opaque"] })).toThrow("unknown_queue_resolution_mismatch");
  });

  it("does not close unknowns with verified-only knowledge or an unbound not-applicable shortcut", () => {
    const { item, query } = unknownFixture();
    const verified = admittedKnowledge({ admission: { lifecycle: "verified", authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] } });
    expect(() => closeKnowledgeUnknownQueueItem(item, { resolution: resolveKnowledge([verified], query), satisfiedDependencyCodes: ["requires_network_schedule"], originatingCanonicalRefs: ["driver-opaque"] })).toThrow("unknown_queue_requires_resolved_knowledge");
    expect(() => closeKnowledgeUnknownQueueItem(item, {
      status: "deterministically_not_applicable", claimType: query.claimType, subjectCode: "different_subject",
      scope: query.scope, asOf: query.asOf, dependencyCodes: ["requires_network_schedule"], originatingCanonicalRefs: ["driver-opaque"], basisCodes: ["population_not_applicable"], evidenceRefs: [],
    })).toThrow("not_applicable_question_mismatch");
    const resolved = resolveKnowledge([admittedKnowledge()], query);
    const wrongAuthorityItem = createKnowledgeUnknownQueueItem({
      id: "unknown-source", query, resolution: resolveKnowledge([], query), requiredSourceAuthorities: ["synthetic_test_fixture"],
      dependencyCodes: ["requires_network_schedule"], originatingFactKinds: ["economic_driver"],
      originatingCanonicalRefs: ["driver-opaque"], blockingEffect: "limits_authority", limitations: [],
    });
    expect(() => closeKnowledgeUnknownQueueItem(wrongAuthorityItem, { resolution: resolved, satisfiedDependencyCodes: ["requires_network_schedule"], originatingCanonicalRefs: ["driver-opaque"] })).toThrow("unknown_queue_source_authority_mismatch");
    expect(() => closeKnowledgeUnknownQueueItem(item, { resolution: resolved, satisfiedDependencyCodes: ["requires_network_schedule"], originatingCanonicalRefs: ["different-driver"] })).toThrow("unknown_queue_origin_mismatch");
  });

  it("isolates unknown lookup and diagnostics across tenants", () => {
    const tenantA = unknownFixture().item;
    expect(knowledgeUnknownQueueForBoundary([tenantA], { tenantRef: "tenant-b", accountRef: "account-b" })).toHaveLength(0);
    const diagnostics = knowledgePrivacySafeDiagnostics({
      entries: [], resolutions: [], unknownQueue: [tenantA], viewer: { tenantRef: "tenant-b", accountRef: "account-b" },
    });
    expect(diagnostics.openUnknownCount).toBe(0);
  });

  it("keeps official/high-confidence candidate claims non-authoritative", () => {
    const packet = referenceRateRowToKnowledgeCandidates(wellsFargo2026ReferenceRateCatalog[0]!)[0]!;
    const ingested = ingestKnowledgeCandidatePacket({
      ...packet, sourceAuthority: "official_network_publication", claimedConfidence: "high",
      lifecycle: "verified" as never, requiresHumanAdmission: false as never,
      evidence: [...packet.evidence, { ref: "additional-official-source", sourceAuthority: "official_network_publication", private: false }],
    });
    expect(ingested).toMatchObject({ lifecycle: "candidate", requiresHumanAdmission: true, claimedConfidence: "high" });
  });

  it("preserves reference scope, period, basis, source claim, and sub-cent precision without creating network truth", () => {
    const row = wellsFargo2026ReferenceRateCatalog.find((item) => item.feeCode === "MC_AUTH_US_2026_04")!;
    const packet = referenceRateRowToKnowledgeCandidates(row)[0]!;
    expect(packet).toMatchObject({
      lifecycle: "candidate", effectiveFrom: "2026-04-01",
      proposedScope: { network: { kind: "exact", value: "mastercard" }, region: { kind: "exact", value: "us" } },
      basis: { code: "per_auth", exactValue: "0.002294", currency: null },
      provenance: { sourceAuthorityClaim: "processor_publication" },
      proposedValue: { kind: "rate", fixedAmountMinor: 0.2294, currency: null },
    });
    expect(packet.sourceAuthority).toBe("legacy_reference_candidate");
  });

  it("keeps decomposed legacy Fiserv rate, beneficiary, and negotiability claims candidate-only", () => {
    const packets = loadFiservFeeReference().fees.flatMap(fiservFeeReferenceEntryToKnowledgeCandidates);
    expect(packets.every((packet) => packet.lifecycle === "candidate" && packet.sourceAuthority === "legacy_reference_candidate")).toBe(true);
    expect(packets.some((packet) => packet.candidateId.startsWith("fiserv-beneficiary-") && packet.provenance.sourceFieldRefs.includes("paid_to"))).toBe(true);
    expect(packets.some((packet) => packet.candidateId.startsWith("fiserv-negotiability-") && packet.provenance.sourceFieldRefs.includes("negotiable"))).toBe(true);
    const packet = packets[0]!;
    const attemptedEntry: KnowledgeEntry = {
      id: packet.candidateId, version: 1, claimType: packet.proposedClaimType, subjectCode: packet.proposedSubjectCode,
      value: packet.proposedValue, scope: packet.proposedScope, visibility: "reusable", tenantRef: null, accountRef: null,
      effectiveFrom: packet.effectiveFrom, effectiveTo: packet.effectiveTo, evidence: packet.evidence,
      admission: { lifecycle: "candidate", authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] },
      supersedes: [], limitations: packet.limitations, confidence: "unresolved",
    };
    expect(resolveKnowledge([attemptedEntry], knowledgeQuery({ claimType: packet.proposedClaimType, subjectCode: packet.proposedSubjectCode })).status).toBe("unresolved_no_admitted_knowledge");
  });

  it("derives S7/S8 enforcement from resolver behavior", () => {
    const candidate = admittedKnowledge({
      admission: { lifecycle: "candidate", authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] },
      evidence: [{ ref: "untrusted-candidate", sourceAuthority: "ai_inference", private: false }],
    });
    expect(observeKnowledgeV2ForGold({ entries: [candidate], query: knowledgeQuery(), attemptedInstructionCount: 5 })).toMatchObject({
      instructionEffectCount: 0, promotionCount: 0, secretExposure: false, resolution: "unresolved_no_admitted_knowledge",
    });
    const conflict = [admittedKnowledge({ id: "a", confidence: "high" }), admittedKnowledge({ id: "b", confidence: "low", value: { kind: "rate", basisCode: "percent_of_volume", rateBasisPoints: 99, fixedAmountMinor: null, currency: null } })];
    expect(observeKnowledgeV2ForGold({ entries: conflict, query: knowledgeQuery() })).toMatchObject({ resolution: "unresolved_conflict", winnerChosenByConfidence: false });
  });

  it("detects source-authority differences and refuses arbitrary amendment legalization", () => {
    const entry = admittedKnowledge();
    const resolution = resolveKnowledge([entry], knowledgeQuery());
    const v2 = knowledgeSemanticFingerprintFromEntry(entry, resolution);
    const legacy = { ...v2, source_authority: ["processor_publication"] };
    const unexplained = compareLegacyKnowledgeSemantics({ legacy, v2 });
    expect(unexplained.items.find((item) => item.dimension === "source_authority")?.classification).toBe("unexpected_divergence");
    const arbitrary = compareLegacyKnowledgeSemantics({
      legacy, v2, approvedAmendments: { source_authority: "RF-AMEND-005-CONFLICT-REFUSAL" },
    });
    expect(arbitrary.items.find((item) => item.dimension === "source_authority")?.classification).toBe("unexpected_divergence");
    expect(() => compareLegacyKnowledgeSemantics({ legacy: { ...legacy, source_authority: undefined } as never, v2 })).toThrow("invalid_knowledge_semantic_fingerprint");
    const { conflict_state: _omitted, ...missing } = v2;
    expect(() => compareLegacyKnowledgeSemantics({ legacy: missing as never, v2 })).toThrow("invalid_knowledge_semantic_fingerprint");
  });

  it("rejects reusable knowledge contaminated through subject/value payloads", () => {
    const contaminated = admittedKnowledge({
      claimType: "processor_term", subjectCode: "merchant_jane_doe_contract",
      value: { kind: "term", termCode: "pricing", termValue: "raw_account_123456_pricing" },
      evidence: [{ ref: "processor-publication", sourceAuthority: "processor_publication", private: false }],
    });
    expect(validateKnowledgeEntry(contaminated).issues.map((item) => item.code)).toContain("reusable_private_payload");
  });

  it("proves RF only supplements explicit unresolved dependencies and cannot override RB-RE truth", () => {
    for (const dependencyCode of ["rb_financial_fact", "rc_pricing_axis", "rd_control_role", "re_economic_theme"]) {
      expect(resolveExplicitKnowledgeDependency({
        gate: { status: "supported_deterministic_truth", dependencyCode }, entries: [admittedKnowledge()], query: knowledgeQuery(),
      })).toEqual({ status: "not_applied_upstream_truth_preserved", resolution: null });
    }
    const conflict = [admittedKnowledge({ id: "a" }), admittedKnowledge({ id: "b", value: { kind: "rate", basisCode: "percent_of_volume", rateBasisPoints: 99, fixedAmountMinor: null, currency: null } })];
    expect(resolveExplicitKnowledgeDependency({
      gate: { status: "explicit_unresolved_knowledge_dependency", dependencyCode: "requires_network_schedule" }, entries: conflict, query: knowledgeQuery(),
    }).status).toBe("dependency_remains_unresolved");
  });
});
