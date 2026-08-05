import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalCustomerReportProjection } from "../../src/canonical/customerReportProjection.js";
import { validateCanonicalCustomerReportProjection } from "../../src/canonical/customerReportProjectionValidation.js";
import { provePackagesBEFinancialInvariance } from "../../src/evaluationIntegrity/invariance.js";
import type { CanonicalCustomerReportProjectionV1, CustomerMoney, CustomerSyntheticSource } from "../../src/canonical/customerReportProjectionTypes.js";
import type { ParsedDocument } from "../../src/parser.js";

const usd = (amountMinor: number): CustomerMoney => ({ amountMinor, currency: "USD" });
const syntheticSource = (title = "Example processor pricing addendum", safeUrl: string | null = "https://example.com/synthetic-pricing-addendum"): CustomerSyntheticSource => ({
  synthetic: true,
  title,
  effectiveDate: "2026-04-01",
  safeUrl,
});

function baseProjection(overrides: Partial<CanonicalCustomerReportProjectionV1> = {}): CanonicalCustomerReportProjectionV1 {
  const permissions = Object.fromEntries(
    [
      "core_metrics",
      "effective_rate",
      "benchmark",
      "fee_inventory",
      "ownership_actionability",
      "deterministic_opportunity",
      "estimated_opportunity",
      "verification_amounts",
      "evidence_calculations",
      "actions",
      "customer_explanation",
      "ai_enhanced_narrative",
    ].map((key) => [key, { permitted: !["deterministic_opportunity", "estimated_opportunity", "verification_amounts", "actions", "ai_enhanced_narrative"].includes(key), reasonCodes: [`${key}_reason`] }]),
  ) as CanonicalCustomerReportProjectionV1["permissions"];

  return {
    reportVersion: "canonical_customer_report_projection_v1",
    projectionReadiness: "non_production_not_merchant_ready",
    source: "synthetic_fixture",
    displayId: "preview-valid",
    primaryState: "verified_benchmark_unavailable",
    axes: {
      analysisReadiness: "verified",
      dataIntegrity: "reconciled",
      ratePosition: "unavailable",
      opportunityPosture: "none",
      explanationReadiness: "deterministic_fallback",
    },
    permissions,
    visibility: {
      coreMetrics: "shown",
      effectiveRate: "shown",
      benchmark: "unavailable",
      feeInventory: "shown",
      opportunities: "none",
      verificationItems: "none",
      actions: "hidden",
      explanation: "shown",
    },
    headline: {
      title: "Verified totals, comparison unavailable",
      body: "The statement totals are usable, but a rate comparison is not available yet.",
      tone: "neutral",
      reasonCodes: ["benchmark_unavailable"],
    },
    statementSummary: {
      processor: "Sample processor",
      statementPeriod: "January 2026",
      businessType: "Retail",
    },
    coreMetrics: {
      status: "shown",
      processedVolume: usd(10000000),
      totalFees: usd(250000),
      transactionCount: { status: "shown", count: { value: 2500, population: "settled_transactions" } },
      averageTicket: { status: "shown", amount: usd(4000) },
    },
    effectiveRate: {
      status: "shown",
      rate: { basisPoints: 250, displayBasis: "calculated_effective_rate" },
      basisLabel: "All-in fees divided by verified processing volume",
      limitationCodes: [],
    },
    benchmark: {
      status: "unavailable",
      reasonCode: "rate_comparison_unavailable",
      customerMessage: "A rate comparison is not available for this statement yet.",
    },
    feeInventory: {
      status: "shown",
      totalVisibleAmount: usd(250000),
      omittedRowCount: 0,
      limitationCodes: [],
      rows: [
        {
          displayId: "preview-fee-1",
          label: "Processor service fee",
          amount: usd(1995),
          role: "charge",
          feeOwner: "processor",
          customerCategory: "processor",
          actionability: "may_be_actionable",
          removabilityLevel: "conditionally_removable",
          evidenceStatus: "supported_by_synthetic_source",
          source: syntheticSource(),
          conditions: ["Removal depends on written processor terms or confirmation."],
          status: "included",
          limitationCodes: [],
        },
      ],
    },
    opportunities: { status: "none", reasonCode: "no_eligible_opportunity_found" },
    verificationItems: { status: "none", reasonCode: "no_verification_amounts" },
    limitations: [],
    actions: [],
    explanation: {
      status: "shown",
      source: "deterministic_fallback",
      sections: [{ title: "Verified from your statement", body: "The visible totals come from statement facts that passed the review checks." }],
      fallbackReasonCodes: ["deterministic_fallback_available"],
    },
    methodology: {
      dataQuality: "verified",
      guidance: ["Amounts shown here come from visible statement facts and safe comparison rules."],
      docsToGather: ["Processor agreement"],
    },
    ...overrides,
  };
}

describe("canonical customer report projection validation", () => {
  it("accepts a browser-safe projection DTO", () => {
    expect(validateCanonicalCustomerReportProjection(baseProjection())).toEqual({ status: "valid", errors: [] });
  });

  it("keeps hidden, none, and unavailable opportunity states structurally distinct", () => {
    const hidden = baseProjection({
      primaryState: "analysis_limited",
      axes: { analysisReadiness: "limited", dataIntegrity: "partially_reconciled", ratePosition: "unavailable", opportunityPosture: "unavailable", explanationReadiness: "deterministic_fallback" },
      visibility: { ...baseProjection().visibility, opportunities: "hidden" },
      opportunities: { status: "hidden", reasonCode: "eligible_opportunity_hidden" },
    });
    expect(validateCanonicalCustomerReportProjection(hidden).status).toBe("valid");

    const unsafeZero = {
      ...hidden,
      opportunities: { status: "shown", deterministicAmount: usd(0), estimatedAmount: null, items: [], limitationCodes: [] },
    };
    expect(validateCanonicalCustomerReportProjection(unsafeZero).errors).toContain("opportunity_visible_in_hidden_state");
  });

  it("requires transaction and average-ticket values to reconstruct", () => {
    expect(validateCanonicalCustomerReportProjection(baseProjection()).status).toBe("valid");

    const mismatch = baseProjection({
      coreMetrics: {
        status: "shown",
        processedVolume: usd(10000000),
        totalFees: usd(250000),
        transactionCount: { status: "shown", count: { value: 2500, population: "settled_transactions" } },
        averageTicket: { status: "shown", amount: usd(3999) },
      },
    });
    expect(validateCanonicalCustomerReportProjection(mismatch).errors).toContain("average_ticket_does_not_reconstruct");

    const unsafeUnavailableReason = baseProjection({
      coreMetrics: {
        status: "shown",
        processedVolume: usd(10000000),
        totalFees: usd(250000),
        transactionCount: { status: "unavailable", reasonCode: "review_pending" },
        averageTicket: { status: "unavailable", reasonCode: "average_ticket_unavailable_without_safe_transaction_count" },
      },
    });
    expect(validateCanonicalCustomerReportProjection(unsafeUnavailableReason).errors).toContain("transaction_count_unavailable_without_reason");
  });

  it("rejects benchmark conclusions, competitive copy, and no-opportunity claims when not allowed", () => {
    const unsafe = baseProjection({
      permissions: { ...baseProjection().permissions, benchmark: { permitted: false, reasonCodes: ["benchmark_hidden"] } },
      benchmark: { status: "shown", position: "within_reference", rangeLabel: "Range", methodologyLabel: "Method", limitationCodes: [] },
      headline: { title: "Rates look competitive", body: "No opportunity here.", tone: "positive", reasonCodes: ["unsafe"] },
    });
    const result = validateCanonicalCustomerReportProjection(unsafe);
    expect(result.errors).toContain("hidden_benchmark_conclusion");
    expect(result.errors).toContain("benchmark_without_permission");
    expect(result.errors).toContain("competitive_language_without_competitive_state");
  });

  it("rejects strong actions without permission and supported visible opportunities", () => {
    const unsafe = baseProjection({
      actions: [
        {
          displayId: "preview-action-1",
          type: "request_removal",
          label: "Ask about removal",
          body: "Ask whether this charge can be removed.",
          targetDisplayIds: ["preview-fee-1"],
          reasonCodes: ["unsupported"],
        },
      ],
    });
    const result = validateCanonicalCustomerReportProjection(unsafe);
    expect(result.errors).toContain("actions_without_permission");
    expect(result.errors).toContain("strong_action_without_opportunity");
  });

  it("keeps verification amounts separate from savings", () => {
    const verification = baseProjection({
      primaryState: "verification_needed",
      axes: { analysisReadiness: "verified", dataIntegrity: "reconciled", ratePosition: "unavailable", opportunityPosture: "verification_only", explanationReadiness: "deterministic_fallback" },
      permissions: { ...baseProjection().permissions, verification_amounts: { permitted: true, reasonCodes: ["verification_amount_visible"] } },
      visibility: { ...baseProjection().visibility, verificationItems: "shown" },
      verificationItems: {
        status: "shown",
        observedAmount: usd(2500),
        label: "Amount to verify",
        notSavingsCopy: "This is not treated as savings until documentation supports it.",
        items: [
          {
            displayId: "preview-verification-1",
            title: "Fee needs documentation",
            observedAmount: usd(2500),
            evidenceStatus: "needs_verification",
            source: syntheticSource("Example processor statement notice", "https://example.com/synthetic-statement-notice"),
            conditions: ["Request documentation before treating this amount as savings."],
            reasonCodes: ["documentation_needed"],
          },
        ],
        limitationCodes: [],
      },
    });
    expect(validateCanonicalCustomerReportProjection(verification).status).toBe("valid");

    const mislabeled = { ...verification, verificationItems: { ...verification.verificationItems, notSavingsCopy: "This is savings." } };
    expect(validateCanonicalCustomerReportProjection(mislabeled).errors).toContain("verification_not_separated_from_savings");
  });

  it("rejects AI narrative when permission is absent", () => {
    const unsafe = baseProjection({
      explanation: {
        status: "shown",
        source: "ai_enhanced",
        sections: [{ title: "Summary", body: "Safe synthetic text." }],
        fallbackReasonCodes: [],
      },
    });
    expect(validateCanonicalCustomerReportProjection(unsafe).errors).toContain("ai_narrative_without_permission");
  });

  it("rejects unsafe source metadata and unsafe internal wording", () => {
    const unsafeSource = baseProjection({
      feeInventory: {
        status: "shown",
        totalVisibleAmount: usd(250000),
        omittedRowCount: 0,
        limitationCodes: [],
        rows: [
          {
            displayId: "preview-fee-1",
            label: "Processor service fee",
            amount: usd(1995),
            role: "charge",
            feeOwner: "processor",
            customerCategory: "processor",
            actionability: "may_be_actionable",
            removabilityLevel: "conditionally_removable",
            evidenceStatus: "supported_by_synthetic_source",
            source: syntheticSource("Processor pricing addendum", "https://unsafe.example.test/private-file.pdf"),
            conditions: ["Removal depends on written processor terms or confirmation."],
            status: "included",
            limitationCodes: [],
          },
        ],
      },
      methodology: { dataQuality: "verified", guidance: ["How this view was prepared by the canonical pipeline."], docsToGather: ["Processor agreement"] },
    });
    const result = validateCanonicalCustomerReportProjection(unsafeSource);
    expect(result.errors).toContain("source_title_not_synthetic");
    expect(result.errors).toContain("source_url_not_safe");
    expect(result.errors.some((error) => error.includes("unsafe_content_projection.methodology.guidance"))).toBe(true);
  });

  it("does not allow verification-only rows or amounts to masquerade as opportunity", () => {
    const unsafe = baseProjection({
      feeInventory: {
        status: "shown",
        totalVisibleAmount: usd(250000),
        omittedRowCount: 0,
        limitationCodes: [],
        rows: [
          {
            displayId: "preview-fee-verify",
            label: "Service fee needs review",
            amount: usd(2500),
            role: "charge",
            feeOwner: "third_party",
            customerCategory: "third_party",
            actionability: "verify_only",
            removabilityLevel: "needs_verification",
            evidenceStatus: "needs_verification",
            source: syntheticSource("Example service-fee terms", null),
            conditions: ["Ask whether this service is active."],
            status: "included",
            limitationCodes: ["documentation_needed"],
          },
        ],
      },
    });
    expect(validateCanonicalCustomerReportProjection(unsafe).errors).toContain("verification_fee_marked_included");
  });

  it("recursively rejects unknown, sensitive, private, and internal fields", () => {
    const unsafe = {
      ...baseProjection(),
      merchantName: "Hidden merchant",
      limitations: [
        {
          code: "unsafe",
          title: "Provider error",
          body: "Prompt response contained raw statement text from /private/tmp/file.pdf",
          severity: "blocked",
        },
      ],
    };
    const result = validateCanonicalCustomerReportProjection(unsafe);
    expect(result.errors).toContain("unknown_field_projection.merchantName");
    expect(result.errors.some((error) => error.startsWith("unsafe_key_projection.merchantName"))).toBe(true);
    expect(result.errors.some((error) => error.includes("unsafe_content_projection.limitations"))).toBe(true);
  });

  it("requires the exact non-production projection readiness marker", () => {
    const missing = { ...baseProjection() } as Record<string, unknown>;
    delete missing.projectionReadiness;
    expect(validateCanonicalCustomerReportProjection(missing).errors).toContain("unsupported_projection_readiness");

    const wrong = { ...baseProjection(), projectionReadiness: "merchant_ready" };
    expect(validateCanonicalCustomerReportProjection(wrong).errors).toContain("unsupported_projection_readiness");
  });

  it("requires an explicit synthetic-fixture purpose and withholds unsafe identity before returning a DTO", () => {
    const analysis = syntheticCanonicalAnalysis();

    expect(() => (buildCanonicalCustomerReportProjection as unknown as (value: unknown) => unknown)(analysis)).toThrow(
      "canonical_customer_projection_synthetic_fixture_purpose_required",
    );
    expect(() =>
      buildCanonicalCustomerReportProjection(analysis, { purpose: "synthetic_fixture_validation_only" }),
    ).toThrow("canonical_customer_projection_withheld:identity_unsafe");
  });

  it("does not mutate canonical analysis or Package B-E hashes when projection fails closed", () => {
    const analysis = syntheticCanonicalAnalysis();
    const before = structuredClone(analysis);

    expect(() =>
      buildCanonicalCustomerReportProjection(analysis, { purpose: "synthetic_fixture_validation_only" }),
    ).toThrow(/canonical_customer_projection_withheld/);

    expect(analysis).toEqual(before);
    const invariance = provePackagesBEFinancialInvariance(before, analysis);
    expect(invariance.invariant).toBe(true);
    expect(invariance.mismatchPaths).toEqual([]);
    expect(invariance.packages.map((item) => item.package)).toEqual(["package_b", "package_c", "package_d", "package_e"]);
    for (const item of invariance.packages) {
      expect(item.invariant).toBe(true);
      expect(item.beforeHash).toBe(item.afterHash);
    }
  });
});

function syntheticCanonicalAnalysis() {
  return buildCanonicalStatementFactsFromParsedDocument(syntheticStatement(), {
    sourceFileName: "synthetic-projection-prerequisite.pdf",
    businessType: "restaurant_food_beverage",
  });
}

function syntheticStatement(): ParsedDocument {
  const lines = [
    "Merchant: Synthetic Projection Cafe",
    "Processor: Fiserv",
    "Statement Period: 01/01/2026 - 01/31/2026",
    "Total Amount Submitted | $1,000.00",
    "Fees Charged | -$30.00",
    "Monthly Service Fee | -$10.00",
  ];
  return {
    sourceType: "pdf",
    headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: {
      mode: "structured",
      qualityScore: 1,
      reasons: ["Synthetic projection prerequisite fixture."],
      lineCount: lines.length,
      amountTokenCount: lines.length,
      hasExtractableText: true,
    },
  };
}
