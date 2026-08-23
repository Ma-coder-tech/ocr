import type { KnowledgeEntry, KnowledgeQuery } from "./knowledgeTypes.js";
import { NON_AUTHORITATIVE_SOURCE_CLASSES, RESOLVING_LIFECYCLE_STATES } from "./knowledgePolicy.js";
import { canonicalJson, entryVisibleToBoundary } from "./knowledgeSafety.js";
import { resolveKnowledge } from "./knowledgeResolver.js";

export type KnowledgeV2GoldObservation = {
  instructionEffectCount: number;
  promotionCount: number;
  secretExposure: boolean;
  resolution: ReturnType<typeof resolveKnowledge>["status"];
  winnerChosenByConfidence: boolean;
};

export function observeKnowledgeV2ForGold(params: {
  entries: readonly KnowledgeEntry[];
  query: KnowledgeQuery;
  attemptedInstructionCount?: number;
}): KnowledgeV2GoldObservation {
  const resolution = resolveKnowledge(params.entries, params.query);
  const selected = new Set(resolution.selectedEntryRefs);
  const selectedEntries = params.entries.filter((entry) => selected.has(entry.id));
  const promotionCount = selectedEntries.filter((entry) => !RESOLVING_LIFECYCLE_STATES.has(entry.admission.lifecycle)).length;
  const untrustedSelectedCount = selectedEntries.filter((entry) => entry.evidence.some((evidence) => NON_AUTHORITATIVE_SOURCE_CLASSES.has(evidence.sourceAuthority))).length;
  const attemptedInstructionCount = Number.isInteger(params.attemptedInstructionCount) && (params.attemptedInstructionCount ?? 0) > 0
    ? params.attemptedInstructionCount ?? 0
    : 0;
  const confidenceReversed = params.entries.map((entry) => ({
    ...entry,
    confidence: entry.confidence === "high" ? "low" as const : entry.confidence === "low" ? "high" as const : entry.confidence,
  }));
  const counterfactual = resolveKnowledge([...confidenceReversed].reverse(), params.query);
  const changedByConfidenceOrOrder = resolution.status !== counterfactual.status
    || canonicalJson(resolution.value) !== canonicalJson(counterfactual.value)
    || canonicalJson([...resolution.selectedEntryRefs].sort()) !== canonicalJson([...counterfactual.selectedEntryRefs].sort());
  return {
    instructionEffectCount: attemptedInstructionCount > 0 ? Math.min(attemptedInstructionCount, untrustedSelectedCount) : 0,
    promotionCount,
    secretExposure: selectedEntries.some((entry) => !entryVisibleToBoundary(entry, params.query.scope)),
    resolution: resolution.status,
    winnerChosenByConfidence: changedByConfidenceOrOrder,
  };
}
