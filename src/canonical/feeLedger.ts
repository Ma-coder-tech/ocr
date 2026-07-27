import { documentIrFromPdfjsParsedDocument } from "../documentIrFromPdfjs.js";
import { makeEvidenceRecord, attachParserInterpretation, normalizeEvidenceText } from "./evidence.js";
import { occurrenceFromEvidence, semanticFeeRowId } from "./feeLedgerIdentity.js";
import { addMoney, moneyFromNumber } from "./money.js";
import { parsePrintedRate, printedMonetaryControl } from "./feeLedgerReconciliation.js";
import type { ParsedDocument } from "../parser.js";
import type {
  CanonicalCalculationRecord,
  CanonicalEvidenceRecord,
  CanonicalFeeContributionDecision,
  CanonicalFeeLedger,
  CanonicalFeeLedgerControl,
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
      bucket: stringOrNull(row.bucket),
      sourceTypeCode: stringOrNull(row.type),
    });
  }

  const initialRows = mergeInterpretations(interpretations);
  const parserControls = parserReconciliationControls({
    controls,
    rows: initialRows,
    interpretations,
    evidence: input.evidence,
    documentId: input.documentId,
  });
  const canonicalRows = applyContributionDecisions({
    rows: initialRows,
    interpretations,
    sourceOccurrences,
    controls: parserControls,
  });
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
  const canonicalTotalControl: CanonicalFeeLedgerControl | null =
    printedTotal || uniqueChargeTotal
      ? printedMonetaryControl({
          id: "ctrl_canonical_fee_unique_total_to_printed_total",
          label: "Unique canonical fee total to printed fee total",
          evidenceRefs: parserControls.flatMap((control) => control.evidenceRefs),
          expectedAmount: printedTotal,
          actualAmount: uniqueChargeTotal,
          derivationGroupId: "canonical_fee_rows_vs_printed_control",
          documentedOneCentRounding: Math.abs(numberOrNull(feeLedger.delta) ?? 0) === 0.01,
          coveredFeeRowIds: contributingRows.map((row) => row.id),
          basis: "grand_control",
          amountBasis: "signed_net",
          independence: "derived_diagnostic",
          reasonCode: "canonical_unique_total_vs_printed_total",
        })
      : null;
  const reconciliationControls = [...parserControls, ...(canonicalTotalControl ? [canonicalTotalControl] : [])];

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
    const sourceOccurrenceIds = [...new Set(items.map((item) => item.sourceOccurrenceId))];
    const selectedAmount = selected.amount;
    const contributionDecision = baseContributionDecision({ role, signedAmount: selected.signedAmount, hasAmountConflict, confidence: selected.confidence });
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
      contributesToUniqueTotal: contributionDecision.contributes,
      contributionDecision,
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

function parserReconciliationControls(input: {
  controls: Record<string, unknown>[];
  rows: CanonicalFeeRow[];
  interpretations: CanonicalFeeParserInterpretation[];
  evidence: Map<string, CanonicalEvidenceRecord>;
  documentId: string;
}): CanonicalFeeLedgerControl[] {
  return input.controls.flatMap((control, index) => {
    const printedTotal = moneyFromNumber(numberOrNull(control.printedTotal) ?? Number.NaN);
    const rowSum = moneyFromNumber(numberOrNull(control.rowSum) ?? Number.NaN);
    const label = stringOrNull(control.label) ?? `Parser fee control ${index + 1}`;
    const evidenceRefs: string[] = [];
    const evidenceLine = stringOrNull(control.evidenceLine);
    if (evidenceLine) {
      const evidence = makeEvidenceRecord({
        documentId: input.documentId,
        pageNumber: null,
        rowIndex: index,
        extractedText: evidenceLine,
        sourceRole: "control_total",
        confidence: "medium",
        extractionMethod: "document_ir",
      });
      input.evidence.set(evidence.id, evidence);
      evidenceRefs.push(evidence.id);
    }
    if (!printedTotal && !rowSum) return [];
    const coveredFeeRowIds = coveredRowsForControl(label, input.rows, input.interpretations);
    const delta = numberOrNull(control.delta);
    return [
      printedMonetaryControl({
        id: `ctrl_parser_${stableControlId(label, index)}`,
        label,
        evidenceRefs,
        expectedAmount: printedTotal,
        actualAmount: rowSum,
        derivationGroupId: "parser_printed_fee_controls",
        documentedOneCentRounding: Math.abs(delta ?? Number.NaN) === 0.01,
        coveredFeeRowIds,
        basis: isGrandControl(label) ? "grand_control" : "section_control",
        amountBasis: "fee_charge_gross",
        independence: "printed_source_control",
        reasonCode: isGrandControl(label) ? "parser_grand_control_reconciliation" : "parser_section_control_reconciliation",
      }),
    ];
  });
}

function applyContributionDecisions(input: {
  rows: CanonicalFeeRow[];
  interpretations: CanonicalFeeParserInterpretation[];
  sourceOccurrences: Map<string, CanonicalFeeSourceOccurrence>;
  controls: CanonicalFeeLedgerControl[];
}): CanonicalFeeRow[] {
  return input.rows.map((row) => {
    const rowInterpretations = input.interpretations.filter((interpretation) => row.parserInterpretationIds.includes(interpretation.id));
    const decision = contributionDecisionForRow(row, rowInterpretations, input.sourceOccurrences, input.controls);
    return {
      ...row,
      contributesToUniqueTotal: decision.contributes,
      contributionDecision: decision,
      limitations: [...row.limitations, ...decision.limitations],
    };
  });
}

function contributionDecisionForRow(
  row: CanonicalFeeRow,
  interpretations: CanonicalFeeParserInterpretation[],
  sourceOccurrences: Map<string, CanonicalFeeSourceOccurrence>,
  controls: CanonicalFeeLedgerControl[],
): CanonicalFeeContributionDecision {
  if (row.role === "interchange_detail_row") {
    return interchangeContributionDecision(row, interpretations, sourceOccurrences, controls);
  }
  const evidenceRefs = row.sourceOccurrenceIds
    .map((id) => sourceOccurrences.get(id)?.evidenceRef)
    .filter((id): id is string => Boolean(id));
  const decision = baseContributionDecision({
    role: row.role,
    signedAmount: row.signedAmount,
    hasAmountConflict: row.mergeReason === "ambiguous_similarity_unresolved",
    confidence: row.mergeConfidence,
  });
  return { ...decision, evidenceRefs };
}

function baseContributionDecision(input: {
  role: CanonicalFeeRowRole;
  signedAmount: MoneyAmount | null;
  hasAmountConflict: boolean;
  confidence: CanonicalConfidence;
}): CanonicalFeeContributionDecision {
  const evidenceRefs: string[] = [];
  if (input.hasAmountConflict) {
    return excludedDecision("unresolved_amount_conflict", input.confidence, ["Conflicting amount candidates prevent contribution to the unique fee total."]);
  }
  if (!input.signedAmount || input.signedAmount.amountMinor === 0 || input.role === "zero_dollar_reference_row") {
    return excludedDecision("zero_amount_excluded", input.confidence);
  }
  if (input.role === "individual_charge") {
    return includedDecision("individual_charge_included", "fee_charge_magnitude", "fee_charge_gross", input.confidence, evidenceRefs, []);
  }
  if (input.role === "adjustment") {
    return includedDecision("signed_adjustment_included", "printed_signed_amount", "signed_net", input.confidence, evidenceRefs, []);
  }
  if (input.role === "credit") {
    return includedDecision("signed_credit_included", "printed_signed_amount", "signed_net", input.confidence, evidenceRefs, []);
  }
  if (input.role === "section_subtotal" || input.role === "fee_bucket_total" || input.role === "statement_control_total") {
    return excludedDecision("subtotal_or_control_excluded", input.confidence);
  }
  if (input.role === "informational_rate_row") return excludedDecision("rate_only_excluded", input.confidence);
  if (input.role === "duplicate_representation") return excludedDecision("duplicate_representation_excluded", input.confidence);
  if (input.role === "supporting_evidence_only") return excludedDecision("supporting_evidence_only_excluded", input.confidence);
  return excludedDecision("unknown_role_excluded", input.confidence);
}

function interchangeContributionDecision(
  row: CanonicalFeeRow,
  interpretations: CanonicalFeeParserInterpretation[],
  sourceOccurrences: Map<string, CanonicalFeeSourceOccurrence>,
  controls: CanonicalFeeLedgerControl[],
): CanonicalFeeContributionDecision {
  const evidenceRefs = row.sourceOccurrenceIds
    .map((id) => sourceOccurrences.get(id)?.evidenceRef)
    .filter((id): id is string => Boolean(id));
  const sourceTexts = row.sourceOccurrenceIds
    .map((id) => sourceOccurrences.get(id)?.normalizedSourceText ?? "")
    .filter(Boolean);
  const coverage = controls.filter(
    (control) =>
      control.coveredFeeRowIds.includes(row.id) &&
      control.independence === "printed_source_control" &&
      (control.status === "pass" || control.status === "pass_with_rounding"),
  );
  const sourceOccurrencePresent = row.sourceOccurrenceIds.length > 0 && evidenceRefs.length === row.sourceOccurrenceIds.length;
  const printedAmountPresent = Boolean(row.selectedAmount && row.selectedAmount.amountMinor !== 0 && sourceTexts.some(hasPrintedMoney));
  const feeSectionPresent = interpretations.some((interpretation) => isFeeChargeSection(interpretation.section) || isFeeChargeType(interpretation));
  const printedSignKnown = sourceTexts.some(hasKnownFeeChargeSign);
  const subtotalOrControl = row.role === "section_subtotal" || row.role === "fee_bucket_total" || row.role === "statement_control_total";

  if (!sourceOccurrencePresent) return excludedDecision("interchange_without_printed_amount", row.mergeConfidence, ["Interchange row lacks stable source occurrence evidence."], evidenceRefs);
  if (!printedAmountPresent) return excludedDecision("interchange_without_printed_amount", row.mergeConfidence, ["Interchange row lacks printed monetary amount evidence."], evidenceRefs);
  if (!printedSignKnown) return excludedDecision("interchange_amount_sign_untrusted", row.mergeConfidence, ["Interchange row lacks a known printed charge/deduction basis."], evidenceRefs);
  if (!feeSectionPresent) return excludedDecision("interchange_without_fee_section", row.mergeConfidence, ["Interchange row is not tied to a fee-charge section."], evidenceRefs);
  if (subtotalOrControl) return excludedDecision("subtotal_or_control_excluded", row.mergeConfidence, [], evidenceRefs);
  if (coverage.length === 0) {
    return excludedDecision("interchange_without_control_coverage", row.mergeConfidence, ["Interchange row is not covered by a passing printed section/control total."], evidenceRefs);
  }

  return includedDecision(
    "pass_through_fee_charge_included",
    "fee_charge_magnitude",
    "fee_charge_gross",
    row.mergeConfidence,
    evidenceRefs,
    [...new Set(coverage.map((control) => control.id))],
  );
}

function includedDecision(
  reasonCode: CanonicalFeeContributionDecision["reasonCode"],
  signedAmountBasis: CanonicalFeeContributionDecision["signedAmountBasis"],
  grossNetBasis: CanonicalFeeContributionDecision["grossNetBasis"],
  confidence: CanonicalConfidence,
  evidenceRefs: string[],
  controlRefs: string[],
): CanonicalFeeContributionDecision {
  return {
    contributes: true,
    reasonCode,
    controlRefs,
    evidenceRefs,
    signedAmountBasis,
    grossNetBasis,
    confidence,
    limitations: [],
  };
}

function excludedDecision(
  reasonCode: CanonicalFeeContributionDecision["reasonCode"],
  confidence: CanonicalConfidence,
  limitations: string[] = [],
  evidenceRefs: string[] = [],
): CanonicalFeeContributionDecision {
  return {
    contributes: false,
    reasonCode,
    controlRefs: [],
    evidenceRefs,
    signedAmountBasis: "not_applicable",
    grossNetBasis: "not_applicable",
    confidence,
    limitations,
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

function coveredRowsForControl(
  label: string,
  rows: CanonicalFeeRow[],
  interpretations: CanonicalFeeParserInterpretation[],
): string[] {
  const matched = rows.filter((row) => {
    const rowInterpretations = interpretations.filter((interpretation) => row.parserInterpretationIds.includes(interpretation.id));
    if (rowInterpretations.length === 0) return false;
    if (isGrandControl(label)) return row.role !== "section_subtotal" && row.role !== "fee_bucket_total" && row.role !== "statement_control_total";
    return rowInterpretations.some((interpretation) => interpretationCoveredByControl(label, interpretation));
  });
  return matched.map((row) => row.id).sort();
}

function interpretationCoveredByControl(label: string, interpretation: CanonicalFeeParserInterpretation): boolean {
  const normalized = label.toLowerCase();
  const section = String(interpretation.section ?? "").toLowerCase();
  const bucket = String(interpretation.bucket ?? "").toLowerCase();
  const typeCode = String(interpretation.sourceTypeCode ?? "").toLowerCase();
  const rowContext = `${section} ${bucket} ${typeCode}`;
  if (normalized.includes("card fees")) return bucket === "cardfees" || typeCode === "cf";
  if (normalized.includes("miscellaneous")) return bucket === "miscellaneousfees" || typeCode === "misc";
  if (normalized.includes("transaction fees")) return rowContext.includes("transaction");
  if (normalized.includes("debit network")) return rowContext.includes("debit") && rowContext.includes("network");
  if (normalized.includes("account fees")) return rowContext.includes("account");
  if (normalized.includes("equipment")) return rowContext.includes("equipment");
  if (normalized.includes("interchange")) return rowContext.includes("interchange") || rowContext.includes("program fee");
  if (normalized.includes("service charges")) return rowContext.includes("service");
  if (normalized === "total fees") return rowContext.includes("fees") || rowContext.includes("fee");
  return false;
}

function isGrandControl(label: string): boolean {
  const normalized = label.toLowerCase();
  return normalized.includes("grand") || normalized.startsWith("total (") || normalized.includes("miscellaneous fees and card fees");
}

function stableControlId(label: string, index: number): string {
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
  return `${index + 1}_${normalized || "control"}`;
}

function isFeeChargeSection(section: string | null): boolean {
  return /\b(fees?|charges?|transaction|account|equipment|interchange|service|miscellaneous)\b/i.test(section ?? "");
}

function isFeeChargeType(interpretation: CanonicalFeeParserInterpretation): boolean {
  return /^(cf|misc)$/i.test(interpretation.sourceTypeCode ?? "") || /fees?/i.test(interpretation.bucket ?? "");
}

function hasPrintedMoney(value: string): boolean {
  return /(?:\(|-)?\$?\s*\d[\d,]*\.\d{2}\)?\s*(?:CR)?/i.test(value);
}

function hasKnownFeeChargeSign(value: string): boolean {
  const token = value.match(/(?:\(|-)?\$?\s*\d[\d,]*\.\d{2}\)?\s*(?:CR)?/gi)?.at(-1)?.trim() ?? "";
  return Boolean(token && (/^-/.test(token) || /^\(/.test(token) || /\bCR\b/i.test(token) || /^\$?\s*\d/.test(token)));
}

function printedAmountSign(evidenceText: string): 1 | -1 {
  const amountToken = evidenceText.match(/(?:\(|-)?\$?\s*\d[\d,]*(?:\.\d{2})\)?\s*(?:CR)?/g)?.at(-1) ?? "";
  return amountToken.trim().startsWith("-") || /^\(.*\)$/.test(amountToken.trim()) || /\bCR\b/i.test(amountToken) ? -1 : 1;
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
