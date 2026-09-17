import { beforeAll, describe, expect, it } from "vitest";
import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint, type InternalAnalystFinding } from "../../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { parsePdf } from "../../src/parser.js";

const PDF_ROOT = "test/fixtures/pdfs";
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };
const FIXTURES: Array<{ file: string; businessType: BusinessTypeId }> = [
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

type CorpusEntry = { file: string; analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[]; conflicts: number };

describe("Governed Conflict Resolution & Historical/Current Firewall v1", () => {
  let corpus: CorpusEntry[];

  beforeAll(async () => {
    corpus = [];
    for (const fixture of FIXTURES) {
      const analysis = buildCanonicalStatementFactsFromParsedDocument(await parsePdf(`${PDF_ROOT}/${fixture.file}`), { sourceFileName: fixture.file, businessType: fixture.businessType });
      const fingerprint = canonicalFinancialTruthFingerprint(analysis);
      const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
      corpus.push({ file: fixture.file, analysis, findings: report.findings.filter((finding) => finding.sourceFeeRowId), conflicts: report.researchQueue.stage0Decisions.reduce((total, decision) => total + decision.calibration.stage0.governedConflicts.length, 0) });
      expect(report.canonicalFinancialTruth).toMatchObject({ beforeFingerprint: fingerprint, afterFingerprint: fingerprint, unchanged: true, mutationAllowed: false });
      expect(canonicalFinancialTruthFingerprint(analysis)).toBe(fingerprint);
    }
  }, 60_000);

  it("keeps the 18 diagnosed row conflicts at zero while retaining current maintenance separately", () => {
    expect(corpus).toHaveLength(11);
    expect(corpus.reduce((total, entry) => total + entry.conflicts, 0)).toBe(0);
    const assessments = allFindings(corpus).filter(({ finding }) => finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.matchedRecordIds.includes("CUR26-WRK-MC-ABVF-BASE"));
    expect(assessments).toHaveLength(9);
    expect(assessments.every(({ finding }) => finding.current2026UsCoreNetworkReference?.reference.conflicts.length === 0 && finding.current2026UsCoreNetworkReference.research.priority === "none")).toBe(true);
    expect(assessments.every(({ finding }) => finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.state === "CURRENT_WORKING_REFERENCE_STRONG")).toBe(true);
    expect(assessments.every(({ finding }) => finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.retainedSeparatelyFromHistoricalConclusion)).toBe(true);
  });

  it("classifies both reconciled Amex Program Fees rows as program cost with distinct participant roles", () => {
    const rows = matching(corpus, /^AMEXCT043 - PROGRAM FEES$/i);
    expect(rows).toHaveLength(2);
    for (const { finding } of rows) {
      expect(finding).toMatchObject({
        exactFeeIdentity: { value: "amex_program_cost" },
        broaderEconomicCategory: { value: "network_program_cost" },
        collector: { value: "processor_or_acquirer" },
        economicBeneficiary: { value: "card_network" },
        ruleSetter: { value: "card_network" },
        priceSetter: { value: "card_network" },
        merchantFacingPriceController: { value: "acquiring_side_program" },
        contractualCompliance: { state: "contract_required" },
        openWorldDeterminants: {
          family: { value: "F2" },
          d1EconomicLayerAndControl: { economicLayer: { value: "card_network" } },
          d2MechanicAndPopulation: { mechanic: { value: "reconciled_program_cost_total" }, population: { value: "statement_printed_amex_program_cost_total" } },
          d4Actionability: { actionClass: "N1", merchantAgreementRequiredForAction: false },
          renderingPermissions: { networkOwnershipLanguageAllowed: true },
        },
      });
      expect(finding.pricingModel.state).not.toBe("contract_required");
      expect(finding.competingInterpretations.some((item) => /issuer_interchange|ordinary issuer interchange/i.test(item.interpretation))).toBe(false);
      expect(finding.mastercardFocusedEvidence).toBeNull();
    }
    expect(rows.map(({ finding }) => finding.openWorldDeterminants?.d1EconomicLayerAndControl.economicBeneficiary.value)).toEqual(["card_network", "card_network"]);
  });

  it("keeps an Amex Program Fees label unresolved when the statement-local subtotal proof is absent", () => {
    const source = corpus.find((entry) => entry.file.includes("NXGEN_VORTAX"))!.analysis;
    const withoutSubtotal = structuredClone(source);
    withoutSubtotal.evidence = withoutSubtotal.evidence.filter((evidence) => !evidence.parserInterpretations.some((interpretation) => interpretation.interpretedRole === "amex_acquired_program_cost_total"));
    const report = buildInternalAnalystFindingV1({ analysis: withoutSubtotal, statementContext: US_CONTEXT });
    const row = withoutSubtotal.feeLedger.rows.find((candidate) => candidate.selectedLabel === "AMEXCT043 - PROGRAM FEES")!;
    const finding = report.findings.find((candidate) => candidate.sourceFeeRowId === row.id)!;
    expect(finding).toMatchObject({
      exactFeeIdentity: { state: "unresolved", value: null },
      broaderEconomicCategory: { value: "amex_program_or_network_cost" },
      economicBeneficiary: { state: "unresolved", value: null },
      ruleSetter: { state: "unresolved", value: null },
      priceSetter: { state: "unresolved", value: null },
      openWorldDeterminants: { family: { state: "unresolved", value: null }, d1EconomicLayerAndControl: { economicLayer: { value: "LAYER_UNRESOLVED" } } },
    });
    expect(finding.openWorldDeterminants?.d1EconomicLayerAndControl.economicLayer.value).not.toBe("issuer_interchange");
  });

  it("preserves the September 2024 Mastercard assessment conclusion while isolating the unresolved current reference", () => {
    const row = matching(corpus, /MASTERCARD.*(?:ASSESSMENT|DUES & ASSESSMENTS)/i).find(({ file, finding }) => file.includes("WELLS_FARGO") && finding.mastercardFocusedEvidence?.assessment2024);
    expect(row?.finding.mastercardFocusedEvidence).toMatchObject({
      assessment2024: { structuralExplanation: "STRONGLY_EXPLAINED", confirmedAtPar: false, acquiringSideUpliftExcluded: false },
      residualDecomposition: { exactArithmeticAloneIsProof: false, markupEstablished: false },
      effectiveUsNetworkEvidence: { sourceConflicts: [], comparison: { state: "population_or_product_scope_unresolved" } },
    });
    expect(row?.finding.current2026UsCoreNetworkReference).toMatchObject({
      historicalApplication: "CURRENT_REFERENCE_ONLY_NOT_APPLIED_TO_HISTORICAL_STATEMENT",
      reference: { state: "NOT_APPLICABLE", conflicts: [] },
      currentReferenceMaintenance: { state: "CURRENT_WORKING_REFERENCE_STRONG", values: expect.arrayContaining([expect.objectContaining({ value: 0.0014 }), expect.objectContaining({ value: 0.0015 })]) },
      research: { priority: "none" },
    });
    expect(row?.finding.mastercardFocusedEvidence?.effectiveUsNetworkEvidence.comparison.renderingText).toMatch(/Markup is not required/i);
    expect(row?.finding.mastercardFocusedEvidence?.effectiveUsNetworkEvidence.limitations.join(" ")).toMatch(/small acquiring-side uplift cannot be fully excluded/i);
  });

  it("resolves Discover current authorization and separates historical/current Base II identity and cardinality", () => {
    const discover = matching(corpus, /DISCOVER - NETWORK AUTHORIZATION FEE/i)[0]!.finding;
    expect(discover.current2026UsCoreNetworkReference).toMatchObject({
      historicalApplication: "DATED_CHANGE_APPLIES_TO_STATEMENT_PERIOD",
      reference: { state: "CURRENT_CONFIRMED_CHANGE", values: [{ value: 0.019, unit: "usd_per_event" }], conflicts: [] },
      currentReferenceMaintenance: { rejectedCandidates: [{ value: 0.025, disposition: "unsupported_stale_or_error_candidate", origin: "unresolved" }] },
    });
    expect(discover.current2026UsCoreNetworkReference?.currentReferenceMaintenance.conflicts).toEqual([]);

    const baseII = matching(corpus, /VI BASE II SYSTEM FILE FEE/i)[0]!.finding;
    expect(baseII.usNetworkFeeEvidence).toMatchObject({ identity: { value: "visa_base_ii_system_file_fee" }, comparison: { statementValue: 0.0018 } });
    expect(baseII.current2026UsCoreNetworkReference).toMatchObject({
      historicalApplication: "HISTORICAL_VALUE_PRESERVED_BEFORE_CHANGE",
      reference: { state: "CURRENT_CONFIRMED_CHANGE", historicalValues: [{ value: 0.0018, unit: "usd_per_event" }], conflicts: [] },
      currentReferenceMaintenance: { state: "CURRENT_WORKING_REFERENCE_STRONG", values: [{ value: 0.0025, unit: "usd_per_event", variantId: "transmission", scope: "U.S. Base II Transmission/System File from January 1, 2025" }], candidateValues: [expect.objectContaining({ value: 0.0027, status: "UNRESOLVED_CONFLICTING_CANDIDATE" })] },
      lineToFeeCardinality: { state: "one_fee_supported", comparisonAllowed: true },
      research: { priority: "none" },
    });
    expect(baseII.current2026UsCoreNetworkReference?.lineToFeeCardinality.explanation).toMatch(/Network Access family is not merged/i);
  });

  it("cleans all Location Fee projections while preserving raw assertions for audit", () => {
    const locations = matching(corpus, /MASTERCARD.*LOCATION FEE/i);
    expect(locations).toHaveLength(5);
    for (const { finding } of locations) {
      expect(finding.mastercardFocusedEvidence).toMatchObject({
        effectiveUsNetworkEvidence: { sourceConflicts: [] },
        locationMccAdjudication: {
          canonicalExcludedMccs: [8398, 8661],
          preservedSourceAssertions: ["Fiserv: 8393 and 8661", "Nuvei/Paya: 8938 and 8661"],
          correctionLayerOnly: true,
        },
      });
    }
  });
});

function matching(corpus: CorpusEntry[], pattern: RegExp) {
  return allFindings(corpus).filter(({ label }) => pattern.test(label));
}

function allFindings(corpus: CorpusEntry[]) {
  return corpus.flatMap((entry) => entry.findings.flatMap((finding) => {
    const label = entry.analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)?.selectedLabel ?? "";
    return [{ file: entry.file, label, finding }];
  }));
}
