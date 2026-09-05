import type {
  CanonicalFeeLedgerControl,
  CanonicalFeeParserInterpretation,
  CanonicalFeePartitionSourceProvenance,
  CanonicalFeeRow,
  CanonicalFeeSourceOccurrence,
  CanonicalPrintedRate,
  MoneyAmount,
} from "./types.js";

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
  const printedRate = uniqueObject(interpretations.map((item) => item.printedRate));
  const volumeBasis = uniqueMoney(interpretations.map((item) => item.volume));
  const printedPerItemRate = uniqueObject(interpretations.map((item) => item.printedPerItemRate));
  const itemCount = uniqueNumber(interpretations.map((item) => item.itemCount));
  const chargedAmount = row.selectedAmount;
  const conflicting =
    row.mergeReason === "ambiguous_similarity_unresolved" ||
    hasConflictingObjects(interpretations.map((item) => item.printedRate)) ||
    hasConflictingMoney(interpretations.map((item) => item.volume)) ||
    hasConflictingObjects(interpretations.map((item) => item.printedPerItemRate)) ||
    hasConflictingNumbers(interpretations.map((item) => item.itemCount));
  const rateVolumeComplete = printedRate !== null && printedRate.normalizedFractionalRate !== null && volumeBasis !== null && chargedAmount !== null;
  const perItemComplete = printedPerItemRate !== null && printedPerItemRate.normalizedFractionalRate !== null && itemCount !== null && chargedAmount !== null;
  const ambiguous = conflicting || (rateVolumeComplete && perItemComplete);
  const hasAnyOperand = Boolean(printedRate || volumeBasis || printedPerItemRate || itemCount !== null);
  const status = ambiguous ? "ambiguous" as const : rateVolumeComplete || perItemComplete ? "complete" as const : hasAnyOperand ? "partial" as const : "charged_amount_only" as const;
  const formulaBasis = ambiguous ? "ambiguous" as const : rateVolumeComplete ? "rate_times_volume" as const : perItemComplete ? "per_item" as const : "unknown" as const;
  return {
    feeRowId: row.id,
    status,
    formulaBasis,
    printedRate,
    volumeBasis,
    printedPerItemRate,
    itemCount,
    chargedAmount,
    fieldEvidenceRefs: {
      rate: printedRate ? evidenceRefs : [],
      volumeBasis: volumeBasis ? evidenceRefs : [],
      count: itemCount !== null ? evidenceRefs : [],
      chargedAmount: chargedAmount ? evidenceRefs : [],
    },
    missingFields: status === "partial"
      ? [
          ...((printedRate && !volumeBasis) ? ["volume_basis"] : []),
          ...((volumeBasis && !printedRate) ? ["rate"] : []),
          ...((printedPerItemRate && itemCount === null) ? ["count"] : []),
          ...((itemCount !== null && !printedPerItemRate) ? ["per_item_rate"] : []),
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
