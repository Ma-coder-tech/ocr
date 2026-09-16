import { describe, expect, it } from "vitest";
import {
  appendKnowledgeAuditEvent,
  closeKnowledgeUnknownQueueItem,
  createImmutableKnowledgeLibrary,
  createKnowledgeUnknownQueueItem,
  resolveKnowledge,
  validateKnowledgeEntry,
  validateKnowledgePromotion,
  type KnowledgeAuditEvent,
} from "../../../../src/canonical/v2/index.js";
import { admittedKnowledge, knowledgeQuery } from "./knowledgeFixtures.js";

const auditEvent = (overrides: Partial<KnowledgeAuditEvent> = {}): KnowledgeAuditEvent => ({
  eventId: "event-1", entryRef: "knowledge-v2", previousEntryRef: "knowledge-v1", eventType: "admitted",
  authorityClass: "authorized_domain_reviewer", authorityRef: "review-role-1", occurredAt: "2026-01-02T00:00:00Z",
  priorVersion: 1, nextVersion: 2, reasonCodes: ["claim_evidence_verified"],
  priorState: "verified", nextState: "admitted", priorVisibility: "reusable", nextVisibility: "reusable",
  policyVersion: "payments_knowledge_library_v0_2", ...overrides,
});

describe("Payments Knowledge Library v0.2 admission, audit, and unknown queue", () => {
  it("rejects automated, AI, and legacy candidate material as admitted authority", () => {
    for (const sourceAuthority of ["automated_retrieval", "ai_inference", "legacy_reference_candidate"] as const) {
      const entry = admittedKnowledge({ evidence: [{ ref: "candidate", sourceAuthority, private: false }] });
      expect(validateKnowledgeEntry(entry)).toMatchObject({ valid: false });
      expect(validateKnowledgeEntry(entry).issues.map((item) => item.code)).toContain("evidence_policy_rejection");
    }
  });

  it("rejects source-authority mismatch and reusable cross-statement recurrence", () => {
    const processorAsNetwork = admittedKnowledge({ evidence: [{ ref: "processor", sourceAuthority: "processor_publication", private: false }] });
    expect(validateKnowledgeEntry(processorAsNetwork).issues.map((item) => item.code)).toContain("evidence_policy_rejection");
    const recurrence = admittedKnowledge({ evidence: [{ ref: "cross-statement", sourceAuthority: "verified_cross_statement_observation", private: false }] });
    expect(validateKnowledgeEntry(recurrence).issues.map((item) => item.code)).toEqual(expect.arrayContaining(["observation_cannot_be_reusable_authority", "evidence_policy_rejection"]));
  });

  it("requires explicit human admission metadata", () => {
    const entry = admittedKnowledge({ admission: { lifecycle: "admitted", authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] } });
    expect(validateKnowledgeEntry(entry).issues.map((item) => item.code)).toContain("missing_human_admission");
  });

  it("prevents private evidence contamination of reusable knowledge", () => {
    const entry = admittedKnowledge({ evidence: [{ ref: "private-contract", sourceAuthority: "official_network_publication", private: true }] });
    expect(validateKnowledgeEntry(entry).issues.map((item) => item.code)).toContain("reusable_private_contamination");
  });

  it("enforces claim-specific value kinds and explicit unbounded-scope policy", () => {
    const wrongValue = admittedKnowledge({ value: { kind: "boolean", value: true } });
    expect(validateKnowledgeEntry(wrongValue).issues.map((item) => item.code)).toContain("claim_value_kind_mismatch");
    const unboundedNetwork = admittedKnowledge({ scope: { ...admittedKnowledge().scope, network: { kind: "unbounded" } } });
    expect(validateKnowledgeEntry(unboundedNetwork).issues.map((item) => item.code)).toContain("unbounded_scope_not_permitted");
  });

  it("keeps merchant account terms account-private", () => {
    const entry = admittedKnowledge({
      claimType: "merchant_account_term", subjectCode: "termination_term",
      value: { kind: "term", termCode: "termination", termValue: "contract_specific" },
      evidence: [{ ref: "contract", sourceAuthority: "merchant_contract", private: false }],
    });
    expect(validateKnowledgeEntry(entry).issues.map((item) => item.code)).toContain("account_term_scope_violation");
  });

  it("requires sequential immutable promotion and a matching audit event", () => {
    const previous = admittedKnowledge({ id: "knowledge-v1", version: 1, admission: { lifecycle: "verified", authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] } });
    const next = admittedKnowledge({ id: "knowledge-v2", version: 2 });
    expect(validateKnowledgePromotion({ previous, next, event: auditEvent() }).valid).toBe(true);
    expect(validateKnowledgePromotion({ previous, next: { ...next, version: 3 }, event: auditEvent() }).issues.map((item) => item.code)).toEqual(expect.arrayContaining(["non_sequential_version", "audit_version_mismatch"]));
    expect(validateKnowledgePromotion({ previous, next, event: auditEvent({ policyVersion: "wrong" as never }) }).issues.map((item) => item.code)).toContain("audit_policy_version_mismatch");
  });

  it("rejects automated promotion and recurrence/confidence-only promotion", () => {
    const previous = admittedKnowledge({ id: "knowledge-v1", version: 1, admission: { lifecycle: "verified", authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] } });
    const next = admittedKnowledge({ id: "knowledge-v2", version: 2 });
    const automated = auditEvent({ authorityClass: null, authorityRef: "crawler" });
    expect(validateKnowledgePromotion({ previous, next, event: automated }).issues.map((item) => item.code)).toEqual(expect.arrayContaining(["missing_audit_admission_authority", "admission_authority_mismatch"]));
    const recurrence = auditEvent({ reasonCodes: ["repeated_observation" as never] });
    expect(validateKnowledgePromotion({ previous, next, event: recurrence }).issues.map((item) => item.code)).toEqual(expect.arrayContaining(["invalid_audit_reason", "unauthorized_promotion_reason", "missing_claim_evidence_review"]));
  });

  it("refuses a promotion that silently creates an equal-scope overlapping conflict", () => {
    const previous = admittedKnowledge({ id: "knowledge-v1", version: 1, admission: { lifecycle: "verified", authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] } });
    const next = admittedKnowledge({ id: "knowledge-v2", version: 2 });
    const conflicting = admittedKnowledge({ id: "other", value: { kind: "rate", basisCode: "percent_of_volume", rateBasisPoints: 99, fixedAmountMinor: null, currency: null } });
    expect(validateKnowledgePromotion({ previous, next, event: auditEvent(), existingEntries: [conflicting] }).issues.map((item) => item.code)).toContain("unresolved_promotion_conflict");
  });

  it("requires explicit evidence review before private-to-reusable expansion", () => {
    const previous = admittedKnowledge({
      id: "knowledge-v1", version: 1, visibility: "account_private", tenantRef: "tenant-a", accountRef: "account-a",
      evidence: [{ ref: "private", sourceAuthority: "official_network_publication", private: true }],
      admission: { lifecycle: "verified", authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] },
    });
    const next = admittedKnowledge({ id: "knowledge-v2", version: 2 });
    expect(validateKnowledgePromotion({ previous, next, event: auditEvent() }).issues.map((item) => item.code)).toContain("unreviewed_scope_expansion");
    expect(validateKnowledgePromotion({ previous, next, event: auditEvent({
      priorVisibility: "account_private", reasonCodes: ["claim_evidence_verified", "scope_evidence_reviewed", "privacy_reviewed"],
    }) }).valid).toBe(true);
  });

  it("appends audit events without mutating history and rejects duplicate versions", () => {
    const first = auditEvent({
      eventId: "event-1", entryRef: "knowledge-v1", previousEntryRef: null, eventType: "created",
      authorityClass: null, authorityRef: null, occurredAt: "2026-07-01T00:00:00Z",
      priorVersion: null, nextVersion: 1, priorState: null, nextState: "candidate", priorVisibility: null,
      nextVisibility: "reusable", reasonCodes: ["created_candidate"],
    });
    const history: readonly KnowledgeAuditEvent[] = Object.freeze([first]);
    const appended = appendKnowledgeAuditEvent(history, auditEvent({
      eventId: "event-2", entryRef: "knowledge-v2", previousEntryRef: "knowledge-v1", eventType: "researched",
      authorityClass: null, authorityRef: null, occurredAt: "2026-08-01T00:00:00Z", priorVersion: 1, nextVersion: 2,
      priorState: "candidate", nextState: "researched", reasonCodes: ["research_completed"],
    }));
    expect(history).toHaveLength(1);
    expect(appended).toHaveLength(2);
    expect(Object.isFrozen(appended)).toBe(true);
    expect(() => appendKnowledgeAuditEvent(appended, first)).toThrow("duplicate_knowledge_audit_event");
  });

  it("creates a first-class unknown queue item and closes it only with resolved knowledge", () => {
    const query = knowledgeQuery();
    const unresolved = resolveKnowledge([], query);
    const item = createKnowledgeUnknownQueueItem({
      id: "unknown-1", query, resolution: unresolved,
      requiredSourceAuthorities: ["official_network_publication"], dependencyCodes: ["requires_network_schedule"],
      originatingFactKinds: ["economic_driver"],
      originatingCanonicalRefs: ["driver-opaque-1"], blockingEffect: "limits_authority", limitations: ["Network rule unavailable."],
    });
    expect(item).toMatchObject({ status: "open", reason: "unresolved_no_admitted_knowledge", resolvedByEntryRefs: [] });
    expect(() => closeKnowledgeUnknownQueueItem(item, { resolution: unresolved, satisfiedDependencyCodes: ["requires_network_schedule"], originatingCanonicalRefs: ["driver-opaque-1"] })).toThrow("unknown_queue_requires_resolved_knowledge");
    const resolved = resolveKnowledge([admittedKnowledge()], query);
    expect(closeKnowledgeUnknownQueueItem(item, { resolution: resolved, satisfiedDependencyCodes: ["requires_network_schedule"], originatingCanonicalRefs: ["driver-opaque-1"] })).toMatchObject({ status: "resolved", resolvedByEntryRefs: ["knowledge-1"] });
    expect(closeKnowledgeUnknownQueueItem(item, {
      status: "deterministically_not_applicable", claimType: query.claimType, subjectCode: query.subjectCode,
      scope: query.scope, asOf: query.asOf, dependencyCodes: ["requires_network_schedule"], originatingCanonicalRefs: ["driver-opaque-1"],
      basisCodes: ["population_not_applicable"], evidenceRefs: [],
    })).toMatchObject({ status: "resolved", resolvedByEntryRefs: [] });
  });

  it("creates an immutable, supplied in-memory library and rejects invalid libraries", () => {
    const source = [admittedKnowledge()];
    const library = createImmutableKnowledgeLibrary(source);
    source.push(admittedKnowledge({ id: "later" }));
    expect(library.entries).toHaveLength(1);
    expect(Object.isFrozen(library.entries)).toBe(true);
    expect(() => createImmutableKnowledgeLibrary([admittedKnowledge(), admittedKnowledge()])).toThrow("invalid_knowledge_library:duplicate_entry_id");
  });
});
