import { moneyFromDecimalString } from "./money.js";
import { parsePrintedRate } from "./feeLedgerReconciliation.js";
import type { CanonicalFeeOperandCandidate, CanonicalFeeOperandRecovery, DecimalString } from "./types.js";

export const FEE_BASIS_OPERAND_COVERAGE_POLICY_VERSION = "fee_basis_operand_coverage_conflict_resolution_v1" as const;

export function recoverPrintedFeeOperands(input: {
  label: string;
  sources: Array<{ evidenceRef: string; text: string | null }>;
}): CanonicalFeeOperandRecovery {
  const extracted = input.sources.flatMap((source) => candidatesFromSource(input.label, source));
  const pairSignatures = new Set(extracted.map((item) => item.pairSignature));
  const candidates = deduplicateCandidates(extracted.map((item) => item.candidate));
  if (candidates.length === 0) {
    return {
      policyVersion: FEE_BASIS_OPERAND_COVERAGE_POLICY_VERSION,
      status: "unavailable",
      selectedCandidateId: null,
      candidates: [],
      reasonCodes: ["no_complete_printed_basis_rate_pair"],
    };
  }
  if (pairSignatures.size > 1) {
    return {
      policyVersion: FEE_BASIS_OPERAND_COVERAGE_POLICY_VERSION,
      status: "conflicting",
      selectedCandidateId: null,
      candidates,
      reasonCodes: ["conflicting_printed_operand_pairs"],
    };
  }
  if (candidates.length > 1) {
    return {
      policyVersion: FEE_BASIS_OPERAND_COVERAGE_POLICY_VERSION,
      status: "ambiguous",
      selectedCandidateId: null,
      candidates,
      reasonCodes: ["printed_basis_can_be_money_volume_or_transaction_count", "amount_fit_not_used_for_selection"],
    };
  }
  return {
    policyVersion: FEE_BASIS_OPERAND_COVERAGE_POLICY_VERSION,
    status: "recovered",
    selectedCandidateId: candidates[0]!.id,
    candidates,
    reasonCodes: [`selected_by_source_semantics:${candidates[0]!.ruleId}`],
  };
}

function candidatesFromSource(
  label: string,
  source: { evidenceRef: string; text: string | null },
): Array<{ pairSignature: string; candidate: CanonicalFeeOperandCandidate }> {
  if (!source.text) return [];
  const cells = source.text.split("|").map((cell) => cell.trim()).filter(Boolean);
  if (cells.length < 6 || !/^\d{2}\/\d{2}(?:\/\d{2})?$/.test(cells[0] ?? "") || !/^(?:cf|misc)$/i.test(cells[1] ?? "")) return [];
  const middle = cells.slice(3, -1);
  if (middle.length !== 2) return [];
  const basisToken = decimalToken(middle[0] ?? "");
  const rateToken = rateCell(middle[1] ?? "");
  if (!basisToken || !rateToken) return [];
  const printedRate = parsePrintedRate(rateToken);
  if (printedRate.normalizedFractionalRate === null) return [];
  const pairSignature = `${basisToken}|${printedRate.original}`;
  const normalizedLabel = label.toLowerCase();
  const sourceArguments = { basisToken, printedRate, evidenceRef: source.evidenceRef };
  if (/\bkilobytes?\b/.test(normalizedLabel)) {
    return [{ pairSignature, candidate: sourceUnitCandidate(sourceArguments, "explicit_source_unit_description_v1") }];
  }
  if (/\b(?:items?|transactions?)\b/.test(normalizedLabel) && integerValue(basisToken) !== null) {
    return [{ pairSignature, candidate: countCandidate(sourceArguments, "explicit_count_description_v1") }];
  }
  if (!basisToken.includes(".") && integerValue(basisToken) !== null) {
    return [{ pairSignature, candidate: countCandidate(sourceArguments, "integer_count_column_v1") }];
  }
  if (!Number.isInteger(Number(basisToken))) {
    return [{ pairSignature, candidate: volumeCandidate(sourceArguments, "fractional_volume_column_v1") }];
  }
  const count = countCandidate(sourceArguments, "ambiguous_decimal_integer_basis_v1");
  const volume = volumeCandidate(sourceArguments, "ambiguous_decimal_integer_basis_v1");
  return [
    { pairSignature, candidate: count },
    { pairSignature, candidate: volume },
  ];
}

function countCandidate(
  input: { basisToken: DecimalString; printedRate: CanonicalFeeOperandCandidate["printedRate"]; evidenceRef: string },
  ruleId: CanonicalFeeOperandCandidate["ruleId"],
): CanonicalFeeOperandCandidate {
  return candidate({
    formulaBasis: "per_item",
    basisKind: "transaction_count",
    printedRate: input.printedRate,
    volumeBasis: null,
    itemCount: integerValue(input.basisToken),
    sourceUnitBasis: null,
    evidenceRef: input.evidenceRef,
    ruleId,
  });
}

function volumeCandidate(
  input: { basisToken: DecimalString; printedRate: CanonicalFeeOperandCandidate["printedRate"]; evidenceRef: string },
  ruleId: CanonicalFeeOperandCandidate["ruleId"],
): CanonicalFeeOperandCandidate {
  return candidate({
    formulaBasis: "rate_times_volume",
    basisKind: "money_volume",
    printedRate: input.printedRate,
    volumeBasis: moneyFromDecimalString(input.basisToken),
    itemCount: null,
    sourceUnitBasis: null,
    evidenceRef: input.evidenceRef,
    ruleId,
  });
}

function sourceUnitCandidate(
  input: { basisToken: DecimalString; printedRate: CanonicalFeeOperandCandidate["printedRate"]; evidenceRef: string },
  ruleId: CanonicalFeeOperandCandidate["ruleId"],
): CanonicalFeeOperandCandidate {
  return candidate({
    formulaBasis: "source_units_times_per_unit",
    basisKind: "other_source_units",
    printedRate: input.printedRate,
    volumeBasis: null,
    itemCount: null,
    sourceUnitBasis: input.basisToken,
    evidenceRef: input.evidenceRef,
    ruleId,
  });
}

function candidate(input: {
  formulaBasis: CanonicalFeeOperandCandidate["formulaBasis"];
  basisKind: CanonicalFeeOperandCandidate["basisKind"];
  printedRate: CanonicalFeeOperandCandidate["printedRate"];
  volumeBasis: CanonicalFeeOperandCandidate["volumeBasis"];
  itemCount: CanonicalFeeOperandCandidate["itemCount"];
  sourceUnitBasis: CanonicalFeeOperandCandidate["sourceUnitBasis"];
  evidenceRef: string;
  ruleId: CanonicalFeeOperandCandidate["ruleId"];
}): CanonicalFeeOperandCandidate {
  const basis = input.volumeBasis?.amountMinor ?? input.itemCount ?? input.sourceUnitBasis ?? "unknown";
  return {
    id: `feeoperand_${stableId(`${input.formulaBasis}_${basis}_${input.printedRate.original}_${input.ruleId}`)}`,
    formulaBasis: input.formulaBasis,
    basisKind: input.basisKind,
    printedRate: input.printedRate,
    volumeBasis: input.volumeBasis,
    itemCount: input.itemCount,
    sourceUnitBasis: input.sourceUnitBasis,
    evidenceRefs: [input.evidenceRef],
    ruleId: input.ruleId,
  };
}

function deduplicateCandidates(candidates: CanonicalFeeOperandCandidate[]): CanonicalFeeOperandCandidate[] {
  const byValue = new Map<string, CanonicalFeeOperandCandidate>();
  for (const item of candidates) {
    const key = JSON.stringify({
      formulaBasis: item.formulaBasis,
      basisKind: item.basisKind,
      printedRate: item.printedRate,
      volumeBasis: item.volumeBasis,
      itemCount: item.itemCount,
      sourceUnitBasis: item.sourceUnitBasis,
      ruleId: item.ruleId,
    });
    const existing = byValue.get(key);
    byValue.set(key, existing ? { ...existing, evidenceRefs: [...new Set([...existing.evidenceRefs, ...item.evidenceRefs])].sort() } : item);
  }
  return [...byValue.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function decimalToken(value: string): DecimalString | null {
  const normalized = value.replace(/[$,\s]/g, "");
  return /^\d+(?:\.\d+)?$/.test(normalized) && Number.isFinite(Number(normalized)) ? normalized : null;
}

function rateCell(value: string): string | null {
  const normalized = value.trim();
  return /^\d+(?:\.\d+)?(?:\s*(?:%|bps))?$/i.test(normalized) ? normalized : null;
}

function integerValue(value: DecimalString): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function stableId(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
