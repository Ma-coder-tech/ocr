import type { RetrievedDocument } from "./feeKnowledgeRetrieval.js";
import {
  classifyUnknownFeeSourceLaneV1,
  decideUnknownFeeResearchStopV1,
  type UnknownFeeQueryShapeKind,
  type UnknownFeeResearchPlanV1,
  type UnknownFeeResearchStopDecisionV1,
  type UnknownFeeSourceLane,
} from "./unknownFeeResearchCalibrationV1.js";

export type CalibratedResearchDiscoveryCandidateV1 = {
  url: string;
  title: string | null;
  publisher: string | null;
};

export type CalibratedResearchSynthesisV1 = {
  candidateInterpretations: Array<{
    claim: string;
    affectedDeterminants: Array<"D1" | "D2" | "D3" | "D4">;
    confidence: "low" | "medium" | "high";
    competingInterpretation: string | null;
    sourceUrls: string[];
  }>;
  determinantLift: Array<"D1" | "D2" | "D3" | "D4">;
  actionLift: boolean;
  evidenceTierImproved: boolean;
};

export type CalibratedUnknownFeeResearchAdaptersV1 = {
  search: (input: {
    plan: UnknownFeeResearchPlanV1;
    shape: UnknownFeeResearchPlanV1["queryShapes"][number];
    maximumCandidates: 2;
  }, context: { abortSignal: AbortSignal }) => Promise<CalibratedResearchDiscoveryCandidateV1[]>;
  retrieve: (candidate: CalibratedResearchDiscoveryCandidateV1, context: { abortSignal: AbortSignal }) => Promise<RetrievedDocument>;
  synthesize?: (input: {
    plan: UnknownFeeResearchPlanV1;
    evidence: Array<{
      url: string;
      title: string | null;
      publisher: string | null;
      lane: UnknownFeeSourceLane;
      boundedExcerpt: string;
    }>;
  }, context: { abortSignal: AbortSignal }) => Promise<CalibratedResearchSynthesisV1>;
};

export type CalibratedUnknownFeeResearchResultV1 = {
  feeRowId: string;
  stage0Decision: UnknownFeeResearchPlanV1["stage0"]["decision"];
  stoppingDecision: UnknownFeeResearchStopDecisionV1;
  operations: Array<{
    ordinal: number;
    type: "search" | "document_fetch" | "candidate_synthesis";
    shapeKind: UnknownFeeQueryShapeKind | null;
    status: "completed" | "failed" | "skipped";
    reasonCodes: string[];
  }>;
  queryShapeResults: Array<{
    shapeId: string;
    kind: UnknownFeeQueryShapeKind;
    candidateCount: number;
    usefulCandidateCount: number;
    reasonCodes: string[];
  }>;
  sources: Array<{
    url: string;
    title: string | null;
    publisher: string | null;
    lane: UnknownFeeSourceLane;
    discoveredByShapeIds: string[];
    retrievalStatus: RetrievedDocument["status"];
    searchUseful: boolean;
    evidenceUseful: boolean;
    authorityState: "candidate_not_admitted";
    reasonCodes: string[];
  }>;
  synthesis: CalibratedResearchSynthesisV1 | null;
  invariants: {
    canonicalMutationAllowed: false;
    reusableKnowledgeSelfAdmissionAllowed: false;
    searchUsefulnessSeparateFromAuthority: true;
    candidateCannotOverrideContradictoryStatementStructure: true;
  };
};

const LANE_RANK: Record<UnknownFeeSourceLane, number> = {
  processor_own: 0,
  acquirer_or_iso: 1,
  same_platform_statement: 2,
  procurement_or_institutional: 3,
  specialist_industry: 4,
  generic_or_ai_navigation: 5,
};

/**
 * Executes only the bounded candidate-research layer. It never writes canonical
 * facts and never admits reusable knowledge; both require a separate governed
 * review path.
 */
export async function runCalibratedUnknownFeeResearchV1(input: {
  plan: UnknownFeeResearchPlanV1;
  adapters: CalibratedUnknownFeeResearchAdaptersV1;
  abortSignal?: AbortSignal;
}): Promise<CalibratedUnknownFeeResearchResultV1> {
  const signal = input.abortSignal ?? new AbortController().signal;
  const operations: CalibratedUnknownFeeResearchResultV1["operations"] = [];
  const queryShapeResults: CalibratedUnknownFeeResearchResultV1["queryShapeResults"] = [];
  const retrievalText = new Map<string, string>();
  const discovered = new Map<string, {
    candidate: CalibratedResearchDiscoveryCandidateV1;
    lane: UnknownFeeSourceLane;
    shapeIds: Set<string>;
  }>();
  const addOperation = (operation: Omit<CalibratedUnknownFeeResearchResultV1["operations"][number], "ordinal">) => {
    operations.push({ ordinal: operations.length + 1, ...operation });
  };

  if (input.plan.stage0.decision === "STOP_WITHOUT_EXTERNAL_RESEARCH") {
    return result(input.plan, operations, queryShapeResults, [], null, decideUnknownFeeResearchStopV1({
      plan: input.plan,
      determinantSufficientAfterResearch: input.plan.stage0.determinantSufficient,
      exactIdentityStillNecessary: input.plan.stage0.exactIdentityMateriallyChangesConclusion,
      executedDistinctQueryShapes: 0,
      usableEvidenceCount: 0,
      retrievedOnlyLowQualityOrDuplicativeEvidence: false,
      evidenceOrConfidenceTierImproved: false,
      externalOperations: 0,
    }));
  }

  for (const shape of input.plan.queryShapes) {
    if (operations.length >= input.plan.budget.maximumExternalOperations || queryShapeResults.length >= input.plan.budget.maximumSearchShapes) break;
    try {
      const candidates = deduplicateCandidates((await input.adapters.search({ plan: input.plan, shape, maximumCandidates: 2 }, { abortSignal: signal })).slice(0, 2));
      for (const candidate of candidates) {
        const key = canonicalUrl(candidate.url);
        const prior = discovered.get(key);
        if (prior) prior.shapeIds.add(shape.shapeId);
        else discovered.set(key, {
          candidate,
          lane: classifyUnknownFeeSourceLaneV1({ url: candidate.url, title: candidate.title, processorName: input.plan.labelFeatures.processorName }),
          shapeIds: new Set([shape.shapeId]),
        });
      }
      addOperation({ type: "search", shapeKind: shape.kind, status: "completed", reasonCodes: candidates.length ? ["search_candidates_discovered"] : ["search_no_candidates"] });
      queryShapeResults.push({ shapeId: shape.shapeId, kind: shape.kind, candidateCount: candidates.length, usefulCandidateCount: 0, reasonCodes: candidates.length ? ["candidate_utility_pending_retrieval"] : ["no_candidate_returned"] });
      if (queryShapeResults.length >= input.plan.budget.minimumDistinctNoEvidenceShapesBeforeStop && discovered.size === 0) break;
    } catch {
      addOperation({ type: "search", shapeKind: shape.kind, status: "failed", reasonCodes: ["search_adapter_failed_without_retry"] });
      queryShapeResults.push({ shapeId: shape.shapeId, kind: shape.kind, candidateCount: 0, usefulCandidateCount: 0, reasonCodes: ["search_failed_without_retry"] });
      if (queryShapeResults.length >= input.plan.budget.minimumDistinctNoEvidenceShapesBeforeStop && discovered.size === 0) break;
    }
  }

  if (discovered.size === 0) {
    return result(input.plan, operations, queryShapeResults, [], null, decideUnknownFeeResearchStopV1({
      plan: input.plan,
      determinantSufficientAfterResearch: false,
      exactIdentityStillNecessary: input.plan.stage0.exactIdentityMateriallyChangesConclusion,
      executedDistinctQueryShapes: queryShapeResults.length,
      usableEvidenceCount: 0,
      retrievedOnlyLowQualityOrDuplicativeEvidence: false,
      evidenceOrConfidenceTierImproved: false,
      externalOperations: operations.length,
    }));
  }

  const ranked = [...discovered.values()].sort((left, right) => {
    const recurrence = right.shapeIds.size - left.shapeIds.size;
    return LANE_RANK[left.lane] - LANE_RANK[right.lane] || recurrence || left.candidate.url.localeCompare(right.candidate.url);
  });
  const sources: CalibratedUnknownFeeResearchResultV1["sources"] = [];
  for (const item of ranked) {
    if (sources.length >= input.plan.budget.maximumDocumentFetches || operations.length >= input.plan.budget.maximumExternalOperations) break;
    try {
      const document = await input.adapters.retrieve(item.candidate, { abortSignal: signal });
      addOperation({ type: "document_fetch", shapeKind: null, status: "completed", reasonCodes: document.reasonCodes });
      const searchUseful = document.status === "retrieved_text";
      const evidenceUseful = searchUseful && document.text.trim().length > 0 && textAppliesToFee(document.text, input.plan);
      if (searchUseful) retrievalText.set(canonicalUrl(item.candidate.url), document.text);
      sources.push({
        ...item.candidate,
        lane: item.lane,
        discoveredByShapeIds: [...item.shapeIds],
        retrievalStatus: document.status,
        searchUseful,
        evidenceUseful,
        authorityState: "candidate_not_admitted",
        reasonCodes: evidenceUseful ? ["retrieved_text_applies_to_fee_candidate"] : searchUseful ? ["retrieved_text_not_specific_enough"] : document.reasonCodes,
      });
      for (const shapeId of item.shapeIds) {
        const shape = queryShapeResults.find((entry) => entry.shapeId === shapeId);
        if (shape && evidenceUseful) shape.usefulCandidateCount += 1;
      }
    } catch {
      addOperation({ type: "document_fetch", shapeKind: null, status: "failed", reasonCodes: ["document_fetch_failed_without_retry"] });
      sources.push({ ...item.candidate, lane: item.lane, discoveredByShapeIds: [...item.shapeIds], retrievalStatus: "failed", searchUseful: false, evidenceUseful: false, authorityState: "candidate_not_admitted", reasonCodes: ["document_fetch_failed_without_retry"] });
    }
  }

  const usefulSources = sources.filter((source) => source.evidenceUseful);
  let synthesis: CalibratedResearchSynthesisV1 | null = null;
  if (usefulSources.length > 0 && input.adapters.synthesize && input.plan.budget.maximumSynthesisCalls > 0 && operations.length < input.plan.budget.maximumExternalOperations) {
    try {
      synthesis = await input.adapters.synthesize({
        plan: input.plan,
        evidence: usefulSources.map((source) => ({ ...source, boundedExcerpt: boundedExcerpt(retrievalText.get(canonicalUrl(source.url)) ?? "") })),
      }, { abortSignal: signal });
      addOperation({ type: "candidate_synthesis", shapeKind: null, status: "completed", reasonCodes: ["candidate_interpretations_generated_not_admitted"] });
    } catch {
      addOperation({ type: "candidate_synthesis", shapeKind: null, status: "failed", reasonCodes: ["candidate_synthesis_failed_without_retry"] });
    }
  }

  const onlyLowQuality = sources.length > 0 && usefulSources.length === 0;
  const stoppingDecision = decideUnknownFeeResearchStopV1({
    plan: input.plan,
    determinantSufficientAfterResearch: Boolean(synthesis?.determinantLift.length) && !input.plan.stage0.exactIdentityMateriallyChangesConclusion,
    exactIdentityStillNecessary: input.plan.stage0.exactIdentityMateriallyChangesConclusion,
    executedDistinctQueryShapes: queryShapeResults.length,
    usableEvidenceCount: usefulSources.length,
    retrievedOnlyLowQualityOrDuplicativeEvidence: onlyLowQuality,
    evidenceOrConfidenceTierImproved: synthesis?.evidenceTierImproved ?? false,
    externalOperations: operations.length,
  });
  return result(input.plan, operations, queryShapeResults, sources, synthesis, stoppingDecision);
}

function result(
  plan: UnknownFeeResearchPlanV1,
  operations: CalibratedUnknownFeeResearchResultV1["operations"],
  queryShapeResults: CalibratedUnknownFeeResearchResultV1["queryShapeResults"],
  sources: CalibratedUnknownFeeResearchResultV1["sources"],
  synthesis: CalibratedResearchSynthesisV1 | null,
  stoppingDecision: UnknownFeeResearchStopDecisionV1,
): CalibratedUnknownFeeResearchResultV1 {
  return {
    feeRowId: plan.feeRowId,
    stage0Decision: plan.stage0.decision,
    stoppingDecision,
    operations,
    queryShapeResults,
    sources,
    synthesis,
    invariants: {
      canonicalMutationAllowed: false,
      reusableKnowledgeSelfAdmissionAllowed: false,
      searchUsefulnessSeparateFromAuthority: true,
      candidateCannotOverrideContradictoryStatementStructure: true,
    },
  };
}

function deduplicateCandidates(candidates: CalibratedResearchDiscoveryCandidateV1[]) {
  const unique = new Map<string, CalibratedResearchDiscoveryCandidateV1>();
  for (const candidate of candidates) if (!unique.has(canonicalUrl(candidate.url))) unique.set(canonicalUrl(candidate.url), candidate);
  return [...unique.values()];
}

function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value.trim();
  }
}

function textAppliesToFee(text: string, plan: UnknownFeeResearchPlanV1) {
  const normalized = text.toUpperCase();
  const distinctive = plan.labelFeatures.codeTokens.length > 0
    ? plan.labelFeatures.codeTokens
    : plan.labelFeatures.distinctivePhrase.split(/\s+/).filter((token) => token.length >= 5 && !["OTHER", "FEES", "MONTHLY"].includes(token));
  return distinctive.length === 0 ? false : distinctive.some((token) => normalized.includes(token.toUpperCase()));
}

function boundedExcerpt(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 2_000);
}
