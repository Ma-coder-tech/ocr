import type {
  CanonicalFeeLedgerControl,
  CanonicalFeeParserInterpretation,
  CanonicalFeePartitionSourceProvenance,
  CanonicalFeeRow,
  CanonicalFeeSourceOccurrence,
  CanonicalPrintedRate,
  MoneyAmount,
} from "./types.js";
import { recoverPrintedFeeOperands } from "./feeOperandRecovery.js";

export const FEE_PARTITION_SOURCE_PROVENANCE_POLICY_VERSION = "fee_partition_source_provenance_v1" as const;

export function buildCanonicalFeePartitionSourceProvenance(input: {
  rows: CanonicalFeeRow[];
  interpretations: CanonicalFeeParserInterpretation[];
  sourceOccurrences: CanonicalFeeSourceOccurrence[];
  controls: CanonicalFeeLedgerControl[];
}): CanonicalFeePartitionSourceProvenance {
  const eligibleRows = input.rows.filter(isEligibleRow);
  const printedSections = input.controls.filter(
    (control) => control.type === "printed_charge_sum" && control.independence === "printed_source_control" && control.basis === "section_control",
  );
  const interpretationsByRow = new Map(
    eligibleRows.map((row) => [row.id, input.interpretations.filter((item) => row.parserInterpretationIds.includes(item.id))]),
  );
  const explicitCandidates = new Map<string, string[]>();
  for (const row of eligibleRows) {
    const rowSections = new Set((interpretationsByRow.get(row.id) ?? []).map((item) => sectionKey(item.section)).filter(Boolean));
    explicitCandidates.set(
      row.id,
      printedSections.filter((control) => rowSections.has(sectionKey(control.label))).map((control) => control.id).sort(),
    );
  }
  const hasExplicitSectionEvidence = [...explicitCandidates.values()].some((refs) => refs.length > 0);
  const candidateMap = hasExplicitSectionEvidence
    ? explicitCandidates
    : new Map(eligibleRows.map((row) => [row.id, printedSections.filter((control) => control.coveredFeeRowIds.includes(row.id)).map((control) => control.id).sort()]));
  const sectionControlRefs = [...new Set([...candidateMap.values()].flat())].sort();
  const arithmeticControlRefs = printedSections
    .filter((control) => !sectionControlRefs.includes(control.id) && eligibleRows.some((row) => arithmeticControlCoversRow(control, interpretationsByRow.get(row.id) ?? [])))
    .map((control) => control.id)
    .sort();
  const occurrenceById = new Map(input.sourceOccurrences.map((item) => [item.id, item]));
  const controlsById = new Map(input.controls.map((item) => [item.id, item]));
  const assignments = eligibleRows.map((row) => {
    const candidates = candidateMap.get(row.id) ?? [];
    const selected = candidates.length === 1 ? controlsById.get(candidates[0]!) ?? null : null;
    const rowInterpretations = interpretationsByRow.get(row.id) ?? [];
    const evidenceRefs = sortedUnique([
      ...row.sourceOccurrenceIds.map((id) => occurrenceById.get(id)?.evidenceRef).filter((id): id is string => Boolean(id)),
      ...candidates.flatMap((id) => controlsById.get(id)?.evidenceRefs ?? []),
    ]);
    return {
      feeRowId: row.id,
      status: candidates.length === 1 ? "assigned" as const : candidates.length === 0 ? "unassigned" as const : "ambiguous" as const,
      sectionControlRef: selected?.id ?? null,
      candidateSectionControlRefs: candidates,
      printedSectionLabel: selected?.label ?? null,
      sourceSection: singleValue(rowInterpretations.map((item) => item.section)),
      evidenceRefs,
      ruleId: candidates.length === 1 ? (hasExplicitSectionEvidence ? "explicit_source_section_label_v1" as const : "unique_control_coverage_fallback_v1" as const) : null,
    };
  });
  const rowArithmetic = eligibleRows.map((row) => arithmeticForRow(row, interpretationsByRow.get(row.id) ?? [], occurrenceById));
  const unresolvedAssignments = assignments.filter((item) => item.status !== "assigned").length;
  return {
    policyVersion: FEE_PARTITION_SOURCE_PROVENANCE_POLICY_VERSION,
    authority: "diagnostic_relationship_only",
    status: eligibleRows.length === 0 ? "unavailable" : unresolvedAssignments === 0 ? "available" : "partial",
    assignmentMode: eligibleRows.length === 0 ? "unavailable" : hasExplicitSectionEvidence ? "explicit_source_section_labels" : "unique_control_coverage_fallback",
    eligibleFeeRowIds: eligibleRows.map((row) => row.id).sort(),
    sectionControlRefs,
    arithmeticControlRefs,
    assignments,
    rowArithmetic,
    limitations: unresolvedAssignments > 0 ? [`${unresolvedAssignments} eligible fee row(s) lack exactly one provable printed-section assignment.`] : [],
  };
}

function arithmeticForRow(
  row: CanonicalFeeRow,
  interpretations: CanonicalFeeParserInterpretation[],
  occurrenceById: Map<string, CanonicalFeeSourceOccurrence>,
): CanonicalFeePartitionSourceProvenance["rowArithmetic"][number] {
  const evidenceRefs = sortedUnique(row.sourceOccurrenceIds.map((id) => occurrenceById.get(id)?.evidenceRef).filter((id): id is string => Boolean(id)));
  let printedRate = uniqueObject(interpretations.map((item) => item.printedRate));
  let volumeBasis = uniqueMoney(interpretations.map((item) => item.volume));
  let printedPerItemRate = uniqueObject(interpretations.map((item) => item.printedPerItemRate));
  let itemCount = uniqueNumber(interpretations.map((item) => item.itemCount));
  let printedPerUnitRate: CanonicalPrintedRate | null = null;
  let sourceUnitBasis: string | null = null;
  const chargedAmount = row.selectedAmount;
  const interpretationConflict =
    row.mergeReason === "ambiguous_similarity_unresolved" ||
    hasConflictingObjects(interpretations.map((item) => item.printedRate)) ||
    hasConflictingMoney(interpretations.map((item) => item.volume)) ||
    hasConflictingObjects(interpretations.map((item) => item.printedPerItemRate)) ||
    hasConflictingNumbers(interpretations.map((item) => item.itemCount));
  const existingRateVolumeComplete = printedRate !== null && printedRate.normalizedFractionalRate !== null && volumeBasis !== null && chargedAmount !== null;
  const existingPerItemComplete = printedPerItemRate !== null && printedPerItemRate.normalizedFractionalRate !== null && itemCount !== null && chargedAmount !== null;
  const existingComplete = existingRateVolumeComplete || existingPerItemComplete;
  const operandRecovery = existingComplete
    ? {
        policyVersion: "fee_basis_operand_coverage_conflict_resolution_v1" as const,
        status: "not_needed_existing" as const,
        selectedCandidateId: null,
        candidates: [],
        reasonCodes: ["complete_operands_already_preserved"],
      }
    : recoverPrintedFeeOperands({
        label: row.selectedLabel,
        sources: row.sourceOccurrenceIds.map((id) => ({ evidenceRef: occurrenceById.get(id)?.evidenceRef ?? id, text: occurrenceById.get(id)?.normalizedSourceText ?? null })),
      });
  const selectedRecovery = operandRecovery.status === "recovered"
    ? operandRecovery.candidates.find((candidate) => candidate.id === operandRecovery.selectedCandidateId) ?? null
    : null;
  if (selectedRecovery?.formulaBasis === "rate_times_volume") {
    printedRate = selectedRecovery.printedRate;
    volumeBasis = selectedRecovery.volumeBasis;
  } else if (selectedRecovery?.formulaBasis === "per_item") {
    printedPerItemRate = selectedRecovery.printedRate;
    itemCount = selectedRecovery.itemCount;
  } else if (selectedRecovery?.formulaBasis === "source_units_times_per_unit") {
    printedPerUnitRate = selectedRecovery.printedRate;
    sourceUnitBasis = selectedRecovery.sourceUnitBasis;
  }
  const rateVolumeComplete = printedRate !== null && printedRate.normalizedFractionalRate !== null && volumeBasis !== null && chargedAmount !== null;
  const perItemComplete = printedPerItemRate !== null && printedPerItemRate.normalizedFractionalRate !== null && itemCount !== null && chargedAmount !== null;
  const sourceUnitComplete = printedPerUnitRate !== null && printedPerUnitRate.normalizedFractionalRate !== null && sourceUnitBasis !== null && chargedAmount !== null;
  const ambiguous = interpretationConflict || operandRecovery.status === "ambiguous" || operandRecovery.status === "conflicting" || [rateVolumeComplete, perItemComplete, sourceUnitComplete].filter(Boolean).length > 1;
  const hasAnyOperand = Boolean(printedRate || volumeBasis || printedPerItemRate || itemCount !== null || printedPerUnitRate || sourceUnitBasis);
  const completeStatus = rateVolumeComplete || perItemComplete || sourceUnitComplete;
  const resolvedStatus = ambiguous ? "ambiguous" as const : completeStatus ? "complete" as const : hasAnyOperand ? "partial" as const : "charged_amount_only" as const;
  const formulaBasis = ambiguous ? "ambiguous" as const : rateVolumeComplete ? "rate_times_volume" as const : perItemComplete ? "per_item" as const : sourceUnitComplete ? "source_units_times_per_unit" as const : "unknown" as const;
  const selectedEvidenceRefs = selectedRecovery?.evidenceRefs ?? evidenceRefs;
  return {
    feeRowId: row.id,
    status: resolvedStatus,
    formulaBasis,
    printedRate,
    volumeBasis,
    printedPerItemRate,
    itemCount,
    printedPerUnitRate,
    sourceUnitBasis,
    chargedAmount,
    fieldEvidenceRefs: {
      rate: printedRate ? selectedEvidenceRefs : [],
      volumeBasis: volumeBasis ? selectedEvidenceRefs : [],
      count: itemCount !== null ? selectedEvidenceRefs : [],
      perUnitRate: printedPerUnitRate ? selectedEvidenceRefs : [],
      sourceUnitBasis: sourceUnitBasis ? selectedEvidenceRefs : [],
      chargedAmount: chargedAmount ? evidenceRefs : [],
    },
    operandRecovery,
    missingFields: resolvedStatus === "partial"
      ? [
          ...((printedRate && !volumeBasis) ? ["volume_basis"] : []),
          ...((volumeBasis && !printedRate) ? ["rate"] : []),
          ...((printedPerItemRate && itemCount === null) ? ["count"] : []),
          ...((itemCount !== null && !printedPerItemRate) ? ["per_item_rate"] : []),
          ...((printedPerUnitRate && !sourceUnitBasis) ? ["source_unit_basis"] : []),
          ...((sourceUnitBasis && !printedPerUnitRate) ? ["per_unit_rate"] : []),
          ...(!chargedAmount ? ["charged_amount"] : []),
        ]
      : [],
  };
}

function arithmeticControlCoversRow(control: CanonicalFeeLedgerControl, interpretations: CanonicalFeeParserInterpretation[]): boolean {
  const label = normalize(control.label).replace(/^total\s+/, "");
  const types = interpretations.map((item) => normalize(item.sourceTypeCode ?? ""));
  if (/interchange/.test(label) && /program/.test(label)) return types.some((type) => /interchange|program/.test(type));
  if (/interchange/.test(label)) return types.some((type) => /interchange/.test(type));
  if (/service/.test(label)) return types.some((type) => /service/.test(type));
  if (label === "fees" || label === "fee") return types.some((type) => type === "fees" || type === "fee");
  return false;
}

function sectionKey(value: string | null): string {
  const normalized = normalize(value ?? "").replace(/^total\s+/, "").replace(/\s+(?:fees?|charges?)$/, "").trim();
  return /^(?:fees?|charges?)$/.test(normalized) ? "" : normalized;
}

function normalize(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function sortedUnique(values: string[]): string[] { return [...new Set(values)].sort(); }
function isEligibleRow(row: CanonicalFeeRow): boolean { return !new Set(["section_subtotal", "fee_bucket_total", "statement_control_total", "informational_rate_row", "zero_dollar_reference_row", "duplicate_representation", "supporting_evidence_only"]).has(row.role); }
function singleValue(values: Array<string | null>): string | null { const present = [...new Set(values.filter((value): value is string => Boolean(value)))]; return present.length === 1 ? present[0]! : null; }
function uniqueNumber(values: Array<number | null>): number | null { const present = [...new Set(values.filter((value): value is number => value !== null))]; return present.length === 1 ? present[0]! : null; }
function uniqueMoney(values: Array<MoneyAmount | null>): MoneyAmount | null { const present = values.filter((value): value is MoneyAmount => value !== null); return hasConflictingMoney(values) ? null : present[0] ?? null; }
function uniqueObject<T>(values: Array<T | null>): T | null { const present = values.filter((value): value is T => value !== null); return hasConflictingObjects(values) ? null : present[0] ?? null; }
function hasConflictingNumbers(values: Array<number | null>): boolean { return new Set(values.filter((value): value is number => value !== null)).size > 1; }
function hasConflictingMoney(values: Array<MoneyAmount | null>): boolean { return new Set(values.filter((value): value is MoneyAmount => value !== null).map((value) => `${value.currency}:${value.amountMinor}`)).size > 1; }
function hasConflictingObjects<T>(values: Array<T | null>): boolean { return new Set(values.filter((value): value is T => value !== null).map((value) => JSON.stringify(value))).size > 1; }
