import crypto from "node:crypto";

import { documentIrFromPdfjsParsedDocument } from "../../documentIrFromPdfjs.js";
import { attachFiservDocumentSections } from "../../fiservDocumentSections.js";
import {
  extractFiservIndependentAdjustmentChargeback,
  extractFiservIndependentFundingBatchPopulation,
  qualifyFiservIndependentSplitPopulations,
  type FiservIndependentAdjustmentChargeback,
  type FiservIndependentFlowSection,
  type FiservIndependentFundingBatchPopulation,
  type FiservIndependentSplitPopulationProofs,
} from "../../fiservIndependentPopulationsFromDocumentIr.js";
import type { ParsedDocument } from "../../parser.js";
import { countFactFromNumber, moneyFactFromNumber, unavailableV2Fact } from "./facts.js";
import { buildGrossBasedRateDiagnostic, buildHeadlineAverageTicket, buildHeadlineEffectiveRate } from "./metrics.js";
import {
  buildCanonicalEconomicsV2SourceModel,
  type CanonicalEconomicsV2OccurrenceInput,
  type CanonicalEconomicsV2ProcessorPresentedCategoryAdmission,
  type CanonicalEconomicsV2RepresentationAdmission,
  type CanonicalEconomicsV2SectionAdmission,
} from "./sourceModel.js";
import type {
  CanonicalEconomicsV2CapabilityId,
  CanonicalEconomicsV2CapabilityStatus,
  CanonicalEconomicsV2CompletenessStatus,
  CanonicalEconomicsV2DocumentIntegrity,
  CanonicalEconomicsV2Fact,
  CanonicalEconomicsV2FinancialPopulations,
  CanonicalEconomicsV2Foundation,
  CanonicalEconomicsV2OccurrenceRole,
  CanonicalEconomicsV2ReconciliationReference,
  CanonicalEconomicsV2SemanticAmendment,
  CanonicalEconomicsV2SourceProvenance,
  CanonicalEconomicsV2SuppliedDocumentIntegrityStatus,
  CanonicalEconomicsV2TemplateAdmissionStatus,
  CanonicalEconomicsV2TemplateProfile,
} from "./types.js";
import { CANONICAL_ECONOMICS_V2_VERSION_MANIFEST, RB_SEMANTIC_AMENDMENT_REASONS } from "./versionManifest.js";
import { validateCanonicalEconomicsV2Foundation } from "./validate.js";

export type CanonicalEconomicsV2TemplateAdmissionInput = {
  detectedFamily?: string | null;
  detectedTemplate?: string | null;
  detectedVersion?: string | null;
  identityStatus?: "observed" | "proven" | "unknown" | "unavailable";
  admissionStatus?: CanonicalEconomicsV2TemplateAdmissionStatus;
  admissionAuthority?: CanonicalEconomicsV2TemplateProfile["admissionAuthority"];
  completenessStatus?: CanonicalEconomicsV2CompletenessStatus;
  admissionProofEvidenceRefs?: string[];
  capabilities?: Array<{
    capability: CanonicalEconomicsV2CapabilityId;
    status: CanonicalEconomicsV2CapabilityStatus;
    proofEvidenceRefs?: string[];
    limitations?: string[];
  }>;
  limitations?: string[];
};

export type CanonicalEconomicsV2DocumentIntegrityInput = {
  suppliedDocumentStatus?: CanonicalEconomicsV2SuppliedDocumentIntegrityStatus;
  observedPageCount?: number | null;
  processedPageCount?: number | null;
  fatalPageErrorCount?: number | null;
  extractionLineageComplete?: boolean | null;
  localIngestionTruncated?: boolean | null;
  expectedPageCount?: number | null;
  /** Processor-statement completeness; not supplied-document processing completeness. */
  completenessStatus?: CanonicalEconomicsV2CompletenessStatus;
  missingPageNumbers?: number[];
  proofOccurrenceKeys?: string[];
  limitations?: string[];
};

export type CanonicalEconomicsV2FeeRowAdmissionInput = {
  feeRowIndex: number;
  role: "chargeback_fee";
  basis: "approved_synthetic" | "versioned_template";
};

export type BuildCanonicalEconomicsV2FromFiservInput = {
  document: ParsedDocument;
  parserOutput: unknown;
  sourceDocumentRef: string;
  parserId: string;
  parserVersion?: string | null;
  provenanceStatus: CanonicalEconomicsV2SourceProvenance;
  templateAdmission?: CanonicalEconomicsV2TemplateAdmissionInput;
  documentIntegrity?: CanonicalEconomicsV2DocumentIntegrityInput;
  feeRowAdmissions?: CanonicalEconomicsV2FeeRowAdmissionInput[];
  sectionAdmissions?: CanonicalEconomicsV2SectionAdmission[];
  representationAdmissions?: CanonicalEconomicsV2RepresentationAdmission[];
  includeGrossBasedRateDiagnostic?: boolean;
};

export const FISERV_FEE_LEDGER_OCCURRENCE_MARKER =
  "Fee occurrence contribution is governed by authoritative fee controls, not by its label alone." as const;

/**
 * Returns only occurrences constructed from the parser's reconciled fee ledger.
 * Source labels are deliberately not used as identity or economic semantics.
 */
export function fiservFeeLedgerOccurrences(
  foundation: CanonicalEconomicsV2Foundation,
): CanonicalEconomicsV2Foundation["sourceModel"]["occurrences"] {
  return foundation.sourceModel.occurrences.filter((occurrence) =>
    occurrence.limitations.includes(FISERV_FEE_LEDGER_OCCURRENCE_MARKER),
  );
}

export function buildCanonicalEconomicsV2FromFiserv(
  input: BuildCanonicalEconomicsV2FromFiservInput,
): CanonicalEconomicsV2Foundation {
  if (input.provenanceStatus === "source_unavailable" || input.provenanceStatus === "corpus_integrity_hold") {
    throw new Error("Unavailable or corpus-held sources must use the explicit unavailable V2 foundation builder; parser observations are prohibited.");
  }
  const output = record(input.parserOutput);
  const selected = record(output.selectedFinancials);
  const identity = record(output.statementIdentity);
  const evidenceRows = records(output.evidence);
  const candidateTotals = records(output.candidateTotals);
  const feeLedger = record(output.feeLedger);
  const feeRows = records(feeLedger.rows);
  const fundingLedger = record(output.fundingBatchLedger);
  const fundingRows = records(fundingLedger.rows);
  const reconciliationRows = records(output.reconciliationResults);
  const supportingCounts = records(record(selected.transactionCount).supportingTransactionCounts);
  const documentIr = attachFiservDocumentSections(
    documentIrFromPdfjsParsedDocument(input.document, {
      id: stableId("document", input.sourceDocumentRef),
      sourceFileName: null,
    }),
  );
  const independentAdjustmentChargeback = extractFiservIndependentAdjustmentChargeback(documentIr);
  const independentSplitProofs = qualifyFiservIndependentSplitPopulations(independentAdjustmentChargeback);
  const independentFundingBatchPopulation = extractFiservIndependentFundingBatchPopulation(documentIr);
  const documentSourceFingerprint = sourceFingerprint(input.document);

  const templateInput = input.templateAdmission ?? {};
  const admittedChargebackFeeRowIndexes = admittedChargebackFeeRows({
    admissions: input.feeRowAdmissions ?? [],
    feeRows,
    provenanceStatus: input.provenanceStatus,
    templateAdmission: templateInput,
  });

  const occurrenceInputs = [
    ...buildOccurrenceInputs({
    selected,
    evidenceRows,
    candidateTotals,
    feeRows,
    fundingRows,
    supportingCounts,
    independentSplitProofs,
    independentFundingBatchPopulation,
    admittedChargebackFeeRowIndexes,
      allowParserOnlyFallback: input.provenanceStatus !== "authoritative",
    }),
    ...processorPresentedCombinedCategoryOccurrenceInputs(independentAdjustmentChargeback),
  ];
  const representationAdmissions = [
    ...automaticSubmittedRepresentationAdmissions(candidateTotals, occurrenceInputs, reconciliationRows),
    ...(input.representationAdmissions ?? []),
  ];
  const { sourceModel, occurrenceRefByKey } = buildCanonicalEconomicsV2SourceModel({
    documentIr,
    sourceDocumentRef: input.sourceDocumentRef,
    sourceFingerprint: documentSourceFingerprint,
    parserId: input.parserId,
    parserVersion: input.parserVersion ?? null,
    sectionAdmissions: input.sectionAdmissions,
    occurrences: occurrenceInputs,
    representationAdmissions,
    processorPresentedCategoryAdmissions:
      processorPresentedCombinedCategoryAdmissions(independentAdjustmentChargeback),
  });

  const refs = occurrenceAndEvidenceRefs(sourceModel);
  const financialPopulations = buildFinancialPopulations({
    selected,
    fundingLedger,
    fundingRows,
    feeLedger,
    feeRows,
    occurrenceInputs,
    occurrenceRefByKey,
    refs,
    sourceModel,
    independentSplitProofs,
    independentFundingBatchPopulation,
    provenanceStatus: input.provenanceStatus,
    templateAdmission: templateInput,
    admittedChargebackFeeRowIndexes,
  });
  const documentIntegrity = buildDocumentIntegrity({
    input: input.documentIntegrity,
    observedPageCount: documentIr.pages.length,
    sourceModel,
    occurrenceRefByKey,
  });
  for (const representation of sourceModel.processorPresentedCategories) {
    representation.completenessState = {
      suppliedDocumentStatus: documentIntegrity.suppliedDocumentStatus,
      statementCompletenessStatus: documentIntegrity.completenessStatus,
      proofEvidenceRefs: [...documentIntegrity.proofEvidenceRefs],
    };
  }
  finalizeProcessorPresentedCombinedCategories(sourceModel, financialPopulations);
  sourceModel.processorPresentedCategoryControls = processorPresentedCombinedCategoryControls({
    sourceModel,
    financialPopulations,
    provenanceStatus: input.provenanceStatus,
  });
  const reconciliation = [
    ...reconciliationReferences(reconciliationRows, financialPopulations, sourceModel),
    ...independentSplitPopulationReconciliation({
      proofs: independentSplitProofs,
      facts: financialPopulations,
      occurrenceInputs,
      occurrenceRefByKey,
      sourceModel,
      provenanceStatus: input.provenanceStatus,
    }),
    ...fundingBatchMembershipReconciliation({
      fundingLedger,
      fundingRows,
      independentPopulation: independentFundingBatchPopulation,
      fact: financialPopulations.fundingBatchCount,
      occurrenceInputs,
      occurrenceRefByKey,
      sourceModel,
      provenanceStatus: input.provenanceStatus,
    }),
  ];
  attachReconciliationRefs(sourceModel, reconciliation);

  const headlineRate = buildHeadlineEffectiveRate({
    fees: financialPopulations.totalStatementProcessingFees,
    netSubmitted: financialPopulations.canonicalNetSubmittedCardVolume,
  });
  const grossRate = input.includeGrossBasedRateDiagnostic
    ? buildGrossBasedRateDiagnostic({
        fees: financialPopulations.totalStatementProcessingFees,
        grossSales: financialPopulations.grossSaleVolume,
      })
    : null;
  const averageTicket = buildHeadlineAverageTicket({
    grossSales: financialPopulations.grossSaleVolume,
    grossSaleCount: financialPopulations.grossSaleTransactionCount,
  });
  const calculations = [headlineRate.calculation, grossRate?.calculation ?? null, averageTicket.calculation].filter(
    (calculation): calculation is NonNullable<typeof calculation> => calculation !== null,
  );

  const foundation: CanonicalEconomicsV2Foundation = {
    versionManifest: { ...CANONICAL_ECONOMICS_V2_VERSION_MANIFEST },
    identity: {
      sourceDocumentRef: input.sourceDocumentRef,
      sourceFingerprint: documentSourceFingerprint,
      sourceFingerprintStatus: "available",
      parserId: input.parserId,
      parserVersion: input.parserVersion ?? null,
      processorFamily: stringOrNull(identity.processorFamily),
      statementPeriod: statementPeriod(identity),
      currency: "USD",
      provenanceStatus: input.provenanceStatus,
    },
    templateCapability: {
      detectedFamily: templateInput.detectedFamily ?? stringOrNull(identity.statementFamily) ?? stringOrNull(identity.processorFamily),
      detectedTemplate: templateInput.detectedTemplate ?? null,
      detectedVersion: templateInput.detectedVersion ?? null,
      identityStatus: templateInput.identityStatus ?? (stringOrNull(identity.statementFamily) ? "observed" : "unknown"),
      admissionStatus: templateInput.admissionStatus ?? "unknown",
      admissionAuthority: templateInput.admissionAuthority ?? null,
      completenessStatus: templateInput.completenessStatus ?? "unknown",
      admissionProofEvidenceRefs: unique(templateInput.admissionProofEvidenceRefs ?? []),
      capabilities: (templateInput.capabilities ?? []).map((capability) => ({
        capability: capability.capability,
        status: capability.status,
        proofEvidenceRefs: unique(capability.proofEvidenceRefs ?? []),
        limitations: unique(capability.limitations ?? []),
      })),
      limitations: unique([
        ...(templateInput.limitations ?? []),
        ...(templateInput.admissionStatus === "admitted"
          ? []
          : ["Parsing success does not establish versioned template admission or processor-statement completeness."]),
      ]),
    },
    documentIntegrity,
    sourceModel,
    financialPopulations,
    metrics: {
      headlineEffectiveRate: headlineRate.metric,
      grossBasedRateDiagnostic: grossRate?.metric ?? null,
      headlineAverageTicket: averageTicket.metric,
    },
    billingAndFunding: {
      billingCadence: "unknown",
      fundingCadence: "unknown",
      submittedVolumeFactRef: financialPopulations.canonicalNetSubmittedCardVolume.id,
      thirdPartyVolumeFactRef: financialPopulations.thirdPartyTransactionVolume.id,
      adjustmentFactRef: financialPopulations.settlementAdjustmentAmount.id,
      chargebackDebitFactRef: financialPopulations.chargebackPrincipalDebitAmount.id,
      representmentFactRef: financialPopulations.chargebackRepresentmentAmount.id,
      feeFactRef: financialPopulations.totalStatementProcessingFees.id,
      fundedAmountFactRef: financialPopulations.netFundedAmount.id,
      batchCountFactRef: financialPopulations.fundingBatchCount.id,
      batchOccurrenceRefs: sourceModel.occurrences
        .filter((occurrence) => occurrence.contributionRole === "funding_only")
        .map((occurrence) => occurrence.id),
      reconciliationRefs: reconciliation.map((item) => item.id),
      limitations: ["Billing and funding cadence remains non-authoritative until a versioned template admission proves it."],
    },
    reconciliation,
    calculations,
    semanticAmendments: semanticAmendments(financialPopulations, sourceModel),
    validation: { status: "valid", errors: [], warnings: [] },
  };
  return validateCanonicalEconomicsV2Foundation(foundation);
}

function buildOccurrenceInputs(input: {
  selected: Record<string, unknown>;
  evidenceRows: Record<string, unknown>[];
  candidateTotals: Record<string, unknown>[];
  feeRows: Record<string, unknown>[];
  fundingRows: Record<string, unknown>[];
  supportingCounts: Record<string, unknown>[];
  independentSplitProofs: FiservIndependentSplitPopulationProofs;
  independentFundingBatchPopulation: FiservIndependentFundingBatchPopulation;
  admittedChargebackFeeRowIndexes: Map<number, CanonicalEconomicsV2FeeRowAdmissionInput["basis"]>;
  allowParserOnlyFallback: boolean;
}): CanonicalEconomicsV2OccurrenceInput[] {
  const occurrences: CanonicalEconomicsV2OccurrenceInput[] = [];
  for (const [index, row] of input.evidenceRows.entries()) {
    const field = stringOrNull(row.field) ?? "unknown";
    occurrences.push({
      key: `evidence:${index}:${field}`,
      sourceSection: stringOrNull(row.sourceSection) ?? "UNKNOWN",
      pageNumber: numberOrNull(row.pageNumber),
      rowIndex: integerOrNull(row.lineIndex),
      evidenceLine: stringOrNull(row.evidenceLine),
      sourceLabel: field,
      semanticRole: roleForField(field),
      printedAmount: typeof row.value === "number" ? row.value : null,
      contributionRole: /total|funded|volume|gross|refund/i.test(field) ? "supporting_detail" : "unresolved",
      confidence: "medium",
    });
  }
  for (const [index, row] of input.candidateTotals.entries()) {
    const role = stringOrNull(row.roleCandidate) ?? "unknown";
    occurrences.push({
      key: `candidate:${index}:${role}`,
      sourceSection: stringOrNull(row.sourceSection) ?? "UNKNOWN",
      pageNumber: numberOrNull(row.pageNumber),
      evidenceLine: stringOrNull(row.evidenceLine),
      sourceLabel: stringOrNull(row.label) ?? role,
      semanticRole: roleForCandidate(role),
      printedAmount: numberOrNull(row.amount),
      contributionRole: row.selected === true ? "authoritative_contributor" : "supporting_detail",
      confidence: confidence(row.confidence),
      limitations: row.selected === true ? [] : [stringOrNull(row.rejectionReason) ?? "Candidate was not selected by the existing parser."],
    });
  }
  for (const [index, row] of input.feeRows.entries()) {
    const amount = numberOrNull(row.amount);
    const description = stringOrNull(row.description) ?? "fee row";
    const role: CanonicalEconomicsV2OccurrenceRole = amount !== null && amount < 0
      ? "fee_credit"
      : input.admittedChargebackFeeRowIndexes.has(index)
        ? "chargeback_fee"
        : "fee_charge";
    occurrences.push({
      key: `fee:${index}`,
      sourceSection: stringOrNull(row.sourceSection) ?? "FEES",
      pageNumber: numberOrNull(row.pageNumber),
      evidenceLine: stringOrNull(row.evidenceLine),
      sourceLabel: description,
      semanticRole: role,
      printedAmount: amount,
      volumeBasis: numberOrNull(row.volumeBasis),
      printedRate: numberOrNull(row.rate),
      printedCount: integerOrNull(row.count),
      contributionRole: "supporting_detail",
      confidence: confidence(row.confidence),
      limitations: unique([
        FISERV_FEE_LEDGER_OCCURRENCE_MARKER,
        ...(/chargeback/i.test(description) && !input.admittedChargebackFeeRowIndexes.has(index)
          ? ["The label is only a chargeback-fee candidate; no admitted fee-row semantics established canonical chargeback-fee truth."]
          : []),
        ...(input.admittedChargebackFeeRowIndexes.has(index)
          ? [`Canonical chargeback-fee semantics were explicitly admitted by ${input.admittedChargebackFeeRowIndexes.get(index)} evidence; the label alone was not authoritative.`]
          : []),
      ]),
    });
  }
  for (const [index, row] of input.supportingCounts.entries()) {
    const role = stringOrNull(row.role) ?? "unknown";
    occurrences.push({
      key: `count:${index}:${role}`,
      sourceSection: stringOrNull(row.sourceSection) ?? "TRANSACTION COUNTS",
      pageNumber: numberOrNull(row.pageNumber),
      evidenceLine: stringOrNull(row.evidenceLine),
      sourceLabel: stringOrNull(row.reason) ?? role,
      semanticRole: roleForCount(role),
      printedCount: integerOrNull(row.value),
      contributionRole: "supporting_detail",
      confidence: "medium",
      limitations: ["The count is a deterministic parser interpretation; template admission is still required to prove its canonical population."],
    });
  }
  for (const [index, row] of input.fundingRows.entries()) {
    const common = {
      sourceSection: "SUMMARY BY BATCH",
      pageNumber: numberOrNull(row.pageNumber),
      evidenceLine: stringOrNull(row.evidenceLine),
      contributionRole: "funding_only" as const,
      confidence: "high" as const,
    };
    occurrences.push({
      ...common,
      key: `funding:${index}:submitted`,
      sourceLabel: "Funding batch amount submitted",
      semanticRole: "net_submitted",
      printedAmount: numberOrNull(row.amountSubmitted),
    });
    occurrences.push({
      ...common,
      key: `funding:${index}:third_party`,
      sourceLabel: "Funding batch third-party transactions",
      semanticRole: "third_party_funding",
      printedAmount: numberOrNull(row.thirdPartyTransactions),
    });
    occurrences.push({
      ...common,
      key: `funding:${index}:adjustment`,
      sourceLabel: "Funding batch adjustment",
      semanticRole: "supporting_representation",
      printedAmount: numberOrNull(row.adjustments),
      limitations: ["A funding-batch adjustment column is supporting net-flow evidence; it does not prove the exhaustive statement adjustment population."],
    });
    const chargeback = numberOrNull(row.chargebacks);
    occurrences.push({
      ...common,
      key: `funding:${index}:chargeback`,
      sourceLabel: "Funding batch chargeback or representment",
      semanticRole: "supporting_representation",
      printedAmount: chargeback,
      limitations: ["A signed funding-batch chargeback column may contain netted activity; zero or sign alone cannot prove gross principal or representment populations."],
    });
    occurrences.push({
      ...common,
      key: `funding:${index}:fees`,
      sourceLabel: "Funding batch fees charged",
      semanticRole: "fee_charge",
      printedAmount: numberOrNull(row.feesCharged),
    });
    occurrences.push({
      ...common,
      key: `funding:${index}:funded`,
      sourceLabel: "Funding batch amount funded",
      semanticRole: "funded_amount",
      printedAmount: numberOrNull(row.amountFunded),
    });
  }
  occurrences.push(...independentSplitOccurrenceInputs(input.independentSplitProofs));
  occurrences.push(...independentFundingBatchOccurrenceInputs(input.independentFundingBatchPopulation));
  if (input.allowParserOnlyFallback) {
    const fallbacks: Array<{ field: string; role: CanonicalEconomicsV2OccurrenceRole; label: string }> = [
      { field: "grossSales", role: "gross_sale", label: "Parser-selected gross sales" },
      { field: "refunds", role: "refund", label: "Parser-selected refunds" },
      { field: "totalVolume", role: "net_submitted", label: "Parser-selected submitted volume" },
      { field: "totalFees", role: "fee_charge", label: "Parser-selected total fees" },
      { field: "amountFunded", role: "funded_amount", label: "Parser-selected amount funded" },
      { field: "thirdPartyTransactions", role: "third_party_funding", label: "Parser-selected third-party funding" },
      { field: "adjustmentsChargebacks", role: "unresolved_adjustment_or_chargeback", label: "Parser-selected combined adjustments and chargebacks" },
    ];
    for (const fallback of fallbacks) {
      const value = numberOrNull(input.selected[fallback.field]);
      if (value === null || occurrences.some((occurrence) => occurrence.semanticRole === fallback.role)) continue;
      occurrences.push({
        key: `selected:${fallback.field}`,
        sourceSection: "SELECTED FINANCIALS",
        pageNumber: null,
        evidenceLine: null,
        sourceLabel: fallback.label,
        semanticRole: fallback.role,
        printedAmount: value,
        contributionRole: "supporting_detail",
        confidence: "needs_review",
        limitations: ["No page/line occurrence was exposed by the existing parser output; this fact remains non-authoritative observational parser evidence."],
      });
    }
  }
  return occurrences;
}

function independentSplitOccurrenceInputs(
  proofs: FiservIndependentSplitPopulationProofs,
): CanonicalEconomicsV2OccurrenceInput[] {
  const definitions = [
    ["settlementAdjustmentAmount", "settlement_adjustment"],
    ["chargebackPrincipalDebitAmount", "chargeback_principal_debit"],
    ["chargebackRepresentmentAmount", "chargeback_representment"],
  ] as const;
  return definitions.flatMap(([populationKey, semanticRole]) => {
    const proof = proofs[populationKey];
    if (proof.status !== "proven") return [];
    const sourceSection = proof.proofBasis === "separate_adjustment_section" ? "ADJUSTMENTS"
      : proof.proofBasis === "separate_chargeback_section" ? "CHARGEBACKS/REVERSALS"
        : "ADJUSTMENTS/CHARGEBACKS";
    return proof.evidence.map((evidence, index) => ({
      key: `independent-split:${populationKey}:${index}`,
      sourceSection,
      pageNumber: evidence.pageNumber,
      evidenceLine: evidence.evidenceLine,
      sourceLabel: evidence.evidenceLine,
      semanticRole,
      printedAmount: evidence.proofRole === "exhaustive_scope" ? null : evidence.value / 100,
      contributionRole: evidence.proofRole === "exhaustive_scope" ? "control_only" as const
        : evidence.proofRole === "population_value" || evidence.proofRole === "explicit_none"
          ? "authoritative_contributor" as const : "supporting_detail" as const,
      confidence: "high" as const,
      limitations: [
        `Independent split proof basis: ${proof.proofBasis}.`,
        ...proof.reasonCodes,
        ...(evidence.proofRole === "exhaustive_scope"
          ? ["This line proves the exhaustive reconciled section scope; its combined/net amount is not assigned as this split population value."]
          : []),
      ],
    }));
  });
}

type ProcessorPresentedCombinedCategorySpec = {
  categoryIdentity: "adjustments_chargebacks" | "chargebacks_reversals";
  processorPresentedLabel: "Adjustments/Chargebacks" | "Chargebacks/Reversals";
  preservedMeaning:
    | "processor_presented_combined_adjustments_chargebacks"
    | "processor_presented_combined_chargebacks_reversals";
  sourceSection: "ADJUSTMENTS/CHARGEBACKS" | "CHARGEBACKS/REVERSALS";
  semanticRole: "unresolved_adjustment_or_chargeback" | "unresolved_chargeback_or_reversal";
  section: FiservIndependentFlowSection;
};

function processorPresentedCombinedCategorySpecs(
  source: FiservIndependentAdjustmentChargeback,
): ProcessorPresentedCombinedCategorySpec[] {
  return [
    {
      categoryIdentity: "adjustments_chargebacks",
      processorPresentedLabel: "Adjustments/Chargebacks",
      preservedMeaning: "processor_presented_combined_adjustments_chargebacks",
      sourceSection: "ADJUSTMENTS/CHARGEBACKS",
      semanticRole: "unresolved_adjustment_or_chargeback",
      section: source.combined,
    },
    {
      categoryIdentity: "chargebacks_reversals",
      processorPresentedLabel: "Chargebacks/Reversals",
      preservedMeaning: "processor_presented_combined_chargebacks_reversals",
      sourceSection: "CHARGEBACKS/REVERSALS",
      semanticRole: "unresolved_chargeback_or_reversal",
      section: source.chargebacks,
    },
  ];
}

function processorPresentedCombinedCategoryOccurrenceInputs(
  source: FiservIndependentAdjustmentChargeback,
): CanonicalEconomicsV2OccurrenceInput[] {
  return processorPresentedCombinedCategorySpecs(source).flatMap((spec) => {
    if (spec.section.headingAnchors.length === 0) return [];
    const prefix = `processor-category:${spec.categoryIdentity}`;
    const common = {
      sourceSection: spec.sourceSection,
      semanticRole: spec.semanticRole,
      confidence: "high" as const,
      limitations: [
        `Processor-presented category: ${spec.processorPresentedLabel}.`,
        "This occurrence preserves combined source meaning and has no economic-contribution permission.",
      ],
    };
    return [
      ...spec.section.headingAnchors.map((anchor, index) => ({
        ...common,
        key: `${prefix}:heading:${index}`,
        pageNumber: anchor.pageNumber,
        evidenceLine: anchor.evidenceLine,
        sourceLabel: spec.processorPresentedLabel,
        contributionRole: "control_only" as const,
      })),
      ...(spec.section.printedTotal ? [{
        ...common,
        key: `${prefix}:total`,
        pageNumber: spec.section.printedTotal.pageNumber,
        evidenceLine: spec.section.printedTotal.evidenceLine,
        sourceLabel: `${spec.processorPresentedLabel} printed total`,
        printedAmount: spec.section.printedTotal.value / 100,
        contributionRole: "control_only" as const,
      }] : []),
      ...spec.section.rows.map((row, index) => ({
        ...common,
        key: `${prefix}:row:${index}`,
        pageNumber: row.pageNumber,
        evidenceLine: row.evidenceLine,
        sourceLabel: row.description,
        printedAmount: row.value / 100,
        contributionRole: "supporting_detail" as const,
      })),
      ...(spec.section.explicitNoneEvidence ? [{
        ...common,
        key: `${prefix}:explicit-none`,
        pageNumber: spec.section.explicitNoneEvidence.pageNumber,
        evidenceLine: spec.section.explicitNoneEvidence.evidenceLine,
        sourceLabel: `${spec.processorPresentedLabel} explicit no activity`,
        printedAmount: 0,
        contributionRole: "control_only" as const,
      }] : []),
    ];
  });
}

function processorPresentedCombinedCategoryAdmissions(
  source: FiservIndependentAdjustmentChargeback,
): CanonicalEconomicsV2ProcessorPresentedCategoryAdmission[] {
  return processorPresentedCombinedCategorySpecs(source).flatMap((spec) => {
    if (spec.section.headingAnchors.length === 0) return [];
    const prefix = `processor-category:${spec.categoryIdentity}`;
    const observationStatus = spec.section.coverageStatus === "ambiguous_source_scope"
      ? "withheld_ambiguous_scope" as const
      : spec.section.coverageStatus === "incomplete_source_scope"
        ? "withheld_incomplete_scope" as const : "observed" as const;
    const occurrenceKeys = [
      ...spec.section.headingAnchors.map((_anchor, index) => `${prefix}:heading:${index}`),
      ...(spec.section.printedTotal ? [`${prefix}:total`] : []),
      ...spec.section.rows.map((_row, index) => `${prefix}:row:${index}`),
      ...(spec.section.explicitNoneEvidence ? [`${prefix}:explicit-none`] : []),
    ];
    return [{
      key: spec.categoryIdentity,
      categoryIdentity: spec.categoryIdentity,
      processorPresentedLabel: spec.processorPresentedLabel,
      preservedMeaning: spec.preservedMeaning,
      observationStatus,
      observedAmountMinor: observationStatus === "observed" ? spec.section.printedTotal?.value ?? null : null,
      coverageStatus: spec.section.coverageStatus === "not_observed"
        ? "incomplete_source_scope" : spec.section.coverageStatus,
      occurrenceKeys,
      limitations: [
        ...(spec.section.coverageStatus === "printed_total_only"
          ? ["The printed category total is observable, but no exhaustive detail rows or explicit no-activity statement were found."] : []),
        ...(spec.section.coverageStatus === "unreconciled_detail"
          ? ["The printed category total and visible detail rows do not reconcile; stronger split semantics are withheld."] : []),
        ...(observationStatus !== "observed"
          ? ["Source scope is not unique and complete enough to select a category amount."] : []),
      ],
    }];
  });
}

function independentFundingBatchOccurrenceInputs(
  population: FiservIndependentFundingBatchPopulation,
): CanonicalEconomicsV2OccurrenceInput[] {
  if (population.status === "not_mapped" || population.populationAnchor === null) return [];
  const rows = population.rows.map((row, index): CanonicalEconomicsV2OccurrenceInput => ({
    key: `independent-funding-batch:row:${index}`,
    sourceSection: "AMOUNTS FUNDED BY BATCH",
    pageNumber: row.pageNumber,
    evidenceLine: row.evidenceLine,
    sourceLabel: `Source funding batch ${row.batchNumber}`,
    semanticRole: "supporting_representation",
    contributionRole: "control_only",
    confidence: "high",
    limitations: [
      "The source row proves one member of the funding-batch population; it does not authorize funding economics or cadence.",
    ],
  }));
  return [
    ...rows,
    {
      key: "independent-funding-batch:population-anchor",
      sourceSection: "AMOUNTS FUNDED BY BATCH",
      pageNumber: population.populationAnchor.pageNumber,
      evidenceLine: population.populationAnchor.evidenceLine,
      sourceLabel: "Printed funding-batch population boundary",
      semanticRole: "subtotal_or_control",
      printedCount: population.count,
      contributionRole: "control_only",
      confidence: "high",
      limitations: [
        "This printed total bounds the independently observed batch rows; it is not itself a batch member.",
      ],
    },
  ];
}

function buildFinancialPopulations(input: {
  selected: Record<string, unknown>;
  fundingLedger: Record<string, unknown>;
  fundingRows: Record<string, unknown>[];
  feeLedger: Record<string, unknown>;
  feeRows: Record<string, unknown>[];
  occurrenceInputs: CanonicalEconomicsV2OccurrenceInput[];
  occurrenceRefByKey: Map<string, string>;
  refs: Map<CanonicalEconomicsV2OccurrenceRole, { occurrenceRefs: string[]; evidenceRefs: string[] }>;
  sourceModel: CanonicalEconomicsV2Foundation["sourceModel"];
  independentSplitProofs: FiservIndependentSplitPopulationProofs;
  independentFundingBatchPopulation: FiservIndependentFundingBatchPopulation;
  provenanceStatus: CanonicalEconomicsV2SourceProvenance;
  templateAdmission: CanonicalEconomicsV2TemplateAdmissionInput;
  admittedChargebackFeeRowIndexes: Map<number, CanonicalEconomicsV2FeeRowAdmissionInput["basis"]>;
}): CanonicalEconomicsV2FinancialPopulations {
  const occurrenceRefs = (role: CanonicalEconomicsV2OccurrenceRole) => input.refs.get(role)?.occurrenceRefs ?? [];
  const evidenceRefs = (role: CanonicalEconomicsV2OccurrenceRole) => input.refs.get(role)?.evidenceRefs ?? [];
  const selectedWithOccurrence = (field: string, role: CanonicalEconomicsV2OccurrenceRole,
    capability: CanonicalEconomicsV2CapabilityId) =>
    capabilityValueAllowed(input.templateAdmission, capability) && occurrenceRefs(role).length > 0
      ? numberOrNull(input.selected[field]) : null;
  const selectedTransaction = record(input.selected.transactionCount);
  const supportingCounts = records(selectedTransaction.supportingTransactionCounts);
  const observedGrossCount = uniqueSupportingCount(supportingCounts, ["gross_sale_items", "gross_sale_transactions"]);
  const grossCountPopulationProven = input.provenanceStatus === "approved_synthetic" || hasAdmittedGrossSaleCountCapability(input.templateAdmission);
  const grossCount = grossCountPopulationProven ? observedGrossCount : { state: "unavailable", value: null } as const;
  const refundCount = capabilityValueAllowed(input.templateAdmission, "refund_transaction_count")
    ? uniqueSupportingCount(supportingCounts, ["refunds", "refund_count", "refund_transactions"])
    : { state: "unavailable", value: null } as const;
  const submittedCount = capabilityValueAllowed(input.templateAdmission, "submitted_transaction_count")
    ? uniqueSupportingCount(supportingCounts, ["submitted_transactions"])
    : { state: "unavailable", value: null } as const;
  const settledCount = uniqueSupportingCount(supportingCounts, ["settled_transactions"]);
  const authorizationCount = uniqueSupportingCount(supportingCounts, ["authorizations", "authorization_count"]);
  const fundingSeparated = ["reconciled", "reconciled_with_warnings"].includes(stringOrNull(input.fundingLedger.status) ?? "") && input.fundingRows.length > 0;
  const feeCreditValues = ["reconciled", "reconciled_with_rounding_delta"].includes(stringOrNull(input.feeLedger.status) ?? "")
    ? input.feeRows.map((row) => numberOrNull(row.amount)).filter((value): value is number => value !== null && value < 0)
    : [];
  const chargebackFeeValues = input.feeRows
    .filter((_row, index) => input.admittedChargebackFeeRowIndexes.has(index))
    .map((row) => numberOrNull(row.amount))
    .filter((value): value is number => value !== null && value > 0);
  const combined = numberOrNull(input.selected.adjustmentsChargebacks);
  const legacyParserBatchCount = fundingSeparated
    ? input.fundingRows.filter((row) => numberOrNull(row.amountSubmitted) !== null).length
    : null;
  const rbBatchMembership = rbSubmittedFundingBatchMembership(input.fundingLedger, input.fundingRows);
  const parserBatchCount = rbBatchMembership.count;
  const independentBatchCount = input.independentFundingBatchPopulation.count;
  const independentlyBoundedBatchPopulation = input.independentFundingBatchPopulation.status !== "not_mapped"
    && independentBatchCount !== null;
  const batchCount = input.provenanceStatus === "approved_synthetic" ? legacyParserBatchCount : null;
  const batchRefs = input.provenanceStatus === "approved_synthetic"
    ? exactOccurrenceRefs(input, "funding:")
    : exactOccurrenceRefs(input, "independent-funding-batch:");
  const batchCountLimitations = input.provenanceStatus === "approved_synthetic"
    ? ["A reconciled funding-batch population was not available."]
    : !fundingSeparated
      ? ["The existing RB funding ledger did not expose a reconciled batch population."]
      : rbBatchMembership.limitation
        ? [rbBatchMembership.limitation]
      : !independentlyBoundedBatchPopulation
        ? [
            "Funding batch count was withheld because independent DocumentIR evidence could not bound and enumerate the source population.",
            ...input.independentFundingBatchPopulation.limitations,
          ]
        : parserBatchCount !== independentBatchCount
          ? [
              `Funding batch count was withheld because RB counted ${parserBatchCount} rows while independent source membership proved ${independentBatchCount}; control or summary rows cannot be silently counted as batches.`,
            ]
          : [
              `Shadow controls agree on ${parserBatchCount} submitted funding batches, but funding-batch authority has not been granted; the fact remains withheld.`,
              ...input.independentFundingBatchPopulation.limitations,
            ];
  const splitRefs = (populationKey: keyof FiservIndependentSplitPopulationProofs) =>
    exactOccurrenceRefs(input, `independent-split:${populationKey}:`);
  const adjustmentRefs = splitRefs("settlementAdjustmentAmount");
  const principalRefs = splitRefs("chargebackPrincipalDebitAmount");
  const representmentRefs = splitRefs("chargebackRepresentmentAmount");
  const adjustmentCapabilityAllowed = capabilityValueAllowed(input.templateAdmission, "settlement_adjustments");
  const chargebackCapabilityAllowed = capabilityValueAllowed(input.templateAdmission, "chargeback_financial_populations");
  const splitUnavailableLimitations = (
    proof: FiservIndependentSplitPopulationProofs[keyof FiservIndependentSplitPopulationProofs],
    capabilityAllowed: boolean,
    fallback: string,
  ) => proof.status !== "proven"
    ? [fallback, ...proof.reasonCodes]
    : capabilityAllowed ? [fallback]
      : ["Independent source evidence was observed, but the claim-specific RB template capability is not admitted; the fact remains withheld.",
        ...proof.reasonCodes];

  return {
    grossSaleVolume: moneyFactFromNumber({
      id: "fact_v2_gross_sale_volume",
      population: "gross_sale_volume",
      value: selectedWithOccurrence("grossSales", "gross_sale", "gross_sale_volume"),
      provenanceStatus: provenanceForCapability(input.templateAdmission, "gross_sale_volume", input.provenanceStatus),
      evidenceRefs: evidenceRefs("gross_sale"),
      occurrenceRefs: occurrenceRefs("gross_sale"),
      limitationsIfUnavailable: ["The deterministic parser did not expose a proven gross-sale volume population."],
    }),
    refundVolume: moneyFactFromNumber({
      id: "fact_v2_refund_volume",
      population: "refund_volume",
      value: selectedWithOccurrence("refunds", "refund", "refund_volume"),
      provenanceStatus: provenanceForCapability(input.templateAdmission, "refund_volume", input.provenanceStatus),
      evidenceRefs: evidenceRefs("refund"),
      occurrenceRefs: occurrenceRefs("refund"),
      limitationsIfUnavailable: ["The deterministic parser did not expose a proven refund-volume population."],
    }),
    canonicalNetSubmittedCardVolume: moneyFactFromNumber({
      id: "fact_v2_canonical_net_submitted_card_volume",
      population: "canonical_net_submitted_card_volume",
      value: selectedWithOccurrence("totalVolume", "net_submitted", "canonical_net_submitted_card_volume"),
      provenanceStatus: provenanceForCapability(input.templateAdmission, "canonical_net_submitted_card_volume", input.provenanceStatus),
      evidenceRefs: evidenceRefs("net_submitted"),
      occurrenceRefs: occurrenceRefs("net_submitted"),
      limitationsIfUnavailable: ["Canonical net submitted card volume is unavailable."],
    }),
    thirdPartyTransactionVolume: moneyFactFromNumber({
      id: "fact_v2_third_party_transaction_volume",
      population: "third_party_transaction_volume",
      value: selectedWithOccurrence("thirdPartyTransactions", "third_party_funding", "funding_batches"),
      provenanceStatus: input.provenanceStatus,
      evidenceRefs: evidenceRefs("third_party_funding"),
      occurrenceRefs: occurrenceRefs("third_party_funding"),
      limitationsIfUnavailable: ["Third-party transaction volume was not separately proven."],
    }),
    totalStatementProcessingFees: moneyFactFromNumber({
      id: "fact_v2_total_statement_processing_fees",
      population: "total_statement_processing_fees",
      value: selectedWithOccurrence("totalFees", "fee_charge", "fee_total"),
      provenanceStatus: provenanceForCapability(input.templateAdmission, "fee_total", input.provenanceStatus),
      evidenceRefs: evidenceRefs("fee_charge"),
      occurrenceRefs: occurrenceRefs("fee_charge"),
      limitationsIfUnavailable: ["The unique authoritative statement-processing-fee total is unavailable."],
    }),
    feeCreditAmount: moneyFactFromNumber({
      id: "fact_v2_fee_credit_amount",
      population: "fee_credit_amount",
      value: capabilityValueAllowed(input.templateAdmission, "fee_detail") && feeCreditValues.length > 0
        ? Math.abs(sum(feeCreditValues)) : null,
      provenanceStatus: input.provenanceStatus,
      evidenceRefs: evidenceRefs("fee_credit"),
      occurrenceRefs: occurrenceRefs("fee_credit"),
      limitationsIfUnavailable: ["No reconciled authoritative fee-section credit population was proven."],
    }),
    settlementAdjustmentAmount: moneyFactFromNumber({
      id: "fact_v2_settlement_adjustment_amount",
      population: "settlement_adjustment_amount",
      value: adjustmentCapabilityAllowed
        && input.independentSplitProofs.settlementAdjustmentAmount.status === "proven"
        ? input.independentSplitProofs.settlementAdjustmentAmount.valueMinor! / 100 : null,
      provenanceStatus: provenanceForCapability(input.templateAdmission, "settlement_adjustments", input.provenanceStatus),
      evidenceRefs: adjustmentRefs.evidenceRefs,
      occurrenceRefs: adjustmentRefs.occurrenceRefs,
      confidence: "high",
      limitationsIfUnavailable: splitUnavailableLimitations(
        input.independentSplitProofs.settlementAdjustmentAmount,
        adjustmentCapabilityAllowed,
        "Settlement adjustments were withheld because no independently exhaustive reconciled detail section or explicit no-activity evidence proved the population.",
      ),
    }),
    chargebackPrincipalDebitAmount: moneyFactFromNumber({
      id: "fact_v2_chargeback_principal_debit_amount",
      population: "chargeback_principal_debit_amount",
      value: chargebackCapabilityAllowed
        && input.independentSplitProofs.chargebackPrincipalDebitAmount.status === "proven"
        ? input.independentSplitProofs.chargebackPrincipalDebitAmount.valueMinor! / 100 : null,
      provenanceStatus: provenanceForCapability(input.templateAdmission, "chargeback_financial_populations", input.provenanceStatus),
      evidenceRefs: principalRefs.evidenceRefs,
      occurrenceRefs: principalRefs.occurrenceRefs,
      confidence: "high",
      limitationsIfUnavailable: splitUnavailableLimitations(
        input.independentSplitProofs.chargebackPrincipalDebitAmount,
        chargebackCapabilityAllowed,
        "Gross chargeback principal debits were withheld because batch-net values, signs, and missing rows do not prove the population.",
      ),
    }),
    chargebackRepresentmentAmount: moneyFactFromNumber({
      id: "fact_v2_chargeback_representment_amount",
      population: "chargeback_representment_amount",
      value: chargebackCapabilityAllowed
        && input.independentSplitProofs.chargebackRepresentmentAmount.status === "proven"
        ? input.independentSplitProofs.chargebackRepresentmentAmount.valueMinor! / 100 : null,
      provenanceStatus: provenanceForCapability(input.templateAdmission, "chargeback_financial_populations", input.provenanceStatus),
      evidenceRefs: representmentRefs.evidenceRefs,
      occurrenceRefs: representmentRefs.occurrenceRefs,
      confidence: "high",
      limitationsIfUnavailable: splitUnavailableLimitations(
        input.independentSplitProofs.chargebackRepresentmentAmount,
        chargebackCapabilityAllowed,
        "Gross chargeback representments were withheld because batch-net values, signs, and missing positive rows do not prove the population.",
      ),
    }),
    chargebackFeeAmount: moneyFactFromNumber({
      id: "fact_v2_chargeback_fee_amount",
      population: "chargeback_fee_amount",
      value: capabilityValueAllowed(input.templateAdmission, "fee_detail") && chargebackFeeValues.length > 0
        ? sum(chargebackFeeValues) : null,
      provenanceStatus: input.provenanceStatus,
      evidenceRefs: evidenceRefs("chargeback_fee"),
      occurrenceRefs: occurrenceRefs("chargeback_fee"),
      limitationsIfUnavailable: ["No chargeback-fee occurrence was proven in the fee population."],
    }),
    netFundedAmount: moneyFactFromNumber({
      id: "fact_v2_net_funded_amount",
      population: "net_funded_amount",
      value: selectedWithOccurrence("amountFunded", "funded_amount", "funding_batches"),
      provenanceStatus: input.provenanceStatus,
      evidenceRefs: evidenceRefs("funded_amount"),
      occurrenceRefs: occurrenceRefs("funded_amount"),
      limitationsIfUnavailable: ["Net funded amount is unavailable."],
    }),
    unresolvedAdjustmentChargebackAmount: unavailableV2Fact({
      id: "fact_v2_unresolved_adjustment_chargeback_amount",
      population: "unresolved_adjustment_chargeback_amount",
      provenanceStatus: input.provenanceStatus,
      evidenceRefs: evidenceRefs("unresolved_adjustment_or_chargeback"),
      occurrenceRefs: occurrenceRefs("unresolved_adjustment_or_chargeback"),
      limitations: [combined === null
          ? "No combined adjustment/chargeback amount was observed as a financial fact."
          : occurrenceRefs("unresolved_adjustment_or_chargeback").length === 0
            ? "The selected combined adjustment/chargeback value lacked source occurrence lineage and was not admitted."
            : "The processor-presented combined adjustments/chargebacks category is preserved in the source representation model only; it has no canonical contribution authority."],
    }),
    grossSaleTransactionCount: countFactWithAmbiguity({
      id: "fact_v2_gross_sale_transaction_count",
      population: "gross_sale_transaction_count",
      result: grossCount,
      provenanceStatus: provenanceForCapability(input.templateAdmission, "gross_sale_transaction_count", input.provenanceStatus),
      evidenceRefs: evidenceRefs("gross_sale_count"),
      occurrenceRefs: occurrenceRefs("gross_sale_count"),
      unavailableReason: grossCountPopulationProven
        ? "No unique count explicitly identified as gross-sale transactions was proven; card-type and submitted counts are not substitutes."
        : "Gross-sale count requires an admitted claim-specific template capability with population proof; parser success or a card-type subtotal is insufficient.",
    }),
    refundTransactionCount: countFactWithAmbiguity({
      id: "fact_v2_refund_transaction_count",
      population: "refund_transaction_count",
      result: refundCount,
      provenanceStatus: input.provenanceStatus,
      evidenceRefs: evidenceRefs("refund_count"),
      occurrenceRefs: occurrenceRefs("refund_count"),
      unavailableReason: "No unique refund transaction count was proven.",
    }),
    submittedTransactionCount: countFactWithAmbiguity({
      id: "fact_v2_submitted_transaction_count",
      population: "submitted_transaction_count",
      result: submittedCount,
      provenanceStatus: provenanceForCapability(input.templateAdmission, "submitted_transaction_count", input.provenanceStatus),
      evidenceRefs: evidenceRefs("submitted_count"),
      occurrenceRefs: occurrenceRefs("submitted_count"),
      unavailableReason: "No count explicitly identified as submitted transactions was proven.",
    }),
    settledTransactionCount: countFactWithAmbiguity({
      id: "fact_v2_settled_transaction_count",
      population: "settled_transaction_count",
      result: settledCount,
      provenanceStatus: input.provenanceStatus,
      evidenceRefs: evidenceRefs("settled_count"),
      occurrenceRefs: occurrenceRefs("settled_count"),
      unavailableReason: "No count explicitly identified as settled transactions was proven.",
    }),
    authorizationCount: countFactWithAmbiguity({
      id: "fact_v2_authorization_count",
      population: "authorization_count",
      result: authorizationCount,
      provenanceStatus: input.provenanceStatus,
      evidenceRefs: evidenceRefs("authorization_count"),
      occurrenceRefs: occurrenceRefs("authorization_count"),
      unavailableReason: "No unique authorization count was proven.",
    }),
    chargebackCount: unavailableV2Fact({
      id: "fact_v2_chargeback_count",
      population: "chargeback_count",
      provenanceStatus: input.provenanceStatus,
      limitations: ["Funding rows and chargeback fee events do not prove a chargeback-principal event count."],
    }),
    fundingBatchCount: countFactFromNumber({
      id: "fact_v2_funding_batch_count",
      population: "funding_batch_count",
      value: capabilityValueAllowed(input.templateAdmission, "funding_batches") ? batchCount : null,
      provenanceStatus: input.provenanceStatus,
      evidenceRefs: batchRefs.evidenceRefs,
      occurrenceRefs: batchRefs.occurrenceRefs,
      limitationsIfUnavailable: batchCountLimitations,
    }),
  };
}

function finalizeProcessorPresentedCombinedCategories(
  sourceModel: CanonicalEconomicsV2Foundation["sourceModel"],
  facts: CanonicalEconomicsV2FinancialPopulations,
): void {
  const factByKey = {
    settlementAdjustmentAmount: facts.settlementAdjustmentAmount,
    chargebackPrincipalDebitAmount: facts.chargebackPrincipalDebitAmount,
    chargebackRepresentmentAmount: facts.chargebackRepresentmentAmount,
  } as const;
  const independentlyProven = (key: keyof typeof factByKey) => {
    const fact = factByKey[key];
    return fact.status === "available" && fact.value !== null && fact.occurrenceRefs.some((occurrenceRef) =>
      sourceModel.occurrences.find((occurrence) => occurrence.id === occurrenceRef)?.limitations.some((limitation) =>
        limitation.startsWith("Independent split proof basis:")));
  };
  for (const representation of sourceModel.processorPresentedCategories) {
    const splitKeys = representation.categoryIdentity === "adjustments_chargebacks"
      ? ["settlementAdjustmentAmount", "chargebackPrincipalDebitAmount", "chargebackRepresentmentAmount"] as const
      : ["chargebackPrincipalDebitAmount"] as const;
    const provenKeys = splitKeys.filter(independentlyProven);
    representation.independentlyProvenSplitFactRefs = provenKeys.map((key) => factByKey[key].id);
    if (representation.categoryIdentity === "chargebacks_reversals") {
      representation.limitations = unique([
        ...representation.limitations,
        "Representment is not treated as reversal. A split-net comparison requires a separately proven first-class reversal population, which RB does not currently model.",
      ]);
      continue;
    }
    if (representation.observedAmount === null || provenKeys.length !== splitKeys.length) continue;
    const principal = facts.chargebackPrincipalDebitAmount.value!.amountMinor;
    const representment = facts.chargebackRepresentmentAmount.value!.amountMinor;
    const splitNet = representation.categoryIdentity === "adjustments_chargebacks"
      ? facts.settlementAdjustmentAmount.value!.amountMinor - principal + representment
      : -principal + representment;
    representation.contradictionState = Math.abs(representation.observedAmount.amountMinor - splitNet) <= 1
      ? "matches_independently_proven_splits" : "contradicts_independently_proven_splits";
    representation.limitations = unique([
      ...representation.limitations,
      representation.contradictionState === "matches_independently_proven_splits"
        ? "The combined source amount matches the independently proven split net within one cent; both knowledge levels remain distinct and non-additive."
        : "The combined source amount contradicts the independently proven split net; both observations are retained, and no contribution authority is created.",
    ]);
  }
}

function processorPresentedCombinedCategoryControls(input: {
  sourceModel: CanonicalEconomicsV2Foundation["sourceModel"];
  financialPopulations: CanonicalEconomicsV2FinancialPopulations;
  provenanceStatus: CanonicalEconomicsV2SourceProvenance;
}): CanonicalEconomicsV2Foundation["sourceModel"]["processorPresentedCategoryControls"] {
  if (input.provenanceStatus === "approved_synthetic") return [];
  return (["adjustments_chargebacks", "chargebacks_reversals"] as const).map((categoryIdentity) => {
    const representation = input.sourceModel.processorPresentedCategories.find((item) =>
      item.categoryIdentity === categoryIdentity);
    const occurrences = representation
      ? representation.sourceProvenance.occurrenceRefs.map((ref) =>
          input.sourceModel.occurrences.find((occurrence) => occurrence.id === ref))
        .filter((occurrence): occurrence is NonNullable<typeof occurrence> => Boolean(occurrence))
      : [];
    const headingCount = occurrences.filter((occurrence) =>
      occurrence.sourceLabel === representation?.processorPresentedLabel).length;
    const detailAmounts = occurrences.filter((occurrence) => occurrence.contributionRole === "supporting_detail")
      .map((occurrence) => occurrence.printedAmount?.amountMinor)
      .filter((value): value is number => value !== undefined);
    const visibleDetailRowSumMinor = detailAmounts.length > 0
      ? detailAmounts.reduce((sum, value) => sum + value, 0) : null;
    const independentlyProvenSplitNetMinor = independentlyProvenSplitNet(representation, input.financialPopulations);
    const status = !representation || representation.observationStatus === "withheld_incomplete_scope"
      ? "missing_input" as const
      : representation.observationStatus === "withheld_ambiguous_scope"
        || representation.coverageStatus === "unreconciled_detail"
        || representation.contradictionState === "contradicts_independently_proven_splits"
        ? "fail" as const : "pass" as const;
    const calculation = !representation ? "not_runnable" as const
      : representation.contradictionState !== "not_comparable"
        ? "printed_category_amount_equals_independently_proven_split_net" as const
        : visibleDetailRowSumMinor !== null
          ? "visible_detail_sum_equals_printed_total" as const
          : "preserve_printed_category_amount" as const;
    const id = stableId("source-representation-control", `${categoryIdentity}:${status}`);
    if (representation) representation.controlRefs = [id];
    return {
      id,
      controlIdentity: `processor_presented_combined_category:${categoryIdentity}` as const,
      categoryIdentity,
      representationRef: representation?.id ?? null,
      status,
      sourceScope: representation?.coverageStatus ?? "not_observed" as const,
      inputs: {
        headingCount,
        printedTotalMinor: representation?.observedAmount?.amountMinor ?? null,
        visibleDetailRowSumMinor,
        independentlyProvenSplitNetMinor,
      },
      calculation,
      toleranceMinor: 1 as const,
      occurrenceRefs: representation?.sourceProvenance.occurrenceRefs ?? [],
      evidenceRefs: representation?.sourceProvenance.evidenceRefs ?? [],
      exclusionConditions: [
        "duplicate_or_ambiguous_category_heading",
        "incomplete_category_scope",
        "unreconciled_visible_detail",
        "combined_and_split_value_contradiction",
        "subtype_not_independently_proven",
      ],
      authorityEffect: "none_observation_only" as const,
      limitations: unique([
        "This control validates only the processor-presented category observation and never grants financial authority.",
        "A pass cannot create adjustment, principal, representment, reversal, lifecycle, funding, fee, or downstream economic truth.",
        ...(status === "missing_input" ? ["The category was absent or its source scope was incomplete."] : []),
        ...(status === "fail" ? ["The category is retained as evidence but stronger interpretation remains withheld."] : []),
      ]),
    };
  });
}

function independentlyProvenSplitNet(
  representation: CanonicalEconomicsV2Foundation["sourceModel"]["processorPresentedCategories"][number] | undefined,
  facts: CanonicalEconomicsV2FinancialPopulations,
): number | null {
  if (!representation) return null;
  if (representation.categoryIdentity === "chargebacks_reversals") return null;
  const requiredRefs = representation.categoryIdentity === "adjustments_chargebacks"
    ? [facts.settlementAdjustmentAmount.id, facts.chargebackPrincipalDebitAmount.id,
        facts.chargebackRepresentmentAmount.id]
    : [];
  if (!requiredRefs.every((ref) => representation.independentlyProvenSplitFactRefs.includes(ref))) return null;
  const principal = facts.chargebackPrincipalDebitAmount.value?.amountMinor;
  const representment = facts.chargebackRepresentmentAmount.value?.amountMinor;
  if (principal === undefined || representment === undefined) return null;
  const adjustment = facts.settlementAdjustmentAmount.value?.amountMinor;
  return adjustment === undefined ? null : adjustment - principal + representment;
}

function reconciliationReferences(
  rows: Record<string, unknown>[],
  facts: CanonicalEconomicsV2FinancialPopulations,
  sourceModel: CanonicalEconomicsV2Foundation["sourceModel"],
): CanonicalEconomicsV2ReconciliationReference[] {
  return rows.map((row, index) => {
    const identity = stringOrNull(row.identity) ?? `unknown_control_${index}`;
    const evidence = record(row.evidence);
    const section = stringOrNull(evidence.section);
    const occurrenceRefs = section
      ? sourceModel.occurrences.filter((occurrence) => sourceModel.sections.find((item) => item.id === occurrence.sectionRef)?.heading.toLowerCase() === section.toLowerCase()).map((item) => item.id)
      : [];
    return {
      id: reconciliationReferenceId(row, index),
      implementation: "existing_procedural_fiserv",
      controlScope: "global_financial",
      controlIdentity: identity,
      status: reconciliationStatus(stringOrNull(row.status)),
      factRefs: reconciliationFactRefs(identity, facts),
      occurrenceRefs,
      evidenceRefs: occurrenceRefs
        .map((ref) => sourceModel.occurrences.find((occurrence) => occurrence.id === ref)?.evidenceRef)
        .filter((value): value is string => Boolean(value)),
      tolerance: numberOrNull(row.toleranceBand) === null ? null : String(numberOrNull(row.toleranceBand)),
      limitations: [],
    };
  });
}

function independentSplitPopulationReconciliation(input: {
  proofs: FiservIndependentSplitPopulationProofs;
  facts: CanonicalEconomicsV2FinancialPopulations;
  occurrenceInputs: CanonicalEconomicsV2OccurrenceInput[];
  occurrenceRefByKey: Map<string, string>;
  sourceModel: CanonicalEconomicsV2Foundation["sourceModel"];
  provenanceStatus: CanonicalEconomicsV2SourceProvenance;
}): CanonicalEconomicsV2ReconciliationReference[] {
  if (input.provenanceStatus === "approved_synthetic") return [];
  const definitions = [
    ["settlementAdjustmentAmount", input.facts.settlementAdjustmentAmount.id],
    ["chargebackPrincipalDebitAmount", input.facts.chargebackPrincipalDebitAmount.id],
    ["chargebackRepresentmentAmount", input.facts.chargebackRepresentmentAmount.id],
  ] as const;
  return definitions.map(([populationKey, factRef]) => {
    const proof = input.proofs[populationKey];
    const refs = exactOccurrenceRefs(input, `independent-split:${populationKey}:`);
    return {
      id: stableId("reconciliation", `independent_split_population:${populationKey}:${proof.status}`),
      implementation: "independent_document_ir",
      controlScope: "claim_specific_fact",
      controlIdentity: `independent_split_population:${populationKey}`,
      status: proof.status === "proven" ? "pass" : "missing_input",
      factRefs: [factRef],
      occurrenceRefs: refs.occurrenceRefs,
      evidenceRefs: refs.evidenceRefs,
      tolerance: "exact source population proof; amount reconciliation absolute <= 0.01",
      limitations: proof.status === "proven"
        ? [
            `Proof basis: ${proof.proofBasis}.`,
            "This control proves only its named split population and has no dependency on funding-ledger status.",
            ...proof.reasonCodes,
          ]
        : [
            "The named split population remains unresolved; missing population members are not treated as zero.",
            ...proof.reasonCodes,
          ],
    };
  });
}

function fundingBatchMembershipReconciliation(input: {
  fundingLedger: Record<string, unknown>;
  fundingRows: Record<string, unknown>[];
  independentPopulation: FiservIndependentFundingBatchPopulation;
  fact: CanonicalEconomicsV2FinancialPopulations["fundingBatchCount"];
  occurrenceInputs: CanonicalEconomicsV2OccurrenceInput[];
  occurrenceRefByKey: Map<string, string>;
  sourceModel: CanonicalEconomicsV2Foundation["sourceModel"];
  provenanceStatus: CanonicalEconomicsV2SourceProvenance;
}): CanonicalEconomicsV2ReconciliationReference[] {
  if (input.provenanceStatus === "approved_synthetic") return [];
  const rbMembership = rbSubmittedFundingBatchMembership(input.fundingLedger, input.fundingRows);
  const parserCount = rbMembership.count;
  const sourceCount = input.independentPopulation.count;
  const refs = exactOccurrenceRefs(input, "independent-funding-batch:");
  const status: CanonicalEconomicsV2ReconciliationReference["status"] = parserCount === null || sourceCount === null
    ? "missing_input"
    : parserCount === sourceCount ? "pass" : "fail";
  const limitation = status === "pass"
    ? "RB row membership agrees with the independently bounded source funding-batch population."
    : status === "fail"
      ? `RB row membership (${parserCount}) disagrees with the independently bounded source funding-batch population (${sourceCount}); no count is admitted.`
      : rbMembership.limitation
        ?? "The funding-batch membership control could not run because RB or independent DocumentIR population evidence was unavailable.";
  return [{
    id: stableId(
      "reconciliation",
      `funding_batch_population_membership:${parserCount ?? "missing"}:${sourceCount ?? "missing"}`,
    ),
    implementation: "independent_document_ir",
    controlScope: "claim_specific_fact",
    controlIdentity: "funding_batch_population_membership",
    status,
    factRefs: [input.fact.id],
    occurrenceRefs: refs.occurrenceRefs,
    evidenceRefs: refs.evidenceRefs,
    tolerance: "0 rows",
    limitations: [limitation],
  }];
}

function rbSubmittedFundingBatchMembership(
  fundingLedger: Record<string, unknown>,
  fundingRows: Record<string, unknown>[],
): { count: number | null; limitation: string | null } {
  const reconciled = ["reconciled", "reconciled_with_warnings"].includes(
    stringOrNull(fundingLedger.status) ?? "",
  );
  if (!reconciled || fundingRows.length === 0) {
    return { count: null, limitation: "RB has no reconciled funding ledger from which to qualify submitted-batch membership." };
  }
  const identities = fundingRows.flatMap((row) => {
    const date = stringOrNull(row.dateSubmitted);
    const batch = stringOrNull(row.batchNumber);
    const submitted = numberOrNull(row.amountSubmitted);
    if (!date || !/^\d{2}\/\d{2}(?:\/\d{2})?$/.test(date) || !batch || submitted === null || submitted <= 0) return [];
    return [`${date}|${batch}`];
  });
  const duplicate = identities.find((identity, index) => identities.indexOf(identity) !== index);
  if (duplicate) {
    return {
      count: null,
      limitation: `RB observed duplicate submitted funding-batch identity ${duplicate}; membership is ambiguous and no count is admitted.`,
    };
  }
  return { count: identities.length, limitation: null };
}

function automaticSubmittedRepresentationAdmissions(
  candidates: Record<string, unknown>[],
  occurrences: CanonicalEconomicsV2OccurrenceInput[],
  reconciliationRows: Record<string, unknown>[],
): CanonicalEconomicsV2RepresentationAdmission[] {
  const crossReferencePassed = reconciliationRows.some((row) =>
    /^cross_reference:/.test(stringOrNull(row.identity) ?? "") &&
    ["RECON_OK", "RECON_ROUNDING"].includes(stringOrNull(row.status) ?? ""),
  );
  if (!crossReferencePassed) return [];
  const keys = occurrences
    .filter((occurrence) => occurrence.semanticRole === "net_submitted" && occurrence.contributionRole !== "funding_only")
    .map((occurrence) => occurrence.key);
  const selectedIndex = candidates.findIndex((candidate) => candidate.roleCandidate === "total_volume" && candidate.selected === true);
  const authoritativeKey = selectedIndex >= 0 ? `candidate:${selectedIndex}:total_volume` : keys[0] ?? null;
  if (!authoritativeKey || keys.length < 2) return [];
  return [{
    key: "procedural_cross_reference_net_submitted",
    canonicalFactRef: "fact_v2_canonical_net_submitted_card_volume",
    occurrenceKeys: keys,
    authoritativeOccurrenceKey: authoritativeKey,
    supportingOccurrenceKeys: keys.filter((key) => key !== authoritativeKey),
    reconciliationRefs: reconciliationRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => /^cross_reference:/.test(stringOrNull(row.identity) ?? ""))
      .map(({ row, index }) => reconciliationReferenceId(row, index)),
    limitations: [],
  }];
}

function semanticAmendments(
  facts: CanonicalEconomicsV2FinancialPopulations,
  sourceModel: CanonicalEconomicsV2Foundation["sourceModel"],
): CanonicalEconomicsV2SemanticAmendment[] {
  const allEvidence = sourceModel.evidence.map((item) => item.id);
  return [
    amendment("RB-AMEND-001-MULTI-POPULATION", [facts.grossSaleVolume.id, facts.refundVolume.id, facts.canonicalNetSubmittedCardVolume.id], allEvidence),
    amendment("RB-AMEND-002-UNDEFINED-RATE", [facts.totalStatementProcessingFees.id, facts.canonicalNetSubmittedCardVolume.id], allEvidence),
    amendment("RB-AMEND-003-GROSS-AVERAGE-TICKET", [facts.grossSaleVolume.id, facts.grossSaleTransactionCount.id], allEvidence),
    amendment("RB-AMEND-004-FINANCIAL-DIRECTION", [
      facts.refundVolume.id,
      facts.feeCreditAmount.id,
      facts.settlementAdjustmentAmount.id,
      facts.chargebackPrincipalDebitAmount.id,
      facts.chargebackRepresentmentAmount.id,
      facts.chargebackFeeAmount.id,
    ], allEvidence),
    amendment("RB-AMEND-005-REPRESENTATION-CONTRIBUTION", sourceModel.representationGroups.map((group) => group.canonicalFactRef), allEvidence),
  ];
}

function amendment(
  id: CanonicalEconomicsV2SemanticAmendment["id"],
  factRefs: string[],
  evidenceRefs: string[],
): CanonicalEconomicsV2SemanticAmendment {
  return { id, factRefs: unique(factRefs), reason: RB_SEMANTIC_AMENDMENT_REASONS[id], evidenceRefs: unique(evidenceRefs) };
}

function occurrenceAndEvidenceRefs(sourceModel: CanonicalEconomicsV2Foundation["sourceModel"]) {
  const result = new Map<CanonicalEconomicsV2OccurrenceRole, { occurrenceRefs: string[]; evidenceRefs: string[] }>();
  for (const occurrence of sourceModel.occurrences) {
    const current = result.get(occurrence.semanticRole) ?? { occurrenceRefs: [], evidenceRefs: [] };
    current.occurrenceRefs.push(occurrence.id);
    current.evidenceRefs.push(occurrence.evidenceRef);
    result.set(occurrence.semanticRole, current);
  }
  return result;
}

function exactOccurrenceRefs(
  input: Pick<Parameters<typeof buildFinancialPopulations>[0], "occurrenceInputs" | "occurrenceRefByKey" | "sourceModel">,
  keyPrefix: string,
): { occurrenceRefs: string[]; evidenceRefs: string[] } {
  const occurrenceRefs = input.occurrenceInputs
    .filter((occurrence) => occurrence.key.startsWith(keyPrefix))
    .map((occurrence) => input.occurrenceRefByKey.get(occurrence.key))
    .filter((value): value is string => Boolean(value));
  const occurrenceById = new Map(input.sourceModel.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  return {
    occurrenceRefs: unique(occurrenceRefs),
    evidenceRefs: unique(occurrenceRefs
      .map((occurrenceRef) => occurrenceById.get(occurrenceRef)?.evidenceRef)
      .filter((value): value is string => Boolean(value))),
  };
}

function attachReconciliationRefs(
  sourceModel: CanonicalEconomicsV2Foundation["sourceModel"],
  reconciliation: CanonicalEconomicsV2ReconciliationReference[],
): void {
  for (const control of reconciliation) {
    for (const occurrenceRef of control.occurrenceRefs) {
      const occurrence = sourceModel.occurrences.find((item) => item.id === occurrenceRef);
      if (occurrence) occurrence.reconciliationRefs = unique([...occurrence.reconciliationRefs, control.id]);
    }
  }
}

function reconciliationReferenceId(row: Record<string, unknown>, index: number): string {
  const identity = stringOrNull(row.identity) ?? "unknown_control";
  const evidence = record(row.evidence);
  return stableId(
    "reconciliation",
    [
      identity,
      stringOrNull(evidence.section) ?? "unknown_section",
      integerOrNull(evidence.pageNumber) ?? "unknown_page",
      integerOrNull(evidence.rowIndex) ?? index,
    ].join(":"),
  );
}

function reconciliationFactRefs(identity: string, facts: CanonicalEconomicsV2FinancialPopulations): string[] {
  if (/fund|batch|processed/.test(identity)) {
    return unique([
      facts.canonicalNetSubmittedCardVolume.id,
      facts.thirdPartyTransactionVolume.id,
      facts.settlementAdjustmentAmount.id,
      facts.chargebackPrincipalDebitAmount.id,
      facts.chargebackRepresentmentAmount.id,
      facts.totalStatementProcessingFees.id,
      facts.netFundedAmount.id,
    ]);
  }
  if (/fee/.test(identity)) return [facts.totalStatementProcessingFees.id, facts.feeCreditAmount.id];
  if (/submitted/.test(identity)) return [facts.canonicalNetSubmittedCardVolume.id];
  return [];
}

function roleForField(field: string): CanonicalEconomicsV2OccurrenceRole {
  const value = field.toLowerCase();
  if (/gross/.test(value)) return "gross_sale";
  if (/refund/.test(value)) return "refund";
  if (/totalvolume|total_volume|submitted/.test(value)) return "net_submitted";
  if (/totalfees|total_fees/.test(value)) return "fee_charge";
  if (/funded|processed/.test(value)) return "funded_amount";
  if (/thirdparty|third_party/.test(value)) return "third_party_funding";
  if (/adjustment.*chargeback|chargeback.*adjustment/.test(value)) return "unresolved_adjustment_or_chargeback";
  return "unknown";
}

function roleForCandidate(role: string): CanonicalEconomicsV2OccurrenceRole {
  if (role === "gross_sales") return "gross_sale";
  if (role === "refund_volume") return "refund";
  if (role === "settlement_adjustment") return "settlement_adjustment";
  if (role === "total_volume") return "net_submitted";
  if (role === "total_fees") return "fee_charge";
  if (role === "amount_funded") return "funded_amount";
  return "supporting_representation";
}

function roleForCount(role: string): CanonicalEconomicsV2OccurrenceRole {
  const normalized = role.toLowerCase();
  if (normalized === "gross_sale_items" || normalized === "gross_sale_transactions") return "gross_sale_count";
  if (normalized === "refunds" || normalized === "refund_count" || normalized === "refund_transactions") return "refund_count";
  if (normalized === "submitted_transactions") return "submitted_count";
  if (normalized === "settled_transactions") return "settled_count";
  if (normalized === "authorizations" || normalized === "authorization_count") return "authorization_count";
  return "unknown";
}

type UniqueCountResult = { state: "available"; value: number } | { state: "unavailable" | "ambiguous"; value: null };

function uniqueSupportingCount(rows: Record<string, unknown>[], roles: string[]): UniqueCountResult {
  const values = rows
    .filter((row) => roles.includes((stringOrNull(row.role) ?? "").toLowerCase()))
    .map((row) => integerOrNull(row.value))
    .filter((value): value is number => value !== null);
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length === 1) return { state: "available", value: uniqueValues[0]! };
  return { state: uniqueValues.length > 1 ? "ambiguous" : "unavailable", value: null };
}

function hasAdmittedGrossSaleCountCapability(input: CanonicalEconomicsV2TemplateAdmissionInput): boolean {
  const capability = input.capabilities?.find((item) => item.capability === "gross_sale_transaction_count");
  return input.identityStatus === "proven" &&
    input.admissionStatus === "admitted" &&
    input.admissionAuthority !== null && input.admissionAuthority !== undefined &&
    (input.admissionProofEvidenceRefs?.length ?? 0) > 0 &&
    capability?.status === "supported" &&
    (capability.proofEvidenceRefs?.length ?? 0) > 0;
}

function provenanceForCapability(
  input: CanonicalEconomicsV2TemplateAdmissionInput,
  capabilityId: CanonicalEconomicsV2CapabilityId,
  fallback: CanonicalEconomicsV2SourceProvenance,
): CanonicalEconomicsV2SourceProvenance {
  const capability = input.capabilities?.find((item) => item.capability === capabilityId);
  const admitted = input.identityStatus === "proven" && input.admissionStatus === "admitted"
    && input.admissionAuthority !== null && input.admissionAuthority !== undefined
    && (input.admissionProofEvidenceRefs?.length ?? 0) > 0
    && capability?.status === "supported" && (capability.proofEvidenceRefs?.length ?? 0) > 0;
  return admitted ? "authoritative" : fallback;
}

function capabilityValueAllowed(
  input: CanonicalEconomicsV2TemplateAdmissionInput,
  capabilityId: CanonicalEconomicsV2CapabilityId,
): boolean {
  if (!isDeterministicCapabilityPolicyAdmission(input)) return true;
  const capability = input.capabilities?.find((item) => item.capability === capabilityId);
  return capability?.status === "supported" && (capability.proofEvidenceRefs?.length ?? 0) > 0;
}

function isDeterministicCapabilityPolicyAdmission(input: CanonicalEconomicsV2TemplateAdmissionInput): boolean {
  return input.admissionStatus === "admitted"
    && input.admissionAuthority?.authorityClass === "deterministic_capability_policy";
}

function admittedChargebackFeeRows(input: {
  admissions: CanonicalEconomicsV2FeeRowAdmissionInput[];
  feeRows: Record<string, unknown>[];
  provenanceStatus: CanonicalEconomicsV2SourceProvenance;
  templateAdmission: CanonicalEconomicsV2TemplateAdmissionInput;
}): Map<number, CanonicalEconomicsV2FeeRowAdmissionInput["basis"]> {
  const admitted = new Map<number, CanonicalEconomicsV2FeeRowAdmissionInput["basis"]>();
  const feeDetail = input.templateAdmission.capabilities?.find((item) => item.capability === "fee_detail");
  const hasVersionedTemplateProof = input.templateAdmission.identityStatus === "proven" &&
    input.templateAdmission.admissionStatus === "admitted" &&
    input.templateAdmission.completenessStatus === "complete" &&
    (input.templateAdmission.admissionProofEvidenceRefs?.length ?? 0) > 0 &&
    feeDetail?.status === "supported" &&
    (feeDetail.proofEvidenceRefs?.length ?? 0) > 0;
  for (const admission of input.admissions) {
    if (!Number.isSafeInteger(admission.feeRowIndex) || admission.feeRowIndex < 0 || admission.feeRowIndex >= input.feeRows.length) {
      throw new Error(`Chargeback-fee admission references invalid fee row ${admission.feeRowIndex}.`);
    }
    if (admission.basis === "approved_synthetic" && input.provenanceStatus !== "approved_synthetic") {
      throw new Error("Approved-synthetic chargeback-fee admission requires approved_synthetic provenance.");
    }
    if (admission.basis === "versioned_template" && !hasVersionedTemplateProof) {
      throw new Error("Versioned-template chargeback-fee admission requires proven admitted template and fee-detail evidence.");
    }
    const amount = numberOrNull(input.feeRows[admission.feeRowIndex]?.amount);
    if (amount === null || amount <= 0) {
      throw new Error("Canonical chargeback-fee admission requires a positive fee-row amount; credits remain a distinct population.");
    }
    admitted.set(admission.feeRowIndex, admission.basis);
  }
  return admitted;
}

function buildDocumentIntegrity(input: {
  input: CanonicalEconomicsV2DocumentIntegrityInput | undefined;
  observedPageCount: number;
  sourceModel: CanonicalEconomicsV2Foundation["sourceModel"];
  occurrenceRefByKey: Map<string, string>;
}): CanonicalEconomicsV2DocumentIntegrity {
  const declared = input.input;
  const proofEvidenceRefs = unique((declared?.proofOccurrenceKeys ?? [])
    .map((key) => input.occurrenceRefByKey.get(key))
    .map((occurrenceRef) => input.sourceModel.occurrences.find((occurrence) => occurrence.id === occurrenceRef)?.evidenceRef)
    .filter((value): value is string => Boolean(value)));
  const completenessStatus = declared?.completenessStatus ?? "unknown";
  const suppliedDocumentStatus = declared?.suppliedDocumentStatus ?? "unknown";
  return {
    suppliedDocumentStatus,
    observedPageCount: declared?.observedPageCount ?? input.observedPageCount,
    processedPageCount: declared?.processedPageCount ?? null,
    fatalPageErrorCount: declared?.fatalPageErrorCount ?? null,
    extractionLineageComplete: declared?.extractionLineageComplete ?? null,
    localIngestionTruncated: declared?.localIngestionTruncated ?? null,
    expectedPageCount: declared?.expectedPageCount ?? null,
    completenessStatus,
    missingPageNumbers: uniqueNumbers(declared?.missingPageNumbers ?? []),
    proofEvidenceRefs,
    limitations: unique([
      ...(declared?.limitations ?? []),
      ...(suppliedDocumentStatus === "unknown"
        ? ["Supplied-document processing integrity is not proven."]
        : []),
      ...(completenessStatus === "unknown"
        ? ["Processor-statement completeness is not proven; processing every supplied page does not establish an expected statement page count."]
        : []),
    ]),
  };
}

function countFactWithAmbiguity<TPopulation extends Parameters<typeof countFactFromNumber>[0]["population"]>(input: {
  id: string;
  population: TPopulation;
  result: UniqueCountResult;
  provenanceStatus: CanonicalEconomicsV2SourceProvenance;
  evidenceRefs: string[];
  occurrenceRefs: string[];
  unavailableReason: string;
}) {
  if (input.result.state === "ambiguous") {
    return unavailableV2Fact<number, TPopulation>({
      id: input.id,
      population: input.population,
      provenanceStatus: input.provenanceStatus,
      status: "ambiguous",
      evidenceRefs: input.evidenceRefs,
      occurrenceRefs: input.occurrenceRefs,
      limitations: ["Multiple incompatible values were observed for this transaction population."],
    });
  }
  return countFactFromNumber({
    id: input.id,
    population: input.population,
    value: input.result.value,
    provenanceStatus: input.provenanceStatus,
    evidenceRefs: input.evidenceRefs,
    occurrenceRefs: input.occurrenceRefs,
    limitationsIfUnavailable: [input.unavailableReason],
  });
}

function reconciliationStatus(status: string | null): CanonicalEconomicsV2ReconciliationReference["status"] {
  if (status === "RECON_OK") return "pass";
  if (status === "RECON_ROUNDING") return "pass_with_rounding";
  if (status === "RECON_MINOR_BREAK" || status === "RECON_UNREFERENCED_VALUE") return "warning";
  if (status === "RECON_MATERIAL_BREAK") return "fail";
  if (status === "RECON_MISSING_INPUT") return "missing_input";
  return "not_applicable";
}

function statementPeriod(identity: Record<string, unknown>): { start: string; end: string } | null {
  const start = stringOrNull(identity.statementPeriodStart);
  const end = stringOrNull(identity.statementPeriodEnd);
  return start && end ? { start, end } : null;
}

function sourceFingerprint(document: ParsedDocument): string {
  const normalized = document.rows.map((row) => `${String(row.page ?? "")}|${String(row.content ?? "")}`).join("\n");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_v2_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function confidence(value: unknown): "high" | "medium" | "low" | "needs_review" {
  return value === "high" || value === "medium" || value === "low" || value === "needs_review" ? value : "medium";
}

function sum(values: number[]): number {
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0))].sort((left, right) => left - right);
}
