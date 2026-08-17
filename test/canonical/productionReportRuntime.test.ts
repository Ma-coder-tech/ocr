import { describe, expect, it } from "vitest";
import { buildProductionReportFromRuntime } from "../../src/canonical/productionReportRuntime.js";
import { buildCanonicalRuntimeAnalysisWithRuntimeAi } from "../../src/canonical/runtimeAdapter.js";
import { buildProductionReportProjection } from "../../src/canonical/productionReportProjection.js";
import { parsePdf } from "../../src/parser.js";
import {
  WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
  type CanonicalWholeStatementFeeIntelligencePacket,
} from "../../src/canonical/wholeStatementFeeIntelligenceReview.js";

describe("Package 3 production report runtime", () => {
  it("runs canonical analysis, safe merchant-language degradation, and report projection in the required order", async () => {
    const document = await parsePdf("test/fixtures/pdfs/fiserv_ABDUL_BASHER_Aug_2025.pdf");
    const result = await buildProductionReportFromRuntime({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_package_3_runtime_integration",
      wholeStatementFeeIntelligence: { enabled: false },
      merchantLanguageInterpretation: { anthropicApiKey: "", openAiApiKey: "" },
    });

    expect(result.projection.experience).toBe("analysis_available_with_open_questions");
    expect(result.projection.report).not.toBeNull();
    expect(result.projection.report!.merchantLanguage).toEqual({ source: "deterministic_fallback", degraded: true });
    expect(result.merchantLanguageRuntime).toMatchObject({ status: "provider_unavailable", attempted: false });
    expect(result.runtimeDiagnostics).toMatchObject({
      policyVersion: "package_3_runtime_diagnostics_v1",
      wholeStatementFeeIntelligence: {
        provider: "none",
        attempted: false,
        reviewStatus: "disabled",
        canonicalAdmissionStatus: "not_admitted",
        admittedFeeKnowledgeAvailable: false,
      },
      merchantLanguageAi: {
        provider: "none",
        attempted: false,
        status: "provider_unavailable",
      },
    });
    expect(result.projection.header).toMatchObject({
      merchantName: "XPRESS FIX",
      processor: expect.any(String),
      statementPeriod: expect.any(Object),
      statementScope: "One statement analyzed.",
    });
    expect(JSON.stringify(result.merchantLanguageRuntime)).not.toMatch(/providerName|modelName|prompt|response|apiKey/i);
    expect(JSON.stringify(result.runtimeDiagnostics)).not.toMatch(/XPRESS FIX|\.pdf|\/Users\/|raw statement|prompt|response|apiKey/i);
  });

  it("projects admitted whole-statement meaning into Merchant Attention without a live provider", async () => {
    const document = await parsePdf("test/fixtures/pdfs/fiserv_ABDUL_BASHER_Aug_2025.pdf");
    let admittedRowRef: string | null = null;
    const runtime = await buildCanonicalRuntimeAnalysisWithRuntimeAi({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_package_4_admitted_intelligence",
      wholeStatementFeeIntelligence: {
        enabled: true,
        feeKnowledgeResearch: { enabled: false },
        adapter: async (packet) => {
          admittedRowRef = packet.admittedFeeRows.find((row) =>
            row.currentDeterministicCandidates.length > 0
            && ["individual_charge", "interchange_detail_row", "adjustment", "credit", "unknown_unresolved"].includes(row.role),
          )?.feeRowRef ?? null;
          return admittedWholeStatementReview(packet);
        },
      },
      merchantLanguageInterpretation: { anthropicApiKey: "", openAiApiKey: "" },
    });

    expect(admittedRowRef).toBeTruthy();
    const attention = runtime.analysis.merchantAttention.items.find((item) => item.feeRowIds.includes(admittedRowRef!));
    expect(attention?.sourceIntelligenceRefs.length).toBeGreaterThan(0);
    const projection = buildProductionReportProjection(runtime.analysis);
    const projectedRow = projection.report?.allCharges.rows.find((row) => row.id === admittedRowRef);
    expect(projectedRow).toMatchObject({ references: { feeRowRef: admittedRowRef } });
    expect(projectedRow?.whatRateRevealKnows).toBe(
      attention?.evidenceBoundary.reasonableConclusion.summary.replace(/itemized/gi, "broken down"),
    );
    expect(runtime.runtimeDiagnostics?.wholeStatementFeeIntelligence).toMatchObject({
      provider: "custom_adapter",
      attempted: true,
      reviewStatus: "completed",
      canonicalAdmissionStatus: "admitted",
    });
  });
});

function admittedWholeStatementReview(packet: CanonicalWholeStatementFeeIntelligencePacket) {
  return {
    type: "whole_statement_fee_intelligence_review",
    reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
    reviewStatus: "completed",
    evidenceRefs: packet.admittedFeeRows.flatMap((row) => row.evidenceRefs),
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
        evidenceProvenance: "statement_evidence",
        evidenceRefs: row.evidenceRefs,
        externalSourceRef: null,
        externalClaimSupportRef: null,
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
