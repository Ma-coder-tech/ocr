import type { DocumentIR, DocumentLine } from "./documentIr.js";
import { extractFiservProcessorFundingBatchLedgerFromDocumentIr } from "./fiservProcessorBatchFundingFromDocumentIr.js";

export type IndependentDocumentIrValue<T extends number = number> = {
  value: T;
  lineId: string;
  pageNumber: number;
  evidenceLine: string;
};

export type IndependentDocumentIrAnchor = Omit<IndependentDocumentIrValue, "value">;

export type FiservIndependentCardSummary = {
  status: "not_mapped" | "mapped";
  headingAnchor: IndependentDocumentIrAnchor | null;
  headerAnchor: IndependentDocumentIrAnchor | null;
  totalAnchor: IndependentDocumentIrAnchor | null;
  grossVolume: IndependentDocumentIrValue | null;
  refundVolume: IndependentDocumentIrValue | null;
  submittedVolume: IndependentDocumentIrValue | null;
  grossCount: IndependentDocumentIrValue | null;
  refundCount: IndependentDocumentIrValue | null;
  submittedCount: IndependentDocumentIrValue | null;
  formulaDeltaMinor: number | null;
  formulaStatus: "pass" | "fail" | "unresolved";
  limitations: string[];
};

export type FiservIndependentFlowSection = {
  status: "not_mapped" | "mapped" | "explicit_none";
  headingAnchors: IndependentDocumentIrAnchor[];
  coverageStatus:
    | "explicit_no_activity"
    | "reconciled_detail"
    | "printed_total_only"
    | "unreconciled_detail"
    | "ambiguous_source_scope"
    | "incomplete_source_scope"
    | "not_observed";
  rows: Array<IndependentDocumentIrValue & { description: string }>;
  printedTotal: IndependentDocumentIrValue | null;
  rowSumMinor: number | null;
  totalControlStatus: "pass" | "fail" | "unresolved";
  explicitNoneEvidence: IndependentDocumentIrValue<0> | null;
};

export type FiservIndependentAdjustmentChargeback = {
  sourcePresentation: {
    adjustments: "processor_presented_adjustments";
    chargebacks: "processor_presented_chargebacks_reversals";
    combined: "processor_presented_adjustments_chargebacks";
    rule: "preserve_presented_category_before_stronger_split";
  };
  adjustments: FiservIndependentFlowSection;
  chargebacks: FiservIndependentFlowSection;
  combined: FiservIndependentCombinedFlowSection;
};

export type FiservIndependentCombinedFlowSection = Omit<FiservIndependentFlowSection, "rows"> & {
  rows: Array<IndependentDocumentIrValue & {
    description: string;
    classification:
      | "settlement_adjustment"
      | "chargeback_principal_debit"
      | "chargeback_representment"
      | "chargeback_or_reversal"
      | "unresolved";
  }>;
};

export type FiservIndependentSplitPopulationProof = {
  status: "proven" | "withheld";
  valueMinor: number | null;
  proofBasis:
    | "separate_adjustment_section"
    | "separate_chargeback_section"
    | "combined_explicit_no_activity"
    | "combined_exhaustive_classified_rows"
    | "none";
  evidence: Array<IndependentDocumentIrValue & {
    proofRole: "population_value" | "population_component" | "exhaustive_scope" | "explicit_none";
  }>;
  reasonCodes: string[];
};

export type FiservIndependentSplitPopulationProofs = {
  settlementAdjustmentAmount: FiservIndependentSplitPopulationProof;
  chargebackPrincipalDebitAmount: FiservIndependentSplitPopulationProof;
  chargebackRepresentmentAmount: FiservIndependentSplitPopulationProof;
};

export type FiservIndependentFundingBatchPopulation = {
  status: "not_mapped" | "mapped" | "mapped_with_warnings";
  populationKind: "funding_batches" | "daily_funding_summary" | "unresolved";
  rows: Array<{
    batchNumber: string;
    dateSubmitted: string;
    lineId: string;
    pageNumber: number;
    evidenceLine: string;
  }>;
  count: number | null;
  populationAnchor: IndependentDocumentIrAnchor | null;
  limitations: string[];
};

export function extractFiservIndependentCardSummary(ir: DocumentIR): FiservIndependentCardSummary {
  const lines = allLines(ir);
  const headingIndexes = lines.flatMap((line, index) => /\bsummary by card type\b/i.test(line.text) ? [index] : []);
  if (headingIndexes.length !== 1) return emptyCardSummary(headingIndexes.length === 0
    ? "DocumentIR has no SUMMARY BY CARD TYPE section."
    : "DocumentIR has more than one SUMMARY BY CARD TYPE heading; the authority scope is ambiguous.");
  const headingIndex = headingIndexes[0]!;
  const endIndex = lines.findIndex((line, index) => index > headingIndex && /\bsummary by batch\b|\bamounts funded by batch\b/i.test(line.text));
  if (endIndex < 0) return emptyCardSummary("DocumentIR could not bound SUMMARY BY CARD TYPE with a following batch section.");
  const section = lines.slice(headingIndex, endIndex);
  const headers = section.filter((line) => /^card type\s*\|/i.test(line.text.trim()));
  const totals = section.filter((line) => /^total\s*\|/i.test(line.text.trim()));
  if (headers.length !== 1 || totals.length !== 1) {
    return emptyCardSummary("DocumentIR requires exactly one card-summary header and exactly one total row.");
  }
  const header = headers[0]!;
  const total = totals[0]!;
  const cells = cellParts(total.text);
  const itemColumnCount = cellParts(header.text).filter((cell) => /^items$/i.test(cell)).length;
  if (![2, 3].includes(itemColumnCount) || cells.length !== (itemColumnCount === 3 ? 7 : 6)) {
    return emptyCardSummary("The card-summary schema is not one of the two exact supported column shapes.");
  }

  const grossCount = integerCell(cells[1]);
  const grossVolume = moneyCell(cells[2]);
  const refundCount = integerCell(cells[3]);
  const refundVolume = moneyCell(cells[4]);
  const submittedCount = itemColumnCount >= 3 ? integerCell(cells[5]) : null;
  const submittedVolume = moneyCell(cells[itemColumnCount >= 3 ? 6 : 5]);
  if ([grossCount, grossVolume, refundCount, refundVolume, submittedVolume].some((value) => value === null)
    || grossVolume! < 0 || submittedVolume! < 0) {
    return emptyCardSummary("The card-summary total contains an unreadable required value.");
  }
  const grossMinor = toMinor(grossVolume!);
  // The exact refund column supplies the population semantics; layouts print
  // the magnitude either as a credit sign or as an unsigned value.
  const refundMinor = toMinor(Math.abs(refundVolume!));
  const submittedMinor = toMinor(submittedVolume!);
  const delta = grossMinor - refundMinor - submittedMinor;
  const value = <T extends number>(amount: T): IndependentDocumentIrValue<T> => ({
    value: amount,
    lineId: total.id,
    pageNumber: total.pageNumber,
    evidenceLine: total.text,
  });
  return {
    status: "mapped",
    headingAnchor: sourceAnchor(lines[headingIndex]!),
    headerAnchor: sourceAnchor(header),
    totalAnchor: sourceAnchor(total),
    grossVolume: value(grossMinor),
    refundVolume: value(refundMinor),
    submittedVolume: value(submittedMinor),
    grossCount: value(grossCount!),
    refundCount: value(refundCount!),
    submittedCount: submittedCount === null ? null : value(submittedCount),
    formulaDeltaMinor: delta,
    formulaStatus: Math.abs(delta) <= 1 ? "pass" : "fail",
    limitations: submittedCount === null
      ? ["The source card-summary layout does not print a submitted-item total; no submitted-count claim was created."]
      : [],
  };
}

export function extractFiservIndependentAdjustmentChargeback(
  ir: DocumentIR,
): FiservIndependentAdjustmentChargeback {
  const lines = allLines(ir);
  return {
    sourcePresentation: {
      adjustments: "processor_presented_adjustments",
      chargebacks: "processor_presented_chargebacks_reversals",
      combined: "processor_presented_adjustments_chargebacks",
      rule: "preserve_presented_category_before_stronger_split",
    },
    adjustments: extractFlowSection(lines, (line) => {
      const text = line.text.trim();
      return /^adjustments$/i.test(text) || (/^adjustments\s*\|/i.test(text) && /amounts credited|processing and billing/i.test(text));
    }, /\bno adjustments for this statement period\b/i),
    chargebacks: extractFlowSection(lines, (line) => /^chargebacks\/reversals\b/i.test(line.text.trim()),
      /\bno chargebacks\/reversals for this statement period\b/i),
    combined: extractCombinedFlowSection(lines),
  };
}

/**
 * Qualifies split populations only from an exhaustive, reconciled detail section
 * or exact no-activity language. Funding-batch columns and a numeric combined zero
 * are deliberately insufficient to prove gross directional populations.
 */
export function qualifyFiservIndependentSplitPopulations(
  result: FiservIndependentAdjustmentChargeback,
): FiservIndependentSplitPopulationProofs {
  const separateAdjustment = qualifySeparateAdjustment(result.adjustments);
  const separateChargebacks = qualifySeparateChargebacks(result.chargebacks);
  const combined = qualifyCombinedSplitPopulations(result.combined);
  return {
    settlementAdjustmentAmount: chooseProof(separateAdjustment, combined.settlementAdjustmentAmount),
    chargebackPrincipalDebitAmount: chooseProof(
      separateChargebacks.chargebackPrincipalDebitAmount,
      combined.chargebackPrincipalDebitAmount,
    ),
    chargebackRepresentmentAmount: chooseProof(
      separateChargebacks.chargebackRepresentmentAmount,
      combined.chargebackRepresentmentAmount,
    ),
  };
}

export function extractFiservIndependentFundingBatchPopulation(
  ir: DocumentIR,
): FiservIndependentFundingBatchPopulation {
  const lines = allLines(ir);
  const headingIndexes = lines.flatMap((line, index) =>
    /\bamounts funded by batch\b/i.test(line.text) ? [index] : []);
  const headerIndexes = lines.flatMap((line, index) =>
    /^date\s*\|\s*batch\s*\|\s*submitted\b/i.test(line.text.trim()) ? [index] : []);
  if (headingIndexes.length === 0 && headerIndexes.length === 0) {
    const dailySummary = lines.some((line) => /^summary by day$/i.test(line.text.trim()))
      && lines.some((line) => /^date\s*\|\s*submitted\s*\|\s*chargebacks\//i.test(line.text.trim()));
    return emptyFundingBatchPopulation(
      dailySummary ? "daily_funding_summary" : "unresolved",
      dailySummary
        ? "The source exposes a SUMMARY BY DAY funding table without batch identifiers; dated daily totals are not funding batches."
        : "No explicit AMOUNTS FUNDED BY BATCH population with a printed total was mapped.",
    );
  }

  const start = Math.min(...headingIndexes, ...headerIndexes);
  const boundary = lines.findIndex((line, index) => index > start
    && /^(?:amounts submitted|fees charged|adjustments(?:\s*\/\s*chargebacks)?|chargebacks\/reversals)(?:\s*\||$)/i
      .test(line.text.trim()));
  const scopeEnd = boundary > start ? boundary : lines.length;
  const scope = lines.slice(start, scopeEnd);
  const totalIndexes = scope.flatMap((line, index) => isFundingBatchTotal(line.text) ? [start + index] : []);
  if (totalIndexes.length !== 1) {
    return emptyFundingBatchPopulation(
      "unresolved",
      totalIndexes.length === 0
        ? "The funding-batch table has no uniquely identifiable printed funding total; its population boundary is unresolved."
        : "The funding-batch table has multiple possible printed funding totals; its population boundary is ambiguous.",
    );
  }
  const totalIndex = totalIndexes[0]!;
  if ([...headingIndexes, ...headerIndexes].some((index) => index > totalIndex && index < scopeEnd)) {
    return emptyFundingBatchPopulation(
      "unresolved",
      "A funding-batch heading or header occurs after the candidate total inside the same source scope; table boundaries are ambiguous.",
    );
  }

  const tableLines = lines.slice(start, totalIndex);
  const continuationError = fundingBatchContinuationError(tableLines);
  if (continuationError) return emptyFundingBatchPopulation("unresolved", continuationError);

  const sourceRows = tableLines.filter((line) => isFundingBatchIdentityLine(line.text));
  const sourceRowsByIdentity = new Map<string, DocumentLine[]>();
  for (const sourceRow of sourceRows) {
    const identity = fundingBatchIdentity(sourceRow.text);
    if (!identity) continue;
    sourceRowsByIdentity.set(identity, [...(sourceRowsByIdentity.get(identity) ?? []), sourceRow]);
  }

  const ledger = extractFiservProcessorFundingBatchLedgerFromDocumentIr(ir);
  if (ledger.status === "not_mapped") {
    return emptyFundingBatchPopulation(
      "unresolved",
      "Source table boundaries were identified, but the deterministic funding ledger could not map the rows and total.",
    );
  }
  const datedLedgerRows = ledger.rows.filter((row) =>
    Boolean(row.batchNumber) && /^\d{2}\/\d{2}(?:\/\d{2})?$/.test(row.dateSubmitted));
  if (datedLedgerRows.length !== sourceRows.length) {
    return emptyFundingBatchPopulation(
      "unresolved",
      "The bounded source row identities and deterministic funding-ledger rows do not form a one-to-one population; continuation or row parsing is incomplete.",
    );
  }
  const submittedBatchRows = datedLedgerRows.filter((row) => row.amountSubmitted > 0);
  const identities = submittedBatchRows.map((row) => `${row.dateSubmitted}|${row.batchNumber}`);
  const duplicateIdentity = identities.find((identity, index) => identities.indexOf(identity) !== index);
  if (duplicateIdentity) {
    return emptyFundingBatchPopulation(
      "unresolved",
      `Duplicate submitted funding-batch identity ${duplicateIdentity} appears within the bounded table; the population is withheld rather than deduplicated.`,
    );
  }
  const rows = submittedBatchRows.flatMap((row, index) => {
    const sourceCandidates = sourceRowsByIdentity.get(`${row.dateSubmitted}|${row.batchNumber}`) ?? [];
    const exactSource = sourceCandidates.find((line) => line.text.trim() === row.evidenceLine.trim());
    const source = exactSource ?? (sourceCandidates.length === 1 ? sourceCandidates[0] : undefined);
    return [{
      batchNumber: row.batchNumber!,
      dateSubmitted: row.dateSubmitted,
      lineId: source?.id ?? `document-ir-funding-row-${index}`,
      pageNumber: row.pageNumber ?? source?.pageNumber ?? 1,
      evidenceLine: row.evidenceLine,
    }];
  });
  if (rows.some((row) => row.lineId.startsWith("document-ir-funding-row-"))) {
    return emptyFundingBatchPopulation(
      "unresolved",
      "The bounded source row identities and deterministic funding-ledger rows do not form a one-to-one population; continuation or row parsing is incomplete.",
    );
  }
  const populationAnchor = sourceAnchor(lines[totalIndex]!);
  return {
    status: ledger.status === "reconciled" ? "mapped" : "mapped_with_warnings",
    populationKind: "funding_batches",
    rows,
    count: rows.length,
    populationAnchor,
    limitations: [
      ...(datedLedgerRows.length === submittedBatchRows.length ? [] : [
        `${datedLedgerRows.length - submittedBatchRows.length} dated adjustment-only or zero-submitted rows were retained in the funding ledger but excluded from the submitted-batch population.`,
      ]),
      ...(ledger.status === "reconciled" ? []
        : ["Funding-row amount reconciliation has warnings; qualified submitted-batch identity remains directly observable."]),
    ],
  };
}

function emptyFundingBatchPopulation(
  populationKind: FiservIndependentFundingBatchPopulation["populationKind"],
  limitation: string,
): FiservIndependentFundingBatchPopulation {
  return { status: "not_mapped", populationKind, rows: [], count: null, populationAnchor: null,
    limitations: [limitation] };
}

function isFundingBatchTotal(text: string): boolean {
  const cells = cellParts(text);
  return cells.length === 6 && /^total$/i.test(cells[0] ?? "")
    && cells.slice(1).every((cell) => /^(?:-?\$?\d[\d,]*\.\d{2}|\(\$?\d[\d,]*\.\d{2}\))$/.test(cell));
}

function isFundingBatchIdentityLine(text: string): boolean {
  const cells = cellParts(text);
  return cells.length >= 2
    && /^\d{2}\/\d{2}(?:\/\d{2})?$/.test(cells[0] ?? "")
    && Boolean(cells[1]);
}

function fundingBatchIdentity(text: string): string | null {
  if (!isFundingBatchIdentityLine(text)) return null;
  const cells = cellParts(text);
  return `${cells[0]}|${cells[1]}`;
}

function isFundingBatchMoneyFragment(text: string): boolean {
  const cells = cellParts(text);
  return cells.length >= 1 && cells.length <= 5 && cells.every((cell) => moneyCell(cell) !== null);
}

function isFundingBatchContinuationPair(left: string, right: string): boolean {
  const leftCells = cellParts(left);
  const rightCells = cellParts(right);
  const cells = isFundingBatchIdentityLine(left)
    ? [...leftCells, ...rightCells]
    : isFundingBatchIdentityLine(right) ? [...rightCells, ...leftCells] : [];
  return cells.length === 7
    && /^\d{2}\/\d{2}(?:\/\d{2})?$/.test(cells[0] ?? "")
    && Boolean(cells[1])
    && cells.slice(2).every((cell) => moneyCell(cell) !== null);
}

function isFundingControlContinuationPair(left: string, right: string): boolean {
  const leftCells = cellParts(left);
  const rightCells = cellParts(right);
  return /^(?:Month End Charge|Less Discount Paid)$/i.test(leftCells[0] ?? "")
    && leftCells.length === 5
    && rightCells.length === 1
    && [...leftCells.slice(1), ...rightCells].every((cell) => moneyCell(cell) !== null);
}

function fundingBatchContinuationError(lines: DocumentLine[]): string | null {
  for (let index = 0; index < lines.length; index += 1) {
    const cells = cellParts(lines[index]!.text);
    const identityFragment = cells.length < 7 && isFundingBatchIdentityLine(lines[index]!.text);
    const moneyFragment = isFundingBatchMoneyFragment(lines[index]!.text);
    if (identityFragment) {
      const paired = isFundingBatchContinuationPair(lines[index - 1]?.text ?? "", lines[index]!.text)
        || isFundingBatchContinuationPair(lines[index]!.text, lines[index + 1]?.text ?? "");
      if (!paired) return "A funding-batch identity continuation row has no adjacent five-value financial fragment; the row is withheld.";
    }
    if (moneyFragment) {
      const paired = isFundingBatchContinuationPair(lines[index - 1]?.text ?? "", lines[index]!.text)
        || isFundingBatchContinuationPair(lines[index]!.text, lines[index + 1]?.text ?? "")
        || isFundingControlContinuationPair(lines[index - 1]?.text ?? "", lines[index]!.text);
      if (!paired) return "A funding-batch financial continuation row has no adjacent date-and-batch identity; the row is withheld.";
    }
  }
  return null;
}

function extractFlowSection(
  lines: DocumentLine[],
  heading: (line: DocumentLine) => boolean,
  explicitNonePattern: RegExp,
): FiservIndependentFlowSection {
  const headingLines = lines.filter(heading);
  const headingAnchors = headingLines.map(sourceAnchor);
  if (headingLines.length === 0) return emptyFlowSection("not_observed", []);
  if (headingLines.length > 1) return emptyFlowSection("ambiguous_source_scope", headingAnchors);
  const start = lines.indexOf(headingLines[0]!);
  const end = lines.findIndex((line, index) => index > start && /^total\s*\|/i.test(line.text.trim()));
  if (end < 0) return emptyFlowSection("incomplete_source_scope", headingAnchors);
  const section = lines.slice(start, end + 1);
  const noneLine = section.find((line) => explicitNonePattern.test(line.text));
  const totalLine = lines[end]!;
  const total = lastMoney(totalLine.text);
  if (total === null) return emptyFlowSection("incomplete_source_scope", headingAnchors);
  const printedTotal = sourceValue(toMinor(total), totalLine);
  if (noneLine) {
    return {
      status: "explicit_none",
      headingAnchors,
      coverageStatus: "explicit_no_activity",
      rows: [],
      printedTotal,
      rowSumMinor: 0,
      totalControlStatus: printedTotal.value === 0 ? "pass" : "fail",
      explicitNoneEvidence: sourceValue(0 as const, noneLine),
    };
  }
  const rows = section.flatMap((line) => {
    if (!/^\d{2}\/\d{2}(?:\/\d{2})?\s*\|/i.test(line.text.trim())) return [];
    const amount = lastMoney(line.text);
    if (amount === null) return [];
    const parts = cellParts(line.text);
    return [{ ...sourceValue(toMinor(amount), line), description: parts.slice(1, -1).join(" | ") }];
  });
  const rowSumMinor = rows.reduce((sum, row) => sum + row.value, 0);
  return {
    status: "mapped",
    headingAnchors,
    coverageStatus: Math.abs(rowSumMinor - printedTotal.value) > 1
      ? "unreconciled_detail"
      : rows.length > 0 ? "reconciled_detail" : "printed_total_only",
    rows,
    printedTotal,
    rowSumMinor,
    totalControlStatus: Math.abs(rowSumMinor - printedTotal.value) <= 1 ? "pass" : "fail",
    explicitNoneEvidence: null,
  };
}

function extractCombinedFlowSection(lines: DocumentLine[]): FiservIndependentCombinedFlowSection {
  const section = extractFlowSection(
    lines,
    (line) => /^adjustments\s*\/\s*chargebacks$/i.test(line.text.trim()),
    /\b(?:there are\s+)?no adjustments\s*\/\s*chargebacks for (?:this|the) statement period\b/i,
  );
  return {
    ...section,
    rows: section.rows.map((row) => ({ ...row, classification: classifyCombinedFlowRow(row) })),
  };
}

function classifyCombinedFlowRow(
  row: IndependentDocumentIrValue & { description: string },
): FiservIndependentCombinedFlowSection["rows"][number]["classification"] {
  if (/\badjustment\b/i.test(row.description)) return "settlement_adjustment";
  if (/\brepresentment\b/i.test(row.description)) return "chargeback_representment";
  if (/\b(?:chargeback principal|principal chargeback)\b/i.test(row.description)) return "chargeback_principal_debit";
  if (/\b(?:chargebacks?|reversals?)\b/i.test(row.description)) return "chargeback_or_reversal";
  return "unresolved";
}

function qualifySeparateAdjustment(
  section: FiservIndependentFlowSection,
): FiservIndependentSplitPopulationProof {
  if (!flowSectionProven(section)) {
    return withheldSplitProof(sectionReasonCodes("adjustment", section));
  }
  return {
    status: "proven",
    valueMinor: section.printedTotal!.value,
    proofBasis: "separate_adjustment_section",
    evidence: sectionEvidence(section, "population_value"),
    reasonCodes: [section.status === "explicit_none"
      ? "explicit_no_adjustments_proves_zero"
      : "adjustment_rows_reconcile_to_printed_total"],
  };
}

function qualifySeparateChargebacks(section: FiservIndependentFlowSection): {
  chargebackPrincipalDebitAmount: FiservIndependentSplitPopulationProof;
  chargebackRepresentmentAmount: FiservIndependentSplitPopulationProof;
} {
  if (!flowSectionProven(section)) {
    const proof = withheldSplitProof(sectionReasonCodes("chargeback", section));
    return { chargebackPrincipalDebitAmount: proof, chargebackRepresentmentAmount: structuredClone(proof) };
  }
  const basis = "separate_chargeback_section" as const;
  const scope = sectionScopeEvidence(section);
  const explicitNone = section.explicitNoneEvidence
    ? [{ ...section.explicitNoneEvidence, proofRole: "explicit_none" as const }] : [];
  if (section.status === "explicit_none") {
    const proof = withheldSplitProof([
      "processor_presented_chargebacks_reversals_absence_preserved_without_principal_or_representment_split",
    ]);
    return {
      chargebackPrincipalDebitAmount: proof,
      chargebackRepresentmentAmount: structuredClone(proof),
    };
  }
  const classifiedRows = section.rows.map((row) => ({ row, classification: classifyCombinedFlowRow(row) }));
  if (classifiedRows.some(({ classification }) =>
    classification === "unresolved" || classification === "settlement_adjustment"
      || classification === "chargeback_or_reversal")) {
    const proof = withheldSplitProof(["chargeback_reversal_section_contains_unclassified_subtype_rows"]);
    return { chargebackPrincipalDebitAmount: proof, chargebackRepresentmentAmount: structuredClone(proof) };
  }
  const principalRows = classifiedRows
    .filter(({ classification }) => classification === "chargeback_principal_debit")
    .map(({ row }) => row);
  const representmentRows = classifiedRows
    .filter(({ classification }) => classification === "chargeback_representment")
    .map(({ row }) => row);
  return {
    chargebackPrincipalDebitAmount: {
      status: "proven",
      valueMinor: Math.abs(principalRows.reduce((sum, row) => sum + row.value, 0)),
      proofBasis: basis,
      evidence: [...scope, ...principalRows.map((row) => ({ ...row, proofRole: "population_component" as const })),
        ...explicitNone],
      reasonCodes: ["reconciled_chargeback_section_exhaustively_classifies_principal_rows"],
    },
    chargebackRepresentmentAmount: {
      status: "proven",
      valueMinor: representmentRows.reduce((sum, row) => sum + row.value, 0),
      proofBasis: basis,
      evidence: [...scope, ...representmentRows.map((row) => ({ ...row, proofRole: "population_component" as const })),
        ...explicitNone],
      reasonCodes: ["reconciled_chargeback_section_exhaustively_classifies_representment_rows"],
    },
  };
}

function qualifyCombinedSplitPopulations(
  section: FiservIndependentCombinedFlowSection,
): FiservIndependentSplitPopulationProofs {
  const withheld = (reasonCodes: string[]): FiservIndependentSplitPopulationProofs => ({
    settlementAdjustmentAmount: withheldSplitProof(reasonCodes),
    chargebackPrincipalDebitAmount: withheldSplitProof(reasonCodes),
    chargebackRepresentmentAmount: withheldSplitProof(reasonCodes),
  });
  if (section.status === "explicit_none" && section.totalControlStatus === "pass" && section.explicitNoneEvidence) {
    return withheld([
      "processor_presented_combined_no_activity_preserved_without_split_zero_inference",
    ]);
  }
  if (section.status !== "mapped" || section.totalControlStatus !== "pass" || section.rows.length === 0) {
    return withheld(sectionReasonCodes("combined_adjustment_chargeback", section));
  }
  if (section.rows.some((row) => row.classification === "unresolved"
    || row.classification === "chargeback_or_reversal")) {
    return withheld([section.rows.some((row) => row.classification === "chargeback_or_reversal")
      ? "combined_section_preserves_ambiguous_chargeback_or_reversal_rows"
      : "combined_section_contains_unclassified_rows"]);
  }
  const scope = sectionScopeEvidence(section);
  const rows = (classification: FiservIndependentCombinedFlowSection["rows"][number]["classification"]) =>
    section.rows.filter((row) => row.classification === classification);
  const evidence = (classification: FiservIndependentCombinedFlowSection["rows"][number]["classification"]) => [
    ...scope,
    ...rows(classification).map((row) => ({ ...row, proofRole: "population_component" as const })),
  ];
  const adjustments = rows("settlement_adjustment");
  const principal = rows("chargeback_principal_debit");
  const representment = rows("chargeback_representment");
  const proof = (valueMinor: number, populationEvidence: FiservIndependentSplitPopulationProof["evidence"],
    reasonCode: string): FiservIndependentSplitPopulationProof => ({
    status: "proven", valueMinor, proofBasis: "combined_exhaustive_classified_rows",
    evidence: populationEvidence, reasonCodes: [reasonCode],
  });
  return {
    settlementAdjustmentAmount: proof(adjustments.reduce((sum, row) => sum + row.value, 0),
      evidence("settlement_adjustment"), "combined_section_reconciles_and_all_adjustment_rows_are_classified"),
    chargebackPrincipalDebitAmount: proof(Math.abs(principal.reduce((sum, row) => sum + row.value, 0)),
      evidence("chargeback_principal_debit"), "combined_section_reconciles_and_all_principal_rows_are_classified"),
    chargebackRepresentmentAmount: proof(representment.reduce((sum, row) => sum + row.value, 0),
      evidence("chargeback_representment"), "combined_section_reconciles_and_all_representment_rows_are_classified"),
  };
}

function chooseProof(
  preferred: FiservIndependentSplitPopulationProof,
  fallback: FiservIndependentSplitPopulationProof,
): FiservIndependentSplitPopulationProof {
  if (preferred.status === "proven") return preferred;
  if (fallback.status === "proven") return fallback;
  return withheldSplitProof([...preferred.reasonCodes, ...fallback.reasonCodes]);
}

function flowSectionProven(section: FiservIndependentFlowSection): boolean {
  return section.totalControlStatus === "pass"
    && (section.status === "explicit_none" && section.explicitNoneEvidence !== null
      || section.status === "mapped" && section.rows.length > 0);
}

function sectionEvidence(
  section: FiservIndependentFlowSection,
  totalRole: "population_value" | "exhaustive_scope",
): FiservIndependentSplitPopulationProof["evidence"] {
  return [
    ...(section.printedTotal ? [{ ...section.printedTotal, proofRole: totalRole }] : []),
    ...section.rows.map((row) => ({ ...row, proofRole: "population_component" as const })),
    ...(section.explicitNoneEvidence
      ? [{ ...section.explicitNoneEvidence, proofRole: "explicit_none" as const }] : []),
  ];
}

function sectionScopeEvidence(
  section: Pick<FiservIndependentFlowSection, "printedTotal">,
): FiservIndependentSplitPopulationProof["evidence"] {
  return section.printedTotal
    ? [{ ...section.printedTotal, proofRole: "exhaustive_scope" as const }]
    : [];
}

function sectionReasonCodes(label: string, section: FiservIndependentFlowSection): string[] {
  if (section.status === "not_mapped") return [`${label}_section_not_mapped`];
  if (section.totalControlStatus !== "pass") return [`${label}_section_total_not_reconciled`];
  if (section.rows.length === 0 && !section.explicitNoneEvidence) {
    return [`${label}_numeric_zero_without_explicit_no_activity_or_detail_rows`];
  }
  return [`${label}_section_not_independently_proven`];
}

function withheldSplitProof(reasonCodes: string[]): FiservIndependentSplitPopulationProof {
  return { status: "withheld", valueMinor: null, proofBasis: "none", evidence: [],
    reasonCodes: [...new Set(reasonCodes)].sort() };
}

function emptyCardSummary(limitation: string): FiservIndependentCardSummary {
  return { status: "not_mapped", headingAnchor: null, headerAnchor: null, totalAnchor: null,
    grossVolume: null, refundVolume: null, submittedVolume: null,
    grossCount: null, refundCount: null, submittedCount: null, formulaDeltaMinor: null,
    formulaStatus: "unresolved", limitations: [limitation] };
}

function emptyFlowSection(
  coverageStatus: FiservIndependentFlowSection["coverageStatus"] = "not_observed",
  headingAnchors: IndependentDocumentIrAnchor[] = [],
): FiservIndependentFlowSection {
  return { status: "not_mapped", headingAnchors, coverageStatus, rows: [], printedTotal: null, rowSumMinor: null,
    totalControlStatus: "unresolved", explicitNoneEvidence: null };
}

function allLines(ir: DocumentIR): DocumentLine[] {
  return ir.pages.flatMap((page) => page.lines).sort((left, right) =>
    left.pageNumber - right.pageNumber || lineNumber(left.id) - lineNumber(right.id));
}

function lineNumber(id: string): number {
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function cellParts(text: string): string[] {
  return text.split("|").map((part) => part.trim()).filter(Boolean);
}

function integerCell(value: string | undefined): number | null {
  if (!value || !/^\d[\d,]*$/.test(value.trim())) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function moneyCell(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^\((.*)\)$/, "-$1").replace(/[$,\s]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function lastMoney(text: string): number | null {
  const matches = [...text.matchAll(/(?:-?\$?\d[\d,]*\.\d{2}|\(\$?\d[\d,]*\.\d{2}\))/g)];
  return moneyCell(matches.at(-1)?.[0]);
}

function toMinor(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function sourceValue<T extends number>(value: T, line: DocumentLine): IndependentDocumentIrValue<T> {
  return { value, lineId: line.id, pageNumber: line.pageNumber, evidenceLine: line.text };
}

function sourceAnchor(line: DocumentLine): IndependentDocumentIrAnchor {
  return { lineId: line.id, pageNumber: line.pageNumber, evidenceLine: line.text };
}
