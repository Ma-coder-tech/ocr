import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveKnowledge,
  unboundedKnowledgeScope,
  type KnowledgeAuditEvent,
  type KnowledgeEntry,
} from "../../../../src/canonical/v2/index.js";
import { admittedKnowledge } from "../knowledge/knowledgeFixtures.js";

describe("durable governed RF knowledge catalog", () => {
  let dbModule: typeof import("../../../../src/db.js");

  beforeEach(() => {
    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = ":memory:";
  });

  afterEach(() => {
    dbModule?.db.close();
    delete process.env.FEECLEAR_DB_PATH;
  });

  it("persists audited immutable versions while keeping candidates non-authoritative", async () => {
    const [store, catalog, loadedDb] = await Promise.all([
      import("../../../../src/store.js"),
      import("../../../../src/canonical/v2/runtime/rfKnowledgeCatalog.js"),
      import("../../../../src/db.js"),
    ]);
    dbModule = loadedDb;
    const job = store.createJob({ fileName: "statement.pdf", filePath: "opaque", fileType: "pdf", businessType: "retail" });
    const empty = catalog.loadGovernedRfCatalogSnapshot({ jobId: job.id, runId: "run-empty" });
    expect(empty).toMatchObject({ availability: "available", entryRefs: [], visibility: { mode: "anonymous_run" } });

    const subjectCode = "economic_category_catalog_test";
    const admitted = categoryEntry({ id: "catalog-admitted", version: 2, subjectCode });
    const candidate = candidateVersion(admitted, "catalog-candidate");
    catalog.appendGovernedRfKnowledgeVersion({ entry: candidate, auditEvent: createdEvent(candidate, "catalog-created") });

    const candidateSnapshot = catalog.loadGovernedRfCatalogSnapshot({ jobId: job.id, runId: "run-candidate" });
    expect(candidateSnapshot).toMatchObject({ availability: "available", entryRefs: [`${candidate.id}@1`] });
    expect(resolveKnowledge(candidateSnapshot.entries, {
      claimType: "stable_facet_mapping",
      subjectCode,
      asOf: "2026-08-01",
      scope: { tenantRef: candidateSnapshot.visibility.tenantRef, accountRef: candidateSnapshot.visibility.accountRef },
    })).toMatchObject({ status: "unresolved_no_admitted_knowledge", rejectedCounts: { not_admitted: 1 } });

    catalog.appendGovernedRfKnowledgeVersion({
      entry: admitted,
      auditEvent: admissionEvent(candidate, admitted, "catalog-admission"),
    });
    const admittedSnapshot = catalog.loadGovernedRfCatalogSnapshot({ jobId: job.id, runId: "run-admitted" });
    expect(admittedSnapshot).toMatchObject({ availability: "available", entryRefs: [`${admitted.id}@2`] });
    expect(resolveKnowledge(admittedSnapshot.entries, {
      claimType: "stable_facet_mapping",
      subjectCode,
      asOf: "2026-08-01",
      scope: { tenantRef: admittedSnapshot.visibility.tenantRef, accountRef: admittedSnapshot.visibility.accountRef },
    }).status).toBe("resolved_single");

    expect(() => loadedDb.db.prepare(`UPDATE canonical_rf_knowledge_entries SET lifecycle = 'candidate' WHERE entry_ref = ?`).run(admitted.id))
      .toThrow("canonical_rf_catalog_is_append_only");
    expect(() => loadedDb.db.prepare(`DELETE FROM canonical_rf_knowledge_audit_events WHERE event_id = ?`).run("catalog-admission"))
      .toThrow("canonical_rf_catalog_is_append_only");
  });

  it("admits account-private knowledge only to the exact merchant account and disables tenant-wide sharing", async () => {
    const [store, catalog, loadedDb] = await Promise.all([
      import("../../../../src/store.js"),
      import("../../../../src/canonical/v2/runtime/rfKnowledgeCatalog.js"),
      import("../../../../src/db.js"),
    ]);
    dbModule = loadedDb;
    const merchantA = createMerchant(loadedDb.db, "a@example.test");
    const merchantB = createMerchant(loadedDb.db, "b@example.test");
    const jobA = store.createJob({ fileName: "a.pdf", filePath: "opaque-a", fileType: "pdf", businessType: "retail", merchantId: merchantA });
    const jobB = store.createJob({ fileName: "b.pdf", filePath: "opaque-b", fileType: "pdf", businessType: "retail", merchantId: merchantB });
    const anonymous = store.createJob({ fileName: "anon.pdf", filePath: "opaque-c", fileType: "pdf", businessType: "retail" });
    const subjectCode = "economic_category_private_catalog_test";
    const accountRef = catalog.governedRfAccountRef(merchantA);
    const admitted = categoryEntry({
      id: "account-map-admitted",
      version: 2,
      subjectCode,
      visibility: "account_private",
      tenantRef: catalog.GOVERNED_RF_APPLICATION_TENANT_REF,
      accountRef,
    });
    const candidate = candidateVersion(admitted, "account-map-candidate");
    catalog.appendGovernedRfKnowledgeVersion({ entry: candidate, auditEvent: createdEvent(candidate, "account-map-created") });
    catalog.appendGovernedRfKnowledgeVersion({ entry: admitted, auditEvent: admissionEvent(candidate, admitted, "account-map-admission") });

    const snapshotA = catalog.loadGovernedRfCatalogSnapshot({ jobId: jobA.id, runId: "run-a" });
    const snapshotB = catalog.loadGovernedRfCatalogSnapshot({ jobId: jobB.id, runId: "run-b" });
    const snapshotAnonymous = catalog.loadGovernedRfCatalogSnapshot({ jobId: anonymous.id, runId: "run-anon" });
    expect(snapshotA.entryRefs).toEqual([`${admitted.id}@2`]);
    expect(snapshotA.visibility).toMatchObject({
      mode: "merchant_account", accountRef, accountPrivateKnowledge: "exact_account_only", tenantPrivateKnowledge: "disabled",
    });
    expect(snapshotB.entryRefs).toEqual([]);
    expect(snapshotAnonymous.entryRefs).toEqual([]);

    const tenantAdmitted = categoryEntry({
      id: "tenant-map-admitted", version: 2, subjectCode: "economic_category_tenant_test",
      visibility: "tenant_private", tenantRef: catalog.GOVERNED_RF_APPLICATION_TENANT_REF, accountRef: null,
    });
    const tenantCandidate = candidateVersion(tenantAdmitted, "tenant-map-candidate");
    catalog.appendGovernedRfKnowledgeVersion({ entry: tenantCandidate, auditEvent: createdEvent(tenantCandidate, "tenant-map-created") });
    catalog.appendGovernedRfKnowledgeVersion({ entry: tenantAdmitted, auditEvent: admissionEvent(tenantCandidate, tenantAdmitted, "tenant-map-admission") });
    expect(catalog.loadGovernedRfCatalogSnapshot({ jobId: jobA.id, runId: "run-a-2" }).entryRefs)
      .toEqual([`${admitted.id}@2`]);
  });

  it("rejects conflicting admission and reports corrupted or unavailable catalog state without treating it as empty", async () => {
    const [store, catalog, loadedDb] = await Promise.all([
      import("../../../../src/store.js"),
      import("../../../../src/canonical/v2/runtime/rfKnowledgeCatalog.js"),
      import("../../../../src/db.js"),
    ]);
    dbModule = loadedDb;
    const job = store.createJob({ fileName: "statement.pdf", filePath: "opaque", fileType: "pdf", businessType: "retail" });
    const first = categoryEntry({ id: "conflict-a-admitted", version: 2, subjectCode: "economic_category_conflict_test" });
    const firstCandidate = candidateVersion(first, "conflict-a-candidate");
    catalog.appendGovernedRfKnowledgeVersion({ entry: firstCandidate, auditEvent: createdEvent(firstCandidate, "conflict-a-created") });
    catalog.appendGovernedRfKnowledgeVersion({ entry: first, auditEvent: admissionEvent(firstCandidate, first, "conflict-a-admission") });

    const conflicting = categoryEntry({
      id: "conflict-b-admitted", version: 2, subjectCode: first.subjectCode,
      value: { kind: "mapping", canonicalCode: "processing_fee_tax", sourceCode: first.subjectCode },
    });
    const conflictingCandidate = candidateVersion(conflicting, "conflict-b-candidate");
    catalog.appendGovernedRfKnowledgeVersion({ entry: conflictingCandidate, auditEvent: createdEvent(conflictingCandidate, "conflict-b-created") });
    expect(() => catalog.appendGovernedRfKnowledgeVersion({
      entry: conflicting,
      auditEvent: admissionEvent(conflictingCandidate, conflicting, "conflict-b-admission"),
    })).toThrow(/unresolved_promotion_conflict/);
    expect(loadedDb.db.prepare(`SELECT COUNT(*) AS count FROM canonical_rf_knowledge_entries`).get()).toEqual({ count: 3 });

    loadedDb.db.exec(`DROP TABLE canonical_rf_knowledge_entries`);
    const unavailable = catalog.loadGovernedRfCatalogSnapshot({ jobId: job.id, runId: "run-unavailable" });
    expect(unavailable).toMatchObject({
      availability: "unavailable", snapshotHash: null, entryRefs: [],
      limitationCodes: ["rf_catalog_read_or_validation_failed"],
    });
    expect(unavailable).not.toMatchObject({ availability: "available" });
  });
});

function categoryEntry(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  const subjectCode = overrides.subjectCode ?? "economic_category_catalog_test";
  return admittedKnowledge({
    claimType: "stable_facet_mapping",
    subjectCode,
    value: { kind: "mapping", canonicalCode: "other_source_grounded_fee", sourceCode: subjectCode },
    scope: unboundedKnowledgeScope(),
    effectiveFrom: "2020-01-01",
    evidence: [{ ref: "reviewed-catalog-map", sourceAuthority: "approved_internal_manual_mapping", private: false }],
    ...overrides,
  });
}

function candidateVersion(admitted: KnowledgeEntry, id: string): KnowledgeEntry {
  return {
    ...admitted,
    id,
    version: 1,
    admission: { lifecycle: "candidate", authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] },
    confidence: "unresolved",
  };
}

function createdEvent(entry: KnowledgeEntry, eventId: string): KnowledgeAuditEvent {
  return {
    eventId, entryRef: entry.id, previousEntryRef: null, eventType: "created",
    authorityClass: null, authorityRef: null, occurredAt: "2026-01-01T00:00:00Z",
    priorVersion: null, nextVersion: entry.version, priorState: null, nextState: "candidate",
    priorVisibility: null, nextVisibility: entry.visibility, reasonCodes: ["created_candidate"],
    policyVersion: "payments_knowledge_library_v0_2",
  };
}

function admissionEvent(previous: KnowledgeEntry, next: KnowledgeEntry, eventId: string): KnowledgeAuditEvent {
  return {
    eventId, entryRef: next.id, previousEntryRef: previous.id, eventType: "admitted",
    authorityClass: next.admission.authorityClass, authorityRef: next.admission.authorityRef,
    occurredAt: next.admission.admittedAt!, priorVersion: previous.version, nextVersion: next.version,
    priorState: previous.admission.lifecycle, nextState: next.admission.lifecycle,
    priorVisibility: previous.visibility, nextVisibility: next.visibility,
    reasonCodes: ["claim_evidence_verified"], policyVersion: "payments_knowledge_library_v0_2",
  };
}

function createMerchant(database: typeof import("better-sqlite3").default.prototype, email: string): number {
  const now = "2026-08-01T00:00:00.000Z";
  const result = database.prepare(`
    INSERT INTO merchants (email, first_name, last_name, password_hash, created_at, updated_at)
    VALUES (?, 'Test', 'Merchant', 'not-a-real-password-hash', ?, ?)
  `).run(email, now, now);
  return Number(result.lastInsertRowid);
}
