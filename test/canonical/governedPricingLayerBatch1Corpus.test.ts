import { describe, expect, it } from "vitest";
import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import {
  buildInternalAnalystFindingV1,
  canonicalFinancialTruthFingerprint,
  type InternalAnalystFinding,
  type InternalAnalystPricingModelInput,
} from "../../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { parsePdf, type ParsedDocument } from "../../src/parser.js";
import { analyzeStatementDocument } from "../../src/statementParserOrchestrator.js";

const PDF_ROOT = "test/fixtures/pdfs";
const FIXTURES: Array<{ file: string; businessType: BusinessTypeId }> = [
  { file: "Nov_2024_Statement.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT4_CLOVER.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf", businessType: "other" },
  { file: "fiserv_ABDUL_BASHER_Aug_2025.pdf", businessType: "retail" },
  { file: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_NXGEN_VORTAX_Sep_2022.pdf", businessType: "retail" },
  { file: "fiserv_PAYSAFE_Febr_2024.pdf", businessType: "professional_services" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", businessType: "ecommerce" },
  { file: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", businessType: "restaurant_food_beverage" },
];
const US_CONTEXT = {
  geography: {
    value: "us",
    evidenceClass: "statement_local" as const,
    evidenceRefs: ["supported_fiserv_us_scope"],
  },
};

describe("governed pricing-layer Batch 1 full Fiserv corpus", () => {
  it("matches the reviewed 11-document calibration and preserves every canonical financial fingerprint", async () => {
    const reports: Array<{
      file: string;
      analysis: CanonicalStatementAnalysis;
      findings: InternalAnalystFinding[];
      pricingModel: string | null;
      researchQueued: number;
    }> = [];

    for (const fixture of FIXTURES) {
      const document = await parsePdf(`${PDF_ROOT}/${fixture.file}`);
      const analysis = buildCanonicalStatementFactsFromParsedDocument(document, {
        sourceFileName: fixture.file,
        businessType: fixture.businessType,
      });
      const before = canonicalFinancialTruthFingerprint(analysis);
      const report = buildInternalAnalystFindingV1({
        analysis,
        statementContext: US_CONTEXT,
        pricingModel: deterministicPricing(document, fixture.file, fixture.businessType, analysis),
        asOf: "2026-09-06",
      });

      expect(report.canonicalFinancialTruth).toMatchObject({
        beforeFingerprint: before,
        afterFingerprint: before,
        unchanged: true,
        mutationAllowed: false,
      });
      expect(canonicalFinancialTruthFingerprint(analysis)).toBe(before);
      reports.push({
        file: fixture.file,
        analysis,
        findings: report.findings.filter((finding) => finding.sourceFeeRowId),
        pricingModel: report.findings.find((finding) => finding.sourceFeeRowId)?.pricingModel.value ?? null,
        researchQueued: report.coverage.queuedResearchQuestions,
      });
    }

    const findings = reports.flatMap((report) => report.findings);
    const exact = findings.filter((finding) => Boolean(finding.exactFeeIdentity.value));
    const categoryOnly = findings.filter((finding) => !finding.exactFeeIdentity.value && Boolean(finding.broaderEconomicCategory.value));
    const unresolved = findings.filter((finding) => !finding.exactFeeIdentity.value && !finding.broaderEconomicCategory.value);
    const ambiguous = findings.filter((finding) => finding.competingInterpretations.length > 0 || finding.exactFeeIdentity.state === "conflicting");
    const ambiguousExact = exact.filter((finding) => finding.competingInterpretations.length > 0 || finding.exactFeeIdentity.state === "conflicting");

    expect(findings).toHaveLength(483);
    // Later admitted knowledge may strengthen identity without changing the
    // Batch 1 pricing-layer semantics or canonical financial truth.
    expect(exact).toHaveLength(89);
    expect(categoryOnly).toHaveLength(92);
    expect(unresolved).toHaveLength(302);
    // The current-2026 adjudication intentionally adds 11 material, explicitly
    // unresolved rate conflicts without changing the Batch 1 identity counts.
    expect(ambiguous).toHaveLength(104);
    expect(ambiguousExact.filter((finding) => finding.exactFeeIdentity.value?.startsWith("amex_"))).toHaveLength(3);
    expect(ambiguousExact.some((finding) => (finding.usNetworkFeeEvidence?.sourceConflicts.length ?? 0) > 0)).toBe(true);
    expect(reports.reduce((sum, report) => sum + report.researchQueued, 0)).toBe(412);

    const priority = reports.find((report) => report.file.includes("PRIORITY_PAYMENT_SYSTEMS"))!;
    expect(priority.pricingModel).toBe("flat_rate");
    expect(priority.findings.filter((finding) => /\bQUAL DISC\b/.test(rowLabel(priority.analysis, finding.sourceFeeRowId!)))
      .every((finding) => finding.broaderEconomicCategory.value === "bundled_merchant_facing_pricing")).toBe(true);

    const qualificationFindings = reports.flatMap((report) => report.findings
      .filter((finding) => /\b(?:QUAL|MQUAL|NQUAL) DISC\b/.test(rowLabel(report.analysis, finding.sourceFeeRowId!))));
    expect(qualificationFindings.length).toBeGreaterThan(0);
    expect(qualificationFindings.every((finding) =>
      finding.broaderEconomicCategory.value !== "processor_markup_or_tier" &&
      finding.economicBeneficiary.value === null
    )).toBe(true);

    const salesDiscountFindings = reports.flatMap((report) => report.findings
      .filter((finding) => /\bSALES DISCOUNT\b/.test(rowLabel(report.analysis, finding.sourceFeeRowId!))));
    expect(salesDiscountFindings.length).toBeGreaterThan(0);
    expect(salesDiscountFindings.every((finding) =>
      finding.economicBeneficiary.value === null &&
      !/processor profit|processor margin|processor retention/i.test([
        finding.exactFeeIdentity.explanation,
        finding.broaderEconomicCategory.explanation,
        finding.practicalMerchantAction.explanation,
        finding.practicalMerchantAction.value,
      ].filter(Boolean).join(" "))
    )).toBe(true);

    const grossBasisFindings = findings.filter((finding) => finding.relevantPopulationOrBase.value === "gross_sales_before_refunds");
    expect(grossBasisFindings.length).toBeGreaterThan(0);
    expect(grossBasisFindings.every((finding) =>
      finding.unrecoveredCostOnRefundedVolume.state === "not_assessable" &&
      finding.unrecoveredCostOnRefundedVolume.value === null
    )).toBe(true);
  }, 45_000);
});

function deterministicPricing(
  document: ParsedDocument,
  file: string,
  businessType: BusinessTypeId,
  analysis: CanonicalStatementAnalysis,
): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const raw = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = raw?.pricingModel?.pricingModel;
  const accepted = ["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"];
  return {
    model: accepted.includes(model ?? "") ? model as InternalAnalystPricingModelInput["model"] : "unknown",
    confidence: raw?.pricingModel?.confidence === "high" ? "high" : raw?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function rowLabel(analysis: CanonicalStatementAnalysis, rowId: string): string {
  return analysis.feeLedger.rows.find((row) => row.id === rowId)?.selectedLabel ?? "";
}
