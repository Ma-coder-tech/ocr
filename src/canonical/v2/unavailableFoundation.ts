import type { MoneyAmount } from "../types.js";
import { unavailableV2Fact } from "./facts.js";
import { buildHeadlineAverageTicket, buildHeadlineEffectiveRate } from "./metrics.js";
import type {
  CanonicalEconomicsV2FinancialPopulations,
  CanonicalEconomicsV2Foundation,
  CanonicalEconomicsV2MoneyPopulation,
  CanonicalEconomicsV2CountPopulation,
  CanonicalEconomicsV2SemanticAmendment,
} from "./types.js";
import { CANONICAL_ECONOMICS_V2_VERSION_MANIFEST, RB_SEMANTIC_AMENDMENT_REASONS } from "./versionManifest.js";
import { validateCanonicalEconomicsV2Foundation } from "./validate.js";

export function buildUnavailableCanonicalEconomicsV2Foundation(input: {
  sourceDocumentRef: string;
  provenanceStatus: "requires_human_review" | "source_unavailable" | "corpus_integrity_hold";
  reason: string;
}): CanonicalEconomicsV2Foundation {
  const uMoney = <TPopulation extends CanonicalEconomicsV2MoneyPopulation>(
    id: string,
    population: TPopulation,
  ) => unavailableV2Fact<MoneyAmount, TPopulation>({
    id,
    population,
    provenanceStatus: input.provenanceStatus,
    limitations: [input.reason],
  });
  const uCount = <TPopulation extends CanonicalEconomicsV2CountPopulation>(
    id: string,
    population: TPopulation,
  ) => unavailableV2Fact<number, TPopulation>({
    id,
    population,
    provenanceStatus: input.provenanceStatus,
    limitations: [input.reason],
  });
  const facts: CanonicalEconomicsV2FinancialPopulations = {
    grossSaleVolume: uMoney("fact_v2_gross_sale_volume", "gross_sale_volume"),
    refundVolume: uMoney("fact_v2_refund_volume", "refund_volume"),
    canonicalNetSubmittedCardVolume: uMoney("fact_v2_canonical_net_submitted_card_volume", "canonical_net_submitted_card_volume"),
    thirdPartyTransactionVolume: uMoney("fact_v2_third_party_transaction_volume", "third_party_transaction_volume"),
    totalStatementProcessingFees: uMoney("fact_v2_total_statement_processing_fees", "total_statement_processing_fees"),
    feeCreditAmount: uMoney("fact_v2_fee_credit_amount", "fee_credit_amount"),
    settlementAdjustmentAmount: uMoney("fact_v2_settlement_adjustment_amount", "settlement_adjustment_amount"),
    chargebackPrincipalDebitAmount: uMoney("fact_v2_chargeback_principal_debit_amount", "chargeback_principal_debit_amount"),
    chargebackRepresentmentAmount: uMoney("fact_v2_chargeback_representment_amount", "chargeback_representment_amount"),
    chargebackFeeAmount: uMoney("fact_v2_chargeback_fee_amount", "chargeback_fee_amount"),
    netFundedAmount: uMoney("fact_v2_net_funded_amount", "net_funded_amount"),
    unresolvedAdjustmentChargebackAmount: uMoney("fact_v2_unresolved_adjustment_chargeback_amount", "unresolved_adjustment_chargeback_amount"),
    grossSaleTransactionCount: uCount("fact_v2_gross_sale_transaction_count", "gross_sale_transaction_count"),
    refundTransactionCount: uCount("fact_v2_refund_transaction_count", "refund_transaction_count"),
    submittedTransactionCount: uCount("fact_v2_submitted_transaction_count", "submitted_transaction_count"),
    settledTransactionCount: uCount("fact_v2_settled_transaction_count", "settled_transaction_count"),
    authorizationCount: uCount("fact_v2_authorization_count", "authorization_count"),
    chargebackCount: uCount("fact_v2_chargeback_count", "chargeback_count"),
    fundingBatchCount: uCount("fact_v2_funding_batch_count", "funding_batch_count"),
  };
  const rate = buildHeadlineEffectiveRate({ fees: facts.totalStatementProcessingFees, netSubmitted: facts.canonicalNetSubmittedCardVolume });
  const average = buildHeadlineAverageTicket({ grossSales: facts.grossSaleVolume, grossSaleCount: facts.grossSaleTransactionCount });
  const amendments: CanonicalEconomicsV2SemanticAmendment[] = [
    amendment("RB-AMEND-001-MULTI-POPULATION", [facts.grossSaleVolume.id, facts.refundVolume.id, facts.canonicalNetSubmittedCardVolume.id]),
    amendment("RB-AMEND-002-UNDEFINED-RATE", [facts.totalStatementProcessingFees.id, facts.canonicalNetSubmittedCardVolume.id]),
    amendment("RB-AMEND-003-GROSS-AVERAGE-TICKET", [facts.grossSaleVolume.id, facts.grossSaleTransactionCount.id]),
    amendment("RB-AMEND-004-FINANCIAL-DIRECTION", [facts.refundVolume.id, facts.feeCreditAmount.id, facts.settlementAdjustmentAmount.id, facts.chargebackPrincipalDebitAmount.id, facts.chargebackRepresentmentAmount.id, facts.chargebackFeeAmount.id]),
    amendment("RB-AMEND-005-REPRESENTATION-CONTRIBUTION", []),
  ];
  const foundation: CanonicalEconomicsV2Foundation = {
    versionManifest: { ...CANONICAL_ECONOMICS_V2_VERSION_MANIFEST },
    identity: {
      sourceDocumentRef: input.sourceDocumentRef,
      sourceFingerprint: null,
      sourceFingerprintStatus: "unavailable",
      parserId: "none",
      parserVersion: null,
      processorFamily: null,
      statementPeriod: null,
      currency: "USD",
      provenanceStatus: input.provenanceStatus,
    },
    templateCapability: {
      detectedFamily: null,
      detectedTemplate: null,
      detectedVersion: null,
      identityStatus: input.provenanceStatus === "source_unavailable" ? "unavailable" : "unknown",
      admissionStatus: input.provenanceStatus === "source_unavailable" ? "unavailable" : "unknown",
      admissionAuthority: null,
      completenessStatus: input.provenanceStatus === "source_unavailable" ? "unavailable" : "unknown",
      admissionProofEvidenceRefs: [],
      capabilities: [],
      limitations: [input.reason],
    },
    documentIntegrity: {
      suppliedDocumentStatus: input.provenanceStatus === "source_unavailable" ? "unavailable" : "unknown",
      observedPageCount: null,
      processedPageCount: null,
      fatalPageErrorCount: null,
      extractionLineageComplete: null,
      localIngestionTruncated: null,
      expectedPageCount: null,
      completenessStatus: input.provenanceStatus === "source_unavailable" ? "unavailable" : "unknown",
      missingPageNumbers: [],
      proofEvidenceRefs: [],
      limitations: [input.reason],
    },
    sourceModel: { sections: [], occurrences: [], representationGroups: [], processorPresentedCategories: [],
      processorPresentedCategoryControls: [],
      evidence: [], parserInterpretations: [] },
    financialPopulations: facts,
    metrics: { headlineEffectiveRate: rate.metric, grossBasedRateDiagnostic: null, headlineAverageTicket: average.metric },
    billingAndFunding: {
      billingCadence: "unavailable",
      fundingCadence: "unavailable",
      submittedVolumeFactRef: facts.canonicalNetSubmittedCardVolume.id,
      thirdPartyVolumeFactRef: facts.thirdPartyTransactionVolume.id,
      adjustmentFactRef: facts.settlementAdjustmentAmount.id,
      chargebackDebitFactRef: facts.chargebackPrincipalDebitAmount.id,
      representmentFactRef: facts.chargebackRepresentmentAmount.id,
      feeFactRef: facts.totalStatementProcessingFees.id,
      fundedAmountFactRef: facts.netFundedAmount.id,
      batchCountFactRef: facts.fundingBatchCount.id,
      batchOccurrenceRefs: [],
      reconciliationRefs: [],
      limitations: [input.reason],
    },
    reconciliation: [],
    calculations: [],
    semanticAmendments: amendments,
    validation: { status: "valid", errors: [], warnings: [] },
  };
  return validateCanonicalEconomicsV2Foundation(foundation);
}

function amendment(
  id: CanonicalEconomicsV2SemanticAmendment["id"],
  factRefs: string[],
): CanonicalEconomicsV2SemanticAmendment {
  return { id, factRefs, reason: RB_SEMANTIC_AMENDMENT_REASONS[id], evidenceRefs: [] };
}
