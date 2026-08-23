import type { CanonicalMerchantReportProjectionV2, RhComparisonReport, RhPrivacySafeDiagnostics } from "./reportTypes.js";
import { validateCanonicalMerchantReportProjectionV2 } from "./reportValidate.js";

export function createRhPrivacySafeDiagnostics(
  projection: CanonicalMerchantReportProjectionV2,
  comparison: RhComparisonReport | null = null,
): RhPrivacySafeDiagnostics {
  const validation = validateCanonicalMerchantReportProjectionV2(projection);
  const permissionCounts = { permitted: 0, limited: 0, denied: 0 };
  for (const value of Object.values(projection.permissions)) permissionCounts[value.state] += 1;
  return {
    schemaVersion: projection.schemaVersion,
    validationStatus: validation.errors.length === 0 ? "valid" : "invalid",
    experience: projection.experience,
    permissionCounts,
    sectionCounts: {
      snapshot: projection.snapshot ? 1 : 0, pricing: projection.pricing ? 1 : 0, composition: projection.composition ? 1 : 0,
      attention: projection.attention ? 1 : 0, questions: projection.questions ? 1 : 0, inventory: projection.inventory ? 1 : 0,
      actions: projection.actions ? 1 : 0, continuation: projection.continuation ? 1 : 0, methodology: projection.methodology ? 1 : 0,
    },
    attentionCount: projection.attention?.items.length ?? 0,
    questionCount: projection.questions?.items.length ?? 0,
    inventoryCount: projection.inventory?.items.length ?? 0,
    actionCount: projection.actions?.items.length ?? 0,
    comparisonCounts: comparison?.counts ?? null,
    hasUnexpectedDivergence: comparison?.hasUnexpectedDivergence ?? false,
  };
}
