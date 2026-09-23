import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analyzer.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { parsePdf } from "../src/parser.js";
import { buildSingleStatementCustomerReport } from "../src/reporting/buildSingleStatement.js";
import { buildSingleStatementReportV1 } from "../src/reporting/v1/buildReport.js";
import { buildOfflineFiservProof, modelRateChangeScenario } from "../src/modeledOpportunityProof/build.js";
import type { BusinessTypeId } from "../src/businessTypes.js";

const assumption = {
  source: "product_supplied_illustrative" as const,
  assumptionId: "product_illustration_25bps",
  rateChangeBasisPoints: 25,
  label: "Illustrative 0.25 percentage-point change",
};

const fixtures: Array<{
  name: string;
  businessType: BusinessTypeId;
  pricingModel: string | null;
  monthlyCents: number | null;
  annualCents: number | null;
}> = [
  { name: "SAMPLE_MERCHANT4_CLOVER.pdf", businessType: "restaurant_food_beverage", pricingModel: "interchange_plus", monthlyCents: 13_115, annualCents: 157_382 },
  { name: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf", businessType: "professional_services", pricingModel: "flat_rate", monthlyCents: 600, annualCents: 7_200 },
  { name: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", businessType: "retail", pricingModel: null, monthlyCents: null, annualCents: null },
];

describe("offline Fiserv modeled-opportunity proof", () => {
  for (const fixture of fixtures) {
    it(`keeps facts, review, and scenario separate for ${fixture.name}`, async () => {
      const document = await parsePdf(`test/fixtures/pdfs/${fixture.name}`);
      const documentBefore = structuredClone(document);
      const proof = buildOfflineFiservProof({
        document,
        sourceFileName: fixture.name,
        businessType: fixture.businessType,
        scenarioAssumption: assumption,
      });
      const { factPacket, contextualAssessment, modeledScenario } = proof;

      expect(document).toEqual(documentBefore);
      expect(factPacket.contractVersion).toBe("fiserv_fact_packet_proof_v1");
      expect(contextualAssessment.contractVersion).toBe("fiserv_contextual_assessment_proof_v1");
      expect(modeledScenario.contractVersion).toBe("fiserv_modeled_scenario_proof_v1");
      expect(factPacket.source.supportedFiserv).toBe(true);
      expect(factPacket.context.pricingModel.value).toBe(fixture.pricingModel);
      expect(factPacket.observed.totalFees.evidenceRefs.length).toBeGreaterThan(0);
      expect(factPacket.observed.feeComposition.visiblePricingFeeRows.every((row) => row.evidenceRefs.length > 0)).toBe(true);
      expect(contextualAssessment.knowledge.reviewAuthority).toBe("Product");
      expect(contextualAssessment.knowledge.scope.processorFamily).toBe("Fiserv / First Data");
      expect(Object.keys(proof)).toEqual(["factPacket", "contextualAssessment", "modeledScenario"]);
      expect("masterSavingsAnnualAmount" in modeledScenario).toBe(false);
      expect("estimatedAnnualSavings" in factPacket).toBe(false);
      expect("verifiedSavings" in modeledScenario).toBe(false);

      if (fixture.monthlyCents === null || fixture.annualCents === null) {
        expect(contextualAssessment.status).toBe("not_assessed");
        expect(modeledScenario.status).toBe("unavailable");
        expect(modeledScenario.monthlyModeledFinancialEffect).toBeNull();
        expect(modeledScenario.annualizedModeledFinancialEffect).toBeNull();
        expect(modeledScenario.reasonCodes).toContain("compatible_positive_volume_unavailable");
      } else {
        expect(factPacket.reconciliation.coreTotalsReconciled).toBe(true);
        expect(contextualAssessment.status).toBe("deserves_review");
        expect(contextualAssessment.evidenceRefs.length).toBeGreaterThan(0);
        expect(modeledScenario.status).toBe("modeled");
        expect(modeledScenario.monthlyModeledFinancialEffect?.amountMinor).toBe(fixture.monthlyCents);
        expect(modeledScenario.annualizedModeledFinancialEffect?.amountMinor).toBe(fixture.annualCents);
        expect(modeledScenario.suppliedAssumption.rateChangeBasisPoints).toBe(25);
        expect(modeledScenario.merchantFacingAssumptions.join(" ")).toContain("twelve comparable months");
        expect(modeledScenario.merchantFacingAssumptions.join(" ")).toContain("Card mix, transaction behavior, fee structure");
        expect(modeledScenario.sourceFacts.every((fact) => fact.evidenceRefs.length > 0)).toBe(true);
      }
    });
  }

  it("refuses a scenario when period, reconciliation, or source evidence is missing", async () => {
    const fixture = fixtures[0]!;
    const document = await parsePdf(`test/fixtures/pdfs/${fixture.name}`);
    const packet = buildOfflineFiservProof({ document, sourceFileName: fixture.name, businessType: fixture.businessType, scenarioAssumption: assumption }).factPacket;

    const partialPeriod = structuredClone(packet);
    partialPeriod.context.statementPeriod.value = { start: "2024-10-02", end: "2024-10-31" };
    expect(modelRateChangeScenario(partialPeriod, assumption).reasonCodes).toContain("full_calendar_month_not_established");

    const unreconciled = structuredClone(packet);
    unreconciled.reconciliation.coreTotalsReconciled = false;
    expect(modelRateChangeScenario(unreconciled, assumption).reasonCodes).toContain("core_totals_not_reconciled");

    const unsupportedEvidence = structuredClone(packet);
    unsupportedEvidence.observed.processedVolume.evidenceRefs = [];
    expect(modelRateChangeScenario(unsupportedEvidence, assumption).reasonCodes).toContain("source_evidence_unavailable");
  });

  it("does not change legacy single-statement report outputs or canonical savings authority", async () => {
    const fixture = fixtures[0]!;
    const document = await parsePdf(`test/fixtures/pdfs/${fixture.name}`);
    const legacy = analyzeDocument(document, fixture.businessType);
    const legacyBefore = structuredClone(legacy);
    const customerBefore = buildSingleStatementCustomerReport({ kind: "single_statement_result", analysis: legacy });
    const reportV1Before = buildSingleStatementReportV1({ analysis: legacy, reportId: "offline_proof_boundary", generatedAt: "2026-09-23T00:00:00.000Z" });
    const canonical = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.name, businessType: fixture.businessType });
    const canonicalSavingsBefore = structuredClone(canonical.opportunityEngine.summary);

    buildOfflineFiservProof({ document, sourceFileName: fixture.name, businessType: fixture.businessType, scenarioAssumption: assumption });

    expect(legacy).toEqual(legacyBefore);
    expect(buildSingleStatementCustomerReport({ kind: "single_statement_result", analysis: legacy })).toEqual(customerBefore);
    expect(buildSingleStatementReportV1({ analysis: legacy, reportId: "offline_proof_boundary", generatedAt: "2026-09-23T00:00:00.000Z" })).toEqual(reportV1Before);
    expect(canonical.opportunityEngine.summary).toEqual(canonicalSavingsBefore);
    expect(canonical.opportunityEngine.summary.masterSavingsAnnualAmount.amountMinor).toBe(0);
  });
});
