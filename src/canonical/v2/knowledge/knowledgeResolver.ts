import { KNOWLEDGE_CLAIM_POLICIES, RESOLVING_LIFECYCLE_STATES } from "./knowledgePolicy.js";
import type {
  KnowledgeEntry,
  KnowledgeQuery,
  KnowledgeResolution,
  KnowledgeScopeDimensionName,
  KnowledgeSourceAuthority,
} from "./knowledgeTypes.js";
import { KNOWLEDGE_SCOPE_DIMENSIONS, canonicalJson, entryVisibleToBoundary, isRecord, scopeApplies, visibilityRank } from "./knowledgeSafety.js";
import { validateKnowledgeEntry, validateKnowledgeLibrary, validateKnowledgeQuery } from "./knowledgeValidate.js";

function increment(counts: Record<string, number>, code: string): void {
  counts[code] = (counts[code] ?? 0) + 1;
}

function isVisible(entry: KnowledgeEntry, query: KnowledgeQuery): boolean {
  return entryVisibleToBoundary(entry, query.scope);
}

function isInPeriod(entry: KnowledgeEntry, asOf: string): boolean {
  return (entry.effectiveFrom === null || entry.effectiveFrom <= asOf)
    && (entry.effectiveTo === null || asOf < entry.effectiveTo);
}

function dominates(left: KnowledgeEntry, right: KnowledgeEntry): boolean {
  if (visibilityRank(left.visibility) < visibilityRank(right.visibility)) return false;
  let stricter = visibilityRank(left.visibility) > visibilityRank(right.visibility);
  for (const dimension of KNOWLEDGE_SCOPE_DIMENSIONS) {
    const l = left.scope[dimension];
    const r = right.scope[dimension];
    if (l.kind === "unknown" || r.kind === "unknown") return false;
    if (r.kind === "exact") {
      if (l.kind !== "exact" || l.value !== r.value) return false;
    } else if (l.kind === "exact") {
      stricter = true;
    }
  }
  return stricter;
}

function evidenceRank(entry: KnowledgeEntry): number {
  const groups = KNOWLEDGE_CLAIM_POLICIES[entry.claimType].precedence;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    if (entry.evidence.some((item) => group.includes(item.sourceAuthority))) return index;
  }
  return Number.POSITIVE_INFINITY;
}

function conditionsApply(entry: KnowledgeEntry, query: KnowledgeQuery): boolean {
  if (entry.admission.lifecycle !== "admitted_with_conditions") return true;
  return entry.admission.conditions.every((condition) => {
    if (condition.claimType !== query.claimType || condition.evaluation !== "satisfied") return false;
    if (condition.effectiveFrom !== null && query.asOf < condition.effectiveFrom) return false;
    if (condition.effectiveTo !== null && query.asOf >= condition.effectiveTo) return false;
    if (!condition.requiredSourceAuthorities.every((authority) => entry.evidence.some((evidence) => evidence.sourceAuthority === authority))) return false;
    return Object.entries(condition.requiredScope).every(([dimension, expected]) => query.scope[dimension as KnowledgeScopeDimensionName] === expected);
  });
}

function emptyResolution(query: KnowledgeQuery, status: KnowledgeResolution["status"], rejectedCounts: Record<string, number>): KnowledgeResolution {
  return {
    status,
    claimType: query.claimType,
    subjectCode: query.subjectCode,
    value: null,
    selectedEntryRefs: [],
    corroboratingEntryRefs: [],
    rejectedCounts,
    conflictEntryCount: 0,
    asOf: query.asOf,
    scope: { ...query.scope },
    sourceAuthorities: [],
  };
}

export function resolveKnowledge(entries: readonly KnowledgeEntry[], query: KnowledgeQuery): KnowledgeResolution {
  const rejectedCounts: Record<string, number> = {};
  if (!validateKnowledgeQuery(query).valid) return emptyResolution(query, "unresolved_policy_rejection", { invalid_query: 1 });
  const safeEntries = entries.filter((entry): entry is KnowledgeEntry => isRecord(entry));
  const claimEntries = safeEntries.filter((entry) => entry.claimType === query.claimType && entry.subjectCode === query.subjectCode);
  if (claimEntries.length === 0) return emptyResolution(query, "unresolved_no_admitted_knowledge", rejectedCounts);

  const libraryValidation = validateKnowledgeLibrary(safeEntries);
  const invalidRefs = new Set(libraryValidation.issues.filter((item) => item.entryRef !== null).map((item) => item.entryRef!));
  const candidates: KnowledgeEntry[] = [];
  let hadResolvingLifecycle = false;
  let hadScopeOrPeriodMiss = false;
  let hadVisibilityMiss = false;
  for (const entry of claimEntries) {
    if (!RESOLVING_LIFECYCLE_STATES.has(entry.admission.lifecycle)) {
      increment(rejectedCounts, "not_admitted");
      continue;
    }
    hadResolvingLifecycle = true;
    if (invalidRefs.has(entry.id) || !validateKnowledgeEntry(entry).valid) {
      increment(rejectedCounts, "policy_rejection");
      continue;
    }
    if (!isVisible(entry, query)) {
      increment(rejectedCounts, "tenant_or_account_isolation");
      hadVisibilityMiss = true;
      continue;
    }
    if (!isInPeriod(entry, query.asOf)) {
      increment(rejectedCounts, "outside_effective_period");
      hadScopeOrPeriodMiss = true;
      continue;
    }
    if (!scopeApplies(entry.scope, query.scope) || !conditionsApply(entry, query)) {
      increment(rejectedCounts, "scope_mismatch_or_unknown");
      hadScopeOrPeriodMiss = true;
      continue;
    }
    candidates.push(entry);
  }

  if (candidates.length === 0) {
    if (!hadResolvingLifecycle) return emptyResolution(query, "unresolved_no_admitted_knowledge", rejectedCounts);
    if (hadVisibilityMiss) return emptyResolution(query, "unresolved_visibility_boundary", rejectedCounts);
    if (hadScopeOrPeriodMiss) return emptyResolution(query, "unresolved_scope_or_period", rejectedCounts);
    return emptyResolution(query, "unresolved_policy_rejection", rejectedCounts);
  }

  const candidateRefs = new Set(candidates.map((entry) => entry.id));
  const explicitlySuperseded = new Set<string>();
  for (const successor of candidates) {
    for (const predecessorRef of successor.supersedes) {
      if (candidateRefs.has(predecessorRef)) explicitlySuperseded.add(predecessorRef);
    }
  }
  const active = candidates.filter((entry) => !explicitlySuperseded.has(entry.id));
  const maximal = active.filter((entry) => !active.some((other) => other.id !== entry.id && dominates(other, entry)));

  const bestRank = Math.min(...maximal.map(evidenceRank));
  const survivors = Number.isFinite(bestRank) ? maximal.filter((entry) => evidenceRank(entry) === bestRank) : maximal;
  const valueGroups = new Map<string, KnowledgeEntry[]>();
  for (const entry of survivors) {
    const key = canonicalJson(entry.value);
    valueGroups.set(key, [...(valueGroups.get(key) ?? []), entry]);
  }
  if (valueGroups.size > 1) {
    return {
      ...emptyResolution(query, "unresolved_conflict", rejectedCounts),
      conflictEntryCount: survivors.length,
    };
  }
  const selected = [...valueGroups.values()][0]!.sort((left, right) => left.id.localeCompare(right.id));
  return {
    status: selected.length > 1 ? "resolved_corroborated" : "resolved_single",
    claimType: query.claimType,
    subjectCode: query.subjectCode,
    value: selected[0]!.value,
    selectedEntryRefs: selected.map((entry) => entry.id),
    corroboratingEntryRefs: selected.length > 1 ? selected.map((entry) => entry.id) : [],
    rejectedCounts,
    conflictEntryCount: 0,
    asOf: query.asOf,
    scope: { ...query.scope },
    sourceAuthorities: [...new Set(selected.flatMap((entry) => entry.evidence.map((evidence) => evidence.sourceAuthority)))],
  };
}

export type KnowledgeDependencyGate = {
  status: "supported_deterministic_truth" | "explicit_unresolved_knowledge_dependency";
  dependencyCode: string | null;
};

export type KnowledgeDependencyResolution = {
  status: "not_applied_upstream_truth_preserved" | "knowledge_applied_to_dependency" | "dependency_remains_unresolved";
  resolution: KnowledgeResolution | null;
};

export function resolveExplicitKnowledgeDependency(params: {
  gate: KnowledgeDependencyGate;
  entries: readonly KnowledgeEntry[];
  query: KnowledgeQuery;
}): KnowledgeDependencyResolution {
  if (params.gate.status === "supported_deterministic_truth" || !params.gate.dependencyCode) {
    return { status: "not_applied_upstream_truth_preserved", resolution: null };
  }
  const resolution = resolveKnowledge(params.entries, params.query);
  return {
    status: resolution.status === "resolved_single" || resolution.status === "resolved_corroborated"
      ? "knowledge_applied_to_dependency"
      : "dependency_remains_unresolved",
    resolution,
  };
}

export function knowledgeSourcesForResolution(
  entries: readonly KnowledgeEntry[],
  resolution: KnowledgeResolution,
): KnowledgeSourceAuthority[] {
  const selected = new Set(resolution.selectedEntryRefs);
  return [...new Set(entries.filter((entry) => selected.has(entry.id)).flatMap((entry) => entry.evidence.map((item) => item.sourceAuthority)))];
}
