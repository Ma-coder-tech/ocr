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
  ProviderReadinessDiagnosticLog,
  ProviderOperationAuditLog,
  buildStatementObservationInvestigationOrigins,
  inspectFiservOneStatementEvaluation,
  runFiservOneStatementEvaluation,
  runProviderReadinessProbe,
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
const REPOSITORY_BRANCH = "codex/e2e-internal-analysis-v1";
export const KEYCHAIN_READ_TIMEOUT_MS = 120_000;

type RunnerMode = "live" | "readiness" | "provider-readiness";
type KeychainService = typeof OPENROUTER_SERVICE | typeof OPENAI_SERVICE;
type KeychainFailureCategory = "keychain_entry_missing" | "keychain_access_denied_or_cancelled"
  | "keychain_locked" | "keychain_broker_timeout" | "keychain_read_failed";

export class KeychainBrokerError extends Error {
  constructor(public readonly service: KeychainService, public readonly category: KeychainFailureCategory) {
    super(`internal_live_${category}_${serviceCode(service)}`);
  }
}

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

export const STATEMENT_TWO_DETERMINISTIC_FAMILY_PROFILE = Object.freeze({
  profileCode: "statement-two",
  safeStatementId: "fsv-01-clover-full-oct",
  runVersion: "run-2-template-aware-review-corrected",
  statementPath: "test/fixtures/pdfs/SAMPLE_MERCHANT4_CLOVER.pdf",
  requiredFamily: "fiserv_first_data_full_statement",
  requiredAdmissionMapping: "fiserv_first_data_full_statement",
  runPrefix: "statement-two-internal-evaluation",
  sourceCompleteness: "unknown" as const,
  providerExecution: "prohibited_no_frozen_planner_questions" as const,
});

type DeterministicAdmittedFamilyProfile = typeof STATEMENT_TWO_DETERMINISTIC_FAMILY_PROFILE;
const DETERMINISTIC_ADMITTED_FAMILY_PROFILES = new Map<string, DeterministicAdmittedFamilyProfile>([
  [STATEMENT_TWO_DETERMINISTIC_FAMILY_PROFILE.profileCode, STATEMENT_TWO_DETERMINISTIC_FAMILY_PROFILE],
]);

export type InternalLiveRunnerDependencies = {
  readCredential(service: KeychainService, signal: AbortSignal): Promise<string>;
  keychainReadTimeoutMs: number;
  checkRepositoryState(): Promise<void>;
  checkNetworkProfile(): Promise<void>;
  observeCredentialState(state: { openRouterPresent: boolean; openAiPresent: boolean }): void;
  execute(input: {
    runId: string;
    outputDirectory: string;
    capability: InternalLiveExecutionCapabilityV1;
    providerAudit: ProviderOperationAuditLog;
  }): Promise<{ executionStatus: string; researchOutcome: string; artifactPath: string }>;
  executeProviderReadiness(input: {
    runId: string;
    capability: InternalLiveExecutionCapabilityV1;
    providerAudit: ProviderOperationAuditLog;
    readinessDiagnostics: ProviderReadinessDiagnosticLog;
  }): ReturnType<typeof runProviderReadinessProbe>;
  executeDeterministicFamily(input: {
    runId: string;
    outputDirectory: string;
    profile: DeterministicAdmittedFamilyProfile;
  }): Promise<{ executionStatus: string; researchOutcome: string; artifactPath: string }>;
  log(line: string): void;
};

export type InternalLiveRunnerArguments = {
  mode?: RunnerMode;
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
  const deterministicFamilyProfile = args.profile ? DETERMINISTIC_ADMITTED_FAMILY_PROFILES.get(args.profile) : undefined;
  if (deterministicFamilyProfile) {
    return runDeterministicAdmittedFamilyProfile(args, deterministicFamilyProfile, overrides, log);
  }
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

  let outputRoot = "";
  let lockPath = "";
  let lock: Awaited<ReturnType<typeof open>> | null = null;
  let runId = "unallocated";
  let outputDirectory = "";
  let openRouterKey = "";
  let openAiKey = "";
  const providerAudit = new ProviderOperationAuditLog();
  const readinessDiagnostics = new ProviderReadinessDiagnosticLog();
  const observeCredentialState = overrides.observeCredentialState ?? (() => undefined);
  try {
    await (overrides.checkRepositoryState ?? assertRepositoryState)();
    await (overrides.checkNetworkProfile ?? assertCommittedNetworkProfile)();
    outputRoot = await assertOutputRoot(args.outputRoot);
    await assertRequestedRunIdAvailable(outputRoot, args.runId);

    const credentials = await readCredentialsSerially(
      overrides.readCredential ?? readMacOsKeychainCredential,
      observeCredentialState,
      overrides.keychainReadTimeoutMs ?? KEYCHAIN_READ_TIMEOUT_MS,
    );
    openRouterKey = credentials.openRouterKey;
    openAiKey = credentials.openAiKey;
    assertCredential(openRouterKey, OPENROUTER_SERVICE);
    assertCredential(openAiKey, OPENAI_SERVICE);
    process.env.OPENROUTER_API_KEY = openRouterKey;
    process.env.OPENAI_API_KEY = openAiKey;
    process.env.OPENROUTER_SEARCH_MODEL = STATEMENT_ONE_INTERNAL_LIVE_PROFILE.searchModel;
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = STATEMENT_ONE_INTERNAL_LIVE_PROFILE.openAiModel;

    const preflightRunId = args.mode === "provider-readiness"
      ? `provider-readiness-${randomUUID()}` : `internal-live-readiness-${randomUUID()}`;
    const preflightCapability = await constructLiveCapability(preflightRunId, outputRoot,
      args.mode === "provider-readiness" ? providerReadinessContexts() : statementOneProviderContexts());
    if (args.mode === "readiness") {
      log("executionStatus: readiness_passed");
      log("researchOutcome: not_started");
      log("Credential readiness: passed; serial Keychain reads completed");
      log("Preflight: passed; zero external sends");
      log("Provider sends: 0");
      return 0;
    }
    if (args.mode === "provider-readiness") {
      runId = preflightRunId;
      const capability = preflightCapability;
      log("Preflight: passed; zero external sends");
      log(`Provider readiness run ID: ${runId}`);
      log("Statement analysis executed: no");
      log("Private statement data provider-bound: no");
      log("Retries: 0; fallback: disabled; adaptive search: disabled; language call: disabled");
      log("Provider sends: 0");
      try {
        const probe = await (overrides.executeProviderReadiness ?? ((input) => runProviderReadinessProbe(
          input.runId, input.capability, input.providerAudit, input.readinessDiagnostics)))({
          runId, capability, providerAudit, readinessDiagnostics,
        });
        log(`OpenRouter readiness: ${probe.openRouter.status}; tool execution: ${probe.openRouter.toolExecutionState}; candidates: ${probe.openRouter.candidateCount}`);
        log(`Investigative OpenAI readiness: ${probe.investigativeOpenAi.status}; structured output: ${probe.investigativeOpenAi.structuredOutputValidation}`);
        log(`Semantic OpenAI readiness: ${probe.semanticOpenAi.status}; structured output: ${probe.semanticOpenAi.structuredOutputValidation}`);
        log(`Safe provider-readiness diagnostics: ${JSON.stringify(probe.diagnostics)}`);
        log(`Provider sends: ${sendCount(providerAudit)}`);
        log("Statement analysis executed: no");
        log("Numbered Statement run created: no");
        log(`Safe provider receipts: ${JSON.stringify(providerAudit.snapshot())}`);
        log("executionStatus: provider_readiness_passed");
        log("researchOutcome: not_started");
        return 0;
      } catch (error) {
        log(`Safe provider-readiness diagnostics: ${JSON.stringify(readinessDiagnostics.snapshot())}`);
        log(`Safe provider receipts: ${JSON.stringify(providerAudit.snapshot())}`);
        throw error;
      }
    }

    lockPath = path.join(outputRoot, `.${RUN_PREFIX}.lock`);
    lock = await open(lockPath, "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") throw new Error("internal_live_run_allocation_locked");
      throw error;
    });
    runId = await allocateRunId(outputRoot, args.runId);
    outputDirectory = path.join(outputRoot, runId);
    await assertAbsent(outputDirectory);
    const capability = await constructLiveCapability(runId, outputRoot, statementOneProviderContexts());
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
    log(`researchOutcome: ${outputDirectory ? "research_unavailable" : "not_started"}`);
    log(`Provider sends: ${sends}`);
    log(`Safe failure code: ${safeCode}`);
    if (failurePath) log(`Failure artifact: ${failurePath}`);
    return 1;
  } finally {
    openRouterKey = "";
    openAiKey = "";
    observeCredentialState({ openRouterPresent: false, openAiPresent: false });
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

async function runDeterministicAdmittedFamilyProfile(
  args: InternalLiveRunnerArguments,
  profile: DeterministicAdmittedFamilyProfile,
  overrides: Partial<InternalLiveRunnerDependencies>,
  log: (line: string) => void,
): Promise<number> {
  if (args.authorization !== AUTHORIZATION_TOKEN) {
    log("executionStatus: cancelled");
    log("researchOutcome: not_started");
    log("Provider sends: 0");
    log("Keychain accesses: 0");
    log("Safe reason: exact_product_owner_authorization_required");
    return 2;
  }
  if (args.mode === "provider-readiness") {
    log("executionStatus: cancelled");
    log("researchOutcome: not_started");
    log("Provider sends: 0");
    log("Keychain accesses: 0");
    log("Safe reason: deterministic_family_profile_has_no_provider_questions");
    return 2;
  }

  let lock: Awaited<ReturnType<typeof open>> | null = null;
  let lockPath = "";
  try {
    await (overrides.checkRepositoryState ?? assertRepositoryState)();
    await (overrides.checkNetworkProfile ?? assertCommittedNetworkProfile)();
    const outputRoot = await assertOutputRoot(args.outputRoot);
    await assertRequestedRunIdAvailableForPrefix(outputRoot, args.runId, profile.runPrefix);
    const inspected = await inspectFiservOneStatementEvaluation({
      statementPaths: [path.resolve(process.cwd(), profile.statementPath)],
      safeStatementId: profile.safeStatementId,
      sourceProfile: { statementCompleteness: profile.sourceCompleteness },
    });
    if (!inspected.admission || inspected.admission.mappingId !== profile.requiredAdmissionMapping
      || inspected.identity.statementFamily !== profile.requiredFamily
      || inspected.admissionEvaluation.fullFamilyDecision.matched !== true) {
      throw new Error("internal_live_deterministic_family_admission_failed");
    }
    const planner = buildStatementObservationInvestigationOrigins({ foundation: inspected.foundation, admittedKnowledge: [],
      tenantRef: "ratereveal-internal-live-evaluation", accountRef: "deterministic-family-profile" });
    if (planner.origins.length !== 0 || planner.providerContexts.length !== 0) {
      throw new Error("internal_live_deterministic_family_research_model_expansion_required");
    }
    log(`Admission preflight: ${inspected.admission.mappingId}@${inspected.admission.mappingVersion}; passed`);
    log(`Family: ${String(inspected.identity.statementFamily)}`);
    log(`Admission reasons: ${inspected.admissionEvaluation.fullFamilyDecision.reasonCodes.join(", ")}`);
    log("Frozen planner questions: none");
    log("Preflight: passed; zero external sends");
    log("Provider sends: 0");
    log("Keychain accesses: 0");
    if (args.mode === "readiness") {
      log("executionStatus: readiness_passed");
      log("researchOutcome: no_eligible_public_research_questions");
      return 0;
    }

    lockPath = path.join(outputRoot, `.${profile.runPrefix}.lock`);
    lock = await open(lockPath, "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") throw new Error("internal_live_run_allocation_locked");
      throw error;
    });
    const runId = await allocateRunIdForPrefix(outputRoot, args.runId, profile.runPrefix);
    const outputDirectory = path.join(outputRoot, runId);
    await assertAbsent(outputDirectory);
    log(`Run ID: ${runId}`);
    log(`Profile: ${profile.profileCode}`);
    log(`Statement: ${profile.safeStatementId}`);
    log("Execution scope: deterministic RB/RC/RD/RE/RH; provider execution prohibited by current frozen planner");
    const execute = overrides.executeDeterministicFamily ?? executeDeterministicFamily;
    const result = await execute({ runId, outputDirectory, profile });
    log(`executionStatus: ${result.executionStatus}`);
    log(`researchOutcome: ${result.researchOutcome}`);
    log("Provider sends: 0");
    log("Keychain accesses: 0");
    log(`Artifact directory: ${outputDirectory}`);
    log(`Summary artifact: ${result.artifactPath}`);
    return result.executionStatus === "completed" ? 0 : 1;
  } catch (error) {
    log("executionStatus: failed");
    log("researchOutcome: not_started");
    log("Provider sends: 0");
    log("Keychain accesses: 0");
    log(`Safe failure code: ${safeFailureCode(error)}`);
    return 1;
  } finally {
    if (lock) {
      await lock.close().catch(() => undefined);
      await unlink(lockPath).catch(() => undefined);
    }
  }
}

async function executeDeterministicFamily(input: {
  runId: string;
  outputDirectory: string;
  profile: DeterministicAdmittedFamilyProfile;
}): Promise<{ executionStatus: string; researchOutcome: string; artifactPath: string }> {
  const result = await runFiservOneStatementEvaluation({
    statementPaths: [path.resolve(process.cwd(), input.profile.statementPath)],
    safeStatementId: input.profile.safeStatementId,
    runVersion: input.profile.runVersion,
    outputDirectory: input.outputDirectory,
    sourceProfile: { statementCompleteness: input.profile.sourceCompleteness },
  });
  if (!result.audit.admission || result.audit.admission.mappingId !== input.profile.requiredAdmissionMapping) {
    throw new Error("internal_live_deterministic_family_admission_changed_after_preflight");
  }
  return { executionStatus: "completed", researchOutcome: "no_eligible_public_research_questions",
    artifactPath: path.join(input.outputDirectory, "rh-projection.json") };
}

async function constructLiveCapability(runId: string, outputRoot: string, questionContexts: ProviderSafeQuestionContextV1[]): Promise<InternalLiveExecutionCapabilityV1> {
  return createInternalLiveExecutionCapability({
    schemaVersion: "internal_live_preflight_input_v1",
    runMode: "internal_live_evaluation",
    runId,
    outputRoot,
    productOwnerLiveCallAuthorization: true,
    approvedOpenRouterSearchModel: STATEMENT_ONE_INTERNAL_LIVE_PROFILE.searchModel,
    approvedOpenAiModel: STATEMENT_ONE_INTERNAL_LIVE_PROFILE.openAiModel,
    sourceAuthorityAdmissions: [...PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS],
    questionContexts,
    languageCapability: "disabled",
  });
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

function providerReadinessContexts(): ProviderSafeQuestionContextV1[] {
  return [{ schemaVersion: "provider_safe_question_context_v1", providerContextId: `provider-context-${randomUUID()}`,
    questionClass: "application_fee_public_definition", claimType: "processor_term", subjectCode: "application_fee_terminology",
    safeResearchLabel: "application fee", questionText: "Does public documentation define application fee terminology for a public product context?",
    processorProgram: null, periodYear: "2026", allowedContext: "public_product_terminology_only" }];
}

async function readCredentialsSerially(
  reader: InternalLiveRunnerDependencies["readCredential"],
  observe: InternalLiveRunnerDependencies["observeCredentialState"],
  timeoutMs: number,
): Promise<{ openRouterKey: string; openAiKey: string }> {
  let openRouterKey = "";
  let openAiKey = "";
  try {
    openRouterKey = await readCredentialWithTimeout(reader, OPENROUTER_SERVICE, timeoutMs);
    assertCredential(openRouterKey, OPENROUTER_SERVICE);
    observe({ openRouterPresent: true, openAiPresent: false });
    openAiKey = await readCredentialWithTimeout(reader, OPENAI_SERVICE, timeoutMs);
    assertCredential(openAiKey, OPENAI_SERVICE);
    observe({ openRouterPresent: true, openAiPresent: true });
    return { openRouterKey, openAiKey };
  } catch (error) {
    openRouterKey = "";
    openAiKey = "";
    observe({ openRouterPresent: false, openAiPresent: false });
    throw error;
  }
}

async function readCredentialWithTimeout(
  reader: InternalLiveRunnerDependencies["readCredential"],
  service: KeychainService,
  timeoutMs: number,
): Promise<string> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("internal_live_keychain_timeout_invalid");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<string>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new KeychainBrokerError(service, "keychain_broker_timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([reader(service, controller.signal), timeout]);
  } catch (error) {
    if (error instanceof KeychainBrokerError) throw error;
    if (controller.signal.aborted) throw new KeychainBrokerError(service, "keychain_broker_timeout");
    throw new KeychainBrokerError(service, "keychain_read_failed");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readMacOsKeychainCredential(service: KeychainService, signal: AbortSignal): Promise<string> {
  if (process.platform !== "darwin") throw new Error("internal_live_keychain_requires_macos");
  try {
    const { stdout } = await execFile("/usr/bin/security", ["find-generic-password", "-s", service, "-w"], {
      encoding: "utf8", maxBuffer: 16_384, signal,
    });
    return stdout.replace(/[\r\n]+$/, "");
  } catch (error) {
    throw classifyKeychainCommandFailure(error, service, signal.aborted);
  }
}

export function classifyKeychainCommandFailure(
  error: unknown,
  service: KeychainService,
  timedOut = false,
): KeychainBrokerError {
  if (timedOut) return new KeychainBrokerError(service, "keychain_broker_timeout");
  const commandError = error as { code?: string | number; stderr?: string | Buffer };
  const code = String(commandError?.code ?? "").toLowerCase();
  const stderr = (typeof commandError?.stderr === "string" ? commandError.stderr
    : Buffer.isBuffer(commandError?.stderr) ? commandError.stderr.toString("utf8") : "").toLowerCase();
  if (code === "44" || /specified item could not be found|errsecitemnotfound/.test(stderr)) {
    return new KeychainBrokerError(service, "keychain_entry_missing");
  }
  if (code === "128" || /user cancel(?:ed|led)|authorization (?:was )?denied|access denied/.test(stderr)) {
    return new KeychainBrokerError(service, "keychain_access_denied_or_cancelled");
  }
  if (code === "36" || /keychain (?:is )?locked|interaction is not allowed|errsecinteractionnotallowed/.test(stderr)) {
    return new KeychainBrokerError(service, "keychain_locked");
  }
  return new KeychainBrokerError(service, "keychain_read_failed");
}

function serviceCode(service: KeychainService): "openrouter" | "openai" {
  return service === OPENROUTER_SERVICE ? "openrouter" : "openai";
}

async function assertRepositoryState(): Promise<void> {
  try {
    const [{ stdout: branch }, { stdout: status }, { stdout: head }, { stdout: remoteHead }] = await Promise.all([
      execFile("git", ["branch", "--show-current"], { encoding: "utf8", maxBuffer: 16_384 }),
      execFile("git", ["status", "--porcelain=v1"], { encoding: "utf8", maxBuffer: 1_048_576 }),
      execFile("git", ["rev-parse", "HEAD"], { encoding: "utf8", maxBuffer: 16_384 }),
      execFile("git", ["rev-parse", `origin/${REPOSITORY_BRANCH}`], { encoding: "utf8", maxBuffer: 16_384 }),
    ]);
    if (branch.trim() !== REPOSITORY_BRANCH) throw new Error("internal_live_repository_branch_invalid");
    if (status !== "") throw new Error("internal_live_repository_worktree_dirty");
    if (head.trim() !== remoteHead.trim()) throw new Error("internal_live_repository_remote_head_mismatch");
  } catch (error) {
    if (error instanceof Error && /^internal_live_repository_/.test(error.message)) throw error;
    throw new Error("internal_live_repository_state_unavailable");
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

async function assertRequestedRunIdAvailable(outputRoot: string, requested: string | null): Promise<void> {
  if (!requested || requested === "auto") return;
  if (!new RegExp(`^${RUN_PREFIX}-\\d{3}$`).test(requested)) throw new Error("internal_live_run_id_invalid");
  await assertAbsent(path.join(outputRoot, requested));
}

async function assertRequestedRunIdAvailableForPrefix(outputRoot: string, requested: string | null, prefix: string): Promise<void> {
  if (!requested || requested === "auto") return;
  if (!new RegExp(`^${prefix}-\\d{3}$`).test(requested)) throw new Error("internal_live_run_id_invalid");
  await assertAbsent(path.join(outputRoot, requested));
}

async function assertCommittedNetworkProfile(): Promise<void> {
  const profilePath = path.resolve(process.cwd(), "config/ratereveal-internal-live-network-profile.json");
  const parsed = JSON.parse(await readFile(profilePath, "utf8")) as Record<string, unknown>;
  const hosts = Array.isArray(parsed.allowedHosts) ? parsed.allowedHosts : [];
  const expected = ["api.openai.com", "merchants.fiserv.com", "openrouter.ai", "support.cardpointe.com"];
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

async function allocateRunIdForPrefix(outputRoot: string, requested: string | null, prefix: string): Promise<string> {
  if (requested && requested !== "auto") {
    if (!new RegExp(`^${prefix}-\\d{3}$`).test(requested)) throw new Error("internal_live_run_id_invalid");
    await assertAbsent(path.join(outputRoot, requested));
    return requested;
  }
  const names = await readdir(outputRoot);
  const expression = new RegExp(`^${prefix}-(\\d{3})$`);
  const highest = names.reduce((maximum, name) => {
    const match = expression.exec(name);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  if (highest >= 999) throw new Error("internal_live_run_id_exhausted");
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
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
      providerRequestCount: receipt.providerRequestCount, usageCostUsd: receipt.usageCostUsd,
      providerConfigurationCode: receipt.providerConfigurationCode, httpStatus: receipt.httpStatus,
      localRequestId: receipt.localRequestId, providerRequestId: receipt.providerRequestId, providerResponseId: receipt.providerResponseId,
      requestedModelIdentifier: receipt.requestedModelIdentifier, returnedModelIdentifier: receipt.returnedModelIdentifier,
      finishReason: receipt.finishReason, toolExecutionState: receipt.toolExecutionState,
      annotationCount: receipt.annotationCount, normalizedCandidateCount: receipt.normalizedCandidateCount,
      providerErrorType: receipt.providerErrorType, providerErrorCode: receipt.providerErrorCode,
      providerErrorParam: receipt.providerErrorParam, structuredOutputValidation: receipt.structuredOutputValidation,
      safeReasonCode: receipt.safeReasonCode }));
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
  const allowed = new Set(["mode", "profile", "authorization", "run-id", "output-root"]);
  if ([...values.keys()].some((key) => !allowed.has(key))) throw new Error("internal_live_cli_arguments_invalid");
  const mode = values.get("mode") ?? "live";
  if (mode !== "live" && mode !== "readiness" && mode !== "provider-readiness") throw new Error("internal_live_cli_mode_invalid");
  return { mode, profile: values.get("profile") ?? null, authorization: values.get("authorization") ?? null,
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
