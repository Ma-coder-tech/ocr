import type { KnowledgeEntry, KnowledgeQueryScope, KnowledgeResolution, KnowledgeUnknownQueueItem } from "./knowledgeTypes.js";
import { entryVisibleToBoundary } from "./knowledgeSafety.js";
import { knowledgeUnknownQueueForBoundary } from "./knowledgeUnknownQueue.js";

export type KnowledgePrivacySafeDiagnostics = {
  schemaVersion: "payments_knowledge_library_v0_2";
  entryCount: number;
  admittedEntryCount: number;
  candidateEntryCount: number;
  resolutionCounts: Record<string, number>;
  conflictCount: number;
  openUnknownCount: number;
  privateEntryCount: number;
};

export function knowledgePrivacySafeDiagnostics(params: {
  entries: readonly KnowledgeEntry[];
  resolutions: readonly KnowledgeResolution[];
  unknownQueue: readonly KnowledgeUnknownQueueItem[];
  viewer: Pick<KnowledgeQueryScope, "tenantRef" | "accountRef">;
}): KnowledgePrivacySafeDiagnostics {
  const entries = params.entries.filter((entry) => entryVisibleToBoundary(entry, params.viewer));
  const resolutions = params.resolutions.filter((resolution) => {
    if (resolution.scope.tenantRef === null) return true;
    if (resolution.scope.tenantRef !== params.viewer.tenantRef) return false;
    return resolution.scope.accountRef === null || resolution.scope.accountRef === params.viewer.accountRef;
  });
  const unknownQueue = knowledgeUnknownQueueForBoundary(params.unknownQueue, params.viewer);
  const resolutionCounts: Record<string, number> = {};
  for (const resolution of resolutions) resolutionCounts[resolution.status] = (resolutionCounts[resolution.status] ?? 0) + 1;
  return {
    schemaVersion: "payments_knowledge_library_v0_2",
    entryCount: entries.length,
    admittedEntryCount: entries.filter((entry) => entry.admission.lifecycle === "admitted" || entry.admission.lifecycle === "admitted_with_conditions").length,
    candidateEntryCount: entries.filter((entry) => entry.admission.lifecycle === "candidate").length,
    resolutionCounts,
    conflictCount: resolutions.filter((resolution) => resolution.status === "unresolved_conflict").length,
    openUnknownCount: unknownQueue.filter((item) => item.status === "open").length,
    privateEntryCount: entries.filter((entry) => entry.visibility !== "reusable").length,
  };
}

export function knowledgeDiagnosticsContainPrivatePayload(diagnostics: KnowledgePrivacySafeDiagnostics): boolean {
  const serialized = JSON.stringify(diagnostics);
  return /merchant|filename|source(hash|fingerprint|id)|raw(evidence|label)|tenantref|accountref/i.test(serialized);
}
