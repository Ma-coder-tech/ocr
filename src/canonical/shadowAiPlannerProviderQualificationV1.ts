import { createHash } from "node:crypto";

import {
  SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1,
  type ShadowAiEconomicResolutionPacketV1,
} from "./shadowAiEconomicResolutionPlannerTypesV1.js";
import {
  compileShadowAiPlannerProviderRequestV1,
  validateAndBindShadowAiPlannerDraftV1,
  type ShadowAiPlannerTransportAdapterV1,
  type ShadowAiPlannerTransportResultV1,
} from "./shadowAiPlannerProviderNeutralV1.js";
import {
  runShadowAiProviderNeutralPlannerV1,
  SHADOW_AI_PROVIDER_NEUTRAL_MAXIMUM_TIMEOUT_MS_V1,
  type ShadowAiProviderNeutralPlannerRunV1,
} from "./shadowAiPlannerProviderNeutralRuntimeV1.js";
import { canonicalJson } from "./v2/canonicalJson.js";

export const SHADOW_AI_PROVIDER_QUALIFICATION_SCHEMA_VERSION_V1 =
  "shadow_ai_provider_qualification_2026_09_16_v1" as const;
export const SHADOW_AI_PROVIDER_QUALIFICATION_TIMEOUT_MS_V1 =
  SHADOW_AI_PROVIDER_NEUTRAL_MAXIMUM_TIMEOUT_MS_V1;

export type ShadowAiPlannerQualificationStageV1 = Readonly<{
  stage: "SCHEMA_CONTROL" | "ADVERSARIAL_REFERENCE_CONTROL" | "GOLD_CONTROL";
  status: "PASSED" | "FAILED" | "SKIPPED";
  runStatus: ShadowAiProviderNeutralPlannerRunV1["status"] | null;
  stateBeforeSha256: string | null;
  stateAfterSha256: string | null;
  stateComponentSha256Before: Readonly<Record<keyof ShadowAiPlannerDeterministicStateV1, string>> | null;
  stateComponentSha256After: Readonly<Record<keyof ShadowAiPlannerDeterministicStateV1, string>> | null;
  deterministicStatePreserved: boolean;
  crossRequestReplayRejected: boolean | null;
  provider: ShadowAiProviderNeutralPlannerRunV1["provider"] | null;
  accounting: ShadowAiProviderNeutralPlannerRunV1["accounting"] | null;
  errorCodes: readonly string[];
}>;

export type ShadowAiPlannerDeterministicStateV1 = Readonly<{
  canonicalFinancialTruth: unknown;
  rdArtifacts: unknown;
  reconciliation: unknown;
  commercialTruth: unknown;
  governedKnowledge: unknown;
  permissions: unknown;
  customerOutput: unknown;
}>;

export type ShadowAiPlannerProviderQualificationV1 = Readonly<{
  schemaVersion: typeof SHADOW_AI_PROVIDER_QUALIFICATION_SCHEMA_VERSION_V1;
  status: "QUALIFIED" | "REJECTED";
  adapterId: string;
  providerKind: ShadowAiPlannerTransportAdapterV1["providerKind"];
  pinnedModel: string;
  adapterConfiguration: ShadowAiPlannerTransportAdapterV1["safeConfiguration"];
  providerCalls: number;
  maximumProviderCalls: 3;
  maximumOutputTokens: number;
  maximumEstimatedCostUsdMicrosPerCall: number;
  timeoutMsPerCall: typeof SHADOW_AI_PROVIDER_QUALIFICATION_TIMEOUT_MS_V1;
  retries: 0;
  fallbackAttempts: 0;
  rawProviderContentPersisted: false;
  customerOutputCreated: false;
  deterministicStatePreserved: boolean;
  stages: readonly ShadowAiPlannerQualificationStageV1[];
}>;

/**
 * Qualifies one explicitly selected provider adapter. Each stage performs at
 * most one call, stops on first failure, and persists no prompt or raw output.
 */
export async function qualifyShadowAiPlannerProviderV1(input: Readonly<{
  adapter: ShadowAiPlannerTransportAdapterV1;
  schemaControlPacket: ShadowAiEconomicResolutionPacketV1;
  adversarialControlPacket: ShadowAiEconomicResolutionPacketV1;
  goldPacket: ShadowAiEconomicResolutionPacketV1;
  captureDeterministicState(): ShadowAiPlannerDeterministicStateV1;
}>): Promise<ShadowAiPlannerProviderQualificationV1> {
  const stages: ShadowAiPlannerQualificationStageV1[] = [];
  let providerCalls = 0;
  let stopped = false;

  const execute = async (
    stage: ShadowAiPlannerQualificationStageV1["stage"],
    packet: ShadowAiEconomicResolutionPacketV1,
    crossBindingPacket: ShadowAiEconomicResolutionPacketV1 | null,
  ): Promise<void> => {
    if (stopped) {
      stages.push(skippedStage(stage));
      return;
    }
    providerCalls += 1;
    const capture: { value: ShadowAiPlannerTransportResultV1 | null } = { value: null };
    const adapter: ShadowAiPlannerTransportAdapterV1 = Object.freeze({
      ...input.adapter,
      async invoke(request) {
        const value = await input.adapter.invoke(request);
        capture.value = value;
        return value;
      },
    });
    const stateBefore = input.captureDeterministicState();
    const stateComponentSha256Before = componentFingerprints(stateBefore);
    const stateBeforeSha256 = fingerprint(stateComponentSha256Before);
    const run = await runShadowAiProviderNeutralPlannerV1({
      packet,
      adapter,
      timeoutMs: SHADOW_AI_PROVIDER_QUALIFICATION_TIMEOUT_MS_V1,
    });
    const stateAfter = input.captureDeterministicState();
    const stateComponentSha256After = componentFingerprints(stateAfter);
    const stateAfterSha256 = fingerprint(stateComponentSha256After);
    const deterministicStatePreserved = stateBeforeSha256 === stateAfterSha256;
    let crossRequestReplayRejected: boolean | null = null;
    const localErrors = [...run.errorCodes];
    if (crossBindingPacket !== null && capture.value !== null) {
      const crossBinding = compileShadowAiPlannerProviderRequestV1(crossBindingPacket).localBinding;
      const replay = validateAndBindShadowAiPlannerDraftV1(capture.value.rawDraft, crossBinding);
      crossRequestReplayRejected = !replay.ok
        && replay.errors.some((error) => error.includes("unknown_reference_token"));
      if (!crossRequestReplayRejected) localErrors.push("shadow_planner_cross_request_replay_not_rejected");
    }
    if (!deterministicStatePreserved) localErrors.push("shadow_planner_deterministic_state_changed");
    const passed = run.status === "COMPLETED"
      && deterministicStatePreserved
      && (crossRequestReplayRejected ?? true)
      && localErrors.length === 0;
    stages.push(deepFreeze({
      stage,
      status: passed ? "PASSED" as const : "FAILED" as const,
      runStatus: run.status,
      stateBeforeSha256,
      stateAfterSha256,
      stateComponentSha256Before,
      stateComponentSha256After,
      deterministicStatePreserved,
      crossRequestReplayRejected,
      provider: run.provider,
      accounting: run.accounting,
      errorCodes: [...new Set(localErrors)].sort(),
    }));
    if (!passed) stopped = true;
  };

  await execute("SCHEMA_CONTROL", input.schemaControlPacket, null);
  await execute("ADVERSARIAL_REFERENCE_CONTROL", input.adversarialControlPacket, input.schemaControlPacket);
  await execute("GOLD_CONTROL", input.goldPacket, null);

  const deterministicStatePreserved = stages.every((stage) =>
    stage.status === "SKIPPED" || stage.deterministicStatePreserved);
  const qualified = stages.every((stage) => stage.status === "PASSED");
  return deepFreeze({
    schemaVersion: SHADOW_AI_PROVIDER_QUALIFICATION_SCHEMA_VERSION_V1,
    status: qualified ? "QUALIFIED" as const : "REJECTED" as const,
    adapterId: input.adapter.adapterId,
    providerKind: input.adapter.providerKind,
    pinnedModel: input.adapter.model,
    adapterConfiguration: input.adapter.safeConfiguration,
    providerCalls,
    maximumProviderCalls: 3 as const,
    maximumOutputTokens: input.adapter.safeConfiguration.maximumOutputTokens,
    maximumEstimatedCostUsdMicrosPerCall:
      SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumEstimatedCostUsdMicros,
    timeoutMsPerCall: SHADOW_AI_PROVIDER_QUALIFICATION_TIMEOUT_MS_V1,
    retries: 0 as const,
    fallbackAttempts: 0 as const,
    rawProviderContentPersisted: false as const,
    customerOutputCreated: false as const,
    deterministicStatePreserved,
    stages,
  });
}

function skippedStage(stage: ShadowAiPlannerQualificationStageV1["stage"]): ShadowAiPlannerQualificationStageV1 {
  return deepFreeze({
    stage,
    status: "SKIPPED" as const,
    runStatus: null,
    stateBeforeSha256: null,
    stateAfterSha256: null,
    stateComponentSha256Before: null,
    stateComponentSha256After: null,
    deterministicStatePreserved: true,
    crossRequestReplayRejected: null,
    provider: null,
    accounting: null,
    errorCodes: [],
  });
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
  }
  return value;
}
