import { describe, expect, it } from "vitest";
import {
  inspectProviderSafeQuestionContext,
  runInternalProviderPreflight,
  validateInvestigationQuestionOriginV1,
  validateInternalStatementAnalysisV1,
  validatePublicSourceEvidenceManifestV1,
} from "../../../../src/canonical/v2/index.js";
import { unsafeProviderContext } from "./injectedStatement1Fixture.js";

describe("internal-analysis origin, privacy, preflight, and projection boundaries", () => {
  it.each([
    { merchantNumber: "123456789" },
    { accountNumber: "987654321" },
    { filename: "merchant-statement.pdf" },
    { sourcePath: "/Users/private/statement" },
    { statementTotal: "$141.31" },
    { questionText: "merchant id MID 123456789" },
  ])("fails closed for private provider context %#", (privateFields) => {
    expect(inspectProviderSafeQuestionContext(unsafeProviderContext(privateFields))).toMatchObject({ valid: false });
  });

  it("requires a live-only preflight to have credentials and explicit authorization", () => {
    const result = runInternalProviderPreflight({ schemaVersion: "internal_provider_preflight_input_v1",
      runMode: "internal_live_evaluation", executionMode: "external_provider", runId: "preflight-test",
      outputDirectory: "/private/tmp/internal-analysis-preflight", sourceAuthorityRegistryLoaded: true,
      questionContexts: [unsafeProviderContext({})], search: { provider: "openrouter_web_search", engine: "perplexity", credentialPresent: false,
        modelConfigured: true, maxUses: 1, maxToolCalls: 1, resultCapBounded: true, fallbackProvidersAllowed: false,
        automaticRetries: 0, timeoutSupported: true, abortSupported: true, oneAttemptTransport: true },
      models: { provider: "openai_responses_api", credentialPresent: false, modelConfigured: true,
        structuredOutputSupported: true, outputTokenCeilingsSupported: true, automaticRetries: 0,
        timeoutSupported: true, abortSupported: true, oneAttemptTransport: true }, languageCapability: "disabled",
      productOwnerLiveCallAuthorization: false });
    expect(result).toMatchObject({ valid: false, externalExecutionAllowed: false });
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["preflight_required_credentials_missing", "preflight_live_call_not_authorized"]));
  });

  it("rejects malformed origins, unsupported impact claims, broken recommendation refs, and unsafe manifests", () => {
    const invalidOrigin = Object.freeze({ schemaVersion: "investigation_question_origin_v1", amendmentId: "E2E-AMEND-001-OBSERVATION-TO-INVESTIGATION",
      originId: "origin", unknownRef: "unknown", originLane: "statement_observation", questionClass: "application_fee_public_definition",
      claimType: "processor_term", subjectCode: "application_fee_terminology", safeResearchLabel: "application fee", questionText: "caller supplied",
      occurrenceRefs: ["occurrence"], evidenceRefs: ["evidence"], observedAmountMinor: 1, currency: "USD",
      materialityBasis: "observed_nonzero_charge", authority: "account_private_noncanonical_observation", visibility: "account_private",
      humanReviewRequired: true, canonicalMutationAllowed: false,
      prohibitedPresumptions: ["economic_category", "ownership_or_control", "removability", "pricing_architecture", "savings"] });
    expect(() => validateInvestigationQuestionOriginV1(invalidOrigin as never)).toThrow("unregistered_investigation_question_origin");
    const analysis = { schemaVersion: "internal_statement_analysis_v1", audience: "internal_analyst_only", authority: "shadow_non_authoritative",
      amendmentIds: ["E2E-AMEND-001-OBSERVATION-TO-INVESTIGATION"], safeStatementId: "safe", runId: "safe", evaluatedAt: "2026-08-23T00:00:00Z",
      terminalStatus: "completed_with_unresolved", canonicalBeforeHash: "same", canonicalAfterHash: "same", canonicalTruthPreserved: true,
      canonicalFacts: [], statementObservations: [], admittedKnowledge: [], supportedResearchFindings: [], investigativeHypotheses: [], contradictions: [], unresolvedQuestions: [],
      recommendations: [{ recommendationId: "bad", kind: "supported_economic_action", title: "Remove it", findingRefs: ["missing"], evidenceRefs: [],
        actionabilityCeiling: "verification_only", merchantControl: "unresolved", limitations: [] }],
      impact: [{ impactId: "bad", observationRef: null, state: "potential_reduction_exact", amountMinor: 100,
        maximumAmountMinor: null, currency: "USD", annualized: false, counterfactualRef: null, limitations: [] }], limitations: [] };
    expect(validateInternalStatementAnalysisV1(analysis as never)).toEqual(expect.arrayContaining([
      "potential_reduction_requires_canonical_counterfactual", "recommendation_authority_ceiling_invalid", "recommendation_finding_reference_invalid",
    ]));
    expect(validatePublicSourceEvidenceManifestV1({ schemaVersion: "public_source_evidence_manifest_v1", privacy: "internal_pre_uat_public_evidence",
      downloadedBodiesPersisted: false, entries: [{ evidenceId: "one", supportId: "support", questionId: "q", candidateId: "candidate", sourceUrl: "http://example.test",
        sourceTitle: "merchant-statement.pdf", sourceAuthority: "processor_publication", authorityAdmissionRef: "a", retrievedAt: "now",
        documentId: "d", documentFingerprint: "wrong", locator: { locatorId: "l", page: null, sectionCode: null, lineStart: 1, lineEnd: 1 },
        boundedSupportingExcerpt: "safe", semanticVerification: "unsupported", limitations: [] }] })).toEqual(expect.arrayContaining([
          "public_source_manifest_fingerprint_invalid", "public_source_manifest_https_required", "public_source_manifest_private_material_detected",
        ]));
  });

  it.each([
    { prohibitedPresumptions: ["economic_category", "economic_category", "removability", "pricing_architecture", "savings"] },
    { occurrenceRefs: ["occurrence", "occurrence"] }, { evidenceRefs: ["missing"] }, { observedAmountMinor: -1 },
    { observedAmountMinor: Number.NaN }, { observedAmountMinor: Number.POSITIVE_INFINITY },
  ])("fails closed for adversarial otherwise-registered origins %#", (override) => {
    const valid = Object.freeze({ schemaVersion: "investigation_question_origin_v1", amendmentId: "E2E-AMEND-001-OBSERVATION-TO-INVESTIGATION",
      originId: "origin", unknownRef: "unknown", originLane: "statement_observation", questionClass: "application_fee_public_definition",
      claimType: "processor_term", subjectCode: "application_fee_terminology", safeResearchLabel: "application fee",
      questionText: "Does an eligible authoritative public processor, platform, or program source define application fee terminology for the relevant public product context and period, and exactly what does that source establish?",
      occurrenceRefs: ["occurrence"], evidenceRefs: ["evidence"], observedAmountMinor: 1, currency: "USD", materialityBasis: "observed_nonzero_charge",
      authority: "account_private_noncanonical_observation", visibility: "account_private", humanReviewRequired: true, canonicalMutationAllowed: false,
      prohibitedPresumptions: ["economic_category", "ownership_or_control", "removability", "pricing_architecture", "savings"], ...override });
    expect(() => validateInvestigationQuestionOriginV1(valid as never, new Set(["evidence"]))).toThrow("invalid_investigation_question_origin_v1");
  });
});
