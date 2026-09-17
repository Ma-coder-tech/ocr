import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  INTERNAL_SHADOW_PLANNER_ENABLE_ENV_V1,
  INTERNAL_SHADOW_PLANNER_KILL_SWITCH_ENV_V1,
  runInternalShadowPlannerV1,
} from "../../src/canonical/shadowAiPlannerInternalIntegrationV1.js";
import {
  OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1,
} from "../../src/canonical/shadowAiPlannerProviderAdaptersV1.js";
import type {
  ShadowAiPlannerDraftV1,
  ShadowAiPlannerProviderRequestV1,
  ShadowAiPlannerTransportAdapterV1,
} from "../../src/canonical/shadowAiPlannerProviderNeutralV1.js";
import {
  SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
  type ShadowAiEconomicResolutionPacketV1,
} from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";

const enabledEnvironment = Object.freeze({
  [INTERNAL_SHADOW_PLANNER_ENABLE_ENV_V1]: "true",
  OPENAI_API_KEY: "test-only-key",
});

describe("internal non-customer shadow planner integration v1", () => {
  it("is default-off and performs no preparation, state capture, or provider call", async () => {
    const adapterFactory = vi.fn();
    const captureProtectedState = vi.fn(() => ({ protected: true }));

    const result = await runInternalShadowPlannerV1({
      dataClassification: "NON_CUSTOMER_INTERNAL_FIXTURE",
      packets: [packet("default-off")],
      captureProtectedState,
    }, { environment: {}, adapterFactory });

    expect(result.status).toBe("DISABLED");
    expect(result.providerCallAttempts).toBe(0);
    expect(adapterFactory).not.toHaveBeenCalled();
    expect(captureProtectedState).not.toHaveBeenCalled();
  });

  it("honors the kill switch before adapter construction", async () => {
    const adapterFactory = vi.fn();
    const result = await runInternalShadowPlannerV1({
      dataClassification: "NON_CUSTOMER_INTERNAL_FIXTURE",
      packets: [packet("kill-switch")],
      captureProtectedState: () => ({ protected: true }),
    }, {
      environment: { ...enabledEnvironment, [INTERNAL_SHADOW_PLANNER_KILL_SWITCH_ENV_V1]: "true" },
      adapterFactory,
    });

    expect(result.status).toBe("KILL_SWITCHED");
    expect(result.errorCodes).toEqual(["shadow_planner_internal_kill_switch_active"]);
    expect(adapterFactory).not.toHaveBeenCalled();
  });

  it("rejects non-fixture classification, missing credentials, and a multi-packet call budget", async () => {
    const unclassified = await runInternalShadowPlannerV1({
      dataClassification: "CUSTOMER" as "NON_CUSTOMER_INTERNAL_FIXTURE",
      packets: [packet("classification")],
      captureProtectedState: () => ({}),
    }, { environment: enabledEnvironment });
    expect(unclassified).toMatchObject({ status: "SAFETY_BLOCKED", providerCallAttempts: 0 });
    expect(unclassified.errorCodes).toEqual(["shadow_planner_internal_data_classification_rejected"]);

    const missingKey = await runInternalShadowPlannerV1({
      dataClassification: "NON_CUSTOMER_INTERNAL_FIXTURE",
      packets: [packet("missing-key")],
      captureProtectedState: () => ({}),
    }, { environment: { [INTERNAL_SHADOW_PLANNER_ENABLE_ENV_V1]: "true" } });
    expect(missingKey.errorCodes).toEqual(["shadow_planner_internal_openai_key_unavailable"]);

    const overBudget = await runInternalShadowPlannerV1({
      dataClassification: "NON_CUSTOMER_INTERNAL_FIXTURE",
      packets: [packet("budget-a"), packet("budget-b")],
      captureProtectedState: () => ({}),
    }, { environment: enabledEnvironment });
    expect(overBudget.errorCodes).toEqual(["shadow_planner_internal_call_budget_exceeded"]);
    expect(overBudget.providerNetworkCalls).toBe(0);
  });

  it("runs the pinned Direct OpenAI adapter once and exposes telemetry without draft content", async () => {
    let invocations = 0;
    const sink = vi.fn();
    const adapter = qualifiedStubAdapter(async (request) => {
      invocations += 1;
      return validDraft(request);
    });
    const protectedState = { canonical: "unchanged", customerOutput: "unchanged" };

    const result = await runInternalShadowPlannerV1({
      dataClassification: "NON_CUSTOMER_INTERNAL_FIXTURE",
      packets: [packet("completed")],
      captureProtectedState: () => protectedState,
    }, { environment: enabledEnvironment, adapterFactory: () => adapter, telemetrySink: sink });

    expect(result).toMatchObject({
      status: "COMPLETED",
      providerKind: "OPENAI_DIRECT",
      adapterId: "openai-direct-responses-v1",
      requestedModel: OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1,
      selectedIssueCount: 1,
      evaluatedIssueClass: "AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE",
      providerCallAttempts: 1,
      providerNetworkCalls: 1,
      providerCallCompleted: 1,
      deterministicStatePreserved: true,
      customerOutputCreated: false,
      truthMutationAllowed: false,
      sourceAdmissionAllowed: false,
      automaticProviderFallback: false,
      retries: 0,
      openRouterAllowed: false,
    });
    expect(invocations).toBe(1);
    expect(sink).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toMatch(/primaryHypothesis|internalExplanationDraft|operationalDataRequests|issueId|opaqueRunRef/);
  });

  it("fails closed when protected state changes during the provider call", async () => {
    const protectedState = { revision: 1 };
    const adapter = qualifiedStubAdapter(async (request) => {
      protectedState.revision += 1;
      return validDraft(request);
    });

    const result = await runInternalShadowPlannerV1({
      dataClassification: "NON_CUSTOMER_INTERNAL_FIXTURE",
      packets: [packet("state-change")],
      captureProtectedState: () => protectedState,
    }, { environment: enabledEnvironment, adapterFactory: () => adapter });

    expect(result.status).toBe("SAFETY_BLOCKED");
    expect(result.deterministicStatePreserved).toBe(false);
    expect(result.errorCodes).toContain("shadow_planner_internal_protected_state_changed");
    expect(result.customerOutputCreated).toBe(false);
  });

  it("rejects adapter drift before network dispatch", async () => {
    let invocations = 0;
    const drifted = {
      ...qualifiedStubAdapter(async (request) => {
        invocations += 1;
        return validDraft(request);
      }),
      model: "gpt-drifted",
    } satisfies ShadowAiPlannerTransportAdapterV1;

    const result = await runInternalShadowPlannerV1({
      dataClassification: "NON_CUSTOMER_INTERNAL_FIXTURE",
      packets: [packet("adapter-drift")],
      captureProtectedState: () => ({}),
    }, { environment: enabledEnvironment, adapterFactory: () => drifted });

    expect(result.status).toBe("SAFETY_BLOCKED");
    expect(result.errorCodes).toEqual(["shadow_planner_internal_adapter_configuration_rejected"]);
    expect(result.providerNetworkCalls).toBe(0);
    expect(invocations).toBe(0);
  });

  it("rejects a completed response when exact model identity is unavailable", async () => {
    const base = qualifiedStubAdapter(async (request) => validDraft(request));
    const missingIdentity = {
      ...base,
      async invoke(input: Parameters<ShadowAiPlannerTransportAdapterV1["invoke"]>[0]) {
        return { ...await base.invoke(input), returnedModel: null };
      },
    } satisfies ShadowAiPlannerTransportAdapterV1;

    const result = await runInternalShadowPlannerV1({
      dataClassification: "NON_CUSTOMER_INTERNAL_FIXTURE",
      packets: [packet("missing-model-identity")],
      captureProtectedState: () => ({}),
    }, { environment: enabledEnvironment, adapterFactory: () => missingIdentity });

    expect(result.status).toBe("SAFETY_BLOCKED");
    expect(result.errorCodes).toEqual(["shadow_planner_internal_returned_model_unverified"]);
  });

  it("detects protected-state mutation even when adapter construction fails", async () => {
    const protectedState = { revision: 1 };
    const result = await runInternalShadowPlannerV1({
      dataClassification: "NON_CUSTOMER_INTERNAL_FIXTURE",
      packets: [packet("factory-mutation")],
      captureProtectedState: () => protectedState,
    }, {
      environment: enabledEnvironment,
      adapterFactory: () => {
        protectedState.revision += 1;
        throw new Error("unsafe detail must not escape");
      },
    });

    expect(result.status).toBe("SAFETY_BLOCKED");
    expect(result.deterministicStatePreserved).toBe(false);
    expect(result.errorCodes).toEqual([
      "shadow_planner_internal_integration_failed",
      "shadow_planner_internal_protected_state_changed",
    ]);
  });

  it("checks the injected emergency stop again immediately before dispatch", async () => {
    let checks = 0;
    let invocations = 0;
    const adapter = qualifiedStubAdapter(async (request) => {
      invocations += 1;
      return validDraft(request);
    });
    const result = await runInternalShadowPlannerV1({
      dataClassification: "NON_CUSTOMER_INTERNAL_FIXTURE",
      packets: [packet("late-kill-switch")],
      captureProtectedState: () => ({}),
    }, {
      environment: enabledEnvironment,
      adapterFactory: () => adapter,
      killSwitchActive: () => ++checks >= 2,
    });

    expect(result.status).toBe("KILL_SWITCHED");
    expect(invocations).toBe(0);
  });

  it("does not let a telemetry sink failure enter the caller control flow", async () => {
    const result = await runInternalShadowPlannerV1({
      dataClassification: "NON_CUSTOMER_INTERNAL_FIXTURE",
      packets: [packet("sink-failure")],
      captureProtectedState: () => ({}),
    }, {
      environment: {},
      telemetrySink: () => { throw new Error("telemetry unavailable"); },
    });

    expect(result.status).toBe("DISABLED");
  });
});

function qualifiedStubAdapter(
  draft: (request: ShadowAiPlannerProviderRequestV1) => Promise<ShadowAiPlannerDraftV1>,
): ShadowAiPlannerTransportAdapterV1 {
  return Object.freeze({
    adapterId: "openai-direct-responses-v1",
    transport: "PROVIDER" as const,
    providerKind: "OPENAI_DIRECT" as const,
    model: OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1,
    safeConfiguration: Object.freeze({
      maximumOutputTokens: 4_000,
      reasoningEffort: "none" as const,
      verbosity: "low" as const,
      verbosityControl: "NATIVE_PARAMETER" as const,
      providerFallbackAllowed: false as const,
      routedProviderConstraint: null,
      dataCollection: "DIRECT_STORE_DISABLED" as const,
    }),
    async invoke({ request }) {
      return {
        rawDraft: await draft(request),
        usage: { inputTokens: 100, outputTokens: 200, estimatedCostUsdMicros: 3_000, latencyMs: 5 },
        providerRequestId: "req_internal_fixture",
        returnedModel: OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1,
        safeTelemetry: {
          httpStatus: 200,
          requestSha256: "a".repeat(64),
          schemaSha256: "b".repeat(64),
          finishReason: "completed",
          routedProvider: null,
          transportTimings: {
            connectionReused: false,
            connectionMs: 1,
            responseHeadersMs: 3,
            responseBodyMs: 1,
            cleanupMs: 0,
            failureElapsedMs: null,
          },
        },
      };
    },
  });
}

function validDraft(request: ShadowAiPlannerProviderRequestV1): ShadowAiPlannerDraftV1 {
  const payload = JSON.parse(request.userPayload) as {
    referenceTokenContract: { catalog: Array<{ token: string; referenceClass: string; semanticRole: string }> };
    resolutionContract: { requiredEvidenceClasses: ShadowAiPlannerDraftV1["requiredEvidenceClasses"] };
  };
  const fact = payload.referenceTokenContract.catalog.find((entry) =>
    entry.referenceClass === "FACT" && entry.semanticRole === "ISSUE_SUPPORTING")?.token;
  if (!fact) throw new Error("test fact token unavailable");
  return {
    exactCitedReferenceTokens: [fact],
    unresolvedQuestion: "Which period-matched authorization and settlement populations apply?",
    primaryHypothesis: {
      hypothesis: "The submitted population may differ from authorization attempts and final settlements.",
      confidence: "LOW",
      supportingReferenceTokens: [fact],
      contradictingReferenceTokens: [],
      acknowledgedEvidenceGaps: ["Authorization and settlement counts are not accepted facts."],
      confirmationRequirements: ["Obtain processor operational population definitions and counts."],
      falsificationConditions: ["Period-matched processor data shows matching populations."],
    },
    alternativeHypotheses: [{
      hypothesis: "The submitted and settled counts may match while authorization attempts differ.",
      confidence: "LOW",
      supportingReferenceTokens: [fact],
      contradictingReferenceTokens: [],
      acknowledgedEvidenceGaps: ["Authorization outcomes are unavailable."],
      confirmationRequirements: ["Obtain authorization outcome detail."],
      falsificationConditions: ["The operational records show no population difference."],
    }],
    acknowledgedEvidenceGaps: ["Period-matched operational populations are missing."],
    recommendedResolutionPath: "PROCESSOR_OR_GATEWAY_DATA_REQUIRED",
    requiredEvidenceClasses: payload.resolutionContract.requiredEvidenceClasses,
    researchQuerySuggestions: [],
    merchantQuestionSuggestions: [],
    documentRequestSuggestions: [],
    operationalDataRequests: ["Request period-matched authorization and settlement population records."],
    internalExplanationDraft: "The population relationship remains unresolved.",
    limitationCodes: ["provider_draft_untrusted"],
    reconstructionSuspicions: [],
  };
}

function packet(issueId: string): ShadowAiEconomicResolutionPacketV1 {
  const withoutHash: Omit<ShadowAiEconomicResolutionPacketV1, "immutableInputHash"> = {
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
    purpose: "SHADOW_ECONOMIC_RESOLUTION_PLANNING_ONLY",
    outputAuthorityRequired: "NON_AUTHORITATIVE",
    opaqueRunRef: `shadow-run-${createHash("sha256").update(issueId).digest("hex").slice(0, 24)}`,
    issueId,
    issueClass: "AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE",
    processorFamily: "Fiserv / First Data",
    processorProgram: null,
    statementPeriod: { start: "2026-08-01", end: "2026-08-31" },
    acceptedIssueRelevantActivityFacts: [{
      factRef: "fact_v2_submitted_transaction_count",
      field: "submittedTransactionCount",
      state: "KNOWN",
      value: 120,
      population: "submitted_transactions",
      evidenceRefs: ["evidence_v2_statement_occurrence_001"],
    }],
    selectedRdChargeRefs: ["economic_charge_001"],
    sanitizedFeeLabels: ["AUTHORIZATION SERVICE"],
    acceptedEconomicCategories: ["PROCESSOR_OR_SERVICE_ECONOMICS"],
    acceptedSensitivityStates: ["TRANSACTION_COUNT_DRIVEN"],
    acceptedQualificationIntegrityState: "UNKNOWN",
    acceptedParticipantControlStates: [{
      rdChargeRef: "economic_charge_001",
      collector: { state: "KNOWN", value: "processor_or_acquirer" },
      economicBeneficiary: { state: "UNKNOWN", value: null },
      ruleSetter: { state: "UNKNOWN", value: null },
      priceSetter: { state: "UNKNOWN", value: null },
      merchantFacingPriceController: { state: "UNKNOWN", value: null },
    }],
    unresolvedClaimFacets: ["authorizationCount", "settledTransactionCount"],
    unresolvedReasonCodes: ["authorization_and_settlement_populations_not_interchangeable"],
    acceptedFactRefs: ["fact_v2_submitted_transaction_count"],
    currentGovernedEvidenceRefs: ["governed_evidence_authorization_definition"],
    allowedEvidenceClasses: ["PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA"],
    prohibitedConclusions: ["canonical_fact_change", "savings_or_annualization", "customer_action_or_finding"],
    merchantBusinessContext: null,
    competingHypothesisRequired: true,
  };
  return Object.freeze({
    ...withoutHash,
    immutableInputHash: createHash("sha256").update(canonicalJson(withoutHash)).digest("hex"),
  });
}
