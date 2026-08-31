import { createHash, randomUUID } from "node:crypto";

import { db, nowIso } from "../../../db.js";
import { canonicalJson } from "../canonicalJson.js";
import type { CanonicalRgClaimValue, KnowledgeSourceAuthority } from "../knowledge/knowledgeTypes.js";
import type { ExtractedLocator, PublicRetrievalTransportDiagnosticsV1 } from "../intelligence/intelligenceTypes.js";
import type { PublicRetrievalTransportOperationalPolicyV1 } from "../intelligence/publicRetrievalAdapters.js";
import {
  normalizeAndChunkPublicDocumentText,
  validatePublicDocumentLocatorTextDerivation,
} from "../intelligence/publicDocumentTextNormalization.js";
import { normalizeSafeHttpsUrl } from "../intelligence/retrievalSafety.js";
import { providerSafeScope } from "../intelligence/providerPrivacy.js";
import { getPersistedAnalysisRun, type PersistedAnalysisRunRecord } from "./analysisRunStore.js";
import type {
  CanonicalAdaptiveOperationalPolicy,
  CanonicalContinuationExecutionGrant,
} from "./adaptiveExecutionTypes.js";
import type { CanonicalRgOperationReconciliationPort, CanonicalRgReconciliationCapability } from "./rgOperationReconciliationTypes.js";
import { assertClaimedCanonicalRgReconciliationIntent } from "./rgOperationReconciliationStore.js";
import {
  dynamicallyBindPublisherOrigin,
  RG_PUBLISHER_ORIGIN_BINDING_CATALOG_HASH,
  RG_PUBLISHER_ORIGIN_BINDING_CATALOG_VERSION,
  type CanonicalRgPublisherOriginProof,
} from "./rgPublisherOriginAuthority.js";
import { persistedVerifiedEvidenceIntegrityValid } from "./rgEvidenceIntegrity.js";
export { persistedVerifiedEvidenceIntegrityValid } from "./rgEvidenceIntegrity.js";
import {
  compileCanonicalRgApprovedAiClaimContext,
  type CanonicalRgApprovedAiClaimContext,
  type CanonicalRgCurrentRunContext,
} from "./rgApprovedAiContext.js";
import {
  assertCanonicalProductionApplicabilityScope,
  CANONICAL_PRODUCTION_APPLICABILITY_SCOPE_VERSION,
  CANONICAL_PRODUCTION_COUNTRY_CODE,
} from "./productionApplicabilityScope.js";
import {
  canonicalRgWorkContractFingerprint,
  type CanonicalRgClaimAdmission,
  type CanonicalRgOperation,
  type CanonicalRgProviderDiagnostics,
  type CanonicalRgWorkItem,
} from "./rgWorkLedger.js";

export const RG_EVIDENCE_EXECUTION_SCHEMA_VERSION = "canonical_rg_evidence_execution_v1_7" as const;

const MAX_CANDIDATES_PER_WORK_ITEM = 2;
const MAX_BEFORE_SEND_ATTEMPTS = 2;
const DEFAULT_QUALIFIED_PUBLIC_READ_MAX_ATTEMPTS = 2;
const WORK_RESERVATION_MS = 5 * 60_000;
const PUBLIC_DOCUMENT_RETRIEVAL_REPLAY_CONTRACT_VERSION =
  "canonical_rg_public_document_retrieval_replay_contract_v1" as const;
const PUBLIC_DOCUMENT_RETRIEVAL_ARTIFACT_VERSION =
  "canonical_rg_public_document_retrieval_artifact_v1" as const;
const PUBLIC_DOCUMENT_RETRIEVAL_MAXIMUM_BYTES = 5_242_880;

export type CanonicalQualifiedPublicReadContractV1 = {
  schemaVersion: "canonical_qualified_public_read_v1";
  runtimePolicyAmendment: "frozen_product_model_runtime_policy_amendment_v0_3";
  normalizedUrl: string;
  method: "GET";
  transport: "https";
  authentication: "none";
  authorizationHeader: "absent";
  cookieHeader: "absent";
  credentialMaterial: "absent";
  requestBody: "absent";
  merchantPrivateData: "absent";
  redirectHandling: "fresh_destination_authorization_required";
  destinationSafety: "dns_public_address_pinned_and_rebinding_protected";
  canonicalMutationBeforeAdmission: false;
  recoveryPermission: "new_separately_identified_bounded_read_attempt";
  reconciliationEffect: "no_run_wide_barrier_for_this_qualified_read_only";
  evidenceEffect: "none";
  analyticalCompletionEffect: "none";
};

export type CanonicalQualifiedPublicReadOperationalPolicyV1 = {
  schemaVersion: "canonical_qualified_public_read_operational_policy_v1";
  maximumAttemptsPerCandidate: number;
};

export type CanonicalRgSearchIntent = {
  schemaVersion: "canonical_rg_search_intent_v1_3";
  intentId: string;
  runId: string;
  planHash: string;
  workItemId: string;
  atomicClaimId: string;
  facet: CanonicalRgClaimAdmission["facet"];
  claimType: CanonicalRgWorkItem["knowledgeQuery"]["claimType"];
  publicSubjectConcept: string;
  publicScope: Record<string, string>;
  discoveryScope: {
    productionScopeVersion: typeof CANONICAL_PRODUCTION_APPLICABILITY_SCOPE_VERSION;
    countryCode: typeof CANONICAL_PRODUCTION_COUNTRY_CODE;
    processorFamily: string | null;
    processorProgram: string | null;
    exactPublicDimensions: Record<string, string>;
    unknownPublicDimensions: string[];
    applicabilityFingerprint: string;
  };
  asOf: string;
  statementPeriod: CanonicalRgClaimAdmission["statementPeriod"];
  requiredSourceAuthorities: KnowledgeSourceAuthority[];
  evidenceObjective: string;
  queryTerms: string[];
  queryText: string;
  privacy: {
    status: "validated_public_concepts_only";
    forbiddenPrivateValuesObserved: 0;
    compiler: "deterministic_claim_lineage_v3_us_scope";
  };
  continuation: null | {
    executionGrantId: string;
    executionGeneration: number;
    kind: NonNullable<CanonicalRgWorkItem["continuationContract"]>["kind"] | "newly_eligible";
    requiredGap: NonNullable<CanonicalRgWorkItem["continuationContract"]>["requiredGap"] | null;
    excludedDocumentFingerprints: string[];
    publicRefinementTerms: string[];
  };
};

type CanonicalRgCandidateResearchOutcome = {
  schemaVersion: "canonical_rg_candidate_research_outcome_v1" | "canonical_rg_candidate_research_outcome_v2";
  runId: string;
  planHash: string;
  workItemId: string;
  atomicClaimId: string;
  facet: CanonicalRgClaimAdmission["facet"];
  intentId: string;
  discoveryApplicabilityFingerprint: string;
  candidateId: string;
  candidateUrl: string;
  sourceUrl: string;
  documentFingerprint: string;
  verificationOperationId: string;
  outcomeClass:
    | "exact_support_admitted"
    | "wrong_authority"
    | "wrong_scope"
    | "wrong_period"
    | "exact_semantic_support_insufficient"
    | "verification_binding_invalid";
  sourceAuthorityStatus: CanonicalRgVerificationJudgment["sourceAuthorityStatus"];
  scopeStatus: CanonicalRgVerificationJudgment["scopeStatus"];
  periodStatus: CanonicalRgVerificationJudgment["periodStatus"];
  semanticSupportStatus: CanonicalRgVerificationJudgment["semanticSupportStatus"];
  exactAtomicClaimSupport: boolean;
  applicabilityReuse:
    | "exclude_document_for_matching_discovery_scope"
    | "typed_negative_applicability_proof_required"
    | "claim_specific_no_cross_facet_semantic_reuse";
  admittedEvidenceId: string | null;
  analyticalCompletionEffect: "none";
};

export type CanonicalRgVerificationNegativeApplicabilityProof = {
  schemaVersion: "canonical_rg_verification_negative_applicability_proof_v1";
  outcomeClass: "wrong_scope" | "wrong_period" | "wrong_authority";
  granularity: "document" | "passage" | "provision";
  proofLocatorId: string;
  scopeDimension: "country" | "processor" | "processorProgram" | "network" | "region" | "jurisdiction" | null;
  requiredScopeValue: string | null;
  observedScopeValue: string | null;
};

type NegativeApplicabilityContext = {
  productionScopeVersion: typeof CANONICAL_PRODUCTION_APPLICABILITY_SCOPE_VERSION;
  countryCode: typeof CANONICAL_PRODUCTION_COUNTRY_CODE;
  exactPublicDimensions: Record<string, string>;
  asOf: string;
  statementPeriod: CanonicalRgClaimAdmission["statementPeriod"];
};

type CanonicalRgReusableNegativeApplicabilityProof = {
  schemaVersion: "canonical_rg_reusable_negative_applicability_proof_v1";
  proofId: string;
  runId: string;
  candidateUrl: string;
  sourceUrl: string;
  sourceOrigin: string;
  documentFingerprint: string;
  verificationOperationId: string;
  outcomeClass: "wrong_scope" | "wrong_period" | "wrong_authority";
  granularity: "document" | "source_origin";
  proofLocatorId: string | null;
  applicabilityContext: NegativeApplicabilityContext;
  applicabilityContextFingerprint: string;
  proofBasis:
    | {
      kind: "document_scope_mismatch";
      scopeDimension: NonNullable<CanonicalRgVerificationNegativeApplicabilityProof["scopeDimension"]>;
      requiredScopeValue: string;
      observedScopeValue: string;
    }
    | {
      kind: "document_period_mismatch";
      requiredAsOf: string;
      effectiveFrom: string | null;
      effectiveTo: string | null;
    }
    | {
      kind: "publisher_origin_binding_not_established";
      authorityClass: Extract<KnowledgeSourceAuthority, "official_network_publication" | "processor_publication">;
      publisherIdentityCode: string;
      applicableScopeDimension: "processor" | "processorProgram" | "acquirer" | "isoReseller" | "network";
      applicableScopeIdentityCode: string;
      publisherOriginBindingCatalogVersion: typeof RG_PUBLISHER_ORIGIN_BINDING_CATALOG_VERSION;
      publisherOriginBindingCatalogHash: string;
    };
  reusePermission: "retrieval_exclusion_for_exact_applicability_question_only";
  semanticReuse: "prohibited";
  analyticalCompletionEffect: "none";
};

type ReusableCandidateInapplicability = {
  documentFingerprint: string;
  verificationOperationId: string;
  outcomeClass: "wrong_authority" | "wrong_scope" | "wrong_period";
  reuseIdentity: "legacy_matching_discovery_scope" | "typed_claim_independent_applicability_proof";
  authorityClass: Extract<KnowledgeSourceAuthority, "official_network_publication" | "processor_publication"> | null;
};

class CandidateRetrievalExcludedBeforeSend extends Error {
  constructor(public readonly inapplicability: ReusableCandidateInapplicability) {
    super("rg_candidate_retrieval_excluded_known_inapplicable_before_send");
  }
}

type CanonicalRgPublicDocumentRetrievalReplayContract = {
  schemaVersion: typeof PUBLIC_DOCUMENT_RETRIEVAL_REPLAY_CONTRACT_VERSION;
  normalizedRequestedUrl: string;
  claimedAuthority: CanonicalRgDiscoveryCandidate["claimedAuthority"];
  candidateTemporalIdentity: {
    publicationDate: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
  };
  freshnessRequirement: {
    asOf: string;
    statementPeriod: CanonicalRgClaimAdmission["statementPeriod"];
    excludedDocumentFingerprints: string[];
  };
  productionScope: {
    version: typeof CANONICAL_PRODUCTION_APPLICABILITY_SCOPE_VERSION;
    countryCode: typeof CANONICAL_PRODUCTION_COUNTRY_CODE;
  };
  applicabilityRequirements: {
    exactPublicDimensions: Record<string, string>;
    unknownPublicDimensions: string[];
  };
  transport: {
    maximumBytes: number;
    httpsOnly: true;
    redirectsRequireFreshAuthorization: true;
    independentRetrievalRequired: true;
    contentFormats: "all_supported_public_content_formats";
  };
  admission: {
    normalizationVersion: "public_document_text_normalization_v1";
    contractVersion: "canonical_rg_retrieved_document_admission_v1";
  };
};

type CanonicalRgPublicDocumentRetrievalArtifact = {
  schemaVersion: typeof PUBLIC_DOCUMENT_RETRIEVAL_ARTIFACT_VERSION;
  artifactId: string;
  runId: string;
  replayIdentity: string;
  replayContract: CanonicalRgPublicDocumentRetrievalReplayContract;
  source: {
    planHash: string;
    workItemId: string;
    operationId: string;
    candidateId: string;
    operationInputHash: string;
    operationResultHash: string;
  };
  outcome: {
    kind: "admitted_document";
    admissionReasonCode: "rg_retrieved_document_admitted";
    document: CanonicalRgRetrievedDocument;
    documentProjectionHash: string;
    immutableByteIdentity: {
      fingerprintAlgorithm: "sha256";
      documentFingerprint: string;
      byteLength: number;
    };
  } | {
    kind: "deterministic_unusable";
    admissionReasonCode: string;
    documentFingerprint: string | null;
  };
  reuseAuthority: "same_analysis_run_transport_and_document_admission_only";
  semanticReuse: "prohibited";
  evidenceAdmissionEffect: "none";
  analyticalCompletionEffect: "none";
  canonicalMutationAllowed: false;
};

class PublicDocumentRetrievalReplayBeforeSend extends Error {
  constructor(public readonly artifact: CanonicalRgPublicDocumentRetrievalArtifact) {
    super("rg_public_document_retrieval_replay_available_before_send");
  }
}

export type CanonicalRgDiscoveryCandidate = {
  candidateId: string;
  url: string;
  title: string;
  claimedAuthority: Extract<KnowledgeSourceAuthority, "official_network_publication" | "processor_publication">;
  publicationDate: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type CanonicalRgRetrievedDocument = {
  candidateId: string;
  requestedUrl: string;
  finalUrl: string;
  sourceOrigin: string;
  documentId: string;
  documentFingerprint: string;
  mimeType: string;
  byteLength: number;
  independentlyRetrieved: true;
  admissionProjectionReasonCode?: string;
  locators: Array<{
    locatorId: string;
    page: number | null;
    sectionCode: string | null;
    lineStart: number;
    lineEnd: number;
    textExcerpt: string;
    textDerivation?: NonNullable<ExtractedLocator["textDerivation"]>;
  }>;
};

export type CanonicalRgInvestigatedCandidate = {
  investigationId: string;
  candidateId: string;
  documentId: string;
  documentFingerprint: string;
  locatorId: string;
  proposedValue: CanonicalRgClaimValue;
  sourceAuthorityCandidate: Extract<KnowledgeSourceAuthority, "official_network_publication" | "processor_publication">;
  publisherIdentityCode: string;
  publicationTitle: string;
  publicationVersion: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  limitationCodes: string[];
  financialMutationAllowed: false;
};

export type CanonicalRgFrozenCandidate = CanonicalRgInvestigatedCandidate & {
  frozenCandidateHash: string;
  frozenAt: string;
};

export type CanonicalRgVerificationJudgment = {
  frozenCandidateHash: string;
  sourceAuthorityStatus: "verified" | "unverified" | "wrong_authority";
  semanticSupportStatus: "supported" | "partial" | "unsupported" | "contradicted";
  exactAtomicClaimSupport: boolean;
  publisherIdentityCode: string;
  authorityLocatorId: string;
  supportLocatorId: string;
  scopeStatus: "applicable" | "wrong_scope" | "unresolved";
  periodStatus: "applicable" | "wrong_period" | "unresolved";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  negativeApplicabilityProof?: CanonicalRgVerificationNegativeApplicabilityProof | null;
  limitationCodes: string[];
};

export type CanonicalRgVerifiedEvidence = {
  schemaVersion: "canonical_rg_verified_evidence_v1_1" | "canonical_rg_verified_evidence_v1_2" | "canonical_rg_verified_evidence_v1_3";
  evidenceId: string;
  runId: string;
  planHash: string;
  executionGrantId: string | null;
  executionGeneration: number;
  workItemId: string;
  atomicClaimId: string;
  facet: CanonicalRgClaimAdmission["facet"];
  intentId: string;
  candidateId: string;
  sourceUrl: string;
  sourceOrigin: string;
  sourceAuthority: Extract<KnowledgeSourceAuthority, "official_network_publication" | "processor_publication">;
  publisherIdentityCode: string;
  publicationTitle: string;
  publicationVersion: string | null;
  documentId: string;
  documentFingerprint: string;
  investigatorLocatorId: string;
  authorityLocatorId: string;
  authorityLocatorExcerpt: string;
  supportLocatorId: string;
  supportLocatorExcerpt: string;
  originPublisherProof: CanonicalRgPublisherOriginProof;
  proposedValue: CanonicalRgClaimValue;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  applicabilityScope: Record<string, string>;
  scopeFingerprint?: string;
  statementPeriod: CanonicalRgClaimAdmission["statementPeriod"];
  frozenCandidateHash: string;
  currentRunSupport: "verified_claim_scoped_candidate_support";
  reusableKnowledgeState: "candidate_not_promoted";
  rfAdmissionAuthority: "none";
  automaticKnowledgePromotion: false;
  canonicalFinancialMutationAllowed: false;
  limitations: string[];
};

export type RgEvidencePortReceipt = {
  providerCode: string;
  providerRequestId: string | null;
  calls: number;
  tokens: number | null;
  retrievalBytes: number;
  providerDiagnostics?: CanonicalRgProviderDiagnostics | null;
  retrievalTransportDiagnostics?: PublicRetrievalTransportDiagnosticsV1 | null;
};

export type RgEvidencePortResult<T> = { value: T; receipt: RgEvidencePortReceipt };

export type CanonicalRgRuntimeReadiness = {
  schemaVersion: "canonical_rg_runtime_readiness_v1";
  availability: "available" | "unavailable";
  authorization: "standing_provider_authorization";
  bindingSource: "production_process_environment";
  providerBindings: Array<{
    operation: "public_search" | "investigation" | "independent_verification";
    providerCode: string;
    modelCode: string;
    endpointOrigin: string;
  }>;
  privacy: {
    publicSearch: "validated_public_concepts_only";
    approvedAiContext: "complete_analysis_run_permitted";
    providerStorage: "disabled";
    secretPersistence: "prohibited";
  };
  reasonCodes: string[];
  configurationHash: string;
  readinessHash: string;
};

export type CanonicalRgEvidenceExecutionPorts = {
  availability: "available" | "unavailable";
  unavailabilityReasonCodes: string[];
  runtimeReadiness?: CanonicalRgRuntimeReadiness;
  reconciliationCapability?: CanonicalRgReconciliationCapability;
  reconciliation?: CanonicalRgOperationReconciliationPort;
  qualifiedPublicReadOperationalPolicy?: CanonicalQualifiedPublicReadOperationalPolicyV1;
  publicRetrievalTransportOperationalPolicy?: PublicRetrievalTransportOperationalPolicyV1;
  search(input: { intent: CanonicalRgSearchIntent; maximumCandidates: number }, onSend: () => void): Promise<RgEvidencePortResult<CanonicalRgDiscoveryCandidate[]>>;
  retrieve(input: { intent: CanonicalRgSearchIntent; candidate: CanonicalRgDiscoveryCandidate;
    maximumBytes: number; logicalAttempt: number; qualifiedPublicRead: CanonicalQualifiedPublicReadContractV1 },
    onSend: () => void): Promise<RgEvidencePortResult<CanonicalRgRetrievedDocument>>;
  investigate(input: {
    intent: CanonicalRgSearchIntent;
    admission: CanonicalRgClaimAdmission;
    expectedValueConstraint: CanonicalRgWorkItem["expectedKnowledgeValueConstraint"];
    candidate: CanonicalRgDiscoveryCandidate;
    document: CanonicalRgRetrievedDocument;
    claimContext: CanonicalRgApprovedAiClaimContext;
  }, onSend: () => void): Promise<RgEvidencePortResult<CanonicalRgInvestigatedCandidate>>;
  verify(input: {
    intent: CanonicalRgSearchIntent;
    admission: CanonicalRgClaimAdmission;
    expectedValueConstraint: CanonicalRgWorkItem["expectedKnowledgeValueConstraint"];
    candidate: CanonicalRgDiscoveryCandidate;
    document: CanonicalRgRetrievedDocument;
    frozenCandidate: CanonicalRgFrozenCandidate;
    claimContext: CanonicalRgApprovedAiClaimContext;
  }, onSend: () => void): Promise<RgEvidencePortResult<CanonicalRgVerificationJudgment>>;
};

export class RgEvidenceTransportError extends Error {
  constructor(public readonly transportState: "before_send" | "provider_rejected" | "after_send" | "timed_out" | "cancelled", reasonCode: string,
    public readonly receipt: RgEvidencePortReceipt | null = null) {
    super(reasonCode);
  }
}

export type CanonicalRgCompletedUnusableResult = {
  schemaVersion: "canonical_rg_completed_unusable_result_v1";
  outcome: "completed_unusable";
  reasonCode: string;
};

/** A provider result was fully received, but its local admission failed deterministically. */
export class RgEvidenceCompletedUnusableError extends Error {
  constructor(reasonCode: string, public readonly receipt: RgEvidencePortReceipt) {
    super(reasonCode);
  }
}

export type CanonicalRgEvidenceExecutionResult = {
  schemaVersion: typeof RG_EVIDENCE_EXECUTION_SCHEMA_VERSION;
  runId: string;
  planHash: string | null;
  workItemsConsidered: number;
  workItemsCompletedWithEvidence: number;
  workItemsCompletedUnresolved: number;
  workItemsDegraded: number;
  verifiedEvidence: CanonicalRgVerifiedEvidence[];
  canonicalTruthHashBefore: string | null;
  canonicalTruthHashAfter: string | null;
  canonicalTruthPreserved: true;
};

type GenerationZeroOperationalScope = {
  policy: CanonicalAdaptiveOperationalPolicy;
  planHash: string;
  cycleStartedAtMs: number;
  baseline: { providerCalls: number; retrievalBytes: number; elapsedMsObserved: number };
  existingOperationIds: Set<string>;
};

export async function executeDurableCanonicalRgEvidence(input: {
  runId: string;
  ports: CanonicalRgEvidenceExecutionPorts;
  workerId?: string;
  cycleOwnerId?: string;
  executionGrantId?: string;
  reconciliationResume?: { intentId: string; workItemId: string };
  operationalPolicy?: CanonicalAdaptiveOperationalPolicy;
}): Promise<CanonicalRgEvidenceExecutionResult> {
  const persisted = getPersistedAnalysisRun(input.runId);
  if (!persisted?.result) throw new Error("rg_evidence_analysis_run_unavailable");
  validateRuntimeReadiness(input.ports);
  const reconciliation = input.reconciliationResume
    ? assertClaimedCanonicalRgReconciliationIntent(input.reconciliationResume.intentId, input.cycleOwnerId ?? "")
    : null;
  if (reconciliation && (reconciliation.intent.runId !== input.runId
    || !reconciliation.intent.operations.some((item) => item.workItemId === input.reconciliationResume!.workItemId)
    || persisted.rgOperations.some((operation) => operation.state === "indeterminate_after_send"))) {
    throw new Error("rg_evidence_reconciliation_resume_binding_invalid");
  }
  const resumedWork = reconciliation
    ? persisted.rgWorkItems.find((item) => item.workItemId === input.reconciliationResume!.workItemId) ?? null
    : null;
  if (reconciliation && (!resumedWork || resumedWork.executionState !== "planned_for_durable_execution")) {
    throw new Error("rg_evidence_reconciliation_resume_work_unavailable");
  }
  const effectiveGrantId = input.executionGrantId ?? resumedWork?.executionAuthorization?.grantId;
  const executionGrant = effectiveGrantId
    ? persisted.continuationExecutionGrants.find((item) => item.grantId === effectiveGrantId) ?? null
    : null;
  if ((persisted.continuationRevision > 0 || persisted.semanticRevision > 0) && !executionGrant && !reconciliation) {
    throw new Error("rg_evidence_regenerated_or_readjudicated_plan_execution_disabled");
  }
  if (executionGrant) validateExecutionGrantBinding(persisted, executionGrant, input.cycleOwnerId);
  const ledger = persisted.result.artifacts.rgWorkLedger;
  if (!ledger || ledger.validation.status !== "valid") throw new Error("rg_evidence_valid_work_ledger_required");
  if (persisted.canonicalTruthHash !== persisted.result.canonicalTruthHash) throw new Error("rg_evidence_canonical_truth_binding_mismatch");
  const workerId = input.workerId ?? `rg-worker-${randomUUID()}`;
  const beforeHash = persisted.canonicalTruthHash;
  const verifiedEvidence: CanonicalRgVerifiedEvidence[] = [];
  let completedUnresolved = 0;
  let degraded = 0;

  const selectedWork = reconciliation
    ? persisted.rgWorkItems.filter((item) => item.workItemId === input.reconciliationResume!.workItemId)
    : executionGrant
    ? persisted.rgWorkItems.filter((item) => item.workItemId === executionGrant.baseWorkItemId)
    : persisted.rgWorkItems;
  const generationZeroOperationalScope = !reconciliation && !executionGrant
    && persisted.continuationRevision === 0 && persisted.semanticRevision === 0 && input.operationalPolicy
    ? createGenerationZeroOperationalScope(input.runId, ledger.planHash, input.operationalPolicy)
    : null;
  if (selectedWork[0] && input.ports.runtimeReadiness) {
    appendEvent(input.runId, selectedWork[0].workItemId, null, "production_rg_runtime_readiness_observed", {
      readiness: input.ports.runtimeReadiness,
      operationalPolicy: generationZeroOperationalScope?.policy ?? null,
      qualifiedPublicReadOperationalPolicy: input.ports.qualifiedPublicReadOperationalPolicy ?? null,
      publicRetrievalTransportOperationalPolicy: input.ports.publicRetrievalTransportOperationalPolicy ?? null,
      analyticalCompletionEffect: "none",
      secretMaterialPersisted: false,
    });
  }
  for (const planned of selectedWork) {
    const admission = persisted.rgClaimAdmissions.find((item) => item.atomicClaimId === planned.atomicClaimId);
    if (!admission || admission.researchAdmission !== "admitted_to_rg_work_ledger" || admission.materiality !== "material") continue;
    if (planHashForWork(input.runId, planned.workItemId) !== ledger.planHash) throw new Error("rg_evidence_stale_work_item_plan_binding");
    const latest = workItemFromDb(input.runId, planned.workItemId);
    if (!latest) throw new Error("rg_evidence_persisted_work_item_missing");
    if (admission.facet === "recurrence" && (admission.expectedKnowledgeValueConstraint?.kind !== "synthesis_recurrence"
      || admission.expectedKnowledgeValueConstraint.recurrenceBasis !== "verified_schedule"
      || latest.expectedKnowledgeValueConstraint.kind !== "synthesis_recurrence"
      || latest.expectedKnowledgeValueConstraint.recurrenceBasis !== "verified_schedule")) {
      throw new Error("rg_recurrence_public_evidence_route_binding_invalid");
    }
    if (latest.executionState === "completed_verified_evidence") {
      const retained = verifiedEvidenceFromOperations(input.runId, latest.workItemId, executionGrant?.grantId ?? null);
      if (retained.length === 0 || retained.some((item) => !latest.verifiedEvidenceRefs.includes(item.evidenceId))) {
        throw new Error("rg_verified_evidence_persistence_invalid");
      }
      verifiedEvidence.push(...retained);
      continue;
    }
    if (["completed_unresolved", "degraded_emergency_circuit_breaker", "indeterminate_after_send"].includes(latest.executionState)) {
      if (latest.executionState === "completed_unresolved") completedUnresolved += 1; else degraded += 1;
      continue;
    }
    const generationZeroCeiling = operationalCeilingReason(input.runId, null, generationZeroOperationalScope);
    if (generationZeroCeiling) {
      terminalizeWork(input.runId, latest, "degraded_emergency_circuit_breaker", "degraded",
        generationZeroCeiling, [], workerId);
      degraded += 1;
      continue;
    }
    if (input.ports.availability !== "available") {
      terminalizeWork(input.runId, latest, "degraded_provider_unavailable", "degraded",
        input.ports.unavailabilityReasonCodes[0] ?? "rg_provider_unavailable", [], workerId);
      degraded += 1;
      continue;
    }
    const reservation = reserveWork(input.runId, latest, workerId);
    if (!reservation) continue;
    const result = await executeWorkItem({ runId: input.runId, planHash: ledger.planHash, workItem: reservation,
      admission, ports: input.ports, workerId,
      currentRunContext: { analysisRun: persisted.result, externalEvidenceRegistry: persisted.externalEvidenceRegistry,
        activeRgState: { planHash: ledger.planHash, claimAdmissions: persisted.rgClaimAdmissions,
          workItems: persisted.rgWorkItems, rfBinding: ledger.rfBinding } },
      executionGrant,
      generationZeroOperationalScope });
    if (result.state === "verified") verifiedEvidence.push(...result.evidence);
    else if (result.state === "unresolved") completedUnresolved += 1;
    else {
      degraded += 1;
      const current = workItemFromDb(input.runId, planned.workItemId);
      if (current?.executionState === "indeterminate_after_send") break;
    }
  }

  const after = getPersistedAnalysisRun(input.runId);
  if (!after || after.canonicalTruthHash !== beforeHash || after.result?.canonicalTruthHash !== beforeHash) {
    throw new Error("rg_evidence_mutated_canonical_truth");
  }
  return {
    schemaVersion: RG_EVIDENCE_EXECUTION_SCHEMA_VERSION,
    runId: input.runId,
    planHash: ledger.planHash,
    workItemsConsidered: selectedWork.length,
    workItemsCompletedWithEvidence: new Set(verifiedEvidence.map((item) => item.workItemId)).size,
    workItemsCompletedUnresolved: completedUnresolved,
    workItemsDegraded: degraded,
    verifiedEvidence,
    canonicalTruthHashBefore: beforeHash,
    canonicalTruthHashAfter: after.canonicalTruthHash,
    canonicalTruthPreserved: true,
  };
}

async function executeWorkItem(input: {
  runId: string;
  planHash: string;
  workItem: CanonicalRgWorkItem;
  admission: CanonicalRgClaimAdmission;
  ports: CanonicalRgEvidenceExecutionPorts;
  workerId: string;
  currentRunContext: CanonicalRgCurrentRunContext;
  executionGrant: CanonicalContinuationExecutionGrant | null;
  generationZeroOperationalScope: GenerationZeroOperationalScope | null;
}): Promise<{ state: "verified"; evidence: CanonicalRgVerifiedEvidence[] } | { state: "unresolved" | "degraded"; evidence: [] }> {
  let intent: CanonicalRgSearchIntent;
  try {
    intent = compileCanonicalRgSearchIntent(input.runId, input.planHash, input.workItem, input.admission);
  } catch (error) {
    terminalizeWork(input.runId, input.workItem, "completed_unresolved", "unresolved", safeReason(error), [], input.workerId);
    return { state: "unresolved", evidence: [] };
  }
  let claimContext: CanonicalRgApprovedAiClaimContext;
  try {
    claimContext = compileCanonicalRgApprovedAiClaimContext({ currentRunContext: input.currentRunContext,
      intent, admission: input.admission, expectedValueConstraint: input.workItem.expectedKnowledgeValueConstraint });
  } catch (error) {
    terminalizeWork(input.runId, input.workItem, "degraded_emergency_circuit_breaker", "degraded",
      safeReason(error), [], input.workerId);
    return { state: "degraded", evidence: [] };
  }
  // Validate the complete durable history before any provider operation. A second lookup is
  // deliberately performed for each candidate and again at the send boundary below.
  knownInapplicableDocumentsForIntent(input.runId, intent);
  const search = await runExternalOperation({ ...input, kind: "public_search", candidateId: null,
    providerCode: "public_search", operationInput: { intent, maximumCandidates: MAX_CANDIDATES_PER_WORK_ITEM },
    projectResult: sanitizeSearchResult,
    call: (onSend) => input.ports.search({ intent, maximumCandidates: MAX_CANDIDATES_PER_WORK_ITEM }, onSend) });
  if (search.state !== "completed") return finishFailedOperation(input, search.operation);
  const candidates = validateSearchCandidates(search.value as CanonicalRgDiscoveryCandidate[], intent);
  if (candidates.length === 0) {
    const searchAdmission = search.operation.receipt?.providerDiagnostics?.searchOutputAdmission;
    const stopReason = searchAdmission?.outcome === "no_usable_citations"
      ? "rg_search_completed_no_usable_citations"
      : "rg_search_no_valid_candidates";
    terminalizeWork(input.runId, input.workItem, "completed_unresolved", "unresolved", stopReason, [], input.workerId);
    return { state: "unresolved", evidence: [] };
  }

  const evidence: CanonicalRgVerifiedEvidence[] = [];
  const documentAdmissionFailures: string[] = [];
  const publicReadTransportFailures: string[] = [];
  const candidateOutcomes: CanonicalRgCandidateResearchOutcome["outcomeClass"][] = [];
  let investigationAttempted = false;
  for (const [index, candidate] of candidates.entries()) {
    if (index > 0) appendExtensionDecision(input.runId, input.workItem.workItemId, "extended", "prior_candidate_did_not_produce_verified_support");
    const priorInapplicable = knownInapplicableCandidate(
      knownInapplicableDocumentsForIntent(input.runId, intent), candidate);
    if (priorInapplicable) {
      candidateOutcomes.push(priorInapplicable.outcomeClass);
      appendKnownInapplicableCandidateSkip(input.runId, input.workItem.workItemId, intent, candidate,
        priorInapplicable, null);
      continue;
    }
    const replayContract = publicDocumentRetrievalReplayContract(intent, candidate,
      PUBLIC_DOCUMENT_RETRIEVAL_MAXIMUM_BYTES);
    const qualifiedPublicRead = compileCanonicalQualifiedPublicReadContract(candidate);
    const retrieval = await runExternalOperation({ ...input, kind: "public_retrieval", candidateId: candidate.candidateId,
      providerCode: "independent_https_retrieval", operationInput: { intentId: intent.intentId, candidate,
        qualifiedPublicRead }, qualifiedPublicRead,
      projectResult: sanitizeRetrievedDocument,
      beforeSend: () => knownInapplicableCandidate(
        knownInapplicableDocumentsForIntent(input.runId, intent), candidate),
      publicDocumentReplay: { contract: replayContract, candidate },
      call: (onSend, attempt) => input.ports.retrieve({ intent, candidate,
        maximumBytes: PUBLIC_DOCUMENT_RETRIEVAL_MAXIMUM_BYTES, logicalAttempt: attempt,
        qualifiedPublicRead }, onSend) });
    if (retrieval.state === "excluded_known_inapplicable") {
      candidateOutcomes.push(retrieval.inapplicability.outcomeClass);
      appendKnownInapplicableCandidateSkip(input.runId, input.workItem.workItemId, intent, candidate,
        retrieval.inapplicability, retrieval.operation.operationId);
      continue;
    }
    if (retrieval.state !== "completed") {
      if (retrieval.operation.state === "indeterminate_after_send" || operationStoppedByCircuitBreaker(retrieval.operation)) {
        return finishFailedOperation(input, retrieval.operation);
      }
      if (retrieval.operation.state === "public_read_transport_outcome_unknown") {
        publicReadTransportFailures.push(retrieval.operation.receipt.reasonCode);
        appendEvent(input.runId, input.workItem.workItemId, retrieval.operation.operationId,
          "qualified_public_read_candidate_transport_unavailable", {
            candidateId: candidate.candidateId,
            attempt: retrieval.operation.attempt,
            reasonCode: retrieval.operation.receipt.reasonCode,
            evidenceEffect: "none",
            analyticalCompletionEffect: "none",
            continuation: "next_legitimate_candidate_permitted",
          });
        continue;
      }
      if (isCompletedUnusableResult(retrieval.operation.result)) {
        if (!retrieval.replayArtifact && !isPublicDocumentReplayOperation(retrieval.operation)) {
          appendPublicDocumentRetrievalArtifact({
            runId: input.runId, planHash: input.planHash, workItemId: input.workItem.workItemId,
            operation: retrieval.operation, candidate, replayContract,
            admission: { state: "rejected", reasonCode: retrieval.operation.result.reasonCode,
              documentFingerprint: null },
          });
        }
        documentAdmissionFailures.push(retrieval.operation.result.reasonCode);
        continue;
      }
      return finishFailedOperation(input, retrieval.operation);
    }
    const documentAdmission = admitCanonicalRgRetrievedDocument(
      retrieval.value as CanonicalRgRetrievedDocument, candidate);
    appendDocumentAdmissionDecision(input.runId, input.workItem.workItemId, retrieval.operation.operationId,
      candidate.candidateId, documentAdmission);
    if (!retrieval.replayArtifact && !isPublicDocumentReplayOperation(retrieval.operation)) {
      appendPublicDocumentRetrievalArtifact({
        runId: input.runId, planHash: input.planHash, workItemId: input.workItem.workItemId,
        operation: retrieval.operation, candidate, replayContract, admission: documentAdmission,
      });
    }
    if (documentAdmission.state === "rejected") {
      documentAdmissionFailures.push(documentAdmission.reasonCode);
      continue;
    }
    const document = documentAdmission.document;
    if (intent.continuation?.excludedDocumentFingerprints.includes(document.documentFingerprint)) {
      appendExtensionDecision(input.runId, input.workItem.workItemId, "stopped",
        "continuation_excluded_previously_insufficient_document");
      continue;
    }
    investigationAttempted = true;
    const investigation = await runExternalOperation({ ...input, kind: "investigation", candidateId: candidate.candidateId,
      providerCode: "approved_ai_investigation", operationInput: { intent, candidate,
        documentFingerprint: document.documentFingerprint, approvedAiContextHash: claimContext.contextHash },
      projectResult: sanitizeInvestigatedCandidate,
      call: (onSend) => input.ports.investigate({ intent, admission: input.admission,
        expectedValueConstraint: input.workItem.expectedKnowledgeValueConstraint, candidate, document,
        claimContext }, onSend) });
    if (investigation.state !== "completed") {
      if (investigation.operation.state === "indeterminate_after_send" || operationStoppedByCircuitBreaker(investigation.operation)) {
        return finishFailedOperation(input, investigation.operation);
      }
      return finishFailedOperation(input, investigation.operation);
    }
    const investigated = validateInvestigatedCandidate(investigation.value as CanonicalRgInvestigatedCandidate,
      input.workItem, input.admission, candidate, document);
    if (!investigated) continue;
    const frozenCandidate = freezeCandidate(investigated, investigation.operation.updatedAt);
    const durableVerification = priorVerificationOperationForCandidate({ runId: input.runId, planHash: input.planHash,
      workItem: input.workItem, candidateId: candidate.candidateId,
      documentFingerprint: document.documentFingerprint, frozenCandidateHash: frozenCandidate.frozenCandidateHash,
      executionGrant: input.executionGrant });
    const verification = durableVerification
      ? replayDurableVerificationOperation(input.runId, durableVerification)
      : await runExternalOperation({ ...input, kind: "independent_verification", candidateId: candidate.candidateId,
        providerCode: "approved_ai_independent_verification", operationInput: { intent, candidate,
          documentFingerprint: document.documentFingerprint, frozenCandidate,
          approvedAiContextHash: claimContext.contextHash },
        projectResult: sanitizeVerificationJudgment,
        call: (onSend) => input.ports.verify({ intent, admission: input.admission,
          expectedValueConstraint: input.workItem.expectedKnowledgeValueConstraint, candidate, document, frozenCandidate,
          claimContext }, onSend) });
    if (verification.state !== "completed") {
      if (verification.operation.state === "indeterminate_after_send" || operationStoppedByCircuitBreaker(verification.operation)) {
        return finishFailedOperation(input, verification.operation);
      }
      return finishFailedOperation(input, verification.operation);
    }
    const verified = validateVerification({ runId: input.runId, planHash: input.planHash, intent,
      workItem: input.workItem, admission: input.admission, candidate, document, frozenCandidate,
      judgment: verification.value as CanonicalRgVerificationJudgment });
    if (verified) {
      attachVerifiedEvidence(input.runId, verification.operation, verified);
      evidence.push(verified);
    }
    const candidateOutcome = canonicalCandidateResearchOutcome({ runId: input.runId, planHash: input.planHash,
      workItem: input.workItem, admission: input.admission, intent, candidate, document, frozenCandidate,
      verificationOperationId: verification.operation.operationId,
      judgment: verification.value as CanonicalRgVerificationJudgment, verifiedEvidence: verified });
    appendCandidateResearchOutcome(input.runId, candidateOutcome);
    const reusableNegativeProof = canonicalReusableNegativeApplicabilityProof({
      runId: input.runId,
      intent,
      candidate,
      document,
      frozenCandidate,
      verificationOperationId: verification.operation.operationId,
      judgment: verification.value as CanonicalRgVerificationJudgment,
      outcome: candidateOutcome,
    });
    if (reusableNegativeProof) appendReusableNegativeApplicabilityProof(input.runId, input.workItem.workItemId,
      reusableNegativeProof);
    candidateOutcomes.push(candidateOutcome.outcomeClass);
    if (verified) break;
  }
  if (evidence.length > 0) {
    terminalizeWork(input.runId, input.workItem, "completed_verified_evidence", "verified_evidence",
      "rg_verified_claim_scoped_evidence_obtained", evidence.map((item) => item.evidenceId), input.workerId);
    appendExtensionDecision(input.runId, input.workItem.workItemId, "stopped", "exact_claim_support_verified_early_completion");
    return { state: "verified", evidence };
  }
  terminalizeWork(input.runId, input.workItem, "completed_unresolved", "unresolved",
    !investigationAttempted && publicReadTransportFailures.length > 0
      ? exactPublicReadTransportStopReason(publicReadTransportFailures)
      : !investigationAttempted && documentAdmissionFailures.length > 0
      ? exactDocumentAdmissionStopReason(documentAdmissionFailures)
      : exactNoSupportStopReason(candidateOutcomes), [], input.workerId);
  appendExtensionDecision(input.runId, input.workItem.workItemId, "stopped",
    "settled_search_batch_without_exact_support_not_analytical_completion");
  return { state: "unresolved", evidence: [] };
}

function finishFailedOperation(
  input: { runId: string; workItem: CanonicalRgWorkItem; workerId: string },
  operation: CanonicalRgOperation,
): { state: "unresolved" | "degraded"; evidence: [] } {
  if (operation.state === "completed" && isCompletedUnusableResult(operation.result)) {
    terminalizeWork(input.runId, input.workItem, "completed_unresolved", "unresolved",
      operation.receipt.reasonCode, [], input.workerId);
    appendExtensionDecision(input.runId, input.workItem.workItemId, "stopped",
      "settled_search_batch_without_exact_support_not_analytical_completion");
    return { state: "unresolved", evidence: [] };
  }
  const indeterminate = operation.state === "indeterminate_after_send";
  const providerRejected = operation.state === "provider_rejected";
  terminalizeWork(input.runId, input.workItem, indeterminate ? "indeterminate_after_send"
    : providerRejected ? "degraded_provider_unavailable" : "degraded_emergency_circuit_breaker",
    "degraded", operation.receipt.reasonCode, [], input.workerId);
  return { state: "degraded", evidence: [] };
}

function operationStoppedByCircuitBreaker(operation: CanonicalRgOperation): boolean {
  return operation.state === "failed_before_send"
    && operation.receipt.reasonCode.endsWith("_not_analytical_completion");
}

export function compileCanonicalRgSearchIntent(
  runId: string,
  planHash: string,
  workItem: CanonicalRgWorkItem,
  admission: CanonicalRgClaimAdmission,
): CanonicalRgSearchIntent {
  if (admission.atomicClaimId !== workItem.atomicClaimId || admission.researchAdmission !== "admitted_to_rg_work_ledger"
    || admission.materiality !== "material" || workItem.requestedOperation !== "claim_scoped_public_research") {
    throw new Error("rg_search_intent_work_not_admitted");
  }
  const persisted = getPersistedAnalysisRun(runId);
  const rb = persisted?.result?.artifacts.rb;
  const rd = persisted?.result?.artifacts.rd;
  if (!persisted || !rb || !rd) throw new Error("rg_search_intent_canonical_lineage_unavailable");
  const chargeRefs = new Set(admission.canonicalRefs);
  const relevantCharges = rd.economicLayer.charges.filter((charge) => chargeRefs.has(charge.id));
  const occurrenceRefs = new Set([
    ...admission.occurrenceRefs,
    ...relevantCharges.flatMap((charge) => charge.sourceOccurrenceRefs),
    ...relevantCharges.flatMap((charge) => charge.contributingOccurrenceRef ? [charge.contributingOccurrenceRef] : []),
  ]);
  const labels = rb.sourceModel.occurrences.filter((occurrence) => occurrenceRefs.has(occurrence.id))
    .map((occurrence) => safePublicSubjectConcept(occurrence.sourceLabel)).filter((value): value is string => value !== null);
  const publicSubjectConcept = [...new Set(labels)].sort((left, right) => left.length - right.length || left.localeCompare(right))[0];
  if (!publicSubjectConcept) throw new Error("rg_search_intent_public_subject_unavailable");
  assertCanonicalProductionApplicabilityScope(workItem.knowledgeQuery.scope);
  const publicScope = Object.fromEntries(Object.entries(workItem.knowledgeQuery.scope)
    .filter(([key, value]) => key !== "tenantRef" && key !== "accountRef" && typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value))
    .map(([key, value]) => [key, String(value)]));
  const providerSafe = providerSafeScope(workItem.knowledgeQuery.scope);
  const exactPublicDimensions = Object.fromEntries(Object.entries(providerSafe)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const unknownPublicDimensions = Object.entries(providerSafe)
    .filter(([, value]) => value === null).map(([key]) => key).sort();
  const discoveryApplicabilityBase = {
    productionScopeVersion: CANONICAL_PRODUCTION_APPLICABILITY_SCOPE_VERSION,
    countryCode: CANONICAL_PRODUCTION_COUNTRY_CODE,
    publicSubjectConcept,
    claimType: workItem.knowledgeQuery.claimType,
    exactPublicDimensions,
    asOf: workItem.knowledgeQuery.asOf,
    statementPeriod: admission.statementPeriod,
    requiredSourceAuthorities: [...workItem.requiredSourceAuthorities].sort(),
  };
  const discoveryScope = {
    productionScopeVersion: CANONICAL_PRODUCTION_APPLICABILITY_SCOPE_VERSION,
    countryCode: CANONICAL_PRODUCTION_COUNTRY_CODE,
    processorFamily: providerSafe.processor,
    processorProgram: providerSafe.processorProgram,
    exactPublicDimensions,
    unknownPublicDimensions,
    applicabilityFingerprint: digest(discoveryApplicabilityBase),
  };
  const publicScopeTerms = discoveryScopeQueryTerms(exactPublicDimensions);
  if (publicScopeTerms.length === 0) publicScopeTerms.push("payment processing");
  const facetConcept = publicSearchFacetConcept(workItem.expectedKnowledgeValueConstraint, admission.facet);
  const periodYear = workItem.knowledgeQuery.asOf.slice(0, 4);
  const publicRefinementTerms = refinementTerms(workItem.continuationContract?.kind ?? null);
  const queryTerms = [...publicScopeTerms, publicSubjectConcept, facetConcept, "official publication", periodYear,
    ...publicRefinementTerms];
  const queryText = queryTerms.map((term) => term === publicSubjectConcept ? `"${term}"` : term).join(" ");
  validatePublicQuery(queryText, { runId, planHash, workItem, admission });
  const base = { runId, planHash, workItemId: workItem.workItemId, atomicClaimId: admission.atomicClaimId,
    facet: admission.facet, claimType: workItem.knowledgeQuery.claimType, publicSubjectConcept, publicScope, discoveryScope,
    asOf: workItem.knowledgeQuery.asOf, statementPeriod: admission.statementPeriod,
    requiredSourceAuthorities: [...workItem.requiredSourceAuthorities].sort(), evidenceObjective: workItem.evidenceObjective,
    queryTerms, queryText,
    continuation: workItem.executionAuthorization ? {
      executionGrantId: workItem.executionAuthorization.grantId,
      executionGeneration: workItem.executionAuthorization.executionGeneration,
      kind: workItem.continuationContract?.kind ?? "newly_eligible" as const,
      requiredGap: workItem.continuationContract?.requiredGap ?? null,
      excludedDocumentFingerprints: [...(workItem.continuationContract?.excludedDocumentFingerprints ?? [])].sort(),
      publicRefinementTerms,
    } : null };
  return {
    schemaVersion: "canonical_rg_search_intent_v1_3",
    intentId: `rg-intent-${digest(base).slice(0, 32)}`,
    ...base,
    privacy: { status: "validated_public_concepts_only", forbiddenPrivateValuesObserved: 0,
      compiler: "deterministic_claim_lineage_v3_us_scope" },
  };
}

function discoveryScopeQueryTerms(exactPublicDimensions: Record<string, string>): string[] {
  const labeled = [
    ["processor", "processor family"],
    ["processorProgram", "processor program"],
    ["network", "network"],
    ["region", "region"],
    ["jurisdiction", "jurisdiction"],
  ] as const;
  return labeled.flatMap(([dimension, label]) => {
    const value = exactPublicDimensions[dimension];
    if (value === "us" && dimension === "region") return ["United States merchants"];
    if (value === "us" && dimension === "jurisdiction") return ["United States applicability"];
    return value ? [`${value.replaceAll("_", " ")} ${label}`] : [];
  });
}

function publicSearchFacetConcept(
  constraint: CanonicalRgWorkItem["expectedKnowledgeValueConstraint"],
  facet: CanonicalRgClaimAdmission["facet"],
): string {
  switch (constraint.kind) {
    case "mapping": return facet === "economic_category" ? "economic category classification" : `${facet.replaceAll("_", " ")} mapping`;
    case "role": return `${constraint.controlDimension.replaceAll("_", " ")} participant role`;
    case "boolean": return `${facet.replaceAll("_", " ")} merchant availability`;
    case "synthesis_constraint_identity": return "constraint rule or requirement identity";
    case "synthesis_constraint_action_effect": return `constraint effect on ${constraint.safeActionCode.replaceAll("_", " ")}`;
    case "synthesis_condition_state": return `${constraint.conditionCode.replaceAll("_", " ")} condition for ${constraint.safeActionCode.replaceAll("_", " ")}`;
    case "synthesis_economic_driver": return "economic cost driver";
    case "synthesis_recurrence": return "verified fee schedule cadence recurrence";
    case "synthesis_counterfactual": return "statement period economic counterfactual";
    case "synthesis_safe_action": return `supported merchant action ${constraint.allowedSafeActionCodes.join(" or ").replaceAll("_", " ")}`;
    case "synthesis_merchant_influence": return `${constraint.influenceKind.replaceAll("_", " ")} for ${constraint.safeActionCode.replaceAll("_", " ")}`;
  }
}

function refinementTerms(kind: NonNullable<CanonicalRgWorkItem["continuationContract"]>["kind"] | null): string[] {
  if (kind === "period_refinement") return ["effective date"];
  if (kind === "scope_refinement") return ["applicability scope"];
  if (kind === "locator_subsection_refinement") return ["schedule section"];
  return [];
}

function safePublicSubjectConcept(value: string): string | null {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized.length < 3 || normalized.length > 120 || !/[A-Za-z]{2}/.test(normalized)) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9 &'()+,./:-]*$/.test(normalized)) return null;
  if (/(?:https?:\/\/|www\.|@|\$|\b\d{6,}\b|\b(?:mid|merchant|account)\s*(?:id|number)?\b|api[_ -]?key|password|secret|ignore (?:all|previous)|system prompt|tool call|(?:^|[\/])(?:users|home|private|tmp)[\/])/i.test(normalized)) return null;
  return normalized;
}

function validatePublicQuery(query: string, binding: { runId: string; planHash: string; workItem: CanonicalRgWorkItem; admission: CanonicalRgClaimAdmission }): void {
  if (query.length < 8 || query.length > 320 || /[\r\n\0]/.test(query)) throw new Error("rg_search_intent_query_invalid");
  const privateValues = [binding.runId, binding.planHash, binding.workItem.workItemId, binding.admission.atomicClaimId,
    binding.admission.opaqueSubjectCode, binding.admission.scopeFingerprint,
    binding.workItem.knowledgeQuery.scope.tenantRef, binding.workItem.knowledgeQuery.scope.accountRef]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  if (privateValues.some((value) => query.includes(value))
    || /(?:https?:\/\/|www\.|@|\$|\b\d{6,}\b|\b(?:mid|merchant|account)\s*(?:id|number)?\b|api[_ -]?key|password|secret|ignore (?:all|previous)|system prompt|tool call)/i.test(query)) {
    throw new Error("rg_search_intent_private_or_untrusted_content_blocked");
  }
}

type OperationCallResult =
  | { state: "completed"; value: unknown; operation: CanonicalRgOperation;
    replayArtifact?: CanonicalRgPublicDocumentRetrievalArtifact }
  | { state: "failed"; value: null; operation: CanonicalRgOperation;
    replayArtifact?: CanonicalRgPublicDocumentRetrievalArtifact }
  | { state: "excluded_known_inapplicable"; value: null; operation: CanonicalRgOperation;
    inapplicability: ReusableCandidateInapplicability };

async function runExternalOperation<T>(input: {
  runId: string;
  planHash: string;
  workItem: CanonicalRgWorkItem;
  admission: CanonicalRgClaimAdmission;
  workerId: string;
  ports: CanonicalRgEvidenceExecutionPorts;
  kind: CanonicalRgOperation["kind"];
  candidateId: string | null;
  providerCode: string;
  operationInput: unknown;
  projectResult(value: T): unknown;
  call(onSend: () => void, attempt: number): Promise<RgEvidencePortResult<T>>;
  beforeSend?: () => ReusableCandidateInapplicability | null;
  publicDocumentReplay?: {
    contract: CanonicalRgPublicDocumentRetrievalReplayContract;
    candidate: CanonicalRgDiscoveryCandidate;
  };
  qualifiedPublicRead?: CanonicalQualifiedPublicReadContractV1;
  executionGrant: CanonicalContinuationExecutionGrant | null;
  generationZeroOperationalScope: GenerationZeroOperationalScope | null;
}): Promise<OperationCallResult> {
  const inputHash = digest(input.operationInput);
  const qualifiedPublicRead = input.qualifiedPublicRead
    ? assertCanonicalQualifiedPublicReadContract(input.kind, input.operationInput, input.qualifiedPublicRead) : null;
  const maximumAttempts = qualifiedPublicRead
    ? validatedQualifiedPublicReadMaximumAttempts(input.ports.qualifiedPublicReadOperationalPolicy)
    : MAX_BEFORE_SEND_ATTEMPTS;
  const ceilingReason = operationalCeilingReason(input.runId, input.executionGrant,
    input.generationZeroOperationalScope);
  if (ceilingReason) {
    const operationId = `rg-op-${digest({ runId: input.runId, planHash: input.planHash,
      executionGrantId: input.executionGrant?.grantId ?? null, workItemId: input.workItem.workItemId,
      kind: input.kind, candidateId: input.candidateId, attempt: 1, inputHash }).slice(0, 32)}`;
    const existing = operationFromDb(input.runId, operationId);
    const reserved = existing ?? reserveOperation({ ...input, operationId, attempt: 1, inputHash });
    const failed = existing?.state === "failed_before_send" ? existing
      : settleOperation(input.runId, reserved, "failed_before_send", null, null, ceilingReason);
    appendRetryDecision(input.runId, input.workItem.workItemId, operationId, "no_retry",
      "emergency_operational_ceiling_not_analytical_completion");
    return { state: "failed", value: null, operation: failed };
  }
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const operationId = `rg-op-${digest({ runId: input.runId, planHash: input.planHash,
      executionGrantId: input.executionGrant?.grantId ?? null, workItemId: input.workItem.workItemId,
      kind: input.kind, candidateId: input.candidateId, attempt, inputHash }).slice(0, 32)}`;
    const existing = operationFromDb(input.runId, operationId);
    if (existing?.state === "completed") {
      assertSearchOutputAdmission(existing.kind, existing.receipt.providerDiagnostics ?? null);
      return isCompletedUnusableResult(existing.result)
        ? { state: "failed", value: null, operation: existing }
        : { state: "completed", value: replayableCompletedOperationResult(existing), operation: existing };
    }
    if (existing?.state === "provider_rejected") return { state: "failed", value: null, operation: existing };
    if (existing?.state === "failed_before_send") {
      if (attempt < maximumAttempts) continue;
      return { state: "failed", value: null, operation: existing };
    }
    if (existing?.state === "public_read_transport_outcome_unknown") {
      if (!qualifiedPublicRead) throw new Error("rg_qualified_public_read_recovery_binding_missing");
      if (attempt < maximumAttempts) continue;
      return { state: "failed", value: null, operation: existing };
    }
    if (existing?.state === "sent" || existing?.state === "indeterminate_after_send") {
      if (existing.state === "sent" && qualifiedPublicRead) {
        const unknown = settleOperation(input.runId, existing, "public_read_transport_outcome_unknown", null, null,
          "rg_qualified_public_read_prior_send_completion_unknown");
        appendRetryDecision(input.runId, input.workItem.workItemId, unknown.operationId,
          attempt < maximumAttempts ? "retry" : "no_retry",
          attempt < maximumAttempts ? "qualified_public_read_new_attempt_authorized_after_restart"
            : "qualified_public_read_operational_attempt_limit_reached_not_analytical_completion");
        if (attempt < maximumAttempts) continue;
        return { state: "failed", value: null, operation: unknown };
      }
      const indeterminate = existing.state === "indeterminate_after_send" ? existing : settleOperation(input.runId, existing,
        "indeterminate_after_send", null, null, "rg_operation_prior_send_completion_unknown");
      return { state: "failed", value: null, operation: indeterminate };
    }
    const operation = existing ? rebindReservedOperation(input.runId, existing, input.workerId)
      : reserveOperation({ ...input, operationId, attempt, inputHash });
    let sent = false;
    try {
      const replayBeforeCall = input.publicDocumentReplay
        ? publicDocumentRetrievalArtifactForReplay(input.runId, input.publicDocumentReplay.contract) : null;
      if (replayBeforeCall) return settlePublicDocumentRetrievalReplay(input, operation, replayBeforeCall);
      const result = await input.call(() => {
        const inapplicability = input.beforeSend?.() ?? null;
        if (inapplicability) throw new CandidateRetrievalExcludedBeforeSend(inapplicability);
        const replayBeforeSend = input.publicDocumentReplay
          ? publicDocumentRetrievalArtifactForReplay(input.runId, input.publicDocumentReplay.contract) : null;
        if (replayBeforeSend) throw new PublicDocumentRetrievalReplayBeforeSend(replayBeforeSend);
        markOperationSent(input.runId, operation.operationId, input.workerId); sent = true;
      }, attempt);
      const projected = input.projectResult(result.value);
      const localSearchAdmissionFailure = completedSearchAdmissionFailure(input.kind, result.receipt);
      if (localSearchAdmissionFailure) {
        throw new RgEvidenceCompletedUnusableError(localSearchAdmissionFailure.reasonCode,
          localSearchAdmissionFailure.receipt);
      }
      const settled = settleOperation(input.runId, operation, "completed", projected, result.receipt, "rg_operation_completed");
      incrementResource(input.runId, input.workItem.workItemId, input.kind, result.receipt);
      return { state: "completed", value: projected, operation: settled };
    } catch (error) {
      if (error instanceof PublicDocumentRetrievalReplayBeforeSend) {
        if (sent || input.kind !== "public_retrieval" || !input.publicDocumentReplay) {
          throw new Error("rg_public_document_retrieval_replay_send_state_invalid");
        }
        return settlePublicDocumentRetrievalReplay(input, operation, error.artifact);
      }
      if (error instanceof CandidateRetrievalExcludedBeforeSend) {
        if (sent || input.kind !== "public_retrieval") {
          throw new Error("rg_candidate_retrieval_exclusion_send_state_invalid");
        }
        const settled = settleOperation(input.runId, operation, "failed_before_send", null, null,
          error.message);
        appendRetryDecision(input.runId, input.workItem.workItemId, operation.operationId,
          "no_retry", "known_inapplicable_document_excluded_before_send");
        return { state: "excluded_known_inapplicable", value: null, operation: settled,
          inapplicability: error.inapplicability };
      }
      if (!sent && error instanceof Error && error.message === "rg_candidate_research_outcome_integrity_invalid") {
        settleOperation(input.runId, operation, "failed_before_send", null, null, error.message);
        appendRetryDecision(input.runId, input.workItem.workItemId, operation.operationId,
          "no_retry", "corrupt_inapplicability_history_fail_closed");
        throw error;
      }
      if (!sent && error instanceof Error
        && error.message === "rg_public_document_retrieval_artifact_integrity_invalid") {
        settleOperation(input.runId, operation, "failed_before_send", null, null, error.message);
        appendRetryDecision(input.runId, input.workItem.workItemId, operation.operationId,
          "no_retry", "corrupt_public_document_replay_history_fail_closed");
        throw error;
      }
      if (error instanceof RgEvidenceCompletedUnusableError) {
        if (!["public_search", "public_retrieval"].includes(input.kind) || !sent) {
          throw new Error("rg_completed_unusable_outcome_invalid");
        }
        const reason = safeReason(error);
        const completedReceipt = completedUnusableReceipt(input.kind, error.receipt, reason);
        const completedUnusable: CanonicalRgCompletedUnusableResult = {
          schemaVersion: "canonical_rg_completed_unusable_result_v1",
          outcome: "completed_unusable",
          reasonCode: reason,
        };
        const settled = settleOperation(input.runId, operation, "completed", completedUnusable, completedReceipt, reason);
        if (input.kind === "public_retrieval") {
          appendDocumentAdmissionDecision(input.runId, input.workItem.workItemId, operation.operationId,
            input.candidateId, { state: "rejected", reasonCode: reason, documentFingerprint: null });
        }
        incrementResource(input.runId, input.workItem.workItemId, input.kind, completedReceipt);
        appendRetryDecision(input.runId, input.workItem.workItemId, operation.operationId,
          "no_retry", input.kind === "public_search" ? "completed_unusable_public_search_no_retry"
            : "completed_unusable_public_retrieval_no_retry");
        return { state: "failed", value: null, operation: settled };
      }
      const providerRejected = error instanceof RgEvidenceTransportError && error.transportState === "provider_rejected";
      const afterSend = !providerRejected && (sent || (error instanceof RgEvidenceTransportError && error.transportState !== "before_send"));
      const reason = safeReason(error);
      const errorReceipt = error instanceof RgEvidenceTransportError ? error.receipt : null;
      const qualifiedReadUnknown = Boolean(qualifiedPublicRead && afterSend && !providerRejected);
      const settled = settleOperation(input.runId, operation,
        providerRejected ? "provider_rejected" : qualifiedReadUnknown ? "public_read_transport_outcome_unknown"
          : afterSend ? "indeterminate_after_send" : "failed_before_send",
        null, errorReceipt, reason);
      if (afterSend || providerRejected) incrementResource(input.runId, input.workItem.workItemId, input.kind, {
        providerCode: errorReceipt?.providerCode ?? input.providerCode,
        providerRequestId: errorReceipt?.providerRequestId ?? null,
        calls: errorReceipt?.calls ?? 1, tokens: errorReceipt?.tokens ?? null,
        retrievalBytes: errorReceipt?.retrievalBytes ?? 0,
        providerDiagnostics: errorReceipt?.providerDiagnostics ?? null,
        retrievalTransportDiagnostics: errorReceipt?.retrievalTransportDiagnostics ?? null,
      });
      appendRetryDecision(input.runId, input.workItem.workItemId, operation.operationId,
        qualifiedReadUnknown && attempt < maximumAttempts ? "retry"
          : !afterSend && !providerRejected && attempt < maximumAttempts ? "retry" : "no_retry",
        providerRejected ? "known_provider_rejection_no_immediate_retry"
          : qualifiedReadUnknown ? attempt < maximumAttempts
            ? "qualified_public_read_new_attempt_authorized"
            : "qualified_public_read_operational_attempt_limit_reached_not_analytical_completion"
          : afterSend ? "indeterminate_after_send_no_blind_retry" : attempt < maximumAttempts
          ? "before_send_failure_bounded_retry" : "before_send_retry_limit_reached");
      if ((!qualifiedReadUnknown && afterSend) || providerRejected || attempt === maximumAttempts) {
        return { state: "failed", value: null, operation: settled };
      }
    }
  }
  throw new Error("rg_operation_retry_state_invalid");
}

function settlePublicDocumentRetrievalReplay<T>(input: {
  runId: string;
  workItem: CanonicalRgWorkItem;
  kind: CanonicalRgOperation["kind"];
  candidateId: string | null;
  projectResult(value: T): unknown;
  publicDocumentReplay?: {
    contract: CanonicalRgPublicDocumentRetrievalReplayContract;
    candidate: CanonicalRgDiscoveryCandidate;
  };
}, operation: CanonicalRgOperation,
artifact: CanonicalRgPublicDocumentRetrievalArtifact): OperationCallResult {
  if (input.kind !== "public_retrieval" || !input.publicDocumentReplay || operation.state !== "reserved"
    || artifact.runId !== input.runId
    || artifact.replayIdentity !== digest(input.publicDocumentReplay.contract)) {
    throw new Error("rg_public_document_retrieval_replay_binding_invalid");
  }
  const replayReceipt: RgEvidencePortReceipt = {
    providerCode: "durable_analysis_run_public_document_replay",
    providerRequestId: null,
    calls: 0,
    tokens: 0,
    retrievalBytes: 0,
  };
  const projected = artifact.outcome.kind === "admitted_document"
    ? input.projectResult(rebindReplayedPublicDocument(artifact.outcome.document,
      input.publicDocumentReplay.candidate) as T)
    : {
      schemaVersion: "canonical_rg_completed_unusable_result_v1",
      outcome: "completed_unusable",
      reasonCode: artifact.outcome.admissionReasonCode,
    } satisfies CanonicalRgCompletedUnusableResult;
  const settled = settleOperation(input.runId, operation, "completed", projected, replayReceipt,
    artifact.outcome.kind === "admitted_document"
      ? "rg_public_document_retrieval_admission_replayed"
      : artifact.outcome.admissionReasonCode);
  appendEvent(input.runId, input.workItem.workItemId, settled.operationId,
    "public_document_retrieval_admission_replayed", {
      schemaVersion: "canonical_rg_public_document_retrieval_replay_v1",
      replayIdentity: artifact.replayIdentity,
      artifactId: artifact.artifactId,
      sourceOperationId: artifact.source.operationId,
      currentCandidateId: input.publicDocumentReplay.candidate.candidateId,
      outcomeKind: artifact.outcome.kind,
      providerCalls: 0,
      retrievalBytes: 0,
      claimNeutralTransportReuseOnly: true,
      investigationAndVerificationRequiredPerExactClaim:
        artifact.outcome.kind === "admitted_document",
      semanticReuse: "prohibited",
      evidenceAdmissionEffect: "none",
      analyticalCompletionEffect: "none",
      canonicalMutationAllowed: false,
    });
  if (artifact.outcome.kind === "deterministic_unusable") {
    appendDocumentAdmissionDecision(input.runId, input.workItem.workItemId, settled.operationId,
      input.candidateId, { state: "rejected", reasonCode: artifact.outcome.admissionReasonCode,
        documentFingerprint: artifact.outcome.documentFingerprint });
    appendRetryDecision(input.runId, input.workItem.workItemId, settled.operationId,
      "no_retry", "deterministic_unusable_public_document_replayed_no_retry");
    return { state: "failed", value: null, operation: settled, replayArtifact: artifact };
  }
  return { state: "completed", value: projected, operation: settled, replayArtifact: artifact };
}

function publicDocumentRetrievalReplayContract(
  intent: CanonicalRgSearchIntent,
  candidate: CanonicalRgDiscoveryCandidate,
  maximumBytes: number,
): CanonicalRgPublicDocumentRetrievalReplayContract {
  // Deliberately omit atomic claim/facet identity: this contract describes only whether the
  // exact public transport and deterministic document-admission work can be replayed. Keep
  // authority, temporal, applicability, and freshness requirements because changing any of
  // those can legitimately require observing the URL again.
  return {
    schemaVersion: PUBLIC_DOCUMENT_RETRIEVAL_REPLAY_CONTRACT_VERSION,
    normalizedRequestedUrl: normalizeSafeHttpsUrl(candidate.url),
    claimedAuthority: candidate.claimedAuthority,
    candidateTemporalIdentity: {
      publicationDate: candidate.publicationDate,
      effectiveFrom: candidate.effectiveFrom,
      effectiveTo: candidate.effectiveTo,
    },
    freshnessRequirement: {
      asOf: intent.asOf,
      statementPeriod: structuredClone(intent.statementPeriod),
      excludedDocumentFingerprints: [...new Set(intent.continuation?.excludedDocumentFingerprints ?? [])].sort(),
    },
    productionScope: {
      version: CANONICAL_PRODUCTION_APPLICABILITY_SCOPE_VERSION,
      countryCode: CANONICAL_PRODUCTION_COUNTRY_CODE,
    },
    applicabilityRequirements: {
      exactPublicDimensions: Object.fromEntries(Object.entries(intent.discoveryScope.exactPublicDimensions)
        .sort(([left], [right]) => left.localeCompare(right))),
      unknownPublicDimensions: [...intent.discoveryScope.unknownPublicDimensions].sort(),
    },
    transport: {
      maximumBytes,
      httpsOnly: true,
      redirectsRequireFreshAuthorization: true,
      independentRetrievalRequired: true,
      contentFormats: "all_supported_public_content_formats",
    },
    admission: {
      normalizationVersion: "public_document_text_normalization_v1",
      contractVersion: "canonical_rg_retrieved_document_admission_v1",
    },
  };
}

export function compileCanonicalQualifiedPublicReadContract(
  candidate: CanonicalRgDiscoveryCandidate,
): CanonicalQualifiedPublicReadContractV1 {
  return {
    schemaVersion: "canonical_qualified_public_read_v1",
    runtimePolicyAmendment: "frozen_product_model_runtime_policy_amendment_v0_3",
    normalizedUrl: normalizeSafeHttpsUrl(candidate.url),
    method: "GET",
    transport: "https",
    authentication: "none",
    authorizationHeader: "absent",
    cookieHeader: "absent",
    credentialMaterial: "absent",
    requestBody: "absent",
    merchantPrivateData: "absent",
    redirectHandling: "fresh_destination_authorization_required",
    destinationSafety: "dns_public_address_pinned_and_rebinding_protected",
    canonicalMutationBeforeAdmission: false,
    recoveryPermission: "new_separately_identified_bounded_read_attempt",
    reconciliationEffect: "no_run_wide_barrier_for_this_qualified_read_only",
    evidenceEffect: "none",
    analyticalCompletionEffect: "none",
  };
}

export function assertCanonicalQualifiedPublicReadContract(
  kind: CanonicalRgOperation["kind"],
  operationInput: unknown,
  contract: CanonicalQualifiedPublicReadContractV1,
): CanonicalQualifiedPublicReadContractV1 {
  const embedded = operationInput && typeof operationInput === "object"
    ? (operationInput as Record<string, unknown>).qualifiedPublicRead : null;
  if (kind !== "public_retrieval" || !embedded || digest(embedded) !== digest(contract)
    || contract.schemaVersion !== "canonical_qualified_public_read_v1"
    || contract.runtimePolicyAmendment !== "frozen_product_model_runtime_policy_amendment_v0_3"
    || normalizeSafeHttpsUrl(contract.normalizedUrl) !== contract.normalizedUrl
    || contract.method !== "GET" || contract.transport !== "https"
    || contract.authentication !== "none" || contract.authorizationHeader !== "absent"
    || contract.cookieHeader !== "absent" || contract.credentialMaterial !== "absent"
    || contract.requestBody !== "absent" || contract.merchantPrivateData !== "absent"
    || contract.redirectHandling !== "fresh_destination_authorization_required"
    || contract.destinationSafety !== "dns_public_address_pinned_and_rebinding_protected"
    || contract.canonicalMutationBeforeAdmission !== false
    || contract.recoveryPermission !== "new_separately_identified_bounded_read_attempt"
    || contract.reconciliationEffect !== "no_run_wide_barrier_for_this_qualified_read_only"
    || contract.evidenceEffect !== "none" || contract.analyticalCompletionEffect !== "none") {
    throw new Error("rg_qualified_public_read_contract_invalid");
  }
  return contract;
}

function validatedQualifiedPublicReadMaximumAttempts(
  policy: CanonicalQualifiedPublicReadOperationalPolicyV1 | undefined,
): number {
  const value = policy ?? {
    schemaVersion: "canonical_qualified_public_read_operational_policy_v1" as const,
    maximumAttemptsPerCandidate: DEFAULT_QUALIFIED_PUBLIC_READ_MAX_ATTEMPTS,
  };
  if (value.schemaVersion !== "canonical_qualified_public_read_operational_policy_v1"
    || !Number.isSafeInteger(value.maximumAttemptsPerCandidate)
    || value.maximumAttemptsPerCandidate < 1 || value.maximumAttemptsPerCandidate > 5) {
    throw new Error("rg_qualified_public_read_operational_policy_invalid");
  }
  return value.maximumAttemptsPerCandidate;
}

function rebindReplayedPublicDocument(
  document: CanonicalRgRetrievedDocument,
  candidate: CanonicalRgDiscoveryCandidate,
): CanonicalRgRetrievedDocument {
  return {
    ...structuredClone(document),
    candidateId: candidate.candidateId,
    requestedUrl: candidate.url,
  };
}

function isCompletedUnusableResult(value: unknown): value is CanonicalRgCompletedUnusableResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return result.schemaVersion === "canonical_rg_completed_unusable_result_v1"
    && result.outcome === "completed_unusable" && typeof result.reasonCode === "string"
    && /^[a-z][a-z0-9_:.-]{0,191}$/.test(result.reasonCode);
}

function replayableCompletedOperationResult(operation: CanonicalRgOperation): unknown {
  if (operation.kind !== "independent_verification") return operation.result;
  return verificationEnvelopeFromResult(operation.result)?.judgment ?? operation.result;
}

function priorVerificationOperationForCandidate(input: {
  runId: string;
  planHash: string;
  workItem: CanonicalRgWorkItem;
  candidateId: string;
  documentFingerprint: string;
  frozenCandidateHash: string;
  executionGrant: CanonicalContinuationExecutionGrant | null;
}): CanonicalRgOperation | null {
  const rows = db.prepare(`SELECT operation_json FROM canonical_rg_operations
    WHERE run_id = ? AND work_item_id = ? AND plan_hash = ? ORDER BY updated_at DESC, operation_id DESC`)
    .all(input.runId, input.workItem.workItemId, input.planHash) as Array<{ operation_json: string }>;
  const operations = rows.map((row) => JSON.parse(row.operation_json) as CanonicalRgOperation)
    .filter((operation) => operation.kind === "independent_verification"
      && operation.candidateId === input.candidateId
      && (operation.executionGrantId ?? null) === (input.executionGrant?.grantId ?? null)
      && (operation.input as { documentFingerprint?: unknown }).documentFingerprint === input.documentFingerprint
      && (operation.input as { frozenCandidate?: { frozenCandidateHash?: unknown } }).frozenCandidate?.frozenCandidateHash
        === input.frozenCandidateHash);
  const ambiguous = operations.find((operation) => operation.state === "sent"
    || operation.state === "indeterminate_after_send");
  return ambiguous ?? operations.find((operation) => operation.state === "completed") ?? null;
}

function replayDurableVerificationOperation(runId: string, operation: CanonicalRgOperation): OperationCallResult {
  if (operation.state === "completed") return { state: "completed",
    value: replayableCompletedOperationResult(operation), operation };
  const indeterminate = operation.state === "indeterminate_after_send" ? operation
    : settleOperation(runId, operation, "indeterminate_after_send", null, null,
      "rg_operation_prior_send_completion_unknown");
  return { state: "failed", value: null, operation: indeterminate };
}

function verificationEnvelopeFromResult(value: unknown): {
  judgment: CanonicalRgVerificationJudgment;
  verifiedEvidence: CanonicalRgVerifiedEvidence;
} | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const hasEnvelopeField = Object.hasOwn(record, "judgment") || Object.hasOwn(record, "verifiedEvidence");
  if (!hasEnvelopeField) return null;
  if (!record.judgment || typeof record.judgment !== "object"
    || !record.verifiedEvidence || typeof record.verifiedEvidence !== "object") {
    throw new Error("rg_verified_evidence_persisted_envelope_invalid");
  }
  return { judgment: record.judgment as CanonicalRgVerificationJudgment,
    verifiedEvidence: record.verifiedEvidence as CanonicalRgVerifiedEvidence };
}

function reserveWork(runId: string, workItem: CanonicalRgWorkItem, workerId: string): CanonicalRgWorkItem | null {
  const now = new Date();
  if (workItem.reservation && new Date(workItem.reservation.expiresAt).getTime() > now.getTime()
    && workItem.reservation.workerId !== workerId) return null;
  const reservation = { reservationId: `rg-work-reservation-${randomUUID()}`, workerId, reservedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + WORK_RESERVATION_MS).toISOString() };
  const updated: CanonicalRgWorkItem = { ...workItem, state: "executing", executionState: "executing", reservation,
    progress: { ...workItem.progress, state: "in_progress" } };
  const result = db.prepare(`UPDATE canonical_rg_work_items SET state = ?, execution_state = ?, work_item_json = ?, updated_at = ?
    WHERE run_id = ? AND work_item_id = ? AND plan_hash = ? AND work_item_json = ?`).run(updated.state, updated.executionState,
    JSON.stringify(updated), nowIso(), runId, updated.workItemId, planHashForWork(runId, updated.workItemId), JSON.stringify(workItem));
  if (result.changes !== 1) return null;
  appendEvent(runId, updated.workItemId, null, "work_reserved", { reservation });
  return updated;
}

function reserveOperation(input: {
  runId: string; planHash: string; workItem: CanonicalRgWorkItem; admission: CanonicalRgClaimAdmission;
  workerId: string; kind: CanonicalRgOperation["kind"]; candidateId: string | null; providerCode: string;
  operationInput: unknown; operationId: string; attempt: number; inputHash: string;
  executionGrant: CanonicalContinuationExecutionGrant | null;
}): CanonicalRgOperation {
  const now = nowIso();
  const reservation = { reservationId: `rg-operation-reservation-${randomUUID()}`, workerId: input.workerId,
    reservedAt: now, expiresAt: new Date(Date.now() + WORK_RESERVATION_MS).toISOString() };
  const operation: CanonicalRgOperation = {
    operationId: input.operationId, workItemId: input.workItem.workItemId, atomicClaimId: input.admission.atomicClaimId,
    planHash: input.planHash, executionGrantId: input.executionGrant?.grantId ?? null,
    executionGeneration: input.executionGrant?.executionGeneration ?? 0,
    kind: input.kind, attempt: input.attempt, candidateId: input.candidateId,
    state: "reserved", reservation,
    receipt: { sendState: "not_sent", completionState: "reserved", providerCode: input.providerCode,
      providerRequestId: null, calls: 0, tokens: null, retrievalBytes: 0, reasonCode: "rg_operation_reserved",
      providerDiagnostics: null, retrievalTransportDiagnostics: null },
    input: structuredClone(input.operationInput), inputHash: input.inputHash, result: null, createdAt: now, updatedAt: now,
  };
  db.prepare(`INSERT INTO canonical_rg_operations
    (run_id, operation_id, work_item_id, state, operation_json, plan_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(input.runId, operation.operationId, operation.workItemId,
    operation.state, JSON.stringify(operation), input.planHash, now, now);
  appendEvent(input.runId, operation.workItemId, operation.operationId, "operation_reserved", operation);
  return operation;
}

function rebindReservedOperation(runId: string, operation: CanonicalRgOperation, workerId: string): CanonicalRgOperation {
  if (operation.state !== "reserved") throw new Error("rg_operation_not_reservable");
  if (operation.reservation.workerId === workerId) return operation;
  if (new Date(operation.reservation.expiresAt).getTime() > Date.now()) throw new Error("rg_operation_reservation_active");
  const now = nowIso();
  const updated: CanonicalRgOperation = { ...operation, reservation: {
    reservationId: `rg-operation-reservation-${randomUUID()}`, workerId, reservedAt: now,
    expiresAt: new Date(Date.now() + WORK_RESERVATION_MS).toISOString(),
  }, updatedAt: now };
  updateOperation(runId, updated);
  appendEvent(runId, updated.workItemId, updated.operationId, "operation_rereserved_after_expired_lease", {
    priorWorkerId: operation.reservation.workerId, reservation: updated.reservation,
  });
  return updated;
}

function markOperationSent(runId: string, operationId: string, workerId: string): void {
  const operation = operationFromDb(runId, operationId);
  if (!operation || operation.state !== "reserved") throw new Error("rg_operation_send_without_reservation");
  if (operation.reservation.workerId !== workerId || new Date(operation.reservation.expiresAt).getTime() <= Date.now()) {
    throw new Error("rg_operation_send_reservation_invalid");
  }
  const updated: CanonicalRgOperation = { ...operation, state: "sent", receipt: { ...operation.receipt,
    sendState: "sent", calls: 1, reasonCode: "rg_operation_sent" }, updatedAt: nowIso() };
  updateOperation(runId, updated);
  appendEvent(runId, updated.workItemId, updated.operationId, "operation_sent", { receipt: updated.receipt });
}

function settleOperation(runId: string, operation: CanonicalRgOperation,
  state: Extract<CanonicalRgOperation["state"], "completed" | "failed_before_send" | "provider_rejected"
    | "public_read_transport_outcome_unknown" | "indeterminate_after_send">,
  result: unknown | null, receipt: RgEvidencePortReceipt | null, reasonCode: string): CanonicalRgOperation {
  const latest = operationFromDb(runId, operation.operationId) ?? operation;
  assertRetrievalTransportDiagnostics(operation.kind, receipt?.retrievalTransportDiagnostics ?? null);
  assertSearchOutputAdmission(operation.kind, receipt?.providerDiagnostics ?? null);
  const updated: CanonicalRgOperation = { ...latest, state, result,
    receipt: { ...latest.receipt,
      sendState: latest.receipt.sendState,
      completionState: state === "completed" ? "completed" : state === "provider_rejected" ? "provider_rejected"
        : state === "indeterminate_after_send" ? "indeterminate"
        : state === "public_read_transport_outcome_unknown" ? "public_read_transport_outcome_unknown" : "failed",
      providerCode: receipt?.providerCode ?? latest.receipt.providerCode,
      providerRequestId: receipt?.providerRequestId ?? latest.receipt.providerRequestId,
      calls: receipt?.calls ?? latest.receipt.calls,
      tokens: receipt?.tokens ?? latest.receipt.tokens,
      retrievalBytes: receipt?.retrievalBytes ?? latest.receipt.retrievalBytes,
      reasonCode,
      providerDiagnostics: receipt?.providerDiagnostics ?? latest.receipt.providerDiagnostics ?? null,
      retrievalTransportDiagnostics: receipt?.retrievalTransportDiagnostics
        ?? latest.receipt.retrievalTransportDiagnostics ?? null,
    }, updatedAt: nowIso() };
  updateOperation(runId, updated);
  appendEvent(runId, updated.workItemId, updated.operationId, `operation_${state}`, {
    state, receipt: updated.receipt, resultHash: result === null ? null : digest(result),
  });
  return updated;
}

function assertSearchOutputAdmission(kind: CanonicalRgOperation["kind"],
  diagnostics: CanonicalRgProviderDiagnostics | null): void {
  const admission = diagnostics?.searchOutputAdmission;
  if (admission === undefined || admission === null) return;
  const counts = [admission.annotationCount, admission.admittedCitationCount, admission.rejectedCitationCount];
  const reasons = Array.isArray(admission.reasonCodes) ? admission.reasonCodes : [];
  const countsValid = counts.every((value) => Number.isSafeInteger(value) && value >= 0)
    && admission.admittedCitationCount + admission.rejectedCitationCount === admission.annotationCount;
  const reasonsValid = Array.isArray(admission.reasonCodes)
    && reasons.every((value) => /^[a-z][a-z0-9_]{0,191}$/.test(value))
    && new Set(reasons).size === reasons.length
    && [...reasons].sort().every((value, index) => value === reasons[index]);
  const outcomeValid = admission.outcome === "no_citations"
    ? admission.annotationCount === 0 && admission.admittedCitationCount === 0 && admission.rejectedCitationCount === 0
    : admission.outcome === "all_citations_admitted"
      ? admission.annotationCount > 0 && admission.admittedCitationCount === admission.annotationCount
        && admission.rejectedCitationCount === 0 && reasons.length === 0
      : admission.outcome === "partially_admitted"
        ? admission.admittedCitationCount > 0 && admission.rejectedCitationCount > 0 && reasons.length > 0
        : admission.outcome === "no_usable_citations"
          ? admission.annotationCount > 0 && admission.admittedCitationCount === 0
            && admission.rejectedCitationCount === admission.annotationCount && reasons.length > 0
          : admission.outcome === "batch_rejected"
            ? admission.admittedCitationCount === 0 && admission.rejectedCitationCount === admission.annotationCount
              && reasons.length > 0
            : false;
  if (kind !== "public_search" || diagnostics?.responseDisposition !== "completed"
    || admission.schemaVersion !== "openrouter_search_citation_admission_v1"
    || admission.evidenceAdmissionEffect !== "none" || admission.analyticalCompletionEffect !== "none"
    || !countsValid || !reasonsValid || !outcomeValid) {
    throw new Error("rg_search_output_admission_integrity_invalid");
  }
}

function completedSearchAdmissionFailure(kind: CanonicalRgOperation["kind"],
  receipt: RgEvidencePortReceipt): { reasonCode: string; receipt: RgEvidencePortReceipt } | null {
  try {
    assertSearchOutputAdmission(kind, receipt.providerDiagnostics ?? null);
    return null;
  } catch (error) {
    if (kind !== "public_search" || receipt.providerDiagnostics?.responseDisposition !== "completed") throw error;
    const reasonCode = safeReason(error);
    return { reasonCode, receipt: settledSearchAdmissionRejectionReceipt(receipt, reasonCode) };
  }
}

function completedUnusableReceipt(kind: CanonicalRgOperation["kind"], receipt: RgEvidencePortReceipt,
  reasonCode: string): RgEvidencePortReceipt {
  if (kind !== "public_search") return receipt;
  try {
    assertSearchOutputAdmission(kind, receipt.providerDiagnostics ?? null);
    return receipt;
  } catch (error) {
    if (receipt.providerDiagnostics?.responseDisposition !== "completed") throw error;
    return settledSearchAdmissionRejectionReceipt(receipt, reasonCode);
  }
}

function settledSearchAdmissionRejectionReceipt(receipt: RgEvidencePortReceipt,
  reasonCode: string): RgEvidencePortReceipt {
  const diagnostics = receipt.providerDiagnostics;
  if (!diagnostics || diagnostics.responseDisposition !== "completed") {
    throw new Error("rg_completed_search_response_receipt_missing");
  }
  const observedCount = diagnostics.searchOutputAdmission?.annotationCount;
  const annotationCount = Number.isSafeInteger(observedCount) && Number(observedCount) >= 0
    && Number(observedCount) <= 10
    ? Number(observedCount) : 0;
  const observedReasonCodes = diagnostics.searchOutputAdmission?.reasonCodes
    ?.filter((value) => /^[a-z][a-z0-9_]{0,191}$/.test(value)) ?? [];
  return { ...receipt, providerDiagnostics: { ...diagnostics, searchOutputAdmission: {
    schemaVersion: "openrouter_search_citation_admission_v1",
    outcome: "batch_rejected",
    annotationCount,
    admittedCitationCount: 0,
    rejectedCitationCount: annotationCount,
    reasonCodes: [...new Set([...observedReasonCodes, reasonCode])].sort(),
    evidenceAdmissionEffect: "none",
    analyticalCompletionEffect: "none",
  } } };
}

function assertRetrievalTransportDiagnostics(kind: CanonicalRgOperation["kind"],
  diagnostics: PublicRetrievalTransportDiagnosticsV1 | null): void {
  if (diagnostics === null) return;
  if (kind !== "public_retrieval"
    || diagnostics.schemaVersion !== "public_https_retrieval_transport_diagnostics_v1"
    || !["ratereveal_node_https_pinned_v3", "ratereveal_node_https_pinned_v4"].includes(diagnostics.configurationCode)) {
    throw new Error("rg_retrieval_transport_diagnostics_binding_invalid");
  }
  const resolution = diagnostics.resolution;
  if (!["failed_before_permit", "permit_bound"].includes(resolution.state)
    || !safeElapsed(resolution.resolutionElapsedMs)
    || !Number.isSafeInteger(resolution.approvedAddressCount) || resolution.approvedAddressCount < 0
    || ![null, 4, 6].includes(resolution.selectedAddressFamily)
    || !["none", "first_lexicographically_sorted_approved_address",
      "logical_attempt_rotated_approved_address"].includes(resolution.selectionPolicy)
    || (resolution.state === "failed_before_permit"
      && (resolution.approvedAddressCount !== 0 || resolution.selectedAddressFamily !== null
        || resolution.selectionPolicy !== "none"))
    || (resolution.state === "permit_bound"
      && (resolution.approvedAddressCount < 1
        || (resolution.selectedAddressFamily !== 4 && resolution.selectedAddressFamily !== 6)
        || !["first_lexicographically_sorted_approved_address",
          "logical_attempt_rotated_approved_address"].includes(resolution.selectionPolicy)))) {
    throw new Error("rg_retrieval_transport_diagnostics_resolution_invalid");
  }
  const milestoneValues = Object.values(diagnostics.milestones);
  if (milestoneValues.some((value) => !safeElapsed(value))) {
    throw new Error("rg_retrieval_transport_diagnostics_milestones_invalid");
  }
  const response = diagnostics.response;
  if (![null, 4, 6].includes(response.connectedAddressFamily)
    || (response.httpStatus !== null && (!Number.isSafeInteger(response.httpStatus)
      || response.httpStatus < 100 || response.httpStatus > 599))
    || !Number.isSafeInteger(response.bytesObserved) || response.bytesObserved < 0
    || response.responseHeadersObserved !== (diagnostics.milestones.responseHeadersMs !== null)
    || response.firstBodyByteObserved !== (diagnostics.milestones.firstBodyByteMs !== null)
    || response.bodyCompleted !== (diagnostics.milestones.bodyCompletedMs !== null)
    || (response.firstBodyByteObserved && !response.responseHeadersObserved)
    || (response.bodyCompleted && !response.responseHeadersObserved)) {
    throw new Error("rg_retrieval_transport_diagnostics_response_invalid");
  }
  const termination = diagnostics.termination;
  if (!["completed", "timed_out", "cancelled", "failed"].includes(termination.outcome)
    || !["destination_resolution", "connection_establishment", "tls_handshake", "response_headers",
      "response_body", "completed"].includes(termination.phase)
    || !/^[a-z][a-z0-9_]{0,127}$/.test(termination.safeReasonClass)
    || !Number.isSafeInteger(termination.socketInactivityTimeoutMs)
    || termination.socketInactivityTimeoutMs < 1_000 || termination.socketInactivityTimeoutMs > 120_000
    || (termination.totalAttemptTimeoutMs !== undefined
      && (!Number.isSafeInteger(termination.totalAttemptTimeoutMs)
        || termination.totalAttemptTimeoutMs < termination.socketInactivityTimeoutMs
        || termination.totalAttemptTimeoutMs > 300_000))
    || (termination.outcome === "completed" && termination.phase !== "completed")) {
    throw new Error("rg_retrieval_transport_diagnostics_termination_invalid");
  }
}

function safeElapsed(value: number | null): boolean {
  return value === null || (Number.isSafeInteger(value) && value >= 0 && value <= 24 * 60 * 60_000);
}

function updateOperation(runId: string, operation: CanonicalRgOperation): void {
  db.prepare(`UPDATE canonical_rg_operations SET state = ?, operation_json = ?, updated_at = ?
    WHERE run_id = ? AND operation_id = ? AND plan_hash = ?`).run(operation.state, JSON.stringify(operation),
    operation.updatedAt, runId, operation.operationId, operation.planHash);
}

function terminalizeWork(runId: string, original: CanonicalRgWorkItem,
  executionState: CanonicalRgWorkItem["executionState"], progressState: CanonicalRgWorkItem["progress"]["state"],
  stopReason: string, verifiedEvidenceRefs: string[], workerId: string): void {
  const current = workItemFromDb(runId, original.workItemId) ?? original;
  if (current.reservation && current.reservation.workerId !== workerId) throw new Error("rg_work_terminalization_reservation_mismatch");
  const operationCount = Number((db.prepare(`SELECT COUNT(*) AS count FROM canonical_rg_operations WHERE run_id = ? AND work_item_id = ?`)
    .get(runId, current.workItemId) as { count: number }).count);
  const updated: CanonicalRgWorkItem = { ...current, state: "terminal", executionState, reservation: null,
    progress: { state: progressState, operationsAttempted: operationCount, evidenceItemsObserved: verifiedEvidenceRefs.length },
    stopReason, verifiedEvidenceRefs: [...new Set(verifiedEvidenceRefs)].sort() };
  db.prepare(`UPDATE canonical_rg_work_items SET state = ?, execution_state = ?, work_item_json = ?, updated_at = ?
    WHERE run_id = ? AND work_item_id = ?`).run(updated.state, updated.executionState, JSON.stringify(updated),
    nowIso(), runId, updated.workItemId);
  appendEvent(runId, updated.workItemId, null, "work_terminal", { executionState, progressState, stopReason,
    verifiedEvidenceRefs: updated.verifiedEvidenceRefs });
}

function incrementResource(runId: string, workItemId: string, kind: CanonicalRgOperation["kind"], receipt: RgEvidencePortReceipt): void {
  const item = workItemFromDb(runId, workItemId); if (!item) return;
  const currentTokens = item.resourceConsumption.tokens;
  const tokens = receipt.tokens === null || currentTokens === null ? null : currentTokens + receipt.tokens;
  const updated: CanonicalRgWorkItem = { ...item, resourceConsumption: {
    providerCalls: item.resourceConsumption.providerCalls + receipt.calls,
    searchCalls: item.resourceConsumption.searchCalls + (kind === "public_search" ? receipt.calls : 0),
    retrievalBytes: item.resourceConsumption.retrievalBytes + receipt.retrievalBytes,
    aiCalls: item.resourceConsumption.aiCalls + (["investigation", "independent_verification"].includes(kind) ? receipt.calls : 0),
    tokens,
  } };
  db.prepare(`UPDATE canonical_rg_work_items SET work_item_json = ?, updated_at = ? WHERE run_id = ? AND work_item_id = ?`)
    .run(JSON.stringify(updated), nowIso(), runId, workItemId);
}

function appendExtensionDecision(runId: string, workItemId: string, decision: "extended" | "stopped", reasonCode: string): void {
  const item = workItemFromDb(runId, workItemId); if (!item) return;
  const createdAt = nowIso();
  const entry = { decisionId: `rg-extension-${digest({ runId, workItemId, decision, reasonCode, count: item.extensionDecisions.length })}`,
    decision, reasonCode, createdAt };
  const updated = { ...item, extensionDecisions: [...item.extensionDecisions, entry] };
  db.prepare(`UPDATE canonical_rg_work_items SET work_item_json = ?, updated_at = ? WHERE run_id = ? AND work_item_id = ?`)
    .run(JSON.stringify(updated), createdAt, runId, workItemId);
  appendEvent(runId, workItemId, null, "extension_decision", entry);
}

function appendRetryDecision(runId: string, workItemId: string, operationId: string,
  decision: "retry" | "no_retry", reasonCode: string): void {
  const item = workItemFromDb(runId, workItemId); if (!item) return;
  const createdAt = nowIso();
  const entry = { decisionId: `rg-retry-${digest({ runId, workItemId, operationId, decision, reasonCode })}`,
    operationId, decision, reasonCode, createdAt };
  const updated = { ...item, retryDecisions: [...item.retryDecisions, entry] };
  db.prepare(`UPDATE canonical_rg_work_items SET work_item_json = ?, updated_at = ? WHERE run_id = ? AND work_item_id = ?`)
    .run(JSON.stringify(updated), createdAt, runId, workItemId);
  appendEvent(runId, workItemId, operationId, "retry_decision", entry);
}

function appendDocumentAdmissionDecision(runId: string, workItemId: string, operationId: string,
  candidateId: string | null, admission: CanonicalRgRetrievedDocumentAdmission): void {
  appendEvent(runId, workItemId, operationId, "document_admission_decision", {
    schemaVersion: "canonical_rg_document_admission_decision_v1",
    state: admission.state,
    candidateId,
    documentFingerprint: admission.state === "admitted"
      ? admission.document.documentFingerprint : admission.documentFingerprint,
    reasonCode: admission.reasonCode,
    rawDocumentIdentityAuthority: "immutable_sha256_fingerprint",
    extractedTextAuthority: "deterministic_derived_locator_text_only",
    normalizationVersion: "public_document_text_normalization_v1",
    normalizedLocatorCount: admission.state === "admitted" ? admission.normalizedLocatorCount : 0,
    analyticalCompletionEffect: "none",
    reconciliationRequired: false,
  });
}

function appendPublicDocumentRetrievalArtifact(input: {
  runId: string;
  planHash: string;
  workItemId: string;
  operation: CanonicalRgOperation;
  candidate: CanonicalRgDiscoveryCandidate;
  replayContract: CanonicalRgPublicDocumentRetrievalReplayContract;
  admission: CanonicalRgRetrievedDocumentAdmission;
}): void {
  const durableOperation = operationFromDb(input.runId, input.operation.operationId);
  if (!durableOperation || durableOperation.kind !== "public_retrieval" || durableOperation.state !== "completed"
    || durableOperation.candidateId !== input.candidate.candidateId
    || durableOperation.inputHash !== digest(durableOperation.input)
    || isPublicDocumentReplayOperation(durableOperation)) {
    throw new Error("rg_public_document_retrieval_artifact_source_invalid");
  }
  const replayIdentity = digest(input.replayContract);
  const outcome: CanonicalRgPublicDocumentRetrievalArtifact["outcome"] = input.admission.state === "admitted"
    ? {
      kind: "admitted_document",
      admissionReasonCode: input.admission.reasonCode,
      document: persistableClone(input.admission.document),
      documentProjectionHash: digest(persistableClone(input.admission.document)),
      immutableByteIdentity: {
        // The live retrieval port zeroizes raw response buffers. The immutable source-byte
        // authority is therefore carried by its validated SHA-256 identity and byte length;
        // the admitted extracted text separately carries deterministic normalization lineage.
        fingerprintAlgorithm: "sha256",
        documentFingerprint: input.admission.document.documentFingerprint,
        byteLength: input.admission.document.byteLength,
      },
    }
    : {
      kind: "deterministic_unusable",
      admissionReasonCode: input.admission.reasonCode,
      documentFingerprint: input.admission.documentFingerprint,
    };
  const artifactWithoutId = {
    schemaVersion: PUBLIC_DOCUMENT_RETRIEVAL_ARTIFACT_VERSION,
    runId: input.runId,
    replayIdentity,
    replayContract: structuredClone(input.replayContract),
    source: {
      planHash: input.planHash,
      workItemId: input.workItemId,
      operationId: durableOperation.operationId,
      candidateId: input.candidate.candidateId,
      operationInputHash: durableOperation.inputHash,
      operationResultHash: digest(durableOperation.result),
    },
    outcome,
    reuseAuthority: "same_analysis_run_transport_and_document_admission_only",
    semanticReuse: "prohibited",
    evidenceAdmissionEffect: "none",
    analyticalCompletionEffect: "none",
    canonicalMutationAllowed: false as const,
  } satisfies Omit<CanonicalRgPublicDocumentRetrievalArtifact, "artifactId">;
  const artifact: CanonicalRgPublicDocumentRetrievalArtifact = {
    ...artifactWithoutId,
    artifactId: `rg-document-artifact-${digest(artifactWithoutId).slice(0, 32)}`,
  };
  const existing = publicDocumentRetrievalArtifactForReplay(input.runId, input.replayContract);
  if (existing) {
    if (!equivalentPublicDocumentArtifactOutcome(existing.outcome, artifact.outcome)) {
      throw new Error("rg_public_document_retrieval_artifact_conflict");
    }
    return;
  }
  if (!validPublicDocumentRetrievalArtifact(artifact, input.runId)) {
    throw new Error("rg_public_document_retrieval_artifact_integrity_invalid");
  }
  appendEvent(input.runId, input.workItemId, durableOperation.operationId,
    "public_document_retrieval_artifact", artifact);
}

function publicDocumentRetrievalArtifactForReplay(
  runId: string,
  contract: CanonicalRgPublicDocumentRetrievalReplayContract,
): CanonicalRgPublicDocumentRetrievalArtifact | null {
  const replayIdentity = digest(contract);
  const rows = db.prepare(`SELECT work_item_id, operation_id, event_type, event_json, event_hash
    FROM canonical_rg_execution_events WHERE run_id = ?
    AND event_type = 'public_document_retrieval_artifact' ORDER BY rowid`).all(runId) as Array<{
      work_item_id: string;
      operation_id: string;
      event_type: string;
      event_json: string;
      event_hash: string;
    }>;
  let matching: CanonicalRgPublicDocumentRetrievalArtifact | null = null;
  for (const row of rows) {
    let artifact: CanonicalRgPublicDocumentRetrievalArtifact;
    try {
      artifact = JSON.parse(row.event_json) as CanonicalRgPublicDocumentRetrievalArtifact;
      if (row.event_hash !== digest({ runId, workItemId: row.work_item_id,
        operationId: row.operation_id, eventType: row.event_type, event: artifact })
        || row.operation_id !== artifact.source.operationId
        || row.work_item_id !== artifact.source.workItemId
        || !validPublicDocumentRetrievalArtifact(artifact, runId)) {
        throw new Error("rg_public_document_retrieval_artifact_integrity_invalid");
      }
    } catch {
      throw new Error("rg_public_document_retrieval_artifact_integrity_invalid");
    }
    if (artifact.replayIdentity !== replayIdentity) continue;
    if (canonicalJson(artifact.replayContract) !== canonicalJson(contract)) {
      throw new Error("rg_public_document_retrieval_artifact_integrity_invalid");
    }
    if (matching && !equivalentPublicDocumentArtifactOutcome(matching.outcome, artifact.outcome)) {
      throw new Error("rg_public_document_retrieval_artifact_integrity_invalid");
    }
    matching ??= artifact;
  }
  return matching;
}

function validPublicDocumentRetrievalArtifact(
  artifact: CanonicalRgPublicDocumentRetrievalArtifact,
  runId: string,
): boolean {
  if (!artifact || artifact.schemaVersion !== PUBLIC_DOCUMENT_RETRIEVAL_ARTIFACT_VERSION
    || artifact.runId !== runId || !isSafeId(artifact.artifactId)
    || artifact.replayIdentity !== digest(artifact.replayContract)
    || artifact.artifactId !== `rg-document-artifact-${digest({
      schemaVersion: artifact.schemaVersion,
      runId: artifact.runId,
      replayIdentity: artifact.replayIdentity,
      replayContract: artifact.replayContract,
      source: artifact.source,
      outcome: artifact.outcome,
      reuseAuthority: artifact.reuseAuthority,
      semanticReuse: artifact.semanticReuse,
      evidenceAdmissionEffect: artifact.evidenceAdmissionEffect,
      analyticalCompletionEffect: artifact.analyticalCompletionEffect,
      canonicalMutationAllowed: artifact.canonicalMutationAllowed,
    }).slice(0, 32)}`
    || !validPublicDocumentRetrievalReplayContract(artifact.replayContract)
    || artifact.reuseAuthority !== "same_analysis_run_transport_and_document_admission_only"
    || artifact.semanticReuse !== "prohibited" || artifact.evidenceAdmissionEffect !== "none"
    || artifact.analyticalCompletionEffect !== "none" || artifact.canonicalMutationAllowed !== false
    || !isSafeId(artifact.source.operationId) || !isSafeId(artifact.source.workItemId)
    || !isSafeId(artifact.source.candidateId) || !/^[a-f0-9]{64}$/.test(artifact.source.operationInputHash)
    || !/^[a-f0-9]{64}$/.test(artifact.source.operationResultHash)) return false;
  const operation = operationFromDb(runId, artifact.source.operationId)
    ?? supersededOperationFromHistory(runId, artifact.source.operationId);
  if (!operation || operation.kind !== "public_retrieval" || operation.state !== "completed"
    || operation.planHash !== artifact.source.planHash || operation.workItemId !== artifact.source.workItemId
    || operation.candidateId !== artifact.source.candidateId
    || operation.inputHash !== artifact.source.operationInputHash
    || digest(operation.input) !== operation.inputHash
    || digest(operation.result) !== artifact.source.operationResultHash
    || isPublicDocumentReplayOperation(operation)) return false;
  const operationCandidate = (operation.input as { candidate?: CanonicalRgDiscoveryCandidate } | null)?.candidate;
  if (!operationCandidate || !validCandidateForReplayContract(operationCandidate, artifact.replayContract)) return false;
  if (artifact.outcome.kind === "admitted_document") {
    if (isCompletedUnusableResult(operation.result)
      || artifact.outcome.admissionReasonCode !== "rg_retrieved_document_admitted"
      || artifact.outcome.documentProjectionHash !== digest(artifact.outcome.document)
      || artifact.outcome.immutableByteIdentity.fingerprintAlgorithm !== "sha256"
      || artifact.outcome.immutableByteIdentity.documentFingerprint
        !== artifact.outcome.document.documentFingerprint
      || artifact.outcome.immutableByteIdentity.byteLength !== artifact.outcome.document.byteLength) return false;
    const admission = admitCanonicalRgRetrievedDocument(
      sanitizeRetrievedDocument(operation.result as CanonicalRgRetrievedDocument), operationCandidate);
    return admission.state === "admitted"
      && canonicalJson(persistableClone(admission.document)) === canonicalJson(artifact.outcome.document);
  }
  if (!safeReasonCode(artifact.outcome.admissionReasonCode)
    || (artifact.outcome.documentFingerprint !== null
      && !/^[a-f0-9]{64}$/.test(artifact.outcome.documentFingerprint))) return false;
  if (isCompletedUnusableResult(operation.result)) {
    return artifact.outcome.admissionReasonCode === operation.result.reasonCode
      && artifact.outcome.documentFingerprint === null;
  }
  const admission = admitCanonicalRgRetrievedDocument(
    sanitizeRetrievedDocument(operation.result as CanonicalRgRetrievedDocument), operationCandidate);
  return admission.state === "rejected"
    && admission.reasonCode === artifact.outcome.admissionReasonCode
    && admission.documentFingerprint === artifact.outcome.documentFingerprint;
}

function validPublicDocumentRetrievalReplayContract(
  contract: CanonicalRgPublicDocumentRetrievalReplayContract,
): boolean {
  if (!contract || contract.schemaVersion !== PUBLIC_DOCUMENT_RETRIEVAL_REPLAY_CONTRACT_VERSION
    || contract.normalizedRequestedUrl !== normalizeSafeHttpsUrl(contract.normalizedRequestedUrl)
    || !["official_network_publication", "processor_publication"].includes(contract.claimedAuthority)
    || !validNullableDay(contract.candidateTemporalIdentity.publicationDate)
    || !validNullableDay(contract.candidateTemporalIdentity.effectiveFrom)
    || !validNullableDay(contract.candidateTemporalIdentity.effectiveTo)
    || !validNullableDay(contract.freshnessRequirement.asOf)
    || !Array.isArray(contract.freshnessRequirement.excludedDocumentFingerprints)
    || canonicalJson(contract.freshnessRequirement.excludedDocumentFingerprints)
      !== canonicalJson([...new Set(contract.freshnessRequirement.excludedDocumentFingerprints)].sort())
    || !contract.freshnessRequirement.excludedDocumentFingerprints.every((value) => /^[a-f0-9]{64}$/.test(value))
    || contract.productionScope.version !== CANONICAL_PRODUCTION_APPLICABILITY_SCOPE_VERSION
    || contract.productionScope.countryCode !== CANONICAL_PRODUCTION_COUNTRY_CODE
    || !validReplayApplicabilityRequirements(contract.applicabilityRequirements)
    || contract.transport.maximumBytes !== PUBLIC_DOCUMENT_RETRIEVAL_MAXIMUM_BYTES
    || contract.transport.httpsOnly !== true || contract.transport.redirectsRequireFreshAuthorization !== true
    || contract.transport.independentRetrievalRequired !== true
    || contract.transport.contentFormats !== "all_supported_public_content_formats"
    || contract.admission.normalizationVersion !== "public_document_text_normalization_v1"
    || contract.admission.contractVersion !== "canonical_rg_retrieved_document_admission_v1") return false;
  const period = contract.freshnessRequirement.statementPeriod;
  return period === null || (validNullableDay(period.start) && validNullableDay(period.end));
}

function validReplayApplicabilityRequirements(
  value: CanonicalRgPublicDocumentRetrievalReplayContract["applicabilityRequirements"],
): boolean {
  if (!value || !value.exactPublicDimensions || !Array.isArray(value.unknownPublicDimensions)) return false;
  const exactEntries = Object.entries(value.exactPublicDimensions);
  return canonicalJson(value.exactPublicDimensions) === canonicalJson(Object.fromEntries(
    [...exactEntries].sort(([left], [right]) => left.localeCompare(right))))
    && exactEntries.every(([key, dimension]) => /^[a-z][A-Za-z0-9]{0,63}$/.test(key)
      && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(dimension))
    && canonicalJson(value.unknownPublicDimensions)
      === canonicalJson([...new Set(value.unknownPublicDimensions)].sort())
    && value.unknownPublicDimensions.every((key) => /^[a-z][A-Za-z0-9]{0,63}$/.test(key))
    && !exactEntries.some(([key]) => value.unknownPublicDimensions.includes(key));
}

function validCandidateForReplayContract(
  candidate: CanonicalRgDiscoveryCandidate,
  contract: CanonicalRgPublicDocumentRetrievalReplayContract,
): boolean {
  try {
    return normalizeSafeHttpsUrl(candidate.url) === contract.normalizedRequestedUrl
      && candidate.claimedAuthority === contract.claimedAuthority
      && candidate.publicationDate === contract.candidateTemporalIdentity.publicationDate
      && candidate.effectiveFrom === contract.candidateTemporalIdentity.effectiveFrom
      && candidate.effectiveTo === contract.candidateTemporalIdentity.effectiveTo;
  } catch { return false; }
}

function equivalentPublicDocumentArtifactOutcome(
  left: CanonicalRgPublicDocumentRetrievalArtifact["outcome"],
  right: CanonicalRgPublicDocumentRetrievalArtifact["outcome"],
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "deterministic_unusable" && right.kind === "deterministic_unusable") {
    return left.admissionReasonCode === right.admissionReasonCode
      && left.documentFingerprint === right.documentFingerprint;
  }
  if (left.kind !== "admitted_document" || right.kind !== "admitted_document") return false;
  const claimNeutral = (document: CanonicalRgRetrievedDocument) => ({ ...document, candidateId: "claim-neutral" });
  return canonicalJson(claimNeutral(left.document)) === canonicalJson(claimNeutral(right.document));
}

function isPublicDocumentReplayOperation(operation: CanonicalRgOperation): boolean {
  return operation.kind === "public_retrieval"
    && operation.receipt.providerCode === "durable_analysis_run_public_document_replay";
}

function safeReasonCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_:.-]{0,191}$/.test(value);
}

function exactDocumentAdmissionStopReason(reasonCodes: string[]): string {
  const exact = [...new Set(reasonCodes)].sort()[0] ?? "document_admission_reason_unavailable";
  return `rg_document_admission_failed:${exact}`.slice(0, 192);
}

function exactPublicReadTransportStopReason(reasonCodes: string[]): string {
  const exact = [...new Set(reasonCodes)].sort()[0] ?? "retrieval_transport_reason_unavailable";
  return `rg_qualified_public_read_transport_unavailable:${exact}`.slice(0, 192);
}

function exactNoSupportStopReason(outcomes: CanonicalRgCandidateResearchOutcome["outcomeClass"][]): string {
  const uniqueOutcomes = [...new Set(outcomes)].sort();
  if (uniqueOutcomes.length === 0) return "rg_search_batch_completed_without_exact_support";
  if (uniqueOutcomes.every((item) => item === "wrong_scope")) return "rg_search_batch_completed_wrong_scope";
  if (uniqueOutcomes.every((item) => item === "wrong_period")) return "rg_search_batch_completed_wrong_period";
  if (uniqueOutcomes.every((item) => item === "wrong_authority")) return "rg_search_batch_completed_wrong_authority";
  if (uniqueOutcomes.every((item) => item === "exact_semantic_support_insufficient")) {
    return "rg_search_batch_completed_exact_semantic_support_insufficient";
  }
  return `rg_search_batch_completed_without_exact_support:${uniqueOutcomes.join(",")}`.slice(0, 192);
}

function sanitizeSearchResult(value: CanonicalRgDiscoveryCandidate[]): CanonicalRgDiscoveryCandidate[] {
  return Array.isArray(value) ? value.slice(0, MAX_CANDIDATES_PER_WORK_ITEM).map((item) => ({
    candidateId: item?.candidateId, url: item?.url, title: item?.title, claimedAuthority: item?.claimedAuthority,
    publicationDate: item?.publicationDate, effectiveFrom: item?.effectiveFrom, effectiveTo: item?.effectiveTo,
  })) : [];
}

function sanitizeRetrievedDocument(value: CanonicalRgRetrievedDocument): CanonicalRgRetrievedDocument {
  const locators = Array.isArray(value?.locators) ? value.locators : [];
  const projectionReasonCode = value?.admissionProjectionReasonCode ?? (locators.length > 200
    ? "rg_document_admission_locator_collection_limit_exceeded_complete_lineage_required"
    : locators.some((locator) => typeof locator?.textExcerpt === "string" && locator.textExcerpt.length > 4_096)
      ? "rg_document_admission_locator_text_limit_exceeded_complete_lineage_required"
      : locators.some((locator) => locator?.textDerivation && Array.isArray(locator.textDerivation.transformations)
        && locator.textDerivation.transformations.length > 3)
        ? "rg_document_admission_locator_derivation_transformations_limit_exceeded"
        : undefined);
  return {
    candidateId: value?.candidateId, requestedUrl: value?.requestedUrl, finalUrl: value?.finalUrl,
    sourceOrigin: value?.sourceOrigin, documentId: value?.documentId, documentFingerprint: value?.documentFingerprint,
    mimeType: value?.mimeType, byteLength: value?.byteLength, independentlyRetrieved: value?.independentlyRetrieved,
    admissionProjectionReasonCode: projectionReasonCode,
    locators: projectionReasonCode ? [] : locators.map((locator) => ({
      locatorId: locator?.locatorId, page: locator?.page, sectionCode: locator?.sectionCode,
      lineStart: locator?.lineStart, lineEnd: locator?.lineEnd,
      textExcerpt: locator?.textExcerpt,
      textDerivation: locator?.textDerivation ? {
        schemaVersion: locator.textDerivation.schemaVersion,
        normalizationVersion: locator.textDerivation.normalizationVersion,
        extractedTextInputHash: locator.textDerivation.extractedTextInputHash,
        normalizedFullTextHash: locator.textDerivation.normalizedFullTextHash,
        locatorTextHash: locator.textDerivation.locatorTextHash,
        sourceUnitIndex: locator.textDerivation.sourceUnitIndex,
        chunkIndex: locator.textDerivation.chunkIndex,
        chunkCount: locator.textDerivation.chunkCount,
        pdfControlCodePointsReplaced: locator.textDerivation.pdfControlCodePointsReplaced,
        unicodeWhitespaceRunsCollapsed: locator.textDerivation.unicodeWhitespaceRunsCollapsed,
        transformations: locator.textDerivation.transformations,
      } : undefined,
    })),
  };
}

function sanitizeInvestigatedCandidate(value: CanonicalRgInvestigatedCandidate): CanonicalRgInvestigatedCandidate {
  return {
    investigationId: value?.investigationId, candidateId: value?.candidateId, documentId: value?.documentId,
    documentFingerprint: value?.documentFingerprint, locatorId: value?.locatorId,
    proposedValue: structuredClone(value?.proposedValue), sourceAuthorityCandidate: value?.sourceAuthorityCandidate,
    publisherIdentityCode: value?.publisherIdentityCode, publicationTitle: value?.publicationTitle,
    publicationVersion: value?.publicationVersion, effectiveFrom: value?.effectiveFrom, effectiveTo: value?.effectiveTo,
    limitationCodes: Array.isArray(value?.limitationCodes) ? value.limitationCodes.slice(0, 50) : [],
    financialMutationAllowed: value?.financialMutationAllowed,
  };
}

function sanitizeVerificationJudgment(value: CanonicalRgVerificationJudgment): CanonicalRgVerificationJudgment {
  return {
    frozenCandidateHash: value?.frozenCandidateHash, sourceAuthorityStatus: value?.sourceAuthorityStatus,
    semanticSupportStatus: value?.semanticSupportStatus, exactAtomicClaimSupport: value?.exactAtomicClaimSupport,
    publisherIdentityCode: value?.publisherIdentityCode, authorityLocatorId: value?.authorityLocatorId,
    supportLocatorId: value?.supportLocatorId, scopeStatus: value?.scopeStatus, periodStatus: value?.periodStatus,
    effectiveFrom: value?.effectiveFrom, effectiveTo: value?.effectiveTo,
    negativeApplicabilityProof: sanitizeVerificationNegativeApplicabilityProof(value?.negativeApplicabilityProof),
    limitationCodes: Array.isArray(value?.limitationCodes) ? value.limitationCodes.slice(0, 50) : [],
  };
}

function sanitizeVerificationNegativeApplicabilityProof(
  value: CanonicalRgVerificationNegativeApplicabilityProof | null | undefined,
): CanonicalRgVerificationNegativeApplicabilityProof | null {
  if (!value || typeof value !== "object") return null;
  return {
    schemaVersion: value.schemaVersion,
    outcomeClass: value.outcomeClass,
    granularity: value.granularity,
    proofLocatorId: value.proofLocatorId,
    scopeDimension: value.scopeDimension,
    requiredScopeValue: value.requiredScopeValue,
    observedScopeValue: value.observedScopeValue,
  };
}

export function projectCanonicalRgReconciledOperationResult(
  kind: CanonicalRgOperation["kind"],
  value: unknown,
): unknown {
  if (kind === "public_search") return sanitizeSearchResult(value as CanonicalRgDiscoveryCandidate[]);
  if (kind === "public_retrieval") return sanitizeRetrievedDocument(value as CanonicalRgRetrievedDocument);
  if (kind === "investigation") return sanitizeInvestigatedCandidate(value as CanonicalRgInvestigatedCandidate);
  return sanitizeVerificationJudgment(value as CanonicalRgVerificationJudgment);
}

function validateSearchCandidates(values: CanonicalRgDiscoveryCandidate[], intent: CanonicalRgSearchIntent): CanonicalRgDiscoveryCandidate[] {
  if (!Array.isArray(values)) return [];
  const output: CanonicalRgDiscoveryCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of values.slice(0, MAX_CANDIDATES_PER_WORK_ITEM)) {
    try {
      const url = normalizeSafeHttpsUrl(candidate.url);
      if (url !== candidate.url || seen.has(url) || !intent.requiredSourceAuthorities.includes(candidate.claimedAuthority)
        || !isSafeId(candidate.candidateId) || !safePublicText(candidate.title, 200)
        || !validNullableDay(candidate.publicationDate) || !validNullableDay(candidate.effectiveFrom)
        || !validNullableDay(candidate.effectiveTo)) continue;
      seen.add(url); output.push(structuredClone(candidate));
    } catch { /* rejected by runtime guard */ }
  }
  return output;
}

export type CanonicalRgRetrievedDocumentAdmission = {
  state: "admitted";
  reasonCode: "rg_retrieved_document_admitted";
  document: CanonicalRgRetrievedDocument;
  normalizedLocatorCount: number;
} | {
  state: "rejected";
  reasonCode: string;
  documentFingerprint: string | null;
};

export function admitCanonicalRgRetrievedDocument(document: CanonicalRgRetrievedDocument,
  candidate: CanonicalRgDiscoveryCandidate): CanonicalRgRetrievedDocumentAdmission {
  const reject = (reasonCode: string): CanonicalRgRetrievedDocumentAdmission => ({ state: "rejected", reasonCode,
    documentFingerprint: typeof document?.documentFingerprint === "string" && /^[a-f0-9]{64}$/.test(document.documentFingerprint)
      ? document.documentFingerprint : null });
  if (document?.admissionProjectionReasonCode) {
    return /^[a-z][a-z0-9_]{0,191}$/.test(document.admissionProjectionReasonCode)
      ? reject(document.admissionProjectionReasonCode)
      : reject("rg_document_admission_projection_reason_invalid");
  }
  let requested: string; let final: string;
  try { requested = normalizeSafeHttpsUrl(document.requestedUrl); final = normalizeSafeHttpsUrl(document.finalUrl); }
  catch { return reject("rg_document_admission_https_url_invalid"); }
  if (document.candidateId !== candidate.candidateId) return reject("rg_document_admission_candidate_identity_mismatch");
  if (requested !== candidate.url) return reject("rg_document_admission_requested_url_mismatch");
  if (final !== requested) return reject("rg_document_admission_unapproved_redirect");
  if (document.independentlyRetrieved !== true) return reject("rg_document_admission_independent_retrieval_unproven");
  if (document.sourceOrigin !== new URL(final).origin) return reject("rg_document_admission_source_origin_mismatch");
  if (!isSafeId(document.documentId)) return reject("rg_document_admission_document_identity_invalid");
  if (!/^[a-f0-9]{64}$/.test(document.documentFingerprint)) return reject("rg_document_admission_fingerprint_invalid");
  if (!safePublicText(document.mimeType, 100)) return reject("rg_document_admission_mime_type_invalid");
  if (!Number.isSafeInteger(document.byteLength) || document.byteLength < 1 || document.byteLength > 5_242_880) {
    return reject("rg_document_admission_byte_length_invalid");
  }
  if (!Array.isArray(document.locators) || document.locators.length === 0 || document.locators.length > 200) {
    return reject("rg_document_admission_locator_collection_invalid");
  }
  const locatorIds = new Set<string>();
  const admittedLocators: CanonicalRgRetrievedDocument["locators"] = [];
  let normalizedLocatorCount = 0;
  for (const [sourceUnitIndex, locator] of document.locators.entries()) {
    if (!isSafeId(locator.locatorId)) return reject("rg_document_admission_locator_identity_invalid");
    if (locatorIds.has(locator.locatorId)) return reject("rg_document_admission_locator_identity_duplicate");
    if (!Number.isSafeInteger(locator.lineStart) || !Number.isSafeInteger(locator.lineEnd)
      || locator.lineStart < 1 || locator.lineEnd < locator.lineStart) {
      return reject("rg_document_admission_locator_lineage_invalid");
    }
    if (locator.page !== null && (!Number.isSafeInteger(locator.page) || locator.page < 1)) {
      return reject("rg_document_admission_locator_page_invalid");
    }
    if (locator.sectionCode !== null && !safePublicText(locator.sectionCode, 100)) {
      return reject("rg_document_admission_locator_section_invalid");
    }
    let textExcerpt = locator.textExcerpt;
    let textDerivation = locator.textDerivation;
    if (!textDerivation) {
      const normalized = normalizeAndChunkPublicDocumentText({ text: textExcerpt, mimeType: document.mimeType,
        sourceUnitIndex });
      if (normalized.state === "rejected") return reject(documentAdmissionReason(normalized.reasonCode));
      if (normalized.chunks.length !== 1) return reject("rg_document_admission_legacy_locator_chunking_required");
      textExcerpt = normalized.chunks[0]!.text;
      textDerivation = normalized.chunks[0]!.derivation;
      normalizedLocatorCount += 1;
    }
    const derivationIssue = validatePublicDocumentLocatorTextDerivation({ text: textExcerpt,
      mimeType: document.mimeType, derivation: textDerivation });
    if (derivationIssue) return reject(documentAdmissionReason(derivationIssue));
    admittedLocators.push({ ...structuredClone(locator), textExcerpt, textDerivation: structuredClone(textDerivation) });
    locatorIds.add(locator.locatorId);
  }
  const groups = new Map<string, typeof admittedLocators>();
  for (const locator of admittedLocators) {
    const derivation = locator.textDerivation!;
    const key = canonicalJson({ page: locator.page, sectionCode: locator.sectionCode,
      sourceUnitIndex: derivation.sourceUnitIndex,
      extractedTextInputHash: derivation.extractedTextInputHash,
      normalizedFullTextHash: derivation.normalizedFullTextHash });
    groups.set(key, [...(groups.get(key) ?? []), locator]);
  }
  for (const locators of groups.values()) {
    const ordered = [...locators].sort((left, right) => left.textDerivation!.chunkIndex - right.textDerivation!.chunkIndex);
    const expectedCount = ordered[0]!.textDerivation!.chunkCount;
    if (ordered.length !== expectedCount || ordered.some((locator, index) =>
      locator.textDerivation!.chunkCount !== expectedCount || locator.textDerivation!.chunkIndex !== index)) {
      return reject("rg_document_admission_locator_chunk_lineage_incomplete");
    }
    if (digest(ordered.map((locator) => locator.textExcerpt).join(" "))
      !== ordered[0]!.textDerivation!.normalizedFullTextHash) {
      return reject("rg_document_admission_locator_chunk_reconstruction_mismatch");
    }
  }
  return { state: "admitted", reasonCode: "rg_retrieved_document_admitted",
    document: { ...structuredClone(document), locators: admittedLocators }, normalizedLocatorCount };
}

function documentAdmissionReason(reasonCode: string): string {
  return `rg_document_admission_${reasonCode.replace(/^document_/, "")}`;
}

function validateInvestigatedCandidate(value: CanonicalRgInvestigatedCandidate, workItem: CanonicalRgWorkItem,
  admission: CanonicalRgClaimAdmission, candidate: CanonicalRgDiscoveryCandidate,
  document: CanonicalRgRetrievedDocument): CanonicalRgInvestigatedCandidate | null {
  if (!isSafeId(value.investigationId) || value.candidateId !== candidate.candidateId || value.documentId !== document.documentId
    || value.documentFingerprint !== document.documentFingerprint || !document.locators.some((item) => item.locatorId === value.locatorId)
    || value.sourceAuthorityCandidate !== candidate.claimedAuthority || !workItem.requiredSourceAuthorities.includes(value.sourceAuthorityCandidate)
    || !isSafeCode(value.publisherIdentityCode) || !safePublicText(value.publicationTitle, 200)
    || !validNullableDay(value.effectiveFrom) || !validNullableDay(value.effectiveTo)
    || value.financialMutationAllowed !== false || !valueMatchesConstraint(value.proposedValue, workItem.expectedKnowledgeValueConstraint, admission)) return null;
  return structuredClone(value);
}

function freezeCandidate(value: CanonicalRgInvestigatedCandidate, frozenAt: string): CanonicalRgFrozenCandidate {
  return Object.freeze({ ...structuredClone(value), frozenCandidateHash: digest(value), frozenAt });
}

function validateVerification(input: {
  runId: string; planHash: string; intent: CanonicalRgSearchIntent; workItem: CanonicalRgWorkItem;
  admission: CanonicalRgClaimAdmission; candidate: CanonicalRgDiscoveryCandidate;
  document: CanonicalRgRetrievedDocument; frozenCandidate: CanonicalRgFrozenCandidate;
  judgment: CanonicalRgVerificationJudgment;
}): CanonicalRgVerifiedEvidence | null {
  const { judgment, frozenCandidate, document, admission, workItem } = input;
  const locatorIds = new Set(document.locators.map((item) => item.locatorId));
  if (judgment.frozenCandidateHash !== frozenCandidate.frozenCandidateHash
    || judgment.sourceAuthorityStatus !== "verified" || judgment.semanticSupportStatus !== "supported"
    || judgment.exactAtomicClaimSupport !== true || judgment.scopeStatus !== "applicable" || judgment.periodStatus !== "applicable"
    || judgment.publisherIdentityCode !== frozenCandidate.publisherIdentityCode
    || !publisherIdentityApplicable(judgment.publisherIdentityCode, input.intent.publicScope,
      frozenCandidate.sourceAuthorityCandidate)
    || !locatorIds.has(judgment.authorityLocatorId) || !locatorIds.has(judgment.supportLocatorId)
    || !validNullableDay(judgment.effectiveFrom) || !validNullableDay(judgment.effectiveTo)
    || judgment.effectiveFrom !== frozenCandidate.effectiveFrom || judgment.effectiveTo !== frozenCandidate.effectiveTo
    || !periodApplicable(workItem.knowledgeQuery.asOf, judgment.effectiveFrom, judgment.effectiveTo)) return null;
  const investigatorLocator = document.locators.find((item) => item.locatorId === frozenCandidate.locatorId);
  const authorityLocator = document.locators.find((item) => item.locatorId === judgment.authorityLocatorId);
  const supportLocator = document.locators.find((item) => item.locatorId === judgment.supportLocatorId);
  const originPublisherProof = dynamicallyBindPublisherOrigin({
    sourceOrigin: document.sourceOrigin,
    finalUrl: document.finalUrl,
    publisherIdentityCode: judgment.publisherIdentityCode,
    authorityClass: frozenCandidate.sourceAuthorityCandidate,
    publicScope: input.intent.publicScope,
  });
  if (!investigatorLocator || !authorityLocator || !supportLocator || !originPublisherProof) return null;
  const evidenceBase = { runId: input.runId, planHash: input.planHash,
    executionGrantId: workItem.executionAuthorization?.grantId ?? null,
    executionGeneration: workItem.executionAuthorization?.executionGeneration ?? 0,
    workItemId: workItem.workItemId,
    atomicClaimId: admission.atomicClaimId, facet: admission.facet, intentId: input.intent.intentId,
    candidateId: input.candidate.candidateId, documentFingerprint: document.documentFingerprint,
    investigatorLocatorId: investigatorLocator.locatorId, authorityLocatorId: authorityLocator.locatorId,
    supportLocatorId: supportLocator.locatorId, frozenCandidateHash: frozenCandidate.frozenCandidateHash,
    originPublisherBindingId: originPublisherProof.bindingId, scopeFingerprint: admission.scopeFingerprint };
  return {
    schemaVersion: "canonical_rg_verified_evidence_v1_3",
    evidenceId: `rg-evidence-${digest(evidenceBase).slice(0, 32)}`,
    ...evidenceBase,
    sourceUrl: document.finalUrl,
    sourceOrigin: document.sourceOrigin,
    sourceAuthority: frozenCandidate.sourceAuthorityCandidate,
    publisherIdentityCode: frozenCandidate.publisherIdentityCode,
    publicationTitle: frozenCandidate.publicationTitle,
    publicationVersion: frozenCandidate.publicationVersion,
    documentId: document.documentId,
    authorityLocatorExcerpt: authorityLocator.textExcerpt,
    supportLocatorExcerpt: supportLocator.textExcerpt,
    originPublisherProof,
    proposedValue: structuredClone(frozenCandidate.proposedValue),
    effectiveFrom: judgment.effectiveFrom,
    effectiveTo: judgment.effectiveTo,
    applicabilityScope: structuredClone(input.intent.publicScope),
    scopeFingerprint: admission.scopeFingerprint,
    statementPeriod: admission.statementPeriod,
    currentRunSupport: "verified_claim_scoped_candidate_support",
    reusableKnowledgeState: "candidate_not_promoted",
    rfAdmissionAuthority: "none",
    automaticKnowledgePromotion: false,
    canonicalFinancialMutationAllowed: false,
    limitations: [...new Set([...frozenCandidate.limitationCodes, ...judgment.limitationCodes])].sort(),
  };
}

function canonicalCandidateResearchOutcome(input: {
  runId: string;
  planHash: string;
  workItem: CanonicalRgWorkItem;
  admission: CanonicalRgClaimAdmission;
  intent: CanonicalRgSearchIntent;
  candidate: CanonicalRgDiscoveryCandidate;
  document: CanonicalRgRetrievedDocument;
  frozenCandidate: CanonicalRgFrozenCandidate;
  verificationOperationId: string;
  judgment: CanonicalRgVerificationJudgment;
  verifiedEvidence: CanonicalRgVerifiedEvidence | null;
}): CanonicalRgCandidateResearchOutcome {
  const { judgment, frozenCandidate, document } = input;
  const locatorIds = new Set(document.locators.map((item) => item.locatorId));
  const bindingValid = judgment.frozenCandidateHash === frozenCandidate.frozenCandidateHash
    && judgment.publisherIdentityCode === frozenCandidate.publisherIdentityCode
    && locatorIds.has(judgment.authorityLocatorId) && locatorIds.has(judgment.supportLocatorId)
    && validNullableDay(judgment.effectiveFrom) && validNullableDay(judgment.effectiveTo);
  const originPublisherProof = bindingValid ? dynamicallyBindPublisherOrigin({
    sourceOrigin: document.sourceOrigin,
    finalUrl: document.finalUrl,
    publisherIdentityCode: judgment.publisherIdentityCode,
    authorityClass: frozenCandidate.sourceAuthorityCandidate,
    publicScope: input.intent.publicScope,
  }) : null;
  const outcomeClass: CanonicalRgCandidateResearchOutcome["outcomeClass"] = input.verifiedEvidence
    ? "exact_support_admitted"
    : !bindingValid
      ? "verification_binding_invalid"
      : judgment.sourceAuthorityStatus !== "verified" || !originPublisherProof
        ? "wrong_authority"
        : judgment.scopeStatus === "wrong_scope"
          ? "wrong_scope"
          : judgment.periodStatus === "wrong_period"
            || (judgment.periodStatus === "applicable"
              && !periodApplicable(input.workItem.knowledgeQuery.asOf, judgment.effectiveFrom, judgment.effectiveTo))
            ? "wrong_period"
            : "exact_semantic_support_insufficient";
  const applicabilityReuse = ["wrong_authority", "wrong_scope", "wrong_period"].includes(outcomeClass)
    ? "typed_negative_applicability_proof_required" as const
    : "claim_specific_no_cross_facet_semantic_reuse" as const;
  return {
    schemaVersion: "canonical_rg_candidate_research_outcome_v2",
    runId: input.runId,
    planHash: input.planHash,
    workItemId: input.workItem.workItemId,
    atomicClaimId: input.admission.atomicClaimId,
    facet: input.admission.facet,
    intentId: input.intent.intentId,
    discoveryApplicabilityFingerprint: input.intent.discoveryScope.applicabilityFingerprint,
    candidateId: input.candidate.candidateId,
    candidateUrl: input.candidate.url,
    sourceUrl: document.finalUrl,
    documentFingerprint: document.documentFingerprint,
    verificationOperationId: input.verificationOperationId,
    outcomeClass,
    sourceAuthorityStatus: judgment.sourceAuthorityStatus,
    scopeStatus: judgment.scopeStatus,
    periodStatus: judgment.periodStatus,
    semanticSupportStatus: judgment.semanticSupportStatus,
    exactAtomicClaimSupport: judgment.exactAtomicClaimSupport,
    applicabilityReuse,
    admittedEvidenceId: input.verifiedEvidence?.evidenceId ?? null,
    analyticalCompletionEffect: "none",
  };
}

function negativeApplicabilityContext(intent: CanonicalRgSearchIntent): NegativeApplicabilityContext {
  return {
    productionScopeVersion: intent.discoveryScope.productionScopeVersion,
    countryCode: intent.discoveryScope.countryCode,
    exactPublicDimensions: structuredClone(intent.discoveryScope.exactPublicDimensions),
    asOf: intent.asOf,
    statementPeriod: structuredClone(intent.statementPeriod),
  };
}

function expectedScopeValue(
  context: NegativeApplicabilityContext,
  dimension: NonNullable<CanonicalRgVerificationNegativeApplicabilityProof["scopeDimension"]>,
): string | null {
  if (dimension === "country") return context.countryCode;
  return context.exactPublicDimensions[dimension] ?? null;
}

function publisherIdentityScopeDimension(
  publisherIdentityCode: string,
  publicScope: Record<string, string>,
  authority: Extract<KnowledgeSourceAuthority, "official_network_publication" | "processor_publication">,
): "processor" | "processorProgram" | "acquirer" | "isoReseller" | "network" | null {
  const dimensions = authority === "official_network_publication"
    ? ["network"] as const : ["processor", "processorProgram", "acquirer", "isoReseller"] as const;
  return dimensions.find((dimension) => publicScope[dimension] === publisherIdentityCode) ?? null;
}

function canonicalReusableNegativeApplicabilityProof(input: {
  runId: string;
  intent: CanonicalRgSearchIntent;
  candidate: CanonicalRgDiscoveryCandidate;
  document: CanonicalRgRetrievedDocument;
  frozenCandidate: CanonicalRgFrozenCandidate;
  verificationOperationId: string;
  judgment: CanonicalRgVerificationJudgment;
  outcome: CanonicalRgCandidateResearchOutcome;
}): CanonicalRgReusableNegativeApplicabilityProof | null {
  if (!/^[a-f0-9]{64}$/.test(input.document.documentFingerprint)
    || !isSafeId(input.verificationOperationId)) return null;
  const locatorIds = new Set(input.document.locators.map((item) => item.locatorId));
  const context = negativeApplicabilityContext(input.intent);
  const applicabilityContextFingerprint = digest(context);
  const common = {
    schemaVersion: "canonical_rg_reusable_negative_applicability_proof_v1" as const,
    runId: input.runId,
    candidateUrl: input.candidate.url,
    sourceUrl: input.document.finalUrl,
    sourceOrigin: input.document.sourceOrigin,
    documentFingerprint: input.document.documentFingerprint,
    verificationOperationId: input.verificationOperationId,
    applicabilityContext: context,
    applicabilityContextFingerprint,
    reusePermission: "retrieval_exclusion_for_exact_applicability_question_only" as const,
    semanticReuse: "prohibited" as const,
    analyticalCompletionEffect: "none" as const,
  };
  const providerProof = input.judgment.negativeApplicabilityProof;
  let proofWithoutId: Omit<CanonicalRgReusableNegativeApplicabilityProof, "proofId"> | null = null;
  if (input.outcome.outcomeClass === "wrong_scope" && input.judgment.sourceAuthorityStatus === "verified"
    && providerProof?.schemaVersion === "canonical_rg_verification_negative_applicability_proof_v1"
    && providerProof.outcomeClass === "wrong_scope" && providerProof.granularity === "document"
    && locatorIds.has(providerProof.proofLocatorId) && providerProof.scopeDimension !== null
    && typeof providerProof.requiredScopeValue === "string" && isSafeCode(providerProof.requiredScopeValue)
    && typeof providerProof.observedScopeValue === "string" && isSafeCode(providerProof.observedScopeValue)
    && providerProof.observedScopeValue !== providerProof.requiredScopeValue
    && expectedScopeValue(context, providerProof.scopeDimension) === providerProof.requiredScopeValue) {
    proofWithoutId = { ...common, outcomeClass: "wrong_scope", granularity: "document",
      proofLocatorId: providerProof.proofLocatorId,
      proofBasis: { kind: "document_scope_mismatch", scopeDimension: providerProof.scopeDimension,
        requiredScopeValue: providerProof.requiredScopeValue, observedScopeValue: providerProof.observedScopeValue } };
  } else if (input.outcome.outcomeClass === "wrong_period" && input.judgment.sourceAuthorityStatus === "verified"
    && providerProof?.schemaVersion === "canonical_rg_verification_negative_applicability_proof_v1"
    && providerProof.outcomeClass === "wrong_period" && providerProof.granularity === "document"
    && locatorIds.has(providerProof.proofLocatorId) && providerProof.scopeDimension === null
    && providerProof.requiredScopeValue === null && providerProof.observedScopeValue === null
    && validNullableDay(input.judgment.effectiveFrom) && validNullableDay(input.judgment.effectiveTo)
    && (input.judgment.effectiveFrom !== null || input.judgment.effectiveTo !== null)
    && !periodApplicable(input.intent.asOf, input.judgment.effectiveFrom, input.judgment.effectiveTo)) {
    proofWithoutId = { ...common, outcomeClass: "wrong_period", granularity: "document",
      proofLocatorId: providerProof.proofLocatorId,
      proofBasis: { kind: "document_period_mismatch", requiredAsOf: input.intent.asOf,
        effectiveFrom: input.judgment.effectiveFrom, effectiveTo: input.judgment.effectiveTo } };
  } else if (input.outcome.outcomeClass === "wrong_authority"
    && input.judgment.frozenCandidateHash === input.frozenCandidate.frozenCandidateHash
    && input.judgment.publisherIdentityCode === input.frozenCandidate.publisherIdentityCode
    && locatorIds.has(input.judgment.authorityLocatorId)
    && dynamicallyBindPublisherOrigin({ sourceOrigin: input.document.sourceOrigin, finalUrl: input.document.finalUrl,
      publisherIdentityCode: input.judgment.publisherIdentityCode,
      authorityClass: input.frozenCandidate.sourceAuthorityCandidate,
      publicScope: input.intent.publicScope }) === null
    && publisherIdentityApplicable(input.judgment.publisherIdentityCode, input.intent.publicScope,
      input.frozenCandidate.sourceAuthorityCandidate)) {
    const applicableScopeDimension = publisherIdentityScopeDimension(input.judgment.publisherIdentityCode,
      input.intent.publicScope, input.frozenCandidate.sourceAuthorityCandidate)!;
    proofWithoutId = { ...common, outcomeClass: "wrong_authority", granularity: "source_origin",
      proofLocatorId: null,
      proofBasis: { kind: "publisher_origin_binding_not_established",
        authorityClass: input.frozenCandidate.sourceAuthorityCandidate,
        publisherIdentityCode: input.judgment.publisherIdentityCode,
        applicableScopeDimension, applicableScopeIdentityCode: input.judgment.publisherIdentityCode,
        publisherOriginBindingCatalogVersion: RG_PUBLISHER_ORIGIN_BINDING_CATALOG_VERSION,
        publisherOriginBindingCatalogHash: RG_PUBLISHER_ORIGIN_BINDING_CATALOG_HASH } };
  }
  if (!proofWithoutId) return null;
  return { ...proofWithoutId, proofId: `rg-negative-applicability-${digest(proofWithoutId).slice(0, 32)}` };
}

function appendReusableNegativeApplicabilityProof(
  runId: string,
  workItemId: string,
  proof: CanonicalRgReusableNegativeApplicabilityProof,
): void {
  const existing = db.prepare(`SELECT work_item_id, operation_id, event_type, event_json, event_hash FROM canonical_rg_execution_events
    WHERE run_id = ? AND operation_id = ? AND event_type = 'reusable_negative_applicability_proof' ORDER BY rowid LIMIT 1`)
    .get(runId, proof.verificationOperationId) as {
      work_item_id: string; operation_id: string; event_type: string; event_json: string; event_hash: string;
    } | undefined;
  if (existing) {
    const event = JSON.parse(existing.event_json);
    if (existing.event_hash !== digest({ runId, workItemId: existing.work_item_id,
      operationId: existing.operation_id, eventType: existing.event_type, event })
      || canonicalJson(event) !== canonicalJson(proof)) {
      throw new Error("rg_reusable_negative_applicability_proof_replay_mismatch");
    }
    return;
  }
  appendEvent(runId, workItemId, proof.verificationOperationId, "reusable_negative_applicability_proof", proof);
}

function appendCandidateResearchOutcome(runId: string, outcome: CanonicalRgCandidateResearchOutcome): void {
  const existing = db.prepare(`SELECT work_item_id, operation_id, event_type, event_json, event_hash FROM canonical_rg_execution_events
    WHERE run_id = ? AND operation_id = ? AND event_type = 'candidate_research_outcome' ORDER BY rowid LIMIT 1`)
    .get(runId, outcome.verificationOperationId) as {
      work_item_id: string; operation_id: string; event_type: string; event_json: string; event_hash: string;
    } | undefined;
  if (existing) {
    const event = JSON.parse(existing.event_json);
    if (existing.event_hash !== digest({ runId, workItemId: existing.work_item_id,
      operationId: existing.operation_id, eventType: existing.event_type, event })
      || canonicalJson(event) !== canonicalJson(outcome)) {
      throw new Error("rg_candidate_research_outcome_replay_mismatch");
    }
    return;
  }
  appendEvent(runId, outcome.workItemId, outcome.verificationOperationId, "candidate_research_outcome", outcome);
}

function appendKnownInapplicableCandidateSkip(
  runId: string,
  workItemId: string,
  intent: CanonicalRgSearchIntent,
  candidate: CanonicalRgDiscoveryCandidate,
  prior: ReusableCandidateInapplicability,
  operationId: string | null,
): void {
  appendEvent(runId, workItemId, operationId, "candidate_retrieval_skipped_known_inapplicable", {
    schemaVersion: "canonical_rg_candidate_retrieval_skip_v1",
    candidateId: candidate.candidateId,
    sourceUrl: candidate.url,
    documentFingerprint: prior.documentFingerprint,
    discoveryApplicabilityFingerprint: intent.discoveryScope.applicabilityFingerprint,
    priorVerificationOperationId: prior.verificationOperationId,
    outcomeClass: prior.outcomeClass,
    reuseIdentity: prior.reuseIdentity,
    semanticReuse: "prohibited",
    analyticalCompletionEffect: "none",
  });
}

function knownInapplicableDocumentsForIntent(
  runId: string,
  intent: CanonicalRgSearchIntent,
): Map<string, ReusableCandidateInapplicability[]> {
  const rows = db.prepare(`SELECT work_item_id, operation_id, event_type, event_json, event_hash FROM canonical_rg_execution_events
    WHERE run_id = ? AND event_type = 'candidate_research_outcome' ORDER BY rowid`).all(runId) as Array<{
      work_item_id: string; operation_id: string; event_type: string; event_json: string; event_hash: string;
    }>;
  const output = new Map<string, ReusableCandidateInapplicability[]>();
  const add = (url: string, reusable: ReusableCandidateInapplicability) => {
    const values = output.get(url) ?? [];
    if (!values.some((value) => canonicalJson(value) === canonicalJson(reusable))) values.push(reusable);
    output.set(url, values);
  };
  for (const row of rows) {
    let value: Partial<CanonicalRgCandidateResearchOutcome>;
    try {
      value = JSON.parse(row.event_json) as Partial<CanonicalRgCandidateResearchOutcome>;
      if (row.event_hash !== digest({ runId, workItemId: row.work_item_id, operationId: row.operation_id,
        eventType: row.event_type, event: value })) throw new Error("rg_candidate_research_outcome_integrity_invalid");
    } catch (error) {
      if (error instanceof Error && error.message === "rg_candidate_research_outcome_integrity_invalid") throw error;
      throw new Error("rg_candidate_research_outcome_integrity_invalid");
    }
    if (value.schemaVersion !== "canonical_rg_candidate_research_outcome_v1"
      || value.discoveryApplicabilityFingerprint !== intent.discoveryScope.applicabilityFingerprint
      || value.applicabilityReuse !== "exclude_document_for_matching_discovery_scope"
      || typeof value.candidateUrl !== "string" || typeof value.sourceUrl !== "string"
      || typeof value.documentFingerprint !== "string"
      || typeof value.verificationOperationId !== "string"
      || !["wrong_authority", "wrong_scope", "wrong_period"].includes(value.outcomeClass ?? "")) continue;
    try {
      const candidateUrl = normalizeSafeHttpsUrl(value.candidateUrl);
      const sourceUrl = normalizeSafeHttpsUrl(value.sourceUrl);
      if (candidateUrl !== value.candidateUrl || sourceUrl !== value.sourceUrl
        || !/^[a-f0-9]{64}$/.test(value.documentFingerprint)) continue;
      const reusable = { documentFingerprint: value.documentFingerprint,
        verificationOperationId: value.verificationOperationId,
        outcomeClass: value.outcomeClass as "wrong_authority" | "wrong_scope" | "wrong_period",
        reuseIdentity: "legacy_matching_discovery_scope" as const, authorityClass: null };
      add(candidateUrl, reusable);
      add(sourceUrl, reusable);
    } catch { /* malformed historical event remains unusable */ }
  }
  const proofRows = db.prepare(`SELECT work_item_id, operation_id, event_type, event_json, event_hash FROM canonical_rg_execution_events
    WHERE run_id = ? AND event_type = 'reusable_negative_applicability_proof' ORDER BY rowid`).all(runId) as Array<{
      work_item_id: string; operation_id: string; event_type: string; event_json: string; event_hash: string;
    }>;
  const expectedContext = negativeApplicabilityContext(intent);
  const expectedContextFingerprint = digest(expectedContext);
  for (const row of proofRows) {
    let value: CanonicalRgReusableNegativeApplicabilityProof;
    try {
      value = JSON.parse(row.event_json) as CanonicalRgReusableNegativeApplicabilityProof;
      if (row.event_hash !== digest({ runId, workItemId: row.work_item_id, operationId: row.operation_id,
        eventType: row.event_type, event: value })
        || !validReusableNegativeApplicabilityProof(value, runId)
        || value.verificationOperationId !== row.operation_id
        || !reusableNegativeApplicabilityLineageValid(value)) {
        throw new Error("rg_reusable_negative_applicability_proof_integrity_invalid");
      }
    } catch {
      throw new Error("rg_reusable_negative_applicability_proof_integrity_invalid");
    }
    if (value.applicabilityContextFingerprint !== expectedContextFingerprint
      || canonicalJson(value.applicabilityContext) !== canonicalJson(expectedContext)) continue;
    if (value.proofBasis.kind === "publisher_origin_binding_not_established"
      && intent.publicScope[value.proofBasis.applicableScopeDimension]
        !== value.proofBasis.applicableScopeIdentityCode) continue;
    const authorityClass = value.proofBasis.kind === "publisher_origin_binding_not_established"
      ? value.proofBasis.authorityClass : null;
    const reusable = { documentFingerprint: value.documentFingerprint,
      verificationOperationId: value.verificationOperationId, outcomeClass: value.outcomeClass,
      reuseIdentity: "typed_claim_independent_applicability_proof" as const, authorityClass };
    add(value.candidateUrl, reusable);
    add(value.sourceUrl, reusable);
  }
  return output;
}

function reusableNegativeApplicabilityLineageValid(
  proof: CanonicalRgReusableNegativeApplicabilityProof,
): boolean {
  const row = db.prepare(`SELECT work_item_id, operation_id, event_type, event_json, event_hash
    FROM canonical_rg_execution_events WHERE run_id = ? AND operation_id = ?
    AND event_type = 'candidate_research_outcome' ORDER BY rowid LIMIT 1`)
    .get(proof.runId, proof.verificationOperationId) as {
      work_item_id: string; operation_id: string; event_type: string; event_json: string; event_hash: string;
    } | undefined;
  if (!row) return false;
  try {
    const outcome = JSON.parse(row.event_json) as CanonicalRgCandidateResearchOutcome;
    if (row.event_hash !== digest({ runId: proof.runId, workItemId: row.work_item_id,
      operationId: row.operation_id, eventType: row.event_type, event: outcome })
      || outcome.schemaVersion !== "canonical_rg_candidate_research_outcome_v2"
      || outcome.verificationOperationId !== proof.verificationOperationId
      || outcome.outcomeClass !== proof.outcomeClass
      || outcome.documentFingerprint !== proof.documentFingerprint
      || outcome.candidateUrl !== proof.candidateUrl || outcome.sourceUrl !== proof.sourceUrl
      || outcome.applicabilityReuse !== "typed_negative_applicability_proof_required") return false;
  } catch { return false; }
  const operation = operationFromDb(proof.runId, proof.verificationOperationId)
    ?? supersededOperationFromHistory(proof.runId, proof.verificationOperationId);
  return Boolean(operation && operation.kind === "independent_verification" && operation.state === "completed"
    && operation.candidateId !== null);
}

function supersededOperationFromHistory(runId: string, operationId: string): CanonicalRgOperation | null {
  const rows = db.prepare(`SELECT work_item_id, operation_id, event_type, event_json, event_hash
    FROM canonical_rg_execution_events WHERE run_id = ? AND operation_id = ?
    AND event_type = 'superseded_plan_snapshot' ORDER BY rowid DESC`).all(runId, operationId) as Array<{
      work_item_id: string; operation_id: string; event_type: string; event_json: string; event_hash: string;
    }>;
  for (const row of rows) {
    try {
      const event = JSON.parse(row.event_json) as { operation?: CanonicalRgOperation };
      if (row.event_hash !== digest(event) || event.operation?.operationId !== operationId) continue;
      return event.operation;
    } catch { /* malformed snapshots do not establish lineage */ }
  }
  return null;
}

function knownInapplicableCandidate(
  history: Map<string, ReusableCandidateInapplicability[]>,
  candidate: CanonicalRgDiscoveryCandidate,
): ReusableCandidateInapplicability | null {
  const values = history.get(candidate.url) ?? [];
  return values.find((value) => value.authorityClass === null || value.authorityClass === candidate.claimedAuthority) ?? null;
}

function validReusableNegativeApplicabilityProof(
  value: CanonicalRgReusableNegativeApplicabilityProof,
  runId: string,
): boolean {
  if (!value || value.schemaVersion !== "canonical_rg_reusable_negative_applicability_proof_v1"
    || value.runId !== runId || !isSafeId(value.proofId)
    || !isSafeId(value.verificationOperationId) || !/^[a-f0-9]{64}$/.test(value.documentFingerprint)
    || value.reusePermission !== "retrieval_exclusion_for_exact_applicability_question_only"
    || value.semanticReuse !== "prohibited" || value.analyticalCompletionEffect !== "none"
    || value.applicabilityContext.productionScopeVersion !== CANONICAL_PRODUCTION_APPLICABILITY_SCOPE_VERSION
    || value.applicabilityContext.countryCode !== CANONICAL_PRODUCTION_COUNTRY_CODE
    || value.applicabilityContextFingerprint !== digest(value.applicabilityContext)) return false;
  const allowedDimensions = new Set(["processor", "processorProgram", "network", "region", "jurisdiction"]);
  if (!value.applicabilityContext.exactPublicDimensions
    || Object.entries(value.applicabilityContext.exactPublicDimensions).some(([key, item]) =>
      !allowedDimensions.has(key) || !isSafeCode(item))
    || typeof value.applicabilityContext.asOf !== "string" || !validNullableDay(value.applicabilityContext.asOf)
    || (value.applicabilityContext.statementPeriod !== null
      && (typeof value.applicabilityContext.statementPeriod?.start !== "string"
        || typeof value.applicabilityContext.statementPeriod?.end !== "string"
        || !validNullableDay(value.applicabilityContext.statementPeriod.start)
        || !validNullableDay(value.applicabilityContext.statementPeriod.end)))) return false;
  let candidateUrl: string;
  let sourceUrl: string;
  try {
    candidateUrl = normalizeSafeHttpsUrl(value.candidateUrl);
    sourceUrl = normalizeSafeHttpsUrl(value.sourceUrl);
  } catch { return false; }
  if (candidateUrl !== value.candidateUrl || sourceUrl !== value.sourceUrl
    || new URL(sourceUrl).origin !== value.sourceOrigin) return false;
  const { proofId, ...withoutId } = value;
  if (proofId !== `rg-negative-applicability-${digest(withoutId).slice(0, 32)}`) return false;
  if (value.outcomeClass === "wrong_scope" && value.granularity === "document"
    && value.proofLocatorId && value.proofBasis.kind === "document_scope_mismatch") {
    return isSafeId(value.proofLocatorId) && isSafeCode(value.proofBasis.requiredScopeValue)
      && isSafeCode(value.proofBasis.observedScopeValue)
      && value.proofBasis.requiredScopeValue !== value.proofBasis.observedScopeValue
      && expectedScopeValue(value.applicabilityContext, value.proofBasis.scopeDimension)
        === value.proofBasis.requiredScopeValue;
  }
  if (value.outcomeClass === "wrong_period" && value.granularity === "document"
    && value.proofLocatorId && value.proofBasis.kind === "document_period_mismatch") {
    return isSafeId(value.proofLocatorId) && value.proofBasis.requiredAsOf === value.applicabilityContext.asOf
      && validNullableDay(value.proofBasis.effectiveFrom) && validNullableDay(value.proofBasis.effectiveTo)
      && (value.proofBasis.effectiveFrom !== null || value.proofBasis.effectiveTo !== null)
      && !periodApplicable(value.proofBasis.requiredAsOf,
        value.proofBasis.effectiveFrom, value.proofBasis.effectiveTo);
  }
  return value.outcomeClass === "wrong_authority" && value.granularity === "source_origin"
    && value.proofLocatorId === null && value.proofBasis.kind === "publisher_origin_binding_not_established"
    && value.proofBasis.publisherOriginBindingCatalogVersion === RG_PUBLISHER_ORIGIN_BINDING_CATALOG_VERSION
    && value.proofBasis.publisherOriginBindingCatalogHash === RG_PUBLISHER_ORIGIN_BINDING_CATALOG_HASH
    && ["official_network_publication", "processor_publication"].includes(value.proofBasis.authorityClass)
    && ["processor", "processorProgram", "acquirer", "isoReseller", "network"]
      .includes(value.proofBasis.applicableScopeDimension)
    && value.proofBasis.applicableScopeIdentityCode === value.proofBasis.publisherIdentityCode
    && isSafeCode(value.proofBasis.publisherIdentityCode);
}

function publisherIdentityApplicable(publisherIdentityCode: string, publicScope: Record<string, string>,
  authority: CanonicalRgVerifiedEvidence["sourceAuthority"]): boolean {
  const identities = authority === "official_network_publication"
    ? [publicScope.network]
    : [publicScope.processor, publicScope.processorProgram, publicScope.acquirer, publicScope.isoReseller];
  return identities.includes(publisherIdentityCode);
}

function valueMatchesConstraint(value: CanonicalRgClaimValue, constraint: CanonicalRgWorkItem["expectedKnowledgeValueConstraint"],
  admission: CanonicalRgClaimAdmission): boolean {
  if (!value || typeof value !== "object") return false;
  if (constraint.kind === "mapping") return value.kind === "mapping" && value.sourceCode === constraint.sourceCode
    && isSafeCode(value.canonicalCode);
  if (constraint.kind === "role") return value.kind === "role" && value.controlDimension === constraint.controlDimension
    && ["proven", "unresolved", "conflicting", "unavailable", "not_applicable"].includes(value.state)
    && (value.participantRole === null || isSafeCode(value.participantRole));
  if (constraint.kind === "boolean") return value.kind === "boolean" && typeof value.value === "boolean"
    && admission.facet === "merchant_lever";
  if (constraint.kind === "synthesis_constraint_identity") return value.kind === constraint.kind
    && ["applicable", "not_applicable"].includes(value.applicability) && isSafeCode(value.governingAuthorityCode);
  if (constraint.kind === "synthesis_economic_driver") return value.kind === constraint.kind
    && isSafeCode(value.driverType) && isSafeCode(value.populationPredicateCode);
  if (constraint.kind === "synthesis_recurrence") return value.kind === constraint.kind
    && value.recurrenceBasis === constraint.recurrenceBasis
    && Number.isFinite(value.occurrencesPerYear) && value.occurrencesPerYear > 0 && value.occurrencesPerYear <= 366;
  if (constraint.kind === "synthesis_counterfactual") return value.kind === constraint.kind
    && ["verification_only", "exact_deterministic_delta"].includes(value.resultState)
    && value.currency === "USD" && (value.alternativeAmountMinor === null
      || Number.isSafeInteger(value.alternativeAmountMinor) && value.alternativeAmountMinor >= 0)
    && (value.resultState === "verification_only" ? value.alternativeAmountMinor === null : value.alternativeAmountMinor !== null)
    && Array.isArray(value.assumptionCodes) && value.assumptionCodes.every(isSafeCode)
    && Array.isArray(value.implementationDependencyCodes) && value.implementationDependencyCodes.every(isSafeCode);
  if (constraint.kind === "synthesis_safe_action") return value.kind === constraint.kind
    && constraint.allowedSafeActionCodes.includes(value.safeActionCode)
    && isSafeCode(value.safeActionCode) && isSafeCode(value.mechanismCode)
    && (value.verificationRequirementCode === null || isSafeCode(value.verificationRequirementCode))
    && (value.requestTargetCode === null || isSafeCode(value.requestTargetCode))
    && Array.isArray(value.implementationDependencyCodes) && value.implementationDependencyCodes.every(isSafeCode)
    && (!["request_governing_documentation", "verify_account_capability_or_configuration",
      "request_pricing_application_review"].includes(value.safeActionCode)
      || value.verificationRequirementCode !== null);
  if (constraint.kind === "synthesis_merchant_influence") return value.kind === constraint.kind
    && value.safeActionCode === constraint.safeActionCode && value.influenceKind === constraint.influenceKind;
  if (constraint.kind === "synthesis_constraint_action_effect") return value.kind === constraint.kind
    && value.safeActionCode === constraint.safeActionCode && value.constraintAtomicClaimId === constraint.constraintAtomicClaimId;
  return value.kind === "synthesis_condition_state" && value.safeActionCode === constraint.safeActionCode
    && value.constraintAtomicClaimId === constraint.constraintAtomicClaimId && value.conditionCode === constraint.conditionCode;
}

function periodApplicable(asOf: string, effectiveFrom: string | null, effectiveTo: string | null): boolean {
  return (effectiveFrom === null || asOf >= effectiveFrom) && (effectiveTo === null || asOf < effectiveTo);
}

function workItemFromDb(runId: string, workItemId: string): CanonicalRgWorkItem | null {
  const row = db.prepare(`SELECT work_item_json FROM canonical_rg_work_items WHERE run_id = ? AND work_item_id = ?`)
    .get(runId, workItemId) as { work_item_json: string } | undefined;
  return row ? JSON.parse(row.work_item_json) as CanonicalRgWorkItem : null;
}

function operationFromDb(runId: string, operationId: string): CanonicalRgOperation | null {
  const row = db.prepare(`SELECT operation_json FROM canonical_rg_operations WHERE run_id = ? AND operation_id = ?`)
    .get(runId, operationId) as { operation_json: string } | undefined;
  return row ? JSON.parse(row.operation_json) as CanonicalRgOperation : null;
}

function planHashForWork(runId: string, workItemId: string): string {
  const row = db.prepare(`SELECT plan_hash FROM canonical_rg_work_items WHERE run_id = ? AND work_item_id = ?`)
    .get(runId, workItemId) as { plan_hash: string } | undefined;
  return row?.plan_hash ?? "";
}

function validateExecutionGrantBinding(persisted: PersistedAnalysisRunRecord,
  grant: CanonicalContinuationExecutionGrant, cycleOwnerId: string | undefined): void {
  if (!cycleOwnerId) throw new Error("rg_evidence_continuation_cycle_owner_required");
  const lease = db.prepare(`SELECT adaptive_cycle_owner, adaptive_cycle_lease_expires_at FROM canonical_analysis_runs WHERE id = ?`)
    .get(persisted.id) as { adaptive_cycle_owner: string | null; adaptive_cycle_lease_expires_at: string | null } | undefined;
  if (!lease || lease.adaptive_cycle_owner !== cycleOwnerId || !lease.adaptive_cycle_lease_expires_at
    || lease.adaptive_cycle_lease_expires_at <= new Date().toISOString()) throw new Error("rg_evidence_continuation_cycle_lease_invalid");
  const work = persisted.rgWorkItems.find((item) => item.workItemId === grant.baseWorkItemId);
  const admission = persisted.rgClaimAdmissions.find((item) => item.atomicClaimId === grant.atomicClaimId);
  if (grant.runId !== persisted.id || grant.executionGeneration !== persisted.rgExecutionGeneration
    || grant.controllerRevision !== persisted.continuationRevision
    || grant.continuationStateHash !== persisted.continuationStateHash
    || grant.binding.semanticRevision !== persisted.semanticRevision || grant.binding.semanticHash !== persisted.semanticHash
    || grant.binding.canonicalStateHash !== persisted.canonicalStateHash || grant.binding.planHash !== persisted.rgPlanHash
    || grant.binding.planGeneration !== persisted.rgPlanGeneration || grant.binding.rfSnapshotHash !== persisted.rfSnapshotHash
    || !work || !admission || work.atomicClaimId !== grant.atomicClaimId
    || work.executionAuthorization?.grantId !== grant.grantId
    || work.executionAuthorization.effectiveWorkContractFingerprint !== grant.effectiveWorkContractFingerprint
    || canonicalRgWorkContractFingerprint(admission, work) !== grant.effectiveWorkContractFingerprint) {
    throw new Error("rg_evidence_continuation_grant_binding_invalid");
  }
}

function operationalCeilingReason(runId: string,
  grant: CanonicalContinuationExecutionGrant | null,
  generationZero: GenerationZeroOperationalScope | null = null): string | null {
  if (!grant && !generationZero) return null;
  const rows = db.prepare(`SELECT operation_json FROM canonical_rg_operations WHERE run_id = ?`)
    .all(runId) as Array<{ operation_json: string }>;
  const allOperations = rows.map((row) => JSON.parse(row.operation_json) as CanonicalRgOperation);
  if (generationZero) {
    const currentOperations = allOperations.filter((item) => item.planHash === generationZero.planHash
      && (item.executionGrantId ?? null) === null && !generationZero.existingOperationIds.has(item.operationId));
    const providerCalls = generationZero.baseline.providerCalls
      + currentOperations.reduce((sum, item) => sum + item.receipt.calls, 0);
    const retrievalBytes = generationZero.baseline.retrievalBytes
      + currentOperations.reduce((sum, item) => sum + item.receipt.retrievalBytes, 0);
    const elapsedMs = generationZero.baseline.elapsedMsObserved
      + Math.max(0, Date.now() - generationZero.cycleStartedAtMs);
    if (providerCalls >= generationZero.policy.maximumCumulativeProviderCalls) {
      return "rg_generation_zero_emergency_cumulative_provider_call_ceiling_reached_not_analytical_completion";
    }
    if (retrievalBytes >= generationZero.policy.maximumCumulativeRetrievalBytes) {
      return "rg_generation_zero_emergency_cumulative_retrieval_byte_ceiling_reached_not_analytical_completion";
    }
    if (elapsedMs >= generationZero.policy.maximumCumulativeElapsedMs) {
      return "rg_generation_zero_emergency_cumulative_elapsed_ceiling_reached_not_analytical_completion";
    }
    return null;
  }
  const operations = allOperations.filter((item) => (item.executionGrantId ?? null) === grant!.grantId);
  const currentCalls = operations.reduce((sum, item) => sum + item.receipt.calls, 0);
  const currentBytes = operations.reduce((sum, item) => sum + item.receipt.retrievalBytes, 0);
  const elapsed = Math.max(0, Date.now() - Date.parse(grant!.createdAt));
  if (grant!.resourceBaseline.providerCalls + currentCalls >= grant!.operationalPolicy.maximumCumulativeProviderCalls) {
    return "rg_emergency_cumulative_provider_call_ceiling_reached_not_analytical_completion";
  }
  if (grant!.resourceBaseline.retrievalBytes + currentBytes >= grant!.operationalPolicy.maximumCumulativeRetrievalBytes) {
    return "rg_emergency_cumulative_retrieval_byte_ceiling_reached_not_analytical_completion";
  }
  if (grant!.resourceBaseline.elapsedMsObserved + elapsed >= grant!.operationalPolicy.maximumCumulativeElapsedMs) {
    return "rg_emergency_cumulative_elapsed_ceiling_reached_not_analytical_completion";
  }
  return null;
}

function createGenerationZeroOperationalScope(
  runId: string,
  planHash: string,
  policy: CanonicalAdaptiveOperationalPolicy,
): GenerationZeroOperationalScope {
  validateGenerationZeroOperationalPolicy(policy);
  const rows = db.prepare(`SELECT operation_json FROM canonical_rg_operations WHERE run_id = ?`)
    .all(runId) as Array<{ operation_json: string }>;
  const existing = rows.map((row) => JSON.parse(row.operation_json) as CanonicalRgOperation)
    .filter((item) => item.planHash === planHash && (item.executionGrantId ?? null) === null);
  return {
    policy: structuredClone(policy),
    planHash,
    cycleStartedAtMs: Date.now(),
    baseline: {
      providerCalls: existing.reduce((sum, item) => sum + item.receipt.calls, 0),
      retrievalBytes: existing.reduce((sum, item) => sum + item.receipt.retrievalBytes, 0),
      elapsedMsObserved: existing.reduce((sum, item) => sum
        + Math.max(0, Date.parse(item.updatedAt) - Date.parse(item.createdAt)), 0),
    },
    existingOperationIds: new Set(existing.map((item) => item.operationId)),
  };
}

function validateGenerationZeroOperationalPolicy(policy: CanonicalAdaptiveOperationalPolicy): void {
  if (policy.authority !== "deployment_emergency_circuit_breaker_only"
    || policy.analyticalCompletionAuthority !== "none" || policy.maximumConcurrentWork !== 1
    || !Number.isSafeInteger(policy.maximumCumulativeProviderCalls) || policy.maximumCumulativeProviderCalls < 1
    || !Number.isSafeInteger(policy.maximumCumulativeRetrievalBytes) || policy.maximumCumulativeRetrievalBytes < 1
    || !Number.isSafeInteger(policy.maximumCumulativeElapsedMs) || policy.maximumCumulativeElapsedMs < 1) {
    throw new Error("rg_generation_zero_operational_policy_invalid");
  }
}

function validateRuntimeReadiness(ports: CanonicalRgEvidenceExecutionPorts): void {
  const readiness = ports.runtimeReadiness;
  if (!readiness) return;
  const { readinessHash, ...base } = readiness;
  const validBindings = readiness.providerBindings.every((binding) =>
    ["public_search", "investigation", "independent_verification"].includes(binding.operation)
    && /^[a-z][a-z0-9_]{0,95}$/.test(binding.providerCode)
    && /^[a-z0-9][a-z0-9_]{0,95}$/.test(binding.modelCode)
    && ["https://openrouter.ai", "https://api.openai.com"].includes(binding.endpointOrigin));
  if (readiness.schemaVersion !== "canonical_rg_runtime_readiness_v1"
    || readiness.authorization !== "standing_provider_authorization"
    || readiness.bindingSource !== "production_process_environment"
    || readiness.availability !== ports.availability
    || readiness.privacy.publicSearch !== "validated_public_concepts_only"
    || readiness.privacy.approvedAiContext !== "complete_analysis_run_permitted"
    || readiness.privacy.providerStorage !== "disabled"
    || readiness.privacy.secretPersistence !== "prohibited"
    || !/^[a-f0-9]{64}$/.test(readiness.configurationHash)
    || readinessHash !== digest(base) || !validBindings
    || (readiness.availability === "available" && readiness.providerBindings.length !== 3)
    || (readiness.availability === "unavailable" && (readiness.providerBindings.length !== 0
      || readiness.reasonCodes.join("\0") !== ports.unavailabilityReasonCodes.join("\0")))) {
    throw new Error("rg_runtime_readiness_binding_invalid");
  }
}

function verifiedEvidenceFromOperations(runId: string, workItemId: string,
  executionGrantId: string | null): CanonicalRgVerifiedEvidence[] {
  const rows = db.prepare(`SELECT operation_json FROM canonical_rg_operations
    WHERE run_id = ? AND work_item_id = ? AND state = 'completed' ORDER BY operation_id`).all(runId, workItemId) as Array<{ operation_json: string }>;
  return rows.map((row) => JSON.parse(row.operation_json) as CanonicalRgOperation)
    .filter((operation) => operation.kind === "independent_verification"
      && (operation.executionGrantId ?? null) === executionGrantId)
    .flatMap((operation) => {
      const result = operation.result as { judgment?: CanonicalRgVerificationJudgment; verifiedEvidence?: CanonicalRgVerifiedEvidence } | null;
      return result?.judgment?.semanticSupportStatus === "supported"
        && persistedVerifiedEvidenceIntegrityValid(result.verifiedEvidence) ? [result.verifiedEvidence] : [];
    });
}


function attachVerifiedEvidence(runId: string, operation: CanonicalRgOperation, evidence: CanonicalRgVerifiedEvidence): void {
  const current = operationFromDb(runId, operation.operationId);
  if (!current || current.state !== "completed") throw new Error("rg_verified_evidence_operation_not_completed");
  const existingEnvelope = verificationEnvelopeFromResult(current.result);
  if (existingEnvelope) {
    if (!persistedVerifiedEvidenceIntegrityValid(existingEnvelope.verifiedEvidence)
      || digest(existingEnvelope.verifiedEvidence) !== digest(evidence)) {
      throw new Error("rg_verified_evidence_replay_mismatch");
    }
    return;
  }
  const judgment = current.result as CanonicalRgVerificationJudgment;
  const updated = { ...current, result: { judgment, verifiedEvidence: evidence }, updatedAt: nowIso() };
  updateOperation(runId, updated);
  appendEvent(runId, current.workItemId, current.operationId, "verified_evidence_persisted", {
    evidenceId: evidence.evidenceId, evidenceHash: digest(evidence), atomicClaimId: evidence.atomicClaimId,
    documentFingerprint: evidence.documentFingerprint, authorityLocatorId: evidence.authorityLocatorId,
    supportLocatorId: evidence.supportLocatorId, originPublisherBindingId: evidence.originPublisherProof.bindingId,
    automaticKnowledgePromotion: false, canonicalFinancialMutationAllowed: false,
  });
}

function appendEvent(runId: string, workItemId: string, operationId: string | null, eventType: string, event: unknown): void {
  const createdAt = nowIso();
  const eventHash = digest({ runId, workItemId, operationId, eventType, event });
  const eventId = `rg-event-${digest({ eventHash, createdAt, nonce: randomUUID() })}`;
  db.prepare(`INSERT INTO canonical_rg_execution_events
    (event_id, run_id, work_item_id, operation_id, event_type, event_json, event_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(eventId, runId, workItemId, operationId, eventType,
    JSON.stringify(event), eventHash, createdAt);
}

export function appendCanonicalRgExecutionEvent(
  runId: string,
  workItemId: string,
  operationId: string | null,
  eventType: string,
  event: unknown,
): void {
  appendEvent(runId, workItemId, operationId, eventType, event);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value);
}
function isSafeCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,95}$/.test(value);
}
function safePublicText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
}
function validNullableDay(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
function safeReason(error: unknown): string {
  const value = error instanceof Error ? error.message : "rg_operation_failed";
  return /^[a-z][a-z0-9_:.-]{0,191}$/.test(value) ? value : "rg_operation_failed";
}
function persistableClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function digest(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}
