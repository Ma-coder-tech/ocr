import type { CanonicalEconomicsV2Foundation } from "./types.js";

export type CanonicalEconomicsV2GoldObservation = {
  caseId: string;
  sourceStatus: "available" | "source_unavailable" | "requires_human_review";
  provenanceStatus: CanonicalEconomicsV2Foundation["identity"]["provenanceStatus"];
  values: Record<string, unknown>;
  states: Record<string, string>;
  claims: string[];
  valueContexts: Record<string, { denominator: string }>;
  limitations: string[];
};

export function canonicalEconomicsV2GoldObservation(
  foundation: CanonicalEconomicsV2Foundation,
  options: { caseId?: string } = {},
): CanonicalEconomicsV2GoldObservation {
  const facts = foundation.financialPopulations;
  const values: Record<string, unknown> = {};
  const states: Record<string, string> = {
    "financial.effective_rate_state": publicRateState(foundation.metrics.headlineEffectiveRate.state),
    "financial.average_ticket_state": publicAverageTicketState(foundation.metrics.headlineAverageTicket.state),
    "source.provenance": foundation.identity.provenanceStatus,
    "source.template_admission": foundation.templateCapability.admissionStatus,
    "source.template_completeness": foundation.templateCapability.completenessStatus,
    "document.completeness": publicDocumentCompleteness(foundation),
  };
  const valueContexts: Record<string, { denominator: string }> = {};

  addMoney(values, "financial.gross_sales", facts.grossSaleVolume);
  addMoney(values, "financial.refunds", facts.refundVolume);
  addMoney(values, "financial.net_submitted", facts.canonicalNetSubmittedCardVolume);
  addMoney(values, "financial.total_fees", facts.totalStatementProcessingFees);
  addMoney(values, "financial.net_funded", facts.netFundedAmount);
  addMoney(values, "financial.adjustment", facts.settlementAdjustmentAmount);
  addCount(values, "financial.gross_sale_items", facts.grossSaleTransactionCount);
  addCount(values, "financial.transaction_count", facts.grossSaleTransactionCount);
  addCount(values, "financial.refund_count", facts.refundTransactionCount);

  const adjustment = facts.settlementAdjustmentAmount.value;
  const chargebackDebit = facts.chargebackPrincipalDebitAmount.value;
  const representment = facts.chargebackRepresentmentAmount.value;
  if (facts.settlementAdjustmentAmount.status === "available" &&
      facts.chargebackPrincipalDebitAmount.status === "available" &&
      facts.chargebackRepresentmentAmount.status === "available" &&
      adjustment && chargebackDebit && representment) {
    values["financial.adjustments_chargebacks_net"] =
      (adjustment.amountMinor - chargebackDebit.amountMinor + representment.amountMinor) / 100;
  }

  const rateOptions: Array<{ rate_decimal: number; denominator: string }> = [];
  if (foundation.metrics.headlineEffectiveRate.state === "defined" && foundation.metrics.headlineEffectiveRate.value !== null) {
    const value = Number(foundation.metrics.headlineEffectiveRate.value);
    values["financial.effective_rate_decimal"] = value;
    valueContexts["financial.effective_rate_decimal"] = { denominator: "canonical_net_submitted_card_volume" };
    rateOptions.push({ rate_decimal: value, denominator: "canonical_net_submitted_card_volume" });
  }
  const grossRate = foundation.metrics.grossBasedRateDiagnostic;
  if (grossRate?.state === "defined" && grossRate.value !== null) {
    const value = Number(grossRate.value);
    values["financial.gross_based_rate_decimal"] = value;
    valueContexts["financial.gross_based_rate_decimal"] = { denominator: "gross_card_sales" };
    rateOptions.push({ rate_decimal: value, denominator: "gross_card_sales" });
  }
  if (rateOptions.length === 1) values["financial.effective_rate_options"] = rateOptions[0];
  if (rateOptions.length > 1) values["financial.effective_rate_options"] = rateOptions;

  addMoneyValue(values, "financial.average_ticket", foundation.metrics.headlineAverageTicket.value);
  const reconciliationState = publicReconciliationState(foundation);
  if (reconciliationState) states["financial.reconciliation"] = reconciliationState;

  const claims: string[] = [];
  if ((chargebackDebit?.amountMinor ?? 0) > 0 && (representment?.amountMinor ?? 0) > 0) {
    claims.push("OPPOSING_ADJUSTMENT_ACTIVITY_PRESERVED");
  }

  return {
    caseId: options.caseId ?? "RB-V2",
    sourceStatus: sourceStatus(foundation.identity.provenanceStatus),
    provenanceStatus: foundation.identity.provenanceStatus,
    values,
    states,
    claims,
    valueContexts,
    limitations: unique([
      ...foundation.templateCapability.limitations,
      ...foundation.documentIntegrity.limitations,
      ...Object.values(facts).flatMap((fact) => fact.limitations),
      ...foundation.metrics.headlineEffectiveRate.limitations,
      ...foundation.metrics.headlineAverageTicket.limitations,
    ]),
  };
}

function addMoney(
  values: Record<string, unknown>,
  key: string,
  fact: { status: string; value: { amountMinor: number } | null },
): void {
  if (fact.status === "available") addMoneyValue(values, key, fact.value);
}

function addMoneyValue(values: Record<string, unknown>, key: string, value: { amountMinor: number } | null): void {
  if (value) values[key] = value.amountMinor / 100;
}

function addCount(values: Record<string, unknown>, key: string, fact: { status: string; value: number | null }): void {
  if (fact.status === "available" && fact.value !== null) values[key] = fact.value;
}

function sourceStatus(
  provenance: CanonicalEconomicsV2Foundation["identity"]["provenanceStatus"],
): CanonicalEconomicsV2GoldObservation["sourceStatus"] {
  if (provenance === "source_unavailable") return "source_unavailable";
  if (provenance === "requires_human_review" || provenance === "corpus_integrity_hold") return "requires_human_review";
  return "available";
}

function publicRateState(state: CanonicalEconomicsV2Foundation["metrics"]["headlineEffectiveRate"]["state"]): string {
  if (state === "undefined_zero_denominator") return "undefined";
  if (state === "unavailable_numerator" || state === "unavailable_denominator") return "unavailable";
  return state;
}

function publicAverageTicketState(state: CanonicalEconomicsV2Foundation["metrics"]["headlineAverageTicket"]["state"]): string {
  if (state === "undefined_zero_count") return "undefined";
  if (state === "unavailable_numerator" || state === "unavailable_denominator") return "unavailable";
  return state;
}

function publicDocumentCompleteness(foundation: CanonicalEconomicsV2Foundation): string {
  const integrity = foundation.documentIntegrity;
  if (integrity.completenessStatus === "incomplete" &&
      integrity.observedPageCount !== null &&
      integrity.expectedPageCount !== null) {
    return `page_${integrity.observedPageCount}_of_${integrity.expectedPageCount}_only`;
  }
  return integrity.completenessStatus;
}

function publicReconciliationState(foundation: CanonicalEconomicsV2Foundation): string | null {
  if (foundation.reconciliation.length === 0) return null;
  if (foundation.reconciliation.some((control) => control.status === "fail")) return "does_not_reconcile";
  if (foundation.reconciliation.every((control) => control.status === "pass" || control.status === "pass_with_rounding")) {
    return "reconciles";
  }
  return "unresolved";
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
