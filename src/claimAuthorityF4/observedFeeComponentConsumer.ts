import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "../canonical/types.js";
import { processorMarkupRule } from "../claimAuthorityF2/rules.js";
import { tryEvaluateF4Shadow, type F4ShadowDecision } from "./shadow.js";
import {
  compareMerchantAttentionMarkupShadow,
  type MerchantAttentionMarkupShadowComparison,
} from "./merchantAttentionShadowComparison.js";
import {
  buildPackageECustomerStateAuthorityReadBoundary,
  type PackageECustomerStateAuthorityReadBoundary,
  unavailablePackageECustomerStateAuthorityReadBoundary,
} from "./packageECustomerStateAuthorityReadBoundary.js";

/** Internal semantic state. It grants no ownership, pricing, actionability, or customer permission. */
export type InternalObservedFeeComponents = {
  version: "observed_fee_component_internal_v1";
  standing: "internal_only";
  status: "available" | "unavailable";
  sourceReportId: string | null;
  rows: Array<{
    feeRowId: string;
    claimId: string | null;
    status: "supported" | "unknown";
    reasonCodes: string[];
  }>;
  legacyComparison: {
    includedAndSupported: number;
    includedButUnknown: number;
    excludedAndSupported: number;
    excludedAndUnknown: number;
  };
};

/** A Package D selection is comparison data; only the F4 decision has semantic authority here. */
export type InternalProcessorMarkupSemantics = {
  version: "processor_markup_internal_semantics_v1";
  standing: "internal_only";
  semanticAuthority: "claim_authority_f4";
  status: "available" | "unavailable";
  sourceReportId: string | null;
  rows: Array<{
    feeRowId: string;
    legacySelectedCategory: "processor_markup";
    legacyCandidateId: string;
    claimId: string | null;
    status: "supported" | "refused" | "unknown";
    reasonCodes: string[];
  }>;
  comparison: { legacySelected: number; supported: number; refused: number; unknown: number };
};

export type InternalFeeSemantics = {
  observedFeeComponents: InternalObservedFeeComponents;
  processorMarkup: InternalProcessorMarkupSemantics;
  merchantAttentionMarkupShadow: MerchantAttentionMarkupShadowComparison;
  packageECustomerStateAuthorityReadBoundary: PackageECustomerStateAuthorityReadBoundary;
};

export function processorMarkupStatusFromF4(decision: F4ShadowDecision | undefined):
  { status: "supported" | "refused" | "unknown"; reasonCodes: string[] } {
  if (!decision) return { status: "unknown", reasonCodes: ["f4_markup_decision_missing_or_ambiguous"] };
  if (decision.semanticCode !== "processor_markup" || decision.dimension !== "economic_broad_category"
    || decision.subject !== "fee_row") {
    return { status: "unknown", reasonCodes: ["f4_markup_decision_mismatch"] };
  }
  if (decision.status === "refused") return { status: "refused", reasonCodes: [...decision.reasonCodes] };
  if (decision.status === "unknown") return { status: "unknown", reasonCodes: [...decision.reasonCodes] };
  const requiredLaneAlternative = processorMarkupRule.laneAlternatives.some((lanes) =>
    lanes.every((lane) => decision.satisfiedLanes.includes(lane)));
  if (decision.f1ClaimId === null
    || !requiredLaneAlternative || decision.missingGates.length > 0 || decision.missingFacets.length > 0
    || !decision.reasonCodes.includes("frozen_rule_requirements_met")) {
    return { status: "unknown", reasonCodes: ["internal_markup_authority_incomplete"] };
  }
  return { status: "supported", reasonCodes: [...decision.reasonCodes] };
}

function positiveComponentBoundary(analysis: CanonicalStatementAnalysis, row: CanonicalFeeRow): boolean {
  if (!row.contributesToUniqueTotal || !row.contributionDecision.contributes
    || (row.selectedAmount?.amountMinor ?? 0) <= 0) return false;
  if (!((row.role === "individual_charge" && row.contributionDecision.reasonCode === "individual_charge_included")
    || (row.role === "interchange_detail_row" && row.contributionDecision.reasonCode === "pass_through_fee_charge_included")))
    return false;
  if (row.sourceOccurrenceIds.length === 0) return false;
  return row.sourceOccurrenceIds.every((id) => {
    const occurrence = analysis.feeLedger.sourceOccurrences.find((item) => item.id === id);
    return occurrence !== undefined && occurrence.pageNumber !== null
      && analysis.evidence.some((record) => record.id === occurrence.evidenceRef
        && record.documentId === occurrence.documentId && record.pageNumber === occurrence.pageNumber);
  });
}

export function consumeInternalFeeSemantics(analysis: CanonicalStatementAnalysis): InternalFeeSemantics {
  const result = tryEvaluateF4Shadow({ analysis });
  const decisions = result.status === "available"
    ? new Map(result.report.decisions.filter((item) => item.semanticCode === "merchant_facing_fee_component"
      && item.dimension === "economic_broad_category" && item.subject === "fee_row")
      .map((item) => [item.feeRowId, item]))
    : new Map();
  const comparison: InternalObservedFeeComponents["legacyComparison"] = {
    includedAndSupported: 0,
    includedButUnknown: 0,
    excludedAndSupported: 0,
    excludedAndUnknown: 0,
  };
  const rows = [...analysis.feeLedger.rows].sort((a, b) => a.id.localeCompare(b.id)).map((row) => {
    const decision = decisions.get(row.id);
    // F4 supplies authority; this independent boundary prevents a future rule change
    // from widening the one Product-approved positive claim at the consumer.
    const boundaryMet = positiveComponentBoundary(analysis, row);
    const supported = decision?.status === "supported" && decision.f1ClaimId !== null && boundaryMet;
    const included = row.contributesToUniqueTotal && row.contributionDecision.contributes;
    if (included && supported) comparison.includedAndSupported++;
    else if (included) comparison.includedButUnknown++;
    else if (supported) comparison.excludedAndSupported++;
    else comparison.excludedAndUnknown++;
    return {
      feeRowId: row.id,
      claimId: decision?.f1ClaimId ?? null,
      status: supported ? "supported" as const : "unknown" as const,
      reasonCodes: !boundaryMet && decision?.status === "supported"
        ? ["internal_component_boundary_not_met"]
        : decision?.reasonCodes ?? [result.status === "available" ? "f4_component_decision_missing" : "f4_shadow_unavailable"],
    };
  });
  const observedFeeComponents: InternalObservedFeeComponents = {
    version: "observed_fee_component_internal_v1",
    standing: "internal_only",
    status: result.status,
    sourceReportId: result.status === "available" ? result.report.reportId : null,
    rows,
    legacyComparison: comparison,
  };
  const markupDecisions = new Map<string, F4ShadowDecision[]>();
  if (result.status === "available") {
    for (const decision of result.report.decisions) {
      if (decision.semanticCode !== "processor_markup" || decision.dimension !== "economic_broad_category"
        || decision.subject !== "fee_row" || decision.feeRowId === null) continue;
      const prior = markupDecisions.get(decision.feeRowId) ?? [];
      prior.push(decision);
      markupDecisions.set(decision.feeRowId, prior);
    }
  }
  const legacySelections = analysis.feeOwnershipActionability.rowClassifications
    .filter((item) => item.selected.category === "processor_markup")
    .sort((a, b) => a.feeRowId.localeCompare(b.feeRowId));
  const markupRows: InternalProcessorMarkupSemantics["rows"] = legacySelections.map((item) => {
    const matched = markupDecisions.get(item.feeRowId) ?? [];
    const decision = matched.length === 1 ? matched[0] : undefined;
    const authority = result.status === "available"
      ? processorMarkupStatusFromF4(decision)
      : { status: "unknown" as const, reasonCodes: ["f4_shadow_unavailable"] };
    return {
      feeRowId: item.feeRowId,
      legacySelectedCategory: "processor_markup",
      legacyCandidateId: item.selected.candidateId,
      claimId: decision?.f1ClaimId ?? null,
      status: authority.status,
      reasonCodes: authority.reasonCodes,
    };
  });
  const processorMarkup: InternalProcessorMarkupSemantics = {
    version: "processor_markup_internal_semantics_v1",
    standing: "internal_only",
    semanticAuthority: "claim_authority_f4",
    status: result.status,
    sourceReportId: result.status === "available" ? result.report.reportId : null,
    rows: markupRows,
    comparison: {
      legacySelected: markupRows.length,
      supported: markupRows.filter((row) => row.status === "supported").length,
      refused: markupRows.filter((row) => row.status === "refused").length,
      unknown: markupRows.filter((row) => row.status === "unknown").length,
    },
  };
  let merchantAttentionMarkupShadow: MerchantAttentionMarkupShadowComparison;
  try {
    merchantAttentionMarkupShadow = compareMerchantAttentionMarkupShadow({
      analysis,
      f4Report: result.status === "available" ? result.report : null,
      observedFeeComponents,
      processorMarkup,
    });
  } catch {
    // A diagnostic comparison must never block canonical or customer projections.
    merchantAttentionMarkupShadow = {
      version: "merchant_attention_markup_shadow_v1",
      standing: "internal_diagnostic_only",
      status: "unavailable",
      sourceReportId: result.status === "available" ? result.report.reportId : null,
      rows: [],
      summary: {
        legacyMarkupRows: markupRows.length,
        agreement: 0,
        authorityExceeding: 0,
        noAttentionItem: 0,
        observedComponentSupported: 0,
        currentResearchQuestions: 0,
        selectedResearchQuestions: 0,
      },
    };
  }
  let packageECustomerStateAuthorityReadBoundary: PackageECustomerStateAuthorityReadBoundary;
  try {
    packageECustomerStateAuthorityReadBoundary = buildPackageECustomerStateAuthorityReadBoundary({
      analysis,
      merchantAttentionMarkupShadow,
    });
  } catch {
    // This read-only diagnostic must never block canonical analysis or customer projections.
    packageECustomerStateAuthorityReadBoundary = unavailablePackageECustomerStateAuthorityReadBoundary(
      merchantAttentionMarkupShadow.sourceReportId,
    );
  }
  return {
    observedFeeComponents,
    processorMarkup,
    merchantAttentionMarkupShadow,
    packageECustomerStateAuthorityReadBoundary,
  };
}

export function consumeObservedFeeComponents(analysis: CanonicalStatementAnalysis): InternalObservedFeeComponents {
  return consumeInternalFeeSemantics(analysis).observedFeeComponents;
}
