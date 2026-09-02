import type { CanonicalEconomicsV2TemplateAdmissionInput } from "./fiservAdapter.js";
import type { CanonicalEconomicsV2SectionAdmission } from "./sourceModel.js";
import type { CanonicalEconomicsV2CapabilityId, CanonicalEconomicsV2Foundation } from "./types.js";

export const FISERV_FULL_STRUCTURAL_MAPPING_ID = "fiserv_first_data_full_statement";
export const FISERV_FULL_STRUCTURAL_MAPPING_VERSION = "1.0.0";

export type FiservFullAdmissionMarkerResult = {
  code: string;
  requirement: "required" | "optional" | "prohibited";
  status: "passed" | "present" | "absent" | "failed";
  evidenceRefs: string[];
};

export type FiservFullAdmissionControlResult = {
  code: string;
  status: "passed" | "failed" | "permitted_unresolved";
  tolerance: string | null;
  evidenceRefs: string[];
};

export type FiservFullTemplateAdmissionDecision = {
  familyCode: typeof FISERV_FULL_STRUCTURAL_MAPPING_ID;
  familyVersion: typeof FISERV_FULL_STRUCTURAL_MAPPING_VERSION;
  matched: boolean;
  reasonCodes: string[];
  structuralMarkers: FiservFullAdmissionMarkerResult[];
  reconciliationControls: FiservFullAdmissionControlResult[];
  permittedUnresolvedConditions: string[];
  rejectedAlternativeFamily: { familyCode: "fiserv_first_data_short_statement"; reasonCode: string };
};

export type FiservFullTemplateAdmissionResolution = {
  mappingId: typeof FISERV_FULL_STRUCTURAL_MAPPING_ID;
  mappingVersion: typeof FISERV_FULL_STRUCTURAL_MAPPING_VERSION;
  authorityClass: "product_owner";
  authorityRef: string;
  matched: true;
  templateAdmission: CanonicalEconomicsV2TemplateAdmissionInput;
  sectionAdmissions: CanonicalEconomicsV2SectionAdmission[];
  feeDetailCoverage: "complete_observed_occurrences";
  decision: FiservFullTemplateAdmissionDecision & { matched: true };
};

const AUTHORITY_REF = "product-owner-full-layout-family-admission-2026-08-25";
const ADMITTED_AT = "2026-08-25T00:00:00.000Z";
const MONEY_TOLERANCE = 0.01;
const FEE_TOLERANCE = 0.02;

/**
 * Evaluates the reusable First Data full-layout family using only parser
 * structure, local extraction integrity, source lineage, and deterministic
 * reconciliation. Fixture identity, filenames, merchant identity, dates, and
 * exact transaction or monetary values are intentionally unavailable here.
 */
export function evaluateFiservFullTemplateAdmission(input: {
  driverId: string;
  parserOutput: unknown;
  observationalFoundation: CanonicalEconomicsV2Foundation;
}): { decision: FiservFullTemplateAdmissionDecision; resolution: FiservFullTemplateAdmissionResolution | null } {
  const output = record(input.parserOutput);
  const identity = record(output.statementIdentity);
  const decision = record(output.decision);
  const validation = record(decision.validationState);
  const selected = record(output.selectedFinancials);
  const feeBreakdown = record(output.feeBreakdown);
  const feeLedger = record(output.feeLedger);
  const fundingLedger = record(output.fundingBatchLedger);
  const interchangeDetail = record(output.interchangeDetail);
  const foundation = input.observationalFoundation;
  const headings = new Map<string, CanonicalEconomicsV2Foundation["sourceModel"]["sections"]>();
  for (const section of foundation.sourceModel.sections) {
    const current = headings.get(section.heading) ?? [];
    headings.set(section.heading, [...current, section]);
  }
  const occurrenceProof = (predicate: (item: CanonicalEconomicsV2Foundation["sourceModel"]["occurrences"][number], section: string) => boolean) =>
    unique(foundation.sourceModel.occurrences.filter((item) => {
      const section = foundation.sourceModel.sections.find((candidate) => candidate.id === item.sectionRef)?.heading ?? "";
      return predicate(item, section);
    }).map((item) => item.evidenceRef));
  const roleProof = (role: string, sections: string[]) => occurrenceProof((item, section) =>
    item.semanticRole === role && sections.includes(section));
  const sectionProof = (sections: string[]) => occurrenceProof((_item, section) => sections.includes(section));
  const marker = (code: string, requirement: FiservFullAdmissionMarkerResult["requirement"], passed: boolean,
    evidenceRefs: string[] = []): FiservFullAdmissionMarkerResult => ({
    code, requirement, status: requirement === "optional" ? (passed ? "present" : "absent")
      : requirement === "prohibited" ? (passed ? "absent" : "failed") : passed ? "passed" : "failed",
    evidenceRefs: unique(evidenceRefs),
  });

  const feeRows = records(feeLedger.rows);
  const fundingRows = records(fundingLedger.rows);
  const feeControls = records(feeLedger.controls);
  const reconciliationRows = records(output.reconciliationResults);
  const page = (heading: string, pick: "min" | "max" = "min") => {
    const values = (headings.get(heading) ?? []).flatMap((section) => [section.pageStart, section.pageEnd])
      .filter((value): value is number => Number.isInteger(value));
    return values.length === 0 ? null : pick === "min" ? Math.min(...values) : Math.max(...values);
  };
  const cardPage = page("SUMMARY BY CARD TYPE");
  const batchPage = page("SUMMARY BY BATCH");
  const transactionFeePage = page("TRANSACTION FEES");
  const interchangePage = page("INTERCHANGE CHARGES / PROGRAM FEES");
  const accountFeePage = page("ACCOUNT FEES");
  const ordered = [cardPage, batchPage, transactionFeePage, interchangePage, accountFeePage].every((value) => value !== null)
    && Math.max(cardPage!, batchPage!) <= Math.min(transactionFeePage!, interchangePage!)
    && Math.max(transactionFeePage!, interchangePage!) <= accountFeePage!;
  const integrity = foundation.documentIntegrity;
  const completeExtraction = integrity.suppliedDocumentStatus === "complete_supplied_document"
    && integrity.observedPageCount !== null && integrity.observedPageCount === integrity.processedPageCount
    && integrity.fatalPageErrorCount === 0 && integrity.extractionLineageComplete === true
    && integrity.localIngestionTruncated === false;
  const feeSections = new Set(feeRows.map((row) => string(row.sourceSection)).filter(Boolean));
  const feeTypes = new Set(feeRows.map((row) => string(row.type)).filter(Boolean));
  const structuralMarkers: FiservFullAdmissionMarkerResult[] = [
    marker("full_structure_driver_and_family", "required", input.driverId === FISERV_FULL_STRUCTURAL_MAPPING_ID
      && identity.statementFamily === FISERV_FULL_STRUCTURAL_MAPPING_ID),
    marker("fiserv_first_data_processor_scope", "required", identity.processorFamily === "Fiserv / First Data"),
    marker("complete_local_extraction_lineage", "required", completeExtraction, foundation.documentIntegrity.proofEvidenceRefs),
    marker("labelled_statement_period_and_header", "required", occurrenceProof((item, section) =>
      section === "HEADER" && item.sourceLabel === "statementPeriod").length > 0,
      occurrenceProof((item, section) => section === "HEADER" && item.sourceLabel === "statementPeriod")),
    marker("statement_summary_structure", "required", (headings.get("SUMMARY") ?? []).length > 0, sectionProof(["SUMMARY"])),
    marker("card_type_gross_refund_net_structure", "required", roleProof("gross_sale", ["SUMMARY BY CARD TYPE"]).length > 0
      && roleProof("refund", ["SUMMARY BY CARD TYPE"]).length > 0
      && roleProof("gross_sale_count", ["SUMMARY BY CARD TYPE", "TRANSACTION COUNTS"]).length > 0,
      unique([...roleProof("gross_sale", ["SUMMARY BY CARD TYPE"]), ...roleProof("refund", ["SUMMARY BY CARD TYPE"]),
        ...roleProof("gross_sale_count", ["SUMMARY BY CARD TYPE", "TRANSACTION COUNTS"])])),
    marker("batch_funding_structure", "required", fundingRows.length > 1 && (headings.get("SUMMARY BY BATCH") ?? []).length > 0,
      roleProof("net_submitted", ["SUMMARY BY BATCH"])),
    marker("transaction_and_account_fee_sections", "required", feeSections.has("TRANSACTION FEES")
      && feeSections.has("ACCOUNT FEES") && feeRows.length > 0,
      roleProof("fee_charge", ["TRANSACTION FEES", "ACCOUNT FEES"])),
    marker("interchange_program_detail_structure", "required", interchangeDetail.available === true
      && (headings.get("INTERCHANGE CHARGES / PROGRAM FEES") ?? []).length > 0
      && (feeTypes.has("Interchange charges") || feeTypes.has("Program Fees")),
      sectionProof(["INTERCHANGE CHARGES / PROGRAM FEES"])),
    marker("full_three_bucket_fee_summary", "required", feeBreakdown.layout === "interchange_program_service_fees"
      && records(feeBreakdown.buckets).length === 3 && finite(feeBreakdown.total) !== null,
      roleProof("fee_charge", ["FEES"])),
    marker("full_section_page_relationship", "required", ordered),
    marker("debit_network_fee_section", "optional", feeSections.has("DEBIT NETWORK FEES"),
      roleProof("fee_charge", ["DEBIT NETWORK FEES"])),
    marker("tax_reporting_section", "optional", (headings.get("TAX GROSS REPORTABLE SALES") ?? []).length > 0,
      sectionProof(["TAX GROSS REPORTABLE SALES"])),
    marker("statement_notice_section", "optional", (headings.get("NOTICES") ?? []).length > 0, sectionProof(["NOTICES"])),
    marker("short_layout_without_interchange_detail", "prohibited", interchangeDetail.available === true),
    marker("wrong_processor_or_program_family", "prohibited", identity.processorFamily === "Fiserv / First Data"),
    marker("incomplete_or_truncated_extraction", "prohibited", completeExtraction),
  ];

  const control = (code: string, passed: boolean, tolerance: string | null, evidenceRefs: string[] = []): FiservFullAdmissionControlResult => ({
    code, status: passed ? "passed" : "failed", tolerance, evidenceRefs: unique(evidenceRefs),
  });
  const gross = finite(selected.grossSales);
  const refunds = finite(selected.refunds);
  const net = finite(selected.totalVolume);
  const fees = finite(selected.totalFees);
  const buckets = records(feeBreakdown.buckets).map((bucket) => finite(bucket.amount));
  const requiredRecon = (identityCode: string, allowRounding = false) => reconciliationRows.find((row) =>
    row.identity === identityCode && (row.status === "RECON_OK" || (allowRounding && row.status === "RECON_ROUNDING")));
  const requiredControls = [
    "headline:submitted_plus_adjustments_minus_fees_eq_processed",
    "batch_columns:sum_submitted_eq_submitted_total",
    "batch_columns:sum_funded_eq_processed_total",
    "batch_columns:sum_fees_eq_total_fees",
    "fee_detail:all_line_items_eq_total_fees",
    "cross_reference:summary_by_card_type_submitted_eq_selected_submitted",
  ];
  const requiredControlRows = requiredControls.map((identityCode) => requiredRecon(identityCode, identityCode.startsWith("fee_detail:")));
  const reconciliationControls: FiservFullAdmissionControlResult[] = [
    control("gross_minus_refunds_equals_net_submitted", gross !== null && refunds !== null && net !== null
      && Math.abs(gross - refunds - net) <= MONEY_TOLERANCE, "absolute <= 0.01",
      unique([...roleProof("gross_sale", ["SUMMARY BY CARD TYPE"]), ...roleProof("refund", ["SUMMARY BY CARD TYPE"]),
        ...roleProof("net_submitted", ["SUMMARY", "SUMMARY BY CARD TYPE"])])),
    control("three_fee_buckets_equal_statement_fee_total", fees !== null && buckets.length === 3
      && buckets.every((value) => value !== null) && Math.abs(buckets.reduce((sum, value) => sum + value!, 0) - fees) <= FEE_TOLERANCE,
      "absolute <= 0.02", roleProof("fee_charge", ["FEES"])),
    control("required_procedural_reconciliations", requiredControlRows.every(Boolean),
      "existing control tolerance; headline/card exact <= 0.01, fee aggregate <= 0.02, row-sum controls capped <= 0.25",
      unique(foundation.reconciliation.filter((item) => requiredControls.includes(item.controlIdentity))
        .flatMap((item) => item.evidenceRefs))),
    control("all_batch_rows_and_columns_reconcile", fundingLedger.status === "reconciled"
      && finite(fundingLedger.anomalyCount) === 0 && fundingRows.length > 1
      && fundingRows.every((row) => row.status === "pass" && Math.abs(finite(row.delta) ?? Number.POSITIVE_INFINITY) <= MONEY_TOLERANCE)
      && [fundingLedger.submittedDelta, fundingLedger.fundedDelta, fundingLedger.feesChargedDelta]
        .every((value) => Math.abs(finite(value) ?? Number.POSITIVE_INFINITY) <= MONEY_TOLERANCE),
      "each row/column absolute <= 0.01", roleProof("funded_amount", ["SUMMARY BY BATCH"])),
    control("fee_rows_reconcile_to_all_printed_controls", ["reconciled", "reconciled_with_rounding_delta"].includes(string(feeLedger.status))
      && feeRows.length > 0 && Math.abs(finite(feeLedger.delta) ?? Number.POSITIVE_INFINITY) <= FEE_TOLERANCE
      && feeRows.every((row) => finite(row.amount) !== null && string(row.evidenceLine).length > 0)
      && feeControls.length >= 4 && feeControls.every((item) => item.status === "reconciled"
        || (item.status === "reconciled_with_rounding_delta" && Math.abs(finite(item.delta) ?? Number.POSITIVE_INFINITY) <= FEE_TOLERANCE)),
      "grand total absolute <= 0.02; every printed control within its deterministic tolerance",
      roleProof("fee_charge", ["TRANSACTION FEES", "DEBIT NETWORK FEES", "ACCOUNT FEES"])),
    { code: "interchange_summary_detail_equivalence", status: "permitted_unresolved", tolerance: null,
      evidenceRefs: roleProof("fee_charge", ["TRANSACTION FEES", "DEBIT NETWORK FEES"]) },
    { code: "processor_statement_completeness", status: "permitted_unresolved", tolerance: null,
      evidenceRefs: foundation.documentIntegrity.proofEvidenceRefs },
  ];

  const failedMarkers = structuralMarkers.filter((item) => item.status === "failed");
  const failedControls = reconciliationControls.filter((item) => item.status === "failed");
  const reasonCodes = unique([
    ...failedMarkers.map((item) => `full_admission_failed_${item.code}`),
    ...failedControls.map((item) => `full_admission_failed_${item.code}`),
  ]);
  const matched = failedMarkers.length === 0 && failedControls.length === 0
    && decision.reportable === true && validation.customerFacingTotalsAllowed === true
    && validation.topLevelTotals === "validated" && validation.feeLedger === "validated" && validation.batchLedger === "validated";
  if (!matched && reasonCodes.length === 0) reasonCodes.push("full_admission_failed_parser_validation");
  if (matched) reasonCodes.push(
    "full_admission_accepted_cross_section_structure",
    "full_admission_accepted_deterministic_economics",
    "full_admission_scope_limited_to_enumerated_capabilities",
  );
  const admissionDecision: FiservFullTemplateAdmissionDecision = {
    familyCode: FISERV_FULL_STRUCTURAL_MAPPING_ID,
    familyVersion: FISERV_FULL_STRUCTURAL_MAPPING_VERSION,
    matched,
    reasonCodes,
    structuralMarkers,
    reconciliationControls,
    permittedUnresolvedConditions: [
      "processor_statement_completeness_not_independently_proven",
      "interchange_summary_and_detail_totals_are_non_equivalent_controls",
      "pricing_architecture_unresolved",
      "fee_economic_category_and_ownership_unresolved",
      "no_rd_contribution_re_theme_impact_or_savings_authority",
    ],
    rejectedAlternativeFamily: {
      familyCode: "fiserv_first_data_short_statement",
      reasonCode: interchangeDetail.available === true
        ? "short_family_rejected_interchange_program_detail_present"
        : "short_family_not_rejected_by_required_full_detail",
    },
  };
  if (!matched) return { decision: admissionDecision, resolution: null };

  const proofs: Record<CanonicalEconomicsV2CapabilityId, string[]> = {
    processor_identity: unique([...sectionProof(["SUMMARY"]), ...roleProof("unknown", ["HEADER"])]),
    statement_period: roleProof("unknown", ["HEADER"]),
    gross_sale_volume: roleProof("gross_sale", ["SUMMARY BY CARD TYPE"]),
    refund_volume: roleProof("refund", ["SUMMARY BY CARD TYPE"]),
    canonical_net_submitted_card_volume: roleProof("net_submitted", ["SUMMARY", "SUMMARY BY CARD TYPE", "SUMMARY BY BATCH"]),
    gross_sale_transaction_count: roleProof("gross_sale_count", ["SUMMARY BY CARD TYPE", "TRANSACTION COUNTS"]),
    submitted_transaction_count: [],
    refund_transaction_count: [],
    fee_total: roleProof("fee_charge", ["SUMMARY", "FEES"]),
    funding_batches: unique([...roleProof("net_submitted", ["SUMMARY BY BATCH"]), ...roleProof("funded_amount", ["SUMMARY BY BATCH"])]),
    settlement_adjustments: [],
    chargeback_financial_populations: [],
    fee_detail: roleProof("fee_charge", ["TRANSACTION FEES", "DEBIT NETWORK FEES", "ACCOUNT FEES"]),
    reconciliation_controls: unique(reconciliationControls.filter((item) => item.status === "passed").flatMap((item) => item.evidenceRefs)),
    non_fee_financial_flow_exclusions: unique([...roleProof("refund", ["SUMMARY BY CARD TYPE"]),
      ...roleProof("settlement_adjustment", ["SUMMARY BY BATCH"]), ...roleProof("chargeback_principal_debit", ["SUMMARY BY BATCH"])]),
  };
  const approvedCapabilities: CanonicalEconomicsV2CapabilityId[] = [
    "processor_identity", "statement_period", "gross_sale_volume", "refund_volume", "canonical_net_submitted_card_volume",
    "gross_sale_transaction_count", "fee_total", "funding_batches", "fee_detail", "reconciliation_controls",
    "non_fee_financial_flow_exclusions",
  ];
  if (approvedCapabilities.some((capability) => proofs[capability].length === 0)) {
    const failedDecision = { ...admissionDecision, matched: false as const,
      reasonCodes: ["full_admission_failed_capability_lineage_incomplete"] };
    return { decision: failedDecision, resolution: null };
  }
  const admissionProofEvidenceRefs = unique(approvedCapabilities.flatMap((capability) => proofs[capability]));
  const limitations = [
    "Admission is restricted to the deterministic full-layout cross-section structure and enumerated capabilities.",
    "Processor-statement completeness remains independently unknown even when every supplied page was processed.",
    "Submitted-count, refund-count, adjustments, chargebacks, pricing, fee category, ownership/control, RD contribution, RE themes, impact, comparison, and savings are not admitted.",
  ];
  const capability = (capabilityId: CanonicalEconomicsV2CapabilityId, limitation: string) => ({
    capability: capabilityId,
    status: approvedCapabilities.includes(capabilityId) ? "supported" as const : "unknown" as const,
    proofEvidenceRefs: proofs[capabilityId],
    limitations: [limitation],
  });
  const section = (sourceSection: string, populationSemantics: CanonicalEconomicsV2SectionAdmission["populationSemantics"],
    evidenceRefs: string[], completenessStatus?: "complete") => ({
    sourceSection, populationSemantics, completenessStatus, capabilityStatus: "supported" as const,
    evidenceRefs, limitations,
  });
  const resolution: FiservFullTemplateAdmissionResolution = {
    mappingId: FISERV_FULL_STRUCTURAL_MAPPING_ID,
    mappingVersion: FISERV_FULL_STRUCTURAL_MAPPING_VERSION,
    authorityClass: "product_owner",
    authorityRef: AUTHORITY_REF,
    matched: true,
    feeDetailCoverage: "complete_observed_occurrences",
    decision: { ...admissionDecision, matched: true },
    templateAdmission: {
      detectedFamily: "Fiserv / First Data",
      detectedTemplate: FISERV_FULL_STRUCTURAL_MAPPING_ID,
      detectedVersion: FISERV_FULL_STRUCTURAL_MAPPING_VERSION,
      identityStatus: "proven",
      admissionStatus: "admitted",
      completenessStatus: "unknown",
      admissionAuthority: { lifecycle: "admitted_with_conditions", authorityClass: "product_owner", authorityRef: AUTHORITY_REF,
        admittedAt: ADMITTED_AT, admissionVersion: FISERV_FULL_STRUCTURAL_MAPPING_VERSION, effectiveFrom: null, effectiveTo: null },
      admissionProofEvidenceRefs,
      capabilities: [
        capability("processor_identity", "Identity only; no pricing, fee category, ownership, or savings semantics follow."),
        capability("statement_period", "Only the explicitly labelled statement-period field is admitted."),
        capability("gross_sale_volume", "Gross sales are bound to the full-layout card-type control population."),
        capability("refund_volume", "Refunds reduce gross sales to submitted volume and are not fee credits."),
        capability("canonical_net_submitted_card_volume", "Summary, card-type, and batch representations must reconcile."),
        capability("gross_sale_transaction_count", "The gross-sale count remains distinct from the unadmitted submitted count."),
        capability("submitted_transaction_count", "The parser primary count remains observational because no separate submitted-count occurrence lineage exists."),
        capability("refund_transaction_count", "No refund-count population is admitted."),
        capability("fee_total", "The fee total does not establish fee ownership, margin, removability, or savings."),
        capability("funding_batches", "Funding admission covers printed row identity and reconciliation, not deposit timing or processor-statement completeness."),
        capability("settlement_adjustments", "Adjustment semantics are not admitted by this mapping."),
        capability("chargeback_financial_populations", "Chargeback principal and representment semantics are not admitted by this mapping."),
        capability("fee_detail", "Occurrence identity, sign, amount, and observed-row coverage are admitted; economic categories remain unresolved."),
        capability("reconciliation_controls", "Controls admit only their explicit relationships and tolerances."),
        capability("non_fee_financial_flow_exclusions", "Refund, adjustment, and chargeback occurrences remain excluded from processing fees and sales contribution."),
      ],
      limitations,
    },
    sectionAdmissions: [
      section("HEADER", [], proofs.statement_period),
      section("SUMMARY", ["canonical_net_submitted_card_volume", "statement_processing_fee_total"], proofs.reconciliation_controls),
      section("SUMMARY BY CARD TYPE", ["gross_sale_volume", "refund_volume", "canonical_net_submitted_card_volume",
        "gross_sale_transaction_count"], unique([...proofs.gross_sale_volume, ...proofs.refund_volume, ...proofs.gross_sale_transaction_count])),
      section("SUMMARY BY BATCH", ["canonical_net_submitted_card_volume", "funding_batches", "net_funded_amount"],
        proofs.funding_batches),
      section("TRANSACTION FEES", ["fee_occurrences"], proofs.fee_detail, "complete"),
      ...(feeSections.has("DEBIT NETWORK FEES")
        ? [section("DEBIT NETWORK FEES", ["fee_occurrences"], roleProof("fee_charge", ["DEBIT NETWORK FEES"]), "complete")]
        : []),
      section("ACCOUNT FEES", ["fee_occurrences"], proofs.fee_detail, "complete"),
      section("FEES", ["statement_processing_fee_total", "fee_occurrences"],
        unique([...proofs.fee_total, ...proofs.fee_detail]), "complete"),
      section("INTERCHANGE CHARGES / PROGRAM FEES", ["supporting_detail"],
        sectionProof(["INTERCHANGE CHARGES / PROGRAM FEES"]), "complete"),
    ],
  };
  return { decision: resolution.decision, resolution };
}

export function resolveFiservFullTemplateAdmission(input: {
  driverId: string;
  parserOutput: unknown;
  observationalFoundation: CanonicalEconomicsV2Foundation;
}): FiservFullTemplateAdmissionResolution | null {
  return evaluateFiservFullTemplateAdmission(input).resolution;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
function records(value: unknown): Record<string, any>[] { return Array.isArray(value) ? value.map(record) : []; }
function finite(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function string(value: unknown): string { return typeof value === "string" ? value : ""; }
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort(); }
