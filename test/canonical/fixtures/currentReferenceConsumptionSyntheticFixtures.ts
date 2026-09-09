import type { CurrentReferenceConsumptionInput } from "../../../src/canonical/currentReferenceConsumptionV1.js";

export type SyntheticCurrentReferenceFixture = {
  fixtureId: string;
  syntheticOnly: true;
  evidenceAuthority: "none";
  reusableKnowledgeAuthority: "none";
  branch: string;
  input: CurrentReferenceConsumptionInput;
  expected: {
    selectedValue: number | null;
    selectionState: "selected" | "blocked_missing_scope" | "current_reference_unresolved";
    comparisonState: "aligned_with_working_reference" | "above_working_reference" | "blocked";
    cardinality: "one_fee_supported" | "multiple_legitimate_components_strongly_explained" | "unresolved";
  };
};

export const SYNTHETIC_CURRENT_REFERENCE_FIXTURES: SyntheticCurrentReferenceFixture[] = [
  fixture("mc_debit_above_1000", "mastercard_debit_exclusion", {
    kind: "mastercard_assessment", asOf: "2026-09-09", geography: "us", product: "debit", ticketAmountUsd: 2500, printedRate: 0.0014,
    sameVolumeBaseAndMechanicSupported: true, separateAlfLinePresentForScope: false, strongerCompetingComponentExplanationPresent: false,
  }, { selectedValue: 0.0014, selectionState: "selected", comparisonState: "aligned_with_working_reference", cardinality: "one_fee_supported" }),
  fixture("mc_consumer_credit_at_threshold", "mastercard_qualifying_large_ticket", {
    kind: "mastercard_assessment", asOf: "2026-09-09", geography: "us", product: "consumer_credit", ticketAmountUsd: 1000, printedRate: 0.0015,
    sameVolumeBaseAndMechanicSupported: true, separateAlfLinePresentForScope: false, strongerCompetingComponentExplanationPresent: false,
  }, { selectedValue: 0.0015, selectionState: "selected", comparisonState: "aligned_with_working_reference", cardinality: "one_fee_supported" }),
  fixture("mc_commercial_below_threshold", "mastercard_below_threshold", {
    kind: "mastercard_assessment", asOf: "2026-09-09", geography: "us", product: "commercial", ticketAmountUsd: 999.99, printedRate: 0.0014,
    sameVolumeBaseAndMechanicSupported: true, separateAlfLinePresentForScope: false, strongerCompetingComponentExplanationPresent: false,
  }, { selectedValue: 0.0014, selectionState: "selected", comparisonState: "aligned_with_working_reference", cardinality: "one_fee_supported" }),
  fixture("mc_aggregate_missing_scope", "mastercard_missing_scope_fail_closed", {
    kind: "mastercard_assessment", asOf: "2026-09-09", geography: "us", product: "unknown", ticketAmountUsd: null, printedRate: 0.0014,
    sameVolumeBaseAndMechanicSupported: false, separateAlfLinePresentForScope: false, strongerCompetingComponentExplanationPresent: false,
  }, { selectedValue: null, selectionState: "blocked_missing_scope", comparisonState: "blocked", cardinality: "unresolved" }),
  fixture("mc_alf_branch_a_base_only", "mastercard_alf_branch_a", {
    kind: "mastercard_assessment", asOf: "2026-09-09", geography: "us", product: "commercial", ticketAmountUsd: 500, printedRate: 0.0014,
    sameVolumeBaseAndMechanicSupported: true, separateAlfLinePresentForScope: false, strongerCompetingComponentExplanationPresent: false,
  }, { selectedValue: 0.0014, selectionState: "selected", comparisonState: "aligned_with_working_reference", cardinality: "one_fee_supported" }),
  fixture("mc_alf_branch_b_likely_bundled", "mastercard_alf_branch_b", {
    kind: "mastercard_assessment", asOf: "2026-09-09", geography: "us", product: "commercial", ticketAmountUsd: 500, printedRate: 0.001475,
    sameVolumeBaseAndMechanicSupported: true, separateAlfLinePresentForScope: false, strongerCompetingComponentExplanationPresent: false,
  }, { selectedValue: 0.0014, selectionState: "selected", comparisonState: "above_working_reference", cardinality: "multiple_legitimate_components_strongly_explained" }),
  fixture("mc_alf_branch_c_separate_line", "mastercard_alf_branch_c", {
    kind: "mastercard_assessment", asOf: "2026-09-09", geography: "us", product: "commercial", ticketAmountUsd: 500, printedRate: 0.001475,
    sameVolumeBaseAndMechanicSupported: true, separateAlfLinePresentForScope: true, strongerCompetingComponentExplanationPresent: false,
  }, { selectedValue: 0.0014, selectionState: "selected", comparisonState: "blocked", cardinality: "unresolved" }),
  fixture("visa_base_ii_transmission_current", "visa_base_ii_current_0025", {
    kind: "visa_base_ii", asOf: "2026-09-09", geography: "us", printedLabel: "VISA BASE II SYSTEM FILE TRANSMISSION FEE", printedValue: 0.0025,
  }, { selectedValue: 0.0025, selectionState: "selected", comparisonState: "aligned_with_working_reference", cardinality: "one_fee_supported" }),
  fixture("visa_base_ii_network_access_current", "visa_base_ii_network_access_separate", {
    kind: "visa_base_ii", asOf: "2026-09-09", geography: "us", printedLabel: "VISA BASE II NETWORK ACCESS FEE", printedValue: 0.0025,
  }, { selectedValue: 0.0025, selectionState: "selected", comparisonState: "aligned_with_working_reference", cardinality: "one_fee_supported" }),
  fixture("visa_base_ii_generic_composite", "visa_base_ii_composite_fail_closed", {
    kind: "visa_base_ii", asOf: "2026-09-09", geography: "us", printedLabel: "VISA BASE II FEES", printedValue: 0.0052,
  }, { selectedValue: null, selectionState: "current_reference_unresolved", comparisonState: "blocked", cardinality: "unresolved" }),
];

function fixture(
  fixtureId: string,
  branch: string,
  input: CurrentReferenceConsumptionInput,
  expected: SyntheticCurrentReferenceFixture["expected"],
): SyntheticCurrentReferenceFixture {
  return { fixtureId, syntheticOnly: true, evidenceAuthority: "none", reusableKnowledgeAuthority: "none", branch, input, expected };
}
