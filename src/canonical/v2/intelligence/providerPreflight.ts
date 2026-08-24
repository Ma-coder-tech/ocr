import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { canonicalJson, isSafeStructuredString } from "../knowledge/knowledgeSafety.js";
import type { IntelligencePorts, ProviderSafeQuestionContextV1, PublicSourceAuthorityAdmission, RuntimeClock } from "./intelligenceTypes.js";
import { inspectProviderSafeQuestionContext } from "./providerPrivacy.js";
import { validatePublicSourceAuthorityAdmissions } from "./sourceAuthority.js";
import { INVESTIGATIVE_RESPONSE_SCHEMA_HASH, OPENROUTER_SEARCH_IDENTITY_SCHEMA_HASH, SEMANTIC_RESPONSE_SCHEMA_HASH } from "./providerSchemas.js";

export const APPROVED_OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions" as const;
export const APPROVED_OPENAI_ENDPOINT = "https://api.openai.com/v1/responses" as const;
export const LIVE_OPENROUTER_KEY_ENV = "OPENROUTER_API_KEY" as const;
export const LIVE_OPENROUTER_MODEL_ENV = "OPENROUTER_SEARCH_MODEL" as const;
export const LIVE_OPENAI_KEY_ENV = "OPENAI_API_KEY" as const;
export const LIVE_OPENAI_MODEL_ENV = "OPENAI_INTERNAL_ANALYSIS_MODEL" as const;
export const OPENROUTER_SEARCH_ENGINE = "perplexity" as const;
export const OPENROUTER_SEARCH_CONFIGURATION_CODE = "openrouter_server_web_search_perplexity_v2" as const;
export const APPROVED_OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2" as const;

export type InternalLiveExecutionCapabilityV1 = Readonly<{
  schemaVersion: "internal_live_execution_capability_v1";
  capabilityId: string;
  runId: string;
  outputRoot: string;
  outputDirectory: string;
  openRouterEndpoint: typeof APPROVED_OPENROUTER_ENDPOINT;
  openRouterSearchEngine: typeof OPENROUTER_SEARCH_ENGINE;
  openRouterSearchConfigurationCode: typeof OPENROUTER_SEARCH_CONFIGURATION_CODE;
  openAiEndpoint: typeof APPROVED_OPENAI_ENDPOINT;
  searchModelCode: string;
  modelCode: string;
  searchIdentitySchemaHash: string;
  investigativeSchemaHash: string;
  semanticSchemaHash: string;
  authorityRegistryHash: string;
  languageCapability: "disabled";
}>;

type LiveBinding = { openRouterApiKey: string; openRouterSearchModel: string; openAiApiKey: string; model: string; clock: RuntimeClock; cancellationSignal: AbortSignal | null };
const liveBindings = new WeakMap<object, LiveBinding>();
const livePorts = new WeakMap<object, object>();

export type LiveOperationTransportState = "before_send" | "after_send" | "timed_out" | "cancelled";
export class LiveOperationTransportError extends Error {
  constructor(public readonly transportState: LiveOperationTransportState, reason: string) { super(reason); }
}

export type InternalLivePreflightInputV1 = {
  schemaVersion: "internal_live_preflight_input_v1";
  runMode: "internal_live_evaluation";
  runId: string;
  outputRoot: string;
  productOwnerLiveCallAuthorization: true;
  approvedOpenRouterSearchModel: string;
  approvedOpenAiModel: string;
  sourceAuthorityAdmissions: PublicSourceAuthorityAdmission[];
  questionContexts: ProviderSafeQuestionContextV1[];
  languageCapability: "disabled";
  cancellationSignal?: AbortSignal;
};

export async function createInternalLiveExecutionCapability(input: InternalLivePreflightInputV1): Promise<InternalLiveExecutionCapabilityV1> {
  if (input.schemaVersion !== "internal_live_preflight_input_v1" || input.runMode !== "internal_live_evaluation"
    || input.productOwnerLiveCallAuthorization !== true || input.languageCapability !== "disabled" || !isSafeStructuredString(input.runId)) {
    throw new Error("internal_live_preflight_identity_invalid");
  }
  validatePublicSourceAuthorityAdmissions(input.sourceAuthorityAdmissions);
  if (input.sourceAuthorityAdmissions.length === 0) throw new Error("internal_live_preflight_authority_registry_missing");
  if (input.questionContexts.length === 0 || input.questionContexts.some((context) => !inspectProviderSafeQuestionContext(context).valid)) {
    throw new Error("internal_live_preflight_provider_privacy_invalid");
  }
  const outputRoot = await approvedOutputRoot(input.outputRoot);
  const outputDirectory = path.join(outputRoot, input.runId);
  await assertUnusedSafeRunDirectory(outputRoot, outputDirectory);
  const openRouterApiKey = requiredEnvironmentSecret(LIVE_OPENROUTER_KEY_ENV);
  const openAiApiKey = requiredEnvironmentSecret(LIVE_OPENAI_KEY_ENV);
  const openRouterSearchModel = requiredEnvironmentModel(LIVE_OPENROUTER_MODEL_ENV);
  const model = requiredEnvironmentModel(LIVE_OPENAI_MODEL_ENV);
  if (openRouterSearchModel !== APPROVED_OPENROUTER_SEARCH_MODEL || input.approvedOpenRouterSearchModel !== APPROVED_OPENROUTER_SEARCH_MODEL
    || openRouterSearchModel !== input.approvedOpenRouterSearchModel) throw new Error("internal_live_search_model_not_approved");
  if (model !== input.approvedOpenAiModel) throw new Error("internal_live_model_not_approved");
  const clock = createSystemRuntimeClock();
  if (input.cancellationSignal !== undefined && !(input.cancellationSignal instanceof AbortSignal)) throw new Error("internal_live_cancellation_signal_invalid");
  const capability = Object.freeze({
    schemaVersion: "internal_live_execution_capability_v1" as const,
    capabilityId: `live-capability-${randomUUID()}`, runId: input.runId, outputRoot, outputDirectory,
    openRouterEndpoint: APPROVED_OPENROUTER_ENDPOINT, openRouterSearchEngine: OPENROUTER_SEARCH_ENGINE,
    openRouterSearchConfigurationCode: OPENROUTER_SEARCH_CONFIGURATION_CODE, openAiEndpoint: APPROVED_OPENAI_ENDPOINT,
    searchModelCode: safeModelCode(openRouterSearchModel), modelCode: safeModelCode(model),
    searchIdentitySchemaHash: OPENROUTER_SEARCH_IDENTITY_SCHEMA_HASH,
    investigativeSchemaHash: INVESTIGATIVE_RESPONSE_SCHEMA_HASH, semanticSchemaHash: SEMANTIC_RESPONSE_SCHEMA_HASH,
    authorityRegistryHash: createHash("sha256").update(canonicalJson(input.sourceAuthorityAdmissions)).digest("hex"), languageCapability: "disabled" as const,
  });
  liveBindings.set(capability, { openRouterApiKey, openRouterSearchModel, openAiApiKey, model, clock, cancellationSignal: input.cancellationSignal ?? null });
  return capability;
}

export function requireLiveCapabilityBinding(capability: InternalLiveExecutionCapabilityV1): LiveBinding {
  const binding = liveBindings.get(capability);
  if (!binding || capability.openRouterEndpoint !== APPROVED_OPENROUTER_ENDPOINT || capability.openRouterSearchEngine !== OPENROUTER_SEARCH_ENGINE
    || capability.openRouterSearchConfigurationCode !== OPENROUTER_SEARCH_CONFIGURATION_CODE || capability.openAiEndpoint !== APPROVED_OPENAI_ENDPOINT
    || capability.searchModelCode !== safeModelCode(binding.openRouterSearchModel) || capability.modelCode !== safeModelCode(binding.model)
    || capability.searchIdentitySchemaHash !== OPENROUTER_SEARCH_IDENTITY_SCHEMA_HASH
    || capability.investigativeSchemaHash !== INVESTIGATIVE_RESPONSE_SCHEMA_HASH || capability.semanticSchemaHash !== SEMANTIC_RESPONSE_SCHEMA_HASH) {
    throw new Error("internal_live_execution_capability_invalid");
  }
  return binding;
}

export function bindLivePorts(capability: InternalLiveExecutionCapabilityV1, ports: IntelligencePorts): void {
  requireLiveCapabilityBinding(capability); livePorts.set(ports, capability);
}

export function assertLivePortsBound(capability: InternalLiveExecutionCapabilityV1, ports: IntelligencePorts): void {
  requireLiveCapabilityBinding(capability);
  if (livePorts.get(ports) !== capability || ports.clock !== requireLiveCapabilityBinding(capability).clock) throw new Error("internal_live_ports_not_capability_bound");
}

function createSystemRuntimeClock(): RuntimeClock {
  return Object.freeze({
    nowMs: () => performance.now(),
    async runWithTimeout<T>(timeoutMs: number, operation: () => Promise<T>) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          operation().then((value) => ({ status: "completed" as const, value })).catch((error) => error instanceof LiveOperationTransportError && error.transportState === "timed_out"
            ? ({ status: "timeout" as const }) : ({ status: "failed" as const, reasonCode: safeReason(error) })),
          new Promise<{ status: "timeout" }>((resolve) => { timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs); }),
        ]);
      } finally { if (timer) clearTimeout(timer); }
    },
  });
}

async function approvedOutputRoot(value: string): Promise<string> {
  if (!path.isAbsolute(value) || value === path.parse(value).root || value.includes("\0") || path.normalize(value) !== value) throw new Error("internal_live_output_root_unsafe");
  const resolved = await realpath(value);
  if (resolved !== value || !(await lstat(resolved)).isDirectory()) throw new Error("internal_live_output_root_unsafe");
  return resolved;
}
async function assertUnusedSafeRunDirectory(root: string, directory: string): Promise<void> {
  const relative = path.relative(root, directory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("internal_live_output_directory_unsafe");
  try { await lstat(directory); throw new Error("internal_live_output_directory_exists"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
function requiredEnvironmentSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 16 || /[\r\n\0]/.test(value)) throw new Error(`internal_live_secret_missing:${name.toLowerCase()}`);
  return value;
}
function requiredEnvironmentModel(name: typeof LIVE_OPENAI_MODEL_ENV | typeof LIVE_OPENROUTER_MODEL_ENV): string {
  const value = process.env[name];
  const valid = name === LIVE_OPENROUTER_MODEL_ENV
    ? /^[a-z0-9][a-z0-9_.-]{0,63}\/[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value ?? "")
    : /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value ?? "");
  if (!value || !valid) throw new Error("internal_live_model_missing_or_invalid");
  return value;
}
function safeModelCode(value: string): string { return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 63); }
function safeReason(error: unknown): string { const value = error instanceof Error ? error.message : "provider_operation_failed"; return /^[a-z][a-z0-9_]{0,95}$/.test(value) ? value : "provider_operation_failed"; }

export type InternalProviderPreflightInputV1 = {
  schemaVersion: "internal_provider_preflight_input_v1";
  runMode: "internal_live_evaluation";
  executionMode: "injected_evaluation" | "external_provider";
  runId: string;
  outputDirectory: string;
  sourceAuthorityRegistryLoaded: boolean;
  questionContexts: ProviderSafeQuestionContextV1[];
  search: {
    provider: "openrouter_web_search";
    engine: typeof OPENROUTER_SEARCH_ENGINE;
    credentialPresent: boolean;
    modelConfigured: boolean;
    maxUses: 1;
    maxToolCalls: 1;
    resultCapBounded: boolean;
    fallbackProvidersAllowed: false;
    automaticRetries: 0;
    timeoutSupported: boolean;
    abortSupported: boolean;
    oneAttemptTransport: boolean;
  };
  models: {
    provider: "openai_responses_api";
    credentialPresent: boolean;
    modelConfigured: boolean;
    structuredOutputSupported: boolean;
    outputTokenCeilingsSupported: boolean;
    automaticRetries: 0;
    timeoutSupported: boolean;
    abortSupported: boolean;
    oneAttemptTransport: boolean;
  };
  languageCapability: "disabled";
  productOwnerLiveCallAuthorization: boolean;
};

export type InternalProviderPreflightResultV1 = {
  schemaVersion: "internal_provider_preflight_result_v1";
  valid: boolean;
  executionMode: InternalProviderPreflightInputV1["executionMode"];
  externalExecutionAllowed: boolean;
  reasonCodes: string[];
};

export function runInternalProviderPreflight(input: InternalProviderPreflightInputV1): InternalProviderPreflightResultV1 {
  const reasons: string[] = [];
  if (input.schemaVersion !== "internal_provider_preflight_input_v1" || input.runMode !== "internal_live_evaluation") reasons.push("preflight_run_mode_invalid");
  if (!isSafeStructuredString(input.runId)) reasons.push("preflight_run_id_invalid");
  if (!safeOutputDirectory(input.outputDirectory)) reasons.push("preflight_output_directory_unsafe");
  if (!input.sourceAuthorityRegistryLoaded) reasons.push("preflight_source_authority_registry_missing");
  if (input.questionContexts.length === 0) reasons.push("preflight_question_context_missing");
  for (const context of input.questionContexts) reasons.push(...inspectProviderSafeQuestionContext(context).reasonCodes);
  if (input.search.provider !== "openrouter_web_search" || input.search.engine !== OPENROUTER_SEARCH_ENGINE
    || !input.search.modelConfigured || input.search.maxUses !== 1 || input.search.maxToolCalls !== 1
    || !input.search.resultCapBounded || input.search.fallbackProvidersAllowed !== false || input.search.automaticRetries !== 0
    || !input.search.timeoutSupported || !input.search.abortSupported || !input.search.oneAttemptTransport) reasons.push("preflight_search_configuration_unsupported");
  if (input.models.provider !== "openai_responses_api" || input.models.automaticRetries !== 0 || !input.models.modelConfigured
    || !input.models.structuredOutputSupported || !input.models.outputTokenCeilingsSupported
    || !input.models.timeoutSupported || !input.models.abortSupported || !input.models.oneAttemptTransport) reasons.push("preflight_model_configuration_unsupported");
  if (input.languageCapability !== "disabled") reasons.push("preflight_language_capability_must_be_disabled");
  if (input.executionMode === "external_provider") {
    reasons.push("preflight_construction_bound_live_capability_required");
    if (!input.search.credentialPresent || !input.models.credentialPresent) reasons.push("preflight_required_credentials_missing");
    if (!input.productOwnerLiveCallAuthorization) reasons.push("preflight_live_call_not_authorized");
  } else if (input.productOwnerLiveCallAuthorization) {
    reasons.push("preflight_injected_mode_cannot_enable_live_authorization");
  }
  const unique = [...new Set(reasons)].sort();
  return {
    schemaVersion: "internal_provider_preflight_result_v1",
    valid: unique.length === 0,
    executionMode: input.executionMode,
    externalExecutionAllowed: false,
    reasonCodes: unique,
  };
}

export function assertInternalProviderPreflight(input: InternalProviderPreflightInputV1): InternalProviderPreflightResultV1 {
  const result = runInternalProviderPreflight(input);
  if (!result.valid) throw new Error(`internal_provider_preflight_failed:${result.reasonCodes.join(",")}`);
  return result;
}

function safeOutputDirectory(value: string): boolean {
  if (!path.isAbsolute(value) || value === path.parse(value).root || value.includes("\0")) return false;
  const normalized = path.normalize(value);
  return normalized === value && !normalized.split(path.sep).includes("..");
}
