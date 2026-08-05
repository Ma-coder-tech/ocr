import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalCustomerReportProjection } from "../../src/canonical/customerReportProjection.js";
import {
  APPROVED_CUSTOMER_LIMITATION_COPY,
  canonicalProjectionLimitation,
} from "../../src/canonical/customerReportProjectionLimitations.js";
import type {
  CanonicalCustomerReportProjectionV1,
  CanonicalProjectionLimitationRecord,
} from "../../src/canonical/customerReportProjectionTypes.js";
import { validateCanonicalCustomerReportProjection } from "../../src/canonical/customerReportProjectionValidation.js";
import { provePackagesBEFinancialInvariance } from "../../src/evaluationIntegrity/invariance.js";
import type {
  CanonicalCustomerActionType,
  CanonicalFeeRow,
  CanonicalOpportunityComponent,
  CanonicalOpportunityKind,
  CanonicalOpportunityTarget,
  CanonicalStatementAnalysis,
} from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

const buildOptions = { purpose: "synthetic_fixture_validation_only" } as const;

describe("canonical customer projection safety", () => {
  it("hides only narrative when narrative content is unsafe", () => {
    const analysis = safeQualifiedAnalysis();
    analysis.customerState.explanation.sections[0]!.text = "Internal adapter response from GPT-5.2.";

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.explanation).toEqual({
      status: "hidden",
      source: "unavailable",
      sections: [],
      fallbackReasonCodes: ["explanation_content_unavailable"],
    });
    expect(projection.coreMetrics.status).toBe("shown");
    expect(projection.effectiveRate.status).toBe("shown");
    expect(projection.benchmark.status).toBe("shown");
    expect(projection.feeInventory.status).toBe("shown");
  });

  it("hides unsupported opportunity totals and actions only", () => {
    const analysis = safeQualifiedAnalysis();
    analysis.customerState.primaryState = "competitive_with_opportunity";
    analysis.customerState.axes.opportunityPosture = "eligible_opportunity";
    analysis.customerState.visibility.showDeterministicOpportunity = true;
    analysis.customerState.visibility.showActions = true;
    permit(analysis, "deterministic_opportunity");
    permit(analysis, "actions");

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.opportunities).toEqual({ status: "hidden", reasonCode: "eligible_opportunity_hidden" });
    expect(projection.actions).toEqual([]);
    expect(projection.visibility.actions).toBe("hidden");
    expect(projection.coreMetrics.status).toBe("shown");
    expect(projection.effectiveRate.status).toBe("shown");
    expect(projection.benchmark.status).toBe("shown");
  });

  it("limits only the fee section when fee reconciliation is incomplete", () => {
    const analysis = safeQualifiedAnalysis();
    analysis.feeLedger.status = "partial";

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.feeInventory.status).toBe("limited");
    if (projection.feeInventory.status === "limited") {
      expect(projection.feeInventory.totalVisibleAmount).toBeNull();
      expect(projection.feeInventory.limitationCodes).toEqual(["fee_reconciliation_incomplete"]);
    }
    expect(projection.coreMetrics.status).toBe("shown");
    expect(projection.effectiveRate.status).toBe("shown");
    expect(projection.benchmark.status).toBe("shown");
  });

  it("hides competitive, benchmark, and rate-opportunity conclusions when benchmark support is unavailable", () => {
    const analysis = safeAnalysis();

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.primaryState).toBe("verified_benchmark_unavailable");
    expect(projection.axes.ratePosition).toBe("unavailable");
    expect(projection.benchmark.status).toBe("unavailable");
    expect(`${projection.headline.title} ${projection.headline.body}`).not.toMatch(/competitive|above reference|below reference/i);
    expect(projection.effectiveRate.status).toBe("shown");
    expect(projection.coreMetrics.status).toBe("shown");
    expect(projection.limitations).toContainEqual({
      code: "benchmark_unavailable",
      ...APPROVED_CUSTOMER_LIMITATION_COPY.benchmark_unavailable,
      severity: "info",
      affectedSections: ["benchmark", "headline", "opportunities", "actions"],
    });
  });

  it("withholds the complete projection when a core fact is unsafe", () => {
    const analysis = safeQualifiedAnalysis();
    analysis.financialFacts.processedSales.status = "unavailable";
    analysis.financialFacts.processedSales.value = null;

    expect(() => buildCanonicalCustomerReportProjection(analysis, buildOptions)).toThrow(
      /canonical_customer_projection_withheld:.*core_facts_unsafe/,
    );
  });

  it("withholds the complete projection when core reconciliation is missing", () => {
    const analysis = safeQualifiedAnalysis();
    analysis.financialFacts.rateRevealCalculatedAllInRate.value = "0.040000";

    expect(() => buildCanonicalCustomerReportProjection(analysis, buildOptions)).toThrow(
      "canonical_customer_projection_withheld:core_reconciliation_missing",
    );
  });

  it("withholds the complete projection when identity contains internal details", () => {
    const analysis = safeQualifiedAnalysis();
    analysis.identity.processorName.value = "GPT-5.2 provider";

    expect(() => buildCanonicalCustomerReportProjection(analysis, buildOptions)).toThrow(
      /canonical_customer_projection_withheld:identity_unsafe/,
    );
  });

  it.each([
    ["Fiserv", "Fiserv"],
    ["Clover", "Clover"],
    ["Paysafe Payment Processing", "Fiserv-family processor"],
    ["Wells Fargo Merchant Services", "Fiserv-family processor"],
  ])("uses canonical Fiserv-family scope for supported processor brand %s", (visibleBrand, expectedDisplay) => {
    const analysis = safeQualifiedAnalysis();
    setProcessorIdentity(analysis, visibleBrand, "Fiserv / First Data");

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.statementSummary.processor).toBe(expectedDisplay);
  });

  it("fails closed for a parser-compatible processor outside Fiserv product scope", () => {
    const analysis = safeQualifiedAnalysis();
    setProcessorIdentity(analysis, "Nxgen Payment Services", "Nxgen / Vortax");

    expect(() => buildCanonicalCustomerReportProjection(analysis, buildOptions)).toThrow(
      /canonical_customer_projection_withheld:identity_unsafe/,
    );
  });

  it("never copies malicious processor text even when the family identity is supported", () => {
    const analysis = safeQualifiedAnalysis();
    setProcessorIdentity(analysis, "OpenAI provider response /private/tmp/statement.pdf", "Fiserv / First Data");

    expect(() => buildCanonicalCustomerReportProjection(analysis, buildOptions)).toThrow(
      /canonical_customer_projection_withheld:identity_unsafe/,
    );
  });

  it("maps customer-visible limitations and omits internal-only records", () => {
    const analysis = safeQualifiedAnalysis();
    const projection = buildCanonicalCustomerReportProjection(analysis, {
      ...buildOptions,
      limitationRecords: [
        canonicalProjectionLimitation("internal_runtime_detail"),
        canonicalProjectionLimitation("fee_reconciliation_incomplete", { unresolvedRowCount: 2 }),
      ],
    });

    expect(projection.limitations.map((item) => item.code)).toEqual(["fee_reconciliation_incomplete"]);
    expect(JSON.stringify(projection)).not.toContain("internal_runtime_detail");
    expect(projection.limitations[0]).toEqual({
      code: "fee_reconciliation_incomplete",
      ...APPROVED_CUSTOMER_LIMITATION_COPY.fee_reconciliation_incomplete,
      severity: "review",
      affectedSections: ["fee_inventory"],
    });
  });

  it("limits and omits a fee row whose label contains internal content", () => {
    const analysis = safeQualifiedAnalysis();
    analysis.feeLedger.rows = [feeRow("Provider model response /private/tmp/fee.pdf")];

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.feeInventory.status).toBe("limited");
    if (projection.feeInventory.status === "limited") {
      expect(projection.feeInventory.rows).toEqual([]);
      expect(projection.feeInventory.omittedRowCount).toBe(1);
      expect(projection.feeInventory.totalVisibleAmount).toBeNull();
      expect(projection.feeInventory.limitationCodes).toEqual(["fee_section_content_unsafe"]);
    }
    expect(JSON.stringify(projection)).not.toContain("/private/tmp/fee.pdf");
  });

  it("fails closed for an unknown limitation code", () => {
    const unknown = {
      ...canonicalProjectionLimitation("internal_runtime_detail"),
      code: "unregistered_limitation",
    } as unknown as CanonicalProjectionLimitationRecord;

    expect(() =>
      buildCanonicalCustomerReportProjection(safeQualifiedAnalysis(), {
        ...buildOptions,
        limitationRecords: [unknown],
      }),
    ).toThrow(/canonical_customer_projection_limitation_invalid:.*unknown_code/);
  });

  it("fails closed for malicious or unexpected limitation parameters", () => {
    const malicious = {
      ...canonicalProjectionLimitation("fee_reconciliation_incomplete"),
      parameters: { details: "OpenAI prompt response at /private/tmp/report.pdf" },
    } as unknown as CanonicalProjectionLimitationRecord;

    expect(() =>
      buildCanonicalCustomerReportProjection(safeQualifiedAnalysis(), {
        ...buildOptions,
        limitationRecords: [malicious],
      }),
    ).toThrow(/canonical_customer_projection_limitation_invalid:.*(unexpected_parameter|unsafe_parameter)/);
  });

  it.each([
    "Provider OpenAI returned a response.",
    "Model GPT-5.2 generated this text.",
    "The prompt response was accepted.",
    "Read /private/tmp/private-statement.pdf.",
    `Hash ${"a".repeat(64)} was accepted.`,
  ])("keeps provider, model, prompt, path, and hash leakage out of the DTO: %s", (unsafeText) => {
    const analysis = safeQualifiedAnalysis();
    analysis.customerState.explanation.sections[0]!.text = unsafeText;

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.explanation.status).toBe("hidden");
    expect(JSON.stringify(projection)).not.toContain(unsafeText);
    expect(validateCanonicalCustomerReportProjection(projection).status).toBe("valid");
  });

  it("keeps independently safe core metrics visible across multiple section limitations", () => {
    const analysis = safeAnalysis();
    analysis.feeLedger.status = "partial";
    analysis.customerState.explanation.sections[0]!.text = "Package G harness policy detail.";
    analysis.customerState.visibility.showDeterministicOpportunity = true;
    analysis.customerState.visibility.showActions = true;
    permit(analysis, "deterministic_opportunity");
    permit(analysis, "actions");

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.coreMetrics.status).toBe("shown");
    expect(projection.effectiveRate.status).toBe("shown");
    expect(projection.feeInventory.status).toBe("limited");
    expect(projection.benchmark.status).toBe("unavailable");
    expect(projection.opportunities.status).toBe("hidden");
    expect(projection.actions).toEqual([]);
    expect(projection.explanation.status).toBe("hidden");
    expect(projection.limitations.map((item) => item.code).sort()).toEqual([
      "benchmark_unavailable",
      "fee_reconciliation_incomplete",
      "opportunity_support_unavailable",
    ]);
  });

  it("hides independently safe core metrics when their own permission is denied", () => {
    const analysis = safeQualifiedAnalysis();
    deny(analysis, "core_metrics");

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.coreMetrics).toEqual({ status: "hidden", reasonCode: "core_metrics_hidden" });
    expect(projection.effectiveRate.status).toBe("shown");
    expect(projection.benchmark.status).toBe("shown");
  });

  it("does not project a supported opportunity from a denied eligibility class", () => {
    const analysis = safeQualifiedAnalysis();
    installSupportedOpportunity(analysis);
    deny(analysis, "deterministic_opportunity");

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.opportunities).toEqual({ status: "hidden", reasonCode: "eligible_opportunity_hidden" });
    expect(JSON.stringify(projection)).not.toContain("preview-opportunity-1");
  });

  it("projects a fully supported zero-removal opportunity with removal language and action", () => {
    const analysis = safeQualifiedAnalysis();
    installSupportedOpportunity(analysis, { kind: "fee_removal", actionType: "request_removal" });

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.opportunities.status).toBe("shown");
    if (projection.opportunities.status === "shown") {
      expect(projection.opportunities.items[0]).toMatchObject({
        removabilityLevel: "conditionally_removable",
        supportedAction: "request_removal",
      });
    }
    expect(projection.actions).toHaveLength(1);
    expect(projection.actions[0]).toMatchObject({ type: "request_removal", targetDisplayIds: ["preview-opportunity-1"] });
  });

  it.each([
    ["cadence is unproven", (analysis: CanonicalStatementAnalysis, component: CanonicalOpportunityComponent) => {
      component.cadence.proven = false;
      component.cadence.proof = "not_proven";
    }],
    ["annualization is not allowed", (_analysis: CanonicalStatementAnalysis, component: CanonicalOpportunityComponent) => {
      component.cadence.annualizationAllowed = false;
    }],
    ["calculation is not annualized", (_analysis: CanonicalStatementAnalysis, component: CanonicalOpportunityComponent) => {
      component.calculation.annualized = false;
    }],
    ["target is none", (_analysis: CanonicalStatementAnalysis, component: CanonicalOpportunityComponent) => {
      component.target = { type: "none", reason: "No approved target.", aiSourced: false };
    }],
    ["opportunity approval is false", (_analysis: CanonicalStatementAnalysis, component: CanonicalOpportunityComponent) => {
      component.targetProvenance.opportunityApproved = false;
    }],
    ["deterministic target authority is false", (_analysis: CanonicalStatementAnalysis, component: CanonicalOpportunityComponent) => {
      component.targetProvenance.authoritativeForDeterministic = false;
    }],
    ["an evidence reference does not exist", (_analysis: CanonicalStatementAnalysis, component: CanonicalOpportunityComponent) => {
      component.calculation.evidenceRefs = ["missing_evidence"];
    }],
    ["an exclusion reason remains", (_analysis: CanonicalStatementAnalysis, component: CanonicalOpportunityComponent) => {
      component.exclusionReasonCodes = ["publication_conflict"];
    }],
    ["classification has an unresolved conflict", (analysis: CanonicalStatementAnalysis) => {
      analysis.feeOwnershipActionability.rowClassifications[0]!.conflictStatus = "unresolved";
      analysis.feeOwnershipActionability.rowClassifications[0]!.conflictReason = "Synthetic unresolved conflict.";
    }],
    ["selected classification documentation is blocking", (analysis: CanonicalStatementAnalysis) => {
      analysis.feeOwnershipActionability.rowClassifications[0]!.selected.documentationRequirement = "blocking";
    }],
  ] as const)("withholds opportunity dollars and actions when %s", (_label, mutate) => {
    const analysis = safeQualifiedAnalysis();
    const component = installSupportedOpportunity(analysis, { actionType: "request_removal" });
    mutate(analysis, component);

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.opportunities).toEqual({ status: "hidden", reasonCode: "eligible_opportunity_hidden" });
    expect(projection.actions).toEqual([]);
  });

  it.each([
    "required_for_authority",
    "required_for_savings",
  ] as const)("withholds opportunity publication when selected classification documentation is %s", (requirement) => {
    const analysis = safeQualifiedAnalysis();
    installSupportedOpportunity(analysis, { actionType: "request_removal" });
    analysis.feeOwnershipActionability.rowClassifications[0]!.selected.documentationRequirement = requirement;

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.opportunities).toEqual({ status: "hidden", reasonCode: "eligible_opportunity_hidden" });
    expect("deterministicAmount" in projection.opportunities).toBe(false);
    expect("estimatedAmount" in projection.opportunities).toBe(false);
    expect(projection.actions).toEqual([]);
    expect(projection.coreMetrics.status).toBe("shown");
  });

  it.each([
    "required_for_authority",
    "required_for_savings",
  ] as const)("withholds opportunity publication when selected candidate documentation is %s", (requirement) => {
    const analysis = safeQualifiedAnalysis();
    installSupportedOpportunity(analysis, { actionType: "request_removal" });
    analysis.feeOwnershipActionability.rowClassifications[0]!.candidates[0]!.documentationRequirement = requirement;

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.opportunities).toEqual({ status: "hidden", reasonCode: "eligible_opportunity_hidden" });
    expect("deterministicAmount" in projection.opportunities).toBe(false);
    expect("estimatedAmount" in projection.opportunities).toBe(false);
    expect(projection.actions).toEqual([]);
    expect(projection.coreMetrics.status).toBe("shown");
  });

  it.each([
    ["required_for_authority", "request_removal", "fee_removal", undefined],
    ["required_for_savings", "request_removal", "fee_removal", undefined],
    ["required_for_authority", "request_repricing", "rate_repricing", supportedRateTarget()],
    ["required_for_savings", "request_repricing", "rate_repricing", supportedRateTarget()],
  ] as const)("omits a strong action when documentation is %s: %s", (requirement, actionType, kind, target) => {
    const analysis = safeQualifiedAnalysis();
    installSupportedOpportunity(analysis, { actionType, kind, target });
    analysis.customerState.actionGuidance[0]!.documentationRequirement = requirement;

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.opportunities.status).toBe("shown");
    if (projection.opportunities.status === "shown") {
      expect(projection.opportunities.deterministicAmount).toEqual({ amountMinor: 1200, currency: "USD" });
      expect(projection.opportunities.items).toHaveLength(1);
    }
    expect(projection.actions).toEqual([]);
    expect(projection.coreMetrics.status).toBe("shown");
  });

  it("allows recommended documentation only when the complete publication proof remains present", () => {
    const analysis = safeQualifiedAnalysis();
    installSupportedOpportunity(analysis, { actionType: "request_removal" });
    const classification = analysis.feeOwnershipActionability.rowClassifications[0]!;
    classification.selected.documentationRequirement = "recommended";
    classification.candidates[0]!.documentationRequirement = "recommended";
    analysis.customerState.actionGuidance[0]!.documentationRequirement = "recommended";

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.opportunities.status).toBe("shown");
    expect(projection.actions[0]?.type).toBe("request_removal");
  });

  it("does not map fee-row review to a removable monetary opportunity", () => {
    const analysis = safeQualifiedAnalysis();
    installSupportedOpportunity(analysis, { kind: "fee_row_review", actionType: "request_removal" });

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.opportunities).toEqual({ status: "hidden", reasonCode: "eligible_opportunity_hidden" });
    expect(projection.actions).toEqual([]);
  });

  it("maps supported per-item repricing to negotiability, never removability", () => {
    const analysis = safeQualifiedAnalysis();
    installSupportedOpportunity(analysis, {
      kind: "per_item_repricing",
      target: {
        type: "per_item",
        amount: { amountMinor: 5, currency: "USD" },
        unit: "per_transaction",
        populationRef: "synthetic_transaction_population",
        aiSourced: false,
      },
      actionType: "request_repricing",
    });

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.opportunities.status).toBe("shown");
    if (projection.opportunities.status === "shown") {
      expect(projection.opportunities.items[0]).toMatchObject({
        removabilityLevel: "potentially_negotiable",
        supportedAction: "request_repricing",
      });
    }
    expect(projection.actions[0]?.type).toBe("request_repricing");
  });

  it("maps supported rate repricing to negotiability and an exact repricing action", () => {
    const analysis = safeQualifiedAnalysis();
    installSupportedOpportunity(analysis, {
      kind: "rate_repricing",
      target: {
        type: "rate",
        rate: "0.020000",
        representation: "decimal_fraction",
        populationRef: "processed_sales",
        aiSourced: false,
      },
      actionType: "request_repricing",
    });

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.opportunities.status).toBe("shown");
    if (projection.opportunities.status === "shown") {
      expect(projection.opportunities.items[0]).toMatchObject({
        removabilityLevel: "potentially_negotiable",
        supportedAction: "request_repricing",
      });
    }
    expect(projection.actions[0]?.type).toBe("request_repricing");
  });

  it("rejects an action stronger than the admitted component permits", () => {
    const analysis = safeQualifiedAnalysis();
    installSupportedOpportunity(analysis, {
      kind: "per_item_repricing",
      target: {
        type: "per_item",
        amount: { amountMinor: 5, currency: "USD" },
        unit: "per_transaction",
        populationRef: "synthetic_transaction_population",
        aiSourced: false,
      },
      actionType: "request_removal",
    });

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.opportunities.status).toBe("shown");
    expect(projection.actions).toEqual([]);
  });

  it("does not copy raw internal limitation strings into any customer field", () => {
    const analysis = safeQualifiedAnalysis();
    analysis.customerState.limitations = ["Package G canonical harness policy details."];
    analysis.feeLedger.limitations = ["Package C adapter implementation path /private/tmp/fees.pdf."];
    analysis.opportunityEngine.limitations = ["Report V1 legacy provider prompt response."];

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);
    const { reportVersion: protectedContractMarker, ...customerFields } = projection;
    const serialized = JSON.stringify(customerFields);

    expect(protectedContractMarker).toBe("canonical_customer_report_projection_v1");
    expect(serialized).not.toMatch(/Package [B-G]|canonical|harness|policy|adapter|implementation|\/private\/tmp|Report V1|legacy|provider|prompt|response/i);
    expect(validateCanonicalCustomerReportProjection(projection).status).toBe("valid");
  });

  it("strictly rejects unmapped limitations and internal strings in an otherwise valid DTO", () => {
    const projection = buildCanonicalCustomerReportProjection(safeQualifiedAnalysis(), buildOptions);
    const unmapped = {
      ...projection,
      limitations: [
        {
          code: "review_note",
          title: "Review note",
          body: "A generic note.",
          severity: "info",
          affectedSections: ["fee_inventory"],
        },
      ],
    } as unknown as CanonicalCustomerReportProjectionV1;
    expect(validateCanonicalCustomerReportProjection(unmapped).errors).toContain("unmapped_customer_limitation");

    const internal = structuredClone(projection);
    internal.methodology.guidance = ["Internal adapter implementation detail."];
    expect(validateCanonicalCustomerReportProjection(internal).errors).toContain(
      "unsafe_content_projection.methodology.guidance[]",
    );
  });

  it("does not mutate canonical analysis or Package B-E hashes", () => {
    const analysis = safeQualifiedAnalysis();
    const before = structuredClone(analysis);

    const projection = buildCanonicalCustomerReportProjection(analysis, buildOptions);

    expect(projection.reportVersion).toBe("canonical_customer_report_projection_v1");
    expect(analysis).toEqual(before);
    const invariance = provePackagesBEFinancialInvariance(before, analysis);
    expect(invariance.invariant).toBe(true);
    expect(invariance.mismatchPaths).toEqual([]);
    expect(invariance.packages.map((item) => item.package)).toEqual(["package_b", "package_c", "package_d", "package_e"]);
    expect(invariance.packages.every((item) => item.beforeHash === item.afterHash)).toBe(true);
  });
});

function safeQualifiedAnalysis(): CanonicalStatementAnalysis {
  const analysis = safeAnalysis();
  analysis.customerState.primaryState = "competitive_no_opportunity";
  analysis.customerState.axes.ratePosition = "within_reference";
  analysis.customerState.rateComparison = {
    ...analysis.customerState.rateComparison,
    status: "qualified",
    position: "within_reference",
    reasonCodes: ["comparison_supported"],
  };
  analysis.customerState.visibility.showBenchmark = true;
  permit(analysis, "benchmark");
  return analysis;
}

function safeAnalysis(): CanonicalStatementAnalysis {
  const analysis = buildCanonicalStatementFactsFromParsedDocument(syntheticStatement(), {
    sourceFileName: "synthetic-projection-safety.pdf",
    businessType: "restaurant_food_beverage",
  });
  const evidenceRef = analysis.evidence[0]!.id;
  analysis.identity.processorName = {
    ...analysis.identity.processorName,
    value: "Fiserv",
    status: "selected",
    confidence: "high",
    evidenceRefs: [evidenceRef],
    limitations: [],
  };
  analysis.identity.processorFamily = {
    ...analysis.identity.processorFamily,
    value: "Fiserv / First Data",
    status: "selected",
    confidence: "high",
    evidenceRefs: [evidenceRef],
    limitations: [],
  };
  analysis.identity.statementPeriod = {
    ...analysis.identity.statementPeriod,
    value: { start: "2026-01-01", end: "2026-01-31" },
    status: "selected",
    confidence: "high",
    evidenceRefs: [evidenceRef],
    limitations: [],
  };
  analysis.feeLedger.status = "available";
  analysis.feeLedger.uniqueChargeTotal = structuredClone(analysis.financialFacts.totalFees.value);
  analysis.feeLedger.controls = [];
  analysis.feeLedger.rows = [];
  analysis.customerState.axes = {
    analysisReadiness: "verified",
    dataIntegrity: "reconciled",
    ratePosition: "unavailable",
    opportunityPosture: "none",
    explanationReadiness: "deterministic_fallback",
  };
  analysis.customerState.primaryState = "verified_benchmark_unavailable";
  analysis.customerState.visibility = {
    ...analysis.customerState.visibility,
    showCoreMetrics: true,
    showEffectiveRate: true,
    showBenchmark: false,
    showFeeInventory: true,
    showOwnershipActionability: false,
    showDeterministicOpportunity: false,
    showEstimatedOpportunity: false,
    showVerificationAmounts: false,
    showEvidenceCalculations: false,
    showActions: false,
    showCustomerExplanation: true,
  };
  permit(analysis, "core_metrics");
  permit(analysis, "effective_rate");
  deny(analysis, "benchmark");
  permit(analysis, "fee_inventory");
  permit(analysis, "customer_explanation");
  analysis.customerState.explanation = {
    ...analysis.customerState.explanation,
    source: "deterministic_fallback",
    prohibitedLanguageCheck: "passed",
    sections: [
      {
        kind: "summary",
        text: "Verified statement details are available.",
        factRefs: ["financialFacts.processedSales"],
        evidenceRefs: [evidenceRef],
      },
    ],
  };
  return analysis;
}

function permit(analysis: CanonicalStatementAnalysis, key: CanonicalStatementAnalysis["customerState"]["permissions"][number]["key"]): void {
  const permission = analysis.customerState.permissions.find((item) => item.key === key)!;
  permission.permitted = true;
  permission.reasonCodes = ["section_permitted"];
  permission.limitationCodes = [];
}

function deny(analysis: CanonicalStatementAnalysis, key: CanonicalStatementAnalysis["customerState"]["permissions"][number]["key"]): void {
  const permission = analysis.customerState.permissions.find((item) => item.key === key)!;
  permission.permitted = false;
  permission.reasonCodes = ["section_unavailable"];
  permission.limitationCodes = ["section_unavailable"];
}

function feeRow(label: string): CanonicalFeeRow {
  return {
    id: "fee_row_projection_safety",
    role: "individual_charge",
    sourceOccurrenceIds: [],
    parserInterpretationIds: [],
    selectedLabel: label,
    selectedAmount: { amountMinor: 1000, currency: "USD" },
    signedAmount: { amountMinor: -1000, currency: "USD" },
    contributesToUniqueTotal: true,
    contributionDecision: {
      contributes: true,
      reasonCode: "individual_charge_included",
      controlRefs: [],
      evidenceRefs: [],
      signedAmountBasis: "fee_charge_magnitude",
      grossNetBasis: "fee_charge_gross",
      confidence: "high",
      limitations: [],
    },
    mergeReason: null,
    mergeConfidence: "high",
    rejectedAmountCandidates: [],
    limitations: [],
  };
}

function setProcessorIdentity(analysis: CanonicalStatementAnalysis, visibleBrand: string, processorFamily: string): void {
  analysis.identity.processorName.value = visibleBrand;
  analysis.identity.processorFamily.value = processorFamily;
}

function supportedRateTarget(): Extract<CanonicalOpportunityTarget, { type: "rate" }> {
  return {
    type: "rate",
    rate: "0.020000",
    representation: "decimal_fraction",
    populationRef: "processed_sales",
    aiSourced: false,
  };
}

function installSupportedOpportunity(
  analysis: CanonicalStatementAnalysis,
  options: {
    kind?: CanonicalOpportunityKind;
    target?: CanonicalOpportunityTarget;
    actionType?: CanonicalCustomerActionType;
  } = {},
): CanonicalOpportunityComponent {
  const evidenceRef = analysis.evidence[0]!.id;
  const row = feeRow("Monthly service fee");
  const candidateId = "classification_projection_safety";
  const componentId = "opportunity_projection_safety";
  const calculationRef = "calculation_projection_safety";
  const ownership = {
    collector: "processor" as const,
    economicBeneficiary: "processor" as const,
    contractualController: "processor" as const,
  };
  row.sourceOccurrenceIds = [evidenceRef];
  row.contributionDecision.evidenceRefs = [evidenceRef];
  analysis.feeLedger.rows = [row];
  analysis.feeOwnershipActionability.rowClassifications = [
    {
      feeRowId: row.id,
      selected: {
        candidateId,
        category: "service_fee",
        ownership,
        actionabilityCeiling: "potentially_actionable",
        documentationRequirement: "none",
        confidence: "high",
        selectionReason: "Synthetic deterministic classification proof.",
        rejectedCandidateIds: [],
      },
      candidates: [
        {
          id: candidateId,
          feeRowId: row.id,
          category: "service_fee",
          ownership,
          actionabilityCeiling: "potentially_actionable",
          documentationRequirement: "none",
          confidence: "high",
          sourceType: "deterministic_rule",
          ruleId: "projection_safety_rule",
          ruleVersion: "1.0.0",
          ruleProvenance: "Synthetic fixture registry.",
          evidenceRefs: [evidenceRef],
          reference: null,
          authoritative: true,
          reason: "Synthetic deterministic classification proof.",
          permissionConsequences: ["deterministic_opportunity"],
          limitations: [],
        },
      ],
      conflictStatus: "none",
      conflictReason: null,
    },
  ];
  analysis.calculations.push({
    id: calculationRef,
    formulaCode: "opportunity_monthly_delta_times_12",
    formulaVersion: "canonical_opportunity_formula_v1",
    inputs: [
      {
        label: "Observed recurring charge",
        value: { amountMinor: 100, currency: "USD" },
        unit: "money",
        evidenceRefs: [evidenceRef],
      },
    ],
    result: { amountMinor: 1200, currency: "USD" },
    unit: "money",
    roundingPolicy: "money_minor_units_usd_v1",
  });
  const component: CanonicalOpportunityComponent = {
    id: componentId,
    policyVersion: "canonical_opportunity_engine_v1",
    kind: options.kind ?? "fee_removal",
    eligibility: "deterministic",
    inclusionStatus: "included",
    feeRowRefs: [{ feeRowId: row.id, role: "base", classificationCandidateId: candidateId }],
    ownership,
    actionabilityCeiling: "potentially_actionable",
    observedAmount: {
      amount: { amountMinor: 100, currency: "USD" },
      source: "canonical_fee_row",
      evidenceRefs: [evidenceRef],
      aiSourced: false,
    },
    target: options.target ?? {
      type: "zero_removal",
      removalCondition: "Written confirmation supports removing the charge.",
      proofEvidenceRefs: [evidenceRef],
      aiSourced: false,
    },
    targetProvenance: {
      sourceType: "written_processor_confirmation",
      referenceId: "synthetic-pricing-confirmation",
      version: "1.0.0",
      policyOwner: null,
      reviewer: "synthetic-reviewer",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      applicableProcessor: "Fiserv / First Data",
      applicableBusinessType: "restaurant_food_beverage",
      applicableChannel: null,
      applicableCardEnvironment: null,
      methodology: "Written pricing confirmation.",
      limitations: [],
      opportunityApproved: true,
      authoritativeForDeterministic: true,
      approvedForEstimate: false,
      evidenceRefs: [evidenceRef],
      aiSourced: false,
    },
    cadence: {
      value: "monthly",
      proven: true,
      annualizationAllowed: true,
      frequencyPerYear: 12,
      proof: "contract",
      evidenceRefs: [evidenceRef],
      reason: "The synthetic agreement proves a monthly cadence.",
      aiSourced: false,
    },
    calculation: {
      calculationRef,
      formulaCode: "opportunity_monthly_delta_times_12",
      formulaVersion: "canonical_opportunity_formula_v1",
      inputRefs: [row.id],
      result: { amountMinor: 1200, currency: "USD" },
      resultUnit: "money",
      annualized: true,
      evidenceRefs: [evidenceRef],
      aiSourced: false,
    },
    overlap: {
      aggregationKey: "projection_safety_fee_row",
      exclusiveGroupKey: null,
      supersedesComponentIds: [],
      supersededByComponentId: null,
      overlapsWithComponentIds: [],
      resolution: "none",
      reason: null,
    },
    confidence: "high",
    inclusionReasonCodes: ["approved_package_e_input"],
    exclusionReasonCodes: [],
    evidenceRefs: [evidenceRef],
    limitations: [],
  };
  analysis.opportunityEngine.components = [component];
  analysis.customerState.primaryState = "competitive_with_opportunity";
  analysis.customerState.axes.opportunityPosture = "eligible_opportunity";
  analysis.customerState.visibility.showDeterministicOpportunity = true;
  analysis.customerState.visibility.showActions = options.actionType !== undefined;
  permit(analysis, "deterministic_opportunity");
  if (options.actionType) {
    permit(analysis, "actions");
    analysis.customerState.actionGuidance = [
      {
        id: "action_projection_safety",
        policyVersion: "canonical_customer_action_guidance_v1",
        actionType: options.actionType,
        feeRowRefs: [row.id],
        classificationCandidateRefs: [candidateId],
        opportunityComponentRefs: [componentId],
        verificationComponentRefs: [],
        evidenceRefs: [evidenceRef],
        calculationRefs: [calculationRef],
        documentationRequirement: "none",
        confidence: "high",
        limitationCodes: [],
        reasonCodes: ["supported_action"],
      },
    ];
  }
  return component;
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
      reasons: ["Synthetic projection safety fixture."],
      lineCount: lines.length,
      amountTokenCount: lines.length,
      hasExtractableText: true,
    },
  };
}
