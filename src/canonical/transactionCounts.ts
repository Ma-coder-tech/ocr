import { divideMoneyByCount } from "./money.js";
import { candidate, selectedFact, unavailableFact } from "./facts.js";
import type {
  CanonicalAverageTicketBasis,
  CanonicalEvidenceRecord,
  CanonicalFactValue,
  CanonicalTransactionCounts,
  CanonicalVolumePopulation,
  CountValue,
  MoneyAmount,
  TransactionCountType,
} from "./types.js";

type RawSupportingCount = {
  role?: unknown;
  value?: unknown;
  reason?: unknown;
};

const COUNT_FIELD_BY_TYPE: Record<TransactionCountType, keyof CanonicalTransactionCounts | null> = {
  submitted_transactions: "submittedTransactions",
  settled_transactions: "settledTransactions",
  authorizations: "authorizations",
  captures: "captures",
  refunds: "refunds",
  chargebacks: "chargebacks",
  network_transactions: "networkTransactions",
  card_type_items: "cardTypeItems",
  audit_specific: "auditSpecificCounts",
  unknown: "unknownCounts",
};

export function emptyTransactionCounts(): CanonicalTransactionCounts {
  return {
    submittedTransactions: unavailableFact("Submitted transaction count was not verified."),
    settledTransactions: unavailableFact("Settled transaction count was not verified."),
    authorizations: unavailableFact("Authorization count is not verified for statement-level average ticket."),
    captures: unavailableFact("Capture count is not verified for statement-level average ticket."),
    refunds: unavailableFact("Refund count is not a sales transaction denominator."),
    chargebacks: unavailableFact("Chargeback count is not a sales transaction denominator."),
    networkTransactions: unavailableFact("Network transaction count is not verified as matching selected sales volume."),
    cardTypeItems: unavailableFact("Card-type item count is a subtotal/supporting count, not a verified statement-level denominator."),
    auditSpecificCounts: unavailableFact("Audit-specific count is not verified as matching selected sales volume."),
    unknownCounts: unavailableFact("Transaction count type is unknown."),
  };
}

export function transactionCountsFromParserSupport(input: {
  supportingCounts: RawSupportingCount[];
  primaryCount: unknown;
  evidenceRefs: string[];
  parserId: string | null;
  parserVersion: string | null;
}): CanonicalTransactionCounts {
  const counts = emptyTransactionCounts();
  const support = input.supportingCounts.length > 0 ? input.supportingCounts : [{ role: "unknown", value: input.primaryCount }];

  for (const item of support) {
    const value = typeof item.value === "number" && Number.isSafeInteger(item.value) && item.value >= 0 ? item.value : null;
    if (value === null) continue;
    const type = transactionTypeFromRole(String(item.role ?? "unknown"));
    const field = COUNT_FIELD_BY_TYPE[type] ?? "unknownCounts";
    const reason = typeof item.reason === "string" && item.reason.trim() ? item.reason : reasonForCountType(type);
    const countCandidate = candidate<CountValue | null>({
      id: `cand_count_${type}_${value}`,
      role: type === "card_type_items" ? "card_type_total" : "unknown",
      value,
      evidenceRefs: input.evidenceRefs,
      parserId: input.parserId,
      parserVersion: input.parserVersion,
      confidence: type === "submitted_transactions" || type === "settled_transactions" ? "high" : "medium",
      selected: type === "submitted_transactions" || type === "settled_transactions",
      selectionReason:
        type === "submitted_transactions" || type === "settled_transactions"
          ? "Count population is typed and eligible for population-compatibility evaluation."
          : null,
      rejectionReason:
        type === "submitted_transactions" || type === "settled_transactions"
          ? null
          : "Count population is not approved as a statement-level average-ticket denominator.",
    });
    counts[field] = selectedFact({
      value,
      confidence: countCandidate.confidence,
      evidenceRefs: input.evidenceRefs,
      selectedCandidateId: countCandidate.id,
      selectionReason: reason,
      candidates: [countCandidate],
    });
  }

  return counts;
}

export function buildAverageTicket(input: {
  processedSales: CanonicalFactValue<MoneyAmount>;
  selectedVolumePopulation: CanonicalVolumePopulation;
  transactionCounts: CanonicalTransactionCounts;
  calculationRef: string;
  evidence: CanonicalEvidenceRecord[];
}): {
  basis: CanonicalAverageTicketBasis;
  averageTicket: CanonicalFactValue<MoneyAmount | null>;
} {
  const compatible = compatibleCountForVolume(input.selectedVolumePopulation, input.transactionCounts);
  if (!input.processedSales.value || input.processedSales.value.amountMinor <= 0 || !compatible) {
    return {
      basis: {
        selectedCountType: null,
        selectedVolumePopulation: input.selectedVolumePopulation,
        allowed: false,
        reason: "Average ticket is unavailable because no verified transaction-count population matches the selected sales-volume population.",
        evidenceRefs: [],
      },
      averageTicket: unavailableFact("Average ticket requires population-compatible sales and transaction-count facts."),
    };
  }

  const result = divideMoneyByCount(input.processedSales.value, compatible.value);
  if (!result) {
    return {
      basis: {
        selectedCountType: compatible.type,
        selectedVolumePopulation: input.selectedVolumePopulation,
        allowed: false,
        reason: "Average ticket is unavailable because the compatible transaction count is zero or invalid.",
        evidenceRefs: compatible.fact.evidenceRefs,
      },
      averageTicket: unavailableFact("Average ticket requires a positive compatible transaction count."),
    };
  }

  return {
    basis: {
      selectedCountType: compatible.type,
      selectedVolumePopulation: input.selectedVolumePopulation,
      allowed: true,
      reason: "Selected sales volume and transaction count use compatible populations.",
      evidenceRefs: [...input.processedSales.evidenceRefs, ...compatible.fact.evidenceRefs],
      calculationRef: input.calculationRef,
    },
    averageTicket: selectedFact({
      value: result,
      confidence: "high",
      evidenceRefs: [...input.processedSales.evidenceRefs, ...compatible.fact.evidenceRefs],
      calculationRef: input.calculationRef,
      selectionReason: "Calculated only after confirming sales and count populations are compatible.",
    }),
  };
}

function compatibleCountForVolume(
  volumePopulation: CanonicalVolumePopulation,
  counts: CanonicalTransactionCounts,
): { type: TransactionCountType; value: number; fact: CanonicalFactValue<CountValue | null> } | null {
  if (volumePopulation === "submitted_sales" && counts.submittedTransactions.value !== null) {
    return { type: "submitted_transactions", value: counts.submittedTransactions.value, fact: counts.submittedTransactions };
  }
  if (volumePopulation === "settled_sales" && counts.settledTransactions.value !== null) {
    return { type: "settled_transactions", value: counts.settledTransactions.value, fact: counts.settledTransactions };
  }
  return null;
}

function transactionTypeFromRole(role: string): TransactionCountType {
  const normalized = role.toLowerCase().replace(/[\s-]+/g, "_");
  if (/submitted/.test(normalized)) return "submitted_transactions";
  if (/settled/.test(normalized)) return "settled_transactions";
  if (/auth/.test(normalized)) return "authorizations";
  if (/capture/.test(normalized)) return "captures";
  if (/refund/.test(normalized)) return "refunds";
  if (/chargeback/.test(normalized)) return "chargebacks";
  if (/network/.test(normalized)) return "network_transactions";
  if (/card_type|gross_sale_items/.test(normalized)) return "card_type_items";
  if (/audit/.test(normalized)) return "audit_specific";
  return "unknown";
}

function reasonForCountType(type: TransactionCountType): string {
  if (type === "submitted_transactions") return "Verified submitted transaction count is available.";
  if (type === "settled_transactions") return "Verified settled transaction count is available.";
  return "Count is preserved for diagnostics but is not approved for average-ticket calculations without population-compatibility proof.";
}
