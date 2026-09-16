import { createHash } from "node:crypto";

import type {
  ShadowAiEconomicIssueClassV1,
  ShadowAiEconomicResolutionPacketV1,
  ShadowAiEconomicResolutionPlanV1,
} from "./shadowAiEconomicResolutionPlannerTypesV1.js";
import type {
  ShadowAiPlannerDeterministicStateV1,
} from "./shadowAiPlannerProviderQualificationV1.js";
import type { ShadowAiPlannerTransportAdapterV1 } from "./shadowAiPlannerProviderNeutralV1.js";
import {
  runShadowAiProviderNeutralPlannerV1,
  type ShadowAiProviderNeutralPlannerRunV1,
} from "./shadowAiPlannerProviderNeutralRuntimeV1.js";
import { canonicalJson } from "./v2/canonicalJson.js";

export const SHADOW_AI_PHASE_3_REPETITIONS_V1 = 2 as const;
export const SHADOW_AI_PHASE_3_TIMEOUT_MS_V1 = 60_000 as const;

export type ShadowAiPhase3SemanticSignatureV1 = Readonly<{
  recommendedResolutionPath: ShadowAiEconomicResolutionPlanV1["recommendedResolutionPath"];
  requiredEvidenceClasses: readonly string[];
  guidanceChannels: Readonly<{
    publicResearch: boolean;
    merchantInput: boolean;
    documentRequest: boolean;
    operationalData: boolean;
  }>;
  competingAlternativePresent: boolean;
  reconstructionRecheckTypes: readonly string[];
}>;

export type ShadowAiPhase3QualityComparisonV1 = Readonly<{
  resolutionPathMatchesBaseline: boolean;
  evidenceClassesMatchBaseline: boolean;
  guidanceChannelsMatchBaseline: boolean;
  requiredAlternativePresent: boolean;
  exactReferenceGroundingPresent: boolean;
  epistemicBoundariesComplete: boolean;
}>;

export type ShadowAiPhase3TrialV1 = Readonly<{
  repetition: 1 | 2;
  status: "PASSED" | "FAILED" | "SKIPPED";
  runStatus: ShadowAiProviderNeutralPlannerRunV1["status"] | null;
  provider: ShadowAiProviderNeutralPlannerRunV1["provider"] | null;
  accounting: ShadowAiProviderNeutralPlannerRunV1["accounting"] | null;
  deterministicStatePreserved: boolean;
  stateBeforeSha256: string | null;
  stateAfterSha256: string | null;
  stateComponentSha256Before: Readonly<Record<keyof ShadowAiPlannerDeterministicStateV1, string>> | null;
  stateComponentSha256After: Readonly<Record<keyof ShadowAiPlannerDeterministicStateV1, string>> | null;
  semanticSignature: ShadowAiPhase3SemanticSignatureV1 | null;
  semanticSignatureSha256: string | null;
  quality: ShadowAiPhase3QualityComparisonV1 | null;
  errorCodes: readonly string[];
}>;

export type ShadowAiPhase3IssueFamilyResultV1 = Readonly<{
  issueClass: ShadowAiEconomicIssueClassV1;
  corpusKind: "DETERMINISTIC_GOLD_SELECTION" | "SYNTHETIC_NON_CUSTOMER_CONTRACT_CONTROL";
  status: "PASSED" | "FAILED";
  providerCalls: number;
  maximumProviderCalls: typeof SHADOW_AI_PHASE_3_REPETITIONS_V1;
  repeatableSemanticSignature: boolean;
  baselineQualityMatched: boolean;
  deterministicStatePreserved: boolean;
  trials: readonly ShadowAiPhase3TrialV1[];
  errorCodes: readonly string[];
}>;

/**
 * Executes one Direct OpenAI shadow case twice. It stops after a transport,
 * local-validation, or protected-state failure. Quality mismatches are recorded
 * without suppressing the second run so repeatability can still be measured.
 * No plan text or raw provider content is returned by this evaluator.
 */
export async function evaluateShadowAiPhase3IssueFamilyV1(input: Readonly<{
  issueClass: ShadowAiEconomicIssueClassV1;
  corpusKind: ShadowAiPhase3IssueFamilyResultV1["corpusKind"];
  packet: ShadowAiEconomicResolutionPacketV1;
  offlineBaselinePlan: ShadowAiEconomicResolutionPlanV1;
  adapter: ShadowAiPlannerTransportAdapterV1;
  captureDeterministicState(): ShadowAiPlannerDeterministicStateV1;
  timeoutMs?: number;
}>): Promise<ShadowAiPhase3IssueFamilyResultV1> {
  if (input.packet.issueClass !== input.issueClass) {
    throw new Error("shadow_planner_phase3_issue_class_mismatch");
  }
  const timeoutMs = input.timeoutMs ?? SHADOW_AI_PHASE_3_TIMEOUT_MS_V1;
  const trials: ShadowAiPhase3TrialV1[] = [];
  let stopped = false;

  for (const repetition of [1, 2] as const) {
    if (stopped) {
      trials.push(skippedTrial(repetition));
      continue;
    }
    const before = componentFingerprints(input.captureDeterministicState());
    const stateBeforeSha256 = fingerprint(before);
    const run = await runShadowAiProviderNeutralPlannerV1({
      packet: input.packet,
      adapter: input.adapter,
      timeoutMs,
    });
    const after = componentFingerprints(input.captureDeterministicState());
    const stateAfterSha256 = fingerprint(after);
    const deterministicStatePreserved = stateBeforeSha256 === stateAfterSha256;
    const plan = run.status === "COMPLETED" ? run.plan : null;
    const semanticSignature = plan ? shadowAiPhase3SemanticSignatureV1(plan) : null;
    const quality = plan
      ? compareShadowAiPhase3PlanToOfflineBaselineV1(plan, input.offlineBaselinePlan, input.packet)
      : null;
    const errorCodes = [...run.errorCodes];
    if (!deterministicStatePreserved) errorCodes.push("shadow_planner_phase3_deterministic_state_changed");
    const passed = run.status === "COMPLETED" && plan !== null && deterministicStatePreserved;
    trials.push(deepFreeze({
      repetition,
      status: passed ? "PASSED" as const : "FAILED" as const,
      runStatus: run.status,
      provider: run.provider,
      accounting: run.accounting,
      deterministicStatePreserved,
      stateBeforeSha256,
      stateAfterSha256,
      stateComponentSha256Before: before,
      stateComponentSha256After: after,
      semanticSignature,
      semanticSignatureSha256: semanticSignature ? fingerprint(semanticSignature) : null,
      quality,
      errorCodes: unique(errorCodes).sort(),
    }));
    if (!passed) stopped = true;
  }

  const completed = trials.filter((trial) => trial.status === "PASSED");
  const repeatableSemanticSignature = completed.length === SHADOW_AI_PHASE_3_REPETITIONS_V1
    && completed[0]!.semanticSignatureSha256 === completed[1]!.semanticSignatureSha256;
  const baselineQualityMatched = completed.length === SHADOW_AI_PHASE_3_REPETITIONS_V1
    && completed.every((trial) => trial.quality && Object.values(trial.quality).every(Boolean));
  const deterministicStatePreserved = trials.every((trial) =>
    trial.status === "SKIPPED" || trial.deterministicStatePreserved);
  const errorCodes = unique([
    ...trials.flatMap((trial) => trial.errorCodes),
    ...(completed.length === SHADOW_AI_PHASE_3_REPETITIONS_V1 && !repeatableSemanticSignature
      ? ["shadow_planner_phase3_semantic_signature_not_repeatable"] : []),
    ...(completed.length === SHADOW_AI_PHASE_3_REPETITIONS_V1 && !baselineQualityMatched
      ? ["shadow_planner_phase3_offline_baseline_quality_mismatch"] : []),
  ]).sort();
  const passed = trials.every((trial) => trial.status === "PASSED")
    && repeatableSemanticSignature
    && baselineQualityMatched
    && deterministicStatePreserved;

  return deepFreeze({
    issueClass: input.issueClass,
    corpusKind: input.corpusKind,
    status: passed ? "PASSED" as const : "FAILED" as const,
    providerCalls: trials.filter((trial) => trial.accounting?.providerNetworkCalls === 1).length,
    maximumProviderCalls: SHADOW_AI_PHASE_3_REPETITIONS_V1,
    repeatableSemanticSignature,
    baselineQualityMatched,
    deterministicStatePreserved,
    trials,
    errorCodes,
  });
}

export function shadowAiPhase3SemanticSignatureV1(
  plan: ShadowAiEconomicResolutionPlanV1,
): ShadowAiPhase3SemanticSignatureV1 {
  return deepFreeze({
    recommendedResolutionPath: plan.recommendedResolutionPath,
    requiredEvidenceClasses: unique([...plan.requiredEvidenceClasses]).sort(),
    guidanceChannels: guidanceChannels(plan),
    competingAlternativePresent: plan.alternativeHypotheses.length > 0,
    reconstructionRecheckTypes: unique(plan.reconstructionSuspicions
      .map((item) => item.requestedDeterministicRecheckType)).sort(),
  });
}

export function compareShadowAiPhase3PlanToOfflineBaselineV1(
  plan: ShadowAiEconomicResolutionPlanV1,
  baseline: ShadowAiEconomicResolutionPlanV1,
  packet: ShadowAiEconomicResolutionPacketV1,
): ShadowAiPhase3QualityComparisonV1 {
  const allHypotheses = [plan.primaryHypothesis, ...plan.alternativeHypotheses];
  return deepFreeze({
    resolutionPathMatchesBaseline: plan.recommendedResolutionPath === baseline.recommendedResolutionPath,
    evidenceClassesMatchBaseline: canonicalJson(unique([...plan.requiredEvidenceClasses]).sort())
      === canonicalJson(unique([...baseline.requiredEvidenceClasses]).sort()),
    guidanceChannelsMatchBaseline: canonicalJson(guidanceChannels(plan))
      === canonicalJson(guidanceChannels(baseline)),
    requiredAlternativePresent: !packet.competingHypothesisRequired || plan.alternativeHypotheses.length > 0,
    exactReferenceGroundingPresent: eligibleFactReferenceCount(packet) === 0 || plan.exactCitedFactRefs.length > 0,
    epistemicBoundariesComplete: allHypotheses.every((hypothesis) =>
      hypothesis.supportingFactRefs.length > 0
      && hypothesis.acknowledgedEvidenceGaps.length > 0
      && hypothesis.confirmationRequirements.length > 0
      && hypothesis.falsificationConditions.length > 0),
  });
}

function guidanceChannels(plan: ShadowAiEconomicResolutionPlanV1) {
  return deepFreeze({
    publicResearch: plan.researchQuerySuggestions.length > 0,
    merchantInput: plan.merchantQuestionSuggestions.length > 0,
    documentRequest: plan.documentRequestSuggestions.length > 0,
    operationalData: plan.operationalDataRequests.length > 0,
  });
}

function eligibleFactReferenceCount(packet: ShadowAiEconomicResolutionPacketV1): number {
  return new Set([
    ...packet.acceptedFactRefs,
    ...packet.acceptedIssueRelevantActivityFacts.map((fact) => fact.factRef),
  ]).size;
}

function skippedTrial(repetition: 1 | 2): ShadowAiPhase3TrialV1 {
  return deepFreeze({
    repetition,
    status: "SKIPPED" as const,
    runStatus: null,
    provider: null,
    accounting: null,
    deterministicStatePreserved: true,
    stateBeforeSha256: null,
    stateAfterSha256: null,
    stateComponentSha256Before: null,
    stateComponentSha256After: null,
    semanticSignature: null,
    semanticSignatureSha256: null,
    quality: null,
    errorCodes: [],
  });
}

function componentFingerprints(
  value: ShadowAiPlannerDeterministicStateV1,
): Readonly<Record<keyof ShadowAiPlannerDeterministicStateV1, string>> {
  return deepFreeze({
    canonicalFinancialTruth: fingerprint(value.canonicalFinancialTruth),
    rdArtifacts: fingerprint(value.rdArtifacts),
    reconciliation: fingerprint(value.reconciliation),
    commercialTruth: fingerprint(value.commercialTruth),
    governedKnowledge: fingerprint(value.governedKnowledge),
    permissions: fingerprint(value.permissions),
    customerOutput: fingerprint(value.customerOutput),
  });
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
  }
  return value;
}
