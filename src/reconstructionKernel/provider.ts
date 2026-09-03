import { createHash } from "node:crypto";

import type {
  EventNode,
  EvidenceNeed,
  Hypothesis,
  InferenceConfidenceLevel,
  InferenceTopic,
  Observation,
  PopulationNode,
  ScalarValue,
} from "./types.js";

export const HYPOTHESIS_PROPOSAL_SCHEMA = "source_bound_hypothesis_proposal_v2" as const;
export const MAX_PROVIDER_HYPOTHESES = 16;
export const MAX_PROVIDER_CLAIMS_PER_HYPOTHESIS = 16;

export interface SourceBoundProposalObservation {
  observationRef: string;
  kind: Observation["kind"];
  value: ScalarValue;
  sourceAuthority: Observation["authority"];
  sourceLocation: Pick<Observation["locator"], "page" | "section" | "row" | "label">;
  extractedText: string | null;
  relatedObservationRefs: string[];
}

export interface HypothesisProposalRequest {
  schemaVersion: typeof HYPOTHESIS_PROPOSAL_SCHEMA;
  sourceDocument: {
    documentId: string;
    sourceDocumentRef: string;
    sourceContentSha256: string;
  };
  observations: SourceBoundProposalObservation[];
  allowedObservationRefs: string[];
  inferenceTopics: SourceBoundInferenceTopic[];
  authorityPolicy: {
    providerOutput: "proposal_only";
    canonicalAuthority: "prohibited";
    controlSelection: "prohibited";
  };
}

export interface SourceBoundInferenceTopic {
  topicRef: string;
  question: string;
  observationRefs: string[];
  allowedClaims: Array<{ key: string; allowedValues: ScalarValue[] }>;
  knownEvidenceGaps: Array<{
    evidenceNeedRef: string;
    description: string;
    material: boolean;
  }>;
}

export interface ProviderClaimProposal {
  key: string;
  value: ScalarValue;
  observationRefs: string[];
}

export interface ProviderHypothesisProposal {
  id: string;
  topicRef: string;
  description: string;
  observationRefs: string[];
  events: EventNode[];
  populations: PopulationNode[];
  claims: ProviderClaimProposal[];
  inference: {
    confidence: InferenceConfidenceLevel;
    rationale: string;
    missingProof: string[];
    acknowledgedEvidenceNeedRefs: string[];
  };
}

export interface HypothesisProposalResponse {
  providerId: string;
  hypotheses: ProviderHypothesisProposal[];
}

export interface StatementHypothesisProposer {
  readonly providerId: string;
  propose(request: HypothesisProposalRequest): Promise<HypothesisProposalResponse>;
}

export interface HypothesisProposalSourceBinding {
  sourceDocumentRef: string;
  sourceContentSha256: string;
}

type ProposalPacket = {
  request: HypothesisProposalRequest;
  internalObservationIdByOpaqueRef: Map<string, string>;
  inferenceTopicByOpaqueRef: Map<string, InferenceTopic>;
  internalEvidenceNeedIdByOpaqueRef: Map<string, string>;
};

function proposalPacket(
  statementId: string,
  observations: Observation[],
  sourceBinding: HypothesisProposalSourceBinding,
  inferenceTopics: InferenceTopic[],
  evidenceNeeds: EvidenceNeed[],
): ProposalPacket {
  if (!sourceBinding.sourceDocumentRef.trim()) throw new Error("Provider proposal source document reference is required.");
  if (!/^[a-f0-9]{64}$/.test(sourceBinding.sourceContentSha256)) {
    throw new Error("Provider proposal source fingerprint must be a lowercase SHA-256 value.");
  }
  const foreignDocument = observations.find((observation) => observation.locator.documentId !== statementId);
  if (foreignDocument) {
    throw new Error(`Provider proposal observation ${foreignDocument.id} is bound to a different document.`);
  }
  validateInferenceTopics(inferenceTopics, observations);
  const topicObservationIds = new Set(inferenceTopics.flatMap((topic) => topic.observationRefs));
  const ordered = observations
    .filter((observation) => topicObservationIds.has(observation.id))
    .filter((observation) => observation.authority === "source_printed" || observation.authority === "deterministic_extraction")
    .sort((left, right) => observationOrderKey(left).localeCompare(observationOrderKey(right)));
  const opaqueRefByInternalId = new Map(ordered.map((observation, index) => [
    observation.id,
    `source-observation-${String(index + 1).padStart(4, "0")}`,
  ]));
  const internalObservationIdByOpaqueRef = new Map(
    [...opaqueRefByInternalId].map(([internalId, opaqueRef]) => [opaqueRef, internalId]),
  );
  const orderedTopics = [...inferenceTopics].sort((left, right) => left.id.localeCompare(right.id));
  const topicRefById = new Map(orderedTopics.map((topic, index) => [
    topic.id,
    `inference-topic-${String(index + 1).padStart(4, "0")}`,
  ]));
  const inferenceTopicByOpaqueRef = new Map(
    orderedTopics.map((topic) => [topicRefById.get(topic.id)!, topic]),
  );
  const evidenceNeedIds = [...new Set(orderedTopics.flatMap((topic) =>
    topic.qualification.materialEvidenceNeedIds))].sort();
  const evidenceNeedRefById = new Map(evidenceNeedIds.map((id, index) => [
    id,
    `evidence-need-${String(index + 1).padStart(4, "0")}`,
  ]));
  const internalEvidenceNeedIdByOpaqueRef = new Map(
    [...evidenceNeedRefById].map(([internalId, opaqueRef]) => [opaqueRef, internalId]),
  );
  const evidenceNeedById = new Map(evidenceNeeds.map((need) => [need.id, need]));
  const request: HypothesisProposalRequest = {
    schemaVersion: HYPOTHESIS_PROPOSAL_SCHEMA,
    sourceDocument: {
      documentId: statementId,
      sourceDocumentRef: sourceBinding.sourceDocumentRef,
      sourceContentSha256: sourceBinding.sourceContentSha256,
    },
    observations: ordered.map((observation) => {
      const sourceLabel = observation.locator.label === observation.id ? undefined : observation.locator.label;
      return {
        observationRef: opaqueRefByInternalId.get(observation.id)!,
        kind: observation.kind,
        value: observation.value,
        sourceAuthority: observation.authority,
        sourceLocation: {
          ...(observation.locator.page === undefined ? {} : { page: observation.locator.page }),
          ...(observation.locator.section === undefined ? {} : { section: observation.locator.section }),
          ...(observation.locator.row === undefined ? {} : { row: observation.locator.row }),
          ...(sourceLabel === undefined ? {} : { label: sourceLabel }),
        },
        extractedText: observation.locator.extractedText
          ?? sourceLabel
          ?? observation.locator.row
          ?? observation.locator.section
          ?? null,
        relatedObservationRefs: (observation.relatedObservationRefs ?? [])
          .map((reference) => opaqueRefByInternalId.get(reference))
          .filter((reference): reference is string => reference !== undefined)
          .sort(),
      };
    }),
    allowedObservationRefs: [...internalObservationIdByOpaqueRef.keys()].sort(),
    inferenceTopics: orderedTopics.map((topic) => ({
      topicRef: topicRefById.get(topic.id)!,
      question: topic.question,
      observationRefs: topic.observationRefs.map((reference) => opaqueRefByInternalId.get(reference)!),
      allowedClaims: structuredClone(topic.allowedClaims),
      knownEvidenceGaps: topic.qualification.materialEvidenceNeedIds.map((id) => ({
        evidenceNeedRef: evidenceNeedRefById.get(id)!,
        description: evidenceNeedById.get(id)?.description ?? "RateReveal requires additional evidence before confirmation.",
        material: evidenceNeedById.get(id)?.material ?? true,
      })),
    })),
    authorityPolicy: {
      providerOutput: "proposal_only",
      canonicalAuthority: "prohibited",
      controlSelection: "prohibited",
    },
  };
  return {
    request,
    internalObservationIdByOpaqueRef,
    inferenceTopicByOpaqueRef,
    internalEvidenceNeedIdByOpaqueRef,
  };
}

export function buildHypothesisProposalRequest(
  statementId: string,
  observations: Observation[],
  sourceBinding: HypothesisProposalSourceBinding,
  inferenceTopics: InferenceTopic[] = [],
  evidenceNeeds: EvidenceNeed[] = [],
): HypothesisProposalRequest {
  return proposalPacket(statementId, observations, sourceBinding, inferenceTopics, evidenceNeeds).request;
}

export function validateProviderResponse(
  response: HypothesisProposalResponse,
  request: HypothesisProposalRequest,
  expectedProviderId: string,
): string[] {
  const errors: string[] = [];
  if (!response || typeof response !== "object") return ["Provider response must be an object."];
  if (response.providerId !== expectedProviderId) errors.push("Provider response identity mismatch.");
  if (!Array.isArray(response.hypotheses)) return [...errors, "Provider hypotheses must be an array."].sort();
  if (response.hypotheses.length > MAX_PROVIDER_HYPOTHESES) {
    errors.push(`Provider hypothesis limit exceeded: ${response.hypotheses.length}/${MAX_PROVIDER_HYPOTHESES}.`);
  }
  const allowed = new Set(request.allowedObservationRefs);
  const topics = new Map(request.inferenceTopics.map((topic) => [topic.topicRef, topic]));
  const seenIds = new Set<string>();
  for (const rawHypothesis of response.hypotheses) {
    const hypothesis = rawHypothesis as ProviderHypothesisProposal & Record<string, unknown>;
    if (!hypothesis || typeof hypothesis !== "object") {
      errors.push("Provider hypothesis must be an object.");
      continue;
    }
    if (typeof hypothesis.id !== "string" || hypothesis.id.trim() === "") errors.push("Provider hypothesis has an invalid id.");
    else if (seenIds.has(hypothesis.id)) errors.push(`Duplicate provider hypothesis id ${hypothesis.id}.`);
    else seenIds.add(hypothesis.id);
    if (typeof hypothesis.topicRef !== "string" || !topics.has(hypothesis.topicRef)) {
      errors.push(`Provider hypothesis ${String(hypothesis.id)} does not select an offered RateReveal inference topic.`);
    }
    if (typeof hypothesis.description !== "string" || hypothesis.description.trim() === "") {
      errors.push(`Provider hypothesis ${String(hypothesis.id)} has an invalid description.`);
    }
    if (!Array.isArray(hypothesis.observationRefs)) {
      errors.push(`Provider hypothesis ${String(hypothesis.id)} observationRefs must be an array.`);
    } else if (!hypothesis.observationRefs.every((reference) => typeof reference === "string")) {
      errors.push(`Provider hypothesis ${String(hypothesis.id)} observationRefs must contain only strings.`);
    }
    if (!Array.isArray(hypothesis.events)) errors.push(`Provider hypothesis ${String(hypothesis.id)} events must be an array.`);
    if (!Array.isArray(hypothesis.populations)) errors.push(`Provider hypothesis ${String(hypothesis.id)} populations must be an array.`);
    for (const forbidden of [
      "origin", "ownership", "evidenceClass", "alternativeCoverage",
      "requiredControlIds", "contradictedByControlIds", "controlRefs", "support", "groupId",
      "inferenceTopic", "qualification", "qualifiedInferenceStrength",
    ]) {
      if (Object.hasOwn(hypothesis, forbidden)) {
        errors.push(`Provider hypothesis ${String(hypothesis.id)} attempts to supply prohibited authority metadata ${forbidden}.`);
      }
    }
    const inference = hypothesis.inference as ProviderHypothesisProposal["inference"] | undefined;
    if (!inference || !["low", "medium", "high"].includes(inference.confidence)
      || typeof inference.rationale !== "string" || inference.rationale.trim() === ""
      || !Array.isArray(inference.missingProof)
      || !Array.isArray(inference.acknowledgedEvidenceNeedRefs)
      || !inference.acknowledgedEvidenceNeedRefs.every((reference) => typeof reference === "string")) {
      errors.push(`Provider hypothesis ${String(hypothesis.id)} has invalid inference metadata.`);
    }
    const claims = Array.isArray(hypothesis.claims) ? hypothesis.claims : [];
    if (!Array.isArray(hypothesis.claims)) errors.push(`Provider hypothesis ${String(hypothesis.id)} claims must be an array.`);
    else if (claims.length === 0) errors.push(`Provider hypothesis ${String(hypothesis.id)} must propose at least one topic-permitted claim.`);
    if (claims.length > MAX_PROVIDER_CLAIMS_PER_HYPOTHESIS) {
      errors.push(`Provider hypothesis ${String(hypothesis.id)} claim limit exceeded.`);
    }
    for (const rawClaim of claims) {
      if (!rawClaim || typeof rawClaim !== "object") {
        errors.push(`Provider hypothesis ${String(hypothesis.id)} contains an invalid claim.`);
        continue;
      }
      const claim = rawClaim as ProviderClaimProposal & Record<string, unknown>;
      if (typeof claim.key !== "string" || claim.key.trim() === "") {
        errors.push(`Provider hypothesis ${String(hypothesis.id)} contains a claim with an invalid key.`);
      }
      if (!Array.isArray(claim.observationRefs) || claim.observationRefs.length === 0) {
        errors.push(`Provider hypothesis ${String(hypothesis.id)} claim ${String(claim.key)} must cite source observations.`);
      } else if (!claim.observationRefs.every((reference) => typeof reference === "string")) {
        errors.push(`Provider hypothesis ${String(hypothesis.id)} claim ${String(claim.key)} observationRefs must contain only strings.`);
      }
      if (!isScalarValue(claim.value)) errors.push(`Provider hypothesis ${String(hypothesis.id)} claim ${String(claim.key)} has a non-scalar value.`);
      for (const forbidden of ["support", "controlRefs", "authority", "origin", "ownership"]) {
        if (Object.hasOwn(claim, forbidden)) {
          errors.push(`Provider hypothesis ${String(hypothesis.id)} claim ${String(claim.key)} attempts to supply prohibited authority metadata ${forbidden}.`);
        }
      }
    }
    const references = [
      ...stringArray(hypothesis.observationRefs),
      ...claims.flatMap((claim) => stringArray(claim.observationRefs)),
      ...arrayOfObjects(hypothesis.events).flatMap((event) => stringArray(event.observationRefs)),
      ...arrayOfObjects(hypothesis.populations).flatMap((population) => stringArray(population.observationRefs)),
    ];
    const topic = topics.get(hypothesis.topicRef);
    if (topic) {
      const allowedClaims = new Map(topic.allowedClaims.map((claim) => [claim.key, claim.allowedValues]));
      for (const claim of claims) {
        const allowedValues = allowedClaims.get(claim.key);
        if (!allowedValues || !allowedValues.some((value) => JSON.stringify(value) === JSON.stringify(claim.value))) {
          errors.push(`Provider hypothesis ${String(hypothesis.id)} proposes a claim outside its RateReveal-owned topic.`);
        }
      }
      const allowedEvidenceNeeds = new Set(topic.knownEvidenceGaps.map((gap) => gap.evidenceNeedRef));
      for (const reference of inference?.acknowledgedEvidenceNeedRefs ?? []) {
        if (!allowedEvidenceNeeds.has(reference)) {
          errors.push(`Provider hypothesis ${String(hypothesis.id)} acknowledges an unavailable evidence need ${reference}.`);
        }
      }
      const topicObservationRefs = new Set(topic.observationRefs);
      for (const reference of references) {
        if (!topicObservationRefs.has(reference)) {
          errors.push(`Provider hypothesis ${String(hypothesis.id)} cites an observation outside its RateReveal-owned topic.`);
        }
      }
    }
    for (const reference of references) {
      if (!allowed.has(reference)) errors.push(`Provider hypothesis ${String(hypothesis.id)} references unavailable observation ${reference}.`);
    }
  }
  return [...new Set(errors)].sort();
}

export async function collectRecordedProviderHypotheses(
  proposer: StatementHypothesisProposer,
  statementId: string,
  observations: Observation[],
  sourceBinding: HypothesisProposalSourceBinding,
  inferenceTopics: InferenceTopic[] = [],
  evidenceNeeds: EvidenceNeed[] = [],
): Promise<{ hypotheses: Hypothesis[]; errors: string[]; request: HypothesisProposalRequest | null }> {
  let packet: ProposalPacket;
  try {
    packet = proposalPacket(statementId, observations, sourceBinding, inferenceTopics, evidenceNeeds);
  } catch (error) {
    return {
      hypotheses: [],
      errors: [error instanceof Error ? error.message : "Provider proposal source binding failed."],
      request: null,
    };
  }
  try {
    const response = await proposer.propose(packet.request);
    const errors = validateProviderResponse(response, packet.request, proposer.providerId);
    return {
      hypotheses: errors.length === 0
        ? response.hypotheses.map((proposal) => normalizeProviderProposal(
            proposal,
            proposer.providerId,
            packet.internalObservationIdByOpaqueRef,
            packet.inferenceTopicByOpaqueRef,
            packet.internalEvidenceNeedIdByOpaqueRef,
          ))
        : [],
      errors,
      request: packet.request,
    };
  } catch {
    return {
      hypotheses: [],
      errors: [`Provider ${proposer.providerId} was unavailable; deterministic reconstruction remains authoritative.`],
      request: packet.request,
    };
  }
}

function normalizeProviderProposal(
  proposal: ProviderHypothesisProposal,
  providerId: string,
  internalObservationIdByOpaqueRef: Map<string, string>,
  inferenceTopicByOpaqueRef: Map<string, InferenceTopic>,
  internalEvidenceNeedIdByOpaqueRef: Map<string, string>,
): Hypothesis {
  const translate = (references: string[]) => references.map((reference) => internalObservationIdByOpaqueRef.get(reference)!);
  const topic = inferenceTopicByOpaqueRef.get(proposal.topicRef)!;
  return deepFreeze({
    id: providerOwnedId(providerId, proposal.id),
    groupId: topic.hypothesisGroupId,
    origin: "recorded_provider" as const,
    ownership: { kind: "provider" as const, providerId, proposalId: proposal.id, immutable: true as const },
    evidenceClass: "compatibility_only" as const,
    alternativeCoverage: "non_exhaustive" as const,
    inference: {
      confidence: proposal.inference.confidence,
      rationale: proposal.inference.rationale,
      missingProof: structuredClone(proposal.inference.missingProof),
      acknowledgedEvidenceNeedIds: proposal.inference.acknowledgedEvidenceNeedRefs
        .map((reference) => internalEvidenceNeedIdByOpaqueRef.get(reference)!),
    },
    inferenceTopic: {
      topicId: topic.id,
      hypothesisGroupId: topic.hypothesisGroupId,
      immutable: true as const,
      qualification: structuredClone(topic.qualification),
    },
    description: proposal.description,
    observationRefs: translate(proposal.observationRefs),
    events: proposal.events.map((event) => ({ ...structuredClone(event), observationRefs: translate(event.observationRefs) })),
    populations: proposal.populations.map((population) => ({
      ...structuredClone(population), observationRefs: translate(population.observationRefs),
    })),
    claims: proposal.claims.map((claim) => ({
      key: claim.key,
      value: claim.value,
      support: "ai_hypothesis" as const,
      observationRefs: translate(claim.observationRefs),
    })),
    requiredControlIds: [],
    contradictedByControlIds: [],
  });
}

function validateInferenceTopics(topics: InferenceTopic[], observations: Observation[]): void {
  const observationIds = new Set(observations.map((observation) => observation.id));
  const topicIds = new Set<string>();
  for (const topic of topics) {
    if (!topic.id.trim() || topicIds.has(topic.id)) throw new Error(`RateReveal inference topic identity ${topic.id || "<empty>"} is invalid or duplicated.`);
    topicIds.add(topic.id);
    if (!topic.hypothesisGroupId.trim() || !topic.question.trim()) throw new Error(`RateReveal inference topic ${topic.id} is incomplete.`);
    if (topic.allowedClaims.length === 0) throw new Error(`RateReveal inference topic ${topic.id} has no allowed claims.`);
    if (topic.observationRefs.length === 0) throw new Error(`RateReveal inference topic ${topic.id} has no source observations.`);
    if (new Set(topic.observationRefs).size !== topic.observationRefs.length) {
      throw new Error(`RateReveal inference topic ${topic.id} repeats a source observation.`);
    }
    if (new Set(topic.allowedClaims.map((claim) => claim.key)).size !== topic.allowedClaims.length) {
      throw new Error(`RateReveal inference topic ${topic.id} repeats an allowed claim key.`);
    }
    for (const reference of topic.observationRefs) {
      if (!observationIds.has(reference)) throw new Error(`RateReveal inference topic ${topic.id} references unknown observation ${reference}.`);
    }
  }
}

function providerOwnedId(providerId: string, value: string): string {
  const safeProvider = providerId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 32);
  const safeValue = value.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 64);
  const providerHash = createHash("sha256").update(providerId).digest("hex").slice(0, 8);
  const valueHash = createHash("sha256").update(value).digest("hex").slice(0, 8);
  return `provider.${safeProvider}.${providerHash}.${safeValue}.${valueHash}`;
}

function observationOrderKey(observation: Observation): string {
  return JSON.stringify([
    observation.locator.documentId,
    observation.locator.page ?? null,
    observation.locator.section ?? null,
    observation.locator.row ?? null,
    observation.locator.label ?? null,
    observation.kind,
    observation.value,
    observation.id,
  ]);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function arrayOfObjects(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
}

function isScalarValue(value: unknown): value is ScalarValue {
  return value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
