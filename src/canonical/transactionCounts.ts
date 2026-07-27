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
  evidenceRefs?: unknown;
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
  const candidatesByField = new Map<keyof CanonicalTransactionCounts, CanonicalFactValue<CountValue | null>["candidates"]>();

  for (const item of support) {
    const value = typeof item.value === "number" && Number.isSafeInteger(item.value) && item.value >= 0 ? item.value : null;
    if (value === null) continue;
    const type = transactionTypeFromRole(String(item.role ?? "unknown"));
    const field = COUNT_FIELD_BY_TYPE[type] ?? "unknownCounts";
    const selectable = type === "submitted_transactions" || type === "settled_transactions";
    const evidenceRefs = evidenceRefsForCount(item, input.evidenceRefs);
    const countCandidate = candidate<CountValue | null>({
      id: `cand_count_${type}_${value}`,
      role: type === "card_type_items" ? "card_type_total" : "unknown",
      value,
      evidenceRefs,
      parserId: input.parserId,
      parserVersion: input.parserVersion,
      confidence: selectable ? "high" : "medium",
      selected: false,
      selectionReason: null,
      rejectionReason: selectable
        ? null
        : "Count population is not approved as a statement-level average-ticket denominator.",
    });
    candidatesByField.set(field, [...(candidatesByField.get(field) ?? []), countCandidate]);
    if (!selectable) {
      continue;
    }
  }

  for (const [field, candidates] of candidatesByField.entries()) {
    const selectableCandidates = candidates.filter((item) => item.rejectionReason === null);
    if (selectableCandidates.length === 0) {
      counts[field] = unavailableFact(reasonForUnavailableField(field), candidates);
      continue;
    }

    const values = new Set(selectableCandidates.map((item) => item.value));
    const selected = values.size === 1 && selectableCandidates.length === 1 ? selectableCandidates[0] : null;
    if (!selected || selected.evidenceRefs.length === 0) {
      counts[field] = unavailableFact("Transaction count was not selected because the population was conflicting or lacked source evidence.", candidatesWithRejections(candidates));
      continue;
    }

    counts[field] = selectedFact({
      value: selected.value,
      confidence: selected.confidence,
      evidenceRefs: selected.evidenceRefs,
      selectedCandidateId: selected.id,
      selectionReason: reasonForSelectedField(field),
      candidates: candidates.map((item) =>
        item.id === selected.id
          ? { ...item, selected: true, selectionReason: reasonForSelectedField(field), rejectionReason: null }
          : {
              ...item,
              selected: false,
              selectionReason: null,
              rejectionReason: item.rejectionReason ?? "Competing transaction-count candidate was not selected.",
            },
      ),
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

function evidenceRefsForCount(item: RawSupportingCount, fallbackRefs: string[]): string[] {
  if (Array.isArray(item.evidenceRefs) && item.evidenceRefs.every((ref) => typeof ref === "string")) {
    return [...new Set(item.evidenceRefs)];
  }
  return [...new Set(fallbackRefs)];
}

function candidatesWithRejections(
  candidates: CanonicalFactValue<CountValue | null>["candidates"],
): CanonicalFactValue<CountValue | null>["candidates"] {
  return candidates.map((item) => ({
    ...item,
    selected: false,
    selectionReason: null,
    rejectionReason: item.rejectionReason ?? "Transaction-count candidate was not uniquely selected with source evidence.",
  }));
}

function reasonForSelectedField(field: keyof CanonicalTransactionCounts): string {
  if (field === "submittedTransactions") return "Verified submitted transaction count is available for population-compatibility evaluation.";
  if (field === "settledTransactions") return "Verified settled transaction count is available for population-compatibility evaluation.";
  return "Verified population-compatible transaction count is available.";
}

function reasonForUnavailableField(field: keyof CanonicalTransactionCounts): string {
  if (field === "cardTypeItems") return "Card-type item count is a subtotal/supporting count, not a verified statement-level denominator.";
  if (field === "authorizations") return "Authorization count is not verified as matching selected sales volume.";
  if (field === "refunds") return "Refund count is not a sales transaction denominator.";
  if (field === "chargebacks") return "Chargeback count is not a sales transaction denominator.";
  if (field === "networkTransactions") return "Network transaction count is not verified as matching selected sales volume.";
  if (field === "auditSpecificCounts") return "Audit-specific count is not verified as matching selected sales volume.";
  if (field === "submittedTransactions") return "Submitted transaction count was not uniquely verified.";
  if (field === "settledTransactions") return "Settled transaction count was not uniquely verified.";
  return "Transaction count type is unknown or not population-compatible.";
}
