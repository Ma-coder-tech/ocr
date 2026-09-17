import { beforeAll, describe, expect, it } from "vitest";
import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { consumeCurrentReferenceV1, type CurrentReferenceConsumptionResult } from "../../src/canonical/currentReferenceConsumptionV1.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint, type InternalAnalystFinding } from "../../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { parsePdf } from "../../src/parser.js";
import { SYNTHETIC_CURRENT_REFERENCE_FIXTURES } from "./fixtures/currentReferenceConsumptionSyntheticFixtures.js";

const PDF_ROOT = "test/fixtures/pdfs";
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };
const GOLD: Array<{ file: string; businessType: BusinessTypeId }> = [
  { file: "Nov_2024_Statement.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT4_CLOVER.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf", businessType: "other" },
  { file: "fiserv_ABDUL_BASHER_Aug_2025.pdf", businessType: "retail" },
  { file: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_NXGEN_VORTAX_Sep_2022.pdf", businessType: "retail" },
  { file: "fiserv_PAYSAFE_Febr_2024.pdf", businessType: "professional_services" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", businessType: "ecommerce" },
  { file: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", businessType: "restaurant_food_beverage" },
];

type GoldResult = { file: string; analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[] };

describe("Current-Reference Consumption Calibration v1", () => {
  const synthetic = new Map<string, CurrentReferenceConsumptionResult>();
  let gold: GoldResult[];

  beforeAll(async () => {
    for (const fixture of SYNTHETIC_CURRENT_REFERENCE_FIXTURES) synthetic.set(fixture.fixtureId, consumeCurrentReferenceV1(fixture.input));
    gold = [];
    for (const fixture of GOLD) {
      const analysis = buildCanonicalStatementFactsFromParsedDocument(await parsePdf(`${PDF_ROOT}/${fixture.file}`), { sourceFileName: fixture.file, businessType: fixture.businessType });
      const before = canonicalFinancialTruthFingerprint(analysis);
      const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
      expect(report.canonicalFinancialTruth).toMatchObject({ beforeFingerprint: before, afterFingerprint: before, unchanged: true, mutationAllowed: false });
      expect(canonicalFinancialTruthFingerprint(analysis)).toBe(before);
      gold.push({ file: fixture.file, analysis, findings: report.findings.filter((finding) => finding.sourceFeeRowId) });
    }
  }, 60_000);

  it("keeps all ten fixtures synthetic-only and covers every Product branch", () => {
    expect(SYNTHETIC_CURRENT_REFERENCE_FIXTURES).toHaveLength(10);
    expect(SYNTHETIC_CURRENT_REFERENCE_FIXTURES.every((fixture) => fixture.syntheticOnly && fixture.evidenceAuthority === "none" && fixture.reusableKnowledgeAuthority === "none")).toBe(true);
    expect(new Set(SYNTHETIC_CURRENT_REFERENCE_FIXTURES.map((fixture) => fixture.branch))).toEqual(new Set([
      "mastercard_debit_exclusion", "mastercard_qualifying_large_ticket", "mastercard_below_threshold", "mastercard_missing_scope_fail_closed",
      "mastercard_alf_branch_a", "mastercard_alf_branch_b", "mastercard_alf_branch_c", "visa_base_ii_current_0025",
      "visa_base_ii_network_access_separate", "visa_base_ii_composite_fail_closed",
    ]));
    for (const fixture of SYNTHETIC_CURRENT_REFERENCE_FIXTURES) {
      const result = get(fixture.fixtureId);
      expect(result.selectedReference.value).toBe(fixture.expected.selectedValue);
      expect(result.selectedReference.state).toBe(fixture.expected.selectionState);
      expect(result.comparison.state).toBe(fixture.expected.comparisonState);
      expect(result.cardinality.state).toBe(fixture.expected.cardinality);
      expect(result.canonicalMutationAllowed).toBe(false);
    }
  });

  it("selects 0.14% for high-ticket debit, 0.15% for qualifying large tickets, and 0.14% below threshold", () => {
    const debit = get("mc_debit_above_1000");
    expect(debit.selectedReference).toMatchObject({ value: 0.0014, confidence: "CURRENT_WORKING_REFERENCE_STRONG", scope: "U.S. debit", officialNetworkParEstablished: false });
    expect(debit.rendering.claimConstrainedMerchantPreview).toMatch(/debit.*excluded.*above \$1,000/i);
    expect(debit.rendering.claimConstrainedMerchantPreview).not.toMatch(/0\.15% applies/i);

    const large = get("mc_consumer_credit_at_threshold");
    expect(large.selectedReference).toMatchObject({ value: 0.0015, confidence: "CURRENT_WORKING_REFERENCE_STRONG" });
    expect(large.rendering.claimConstrainedMerchantPreview).toMatch(/0\.15%.*0\.14% base.*0\.01% increment/i);
    expect(large.selectedReference.scope).toMatch(/consumer_credit.*\$1,000/i);

    const below = get("mc_commercial_below_threshold");
    expect(below.selectedReference.value).toBe(0.0014);
    expect(below.rendering.claimConstrainedMerchantPreview).toMatch(/below \$1,000/i);
  });

  it("fails closed when Mastercard product/ticket scope is missing", () => {
    const result = get("mc_aggregate_missing_scope");
    expect(result).toMatchObject({ selectedReference: { state: "blocked_missing_scope", value: null }, comparison: { state: "blocked", referenceValue: null }, cardinality: { state: "unresolved", comparisonAllowed: false } });
    expect(result.rendering).toMatchObject({ selectedReferenceAsCurrentFactAllowed: false, officialParLanguageAllowed: false, candidateAsFactAllowed: false });
    expect(result.rendering.claimConstrainedMerchantPreview).toMatch(/No Mastercard rate comparison.*not established/i);
  });

  it("consumes all three ALF cardinality branches without certifying par or markup", () => {
    expect(get("mc_alf_branch_a_base_only").cardinality).toMatchObject({ state: "one_fee_supported", confidence: "STRONG", comparisonAllowed: true });
    expect(get("mc_alf_branch_a_base_only").rendering.internalAnalystText).toMatch(/no hidden ALF is inferred/i);
    expect(get("mc_alf_branch_b_likely_bundled").cardinality).toMatchObject({ state: "multiple_legitimate_components_strongly_explained", confidence: "LIKELY", comparisonAllowed: true });
    expect(get("mc_alf_branch_b_likely_bundled").rendering.internalAnalystText).toMatch(/arithmetic corroborates but does not prove/i);
    expect(get("mc_alf_branch_c_separate_line").cardinality).toMatchObject({ state: "unresolved", confidence: "UNRESOLVED", comparisonAllowed: false });
    expect(get("mc_alf_branch_c_separate_line").rendering.internalAnalystText).toMatch(/separate same-scope ALF.*strongly disfavors.*residual remains unresolved/i);
    for (const id of ["mc_alf_branch_a_base_only", "mc_alf_branch_b_likely_bundled", "mc_alf_branch_c_separate_line"]) {
      expect(get(id).comparison).toMatchObject({ atParCertified: false, processorMarkupEstablished: false });
      expect(get(id).rendering).toMatchObject({ processorMarkupLanguageAllowed: false, processorRetentionLanguageAllowed: false });
    }
  });

  it("selects Base II 0.0025, contains 0.0027, and preserves Network Access identity", () => {
    const transmission = get("visa_base_ii_transmission_current");
    expect(transmission.selectedReference).toMatchObject({ value: 0.0025, confidence: "CURRENT_WORKING_REFERENCE_STRONG", effectiveFrom: "2025-01-01", officialNetworkParEstablished: false });
    expect(transmission.candidateEvidence).toEqual([expect.objectContaining({ value: 0.0027, status: "UNRESOLVED_CONFLICTING_CANDIDATE", effectiveFrom: null, applicableScope: "unresolved", evidenceWeight: "below_dated_working_reference" })]);
    expect(transmission.rendering).toMatchObject({ selectedReferenceAsCurrentFactAllowed: true, candidateAsFactAllowed: false, officialParLanguageAllowed: false });
    expect(transmission.rendering.claimConstrainedMerchantPreview).toMatch(/\$0\.0025 current working reference.*not universal official Visa par/i);
    expect(transmission.rendering.claimConstrainedMerchantPreview).toMatch(/\$0\.0027.*unresolved.*not a current fact or transition/i);

    const access = get("visa_base_ii_network_access_current");
    expect(access.identity).toMatchObject({ feeFamily: "visa_base_ii_network_access_fee", separateFromFeeFamilies: ["visa_base_ii_system_file_transmission_fee"], merchantBilledIncidence: "not_observed_in_supported_fiserv_corpus" });
    expect(access.selectedReference.value).toBe(0.0025);
    expect(access.rendering.internalAnalystText).toMatch(/separate fee family/i);
    expect(access.limitations.join(" ")).toMatch(/does not prove nonexistence or universal bundling/i);

    const composite = get("visa_base_ii_generic_composite");
    expect(composite).toMatchObject({ selectedReference: { state: "current_reference_unresolved", value: null }, comparison: { state: "blocked" }, cardinality: { state: "unresolved" } });
    expect(composite.rendering.selectedReferenceAsCurrentFactAllowed).toBe(false);
  });

  it("preserves representative historical conclusions and all Gold financial fingerprints", () => {
    expect(gold).toHaveLength(11);
    const rows = allGoldRows(gold);
    const baseII = rows.find((row) => /VI BASE II SYSTEM FILE FEE/i.test(row.label))!.finding;
    expect(baseII.current2026UsCoreNetworkReference).toMatchObject({
      historicalApplication: "HISTORICAL_VALUE_PRESERVED_BEFORE_CHANGE",
      reference: { state: "CURRENT_CONFIRMED_CHANGE", values: [], historicalValues: [expect.objectContaining({ value: 0.0018 })], conflicts: [] },
      currentReferenceMaintenance: { state: "CURRENT_WORKING_REFERENCE_STRONG", values: [expect.objectContaining({ value: 0.0025 })], candidateValues: [expect.objectContaining({ value: 0.0027 })] },
    });
    const mastercard = rows.filter((row) => row.finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.matchedRecordIds.includes("CUR26-WRK-MC-ABVF-BASE"));
    expect(mastercard).toHaveLength(9);
    expect(mastercard.every((row) => row.finding.current2026UsCoreNetworkReference?.reference.state !== "CURRENT_WORKING_REFERENCE_STRONG")).toBe(true);
    const wells = mastercard.find((row) => row.file.includes("WELLS_FARGO"))!.finding;
    expect(wells.mastercardFocusedEvidence?.assessment2024).toMatchObject({ structuralExplanation: "STRONGLY_EXPLAINED", confirmedAtPar: false, acquiringSideUpliftExcluded: false });
    expect(rows.every((row) => (row.finding.current2026UsCoreNetworkReference?.reference.conflicts.length ?? 0) === 0)).toBe(true);
  });

  it("keeps every rendering claim-constrained", () => {
    for (const result of synthetic.values()) {
      expect(result.rendering).toMatchObject({ customerReportAuthority: "none", officialParLanguageAllowed: false, candidateAsFactAllowed: false, processorMarkupLanguageAllowed: false, processorRetentionLanguageAllowed: false, contractComplianceLanguageAllowed: false, negotiationLanguageAllowed: false });
      expect(result.comparison).toMatchObject({ atParCertified: false, processorMarkupEstablished: false });
    }
    expect([...synthetic.values()].filter((result) => result.selectedReference.state === "selected")).toHaveLength(8);
    expect([...synthetic.values()].filter((result) => result.selectedReference.state === "blocked_missing_scope" || result.selectedReference.state === "current_reference_unresolved")).toHaveLength(2);
  });

  function get(id: string): CurrentReferenceConsumptionResult {
    const result = synthetic.get(id);
    if (!result) throw new Error(`missing synthetic result ${id}`);
    return result;
  }
});

function allGoldRows(gold: GoldResult[]) {
  return gold.flatMap((entry) => entry.findings.map((finding) => ({ file: entry.file, label: entry.analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)?.selectedLabel ?? "", finding })));
}
