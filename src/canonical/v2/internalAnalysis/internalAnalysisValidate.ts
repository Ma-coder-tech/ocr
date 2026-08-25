import type { InternalStatementAnalysisV1, PublicSourceEvidenceManifestV1, RgInternalAuditV1 } from "./internalAnalysisTypes.js";
import { hasExactKeys, isRecord, isSafeStructuredString } from "../knowledge/knowledgeSafety.js";

const ANALYSIS_KEYS = ["schemaVersion", "audience", "authority", "amendmentIds", "safeStatementId", "runId", "evaluatedAt", "executionStatus",
  "researchOutcome", "researchQuestionOutcomes", "terminalStatus",
  "canonicalBeforeHash", "canonicalAfterHash", "canonicalTruthPreserved", "canonicalFacts", "statementObservations", "admittedKnowledge",
  "supportedResearchFindings", "investigativeHypotheses", "contradictions", "unresolvedQuestions", "recommendations", "impact", "limitations"] as const;
const FINDING_KEYS = ["findingId", "kind", "title", "displayValue", "statementEvidenceRefs", "knowledgeRefs", "researchEvidenceRefs", "questionOriginRefs",
  "proposedValue", "authority", "supportStatus", "scopeAndPeriod", "limitations", "canonicalMutationAllowed"] as const;
const OBSERVATION_KEYS = ["observationId", "questionClass", "label", "occurrenceRefs", "evidenceRefs", "observedAmountMinor", "currency", "authority", "limitations"] as const;
const RECOMMENDATION_KEYS = ["recommendationId", "kind", "title", "findingRefs", "evidenceRefs", "actionabilityCeiling", "merchantControl", "limitations"] as const;
const IMPACT_KEYS = ["impactId", "observationRef", "state", "amountMinor", "maximumAmountMinor", "currency", "annualized", "counterfactualRef", "limitations"] as const;
const RESEARCH_QUESTION_OUTCOME_KEYS = ["questionId", "questionClass", "subjectCode", "outcome", "attempted", "operationalReasonCodes",
  "retainedCandidateCount", "publicResearchStillPossible"] as const;
const MANIFEST_KEYS = ["schemaVersion", "privacy", "downloadedBodiesPersisted", "entries"] as const;
const EVIDENCE_KEYS = ["evidenceId", "supportId", "questionId", "candidateId", "sourceUrl", "sourceTitle", "sourceAuthority", "authorityAdmissionRef", "retrievedAt",
  "documentId", "documentFingerprint", "locator", "boundedSupportingExcerpt", "semanticVerification", "limitations"] as const;
const LOCATOR_KEYS = ["locatorId", "page", "sectionCode", "lineStart", "lineEnd"] as const;
const RG_AUDIT_KEYS = ["schemaVersion", "runId", "executionMode", "externalNetworkCallCount", "liveTimingPolicy",
  "providerOperationReceipts", "searchAttempts", "retrievalOutcomes", "questions", "verificationOutcomes", "budget", "diagnostics",
  "rfProjection", "canonicalBeforeHash", "canonicalAfterHash", "canonicalTruthPreserved", "rfSnapshotHash", "rfEntryRefs", "policyVersions"] as const;
const RECEIPT_KEYS = ["receiptId", "reservationId", "operationId", "operation", "providerCode", "logicalAttempt", "actualSendCount", "retryCount",
  "sendState", "completionState", "elapsedMs", "usageState", "outputTokens", "providerRequestCount", "usageCostUsd", "providerConfigurationCode",
  "httpStatus", "localRequestId", "providerRequestId", "providerResponseId", "requestedModelIdentifier", "returnedModelIdentifier", "finishReason",
  "toolExecutionState", "annotationCount", "normalizedCandidateCount", "providerErrorType", "providerErrorCode", "providerErrorParam",
  "structuredOutputValidation", "safeReasonCode"] as const;
const SEARCH_CANDIDATE_AUDIT_KEYS = ["consideredUrl", "normalizedUrl", "sourceDomain", "sourceOrigin", "candidateId", "rank",
  "sourceTypeCode", "claimedAuthority", "derivedAuthority", "authorityAdmissionRef", "authorityDecision", "reasonCodes", "retrievalAttempted"] as const;
const RETRIEVAL_OUTCOME_KEYS = ["questionId", "candidateId", "documentId", "requestedUrl", "finalUrl", "documentFingerprint",
  "authorityAdmissionRef", "fingerprintMatchState", "state", "mimeType", "byteLength", "locatorIds", "reasonCodes"] as const;
const RF_PROJECTION_KEYS = ["projectedCandidateCount", "automaticAdmissionCount", "projectionStatus", "reasonCodes", "candidateSummaries"] as const;
const RF_CANDIDATE_SUMMARY_KEYS = ["candidateRef", "lifecycle", "privacy", "proposedVisibility", "requiresHumanAdmission",
  "provenanceAdapter", "provenanceCode", "projectionStatus", "reasonCodes"] as const;
const KNOWLEDGE_SOURCE_AUTHORITIES = ["official_network_publication", "processor_publication", "merchant_contract", "account_statement_observation",
  "statement_observation", "verified_cross_statement_observation", "admitted_template_specification", "approved_internal_manual_mapping",
  "synthetic_test_fixture", "legacy_reference_candidate", "automated_retrieval", "ai_inference"] as const;
const FINDING_ARRAYS = ["canonicalFacts", "admittedKnowledge", "supportedResearchFindings", "investigativeHypotheses", "contradictions", "unresolvedQuestions"] as const;
const ANALYSIS_ARRAYS = [...FINDING_ARRAYS, "amendmentIds", "researchQuestionOutcomes", "statementObservations", "recommendations", "impact", "limitations"] as const;
const RESEARCH_OUTCOMES = ["research_completed", "completed_with_unresolved_evidence", "research_unavailable_due_to_timeout",
  "no_eligible_public_evidence_found", "source_rejected_by_authority_policy", "search_tool_execution_unverified", "provider_failure"] as const;
const SUPPORT_STATUSES = ["supported_candidate", "partially_supported", "unsupported", "contradicted", "wrong_authority", "wrong_scope", "wrong_period",
  "locator_unproven", "malformed", "verification_unavailable", "not_applicable", "rf_resolved"] as const;

export function validateInternalStatementAnalysisV1(analysis: InternalStatementAnalysisV1): string[] {
  const issues: string[] = [];
  if (!isRecord(analysis) || !hasExactKeys(analysis, ANALYSIS_KEYS)) return ["internal_analysis_shape_invalid"];
  if (ANALYSIS_ARRAYS.some((key) => !Array.isArray(analysis[key]))) return ["internal_analysis_array_shape_invalid"];
  if (analysis.schemaVersion !== "internal_statement_analysis_v1" || analysis.audience !== "internal_analyst_only"
    || analysis.authority !== "shadow_non_authoritative") issues.push("internal_analysis_identity_invalid");
  if (analysis.amendmentIds.length !== 2 || analysis.amendmentIds[0] !== "E2E-AMEND-001-OBSERVATION-TO-INVESTIGATION"
    || analysis.amendmentIds[1] !== "E2E-AMEND-002-LIVE-RESEARCH-OUTCOME"
    || !isSafeStructuredString(analysis.safeStatementId) || !isSafeStructuredString(analysis.runId) || !isValidIsoTimestamp(analysis.evaluatedAt)
    || !/^[a-f0-9]{64}$/.test(analysis.canonicalBeforeHash) || !/^[a-f0-9]{64}$/.test(analysis.canonicalAfterHash)
    || !safeStringArray(analysis.limitations)) issues.push("internal_analysis_metadata_invalid");
  if (!["completed", "completed_with_unresolved", "blocked_fatal_deterministic_failure", "provider_unavailable", "research_unavailable"]
    .includes(analysis.terminalStatus)) issues.push("internal_analysis_terminal_status_invalid");
  if (analysis.executionStatus !== "completed" || !RESEARCH_OUTCOMES.includes(analysis.researchOutcome)) {
    issues.push("internal_analysis_execution_or_research_outcome_invalid");
  }
  for (const outcome of analysis.researchQuestionOutcomes) {
    if (!isRecord(outcome) || !hasExactKeys(outcome, RESEARCH_QUESTION_OUTCOME_KEYS)
      || !isSafeStructuredString(outcome.questionId)
      || !["application_fee_public_definition", "non_swiped_discount_public_definition"].includes(String(outcome.questionClass))
      || !["application_fee_terminology", "non_swiped_discount_terminology"].includes(String(outcome.subjectCode))
      || !RESEARCH_OUTCOMES.includes(outcome.outcome) || typeof outcome.attempted !== "boolean"
      || !safeStringArray(outcome.operationalReasonCodes) || !Number.isSafeInteger(outcome.retainedCandidateCount)
      || outcome.retainedCandidateCount < 0 || typeof outcome.publicResearchStillPossible !== "boolean") {
      issues.push("internal_analysis_research_question_outcome_invalid");
    }
  }
  if (new Set(analysis.researchQuestionOutcomes.map((item) => item.questionId)).size !== analysis.researchQuestionOutcomes.length) {
    issues.push("internal_analysis_duplicate_research_question_outcome");
  }
  if (!analysis.canonicalTruthPreserved || analysis.canonicalBeforeHash !== analysis.canonicalAfterHash) issues.push("internal_analysis_canonical_invariance_failed");
  const findings = [...analysis.canonicalFacts, ...analysis.admittedKnowledge, ...analysis.supportedResearchFindings,
    ...analysis.investigativeHypotheses, ...analysis.contradictions, ...analysis.unresolvedQuestions];
  const ids = findings.map((item) => item.findingId);
  if (new Set(ids).size !== ids.length) issues.push("internal_analysis_duplicate_finding_identity");
  const expectedLanes = { canonical_fact: "canonical_deterministic", admitted_knowledge: "rf_admitted", supported_research_finding: "verified_public_candidate",
    investigative_hypothesis: "investigative_only", contradiction: "investigative_only", unresolved_question: "unresolved" } as const;
  const expectedBuckets = { canonicalFacts: "canonical_fact", admittedKnowledge: "admitted_knowledge", supportedResearchFindings: "supported_research_finding",
    investigativeHypotheses: "investigative_hypothesis", contradictions: "contradiction", unresolvedQuestions: "unresolved_question" } as const;
  for (const [bucket, kind] of Object.entries(expectedBuckets)) {
    if ((analysis[bucket as keyof typeof expectedBuckets] as InternalStatementAnalysisV1["canonicalFacts"]).some((item) => !isRecord(item) || item.kind !== kind)) {
      issues.push("internal_analysis_finding_bucket_invalid");
    }
  }
  for (const item of findings) {
    if (!isRecord(item) || !hasExactKeys(item, FINDING_KEYS) || !isSafeStructuredString(item.findingId) || typeof item.title !== "string"
      || !Object.prototype.hasOwnProperty.call(expectedLanes, String(item.kind)) || item.authority !== expectedLanes[item.kind as keyof typeof expectedLanes]
      || !arraysOfSafeIds(item.statementEvidenceRefs, item.knowledgeRefs, item.researchEvidenceRefs, item.questionOriginRefs)
      || !safeDisplayText(item.title, 500) || (item.displayValue !== null && !safeDisplayText(item.displayValue, 2_000))
      || !safeDisplayText(item.scopeAndPeriod, 500) || !SUPPORT_STATUSES.includes(item.supportStatus as never)
      || !validFindingValue(item.proposedValue) || !safeStringArray(item.limitations) || item.canonicalMutationAllowed !== false) {
      issues.push("internal_analysis_finding_shape_or_lane_invalid");
    }
  }
  for (const observation of analysis.statementObservations) {
    if (!isRecord(observation) || !hasExactKeys(observation, OBSERVATION_KEYS) || !isSafeStructuredString(observation.observationId)
      || observation.authority !== "statement_observation" || observation.currency !== "USD" || typeof observation.observedAmountMinor !== "number"
      || !Number.isSafeInteger(observation.observedAmountMinor) || observation.observedAmountMinor <= 0
      || !["application_fee_public_definition", "non_swiped_discount_public_definition"].includes(String(observation.questionClass))
      || !safeDisplayText(observation.label, 200) || !arraysOfSafeIds(observation.occurrenceRefs, observation.evidenceRefs)
      || !safeStringArray(observation.limitations)) issues.push("internal_analysis_observation_shape_invalid");
  }
  if (new Set(analysis.statementObservations.map((item) => item.observationId)).size !== analysis.statementObservations.length) issues.push("internal_analysis_duplicate_observation_identity");
  if (findings.some((item) => item.canonicalMutationAllowed !== false)) issues.push("internal_analysis_mutation_authority_forbidden");
  if (analysis.supportedResearchFindings.some((item) => item.researchEvidenceRefs.length === 0 || item.supportStatus !== "supported_candidate")) {
    issues.push("supported_research_finding_requires_verified_evidence");
  }
  const findingRefs = new Set(ids);
  const findingById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const expectedCeiling = { supported_economic_action: "economic_action_supported", verification_action: "verification_only",
    documentation_request: "documentation_only", research_followup: "verification_only", monitoring_action: "monitoring_only",
    no_action_insufficient_evidence: "no_action" } as const;
  for (const recommendation of analysis.recommendations) {
    if (!isRecord(recommendation) || !hasExactKeys(recommendation, RECOMMENDATION_KEYS) || !isSafeStructuredString(recommendation.recommendationId)
      || !Object.prototype.hasOwnProperty.call(expectedCeiling, String(recommendation.kind)) || !arraysOfSafeIds(recommendation.findingRefs, recommendation.evidenceRefs)
      || !safeDisplayText(recommendation.title, 500) || !["proven", "unresolved", "not_applicable"].includes(String(recommendation.merchantControl))
      || !safeStringArray(recommendation.limitations)) issues.push("recommendation_shape_invalid");
    if (recommendation.findingRefs.length === 0 || recommendation.findingRefs.some((ref) => !findingRefs.has(ref))) issues.push("recommendation_finding_reference_invalid");
    if (recommendation.actionabilityCeiling !== expectedCeiling[recommendation.kind]
      || (recommendation.kind === "supported_economic_action" && recommendation.merchantControl !== "proven")) issues.push("recommendation_authority_ceiling_invalid");
    const justificationRefs = new Set(recommendation.findingRefs.flatMap((ref) => {
      const finding = findingById.get(ref); return finding ? [...finding.statementEvidenceRefs, ...finding.researchEvidenceRefs] : [];
    }));
    if (recommendation.evidenceRefs.some((ref) => !justificationRefs.has(ref))) issues.push("recommendation_evidence_reference_invalid");
    if (recommendation.kind === "supported_economic_action" && recommendation.findingRefs.some((ref) => {
      const kind = findingById.get(ref)?.kind; return kind !== "canonical_fact" && kind !== "admitted_knowledge";
    })) issues.push("recommendation_research_cannot_authorize_economic_action");
  }
  if (new Set(analysis.recommendations.map((item) => item.recommendationId)).size !== analysis.recommendations.length) issues.push("internal_analysis_duplicate_recommendation_identity");
  const observationRefs = new Set(analysis.statementObservations.map((item) => item.observationId));
  for (const impact of analysis.impact) {
    if (!isRecord(impact) || !hasExactKeys(impact, IMPACT_KEYS) || !isSafeStructuredString(impact.impactId)
      || !["observed_cost", "amount_under_review", "potential_reduction_exact", "potential_reduction_range", "unquantified_hypothesis", "unavailable"].includes(String(impact.state))
      || !safeNullableMoney(impact.amountMinor) || !safeNullableMoney(impact.maximumAmountMinor) || !["USD", null].includes(impact.currency)
      || (impact.counterfactualRef !== null && !isSafeStructuredString(impact.counterfactualRef)) || !safeStringArray(impact.limitations)) issues.push("impact_shape_invalid");
    if (impact.annualized !== false) issues.push("impact_annualization_forbidden");
    if ((impact.state === "potential_reduction_exact" || impact.state === "potential_reduction_range") && !impact.counterfactualRef) issues.push("potential_reduction_requires_canonical_counterfactual");
    if (impact.observationRef !== null && !observationRefs.has(impact.observationRef)) issues.push("impact_observation_reference_invalid");
  }
  if (new Set(analysis.impact.map((item) => item.impactId)).size !== analysis.impact.length) issues.push("internal_analysis_duplicate_impact_identity");
  const originRefs = new Set(analysis.statementObservations.map((item) => item.observationId));
  if (findings.some((item) => item.questionOriginRefs.some((ref) => !originRefs.has(ref)))) issues.push("internal_analysis_origin_reference_invalid");
  if (containsPrivateProviderMaterial(JSON.stringify(analysis))) issues.push("internal_analysis_private_provider_material_detected");
  return [...new Set(issues)].sort();
}

export function validatePublicSourceEvidenceManifestV1(manifest: PublicSourceEvidenceManifestV1): string[] {
  const issues: string[] = [];
  if (!isRecord(manifest) || !hasExactKeys(manifest, MANIFEST_KEYS) || !Array.isArray(manifest.entries)) return ["public_source_manifest_shape_invalid"];
  if (manifest.schemaVersion !== "public_source_evidence_manifest_v1" || manifest.privacy !== "internal_pre_uat_public_evidence" || manifest.downloadedBodiesPersisted !== false) issues.push("public_source_manifest_identity_invalid");
  if (new Set(manifest.entries.map((item) => item.evidenceId)).size !== manifest.entries.length) issues.push("public_source_manifest_duplicate_identity");
  if (new Set(manifest.entries.map((item) => item.supportId)).size !== manifest.entries.length
    || new Set(manifest.entries.map((item) => item.locator?.locatorId)).size !== manifest.entries.length) issues.push("public_source_manifest_duplicate_support_or_locator_identity");
  for (const entry of manifest.entries) {
    if (!isRecord(entry) || !hasExactKeys(entry, EVIDENCE_KEYS) || !isRecord(entry.locator) || !hasExactKeys(entry.locator, LOCATOR_KEYS)) {
      issues.push("public_source_manifest_entry_shape_invalid"); continue;
    }
    try { const url = new URL(entry.sourceUrl); if (url.protocol !== "https:" || !url.hostname || url.username || url.password) issues.push("public_source_manifest_https_required"); } catch { issues.push("public_source_manifest_url_invalid"); }
    if (!/^[a-f0-9]{64}$/.test(entry.documentFingerprint)) issues.push("public_source_manifest_fingerprint_invalid");
    if (![entry.evidenceId, entry.supportId, entry.questionId, entry.candidateId, entry.documentId, entry.locator.locatorId,
      entry.authorityAdmissionRef].every(isSafeStructuredString)) issues.push("public_source_manifest_identity_invalid");
    if (!["official_network_publication", "processor_publication"].includes(entry.sourceAuthority)) issues.push("public_source_manifest_authority_invalid");
    if (!Number.isInteger(entry.locator.lineStart) || !Number.isInteger(entry.locator.lineEnd) || entry.locator.lineStart < 1
      || entry.locator.lineEnd < entry.locator.lineStart || (entry.locator.page !== null && (!Number.isInteger(entry.locator.page) || entry.locator.page < 1))
      || (entry.locator.sectionCode !== null && !isSafeStructuredString(entry.locator.sectionCode))) issues.push("public_source_manifest_locator_invalid");
    if (typeof entry.boundedSupportingExcerpt !== "string" || Buffer.byteLength(entry.boundedSupportingExcerpt, "utf8") > 512
      || !safeDisplayText(entry.boundedSupportingExcerpt, 512) || !safeStringArray(entry.limitations)) issues.push("public_source_manifest_excerpt_or_limitations_invalid");
    if (typeof entry.sourceTitle !== "string" || entry.sourceTitle.length === 0 || entry.sourceTitle.length > 200 || /[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(entry.sourceTitle)
      || !isValidIsoTimestamp(entry.retrievedAt)) issues.push("public_source_manifest_public_metadata_invalid");
    if (!["supported_candidate", "partially_supported", "unsupported", "contradicted", "wrong_authority", "wrong_scope", "wrong_period", "locator_unproven", "malformed", "verification_unavailable"].includes(entry.semanticVerification)) issues.push("public_source_manifest_verification_invalid");
    if (containsPrivateProviderMaterial(`${entry.sourceTitle}\n${entry.boundedSupportingExcerpt}`)) issues.push("public_source_manifest_private_material_detected");
  }
  return [...new Set(issues)].sort();
}

export function validateInternalAnalysisReferenceGraph(analysis: InternalStatementAnalysisV1, audit: RgInternalAuditV1, manifest: PublicSourceEvidenceManifestV1): string[] {
  const issues: string[] = [];
  const evidenceIds = new Set(manifest.entries.map((item) => item.evidenceId)); const rfRefs = new Set(audit.rfEntryRefs);
  const outcomes = new Map(audit.verificationOutcomes.map((item) => [item.supportId, item]));
  const findings = [...analysis.canonicalFacts, ...analysis.admittedKnowledge, ...analysis.supportedResearchFindings, ...analysis.investigativeHypotheses, ...analysis.contradictions, ...analysis.unresolvedQuestions];
  if (findings.some((item) => item.researchEvidenceRefs.some((ref) => !evidenceIds.has(ref)))) issues.push("internal_analysis_research_evidence_reference_invalid");
  if (analysis.admittedKnowledge.some((item) => item.knowledgeRefs.some((ref) => !rfRefs.has(ref)))) issues.push("internal_analysis_knowledge_reference_invalid");
  for (const entry of manifest.entries) {
    const outcome = outcomes.get(entry.supportId);
    const retrievedUnverified = !outcome && entry.semanticVerification === "verification_unavailable"
      && entry.limitations.includes("source_existence_and_provenance_established")
      && entry.limitations.includes("semantic_verification_not_completed")
      && entry.limitations.includes("not_supported_research_finding");
    if (!retrievedUnverified && (!outcome || outcome.questionId !== entry.questionId || outcome.candidateId !== entry.candidateId
      || outcome.documentId !== entry.documentId || outcome.locatorId !== entry.locator.locatorId
      || outcome.status !== entry.semanticVerification)) issues.push("public_source_manifest_reference_graph_invalid");
  }
  const unverifiedEvidenceIds = new Set(manifest.entries.filter((entry) => entry.semanticVerification === "verification_unavailable"
    && entry.limitations.includes("semantic_verification_not_completed")).map((entry) => entry.evidenceId));
  if (analysis.supportedResearchFindings.some((finding) => finding.researchEvidenceRefs.some((ref) => unverifiedEvidenceIds.has(ref)))) {
    issues.push("retrieved_unverified_evidence_cannot_support_finding");
  }
  return [...new Set(issues)].sort();
}

export function validateRgInternalAuditV1(audit: RgInternalAuditV1): string[] {
  const issues: string[] = [];
  if (!isRecord(audit) || !hasExactKeys(audit, RG_AUDIT_KEYS)
    || !Array.isArray(audit.providerOperationReceipts) || !Array.isArray(audit.searchAttempts)
    || !Array.isArray(audit.retrievalOutcomes) || !Array.isArray(audit.verificationOutcomes) || !Array.isArray(audit.rfEntryRefs)
    || !isRecord(audit.budget) || !Array.isArray(audit.budget.reservations)) return ["rg_internal_audit_shape_invalid"];
  if (audit.schemaVersion !== "rg_internal_analysis_audit_v1") issues.push("rg_internal_audit_identity_invalid");
  if (!isRecord(audit.liveTimingPolicy) || !hasExactKeys(audit.liveTimingPolicy, ["amendmentId", "searchTimeoutMs", "globalWallTimeMs"])
    || audit.liveTimingPolicy.amendmentId !== "RG-AMEND-011-INTERNAL-LIVE-TIMING-V2"
    || audit.liveTimingPolicy.searchTimeoutMs !== 40_000 || audit.liveTimingPolicy.globalWallTimeMs !== 180_000) {
    issues.push("rg_internal_audit_live_timing_policy_invalid");
  }
  if (audit.canonicalBeforeHash !== audit.canonicalAfterHash || !audit.canonicalTruthPreserved) issues.push("rg_internal_audit_canonical_invariance_failed");
  if (audit.externalNetworkCallCount !== audit.providerOperationReceipts.reduce((sum, item) => sum + item.actualSendCount, 0)) issues.push("rg_internal_audit_external_call_count_mismatch");
  if (audit.searchAttempts.some((attempt) => {
    if (!isRecord(attempt) || !isSafeStructuredString(attempt.attemptId) || !isSafeStructuredString(attempt.questionId)
      || !["initial", "adaptive"].includes(String(attempt.kind)) || !safeDisplayText(attempt.queryText, 1_000)
      || containsPrivateProviderMaterial(attempt.queryText) || !Array.isArray(attempt.queryTerms)
      || attempt.queryTerms.some((term) => !safeDisplayText(term, 300) || containsPrivateProviderMaterial(term))
      || !Array.isArray(attempt.candidateIds) || !attempt.candidateIds.every(isSafeStructuredString)
      || !Array.isArray(attempt.candidateAudits) || attempt.candidateAudits.some((candidate) => {
        if (!isRecord(candidate) || !hasExactKeys(candidate, SEARCH_CANDIDATE_AUDIT_KEYS)
          || ![candidate.candidateId, candidate.sourceTypeCode].every(isSafeStructuredString)
          || !Number.isSafeInteger(candidate.rank) || candidate.rank < 1
          || !KNOWLEDGE_SOURCE_AUTHORITIES.includes(candidate.claimedAuthority as never)
          || (candidate.derivedAuthority !== null && !["official_network_publication", "processor_publication"].includes(String(candidate.derivedAuthority)))
          || (candidate.authorityAdmissionRef !== null && !isSafeStructuredString(candidate.authorityAdmissionRef))
          || !["retained_for_retrieval", "rejected_by_authority_policy", "rejected_by_runtime_guard"].includes(String(candidate.authorityDecision))
          || !Array.isArray(candidate.reasonCodes) || !candidate.reasonCodes.every(isSafeStructuredString)
          || typeof candidate.retrievalAttempted !== "boolean") return true;
        try {
          const considered = new URL(String(candidate.consideredUrl)); const normalized = new URL(String(candidate.normalizedUrl));
          return considered.protocol !== "https:" || considered.username.length > 0 || considered.password.length > 0
            || normalized.toString() !== considered.toString() || normalized.hostname.toLowerCase() !== candidate.sourceDomain
            || normalized.origin !== candidate.sourceOrigin;
        } catch { return true; }
      })
      || !Array.isArray(attempt.reasonCodes) || !attempt.reasonCodes.every(isSafeStructuredString)) return true;
    const metadata = attempt.providerMetadata;
    return metadata !== null && (!isRecord(metadata)
      || (metadata.providerResponseId !== null && !isSafeStructuredString(metadata.providerResponseId))
      || (metadata.modelIdentifier !== null && !safeDisplayText(metadata.modelIdentifier, 200))
      || (metadata.finishReason !== null && !isSafeStructuredString(metadata.finishReason))
      || !["verified", "unverified", "not_executed"].includes(String(metadata.toolExecutionState))
      || metadata.providerCompletionState !== "completed"
      || ![metadata.annotationCount, metadata.normalizedCandidateCount].every((value) => Number.isSafeInteger(value) && Number(value) >= 0)
      || (metadata.webSearchRequestCount !== null
        && (!Number.isSafeInteger(metadata.webSearchRequestCount) || metadata.webSearchRequestCount < 0)));
  })) {
    issues.push("rg_internal_audit_search_diagnostics_invalid");
  }
  if (!isRecord(audit.rfProjection) || !hasExactKeys(audit.rfProjection, RF_PROJECTION_KEYS)
    || !Number.isSafeInteger(audit.rfProjection.projectedCandidateCount) || audit.rfProjection.projectedCandidateCount < 0
    || !Number.isSafeInteger(audit.rfProjection.automaticAdmissionCount) || audit.rfProjection.automaticAdmissionCount < 0
    || !Array.isArray(audit.rfProjection.candidateSummaries)
    || audit.rfProjection.projectedCandidateCount !== audit.rfProjection.candidateSummaries.length
    || audit.rfProjection.projectionStatus !== (audit.rfProjection.projectedCandidateCount > 0 ? "completed_with_candidates" : "completed_no_candidates")
    || !safeReasonCodeArray(audit.rfProjection.reasonCodes)
    || !audit.rfProjection.reasonCodes.includes(audit.rfProjection.projectedCandidateCount > 0
      ? "rf_candidates_projected_for_human_review" : "no_supported_rf_candidates_projected")
    || !audit.rfProjection.reasonCodes.includes(audit.rfProjection.automaticAdmissionCount > 0
      ? "automatic_knowledge_admission_reported" : "automatic_knowledge_admission_none")
    || audit.rfProjection.candidateSummaries.some((candidate) => !isRecord(candidate)
      || !hasExactKeys(candidate, RF_CANDIDATE_SUMMARY_KEYS)
      || !/^rf-audit-candidate-[a-f0-9]{24}$/.test(String(candidate.candidateRef))
      || candidate.lifecycle !== "candidate" || candidate.privacy !== "private_by_default"
      || !["reusable", "tenant_private", "account_private"].includes(String(candidate.proposedVisibility))
      || typeof candidate.requiresHumanAdmission !== "boolean"
      || !["supplied", "reference_rate_catalog", "legacy_fiserv_fee_reference", "bounded_intelligence_runtime"].includes(String(candidate.provenanceAdapter))
      || !isSafeStructuredString(candidate.provenanceCode) || /(?:tenant|account|merchant|credential|secret)/i.test(candidate.provenanceCode)
      || candidate.projectionStatus !== "projected_for_human_review"
      || !safeReasonCodeArray(candidate.reasonCodes)
      || !candidate.reasonCodes.includes("private_by_default")
      || !candidate.reasonCodes.includes("human_admission_required")
      || !candidate.reasonCodes.includes("candidate_not_automatically_admitted"))) {
    issues.push("rg_internal_audit_rf_projection_invalid");
  }
  if (audit.retrievalOutcomes.some((document) => !isRecord(document)
    || !hasExactKeys(document, RETRIEVAL_OUTCOME_KEYS)
    || ![document.questionId, document.candidateId, document.documentId].every(isSafeStructuredString)
    || !safeHttpsUrl(document.requestedUrl) || (document.finalUrl !== null && !safeHttpsUrl(document.finalUrl))
    || (document.documentFingerprint !== null && !/^[a-f0-9]{64}$/.test(String(document.documentFingerprint)))
    || (document.authorityAdmissionRef !== null && !isSafeStructuredString(document.authorityAdmissionRef))
    || !["matched_approved_fingerprint", "mismatched_approved_fingerprint", "not_required_by_admission", "not_evaluated"].includes(String(document.fingerprintMatchState))
    || (document.fingerprintMatchState === "not_evaluated" && document.documentFingerprint !== null)
    || (document.fingerprintMatchState !== "not_evaluated" && (document.documentFingerprint === null || document.finalUrl === null))
    || (["matched_approved_fingerprint", "mismatched_approved_fingerprint"].includes(String(document.fingerprintMatchState))
      && document.authorityAdmissionRef === null)
    || (document.fingerprintMatchState === "mismatched_approved_fingerprint"
      && (document.state !== "safety_blocked" || !document.reasonCodes.includes("source_authority_document_fingerprint_mismatch")))
    || (["retrieved_extracted", "retrieved_locator_only"].includes(String(document.state))
      && (document.finalUrl === null || document.documentFingerprint === null || document.fingerprintMatchState === "not_evaluated"))
    || !["retrieved_extracted", "retrieved_locator_only", "encrypted_pdf", "malformed_pdf", "unsupported_pdf", "unsupported_content_type",
      "oversized_document", "extraction_failed", "retrieval_timeout", "safety_blocked", "inaccessible"].includes(String(document.state))
    || (document.mimeType !== null && (!safeDisplayText(document.mimeType, 200) || !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+;-]+$/.test(document.mimeType)))
    || !Number.isSafeInteger(document.byteLength) || document.byteLength < 0
    || !Array.isArray(document.locatorIds) || !document.locatorIds.every(isSafeStructuredString)
    || !safeReasonCodeArray(document.reasonCodes))) {
    issues.push("rg_internal_audit_retrieval_outcomes_invalid");
  }
  if (audit.providerOperationReceipts.some((item) => !isRecord(item) || !hasExactKeys(item, RECEIPT_KEYS)
    || ![item.receiptId, item.reservationId, item.operationId, item.providerCode, item.safeReasonCode].every(isSafeStructuredString)
    || (item.providerConfigurationCode !== null && !isSafeStructuredString(item.providerConfigurationCode))
    || !["search", "retrieval", "investigative_model", "semantic_model"].includes(String(item.operation))
    || !["reserved", "not_sent", "completed", "timed_out", "cancelled", "failed", "unknown_possible_billable"].includes(String(item.completionState))
    || item.logicalAttempt !== 1 || item.retryCount !== 0 || ![0, 1].includes(item.actualSendCount)
    || item.reservationId.length === 0 || item.operationId.length === 0 || (item.actualSendCount === 0) !== (item.sendState === "not_sent")
    || !Number.isSafeInteger(item.elapsedMs) || item.elapsedMs < 0 || (item.outputTokens !== null && (!Number.isSafeInteger(item.outputTokens) || item.outputTokens < 0))
    || (item.providerRequestCount !== null && (!Number.isSafeInteger(item.providerRequestCount) || item.providerRequestCount < 0))
    || (item.usageCostUsd !== null && (!Number.isFinite(item.usageCostUsd) || item.usageCostUsd < 0))
    || (item.httpStatus !== null && (!Number.isSafeInteger(item.httpStatus) || item.httpStatus < 100 || item.httpStatus > 599))
    || ![item.localRequestId, item.providerRequestId, item.providerResponseId].every((value) => value === null || isSafeStructuredString(value))
    || ![item.requestedModelIdentifier, item.returnedModelIdentifier].every((value) => value === null || safeProviderModel(value))
    || (item.finishReason !== null && !isSafeStructuredString(item.finishReason))
    || (item.toolExecutionState !== null && !["verified", "unverified", "not_executed"].includes(String(item.toolExecutionState)))
    || [item.annotationCount, item.normalizedCandidateCount].some((value) => value !== null && (!Number.isSafeInteger(value) || value < 0))
    || ![item.providerErrorType, item.providerErrorCode, item.providerErrorParam].every((value) => value === null || isSafeProviderDiagnostic(value))
    || !["not_applicable", "not_reached", "passed", "failed"].includes(String(item.structuredOutputValidation))
    || !["known", "unknown_possible_billable"].includes(String(item.usageState))
    || (item.usageState === "unknown_possible_billable" && item.actualSendCount !== 1))) issues.push("rg_internal_audit_one_attempt_invariant_failed");
  if (new Set(audit.providerOperationReceipts.map((item) => item.receiptId)).size !== audit.providerOperationReceipts.length
    || new Set(audit.verificationOutcomes.map((item) => item.supportId)).size !== audit.verificationOutcomes.length
    || new Set(audit.rfEntryRefs).size !== audit.rfEntryRefs.length) issues.push("rg_internal_audit_duplicate_identity");
  if (audit.verificationOutcomes.some((item) => ![item.supportId, item.questionId, item.candidateId, item.documentId, item.locatorId].every(isSafeStructuredString))) {
    issues.push("rg_internal_audit_verification_identity_invalid");
  }
  const reservations = new Map(audit.budget.reservations.map((item) => [item.reservationId, item]));
  const expectedDimensions = { search: "search_calls", retrieval: "retrieval_documents", investigative_model: "investigative_ai_calls",
    semantic_model: "semantic_verification_calls" } as const;
  if (audit.providerOperationReceipts.some((receipt) => {
    const reservation = reservations.get(receipt.reservationId);
    return !reservation || reservation.operationId !== receipt.operationId || reservation.dimension !== expectedDimensions[receipt.operation]
      || (receipt.completionState === "completed" && reservation.state !== "completed")
      || (receipt.completionState === "timed_out" && reservation.state !== "timeout")
      || (receipt.completionState === "failed" && reservation.state !== "failed")
      || (receipt.completionState === "cancelled" && reservation.state !== "failed")
      || (receipt.completionState === "not_sent" && !["failed", "released"].includes(reservation.state));
  })) issues.push("rg_internal_audit_receipt_reservation_binding_invalid");
  return [...new Set(issues)].sort();
}

function containsPrivateProviderMaterial(value: string): boolean {
  return /(?:raw prompt|raw response|chain.of.thought|\/Users\/|[A-Za-z]:\\|\.pdf\b|\b(?:MID|merchant number|account number)\b)/i.test(value);
}

function safeHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username.length === 0 && url.password.length === 0;
  } catch { return false; }
}

function safeReasonCodeArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((code) => typeof code === "string"
    && /^[a-z][a-z0-9_]*(?::[a-z][a-z0-9_]*)?$/.test(code)) && new Set(value).size === value.length;
}

function arraysOfSafeIds(...values: unknown[]): boolean { return values.every((value) => Array.isArray(value) && value.every(isSafeStructuredString) && new Set(value).size === value.length); }
function safeStringArray(value: unknown): boolean { return Array.isArray(value) && value.every(isSafeStructuredString) && new Set(value).size === value.length; }
function safeDisplayText(value: unknown, maximumLength: number): value is string { return typeof value === "string" && value.length <= maximumLength && !/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value); }
function safeProviderModel(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:\/-]{0,255}$/.test(value); }
function isSafeProviderDiagnostic(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:\[\]-]{0,127}$/.test(value); }
function safeNullableMoney(value: unknown): boolean { return value === null || (Number.isSafeInteger(value) && Number(value) >= 0); }
function validFindingValue(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "identity") return hasExactKeys(value, ["kind", "canonicalCode"]) && isSafeStructuredString(value.canonicalCode);
  if (value.kind === "mapping") return hasExactKeys(value, ["kind", "canonicalCode", "sourceCode"])
    && isSafeStructuredString(value.canonicalCode) && isSafeStructuredString(value.sourceCode);
  if (value.kind === "term") return hasExactKeys(value, ["kind", "termCode", "termValue"]) && isSafeStructuredString(value.termCode) && isSafeStructuredString(value.termValue);
  if (value.kind === "rule") return hasExactKeys(value, ["kind", "ruleCode", "outcomeCode"]) && isSafeStructuredString(value.ruleCode) && isSafeStructuredString(value.outcomeCode);
  if (value.kind === "boolean") return hasExactKeys(value, ["kind", "value"]) && typeof value.value === "boolean";
  if (value.kind === "threshold") return hasExactKeys(value, ["kind", "numeratorCode", "denominatorCode", "thresholdBasisPoints"])
    && isSafeStructuredString(value.numeratorCode) && isSafeStructuredString(value.denominatorCode) && Number.isSafeInteger(value.thresholdBasisPoints);
  if (value.kind === "rate") return hasExactKeys(value, ["kind", "basisCode", "rateBasisPoints", "fixedAmountMinor", "currency"])
    && ["percent_of_volume", "per_item", "per_auth", "flat_monthly", "variable"].includes(String(value.basisCode))
    && [value.rateBasisPoints, value.fixedAmountMinor].every((item) => item === null || (Number.isSafeInteger(item) && Number(item) >= 0))
    && (value.currency === null || isSafeStructuredString(value.currency));
  if (value.kind === "role") return hasExactKeys(value, ["kind", "participantRole", "controlDimension", "state"])
    && (value.participantRole === null || isSafeStructuredString(value.participantRole)) && isSafeStructuredString(value.controlDimension)
    && ["proven", "unresolved", "conflicting", "unavailable", "not_applicable"].includes(String(value.state));
  return false;
}
function isValidIsoTimestamp(value: unknown): boolean { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)); }
