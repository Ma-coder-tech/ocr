import { createHash } from "node:crypto";

import { db, nowIso } from "../../../db.js";
import { canonicalJson } from "../canonicalJson.js";
import { appendKnowledgeAuditEvent, validateKnowledgePromotion } from "../knowledge/knowledgeAudit.js";
import { sameOrNarrowerVisibility, scopeNarrowerOrEqual } from "../knowledge/knowledgeSafety.js";
import { createImmutableKnowledgeLibrary } from "../knowledge/knowledgeStore.js";
import type { KnowledgeAuditEvent, KnowledgeEntry } from "../knowledge/knowledgeTypes.js";
import { validateKnowledgeEntry, validateKnowledgeLibrary } from "../knowledge/knowledgeValidate.js";
import { canonicalRfKnowledgeSnapshot, type CanonicalRfKnowledgeInput } from "./rfClaimResolution.js";

export const GOVERNED_RF_CATALOG_SCHEMA_VERSION = "governed_rf_knowledge_catalog_v1" as const;
export const GOVERNED_RF_SNAPSHOT_SCHEMA_VERSION = "governed_rf_catalog_snapshot_v1" as const;
export const GOVERNED_RF_APPLICATION_TENANT_REF = "ratereveal_application_v1" as const;

export type GovernedRfVisibilityContext = {
  mode: "merchant_account" | "anonymous_run";
  tenantRef: string;
  accountRef: string;
  reusableKnowledge: "included";
  accountPrivateKnowledge: "exact_account_only" | "excluded";
  tenantPrivateKnowledge: "disabled";
};

export type GovernedRfCatalogBinding = {
  schemaVersion: typeof GOVERNED_RF_SNAPSHOT_SCHEMA_VERSION;
  source: "governed_catalog";
  availability: "available" | "unavailable";
  snapshotHash: string | null;
  entryRefs: string[];
  visibility: GovernedRfVisibilityContext;
  limitationCodes: string[];
};

export type GovernedRfCatalogSnapshot = GovernedRfCatalogBinding & {
  entries: readonly KnowledgeEntry[];
};

export function governedRfAccountRef(merchantId: number): string {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1) throw new Error("INVALID_RF_MERCHANT_ACCOUNT_ID");
  return `merchant_${merchantId}`;
}

export function appendGovernedRfKnowledgeVersion(input: {
  entry: KnowledgeEntry;
  auditEvent: KnowledgeAuditEvent;
}): void {
  const transaction = db.transaction(() => {
    const entries = readAllEntries();
    const events = readAllAuditEvents();
    const validation = validateKnowledgeEntry(input.entry);
    if (!validation.valid) throw new Error(`INVALID_GOVERNED_RF_ENTRY:${issueCodes(validation.issues)}`);
    assertAuditMatchesEntry(input.entry, input.auditEvent);
    appendKnowledgeAuditEvent(events, input.auditEvent);

    if (input.auditEvent.eventType === "created") {
      if (input.entry.admission.lifecycle !== "candidate" || input.auditEvent.previousEntryRef !== null) {
        throw new Error("INVALID_GOVERNED_RF_INITIAL_VERSION");
      }
    } else {
      const previous = entries.find((entry) => entry.id === input.auditEvent.previousEntryRef
        && entry.version === input.auditEvent.priorVersion);
      if (!previous) throw new Error("GOVERNED_RF_PREDECESSOR_NOT_FOUND");
      if (input.auditEvent.eventType === "admitted") {
        const promotion = validateKnowledgePromotion({
          previous,
          next: input.entry,
          event: input.auditEvent,
          existingEntries: entries,
        });
        if (!promotion.valid) throw new Error(`INVALID_GOVERNED_RF_ADMISSION:${issueCodes(promotion.issues)}`);
      } else {
        assertImmutableTransition(previous, input.entry, input.auditEvent);
      }
    }

    const libraryValidation = validateKnowledgeLibrary([...entries, input.entry]);
    if (!libraryValidation.valid) {
      throw new Error(`INVALID_GOVERNED_RF_LIBRARY:${issueCodes(libraryValidation.issues)}`);
    }
    const entryJson = canonicalJson(input.entry);
    const auditJson = canonicalJson(input.auditEvent);
    const createdAt = nowIso();
    db.prepare(`
      INSERT INTO canonical_rf_knowledge_audit_events (
        event_id, entry_ref, previous_entry_ref, event_type, prior_version, next_version,
        prior_state, next_state, prior_visibility, next_visibility, event_json, event_hash, occurred_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.auditEvent.eventId,
      input.auditEvent.entryRef,
      input.auditEvent.previousEntryRef,
      input.auditEvent.eventType,
      input.auditEvent.priorVersion,
      input.auditEvent.nextVersion,
      input.auditEvent.priorState,
      input.auditEvent.nextState,
      input.auditEvent.priorVisibility,
      input.auditEvent.nextVisibility,
      auditJson,
      digest(auditJson),
      input.auditEvent.occurredAt,
      createdAt,
    );
    db.prepare(`
      INSERT INTO canonical_rf_knowledge_entries (
        entry_ref, entry_version, claim_type, subject_code, lifecycle, visibility, tenant_ref, account_ref,
        effective_from, effective_to, entry_json, entry_hash, audit_event_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.entry.id,
      input.entry.version,
      input.entry.claimType,
      input.entry.subjectCode,
      input.entry.admission.lifecycle,
      input.entry.visibility,
      input.entry.tenantRef,
      input.entry.accountRef,
      input.entry.effectiveFrom,
      input.entry.effectiveTo,
      entryJson,
      digest(entryJson),
      input.auditEvent.eventId,
      createdAt,
    );
  });
  transaction();
}

export function loadGovernedRfCatalogSnapshot(input: {
  jobId: string;
  runId: string;
}): GovernedRfCatalogSnapshot {
  let visibility: GovernedRfVisibilityContext;
  try {
    visibility = visibilityForJob(input.jobId, input.runId);
  } catch {
    return unavailableSnapshot(anonymousVisibility(input.runId), "rf_catalog_job_boundary_unavailable");
  }
  try {
    const entries = readAllEntries();
    const events = readAllAuditEvents();
    assertStoredCatalogIntegrity(entries, events);
    const currentEntries = currentSnapshotEntries(entries, events)
      .filter((entry) => visibleToProduction(entry, visibility));
    const library = createImmutableKnowledgeLibrary(currentEntries);
    const snapshot = canonicalRfKnowledgeSnapshot(library.entries);
    return Object.freeze({
      schemaVersion: GOVERNED_RF_SNAPSHOT_SCHEMA_VERSION,
      source: "governed_catalog",
      availability: "available",
      snapshotHash: snapshot.snapshotHash,
      entryRefs: Object.freeze([...snapshot.entryRefs]) as unknown as string[],
      visibility: Object.freeze({ ...visibility }),
      limitationCodes: Object.freeze([]) as unknown as string[],
      entries: library.entries,
    });
  } catch {
    return unavailableSnapshot(visibility, "rf_catalog_read_or_validation_failed");
  }
}

export function reloadGovernedRfCatalogBinding(binding: GovernedRfCatalogBinding): GovernedRfCatalogSnapshot {
  if (!validBinding(binding) || binding.availability !== "available" || binding.snapshotHash === null) {
    return unavailableSnapshot(safeBindingVisibility(binding.visibility), "rf_catalog_previously_unavailable");
  }
  try {
    const entries = binding.entryRefs.map((entryRef) => readEntry(entryRef));
    if (entries.some((entry) => entry === null)) throw new Error("BOUND_RF_ENTRY_MISSING");
    const library = createImmutableKnowledgeLibrary(entries as KnowledgeEntry[]);
    const snapshot = canonicalRfKnowledgeSnapshot(library.entries);
    if (snapshot.snapshotHash !== binding.snapshotHash
      || canonicalJson(snapshot.entryRefs) !== canonicalJson(binding.entryRefs)) {
      throw new Error("BOUND_RF_SNAPSHOT_MISMATCH");
    }
    if (library.entries.some((entry) => !visibleToProduction(entry, binding.visibility))) {
      throw new Error("BOUND_RF_VISIBILITY_MISMATCH");
    }
    return Object.freeze({
      ...binding,
      limitationCodes: Object.freeze([...binding.limitationCodes]) as unknown as string[],
      visibility: Object.freeze({ ...binding.visibility }),
      entries: library.entries,
    });
  } catch {
    return unavailableSnapshot(binding.visibility, "rf_bound_snapshot_unavailable_or_invalid");
  }
}

function safeBindingVisibility(value: GovernedRfVisibilityContext | undefined): GovernedRfVisibilityContext {
  if (value && typeof value.tenantRef === "string" && typeof value.accountRef === "string"
    && (value.mode === "merchant_account" || value.mode === "anonymous_run")) return value;
  return {
    mode: "anonymous_run",
    tenantRef: "invalid_bound_snapshot",
    accountRef: "invalid_bound_snapshot",
    reusableKnowledge: "included",
    accountPrivateKnowledge: "excluded",
    tenantPrivateKnowledge: "disabled",
  };
}

function validBinding(binding: GovernedRfCatalogBinding): boolean {
  const visibility = binding?.visibility;
  return binding?.schemaVersion === GOVERNED_RF_SNAPSHOT_SCHEMA_VERSION
    && binding.source === "governed_catalog"
    && ["available", "unavailable"].includes(binding.availability)
    && (binding.snapshotHash === null || /^[a-f0-9]{64}$/.test(binding.snapshotHash))
    && Array.isArray(binding.entryRefs)
    && new Set(binding.entryRefs).size === binding.entryRefs.length
    && binding.entryRefs.every((entryRef) => /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*@[1-9][0-9]*$/.test(entryRef))
    && Array.isArray(binding.limitationCodes)
    && visibility !== null
    && typeof visibility === "object"
    && ["merchant_account", "anonymous_run"].includes(visibility.mode)
    && typeof visibility.tenantRef === "string"
    && typeof visibility.accountRef === "string"
    && visibility.reusableKnowledge === "included"
    && ["exact_account_only", "excluded"].includes(visibility.accountPrivateKnowledge)
    && visibility.tenantPrivateKnowledge === "disabled"
    && (visibility.mode !== "anonymous_run" || visibility.accountPrivateKnowledge === "excluded")
    && (visibility.mode !== "merchant_account" || visibility.accountPrivateKnowledge === "exact_account_only");
}

export function governedRfKnowledgeInput(snapshot: GovernedRfCatalogSnapshot): CanonicalRfKnowledgeInput {
  return {
    entries: snapshot.entries,
    tenantRef: snapshot.visibility.tenantRef,
    accountRef: snapshot.visibility.accountRef,
    binding: {
      source: snapshot.source,
      availability: snapshot.availability,
      expectedSnapshotHash: snapshot.snapshotHash,
      visibilityMode: snapshot.visibility.mode,
      tenantPrivateKnowledge: snapshot.visibility.tenantPrivateKnowledge,
      limitationCodes: [...snapshot.limitationCodes],
    },
  };
}

function visibilityForJob(jobId: string, runId: string): GovernedRfVisibilityContext {
  const row = db.prepare(`SELECT merchant_id FROM analysis_jobs WHERE id = ?`).get(jobId) as { merchant_id: number | null } | undefined;
  if (!row) throw new Error("ANALYSIS_RUN_JOB_NOT_FOUND");
  if (row.merchant_id === null || row.merchant_id === undefined) return anonymousVisibility(runId);
  const merchantId = Number(row.merchant_id);
  return {
    mode: "merchant_account",
    tenantRef: GOVERNED_RF_APPLICATION_TENANT_REF,
    accountRef: governedRfAccountRef(merchantId),
    reusableKnowledge: "included",
    accountPrivateKnowledge: "exact_account_only",
    tenantPrivateKnowledge: "disabled",
  };
}

function anonymousVisibility(runId: string): GovernedRfVisibilityContext {
  return {
    mode: "anonymous_run",
    tenantRef: `analysis_run_${runId}`,
    accountRef: `analysis_run_${runId}`,
    reusableKnowledge: "included",
    accountPrivateKnowledge: "excluded",
    tenantPrivateKnowledge: "disabled",
  };
}

function visibleToProduction(entry: KnowledgeEntry, visibility: GovernedRfVisibilityContext): boolean {
  if (entry.visibility === "reusable") return true;
  if (entry.visibility === "tenant_private") return false;
  return visibility.mode === "merchant_account"
    && entry.tenantRef === visibility.tenantRef
    && entry.accountRef === visibility.accountRef;
}

function currentSnapshotEntries(entries: KnowledgeEntry[], events: KnowledgeAuditEvent[]): KnowledgeEntry[] {
  const supersededVersionRefs = new Set(events.flatMap((event) => event.previousEntryRef ? [event.previousEntryRef] : []));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const selected = new Map<string, KnowledgeEntry>();
  const addWithSupersessionClosure = (entry: KnowledgeEntry): void => {
    if (selected.has(entry.id)) return;
    selected.set(entry.id, entry);
    for (const predecessorRef of entry.supersedes) {
      const predecessor = byId.get(predecessorRef);
      if (!predecessor) throw new Error("RF_SUPERSESSION_ENTRY_MISSING");
      addWithSupersessionClosure(predecessor);
    }
  };
  for (const entry of entries) if (!supersededVersionRefs.has(entry.id)) addWithSupersessionClosure(entry);
  return [...selected.values()].sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version);
}

function assertStoredCatalogIntegrity(entries: KnowledgeEntry[], events: KnowledgeAuditEvent[]): void {
  const library = validateKnowledgeLibrary(entries);
  if (!library.valid) throw new Error("RF_CATALOG_LIBRARY_INVALID");
  let history: readonly KnowledgeAuditEvent[] = [];
  const governedEntries: KnowledgeEntry[] = [];
  for (const event of [...events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)
    || left.nextVersion - right.nextVersion || left.eventId.localeCompare(right.eventId))) {
    history = appendKnowledgeAuditEvent(history, event);
    const entry = entries.find((candidate) => candidate.id === event.entryRef && candidate.version === event.nextVersion);
    if (!entry) throw new Error("RF_CATALOG_AUDIT_ENTRY_MISSING");
    assertAuditMatchesEntry(entry, event);
    if (event.eventType === "created") {
      if (entry.admission.lifecycle !== "candidate" || event.previousEntryRef !== null) {
        throw new Error("RF_CATALOG_INITIAL_VERSION_INVALID");
      }
      governedEntries.push(entry);
      continue;
    }
    const previous = entries.find((candidate) => candidate.id === event.previousEntryRef
      && candidate.version === event.priorVersion);
    if (!previous) throw new Error("RF_CATALOG_PREDECESSOR_ENTRY_MISSING");
    if (event.eventType === "admitted") {
      const promotion = validateKnowledgePromotion({ previous, next: entry, event, existingEntries: governedEntries });
      if (!promotion.valid) throw new Error("RF_CATALOG_ADMISSION_INVALID");
    } else {
      assertImmutableTransition(previous, entry, event);
    }
    governedEntries.push(entry);
  }
  if (events.length !== entries.length) throw new Error("RF_CATALOG_AUDIT_CARDINALITY_MISMATCH");
}

function readAllEntries(): KnowledgeEntry[] {
  const rows = db.prepare(`SELECT entry_json, entry_hash FROM canonical_rf_knowledge_entries ORDER BY created_at, entry_ref`).all() as Array<{ entry_json: string; entry_hash: string }>;
  return rows.map((row) => {
    if (digest(row.entry_json) !== row.entry_hash) throw new Error("RF_CATALOG_ENTRY_HASH_MISMATCH");
    return JSON.parse(row.entry_json) as KnowledgeEntry;
  });
}

function readEntry(versionRef: string): KnowledgeEntry | null {
  const separator = versionRef.lastIndexOf("@");
  if (separator < 1) throw new Error("INVALID_BOUND_RF_ENTRY_REF");
  const entryRef = versionRef.slice(0, separator);
  const version = Number(versionRef.slice(separator + 1));
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("INVALID_BOUND_RF_ENTRY_VERSION");
  const row = db.prepare(`SELECT entry_json, entry_hash FROM canonical_rf_knowledge_entries WHERE entry_ref = ? AND entry_version = ?`).get(entryRef, version) as { entry_json: string; entry_hash: string } | undefined;
  if (!row) return null;
  if (digest(row.entry_json) !== row.entry_hash) throw new Error("RF_CATALOG_ENTRY_HASH_MISMATCH");
  return JSON.parse(row.entry_json) as KnowledgeEntry;
}

function readAllAuditEvents(): KnowledgeAuditEvent[] {
  const rows = db.prepare(`SELECT event_json, event_hash FROM canonical_rf_knowledge_audit_events ORDER BY occurred_at, event_id`).all() as Array<{ event_json: string; event_hash: string }>;
  return rows.map((row) => {
    if (digest(row.event_json) !== row.event_hash) throw new Error("RF_CATALOG_AUDIT_HASH_MISMATCH");
    return JSON.parse(row.event_json) as KnowledgeAuditEvent;
  });
}

function assertAuditMatchesEntry(entry: KnowledgeEntry, event: KnowledgeAuditEvent): void {
  if (event.entryRef !== entry.id || event.nextVersion !== entry.version
    || event.nextState !== entry.admission.lifecycle || event.nextVisibility !== entry.visibility) {
    throw new Error("GOVERNED_RF_AUDIT_ENTRY_MISMATCH");
  }
}

function assertImmutableTransition(previous: KnowledgeEntry, next: KnowledgeEntry, event: KnowledgeAuditEvent): void {
  if (next.version !== previous.version + 1
    || next.claimType !== previous.claimType
    || next.subjectCode !== previous.subjectCode
    || event.priorState !== previous.admission.lifecycle
    || event.priorVisibility !== previous.visibility
    || !sameOrNarrowerVisibility(next, previous)
    || !scopeNarrowerOrEqual(next.scope, previous.scope)) {
    throw new Error("INVALID_GOVERNED_RF_IMMUTABLE_TRANSITION");
  }
}

function unavailableSnapshot(visibility: GovernedRfVisibilityContext, code: string): GovernedRfCatalogSnapshot {
  return Object.freeze({
    schemaVersion: GOVERNED_RF_SNAPSHOT_SCHEMA_VERSION,
    source: "governed_catalog",
    availability: "unavailable",
    snapshotHash: null,
    entryRefs: Object.freeze([]) as unknown as string[],
    visibility: Object.freeze({ ...visibility }),
    limitationCodes: Object.freeze([code]) as unknown as string[],
    entries: Object.freeze([]),
  });
}

function issueCodes(issues: readonly { code: string }[]): string {
  return [...new Set(issues.map((issue) => issue.code))].sort().join(",");
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
