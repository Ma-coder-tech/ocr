import type {
  KnowledgeEntry,
  KnowledgeQueryScope,
  KnowledgeScope,
  KnowledgeScopeDimension,
  KnowledgeScopeDimensionName,
  KnowledgeVisibility,
} from "./knowledgeTypes.js";
import { canonicalJson } from "../canonicalJson.js";

export { canonicalJson } from "../canonicalJson.js";

export const KNOWLEDGE_SCOPE_DIMENSIONS: readonly KnowledgeScopeDimensionName[] = [
  "processor", "acquirer", "isoReseller", "processorProgram", "network", "region", "channel", "cardProduct",
  "merchantCategory", "pricingProgram", "templateFamily", "templateVersion", "sourceSection", "population", "jurisdiction",
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isCanonicalCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,127}$/.test(value);
}

export function isSafeStructuredString(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/.test(value);
}

export function isValidIsoDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

export function isValidIsoInstant(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

export function validClosedOpenInterval(from: string | null, to: string | null): boolean {
  return (from === null || isValidIsoDay(from))
    && (to === null || isValidIsoDay(to))
    && (from === null || to === null || from < to);
}

export function validateScopeShape(value: unknown): string[] {
  if (!isRecord(value) || !hasExactKeys(value, KNOWLEDGE_SCOPE_DIMENSIONS)) return ["invalid_scope_shape"];
  const issues: string[] = [];
  for (const dimension of KNOWLEDGE_SCOPE_DIMENSIONS) {
    const constraint = value[dimension];
    if (!isRecord(constraint) || typeof constraint.kind !== "string") {
      issues.push(`invalid_scope_dimension:${dimension}`);
      continue;
    }
    if (constraint.kind === "exact") {
      if (!hasExactKeys(constraint, ["kind", "value"]) || !isSafeStructuredString(constraint.value)) issues.push(`invalid_scope_dimension:${dimension}`);
    } else if ((constraint.kind === "unbounded" || constraint.kind === "unknown") && !hasExactKeys(constraint, ["kind"])) {
      issues.push(`invalid_scope_dimension:${dimension}`);
    } else if (constraint.kind !== "unbounded" && constraint.kind !== "unknown") {
      issues.push(`invalid_scope_dimension:${dimension}`);
    }
  }
  return issues;
}

export function validateQueryScopeShape(value: unknown): string[] {
  if (!isRecord(value)) return ["invalid_query_scope_shape"];
  const allowed = new Set([...KNOWLEDGE_SCOPE_DIMENSIONS, "tenantRef", "accountRef"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return ["invalid_query_scope_shape"];
  if (!("tenantRef" in value) || !("accountRef" in value)) return ["invalid_query_scope_shape"];
  if (value.tenantRef !== null && !isSafeStructuredString(value.tenantRef)) return ["invalid_query_tenant"];
  if (value.accountRef !== null && !isSafeStructuredString(value.accountRef)) return ["invalid_query_account"];
  const issues: string[] = [];
  for (const dimension of KNOWLEDGE_SCOPE_DIMENSIONS) {
    const actual = value[dimension];
    if (actual !== undefined && actual !== null && !isSafeStructuredString(actual)) issues.push(`invalid_query_scope_dimension:${dimension}`);
  }
  return issues;
}

export function scopeApplies(scope: KnowledgeScope, query: KnowledgeQueryScope): boolean {
  return KNOWLEDGE_SCOPE_DIMENSIONS.every((dimension) => {
    const constraint = scope[dimension];
    if (constraint.kind === "unknown") return false;
    if (constraint.kind === "unbounded") return true;
    const actual = query[dimension];
    return actual !== null && actual !== undefined && actual === constraint.value;
  });
}

function constraintNarrowerOrEqual(left: KnowledgeScopeDimension, right: KnowledgeScopeDimension): boolean {
  if (left.kind === "unknown" || right.kind === "unknown") return false;
  if (right.kind === "exact") return left.kind === "exact" && left.value === right.value;
  return true;
}

export function scopeNarrowerOrEqual(left: KnowledgeScope, right: KnowledgeScope): boolean {
  return KNOWLEDGE_SCOPE_DIMENSIONS.every((dimension) => constraintNarrowerOrEqual(left[dimension], right[dimension]));
}

export function scopesMayOverlap(left: KnowledgeScope, right: KnowledgeScope): boolean {
  return KNOWLEDGE_SCOPE_DIMENSIONS.every((dimension) => {
    const a = left[dimension];
    const b = right[dimension];
    if (a.kind === "unknown" || b.kind === "unknown") return false;
    return a.kind !== "exact" || b.kind !== "exact" || a.value === b.value;
  });
}

export function scopeEquals(left: KnowledgeScope, right: KnowledgeScope): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function queryScopeEquals(left: KnowledgeQueryScope, right: KnowledgeQueryScope): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function visibilityRank(visibility: KnowledgeVisibility): number {
  if (visibility === "account_private") return 2;
  if (visibility === "tenant_private") return 1;
  return 0;
}

export function entryVisibleToBoundary(entry: KnowledgeEntry, boundary: Pick<KnowledgeQueryScope, "tenantRef" | "accountRef">): boolean {
  if (entry.visibility === "reusable") return true;
  if (entry.tenantRef !== boundary.tenantRef) return false;
  return entry.visibility === "tenant_private" || entry.accountRef === boundary.accountRef;
}

export function sameOrNarrowerVisibility(successor: KnowledgeEntry, predecessor: KnowledgeEntry): boolean {
  if (visibilityRank(successor.visibility) < visibilityRank(predecessor.visibility)) return false;
  if (successor.visibility === "reusable") return predecessor.visibility === "reusable";
  if (successor.tenantRef !== predecessor.tenantRef && predecessor.visibility !== "reusable") return false;
  if (successor.visibility === "account_private" && predecessor.visibility === "account_private") {
    return successor.accountRef === predecessor.accountRef;
  }
  return true;
}

export function intervalsOverlap(
  leftFrom: string | null,
  leftTo: string | null,
  rightFrom: string | null,
  rightTo: string | null,
): boolean {
  return (leftTo === null || rightFrom === null || rightFrom < leftTo)
    && (rightTo === null || leftFrom === null || leftFrom < rightTo);
}

export function containsPrivateLocatorOrPayload(value: string): boolean {
  return /[\\/]|\.(?:pdf|json|csv|txt|xlsx?|docx?)$/i.test(value)
    || /^[a-f0-9]{32,}$/i.test(value)
    || /\b\d{6,}\b/.test(value)
    || /@/.test(value)
    || /(?:^|_)(?:merchant|account|tenant|private|raw|contract)_[a-z0-9]/i.test(value)
    || /(?:api[_-]?key|secret|credential|password)/i.test(value);
}
