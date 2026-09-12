import { createHash } from "node:crypto";

import { documentIrFromPdfjsParsedDocument } from "../documentIrFromPdfjs.js";
import { assessFiservFirstDataFamily, attachFiservDocumentSections } from "../fiservDocumentSections.js";
import {
  extractFiservIndependentAdjustmentChargeback,
  extractFiservIndependentCardSummary,
  qualifyFiservIndependentSplitPopulations,
  type IndependentDocumentIrAnchor,
  type IndependentDocumentIrValue,
} from "../fiservIndependentPopulationsFromDocumentIr.js";
import { extractFiservTopLevelFinancialsFromDocumentIr } from "../fiservTopLevelFromDocumentIr.js";
import type { ParsedDocument } from "../parser.js";
import { kernelParsedDocumentFingerprint } from "../reconstructionKernel/canonicalRbLimitedAuthority.js";
import type { CanonicalStatementAnalysis, MoneyAmount } from "./types.js";
import type { CanonicalEconomicsV2EconomicAnalysis } from "./v2/economicTypes.js";
import type { CanonicalEconomicsV2FinancialPopulations } from "./v2/types.js";
import {
  buildCurrentRelationshipEconomicsProfileV1,
  type CurrentEconomicsActivityAdmissionFieldV1,
  type CurrentEconomicsActivityAdmissionV1,
  type CurrentEconomicsActivityAdmissionsV1,
  type CurrentEconomicsChannelAdmissionV1,
} from "./currentRelationshipEconomicsProfileV1.js";
import type { CommercialDecompositionContractV1 } from "./commercialDecompositionContractV1.js";

export const FISERV_CLAIM_SCOPED_ACTIVITY_POPULATION_ADMISSION_V1 =
  "fiserv_claim_scoped_activity_population_admission_2026_09_12_v1" as const;

export type FiservClaimScopedActivityDecisionV1 = {
  field: CurrentEconomicsActivityAdmissionFieldV1 | "channel";
  population: string;
  decision: "ADMITTED" | "CANONICAL_ALREADY_AVAILABLE" | "WITHHELD" | "NOT_APPLICABLE";
  valueMinorOrCount: number | null;
  evidenceRefs: string[];
  controlRefs: string[];
  reasonCodes: string[];
};

export type FiservClaimScopedActivityPopulationAdmissionV1 = {
  schemaVersion: typeof FISERV_CLAIM_SCOPED_ACTIVITY_POPULATION_ADMISSION_V1;
  authority: "profile_only_claim_scoped_statement_activity";
  processorScope: "supported_fiserv_family_native_text";
  downstreamUse: "current_relationship_economics_profile_only";
  sourceDocumentRef: string;
  sourceFingerprint: string | null;
  status: "ADMITTED" | "PARTIALLY_ADMITTED" | "WITHHELD";
  sourceBinding: {
    pdfSource: boolean;
    extractableNativeText: boolean;
    completeSuppliedDocument: boolean;
    sourceFingerprintMatched: boolean;
    canonicalChannelEvidenceBound: boolean;
    supportedFiservFamily: boolean;
    familyBasis: "brand_or_structure" | "canonical_runtime_plus_top_level_structure" | "unproven";
    cardSummary: "mapped" | "not_mapped";
    cardSummaryAmountControl: "pass" | "fail" | "unresolved";
    cardSummaryHeadlineControl: "pass" | "fail" | "unresolved";
    cardSummaryCountControl: "pass" | "fail" | "not_applicable";
  };
  facts: CurrentEconomicsActivityAdmissionsV1;
  channelAdmission: CurrentEconomicsChannelAdmissionV1 | null;
  decisions: FiservClaimScopedActivityDecisionV1[];
  sourceEvidence: Array<{
    field: string;
    lineId: string;
    pageNumber: number;
    evidenceLine: string;
  }>;
  safety: {
    exactPopulationIdentityRequired: true;
    sourceEvidenceRequired: true;
    canonicalMutationAllowed: false;
    rdMutationAllowed: false;
    feeLedgerContributionAllowed: false;
    populationSubstitutionAllowed: false;
    inferredZeroAllowed: false;
    customerRoutingAllowed: false;
    aiOrWebOperationCount: 0;
    newKnowledgeAdmissionCount: 0;
  };
  limitations: string[];
};

type Foundation = CanonicalEconomicsV2EconomicAnalysis["pricingAnalysis"]["foundation"];
type PopulationKey = keyof CanonicalEconomicsV2FinancialPopulations;

const FIELD_POPULATIONS = {
  processedVolume: "canonical_net_submitted_card_volume",
  grossSalesVolume: "gross_sale_volume",
  refundVolume: "refund_volume",
  transactionCount: "submitted_transaction_count",
  grossSaleTransactionCount: "gross_sale_transaction_count",
  refundTransactionCount: "refund_transaction_count",
  authorizationCount: "authorization_count",
  chargebackCount: "chargeback_count",
  chargebackFee: "chargeback_fee_amount",
  averageTicket: "gross_sale_volume_per_gross_sale_transaction",
  channel: "current_statement_processing_activity",
} as const;

export function buildFiservClaimScopedActivityPopulationAdmissionV1(input: {
  document: ParsedDocument;
  economic: CanonicalEconomicsV2EconomicAnalysis;
  canonicalAnalysis: CanonicalStatementAnalysis;
}): FiservClaimScopedActivityPopulationAdmissionV1 {
  const foundation = input.economic.pricingAnalysis.foundation;
  const sourceDocumentRef = foundation.identity.sourceDocumentRef;
  const sourceFingerprint = kernelParsedDocumentFingerprint(input.document);
  const ir = attachFiservDocumentSections(documentIrFromPdfjsParsedDocument(input.document, { id: sourceDocumentRef }));
  const family = assessFiservFirstDataFamily(ir);
  let topLevel: ReturnType<typeof extractFiservTopLevelFinancialsFromDocumentIr> | null = null;
  try { topLevel = extractFiservTopLevelFinancialsFromDocumentIr(ir); } catch { /* fail closed below */ }
  const integrity = foundation.documentIntegrity;
  const pdfSource = input.document.sourceType === "pdf";
  const extractableNativeText = input.document.extraction.mode !== "unusable" && input.document.extraction.hasExtractableText;
  const completeSuppliedDocument = Boolean(integrity.suppliedDocumentStatus === "complete_supplied_document"
    && integrity.observedPageCount !== null && integrity.processedPageCount === integrity.observedPageCount
    && integrity.fatalPageErrorCount === 0 && integrity.extractionLineageComplete
    && !integrity.localIngestionTruncated);
  const sourceFingerprintMatched = foundation.identity.sourceFingerprintStatus === "available"
    && foundation.identity.sourceFingerprint === sourceFingerprint;
  const channel = input.canonicalAnalysis.businessQualification.channel;
  const canonicalEvidence = new Map(input.canonicalAnalysis.evidence.map((item) => [item.id, item]));
  const documentLines = input.document.rows.map((row) => normalizedSourceText(String(row.content ?? ""))).filter(Boolean);
  const channelEvidenceResolved = channel.evidenceRefs.length > 0 && channel.evidenceRefs.every((ref) => {
    const record = canonicalEvidence.get(ref);
    if (!record || record.documentId !== input.canonicalAnalysis.identity.sourceDocumentRef || !record.extractedText) return false;
    const text = normalizedSourceText(record.extractedText);
    return text.length > 0 && documentLines.some((line) => line.includes(text) || text.includes(line));
  });
  const canonicalFiservRuntime = /fiserv|first.?data/i.test([
    foundation.identity.processorFamily,
    foundation.identity.parserId,
    foundation.templateCapability.detectedFamily,
    foundation.templateCapability.detectedTemplate,
  ].filter(Boolean).join(" "));
  const supportedFiservFamily = Boolean(topLevel) && (family.isLikelyFiservFirstData || canonicalFiservRuntime);
  const familyBasis = family.isLikelyFiservFirstData ? "brand_or_structure" as const
    : supportedFiservFamily ? "canonical_runtime_plus_top_level_structure" as const : "unproven" as const;
  const globalReasons = unique([
    ...(pdfSource ? [] : ["pdf_source_required"]),
    ...(extractableNativeText ? [] : ["extractable_native_text_required"]),
    ...(completeSuppliedDocument ? [] : ["complete_supplied_document_required"]),
    ...(sourceFingerprintMatched ? [] : ["source_fingerprint_mismatch"]),
    ...(input.canonicalAnalysis.validation.status !== "invalid" ? [] : ["canonical_analysis_invalid"]),
    ...(supportedFiservFamily ? [] : ["supported_fiserv_family_not_proven"]),
    ...(foundation.validation.status === "valid" ? [] : ["canonical_rb_foundation_invalid"]),
    ...(topLevel ? [] : ["fiserv_top_level_structure_not_mapped"]),
  ]);
  const globallyAdmissible = globalReasons.length === 0;
  const card = extractFiservIndependentCardSummary(ir);
  const flows = extractFiservIndependentAdjustmentChargeback(ir);
  const cardAmountControl = card.status === "mapped" ? card.formulaStatus : "unresolved";
  const cardHeadlineControl = card.status === "mapped" && card.submittedVolume && topLevel
    ? Math.abs(card.submittedVolume.value - toMinor(topLevel.totalVolume)) <= 1 ? "pass" as const : "fail" as const
    : "unresolved" as const;
  const cardCountControl = card.status !== "mapped" || !card.grossCount || !card.refundCount
    ? "fail" as const
    : !card.submittedCount ? "not_applicable" as const
      : card.grossCount.value + card.refundCount.value === card.submittedCount.value ? "pass" as const : "fail" as const;
  const facts: CurrentEconomicsActivityAdmissionsV1 = {};
  const decisions: FiservClaimScopedActivityDecisionV1[] = [];
  const sourceEvidence: FiservClaimScopedActivityPopulationAdmissionV1["sourceEvidence"] = [];

  const admit = <T extends number | MoneyAmount>(args: {
    field: CurrentEconomicsActivityAdmissionFieldV1;
    populationKey: PopulationKey | null;
    value: T | null;
    evidence: Array<IndependentDocumentIrValue | IndependentDocumentIrAnchor>;
    controlRefs: string[];
    reconciliationState: CurrentEconomicsActivityAdmissionV1["reconciliationState"];
    reasons?: string[];
    limitations?: string[];
  }): void => {
    const population = FIELD_POPULATIONS[args.field];
    const reasons = unique([...globalReasons, ...(args.reasons ?? []),
      ...(args.value === null ? ["exact_source_population_unavailable"] : []),
      ...(args.evidence.length === 0 ? ["source_evidence_unavailable"] : [])]);
    const numeric = args.value === null ? null : typeof args.value === "number" ? args.value : args.value.amountMinor;
    if (numeric !== null && (!Number.isSafeInteger(numeric) || numeric < 0)) reasons.push("unsafe_or_negative_population_value");
    if (reasons.length > 0 || args.value === null || args.evidence.length === 0) {
      decisions.push({ field: args.field, population, decision: "WITHHELD", valueMinorOrCount: null,
        evidenceRefs: evidenceRefs(args.evidence), controlRefs: args.controlRefs, reasonCodes: unique(reasons) });
      return;
    }
    const canonicalFact = args.populationKey ? foundation.financialPopulations[args.populationKey] : null;
    const canonicalAlreadyAvailable = canonicalFact?.status === "available" && canonicalFact.value !== null
      && ["authoritative", "approved_synthetic"].includes(canonicalFact.provenanceStatus);
    const admission: CurrentEconomicsActivityAdmissionV1<T> = {
      admissionRef: admissionRef(sourceDocumentRef, args.field, numeric!),
      field: args.field,
      population,
      value: structuredClone(args.value),
      evidenceAccess: "STATEMENT_DERIVABLE",
      evidenceRefs: evidenceRefs(args.evidence),
      sourceLayer: "fiserv_claim_scoped_activity_population_admission_v1",
      sourceDocumentRef,
      exactPopulationIdentityProven: true,
      reconciliationState: args.reconciliationState,
      controlRefs: unique(args.controlRefs),
      canonicalMutationAllowed: false,
      rdMutationAllowed: false,
      limitations: unique(args.limitations ?? []),
    };
    (facts as Record<string, CurrentEconomicsActivityAdmissionV1>)[args.field] = admission;
    for (const item of args.evidence) {
      sourceEvidence.push({ field: args.field, lineId: item.lineId, pageNumber: item.pageNumber,
        evidenceLine: item.evidenceLine });
    }
    decisions.push({ field: args.field, population,
      decision: canonicalAlreadyAvailable ? "CANONICAL_ALREADY_AVAILABLE" : "ADMITTED",
      valueMinorOrCount: numeric, evidenceRefs: admission.evidenceRefs, controlRefs: admission.controlRefs,
      reasonCodes: [canonicalAlreadyAvailable ? "same_population_already_canonical" : "claim_scoped_statement_population_admitted"] });
  };

  const topEvidence = (field: string) => topLevel?.evidence.filter((item) => item.field === field)
    .map((item) => ({ value: toMinor(item.value), lineId: item.lineId, pageNumber: item.pageNumber,
      evidenceLine: item.evidenceLine })) ?? [];
  const processedReasons = unique([
    ...(topLevel?.reconciliation.fundingFormula.status === "pass" ? [] : ["top_level_funding_formula_not_passing"]),
    ...(card.status === "mapped" && cardHeadlineControl !== "pass" ? ["card_summary_headline_contradiction"] : []),
  ]);
  admit({ field: "processedVolume", populationKey: "canonicalNetSubmittedCardVolume",
    value: topLevel ? money(toMinor(topLevel.totalVolume)) : null, evidence: topEvidence("totalVolume"),
    controlRefs: ["fiserv_top_level_funding_formula", ...(card.status === "mapped" ? ["card_summary_headline_match"] : [])],
    reconciliationState: "RECONCILED", reasons: processedReasons });

  const cardEvidence = card.status === "mapped"
    ? [card.headingAnchor, card.headerAnchor, card.totalAnchor].filter((item): item is IndependentDocumentIrAnchor => Boolean(item)) : [];
  const amountReasons = unique([
    ...(cardAmountControl === "pass" ? [] : ["card_summary_amount_formula_not_passing"]),
    ...(cardHeadlineControl === "pass" ? [] : ["card_summary_headline_not_matching"]),
  ]);
  admit({ field: "grossSalesVolume", populationKey: "grossSaleVolume",
    value: card.grossVolume ? money(card.grossVolume.value) : null, evidence: cardEvidence,
    controlRefs: ["card_summary_amount_formula", "card_summary_headline_match"], reconciliationState: "RECONCILED",
    reasons: amountReasons, limitations: card.limitations });
  admit({ field: "refundVolume", populationKey: "refundVolume",
    value: card.refundVolume ? money(card.refundVolume.value) : null, evidence: cardEvidence,
    controlRefs: ["card_summary_amount_formula", "card_summary_headline_match"], reconciliationState: "RECONCILED",
    reasons: amountReasons, limitations: card.limitations });

  const directCountReasons = cardCountControl === "fail" ? ["card_summary_count_control_failed"] : [];
  admit({ field: "grossSaleTransactionCount", populationKey: "grossSaleTransactionCount",
    value: card.grossCount?.value ?? null, evidence: cardEvidence,
    controlRefs: cardCountControl === "not_applicable" ? ["exact_card_summary_total_row"] : ["card_summary_count_formula"],
    reconciliationState: cardCountControl === "not_applicable" ? "DIRECT_SOURCE" : "RECONCILED",
    reasons: directCountReasons, limitations: card.limitations });
  admit({ field: "refundTransactionCount", populationKey: "refundTransactionCount",
    value: card.refundCount?.value ?? null, evidence: cardEvidence,
    controlRefs: cardCountControl === "not_applicable" ? ["exact_card_summary_total_row"] : ["card_summary_count_formula"],
    reconciliationState: cardCountControl === "not_applicable" ? "DIRECT_SOURCE" : "RECONCILED",
    reasons: directCountReasons, limitations: card.limitations });
  admit({ field: "transactionCount", populationKey: "submittedTransactionCount",
    value: card.submittedCount?.value ?? null, evidence: cardEvidence,
    controlRefs: ["card_summary_count_formula"], reconciliationState: "RECONCILED",
    reasons: cardCountControl === "pass" ? [] : ["explicit_submitted_count_and_passing_count_formula_required"],
    limitations: card.limitations });

  const explicitAuthorization = extractExactAuthorizationTotal(ir.pages.flatMap((page) => page.lines));
  admit({ field: "authorizationCount", populationKey: "authorizationCount",
    value: explicitAuthorization?.value ?? null, evidence: explicitAuthorization ? [explicitAuthorization] : [],
    controlRefs: ["unique_exact_authorization_total"], reconciliationState: "DIRECT_SOURCE",
    reasons: explicitAuthorization ? [] : ["unique_exact_authorization_total_not_found"],
    limitations: ["Authorization events remain distinct from approvals, captures, submitted transactions, and settlements."] });

  const split = qualifyFiservIndependentSplitPopulations(flows);
  const principalRows = split.chargebackPrincipalDebitAmount.status === "proven"
    ? split.chargebackPrincipalDebitAmount.evidence.filter((item) => item.proofRole === "population_component" && item.value < 0) : [];
  const explicitNoChargebacks = flows.chargebacks.status === "explicit_none"
    && flows.chargebacks.totalControlStatus === "pass" && flows.chargebacks.explicitNoneEvidence !== null;
  const chargebackCountValue = explicitNoChargebacks ? 0
    : split.chargebackPrincipalDebitAmount.status === "proven" && split.chargebackRepresentmentAmount.status === "proven"
      ? principalRows.length : null;
  const chargebackEvidence = explicitNoChargebacks
    ? [flows.chargebacks.explicitNoneEvidence!, flows.chargebacks.printedTotal!]
    : principalRows;
  admit({ field: "chargebackCount", populationKey: "chargebackCount", value: chargebackCountValue,
    evidence: chargebackEvidence, controlRefs: explicitNoChargebacks
      ? ["separate_chargeback_explicit_none_and_zero_total"] : ["reconciled_exhaustive_chargeback_principal_population"],
    reconciliationState: "RECONCILED", reasons: chargebackCountValue === null
      ? ["chargeback_principal_event_population_not_proven"] : [],
    limitations: ["Chargeback count is not inferred from chargeback-fee count, funding rows, or a combined adjustments/chargebacks amount."] });

  const canonicalChargebackFee = foundation.financialPopulations.chargebackFeeAmount;
  const canonicalChargebackFeeValue = canonicalMoney(canonicalChargebackFee);
  decisions.push({ field: "chargebackFee", population: FIELD_POPULATIONS.chargebackFee,
    decision: canonicalChargebackFeeValue ? "CANONICAL_ALREADY_AVAILABLE" : "WITHHELD",
    valueMinorOrCount: canonicalChargebackFeeValue?.amountMinor ?? null,
    evidenceRefs: unique(canonicalChargebackFee.evidenceRefs), controlRefs: [],
    reasonCodes: [canonicalChargebackFeeValue
      ? "authoritative_canonical_chargeback_fee_remains_source"
      : "profile_only_chargeback_fee_not_created_without_authoritative_fee_population"] });

  const grossAdmission = facts.grossSalesVolume;
  const grossCountAdmission = facts.grossSaleTransactionCount;
  const averageValue = grossAdmission && grossCountAdmission && (grossCountAdmission.value as number) > 0
    ? Math.round((grossAdmission.value as MoneyAmount).amountMinor / (grossCountAdmission.value as number)) : null;
  admit({ field: "averageTicket", populationKey: null,
    value: averageValue === null ? null : money(averageValue), evidence: cardEvidence,
    controlRefs: ["compatible_gross_sales_divided_by_gross_sale_count"], reconciliationState: "RECONCILED",
    reasons: averageValue === null ? ["compatible_gross_sales_and_gross_sale_count_required"] : [],
    limitations: ["Average ticket uses only the exact gross-sale amount and gross-sale count from the same bounded card-summary population."] });

  const channelAdmission = globallyAdmissible && channel.status === "qualified" && channel.source === "statement_channel_signals"
    && channel.value !== "unknown" && channelEvidenceResolved
    ? { value: channel.value, canonicalFactRef: "businessQualification.channel",
        evidenceAccess: "STATEMENT_DERIVABLE" as const, evidenceRefs: unique(channel.evidenceRefs) }
    : null;
  decisions.push({ field: "channel", population: FIELD_POPULATIONS.channel,
    decision: channelAdmission ? "ADMITTED" : input.economic.pricingAnalysis.pricingArchitecture.formulaCoverageStatus === "not_applicable_no_active_processing"
      ? "NOT_APPLICABLE" : "WITHHELD", valueMinorOrCount: null,
    evidenceRefs: channelAdmission?.evidenceRefs ?? [], controlRefs: ["qualified_statement_channel_signals"],
    reasonCodes: channelAdmission ? ["qualified_nondefault_statement_channel_admitted"]
      : unique([...globalReasons, channel.source === "statement_channel_signals"
        ? channelEvidenceResolved ? "channel_not_qualified" : "channel_evidence_not_bound_to_canonical_analysis"
        : "legacy_default_or_nonstatement_channel_prohibited"]) });

  const admittedCount = decisions.filter((item) => item.decision === "ADMITTED").length;
  const availableCount = decisions.filter((item) => item.decision === "ADMITTED" || item.decision === "CANONICAL_ALREADY_AVAILABLE").length;
  return deepFreeze({
    schemaVersion: FISERV_CLAIM_SCOPED_ACTIVITY_POPULATION_ADMISSION_V1,
    authority: "profile_only_claim_scoped_statement_activity",
    processorScope: "supported_fiserv_family_native_text",
    downstreamUse: "current_relationship_economics_profile_only",
    sourceDocumentRef,
    sourceFingerprint: foundation.identity.sourceFingerprint,
    status: availableCount === 0 ? "WITHHELD" : decisions.every((item) => item.decision !== "WITHHELD") ? "ADMITTED" : "PARTIALLY_ADMITTED",
    sourceBinding: {
      pdfSource, extractableNativeText, completeSuppliedDocument, sourceFingerprintMatched,
      canonicalChannelEvidenceBound: channelEvidenceResolved, supportedFiservFamily,
      familyBasis, cardSummary: card.status,
      cardSummaryAmountControl: cardAmountControl,
      cardSummaryHeadlineControl: cardHeadlineControl,
      cardSummaryCountControl: cardCountControl,
    },
    facts,
    channelAdmission,
    decisions,
    sourceEvidence: uniqueEvidence(sourceEvidence),
    safety: {
      exactPopulationIdentityRequired: true,
      sourceEvidenceRequired: true,
      canonicalMutationAllowed: false,
      rdMutationAllowed: false,
      feeLedgerContributionAllowed: false,
      populationSubstitutionAllowed: false,
      inferredZeroAllowed: false,
      customerRoutingAllowed: false,
      aiOrWebOperationCount: 0,
      newKnowledgeAdmissionCount: 0,
    },
    limitations: unique([
      "Admission is profile-only and does not mutate Canonical Economics V2, RD, fee ledgers, or customer reports.",
      "A statement label or amount alone cannot substitute transaction, authorization, approval, settlement, refund, or chargeback populations.",
      "A numeric zero is admitted only from an exact printed population or explicit no-activity evidence, never from silence.",
      ...(admittedCount === 0 ? ["No new profile-only activity fact passed all claim-scoped controls."] : []),
    ]),
  });
}

export function buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1(input: {
  document: ParsedDocument;
  economic: CanonicalEconomicsV2EconomicAnalysis;
  canonicalAnalysis: CanonicalStatementAnalysis;
  commercialDecomposition: CommercialDecompositionContractV1;
}) {
  const admission = buildFiservClaimScopedActivityPopulationAdmissionV1(input);
  const profile = buildCurrentRelationshipEconomicsProfileV1({
    economic: input.economic,
    commercialDecomposition: input.commercialDecomposition,
    activityAdmissions: admission.facts,
    channel: admission.channelAdmission,
  });
  return deepFreeze({ admission, profile });
}

function extractExactAuthorizationTotal(lines: Array<{ id: string; pageNumber: number; text: string }>): IndependentDocumentIrValue | null {
  const candidates = lines.flatMap((line) => {
    const cells = line.text.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length !== 2 || !/^(?:TOTAL\s+AUTHORIZATIONS?|AUTHORIZATION\s+COUNT)$/i.test(cells[0]!)
      || !/^\d[\d,]*$/.test(cells[1]!)) return [];
    const value = Number(cells[1]!.replace(/,/g, ""));
    return Number.isSafeInteger(value) ? [{ value, lineId: line.id, pageNumber: line.pageNumber, evidenceLine: line.text }] : [];
  });
  return candidates.length === 1 ? candidates[0]! : null;
}

function canonicalMoney(fact: CanonicalEconomicsV2FinancialPopulations["chargebackFeeAmount"]): MoneyAmount | null {
  return fact.status === "available" && fact.value && ["authoritative", "approved_synthetic"].includes(fact.provenanceStatus)
    ? { ...fact.value } : null;
}

function evidenceRefs(items: Array<IndependentDocumentIrValue | IndependentDocumentIrAnchor>): string[] {
  return unique(items.map((item) => `document-ir:${item.lineId}`));
}

function admissionRef(sourceDocumentRef: string, field: string, value: number): string {
  return `activity_admission_${createHash("sha256").update(`${sourceDocumentRef}|${field}|${value}`).digest("hex").slice(0, 20)}`;
}

function normalizedSourceText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function money(amountMinor: number): MoneyAmount { return { amountMinor, currency: "USD" }; }
function toMinor(value: number): number { return Math.round((value + Number.EPSILON) * 100); }
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort(); }

function uniqueEvidence(items: FiservClaimScopedActivityPopulationAdmissionV1["sourceEvidence"]): FiservClaimScopedActivityPopulationAdmissionV1["sourceEvidence"] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.field}|${item.lineId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
