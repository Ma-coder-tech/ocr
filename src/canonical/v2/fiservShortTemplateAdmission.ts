import type { CanonicalEconomicsV2TemplateAdmissionInput } from "./fiservAdapter.js";
import type { CanonicalEconomicsV2SectionAdmission } from "./sourceModel.js";
import type { CanonicalEconomicsV2CapabilityId, CanonicalEconomicsV2Foundation } from "./types.js";

export const FISERV_SHORT_STRUCTURAL_MAPPING_ID = "fiserv_first_data_short_structural_mapping";
export const FISERV_SHORT_STRUCTURAL_MAPPING_VERSION = "1.0.0";

export type FiservShortTemplateAdmissionResolution = {
  mappingId: typeof FISERV_SHORT_STRUCTURAL_MAPPING_ID;
  mappingVersion: typeof FISERV_SHORT_STRUCTURAL_MAPPING_VERSION;
  authorityClass: "product_owner";
  authorityRef: string;
  matched: true;
  templateAdmission: CanonicalEconomicsV2TemplateAdmissionInput;
  sectionAdmissions: CanonicalEconomicsV2SectionAdmission[];
  feeDetailCoverage: "complete_observed_occurrences" | "partial";
};

const AUTHORITY_REF = "product-owner-statement-1-rerun-2-disposition-2026-08-23";
const ADMITTED_AT = "2026-08-23T00:00:00.000Z";

/**
 * Resolves the product-owner-approved short-layout mapping from structural and
 * reconciliation evidence only. Statement ids, filenames, fingerprints,
 * merchant identity, and exact monetary values are intentionally unavailable
 * to this matcher.
 */
export function resolveFiservShortTemplateAdmission(input: {
  driverId: string;
  parserOutput: unknown;
  observationalFoundation: CanonicalEconomicsV2Foundation;
}): FiservShortTemplateAdmissionResolution | null {
  const output = record(input.parserOutput);
  const identity = record(output.statementIdentity);
  const decision = record(output.decision);
  const validation = record(decision.validationState);
  if (input.driverId !== "fiserv_first_data_short_statement"
    || identity.statementFamily !== "fiserv_first_data_short_statement"
    || identity.processorFamily !== "Fiserv / First Data"
    || decision.reportable !== true
    || validation.customerFacingTotalsAllowed !== true
    || validation.topLevelTotals !== "validated"
    || validation.feeLedger !== "validated"
    || validation.batchLedger !== "validated") return null;

  const selected = record(output.selectedFinancials);
  const gross = finite(selected.grossSales);
  const refunds = finite(selected.refunds);
  const net = finite(selected.totalVolume);
  const fees = finite(selected.totalFees);
  const adjustment = finite(selected.adjustmentsChargebacks);
  if (gross === null || refunds === null || net === null || fees === null || adjustment === null
    || Math.abs(gross - refunds - net) > 0.01) return null;

  const supportingCounts = records(record(selected.transactionCount).supportingTransactionCounts);
  if (!uniqueCount(supportingCounts, "gross_sale_items") || !uniqueCount(supportingCounts, "submitted_transactions")) return null;

  const reconciliation = records(output.reconciliationResults);
  const requiredControls = [
    "headline:submitted_plus_adjustments_minus_fees_eq_processed",
    "batch_columns:sum_submitted_eq_submitted_total",
    "batch_columns:sum_fees_eq_total_fees",
    "fee_detail:all_line_items_eq_total_fees",
    "cross_reference:summary_by_batch_submitted_eq_selected_submitted",
    "cross_reference:adjustment_detail_total_eq_selected_adjustments",
  ];
  if (!requiredControls.every((required) => reconciliation.some((item) => item.identity === required && item.status === "RECON_OK"))) return null;

  const feeLedger = record(output.feeLedger);
  const feeRows = records(feeLedger.rows);
  const feeRowSum = feeRows.reduce((sum, row) => sum + (finite(row.amount) ?? Number.NaN), 0);
  const completeFeeDetail = feeRows.length > 0 && feeLedger.status === "reconciled"
    && Number.isFinite(feeRowSum) && Math.abs(feeRowSum - fees) <= 0.01
    && feeRows.every((row) => typeof row.evidenceLine === "string" && row.evidenceLine.length > 0);
  const fundingLedger = record(output.fundingBatchLedger);
  const fundingRows = records(fundingLedger.rows);
  const separatedAdjustment = fundingLedger.status === "reconciled" && fundingRows.length > 0
    && fundingRows.every((row) => finite(row.adjustments) !== null && (finite(row.chargebacks) ?? 0) === 0)
    && Math.abs(fundingRows.reduce((sum, row) => sum + (finite(row.adjustments) ?? 0), 0) - adjustment) <= 0.01;
  if (!completeFeeDetail || !separatedAdjustment) return null;

  const foundation = input.observationalFoundation;
  const occurrenceProof = (predicate: (item: CanonicalEconomicsV2Foundation["sourceModel"]["occurrences"][number], section: string) => boolean) =>
    unique(foundation.sourceModel.occurrences.filter((item) => {
      const section = foundation.sourceModel.sections.find((candidate) => candidate.id === item.sectionRef)?.heading ?? "";
      return predicate(item, section);
    }).map((item) => item.evidenceRef));
  const roleProof = (role: string, sections: string[]) => occurrenceProof((item, section) =>
    item.semanticRole === role && sections.includes(section));

  const proofs: Record<CanonicalEconomicsV2CapabilityId, string[]> = {
    processor_identity: occurrenceProof((item, section) => section === "HEADER" && item.sourceLabel === "statementPeriod"),
    statement_period: occurrenceProof((item, section) => section === "HEADER" && item.sourceLabel === "statementPeriod"),
    gross_sale_volume: roleProof("gross_sale", ["SUMMARY BY CARD TYPE"]),
    refund_volume: roleProof("refund", ["SUMMARY BY CARD TYPE"]),
    canonical_net_submitted_card_volume: roleProof("net_submitted", ["SUMMARY", "SUMMARY BY BATCH"]),
    gross_sale_transaction_count: roleProof("gross_sale_count", ["SUMMARY BY CARD TYPE"]),
    submitted_transaction_count: roleProof("submitted_count", ["SUMMARY BY CARD TYPE"]),
    refund_transaction_count: [],
    fee_total: roleProof("fee_charge", ["SUMMARY", "TRANSACTION FEES", "ACCOUNT FEES"]),
    funding_batches: [],
    settlement_adjustments: roleProof("settlement_adjustment", ["ADJUSTMENTS", "ADJUSTMENTS/CHARGEBACKS"]),
    chargeback_financial_populations: [],
    fee_detail: roleProof("fee_charge", ["TRANSACTION FEES", "ACCOUNT FEES"]),
    reconciliation_controls: occurrenceProof((item, section) => ["SUMMARY", "SUMMARY BY CARD TYPE", "SUMMARY BY BATCH", "FEES", "ADJUSTMENTS"].includes(section)),
    non_fee_financial_flow_exclusions: occurrenceProof((item) => ["refund", "settlement_adjustment"].includes(item.semanticRole)),
  };
  const approvedCapabilities: CanonicalEconomicsV2CapabilityId[] = [
    "processor_identity", "statement_period", "gross_sale_volume", "refund_volume", "canonical_net_submitted_card_volume",
    "gross_sale_transaction_count", "submitted_transaction_count", "fee_total", "settlement_adjustments", "fee_detail",
    "reconciliation_controls", "non_fee_financial_flow_exclusions",
  ];
  if (approvedCapabilities.some((capability) => proofs[capability].length === 0)) return null;
  const admissionProofEvidenceRefs = unique(approvedCapabilities.flatMap((capability) => proofs[capability]));
  const capability = (capabilityId: CanonicalEconomicsV2CapabilityId, limitation: string) => ({
    capability: capabilityId,
    status: approvedCapabilities.includes(capabilityId) ? "supported" as const : "unknown" as const,
    proofEvidenceRefs: proofs[capabilityId],
    limitations: [limitation],
  });
  const limitations = [
    "Admission is restricted to the exact deterministic short-driver structure and the enumerated claim capabilities.",
    "Processor-statement completeness remains independently unknown.",
    "Pricing axes, fee economic categories, ownership/control, RD contribution, RE themes, impact, and comparison are not admitted.",
  ];
  return {
    mappingId: FISERV_SHORT_STRUCTURAL_MAPPING_ID,
    mappingVersion: FISERV_SHORT_STRUCTURAL_MAPPING_VERSION,
    authorityClass: "product_owner",
    authorityRef: AUTHORITY_REF,
    matched: true,
    feeDetailCoverage: "complete_observed_occurrences",
    templateAdmission: {
      detectedFamily: "Fiserv / First Data",
      detectedTemplate: FISERV_SHORT_STRUCTURAL_MAPPING_ID,
      detectedVersion: FISERV_SHORT_STRUCTURAL_MAPPING_VERSION,
      identityStatus: "proven",
      admissionStatus: "admitted",
      completenessStatus: "unknown",
      admissionAuthority: {
        lifecycle: "admitted_with_conditions",
        authorityClass: "product_owner",
        authorityRef: AUTHORITY_REF,
        admittedAt: ADMITTED_AT,
        admissionVersion: FISERV_SHORT_STRUCTURAL_MAPPING_VERSION,
        effectiveFrom: null,
        effectiveTo: null,
      },
      admissionProofEvidenceRefs,
      capabilities: [
        capability("processor_identity", "Identity only; no financial, pricing, category, or ownership semantics follow from this claim."),
        capability("statement_period", "Only the explicitly labelled statement-period field is admitted."),
        capability("gross_sale_volume", "Gross-sale population is scope-bound to the short-layout card-type control."),
        capability("refund_volume", "Refunds reduce gross sales to net submitted volume and are not fee credits."),
        capability("canonical_net_submitted_card_volume", "Settlement adjustments do not alter this sales population."),
        capability("gross_sale_transaction_count", "Gross-sale count remains distinct from submitted count."),
        capability("submitted_transaction_count", "Submitted count cannot be substituted for gross-sale count."),
        capability("fee_total", "Statement fee total does not establish total acceptance cost, ownership, margin, or savings."),
        capability("settlement_adjustments", "Settlement adjustments remain outside sales volume and processing fees."),
        capability("fee_detail", "Only occurrence identity, sign, amount, and complete observed-row coverage are admitted; categories remain unresolved."),
        capability("reconciliation_controls", "Controls admit only the relationships they explicitly reconcile."),
        capability("non_fee_financial_flow_exclusions", "Refund and adjustment exclusions are restricted to this structural mapping."),
      ],
      limitations,
    },
    sectionAdmissions: [
      { sourceSection: "HEADER", populationSemantics: [], capabilityStatus: "supported", evidenceRefs: proofs.statement_period, limitations },
      { sourceSection: "SUMMARY", populationSemantics: ["canonical_net_submitted_card_volume", "statement_processing_fee_total"], capabilityStatus: "supported", evidenceRefs: proofs.reconciliation_controls, limitations },
      { sourceSection: "SUMMARY BY CARD TYPE", populationSemantics: ["gross_sale_volume", "refund_volume", "canonical_net_submitted_card_volume", "gross_sale_transaction_count", "submitted_transaction_count"], capabilityStatus: "supported", evidenceRefs: unique([...proofs.gross_sale_volume, ...proofs.refund_volume, ...proofs.gross_sale_transaction_count, ...proofs.submitted_transaction_count]), limitations },
      { sourceSection: "SUMMARY BY BATCH", populationSemantics: ["canonical_net_submitted_card_volume"], capabilityStatus: "supported", evidenceRefs: proofs.canonical_net_submitted_card_volume, limitations: [
        ...limitations,
        "Funding/accounting columns do not independently prove adjustment or chargeback subtype populations.",
      ] },
      { sourceSection: "ADJUSTMENTS", populationSemantics: ["settlement_adjustment_amount"], capabilityStatus: "supported", evidenceRefs: proofs.settlement_adjustments, limitations },
      { sourceSection: "TRANSACTION FEES", populationSemantics: ["fee_occurrences"], completenessStatus: "complete", capabilityStatus: "supported", evidenceRefs: proofs.fee_detail, limitations },
      { sourceSection: "ACCOUNT FEES", populationSemantics: ["fee_occurrences"], completenessStatus: "complete", capabilityStatus: "supported", evidenceRefs: proofs.fee_detail, limitations },
      { sourceSection: "FEES", populationSemantics: ["statement_processing_fee_total", "fee_occurrences"], completenessStatus: "complete", capabilityStatus: "supported", evidenceRefs: unique([...proofs.fee_total, ...proofs.fee_detail]), limitations },
    ],
  };
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
function records(value: unknown): Record<string, any>[] { return Array.isArray(value) ? value.map(record) : []; }
function finite(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function uniqueCount(rows: Record<string, any>[], role: string): boolean {
  const values = rows.filter((item) => item.role === role).map((item) => finite(item.value)).filter((item): item is number => item !== null);
  return new Set(values).size === 1;
}
function unique(values: string[]): string[] { return [...new Set(values)].sort(); }
