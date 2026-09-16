import { createHash } from "node:crypto";
import type { BoundedIntelligenceRuntimeResult, PublicSourceAuthorityAdmission, RuntimeResearchQuestion, SemanticVerificationStatus } from "../intelligence/intelligenceTypes.js";
import type { KnowledgeEntry, KnowledgeClaimValue } from "../knowledge/knowledgeTypes.js";
import type { CanonicalEconomicsV2Foundation, CanonicalEconomicsV2Fact } from "../types.js";
import type {
  InternalFindingV1,
  InternalImpactV1,
  InternalRecommendationV1,
  InternalResearchQuestionOutcomeV1,
  InternalStatementAnalysisV1,
  InvestigationQuestionOriginV1,
  PublicSourceEvidenceManifestV1,
} from "./internalAnalysisTypes.js";
import { E2E_INTERNAL_ANALYSIS_AMENDMENT_ID, E2E_LIVE_RESEARCH_OUTCOME_AMENDMENT_ID } from "./internalAnalysisTypes.js";

export function buildInternalStatementAnalysisV1(input: {
  safeStatementId: string;
  runId: string;
  evaluatedAt: string;
  foundation: CanonicalEconomicsV2Foundation;
  origins: InvestigationQuestionOriginV1[];
  admittedKnowledge: KnowledgeEntry[];
  runtime: BoundedIntelligenceRuntimeResult;
  publicEvidence: PublicSourceEvidenceManifestV1;
  publicSourceAuthorityAdmissions: PublicSourceAuthorityAdmission[];
  canonicalBeforeHash: string;
  canonicalAfterHash: string;
}): InternalStatementAnalysisV1 {
  const canonicalFacts = canonicalFindings(input.foundation);
  const usedKnowledgeRefs = new Set(input.runtime.questions.flatMap((question) => [
    ...question.rfResolution.selectedEntryRefs, ...question.rfResolution.corroboratingEntryRefs,
  ]));
  const admittedKnowledge = input.admittedKnowledge.filter((entry) => usedKnowledgeRefs.has(entry.id)).map((entry): InternalFindingV1 => ({
    findingId: `finding-rf-${digest(entry.id)}`, kind: "admitted_knowledge", title: `Admitted RF knowledge resolves ${entry.subjectCode}.`,
    displayValue: describeValue(entry.value), statementEvidenceRefs: [], knowledgeRefs: [entry.id], researchEvidenceRefs: [], questionOriginRefs: [],
    proposedValue: entry.value, authority: "rf_admitted", supportStatus: "rf_resolved", scopeAndPeriod: `${entry.effectiveFrom ?? "unbounded"}..${entry.effectiveTo ?? "open"}`,
    limitations: [...entry.limitations], canonicalMutationAllowed: false,
  }));
  const evidenceByQuestion = new Map(input.runtime.questions.map((question) => [question.questionId,
    input.publicEvidence.entries.filter((entry) => entry.questionId === question.questionId)]));
  const originByUnknown = new Map(input.origins.map((origin) => [origin.unknownRef, origin]));
  const researchQuestionOutcomes = input.runtime.questions.filter((question) => question.selection === "selected").map((question) =>
    researchQuestionOutcome(question, input.runtime, originByUnknown, input.publicSourceAuthorityAdmissions));
  const supportedResearchFindings: InternalFindingV1[] = [];
  const investigativeHypotheses: InternalFindingV1[] = [];
  const contradictions: InternalFindingV1[] = [];
  for (const support of input.runtime.supports) {
    const question = input.runtime.questions.find((item) => item.questionId === support.questionId);
    const origin = question ? originByUnknown.get(question.originatingUnknownRef) : undefined;
    if (!question || !origin) continue;
    const common = {
      displayValue: describeResearchValue(support.proposedValue), statementEvidenceRefs: [...origin.evidenceRefs], knowledgeRefs: [],
      researchEvidenceRefs: (evidenceByQuestion.get(question.questionId) ?? []).filter((entry) => entry.semanticVerification === support.verificationStatus)
        .map((entry) => entry.evidenceId),
      questionOriginRefs: [origin.originId], proposedValue: support.proposedValue,
      scopeAndPeriod: `${question.asOf}:${String(question.scope.processorProgram ?? "program_unresolved")}:${origin.safeResearchLabel}`,
      limitations: [...new Set([...support.limitationCodes, "public_source_does_not_establish_account_applicability", "verified_public_scope_must_be_preserved"])], canonicalMutationAllowed: false as const,
    };
    if (support.verificationStatus === "supported_candidate") supportedResearchFindings.push({
      findingId: `finding-supported-${digest(support.supportId)}`, kind: "supported_research_finding",
      title: `Eligible public evidence supports a bounded terminology finding for ${origin.safeResearchLabel}.`, authority: "verified_public_candidate",
      supportStatus: support.verificationStatus, ...common,
    });
    else if (support.verificationStatus === "contradicted") contradictions.push({
      findingId: `finding-contradiction-${digest(support.supportId)}`, kind: "contradiction",
      title: `Public evidence contradicts the proposed interpretation for ${origin.safeResearchLabel}.`, authority: "investigative_only",
      supportStatus: support.verificationStatus, ...common,
    });
    else if (support.verificationStatus === "partially_supported") investigativeHypotheses.push({
      findingId: `finding-hypothesis-${digest(support.supportId)}`, kind: "investigative_hypothesis",
      title: `Public evidence only partially supports an interpretation for ${origin.safeResearchLabel}.`, authority: "investigative_only",
      supportStatus: support.verificationStatus, ...common,
    });
  }
  const unresolvedQuestions = input.runtime.questions.filter((question) => (question.selection === "selected" || question.eligibility === "unresolved_review_required")
    && !input.runtime.supports.some((support) => support.questionId === question.questionId && support.verificationStatus === "supported_candidate"))
    .map((question): InternalFindingV1 => {
      const origin = originByUnknown.get(question.originatingUnknownRef)!;
      const statuses = input.runtime.supports.filter((support) => support.questionId === question.questionId).map((support) => support.verificationStatus);
      const rfConflict = question.rfResolution.status === "unresolved_conflict";
      const researchOutcome = researchQuestionOutcomes.find((outcome) => outcome.questionId === question.questionId);
      const operationalLimitations = researchOutcome?.outcome === "research_unavailable_due_to_timeout"
        ? ["public_research_attempted", "public_research_provider_timed_out", "no_conclusion_about_public_source_availability"]
        : researchOutcome?.outcome === "search_tool_execution_unverified"
          ? ["public_search_tool_execution_unverified", "no_conclusion_about_public_source_availability"]
        : researchOutcome?.outcome === "no_eligible_public_evidence_found"
          ? ["public_discovery_completed_without_candidates", "no_public_evidence_produced"]
          : researchOutcome?.outcome === "source_rejected_by_authority_policy"
            ? ["discovery_candidates_rejected_by_committed_authority_policy", "no_admissible_public_evidence_produced"]
            : researchOutcome?.outcome === "provider_failure" ? ["public_research_provider_failed"] : [];
      return { findingId: `finding-unresolved-${digest(question.questionId)}`, kind: "unresolved_question",
        title: rfConflict ? `Admitted knowledge conflicts for ${origin.safeResearchLabel}; research was not permitted to choose a winner.` : origin.questionText,
        displayValue: null, statementEvidenceRefs: [...origin.evidenceRefs], knowledgeRefs: question.rfResolution.selectedEntryRefs,
        researchEvidenceRefs: (evidenceByQuestion.get(question.questionId) ?? []).map((entry) => entry.evidenceId), questionOriginRefs: [origin.originId],
        proposedValue: null, authority: "unresolved", supportStatus: strongestStatus(statuses), scopeAndPeriod: question.asOf,
        limitations: [...new Set([...question.limitations, ...operationalLimitations, ...(rfConflict ? ["rf_conflict_preserved_no_ai_arbitration"] : []), "account_specific_documentation_required_if_public_evidence_is_insufficient"])], canonicalMutationAllowed: false };
    });
  const allFindings = [...canonicalFacts, ...admittedKnowledge, ...supportedResearchFindings, ...investigativeHypotheses, ...contradictions, ...unresolvedQuestions];
  const recommendations = buildRecommendations(supportedResearchFindings, investigativeHypotheses, unresolvedQuestions,
    researchQuestionOutcomes, new Map(input.origins.map((origin) => [origin.originId, origin])));
  const impact = input.origins.map((origin): InternalImpactV1 => ({ impactId: `impact-${digest(origin.originId)}`,
    observationRef: origin.originId, state: "observed_cost", amountMinor: origin.observedAmountMinor, maximumAmountMinor: null, currency: "USD",
    annualized: false, counterfactualRef: null, limitations: ["observed_statement_cost_not_savings", "recurrence_not_proven"] }));
  void allFindings;
  const unresolved = unresolvedQuestions.length > 0 || investigativeHypotheses.length > 0 || input.runtime.unresolvedOutcomeCodes.length > 0;
  return {
    schemaVersion: "internal_statement_analysis_v1", audience: "internal_analyst_only", authority: "shadow_non_authoritative",
    amendmentIds: [E2E_INTERNAL_ANALYSIS_AMENDMENT_ID, E2E_LIVE_RESEARCH_OUTCOME_AMENDMENT_ID], safeStatementId: input.safeStatementId, runId: input.runId, evaluatedAt: input.evaluatedAt,
    executionStatus: "completed", researchOutcome: overallResearchOutcome(researchQuestionOutcomes), researchQuestionOutcomes,
    terminalStatus: internalAnalysisTerminalStatus(input.runtime, unresolved),
    canonicalBeforeHash: input.canonicalBeforeHash, canonicalAfterHash: input.canonicalAfterHash,
    canonicalTruthPreserved: input.canonicalBeforeHash === input.canonicalAfterHash && input.runtime.canonicalTruthPreserved,
    canonicalFacts,
    statementObservations: input.origins.map((origin) => ({ observationId: origin.originId, questionClass: origin.questionClass,
      label: origin.safeResearchLabel, occurrenceRefs: [...origin.occurrenceRefs], evidenceRefs: [...origin.evidenceRefs],
      observedAmountMinor: origin.observedAmountMinor, currency: "USD", authority: "statement_observation",
      limitations: ["not_canonical_economic_classification", "ownership_control_and_savings_unresolved"] })),
    admittedKnowledge, supportedResearchFindings, investigativeHypotheses, contradictions, unresolvedQuestions,
    recommendations, impact,
    limitations: ["processor_statement_completeness_not_proven", "research_findings_are_noncanonical", "no_annualization_without_canonical_recurrence"],
  };
}

export function internalAnalysisTerminalStatus(runtime: BoundedIntelligenceRuntimeResult, unresolved: boolean): InternalStatementAnalysisV1["terminalStatus"] {
  if (!runtime.canonicalTruthPreserved) return "blocked_fatal_deterministic_failure";
  const providerUnavailable = runtime.terminalStatus === "disabled_no_provider"
    || Object.values(runtime.diagnostics.stageStatuses).some((status) => status === "provider_unavailable" || status === "disabled_no_provider");
  if (providerUnavailable) return "provider_unavailable";
  const researchUnavailable = runtime.terminalStatus === "invalid" || runtime.searchAttempts.some((attempt) => attempt.status === "failed" || attempt.status === "timeout")
    || Object.values(runtime.diagnostics.stageStatuses).some((status) => status === "timeout" || status === "malformed_output")
    || runtime.diagnostics.reasonCodes.some((code) => /(?:malformed|provider|search_timeout|retrieval_timeout|identity_rejected|structured)/.test(code));
  if (researchUnavailable) return "research_unavailable";
  return runtime.terminalStatus === "completed" && !unresolved ? "completed" : "completed_with_unresolved";
}

function canonicalFindings(foundation: CanonicalEconomicsV2Foundation): InternalFindingV1[] {
  const facts: Array<[string, string, CanonicalEconomicsV2Fact<any, any>]> = [
    ["net_submitted_volume", "Canonical net submitted card volume", foundation.financialPopulations.canonicalNetSubmittedCardVolume],
    ["gross_sale_volume", "Gross sale volume", foundation.financialPopulations.grossSaleVolume],
    ["refund_volume", "Refund volume", foundation.financialPopulations.refundVolume],
    ["processing_fees", "Statement processing fees", foundation.financialPopulations.totalStatementProcessingFees],
    ["gross_sale_count", "Gross sale transaction count", foundation.financialPopulations.grossSaleTransactionCount],
  ];
  return facts.filter(([, , fact]) => fact.status === "available" && fact.value !== null).map(([code, title, fact]) => ({
    findingId: `finding-canonical-${code}`, kind: "canonical_fact" as const, title, displayValue: JSON.stringify(fact.value),
    statementEvidenceRefs: [...fact.evidenceRefs], knowledgeRefs: [], researchEvidenceRefs: [], questionOriginRefs: [], proposedValue: null,
    authority: "canonical_deterministic" as const, supportStatus: "not_applicable" as const,
    scopeAndPeriod: foundation.identity.statementPeriod ? `${foundation.identity.statementPeriod.start}..${foundation.identity.statementPeriod.end}` : "period_unavailable",
    limitations: [...fact.limitations], canonicalMutationAllowed: false as const,
  }));
}

function buildRecommendations(supported: InternalFindingV1[], hypotheses: InternalFindingV1[], unresolved: InternalFindingV1[],
  outcomes: InternalResearchQuestionOutcomeV1[], origins: Map<string, InvestigationQuestionOriginV1>): InternalRecommendationV1[] {
  const timedOutResearchFollowups = unresolved.flatMap((finding): InternalRecommendationV1[] => {
    const outcome = outcomes.find((item) => finding.findingId === `finding-unresolved-${digest(item.questionId)}`);
    if (!outcome || outcome.outcome !== "research_unavailable_due_to_timeout" || !outcome.publicResearchStillPossible) return [];
    return [{ recommendationId: `recommendation-research-timeout-${digest(finding.findingId)}`, kind: "research_followup",
      title: "Repeat bounded public-source discovery; the prior provider search timed out before source availability could be assessed.",
      findingRefs: [finding.findingId], evidenceRefs: [...finding.researchEvidenceRefs], actionabilityCeiling: "verification_only",
      merchantControl: "unresolved", limitations: ["prior_search_timeout_not_evidence_of_source_absence", "committed_authority_policy_remains_required"] }];
  });
  return [
    ...supported.map((finding): InternalRecommendationV1 => ({ recommendationId: `recommendation-verify-${digest(finding.findingId)}`,
      kind: "verification_action", title: "Verify whether the public terminology applies to this merchant account and contract period.",
      findingRefs: [finding.findingId], evidenceRefs: [...finding.researchEvidenceRefs], actionabilityCeiling: "verification_only",
      merchantControl: "unresolved", limitations: ["public_definition_does_not_prove_account_applicability_or_removability"] })),
    ...hypotheses.map((finding): InternalRecommendationV1 => ({ recommendationId: `recommendation-research-${digest(finding.findingId)}`,
      kind: "research_followup", title: "Obtain a more claim-specific official publication or account documentation.", findingRefs: [finding.findingId],
      evidenceRefs: [...finding.researchEvidenceRefs], actionabilityCeiling: "verification_only", merchantControl: "unresolved",
      limitations: ["partial_public_support_is_not_action_authority"] })),
    ...unresolved.map((finding): InternalRecommendationV1 => ({ recommendationId: `recommendation-document-${digest(finding.findingId)}`,
      kind: "documentation_request", title: documentationRequestTitle(finding, origins), findingRefs: [finding.findingId],
      evidenceRefs: [...finding.statementEvidenceRefs, ...finding.researchEvidenceRefs], actionabilityCeiling: "documentation_only", merchantControl: "unresolved",
      limitations: ["no_economic_action_until_account_specific_evidence_is_reviewed"] })),
    ...timedOutResearchFollowups,
  ];
}

function documentationRequestTitle(finding: InternalFindingV1, origins: Map<string, InvestigationQuestionOriginV1>): string {
  const origin = finding.questionOriginRefs.map((ref) => origins.get(ref)).find((item) => item !== undefined);
  if (!origin) return "Request the applicable merchant agreement, fee schedule, contractual citation, calculation basis, effective period, account applicability, and any needed processor explanation.";
  const label = origin.safeResearchLabel.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  const observed = origin.observedAmountMinor === null ? label : `${formatUsd(origin.observedAmountMinor)} ${label}`;
  return `Request the merchant agreement or fee schedule for the observed ${observed} and document its contractual citation, calculation basis or fee formula, effective date or period, and applicability to this merchant account; obtain a processor explanation if those documents are insufficient.`;
}

function formatUsd(amountMinor: number): string {
  return `$${(amountMinor / 100).toFixed(2)}`;
}

function researchQuestionOutcome(question: RuntimeResearchQuestion, runtime: BoundedIntelligenceRuntimeResult,
  origins: Map<string, InvestigationQuestionOriginV1>, admissions: PublicSourceAuthorityAdmission[]): InternalResearchQuestionOutcomeV1 {
  const origin = origins.get(question.originatingUnknownRef);
  if (!origin) throw new Error("internal_analysis_question_origin_missing");
  const attempts = runtime.searchAttempts.filter((attempt) => attempt.questionId === question.questionId);
  const reasonCodes = [...new Set(attempts.flatMap((attempt) => attempt.reasonCodes))];
  const supports = runtime.supports.filter((support) => support.questionId === question.questionId);
  const retainedCandidateCount = runtime.candidates.filter((candidate) => candidate.questionId === question.questionId).length;
  const publicResearchStillPossible = admissions.some((admission) => admission.allowedSubjectCodes.includes(question.subjectCode)
    && (admission.allowedProcessorPrograms.length === 0 || (typeof question.scope.processorProgram === "string"
      && admission.allowedProcessorPrograms.includes(question.scope.processorProgram))));
  const outcome: InternalResearchQuestionOutcomeV1["outcome"] = supports.some((support) => support.verificationStatus === "supported_candidate")
    ? "research_completed"
    : attempts.some((attempt) => attempt.status === "timeout") ? "research_unavailable_due_to_timeout"
      : reasonCodes.some((code) => ["search_tool_execution_unverified", "search_tool_not_executed"].includes(code)) ? "search_tool_execution_unverified"
      : attempts.some((attempt) => ["failed", "disabled", "budget_exhausted"].includes(attempt.status)) ? "provider_failure"
        : reasonCodes.includes("all_discovery_candidates_rejected_by_authority") ? "source_rejected_by_authority_policy"
          : reasonCodes.includes("provider_search_completed_zero_candidates") ? "no_eligible_public_evidence_found"
            : "completed_with_unresolved_evidence";
  return { questionId: question.questionId, questionClass: origin.questionClass, subjectCode: origin.subjectCode, outcome,
    attempted: retainedCandidateCount > 0 || attempts.some((attempt) => attempt.status !== "disabled"), operationalReasonCodes: reasonCodes,
    retainedCandidateCount, publicResearchStillPossible };
}

function overallResearchOutcome(outcomes: InternalResearchQuestionOutcomeV1[]): InternalStatementAnalysisV1["researchOutcome"] {
  if (outcomes.length > 0 && outcomes.every((outcome) => outcome.outcome === "research_completed")) return "research_completed";
  for (const outcome of ["research_unavailable_due_to_timeout", "search_tool_execution_unverified", "provider_failure", "source_rejected_by_authority_policy", "no_eligible_public_evidence_found"] as const) {
    if (outcomes.some((item) => item.outcome === outcome)) return outcome;
  }
  return "completed_with_unresolved_evidence";
}

function describeValue(value: KnowledgeClaimValue): string { return JSON.stringify(value); }
function describeResearchValue(value: KnowledgeClaimValue): string {
  if (value.kind !== "term") return "Public evidence produced a bounded candidate interpretation; account applicability remains unproven.";
  const descriptions: Record<string, string> = {
    official_definition_found: "Eligible public documentation defines the registered term; account applicability remains unproven.",
    scope_limited: "Eligible public documentation is limited to a different or narrower public scope; account applicability is unproven.",
    account_document_required: "Public documentation cannot establish account applicability; account-specific documentation is required.",
    unresolved: "Public documentation did not resolve the registered terminology question.",
  };
  return descriptions[value.termValue] ?? "Public terminology remained unresolved.";
}
function strongestStatus(values: SemanticVerificationStatus[]): SemanticVerificationStatus {
  const order: SemanticVerificationStatus[] = ["contradicted", "wrong_authority", "wrong_scope", "wrong_period", "locator_unproven", "partially_supported", "unsupported", "malformed", "verification_unavailable", "supported_candidate"];
  return order.find((value) => values.includes(value)) ?? "verification_unavailable";
}
function digest(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 20); }
