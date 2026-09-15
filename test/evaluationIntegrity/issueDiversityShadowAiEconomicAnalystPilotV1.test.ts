import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type {
  ShadowAiEconomicIssueClassV1,
  ShadowAiEconomicResolutionIssueV1,
  ShadowAiEconomicResolutionPacketV1,
  ShadowAiEconomicResolutionPlanV1,
} from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";
import {
  assessIssueDiversityPlanV1,
  auditBusinessContextGroundingV1,
  auditHallucinationAndOverreachV1,
  economicQuestionKeyV1,
  selectIssueDiversityCandidatesV1,
} from "../../src/evaluationIntegrity/issueDiversityShadowAiEconomicAnalystPilotV1.js";
import { createSyntheticFullPlannerPacketV1 } from "../../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";

describe("Issue-Diversity Shadow AI Economic Analyst Pilot v1", () => {
  it("selects one deterministic native issue per family while preferring distinct statements", () => {
    const candidates = [
      candidate(1, "statement-01", "AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE", 0),
      candidate(2, "statement-02", "AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE", 0),
      candidate(1, "statement-01", "SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS", 1),
      candidate(2, "statement-02", "SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS", 1),
      candidate(2, "statement-02", "PARTICIPANT_CONTROL_UNCERTAINTY", 2),
      candidate(3, "statement-03", "PARTICIPANT_CONTROL_UNCERTAINTY", 2),
      candidate(4, "statement-04", "CONTRACT_OFF_STATEMENT_EVIDENCE_NEED", 3),
      candidate(5, "statement-05", "COST_INCIDENCE_UNCERTAINTY", 4),
    ];
    const first = selectIssueDiversityCandidatesV1(candidates);
    const repeated = selectIssueDiversityCandidatesV1([...candidates].reverse());
    expect(canonicalJson(first)).toBe(canonicalJson(repeated));
    expect(first.selected.map((item) => [item.family, item.statementAlias])).toEqual([
      ["AUTHORIZATION_ECONOMICS", "statement-01"],
      ["SHARED_OR_BUNDLED_FEE_SEMANTICS", "statement-02"],
      ["PARTICIPANT_OR_CONTROL", "statement-03"],
      ["CONTRACT_OR_DOCUMENT", "statement-04"],
      ["BUSINESS_CONTEXT_SENSITIVE", "statement-05"],
    ]);
    expect(first.unavailable.map((item) => item.repositoryIssueClass)).toEqual([
      "QUALIFICATION_INTEGRITY_ROOT_CAUSE",
      "GATEWAY_PROCESSOR_TERMINOLOGY",
    ]);
    expect(new Set(first.selected.map((item) => item.issue.issueId)).size).toBe(first.selected.length);
    expect(new Set(first.selected.map((item) => item.economicQuestionKey)).size).toBe(first.selected.length);
  });

  it("uses facets and reason codes to prevent duplicate economic questions", () => {
    const first = packetFor("PARTICIPANT_CONTROL_UNCERTAINTY", ["collector"], ["collection_does_not_prove_control"]);
    const second = packetFor("PARTICIPANT_CONTROL_UNCERTAINTY", ["rule_setter"], ["collection_does_not_prove_control"]);
    expect(economicQuestionKeyV1(first)).not.toBe(economicQuestionKeyV1(second));
  });

  it("credits accepted business context but flags an unsupported factual business classification", () => {
    const packet = packetFor("COST_INCIDENCE_UNCERTAINTY", ["cost_offset_revenue"], ["program_use_unknown"]);
    const acceptedCategoryPacket = { ...packet, merchantBusinessContext: { ...packet.merchantBusinessContext!, admittedBusinessCategory: "restaurant_food_beverage", knownChannel: "mixed" } };
    const grounded = planFor(acceptedCategoryPacket, "The restaurant context may affect which merchant program questions are relevant.");
    const unsupported = planFor({ ...acceptedCategoryPacket, merchantBusinessContext: { ...acceptedCategoryPacket.merchantBusinessContext!, admittedBusinessCategory: null, knownChannel: null } }, "The merchant is a retail business.");
    expect(auditBusinessContextGroundingV1(grounded, acceptedCategoryPacket)[0]).toMatchObject({ support: "ACCEPTED_BUSINESS_CATEGORY", seriousGroundingFailure: false });
    expect(auditBusinessContextGroundingV1(unsupported, unsupportedPacket(acceptedCategoryPacket))[0]).toMatchObject({ support: "UNSUPPORTED_SPECULATION", seriousGroundingFailure: true });
  });

  it("distinguishes labeled hypotheses from unsupported factual assertions and scores safety independently", () => {
    const packet = packetFor("PARTICIPANT_CONTROL_UNCERTAINTY", ["collector", "price_setter"], ["collection_does_not_prove_control"]);
    const hypothesis = planFor(packet, "The collector may differ from the price setter.");
    const assertion = { ...planFor(packet, "A participant role may differ."), internalExplanationDraft: "The collector is the price setter." };
    expect(auditHallucinationAndOverreachV1(hypothesis, packet)).toContainEqual(expect.objectContaining({ category: "participant_role", classification: "LABELED_HYPOTHESIS" }));
    expect(auditHallucinationAndOverreachV1(assertion, packet)).toContainEqual(expect.objectContaining({ category: "participant_role", classification: "UNSUPPORTED_FACTUAL_ASSERTION" }));
    const quality = assessIssueDiversityPlanV1(hypothesis, packet, planFor(packet, "Participant roles remain unresolved."));
    expect(quality.scores.epistemicDiscipline).toBe(5);
    expect(quality.scores.restraintRefusalQuality).toBe(5);
    expect(quality.maximum).toBe(50);
  });
});

function candidate(statementOrdinal: number, statementAlias: string, issueClass: ShadowAiEconomicIssueClassV1, selectionIndex: number) {
  const packet = packetFor(issueClass, [`facet_${issueClass}`], [`reason_${issueClass}`]);
  const issue = {
    issueId: packet.issueId,
    issueClass,
    selectionPriority: issueClass === "CONTRACT_OFF_STATEMENT_EVIDENCE_NEED" ? 3 : issueClass === "PARTICIPANT_CONTROL_UNCERTAINTY" || issueClass === "COST_INCIDENCE_UNCERTAINTY" ? 2 : 1,
  } as ShadowAiEconomicResolutionIssueV1;
  return { statementOrdinal, statementAlias, selectionIndex, issue, packet, offlineStub: planFor(packet, "The issue remains unresolved.") };
}

function packetFor(issueClass: ShadowAiEconomicIssueClassV1, facets: string[], reasons: string[]): ShadowAiEconomicResolutionPacketV1 {
  const base = JSON.parse(JSON.stringify(createSyntheticFullPlannerPacketV1()), (_key, value) =>
    typeof value === "string" ? value.replaceAll("SYNTHETIC", "FIXTURE").replaceAll("synthetic", "fixture") : value) as ShadowAiEconomicResolutionPacketV1;
  const withoutHash = {
    ...base,
    issueId: `fixture_issue_${issueClass.toLowerCase()}`,
    issueClass,
    unresolvedClaimFacets: facets,
    unresolvedReasonCodes: reasons,
    merchantBusinessContext: {
      privacyClassification: "PURPOSE_BOUND_BUSINESS_IDENTITY" as const,
      businessName: "Opaque Business 01",
      naturalPersonOrSoleProprietorAmbiguity: "POSSIBLE" as const,
      admittedBusinessCategory: null,
      businessLocation: { country: "US", region: null, city: null },
      knownChannel: null,
      acceptedAverageTicket: null,
      supportedOperatingContext: [],
    },
  };
  const { immutableInputHash: _ignored, ...hashInput } = withoutHash;
  return { ...hashInput, immutableInputHash: createHash("sha256").update(canonicalJson(hashInput)).digest("hex") };
}

function unsupportedPacket(packet: ShadowAiEconomicResolutionPacketV1): ShadowAiEconomicResolutionPacketV1 {
  return { ...packet, merchantBusinessContext: { ...packet.merchantBusinessContext!, admittedBusinessCategory: null, knownChannel: null } };
}

function planFor(packet: ShadowAiEconomicResolutionPacketV1, hypothesis: string): ShadowAiEconomicResolutionPlanV1 {
  const item = {
    hypothesis,
    confidence: "LOW" as const,
    supportingFactRefs: packet.acceptedFactRefs.slice(0, 1),
    contradictingFactRefs: [],
    acknowledgedEvidenceGaps: ["Merchant-specific evidence is absent."],
    confirmationRequirements: ["Obtain period-matched evidence."],
    falsificationConditions: ["Contrary period-matched evidence would falsify the hypothesis."],
  };
  return {
    schemaVersion: "shadow_ai_economic_resolution_output_2026_09_14_v1",
    outputType: "AI_INFERENCE_ONLY",
    authority: "NON_AUTHORITATIVE",
    admissionStatus: "NOT_ADMITTED",
    truthEffect: "NONE",
    financialMutationAllowed: false,
    customerRenderingAllowed: false,
    issueId: packet.issueId,
    inputHash: packet.immutableInputHash,
    exactCitedFactRefs: packet.acceptedFactRefs.slice(0, 1),
    unresolvedQuestion: "What evidence resolves the selected issue?",
    primaryHypothesis: item,
    alternativeHypotheses: [{ ...item, hypothesis: "A documentation gap may instead explain the unresolved state." }],
    acknowledgedEvidenceGaps: ["Merchant-specific evidence is absent."],
    recommendedResolutionPath: packet.issueClass === "COST_INCIDENCE_UNCERTAINTY" ? "MERCHANT_INPUT_REQUIRED" : packet.issueClass === "CONTRACT_OFF_STATEMENT_EVIDENCE_NEED" ? "DOCUMENT_REQUIRED" : packet.issueClass === "AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE" || packet.issueClass === "QUALIFICATION_INTEGRITY_ROOT_CAUSE" ? "PROCESSOR_OR_GATEWAY_DATA_REQUIRED" : "PUBLIC_RESEARCH_REQUIRED",
    requiredEvidenceClasses: packet.allowedEvidenceClasses.slice(0, 1),
    researchQuerySuggestions: [],
    merchantQuestionSuggestions: ["What period-matched operational evidence is available?"],
    documentRequestSuggestions: [],
    operationalDataRequests: [],
    internalExplanationDraft: hypothesis,
    unresolvedAfterAnalysis: true,
    limitationCodes: ["fixture"],
    reconstructionSuspicions: [],
  };
}
