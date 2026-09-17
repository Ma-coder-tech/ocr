import type {
  CanonicalFeeLedgerControl,
  CanonicalFeeLedger,
  CanonicalFeeRollupAssessment,
  MoneyAmount,
} from "./types.js";
import { buildExactSourceArithmeticAssessment } from "./exactSourceArithmeticBridge.js";

export const FEE_ROLLUP_COMPLETENESS_POLICY_VERSION = "fee_rollup_completeness_rounding_attribution_v1" as const;

export function buildCanonicalFeeRollupAssessments(
  ledger: Pick<CanonicalFeeLedger, "controls" | "rows" | "partitionSourceProvenance">,
): CanonicalFeeRollupAssessment[] {
  const controls = ledger.controls;
  const printedControls = controls.filter(
    (control) => control.type === "printed_charge_sum" && control.independence === "printed_source_control",
  );
  const grandControls = printedControls.filter((control) => control.basis === "grand_control");
  const sectionRefs = new Set(ledger.partitionSourceProvenance.sectionControlRefs);
  const coverageBySection = new Map<string, string[]>();
  for (const assignment of ledger.partitionSourceProvenance.assignments) {
    for (const controlRef of assignment.status === "assigned" && assignment.sectionControlRef
      ? [assignment.sectionControlRef]
      : assignment.candidateSectionControlRefs) {
      coverageBySection.set(controlRef, [...(coverageBySection.get(controlRef) ?? []), assignment.feeRowId]);
    }
  }

  return grandControls.map((grand) => {
    const sections = printedControls.filter(
      (control) => sectionRefs.has(control.id) && control.derivationGroupId === grand.derivationGroupId,
    );
    return assessGrandControl(grand, sections, ledger.partitionSourceProvenance, coverageBySection);
  });
}

function assessGrandControl(
  grand: CanonicalFeeLedgerControl,
  sections: CanonicalFeeLedgerControl[],
  ledgerProvenance: CanonicalFeeLedger["partitionSourceProvenance"],
  coverageBySection: Map<string, string[]>,
): CanonicalFeeRollupAssessment {
  const eligibleFeeRowIds = ledgerProvenance.eligibleFeeRowIds;
  const grandRows = sortedUnique(eligibleFeeRowIds);
  const sectionRows = sections.flatMap((section) => coverageBySection.get(section.id) ?? []);
  const sectionRowCounts = new Map<string, number>();
  for (const rowId of sectionRows) sectionRowCounts.set(rowId, (sectionRowCounts.get(rowId) ?? 0) + 1);
  const sectionRowSet = new Set(sectionRows);
  const grandRowSet = new Set(grandRows);
  const uncoveredBySectionsFeeRowIds = grandRows.filter((rowId) => !sectionRowSet.has(rowId));
  const uncoveredByGrandFeeRowIds = eligibleFeeRowIds.filter((rowId) => !grandRowSet.has(rowId));
  const missingFeeRowIds = sortedUnique([...uncoveredBySectionsFeeRowIds, ...uncoveredByGrandFeeRowIds]);
  const overlappingFeeRowIds = [...sectionRowCounts].filter(([, count]) => count > 1).map(([rowId]) => rowId).sort();
  const outsideGrandFeeRowIds = [...sectionRowSet].filter((rowId) => !grandRowSet.has(rowId)).sort();
  const hasIncompleteControl = grandRows.length === 0 || sections.length === 0 || sections.some((section) => (coverageBySection.get(section.id) ?? []).length === 0);
  const membershipStatus: CanonicalFeeRollupAssessment["membershipStatus"] = hasIncompleteControl
    ? "incomplete_controls"
    : overlappingFeeRowIds.length > 0
      ? "overlapping_members"
      : missingFeeRowIds.length > 0 || outsideGrandFeeRowIds.length > 0
        ? "missing_members"
        : "complete_non_overlapping";

  const sectionPrintedTotal = sumMoney(sections.map((section) => section.expectedAmount));
  const grandPrintedTotal = grand.expectedAmount;
  const residualMinor = sectionPrintedTotal && grandPrintedTotal && sectionPrintedTotal.currency === grandPrintedTotal.currency
    ? sectionPrintedTotal.amountMinor - grandPrintedTotal.amountMinor
    : null;
  const sourceArithmetic = buildExactSourceArithmeticAssessment({
    grand,
    sections,
    eligibleFeeRowIds,
    provenance: ledgerProvenance,
    residualMinor,
    membershipComplete: membershipStatus === "complete_non_overlapping",
  });
  const roundingProven = membershipStatus === "complete_non_overlapping" && residualMinor !== null && residualMinor !== 0 &&
    sourceArithmetic.status === "proven_rounding";
  const exact = membershipStatus === "complete_non_overlapping" && residualMinor === 0;
  const status: CanonicalFeeRollupAssessment["status"] = exact ? "proven_complete_exact" : roundingProven ? "proven_complete_with_rounding" : "unresolved";
  const reasonCodes = [
    ...(membershipStatus === "complete_non_overlapping" ? ["complete_non_overlapping_fee_partition"] : [membershipStatus]),
    ...(uncoveredByGrandFeeRowIds.length > 0 ? ["fee_rows_uncovered_by_grand_control"] : []),
    ...(uncoveredBySectionsFeeRowIds.length > 0 ? ["grand_control_rows_uncovered_by_sections"] : []),
    ...(overlappingFeeRowIds.length > 0 ? ["fee_rows_covered_by_multiple_sections"] : []),
    ...(outsideGrandFeeRowIds.length > 0 ? ["section_rows_outside_grand_control"] : []),
    ...(sections.some((section) => (coverageBySection.get(section.id) ?? []).length === 0) ? ["empty_section_control_membership"] : []),
    ...(residualMinor === null ? ["printed_totals_not_comparable"] : residualMinor === 0 ? ["printed_section_totals_equal_grand_total"] : roundingProven ? ["residual_reconstructed_by_exact_rounding_bridge"] : ["nonzero_residual_lacks_exact_rounding_attribution"]),
    `source_arithmetic:${sourceArithmetic.reasonCode}`,
  ];

  return {
    id: `feerollup_${stableId(grand.id)}`,
    policyVersion: FEE_ROLLUP_COMPLETENESS_POLICY_VERSION,
    grandControlRef: grand.id,
    sectionControlRefs: sections.map((section) => section.id).sort(),
    status,
    membershipStatus,
    grandCoveredFeeRowIds: grandRows,
    sectionCoveredFeeRowIds: sortedUnique(sectionRows),
    missingFeeRowIds,
    uncoveredByGrandFeeRowIds,
    uncoveredBySectionsFeeRowIds,
    overlappingFeeRowIds,
    outsideGrandFeeRowIds,
    sectionPrintedTotal,
    grandPrintedTotal,
    residualMinor,
    residualAttribution: exact ? "not_needed_exact" : roundingProven ? "proven_exact_rounding_bridge" : "unresolved",
    sourceArithmetic,
    roundingEvidenceRefs: roundingProven ? sourceArithmetic.evidenceRefs : [],
    countingTreatment: "reference_only_no_addition",
    reasonCodes,
    limitations: status === "unresolved" ? [membershipStatus === "complete_non_overlapping" ? "Fee partition membership is complete, but the printed residual has no exact evidence-backed rounding attribution." : "Fee roll-up withheld because section membership is missing, duplicated, outside the grand control, or otherwise incomplete."] : [],
  };
}

function sumMoney(amounts: Array<MoneyAmount | null>): MoneyAmount | null {
  if (amounts.length === 0 || amounts.some((amount) => amount === null)) return null;
  const present = amounts as MoneyAmount[];
  const currency = present[0]!.currency;
  if (present.some((amount) => amount.currency !== currency)) return null;
  return { amountMinor: present.reduce((sum, amount) => sum + amount.amountMinor, 0), currency };
}

function sortedUnique(values: string[]): string[] { return [...new Set(values)].sort(); }
function stableId(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
