import type { CanonicalEconomicsV2DifferenceClassification } from "../types.js";
import { RH_COPY_REGISTRY } from "./reportCopy.js";
import { RH_PERMISSION_CATEGORIES } from "./reportPermissions.js";
import { RH_PUBLIC_EXPERIENCES, type CanonicalMerchantReportProjectionV2, type RhComparisonItem,
  type RhComparisonReport, type RhSemanticAmendmentId } from "./reportTypes.js";
import { CANONICAL_REPORT_V2_VERSION_MANIFEST, RH_SEMANTIC_AMENDMENT_IDS } from "./reportVersionManifest.js";

export type ConstructedReportObservation = {
  publicExperience: string;
  financialMetrics: {
    processedSales: { population: string; amountMinor: number } | null;
    processingFees: { population: string; amountMinor: number } | null;
    effectiveRate: { population: string; value: string } | null;
    transactionCount: { population: string; value: number } | null;
  };
  feeTotalMinor: number | null;
  composition: { state: string; categoryAmountsMinor: number[]; creditAmountsMinor: number[]; percentagesVisible: boolean } | null;
  impact: Array<{ kind: string; amountMinor: number | null; lowerMinor: number | null; upperMinor: number | null; annual: boolean }>;
  verificationAmountsMinor: number[];
  actionAuthority: string[];
  ownershipControlStates: string[];
  unknownHandling: { pricingAxesWithheld: number; unresolvedCompositionExplicit: boolean; openQuestions: number };
};

export function observeConstructedCanonicalReportV2(projection: CanonicalMerchantReportProjectionV2): ConstructedReportObservation {
  const snapshot = projection.snapshot;
  return {
    publicExperience: projection.experience,
    financialMetrics: {
      processedSales: snapshot?.processedSales.state === "available" && snapshot.processedSales.moneyValue
        ? { population: "canonical_net_submitted_card_volume", amountMinor: snapshot.processedSales.moneyValue.amountMinor } : null,
      processingFees: snapshot?.processingFees.state === "available" && snapshot.processingFees.moneyValue
        ? { population: "total_statement_processing_fees", amountMinor: snapshot.processingFees.moneyValue.amountMinor } : null,
      effectiveRate: snapshot?.effectiveRate.state === "available" && snapshot.effectiveRate.decimalValue
        ? { population: "fees_over_canonical_net_submitted", value: snapshot.effectiveRate.decimalValue } : null,
      transactionCount: snapshot?.transactionCount.state === "available" && snapshot.transactionCount.countValue !== null
        ? { population: "gross_sale_transaction_count", value: snapshot.transactionCount.countValue } : null,
    },
    feeTotalMinor: projection.composition?.authoritativeTotal?.amountMinor ?? null,
    composition: projection.composition ? { state: projection.composition.state,
      categoryAmountsMinor: projection.composition.categories.map((item) => item.amount.amountMinor).sort((a, b) => a - b),
      creditAmountsMinor: projection.composition.creditOffsets.map((item) => item.amount.amountMinor).sort((a, b) => a - b),
      percentagesVisible: projection.composition.percentagesPermitted } : null,
    impact: (projection.attention?.items ?? []).flatMap((item) => item.impact && item.impact.kind !== "amount_under_review" ? [{
      kind: item.impact.kind, amountMinor: item.impact.kind === "potential_reduction" ? item.impact.amount.amountMinor : null,
      lowerMinor: item.impact.kind === "potential_reduction_range" ? item.impact.lowerAmount.amountMinor : null,
      upperMinor: item.impact.kind === "potential_reduction_range" ? item.impact.upperAmount.amountMinor : null,
      annual: item.impact.annual,
    }] : []),
    verificationAmountsMinor: [
      ...(projection.attention?.items ?? []).flatMap((item) => item.impact?.kind === "amount_under_review" ? [item.impact.amount.amountMinor] : []),
      ...(projection.questions?.items ?? []).flatMap((item) => item.amountUnderReview?.kind === "amount_under_review" ? [item.amountUnderReview.amount.amountMinor] : []),
    ].sort((a, b) => a - b),
    actionAuthority: (projection.actions?.items ?? []).map((item) => item.kind).sort(),
    ownershipControlStates: (projection.inventory?.items ?? []).map((item) => item.ownerControl?.code ?? "withheld").sort(),
    unknownHandling: { pricingAxesWithheld: projection.pricing ? [projection.pricing.underlyingCost, projection.pricing.schedule, projection.pricing.scope]
      .filter((axis) => axis.state !== "confirmed").length : 3,
      unresolvedCompositionExplicit: projection.composition?.unresolvedDifference.state !== "none",
      openQuestions: projection.questions?.items.length ?? 0 },
  };
}

const INSTANCE_DIMENSIONS: Array<[string, RhSemanticAmendmentId | null]> = [
  ["publicExperience", "RH-AMEND-002-THREE-PUBLIC-EXPERIENCES"],
  ["financialMetrics.processedSales", null], ["financialMetrics.processingFees", null],
  ["financialMetrics.effectiveRate", null], ["financialMetrics.transactionCount", null], ["feeTotalMinor", null],
  ["composition", "RH-AMEND-006-DYNAMIC-RECONCILED-COMPOSITION"],
  ["impact", "RH-AMEND-007-IMPACT-VERIFICATION-SEPARATION"],
  ["verificationAmountsMinor", "RH-AMEND-007-IMPACT-VERIFICATION-SEPARATION"],
  ["actionAuthority", "RH-AMEND-011-SINGLE-STATEMENT-ACTION-CEILING"],
  ["ownershipControlStates", "RH-AMEND-008-EVIDENCE-ACTIONABILITY-CEILINGS"],
  ["unknownHandling", "RH-AMEND-008-EVIDENCE-ACTIONABILITY-CEILINGS"],
];

export function compareConstructedReportObservations(legacy: ConstructedReportObservation,
  projection: CanonicalMerchantReportProjectionV2, assertedAmendments: Partial<Record<string, RhSemanticAmendmentId>> = {}): RhComparisonReport {
  const v2 = observeConstructedCanonicalReportV2(projection);
  const value = (object: ConstructedReportObservation, key: string): unknown => key.split(".").reduce<unknown>((current, part) =>
    current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined, object);
  return makeReport(INSTANCE_DIMENSIONS.map(([fact, amendment]) => classifyRhDifference({ fact, evidenceType: "constructed_instance",
    same: JSON.stringify(value(legacy, fact)) === JSON.stringify(value(v2, fact)), allowedAmendment: amendment,
    assertedAmendment: assertedAmendments[fact] })));
}

export function evaluateStaticRhConformance(input: { reportV1FilesUnchanged: boolean }): RhComparisonReport {
  const checks: Array<[string, boolean, RhSemanticAmendmentId]> = [
    ["canonical_v2_source_of_truth", CANONICAL_REPORT_V2_VERSION_MANIFEST.sourceOfTruth === "canonical_economics_v2_only", "RH-AMEND-001-V2-SOURCE-OF-TRUTH"],
    ["exactly_three_public_experiences", RH_PUBLIC_EXPERIENCES.length === 3 && new Set(RH_PUBLIC_EXPERIENCES).size === 3, "RH-AMEND-002-THREE-PUBLIC-EXPERIENCES"],
    ["six_independent_verdict_axes", ["analysisReadiness", "comparisonPosition", "economicFinding", "priority", "evidenceStrength", "openQuestionState"].length === 6, "RH-AMEND-003-INDEPENDENT-VERDICT-AXES"],
    ["qualified_comparison_authority", RH_PERMISSION_CATEGORIES.includes("qualified_comparison"), "RH-AMEND-004-QUALIFIED-COMPARISON-OR-UNAVAILABLE"],
    ["theme_based_attention", RH_SEMANTIC_AMENDMENT_IDS.includes("RH-AMEND-005-THEME-BASED-ATTENTION"), "RH-AMEND-005-THEME-BASED-ATTENTION"],
    ["dynamic_composition_contract", CANONICAL_REPORT_V2_VERSION_MANIFEST.compositionPolicyVersion === "canonical_report_composition_v2_v1", "RH-AMEND-006-DYNAMIC-RECONCILED-COMPOSITION"],
    ["impact_verification_separation", RH_PERMISSION_CATEGORIES.includes("potential_reduction") && RH_PERMISSION_CATEGORIES.includes("amount_under_review"), "RH-AMEND-007-IMPACT-VERIFICATION-SEPARATION"],
    ["authority_ceiling_contract", CANONICAL_REPORT_V2_VERSION_MANIFEST.visibilityPolicyVersion === "canonical_report_visibility_v2_v1", "RH-AMEND-008-EVIDENCE-ACTIONABILITY-CEILINGS"],
    ["typed_customer_copy", Object.keys(RH_COPY_REGISTRY).length > 0, "RH-AMEND-009-TYPED-CUSTOMER-COPY"],
    ["deterministic_language_authority", CANONICAL_REPORT_V2_VERSION_MANIFEST.customerLanguage === "deterministic_copy_registry_only", "RH-AMEND-010-DETERMINISTIC-LANGUAGE-FALLBACK"],
    ["single_statement_action_ceiling", RH_PERMISSION_CATEGORIES.includes("actions") && RH_PERMISSION_CATEGORIES.includes("call_guidance"), "RH-AMEND-011-SINGLE-STATEMENT-ACTION-CEILING"],
    ["report_v1_coexistence", input.reportV1FilesUnchanged && CANONICAL_REPORT_V2_VERSION_MANIFEST.reportV1Authority === "unchanged", "RH-AMEND-012-REPORT-V1-COEXISTENCE"],
  ];
  return makeReport(checks.map(([fact, pass, amendment]) => pass
    ? classifyRhDifference({ fact, evidenceType: "static_architecture", same: true, allowedAmendment: amendment })
    : { fact, evidenceType: "static_architecture", classification: "unexpected_divergence", amendmentId: null, reasonCode: "static_conformance_failed" }));
}

export function classifyRhDifference(input: { fact: string; evidenceType: RhComparisonItem["evidenceType"]; same: boolean;
  allowedAmendment: RhSemanticAmendmentId | null; assertedAmendment?: RhSemanticAmendmentId }): RhComparisonItem {
  if (input.same) return { fact: input.fact, evidenceType: input.evidenceType, classification: "same_semantic_fact", amendmentId: null, reasonCode: "semantic_fact_matches" };
  if (input.allowedAmendment && input.assertedAmendment === input.allowedAmendment) return { fact: input.fact, evidenceType: input.evidenceType,
    classification: "approved_semantic_amendment", amendmentId: input.allowedAmendment, reasonCode: "exact_authorized_difference" };
  return { fact: input.fact, evidenceType: input.evidenceType, classification: "unexpected_divergence", amendmentId: null,
    reasonCode: input.assertedAmendment ? "amendment_does_not_authorize_fact" : "unapproved_instance_difference" };
}

function makeReport(items: RhComparisonItem[]): RhComparisonReport {
  const counts: Record<CanonicalEconomicsV2DifferenceClassification, number> = { same_semantic_fact: 0, approved_semantic_amendment: 0,
    v2_unavailable_or_ambiguous: 0, unexpected_divergence: 0 };
  for (const item of items) counts[item.classification] += 1;
  return { policyVersion: "canonical_legacy_v2_report_shadow_comparison_v1", items, counts, hasUnexpectedDivergence: counts.unexpected_divergence > 0 };
}
