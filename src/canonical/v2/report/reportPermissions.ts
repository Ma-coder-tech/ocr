import type {
  RhAuthorityCeiling,
  RhPermissionCategory,
  RhPermissionReasonCode,
  RhVisibilityPermission,
} from "./reportTypes.js";

export const RH_PERMISSION_CATEGORIES = [
  "public_experience", "financial_metrics", "effective_rate", "transaction_count", "qualified_comparison",
  "pricing", "composition", "partial_composition", "composition_percentages", "inventory", "ownership_control", "attention",
  "potential_reduction", "annual_impact", "amount_under_review", "actions", "call_guidance",
  "statement_evidence", "external_source", "methodology", "continuation",
] as const satisfies readonly RhPermissionCategory[];

export function permission(
  category: RhPermissionCategory,
  state: RhVisibilityPermission["state"],
  reasonCode: RhPermissionReasonCode,
  authorityCeiling: RhAuthorityCeiling,
): RhVisibilityPermission {
  return { category, state, reasonCode, authorityCeiling };
}
