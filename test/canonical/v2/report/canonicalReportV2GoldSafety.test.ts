import { describe, expect, it } from "vitest";
import {
  buildCanonicalMerchantReportProjectionV2,
  classifyRhDifference,
  compareConstructedReportObservations,
  evaluateStaticRhConformance,
  observeConstructedCanonicalReportV2,
  validateCanonicalMerchantReportProjectionV2,
} from "../../../../src/canonical/v2/index.js";
import { completedSynthesis, rhProjection, rhSynthesis, unableSynthesis, zeroVolumeSynthesis } from "./reportFixtures.js";

describe("RH Gold v0.3 projection safety", () => {
  it("covers zero-volume refusal and source-unavailable report behavior", () => {
    const zero = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: zeroVolumeSynthesis() }).projection;
    const unavailable = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: unableSynthesis() }).projection;
    expect(zero.snapshot?.effectiveRate).toMatchObject({ state: "undefined", decimalValue: null });
    expect(unavailable.experience).toBe("unable_to_complete");
    expect(unavailable.snapshot).toBeNull();
  });

  it("covers S4 pricing-program flow without treating gross fee reduction as savings", () => {
    const report = rhProjection().projection;
    const program = rhSynthesis().synthesisLayer.merchantPricingPrograms[0]!;
    expect(program.netMerchantBorneCost?.amountMinor).toBe(4000);
    expect(report.attention?.items.some((item) => item.title.code === "theme_program_title")).toBe(false);
    expect(JSON.stringify(report)).not.toMatch(/gross fee reduction|savings total/i);
  });

  it("covers S5 Amex refusal, safer S6 split-fact withholding, and S7 deterministic language", () => {
    const synthesis = rhSynthesis();
    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: synthesis }).projection;
    expect(synthesis.synthesisLayer.amexEconomics).toMatchObject({ status: "unresolved", acceptanceMode: "unknown", marginState: "unresolved" });
    expect(synthesis.economicAnalysis.pricingAnalysis.foundation.financialPopulations.settlementAdjustmentAmount.status).toBe("unavailable");
    expect(synthesis.economicAnalysis.economicLayer.nonFeeExclusions.some((item) => item.reason === "settlement_adjustment")).toBe(false);
    expect(report.composition?.authoritativeTotal?.amountMinor).toBe(synthesis.economicAnalysis.economicLayer.costStack.authoritativeStatementFeeTotal?.amountMinor);
    expect(report.customerLanguage).toBe("deterministic_copy_registry_only");
  });

  it("covers S8 conflict, S9 denominator mismatch, and S10 unsupported savings refusal", () => {
    const report = rhProjection({ knowledgeConflicts: [{ state: "conflicting", materiality: "material" }] }).projection;
    expect(report.verdict.axes.openQuestionState).toBe("material");
    expect(report.questions?.items.some((item) => item.uncertain.code === "question_knowledge_conflict")).toBe(true);
    expect(report.snapshot?.effectiveRate.label.code).toBe("effective_rate");
    expect(report.snapshot?.effectiveRate.decimalValue).toBe(rhSynthesis().economicAnalysis.pricingAnalysis.foundation.metrics.headlineEffectiveRate.value);
    expect(JSON.stringify(report)).not.toMatch(/guaranteed savings|expected savings|benchmark gap|target rate/i);
    expect(report).not.toHaveProperty("savingsTotal");
  });

  it("derives instance comparison from constructed values and labels its evidence truthfully", () => {
    const projection = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: completedSynthesis() }).projection;
    const legacy = observeConstructedCanonicalReportV2(projection);
    const comparison = compareConstructedReportObservations(legacy, projection);
    expect(comparison.items).toHaveLength(12);
    expect(comparison.counts.same_semantic_fact).toBe(12);
    expect(comparison.hasUnexpectedDivergence).toBe(false);
    expect(comparison.items.every((item) => item.evidenceType === "constructed_instance")).toBe(true);
  });

  it("uses static conformance separately and rejects an unrelated amendment ID", () => {
    expect(evaluateStaticRhConformance({ reportV1FilesUnchanged: true }).items.every((item) => item.evidenceType === "static_architecture")).toBe(true);
    expect(evaluateStaticRhConformance({ reportV1FilesUnchanged: false }).hasUnexpectedDivergence).toBe(true);
    expect(classifyRhDifference({ fact: "financialMetrics.processedSales", evidenceType: "constructed_instance", same: false,
      allowedAmendment: null, assertedAmendment: "RH-AMEND-006-DYNAMIC-RECONCILED-COMPOSITION" }).classification).toBe("unexpected_divergence");
  });

  it("enforces global prohibitions and validates completed projection", () => {
    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: completedSynthesis() }).projection;
    expect(validateCanonicalMerchantReportProjectionV2(report).errors).toEqual([]);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/Gold-[A-Z0-9]|G[1-9]|S(?:10|[1-9])|guaranteed|overcharge|processor fault|high risk|external_source_url/i);
  });
});
