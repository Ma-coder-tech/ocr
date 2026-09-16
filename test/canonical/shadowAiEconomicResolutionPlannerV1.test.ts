import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildClaimScopedQualificationIntegrityCostDriverAdmissionV1 } from "../../src/canonical/claimScopedQualificationIntegrityCostDriverAdmissionV1.js";
import { buildCommercialDecompositionContractV1 } from "../../src/canonical/commercialDecompositionContractV1.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../../src/canonical/governedPaymentKnowledgeAuthority.js";
import { canonicalFinancialTruthFingerprint, type InternalAnalystPricingModelInput } from "../../src/canonical/internalAnalystFindingV1.js";
import {
  compileShadowAiEconomicResolutionPacketsV1,
  inspectShadowAiEconomicResolutionPacketPrivacyV1,
  selectShadowAiEconomicResolutionIssuesV1,
} from "../../src/canonical/shadowAiEconomicResolutionIssueSelectionV1.js";
import { createShadowAiEconomicResolutionEvaluationAdapterV1 } from "../../src/canonical/shadowAiEconomicResolutionPlannerEvaluationAdapterV1.js";
import {
  runShadowAiEconomicResolutionPlannerV1,
  validateShadowAiEconomicResolutionPlanV1,
} from "../../src/canonical/shadowAiEconomicResolutionPlannerRuntimeV1.js";
import type {
  ShadowAiEconomicResolutionPacketV1,
  ShadowAiEconomicResolutionSelectionV1,
} from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";
import { inspectFiservOneStatementEvaluation } from "../../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import type { ParsedDocument } from "../../src/parser.js";
import { analyzeStatementDocument } from "../../src/statementParserOrchestrator.js";

describe("Shadow AI Economic Resolution Planner v1", () => {
  let selection: ShadowAiEconomicResolutionSelectionV1;
  let packets: readonly ShadowAiEconomicResolutionPacketV1[];
  let canonicalBefore: string;
  let rdBefore: string;
  let canonicalAfter: string;
  let rdAfter: string;

  beforeAll(async () => {
    const file = "fiserv_ABDUL_BASHER_Aug_2025.pdf";
    const inspected = await inspectFiservOneStatementEvaluation({
      statementPaths: [`test/fixtures/pdfs/${file}`],
      safeStatementId: "shadow-planner-test",
    });
    const canonical = buildCanonicalStatementFactsFromParsedDocument(inspected.document, {
      sourceFileName: file,
      businessType: "retail",
    });
    const authority = new GovernedPaymentKnowledgeAuthority();
    const knowledge = authority.resolveStatement({
      analysis: canonical,
      context: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["supported_fiserv_us_scope"] } },
      suppliedPricingObservation: deterministicPricing(inspected.document, file, canonical),
    });
    const decomposition = buildCommercialDecompositionContractV1({ analysis: canonical, knowledge });
    const attached = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
      document: inspected.document,
      economic: inspected.economic,
      canonicalAnalysis: canonical,
      commercialDecomposition: decomposition,
    });
    const qualification = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
      economic: inspected.economic,
      currentRelationshipProfile: attached.profile,
      commercialDecomposition: decomposition,
    });
    canonicalBefore = canonicalFinancialTruthFingerprint(canonical);
    rdBefore = fingerprint(inspected.economic);
    selection = selectShadowAiEconomicResolutionIssuesV1({
      currentEconomics: attached.profile,
      commercialDecomposition: decomposition,
      qualificationIntegrity: qualification,
    });
    packets = compileShadowAiEconomicResolutionPacketsV1({
      opaqueRunRef: "shadow-run-0123456789abcdef",
      selection,
      currentEconomics: attached.profile,
      commercialDecomposition: decomposition,
      merchantBusinessContext: {
        businessName: "Ada Lovelace",
        admittedBusinessCategory: "retail",
        businessLocation: { country: "US" },
        knownChannel: attached.profile.activity.channel.value,
      },
    });
    canonicalAfter = canonicalFinancialTruthFingerprint(canonical);
    rdAfter = fingerprint(inspected.economic);
  }, 30_000);

  it("selects deterministic unresolved issues and emits bounded private-safe packets", () => {
    expect(selection.selectedIssues.length).toBeGreaterThan(0);
    expect(selection.selectedIssues.length).toBeLessThanOrEqual(6);
    expect(new Set(selection.selectedIssues.map((issue) => issue.issueId)).size).toBe(selection.selectedIssues.length);
    expect(packets).toHaveLength(selection.selectedIssues.length);
    expect(packets.every((packet) => inspectShadowAiEconomicResolutionPacketPrivacyV1(packet).valid)).toBe(true);
    expect(packets.every((packet) => packet.merchantBusinessContext?.privacyClassification === "PURPOSE_BOUND_BUSINESS_IDENTITY")).toBe(true);
    expect(packets.every((packet) => packet.merchantBusinessContext?.naturalPersonOrSoleProprietorAmbiguity === "POSSIBLE")).toBe(true);
    expect(canonicalJson(packets)).not.toContain(filePathFragment());
    expect(canonicalBefore).toBe(canonicalAfter);
    expect(rdBefore).toBe(rdAfter);
  });

  it("produces useful non-authoritative plans in one offline batched operation", async () => {
    const run = await runShadowAiEconomicResolutionPlannerV1({
      selection,
      packets,
      adapter: createShadowAiEconomicResolutionEvaluationAdapterV1(),
    });
    expect(run.status).toBe("COMPLETED");
    expect(run.plans).toHaveLength(packets.length);
    expect(run.invalidOutputs).toEqual([]);
    expect(run.accounting).toMatchObject({
      plannerOperationCount: 1,
      providerCallAttempts: 0,
      providerCallCompleted: 0,
      providerNetworkCalls: 0,
      estimatedCostUsdMicros: 0,
      retries: 0,
      researchOperations: 0,
      sourceAdmissions: 0,
    });
    for (const plan of run.plans) {
      expect(plan).toMatchObject({
        outputType: "AI_INFERENCE_ONLY",
        authority: "NON_AUTHORITATIVE",
        admissionStatus: "NOT_ADMITTED",
        truthEffect: "NONE",
        financialMutationAllowed: false,
        customerRenderingAllowed: false,
        unresolvedAfterAnalysis: true,
      });
      expect(plan.primaryHypothesis.confirmationRequirements.length).toBeGreaterThan(0);
      expect(plan.primaryHypothesis.falsificationConditions.length).toBeGreaterThan(0);
      if (selection.selectedIssues.find((issue) => issue.issueId === plan.issueId)?.competingHypothesisRequired) {
        expect(plan.alternativeHypotheses.length).toBeGreaterThan(0);
      }
    }
  });

  it("blocks private fields, hallucinated references, and authoritative conclusions", async () => {
    const privatePacket = { ...packets[0], merchantId: "merchant-id:123456" } as unknown as ShadowAiEconomicResolutionPacketV1;
    const privacy = inspectShadowAiEconomicResolutionPacketPrivacyV1(privatePacket);
    expect(privacy.valid).toBe(false);
    expect(privacy.reasonCodes).toContain("shadow_planner_forbidden_private_field");
    let invoked = false;
    const privacyBlocked = await runShadowAiEconomicResolutionPlannerV1({
      selection,
      packets: [privatePacket, ...packets.slice(1)],
      adapter: {
        adapterId: "must-not-run",
        transport: "PROVIDER",
        async invoke() { invoked = true; throw new Error("must not run"); },
      },
    });
    expect(privacyBlocked.status).toBe("SAFETY_BLOCKED");
    expect(privacyBlocked.accounting.providerCallAttempts).toBe(0);
    expect(invoked).toBe(false);

    const adapter = createShadowAiEconomicResolutionEvaluationAdapterV1();
    const generated = await adapter.invoke({
      manifest: (await import("../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js")).SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1,
      packets: [packets[0]],
      signal: new AbortController().signal,
    });
    const invalid = {
      ...(generated.outputs[0] as Record<string, unknown>),
      exactCitedFactRefs: ["invented:fact"],
      internalExplanationDraft: "This definitely means the processor is responsible.",
    };
    const validation = validateShadowAiEconomicResolutionPlanV1(invalid, packets[0]);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.errors).toContain("shadow_planner_hallucinated_fact_ref");
      expect(validation.errors).toContain("shadow_planner_forbidden_conclusion");
    }

    const validPlan = generated.outputs[0] as Record<string, any>;
    const acceptedRef = validPlan.primaryHypothesis.supportingFactRefs[0];
    const diagnosticOnly = validateShadowAiEconomicResolutionPlanV1({
      ...validPlan,
      reconstructionSuspicions: [{
        outcomeType: "FINANCIAL_RECONSTRUCTION_SUSPICION",
        authority: "NON_AUTHORITATIVE",
        admissionStatus: "NOT_ADMITTED",
        truthEffect: "NONE",
        financialMutationAllowed: false,
        exactAcceptedFactOrOccurrenceRefs: [acceptedRef],
        reasonForSuspicion: "Two accepted occurrence references may warrant a deterministic duplicate-occurrence control recheck.",
        conflictingEvidenceRefs: [acceptedRef],
        requestedDeterministicRecheckType: "DUPLICATE_OCCURRENCE_RECHECK",
      }],
    }, packets[0]);
    expect(diagnosticOnly.ok).toBe(false);
    if (!diagnosticOnly.ok) {
      expect(diagnosticOnly.errors).toContain("shadow_planner_reconstruction_suspicion_not_allowed_without_accepted_conflict");
      expect(diagnosticOnly.errors).toContain("shadow_planner_reconstruction_suspicion_conflict_refs_not_distinct");
    }
  });

  it("preserves deterministic output when unavailable, failed, or over budget", async () => {
    const unavailable = await runShadowAiEconomicResolutionPlannerV1({ selection, packets });
    expect(unavailable.status).toBe("UNAVAILABLE");
    expect(unavailable.plans).toEqual([]);
    expect(unavailable.deterministicResultPreserved).toBe(true);

    const failed = await runShadowAiEconomicResolutionPlannerV1({
      selection,
      packets,
      adapter: { adapterId: "failure-test", transport: "PROVIDER", async invoke() { throw new Error("failure"); } },
    });
    expect(failed.status).toBe("UNAVAILABLE");
    expect(failed.accounting).toMatchObject({ providerCallAttempts: 1, providerNetworkCalls: 1, retries: 0 });
    expect(failed.deterministicResultPreserved).toBe(true);

    const overBudget = await runShadowAiEconomicResolutionPlannerV1({
      selection,
      packets,
      adapter: {
        adapterId: "budget-test",
        transport: "EVALUATION_STUB",
        async invoke() {
          return { outputs: [], usage: { inputTokens: 1, outputTokens: 12_001, estimatedCostUsdMicros: 0, latencyMs: 0 } };
        },
      },
    });
    expect(overBudget.status).toBe("SAFETY_BLOCKED");
    expect(overBudget.invalidOutputs[0]?.errorCodes).toContain("shadow_planner_output_token_budget_exceeded");
    expect(overBudget.deterministicResultPreserved).toBe(true);
  });
});

function deterministicPricing(document: ParsedDocument, file: string, analysis: any): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, "retail", { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) {
    throw new Error("pricing unavailable");
  }
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row: any) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function filePathFragment(): string {
  return "fiserv_ABDUL_BASHER_Aug_2025.pdf";
}
