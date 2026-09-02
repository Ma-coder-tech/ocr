import { describe, expect, it } from "vitest";
import {
  CANONICAL_INTELLIGENCE_V2_VERSION_MANIFEST,
  buildLegacyIntelligenceComparison,
  compareLegacyIntelligenceObservation,
  hasUnexpectedIntelligenceDivergence,
  RG_SEMANTIC_AMENDMENT_IDS,
  runBoundedIntelligenceRuntime,
} from "../../../../src/canonical/v2/index.js";
import { buildSynthesis } from "../synthesisFixtures.js";
import { disabledPorts } from "./intelligenceFixtures.js";

describe("Canonical Intelligence V2 authority, comparison, and RA-RF invariance", () => {
  it("freezes all eleven and only the eleven approved RG semantic amendments", () => {
    expect(RG_SEMANTIC_AMENDMENT_IDS).toHaveLength(11);
    expect(CANONICAL_INTELLIGENCE_V2_VERSION_MANIFEST).toMatchObject({
      authority: "shadow_non_authoritative",
      persistence: "none",
      providerExecution: "injected_evaluation",
      automaticProviderRetries: 0,
      schemaRepairRetries: 0,
      knowledgeAdmissionAuthority: "prohibited",
      canonicalMutationAuthority: "prohibited",
      reportAuthority: "prohibited",
      customerExposure: "none",
    });
    expect(CANONICAL_INTELLIGENCE_V2_VERSION_MANIFEST.semanticAmendments).toEqual(RG_SEMANTIC_AMENDMENT_IDS);
  });

  it("turns an unapproved or misclassified legacy difference into unexpected divergence", () => {
    const approved = compareLegacyIntelligenceObservation({
      dimension: "ai_authority", legacyValue: "mutating", v2Value: "non_mutating",
      classification: "approved_semantic_amendment", amendmentId: "RG-AMEND-008-AI-NON-MUTATION", reasonCode: "approved_non_mutation",
    });
    const unapproved = compareLegacyIntelligenceObservation({
      dimension: "new_dimension", legacyValue: "a", v2Value: "b",
      classification: "approved_semantic_amendment", amendmentId: null, reasonCode: "missing_amendment",
    });
    expect(approved.classification).toBe("approved_semantic_amendment");
    expect(unapproved.classification).toBe("unexpected_divergence");
    expect(hasUnexpectedIntelligenceDivergence([approved, unapproved])).toBe(true);
  });

  it("leaves the complete accepted RE synthesis object byte-semantically invariant with all providers disabled", async () => {
    const synthesis = buildSynthesis();
    const before = structuredClone(synthesis);
    const result = await runBoundedIntelligenceRuntime({
      runId: "rg-invariance",
      canonicalTruth: synthesis,
      canonicalReferenceIds: [],
      admittedKnowledge: [],
      unknownQueue: [],
      questionOrigins: [],
      publicSourceAuthorityAdmissions: [],
      deterministicNotApplicableUnknownRefs: [],
      languageInputs: [],
    }, disabledPorts());
    expect(synthesis).toEqual(before);
    expect(result).toMatchObject({ canonicalTruthPreserved: true, terminalStatus: "disabled_no_provider", automaticAdmissionCount: 0 });
    expect(result.wholeStatementValidation).toMatchObject({ status: "completed", providerReview: "disabled_no_provider" });
    const comparison = buildLegacyIntelligenceComparison(result);
    expect(comparison).toHaveLength(10);
    expect(hasUnexpectedIntelligenceDivergence(comparison)).toBe(false);
  });
});
