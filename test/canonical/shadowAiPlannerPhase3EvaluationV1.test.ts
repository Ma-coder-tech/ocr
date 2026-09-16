import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  compileShadowAiPlannerProviderRequestV1,
  validateAndBindShadowAiPlannerDraftV1,
  type ShadowAiPlannerDraftV1,
  type ShadowAiPlannerTransportAdapterV1,
} from "../../src/canonical/shadowAiPlannerProviderNeutralV1.js";
import {
  evaluateShadowAiPhase3IssueFamilyV1,
} from "../../src/canonical/shadowAiPlannerPhase3EvaluationV1.js";
import { ShadowAiPlannerTransportErrorV1 } from "../../src/canonical/shadowAiPlannerProviderTransportsV1.js";
import {
  SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
  type ShadowAiEconomicResolutionPacketV1,
} from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";

describe("Shadow planner Phase 3 evaluator v1", () => {
  it("requires two locally valid, baseline-matching, semantically repeatable shadow runs", async () => {
    const inputPacket = packet("phase3-repeatable");
    const baseline = baselinePlan(inputPacket);
    let calls = 0;
    const result = await evaluateShadowAiPhase3IssueFamilyV1({
      issueClass: inputPacket.issueClass,
      corpusKind: "SYNTHETIC_NON_CUSTOMER_CONTRACT_CONTROL",
      packet: inputPacket,
      offlineBaselinePlan: baseline,
      adapter: adapter(async ({ request }) => {
        calls += 1;
        return providerResult(validDraft(request));
      }),
      captureDeterministicState: deterministicState,
    });

    expect(result.status).toBe("PASSED");
    expect(result.providerCalls).toBe(2);
    expect(result.repeatableSemanticSignature).toBe(true);
    expect(result.baselineQualityMatched).toBe(true);
    expect(result.deterministicStatePreserved).toBe(true);
    expect(result.trials.map((trial) => trial.status)).toEqual(["PASSED", "PASSED"]);
    expect(result.trials.every((trial) => trial.quality && Object.values(trial.quality).every(Boolean))).toBe(true);
    expect(calls).toBe(2);
  });

  it("rejects locally valid but non-repeatable and baseline-divergent routing", async () => {
    const inputPacket = packet("phase3-divergent");
    const baseline = baselinePlan(inputPacket);
    let calls = 0;
    const result = await evaluateShadowAiPhase3IssueFamilyV1({
      issueClass: inputPacket.issueClass,
      corpusKind: "SYNTHETIC_NON_CUSTOMER_CONTRACT_CONTROL",
      packet: inputPacket,
      offlineBaselinePlan: baseline,
      adapter: adapter(async ({ request }) => {
        calls += 1;
        const draft = validDraft(request);
        return providerResult(calls === 1 ? draft : {
          ...draft,
          recommendedResolutionPath: "DOCUMENT_REQUIRED",
          requiredEvidenceClasses: ["MERCHANT_CONTRACT_OR_SCHEDULE"],
          documentRequestSuggestions: ["Obtain the period-effective agreement."],
          operationalDataRequests: [],
        });
      }),
      captureDeterministicState: deterministicState,
    });

    expect(result.status).toBe("FAILED");
    expect(result.providerCalls).toBe(2);
    expect(result.repeatableSemanticSignature).toBe(false);
    expect(result.baselineQualityMatched).toBe(false);
    expect(result.errorCodes).toEqual(expect.arrayContaining([
      "shadow_planner_phase3_semantic_signature_not_repeatable",
      "shadow_planner_phase3_offline_baseline_quality_mismatch",
    ]));
  });

  it("stops a family after its first provider failure with no retry", async () => {
    const inputPacket = packet("phase3-unavailable");
    let calls = 0;
    const result = await evaluateShadowAiPhase3IssueFamilyV1({
      issueClass: inputPacket.issueClass,
      corpusKind: "SYNTHETIC_NON_CUSTOMER_CONTRACT_CONTROL",
      packet: inputPacket,
      offlineBaselinePlan: baselinePlan(inputPacket),
      adapter: adapter(async () => {
        calls += 1;
        throw new ShadowAiPlannerTransportErrorV1(
          "UNAVAILABLE", "shadow_planner_openai_service_unavailable", "RESPONSE_RECEIVED", true,
        );
      }),
      captureDeterministicState: deterministicState,
    });

    expect(result.status).toBe("FAILED");
    expect(result.providerCalls).toBe(1);
    expect(result.trials.map((trial) => trial.status)).toEqual(["FAILED", "SKIPPED"]);
    expect(result.errorCodes).toContain("shadow_planner_openai_service_unavailable");
    expect(calls).toBe(1);
  });

  it("aborts an in-flight Phase 3 call at the bounded deadline and skips repetition", async () => {
    const inputPacket = packet("phase3-timeout");
    let calls = 0;
    const result = await evaluateShadowAiPhase3IssueFamilyV1({
      issueClass: inputPacket.issueClass,
      corpusKind: "SYNTHETIC_NON_CUSTOMER_CONTRACT_CONTROL",
      packet: inputPacket,
      offlineBaselinePlan: baselinePlan(inputPacket),
      adapter: adapter(async ({ signal }) => {
        calls += 1;
        return await new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted fixture")), { once: true });
        });
      }),
      captureDeterministicState: deterministicState,
      timeoutMs: 5,
    });

    expect(result.status).toBe("FAILED");
    expect(result.providerCalls).toBe(1);
    expect(result.trials.map((trial) => trial.status)).toEqual(["FAILED", "SKIPPED"]);
    expect(result.trials[0].runStatus).toBe("UNAVAILABLE");
    expect(result.errorCodes).toContain("shadow_planner_provider_timeout");
    expect(calls).toBe(1);
  });
});

function baselinePlan(inputPacket: ShadowAiEconomicResolutionPacketV1) {
  const compiled = compileShadowAiPlannerProviderRequestV1(inputPacket);
  const bound = validateAndBindShadowAiPlannerDraftV1(validDraft(compiled.request), compiled.localBinding);
  if (!bound.ok) throw new Error(`baseline fixture invalid:${bound.errors.join(",")}`);
  return bound.plan;
}

function validDraft(request: Parameters<ShadowAiPlannerTransportAdapterV1["invoke"]>[0]["request"]): ShadowAiPlannerDraftV1 {
  const payload = JSON.parse(request.userPayload);
  const fact = payload.referenceTokenContract.catalog
    .find((entry: { referenceClass: string }) => entry.referenceClass === "FACT")?.token;
  if (!fact) throw new Error("phase3 fixture fact token unavailable");
  return {
    exactCitedReferenceTokens: [fact],
    unresolvedQuestion: "Which period-matched authorization and settlement populations apply?",
    primaryHypothesis: {
      hypothesis: "The populations may use different definitions.",
      confidence: "LOW",
      supportingReferenceTokens: [fact],
      contradictingReferenceTokens: [],
      acknowledgedEvidenceGaps: ["Comparable operational definitions are absent."],
      confirmationRequirements: ["Obtain period-matched processor definitions and counts."],
      falsificationConditions: ["The processor confirms identical populations."],
    },
    alternativeHypotheses: [{
      hypothesis: "The submitted and settled populations may match while attempts differ.",
      confidence: "LOW",
      supportingReferenceTokens: [fact],
      contradictingReferenceTokens: [],
      acknowledgedEvidenceGaps: ["Attempt outcomes are absent."],
      confirmationRequirements: ["Obtain attempt outcome detail."],
      falsificationConditions: ["No unmatched attempts exist."],
    }],
    acknowledgedEvidenceGaps: ["Period-matched operational populations are missing."],
    recommendedResolutionPath: "PROCESSOR_OR_GATEWAY_DATA_REQUIRED",
    requiredEvidenceClasses: ["PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA"],
    researchQuerySuggestions: [],
    merchantQuestionSuggestions: [],
    documentRequestSuggestions: [],
    operationalDataRequests: ["Request authorization, approval, and settlement populations."],
    internalExplanationDraft: "Internal unresolved inference only.",
    limitationCodes: ["provider_draft_untrusted"],
    reconstructionSuspicions: [],
  };
}

function adapter(
  invoke: ShadowAiPlannerTransportAdapterV1["invoke"],
): ShadowAiPlannerTransportAdapterV1 {
  return {
    adapterId: "phase3-test-direct-openai-v1",
    transport: "PROVIDER",
    providerKind: "OPENAI_DIRECT",
    model: "test-model",
    safeConfiguration: {
      maximumOutputTokens: 4_000,
      reasoningEffort: "none",
      verbosity: "low",
      verbosityControl: "NATIVE_PARAMETER",
      providerFallbackAllowed: false,
      routedProviderConstraint: null,
      dataCollection: "DIRECT_STORE_DISABLED",
    },
    invoke,
  };
}

function providerResult(rawDraft: unknown) {
  return {
    rawDraft,
    usage: { inputTokens: 100, outputTokens: 200, estimatedCostUsdMicros: 3_000, latencyMs: 5 },
    providerRequestId: "req_phase3_test",
    returnedModel: "test-model",
    safeTelemetry: {
      httpStatus: 200,
      requestSha256: "a".repeat(64),
      schemaSha256: "b".repeat(64),
      finishReason: null,
      routedProvider: null,
    },
  };
}

function packet(issueId: string): ShadowAiEconomicResolutionPacketV1 {
  const withoutHash: Omit<ShadowAiEconomicResolutionPacketV1, "immutableInputHash"> = {
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
    purpose: "SHADOW_ECONOMIC_RESOLUTION_PLANNING_ONLY",
    outputAuthorityRequired: "NON_AUTHORITATIVE",
    opaqueRunRef: `run-${issueId}`,
    issueId,
    issueClass: "AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE",
    processorFamily: "Synthetic Processor",
    processorProgram: null,
    statementPeriod: { start: "2026-08-01", end: "2026-08-31" },
    acceptedIssueRelevantActivityFacts: [{
      factRef: "synthetic_fact_submitted_transaction_count",
      field: "submittedTransactionCount",
      state: "KNOWN",
      value: 120,
      population: "submitted_transactions",
      evidenceRefs: ["synthetic_statement_occurrence_001"],
    }],
    selectedRdChargeRefs: ["synthetic_economic_charge_001"],
    sanitizedFeeLabels: ["AUTHORIZATION SERVICE"],
    acceptedEconomicCategories: ["PROCESSOR_OR_SERVICE_ECONOMICS"],
    acceptedSensitivityStates: ["TRANSACTION_COUNT_DRIVEN"],
    acceptedQualificationIntegrityState: "UNKNOWN",
    acceptedParticipantControlStates: [{
      rdChargeRef: "synthetic_economic_charge_001",
      collector: { state: "KNOWN", value: "processor_or_acquirer" },
      economicBeneficiary: { state: "UNKNOWN", value: null },
      ruleSetter: { state: "UNKNOWN", value: null },
      priceSetter: { state: "UNKNOWN", value: null },
      merchantFacingPriceController: { state: "UNKNOWN", value: null },
    }],
    unresolvedClaimFacets: ["authorizationCount", "settledTransactionCount"],
    unresolvedReasonCodes: ["authorization_and_settlement_populations_not_interchangeable"],
    acceptedFactRefs: ["synthetic_fact_submitted_transaction_count"],
    currentGovernedEvidenceRefs: ["synthetic_governed_authorization_definition"],
    allowedEvidenceClasses: ["PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA", "MERCHANT_CONTRACT_OR_SCHEDULE"],
    prohibitedConclusions: ["canonical_fact_change", "savings_or_annualization", "customer_action_or_finding"],
    merchantBusinessContext: null,
    competingHypothesisRequired: true,
  };
  return Object.freeze({
    ...withoutHash,
    immutableInputHash: createHash("sha256").update(canonicalJson(withoutHash)).digest("hex"),
  });
}

function deterministicState() {
  return {
    canonicalFinancialTruth: { fingerprint: "canonical" },
    rdArtifacts: { fingerprint: "rd" },
    reconciliation: { fingerprint: "reconciliation" },
    commercialTruth: { fingerprint: "commercial" },
    governedKnowledge: { fingerprint: "knowledge" },
    permissions: { financialMutationAllowed: false, customerRenderingAllowed: false },
    customerOutput: { created: false },
  };
}
