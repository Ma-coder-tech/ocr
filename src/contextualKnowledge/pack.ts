import { createContextualSnapshot } from "./governance.js";
import type { ContextualKnowledgeRecord } from "./contracts.js";

const prohibited = [
  "benchmark_gap", "overpayment", "processor_markup", "ownership_or_control",
  "removability", "negotiability", "expected_savings", "verified_savings",
] as const;

const common = {
  schemaVersion: "contextual_knowledge_record_v1",
  version: 1,
  ruleVersion: "1.0.0",
  evidenceClass: "product_reviewed_structural_rule",
  sourceRef: "product_contextual_policy_2026_09_24",
  admission: {
    lifecycle: "admitted",
    reviewAuthority: "Product",
    decisionRef: "product_contextual_first_pack_2026_09_24",
    admittedOn: "2026-09-24",
  },
  effectiveFrom: "2026-09-24",
  effectiveTo: null,
  scope: {
    processorFamily: "fiserv_first_data",
    statementCount: 1,
    visibility: "reusable",
    tenantRef: null,
    accountRef: null,
    merchantIdentifier: null,
  },
  prohibitedClaimCodes: [...prohibited] as ContextualKnowledgeRecord["prohibitedClaimCodes"],
  supersedes: [] as string[],
} as const;

export const FIRST_CONTEXTUAL_RECORDS: ContextualKnowledgeRecord[] = [
  {
    ...common,
    id: "product_observed_line_item_effect_v1",
    ruleId: "observed_line_item_effect",
    permittedUses: ["display_observed_amount"],
    presentationCeiling: "observed_signed_contribution_only",
    formulaCode: "included_signed_fee_row_v1",
    limitations: ["A statement charge does not establish whether it can be changed."],
  },
  {
    ...common,
    id: "product_fixed_fee_burden_v1",
    ruleId: "fixed_fee_burden",
    permittedUses: ["contextual_cost_burden"],
    presentationCeiling: "observed_fixed_cost_burden_only",
    formulaCode: "proven_fixed_charges_over_processed_volume_v1",
    limitations: ["Observed fixed-cost burden does not establish removability, recurrence, or savings."],
  },
];

export const FIRST_CONTEXTUAL_SNAPSHOT = createContextualSnapshot("2026-09-24", FIRST_CONTEXTUAL_RECORDS);
