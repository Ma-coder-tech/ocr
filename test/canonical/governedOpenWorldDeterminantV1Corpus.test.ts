import { describe, expect, it } from "vitest";
import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import {
  applyOpenWorldResearchStopV1,
  evaluateOpenWorldResearchOutcomeV1,
  governedOpenWorldActionClassesV1,
  governedOpenWorldFeeFamiliesV1,
  measureOpenWorldResearchEfficiencyV1,
  validateOpenWorldRenderingV1,
} from "../../src/canonical/governedOpenWorldDeterminantV1.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint } from "../../src/canonical/internalAnalystFindingV1.js";
import { parsePdf } from "../../src/parser.js";

const PDF_ROOT = "test/fixtures/pdfs";
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
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };

describe("Open-World Determinant & Unknown-Fee Analysis v1", () => {
  it("publishes the complete processor-neutral ontology and all action classes without an unknown family", () => {
    expect(governedOpenWorldFeeFamiliesV1().map((item) => item.familyCode)).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "F13"]);
    expect(governedOpenWorldFeeFamiliesV1().every((item) => item.processorNeutral && !item.unknownIsFamily)).toBe(true);
    expect(governedOpenWorldActionClassesV1().map((item) => item.code)).toEqual(["N1", "N2", "N3", "N4", "N5", "N6", "N7"]);
  });

  it("calibrates the full 11-statement Gold corpus, stops when determinants suffice, and preserves unresolved layers", async () => {
    const corpus = [];
    for (const fixture of FIXTURES) {
      const document = await parsePdf(`${PDF_ROOT}/${fixture.file}`);
      const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
      const before = canonicalFinancialTruthFingerprint(analysis);
      const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
      expect(report.canonicalFinancialTruth).toMatchObject({ beforeFingerprint: before, afterFingerprint: before, unchanged: true, mutationAllowed: false });
      expect(canonicalFinancialTruthFingerprint(analysis)).toBe(before);
      const rows = report.findings.filter((finding) => finding.sourceFeeRowId && finding.openWorldDeterminants).map((finding) => ({
        file: fixture.file,
        feeRowId: finding.sourceFeeRowId!,
        label: analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)!.selectedLabel,
        amountMinor: finding.observedAmountMinor ?? 0,
        legacyExplained: Boolean(finding.exactFeeIdentity.value || finding.broaderEconomicCategory.value),
        legacyActionable: Boolean(finding.datedNetworkEvidence || finding.usNetworkFeeEvidence || (finding.perItemAnalysis && finding.perItemAnalysis.economicLayer !== "PER_ITEM_LAYER_UNRESOLVED") || finding.merchantFacingPriceController.value || finding.commercialReasonableness.state === "industry_judgment"),
        determinant: finding.openWorldDeterminants!,
      }));
      corpus.push({ report, rows });
    }
    const rows = corpus.flatMap((item) => item.rows);
    const unresolved = rows.filter((row) => row.determinant.d1EconomicLayerAndControl.economicLayer.value === "LAYER_UNRESOLVED");
    const familyKnown = rows.filter((row) => row.determinant.exactIdentity.state === "family_known_identity_unresolved");
    const stopped = rows.filter((row) => row.determinant.stoppingReason === "S1_DETERMINANT_SUFFICIENCY");
    const researchEscalations = rows.filter((row) => row.determinant.research.disposition === "ESCALATE_BOUNDED_RESEARCH");
    const queued = corpus.reduce((sum, item) => sum + item.report.coverage.queuedResearchQuestions, 0);
    const calibratedResearchItems = corpus.flatMap((item) => [...item.report.researchQueue.selected, ...item.report.researchQueue.deferred]);
    const stage0Decisions = corpus.flatMap((item) => item.report.researchQueue.stage0Decisions);
    const queuedKeys = new Set(corpus.flatMap((item) => [...item.report.researchQueue.selected, ...item.report.researchQueue.deferred].map((queuedItem) => `${item.rows[0]?.file}:${queuedItem.question.feeRowRef}`)));
    const queuedOpenWorldEscalations = researchEscalations.filter((row) => queuedKeys.has(`${row.file}:${row.feeRowId}`)).length;
    const metrics = {
      statements: corpus.length,
      materialRows: rows.length,
      materialDollarsMinor: rows.reduce((sum, row) => sum + row.amountMinor, 0),
      beforeExplainedRows: rows.filter((row) => row.legacyExplained).length,
      beforeExplainedDollarsMinor: rows.filter((row) => row.legacyExplained).reduce((sum, row) => sum + row.amountMinor, 0),
      beforeActionableRows: rows.filter((row) => row.legacyActionable).length,
      beforeActionableDollarsMinor: rows.filter((row) => row.legacyActionable).reduce((sum, row) => sum + row.amountMinor, 0),
      exactIdentitySupported: rows.filter((row) => row.determinant.exactIdentity.state === "exact_supported").length,
      familyKnownIdentityUnresolved: familyKnown.length,
      identityAndLayerUnresolved: unresolved.filter((row) => row.determinant.exactIdentity.state === "identity_unresolved").length,
      determinantSufficient: rows.filter((row) => row.determinant.determinantSufficiency === "DETERMINANT_SUFFICIENT").length,
      actionableClassified: rows.filter((row) => row.determinant.d4Actionability.actionClass !== "N7").length,
      highMaterialityRows: rows.filter((row) => row.determinant.d3Materiality.highMateriality).length,
      actionableHighMaterialityRows: rows.filter((row) => row.determinant.d3Materiality.highMateriality && row.determinant.d4Actionability.actionClass !== "N7").length,
      explainedMaterialDollarsMinor: rows.filter((row) => row.determinant.family.value && row.determinant.d1EconomicLayerAndControl.economicLayer.value !== "LAYER_UNRESOLVED").reduce((sum, row) => sum + row.amountMinor, 0),
      actionableClassifiedDollarsMinor: rows.filter((row) => row.determinant.d4Actionability.actionClass !== "N7").reduce((sum, row) => sum + row.amountMinor, 0),
      unexplainedMaterialDollarsMinor: unresolved.reduce((sum, row) => sum + row.amountMinor, 0),
      researchEscalations: researchEscalations.length,
      researchStoppedBySufficiency: stopped.length,
      exactIdentityUnresolvedNotQueued: rows.filter((row) => row.determinant.exactIdentity.state !== "exact_supported" && row.determinant.research.disposition === "STOP").length,
      queued,
      stage0SuppressedExternalResearch: researchEscalations.length - queuedOpenWorldEscalations,
      newlyWarrantedOutsideOpenWorldProjection: queued - queuedOpenWorldEscalations,
    };
    console.info("OPEN_WORLD_DETERMINANT_CORPUS_METRICS", JSON.stringify(metrics));
    expect(metrics).toEqual({
      statements: 11,
      materialRows: 483,
      materialDollarsMinor: 1_640_090,
      beforeExplainedRows: 348,
      beforeExplainedDollarsMinor: 1_315_954,
      beforeActionableRows: 157,
      beforeActionableDollarsMinor: 685_466,
      exactIdentitySupported: 90,
      familyKnownIdentityUnresolved: 248,
      identityAndLayerUnresolved: 145,
      determinantSufficient: 313,
      actionableClassified: 330,
      highMaterialityRows: 65,
      actionableHighMaterialityRows: 50,
      explainedMaterialDollarsMinor: 1_165_245,
      actionableClassifiedDollarsMinor: 1_165_245,
      unexplainedMaterialDollarsMinor: 474_845,
      researchEscalations: 166,
      researchStoppedBySufficiency: 295,
      exactIdentityUnresolvedNotQueued: 247,
      queued: 153,
      stage0SuppressedExternalResearch: 32,
      newlyWarrantedOutsideOpenWorldProjection: 19,
    });
    expect(calibratedResearchItems).toHaveLength(queued);
    expect(stage0Decisions).toHaveLength(rows.length);
    expect(stage0Decisions.filter((item) => item.calibration.stage0.researchWarranted)).toHaveLength(queued);
    expect(calibratedResearchItems.every((item) => item.calibration.stage0.decision === "RESEARCH")).toBe(true);
    expect(stage0Decisions.filter((item) => item.calibration.stage0.adjudicationRequired).every((item) => item.calibration.stage0.stoppingReason === "GOVERNED_EVIDENCE_CONFLICT")).toBe(true);
    expect(calibratedResearchItems.every((item) => item.calibration.budget.maximumExternalOperations <= 8)).toBe(true);
    expect(familyKnown.some((row) => row.determinant.determinantSufficiency === "DETERMINANT_SUFFICIENT" && row.determinant.research.disposition === "STOP")).toBe(true);
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved.every((row) => !row.determinant.renderingPermissions.acquiringSideLanguageAllowed && !row.determinant.renderingPermissions.networkOwnershipLanguageAllowed)).toBe(true);
    expect(researchEscalations.every((row) => row.determinant.d3Materiality.material && row.determinant.research.question)).toBe(true);
    expect(new Set(rows.map((row) => row.determinant.d4Actionability.actionClass)).has("N1")).toBe(true);
    expect(new Set(rows.map((row) => row.determinant.d4Actionability.actionClass)).has("N2")).toBe(true);
    expect(new Set(rows.map((row) => row.determinant.d4Actionability.actionClass)).has("N3")).toBe(true);
    expect(new Set(rows.map((row) => row.determinant.d4Actionability.actionClass)).has("N4")).toBe(true);
    expect(new Set(rows.map((row) => row.determinant.d4Actionability.actionClass)).has("N5")).toBe(true);
    expect(new Set(rows.map((row) => row.determinant.d4Actionability.actionClass)).has("N7")).toBe(true);
  }, 60_000);

  it("holds fuzzy/candidate interpretation below fact authority and enforces research and rendering stop guards", async () => {
    const document = await parsePdf(`${PDF_ROOT}/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf`);
    const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce" });
    const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
    const additional = report.findings.find((finding) => finding.sourceFeeRowId && analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)?.selectedLabel.includes("**ADDITIONAL FEES"))!;
    const cpu = report.findings.find((finding) => finding.sourceFeeRowId && analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)?.selectedLabel.includes("CPU GTWY"))!;
    expect(additional.openWorldDeterminants).toMatchObject({
      exactIdentity: { state: "identity_unresolved", value: null },
      family: { value: null },
      d1EconomicLayerAndControl: { economicLayer: { value: "LAYER_UNRESOLVED" } },
      d4Actionability: { actionClass: "N7" },
    });
    expect(validateOpenWorldRenderingV1(additional.openWorldDeterminants!, { assertsExactIdentity: true, assertsAcquiringSide: true, recommendsNegotiation: true, rendersCandidateAsFact: true })).toEqual({
      allowed: false,
      reasonCodes: ["exact_identity_exceeds_evidence", "acquiring_side_not_affirmatively_supported", "negotiation_exceeds_price_control_evidence", "candidate_cannot_render_as_fact"],
    });
    expect(cpu.openWorldDeterminants).toMatchObject({ exactIdentity: { state: "family_known_identity_unresolved" }, family: { value: "F9" }, stoppingReason: "S1_DETERMINANT_SUFFICIENCY", research: { disposition: "STOP" } });
    expect(cpu.openWorldDeterminants?.retrieval.promotedToFactByThisLayer).toBe(false);
    expect(applyOpenWorldResearchStopV1({ row: additional.openWorldDeterminants!, independentResearchPasses: 1, evidenceTierImproved: false, sourceQuality: "adequate" })).toMatchObject({ disposition: "STOP", stoppingReason: "S3_RESEARCH_STAGNATION" });
    expect(applyOpenWorldResearchStopV1({ row: additional.openWorldDeterminants!, independentResearchPasses: 0, evidenceTierImproved: false, sourceQuality: "stale_circular_inconsistent_or_insufficient" })).toMatchObject({ disposition: "STOP", stoppingReason: "S4_SOURCE_QUALITY_FAILURE" });
    const afterResearch = structuredClone(additional.openWorldDeterminants!);
    afterResearch.family = { state: "category_only", value: "F9", confidence: "CATEGORY_ONLY", evidenceRefs: ["independent_processor_source"], explanation: "Candidate supported after review." };
    const outcome = evaluateOpenWorldResearchOutcomeV1({ before: additional.openWorldDeterminants!, after: afterResearch, evidenceTierImproved: true });
    expect(measureOpenWorldResearchEfficiencyV1([outcome])).toMatchObject({ executedResearchQuestions: 1, usefulOutcomes: 1, determinantOrActionChanges: 1, evidenceTierImprovements: 1, usefulOutcomeRatePercent: 100, status: "MEASURED" });
    expect(measureOpenWorldResearchEfficiencyV1([])).toMatchObject({ executedResearchQuestions: 0, usefulOutcomeRatePercent: null, status: "NOT_MEASURED_NO_RESEARCH_EXECUTED" });
    const equipmentAnalysis = structuredClone(analysis);
    const equipmentRow = equipmentAnalysis.feeLedger.rows.find((row) => row.id === additional.sourceFeeRowId)!;
    equipmentRow.selectedLabel = "TERMINAL LEASE FEE";
    for (const occurrence of equipmentAnalysis.feeLedger.sourceOccurrences.filter((item) => equipmentRow.sourceOccurrenceIds.includes(item.id))) occurrence.normalizedSourceText = "TERMINAL LEASE FEE";
    for (const interpretation of equipmentAnalysis.feeLedger.parserInterpretations.filter((item) => equipmentRow.parserInterpretationIds.includes(item.id))) interpretation.label = "TERMINAL LEASE FEE";
    const equipmentReport = buildInternalAnalystFindingV1({ analysis: equipmentAnalysis, statementContext: US_CONTEXT });
    const equipmentFinding = equipmentReport.findings.find((finding) => finding.sourceFeeRowId === equipmentRow.id)!;
    expect(equipmentFinding.openWorldDeterminants).toMatchObject({ family: { value: "F11" }, d4Actionability: { actionClass: "N6", merchantAgreementRequiredForAction: false, merchantAgreementRequiredForContractConclusion: true } });
    expect(canonicalFinancialTruthFingerprint(analysis)).toBe(report.canonicalFinancialTruth.beforeFingerprint);
  }, 30_000);
});
