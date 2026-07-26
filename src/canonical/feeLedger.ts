import { documentIrFromPdfjsParsedDocument } from "../documentIrFromPdfjs.js";
import { makeEvidenceRecord, attachParserInterpretation, normalizeEvidenceText } from "./evidence.js";
import { occurrenceFromEvidence, semanticFeeRowId } from "./feeLedgerIdentity.js";
import { addMoney, moneyFromNumber } from "./money.js";
import { parsePrintedRate, printedMonetaryControl } from "./feeLedgerReconciliation.js";
import type { ParsedDocument } from "../parser.js";
import type {
  CanonicalCalculationRecord,
  CanonicalEvidenceRecord,
  CanonicalFeeLedger,
  CanonicalFeeParserInterpretation,
  CanonicalFeeRow,
  CanonicalFeeRowRole,
  CanonicalFeeSourceOccurrence,
  CanonicalConfidence,
  MoneyAmount,
} from "./types.js";

type MatchedParserContext = {
  driverId: string | null;
  driverName: string | null;
};

export function buildCanonicalFeeLedger(input: {
  doc: ParsedDocument;
  parserOutput: Record<string, unknown> | null;
  matched: MatchedParserContext;
  documentId: string;
  evidence: Map<string, CanonicalEvidenceRecord>;
  calculations: CanonicalCalculationRecord[];
}): CanonicalFeeLedger {
  const feeLedger = recordOrNull(input.parserOutput?.feeLedger);
  if (!feeLedger) return unavailableLedger("Parser output did not include a fee ledger.");

  const rows = arrayOfRecords(feeLedger.rows);
  const controls = arrayOfRecords(feeLedger.controls);
  if (rows.length === 0) return unavailableLedger("Parser fee ledger did not include charge rows.");

  const documentIr = documentIrFromPdfjsParsedDocument(input.doc, { id: input.documentId });
  const sourceOccurrences = new Map<string, CanonicalFeeSourceOccurrence>();
  const interpretations: CanonicalFeeParserInterpretation[] = [];
  const lineUseCounts = new Map<string, number>();

  for (const [index, row] of rows.entries()) {
    const amount = moneyFromNumber(numberOrNull(row.amount) ?? 0);
    if (!amount) continue;
    const label = labelForFeeRow(row);
    const evidenceText = stringOrNull(row.evidenceLine) ?? label;
    const pageNumber = numberOrNull(row.pageNumber);
    const line = findSourceLine(documentIr, evidenceText, pageNumber, lineUseCounts);
    const role = roleForFeeRow(row, amount);
    const evidence = attachParserInterpretation(
      makeEvidenceRecord({
        documentId: input.documentId,
        pageNumber: line?.pageNumber ?? pageNumber,
        rowIndex: rowIndexFromLineId(line?.id) ?? index,
        lineId: line?.id ?? null,
        section: stringOrNull(row.sourceSection),
        extractedText: line?.text ?? evidenceText,
        sourceRole: "fee_row",
        confidence: confidenceFor(row),
        extractionMethod: "document_ir",
      }),
      {
        parserId: input.matched.driverId,
        parserVersion: null,
        interpretedRole: role,
        interpretedValue: amount,
        confidence: confidenceFor(row),
      },
    );
    input.evidence.set(evidence.id, evidence);
    const occurrence = occurrenceFromEvidence({ evidence });
    sourceOccurrences.set(occurrence.id, occurrence);
    interpretations.push({
      id: `feeint_${interpretations.length + 1}`,
      sourceOccurrenceId: occurrence.id,
      parserId: input.matched.driverId,
      parserVersion: null,
      label,
      amount,
      signedAmount: signedAmountForRow(row, amount, evidenceText),
      rowRole: role,
      section: stringOrNull(row.sourceSection),
      pageNumber: line?.pageNumber ?? pageNumber,
      printedRate: numberOrNull(row.volumeBasis) === null ? null : printedRateFromEvidence(evidenceText),
      printedPerItemRate: numberOrNull(row.count) === null ? null : printedRateFromEvidence(evidenceText),
      itemCount: numberOrNull(row.count),
      volume: numberOrNull(row.volumeBasis) === null ? null : moneyFromNumber(numberOrNull(row.volumeBasis)!),
      confidence: confidenceFor(row),
    });
  }

  const canonicalRows = mergeInterpretations(interpretations);
  const contributingRows = canonicalRows.filter((row) => row.contributesToUniqueTotal && row.signedAmount !== null);
  const uniqueChargeTotal = contributingRows.length > 0 ? addMoney(contributingRows.map((row) => row.signedAmount!)) : null;
  const calculationRef = uniqueChargeTotal ? "calc_canonical_fee_unique_total" : undefined;
  if (uniqueChargeTotal) {
    input.calculations.push({
      id: calculationRef!,
      formulaCode: "canonical_fee_unique_total",
      formulaVersion: "canonical_fee_ledger_v1",
      inputs: contributingRows.map((row) => ({
        label: row.selectedLabel,
        value: row.signedAmount,
        unit: "money",
        evidenceRefs: row.sourceOccurrenceIds
          .map((id) => sourceOccurrences.get(id)?.evidenceRef)
          .filter((id): id is string => Boolean(id)),
      })),
      result: uniqueChargeTotal,
      unit: "money",
      roundingPolicy: "money_minor_units_usd_v1",
    });
  }

  const printedTotal = moneyFromNumber(numberOrNull(feeLedger.printedTotal) ?? Number.NaN);
  const controlEvidenceRefs = controls
    .map((control, index) => {
      const text = stringOrNull(control.evidenceLine);
      if (!text) return null;
      const evidence = makeEvidenceRecord({
        documentId: input.documentId,
        pageNumber: null,
        rowIndex: index,
        extractedText: text,
        sourceRole: "control_total",
        confidence: "medium",
        extractionMethod: "document_ir",
      });
      input.evidence.set(evidence.id, evidence);
      return evidence.id;
    })
    .filter((id): id is string => Boolean(id));

  const reconciliationControls =
    printedTotal || uniqueChargeTotal
      ? [
          printedMonetaryControl({
            id: "ctrl_canonical_fee_unique_total_to_printed_total",
            label: "Unique canonical fee total to printed fee total",
            evidenceRefs: controlEvidenceRefs,
            expectedAmount: printedTotal,
            actualAmount: uniqueChargeTotal,
            derivationGroupId: "canonical_fee_rows_vs_printed_control",
            documentedOneCentRounding: Math.abs(numberOrNull(feeLedger.delta) ?? 0) <= 0.01 && Math.abs(numberOrNull(feeLedger.delta) ?? 0) > 0,
          }),
        ]
      : [];

  const hasUnresolved = canonicalRows.some((row) => row.role === "unknown_unresolved" || row.limitations.length > 0);
  const hasBlockingControl = reconciliationControls.some((control) => control.status === "verification_required" || control.status === "blocked");
  const status: CanonicalFeeLedger["status"] =
    !uniqueChargeTotal || hasBlockingControl ? "partial" : hasUnresolved ? "partial" : "available";

  return {
    policyVersion: "canonical_fee_ledger_v1",
    status,
    sourceOccurrences: [...sourceOccurrences.values()],
    parserInterpretations: interpretations,
    rows: canonicalRows,
    uniqueChargeTotal,
    uniqueChargeCalculationRef: calculationRef,
    controls: reconciliationControls,
    limitations: [
      ...(hasBlockingControl ? ["Canonical fee rows do not reconcile to the printed fee control under Package C tolerance policy."] : []),
      ...(hasUnresolved ? ["One or more fee rows remain unresolved or limited."] : []),
    ],
  };
}

export function mergeInterpretations(interpretations: CanonicalFeeParserInterpretation[]): CanonicalFeeRow[] {
  const grouped = new Map<string, CanonicalFeeParserInterpretation[]>();
  for (const interpretation of interpretations) {
    grouped.set(interpretation.sourceOccurrenceId, [...(grouped.get(interpretation.sourceOccurrenceId) ?? []), interpretation]);
  }

  return [...grouped.values()].map((items) => {
    const selected = items[0]!;
    const amountSet = new Set(items.map((item) => item.amount?.amountMinor ?? "amount_unknown"));
    const hasAmountConflict = amountSet.size > 1;
    const role = hasAmountConflict ? "unknown_unresolved" : selectedRole(items);
    const contributes = !hasAmountConflict && contributesToUniqueTotal(role, selected.signedAmount);
    const sourceOccurrenceIds = [...new Set(items.map((item) => item.sourceOccurrenceId))];
    const selectedAmount = selected.amount;
    const rejectedAmountCandidates = items
      .filter((item) => item.id !== selected.id && item.amount && selectedAmount && item.amount.amountMinor !== selectedAmount.amountMinor)
      .map((item) => ({
        amount: item.amount!,
        interpretationId: item.id,
        reason: "Conflicting amount candidate preserved for human review.",
      }));
    return {
      id: semanticFeeRowId({
        sourceOccurrenceIds,
        role,
        selectedAmountMinor: selectedAmount?.amountMinor ?? null,
      }),
      role,
      sourceOccurrenceIds,
      parserInterpretationIds: items.map((item) => item.id),
      selectedLabel: selected.label,
      selectedAmount,
      signedAmount: selected.signedAmount,
      contributesToUniqueTotal: contributes,
      mergeReason: hasAmountConflict ? "ambiguous_similarity_unresolved" : items.length > 1 ? "same_source_occurrence" : null,
      mergeConfidence: items.length > 1 ? "high" : selected.confidence,
      rejectedAmountCandidates,
      limitations: hasAmountConflict ? ["Conflicting amount candidates prevent confident alias selection."] : [],
    };
  });
}

function unavailableLedger(reason: string): CanonicalFeeLedger {
  return {
    policyVersion: "canonical_fee_ledger_v1",
    status: "unavailable",
    sourceOccurrences: [],
    parserInterpretations: [],
    rows: [],
    uniqueChargeTotal: null,
    controls: [],
    limitations: [reason],
  };
}

function roleForFeeRow(row: Record<string, unknown>, amount: MoneyAmount): CanonicalFeeRowRole {
  const label = labelForFeeRow(row);
  const context = `${label} ${String(row.sourceSection ?? "")}`.toLowerCase();
  if (amount.amountMinor === 0) return "zero_dollar_reference_row";
  if (/\b(total|subtotal)\b/.test(label.toLowerCase())) return "section_subtotal";
  if (/\b(credit|refund|reversal)\b/.test(context)) return "credit";
  if (/\b(adjustment|chargeback)\b/.test(context)) return "adjustment";
  if (/\b(interchange|program fees?)\b/.test(context)) return "interchange_detail_row";
  if (/\b(rate only|rate reference)\b/.test(context)) return "informational_rate_row";
  return "individual_charge";
}

function contributesToUniqueTotal(role: CanonicalFeeRowRole, signedAmount: MoneyAmount | null): boolean {
  if (!signedAmount || signedAmount.amountMinor === 0) return false;
  return role === "individual_charge" || role === "adjustment" || role === "credit";
}

function signedAmountForRow(row: Record<string, unknown>, amount: MoneyAmount, evidenceText: string): MoneyAmount {
  const role = roleForFeeRow(row, amount);
  if (role === "credit") return { ...amount, amountMinor: -Math.abs(amount.amountMinor) };
  if (role === "adjustment") {
    const sign = printedAmountSign(evidenceText);
    return { ...amount, amountMinor: sign * Math.abs(amount.amountMinor) };
  }
  return { ...amount, amountMinor: Math.abs(amount.amountMinor) };
}

function selectedRole(items: CanonicalFeeParserInterpretation[]): CanonicalFeeRowRole {
  const roles = items.map((item) => item.rowRole);
  if (roles.includes("individual_charge")) return "individual_charge";
  if (roles.includes("adjustment")) return "adjustment";
  if (roles.includes("credit")) return "credit";
  return roles[0] ?? "unknown_unresolved";
}

function printedAmountSign(evidenceText: string): 1 | -1 {
  const amountToken = evidenceText.match(/-?\$?\d[\d,]*(?:\.\d{2})\)?/g)?.at(-1) ?? "";
  return amountToken.trim().startsWith("-") || /^\(.*\)$/.test(amountToken.trim()) ? -1 : 1;
}

function findSourceLine(
  documentIr: ReturnType<typeof documentIrFromPdfjsParsedDocument>,
  evidenceText: string,
  pageNumber: number | null,
  lineUseCounts: Map<string, number>,
) {
  const normalized = normalizeEvidenceText(evidenceText);
  const lines = documentIr.pages.flatMap((page) => page.lines);
  const matches = lines.filter((line) => (pageNumber === null || line.pageNumber === pageNumber) && normalizeEvidenceText(line.text) === normalized);
  const fallbackMatches = matches.length > 0 ? matches : lines.filter((line) => normalizeEvidenceText(line.text) === normalized);
  const key = `${pageNumber ?? "page_unknown"}|${normalized}`;
  const useCount = lineUseCounts.get(key) ?? 0;
  const selected = fallbackMatches[useCount] ?? fallbackMatches[0] ?? null;
  lineUseCounts.set(key, useCount + 1);
  return selected;
}

function labelForFeeRow(row: Record<string, unknown>): string {
  const network = stringOrNull(row.network);
  const description = stringOrNull(row.description) ?? stringOrNull(row.label) ?? "Fee row";
  return network ? `${network} - ${description}` : description;
}

function confidenceFor(row: Record<string, unknown>): Exclude<CanonicalConfidence, "needs_review"> {
  const confidence = row.confidence;
  return confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : "medium";
}

function rowIndexFromLineId(lineId: string | null | undefined): number | null {
  const match = String(lineId ?? "").match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function printedRateFromEvidence(evidenceText: string) {
  const cells = evidenceText
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
  const rateCandidateCells = cells.length > 2 ? cells.slice(0, -1).filter((cell) => !/[$,]/.test(cell)) : [evidenceText];
  const searchText = rateCandidateCells.join(" ");
  const rateToken =
    [...searchText.matchAll(/-?\d+(?:\.\d+)?\s*bps\b|-?\d+(?:\.\d+)?\s*%|-?(?:\d+\.\d+|\.\d+)/gi)]
      .map((match) => match[0].trim())
      .at(-1) ?? null;
  return rateToken ? parsePrintedRate(rateToken) : null;
}
