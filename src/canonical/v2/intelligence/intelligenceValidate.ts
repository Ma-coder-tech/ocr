import { validateKnowledgeCandidatePacket } from "../knowledge/knowledgeAdapters.js";
import { containsPrivateLocatorOrPayload, isSafeStructuredString } from "../knowledge/knowledgeSafety.js";
import { validateRgFreeV1Budget } from "./budgetLedger.js";
import { RG_SEMANTIC_AMENDMENT_IDS } from "./intelligenceTypes.js";
import type { BoundedIntelligenceRuntimeResult, IntelligenceDiagnostic, RgFreeV1BudgetProfile } from "./intelligenceTypes.js";

export function validateBoundedIntelligenceRuntimeResult(
  result: BoundedIntelligenceRuntimeResult,
  profile: RgFreeV1BudgetProfile,
): string[] {
  const issues = validateRgFreeV1Budget(profile);
  if (result.schemaVersion !== "canonical_intelligence_v2_runtime_v1" || result.profile !== "RG-FREE-v1") issues.push("invalid_intelligence_manifest");
  if (result.authority !== "shadow_non_authoritative" || result.persistence !== "none" || result.providerExecution !== "injected_only") issues.push("invalid_intelligence_authority_boundary");
  if (!result.canonicalTruthPreserved) issues.push("canonical_truth_not_preserved");
  if (!result.rfConflictsPreserved) issues.push("rf_conflict_not_preserved");
  if (result.automaticAdmissionCount !== 0) issues.push("automatic_knowledge_admission_forbidden");
  if (result.questions.filter((question) => question.selection === "selected").length > profile.maxSelectedQuestions) issues.push("selected_question_limit_exceeded");
  if (result.searchAttempts.length > profile.maxSearchCalls) issues.push("search_call_limit_exceeded");
  if (result.candidates.length > profile.maxCandidatesTotal) issues.push("candidate_limit_exceeded");
  if (result.documents.length > profile.maxRetrievalDocuments) issues.push("document_limit_exceeded");
  if (result.budget.consumed.retrieval_bytes > profile.maxRetrievalBytesTotal) issues.push("retrieval_byte_limit_exceeded");
  if (result.budget.consumed.model_output_tokens > profile.maxModelOutputTokensTotal) issues.push("model_output_limit_exceeded");
  for (const packet of result.candidatePackets) issues.push(...validateKnowledgeCandidatePacket(packet));
  if (result.candidatePackets.some((packet) => packet.provenance.adapter !== "bounded_intelligence_runtime"
    || packet.lifecycle !== "candidate" || !packet.requiresHumanAdmission || packet.proposedVisibility !== "account_private")) {
    issues.push("invalid_bounded_intelligence_candidate_ingress");
  }
  if (result.semanticAmendments.length !== RG_SEMANTIC_AMENDMENT_IDS.length
    || RG_SEMANTIC_AMENDMENT_IDS.some((id) => !result.semanticAmendments.includes(id))) issues.push("rg_semantic_amendment_manifest_incomplete");
  const itemIds = result.supports.map((support) => support.itemId);
  if (new Set(itemIds).size !== itemIds.length) issues.push("semantic_support_identity_duplicate");
  const supportIds = result.supports.map((support) => support.supportId);
  if (new Set(supportIds).size !== supportIds.length) issues.push("semantic_support_id_duplicate");
  if (result.languageCandidates.some((item) => item.customerVisible || item.reportPermission !== "none" || item.authority !== "non_authoritative_candidate")) {
    issues.push("language_candidate_authority_violation");
  }
  return [...new Set(issues)];
}

export function intelligenceDiagnosticsContainPrivatePayload(
  diagnostics: IntelligenceDiagnostic,
  prohibitedValues: readonly string[] = [],
): boolean {
  const serialized = JSON.stringify(diagnostics);
  if (prohibitedValues.some((value) => value.length > 0 && serialized.includes(value))) return true;
  if (/https?:\/\/|(?:^|["'])\/(?:Users|private|var|tmp)\/|[a-f0-9]{32,}|api[_-]?key|credential|password|rawPrompt|rawResponse/i.test(serialized)) return true;
  return diagnostics.providerCodes.some((code) => !isSafeStructuredString(code) || containsPrivateLocatorOrPayload(code))
    || diagnostics.modelCodes.some((code) => !isSafeStructuredString(code) || containsPrivateLocatorOrPayload(code));
}
