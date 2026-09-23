import type { MoneyAmount } from "../canonical/types.js";

export const CONTEXTUAL_RECORD_VERSION = "contextual_knowledge_record_v1" as const;
export const CONTEXTUAL_SNAPSHOT_VERSION = "contextual_knowledge_snapshot_v1" as const;
export const CONTEXTUAL_FACT_PACKET_VERSION = "contextual_fact_packet_v1" as const;
export const CONTEXTUAL_RESULT_VERSION = "contextual_observed_cost_v1" as const;

export type ContextualRuleId = "observed_line_item_effect" | "fixed_fee_burden";
export type ContextualUse = "display_observed_amount" | "contextual_cost_burden";
export type ProhibitedClaimCode =
  | "benchmark_gap" | "overpayment" | "processor_markup" | "ownership_or_control"
  | "removability" | "negotiability" | "expected_savings" | "verified_savings";
export type PresentationCeiling = "observed_signed_contribution_only" | "observed_fixed_cost_burden_only";

export type ContextualScope = {
  processorFamily: "fiserv_first_data";
  statementCount: 1;
  visibility: "reusable" | "tenant_private" | "account_private";
  tenantRef: string | null;
  accountRef: string | null;
  merchantIdentifier: string | null;
};

export type ContextualKnowledgeRecord = {
  schemaVersion: typeof CONTEXTUAL_RECORD_VERSION;
  id: string;
  version: number;
  ruleId: ContextualRuleId;
  ruleVersion: "1.0.0";
  evidenceClass: "product_reviewed_structural_rule";
  sourceRef: "product_contextual_policy_2026_09_24";
  admission: {
    lifecycle: "candidate" | "admitted" | "superseded" | "rejected";
    reviewAuthority: "Product" | null;
    decisionRef: string | null;
    admittedOn: string | null;
  };
  effectiveFrom: string;
  effectiveTo: string | null; // Closed-open policy interval; evaluated on assessment date.
  scope: ContextualScope;
  permittedUses: ContextualUse[];
  prohibitedClaimCodes: ProhibitedClaimCode[];
  presentationCeiling: PresentationCeiling;
  formulaCode: "included_signed_fee_row_v1" | "proven_fixed_charges_over_processed_volume_v1";
  supersedes: string[];
  limitations: string[];
};

export type ContextualKnowledgeSnapshot = {
  schemaVersion: typeof CONTEXTUAL_SNAPSHOT_VERSION;
  snapshotId: string;
  recordedOn: string;
  records: ContextualKnowledgeRecord[];
};

export type ContextualQuery = {
  snapshotId: string;
  ruleId: ContextualRuleId;
  asOf: string;
  processorFamily: "fiserv_first_data" | "unsupported";
  merchantIdentifier: string | null;
  tenantRef: string | null;
  accountRef: string | null;
};

export type ContextualResolution = {
  status: "resolved" | "not_assessed";
  reasonCodes: string[];
  snapshotId: string;
  ruleId: ContextualRuleId;
  record: ContextualKnowledgeRecord | null;
};

export type ContextualFeeFact = {
  feeRowId: string;
  statementLabel: string;
  role: string;
  signedAmount: MoneyAmount | null;
  contributionReasonCode: string;
  signedAmountBasis: string;
  sourceOccurrenceIds: string[];
  evidenceRefs: string[];
  amountUnambiguous: boolean;
  fixedMechanic: {
    admissionId: string;
    cadence: "monthly" | "statement_period" | "annual";
    evidenceRefs: string[];
  } | null;
  fixedProofReasonCodes: string[];
};

export type ContextualFactPacket = {
  schemaVersion: typeof CONTEXTUAL_FACT_PACKET_VERSION;
  packetId: string;
  canonicalAnalysisId: string;
  sourceDocumentRef: string;
  merchantIdentifier: string | null;
  processorFamily: "fiserv_first_data" | "unsupported";
  statementPeriod: { start: string; end: string } | null;
  statementPeriodEvidenceRefs: string[];
  canonicalValidationStatus: "valid" | "valid_with_warnings" | "invalid";
  processedVolume: {
    amount: MoneyAmount | null;
    evidenceRefs: string[];
    population: string;
    populationCompatibility: string;
    metricDefinitionId: "canonical_v1_selected_processed_sales_v1";
  };
  feeFacts: ContextualFeeFact[];
  limitations: string[];
};

export type ObservedCostItem = {
  feeRowId: string;
  statementLabel: string;
  signedAmount: MoneyAmount;
  evidenceRefs: string[];
  contributionReasonCode: string;
  presentationCeiling: "observed_charge_only" | "observed_credit_only";
  prohibitedClaimCodes: ProhibitedClaimCode[];
};

export type ContextualObservedCostResult = {
  schemaVersion: typeof CONTEXTUAL_RESULT_VERSION;
  factPacketId: string;
  knowledgeSnapshotId: string;
  sourceDocumentRef: string;
  statementPeriod: { start: string; end: string } | null;
  observedLineItems: {
    status: "assessed" | "not_assessed";
    knowledgeRecordRef: string | null;
    items: ObservedCostItem[];
    creditsAndReversals: ObservedCostItem[];
    excluded: Array<{ feeRowId: string; reasonCodes: string[] }>;
    reasonCodes: string[];
  };
  fixedFeeBurden: {
    status: "assessed" | "amount_only" | "not_assessed";
    knowledgeRecordRef: string | null;
    fixedChargeTotal: MoneyAmount | null;
    feeRowIds: string[];
    evidenceRefs: string[];
    compatibleProcessedVolume: MoneyAmount | null;
    volumeMetricDefinitionId: "canonical_v1_selected_processed_sales_v1";
    basisPointsEquivalent: string | null;
    basisPointsMetricDefinitionId: "observed_fixed_charge_burden_bps_v1";
    excluded: Array<{ feeRowId: string; reasonCodes: string[] }>;
    reasonCodes: string[];
    presentationCeiling: "observed_fixed_cost_burden_only";
    prohibitedClaimCodes: ProhibitedClaimCode[];
  };
  limitations: string[];
};
