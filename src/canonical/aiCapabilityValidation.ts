import { evaluateAiCapabilityGrounding } from "./aiGroundingGateway.js";
import { determineAiCapabilityNeeds } from "./aiCapabilityPolicy.js";
import {
  AI_MATERIALITY_POLICY_VERSION,
  AI_PRIVACY_RETENTION_POLICY_VERSION,
  AI_READINESS_DEGRADATION_POLICY_VERSION,
  CANONICAL_RUNTIME_SAFETY_REVIEW_POLICY_VERSION,
  CANONICAL_AI_CAPABILITIES,
  CANONICAL_AI_CAPABILITY_BOUNDARY_POLICY_VERSION,
  DETERMINISTIC_EXPLANATION_POLICY_VERSION,
  combineFinancialReadiness,
  isSuccessfulAiCapabilityStatus,
} from "./aiCapabilityTypes.js";
import {
  CANONICAL_RUNTIME_SAFETY_REVIEW_CHECK_IDS,
  reconstructDeterministicRuntimeSafetyChecks,
} from "./deterministicRuntimeSafetyReview.js";
import type { CanonicalAiCapabilityLayer, CanonicalStatementAnalysis } from "./types.js";

const SUPPORTED_AI_CAPABILITY_STATUSES = [
  "completed",
  "completed_diagnostic",
  "not_needed",
  "disabled",
  "failed",
  "timed_out",
  "safety_blocked",
  "rejected",
] as const;

export function validateCanonicalAiCapabilityLayer(analysis: CanonicalStatementAnalysis, errors: string[]): void {
  const layer = analysis.aiCapabilities;
  if (!layer || layer.policyVersion !== CANONICAL_AI_CAPABILITY_BOUNDARY_POLICY_VERSION) {
    errors.push("Package F canonical AI capability boundary is missing or unsupported.");
    return;
  }
  if (layer.materialityPolicyVersion !== AI_MATERIALITY_POLICY_VERSION) errors.push("Package F materiality policy version is missing or unsupported.");
  if (layer.readinessPolicyVersion !== AI_READINESS_DEGRADATION_POLICY_VERSION) errors.push("Package F readiness degradation policy version is missing or unsupported.");
  if (layer.privacyRetentionPolicyVersion !== AI_PRIVACY_RETENTION_POLICY_VERSION) errors.push("Package F privacy retention policy version is missing or unsupported.");
  if (layer.deterministicExplanationPolicyVersion !== DETERMINISTIC_EXPLANATION_POLICY_VERSION) errors.push("Package F deterministic explanation policy version is missing or unsupported.");
  if (layer.deterministicRuntimeSafetyReviewPolicyVersion !== CANONICAL_RUNTIME_SAFETY_REVIEW_POLICY_VERSION) {
    errors.push("Package F deterministic runtime safety review policy version is missing or unsupported.");
  }
  if ("internalDiagnostics" in (layer as unknown as Record<string, unknown>)) errors.push("Package F internal diagnostic records must not be attached to CanonicalStatementAnalysis.");
  validateRuntimeSafetyReview(analysis, evidenceIdsFromAnalysis(analysis), calculationIdsFromAnalysis(analysis), errors);

  const recordIds = new Set<string>();
  const capabilityIds = new Set(layer.capabilities.map((capability) => capability.capability));
  const evidenceText = analysis.evidence.map(
    (record) => `${record.id}\u0000${record.extractedText ?? ""} ${record.normalizedText ?? ""} ${record.customerSafe.excerpt ?? ""} ${record.sourceRole}`,
  );
  const expectedNeeds = new Map(
    determineAiCapabilityNeeds({
      identity: analysis.identity,
      businessQualification: analysis.businessQualification,
      feeLedger: analysis.feeLedger,
      feeOwnershipActionability: analysis.feeOwnershipActionability,
      opportunityEngine: analysis.opportunityEngine,
      evidenceText,
    }).map((need) => [need.capability, need]),
  );
  for (const capability of CANONICAL_AI_CAPABILITIES) {
    if (!capabilityIds.has(capability)) errors.push(`Package F capability ${capability} is missing.`);
  }
  if (capabilityIds.size !== layer.capabilities.length) errors.push("Package F contains duplicate capability records.");
  const evidenceIds = new Set(analysis.evidence.map((item) => item.id));
  const calculationIds = new Set(analysis.calculations.map((item) => item.id));

  for (const capability of layer.capabilities) {
    if (recordIds.has(capability.id)) errors.push(`Package F duplicate capability record id ${capability.id}.`);
    recordIds.add(capability.id);
    if (!(CANONICAL_AI_CAPABILITIES as readonly string[]).includes(capability.capability)) errors.push(`Package F capability ${String(capability.capability)} is unsupported.`);
    if (!(SUPPORTED_AI_CAPABILITY_STATUSES as readonly string[]).includes(capability.status)) errors.push(`Package F capability ${capability.id} has unsupported status ${String(capability.status)}.`);
    if (capability.policyVersion !== CANONICAL_AI_CAPABILITY_BOUNDARY_POLICY_VERSION) errors.push(`Package F capability ${capability.id} has unsupported policy version.`);
    const expectedNeed = expectedNeeds.get(capability.capability);
    if (expectedNeed) {
      if (capability.required !== expectedNeed.required) errors.push(`Package F capability ${capability.id} has incorrect required flag.`);
      if (capability.trigger.present !== expectedNeed.trigger.present) errors.push(`Package F capability ${capability.id} has incorrect trigger presence.`);
      if (capability.status === "not_needed" && expectedNeed.trigger.present && !validDeterministicAnomalySubstitution(layer, capability)) {
        errors.push(`Package F capability ${capability.id} is not_needed when trigger evidence is present.`);
      }
    }
    if (capability.status === "not_needed" && capability.trigger.absenceProof === null) errors.push(`Package F capability ${capability.id} is not_needed without absence proof.`);
    if (capability.status === "not_needed" && capability.output) errors.push(`Package F capability ${capability.id} is not_needed with output.`);
    if (capability.status === "completed_diagnostic" && capability.output) {
      errors.push(`Package F capability ${capability.id} has diagnostic status carrying customer-safe output.`);
    }
    if (capability.executionRef && !/^ai_exec_[a-z0-9]{8,64}$/.test(capability.executionRef)) errors.push(`Package F capability ${capability.id} has malformed or non-opaque executionRef.`);
    for (const independentReviewRef of capability.independentReviewRefs) {
      if (!evidenceIds.has(independentReviewRef) && !calculationIds.has(independentReviewRef)) errors.push(`Package F capability ${capability.id} has broken independent-review reference ${independentReviewRef}.`);
    }
    if (capability.status === "completed" && !capability.output) errors.push(`Package F capability ${capability.id} completed without valid typed output.`);
    if (capability.output && capability.output.type !== capability.capability) errors.push(`Package F capability ${capability.id} output type does not match capability.`);
    if (["disabled", "failed", "timed_out", "safety_blocked"].includes(capability.status) && capability.output) {
      errors.push(`Package F capability ${capability.id} has unsuccessful status carrying output.`);
    }
    if (capability.output) {
      const grounding = evaluateAiCapabilityGrounding(capability.output, analysis);
      if (grounding.status !== "grounded") errors.push(...grounding.errors);
      if (capability.groundingStatus !== grounding.status) errors.push(`Package F capability ${capability.id} has inconsistent grounding status.`);
    }
    if (containsProviderLeak(capability)) errors.push(`Package F capability ${capability.id} leaks provider-specific details into canonical capability output.`);
  }

  const expectedFinancialReadiness = combineFinancialReadiness(
    layer.capabilities.map((capability) =>
      capability.required && !isSuccessfulAiCapabilityStatus(capability.status) ? capability.financialReadinessOnFailure : "ready",
    ),
  );
  if (layer.summary.financialReadiness !== expectedFinancialReadiness) {
    errors.push("Package F financialReadiness does not match required capability degradation.");
  }
  if (layer.summary.explanationReadiness === "ai_enhanced" && layer.summary.explanationSource !== "accepted_ai_narrative") {
    errors.push("Package F explanation is marked AI-enhanced without an accepted AI narrative source.");
  }
  if (layer.summary.explanationReadiness === "deterministic_fallback" && layer.summary.explanationSource !== "deterministic_template") {
    errors.push("Package F deterministic fallback explanation has an inconsistent source.");
  }
  if (layer.deterministicExplanation.policyVersion !== DETERMINISTIC_EXPLANATION_POLICY_VERSION) {
    errors.push("Package F deterministic explanation policy version is missing or unsupported.");
  }
  if (layer.summary.explanationReadiness === "deterministic_fallback" && layer.deterministicExplanation.sections.length === 0) {
    errors.push("Package F deterministic fallback explanation is unavailable.");
  }
  const explanationText = layer.deterministicExplanation.sections.map((section) => section.text).join(" ");
  if (containsUnsafeCustomerText(explanationText)) errors.push("Package F deterministic explanation contains prohibited language.");
}

function validDeterministicAnomalySubstitution(
  layer: CanonicalAiCapabilityLayer,
  capability: CanonicalAiCapabilityLayer["capabilities"][number],
): boolean {
  const review = layer.deterministicRuntimeSafetyReview;
  const expectedAbsenceProof = `deterministic_runtime_safety_substitution:${CANONICAL_RUNTIME_SAFETY_REVIEW_POLICY_VERSION}`;
  return (
    capability.capability === "full_statement_anomaly_review" &&
    capability.trigger.reasonCode === "deterministic_absence_proven" &&
    capability.trigger.absenceProof === expectedAbsenceProof &&
    capability.output === null &&
    capability.executionRef === null &&
    review?.policyVersion === CANONICAL_RUNTIME_SAFETY_REVIEW_POLICY_VERSION &&
    review.anomalySubstitutionAllowed === true &&
    review.anomalySubstitutionProof?.type === "deterministic_runtime_safety_substitution" &&
    review.anomalySubstitutionProof.policyVersion === CANONICAL_RUNTIME_SAFETY_REVIEW_POLICY_VERSION &&
    review.anomalySubstitutionProof.reviewId === review.id
  );
}

function validateRuntimeSafetyReview(
  analysis: CanonicalStatementAnalysis,
  evidenceIds: Set<string>,
  calculationIds: Set<string>,
  errors: string[],
): void {
  const layer = analysis.aiCapabilities;
  const review = layer.deterministicRuntimeSafetyReview;
  if (!review) return;
  if (review.policyVersion !== CANONICAL_RUNTIME_SAFETY_REVIEW_POLICY_VERSION) errors.push("Package F deterministic runtime safety review has unsupported policy version.");
  if (review.id !== "canonical_runtime_safety_review") errors.push("Package F deterministic runtime safety review has malformed id.");
  if (!["passed", "limited", "withheld", "unavailable"].includes(review.status)) errors.push("Package F deterministic runtime safety review has unsupported status.");
  validateRuntimeSafetyReviewChecks(analysis, errors);
  if (review.aiAuthorityUsed !== false || review.financialMutationAllowed !== false || review.shadowComparisonUsed !== false) {
    errors.push("Package F deterministic runtime safety review weakens the AI authority boundary.");
  }
  if (review.anomalySubstitutionAllowed && (review.status === "withheld" || review.status === "unavailable" || !review.anomalySubstitutionProof)) {
    errors.push("Package F deterministic runtime safety review allows anomaly substitution without passing proof.");
  }
  if (!review.anomalySubstitutionAllowed && review.anomalySubstitutionProof) {
    errors.push("Package F deterministic runtime safety review carries unused anomaly substitution proof.");
  }
  if (review.anomalySubstitutionProof && review.anomalySubstitutionProof.reviewId !== review.id) {
    errors.push("Package F deterministic runtime safety proof is not tied to the review record.");
  }
  for (const evidenceRef of [...review.evidenceRefs, ...(review.anomalySubstitutionProof?.evidenceRefs ?? [])]) {
    if (!evidenceIds.has(evidenceRef)) errors.push(`Package F deterministic runtime safety review has broken evidence ref ${evidenceRef}.`);
  }
  for (const calculationRef of [...review.calculationRefs, ...(review.anomalySubstitutionProof?.calculationRefs ?? [])]) {
    if (!calculationIds.has(calculationRef)) errors.push(`Package F deterministic runtime safety review has broken calculation ref ${calculationRef}.`);
  }
  if (containsProviderLeak(review)) errors.push("Package F deterministic runtime safety review leaks provider-specific or unsafe details.");
}

function validateRuntimeSafetyReviewChecks(analysis: CanonicalStatementAnalysis, errors: string[]): void {
  const review = analysis.aiCapabilities.deterministicRuntimeSafetyReview;
  if (!review) return;
  const expectedIds = new Set(CANONICAL_RUNTIME_SAFETY_REVIEW_CHECK_IDS);
  const seen = new Set<string>();
  for (const check of review.checks ?? []) {
    if (!expectedIds.has(check.checkId as any)) errors.push(`Package F deterministic runtime safety review has unsupported check ${String(check.checkId)}.`);
    if (seen.has(check.checkId)) errors.push(`Package F deterministic runtime safety review has duplicate check ${check.checkId}.`);
    seen.add(check.checkId);
    if (!["pass", "limited", "withheld", "unavailable", "not_applicable"].includes(check.status)) {
      errors.push(`Package F deterministic runtime safety review check ${check.checkId} has unsupported status.`);
    }
  }
  for (const expectedId of CANONICAL_RUNTIME_SAFETY_REVIEW_CHECK_IDS) {
    if (!seen.has(expectedId)) errors.push(`Package F deterministic runtime safety review is missing check ${expectedId}.`);
  }
  const reconstructed = reconstructDeterministicRuntimeSafetyChecks(analysis, review);
  const stable = (checks: typeof reconstructed) =>
    checks.map((check) => ({
      checkId: check.checkId,
      status: check.status,
      reasonCode: check.reasonCode,
      evidenceRefs: [...check.evidenceRefs].sort(),
      calculationRefs: [...check.calculationRefs].sort(),
    }));
  if (JSON.stringify(stable(review.checks ?? [])) !== JSON.stringify(stable(reconstructed))) {
    errors.push("Package F deterministic runtime safety review checks do not reconstruct from current canonical inputs.");
  }
  const expectedStatus = statusFromRuntimeSafetyChecks(reconstructed);
  if (review.status !== expectedStatus) {
    errors.push("Package F deterministic runtime safety review status does not match reconstructed checks.");
  }
  const runtimeAnomaly = reconstructed.find((check) => check.checkId === "runtime_anomaly_ai_substitutable");
  const expectedSubstitutionAllowed =
    runtimeAnomaly?.status === "pass" &&
    (runtimeAnomaly.reasonCode === "runtime_anomaly_ai_absent" || runtimeAnomaly.reasonCode === "runtime_anomaly_ai_disabled") &&
    (expectedStatus === "passed" || expectedStatus === "limited");
  if (review.anomalySubstitutionAllowed !== expectedSubstitutionAllowed) {
    errors.push("Package F deterministic runtime safety review substitution flag does not match reconstructed checks.");
  }
}

function statusFromRuntimeSafetyChecks(
  checks: ReturnType<typeof reconstructDeterministicRuntimeSafetyChecks>,
): "passed" | "limited" | "withheld" | "unavailable" {
  const byId = new Map(checks.map((check) => [check.checkId, check]));
  if (
    byId.get("canonical_schema_valid")?.status === "withheld" ||
    byId.get("core_facts_safe")?.status === "withheld" ||
    byId.get("effective_rate_basis_safe")?.status === "withheld" ||
    byId.get("fee_ledger_controls_nonblocking")?.status === "withheld" ||
    byId.get("runtime_anomaly_ai_substitutable")?.reasonCode === "runtime_anomaly_ai_failed" ||
    byId.get("runtime_anomaly_ai_substitutable")?.reasonCode === "runtime_anomaly_ai_timed_out" ||
    byId.get("runtime_anomaly_ai_substitutable")?.reasonCode === "runtime_anomaly_ai_rejected" ||
    byId.get("runtime_anomaly_ai_substitutable")?.reasonCode === "runtime_anomaly_ai_safety_blocked"
  ) {
    return "withheld";
  }
  if (byId.get("fee_ledger_status_safe")?.status === "unavailable") return "unavailable";
  if (byId.get("package_e_totals_reconstructed")?.status === "withheld") return "withheld";
  if (
    byId.get("fee_ledger_status_safe")?.status === "limited" ||
    byId.get("fee_ledger_controls_nonblocking")?.status === "limited" ||
    byId.get("package_d_review_items_preserved")?.status === "limited"
  ) {
    return "limited";
  }
  return "passed";
}

function evidenceIdsFromAnalysis(analysis: CanonicalStatementAnalysis): Set<string> {
  return new Set(analysis.evidence.map((item) => item.id));
}

function calculationIdsFromAnalysis(analysis: CanonicalStatementAnalysis): Set<string> {
  return new Set(analysis.calculations.map((item) => item.id));
}

function containsProviderLeak(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsProviderLeak);
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (["provider", "model", "adapter", "apiKey", "rawPrompt", "rawResponse", "rawError", "providerModelRef", "providerFamily", "latencyMs", "retryCount"].includes(key)) return true;
    if (typeof nested === "string" && /\b(openai|anthropic|openrouter|claude|gpt|api key|billing|rate limit|raw error)\b/i.test(nested)) return true;
    if (containsProviderLeak(nested)) return true;
  }
  return false;
}

function containsUnsafeCustomerText(text: string): boolean {
  return /\bripped off\b|\bcheat(?:ed|ing)?\b|\bguarantee(?:d)?\b|\boverpaying\b|\bopenai\b|\banthropic\b|\bclaude\b|\bgpt\b|\bapi key\b|\bbilling\b|\brate limit\b|\braw error\b/i.test(text);
}
