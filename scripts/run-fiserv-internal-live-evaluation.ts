import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, open, readFile, readdir, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import {
  APPROVED_OPENROUTER_SEARCH_MODEL,
  APPROVED_OPENROUTER_ENDPOINT,
  APPROVED_OPENAI_ENDPOINT,
  createInternalLiveExecutionCapability,
  createInternalLiveIntelligencePorts,
  PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS,
  ProviderOperationAuditLog,
  runFiservInternalAnalysisEvaluationV1,
  type InternalLiveExecutionCapabilityV1,
  type ProviderSafeQuestionContextV1,
} from "../src/canonical/v2/index.js";

const execFile = promisify(execFileCallback);
const DEFAULT_OUTPUT_ROOT = "/private/tmp/ratereveal-live-internal-evaluation";
const PROFILE_CODE = "statement-one";
const RUN_PREFIX = "statement-one-live-internal-evaluation";
const AUTHORIZATION_TOKEN = "product-owner-approved";
const OPENAI_MODEL = "gpt-5.6-sol";
const OPENROUTER_SERVICE = "RateReveal/OpenRouter";
const OPENAI_SERVICE = "RateReveal/OpenAI";

export const STATEMENT_ONE_INTERNAL_LIVE_PROFILE = Object.freeze({
  profileCode: PROFILE_CODE,
  safeStatementId: "fsv-03-clover-short-jun",
  runVersion: "run-3-foundational-admissions-pricing-fixed",
  statementPath: "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
  periodYear: "2024",
  searchModel: APPROVED_OPENROUTER_SEARCH_MODEL,
  openAiModel: OPENAI_MODEL,
  languageCapability: "disabled" as const,
  automaticRetries: 0,
  fallbackProvidersAllowed: false,
});

export type InternalLiveRunnerDependencies = {
  readCredential(service: string): Promise<string>;
  execute(input: {
    runId: string;
    outputDirectory: string;
    capability: InternalLiveExecutionCapabilityV1;
    providerAudit: ProviderOperationAuditLog;
  }): Promise<{ executionStatus: string; researchOutcome: string; artifactPath: string }>;
  log(line: string): void;
};

export type InternalLiveRunnerArguments = {
  profile: string | null;
  authorization: string | null;
  runId: string | null;
  outputRoot: string;
};

export async function runInternalLiveRunner(
  args: InternalLiveRunnerArguments,
  overrides: Partial<InternalLiveRunnerDependencies> = {},
): Promise<number> {
  const log = overrides.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  if (args.profile !== PROFILE_CODE) {
    log("executionStatus: cancelled");
    log("researchOutcome: not_started");
    log("Provider sends: 0");
    log("Safe reason: authorized_profile_required");
    return 2;
  }
  if (args.authorization !== AUTHORIZATION_TOKEN) {
    log("executionStatus: cancelled");
    log("researchOutcome: not_started");
    log("Provider sends: 0");
    log("Safe reason: exact_product_owner_authorization_required");
    return 2;
  }

  const outputRoot = await assertOutputRoot(args.outputRoot);
  const lockPath = path.join(outputRoot, `.${RUN_PREFIX}.lock`);
  let lock: Awaited<ReturnType<typeof open>> | null = null;
  let runId = "unallocated";
  let outputDirectory = "";
  const providerAudit = new ProviderOperationAuditLog();
  try {
    lock = await open(lockPath, "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") throw new Error("internal_live_run_allocation_locked");
      throw error;
    });
    runId = await allocateRunId(outputRoot, args.runId);
    outputDirectory = path.join(outputRoot, runId);
    await assertAbsent(outputDirectory);
    await assertCommittedNetworkProfile();

    const readCredential = overrides.readCredential ?? readMacOsKeychainCredential;
    const [openRouterKey, openAiKey] = await Promise.all([
      readCredential(OPENROUTER_SERVICE), readCredential(OPENAI_SERVICE),
    ]);
    assertCredential(openRouterKey, OPENROUTER_SERVICE);
    assertCredential(openAiKey, OPENAI_SERVICE);
    process.env.OPENROUTER_API_KEY = openRouterKey;
    process.env.OPENAI_API_KEY = openAiKey;
    process.env.OPENROUTER_SEARCH_MODEL = STATEMENT_ONE_INTERNAL_LIVE_PROFILE.searchModel;
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = STATEMENT_ONE_INTERNAL_LIVE_PROFILE.openAiModel;

    const contexts = statementOneProviderContexts();
    const capability = await createInternalLiveExecutionCapability({
      schemaVersion: "internal_live_preflight_input_v1",
      runMode: "internal_live_evaluation",
      runId,
      outputRoot,
      productOwnerLiveCallAuthorization: true,
      approvedOpenRouterSearchModel: STATEMENT_ONE_INTERNAL_LIVE_PROFILE.searchModel,
      approvedOpenAiModel: STATEMENT_ONE_INTERNAL_LIVE_PROFILE.openAiModel,
      sourceAuthorityAdmissions: [...PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS],
      questionContexts: contexts,
      languageCapability: "disabled",
    });
    log("Preflight: passed; zero external sends");
    log(`Run ID: ${runId}`);
    log(`Profile: ${PROFILE_CODE}`);
    log(`Statement: ${STATEMENT_ONE_INTERNAL_LIVE_PROFILE.safeStatementId}`);
    log(`Period context: ${STATEMENT_ONE_INTERNAL_LIVE_PROFILE.periodYear}`);
    log("Questions: application_fee_public_definition, non_swiped_discount_public_definition");
    log(`Search: OpenRouter ${STATEMENT_ONE_INTERNAL_LIVE_PROFILE.searchModel}; web_search/perplexity; discovery only`);
    log(`Models: direct OpenAI ${STATEMENT_ONE_INTERNAL_LIVE_PROFILE.openAiModel}; investigation + independent semantic verification`);
    log("Retries: 0; fallback: disabled; language polishing: disabled");
    log("Provider sends: 0");

    const execute = overrides.execute ?? executeStatementOne;
    const result = await execute({ runId, outputDirectory, capability, providerAudit });
    log(`executionStatus: ${result.executionStatus}`);
    log(`researchOutcome: ${result.researchOutcome}`);
    log(`Provider sends: ${sendCount(providerAudit)}`);
    log(`Artifact directory: ${outputDirectory}`);
    log(`Summary artifact: ${result.artifactPath}`);
    return result.executionStatus === "completed" ? 0 : 1;
  } catch (error) {
    const safeCode = safeFailureCode(error);
    const sends = sendCount(providerAudit);
    const failurePath = outputDirectory
      ? await preserveSafeFailureArtifact(outputDirectory, runId, safeCode, sends, providerAudit)
      : null;
    log("executionStatus: failed");
    log("researchOutcome: research_unavailable");
    log(`Provider sends: ${sends}`);
    log(`Safe failure code: ${safeCode}`);
    if (failurePath) log(`Failure artifact: ${failurePath}`);
    return 1;
  } finally {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_SEARCH_MODEL;
    delete process.env.OPENAI_INTERNAL_ANALYSIS_MODEL;
    if (lock) {
      await lock.close().catch(() => undefined);
      await unlink(lockPath).catch(() => undefined);
    }
  }
}

async function executeStatementOne(input: {
  runId: string;
  outputDirectory: string;
  capability: InternalLiveExecutionCapabilityV1;
  providerAudit: ProviderOperationAuditLog;
}): Promise<{ executionStatus: string; researchOutcome: string; artifactPath: string }> {
  const ports = createInternalLiveIntelligencePorts(input.capability, input.providerAudit);
  const result = await runFiservInternalAnalysisEvaluationV1({
    statementPaths: [path.resolve(process.cwd(), STATEMENT_ONE_INTERNAL_LIVE_PROFILE.statementPath)],
    safeStatementId: STATEMENT_ONE_INTERNAL_LIVE_PROFILE.safeStatementId,
    runVersion: STATEMENT_ONE_INTERNAL_LIVE_PROFILE.runVersion,
    outputDirectory: input.outputDirectory,
    sourceProfile: { statementCompleteness: "unknown" },
    internalRunId: input.runId,
    evaluatedAt: new Date().toISOString(),
    tenantRef: "ratereveal-internal-live-evaluation",
    accountRef: "statement-one-internal-evaluation",
    admittedKnowledge: [],
    publicSourceAuthorityAdmissions: [...PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS],
    ports,
    providerAudit: input.providerAudit,
    liveCapability: input.capability,
    providerPreflight: externalProviderConfiguration(),
  });
  return {
    executionStatus: result.analysis.executionStatus,
    researchOutcome: result.analysis.researchOutcome,
    artifactPath: path.join(input.outputDirectory, "internal-analysis.json"),
  };
}

function externalProviderConfiguration() {
  return {
    schemaVersion: "internal_provider_preflight_input_v1" as const,
    runMode: "internal_live_evaluation" as const,
    executionMode: "external_provider" as const,
    sourceAuthorityRegistryLoaded: true,
    search: { provider: "openrouter_web_search" as const, engine: "perplexity" as const, credentialPresent: true,
      modelConfigured: true, maxUses: 1 as const, maxToolCalls: 1 as const, resultCapBounded: true,
      fallbackProvidersAllowed: false as const, automaticRetries: 0 as const, timeoutSupported: true,
      abortSupported: true, oneAttemptTransport: true },
    models: { provider: "openai_responses_api" as const, credentialPresent: true, modelConfigured: true,
      structuredOutputSupported: true, outputTokenCeilingsSupported: true, automaticRetries: 0 as const,
      timeoutSupported: true, abortSupported: true, oneAttemptTransport: true },
    languageCapability: "disabled" as const,
    productOwnerLiveCallAuthorization: true,
  };
}

function statementOneProviderContexts(): ProviderSafeQuestionContextV1[] {
  return [
    { schemaVersion: "provider_safe_question_context_v1", providerContextId: `provider-context-${randomUUID()}`,
      questionClass: "application_fee_public_definition", claimType: "processor_term", subjectCode: "application_fee_terminology",
      safeResearchLabel: "application fee", questionText: "Does an eligible authoritative public processor, platform, or program source define application fee terminology for the relevant public product context and period, and exactly what does that source establish?",
      processorProgram: "fiserv_first_data", periodYear: "2024", allowedContext: "public_product_terminology_only" },
    { schemaVersion: "provider_safe_question_context_v1", providerContextId: `provider-context-${randomUUID()}`,
      questionClass: "non_swiped_discount_public_definition", claimType: "processor_term", subjectCode: "non_swiped_discount_terminology",
      safeResearchLabel: "non swiped discount", questionText: "Does an eligible authoritative public source define non swiped discount terminology, calculation, or program context, and exactly what remains account specific?",
      processorProgram: "fiserv_first_data", periodYear: "2024", allowedContext: "public_product_terminology_only" },
  ];
}

async function readMacOsKeychainCredential(service: string): Promise<string> {
  if (process.platform !== "darwin") throw new Error("internal_live_keychain_requires_macos");
  try {
    const { stdout } = await execFile("/usr/bin/security", ["find-generic-password", "-s", service, "-w"], {
      encoding: "utf8", maxBuffer: 16_384,
    });
    return stdout.replace(/[\r\n]+$/, "");
  } catch {
    throw new Error(`internal_live_keychain_entry_unavailable_${service.endsWith("OpenRouter") ? "openrouter" : "openai"}`);
  }
}

async function assertOutputRoot(outputRoot: string): Promise<string> {
  if (!path.isAbsolute(outputRoot) || outputRoot === path.parse(outputRoot).root || path.normalize(outputRoot) !== outputRoot) {
    throw new Error("internal_live_output_root_unsafe");
  }
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  await access(outputRoot, fsConstants.R_OK | fsConstants.W_OK);
  return realpath(outputRoot);
}

async function assertCommittedNetworkProfile(): Promise<void> {
  const profilePath = path.resolve(process.cwd(), "config/ratereveal-internal-live-network-profile.json");
  const parsed = JSON.parse(await readFile(profilePath, "utf8")) as Record<string, unknown>;
  const hosts = Array.isArray(parsed.allowedHosts) ? parsed.allowedHosts : [];
  const expected = ["api.openai.com", "merchants.fiserv.com", "openrouter.ai"];
  const requiredByRuntime = [new URL(APPROVED_OPENROUTER_ENDPOINT).hostname,
    new URL(APPROVED_OPENAI_ENDPOINT).hostname,
    ...PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS.map((admission) => new URL(admission.origin).hostname)];
  if (parsed.schemaVersion !== "ratereveal_internal_live_network_profile_v1" || parsed.mode !== "allowlist"
    || parsed.wildcardsAllowed !== false || parsed.registryOriginsAutoAllowed !== false
    || JSON.stringify([...hosts].sort()) !== JSON.stringify(expected)
    || hosts.some((host) => typeof host !== "string" || host.includes("*"))
    || requiredByRuntime.some((host) => !hosts.includes(host))) {
    throw new Error("internal_live_network_profile_invalid");
  }
}

async function allocateRunId(outputRoot: string, requested: string | null): Promise<string> {
  if (requested && requested !== "auto") {
    if (!new RegExp(`^${RUN_PREFIX}-\\d{3}$`).test(requested)) throw new Error("internal_live_run_id_invalid");
    await assertAbsent(path.join(outputRoot, requested));
    return requested;
  }
  const names = await readdir(outputRoot);
  const expression = new RegExp(`^${RUN_PREFIX}-(\\d{3})$`);
  const highest = names.reduce((maximum, name) => {
    const match = expression.exec(name);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  if (highest >= 999) throw new Error("internal_live_run_id_exhausted");
  return `${RUN_PREFIX}-${String(highest + 1).padStart(3, "0")}`;
}

async function assertAbsent(target: string): Promise<void> {
  try { await access(target); throw new Error("internal_live_output_directory_exists"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

function assertCredential(value: string, service: string): void {
  if (value.length < 16 || /[\r\n\0]/.test(value)) {
    throw new Error(`internal_live_keychain_entry_invalid_${service.endsWith("OpenRouter") ? "openrouter" : "openai"}`);
  }
}

function sendCount(audit: ProviderOperationAuditLog): number {
  return audit.snapshot().reduce((total, receipt) => total + receipt.actualSendCount, 0);
}

function safeFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "internal_live_run_failed";
  return /^[a-z][a-z0-9_:,-]{0,180}$/.test(message) ? message : "internal_live_run_failed";
}

async function preserveSafeFailureArtifact(
  outputDirectory: string,
  runId: string,
  failureCode: string,
  providerSends: number,
  audit: ProviderOperationAuditLog,
): Promise<string | null> {
  try {
    await mkdir(outputDirectory, { recursive: false, mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const failurePath = path.join(outputDirectory, "live-run-failure.json");
    const safeReceipts = audit.snapshot().map((receipt) => ({ receiptId: receipt.receiptId, operation: receipt.operation,
      providerCode: receipt.providerCode, actualSendCount: receipt.actualSendCount, retryCount: receipt.retryCount,
      completionState: receipt.completionState, usageState: receipt.usageState, outputTokens: receipt.outputTokens,
      providerRequestCount: receipt.providerRequestCount, usageCostUsd: receipt.usageCostUsd, safeReasonCode: receipt.safeReasonCode }));
    await writeFile(failurePath, `${JSON.stringify({ schemaVersion: "internal_live_run_failure_v1", runId,
      executionStatus: "failed", researchOutcome: "research_unavailable", safeFailureCode: failureCode,
      externalSendCount: providerSends, providerReceipts: safeReceipts }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    return failurePath;
  } catch {
    return null;
  }
}

function parseArguments(argv: string[]): InternalLiveRunnerArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) throw new Error("internal_live_cli_arguments_invalid");
    values.set(key.slice(2), value);
  }
  const allowed = new Set(["profile", "authorization", "run-id", "output-root"]);
  if ([...values.keys()].some((key) => !allowed.has(key))) throw new Error("internal_live_cli_arguments_invalid");
  return { profile: values.get("profile") ?? null, authorization: values.get("authorization") ?? null,
    runId: values.get("run-id") ?? "auto", outputRoot: values.get("output-root") ?? DEFAULT_OUTPUT_ROOT };
}

async function main(): Promise<void> {
  let code = 1;
  try { code = await runInternalLiveRunner(parseArguments(process.argv.slice(2))); }
  catch (error) {
    process.stdout.write("executionStatus: failed\nresearchOutcome: not_started\nProvider sends: 0\n");
    process.stdout.write(`Safe failure code: ${safeFailureCode(error)}\n`);
  }
  process.exitCode = code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
