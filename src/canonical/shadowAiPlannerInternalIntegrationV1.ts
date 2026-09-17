import { createHash } from "node:crypto";

import { inspectShadowAiEconomicResolutionPacketPrivacyV1 } from "./shadowAiEconomicResolutionIssueSelectionV1.js";
import { type ShadowAiEconomicIssueClassV1, type ShadowAiEconomicResolutionPacketV1 } from "./shadowAiEconomicResolutionPlannerTypesV1.js";
import { OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1 } from "./shadowAiPlannerProviderAdaptersV1.js";
import type { ShadowAiPlannerTransportAdapterV1 } from "./shadowAiPlannerProviderNeutralV1.js";
import {
  runShadowAiProviderNeutralPlannerV1,
  SHADOW_AI_PROVIDER_ABORT_CLEANUP_GRACE_MS_V1,
  type ShadowAiProviderNeutralPlannerRunV1,
} from "./shadowAiPlannerProviderNeutralRuntimeV1.js";
import {
  createOpenAiDirectPlannerAdapterV1,
  type ShadowAiPlannerTokenPricingV1,
} from "./shadowAiPlannerProviderTransportsV1.js";
import { canonicalJson } from "./v2/canonicalJson.js";

export const INTERNAL_SHADOW_PLANNER_INTEGRATION_SCHEMA_VERSION_V1 =
  "internal_shadow_planner_integration_2026_09_16_v1" as const;
export const INTERNAL_SHADOW_PLANNER_ENABLE_ENV_V1 = "SHADOW_AI_PLANNER_INTERNAL_ENABLED" as const;
export const INTERNAL_SHADOW_PLANNER_KILL_SWITCH_ENV_V1 = "SHADOW_AI_PLANNER_INTERNAL_KILL_SWITCH" as const;
export const INTERNAL_SHADOW_PLANNER_TIMEOUT_MS_V1 = 60_000 as const;
export const INTERNAL_SHADOW_PLANNER_MAXIMUM_OUTPUT_TOKENS_V1 = 4_000 as const;

const DIRECT_OPENAI_PRICING_V1: ShadowAiPlannerTokenPricingV1 = Object.freeze({
  inputUsdMicrosPerMillionTokens: 1_750_000,
  outputUsdMicrosPerMillionTokens: 14_000_000,
});

const GENERATION_V1 = Object.freeze({
  maximumOutputTokens: INTERNAL_SHADOW_PLANNER_MAXIMUM_OUTPUT_TOKENS_V1,
  reasoningEffort: "none" as const,
  verbosity: "low" as const,
});

export type InternalShadowPlannerSafeTelemetryV1 = Readonly<{
  schemaVersion: typeof INTERNAL_SHADOW_PLANNER_INTEGRATION_SCHEMA_VERSION_V1;
  mode: "INTERNAL_NON_CUSTOMER_SHADOW_ONLY";
  authority: "NONE";
  status: "DISABLED" | "KILL_SWITCHED" | "NOT_NEEDED" | "COMPLETED" | "UNAVAILABLE" | "SAFETY_BLOCKED";
  providerKind: "OPENAI_DIRECT";
  adapterId: "openai-direct-responses-v1";
  requestedModel: typeof OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1;
  selectedIssueCount: number;
  evaluatedIssueClass: ShadowAiEconomicIssueClassV1 | null;
  providerCallAttempts: 0 | 1;
  providerNetworkCalls: 0 | 1;
  providerCallCompleted: 0 | 1;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsdMicros: number;
  latencyMs: number;
  httpStatus: number | null;
  returnedModel: string | null;
  requestSha256: string | null;
  schemaSha256: string | null;
  cleanupStatus: "NOT_REQUIRED" | "CONFIRMED" | "UNCONFIRMED";
  failureStage: ShadowAiProviderNeutralPlannerRunV1["provider"]["failureStage"];
  deterministicStatePreserved: boolean;
  customerOutputCreated: false;
  truthMutationAllowed: false;
  sourceAdmissionAllowed: false;
  automaticProviderFallback: false;
  retries: 0;
  openRouterAllowed: false;
  errorCodes: readonly string[];
}>;

export type InternalShadowPlannerEnvironmentV1 = Readonly<Record<string, string | undefined>>;

export type InternalShadowPlannerIntegrationInputV1 = Readonly<{
  dataClassification: "NON_CUSTOMER_INTERNAL_FIXTURE";
  packets: readonly ShadowAiEconomicResolutionPacketV1[];
  captureProtectedState(): unknown;
}>;

export type InternalShadowPlannerIntegrationDependenciesV1 = Readonly<{
  environment?: InternalShadowPlannerEnvironmentV1;
  adapterFactory?: (apiKey: string) => ShadowAiPlannerTransportAdapterV1;
  killSwitchActive?: () => boolean;
  telemetrySink?: (telemetry: InternalShadowPlannerSafeTelemetryV1) => void;
}>;

/**
 * Default-off, non-customer integration seam for the qualified planner.
 *
 * The caller must prepare deterministic, privacy-contained packets and attest
 * that they originate from an internal non-customer fixture. The returned value
 * is safe telemetry only: provider drafts and locally bound plans never leave
 * this function and cannot enter canonical state or a customer output.
 */
export async function runInternalShadowPlannerV1(
  input: InternalShadowPlannerIntegrationInputV1,
  dependencies: InternalShadowPlannerIntegrationDependenciesV1 = {},
): Promise<InternalShadowPlannerSafeTelemetryV1> {
  const environment = dependencies.environment ?? process.env;
  if (environment[INTERNAL_SHADOW_PLANNER_ENABLE_ENV_V1] !== "true") {
    return emit(emptyTelemetry("DISABLED", []), dependencies.telemetrySink);
  }
  if (killSwitch(environment, dependencies.killSwitchActive)) {
    return emit(emptyTelemetry("KILL_SWITCHED", ["shadow_planner_internal_kill_switch_active"]), dependencies.telemetrySink);
  }
  if (input.dataClassification !== "NON_CUSTOMER_INTERNAL_FIXTURE") {
    return emit(emptyTelemetry("SAFETY_BLOCKED", ["shadow_planner_internal_data_classification_rejected"]), dependencies.telemetrySink);
  }
  if (input.packets.length === 0) {
    return emit(emptyTelemetry("NOT_NEEDED", []), dependencies.telemetrySink);
  }
  if (input.packets.length > 1) {
    return emit(emptyTelemetry("SAFETY_BLOCKED", ["shadow_planner_internal_call_budget_exceeded"], input.packets.length), dependencies.telemetrySink);
  }
  const packet = input.packets[0]!;
  const privacy = inspectShadowAiEconomicResolutionPacketPrivacyV1(packet);
  if (!privacy.valid) {
    return emit(emptyTelemetry("SAFETY_BLOCKED", privacy.reasonCodes, 1), dependencies.telemetrySink);
  }
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return emit(emptyTelemetry("SAFETY_BLOCKED", ["shadow_planner_internal_openai_key_unavailable"], 1), dependencies.telemetrySink);
  }

  let protectedStateBefore: string;
  try {
    protectedStateBefore = fingerprint(input.captureProtectedState());
  } catch {
    return emit(emptyTelemetry(
      "SAFETY_BLOCKED",
      ["shadow_planner_internal_protected_state_capture_failed"],
      1,
      false,
    ), dependencies.telemetrySink);
  }

  try {
    const adapter = dependencies.adapterFactory?.(apiKey) ?? createOpenAiDirectPlannerAdapterV1({
      apiKey,
      model: OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1,
      generation: GENERATION_V1,
      pricing: DIRECT_OPENAI_PRICING_V1,
    });
    assertQualifiedAdapter(adapter);
    if (killSwitch(environment, dependencies.killSwitchActive)) {
      const deterministicStatePreserved = protectedStateBefore === safeProtectedStateFingerprint(input.captureProtectedState);
      const errorCodes = ["shadow_planner_internal_kill_switch_active"];
      if (!deterministicStatePreserved) errorCodes.push("shadow_planner_internal_protected_state_changed");
      return emit(emptyTelemetry(
        deterministicStatePreserved ? "KILL_SWITCHED" : "SAFETY_BLOCKED",
        errorCodes,
        1,
        deterministicStatePreserved,
      ), dependencies.telemetrySink);
    }
    const run = await runShadowAiProviderNeutralPlannerV1({
      packet,
      adapter,
      timeoutMs: INTERNAL_SHADOW_PLANNER_TIMEOUT_MS_V1,
      abortCleanupGraceMs: SHADOW_AI_PROVIDER_ABORT_CLEANUP_GRACE_MS_V1,
    });
    const deterministicStatePreserved = protectedStateBefore === fingerprint(input.captureProtectedState());
    return emit(safeRunTelemetry(run, packet, deterministicStatePreserved), dependencies.telemetrySink);
  } catch (error) {
    const deterministicStatePreserved = protectedStateBefore === safeProtectedStateFingerprint(input.captureProtectedState);
    const errorCodes = [safeIntegrationError(error)];
    if (!deterministicStatePreserved) errorCodes.push("shadow_planner_internal_protected_state_changed");
    return emit(emptyTelemetry(
      "SAFETY_BLOCKED",
      errorCodes,
      1,
      deterministicStatePreserved,
    ), dependencies.telemetrySink);
  }
}

function safeRunTelemetry(
  run: ShadowAiProviderNeutralPlannerRunV1,
  packet: ShadowAiEconomicResolutionPacketV1,
  deterministicStatePreserved: boolean,
): InternalShadowPlannerSafeTelemetryV1 {
  const errors = [...run.errorCodes];
  if (!deterministicStatePreserved) errors.push("shadow_planner_internal_protected_state_changed");
  const exactModelIdentity = run.status !== "COMPLETED"
    || run.provider.returnedModel === OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1;
  if (!exactModelIdentity) errors.push("shadow_planner_internal_returned_model_unverified");
  return Object.freeze({
    schemaVersion: INTERNAL_SHADOW_PLANNER_INTEGRATION_SCHEMA_VERSION_V1,
    mode: "INTERNAL_NON_CUSTOMER_SHADOW_ONLY",
    authority: "NONE",
    status: deterministicStatePreserved && exactModelIdentity ? run.status : "SAFETY_BLOCKED",
    providerKind: "OPENAI_DIRECT",
    adapterId: "openai-direct-responses-v1",
    requestedModel: OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1,
    selectedIssueCount: 1,
    evaluatedIssueClass: packet.issueClass,
    providerCallAttempts: run.accounting.providerCallAttempts,
    providerNetworkCalls: run.accounting.providerNetworkCalls,
    providerCallCompleted: run.accounting.providerCallCompleted,
    inputTokens: run.accounting.inputTokens,
    outputTokens: run.accounting.outputTokens,
    estimatedCostUsdMicros: run.accounting.estimatedCostUsdMicros,
    latencyMs: run.accounting.latencyMs,
    httpStatus: run.provider.httpStatus,
    returnedModel: run.provider.returnedModel,
    requestSha256: run.provider.requestSha256,
    schemaSha256: run.provider.schemaSha256,
    cleanupStatus: run.provider.cleanupStatus,
    failureStage: run.provider.failureStage,
    deterministicStatePreserved,
    customerOutputCreated: false,
    truthMutationAllowed: false,
    sourceAdmissionAllowed: false,
    automaticProviderFallback: false,
    retries: 0,
    openRouterAllowed: false,
    errorCodes: unique(errors),
  });
}

function emptyTelemetry(
  status: InternalShadowPlannerSafeTelemetryV1["status"],
  errorCodes: readonly string[],
  selectedIssueCount = 0,
  deterministicStatePreserved = true,
): InternalShadowPlannerSafeTelemetryV1 {
  return Object.freeze({
    schemaVersion: INTERNAL_SHADOW_PLANNER_INTEGRATION_SCHEMA_VERSION_V1,
    mode: "INTERNAL_NON_CUSTOMER_SHADOW_ONLY",
    authority: "NONE",
    status,
    providerKind: "OPENAI_DIRECT",
    adapterId: "openai-direct-responses-v1",
    requestedModel: OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1,
    selectedIssueCount,
    evaluatedIssueClass: null,
    providerCallAttempts: 0,
    providerNetworkCalls: 0,
    providerCallCompleted: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsdMicros: 0,
    latencyMs: 0,
    httpStatus: null,
    returnedModel: null,
    requestSha256: null,
    schemaSha256: null,
    cleanupStatus: "NOT_REQUIRED",
    failureStage: "NONE",
    deterministicStatePreserved,
    customerOutputCreated: false,
    truthMutationAllowed: false,
    sourceAdmissionAllowed: false,
    automaticProviderFallback: false,
    retries: 0,
    openRouterAllowed: false,
    errorCodes: unique(errorCodes),
  });
}

function assertQualifiedAdapter(adapter: ShadowAiPlannerTransportAdapterV1): void {
  if (adapter.adapterId !== "openai-direct-responses-v1"
    || adapter.transport !== "PROVIDER"
    || adapter.providerKind !== "OPENAI_DIRECT"
    || adapter.model !== OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1
    || adapter.safeConfiguration.maximumOutputTokens !== INTERNAL_SHADOW_PLANNER_MAXIMUM_OUTPUT_TOKENS_V1
    || adapter.safeConfiguration.reasoningEffort !== "none"
    || adapter.safeConfiguration.verbosity !== "low"
    || adapter.safeConfiguration.verbosityControl !== "NATIVE_PARAMETER"
    || adapter.safeConfiguration.providerFallbackAllowed !== false
    || adapter.safeConfiguration.routedProviderConstraint !== null
    || adapter.safeConfiguration.dataCollection !== "DIRECT_STORE_DISABLED") {
    throw new Error("shadow_planner_internal_adapter_configuration_rejected");
  }
}

function killSwitch(
  environment: InternalShadowPlannerEnvironmentV1,
  injected: (() => boolean) | undefined,
): boolean {
  return environment[INTERNAL_SHADOW_PLANNER_KILL_SWITCH_ENV_V1] === "true" || injected?.() === true;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function safeProtectedStateFingerprint(capture: () => unknown): string | null {
  try {
    return fingerprint(capture());
  } catch {
    return null;
  }
}

function safeIntegrationError(error: unknown): string {
  if (error instanceof Error && /^shadow_planner_[a-z0-9_:,-]+$/.test(error.message)) return error.message;
  return "shadow_planner_internal_integration_failed";
}

function emit(
  telemetry: InternalShadowPlannerSafeTelemetryV1,
  sink: ((telemetry: InternalShadowPlannerSafeTelemetryV1) => void) | undefined,
): InternalShadowPlannerSafeTelemetryV1 {
  try {
    sink?.(telemetry);
  } catch {
    // Telemetry delivery is non-authoritative and must never alter the shadow
    // result or escape into the caller's customer/canonical control flow.
  }
  return telemetry;
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}
