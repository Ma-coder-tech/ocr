import { describe, expect, it } from "vitest";
import {
  CANONICAL_REPORT_V2_VERSION_MANIFEST,
  RH_PUBLIC_EXPERIENCES,
  RH_SEMANTIC_AMENDMENT_IDS,
  assertValidCanonicalMerchantReportProjectionV2,
  buildCanonicalMerchantReportProjectionV2,
  createRhPrivacySafeDiagnostics,
  composeCanonicalMerchantReportV2,
  validateCanonicalMerchantReportProjectionV2,
} from "../../../../src/canonical/v2/index.js";
import { completedSynthesis, rhProjection, rhSynthesis, unableSynthesis, zeroVolumeSynthesis } from "./reportFixtures.js";

describe("Canonical Merchant Report Projection V2", () => {
  it("publishes the shadow-only manifest and exactly twelve approved amendments", () => {
    expect(CANONICAL_REPORT_V2_VERSION_MANIFEST).toMatchObject({
      authority: "shadow_non_authoritative", persistence: "none", sourceOfTruth: "canonical_economics_v2_only",
      customerLanguage: "deterministic_copy_registry_only", externalCitations: "disabled", reportV1Authority: "unchanged",
      runtimeIntegration: "none",
    });
    expect(RH_SEMANTIC_AMENDMENT_IDS).toHaveLength(12);
    expect(new Set(RH_SEMANTIC_AMENDMENT_IDS).size).toBe(12);
  });

  it("composes a validated report from a real accepted-V2 synthesis without runtime integration", () => {
    const result = composeCanonicalMerchantReportV2({ synthesisAnalysis: rhSynthesis() });
    expect(result.audit.validation.status).toBe("valid");
    expect(result.projection).toMatchObject({ authority: "shadow_non_authoritative", persistence: "none", sourceOfTruth: "canonical_economics_v2_only" });
  });

  it("implements exactly three public experiences while keeping verdict axes independent", () => {
    expect(RH_PUBLIC_EXPERIENCES).toEqual(["unable_to_complete", "analysis_with_open_questions", "analysis_completed"]);
    const unable = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: unableSynthesis() }).projection;
    const open = rhProjection().projection;
    const completed = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: completedSynthesis() }).projection;
    expect([unable.experience, open.experience, completed.experience]).toEqual(RH_PUBLIC_EXPERIENCES);
    expect(completed.verdict.axes).toMatchObject({ analysisReadiness: "completed", comparisonPosition: "comparison_unavailable", openQuestionState: "none" });
    expect(unable.verdict.axes.economicFinding).toBe("unavailable");
  });

  it("shows only safe recovery content when foundational reporting is unsafe", () => {
    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: unableSynthesis() }).projection;
    expect(report.experience).toBe("unable_to_complete");
    expect(report.recovery).not.toBeNull();
    expect(report.snapshot).toBeNull();
    expect(report.composition).toBeNull();
    expect(report.attention).toBeNull();
    expect(report.inventory).toBeNull();
    expect(report.continuation).toBeNull();
    assertValidCanonicalMerchantReportProjectionV2(report);
  });

  it("keeps zero-volume effective rate explicitly undefined and never emits numeric zero", () => {
    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: zeroVolumeSynthesis() }).projection;
    expect(report.snapshot?.effectiveRate).toMatchObject({ state: "undefined", decimalValue: null, moneyValue: null, countValue: null });
    expect(report.permissions.effective_rate).toMatchObject({ state: "limited", reasonCode: "canonical_metric_undefined" });
  });

  it("uses only approved RB snapshot populations and leaves missing counts unavailable", () => {
    const synthesis = rhSynthesis();
    synthesis.economicAnalysis.pricingAnalysis.foundation.financialPopulations.grossSaleTransactionCount.status = "unavailable";
    synthesis.economicAnalysis.pricingAnalysis.foundation.financialPopulations.grossSaleTransactionCount.value = null;
    synthesis.economicAnalysis.pricingAnalysis.foundation.metrics.headlineAverageTicket.state = "unavailable_denominator";
    synthesis.economicAnalysis.pricingAnalysis.foundation.metrics.headlineAverageTicket.value = null;
    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: synthesis }).projection;
    expect(report.snapshot?.processedSales.label.code).toBe("processed_sales");
    expect(report.snapshot?.transactionCount).toMatchObject({ state: "unavailable", countValue: null });
    expect(report.snapshot?.averageTicket).toMatchObject({ state: "unavailable", moneyValue: null });
  });

  it("keeps comparison unavailable without a qualified canonical comparison", () => {
    const report = rhProjection().projection;
    expect(report.verdict.axes.comparisonPosition).toBe("comparison_unavailable");
    expect(report.permissions.qualified_comparison).toMatchObject({ state: "limited", reasonCode: "qualified_comparison_missing" });
    expect(JSON.stringify(report)).not.toMatch(/above market|healthy|benchmark gap/i);
  });

  it("uses RC axes independently and withholds only the unresolved axis", () => {
    const synthesis = rhSynthesis();
    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: synthesis }).projection;
    expect(report.pricing?.status).toBe("supported");
    expect(report.pricing?.underlyingCost.value?.code).toBe("pricing_cost_bundled");
    synthesis.economicAnalysis.pricingAnalysis.pricingArchitecture.scopeUniformity.status = "available";
    synthesis.economicAnalysis.pricingAnalysis.pricingArchitecture.scopeUniformity.value = "unresolved";
    synthesis.economicAnalysis.pricingAnalysis.pricingArchitecture.scopeUniformity.derivabilityTier = "unresolved";
    const unresolved = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: synthesis }).projection;
    expect(unresolved.pricing).toMatchObject({
      status: "partially_supported",
      underlyingCost: { state: "confirmed" }, schedule: { state: "confirmed" }, scope: { state: "unresolved", value: null },
    });
  });

  it("never promotes non-null unknown and unresolved RC sentinels to confirmed pricing", () => {
    const synthesis = rhSynthesis();
    const architecture = synthesis.economicAnalysis.pricingAnalysis.pricingArchitecture;
    architecture.underlyingCostBillingMode.value = "unknown";
    architecture.underlyingCostBillingMode.derivabilityTier = "unresolved";
    architecture.merchantPriceScheduleShape.value = "unknown";
    architecture.merchantPriceScheduleShape.derivabilityTier = "unresolved";
    architecture.scopeUniformity.value = "unresolved";
    architecture.scopeUniformity.derivabilityTier = "unresolved";

    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: synthesis }).projection;
    expect(report.pricing).toMatchObject({
      status: "not_confirmed",
      underlyingCost: { state: "unknown", value: null },
      schedule: { state: "unknown", value: null },
      scope: { state: "unresolved", value: null },
    });
    expect(report.permissions.pricing).toMatchObject({ state: "limited", reasonCode: "pricing_unresolved" });
    expect(JSON.stringify(report.pricing)).not.toContain("pricing_axis_confirmed");
  });

  it("projects proven no-active-processing as not applicable rather than confirmed", () => {
    const synthesis = rhSynthesis();
    const architecture = synthesis.economicAnalysis.pricingAnalysis.pricingArchitecture;
    architecture.underlyingCostBillingMode.value = "no_active_processing";
    architecture.merchantPriceScheduleShape.value = "no_active_processing";
    architecture.scopeUniformity.value = "no_active_processing";

    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: synthesis }).projection;
    expect(report.pricing).toMatchObject({
      status: "not_confirmed",
      underlyingCost: { state: "not_applicable", value: { code: "pricing_no_active" } },
      schedule: { state: "not_applicable", value: { code: "pricing_no_active" } },
      scope: { state: "not_applicable", value: { code: "pricing_no_active" } },
    });
  });

  it("keeps unavailable RC axes distinct from unknown and unresolved axes", () => {
    const synthesis = rhSynthesis();
    const architecture = synthesis.economicAnalysis.pricingAnalysis.pricingArchitecture;
    architecture.underlyingCostBillingMode.status = "unavailable";
    architecture.underlyingCostBillingMode.value = null;
    architecture.merchantPriceScheduleShape.value = "unknown";
    architecture.scopeUniformity.value = "unresolved";

    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: synthesis }).projection;
    expect(report.pricing).toMatchObject({
      underlyingCost: { state: "unavailable" }, schedule: { state: "unknown" }, scope: { state: "unresolved" },
    });
  });

  it("renders dynamic RD composition and signed credits without forcing zero categories", () => {
    const report = rhProjection().projection;
    expect(report.composition?.state).toBe("reconciled");
    expect(report.composition?.categories.map((item) => item.code)).toEqual(["services_admin", "operational_penalty"]);
    expect(report.composition?.creditOffsets).toHaveLength(1);
    expect(report.composition?.creditOffsets[0]?.amount.amountMinor).toBe(-100);
    expect(report.composition?.categories.reduce((sum, item) => sum + item.amount.amountMinor, 0)).toBe(4600);
    expect(report.composition?.authoritativeTotal?.amountMinor).toBe(4500);
    expect(report.composition?.categories.some((item) => item.amount.amountMinor === 0)).toBe(false);
  });

  it("withholds percentages when the cost stack is financially unreconciled", () => {
    const synthesis = rhSynthesis();
    synthesis.economicAnalysis.economicLayer.costStack.completeness = "financially_unreconciled";
    synthesis.economicAnalysis.economicLayer.costStack.reconciliationDeltaMinor = 25;
    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: synthesis }).projection;
    expect(report.composition).toMatchObject({ state: "unreconciled", percentagesPermitted: false });
    expect(report.composition?.categories.every((item) => item.percentageOfPositiveCosts === null)).toBe(true);
    expect(report.composition?.unresolvedDifference).toMatchObject({ state: "known", amount: { amountMinor: 25 } });
    expect(report.permissions.composition).toMatchObject({ state: "limited", reasonCode: "cost_stack_unreconciled" });
    expect(report.permissions.partial_composition.state).toBe("limited");
    expect(report.permissions.composition_percentages.state).toBe("denied");
  });

  it("fails empty synthesis coverage closed without inventing health, routine, or zero opportunity", () => {
    const synthesis = completedSynthesis();
    synthesis.synthesisLayer.themes = [];
    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: synthesis }).projection;
    expect(report.experience).toBe("analysis_with_open_questions");
    expect(report.verdict.axes).toMatchObject({ economicFinding: "unresolved_material_items", priority: "review", evidenceStrength: "unresolved" });
    expect(report.questions?.items.some((item) => item.uncertain.code === "question_synthesis_coverage")).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/healthy|zero opportunity|no issues/i);
  });

  it("does not permit annual impact for an unrelated annual counterfactual", () => {
    const synthesis = rhSynthesis();
    const unrelated = structuredClone(synthesis.synthesisLayer.counterfactuals[0]!);
    unrelated.id = "synthesis-counterfactual-unlinked";
    unrelated.annualized = true; unrelated.recurrenceProven = true; unrelated.cadenceEvidenceRefs = [unrelated.evidenceRefs[0]!];
    unrelated.cadenceClaimRef = unrelated.targetClaimRef;
    synthesis.synthesisLayer.counterfactuals.push(unrelated);
    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: synthesis }).projection;
    expect(report.attention?.items.some((item) => item.impact?.annual)).toBe(false);
    expect(report.permissions.annual_impact.state).toBe("denied");
  });

  it("refuses duplicate economic contributors instead of displaying them twice", () => {
    const synthesis = rhSynthesis();
    const charges = synthesis.economicAnalysis.economicLayer.charges.filter((item) => item.contributingOccurrenceRef);
    charges[1]!.contributingOccurrenceRef = charges[0]!.contributingOccurrenceRef;
    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: synthesis }).projection;
    expect(report.experience).toBe("unable_to_complete");
    expect(report.inventory).toBeNull();
  });

  it("projects RD charges once with completeness wording and no raw statement labels", () => {
    const report = rhProjection().projection;
    expect(report.inventory?.completeness).toBe("complete");
    expect(report.inventory?.items).toHaveLength(3);
    expect(new Set(report.inventory?.items.map((item) => item.itemId)).size).toBe(3);
    expect(JSON.stringify(report.inventory)).not.toContain("Statement fee | $");
    expect(report.inventory?.items.find((item) => item.direction === "credit")?.amount.amountMinor).toBeLessThan(0);
  });

  it("builds Merchant Attention only from RE themes and preserves eligible impact boundaries", () => {
    const synthesis = rhSynthesis();
    const report = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: synthesis }).projection;
    expect(report.attention?.items.length).toBe(synthesis.synthesisLayer.themes.filter((item) => item.materiality !== "unresolved").length);
    const impact = report.attention?.items.flatMap((item) => item.impact ? [item.impact] : [])[0];
    expect(impact).toMatchObject({ kind: "potential_reduction", annual: false });
    expect(JSON.stringify(report)).not.toMatch(/guaranteed savings|expected savings|overcharge|money you will save|recoverable amount/i);
    expect(report).not.toHaveProperty("opportunityTotal");
  });

  it("projects RF conflicts into typed questions and ignores RG language candidates", () => {
    const candidate = {
      itemId: "candidate-1", themeRef: "private-theme-ref", text: "Provider wording must not appear", deterministicFallbackText: "fallback",
      factRefs: [], driverRefs: [], leverRefs: [], limitationCodes: [], actionabilityCode: "review", uncertaintyState: "unresolved" as const,
      claimClasses: ["uncertainty_preserved" as const], source: "provider_candidate" as const,
      authority: "non_authoritative_candidate" as const, customerVisible: false as const, reportPermission: "none" as const,
      validation: "accepted" as const,
    };
    const result = rhProjection({ knowledgeConflicts: [{ state: "conflicting", materiality: "material" }], rgLanguageCandidates: [candidate] });
    expect(result.projection.questions?.items.some((item) => item.uncertain.code === "question_knowledge_conflict")).toBe(true);
    expect(result.audit).toMatchObject({ ignoredRgLanguageCandidateCount: 1, knowledgeConflictCount: 1 });
    expect(JSON.stringify(result.projection)).not.toContain(candidate.text);
    expect(result.projection.verdict.axes.openQuestionState).toBe("material");
  });

  it("keeps Action Toolkit educational, theme/lever-traced, and destination-valid", () => {
    const { projection, audit } = rhProjection();
    expect(projection.actions?.items.length).toBeGreaterThan(0);
    for (const action of projection.actions?.items ?? []) {
      expect(projection.attention?.items.some((item) => item.itemId === action.targetId)).toBe(true);
      expect(audit.entries.find((item) => item.reportItemRef === action.itemId)?.canonicalRefs.length).toBeGreaterThan(1);
    }
    expect(JSON.stringify(projection.actions)).not.toMatch(/remove this fee|demand|cancel|overcharg|entitled|guaranteed/i);
  });

  it("shows Compare other months only on useful reports and does not promise resolution", () => {
    const open = rhProjection().projection;
    const completed = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: completedSynthesis() }).projection;
    const unable = buildCanonicalMerchantReportProjectionV2({ synthesisAnalysis: unableSynthesis() }).projection;
    expect(open.continuation?.action.code).toBe("compare_months_cta");
    expect(completed.continuation).not.toBeNull();
    expect(unable.continuation).toBeNull();
    expect(open.continuation?.body.text).toMatch(/not required/i);
  });

  it("strictly rejects unknown DTO keys, altered copy, unsafe paths, and external links", () => {
    const report = structuredClone(rhProjection().projection) as typeof rhProjection extends never ? never : any;
    report.savingsTotal = { amountMinor: 1, currency: "USD" };
    report.verdict.title.text = "Changed provider copy";
    report.header.merchantDisplayName = "/Users/private/merchant.pdf";
    report.methodology.items.push({ code: "method_no_external_links", text: "See https://example.com" });
    const result = validateCanonicalMerchantReportProjectionV2(report);
    expect(result.errors).toEqual(expect.arrayContaining([
      "report:unknown_key:savingsTotal", "verdict.title:copy_text_mismatch", "report.header.merchantDisplayName:unsafe_string",
    ]));
    expect(result.errors.some((item) => item.includes("unsafe_string"))).toBe(true);
  });

  it("fails closed on invented enums, malformed IDs, duplicate IDs, and DTO member domains", () => {
    const report = structuredClone(rhProjection().projection) as any;
    report.verdict.axes.priority = "urgent";
    report.permissions.pricing.state = "visible";
    report.pricing.scope.state = "guessed";
    report.attention.items[0].itemId = "account-id/private.pdf";
    report.actions.items[0].itemId = report.inventory.items[0].itemId;
    report.actions.items[0].kind = "cancel_processor";
    report.attention.items[0].evidence[0].kind = "raw_excerpt";
    expect(validateCanonicalMerchantReportProjectionV2(report).errors).toEqual(expect.arrayContaining([
      "verdict.axes.priority:invalid_enum", "permissions.pricing.state:invalid_enum", "pricing.scope.state:invalid_enum",
      "attention.items[0].itemId:invalid_public_id", "actions.items[0].itemId:duplicate_public_id",
      "actions.items[0].kind:invalid_enum", "attention.items[0].evidence[0].kind:invalid_enum",
    ]));
  });

  it("emits privacy-safe diagnostics with no identity, amounts, refs, providers, or copy", () => {
    const report = rhProjection({ customerSafeIdentity: { sameAccountIdentityProven: true, customerDisplaySafe: true,
      merchantDisplayName: "Safe Merchant", processorDisplayName: "Safe Processor" } }).projection;
    const diagnostics = createRhPrivacySafeDiagnostics(report);
    const serialized = JSON.stringify(diagnostics);
    expect(diagnostics.validationStatus).toBe("valid");
    expect(serialized).not.toMatch(/Safe Merchant|Safe Processor|amountMinor|canonicalRefs|provider|candidate/i);
  });
});
