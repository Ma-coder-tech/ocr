import type {
  CanonicalFeeLedgerControl,
  CanonicalFeeLedger,
  CanonicalFeeRollupAssessment,
  CanonicalFeeRollupRoundingBridge,
  MoneyAmount,
} from "./types.js";

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
    return assessGrandControl(grand, sections, ledger.partitionSourceProvenance.eligibleFeeRowIds, coverageBySection);
  });
}

function assessGrandControl(
  grand: CanonicalFeeLedgerControl,
  sections: CanonicalFeeLedgerControl[],
  eligibleFeeRowIds: string[],
  coverageBySection: Map<string, string[]>,
): CanonicalFeeRollupAssessment {
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
  const roundingProven = membershipStatus === "complete_non_overlapping" && residualMinor !== null && residualMinor !== 0 && bridgeProvesRounding(grand.roundingBridge ?? null, grand, sections);
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
    roundingEvidenceRefs: roundingProven ? sortedUnique(grand.roundingBridge?.evidenceRefs ?? []) : [],
    countingTreatment: "reference_only_no_addition",
    reasonCodes,
    limitations: status === "unresolved" ? [membershipStatus === "complete_non_overlapping" ? "Fee partition membership is complete, but the printed residual has no exact evidence-backed rounding attribution." : "Fee roll-up withheld because section membership is missing, duplicated, outside the grand control, or otherwise incomplete."] : [],
  };
}

function bridgeProvesRounding(bridge: CanonicalFeeRollupRoundingBridge | null, grand: CanonicalFeeLedgerControl, sections: CanonicalFeeLedgerControl[]): boolean {
  if (!bridge || bridge.policyVersion !== "fee_rollup_rounding_bridge_v1" || bridge.method !== "exact_unrounded_partition_bridge" || bridge.roundingMode !== "nearest_cent_half_away_from_zero" || bridge.evidenceRefs.length === 0 || !Number.isSafeInteger(bridge.grandAmountMicros)) return false;
  const bridgeEvidence = new Set(bridge.evidenceRefs);
  const endpointEvidence = [...grand.evidenceRefs, ...sections.flatMap((section) => section.evidenceRefs)];
  if (endpointEvidence.length === 0 || endpointEvidence.some((evidenceRef) => !bridgeEvidence.has(evidenceRef))) return false;
  const bridgeByControl = new Map<string, number>();
  for (const item of bridge.sectionAmountsMicros) {
    if (bridgeByControl.has(item.controlRef) || !Number.isSafeInteger(item.amountMicros)) return false;
    bridgeByControl.set(item.controlRef, item.amountMicros);
  }
  if (bridgeByControl.size !== sections.length || sections.some((section) => !bridgeByControl.has(section.id))) return false;
  if (sections.some((section) => !section.expectedAmount)) return false;
  if (sections.some((section) => roundMicrosToMinor(bridgeByControl.get(section.id)!) !== section.expectedAmount!.amountMinor)) return false;
  const sectionMicros = [...bridgeByControl.values()].reduce((sum, value) => sum + value, 0);
  return sectionMicros === bridge.grandAmountMicros && grand.expectedAmount !== null && roundMicrosToMinor(bridge.grandAmountMicros) === grand.expectedAmount.amountMinor;
}

function roundMicrosToMinor(amountMicros: number): number {
  const rounded = Math.floor((Math.abs(amountMicros) + 5_000) / 10_000);
  return amountMicros < 0 ? -rounded : rounded;
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
