import { createHash } from "node:crypto";
import { ruleFor } from "../claimAuthorityF2/rules.js";
import { F3_SNAPSHOT_VERSION, type F3Period, type F3PublicAssertion, type F3PublicDimension, type F3PublicSnapshot, type F3Validity } from "./types.js";

const publicDimensions: F3PublicDimension[] = ["official_normalized_identity", "reference_comparison", "benchmark", "recurrence", "cadence"];
const publicLanes = ["governed_network_regulator", "governed_processor_acquirer_publication", "governed_public_mixed"];

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`F3 invalid public snapshot: ${message}`);
}
function keys(value: unknown, expected: string[], name: string): void {
  check(value !== null && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  check(Object.keys(value).sort().join("|") === expected.sort().join("|"), `${name} fields differ from pinned schema`);
}
function nonempty(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.trim() === value; }
function day(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
function instant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}
export function validateF3Period(value: F3Period): void {
  keys(value, ["start", "end"], "period");
  check(day(value.start) && day(value.end) && value.start <= value.end, "invalid inclusive effective dates");
}
function validateF3Validity(value: F3Validity): void {
  keys(value, ["state", "start", "end"], "validity");
  check(day(value.start), "invalid effective-from date");
  if (value.state === "explicit_bounded") {
    check(day(value.end) && value.start <= value.end, "invalid inclusive effective dates");
  } else {
    check(value.state === "unresolved_end" && value.end === null, "invalid unresolved effective end");
  }
}
function sortedUnique<T extends string>(values: T[]): T[] { return [...new Set(values)].sort(); }
function lexical(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}
function hash(value: unknown): string { return createHash("sha256").update(stable(value)).digest("hex"); }
function canonicalAssertions(input: F3PublicAssertion[]): F3PublicAssertion[] {
  return structuredClone(input).map((assertion) => ({
    ...assertion,
    dimensions: sortedUnique(assertion.dimensions),
    limitations: sortedUnique(assertion.limitations),
    conflictsWith: sortedUnique(assertion.conflictsWith),
    supersedes: sortedUnique(assertion.supersedes),
  })).sort((a, b) => lexical(a.assertionId, b.assertionId) || lexical(a.version, b.version));
}
function validateAssertion(assertion: F3PublicAssertion, recordedAt: string): void {
  keys(assertion, ["assertionId", "version", "lane", "source", "admission", "validPeriod", "scope", "dimensions", "value", "limitations", "conflictsWith", "supersedes"], "assertion");
  check(nonempty(assertion.assertionId) && nonempty(assertion.version) && publicLanes.includes(assertion.lane), "identity or public lane missing");
  keys(assertion.source, ["documentId", "sha256", "publisher", "publishedOn", "retrievedAt"], "source");
  check(nonempty(assertion.source.documentId) && /^[a-f0-9]{64}$/.test(assertion.source.sha256)
    && nonempty(assertion.source.publisher) && day(assertion.source.publishedOn) && instant(assertion.source.retrievedAt), "invalid source provenance");
  keys(assertion.admission, ["reviewerId", "decisionId", "admittedAt"], "admission");
  check(nonempty(assertion.admission.reviewerId) && nonempty(assertion.admission.decisionId) && instant(assertion.admission.admittedAt)
    && assertion.source.publishedOn <= assertion.source.retrievedAt.slice(0, 10)
    && assertion.source.retrievedAt <= assertion.admission.admittedAt
    && assertion.admission.admittedAt <= recordedAt, "invalid admission chronology");
  validateF3Validity(assertion.validPeriod);
  keys(assertion.scope, ["geography", "network", "program", "feeIdentity", "population", "basis", "unit"], "scope");
  check(nonempty(assertion.scope.geography) && (assertion.scope.network === null || nonempty(assertion.scope.network))
    && (assertion.scope.program === null || nonempty(assertion.scope.program)) && nonempty(assertion.scope.feeIdentity)
    && nonempty(assertion.scope.population) && nonempty(assertion.scope.basis) && nonempty(assertion.scope.unit), "invalid exact-match scope");
  check(Array.isArray(assertion.dimensions) && assertion.dimensions.length > 0
    && assertion.dimensions.every((dimension) => publicDimensions.includes(dimension) && ruleFor(dimension, "f3_public_assertion").allowedLanes.includes(assertion.lane)), "unauthorized public dimension");
  keys(assertion.value, assertion.value.kind === "rate" ? ["kind", "decimal"] : ["kind", "code"], "value");
  check(assertion.value.kind === "rate" ? /^\d+(\.\d+)?$/.test(assertion.value.decimal)
    : assertion.value.kind === "semantic_code" && /^[a-z][a-z0-9_]*$/.test(assertion.value.code), "invalid rate or semantic value");
  check(Array.isArray(assertion.limitations) && assertion.limitations.every(nonempty)
    && Array.isArray(assertion.conflictsWith) && assertion.conflictsWith.every(nonempty)
    && Array.isArray(assertion.supersedes) && assertion.supersedes.every(nonempty)
    && !assertion.conflictsWith.includes(assertion.assertionId) && !assertion.supersedes.includes(assertion.assertionId), "invalid provenance links");
}
function payload(snapshot: F3PublicSnapshot): Omit<F3PublicSnapshot, "snapshotId"> {
  return { schemaVersion: snapshot.schemaVersion, recordedAt: snapshot.recordedAt, assertions: snapshot.assertions };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function validateF3PublicSnapshot(snapshot: F3PublicSnapshot): void {
  keys(snapshot, ["schemaVersion", "snapshotId", "recordedAt", "assertions"], "snapshot");
  check(snapshot.schemaVersion === F3_SNAPSHOT_VERSION && instant(snapshot.recordedAt) && Array.isArray(snapshot.assertions), "schema or recorded time invalid");
  const identities = new Set<string>();
  const sourceHashes = new Map<string, string>();
  for (const assertion of snapshot.assertions) {
    validateAssertion(assertion, snapshot.recordedAt);
    const identity = `${assertion.assertionId}@${assertion.version}`;
    check(!identities.has(identity), "duplicate assertion identity");
    identities.add(identity);
    const priorHash = sourceHashes.get(assertion.source.documentId);
    check(priorHash === undefined || priorHash === assertion.source.sha256, "document ID has multiple hashes");
    sourceHashes.set(assertion.source.documentId, assertion.source.sha256);
  }
  check(stable(snapshot.assertions) === stable(canonicalAssertions(snapshot.assertions)), "assertions are not in canonical order");
  check(snapshot.snapshotId === `f3_snapshot_${hash(payload(snapshot))}`, "snapshot digest mismatch");
}
export function createF3PublicSnapshot(recordedAt: string, assertions: F3PublicAssertion[]): F3PublicSnapshot {
  check(instant(recordedAt) && Array.isArray(assertions), "recorded time or assertions invalid");
  const snapshot: F3PublicSnapshot = { schemaVersion: F3_SNAPSHOT_VERSION, snapshotId: "", recordedAt, assertions: canonicalAssertions(assertions) };
  snapshot.snapshotId = `f3_snapshot_${hash(payload(snapshot))}`;
  validateF3PublicSnapshot(snapshot);
  return freeze(snapshot);
}
