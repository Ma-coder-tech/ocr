import type {
  CanonicalEconomicCategory,
  CanonicalEconomicComparisonReport,
  CanonicalEconomicPrivacySafeDiagnostics,
  CanonicalEconomicSemanticAmendmentId,
  CanonicalEconomicsV2EconomicAnalysis,
} from "./economicTypes.js";
import { RD_SEMANTIC_AMENDMENT_IDS } from "./economicVersionManifest.js";

const CATEGORIES = [
  "issuer_interchange_economics",
  "network_card_brand_economics",
  "processor_acquirer_pricing",
  "processor_service_administrative_cost",
  "third_party_service_equipment",
  "operational_exception_penalty_fee",
  "processing_fee_tax",
  "other_source_grounded_fee",
  "unresolved_unclassified",
] as const satisfies readonly CanonicalEconomicCategory[];

export function canonicalEconomicPrivacySafeDiagnostics(
  analysis: CanonicalEconomicsV2EconomicAnalysis,
  comparison: CanonicalEconomicComparisonReport | null = null,
): CanonicalEconomicPrivacySafeDiagnostics {
  const completeness = analysis.economicLayer.costStack.completeness;
  return {
    schemaVersion: analysis.versionManifest.schemaVersion,
    validationStatus: analysis.validation.status,
    chargeCount: analysis.economicLayer.charges.length,
    participantCount: analysis.economicLayer.participants.length,
    unresolvedRoleCount: analysis.economicLayer.roleClaims.filter((claim) => claim.resolution !== "proven" && claim.resolution !== "not_applicable").length,
    dependencyCount: analysis.economicLayer.dependencies.length,
    categoryCounts: Object.fromEntries(CATEGORIES.map((category) => [
      category,
      analysis.economicLayer.charges.filter((charge) => charge.category === category).length,
    ])) as Record<CanonicalEconomicCategory, number>,
    stackCompleteness: completeness,
    stackReconciliationState: completeness === "complete"
      ? "reconciled"
      : completeness === "complete_with_rounding"
        ? "reconciled_with_rounding"
        : completeness === "partial_but_financially_reconciled"
          ? "partial_reconciled"
          : completeness === "financially_unreconciled"
            ? "unreconciled"
            : "unavailable",
    amendmentCounts: Object.fromEntries(RD_SEMANTIC_AMENDMENT_IDS.map((id) => [
      id,
      analysis.economicLayer.semanticAmendments.filter((amendment) => amendment.id === id).length,
    ])) as Record<CanonicalEconomicSemanticAmendmentId, number>,
    comparisonCounts: comparison?.counts ?? null,
    hasUnexpectedDivergence: comparison?.hasUnexpectedDivergence ?? false,
  };
}
