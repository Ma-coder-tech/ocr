import { createHash } from "node:crypto";
import {
  CONTEXTUAL_RECORD_VERSION,
  CONTEXTUAL_SNAPSHOT_VERSION,
  type ContextualKnowledgeRecord,
  type ContextualKnowledgeSnapshot,
  type ContextualQuery,
  type ContextualResolution,
  type ContextualRuleId,
  type ProhibitedClaimCode,
} from "./contracts.js";

export const REQUIRED_PROHIBITIONS: readonly ProhibitedClaimCode[] = [
  "benchmark_gap", "overpayment", "processor_markup", "ownership_or_control",
  "removability", "negotiability", "expected_savings", "verified_savings",
];

const recordKeys = [
  "schemaVersion", "id", "version", "ruleId", "ruleVersion", "evidenceClass", "sourceRef",
  "admission", "effectiveFrom", "effectiveTo", "scope", "permittedUses",
  "prohibitedClaimCodes", "presentationCeiling", "formulaCode", "supersedes", "limitations",
];

function assert(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`invalid_contextual_knowledge:${reason}`);
}

function exactKeys(value: unknown, expected: string[]): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}

function day(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{2,127}$/.test(value);
}

function safeScopeRef(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function validateContextualRecord(record: ContextualKnowledgeRecord): void {
  assert(exactKeys(record, recordKeys), "record_shape");
  assert(record.schemaVersion === CONTEXTUAL_RECORD_VERSION && safeId(record.id) &&
    Number.isSafeInteger(record.version) && record.version > 0 && record.ruleVersion === "1.0.0", "record_identity");
  assert(record.ruleId === "observed_line_item_effect" || record.ruleId === "fixed_fee_burden", "rule_not_approved");
  assert(record.evidenceClass === "product_reviewed_structural_rule" &&
    record.sourceRef === "product_contextual_policy_2026_09_24", "source_not_approved");
  assert(exactKeys(record.admission, ["lifecycle", "reviewAuthority", "decisionRef", "admittedOn"]), "admission_shape");
  assert(["candidate", "admitted", "superseded", "rejected"].includes(record.admission.lifecycle), "admission_lifecycle");
  if (record.admission.lifecycle === "admitted") {
    assert(record.admission.reviewAuthority === "Product" && safeId(record.admission.decisionRef) &&
      day(record.admission.admittedOn), "human_admission_required");
  }
  assert(day(record.effectiveFrom) && (record.effectiveTo === null || day(record.effectiveTo)) &&
    (record.effectiveTo === null || record.effectiveFrom < record.effectiveTo), "effective_interval");
  assert(exactKeys(record.scope, ["processorFamily", "statementCount", "visibility", "tenantRef", "accountRef", "merchantIdentifier"]), "scope_shape");
  const scope = record.scope;
  assert(scope.processorFamily === "fiserv_first_data" && scope.statementCount === 1, "scope_family_or_statement_count");
  assert(["reusable", "tenant_private", "account_private"].includes(scope.visibility), "visibility");
  assert(scope.merchantIdentifier === null || safeScopeRef(scope.merchantIdentifier), "merchant_scope");
  if (scope.visibility === "reusable") assert(scope.tenantRef === null && scope.accountRef === null, "reusable_privacy");
  if (scope.visibility === "tenant_private") assert(safeScopeRef(scope.tenantRef) && scope.accountRef === null, "tenant_privacy");
  if (scope.visibility === "account_private") assert(safeScopeRef(scope.tenantRef) && safeScopeRef(scope.accountRef), "account_privacy");
  const expectedUse = record.ruleId === "observed_line_item_effect" ? "display_observed_amount" : "contextual_cost_burden";
  const expectedCeiling = record.ruleId === "observed_line_item_effect" ? "observed_signed_contribution_only" : "observed_fixed_cost_burden_only";
  const expectedFormula = record.ruleId === "observed_line_item_effect" ? "included_signed_fee_row_v1" : "proven_fixed_charges_over_processed_volume_v1";
  assert(Array.isArray(record.permittedUses) && record.permittedUses.length === 1 && record.permittedUses[0] === expectedUse &&
    record.presentationCeiling === expectedCeiling && record.formulaCode === expectedFormula, "permission_or_formula_not_approved");
  assert(Array.isArray(record.prohibitedClaimCodes) &&
    [...new Set(record.prohibitedClaimCodes)].sort().join("|") === [...REQUIRED_PROHIBITIONS].sort().join("|"), "prohibitions_incomplete");
  assert(Array.isArray(record.supersedes) && record.supersedes.every(safeId) &&
    new Set(record.supersedes).size === record.supersedes.length && !record.supersedes.includes(record.id), "supersession_shape");
  assert(Array.isArray(record.limitations) && record.limitations.length > 0 &&
    record.limitations.every((item) => typeof item === "string" && item.trim().length > 0), "limitations_required");
}

function validateRecords(records: readonly ContextualKnowledgeRecord[]): void {
  const ids = new Set<string>();
  const byId = new Map<string, ContextualKnowledgeRecord>();
  for (const record of records) {
    validateContextualRecord(record);
    assert(!ids.has(record.id), "duplicate_record_id");
    ids.add(record.id);
    byId.set(record.id, record);
  }
  for (const record of records) for (const priorId of record.supersedes) {
    const prior = byId.get(priorId);
    assert(prior && prior.ruleId === record.ruleId && prior.version < record.version &&
      prior.effectiveFrom <= record.effectiveFrom, "invalid_supersession_link");
    assert(prior.scope.visibility === record.scope.visibility && prior.scope.tenantRef === record.scope.tenantRef &&
      prior.scope.accountRef === record.scope.accountRef &&
      (prior.scope.merchantIdentifier === null || prior.scope.merchantIdentifier === record.scope.merchantIdentifier), "cross_scope_supersession");
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    assert(!visiting.has(id), "circular_supersession");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prior of byId.get(id)?.supersedes ?? []) visit(prior);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
}

export function createContextualSnapshot(recordedOn: string, records: readonly ContextualKnowledgeRecord[]): ContextualKnowledgeSnapshot {
  assert(day(recordedOn), "snapshot_date");
  const copied = structuredClone([...records]).sort((a, b) => a.id.localeCompare(b.id));
  validateRecords(copied);
  assert(copied.every((record) => record.admission.admittedOn === null || record.admission.admittedOn <= recordedOn), "future_admission");
  const payload = { schemaVersion: CONTEXTUAL_SNAPSHOT_VERSION, recordedOn, records: copied };
  return freeze({ ...payload, snapshotId: `contextual_snapshot_${digest(payload)}` });
}

export function validateContextualSnapshot(snapshot: ContextualKnowledgeSnapshot): void {
  assert(exactKeys(snapshot, ["schemaVersion", "snapshotId", "recordedOn", "records"]) &&
    snapshot.schemaVersion === CONTEXTUAL_SNAPSHOT_VERSION && day(snapshot.recordedOn) &&
    Array.isArray(snapshot.records), "snapshot_shape");
  validateRecords(snapshot.records);
  assert(snapshot.records.every((record) => record.admission.admittedOn === null || record.admission.admittedOn <= snapshot.recordedOn), "future_admission");
  assert(snapshot.records.map((record) => record.id).join("|") ===
    [...snapshot.records].sort((a, b) => a.id.localeCompare(b.id)).map((record) => record.id).join("|"), "snapshot_order");
  const payload = { schemaVersion: snapshot.schemaVersion, recordedOn: snapshot.recordedOn, records: snapshot.records };
  assert(snapshot.snapshotId === `contextual_snapshot_${digest(payload)}`, "snapshot_digest");
}

function scopeMatches(record: ContextualKnowledgeRecord, query: ContextualQuery): boolean {
  const scope = record.scope;
  if (scope.processorFamily !== query.processorFamily) return false;
  if (scope.merchantIdentifier !== null && scope.merchantIdentifier !== query.merchantIdentifier) return false;
  if (scope.visibility === "reusable") return true;
  if (scope.tenantRef !== query.tenantRef) return false;
  return scope.visibility === "tenant_private" || scope.accountRef === query.accountRef;
}

function unavailable(query: ContextualQuery, reasonCode: string): ContextualResolution {
  return { status: "not_assessed", reasonCodes: [reasonCode], snapshotId: query.snapshotId, ruleId: query.ruleId, record: null };
}

export function resolveContextualRule(snapshot: ContextualKnowledgeSnapshot, query: ContextualQuery): ContextualResolution {
  try { validateContextualSnapshot(snapshot); }
  catch { return unavailable(query, "invalid_pinned_snapshot"); }
  if (!day(query.asOf) || !(["observed_line_item_effect", "fixed_fee_burden"] as ContextualRuleId[]).includes(query.ruleId)) {
    return unavailable(query, "invalid_query");
  }
  if (query.snapshotId !== snapshot.snapshotId) return unavailable(query, "snapshot_pin_mismatch");
  if (query.asOf < snapshot.recordedOn) return unavailable(query, "assessment_predates_pinned_snapshot");
  if (query.processorFamily !== "fiserv_first_data") return unavailable(query, "unsupported_processor_family");
  const sameRule = snapshot.records.filter((record) => record.ruleId === query.ruleId);
  const admitted = sameRule.filter((record) => record.admission.lifecycle === "admitted" &&
    record.admission.admittedOn !== null && record.admission.admittedOn <= query.asOf);
  const inDate = admitted.filter((record) => record.effectiveFrom <= query.asOf &&
    (record.effectiveTo === null || query.asOf < record.effectiveTo));
  const scoped = inDate.filter((record) => scopeMatches(record, query));
  if (!scoped.length) return unavailable(query, sameRule.length === 0 ? "no_rule_record" :
    admitted.length === 0 ? "rule_not_admitted" : inDate.length === 0 ? "outside_effective_period" : "scope_or_privacy_mismatch");
  const active = scoped.filter((record) => !scoped.some((later) => later.supersedes.includes(record.id)));
  if (active.length !== 1) return unavailable(query, "unresolved_rule_conflict");
  return { status: "resolved", reasonCodes: [], snapshotId: snapshot.snapshotId, ruleId: query.ruleId, record: active[0]! };
}
