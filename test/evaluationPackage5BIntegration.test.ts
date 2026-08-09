import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { retrieveFeeKnowledgeDocument } from "../src/canonical/feeKnowledgeRetrieval.js";
import { buildCanonicalClaimSupportDecision } from "../src/canonical/feeKnowledgeClaimSupportDecision.js";
import { FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION } from "../src/canonical/feeKnowledgeTypes.js";
import type { ApprovedFeeKnowledgeSourceRegistry } from "../src/canonical/feeKnowledgeTypes.js";
import { type FeeKnowledgeResearchQuestion } from "../src/canonical/feeKnowledgeResearch.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { parsePdfBytes } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import { buildCanonicalRuntimeAnalysis } from "../src/canonical/runtimeAdapter.js";
import {
  ONE_TIME_RESEARCH_REQUEST_SLOTS,
  buildEvaluationSourceManifest,
  createDeterministicPreflightArtifact,
  preserveParserDecision,
  projectOneTimeCanonicalAdmissionResult,
  runManifestDrivenLiveEvaluation,
  sha256Canonical,
  verifyEvaluationRunIntegrityArtifactV2,
  type FinalizedOneTimeStatementEvaluation,
  type EvaluationExecutionStage,
  type RequestedDocumentExecution,
} from "../src/evaluationIntegrity/index.js";

const eligibleStages: EvaluationExecutionStage[] = [
  "parser", "whole_statement_ai_review", "web_search_discovery", "document_retrieval",
  "semantic_verification", "canonical_admission", "customer_publication", "final_artifact",
];

describe("Package 5B manifest-driven admission", () => {
  it("admits a fully validated statement-only review into Package F and persists a verifiable V2 artifact", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const expectedCalls = fullOneTimeCalls();
    let wholeStatementInvocations = 0;
    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls: expectedCalls,
      outputArtifactPath: path.join(fixture.directory, "package-5b-statement-only.json"),
      oneTimeResearchQuestionsForTesting: () => [],
      oneTimeServicesForTesting: {
        wholeStatementReview: async (packet) => {
          wholeStatementInvocations += 1;
          return external(validReview(packet), "request_whole_statement");
        },
      },
    });

    expect(result.finalStatus).toBe("completed");
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    const artifact = result.artifact;
    if (artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const admission = artifact.canonicalAdmissionResults[0]!;
    expect(admission.admissionDisposition).toBe("admitted");
    expect(admission.packageF?.output.reviewStatus).toBe("completed");
    expect(admission.package5a.executionRef).toBe(admission.executionRef);
    expect(admission.lifecycleAdmissionRef).toBe(admission.executionRef);
    expect(admission.researchEvidence.attempts).toEqual([]);
    expect(wholeStatementInvocations).toBe(admission.package5bWorkPlan?.selectedWorkUnitCount);
    const wholeStatementOutcomes = artifact.providerCallOutcomes.filter((outcome) => outcome.stage === "whole_statement_ai_review" && outcome.status === "success");
    const wholeStatementWorkUnitOutcomes = wholeStatementOutcomes.filter((outcome) => outcome.operationKind === "package_5b_work_unit");
    expect(wholeStatementOutcomes.filter((outcome) => outcome.operationKind === "package_5b_budget_envelope"))
      .toHaveLength(1);
    expect(wholeStatementWorkUnitOutcomes).toHaveLength(admission.package5bWorkPlan?.selectedWorkUnitCount);
    expect(wholeStatementWorkUnitOutcomes.every((outcome) => outcome.parentCallId === wholeStatementOutcomes.find((item) => item.operationKind === "package_5b_budget_envelope")?.callId))
      .toBe(true);
    expect(artifact.providerCallOutcomes.some((outcome) => /fee_classification|package_5c/i.test(outcome.stage))).toBe(false);
    expect(result.costLedger.entries.filter((entry) => entry.operationKind === "package_5b_work_unit"))
      .toHaveLength(admission.package5bWorkPlan?.selectedWorkUnitCount);
    expect(new Set(admission.package5bWorkPlan?.units.map((unit) => unit.requestId).filter(Boolean)))
      .toEqual(new Set(["request_whole_statement"]));
    const wholeStatementCallId = expectedCalls.find((call) => call.stage === "whole_statement_ai_review")!.reservation.callId;
    expect(result.costLedger.entries.find((entry) => entry.callId === wholeStatementCallId)?.observedOrEstimatedFinalCostUsd)
      .toBe(0);
    expect(result.costLedger.entries.filter((entry) => entry.operationKind === "package_5b_work_unit").every((entry) => entry.observedOrEstimatedFinalCostUsd === 0.01))
      .toBe(true);
    expect(result.costLedger.entries.filter((entry) => /fee_classification|package_5c/i.test(entry.callId))).toEqual([]);
    expect(result.packageFinancialInvariance[0]!.result.packages.every((item) => item.beforeHash === item.afterHash)).toBe(true);
    expect(JSON.parse(await readFile(result.artifactPath, "utf8"))).toEqual(result.artifact);
  }, 30_000);

  it("derives approved Package 5B work-unit pricing from a pricing-null budget envelope", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const calls = package5BReadinessCalls().map((call) => call.stage !== "whole_statement_ai_review"
      ? call
      : {
          ...call,
          reservation: {
            ...call.reservation,
            pricing: null,
            estimatedMaximumCostUsd: 1,
          },
        });
    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls,
      outputArtifactPath: path.join(fixture.directory, "package-5b-derived-work-unit-pricing.json"),
      oneTimeResearchQuestionsForTesting: () => [],
      oneTimeServicesForTesting: {
        wholeStatementReview: async (packet) => external(validReview(packet), "request_whole_derived_pricing"),
      },
    });

    expect(result.finalStatus).toBe("completed");
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const workUnitEntries = result.costLedger.entries.filter((entry) => entry.operationKind === "package_5b_work_unit");
    expect(workUnitEntries.length).toBeGreaterThan(0);
    expect(workUnitEntries.every((entry) =>
      entry.pricingPolicyRef === "sanitized_pricing_policy_v1" &&
      entry.provider === "openai" &&
      entry.providerRoute === "openai_ai_sdk_generate_text_structured_output" &&
      entry.model === "gpt-5.4-mini" &&
      entry.toolClass === "ai_sdk_structured_output" &&
      entry.maximumInputTokens !== null &&
      entry.maximumOutputTokens !== null &&
      entry.estimatedMaximumCostUsd > 0 &&
      entry.status === "success"
    )).toBe(true);
    expect(result.packageFinancialInvariance[0]!.result.invariant).toBe(true);
  }, 30_000);

  it("treats missing Package 5B credentials as pre-send provider unavailability with zero child exposure", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await runManifestDrivenLiveEvaluation({
        ...fixture.runnerInput,
        calls: package5BReadinessCalls(),
        outputArtifactPath: path.join(fixture.directory, "package-5b-provider-readiness-unavailable.json"),
        oneTimeResearchQuestionsForTesting: () => [],
      });

      expect(result.finalStatus).toBe("completed");
      expect(result.reasonCodes).toEqual(["evaluation_completed"]);
      expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
      if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
      const admission = result.artifact.canonicalAdmissionResults[0]!;
      expect(admission.admission.validationErrorCodes).toEqual(["whole_statement_provider_unavailable"]);
      expect(admission.packageF).toBeNull();
      expect(admission.package5bWorkPlan?.reviewedFeeRowCount).toBe(0);
      expect(admission.package5bWorkPlan?.missingFeeRowCount).toBe(admission.package5bWorkPlan?.expectedFeeRowCount);
      expect(admission.package5bWorkPlan?.selectedWorkUnitCount).toBe(0);
      expect(admission.package5bWorkPlan?.notSelectedWorkUnitCount).toBe(admission.package5bWorkPlan?.plannedWorkUnitCount);
      expect(new Set(admission.package5bWorkPlan?.units.map((unit) => unit.status)))
        .toEqual(new Set(["not_attempted_provider_unavailable"]));
      expect(new Set(admission.package5bWorkPlan?.units.map((unit) => unit.outcomeClass)))
        .toEqual(new Set(["provider_unavailable_before_send"]));
      expect(admission.package5bWorkPlan?.units.every((unit) =>
        unit.requestId === null &&
        unit.inputTokens === 0 &&
        unit.outputTokens === 0 &&
        unit.billingDisposition === "provider_confirmed_zero" &&
        unit.reasonCodes.includes("whole_statement_fee_intelligence_provider_credential_unavailable_before_send")
      )).toBe(true);
      expect(result.costLedger.entries.filter((entry) => entry.operationKind === "package_5b_work_unit")).toEqual([]);
      expect(result.providerCallOutcomes.filter((outcome) => outcome.operationKind === "package_5b_work_unit")).toEqual([]);
      const envelope = result.costLedger.entries.find((entry) => entry.operationKind === "package_5b_budget_envelope");
      expect(envelope).toMatchObject({
        status: "success",
        observedOrEstimatedFinalCostUsd: 0,
        billingDisposition: "provider_confirmed_zero",
      });
      expect(result.costLedger.cumulativeObservedUsd).toBe(0);
      expect(result.costLedger.cumulativeBudgetCommittedUsd).toBe(0);
      expect(result.packageFinancialInvariance[0]!.result.invariant).toBe(true);
    } finally {
      if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  }, 30_000);

  it("keeps successful retrieval diagnostics when retrieved text is not semantically eligible", async () => {
    const fixture = await approvedOneTimePdfFixture();
    let semanticCalls = 0;
    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls: fullOneTimeCalls(),
      outputArtifactPath: path.join(fixture.directory, "retrieval-diagnostics-not-eligible.json"),
      oneTimeResearchQuestionsForTesting: (analysis) => [researchQuestion(analysis)],
      oneTimeServicesForTesting: {
        webSearchDiscovery: async () => external([{ url: "https://www.fiserv.com/official-fee-guide/not-matching", title: "Official fee guide", publisher: "Fiserv" }], "request_search_not_eligible"),
        documentRetrieval: async (url, options) => external(await retrieveFeeKnowledgeDocument(url, {
          abortSignal: options.abortSignal,
          resolveHost: async () => ["93.184.216.34"],
          fetchImpl: async () => new Response("<p>Fiserv official merchant services guide for 2024.</p>", { status: 200, headers: { "content-type": "text/html" } }),
        }), "request_retrieval_not_eligible"),
        semanticVerification: async ({ structuredClaim }) => {
          semanticCalls += 1;
          return external(semanticSupport(structuredClaim), "request_semantic_should_not_run");
        },
        wholeStatementReview: async (packet) => external(validReview(packet), "request_whole_not_eligible"),
      },
    });

    expect(result.finalStatus).toBe("completed");
    expect(semanticCalls).toBe(0);
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const admission = result.artifact.canonicalAdmissionResults[0]!;
    const candidate = admission.researchEvidence.candidates[0]!;
    expect(candidate).toMatchObject({
      retrievalStatus: "retrieved_text",
      semanticVerificationStatus: "not_eligible",
      verificationStatus: "provisional",
      claimSupportRefs: [],
    });
    expect(candidate.reasonCodes).toEqual(expect.arrayContaining([
      "fee_knowledge_text_retrieved",
      "fee_knowledge_claim_support_missing",
      "fee_knowledge_semantic_not_eligible_claim_support_missing",
    ]));
    expect(candidate.safeRetrievalDiagnostics).toMatchObject({
      sourceDomain: "www.fiserv.com",
      outcomeClass: "successful_usable_retrieval",
      attemptedNetwork: true,
      httpStatus: 200,
      contentType: "text/html",
    });
    expect(JSON.stringify(candidate.safeRetrievalDiagnostics)).not.toContain("/official-fee-guide/");
    expect(admission.researchEvidence.claimSupports).toEqual([]);
    expect(result.packageFinancialInvariance[0]!.result.invariant).toBe(true);
  }, 30_000);

  it("classifies missing OpenAI readiness before web discovery send without blocking deterministic statement success", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await runManifestDrivenLiveEvaluation({
        ...fixture.runnerInput,
        calls: openAiReadinessCalls(),
        outputArtifactPath: path.join(fixture.directory, "integrated-web-readiness-unavailable.json"),
        oneTimeResearchQuestionsForTesting: (analysis) => Array.from({ length: 4 }, (_, index) => researchQuestion(analysis, index)),
      });

      expect(result.finalStatus).toBe("completed");
      expect(result.costLedger.cumulativeObservedUsd).toBe(0);
      expect(result.costLedger.cumulativeBudgetCommittedUsd).toBe(0);
      expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
      if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
      const admission = result.artifact.canonicalAdmissionResults[0]!;
      expect(admission.admissionDisposition).toBe("rejected");
      expect(admission.admission.validationErrorCodes).toEqual(["whole_statement_research_incomplete"]);
      expect(admission.researchEvidence.attempts
        .sort((left, right) => left.questionOrdinal - right.questionOrdinal)
        .map((attempt) => [attempt.status, attempt.reasonCodes[0]])).toEqual([
          ["provider_unavailable", "fee_knowledge_web_search_provider_unavailable_before_send"],
          ["provider_unavailable", "fee_knowledge_web_search_provider_unavailable_before_send"],
          ["not_selected_planning", "fee_knowledge_research_not_selected_planning"],
          ["not_selected_planning", "fee_knowledge_research_not_selected_planning"],
        ]);
      expect(admission.researchEvidence.candidates).toEqual([]);
      expect(admission.researchEvidence.claimSupports).toEqual([]);
      expect(result.providerCallOutcomes.filter((outcome) => outcome.stage === "web_search_discovery"))
        .toHaveLength(ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch);
      expect(result.providerCallOutcomes
        .filter((outcome) => outcome.stage === "web_search_discovery")
        .every((outcome) => outcome.status === "success"
          && outcome.requestId === null
          && outcome.reasonCodes.includes("fee_knowledge_web_search_provider_unavailable_before_send"))).toBe(true);
      expect(result.providerCallOutcomes.some((outcome) => outcome.reasonCodes.includes("provider_call_failed"))).toBe(false);
      expect(result.packageFinancialInvariance[0]!.result.invariant).toBe(true);
    } finally {
      if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  }, 30_000);

  it("classifies missing OpenAI readiness before semantic verification send without admitting unavailable evidence", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    let feeLabel = "fee";
    try {
      const result = await runManifestDrivenLiveEvaluation({
        ...fixture.runnerInput,
        calls: openAiReadinessCalls(),
        outputArtifactPath: path.join(fixture.directory, "integrated-semantic-readiness-unavailable.json"),
        oneTimeResearchQuestionsForTesting: (analysis) => [researchQuestion(analysis)],
        oneTimeServicesForTesting: {
          webSearchDiscovery: async ({ questions: [question] }) => {
            feeLabel = question!.feeLabel;
            return external([{ url: "https://www.fiserv.com/semantic-provider-unavailable", title: "Official fee guide", publisher: "Fiserv" }], "request_search_semantic_readiness");
          },
          documentRetrieval: async (url) => external(retrievedTextDocument(url, feeLabel), "request_retrieval_semantic_readiness"),
          wholeStatementReview: async (packet) => external(validReview(packet), "request_whole_semantic_readiness"),
        },
      });

      expect(result.finalStatus).toBe("completed");
      expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
      if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
      const admission = result.artifact.canonicalAdmissionResults[0]!;
      expect(admission.admissionDisposition).toBe("rejected");
      expect(admission.researchEvidence.claimSupports).toEqual([]);
      expect(admission.researchEvidence.candidates[0]).toMatchObject({
        retrievalStatus: "retrieved_text",
        semanticVerificationStatus: "provider_unavailable",
        verificationStatus: "verified_candidate_limited",
      });
      expect(admission.researchEvidence.candidates[0]?.reasonCodes).toContain("fee_knowledge_semantic_provider_unavailable_before_send");
      const semanticOutcome = result.providerCallOutcomes.find((outcome) => outcome.stage === "semantic_verification");
      expect(semanticOutcome).toMatchObject({
        status: "success",
        requestId: null,
      });
      expect(semanticOutcome?.reasonCodes).toContain("fee_knowledge_semantic_provider_unavailable_before_send");
      const semanticLedger = result.costLedger.entries.find((entry) => entry.callId === semanticOutcome?.callId);
      expect(semanticLedger).toMatchObject({
        observedOrEstimatedFinalCostUsd: 0,
        billingDisposition: "provider_confirmed_zero",
      });
      expect(result.packageFinancialInvariance[0]!.result.invariant).toBe(true);
    } finally {
      if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  }, 30_000);

  it("does not send Package 5B work units whose serialized provider input exceeds the approved bound", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "synthetic-present-key";
    let wholeStatementInvocations = 0;
    try {
      const result = await runManifestDrivenLiveEvaluation({
        ...fixture.runnerInput,
        calls: package5BReadinessCalls().map((call) => call.stage !== "whole_statement_ai_review"
          ? call
          : {
            ...call,
            reservation: {
              ...call.reservation,
              maximumInputTokens: 1,
            },
          }),
        outputArtifactPath: path.join(fixture.directory, "package-5b-provider-input-bound.json"),
        oneTimeResearchQuestionsForTesting: () => [],
        oneTimeServicesForTesting: {
          wholeStatementReview: async (packet) => {
            wholeStatementInvocations += 1;
            return external(validReview(packet), "request_should_not_send");
          },
        },
      });

      expect(wholeStatementInvocations).toBe(0);
      expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
      if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
      const admission = result.artifact.canonicalAdmissionResults[0]!;
      expect(admission.packageF).toBeNull();
      expect(admission.package5bWorkPlan?.reviewedFeeRowCount).toBe(0);
      expect(admission.package5bWorkPlan?.missingFeeRowCount).toBe(admission.package5bWorkPlan?.expectedFeeRowCount);
      expect(new Set(admission.package5bWorkPlan?.units.map((unit) => unit.status))).toEqual(new Set(["not_selected_budget"]));
      expect(new Set(admission.package5bWorkPlan?.units.map((unit) => unit.outcomeClass))).toEqual(new Set(["budget_not_selected"]));
      expect(admission.package5bWorkPlan?.units.every((unit) =>
        unit.requestId === null &&
        unit.inputTokens === 0 &&
        unit.outputTokens === 0 &&
        unit.billingDisposition === "provider_confirmed_zero" &&
        unit.reasonCodes.includes("whole_statement_fee_intelligence_work_unit_input_bound_exceeded_before_send")
      )).toBe(true);
      expect(result.costLedger.entries.filter((entry) => entry.operationKind === "package_5b_work_unit")).toEqual([]);
      const workUnitOutcomes = result.providerCallOutcomes.filter((outcome) => outcome.operationKind === "package_5b_work_unit");
      expect(workUnitOutcomes).toHaveLength(admission.package5bWorkPlan?.plannedWorkUnitCount ?? 0);
      expect(workUnitOutcomes.every((outcome) =>
        outcome.status === "cancelled_before_send" &&
        outcome.requestId === null &&
        outcome.reasonCodes.includes("whole_statement_fee_intelligence_work_unit_input_bound_exceeded_before_send") &&
        outcome.reasonCodes.includes("whole_statement_fee_intelligence_work_unit_not_selected_budget")
      )).toBe(true);
      expect(result.costLedger.cumulativeObservedUsd).toBe(0);
      expect(result.packageFinancialInvariance[0]!.result.invariant).toBe(true);
    } finally {
      if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  }, 30_000);

  it("redacts amount-bearing Clover fee labels before one-time Package 5B outbound services", async () => {
    const fixture = await approvedShortCloverPdfFixture();
    const document = await parsePdfBytes(fixture.bytes);
    const summary = analyzeStatementDocument(document, "restaurant_food_beverage");
    expect(summary.parserSource?.driverId).toBe("fiserv_first_data_short_statement");
    const baselineAnalysis = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "doc_one_time_clover_short",
      legacySummary: summary,
    }).analysis;
    const baselineFeeLedger = structuredClone(baselineAnalysis.feeLedger);
    let wholeStatementInvocations = 0;
    let preparedPacket: any = null;
    let packetObservedByWholeStatementService: any = null;
    const searchedQuestions: FeeKnowledgeResearchQuestion[] = [];

    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls: fullOneTimeCalls("doc_one_time_clover_short"),
      outputArtifactPath: path.join(fixture.directory, "package-5b-clover-outbound-privacy.json"),
      afterPacketPreparedForTesting: (_sourceDocumentId, packet) => { preparedPacket = structuredClone(packet); },
      oneTimeServicesForTesting: {
        webSearchDiscovery: async ({ questions }) => {
          searchedQuestions.push(...questions);
          return external([], `request_search_privacy_${searchedQuestions.length}`);
        },
        wholeStatementReview: async (packet) => {
          wholeStatementInvocations += 1;
          packetObservedByWholeStatementService = structuredClone(packet);
          return external(validReview(packet), "request_whole_privacy");
        },
      },
    });

    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    expect(preparedPacket).not.toBeNull();
    expect(packetObservedByWholeStatementService).not.toBeNull();
    expect(wholeStatementInvocations).toBeGreaterThan(0);
    expect(result.providerCallOutcomes.some((outcome) => /fee_classification|package_5c/i.test(outcome.stage))).toBe(false);
    expect(result.packageFinancialInvariance).toHaveLength(1);
    expect(result.packageFinancialInvariance[0]!.result.invariant).toBe(true);
    expect(result.packageFinancialInvariance[0]!.result.packages.every((item) => item.beforeHash === item.afterHash)).toBe(true);

    const sentLabels = packetObservedByWholeStatementService.admittedFeeRows.map((row: any) => row.selectedLabel);
    expect(packetObservedByWholeStatementService.admittedFeeRows).toHaveLength(baselineFeeLedger.rows.length);
    expect(baselineFeeLedger).toEqual(baselineAnalysis.feeLedger);
    expect(sentLabels.some((label: string) => /NON SWIPED DISCOUNT/i.test(label))).toBe(true);
    expect(sentLabels.some((label: string) => label.includes("[redacted]"))).toBe(true);
    expect(outboundFeeLabelPrivacyMatches(sentLabels)).toEqual({
      currencyOrRate: 0,
      residualFinancialNumeric: 0,
      genericLongIdentifier: 0,
      merchantOrAccountIdentifier: 0,
      pathOrFilename: 0,
      credential: 0,
      providerOrRawContent: 0,
    });
    expect(outboundFeeLabelPrivacyMatches(preparedPacket.wholeStatementReview.admittedFeeRows.map((row: any) => row.selectedLabel))).toEqual({
      currencyOrRate: 0,
      residualFinancialNumeric: 0,
      genericLongIdentifier: 0,
      merchantOrAccountIdentifier: 0,
      pathOrFilename: 0,
      credential: 0,
      providerOrRawContent: 0,
    });
    expect(searchedQuestions.length).toBeGreaterThan(0);
    expect(outboundFeeLabelPrivacyMatches(searchedQuestions.map((question) => question.feeLabel))).toEqual({
      currencyOrRate: 0,
      residualFinancialNumeric: 0,
      genericLongIdentifier: 0,
      merchantOrAccountIdentifier: 0,
      pathOrFilename: 0,
      credential: 0,
      providerOrRawContent: 0,
    });
  }, 60_000);

  it("rejects an out-of-order or duplicate whole-statement call plan before any service invocation", async () => {
    for (const mode of ["out_of_order", "duplicate_whole"] as const) {
      const fixture = await approvedOneTimePdfFixture();
      let serviceInvocations = 0;
      const ordered = fullOneTimeCalls();
      const whole = ordered.find((call) => call.stage === "whole_statement_ai_review")!;
      const calls = mode === "out_of_order"
        ? [whole, ...ordered.filter((call) => call !== whole)]
        : [...ordered, { ...whole, reservation: { ...whole.reservation, callId: "package_5b_duplicate_whole" } }];
      await expect(runManifestDrivenLiveEvaluation({
        ...fixture.runnerInput,
        calls,
        approvedBudgetUsd: 20,
        outputArtifactPath: path.join(fixture.directory, `package-5b-${mode}.json`),
        oneTimeResearchQuestionsForTesting: () => [],
        onAdapterCreatedForTesting: () => { serviceInvocations += 100; },
        oneTimeServicesForTesting: {
          webSearchDiscovery: async () => { serviceInvocations += 1; return []; },
          wholeStatementReview: async () => { serviceInvocations += 1; return {}; },
        },
      })).rejects.toMatchObject({ code: "manifest_schema_invalid" });
      expect(serviceInvocations).toBe(0);
    }
  });

  it("admits exact runtime research support only after complete discovery, retrieval, semantics, and reconciliation", async () => {
    const fixture = await approvedOneTimePdfFixture();
    let searchedLabel = "";
    let initiallyPreparedPacket: any = null;
    const packetsObservedByWholeStatementService: any[] = [];
    let finalizedEvaluation: FinalizedOneTimeStatementEvaluation | null = null;
    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls: fullOneTimeCalls(),
      outputArtifactPath: path.join(fixture.directory, "package-5b-runtime-research.json"),
      oneTimeResearchQuestionsForTesting: (analysis) => [researchQuestion(analysis)],
      afterPacketPreparedForTesting: (_sourceDocumentId, packet) => { initiallyPreparedPacket = structuredClone(packet); },
      onOneTimeFinalizedForTesting: (_sourceDocumentId, finalized) => { finalizedEvaluation = structuredClone(finalized); },
      oneTimeServicesForTesting: {
        webSearchDiscovery: async ({ questions: [question] }) => {
          searchedLabel = question!.feeLabel;
          return external([{ url: "https://www.fiserv.com/official-fee-guide", title: "Official fee guide", publisher: "Fiserv" }], "request_search");
        },
        documentRetrieval: async (url, options) => external(await retrieveFeeKnowledgeDocument(url, {
          abortSignal: options.abortSignal,
          resolveHost: async () => ["93.184.216.34"],
          fetchImpl: async () => new Response(`<html><body><p>Fiserv ${searchedLabel} official classification guide for 2024.</p></body></html>`, { status: 200, headers: { "content-type": "text/html" } }),
        }), "request_retrieval"),
        semanticVerification: async ({ structuredClaim }) => external({
          type: "fee_knowledge_semantic_support_decision",
          policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
          decision: "supports",
          structuredClaim,
          reasonCodes: ["synthetic_semantic_support"],
          providerDetailsStripped: true,
        }, "request_semantic"),
        wholeStatementReview: async (packet) => {
          packetsObservedByWholeStatementService.push(structuredClone(packet));
          return external(validReview(packet, true), "request_whole_research");
        },
      },
    });

    expect(result.finalStatus).toBe("completed");
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const admission = result.artifact.canonicalAdmissionResults[0]!;
    if (!finalizedEvaluation) throw new Error("expected finalized one-time evaluation");
    expect(admission.admissionDisposition).toBe("admitted");
    expect(admission.researchEvidence.attempts).toHaveLength(1);
    expect(admission.researchEvidence.candidates).toHaveLength(1);
    expect(admission.researchEvidence.claimSupports[0]).toMatchObject({ origin: "runtime_research", disposition: "accepted" });
    expect(packetsObservedByWholeStatementService.some((packet) =>
      packet.sourceProvenancePacket.claimSupports.some((support: any) => support.candidateId !== null),
    )).toBe(true);
    expect(admission.researchEvidence.claimSupports.some((support) => support.origin === "runtime_research")).toBe(true);
    const sentWholeStatementPacket = finalizedEvaluation.wholeStatementPacketSent;
    if (!sentWholeStatementPacket) throw new Error("expected sent whole-statement packet");
    expect(sha256Canonical(sentWholeStatementPacket)).toBe(admission.canonicalReferenceProof.wholeStatementPacketContentHash);
    expect(sha256Canonical(finalizedEvaluation.preparedPacket)).toBe(admission.canonicalReferenceProof.preparedSanitizedPacketContentHash);
    expect(finalizedEvaluation.preparedPacket).toEqual({
      ...initiallyPreparedPacket,
      wholeStatementReview: sentWholeStatementPacket,
    });
    const changedSentPacket = structuredClone(finalizedEvaluation);
    changedSentPacket.wholeStatementPacketSent!.reviewPolicyVersion = "changed_after_send" as any;
    expect(() => projectOneTimeCanonicalAdmissionResult({ sourceDocumentId: "doc_one_time_fiserv", finalized: changedSentPacket })).toThrow("package_5b_sent_whole_statement_packet_mismatch");
    const changedDecisionRef = structuredClone(finalizedEvaluation);
    changedDecisionRef.sourcePacket.researchCandidates[0]!.claimSupportDecisionRef = `claim_support_decision_${"f".repeat(64)}`;
    expect(() => projectOneTimeCanonicalAdmissionResult({ sourceDocumentId: "doc_one_time_fiserv", finalized: changedDecisionRef })).toThrow("package_5b_runtime_support_decision_reference_mismatch");
    expect(admission.package5a.stageStates.sourceQuality).toBe("passed");
    expect(admission.packageF?.output.acceptanceRecords.some((record) => record.status === "accepted" || record.status === "accepted_with_conditions")).toBe(true);

    const support = finalizedEvaluation.sourcePacket.claimSupports.find((item) => item.candidateId !== null)!;
    const supportDecision = buildCanonicalClaimSupportDecision({ support, sourcePacket: finalizedEvaluation.sourcePacket, registry: null });
    expect(supportDecision.disposition).toBe("accepted");
    expect(supportDecision.reasonCodes).toEqual([`fee_knowledge_${support.evidenceDecision}`]);
    const confidenceExceeded = structuredClone(support);
    confidenceExceeded.structuredClaim.maximumConfidence = "low";
    confidenceExceeded.confidence = "high";
    expect(buildCanonicalClaimSupportDecision({ support: confidenceExceeded, sourcePacket: finalizedEvaluation.sourcePacket, registry: null }).disposition).toBe("rejected");
    const actionabilityExceeded = structuredClone(support);
    actionabilityExceeded.structuredClaim.actionabilityCeiling = "not_actionable";
    actionabilityExceeded.actionabilityCeiling = "potentially_actionable";
    expect(buildCanonicalClaimSupportDecision({ support: actionabilityExceeded, sourcePacket: finalizedEvaluation.sourcePacket, registry: null }).disposition).toBe("rejected");
    const malformedApplication = structuredClone(support);
    malformedApplication.evidenceDecision = "verified_application";
    malformedApplication.structuredClaim.claimKind = "merchant_application";
    malformedApplication.structuredClaim.applicationBasis = "not_evaluated";
    expect(buildCanonicalClaimSupportDecision({ support: malformedApplication, sourcePacket: finalizedEvaluation.sourcePacket, registry: null }).disposition).toBe("rejected");
  }, 30_000);

  it("admits verified application proof with a closed Artifact V2 reason contract", async () => {
    const fixture = await approvedOneTimePdfFixture();
    let feeLabel = "fee";
    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls: fullOneTimeCalls(),
      outputArtifactPath: path.join(fixture.directory, "package-5b-verified-application.json"),
      oneTimeResearchQuestionsForTesting: (analysis) => [{
        ...researchQuestion(analysis),
        sanitizedQuestionCategory: "applicability",
        semanticQuestion: "Verify the published rule application calculation against the statement basis.",
      }],
      oneTimeServicesForTesting: {
        webSearchDiscovery: async ({ questions: [question] }) => {
          feeLabel = question!.feeLabel;
          return external([{ url: "https://www.fiserv.com/application-proof", title: "Official fee guide", publisher: "Fiserv" }], "request_search_application");
        },
        documentRetrieval: async (url) => external(retrievedTextDocument(url, feeLabel), "request_retrieval_application"),
        semanticVerification: async ({ structuredClaim }) => external({
          ...semanticSupport(structuredClaim),
          structuredClaim: {
            ...structuredClaim,
            claimKind: "merchant_application" as const,
            applicationBasis: "statement_basis_matches" as const,
          },
          reasonCodes: ["deterministic_calculation_matches"],
        }, "request_semantic_application"),
        wholeStatementReview: async (packet) => external(validReview(packet, true), "request_whole_application"),
      },
    });

    expect(result.finalStatus).toBe("completed");
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const admission = result.artifact.canonicalAdmissionResults[0]!;
    const support = admission.researchEvidence.claimSupports[0]!;
    expect(admission.admissionDisposition).toBe("admitted");
    expect(support).toMatchObject({
      evidenceDecision: "verified_application",
      semanticDecision: "supports",
      hasDeterministicCalculationProof: true,
      reasonCodes: ["fee_knowledge_verified_application"],
      disposition: "accepted",
    });
    expect(admission.packageF).not.toBeNull();
  }, 30_000);

  it("preserves uniquely resolved runtime and approved source-only references", async () => {
    const runtimeFixture = await approvedOneTimePdfFixture();
    let runtimeLabel = "fee";
    const runtime = await runManifestDrivenLiveEvaluation({
      ...runtimeFixture.runnerInput,
      calls: fullOneTimeCalls(),
      outputArtifactPath: path.join(runtimeFixture.directory, "package-5b-runtime-source-only.json"),
      oneTimeResearchQuestionsForTesting: (analysis) => [researchQuestion(analysis)],
      oneTimeServicesForTesting: {
        webSearchDiscovery: async ({ questions: [question] }) => {
          runtimeLabel = question!.feeLabel;
          return external([{ url: "https://www.fiserv.com/runtime-source-only", title: "Official fee guide", publisher: "Fiserv" }], "request_search_runtime_source_only");
        },
        documentRetrieval: async (url) => external(retrievedTextDocument(url, runtimeLabel), "request_retrieval_runtime_source_only"),
        semanticVerification: async ({ structuredClaim }) => external(semanticSupport(structuredClaim), "request_semantic_runtime_source_only"),
        wholeStatementReview: async (packet) => {
          const review = validReview(packet, true);
          const externalRow = review.rowInterpretations.find((row: any) => row.evidenceProvenance === "runtime_verified_documentation");
          if (externalRow) externalRow.externalClaimSupportRef = null;
          return external(review, "request_whole_runtime_source_only");
        },
      },
    });
    expect(verifyEvaluationRunIntegrityArtifactV2(runtime.artifact)).toBe(true);
    if (runtime.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const runtimeAdmission = runtime.artifact.canonicalAdmissionResults[0]!;
    expect(runtimeAdmission.admissionDisposition).toBe("admitted");
    expect(runtimeAdmission.packageF?.output.rowInterpretations.find((row) => row.evidenceProvenance === "runtime_verified_documentation"))
      .toMatchObject({ externalClaimSupportRef: null });
    expect(runtimeAdmission.packageF?.output.acceptanceRecords.some((record) => record.externalClaimSupportRef === null && record.status === "rejected"))
      .toBe(true);

    const approvedFixture = await approvedOneTimePdfFixture();
    const approvedAnalysis = await canonicalAnalysisForFixture(approvedFixture.bytes);
    const registry = registryForAnalysis(approvedAnalysis, "exact");
    const approved = await runManifestDrivenLiveEvaluation({
      ...approvedFixture.runnerInput,
      calls: fullOneTimeCalls(),
      outputArtifactPath: path.join(approvedFixture.directory, "package-5b-approved-source-only.json"),
      oneTimeRegistryForTesting: registry,
      oneTimeResearchQuestionsForTesting: () => [],
      oneTimeServicesForTesting: {
        wholeStatementReview: async (packet) => {
          const review = validReviewWithApprovedSupport(packet);
          const externalRow = review.rowInterpretations.find((row: any) => row.evidenceProvenance === "approved_external_documentation");
          if (externalRow) externalRow.externalClaimSupportRef = null;
          return external(review, "request_whole_approved_source_only");
        },
      },
    });
    expect(verifyEvaluationRunIntegrityArtifactV2(approved.artifact)).toBe(true);
    if (approved.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    expect(approved.artifact.canonicalAdmissionResults[0]).toMatchObject({ admissionDisposition: "admitted" });
    expect(approved.artifact.canonicalAdmissionResults[0]!.packageF?.output.rowInterpretations.find((row) => row.evidenceProvenance === "approved_external_documentation"))
      .toMatchObject({ externalClaimSupportRef: null });
  }, 60_000);

  it("fails closed for ambiguous, foreign, and claim/source-mismatched references", async () => {
    for (const mode of ["ambiguous", "foreign", "mismatched_pair"] as const) {
      const fixture = await approvedOneTimePdfFixture();
      const analysis = await canonicalAnalysisForFixture(fixture.bytes);
      const registry = registryForAnalysis(analysis, "exact");
      if (mode !== "foreign") {
        registry.sources[0]!.claims.push({
          ...structuredClone(registry.sources[0]!.claims[0]!),
          claimId: `claim_package_5b_${mode}_second`,
          sourceLocator: "Second approved source identity",
        });
      }
      let finalized: FinalizedOneTimeStatementEvaluation | null = null;
      const result = await runManifestDrivenLiveEvaluation({
        ...fixture.runnerInput,
        calls: fullOneTimeCalls(),
        outputArtifactPath: path.join(fixture.directory, `package-5b-reference-${mode}.json`),
        oneTimeRegistryForTesting: registry,
        oneTimeResearchQuestionsForTesting: () => [],
        onOneTimeFinalizedForTesting: (_sourceDocumentId, value) => { finalized = structuredClone(value); },
        oneTimeServicesForTesting: {
          wholeStatementReview: async (packet) => {
            const review = validReviewWithApprovedSupport(packet);
            const row = review.rowInterpretations.find((item: any) => item.evidenceProvenance === "approved_external_documentation")!;
            if (mode === "ambiguous") row.externalClaimSupportRef = null;
            if (mode === "foreign") {
              row.externalClaimSupportRef = null;
              row.externalSourceRef = "approved_source_foreign";
            }
            if (mode === "mismatched_pair") row.externalSourceRef = registry.sources[0]!.claims[1]!.claimId;
            return external(review, `request_whole_reference_${mode}`);
          },
        },
      });

      expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
      if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
      const admission = result.artifact.canonicalAdmissionResults[0]!;
      expect(admission.admissionDisposition).toBe("rejected");
      expect(admission.packageF).toBeNull();
      expect(finalized).not.toBeNull();
      expect(finalized!.admission.admission.reasonCodes).toContain("whole_statement_claim_support_reference_not_unique");
    }
  }, 90_000);

  it("fails closed for unsupported semantics, failed research, safety blocks, and budget exhaustion", async () => {
    const modes = ["unsupported", "contradiction", "failed", "safety", "budget"] as const;
    for (const mode of modes) {
      const fixture = await approvedOneTimePdfFixture();
      let modeFeeLabel = "";
      const labelByUrl = new Map<string, string>();
      const timeoutOrFailure = Object.assign(new Error("private research failure"), { accounting: { requestId: `request_${mode}`, durationMs: 2 } });
      const result = await runManifestDrivenLiveEvaluation({
        ...fixture.runnerInput,
        calls: fullOneTimeCalls(),
        outputArtifactPath: path.join(fixture.directory, `package-5b-${mode}.json`),
        oneTimeResearchQuestionsForTesting: (analysis) => mode === "budget"
          ? Array.from({ length: 4 }, (_, index) => researchQuestion(analysis, index))
          : [researchQuestion(analysis)],
        onCanonicalAdmissionProjectedForTesting: mode === "budget" ? (value) => {
          expect(value.admissionDisposition).toBe("rejected");
          expect(value.admission.validationErrorCodes).toEqual(["whole_statement_research_incomplete"]);
          expect(value.package5a).toMatchObject({ executionState: "completed", admissionState: "rejected", finalCanonicalStatus: "rejected" });
          expect(value.package5a.stageStates).toEqual({ responseParse: "not_observed", schemaValidation: "not_observed", evidenceCitation: "not_observed", sourceQuality: "not_applicable", linkage: "not_observed", deterministicReconciliation: "not_observed", privacySafety: "not_observed" });
          expect(value.researchEvidence.attempts.map((attempt) => [attempt.questionOrdinal, attempt.status]).sort((left, right) => Number(left[0]) - Number(right[0]))).toEqual([[1, "completed"], [2, "completed"], [3, "not_selected_planning"], [4, "not_selected_planning"]]);
          expect(value.researchEvidence.candidates.every((candidate) => candidate.retrievalStatus === "retrieved_text" && candidate.semanticVerificationStatus === "completed")).toBe(true);
          expect(value.researchEvidence.claimSupports.every((support) => support.disposition === "accepted")).toBe(true);
        } : undefined,
        oneTimeServicesForTesting: {
          webSearchDiscovery: async ({ questions: [question] }) => {
            if (mode === "failed") throw timeoutOrFailure;
            modeFeeLabel = question!.feeLabel;
            const url = `https://www.fiserv.com/official-fee-guide/${question!.feeRowRef}`;
            labelByUrl.set(url, modeFeeLabel);
            return external([{ url, title: "Official fee guide", publisher: "Fiserv" }], `request_search_${mode}`);
          },
          documentRetrieval: async (url, options) => mode === "safety"
            ? external({ type: "fee_knowledge_retrieved_document", policyVersion: "fee_knowledge_retrieval_v1", status: "safety_blocked", canonicalUrl: null, redirectChain: [], contentType: null, byteLength: 0, documentFingerprint: null, title: null, text: "", locators: [], reasonCodes: ["fee_knowledge_url_private_host"] }, "request_retrieval_safety")
            : external(await retrieveFeeKnowledgeDocument(url, { abortSignal: options.abortSignal, resolveHost: async () => ["93.184.216.34"], fetchImpl: async () => new Response(`<p>Fiserv ${labelByUrl.get(url) ?? modeFeeLabel} official fee guide for 2024.</p>`, { status: 200, headers: { "content-type": "text/html" } }) }), `request_retrieval_${mode}`),
          semanticVerification: async ({ structuredClaim }) => external({ type: "fee_knowledge_semantic_support_decision", policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION, decision: mode === "unsupported" ? "unsupported" : mode === "contradiction" ? "contradicts" : "supports", structuredClaim, reasonCodes: ["synthetic_semantic_result"], providerDetailsStripped: true }, `request_semantic_${mode}`),
          wholeStatementReview: async (packet) => external(validReview(packet), `request_whole_${mode}`),
        },
      });

      expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
      if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
      const admission = result.artifact.canonicalAdmissionResults[0]!;
      if (mode === "unsupported" || mode === "contradiction") {
        expect(result.finalStatus).toBe("completed");
        expect(admission.admissionDisposition).toBe("admitted");
        expect(admission.researchEvidence.claimSupports[0]).toMatchObject({
          evidenceDecision: mode === "unsupported" ? "unsupported" : "conflicting_evidence",
          disposition: "rejected",
        });
        expect(admission.admission.acceptedClaimSupportRefs).toEqual([]);
      } else {
        expect(result.finalStatus).toBe(mode === "safety" ? "blocked" : "completed");
        expect(admission.admissionDisposition).not.toBe("admitted");
        expect(admission.packageF).toBeNull();
      }
      expect(admission.customerPublished).toBe(false);
      if (mode === "budget") expect(admission.researchEvidence.attempts.some((attempt) => attempt.status === "not_selected_planning")).toBe(true);
      if (mode === "safety") expect(admission.researchEvidence.candidates.some((candidate) => candidate.retrievalStatus === "safety_blocked")).toBe(true);
    }
  }, 60_000);

  it("preserves accepted-with-conditions, needs-verification, and human-review row outcomes", async () => {
    const cases = [
      ["conditional", "accepted_with_conditions"],
      ["needs_verification", "needs_verification"],
      ["human_review", "human_review"],
    ] as const;
    for (const [variant, expectedStatus] of cases) {
      const fixture = await approvedOneTimePdfFixture();
      const result = await runManifestDrivenLiveEvaluation({
        ...fixture.runnerInput,
        calls: fullOneTimeCalls(),
        outputArtifactPath: path.join(fixture.directory, `package-5b-${variant}.json`),
        oneTimeResearchQuestionsForTesting: () => [],
        oneTimeServicesForTesting: {
          wholeStatementReview: async (packet) => external(reviewWithDisposition(packet, variant), `request_whole_${variant}`),
        },
      });
      expect(result.finalStatus).toBe("completed");
      expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
      if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
      expect(result.artifact.canonicalAdmissionResults[0]!.packageF?.output.acceptanceRecords.some((record) => record.status === expectedStatus)).toBe(true);
    }
  }, 60_000);

  it("admits exact and unrestricted approved-registry support while rejecting processor-restricted mismatch evidence", async () => {
    const modes = ["exact", "unrestricted", "mismatch"] as const;
    for (const mode of modes) {
      const fixture = await approvedShortCloverPdfFixture();
      const analysis = await canonicalAnalysisForFixture(fixture.bytes);
      const registry = registryForAnalysis(analysis, mode);
      const result = await runManifestDrivenLiveEvaluation({
        ...fixture.runnerInput,
        calls: fullOneTimeCalls("doc_one_time_clover_short"),
        outputArtifactPath: path.join(fixture.directory, `package-5b-registry-${mode}.json`),
        oneTimeRegistryForTesting: registry,
        oneTimeResearchQuestionsForTesting: () => [],
        oneTimeServicesForTesting: {
          wholeStatementReview: async (packet) => external(validReviewWithApprovedSupport(packet), `request_whole_registry_${mode}`),
        },
      });
      expect(result.finalStatus).toBe("completed");
      expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
      if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
      const admission = result.artifact.canonicalAdmissionResults[0]!;
      const approved = admission.researchEvidence.claimSupports.filter((support) => support.origin === "approved_registry");
      if (mode === "mismatch") {
        expect(approved).toHaveLength(1);
        expect(approved[0]).toMatchObject({ approvedRegistryScopeBasis: "processor_or_network_mismatch", disposition: "rejected" });
        expect(admission.packageF?.output.rowInterpretations.some((row) => row.evidenceProvenance === "approved_external_documentation")).toBe(false);
      } else {
        expect(approved).toHaveLength(1);
        expect(approved[0]).toMatchObject({
          disposition: "accepted",
          approvedRegistryScopeBasis: mode === "exact" ? "exact_processor_or_network" : "unrestricted_broader_official",
        });
        expect(admission.packageF?.output.rowInterpretations.some((row) => row.evidenceProvenance === "approved_external_documentation")).toBe(true);
      }
    }
  }, 60_000);

  it("preserves a completed candidate when a later semantic request times out", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const labels = new Map<string, string>();
    let semanticCalls = 0;
    let wholeStatementCalls = 0;
    const timeout = Object.assign(new Error("private timeout"), { name: "AbortError", accounting: { requestId: "request_semantic_timeout", durationMs: 5 } });
    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls: fullOneTimeCalls(),
      outputArtifactPath: path.join(fixture.directory, "package-5b-partial-timeout.json"),
      oneTimeResearchQuestionsForTesting: (analysis) => [researchQuestion(analysis, 0), researchQuestion(analysis, 1)],
      onCanonicalAdmissionProjectedForTesting: (value) => {
        expect(value.admissionDisposition).toBe("rejected");
        expect(value.admission).toMatchObject({ executionStatus: "completed", validationStatus: "failed", groundingStatus: "rejected" });
        expect(value.package5a).toMatchObject({ executionState: "completed", admissionState: "rejected", finalCanonicalStatus: "rejected" });
        expect(value.researchEvidence.attempts.map((attempt) => attempt.status).sort()).toEqual(["completed", "completed"]);
        expect(value.researchEvidence.candidates.map((candidate) => candidate.semanticVerificationStatus).sort()).toEqual(["completed", "timed_out"]);
        expect(value.researchEvidence.claimSupports).toHaveLength(1);
      },
      oneTimeServicesForTesting: {
        webSearchDiscovery: async ({ questions: [question] }) => {
          const url = `https://www.fiserv.com/guide/${question!.feeRowRef}`;
          labels.set(url, question!.feeLabel);
          return external([{ url, title: "Official fee guide", publisher: "Fiserv" }], `request_search_${question!.feeRowRef}`);
        },
        documentRetrieval: async (url, options) => external(await retrieveFeeKnowledgeDocument(url, {
          abortSignal: options.abortSignal,
          resolveHost: async () => ["93.184.216.34"],
          fetchImpl: async () => new Response(`<p>Fiserv ${labels.get(url)} official classification guide for 2024.</p>`, { status: 200, headers: { "content-type": "text/html" } }),
        }), `request_retrieval_${labels.get(url)?.length}`),
        semanticVerification: async ({ structuredClaim }) => {
          semanticCalls += 1;
          if (semanticCalls === 2) throw timeout;
          return external({ type: "fee_knowledge_semantic_support_decision", policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION, decision: "supports", structuredClaim, reasonCodes: ["synthetic_semantic_support"], providerDetailsStripped: true }, "request_semantic_first");
        },
        wholeStatementReview: async (packet) => {
          wholeStatementCalls += 1;
          return external(validReview(packet, true), "request_whole_after_partial_semantic_timeout");
        },
      },
    });

    expect(result.finalStatus).toBe("completed");
    expect(wholeStatementCalls).toBeGreaterThan(0);
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const proof = result.artifact.canonicalAdmissionResults[0]!.researchEvidence;
    expect(proof.candidates.some((candidate) => candidate.semanticVerificationStatus === "completed")).toBe(true);
    expect(proof.candidates.some((candidate) => candidate.semanticVerificationStatus === "timed_out")).toBe(true);
    expect(proof.claimSupports).toHaveLength(1);
  }, 30_000);

  it("withholds admission when an unused second selected candidate fails retrieval", async () => {
    const fixture = await approvedOneTimePdfFixture();
    let label = "";
    let retrievalCalls = 0;
    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls: fullOneTimeCalls(),
      outputArtifactPath: path.join(fixture.directory, "package-5b-unused-failed-candidate.json"),
      oneTimeResearchQuestionsForTesting: (analysis) => [researchQuestion(analysis)],
      oneTimeServicesForTesting: {
        webSearchDiscovery: async ({ questions: [question] }) => {
          label = question!.feeLabel;
          return external([
            { url: "https://www.fiserv.com/guide/primary", title: "Primary guide", publisher: "Fiserv" },
            { url: "https://www.fiserv.com/guide/secondary", title: "Secondary guide", publisher: "Fiserv" },
          ], "request_search_two_candidates");
        },
        documentRetrieval: async (url, options) => {
          retrievalCalls += 1;
          if (retrievalCalls === 2) return external({ type: "fee_knowledge_retrieved_document", policyVersion: "fee_knowledge_retrieval_v1", status: "failed", canonicalUrl: url, redirectChain: [], contentType: null, byteLength: 0, documentFingerprint: null, title: null, text: "", locators: [], reasonCodes: ["fee_knowledge_retrieval_fetch_failed"] }, "request_retrieval_failed");
          return external(await retrieveFeeKnowledgeDocument(url, { abortSignal: options.abortSignal, resolveHost: async () => ["93.184.216.34"], fetchImpl: async () => new Response(`<p>Fiserv ${label} official classification guide for 2024.</p>`, { status: 200, headers: { "content-type": "text/html" } }) }), "request_retrieval_primary");
        },
        semanticVerification: async ({ structuredClaim }) => external({ type: "fee_knowledge_semantic_support_decision", policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION, decision: "supports", structuredClaim, reasonCodes: ["synthetic_semantic_support"], providerDetailsStripped: true }, "request_semantic_primary"),
        wholeStatementReview: async (packet) => external(validReview(packet, true), "request_whole_unused_candidate"),
      },
    });

    expect(result.finalStatus).toBe("completed");
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const admission = result.artifact.canonicalAdmissionResults[0]!;
    expect(admission.admissionDisposition).toBe("rejected");
    expect(admission.researchEvidence.candidates).toHaveLength(2);
    expect(admission.researchEvidence.candidates.some((candidate) => candidate.retrievalStatus === "failed")).toBe(true);
    expect(admission.packageF).toBeNull();
  }, 30_000);

  it("continues later candidates after candidate-local retrieval timeout and malformed semantics", async () => {
    const fixture = await approvedOneTimePdfFixture();
    let feeLabel = "fee";
    let retrievalCalls = 0;
    let semanticCalls = 0;
    let wholeStatementCalls = 0;
    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls: fullOneTimeCalls(),
      outputArtifactPath: path.join(fixture.directory, "package-5b-candidate-local-timeout.json"),
      oneTimeResearchQuestionsForTesting: (analysis) => [researchQuestion(analysis)],
      oneTimeServicesForTesting: {
        webSearchDiscovery: async ({ questions: [question] }) => {
          feeLabel = question!.feeLabel;
          return external(["one", "two", "three"].map((suffix) => ({
            url: `https://www.fiserv.com/candidate/${suffix}`,
            title: `Official guide ${suffix}`,
            publisher: "Fiserv",
          })), "request_search_candidate_local");
        },
        documentRetrieval: async (url) => {
          retrievalCalls += 1;
          if (url.endsWith("/two")) {
            throw Object.assign(new Error("synthetic candidate timeout"), {
              name: "AbortError",
              accounting: { requestId: "request_retrieval_candidate_timeout", durationMs: 5 },
            });
          }
          return external(retrievedTextDocument(url, feeLabel), `request_retrieval_candidate_${retrievalCalls}`);
        },
        semanticVerification: async ({ structuredClaim }) => {
          semanticCalls += 1;
          if (semanticCalls === 1) {
            return external({
              ...semanticSupport(structuredClaim),
              decision: "unsupported" as const,
              reasonCodes: ["fee_knowledge_semantic_json_invalid"],
            }, "request_semantic_candidate_malformed");
          }
          return external(semanticSupport(structuredClaim), `request_semantic_candidate_${semanticCalls}`);
        },
        wholeStatementReview: async (packet) => {
          wholeStatementCalls += 1;
          return external(validReview(packet, true), "request_whole_candidate_local");
        },
      },
    });

    expect(retrievalCalls).toBe(3);
    expect(semanticCalls).toBe(2);
    expect(wholeStatementCalls).toBeGreaterThan(0);
    expect(result.finalStatus).toBe("completed");
    expect(result.packageFinancialInvariance[0]!.result.invariant).toBe(true);
    expect(result.providerCallOutcomes.find((outcome) => outcome.requestId === "request_retrieval_candidate_timeout"))
      .toMatchObject({ status: "timeout", stage: "document_retrieval" });
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const candidates = result.artifact.canonicalAdmissionResults[0]!.researchEvidence.candidates;
    expect(candidates.filter((candidate) => candidate.retrievalStatus === "retrieved_text")).toHaveLength(2);
    expect(candidates.filter((candidate) => candidate.retrievalStatus === "timed_out")).toHaveLength(1);
    expect(candidates.filter((candidate) => candidate.semanticVerificationStatus === "parse_failed")).toHaveLength(1);
    expect(candidates.filter((candidate) => candidate.semanticVerificationStatus === "completed")).toHaveLength(1);
    expect(candidates.find((candidate) => candidate.semanticVerificationStatus === "parse_failed")?.verificationStatus)
      .not.toBe("runtime_verified_documentation");
  }, 30_000);

  it("keeps an unsafe URL candidate local and admits evidence only from a later safe candidate", async () => {
    const fixture = await approvedOneTimePdfFixture();
    let feeLabel = "fee";
    let retrievalCalls = 0;
    let semanticCalls = 0;
    let wholeStatementCalls = 0;
    const wholeStatementPackets: any[] = [];
    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls: fullOneTimeCalls(),
      outputArtifactPath: path.join(fixture.directory, "package-5b-unsafe-then-safe.json"),
      oneTimeResearchQuestionsForTesting: (analysis) => [researchQuestion(analysis)],
      oneTimeServicesForTesting: {
        webSearchDiscovery: async ({ questions: [question] }) => {
          feeLabel = question!.feeLabel;
          return external([
            { url: "https://unsafe.synthetic.invalid/private", title: "Rejected source", publisher: "Unknown" },
            { url: "https://www.fiserv.com/safe-candidate", title: "Official guide", publisher: "Fiserv" },
          ], "request_search_unsafe_then_safe");
        },
        documentRetrieval: async (url) => {
          retrievalCalls += 1;
          return url.includes("unsafe.synthetic.invalid")
            ? external(terminalRetrievedDocument("safety_blocked", "fee_knowledge_url_private_host"), "request_retrieval_unsafe")
            : external(retrievedTextDocument(url, feeLabel), "request_retrieval_safe");
        },
        semanticVerification: async ({ structuredClaim }) => {
          semanticCalls += 1;
          return external(semanticSupport(structuredClaim), "request_semantic_safe");
        },
        wholeStatementReview: async (packet) => {
          wholeStatementCalls += 1;
          wholeStatementPackets.push(structuredClone(packet));
          return external(validReview(packet, true), "request_whole_unsafe_then_safe");
        },
      },
    });

    expect(retrievalCalls).toBe(2);
    expect(semanticCalls).toBe(1);
    expect(wholeStatementCalls).toBeGreaterThan(0);
    expect(result.packageFinancialInvariance[0]!.result.invariant).toBe(true);
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const admission = result.artifact.canonicalAdmissionResults[0]!;
    const unsafeCandidate = admission.researchEvidence.candidates.find((candidate) => candidate.retrievalStatus === "safety_blocked")!;
    const safeCandidate = admission.researchEvidence.candidates.find((candidate) => candidate.retrievalStatus === "retrieved_text")!;
    expect(unsafeCandidate).toMatchObject({
      retrievalStatus: "safety_blocked",
      semanticVerificationStatus: "not_started",
      verificationStatus: "safety_blocked",
    });
    expect(unsafeCandidate.reasonCodes).toContain("fee_knowledge_url_private_host");
    expect(unsafeCandidate.claimSupportRefs).toEqual([]);
    expect(admission.researchEvidence.claimSupports.every((support) => support.candidateRef !== unsafeCandidate.candidateRef)).toBe(true);
    expect(admission.admission.acceptedClaimSupportRefs.every((ref) => !unsafeCandidate.claimSupportRefs.includes(ref))).toBe(true);
    expect(safeCandidate.semanticVerificationStatus).toBe("completed");
    expect(admission.researchEvidence.claimSupports.some((support) => support.candidateRef === safeCandidate.candidateRef)).toBe(true);
    const provenancePackets = wholeStatementPackets.map((packet) => packet.sourceProvenancePacket);
    expect(provenancePackets.every((packet) =>
      packet.claimSupports.every((support: any) => support.candidateId !== unsafeCandidate.candidateRef),
    )).toBe(true);
    expect(provenancePackets.every((packet) =>
      packet.rowPackets.every((row: any) => !row.verifiedCandidateRefs.includes(unsafeCandidate.candidateRef)),
    )).toBe(true);
  }, 30_000);

  it("writes a verifiable rejected result when whole-statement execution times out", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls: fullOneTimeCalls(),
      outputArtifactPath: path.join(fixture.directory, "package-5b-whole-timeout.json"),
      oneTimeResearchQuestionsForTesting: () => [],
      oneTimeServicesForTesting: {
        wholeStatementReview: async () => {
          throw Object.assign(new Error("private timeout"), {
            name: "AbortError",
            accounting: { requestId: "request_whole_timeout", durationMs: 2 },
          });
        },
      },
    });
    expect(result.finalStatus).toBe("completed");
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const admission = result.artifact.canonicalAdmissionResults[0]!;
    expect(admission).toMatchObject({
      admissionDisposition: "rejected",
      admission: { executionStatus: "completed" },
      packageF: null,
    });
    expect(admission.package5bWorkPlan?.units.some((unit) =>
      unit.outcomeClass === "timeout_watchdog" && unit.requestId === "request_whole_timeout",
    )).toBe(true);
  }, 30_000);

  it("keeps execution, admission, and Package F outcomes independent for every source document", async () => {
    const cases = [
      { mode: "second_timeout", expectedOverall: "completed", expected: [["doc_multi_a", "admitted", "completed"], ["doc_multi_b", "rejected", "completed"]] },
      { mode: "first_rejected", expectedOverall: "completed", expected: [["doc_multi_a", "rejected", "completed"], ["doc_multi_b", "admitted", "completed"]] },
      { mode: "first_failed", expectedOverall: "completed", expected: [["doc_multi_a", "rejected", "completed"], ["doc_multi_b", "admitted", "completed"]] },
    ] as const;
    let admittedSecondPackageF: unknown = null;

    for (const current of cases) {
      const fixture = await approvedTwoDocumentPdfFixture();
      const result = await runManifestDrivenLiveEvaluation({
        ...fixture.runnerInput,
        calls: fixture.sourceDocumentIds.flatMap((sourceDocumentId) => fullOneTimeCalls(sourceDocumentId)),
        outputArtifactPath: path.join(fixture.directory, `package-5b-multi-${current.mode}.json`),
        oneTimeResearchQuestionsForTesting: () => [],
        beforeArtifactV2WriteForTesting: ({ canonicalAdmissionResults, lifecycleLedger }) => {
          expect(canonicalAdmissionResults).toHaveLength(2);
          expect(new Set(canonicalAdmissionResults.map((item) => item.executionRef)).size).toBe(2);
          for (const admission of canonicalAdmissionResults) {
            const document = lifecycleLedger.documents.find((item) => item.sourceDocumentId === admission.sourceDocumentId)!;
            const expectedState = admission.admissionDisposition === "admitted" ? "completed"
              : admission.admissionDisposition === "safety_blocked" ? "blocked" : "withheld";
            expect(document.aiStates.canonical_admitted).toEqual({ state: expectedState, reasonCodes: admission.reasonCodes });
            expect(document.events.filter((event) => event.stage === "canonical_admission" && event.canonicalAdmissionRef === admission.executionRef)).toEqual([
              expect.objectContaining({
                state: expectedState,
                capabilityExecutionRef: admission.executionRef,
                reasonCodes: admission.reasonCodes,
              }),
            ]);
            expect(document.aiStates.customer_published.state).not.toBe("completed");
            expect(document.events.some((event) => event.stage === "customer_publication" && event.state === "completed")).toBe(false);
          }
        },
        oneTimeServicesForTesting: {
          wholeStatementReview: async (packet, context) => {
            const sourceDocumentId = sourceDocumentIdFromCall(context.approvedCallMetadata.callId);
            if (current.mode === "second_timeout" && sourceDocumentId === "doc_multi_b") {
              throw Object.assign(new Error("private timeout"), {
                name: "AbortError",
                accounting: { requestId: "request_multi_b_timeout", durationMs: 2 },
              });
            }
            if (current.mode === "first_failed" && sourceDocumentId === "doc_multi_a") {
              throw Object.assign(new Error("private provider failure"), {
                accounting: { requestId: "request_multi_a_failed", durationMs: 2 },
              });
            }
            const review = validReview(packet);
            const value = current.mode === "first_rejected" && sourceDocumentId === "doc_multi_a"
              ? { ...review, rowInterpretations: review.rowInterpretations.slice(1) }
              : review;
            return external(value, `request_whole_${sourceDocumentId}`);
          },
        },
      });

      expect(result.finalStatus).toBe(current.expectedOverall);
      expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
      if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
      expect(result.artifact.canonicalAdmissionResults).toHaveLength(2);
      expect(new Set(result.artifact.canonicalAdmissionResults.map((item) => item.executionRef)).size).toBe(2);
      for (const [sourceDocumentId, disposition, executionStatus] of current.expected) {
        const admission = result.artifact.canonicalAdmissionResults.find((item) => item.sourceDocumentId === sourceDocumentId)!;
        expect(admission).toMatchObject({ admissionDisposition: disposition, admission: { executionStatus } });
        expect(Boolean(admission.packageF)).toBe(disposition === "admitted");
      }
      if (current.mode === "second_timeout") {
        const timedOut = result.artifact.canonicalAdmissionResults.find((item) => item.sourceDocumentId === "doc_multi_b")!;
        expect(timedOut.package5bWorkPlan?.units.some((unit) => unit.outcomeClass === "timeout_watchdog")).toBe(true);
      }
      if (current.mode === "first_failed") {
        const failed = result.artifact.canonicalAdmissionResults.find((item) => item.sourceDocumentId === "doc_multi_a")!;
        expect(failed.package5bWorkPlan?.units.some((unit) => unit.outcomeClass === "provider_transport_failed")).toBe(true);
      }
      const admittedSecond = result.artifact.canonicalAdmissionResults.find((item) => item.sourceDocumentId === "doc_multi_b")?.packageF?.output ?? null;
      if (current.mode === "first_rejected") admittedSecondPackageF = admittedSecond;
      if (current.mode === "first_failed") expect(admittedSecond).toEqual(admittedSecondPackageF);
    }
  }, 90_000);

  it("records per-call discovery watchdogs without treating the research graph as exhausted", async () => {
    const fixture = await approvedShortCloverPdfFixture();
    let wholeStatementCalls = 0;
    const timeout = Object.assign(new Error("private discovery timeout"), {
      name: "AbortError",
      code: "provider_timeout",
      reasonCode: "fee_knowledge_web_search_timed_out",
      evaluationTimeoutScope: "per_call",
      accounting: { requestId: "request_search_watchdog", durationMs: 25 },
    });
    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls: fullOneTimeCalls("doc_one_time_clover_short"),
      outputArtifactPath: path.join(fixture.directory, "package-5b-per-call-watchdog.json"),
      oneTimeResearchLimitsForTesting: {
        policyVersion: "fee_knowledge_research_policy_v1",
        maxSearchCalls: 2,
        maxRetrievalCandidates: 5,
        totalDeadlineMs: 25,
        maxResultCandidatesPerSearch: 5,
      },
      oneTimeResearchQuestionsForTesting: (analysis) => [
        researchQuestion(analysis, 0),
        researchQuestion(analysis, 1),
        researchQuestion(analysis, 2),
      ],
      oneTimeServicesForTesting: {
        webSearchDiscovery: async () => { throw timeout; },
        wholeStatementReview: async (packet) => {
          wholeStatementCalls += 1;
          return external(validReview(packet), "request_whole_after_graph_timeout");
        },
      },
    });

    expect(wholeStatementCalls).toBeGreaterThan(0);
    expect(result.finalStatus).toBe("completed");
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const admission = result.artifact.canonicalAdmissionResults[0]!;
    expect(admission.canonicalReferenceProof.expectedResearchQuestions.limits.totalDeadlineMs).toBe(25);
    expect(admission.researchEvidence.attempts
      .sort((left, right) => left.questionOrdinal - right.questionOrdinal)
      .map((attempt) => attempt.status)).toEqual(["timed_out", "timed_out", "not_selected_planning"]);
    expect(admission.packageF).toBeNull();
    expect(result.artifact.providerCallOutcomes.filter((outcome) => outcome.stage === "web_search_discovery")).toHaveLength(2);
    expect(result.artifact.providerCallOutcomes.some((outcome) => outcome.stage === "whole_statement_ai_review" && outcome.status === "success")).toBe(true);
  }, 30_000);

  it("preserves completed research and ignores a late abort-insensitive semantic result", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const labels = new Map<string, string>();
    let semanticCalls = 0;
    let wholeStatementCalls = 0;
    const artifactPath = path.join(fixture.directory, "package-5b-ignored-abort.json");
    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls: fullOneTimeCalls(),
      outputArtifactPath: artifactPath,
      oneTimeResearchLimitsForTesting: {
        policyVersion: "fee_knowledge_research_policy_v1",
        maxSearchCalls: 2,
        maxRetrievalCandidates: 2,
        totalDeadlineMs: 1000,
        maxResultCandidatesPerSearch: 1,
      },
      oneTimeResearchQuestionsForTesting: (analysis) => [researchQuestion(analysis, 0), researchQuestion(analysis, 1)],
      oneTimeServicesForTesting: {
        webSearchDiscovery: async ({ questions: [question] }) => {
          const url = `https://www.fiserv.com/deadline/${question!.semanticQuestion.endsWith("1.") ? "one" : "two"}`;
          labels.set(url, question!.feeLabel);
          return external([{ url, title: "Official fee guide", publisher: "Fiserv" }], `request_search_deadline_${labels.size}`);
        },
        documentRetrieval: async (url) => external(
          retrievedTextDocument(url, labels.get(url) ?? "fee"),
          `request_retrieval_deadline_${url.endsWith("one") ? "one" : "two"}`,
        ),
        semanticVerification: async ({ structuredClaim }) => {
          semanticCalls += 1;
          if (semanticCalls === 1) return external(semanticSupport(structuredClaim), "request_semantic_deadline_one");
          return new Promise((resolve) => setTimeout(() => resolve(external(semanticSupport(structuredClaim), "request_semantic_deadline_late")), 1300));
        },
        wholeStatementReview: async (packet) => {
          wholeStatementCalls += 1;
          return external(validReview(packet, true), "request_whole_after_late_semantic");
        },
      },
    });

    const beforeLateResolution = await readFile(artifactPath, "utf8");
    await new Promise((resolve) => setTimeout(resolve, 1400));
    expect(await readFile(artifactPath, "utf8")).toBe(beforeLateResolution);
    expect(wholeStatementCalls).toBeGreaterThan(0);
    expect(result.finalStatus).toBe("completed");
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const admission = result.artifact.canonicalAdmissionResults[0]!;
    expect(admission.researchEvidence.attempts.map((attempt) => attempt.status).sort()).toEqual(["completed", "completed"]);
    expect(admission.researchEvidence.candidates.map((candidate) => candidate.semanticVerificationStatus).sort()).toEqual(["completed", "completed"]);
    expect(admission.researchEvidence.claimSupports).toHaveLength(2);
    expect(admission.packageF).not.toBeNull();
  }, 30_000);

  it("maps structured retrieval terminal values to exact research, lifecycle, admission, and run states", async () => {
    const cases = [
      ["timed_out", "fee_knowledge_retrieval_aborted", "timed_out", "timed_out"],
      ["safety_blocked", "fee_knowledge_url_private_host", "safety_blocked", "blocked"],
      ["failed", "fee_knowledge_retrieval_fetch_failed", "failed", "failed"],
      ["encrypted", "fee_knowledge_pdf_encrypted", "failed", "failed"],
      ["oversized", "fee_knowledge_response_oversized", "failed", "failed"],
      ["unsupported_content_type", "fee_knowledge_content_type_unsupported", "failed", "failed"],
      ["unavailable", "fee_knowledge_http_404", "failed", "failed"],
      ["malformed", "fee_knowledge_pdf_parse_failed", "failed", "failed"],
    ] as const;
    for (const [retrievalStatus, terminalReason] of cases) {
      const fixture = await approvedShortCloverPdfFixture();
      let wholeStatementCalls = 0;
      const result = await runManifestDrivenLiveEvaluation({
        ...fixture.runnerInput,
        calls: fullOneTimeCalls("doc_one_time_clover_short"),
        outputArtifactPath: path.join(fixture.directory, `package-5b-structured-${retrievalStatus}.json`),
        oneTimeResearchQuestionsForTesting: (analysis) => [researchQuestion(analysis)],
        oneTimeServicesForTesting: {
          webSearchDiscovery: async () => external([{ url: "https://www.fiserv.com/terminal", title: "Official fee guide", publisher: "Fiserv" }], `request_search_${retrievalStatus}`),
          documentRetrieval: async () => external(terminalRetrievedDocument(retrievalStatus, terminalReason), `request_retrieval_${retrievalStatus}`),
          wholeStatementReview: async (packet) => {
            wholeStatementCalls += 1;
            return external(validReview(packet), `request_whole_retrieval_${retrievalStatus}`);
          },
        },
      });

      expect(result.finalStatus).toBe(retrievalStatus === "safety_blocked" ? "blocked" : "completed");
      expect(wholeStatementCalls).toBeGreaterThan(0);
      expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
      if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
      const admission = result.artifact.canonicalAdmissionResults[0]!;
      expect(admission.researchEvidence.attempts[0]).toMatchObject({
        status: "completed",
        resultCount: 1,
      });
      expect(admission.researchEvidence.candidates[0]).toMatchObject({ retrievalStatus, semanticVerificationStatus: "not_started" });
      expect(admission.packageF).toBeNull();
      expect(result.artifact.providerCallOutcomes.find((outcome) => outcome.stage === "document_retrieval")?.status).toBe("success");
      const document = result.artifact.lifecycleLedger.documents.find((item) => item.sourceDocumentId === admission.sourceDocumentId)!;
      expect(document.events.some((event) => event.stage === "research_retrieval"
        && event.state === (retrievalStatus === "safety_blocked" ? "blocked" : "failed"))).toBe(true);
      if (retrievalStatus === "safety_blocked") {
        expect(admission.admissionDisposition).toBe("safety_blocked");
        expect(admission.package5a.finalCanonicalStatus).toBe("safety_blocked");
        expect(admission.package5a.stageStates.privacySafety).toBe("failed");
        expect(document.events.some((event) => event.stage === "canonical_admission" && event.state === "blocked")).toBe(true);
      } else {
        expect(admission.admissionDisposition).toBe("rejected");
      }
    }
  }, 90_000);

  it("maps structured semantic terminal decisions without confusing provider success with research success", async () => {
    const cases = [
      ["timed_out", "fee_knowledge_semantic_timed_out", "timed_out", "timed_out"],
      ["safety_blocked", "fee_knowledge_semantic_safety_blocked", "safety_blocked", "blocked"],
      ["failed", "fee_knowledge_semantic_failed", "failed", "failed"],
      ["failed", "fee_knowledge_semantic_support_provider_unavailable", "failed", "failed"],
      ["failed", "fee_knowledge_semantic_support_provider_failed", "failed", "failed"],
      ["parse_failed", "fee_knowledge_semantic_json_invalid", "failed", "failed"],
      ["completed", "synthetic_unsupported", "completed", "completed"],
    ] as const;
    for (const [semanticStatus, semanticReason] of cases) {
      const fixture = await approvedShortCloverPdfFixture();
      let feeLabel = "fee";
      let wholeStatementCalls = 0;
      const result = await runManifestDrivenLiveEvaluation({
        ...fixture.runnerInput,
        calls: fullOneTimeCalls("doc_one_time_clover_short"),
        outputArtifactPath: path.join(fixture.directory, `package-5b-semantic-${semanticStatus}.json`),
        oneTimeResearchQuestionsForTesting: (analysis) => [researchQuestion(analysis)],
        oneTimeServicesForTesting: {
          webSearchDiscovery: async ({ questions: [question] }) => {
            feeLabel = question!.feeLabel;
            return external([{ url: "https://www.fiserv.com/semantic-terminal", title: "Official fee guide", publisher: "Fiserv" }], `request_search_semantic_${semanticStatus}`);
          },
          documentRetrieval: async (url) => external(retrievedTextDocument(url, feeLabel), `request_retrieval_semantic_${semanticStatus}`),
          semanticVerification: async ({ structuredClaim }) => external({
            ...semanticSupport(structuredClaim),
            decision: "unsupported" as const,
            reasonCodes: [semanticReason],
          }, `request_semantic_${semanticStatus}`),
          wholeStatementReview: async (packet) => {
            wholeStatementCalls += 1;
            return external(validReview(packet), `request_whole_semantic_${semanticStatus}`);
          },
        },
      });

      expect(result.finalStatus).toBe(semanticStatus === "safety_blocked" ? "blocked" : "completed");
      expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
      if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
      const admission = result.artifact.canonicalAdmissionResults[0]!;
      expect(admission.researchEvidence.attempts[0]?.status).toBe(semanticStatus === "safety_blocked" ? "safety_blocked" : "completed");
      expect(admission.researchEvidence.candidates[0]?.semanticVerificationStatus).toBe(semanticStatus);
      expect(result.artifact.providerCallOutcomes.find((outcome) => outcome.stage === "semantic_verification")?.status).toBe("success");
      if (semanticStatus === "completed") {
        expect(wholeStatementCalls).toBeGreaterThan(0);
        expect(admission.admissionDisposition).toBe("admitted");
        expect(admission.researchEvidence.claimSupports[0]?.disposition).toBe("rejected");
      } else {
        if (semanticStatus === "safety_blocked") expect(wholeStatementCalls).toBe(0);
        else expect(wholeStatementCalls).toBeGreaterThan(0);
        expect(admission.packageF).toBeNull();
      }
      if (semanticStatus === "safety_blocked") {
        const attempt = admission.researchEvidence.attempts[0]!;
        const candidate = admission.researchEvidence.candidates[0]!;
        expect(attempt.status).toBe("safety_blocked");
        expect(candidate).toMatchObject({
          researchAttemptRef: attempt.researchAttemptRef,
          questionRef: attempt.questionRef,
          feeRowRef: attempt.feeRowRef,
          verificationStatus: "safety_blocked",
          retrievalStatus: "retrieved_text",
          semanticVerificationStatus: "safety_blocked",
        });
        expect(candidate.reasonCodes).toContain("fee_knowledge_semantic_safety_blocked");
        expect(candidate.claimSupportRefs.every((ref) => !admission.admission.acceptedClaimSupportRefs.includes(ref))).toBe(true);
        expect(admission.packageF).toBeNull();
        expect(admission.admissionDisposition).toBe("safety_blocked");
        expect(admission.package5a).toMatchObject({ finalCanonicalStatus: "safety_blocked", stageStates: { privacySafety: "failed" } });
        const lifecycleDocument = result.artifact.lifecycleLedger.documents.find((item) => item.sourceDocumentId === admission.sourceDocumentId)!;
        expect(lifecycleDocument.aiStates.customer_published.state).not.toBe("completed");
        expect(lifecycleDocument.events.some((event) => event.stage === "customer_publication" && event.state === "completed")).toBe(false);
      }
    }
  }, 90_000);

  it("uses the canonical support partition verbatim and rejects a recomputed projection disagreement", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const analysis = await canonicalAnalysisForFixture(fixture.bytes);
    const registry = registryForAnalysis(analysis, "exact");
    registry.sources[0]!.claims.push({
      ...structuredClone(registry.sources[0]!.claims[0]!),
      claimId: "claim_package_5b_exact_unused",
      sourceLocator: "Additional approved fee section",
    });
    let finalizedEvaluation: FinalizedOneTimeStatementEvaluation | null = null;
    const result = await runManifestDrivenLiveEvaluation({
      ...fixture.runnerInput,
      calls: fullOneTimeCalls(),
      outputArtifactPath: path.join(fixture.directory, "package-5b-support-partition.json"),
      oneTimeRegistryForTesting: registry,
      oneTimeResearchQuestionsForTesting: () => [],
      onOneTimeFinalizedForTesting: (_sourceDocumentId, finalized) => { finalizedEvaluation = structuredClone(finalized); },
      oneTimeServicesForTesting: {
        wholeStatementReview: async (packet) => external(validReviewWithApprovedSupport(packet), "request_whole_partition"),
      },
    });
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2" || !finalizedEvaluation) throw new Error("expected finalized V2 result");
    const projected = result.artifact.canonicalAdmissionResults[0]!;
    expect(projected.admission.acceptedClaimSupportRefs).toEqual(finalizedEvaluation.admission.admission.acceptedClaimSupportRefs);
    expect(projected.admission.rejectedClaimSupportRefs).toEqual(finalizedEvaluation.admission.admission.rejectedClaimSupportRefs);
    expect(projected.admission.acceptedClaimSupportRefs).toHaveLength(2);
    expect(new Set([...projected.admission.acceptedClaimSupportRefs, ...projected.admission.rejectedClaimSupportRefs]).size)
      .toBe(projected.researchEvidence.claimSupports.length);

    const conflicting = structuredClone(finalizedEvaluation);
    const accepted = conflicting.admission.admission.acceptedClaimSupportRefs.shift()!;
    conflicting.admission.admission.rejectedClaimSupportRefs.push(accepted);
    expect(() => projectOneTimeCanonicalAdmissionResult({ sourceDocumentId: projected.sourceDocumentId, finalized: conflicting }))
      .toThrow("package_5b_canonical_support_partition_mismatch");
  }, 30_000);
});

function validReview(packet: any, useRuntimeSupport = false) {
  const support = useRuntimeSupport ? packet.sourceProvenancePacket.claimSupports.find((item: any) => item.candidateId) : null;
  return {
    type: "whole_statement_fee_intelligence_review",
    reviewPolicyVersion: "whole_statement_fee_intelligence_review_v1",
    reviewStatus: "completed",
    evidenceRefs: [...new Set(packet.admittedFeeRows.flatMap((row: any) => row.evidenceRefs))],
    factRefs: [],
    limitationCodes: [],
    rowInterpretations: packet.admittedFeeRows.map((row: any) => {
      const external = support?.feeRowRef === row.feeRowRef;
      return {
        feeRowRef: row.feeRowRef,
        proposedCategory: external ? support.structuredClaim.proposedCategory : row.currentDeterministicCandidates[0]?.category ?? "unknown_needs_review",
        likelyEconomicOwner: external ? support.structuredClaim.likelyEconomicOwner : row.currentDeterministicCandidates[0]?.likelyEconomicOwner ?? "unknown",
        likelyContractualController: external ? support.structuredClaim.likelyContractualController : row.currentDeterministicCandidates[0]?.likelyContractualController ?? "unknown",
        proposedActionabilityCeiling: external ? support.actionabilityCeiling : row.currentDeterministicCandidates[0]?.actionabilityCeiling ?? "unknown",
        confidence: external ? support.confidence : row.currentDeterministicCandidates[0]?.confidence ?? "low",
        conciseRationale: external ? "Verified official documentation supports this limited interpretation." : "Statement evidence and deterministic context support this interpretation.",
        evidenceProvenance: external ? "runtime_verified_documentation" : "statement_evidence",
        evidenceRefs: row.evidenceRefs,
        externalSourceRef: external ? support.sourceId : null,
        externalClaimSupportRef: external ? support.claimSupportId : null,
        conflicts: [],
        missingEvidence: [],
        recommendedDisposition: "supported",
        authoritative: false,
      };
    }),
    reasonCodes: ["whole_statement_fee_intelligence_reviewed"],
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function reviewWithDisposition(packet: any, variant: "conditional" | "needs_verification" | "human_review") {
  const review = validReview(packet);
  const first = review.rowInterpretations[0]!;
  if (variant === "conditional") first.confidence = "medium";
  if (variant === "needs_verification") {
    first.recommendedDisposition = "insufficient_evidence";
    first.missingEvidence = ["Additional documentation is required for this interpretation."];
  }
  if (variant === "human_review") first.recommendedDisposition = "human_review";
  return review;
}

function validReviewWithApprovedSupport(packet: any) {
  const review = validReview(packet);
  const support = packet.sourceProvenancePacket.claimSupports.find((item: any) => item.candidateId === null && item.evidenceDecision.startsWith("verified_"));
  if (!support) return review;
  const row = review.rowInterpretations.find((item: any) => item.feeRowRef === support.feeRowRef)!;
  Object.assign(row, {
    proposedCategory: support.structuredClaim.proposedCategory,
    likelyEconomicOwner: support.structuredClaim.likelyEconomicOwner,
    likelyContractualController: support.structuredClaim.likelyContractualController,
    proposedActionabilityCeiling: support.actionabilityCeiling,
    confidence: support.confidence,
    conciseRationale: "Approved official documentation supports this limited interpretation.",
    evidenceProvenance: "approved_external_documentation",
    externalSourceRef: support.sourceId,
    externalClaimSupportRef: support.claimSupportId,
  });
  return review;
}

async function canonicalAnalysisForFixture(bytes: Uint8Array): Promise<CanonicalStatementAnalysis> {
  const document = await parsePdfBytes(bytes);
  const summary = analyzeStatementDocument(document, "restaurant_food_beverage");
  return buildCanonicalRuntimeAnalysis({ document, businessType: "restaurant_food_beverage", runtimeDocumentRef: "package_5b_registry_fixture", legacySummary: summary }).analysis;
}

function registryForAnalysis(
  analysis: CanonicalStatementAnalysis,
  mode: "exact" | "unrestricted" | "mismatch",
): ApprovedFeeKnowledgeSourceRegistry {
  const row = analysis.feeLedger.rows[0]!;
  const processor = analysis.identity.processorName.value?.toLowerCase() ?? "fiserv";
  const scopedProcessor = mode === "mismatch" ? "unrelated processor" : processor;
  const processorIds = mode === "unrestricted" ? [] : [scopedProcessor];
  return {
    registrySchemaVersion: "fee_knowledge_registry_v1",
    registryVersion: `package_5b_registry_${mode}_v1`,
    policyVersion: "fee_knowledge_policy_v1",
    sources: [{
      sourceId: `source_package_5b_${mode}`,
      registrySchemaVersion: "fee_knowledge_registry_v1",
      policyVersion: "fee_knowledge_policy_v1",
      lifecycle: "active",
      kind: "official_processor_documentation",
      title: "Approved official fee guide",
      publisher: "Approved publisher",
      canonicalUrl: "https://www.fiserv.com/official-fee-guide",
      domainIdentity: { policyVersion: "fee_knowledge_policy_v1", publisherId: "approved_publisher", officialDomains: ["fiserv.com"], aliases: [scopedProcessor], verificationBasis: "registry_reviewed" },
      publicationDate: "2024-01-01",
      effectivePeriod: { from: "2020-01-01", through: null },
      retrievalDate: "2026-08-01",
      lastVerificationDate: "2026-08-01",
      reverifyAfterDate: null,
      jurisdiction: ["US"],
      market: ["card_payments"],
      processorIds,
      networkIds: [],
      aliases: mode === "unrestricted" ? [] : [scopedProcessor],
      supersedesSourceId: null,
      supersededBySourceId: null,
      contentFingerprint: null,
      displayPermission: "internal_only",
      claims: [{
        claimId: `claim_package_5b_${mode}`,
        claimType: "classification",
        feeLabels: [row.selectedLabel],
        categories: [],
        processorIds,
        networkIds: [],
        semanticConclusion: { category: "processor_markup", likelyEconomicOwner: "processor", likelyContractualController: "merchant_contract" },
        conditions: [],
        exclusions: [],
        maximumConfidence: "high",
        actionabilityCeiling: "verify_only",
        effectivePeriod: { from: "2020-01-01", through: null },
        sourceLocator: "Approved fee section",
        customerSafeParaphrase: "Approved documentation describes this fee classification.",
        displayPermission: "internal_only",
      }],
    }],
  };
}

function researchQuestion(analysis: CanonicalStatementAnalysis, index = 0): FeeKnowledgeResearchQuestion {
  const row = analysis.feeLedger.rows[index % analysis.feeLedger.rows.length]!;
  const selected = analysis.feeOwnershipActionability.rowClassifications.find((item) => item.feeRowId === row.id)?.selected;
  return {
    feeRowRef: row.id,
    sanitizedQuestionCategory: "classification",
    triggerReason: "material_unfamiliar_label",
    processorOrNetwork: "Fiserv",
    feeLabel: row.selectedLabel,
    statementSection: "fees",
    statementPeriodYear: "2024",
    deterministicCategory: selected?.category ?? null,
    deterministicEconomicOwner: selected?.ownership.economicBeneficiary ?? null,
    deterministicContractualController: selected?.ownership.contractualController ?? null,
    deterministicActionabilityCeiling: selected?.actionabilityCeiling ?? "unknown",
    deterministicConfidence: selected?.confidence ?? "low",
    semanticQuestion: `Find official documentation for this fee classification case ${index + 1}.`,
  };
}

function fullOneTimeCalls(sourceDocumentId = "doc_one_time_fiserv") {
  const stages: Array<["web_search_discovery" | "document_retrieval" | "semantic_verification" | "whole_statement_ai_review", "web_search" | "retrieval" | "semantic_verification" | "ai_sdk", number]> = [
    ["web_search_discovery", "web_search", ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch],
    ["document_retrieval", "retrieval", ONE_TIME_RESEARCH_REQUEST_SLOTS.retrieval],
    ["semantic_verification", "semantic_verification", ONE_TIME_RESEARCH_REQUEST_SLOTS.semanticVerification],
    ["whole_statement_ai_review", "ai_sdk", 1],
  ];
  return stages.flatMap(([stage, capability, count]) => Array.from({ length: count }, (_, ordinal) => ({
    sourceDocumentId,
    stage,
    reservation: {
      callId: `package_5b_${sourceDocumentId}_${stage}_${ordinal + 1}`,
      attempt: 1,
      retryOfCallId: null,
      capability,
      pricingPolicyRef: "sanitized_pricing_policy_v1",
      providerRoute: "sanitized_route",
      provider: "sanitized_provider",
      model: "sanitized_model",
      toolClass: capability,
      maximumInputTokens: 1000000,
      maximumOutputTokens: 50000,
      maximumToolUses: capability === "web_search" ? 2 : capability === "retrieval" ? 1 : 0,
      pricing: {
        uncachedInputUsdPerMillionTokens: 0,
        cachedInputUsdPerMillionTokens: 0,
        outputUsdPerMillionTokens: 2,
        toolUseUsd: 0,
      },
      estimatedMaximumCostUsd: stage === "whole_statement_ai_review" ? 1 : 0.5,
    },
  })));
}

function package5BReadinessCalls(sourceDocumentId = "doc_one_time_fiserv") {
  return fullOneTimeCalls(sourceDocumentId).map((call) => call.stage !== "whole_statement_ai_review"
    ? call
    : {
      ...call,
      reservation: {
        ...call.reservation,
        providerRoute: "openai_ai_sdk_generate_text_structured_output",
        provider: "openai",
        model: "gpt-5.4-mini",
        toolClass: "ai_sdk_structured_output",
        maximumInputTokens: 30_000,
        maximumOutputTokens: 5_000,
        maximumToolUses: 0,
        pricing: {
          uncachedInputUsdPerMillionTokens: 0.75,
          cachedInputUsdPerMillionTokens: 0.075,
          outputUsdPerMillionTokens: 4.5,
          toolUseUsd: 0,
        },
        estimatedMaximumCostUsd: 0.4,
      },
    });
}

function openAiReadinessCalls(sourceDocumentId = "doc_one_time_fiserv") {
  return fullOneTimeCalls(sourceDocumentId).map((call) => {
    if (call.stage === "document_retrieval") return call;
    if (call.stage === "whole_statement_ai_review") {
      return {
        ...call,
        reservation: {
          ...call.reservation,
          providerRoute: "openai_ai_sdk_generate_text_structured_output",
          provider: "openai",
          model: "gpt-5.4-mini",
          toolClass: "ai_sdk_structured_output",
          maximumInputTokens: 30_000,
          maximumOutputTokens: 5_000,
          maximumToolUses: 0,
          pricing: {
            uncachedInputUsdPerMillionTokens: 0.75,
            cachedInputUsdPerMillionTokens: 0.075,
            outputUsdPerMillionTokens: 4.5,
            toolUseUsd: 0,
          },
          estimatedMaximumCostUsd: 0.4,
        },
      };
    }
    const expectedOutput = call.stage === "web_search_discovery" ? 2_000
      : call.stage === "semantic_verification" ? 1_000 : 5_000;
    const expectedToolUses = call.stage === "web_search_discovery" ? 2 : 0;
    return {
      ...call,
      reservation: {
        ...call.reservation,
        providerRoute: call.stage === "whole_statement_ai_review"
          ? "openai_ai_sdk_generate_text_structured_output"
          : "openai_responses",
        provider: "openai",
        model: "gpt-5.4-mini",
        toolClass: call.stage === "whole_statement_ai_review"
          ? "ai_sdk_structured_output"
          : call.stage === "web_search_discovery" ? "web_search" : "semantic_verification",
        maximumInputTokens: 100_000,
        maximumOutputTokens: expectedOutput,
        maximumToolUses: expectedToolUses,
        pricing: {
          uncachedInputUsdPerMillionTokens: 0,
          cachedInputUsdPerMillionTokens: 0,
          outputUsdPerMillionTokens: 0,
          toolUseUsd: 0,
        },
        estimatedMaximumCostUsd: 0.01,
      },
    };
  });
}

function sourceDocumentIdFromCall(callId: string): string {
  const match = /^package_5b_(doc_multi_[ab])_/.exec(callId);
  if (!match) throw new Error("unexpected synthetic call ID");
  return match[1]!;
}

function external<T>(value: T, requestId: string) {
  return { type: "one_time_external_request_result_v1" as const, value, accounting: { requestId, durationMs: 1, inputTokens: 1, outputTokens: 1, toolEvents: [], observedOrEstimatedFinalCostUsd: 0.01, billingDisposition: "observed" as const } };
}

function outboundFeeLabelPrivacyMatches(labels: string[]) {
  const residualProbe = (value: string) =>
    value
      .replace(/\[redacted(?:-id)?\]/gi, " ")
      .replace(/\d{8,}/g, "long identifier")
      .replace(/\bPCI\s+DSS\s+\d+(?:\.\d+)?\b/gi, "safe descriptor")
      .replace(/\bLevel\s+\d+\b/gi, "safe descriptor");
  return {
    currencyOrRate: labels.filter((value) =>
      /(?:[$€£¥]\s*\d|\bUSD\s+\d|\d+(?:\.\d+)?(?:\s*%|\s*(?:percent(?:age)?|bps|basis\s*points?)\b)|\b(?:rate|amount|total|unit\s*price)\s*[:=]?\s*(?:\d|\.\d)|\bAT\s+\.?\d{2,}\b|\b\d+\s+TRANS\b)/i.test(value)
    ).length,
    residualFinancialNumeric: labels.filter((value) =>
      /(?:\b\d+(?:,\d{3})*(?:\.\d+)?\b|\B\.\d+\b)/.test(residualProbe(value))
    ).length,
    genericLongIdentifier: labels.filter((value) => /\d{8,}/.test(value)).length,
    merchantOrAccountIdentifier: labels.filter((value) =>
      /\b(?:merchant|account)\s*(?:id|number|no\.?|#)\s*[:#-]?\s*[A-Za-z0-9][A-Za-z0-9_-]{3,}\b/i.test(value)
    ).length,
    pathOrFilename: labels.filter((value) => /(?:\/Users\/|\/private\/|[A-Za-z]:\\|\b\S+\.(?:pdf|csv|xlsx?|docx?|txt)\b)/i.test(value)).length,
    credential: labels.filter((value) => /(?:api(?:\s|-)?key|credential|secret|password|bearer\s+[A-Za-z0-9._-]{8,}|sk-[A-Za-z0-9_-]{8,})/i.test(value)).length,
    providerOrRawContent: labels.filter((value) => /\b(?:openai|anthropic|openrouter|claude|gpt[-\w]*|raw\s*(?:prompt|response|error)|prompt\s*[:=]|response\s*[:=]|error\s*[:=])/i.test(value)).length,
  };
}

function semanticSupport(structuredClaim: any) {
  return {
    type: "fee_knowledge_semantic_support_decision" as const,
    policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
    decision: "supports" as const,
    structuredClaim,
    reasonCodes: ["synthetic_semantic_support"],
    providerDetailsStripped: true as const,
  };
}

function terminalRetrievedDocument(
  status: "timed_out" | "safety_blocked" | "failed" | "encrypted" | "oversized" | "unsupported_content_type" | "unavailable" | "malformed",
  reasonCode: string,
) {
  return {
    type: "fee_knowledge_retrieved_document" as const,
    policyVersion: "fee_knowledge_retrieval_v1" as const,
    status,
    canonicalUrl: status === "safety_blocked" ? null : "https://www.fiserv.com/terminal",
    redirectChain: [],
    contentType: status === "unsupported_content_type" ? "application/octet-stream" : null,
    byteLength: 0,
    documentFingerprint: null,
    title: null,
    text: "",
    locators: [],
    reasonCodes: [reasonCode],
  };
}

function retrievedTextDocument(url: string, feeLabel: string) {
  const text = `Fiserv ${feeLabel} official fee classification guide for 2024.`;
  const textHash = createHash("sha256").update(text).digest("hex").slice(0, 16);
  return {
    type: "fee_knowledge_retrieved_document" as const,
    policyVersion: "fee_knowledge_retrieval_v1" as const,
    status: "retrieved_text" as const,
    canonicalUrl: url,
    redirectChain: [],
    contentType: "text/html",
    byteLength: Buffer.byteLength(text),
    documentFingerprint: `sha256:${createHash("sha256").update(text).digest("hex")}`,
    title: "Official fee guide",
    text,
    locators: [{
      locatorId: `locator_${textHash.slice(0, 20)}`,
      kind: "html_paragraph" as const,
      pageNumber: null,
      sectionLabel: null,
      paragraphIndex: 0,
      tableIndex: null,
      rowIndex: null,
      textStart: 0,
      textEnd: text.length,
      textHash,
    }],
    reasonCodes: ["fee_knowledge_text_retrieved"],
  };
}

async function approvedOneTimePdfFixture() {
  const bytes = await readFile(path.resolve(process.cwd(), "test/fixtures/pdfs/Nov_2024_Statement.pdf"));
  const sourceDocumentId = "doc_one_time_fiserv";
  const preflight = createDeterministicPreflightArtifact({
    artifactId: "preflight_package_5b_v1",
    documents: [{
      sourceDocumentId,
      internalSourceRef: "source_one_time_fiserv",
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      byteCount: bytes.byteLength,
      displayFileName: "approved-statement.pdf",
      parsedProcessor: "fiserv_family",
      parsedStatementPeriod: { start: "2024-11-01", end: "2024-11-30" },
      parserEligibility: "eligible",
      processorLayoutFamily: "fiserv_family",
      productScopeEligibility: "eligible",
      productScopeReasonCode: "fiserv_family_supported",
      paidStageEligibility: "eligible",
      paidStageExclusionReason: null,
      selectedDriver: "fiserv_first_data_full_statement",
      allowedExecutionStages: eligibleStages,
      parserRecordId: "parser_package_5b",
      parserDecision: preserveParserDecision({ decision: { status: "accepted", reportable: true, confidence: "high", reason: "Approved deterministic parser fixture." }, controls: [] }),
    }],
  });
  const manifest = buildEvaluationSourceManifest(preflight);
  const directory = await mkdtemp(path.join(tmpdir(), "package-5b-integration-"));
  const manifestPath = path.join(directory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  const requests: RequestedDocumentExecution[] = [{ sourceDocumentId, stages: eligibleStages }];
  return {
    bytes,
    directory,
    runnerInput: {
      manifestPath,
      approvedManifestHash: manifest.manifestContentHash,
      requestedExecutions: requests,
      approvedBudgetUsd: 10,
      adapterId: "one_time_statement_evaluation_v1" as const,
      businessType: "restaurant_food_beverage" as const,
      resolveSourceBytes: async () => bytes,
    },
  };
}

async function approvedShortCloverPdfFixture() {
  const bytes = await readFile(path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf"));
  const sourceDocumentId = "doc_one_time_clover_short";
  const preflight = createDeterministicPreflightArtifact({
    artifactId: "preflight_package_5b_clover_privacy_v1",
    documents: [{
      sourceDocumentId,
      internalSourceRef: "source_one_time_clover_short",
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      byteCount: bytes.byteLength,
      displayFileName: "approved-clover-short.pdf",
      parsedProcessor: "fiserv_family",
      parsedStatementPeriod: { start: "2024-06-01", end: "2024-06-30" },
      parserEligibility: "eligible",
      processorLayoutFamily: "fiserv_family",
      productScopeEligibility: "eligible",
      productScopeReasonCode: "fiserv_family_supported",
      paidStageEligibility: "eligible",
      paidStageExclusionReason: null,
      selectedDriver: "fiserv_first_data_short_statement",
      allowedExecutionStages: eligibleStages,
      parserRecordId: "parser_package_5b_clover_privacy",
      parserDecision: preserveParserDecision({ decision: { status: "accepted", reportable: true, confidence: "high", reason: "Approved deterministic parser fixture." }, controls: [] }),
    }],
  });
  const manifest = buildEvaluationSourceManifest(preflight);
  const directory = await mkdtemp(path.join(tmpdir(), "package-5b-clover-privacy-"));
  const manifestPath = path.join(directory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  return {
    bytes,
    directory,
    runnerInput: {
      manifestPath,
      approvedManifestHash: manifest.manifestContentHash,
      requestedExecutions: [{ sourceDocumentId, stages: eligibleStages }],
      approvedBudgetUsd: 10,
      adapterId: "one_time_statement_evaluation_v1" as const,
      businessType: "restaurant_food_beverage" as const,
      resolveSourceBytes: async () => bytes,
    },
  };
}

async function approvedTwoDocumentPdfFixture() {
  const original = await readFile(path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf"));
  const bytesBySource = new Map<string, Uint8Array>([
    ["doc_multi_a", original],
    ["doc_multi_b", Buffer.concat([original, Buffer.from("\n% package-5b-source-b\n")])],
  ]);
  const sourceDocumentIds = [...bytesBySource.keys()];
  const preflight = createDeterministicPreflightArtifact({
    artifactId: "preflight_package_5b_multi_v1",
    documents: sourceDocumentIds.map((sourceDocumentId, index) => {
      const bytes = bytesBySource.get(sourceDocumentId)!;
      return {
        sourceDocumentId,
        internalSourceRef: `source_multi_${index + 1}`,
        sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        byteCount: bytes.byteLength,
        displayFileName: `approved-statement-${index + 1}.pdf`,
        parsedProcessor: "fiserv_family",
        parsedStatementPeriod: { start: "2024-11-01", end: "2024-11-30" },
        parserEligibility: "eligible" as const,
        processorLayoutFamily: "fiserv_family",
        productScopeEligibility: "eligible" as const,
        productScopeReasonCode: "fiserv_family_supported",
        paidStageEligibility: "eligible" as const,
        paidStageExclusionReason: null,
        selectedDriver: "fiserv_first_data_short_statement",
        allowedExecutionStages: eligibleStages,
        parserRecordId: `parser_package_5b_multi_${index + 1}`,
        parserDecision: preserveParserDecision({
          decision: { status: "accepted", reportable: true, confidence: "high", reason: "Approved deterministic parser fixture." },
          controls: [],
        }),
      };
    }),
  });
  const manifest = buildEvaluationSourceManifest(preflight);
  const directory = await mkdtemp(path.join(tmpdir(), "package-5b-multi-integration-"));
  const manifestPath = path.join(directory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  return {
    directory,
    sourceDocumentIds,
    runnerInput: {
      manifestPath,
      approvedManifestHash: manifest.manifestContentHash,
      requestedExecutions: sourceDocumentIds.map((sourceDocumentId) => ({ sourceDocumentId, stages: eligibleStages })),
      approvedBudgetUsd: 20,
      adapterId: "one_time_statement_evaluation_v1" as const,
      businessType: "restaurant_food_beverage" as const,
      resolveSourceBytes: async (row: { sourceDocumentId: string }) => bytesBySource.get(row.sourceDocumentId)!,
    },
  };
}
