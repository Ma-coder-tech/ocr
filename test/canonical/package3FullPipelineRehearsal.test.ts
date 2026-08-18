import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildCanonicalAiCapabilities } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { buildCanonicalCustomerState } from "../../src/canonical/customerStateResolver.js";
import {
  addDeterministicAnomalySubstitution,
  buildDeterministicRuntimeSafetyReview,
} from "../../src/canonical/deterministicRuntimeSafetyReview.js";
import { buildCanonicalMerchantAttentionModel } from "../../src/canonical/merchantAttention.js";
import { runMerchantAttentionAiRuntime } from "../../src/canonical/merchantAttentionAiRuntime.js";
import { buildProductionReportProjection } from "../../src/canonical/productionReportProjection.js";
import { validateCanonicalStatementAnalysis } from "../../src/canonical/validate.js";
import {
  runWholeStatementFeeIntelligenceRuntimeWithContext,
} from "../../src/canonical/wholeStatementFeeIntelligenceRuntime.js";
import {
  WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
  type CanonicalWholeStatementFeeIntelligencePacket,
} from "../../src/canonical/wholeStatementFeeIntelligenceReview.js";
import type { RuntimeAiCapabilitySnapshot } from "../../src/canonical/runtimeAiCapabilityAdapter.js";
import type {
  CanonicalAiWholeStatementFeeIntelligenceOutput,
  CanonicalStatementAnalysis,
} from "../../src/canonical/types.js";
import { buildProductionReportV2ForJob } from "../../src/productionReportV2JobBridge.js";
import { guardProductionReportV2 } from "../../web/src/report-v2/reportV2Guard.js";
import { package3Analysis, validPackage3Interpretation } from "./package3TestFixture.js";

describe("Package 3 fixture-safe full-pipeline rehearsal", () => {
  it("carries 105 rows through canonical AI admission, merchant language, projection, persistence, and Report V2 transport", async () => {
    const initial = canonicalFixtureAnalysis();
    const deterministicBefore = deterministicFinancialProjection(initial);

    const wholeStatement = await runWholeStatementFeeIntelligenceRuntimeWithContext({
      analysis: initial,
      options: {
        enabled: true,
        feeKnowledgeResearch: { enabled: false },
        maxRowsPerRequest: 20,
        maxConcurrentRequests: 2,
        adapter: async (packet) => validWholeStatementReview(packet),
      },
    });

    expect(wholeStatement.output).toMatchObject({ reviewStatus: "completed", financialMutationAllowed: false });
    expect(wholeStatement.output.coverageProof).toMatchObject({
      exactCoverage: true,
      missingFeeRowRefs: [],
      duplicatedFeeRowRefs: [],
      unknownFeeRowRefs: [],
      malformedFeeRowRefs: [],
    });
    expect(wholeStatement.output.coverageProof.reviewedFeeRowRefs).toHaveLength(105);
    expect(wholeStatement.diagnostics.provider).toMatchObject({
      requestBatchCount: 6,
      completedRequestBatchCount: 6,
      retryCount: 0,
      incompleteOutputCount: 0,
    });
    expect(wholeStatement.diagnostics.provider.batchCoverage).toHaveLength(6);
    expect(wholeStatement.diagnostics.provider.batchCoverage.every((batch) =>
      batch.exactCoverage
      && batch.exactEvidenceLinkage
      && batch.rejectedTopLevelEvidenceCount === 0
      && batch.foreignTopLevelEvidenceCount === 0
      && batch.duplicateTopLevelEvidenceCount === 0
      && batch.missingTopLevelEvidenceCount === 0
    )).toBe(true);

    const grounded = analysisWithGroundedWholeStatement(initial, wholeStatement.output);
    const wholeStatementCapability = grounded.aiCapabilities.capabilities.find(
      (capability) => capability.capability === "whole_statement_fee_intelligence_review",
    );
    expect(wholeStatementCapability).toMatchObject({
      status: "completed",
      groundingStatus: "grounded",
      financialReadinessOnFailure: expect.any(String),
    });
    expect(grounded.merchantAttention.items).toHaveLength(105);

    const fullMerchantInterpretation = validPackage3Interpretation(grounded.merchantAttention);
    const observedPackets: string[][] = [];
    const merchantLanguage = await runMerchantAttentionAiRuntime({
      model: grounded.merchantAttention,
      options: {
        maxItemsPerRequest: 12,
        maxOutputTokens: 12_000,
        adapter: async (packet) => {
          const allowed = new Set(packet.items.map((item) => item.attentionItemId));
          observedPackets.push([...allowed]);
          return {
            ...fullMerchantInterpretation,
            outputId: `merchant_language_fixture_safe_packet_${observedPackets.length}`,
            items: fullMerchantInterpretation.items
              .filter((item: { attentionItemId: string }) => allowed.has(item.attentionItemId))
              .map((item: { whyThisDeservesAttention: string }) => ({
                ...item,
                whyThisDeservesAttention: `${item.whyThisDeservesAttention} Unsupported generated flourish.`,
              })),
          };
        },
      },
    });

    expect(merchantLanguage.status).toBe("admitted");
    expect(merchantLanguage.eligibleItemCount).toBe(32);
    expect(merchantLanguage.admittedItemCount).toBe(merchantLanguage.eligibleItemCount);
    expect(merchantLanguage.diagnostics).toMatchObject({
      requestBatchCount: observedPackets.length,
      completedRequestBatchCount: observedPackets.length,
      processedItemCount: merchantLanguage.eligibleItemCount,
      incompleteOutputCount: 0,
      schemaValidationFailureCount: 0,
      semanticStabilizationApplied: true,
      canonicalFieldSubstitutionCount: merchantLanguage.eligibleItemCount,
    });
    expect(new Set(observedPackets.flat()).size).toBe(merchantLanguage.eligibleItemCount);
    expect(observedPackets).toHaveLength(3);
    expect(JSON.stringify(merchantLanguage.model)).not.toContain("Unsupported generated flourish");

    const finalAnalysis = validateCanonicalStatementAnalysis({
      ...grounded,
      merchantAttention: merchantLanguage.model,
    });
    expect(deterministicFinancialProjection(finalAnalysis)).toEqual(deterministicBefore);
    expect(finalAnalysis.merchantAttention.interpretation).toMatchObject({
      source: "admitted_ai_interpretation",
      coverage: {
        eligibleItemCount: merchantLanguage.eligibleItemCount,
        admittedItemCount: merchantLanguage.eligibleItemCount,
      },
    });

    const projection = buildProductionReportProjection(finalAnalysis);
    expect(projection).toMatchObject({
      schemaVersion: "ratereveal_production_report_v2",
      recovery: null,
      report: { merchantLanguage: { source: "ai_assisted", degraded: false } },
    });
    expect(projection.report?.allCharges.rows).toHaveLength(105);

    let bridgeBuildCount = 0;
    const bridgedProjection = await buildProductionReportV2ForJob({
      jobId: "fixture-safe-full-pipeline",
      document: { sourceType: "pdf", headers: [], rows: [], textPreview: "", extraction: { mode: "structured", qualityScore: 1, warnings: [], pageCount: 1 } },
      businessType: "restaurant_food_beverage",
      env: { RATEREVEAL_REPORT_V2_ENABLED: "true" },
      build: async () => {
        bridgeBuildCount += 1;
        return { projection };
      },
    });
    expect(bridgeBuildCount).toBe(1);
    expect(bridgedProjection).toEqual(projection);

    const persistedProjection = await persistAndReloadProjection(projection);
    expect(persistedProjection).toEqual(projection);
    expect(guardProductionReportV2(JSON.parse(JSON.stringify(persistedProjection)))).toMatchObject({ ok: true });
    expect(deterministicFinancialProjection(finalAnalysis)).toEqual(deterministicBefore);
    expect(`${JSON.stringify(wholeStatement.diagnostics)}${JSON.stringify(merchantLanguage.diagnostics)}`)
      .not.toMatch(/Fixture Merchant|ADDITIONAL FEES|raw prompt|raw response|api.?key|\.pdf|\/Users\//i);
  }, 30_000);
});

function canonicalFixtureAnalysis(): CanonicalStatementAnalysis {
  const analysis = package3Analysis(Array.from({ length: 105 }, (_, index) => ({
    label: index < 32
      ? `ADDITIONAL FEES ${String(index + 1).padStart(3, "0")}`
      : `VISA INTERCHANGE ${String(index + 1).padStart(3, "0")}`,
    amount: 1 + (index % 17) / 10,
  })));
  const identityEvidenceRefs = [...analysis.financialFacts.processedSales.evidenceRefs];
  analysis.identity.processorName.evidenceRefs = identityEvidenceRefs;
  analysis.identity.processorFamily.evidenceRefs = identityEvidenceRefs;
  analysis.identity.statementPeriod.evidenceRefs = identityEvidenceRefs;
  analysis.businessQualification.status = "unavailable";
  analysis.businessQualification.resolvedSegmentId = null;
  analysis.aiCapabilities = buildCanonicalAiCapabilities({
    identity: analysis.identity,
    businessQualification: analysis.businessQualification,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    evidence: analysis.evidence,
  });
  analysis.customerState = buildCanonicalCustomerState({
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    aiCapabilities: analysis.aiCapabilities,
    rateComparison: analysis.customerState.rateComparison,
  });
  return validateCanonicalStatementAnalysis({
    ...analysis,
    merchantAttention: buildCanonicalMerchantAttentionModel(analysis),
  });
}

function analysisWithGroundedWholeStatement(
  analysis: CanonicalStatementAnalysis,
  output: CanonicalAiWholeStatementFeeIntelligenceOutput,
): CanonicalStatementAnalysis {
  const runtimeSnapshots: RuntimeAiCapabilitySnapshot[] = [{
    capability: "full_statement_anomaly_review",
    attempted: false,
    normalizedStatus: "disabled",
    safeCounts: {},
    executionRef: null,
    reasonCodes: ["runtime_anomaly_review_disabled"],
  }];
  const deterministicRuntimeSafetyReview = buildDeterministicRuntimeSafetyReview({
    analysis,
    runtimeAiCapabilitySnapshots: runtimeSnapshots,
  });
  const harnessInputs = addDeterministicAnomalySubstitution({
    harnessInputs: [{
      capability: "whole_statement_fee_intelligence_review",
      status: "completed",
      output,
      executionRef: null,
      independentReviewRefs: [],
    }],
    review: deterministicRuntimeSafetyReview,
    runtimeAiCapabilitySnapshots: runtimeSnapshots,
  });
  const aiCapabilities = buildCanonicalAiCapabilities({
    identity: analysis.identity,
    businessQualification: analysis.businessQualification,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    evidence: analysis.evidence,
    harnessInputs,
    deterministicRuntimeSafetyReview,
  });
  const customerState = buildCanonicalCustomerState({
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    aiCapabilities,
    rateComparison: analysis.customerState.rateComparison,
  });
  const candidate = { ...analysis, aiCapabilities, customerState };
  return validateCanonicalStatementAnalysis({
    ...candidate,
    merchantAttention: buildCanonicalMerchantAttentionModel(candidate),
  });
}

function validWholeStatementReview(packet: CanonicalWholeStatementFeeIntelligencePacket) {
  return {
    type: "whole_statement_fee_intelligence_review" as const,
    reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
    reviewStatus: "completed" as const,
    evidenceRefs: [...new Set(packet.admittedFeeRows.flatMap((row) => row.evidenceRefs))].sort(),
    factRefs: [],
    limitationCodes: [],
    rowInterpretations: packet.admittedFeeRows.map((row) => {
      const deterministic = row.currentDeterministicCandidates[0];
      return {
        feeRowRef: row.feeRowRef,
        proposedCategory: deterministic?.category ?? "unknown_needs_review",
        likelyEconomicOwner: deterministic?.likelyEconomicOwner ?? "unknown",
        likelyContractualController: deterministic?.likelyContractualController ?? "unknown",
        proposedActionabilityCeiling: deterministic?.actionabilityCeiling ?? "unknown",
        confidence: deterministic?.confidence ?? "low",
        conciseRationale: "Statement row context supports this bounded semantic interpretation.",
        evidenceProvenance: "statement_evidence" as const,
        evidenceRefs: row.evidenceRefs,
        externalSourceRef: null,
        externalClaimSupportRef: null,
        conflicts: [],
        missingEvidence: [],
        recommendedDisposition: "supported" as const,
        authoritative: false as const,
      };
    }),
    reasonCodes: ["whole_statement_fee_intelligence_reviewed"],
    authoritative: false as const,
    financialMutationAllowed: false as const,
    providerDetailsStripped: true as const,
  };
}

function deterministicFinancialProjection(analysis: CanonicalStatementAnalysis) {
  return structuredClone({
    identity: analysis.identity,
    businessQualification: analysis.businessQualification,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    calculations: analysis.calculations,
    rateComparison: analysis.customerState.rateComparison,
  });
}

async function persistAndReloadProjection(projection: ReturnType<typeof buildProductionReportProjection>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ratereveal-package-3-rehearsal-"));
  process.env.FEECLEAR_DB_PATH = path.join(root, "rehearsal.sqlite");
  vi.resetModules();
  const store = await import("../../src/store.js");
  const dbModule = await import("../../src/db.js");
  try {
    const job = store.createJob({
      fileName: "fixture-safe-statement.pdf",
      filePath: path.join(root, "fixture-safe-statement.pdf"),
      fileType: "pdf",
      businessType: "restaurant_food_beverage",
    });
    store.updateJob(job.id, { productionReportV2: projection });
    return store.getJob(job.id)?.productionReportV2;
  } finally {
    dbModule.db.close();
    delete process.env.FEECLEAR_DB_PATH;
    await fs.rm(root, { recursive: true, force: true });
  }
}
