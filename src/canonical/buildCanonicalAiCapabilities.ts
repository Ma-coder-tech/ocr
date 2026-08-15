import { evaluateAiCapabilityGrounding } from "./aiGroundingGateway.js";
import { determineAiCapabilityNeeds, PACKAGE_F_KNOWN_LEGACY_RISK_CODES } from "./aiCapabilityPolicy.js";
import {
  AI_MATERIALITY_POLICY_VERSION,
  AI_PRIVACY_RETENTION_POLICY_VERSION,
  AI_READINESS_DEGRADATION_POLICY_VERSION,
  CANONICAL_AI_CAPABILITY_BOUNDARY_POLICY_VERSION,
  CANONICAL_AI_CAPABILITIES,
  CANONICAL_RUNTIME_SAFETY_REVIEW_POLICY_VERSION,
  DETERMINISTIC_EXPLANATION_POLICY_VERSION,
  combineFinancialReadiness,
  isSuccessfulAiCapabilityStatus,
} from "./aiCapabilityTypes.js";
import { buildDeterministicExplanation } from "./deterministicExplanation.js";
import type {
  CanonicalAiCapabilityId,
  CanonicalAiCapabilityLayer,
  CanonicalAiCapabilityOutput,
  CanonicalAiCapabilityRecord,
  CanonicalAiCapabilityStatus,
  CanonicalAiCapabilityTrigger,
  CanonicalAiExplanationReadiness,
  CanonicalAiLimitationCode,
  CanonicalBusinessQualification,
  CanonicalEvidenceRecord,
  CanonicalFeeLedger,
  CanonicalFeeOwnershipActionability,
  CanonicalFinancialFacts,
  CanonicalOpportunityEngine,
  CanonicalRuntimeSafetyReviewRecord,
  CanonicalStatementIdentity,
} from "./types.js";

export type CanonicalAiCapabilityHarnessInput = {
  capability: CanonicalAiCapabilityId;
  status: CanonicalAiCapabilityStatus;
  output?: CanonicalAiCapabilityOutput | null;
  executionRef?: string | null;
  independentReviewRefs?: readonly string[];
};

export function buildCanonicalAiCapabilities(input: {
  identity: CanonicalStatementIdentity;
  businessQualification?: CanonicalBusinessQualification;
  financialFacts: CanonicalFinancialFacts;
  feeLedger: CanonicalFeeLedger;
  feeOwnershipActionability: CanonicalFeeOwnershipActionability;
  opportunityEngine: CanonicalOpportunityEngine;
  evidence: readonly CanonicalEvidenceRecord[];
  harnessInputs?: readonly CanonicalAiCapabilityHarnessInput[];
  deterministicRuntimeSafetyReview?: CanonicalRuntimeSafetyReviewRecord | null;
}): CanonicalAiCapabilityLayer {
  const evidenceText = input.evidence.map(
    (record) => `${record.id}\u0000${record.extractedText ?? ""} ${record.normalizedText ?? ""} ${record.customerSafe.excerpt ?? ""} ${record.sourceRole}`,
  );
  const needs = determineAiCapabilityNeeds({ ...input, evidenceText });
  const needsByCapability = new Map(needs.map((need) => [need.capability, need]));
  const duplicateHarnessCapabilities = duplicateCapabilities(input.harnessInputs ?? []);
  const harnessByCapability = new Map((input.harnessInputs ?? []).map((item) => [item.capability, item]));
  const capabilities: CanonicalAiCapabilityRecord[] = [];

  for (const capability of CANONICAL_AI_CAPABILITIES) {
    const need = needsByCapability.get(capability);
    if (!need) continue;
    const harness = harnessByCapability.get(capability);
    const duplicateHarness = duplicateHarnessCapabilities.has(capability);
    const status = duplicateHarness
      ? "rejected"
      : harness?.status ?? (need.required || capability === "merchant_narrative" || need.trigger.present ? "disabled" : "not_needed");
    const output = duplicateHarness ? null : harness?.output ?? null;
    const grounding = output ? evaluateAiCapabilityGrounding(output, { evidence: [...input.evidence], feeLedger: input.feeLedger, opportunityEngine: input.opportunityEngine }) : null;
    const rejected = grounding?.status === "rejected";
    const effectiveStatus = rejected ? "rejected" : status;
    const trigger = triggerForCapability({
      capability,
      status: effectiveStatus,
      defaultTrigger: need.trigger,
      deterministicRuntimeSafetyReview: input.deterministicRuntimeSafetyReview ?? null,
    });
    const limitationCodes = [
      ...(need.required && !isSuccessfulAiCapabilityStatus(effectiveStatus) ? need.failureLimitationCodes : []),
      ...(rejected || duplicateHarness ? (["ai_output_rejected"] as CanonicalAiLimitationCode[]) : []),
    ];
    capabilities.push({
      id: `ai_capability_${capability}`,
      capability,
      policyVersion: CANONICAL_AI_CAPABILITY_BOUNDARY_POLICY_VERSION,
      required: need.required,
      status: effectiveStatus,
      trigger,
      groundingStatus: output ? grounding?.status ?? "rejected" : need.required || capability === "merchant_narrative" ? "not_applicable" : "not_applicable",
      financialReadinessOnFailure: need.failureFinancialReadiness,
      explanationReadinessOnFailure: capability === "merchant_narrative" ? "deterministic_fallback" : "unavailable",
      outputRef: output ? `ai_output_${capability}` : null,
      executionRef: duplicateHarness ? null : harness?.executionRef ?? null,
      independentReviewRefs: [...(harness?.independentReviewRefs ?? [])],
      output,
      limitationCodes,
      knownLegacyRiskCodes: [...PACKAGE_F_KNOWN_LEGACY_RISK_CODES],
    });
  }

  const limitationCodes = unique(capabilities.flatMap((capability) => capability.limitationCodes));
  const financialReadiness = combineFinancialReadiness(
    capabilities.map((capability) =>
      capability.required && !isSuccessfulAiCapabilityStatus(capability.status) ? capability.financialReadinessOnFailure : "ready",
    ),
  );
  const acceptedNarrative = capabilities.some(
    (capability) => capability.capability === "merchant_narrative" && capability.status === "completed" && capability.groundingStatus === "grounded",
  );
  const explanationReadiness: CanonicalAiExplanationReadiness = acceptedNarrative ? "ai_enhanced" : "deterministic_fallback";
  const deterministicExplanation = buildDeterministicExplanation({
    identity: input.identity,
    financialFacts: input.financialFacts,
    opportunityEngine: input.opportunityEngine,
    limitationCodes,
  });

  return {
    policyVersion: CANONICAL_AI_CAPABILITY_BOUNDARY_POLICY_VERSION,
    materialityPolicyVersion: AI_MATERIALITY_POLICY_VERSION,
    readinessPolicyVersion: AI_READINESS_DEGRADATION_POLICY_VERSION,
    privacyRetentionPolicyVersion: AI_PRIVACY_RETENTION_POLICY_VERSION,
    deterministicExplanationPolicyVersion: DETERMINISTIC_EXPLANATION_POLICY_VERSION,
    deterministicRuntimeSafetyReviewPolicyVersion: CANONICAL_RUNTIME_SAFETY_REVIEW_POLICY_VERSION,
    capabilities,
    deterministicRuntimeSafetyReview: input.deterministicRuntimeSafetyReview ?? null,
    deterministicExplanation,
    summary: {
      policyVersion: CANONICAL_AI_CAPABILITY_BOUNDARY_POLICY_VERSION,
      materialityPolicyVersion: AI_MATERIALITY_POLICY_VERSION,
      readinessPolicyVersion: AI_READINESS_DEGRADATION_POLICY_VERSION,
      privacyRetentionPolicyVersion: AI_PRIVACY_RETENTION_POLICY_VERSION,
      deterministicExplanationPolicyVersion: DETERMINISTIC_EXPLANATION_POLICY_VERSION,
      deterministicRuntimeSafetyReviewPolicyVersion: CANONICAL_RUNTIME_SAFETY_REVIEW_POLICY_VERSION,
      financialReadiness,
      explanationReadiness,
      requiredCapabilityCount: capabilities.filter((capability) => capability.required).length,
      completedCapabilityCount: capabilities.filter((capability) => isSuccessfulAiCapabilityStatus(capability.status)).length,
      blockedCapabilityCount: capabilities.filter((capability) => capability.required && !isSuccessfulAiCapabilityStatus(capability.status)).length,
      rejectedOutputCount: capabilities.filter((capability) => capability.status === "rejected").length,
      limitationCodes,
      knownLegacyRiskCodes: unique(capabilities.flatMap((capability) => capability.knownLegacyRiskCodes)),
      explanationSource: acceptedNarrative ? "accepted_ai_narrative" : "deterministic_template",
    },
    limitations: [
      "Package F v1 is canonical and harness-only; it does not run live providers or mutate parser, report, API, worker, frontend, persistence, Vercel, or production behavior.",
      "Raw prompts, raw responses, and raw statement text are not persisted by the canonical Package F layer.",
    ],
  };
}

function triggerForCapability(input: {
  capability: CanonicalAiCapabilityId;
  status: CanonicalAiCapabilityStatus;
  defaultTrigger: CanonicalAiCapabilityTrigger;
  deterministicRuntimeSafetyReview: CanonicalRuntimeSafetyReviewRecord | null;
}): CanonicalAiCapabilityTrigger {
  const proof = input.deterministicRuntimeSafetyReview?.anomalySubstitutionProof;
  if (
    input.capability !== "full_statement_anomaly_review" ||
    input.status !== "not_needed" ||
    !input.deterministicRuntimeSafetyReview?.anomalySubstitutionAllowed ||
    !proof
  ) {
    return input.defaultTrigger;
  }
  return {
    ...input.defaultTrigger,
    reasonCode: "deterministic_absence_proven",
    reason: "Versioned deterministic runtime safety checks replace disabled or absent anomaly AI without creating AI authority.",
    evidenceRefs: proof.evidenceRefs,
    absenceProof: `${proof.type}:${proof.policyVersion}`,
  };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function duplicateCapabilities(inputs: readonly CanonicalAiCapabilityHarnessInput[]): Set<CanonicalAiCapabilityId> {
  const seen = new Set<CanonicalAiCapabilityId>();
  const duplicates = new Set<CanonicalAiCapabilityId>();
  for (const input of inputs) {
    if (seen.has(input.capability)) duplicates.add(input.capability);
    seen.add(input.capability);
  }
  return duplicates;
}
