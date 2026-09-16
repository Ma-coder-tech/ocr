import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  compileOpenAiDirectPlannerHttpRequestV1,
  compileOpenRouterPlannerHttpRequestV1,
  inspectPortableDraftSchemaV1,
} from "../../src/canonical/shadowAiPlannerProviderAdaptersV1.js";
import {
  compileShadowAiPlannerProviderRequestV1,
  providerNeutralPlannerDraftSchemaV1,
  validateAndBindShadowAiPlannerDraftV1,
  type CompiledShadowAiPlannerProviderRequestV1,
  type ShadowAiPlannerDraftV1,
  type ShadowAiPlannerTransportAdapterV1,
} from "../../src/canonical/shadowAiPlannerProviderNeutralV1.js";
import { runShadowAiProviderNeutralPlannerV1 } from "../../src/canonical/shadowAiPlannerProviderNeutralRuntimeV1.js";
import type { ShadowAiEconomicResolutionPacketV1 } from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION } from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1 } from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";

describe("Provider-neutral shadow planner v1", () => {
  it("uses one request-independent structural schema with no provider-fragile binding constraints", () => {
    const first = compileShadowAiPlannerProviderRequestV1(packet("issue-one", "run-one"));
    const second = compileShadowAiPlannerProviderRequestV1(packet("issue-two", "run-two"));
    const inspection = inspectPortableDraftSchemaV1(providerNeutralPlannerDraftSchemaV1());

    expect(inspection).toMatchObject({
      valid: true,
      patternCount: 0,
      constCount: 0,
      requestSpecificEnumCount: 0,
    });
    expect(inspection.forbiddenKeywordPaths).toEqual([]);
    expect(canonicalJson(first.request.outputSchema)).toBe(canonicalJson(second.request.outputSchema));
    expect(first.request.schemaName).toBe(second.request.schemaName);
    expect(canonicalJson(first.request.outputSchema)).not.toContain("issue-one");
    expect(canonicalJson(first.request.outputSchema)).not.toContain("fact_v2_");
  });

  it("contains internal references and local identity outside the provider payload", () => {
    const compiled = compileShadowAiPlannerProviderRequestV1(packet("issue-private", "run-private"));
    const payload = compiled.request.userPayload;

    expect(payload).not.toContain("issue-private");
    expect(payload).not.toContain(compiled.localBinding.inputHash);
    expect(payload).not.toContain("fact_v2_submitted_transaction_count");
    expect(payload).not.toContain("evidence_v2_statement_occurrence_001");
    expect(payload).not.toContain("economic_charge_001");
    expect(payload).not.toContain("Ada Lovelace");
    expect(payload).toContain("rr_");
    expect(compiled.localBinding.issueId).toBe("issue-private");
    expect(compiled.localBinding.referenceAliases.length).toBeGreaterThan(0);
  });

  it("stamps authority and identity locally after restoring issued aliases", () => {
    const compiled = compileShadowAiPlannerProviderRequestV1(packet("issue-bind", "run-bind"));
    const result = validateAndBindShadowAiPlannerDraftV1(validDraft(compiled), compiled.localBinding);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan).toMatchObject({
      issueId: "issue-bind",
      inputHash: compiled.localBinding.inputHash,
      outputType: "AI_INFERENCE_ONLY",
      authority: "NON_AUTHORITATIVE",
      admissionStatus: "NOT_ADMITTED",
      truthEffect: "NONE",
      financialMutationAllowed: false,
      customerRenderingAllowed: false,
      unresolvedAfterAnalysis: true,
      exactCitedFactRefs: ["fact_v2_submitted_transaction_count"],
    });
    expect(result.plan.primaryHypothesis.supportingFactRefs).toEqual(["fact_v2_submitted_transaction_count"]);
  });

  it("rejects provider attempts to set authority or binding fields", () => {
    const compiled = compileShadowAiPlannerProviderRequestV1(packet("issue-authority", "run-authority"));
    const draft = { ...validDraft(compiled), issueId: "provider-selected-issue", financialMutationAllowed: true };
    const result = validateAndBindShadowAiPlannerDraftV1(draft, compiled.localBinding);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.includes("forbidden_authority_key"))).toBe(true);
    expect(result.errors).toContain("draft_unknown_key:issueId");
    expect(result.errors).toContain("draft_unknown_key:financialMutationAllowed");
  });

  it("rejects invented, wrong-class, and cross-request reference tokens", () => {
    const first = compileShadowAiPlannerProviderRequestV1(packet("issue-refs-one", "run-refs-one"));
    const second = compileShadowAiPlannerProviderRequestV1(packet("issue-refs-two", "run-refs-two"));
    const governed = alias(first, "GOVERNED_EVIDENCE");
    const crossRequestFact = alias(second, "FACT");

    const invented = validateAndBindShadowAiPlannerDraftV1({
      ...validDraft(first),
      exactCitedReferenceTokens: ["rr_invented_f_9999"],
    }, first.localBinding);
    expect(invented.ok).toBe(false);
    if (!invented.ok) expect(invented.errors).toContain("exactCitedReferenceTokens_unknown_reference_token");

    const wrongClass = validateAndBindShadowAiPlannerDraftV1({
      ...validDraft(first),
      exactCitedReferenceTokens: [governed],
    }, first.localBinding);
    expect(wrongClass.ok).toBe(false);
    if (!wrongClass.ok) expect(wrongClass.errors).toContain("exactCitedReferenceTokens_wrong_reference_class");

    const crossRequest = validateAndBindShadowAiPlannerDraftV1({
      ...validDraft(first),
      exactCitedReferenceTokens: [crossRequestFact],
    }, first.localBinding);
    expect(crossRequest.ok).toBe(false);
    if (!crossRequest.ok) expect(crossRequest.errors).toContain("exactCitedReferenceTokens_unknown_reference_token");
  });

  it("compiles distinct OpenAI and OpenRouter envelopes without fallback or local bindings", () => {
    const compiled = compileShadowAiPlannerProviderRequestV1(packet("issue-adapters", "run-adapters"));
    const openAi = compileOpenAiDirectPlannerHttpRequestV1({
      apiKey: "test-openai-key",
      model: "test-openai-model",
      request: compiled.request,
    });
    const openRouter = compileOpenRouterPlannerHttpRequestV1({
      apiKey: "test-openrouter-key",
      model: "test-openrouter-model",
      request: compiled.request,
    });
    const openAiBody = JSON.parse(openAi.body);
    const openRouterBody = JSON.parse(openRouter.body);

    expect(openAi.providerKind).toBe("OPENAI_DIRECT");
    expect(openAiBody.text.format.schema).toEqual(compiled.request.outputSchema);
    expect(openAiBody.max_output_tokens).toBe(SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumOutputTokens);
    expect(openAi.schemaSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(openAi.body).not.toContain(compiled.localBinding.issueId);
    expect(openAi.body).not.toContain(compiled.localBinding.inputHash);
    expect(openAi.body).not.toContain("allow_fallbacks");

    expect(openRouter.providerKind).toBe("OPENROUTER");
    expect(openRouterBody.response_format.json_schema.schema).toEqual(compiled.request.outputSchema);
    expect(openRouterBody.max_tokens).toBe(SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumOutputTokens);
    expect(openRouter.schemaSha256).toBe(openAi.schemaSha256);
    expect(openRouterBody.provider).toEqual({ allow_fallbacks: false, require_parameters: true });
    expect(openRouter.body).not.toContain(compiled.localBinding.issueId);
    expect(openRouter.body).not.toContain(compiled.localBinding.inputHash);
  });

  it("enforces local list budgets that provider schemas intentionally omit", () => {
    const compiled = compileShadowAiPlannerProviderRequestV1(packet("issue-budget", "run-budget"));
    const result = validateAndBindShadowAiPlannerDraftV1({
      ...validDraft(compiled),
      limitationCodes: Array.from({ length: 17 }, (_, index) => `limitation-${index}`),
    }, compiled.localBinding);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("limitationCodes_too_many_items");
  });

  it("executes one explicit adapter and binds a valid provider draft locally", async () => {
    const inputPacket = packet("issue-runtime", "run-runtime");
    const compiled = compileShadowAiPlannerProviderRequestV1(inputPacket);
    let receivedPayload = "";
    let invocations = 0;
    const adapter = stubAdapter(async ({ request }) => {
      invocations += 1;
      receivedPayload = request.userPayload;
      return providerResult(validDraft(compiled));
    });

    const run = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });

    expect(run.status).toBe("COMPLETED");
    expect(run.plan).toMatchObject({
      issueId: "issue-runtime",
      inputHash: inputPacket.immutableInputHash,
      authority: "NON_AUTHORITATIVE",
      truthEffect: "NONE",
      financialMutationAllowed: false,
      customerRenderingAllowed: false,
    });
    expect(run.deterministicResultPreserved).toBe(true);
    expect(run.customerOutputCreated).toBe(false);
    expect(run.accounting).toMatchObject({ providerCallAttempts: 0, providerNetworkCalls: 0, retries: 0 });
    expect(invocations).toBe(1);
    expect(receivedPayload).not.toContain(inputPacket.issueId);
    expect(receivedPayload).not.toContain(inputPacket.immutableInputHash);
  });

  it("fails closed when the provider draft is invalid", async () => {
    const inputPacket = packet("issue-invalid-runtime", "run-invalid-runtime");
    const compiled = compileShadowAiPlannerProviderRequestV1(inputPacket);
    const adapter = stubAdapter(async () => providerResult({
      ...validDraft(compiled),
      issueId: "provider-must-not-bind-this",
    }));

    const run = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });

    expect(run.status).toBe("SAFETY_BLOCKED");
    expect(run.plan).toBeNull();
    expect(run.errorCodes).toContain("draft_unknown_key:issueId");
    expect(run.errorCodes.some((code) => code.includes("forbidden_authority_key"))).toBe(true);
    expect(run.deterministicResultPreserved).toBe(true);
  });

  it("does not retry or fall back when the selected adapter fails", async () => {
    const inputPacket = packet("issue-provider-failure", "run-provider-failure");
    let invocations = 0;
    const adapter = stubAdapter(async () => {
      invocations += 1;
      throw new Error("provider detail must not escape");
    }, "PROVIDER");

    const run = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });

    expect(run.status).toBe("UNAVAILABLE");
    expect(run.plan).toBeNull();
    expect(run.errorCodes).toEqual(["shadow_planner_provider_failed"]);
    expect(run.accounting).toMatchObject({
      providerCallAttempts: 1,
      providerCallCompleted: 0,
      providerNetworkCalls: 1,
      retries: 0,
    });
    expect(invocations).toBe(1);
  });

  it("rejects an observable returned-model change", async () => {
    const inputPacket = packet("issue-model-change", "run-model-change");
    const compiled = compileShadowAiPlannerProviderRequestV1(inputPacket);
    const adapter = stubAdapter(async () => ({
      ...providerResult(validDraft(compiled)),
      returnedModel: "different-model",
    }), "PROVIDER");

    const run = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });

    expect(run.status).toBe("SAFETY_BLOCKED");
    expect(run.plan).toBeNull();
    expect(run.errorCodes).toContain("shadow_planner_returned_model_mismatch");
  });
});

function packet(issueId: string, opaqueRunRef: string): ShadowAiEconomicResolutionPacketV1 {
  const withoutHash: Omit<ShadowAiEconomicResolutionPacketV1, "immutableInputHash"> = {
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
    purpose: "SHADOW_ECONOMIC_RESOLUTION_PLANNING_ONLY",
    outputAuthorityRequired: "NON_AUTHORITATIVE",
    opaqueRunRef,
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
    allowedEvidenceClasses: ["PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA", "MERCHANT_CONTRACT_OR_SCHEDULE"],
    prohibitedConclusions: ["canonical_fact_change", "savings_or_annualization", "customer_action_or_finding"],
    merchantBusinessContext: {
      privacyClassification: "PURPOSE_BOUND_BUSINESS_IDENTITY",
      businessName: "Ada Lovelace",
      naturalPersonOrSoleProprietorAmbiguity: "POSSIBLE",
      admittedBusinessCategory: "retail",
      businessLocation: { country: "US", region: null, city: null },
      knownChannel: "card_present",
      acceptedAverageTicket: null,
      supportedOperatingContext: [],
    },
    competingHypothesisRequired: true,
  };
  return Object.freeze({
    ...withoutHash,
    immutableInputHash: createHash("sha256").update(canonicalJson(withoutHash)).digest("hex"),
  });
}

function validDraft(compiled: CompiledShadowAiPlannerProviderRequestV1): ShadowAiPlannerDraftV1 {
  const fact = alias(compiled, "FACT");
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
      falsificationConditions: ["Period-matched processor data shows the populations are identical."],
    },
    alternativeHypotheses: [{
      hypothesis: "The submitted and settled counts may match while authorization attempts remain higher.",
      confidence: "LOW",
      supportingReferenceTokens: [fact],
      contradictingReferenceTokens: [],
      acknowledgedEvidenceGaps: ["Declines and reversals are not available."],
      confirmationRequirements: ["Obtain authorization outcome detail."],
      falsificationConditions: ["No declined, reversed, or unmatched attempts are present."],
    }],
    acknowledgedEvidenceGaps: ["Period-matched operational populations are missing."],
    recommendedResolutionPath: "PROCESSOR_OR_GATEWAY_DATA_REQUIRED",
    requiredEvidenceClasses: ["PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA"],
    researchQuerySuggestions: [],
    merchantQuestionSuggestions: [],
    documentRequestSuggestions: [],
    operationalDataRequests: ["Request authorization attempts, approvals, and settled counts for the statement period."],
    internalExplanationDraft: "This remains an internal unresolved planning draft.",
    limitationCodes: ["provider_draft_untrusted", "no_new_evidence_admitted"],
    reconstructionSuspicions: [],
  };
}

function alias(compiled: CompiledShadowAiPlannerProviderRequestV1, referenceClass: string): string {
  const found = compiled.localBinding.referenceAliases.find((entry) => entry.referenceClass === referenceClass);
  if (!found) throw new Error(`missing test alias for ${referenceClass}`);
  return found.token;
}

function stubAdapter(
  invoke: ShadowAiPlannerTransportAdapterV1["invoke"],
  transport: ShadowAiPlannerTransportAdapterV1["transport"] = "EVALUATION_STUB",
): ShadowAiPlannerTransportAdapterV1 {
  return {
    adapterId: "test-adapter",
    transport,
    providerKind: "OPENAI_DIRECT",
    model: "test-model",
    invoke,
  };
}

function providerResult(rawDraft: unknown) {
  return {
    rawDraft,
    usage: { inputTokens: 100, outputTokens: 200, estimatedCostUsdMicros: 300, latencyMs: 400 },
    providerRequestId: "request-test",
    returnedModel: "test-model",
    safeTelemetry: {
      httpStatus: 200,
      requestSha256: "a".repeat(64),
      schemaSha256: "b".repeat(64),
      finishReason: "stop",
      routedProvider: null,
    },
  };
}
