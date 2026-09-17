import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  classifyKeychainCommandFailure,
  KEYCHAIN_READ_TIMEOUT_MS,
  KeychainBrokerError,
  runInternalLiveRunner,
  STATEMENT_ONE_INTERNAL_LIVE_PROFILE,
  STATEMENT_TWO_DETERMINISTIC_FAMILY_PROFILE,
} from "../../../../scripts/run-fiserv-internal-live-evaluation.js";

const syntheticStaticChecks = {
  checkRepositoryState: async () => undefined,
  checkNetworkProfile: async () => undefined,
};

describe("durable internal live runner", () => {
  it("cancels with zero sends before output allocation or Keychain access", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-cancel-"));
    const outputRoot = path.join(parent, "runs");
    const lines: string[] = [];
    let credentialReads = 0;
    const code = await runInternalLiveRunner({ profile: "statement-one", authorization: "NO", runId: "auto", outputRoot }, {
      log: (line) => lines.push(line),
      readCredential: async () => { credentialReads += 1; return "should-never-be-read"; },
    });
    expect(code).toBe(2);
    expect(credentialReads).toBe(0);
    expect(lines).toEqual(expect.arrayContaining(["executionStatus: cancelled", "Provider sends: 0"]));
    await expect(readdir(outputRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the Statement-2 family profile fail-closed once registered questions exist", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-statement-two-"));
    const outputRoot = path.join(parent, "runs");
    const lines: string[] = [];
    let credentialReads = 0;
    const code = await runInternalLiveRunner({ mode: "readiness",
      profile: "statement-two",
      authorization: "product-owner-approved",
      runId: "auto",
      outputRoot,
    }, {
      ...syntheticStaticChecks,
      log: (line) => lines.push(line),
      readCredential: async () => { credentialReads += 1; return "should-never-be-read"; },
    });
    expect(code).toBe(1);
    expect(credentialReads).toBe(0);
    expect(lines).toEqual(expect.arrayContaining([
      "executionStatus: failed",
      "researchOutcome: not_started",
      "Provider sends: 0",
      "Keychain accesses: 0",
      "Safe failure code: internal_live_deterministic_family_research_model_expansion_required",
    ]));
    expect(await readdir(outputRoot)).toEqual([]);
    expect(STATEMENT_TWO_DETERMINISTIC_FAMILY_PROFILE).toMatchObject({
      profileCode: "statement-two",
      requiredFamily: "fiserv_first_data_full_statement",
      requiredAdmissionMapping: "fiserv_first_data_full_statement",
      providerExecution: "prohibited_no_frozen_planner_questions",
    });
  }, 30_000);

  it("does not execute a deterministic-family run after the expanded planner creates questions", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-full-family-"));
    const lines: string[] = [];
    let credentialReads = 0;
    let executions = 0;
    const code = await runInternalLiveRunner({ profile: "statement-two", authorization: "product-owner-approved",
      runId: "auto", outputRoot }, {
      ...syntheticStaticChecks,
      log: (line) => lines.push(line),
      readCredential: async () => { credentialReads += 1; return "must-not-read"; },
      executeDeterministicFamily: async ({ runId, outputDirectory, profile }) => {
        executions += 1;
        expect(runId).toBe("statement-two-internal-evaluation-001");
        expect(profile.requiredAdmissionMapping).toBe("fiserv_first_data_full_statement");
        await mkdir(outputDirectory, { mode: 0o700 });
        await writeFile(path.join(outputDirectory, "rh-projection.json"), "{\"safe\":true}\n", { mode: 0o600 });
        return { executionStatus: "completed", researchOutcome: "no_eligible_public_research_questions",
          artifactPath: path.join(outputDirectory, "rh-projection.json") };
      },
    });
    expect(code).toBe(1);
    expect(executions).toBe(0);
    expect(credentialReads).toBe(0);
    expect(lines).toEqual(expect.arrayContaining([
      "Provider sends: 0",
      "Keychain accesses: 0",
      "executionStatus: failed",
      "Safe failure code: internal_live_deterministic_family_research_model_expansion_required",
    ]));
  });

  it("fails static repository readiness before output allocation or Keychain access", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-repository-state-"));
    const outputRoot = path.join(parent, "runs");
    const lines: string[] = [];
    let credentialReads = 0;
    const code = await runInternalLiveRunner({ mode: "readiness", profile: "statement-one",
      authorization: "product-owner-approved", runId: "auto", outputRoot }, {
      checkRepositoryState: async () => { throw new Error("internal_live_repository_worktree_dirty"); },
      log: (line) => lines.push(line),
      readCredential: async () => { credentialReads += 1; return "should-never-be-read"; },
    });
    expect(code).toBe(1);
    expect(credentialReads).toBe(0);
    expect(lines).toContain("Safe failure code: internal_live_repository_worktree_dirty");
    expect(lines).toContain("Provider sends: 0");
    await expect(readdir(outputRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reaches construction-bound preflight with injected credentials and retains no secret", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-preflight-"));
    const lines: string[] = [];
    const secret = "synthetic-key-never-persist-123456789";
    let executed = 0;
    const credentialServices: string[] = [];
    const credentialStates: Array<{ openRouterPresent: boolean; openAiPresent: boolean }> = [];
    const code = await runInternalLiveRunner({ profile: "statement-one", authorization: "product-owner-approved",
      runId: "auto", outputRoot }, {
      ...syntheticStaticChecks,
      log: (line) => lines.push(line),
      readCredential: async (service) => { credentialServices.push(service); return secret; },
      observeCredentialState: (state) => credentialStates.push(state),
      execute: async ({ runId, outputDirectory }) => {
        executed += 1;
        expect(runId).toBe("statement-one-live-internal-evaluation-001");
        expect(STATEMENT_ONE_INTERNAL_LIVE_PROFILE).toMatchObject({
          profileCode: "statement-one",
          safeStatementId: "fsv-03-clover-short-jun",
          statementPath: "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
          periodYear: "2024",
          searchModel: "openai/gpt-5.2",
          openAiModel: "gpt-5.6-sol",
          automaticRetries: 0,
          fallbackProvidersAllowed: false,
        });
        await mkdir(outputDirectory, { mode: 0o700 });
        await writeFile(path.join(outputDirectory, "internal-analysis.json"), "{\"safe\":true}\n", { mode: 0o600 });
        return { executionStatus: "completed", researchOutcome: "research_completed",
          artifactPath: path.join(outputDirectory, "internal-analysis.json") };
      },
    });
    expect(code).toBe(0);
    expect(executed).toBe(1);
    expect(credentialServices).toEqual(["RateReveal/OpenRouter", "RateReveal/OpenAI"]);
    expect(credentialStates).toEqual(expect.arrayContaining([
      { openRouterPresent: true, openAiPresent: false },
      { openRouterPresent: true, openAiPresent: true },
      { openRouterPresent: false, openAiPresent: false },
    ]));
    expect(lines).toEqual(expect.arrayContaining([
      "Preflight: passed; zero external sends", "Provider sends: 0", "executionStatus: completed",
      "researchOutcome: research_completed",
    ]));
    const persisted = `${lines.join("\n")}\n${await readFile(path.join(outputRoot,
      "statement-one-live-internal-evaluation-001/internal-analysis.json"), "utf8")}`;
    expect(persisted).not.toContain(secret);
    expect(process.env.OPENROUTER_API_KEY).toBeUndefined();
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
  });

  it("refuses an existing run ID without reading credentials or modifying the run", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-collision-"));
    const runId = "statement-one-live-internal-evaluation-003";
    const existing = path.join(outputRoot, runId);
    await mkdir(existing);
    await writeFile(path.join(existing, "preserved.txt"), "preserve-me\n");
    const lines: string[] = [];
    let credentialReads = 0;
    const code = await runInternalLiveRunner({ profile: "statement-one", authorization: "product-owner-approved",
      runId, outputRoot }, { log: (line) => lines.push(line),
      ...syntheticStaticChecks,
      readCredential: async () => { credentialReads += 1; return "not-readable-synthetic-secret"; } });
    expect(code).toBe(1);
    expect(credentialReads).toBe(0);
    expect(await readdir(existing)).toEqual(["preserved.txt"]);
    expect(await readFile(path.join(existing, "preserved.txt"), "utf8")).toBe("preserve-me\n");
    expect(lines).toContain("Provider sends: 0");
  });

  it("performs readiness with strictly serial Keychain reads, preflight, and zero sends", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-readiness-"));
    const lines: string[] = [];
    const services: string[] = [];
    let resolveOpenRouter: ((value: string) => void) | undefined;
    const openRouterPending = new Promise<string>((resolve) => { resolveOpenRouter = resolve; });
    let openAiStarted = false;
    let executed = 0;
    const running = runInternalLiveRunner({ mode: "readiness", profile: "statement-one",
      authorization: "product-owner-approved", runId: "auto", outputRoot }, {
      ...syntheticStaticChecks,
      log: (line) => lines.push(line),
      readCredential: async (service) => {
        services.push(service);
        if (service === "RateReveal/OpenRouter") return openRouterPending;
        openAiStarted = true;
        return "synthetic-openai-readiness-key-123456789";
      },
      execute: async () => {
        executed += 1;
        throw new Error("readiness_must_not_execute_analysis");
      },
    });
    await vi.waitFor(() => expect(services).toEqual(["RateReveal/OpenRouter"]));
    expect(openAiStarted).toBe(false);
    resolveOpenRouter!("synthetic-openrouter-readiness-key-123456789");
    await vi.waitFor(() => expect(openAiStarted).toBe(true));
    expect(await running).toBe(0);
    expect(services).toEqual(["RateReveal/OpenRouter", "RateReveal/OpenAI"]);
    expect(executed).toBe(0);
    expect(lines).toEqual(expect.arrayContaining([
      "executionStatus: readiness_passed",
      "researchOutcome: not_started",
      "Preflight: passed; zero external sends",
      "Provider sends: 0",
    ]));
    expect(await readdir(outputRoot)).toEqual([]);
  });

  it("runs provider-readiness without allocating a numbered Statement directory", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-provider-readiness-"));
    const lines: string[] = []; let statementExecutions = 0; let probeExecutions = 0;
    const code = await runInternalLiveRunner({ mode: "provider-readiness", profile: "statement-one",
      authorization: "product-owner-approved", runId: "auto", outputRoot }, {
      ...syntheticStaticChecks,
      log: (line) => lines.push(line),
      readCredential: async (service) => service.endsWith("OpenRouter")
        ? "synthetic-openrouter-readiness-key-123456789" : "synthetic-openai-readiness-key-123456789",
      execute: async () => { statementExecutions += 1; throw new Error("statement_must_not_execute"); },
      executeProviderReadiness: async ({ runId, providerAudit }) => {
        probeExecutions += 1;
        for (const [index, operation] of (["search", "investigative_model", "semantic_model"] as const).entries()) {
          providerAudit.record({ receiptId: `readiness-receipt-${index}`, reservationId: `readiness-operation-${index}:call`,
            operationId: `readiness-operation-${index}`, operation, providerCode: operation === "search" ? "openrouter_web_search" : "openai_responses_api",
            logicalAttempt: 1, actualSendCount: 1, retryCount: 0, sendState: "sent", completionState: "completed", elapsedMs: 1,
            usageState: "known", outputTokens: 1, providerRequestCount: operation === "search" ? 1 : null, usageCostUsd: null,
            providerConfigurationCode: "synthetic_readiness_test", httpStatus: 200, localRequestId: `local-${index}`,
            providerRequestId: `request-${index}`, providerResponseId: `response-${index}`, requestedModelIdentifier: "synthetic-model",
            returnedModelIdentifier: "synthetic-model", finishReason: operation === "search" ? "stop" : null,
            toolExecutionState: operation === "search" ? "verified" : null, annotationCount: operation === "search" ? 1 : null,
            normalizedCandidateCount: operation === "search" ? 1 : null, providerErrorType: null, providerErrorCode: null,
            providerErrorParam: null, structuredOutputValidation: operation === "search" ? "not_applicable" : "passed",
            safeReasonCode: "synthetic_readiness_completed" });
        }
        return { schemaVersion: "provider_readiness_probe_result_v1", runId, statementAnalysisExecuted: false,
          privateStatementDataProviderBound: false, openRouter: { status: "passed", candidateCount: 1, toolExecutionState: "verified" },
          investigativeOpenAi: { status: "passed", structuredOutputValidation: "passed" },
          semanticOpenAi: { status: "passed", structuredOutputValidation: "passed" },
          diagnostics: { schemaVersion: "provider_readiness_diagnostics_v1", semanticMemberValidationState: "passed",
            semanticMemberIssues: [], semanticMismatchDimensions: [], safeSemanticMemberProjection: null,
            semanticSupportValidationState: "passed", semanticSupportStatus: "wrong_authority",
            semanticSupportReasonCodes: ["semantic_source_authority_mismatch"] },
          receipts: providerAudit.snapshot() };
      },
    });
    expect(code).toBe(0); expect(statementExecutions).toBe(0); expect(probeExecutions).toBe(1);
    expect(lines).toEqual(expect.arrayContaining(["Provider sends: 0", "Provider sends: 3", "Statement analysis executed: no",
      "Numbered Statement run created: no", "executionStatus: provider_readiness_passed", "researchOutcome: not_started",
      expect.stringContaining('Safe provider-readiness diagnostics: {"schemaVersion":"provider_readiness_diagnostics_v1"') ]));
    expect(await readdir(outputRoot)).toEqual([]);
  });

  it("stops after a first-service failure and retains only a safe missing-entry classification", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-keychain-missing-"));
    const lines: string[] = [];
    const services: string[] = [];
    const code = await runInternalLiveRunner({ mode: "readiness", profile: "statement-one",
      authorization: "product-owner-approved", runId: "auto", outputRoot }, {
      ...syntheticStaticChecks,
      log: (line) => lines.push(line),
      readCredential: async (service) => {
        services.push(service);
        throw new KeychainBrokerError(service, "keychain_entry_missing");
      },
    });
    expect(code).toBe(1);
    expect(services).toEqual(["RateReveal/OpenRouter"]);
    expect(lines).toContain("Safe failure code: internal_live_keychain_entry_missing_openrouter");
    expect(lines).toContain("Provider sends: 0");
    expect(await readdir(outputRoot)).toEqual([]);
  });

  it("clears the first credential state when the second lookup is denied", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-keychain-second-failure-"));
    const lines: string[] = [];
    const secret = "synthetic-openrouter-cleared-after-failure-123456789";
    const states: Array<{ openRouterPresent: boolean; openAiPresent: boolean }> = [];
    const code = await runInternalLiveRunner({ mode: "readiness", profile: "statement-one",
      authorization: "product-owner-approved", runId: "auto", outputRoot }, {
      ...syntheticStaticChecks,
      log: (line) => lines.push(line),
      observeCredentialState: (state) => states.push(state),
      readCredential: async (service) => {
        if (service === "RateReveal/OpenRouter") return secret;
        throw new KeychainBrokerError(service, "keychain_access_denied_or_cancelled");
      },
    });
    expect(code).toBe(1);
    expect(states).toEqual([
      { openRouterPresent: true, openAiPresent: false },
      { openRouterPresent: false, openAiPresent: false },
      { openRouterPresent: false, openAiPresent: false },
    ]);
    expect(lines.join("\n")).not.toContain(secret);
    expect(lines).toContain("Safe failure code: internal_live_keychain_access_denied_or_cancelled_openai");
    expect(process.env.OPENROUTER_API_KEY).toBeUndefined();
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    expect(await readdir(outputRoot)).toEqual([]);
  });

  it("aborts a stalled lookup at the bounded broker timeout without starting the second lookup", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-keychain-timeout-"));
    const lines: string[] = [];
    const services: string[] = [];
    let aborted = false;
    const code = await runInternalLiveRunner({ mode: "readiness", profile: "statement-one",
      authorization: "product-owner-approved", runId: "auto", outputRoot }, {
      ...syntheticStaticChecks,
      keychainReadTimeoutMs: 10,
      log: (line) => lines.push(line),
      readCredential: async (service, signal) => {
        services.push(service);
        signal.addEventListener("abort", () => { aborted = true; }, { once: true });
        return new Promise<string>(() => undefined);
      },
    });
    expect(code).toBe(1);
    expect(aborted).toBe(true);
    expect(services).toEqual(["RateReveal/OpenRouter"]);
    expect(lines).toContain("Safe failure code: internal_live_keychain_broker_timeout_openrouter");
    expect(lines).toContain("Provider sends: 0");
    expect(await readdir(outputRoot)).toEqual([]);
    expect(KEYCHAIN_READ_TIMEOUT_MS).toBe(120_000);
  });

  it("maps only deterministic Keychain command signals into safe categories", () => {
    expect(classifyKeychainCommandFailure({ code: 44, stderr: "item missing" }, "RateReveal/OpenAI").message)
      .toBe("internal_live_keychain_entry_missing_openai");
    expect(classifyKeychainCommandFailure({ code: 128, stderr: "user canceled" }, "RateReveal/OpenAI").message)
      .toBe("internal_live_keychain_access_denied_or_cancelled_openai");
    expect(classifyKeychainCommandFailure({ code: 36, stderr: "interaction is not allowed" }, "RateReveal/OpenAI").message)
      .toBe("internal_live_keychain_locked_openai");
    expect(classifyKeychainCommandFailure({ code: 1, stderr: "unclassified failure detail" }, "RateReveal/OpenAI").message)
      .toBe("internal_live_keychain_read_failed_openai");
    expect(classifyKeychainCommandFailure(new Error("aborted"), "RateReveal/OpenAI", true).message)
      .toBe("internal_live_keychain_broker_timeout_openai");
  });

  it("defines an exact least-privilege network allowlist", async () => {
    const profile = JSON.parse(await readFile(path.resolve(process.cwd(),
      "config/ratereveal-internal-live-network-profile.json"), "utf8"));
    expect(profile).toMatchObject({ mode: "allowlist", wildcardsAllowed: false, registryOriginsAutoAllowed: false });
    expect([...profile.allowedHosts].sort()).toEqual(["api.openai.com", "merchants.fiserv.com", "openrouter.ai", "support.cardpointe.com"]);
    expect(profile.allowedHosts.some((host: string) => host.includes("*"))).toBe(false);
    const nativeProfile = await readFile(path.resolve(process.cwd(), ".codex/config.toml"), "utf8");
    expect(nativeProfile).toContain('default_permissions = "ratereveal-live"');
    expect(nativeProfile).toContain("network_proxy = true");
    expect(nativeProfile).toContain('extends = ":workspace"');
    const nativeHosts = [...nativeProfile.matchAll(/^"([^"]+)" = "allow"$/gm)].map((match) => match[1]).sort();
    expect(nativeHosts).toEqual(["api.openai.com", "merchants.fiserv.com", "openrouter.ai", "support.cardpointe.com"]);
    expect(nativeProfile).not.toMatch(/^".*\*.*" = "allow"$/m);
  });
});
