import type {
  KnowledgeNotApplicableDetermination,
  KnowledgeQuery,
  KnowledgeQueryScope,
  KnowledgeResolution,
  KnowledgeSourceAuthority,
  KnowledgeUnknownQueueItem,
} from "./knowledgeTypes.js";
import { isCanonicalCode, isSafeStructuredString, isValidIsoDay, queryScopeEquals } from "./knowledgeSafety.js";
import { validateKnowledgeQuery } from "./knowledgeValidate.js";

function boundaryMatches(scope: KnowledgeQueryScope, viewer: Pick<KnowledgeQueryScope, "tenantRef" | "accountRef">): boolean {
  if (scope.tenantRef === null) return true;
  if (scope.tenantRef !== viewer.tenantRef) return false;
  return scope.accountRef === null || scope.accountRef === viewer.accountRef;
}

function freezeItem(item: KnowledgeUnknownQueueItem): KnowledgeUnknownQueueItem {
  return Object.freeze({
    ...item,
    requiredSourceAuthorities: Object.freeze([...item.requiredSourceAuthorities]) as unknown as KnowledgeSourceAuthority[],
    dependencyCodes: Object.freeze([...item.dependencyCodes]) as unknown as string[],
    originatingFactKinds: Object.freeze([...item.originatingFactKinds]) as unknown as string[],
    originatingCanonicalRefs: Object.freeze([...item.originatingCanonicalRefs]) as unknown as string[],
    scope: Object.freeze({ ...item.scope }),
    limitations: Object.freeze([...item.limitations]) as unknown as string[],
    resolvedByEntryRefs: Object.freeze([...item.resolvedByEntryRefs]) as unknown as string[],
  });
}

export function createKnowledgeUnknownQueueItem(params: {
  id: string;
  query: KnowledgeQuery;
  resolution: KnowledgeResolution;
  requiredSourceAuthorities: KnowledgeSourceAuthority[];
  dependencyCodes: string[];
  originatingFactKinds: string[];
  originatingCanonicalRefs: string[];
  blockingEffect: KnowledgeUnknownQueueItem["blockingEffect"];
  limitations: string[];
}): KnowledgeUnknownQueueItem {
  if (!validateKnowledgeQuery(params.query).valid) throw new Error("invalid_unknown_queue_query");
  if (params.resolution.status === "resolved_single" || params.resolution.status === "resolved_corroborated") throw new Error("resolved_claim_cannot_enter_unknown_queue");
  if (params.resolution.claimType !== params.query.claimType || params.resolution.subjectCode !== params.query.subjectCode
    || params.resolution.asOf !== params.query.asOf || !queryScopeEquals(params.resolution.scope, params.query.scope)) throw new Error("unknown_queue_resolution_query_mismatch");
  if (!isSafeStructuredString(params.id) || params.dependencyCodes.length === 0
    || !params.dependencyCodes.every(isCanonicalCode) || !params.originatingFactKinds.every(isCanonicalCode)
    || !params.originatingCanonicalRefs.every(isSafeStructuredString)) throw new Error("invalid_unknown_queue_metadata");
  return freezeItem({
    id: params.id,
    claimType: params.query.claimType,
    subjectCode: params.query.subjectCode,
    status: "open",
    reason: params.resolution.status,
    requiredSourceAuthorities: [...new Set(params.requiredSourceAuthorities)],
    dependencyCodes: [...new Set(params.dependencyCodes)],
    originatingFactKinds: [...new Set(params.originatingFactKinds)],
    originatingCanonicalRefs: [...new Set(params.originatingCanonicalRefs)],
    scope: { ...params.query.scope },
    asOf: params.query.asOf,
    blockingEffect: params.blockingEffect,
    limitations: [...new Set(params.limitations)],
    resolvedByEntryRefs: [],
  });
}

export function knowledgeUnknownQueueForBoundary(
  items: readonly KnowledgeUnknownQueueItem[],
  viewer: Pick<KnowledgeQueryScope, "tenantRef" | "accountRef">,
): readonly KnowledgeUnknownQueueItem[] {
  return Object.freeze(items.filter((item) => boundaryMatches(item.scope, viewer)));
}

export function closeKnowledgeUnknownQueueItem(
  item: KnowledgeUnknownQueueItem,
  closure:
    | { resolution: KnowledgeResolution; satisfiedDependencyCodes: string[]; originatingCanonicalRefs: string[] }
    | KnowledgeNotApplicableDetermination,
): KnowledgeUnknownQueueItem {
  if (!Object.isFrozen(item)) throw new Error("invalid_unknown_queue_item");
  if (item.status !== "open") throw new Error("unknown_queue_item_not_open");
  if (!("resolution" in closure)) {
    if (closure.claimType !== item.claimType || closure.subjectCode !== item.subjectCode || closure.asOf !== item.asOf
      || !queryScopeEquals(closure.scope, item.scope)) throw new Error("not_applicable_question_mismatch");
    if (!isValidIsoDay(closure.asOf) || closure.basisCodes.length === 0 || !closure.basisCodes.every(isCanonicalCode)
      || !item.dependencyCodes.every((code) => closure.dependencyCodes.includes(code))
      || !item.originatingCanonicalRefs.every((ref) => closure.originatingCanonicalRefs.includes(ref))) throw new Error("invalid_not_applicable_determination");
    return freezeItem({ ...item, status: "resolved", resolvedByEntryRefs: [] });
  }
  const { resolution, satisfiedDependencyCodes, originatingCanonicalRefs } = closure;
  if (resolution.status !== "resolved_single" && resolution.status !== "resolved_corroborated") throw new Error("unknown_queue_requires_resolved_knowledge");
  if (resolution.claimType !== item.claimType || resolution.subjectCode !== item.subjectCode || resolution.asOf !== item.asOf
    || !queryScopeEquals(resolution.scope, item.scope)) throw new Error("unknown_queue_resolution_mismatch");
  if (!item.dependencyCodes.every((code) => satisfiedDependencyCodes.includes(code))) throw new Error("unknown_queue_dependency_mismatch");
  if (!item.originatingCanonicalRefs.every((ref) => originatingCanonicalRefs.includes(ref))) throw new Error("unknown_queue_origin_mismatch");
  if (item.requiredSourceAuthorities.length > 0
    && !item.requiredSourceAuthorities.every((authority) => resolution.sourceAuthorities.includes(authority))) throw new Error("unknown_queue_source_authority_mismatch");
  return freezeItem({ ...item, status: "resolved", resolvedByEntryRefs: [...resolution.selectedEntryRefs] });
}
