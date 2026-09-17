import { createHash } from "node:crypto";

import { canonicalJson } from "../canonicalJson.js";
import type { CanonicalAnalysisRun } from "./analysisRunTypes.js";
import type {
  CanonicalRgSearchIntent,
  CanonicalRgVerifiedEvidence,
} from "./rgEvidenceExecution.js";
import type { CanonicalRgClaimAdmission, CanonicalRgWorkItem } from "./rgWorkLedger.js";

export const CANONICAL_RG_APPROVED_AI_CONTEXT_SCHEMA_VERSION = "canonical_rg_approved_ai_claim_context_v1" as const;
// Operational pre-send safety envelope only. Crossing it cannot establish analytical completion.
export const MAX_APPROVED_AI_REQUEST_CONTEXT_BYTES = 300_000;

export type CanonicalRgCurrentRunContext = {
  analysisRun: CanonicalAnalysisRun;
  externalEvidenceRegistry: CanonicalRgVerifiedEvidence[];
  activeRgState: {
    planHash: string;
    claimAdmissions: CanonicalRgClaimAdmission[];
    workItems: CanonicalRgWorkItem[];
    rfBinding: unknown;
  };
};

type CanonicalLineageEntity = {
  stage: "rb" | "rc" | "rd" | "re";
  path: string;
  identity: string;
  value: unknown;
};

export type CanonicalRgApprovedAiClaimContext = {
  schemaVersion: typeof CANONICAL_RG_APPROVED_AI_CONTEXT_SCHEMA_VERSION;
  authority: "deterministic_exact_claim_projection_of_durable_analysis_run";
  runBinding: {
    runId: string;
    sourceFingerprint: string;
    policyVersion: string;
    synthesisContractId: string;
    financialFoundationHash: string;
    semanticHash: string;
    canonicalStateHash: string;
    semanticRevision: number;
    canonicalTruthPreserved: true;
  };
  exactClaim: {
    admission: CanonicalRgClaimAdmission;
    workContract: Pick<CanonicalRgWorkItem, "workItemId" | "atomicClaimId" | "requestedOperation"
      | "evidenceObjective" | "expectedDecisionEffects" | "knowledgeQuery"
      | "expectedKnowledgeValueConstraint" | "requiredSourceAuthorities" | "continuationContract">;
    unresolvedParentClaims: unknown[];
  };
  canonicalLineage: {
    sourceIdentity: unknown;
    documentIntegrity: unknown;
    canonicalEntities: CanonicalLineageEntity[];
    sourceOccurrences: unknown[];
    sourceEvidence: unknown[];
    currentRunExternalEvidence: CanonicalRgVerifiedEvidence[];
    requiredCanonicalRefs: string[];
    requiredOccurrenceRefs: string[];
    requiredEvidenceRefs: string[];
    relatedReferenceIds: string[];
    completeness: "all_required_exact_claim_lineage_present";
  };
  authorityContext: {
    rfBinding: unknown;
    boundRfExactDecision: unknown | null;
    boundRfSemanticApplications: unknown[];
    requiredSourceAuthorities: CanonicalRgClaimAdmission["requiredSourceAuthorities"];
    statementPeriod: CanonicalRgClaimAdmission["statementPeriod"];
    scopeFingerprint: string;
    direction: CanonicalRgClaimAdmission["direction"];
  };
  adjacentClaimBoundary: Array<{
    atomicClaimId: string;
    claimClass: CanonicalRgClaimAdmission["claimClass"];
    facet: CanonicalRgClaimAdmission["facet"];
    scopeFingerprint: string;
    direction: CanonicalRgClaimAdmission["direction"];
    applicationAuthority: "excluded_adjacent_claim";
  }>;
  safeguards: {
    exactFacetOnly: true;
    adjacentClaimInference: "prohibited";
    financialMutationAllowed: false;
    evidenceOmissionAllowed: false;
    externalEvidenceAuthority: "current_run_support_only_not_rf_promotion";
  };
  contextHash: string;
};

export function compileCanonicalRgApprovedAiClaimContext(input: {
  currentRunContext: CanonicalRgCurrentRunContext;
  intent: CanonicalRgSearchIntent;
  admission: CanonicalRgClaimAdmission;
  expectedValueConstraint: CanonicalRgWorkItem["expectedKnowledgeValueConstraint"];
}): CanonicalRgApprovedAiClaimContext {
  const run = input.currentRunContext.analysisRun;
  const rb = run.artifacts.rb;
  const unresolved = run.artifacts.unresolvedClaims;
  if (run.runId !== input.intent.runId || !run.canonicalTruthPreserved || !run.sourceFingerprint
    || !run.financialFoundationHash || !run.semanticHash || !run.canonicalStateHash) {
    throw new Error("rg_approved_ai_context_run_binding_invalid");
  }
  if (input.currentRunContext.activeRgState.planHash !== input.intent.planHash || !rb || !unresolved) {
    throw new Error("rg_approved_ai_context_canonical_state_unavailable");
  }
  const admitted = input.currentRunContext.activeRgState.claimAdmissions
    .find((item) => item.atomicClaimId === input.intent.atomicClaimId);
  if (!admitted || canonicalJson(admitted) !== canonicalJson(input.admission)
    || input.admission.facet !== input.intent.facet) {
    throw new Error("rg_approved_ai_context_exact_claim_binding_invalid");
  }
  const work = input.currentRunContext.activeRgState.workItems.find((item) => item.workItemId === input.intent.workItemId);
  if (!work || work.atomicClaimId !== input.admission.atomicClaimId
    || canonicalJson(work.expectedKnowledgeValueConstraint) !== canonicalJson(input.expectedValueConstraint)) {
    throw new Error("rg_approved_ai_context_work_contract_binding_invalid");
  }

  const parentClaims = input.admission.parentClaimIds.map((claimId) =>
    unresolved.claims.find((claim) => claim.claimId === claimId)).filter((claim): claim is NonNullable<typeof claim> => Boolean(claim));
  const boundRfExactDecision = run.artifacts.rfResolution?.atomicDecisions
    .find((decision) => decision.atomicClaimId === input.admission.atomicClaimId) ?? null;
  const boundRfSemanticApplications = run.artifacts.rfResolution?.semanticApplications
    .filter((application) => application.atomicClaimId === input.admission.atomicClaimId) ?? [];
  if (parentClaims.length !== input.admission.parentClaimIds.length
    && (!boundRfExactDecision || boundRfSemanticApplications.length === 0)) {
    throw new Error("rg_approved_ai_context_unresolved_claim_lineage_incomplete");
  }

  const entityIndex = canonicalEntityIndex(run);
  const requiredCanonicalRefs = new Set(input.admission.canonicalRefs);
  const requiredOccurrenceRefs = new Set(input.admission.occurrenceRefs);
  const requiredEvidenceRefs = new Set(input.admission.evidenceRefs);
  const relatedReferenceIds = new Set<string>();
  const selectedEntities = new Map<string, CanonicalLineageEntity>();
  const entityQueue = [...requiredCanonicalRefs];
  const occurrenceMap = new Map(rb.sourceModel.occurrences.map((item) => [item.id, item]));
  const sourceEvidenceMap = new Map(rb.sourceModel.evidence.map((item) => [item.id, item]));
  const externalEvidenceMap = new Map(input.currentRunContext.externalEvidenceRegistry.map((item) => [item.evidenceId, item]));
  const processedEntityRefs = new Set<string>();
  const processedOccurrenceRefs = new Set<string>();

  while (entityQueue.length > 0) {
    const ref = entityQueue.shift()!;
    if (processedEntityRefs.has(ref)) continue;
    processedEntityRefs.add(ref);
    const entity = entityIndex.get(ref);
    if (!entity) continue;
    selectedEntities.set(`${entity.stage}:${entity.path}:${entity.identity}`, entity);
    for (const linked of referencedIds(entity.value)) {
      relatedReferenceIds.add(linked.value);
      if (linked.kind === "occurrence") requiredOccurrenceRefs.add(linked.value);
      else if (linked.kind === "evidence") requiredEvidenceRefs.add(linked.value);
      else if (entityIndex.has(linked.value)) entityQueue.push(linked.value);
    }
  }

  for (;;) {
    const pendingOccurrences = [...requiredOccurrenceRefs].filter((ref) => !processedOccurrenceRefs.has(ref));
    if (pendingOccurrences.length === 0) break;
    for (const ref of pendingOccurrences) {
      processedOccurrenceRefs.add(ref);
      const occurrence = occurrenceMap.get(ref);
      if (!occurrence) continue;
      for (const linked of referencedIds(occurrence)) {
        relatedReferenceIds.add(linked.value);
        if (linked.kind === "evidence") requiredEvidenceRefs.add(linked.value);
        else if (linked.kind === "occurrence") requiredOccurrenceRefs.add(linked.value);
        else if (entityIndex.has(linked.value)) entityQueue.push(linked.value);
      }
    }
    while (entityQueue.length > 0) {
      const ref = entityQueue.shift()!;
      if (processedEntityRefs.has(ref)) continue;
      processedEntityRefs.add(ref);
      const entity = entityIndex.get(ref);
      if (!entity) continue;
      selectedEntities.set(`${entity.stage}:${entity.path}:${entity.identity}`, entity);
      for (const linked of referencedIds(entity.value)) {
        relatedReferenceIds.add(linked.value);
        if (linked.kind === "occurrence") requiredOccurrenceRefs.add(linked.value);
        else if (linked.kind === "evidence") requiredEvidenceRefs.add(linked.value);
        else if (entityIndex.has(linked.value)) entityQueue.push(linked.value);
      }
    }
  }

  const missingCanonicalRefs = [...requiredCanonicalRefs].filter((ref) => !entityIndex.has(ref));
  const missingOccurrenceRefs = [...requiredOccurrenceRefs].filter((ref) => !occurrenceMap.has(ref));
  const missingEvidenceRefs = [...requiredEvidenceRefs].filter((ref) =>
    !sourceEvidenceMap.has(ref) && !externalEvidenceMap.has(ref));
  if (missingCanonicalRefs.length > 0 || missingOccurrenceRefs.length > 0 || missingEvidenceRefs.length > 0) {
    throw new Error("rg_approved_ai_context_required_lineage_incomplete");
  }

  const workContract: CanonicalRgApprovedAiClaimContext["exactClaim"]["workContract"] = {
    workItemId: work.workItemId,
    atomicClaimId: work.atomicClaimId,
    requestedOperation: work.requestedOperation,
    evidenceObjective: work.evidenceObjective,
    expectedDecisionEffects: [...work.expectedDecisionEffects],
    knowledgeQuery: structuredClone(work.knowledgeQuery),
    expectedKnowledgeValueConstraint: structuredClone(work.expectedKnowledgeValueConstraint),
    requiredSourceAuthorities: [...work.requiredSourceAuthorities],
    continuationContract: structuredClone(work.continuationContract),
  };
  const exactCanonicalRefs = new Set(input.admission.canonicalRefs);
  const base = {
    schemaVersion: CANONICAL_RG_APPROVED_AI_CONTEXT_SCHEMA_VERSION,
    authority: "deterministic_exact_claim_projection_of_durable_analysis_run" as const,
    runBinding: {
      runId: run.runId,
      sourceFingerprint: run.sourceFingerprint,
      policyVersion: run.manifest.policyVersion,
      synthesisContractId: run.manifest.synthesisAdmissionContract,
      financialFoundationHash: run.financialFoundationHash,
      semanticHash: run.semanticHash,
      canonicalStateHash: run.canonicalStateHash,
      semanticRevision: run.semanticRevision,
      canonicalTruthPreserved: true as const,
    },
    exactClaim: {
      admission: structuredClone(input.admission),
      workContract,
      unresolvedParentClaims: parentClaims.map((claim) => structuredClone(claim)),
    },
    canonicalLineage: {
      sourceIdentity: structuredClone(rb.identity),
      documentIntegrity: structuredClone(rb.documentIntegrity),
      canonicalEntities: [...selectedEntities.values()].sort(entityOrder).map((item) => structuredClone(item)),
      sourceOccurrences: [...requiredOccurrenceRefs].sort().map((ref) => structuredClone(occurrenceMap.get(ref)!)),
      sourceEvidence: [...requiredEvidenceRefs].filter((ref) => sourceEvidenceMap.has(ref)).sort()
        .map((ref) => structuredClone(sourceEvidenceMap.get(ref)!)),
      currentRunExternalEvidence: [...requiredEvidenceRefs].filter((ref) => externalEvidenceMap.has(ref)).sort()
        .map((ref) => structuredClone(externalEvidenceMap.get(ref)!)),
      requiredCanonicalRefs: [...requiredCanonicalRefs].sort(),
      requiredOccurrenceRefs: [...requiredOccurrenceRefs].sort(),
      requiredEvidenceRefs: [...requiredEvidenceRefs].sort(),
      relatedReferenceIds: [...relatedReferenceIds].sort(),
      completeness: "all_required_exact_claim_lineage_present" as const,
    },
    authorityContext: {
      rfBinding: structuredClone(input.currentRunContext.activeRgState.rfBinding),
      boundRfExactDecision: structuredClone(boundRfExactDecision),
      boundRfSemanticApplications: boundRfSemanticApplications.map((application) => structuredClone(application)),
      requiredSourceAuthorities: [...input.admission.requiredSourceAuthorities].sort(),
      statementPeriod: structuredClone(input.admission.statementPeriod),
      scopeFingerprint: input.admission.scopeFingerprint,
      direction: input.admission.direction,
    },
    adjacentClaimBoundary: input.currentRunContext.activeRgState.claimAdmissions
      .filter((item) => item.atomicClaimId !== input.admission.atomicClaimId
      && item.scopeFingerprint === input.admission.scopeFingerprint && item.direction === input.admission.direction
      && item.canonicalRefs.some((ref) => exactCanonicalRefs.has(ref)))
      .map((item) => ({ atomicClaimId: item.atomicClaimId, claimClass: item.claimClass, facet: item.facet,
        scopeFingerprint: item.scopeFingerprint, direction: item.direction,
        applicationAuthority: "excluded_adjacent_claim" as const }))
      .sort((left, right) => left.atomicClaimId.localeCompare(right.atomicClaimId)),
    safeguards: {
      exactFacetOnly: true as const,
      adjacentClaimInference: "prohibited" as const,
      financialMutationAllowed: false as const,
      evidenceOmissionAllowed: false as const,
      externalEvidenceAuthority: "current_run_support_only_not_rf_promotion" as const,
    },
  };
  return { ...base, contextHash: digest(base) };
}

export function assertCanonicalRgApprovedAiClaimContext(input: unknown, binding: {
  intent: CanonicalRgSearchIntent;
  admission: CanonicalRgClaimAdmission;
  expectedValueConstraint: CanonicalRgWorkItem["expectedKnowledgeValueConstraint"];
}): asserts input is CanonicalRgApprovedAiClaimContext {
  if (!input || typeof input !== "object") throw new Error("rg_approved_ai_context_invalid");
  const context = input as CanonicalRgApprovedAiClaimContext;
  const { contextHash, ...base } = context;
  if (context.schemaVersion !== CANONICAL_RG_APPROVED_AI_CONTEXT_SCHEMA_VERSION
    || context.authority !== "deterministic_exact_claim_projection_of_durable_analysis_run"
    || !/^[a-f0-9]{64}$/.test(contextHash) || digest(base) !== contextHash) {
    throw new Error("rg_approved_ai_context_integrity_invalid");
  }
  if (context.runBinding.runId !== binding.intent.runId
    || context.exactClaim.admission.atomicClaimId !== binding.intent.atomicClaimId
    || context.exactClaim.admission.facet !== binding.intent.facet
    || canonicalJson(context.exactClaim.admission) !== canonicalJson(binding.admission)
    || canonicalJson(context.exactClaim.workContract.expectedKnowledgeValueConstraint)
      !== canonicalJson(binding.expectedValueConstraint)
    || context.canonicalLineage.completeness !== "all_required_exact_claim_lineage_present"
    || !context.safeguards.exactFacetOnly || context.safeguards.financialMutationAllowed
    || context.safeguards.evidenceOmissionAllowed) {
    throw new Error("rg_approved_ai_context_binding_invalid");
  }
  const canonicalIdentities = new Set(context.canonicalLineage.canonicalEntities.map((item) => item.identity));
  const occurrenceIdentities = new Set(context.canonicalLineage.sourceOccurrences.map(entityIdentity).filter(Boolean));
  const evidenceIdentities = new Set([
    ...context.canonicalLineage.sourceEvidence.map(entityIdentity).filter(Boolean),
    ...context.canonicalLineage.currentRunExternalEvidence.map((item) => item.evidenceId),
  ]);
  if (context.canonicalLineage.requiredCanonicalRefs.some((ref) => !canonicalIdentities.has(ref))
    || context.canonicalLineage.requiredOccurrenceRefs.some((ref) => !occurrenceIdentities.has(ref))
    || context.canonicalLineage.requiredEvidenceRefs.some((ref) => !evidenceIdentities.has(ref))) {
    throw new Error("rg_approved_ai_context_required_lineage_incomplete");
  }
}

export function assertApprovedAiRequestContextBudget(body: string): void {
  if (Buffer.byteLength(body, "utf8") > MAX_APPROVED_AI_REQUEST_CONTEXT_BYTES) {
    throw new Error("rg_approved_ai_packet_context_budget_exceeded");
  }
}

function canonicalEntityIndex(run: CanonicalAnalysisRun): Map<string, CanonicalLineageEntity> {
  const index = new Map<string, CanonicalLineageEntity>();
  const roots: Array<{ stage: CanonicalLineageEntity["stage"]; path: string; value: unknown }> = [
    { stage: "rb", path: "financialPopulations", value: run.artifacts.rb?.financialPopulations },
    { stage: "rb", path: "metrics", value: run.artifacts.rb?.metrics },
    { stage: "rb", path: "reconciliation", value: run.artifacts.rb?.reconciliation },
    { stage: "rb", path: "calculations", value: run.artifacts.rb?.calculations },
    { stage: "rb", path: "parserInterpretations", value: run.artifacts.rb?.sourceModel.parserInterpretations },
    { stage: "rb", path: "representationGroups", value: run.artifacts.rb?.sourceModel.representationGroups },
    { stage: "rc", path: "pricingArchitecture", value: run.artifacts.rc?.pricingArchitecture },
    { stage: "rd", path: "economicLayer", value: run.artifacts.rd?.economicLayer },
    { stage: "re", path: "synthesisLayer", value: run.artifacts.re?.synthesisLayer },
  ];
  for (const root of roots) indexEntities(root.value, root.stage, root.path, index);
  return index;
}

function indexEntities(value: unknown, stage: CanonicalLineageEntity["stage"], path: string,
  index: Map<string, CanonicalLineageEntity>): void {
  if (Array.isArray(value)) {
    value.forEach((item, position) => indexEntities(item, stage, `${path}[${position}]`, index));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const identity of objectIdentities(record)) {
    if (!index.has(identity)) index.set(identity, { stage, path, identity, value });
  }
  for (const [key, child] of Object.entries(record)) indexEntities(child, stage, `${path}.${key}`, index);
}

function objectIdentities(value: Record<string, unknown>): string[] {
  const identityKeys = new Set(["id", "claimId", "factId", "populationId", "componentId", "participantId",
    "roleClaimId", "dependencyId", "applicationId", "driverId", "counterfactualId", "leverId", "themeId",
    "actionId", "constraintId", "effectId", "calculationId", "interpretationId"]);
  return Object.entries(value).filter(([key, item]) => identityKeys.has(key) && typeof item === "string")
    .map(([, item]) => String(item));
}

function referencedIds(value: unknown): Array<{ value: string; kind: "occurrence" | "evidence" | "canonical" }> {
  const refs: Array<{ value: string; kind: "occurrence" | "evidence" | "canonical" }> = [];
  const visit = (item: unknown, key = "") => {
    if (typeof item === "string" && /Ref(?:s)?$/.test(key)) {
      refs.push({ value: item, kind: /occurrence/i.test(key) ? "occurrence" : /evidence/i.test(key) ? "evidence" : "canonical" });
      return;
    }
    if (Array.isArray(item)) {
      if (/Ref(?:s)?$/.test(key)) {
        for (const child of item) if (typeof child === "string") refs.push({ value: child,
          kind: /occurrence/i.test(key) ? "occurrence" : /evidence/i.test(key) ? "evidence" : "canonical" });
      } else item.forEach((child) => visit(child, key));
      return;
    }
    if (item && typeof item === "object") {
      for (const [childKey, child] of Object.entries(item as Record<string, unknown>)) visit(child, childKey);
    }
  };
  visit(value);
  return refs;
}

function entityIdentity(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return objectIdentities(value as Record<string, unknown>)[0] ?? "";
}

function entityOrder(left: CanonicalLineageEntity, right: CanonicalLineageEntity): number {
  return left.stage.localeCompare(right.stage) || left.path.localeCompare(right.path) || left.identity.localeCompare(right.identity);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
