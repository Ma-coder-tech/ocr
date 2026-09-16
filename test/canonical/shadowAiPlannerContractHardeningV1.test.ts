import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  compileShadowAiPlannerProviderRequestV1,
  validateAndBindShadowAiPlannerDraftV1,
  type CompiledShadowAiPlannerProviderRequestV1,
  type ShadowAiPlannerDraftV1,
} from "../../src/canonical/shadowAiPlannerProviderNeutralV1.js";
import {
  SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
  SHADOW_AI_ISSUE_CLASSES,
  type ShadowAiEconomicIssueClassV1,
  type ShadowAiEconomicResolutionPacketV1,
  type ShadowAiRequiredEvidenceClassV1,
  type ShadowAiResolutionPathV1,
} from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";

type Expected = Readonly<{
  route: ShadowAiResolutionPathV1;
  evidence: ShadowAiRequiredEvidenceClassV1;
  channel: "PUBLIC_RESEARCH" | "MERCHANT_INPUT" | "DOCUMENT_REQUEST" | "OPERATIONAL_DATA";
}>;

const EXPECTED: Readonly<Record<ShadowAiEconomicIssueClassV1, Expected>> = {
  SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS: {
    route: "PUBLIC_RESEARCH_REQUIRED", evidence: "GOVERNED_PUBLIC_SOURCE", channel: "PUBLIC_RESEARCH",
  },
  QUALIFICATION_INTEGRITY_ROOT_CAUSE: {
    route: "PROCESSOR_OR_GATEWAY_DATA_REQUIRED", evidence: "PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA", channel: "OPERATIONAL_DATA",
  },
  PARTICIPANT_CONTROL_UNCERTAINTY: {
    route: "PUBLIC_RESEARCH_REQUIRED", evidence: "GOVERNED_PUBLIC_SOURCE", channel: "PUBLIC_RESEARCH",
  },
  GATEWAY_PROCESSOR_TERMINOLOGY: {
    route: "PUBLIC_RESEARCH_REQUIRED", evidence: "GOVERNED_PUBLIC_SOURCE", channel: "PUBLIC_RESEARCH",
  },
  AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE: {
    route: "PROCESSOR_OR_GATEWAY_DATA_REQUIRED", evidence: "PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA", channel: "OPERATIONAL_DATA",
  },
  COST_INCIDENCE_UNCERTAINTY: {
    route: "MERCHANT_INPUT_REQUIRED", evidence: "MERCHANT_ATTESTATION", channel: "MERCHANT_INPUT",
  },
  CONTRACT_OFF_STATEMENT_EVIDENCE_NEED: {
    route: "DOCUMENT_REQUIRED", evidence: "MERCHANT_CONTRACT_OR_SCHEDULE", channel: "DOCUMENT_REQUEST",
  },
};

describe("Provider-neutral planner semantic contract hardening v1", () => {
  it.each(SHADOW_AI_ISSUE_CLASSES)("binds the deterministic route envelope for %s", (issueClass) => {
    const compiled = compileShadowAiPlannerProviderRequestV1(packet(issueClass));
    const payload = JSON.parse(compiled.request.userPayload);
    const expected = EXPECTED[issueClass];

    expect(payload.resolutionContract).toMatchObject({
      requiredResolutionPath: expected.route,
      requiredEvidenceClasses: [expected.evidence],
      requiredGuidanceChannel: expected.channel,
      otherGuidanceChannelsMustBeEmpty: true,
    });
    expect(payload.reconstructionSuspicionContract).toEqual({
      allowed: false,
      reason: "NO_ACCEPTED_CONFLICT_RELATIONSHIP_PRESENT_IN_PACKET_CONTRACT",
      requiredBehavior: "RETURN_EMPTY_RECONSTRUCTION_SUSPICIONS",
    });

    const validated = validateAndBindShadowAiPlannerDraftV1(validDraft(compiled), compiled.localBinding);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.plan.recommendedResolutionPath).toBe(expected.route);
    expect(validated.plan.requiredEvidenceClasses).toEqual([expected.evidence]);
    expect(activeGuidanceChannels(validated.plan)).toEqual([expected.channel]);
    expect(validated.plan.reconstructionSuspicions).toEqual([]);
  });

  it("marks contextual activity facts explicitly and rejects them as citations or hypothesis support", () => {
    const compiled = compileShadowAiPlannerProviderRequestV1(packet("SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS"));
    const payload = JSON.parse(compiled.request.userPayload);
    const contextFact = payload.referenceTokenContract.catalog.find((entry: any) =>
      entry.referenceClass === "FACT" && entry.semanticRole === "CONTEXT_ONLY")?.token;
    expect(contextFact).toBeTruthy();
    expect(payload.packet.acceptedIssueRelevantActivityFacts[0].semanticRole).toBe("CONTEXT_ONLY");

    const base = validDraft(compiled);
    const validated = validateAndBindShadowAiPlannerDraftV1({
      ...base,
      exactCitedReferenceTokens: [contextFact],
      primaryHypothesis: { ...base.primaryHypothesis, supportingReferenceTokens: [contextFact] },
    }, compiled.localBinding);
    expect(validated.ok).toBe(false);
    if (!validated.ok) expect(validated.errors).toEqual(expect.arrayContaining([
      "exactCitedReferenceTokens_ineligible_reference_role",
      "primaryHypothesis.supportingReferenceTokens_ineligible_reference_role",
    ]));
  });

  it("admits empty support only when no issue-supporting reference exists and the epistemic boundary is complete", () => {
    const unsupported = compileShadowAiPlannerProviderRequestV1(packet("COST_INCIDENCE_UNCERTAINTY"));
    expect(unsupported.localBinding.semanticContract.issueSupportingReferenceTokens).toEqual([]);
    const accepted = validateAndBindShadowAiPlannerDraftV1(validDraft(unsupported), unsupported.localBinding);
    expect(accepted.ok).toBe(true);

    const tooConfidentDraft = validDraft(unsupported);
    const tooConfident = validateAndBindShadowAiPlannerDraftV1({
      ...tooConfidentDraft,
      primaryHypothesis: { ...tooConfidentDraft.primaryHypothesis, confidence: "MEDIUM" },
    }, unsupported.localBinding);
    expect(tooConfident.ok).toBe(false);
    if (!tooConfident.ok) expect(tooConfident.errors)
      .toContain("primaryHypothesis_low_confidence_required_without_issue_supporting_reference");

    const supported = compileShadowAiPlannerProviderRequestV1(packet("AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE"));
    const missingSupportDraft = validDraft(supported);
    const missingSupport = validateAndBindShadowAiPlannerDraftV1({
      ...missingSupportDraft,
      primaryHypothesis: { ...missingSupportDraft.primaryHypothesis, supportingReferenceTokens: [] },
    }, supported.localBinding);
    expect(missingSupport.ok).toBe(false);
    if (!missingSupport.ok) expect(missingSupport.errors)
      .toContain("primaryHypothesis_issue_supporting_reference_required");
  });

  it("fails closed on route drift, extra evidence classes, cross-channel guidance, and missing required guidance", () => {
    const compiled = compileShadowAiPlannerProviderRequestV1(packet("AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE"));
    const base = validDraft(compiled);
    const invalid = validateAndBindShadowAiPlannerDraftV1({
      ...base,
      recommendedResolutionPath: "DOCUMENT_REQUIRED",
      requiredEvidenceClasses: ["PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA", "MERCHANT_ATTESTATION"],
      merchantQuestionSuggestions: ["Ask for an unsupported channel."],
      operationalDataRequests: [],
    }, compiled.localBinding);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors).toEqual(expect.arrayContaining([
      "shadow_planner_resolution_path_contract_mismatch",
      "shadow_planner_required_evidence_contract_mismatch",
      "shadow_planner_cross_channel_guidance_forbidden",
      "shadow_planner_required_guidance_channel_empty",
    ]));
  });

  it("rejects reconstruction suspicion when the packet has no accepted conflict relationship", () => {
    const compiled = compileShadowAiPlannerProviderRequestV1(packet("SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS"));
    const base = validDraft(compiled);
    const refs = compiled.localBinding.semanticContract.issueSupportingReferenceTokens;
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const invalid = validateAndBindShadowAiPlannerDraftV1({
      ...base,
      reconstructionSuspicions: [{
        exactAcceptedReferenceTokens: [refs[0]!],
        reasonForSuspicion: "A deterministic recheck was requested without an accepted conflict relationship.",
        conflictingReferenceTokens: [refs[1]!],
        requestedDeterministicRecheckType: "POPULATION_IDENTITY_RECHECK",
      }],
    }, compiled.localBinding);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors)
      .toContain("shadow_planner_reconstruction_suspicion_not_allowed_without_accepted_conflict");
  });
});

function packet(issueClass: ShadowAiEconomicIssueClassV1): ShadowAiEconomicResolutionPacketV1 {
  const expected = EXPECTED[issueClass];
  const unsupported = issueClass === "COST_INCIDENCE_UNCERTAINTY";
  const issueFact = issueClass === "AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE";
  const withoutHash: Omit<ShadowAiEconomicResolutionPacketV1, "immutableInputHash"> = {
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
    purpose: "SHADOW_ECONOMIC_RESOLUTION_PLANNING_ONLY",
    outputAuthorityRequired: "NON_AUTHORITATIVE",
    opaqueRunRef: `shadow-run-${createHash("sha256").update(issueClass).digest("hex").slice(0, 16)}`,
    issueId: `synthetic-${issueClass.toLowerCase()}`,
    issueClass,
    processorFamily: "Synthetic Processor",
    processorProgram: "Synthetic Program",
    statementPeriod: { start: "2026-08-01", end: "2026-08-31" },
    acceptedIssueRelevantActivityFacts: [{
      factRef: `fact-context-${issueClass.toLowerCase()}`,
      field: "transactionCount",
      state: "KNOWN",
      value: 120,
      population: "statement_transactions",
      evidenceRefs: [`statement-evidence-${issueClass.toLowerCase()}`],
    }],
    selectedRdChargeRefs: unsupported ? [] : [`charge-${issueClass.toLowerCase()}`],
    sanitizedFeeLabels: ["SANITIZED SERVICE"],
    acceptedEconomicCategories: ["PROCESSOR_OR_SERVICE_ECONOMICS"],
    acceptedSensitivityStates: ["TRANSACTION_COUNT_DRIVEN"],
    acceptedQualificationIntegrityState: "UNKNOWN",
    acceptedParticipantControlStates: [],
    unresolvedClaimFacets: ["economic_role"],
    unresolvedReasonCodes: ["accepted_evidence_incomplete"],
    acceptedFactRefs: issueFact ? [`fact-context-${issueClass.toLowerCase()}`] : [],
    currentGovernedEvidenceRefs: unsupported ? [] : [`governed-${issueClass.toLowerCase()}`],
    allowedEvidenceClasses: [expected.evidence],
    prohibitedConclusions: ["canonical_fact_change", "customer_action_or_finding"],
    merchantBusinessContext: null,
    competingHypothesisRequired: issueClass !== "CONTRACT_OFF_STATEMENT_EVIDENCE_NEED",
  };
  return Object.freeze({
    ...withoutHash,
    immutableInputHash: createHash("sha256").update(canonicalJson(withoutHash)).digest("hex"),
  });
}

function validDraft(compiled: CompiledShadowAiPlannerProviderRequestV1): ShadowAiPlannerDraftV1 {
  const payload = JSON.parse(compiled.request.userPayload);
  const contract = payload.resolutionContract as {
    requiredResolutionPath: ShadowAiResolutionPathV1;
    requiredEvidenceClasses: ShadowAiRequiredEvidenceClassV1[];
    requiredGuidanceChannel: Expected["channel"];
  };
  const support = compiled.localBinding.semanticContract.issueSupportingReferenceTokens.slice(0, 1);
  const exact = compiled.localBinding.semanticContract.issueSupportingFactTokens.slice(0, 1);
  const hypothesis = {
    hypothesis: "A bounded explanation remains possible but is not established.",
    confidence: support.length > 0 ? "MEDIUM" as const : "LOW" as const,
    supportingReferenceTokens: support,
    contradictingReferenceTokens: [],
    acknowledgedEvidenceGaps: ["The required resolving evidence is not accepted."],
    confirmationRequirements: ["Obtain the contract-required evidence."],
    falsificationConditions: ["Accepted evidence establishes a different explanation."],
  };
  const guidance = {
    researchQuerySuggestions: contract.requiredGuidanceChannel === "PUBLIC_RESEARCH" ? ["Official documentation for the exact service role."] : [],
    merchantQuestionSuggestions: contract.requiredGuidanceChannel === "MERCHANT_INPUT" ? ["Confirm period-specific program operation."] : [],
    documentRequestSuggestions: contract.requiredGuidanceChannel === "DOCUMENT_REQUEST" ? ["Obtain the period-effective agreement."] : [],
    operationalDataRequests: contract.requiredGuidanceChannel === "OPERATIONAL_DATA" ? ["Obtain period-matched operational definitions and counts."] : [],
  };
  return {
    exactCitedReferenceTokens: exact,
    unresolvedQuestion: "What evidence resolves the selected issue?",
    primaryHypothesis: hypothesis,
    alternativeHypotheses: compiled.localBinding.packet.competingHypothesisRequired
      ? [{ ...hypothesis, hypothesis: "A distinct bounded alternative also remains possible.", confidence: "LOW" }]
      : [],
    acknowledgedEvidenceGaps: ["The required resolving evidence is not accepted."],
    recommendedResolutionPath: contract.requiredResolutionPath,
    requiredEvidenceClasses: contract.requiredEvidenceClasses,
    ...guidance,
    internalExplanationDraft: "Internal non-authoritative planning draft only.",
    limitationCodes: ["provider_draft_untrusted", "no_evidence_admitted"],
    reconstructionSuspicions: [],
  };
}

function activeGuidanceChannels(plan: {
  researchQuerySuggestions: readonly string[];
  merchantQuestionSuggestions: readonly string[];
  documentRequestSuggestions: readonly string[];
  operationalDataRequests: readonly string[];
}): Expected["channel"][] {
  return [
    ...(plan.researchQuerySuggestions.length > 0 ? ["PUBLIC_RESEARCH" as const] : []),
    ...(plan.merchantQuestionSuggestions.length > 0 ? ["MERCHANT_INPUT" as const] : []),
    ...(plan.documentRequestSuggestions.length > 0 ? ["DOCUMENT_REQUEST" as const] : []),
    ...(plan.operationalDataRequests.length > 0 ? ["OPERATIONAL_DATA" as const] : []),
  ];
}
