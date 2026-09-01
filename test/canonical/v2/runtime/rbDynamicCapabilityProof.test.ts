import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { parsePdf, type ParsedDocument } from "../../../../src/parser.js";
import {
  fiservFirstDataFullStatementDriver,
  fiservFirstDataShortStatementDriver,
} from "../../../../src/fiservFirstDataParser.js";
import { genericFiservStatementDriver } from "../../../../src/genericFiservStatementParser.js";
import {
  addNormalizedFiservProtocolEvidence,
  buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing,
  buildCanonicalEconomicsV2FromFiserv,
  buildObservationalCanonicalPricingV2FromFiserv,
  executeDeterministicCanonicalAnalysisRun,
  observeFiservEconomicsInCanonicalSynthesisV2,
  resolveFiservRuntimeCapabilityAdmission,
  resolveFiservTemplateAdmission,
} from "../../../../src/canonical/v2/index.js";

const fullFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT4_CLOVER.pdf");
const shortFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf");
const genericFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf");
const zeroFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf");

describe("RB Dynamic Capability Proof v1", () => {
  let fullDocument: ParsedDocument;
  let shortDocument: ParsedDocument;
  let basysOnlyDocument: ParsedDocument;
  let genericDocument: ParsedDocument;
  let zeroDocument: ParsedDocument;

  beforeAll(async () => {
    [fullDocument, shortDocument, genericDocument, zeroDocument] = await Promise.all([
      parsePdf(fullFixture), parsePdf(shortFixture), parsePdf(genericFixture), parsePdf(zeroFixture),
    ]);
    basysOnlyDocument = genericDocument;
    genericDocument = withQualifyingFiservOrigin(genericDocument);
  }, 30_000);

  it.each([
    ["full", () => fullDocument, fiservFirstDataFullStatementDriver],
    ["short", () => shortDocument, fiservFirstDataShortStatementDriver],
  ])("admits a valid known %s layout when historical mapping authority is withheld", (_name, source, driver) => {
    const result = adjudicate(source(), driver, { statementCompleteness: "complete", known: false });
    expect(result.known).toBeNull();
    expect(result.admission.proof).toMatchObject({
      family: { status: "proven" },
      supportState: "supported_full",
      mappingAuthority: "diagnostic_only_zero_canonical_authority",
    });
    expect(result.admission.resolution).toMatchObject({
      authorityClass: "deterministic_capability_policy",
      mappingId: "fiserv_statement_level_dynamic_capability_policy",
    });
    expect(capability(result.admission.proof, "canonical_net_submitted_card_volume").status).toBe("supported");
    expect(capability(result.admission.proof, "fee_total").status).toBe("supported");
  });

  it("does not let a known mapping rescue missing statement-level financial proof", () => {
    const original = adjudicate(fullDocument, fiservFirstDataFullStatementDriver, { statementCompleteness: "complete", known: true });
    expect(original.known).not.toBeNull();
    const output = structuredClone(original.output);
    output.reconciliationResults = [];
    const broken = adjudicate(fullDocument, fiservFirstDataFullStatementDriver, {
      statementCompleteness: "complete", known: true, knownResolution: original.known, output,
    });
    expect(broken.admission.proof.knownLayoutMappingId).not.toBeNull();
    expect(broken.admission.proof.mappingAuthority).toBe("diagnostic_only_zero_canonical_authority");
    expect(broken.admission.proof.supportState).toBe("recognized_but_insufficient");
    expect(capability(broken.admission.proof, "fee_total").status).toBe("unknown");
  });

  it("admits an unseen generic layout only to the capabilities its evidence proves", () => {
    const result = adjudicate(genericDocument, genericFiservStatementDriver, { statementCompleteness: "unknown", known: false });
    expect(result.known).toBeNull();
    expect(result.admission.proof).toMatchObject({
      candidateExtraction: { eligible: true },
      protocolIdentity: { status: "proven" },
      supportState: "supported_limited",
    });
    expect(capability(result.admission.proof, "canonical_net_submitted_card_volume").status).toBe("supported");
    expect(capability(result.admission.proof, "fee_total").status).toBe("supported");
    expect(result.admission.proof.outputPermissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ output: "headline_effective_rate", state: "permitted" }),
      expect.objectContaining({ output: "complete_fee_inventory", state: "withheld" }),
      expect.objectContaining({ output: "pricing_architecture", state: "downstream_gated" }),
      expect.objectContaining({ output: "merchant_action", state: "downstream_gated" }),
    ]));
  });

  it("does not admit a BASYS-only statement while retaining its extraction candidacy", () => {
    const result = adjudicate(basysOnlyDocument, genericFiservStatementDriver,
      { statementCompleteness: "unknown", known: false });
    expect(result.admission.proof).toMatchObject({
      candidateExtraction: {
        eligible: true,
        reasonCodes: expect.arrayContaining(["basys_ecosystem_hint_zero_support_authority"]),
      },
      protocolIdentity: { status: "unresolved", route: "none" },
      family: { status: "unresolved" },
      supportState: "unsupported_document_class",
    });
    expect(result.admission.resolution).toBeNull();
  });

  it("pre-binds controls and rejects missing operands, ambiguous signs, conflicts, and circular lineage", () => {
    const baseline = adjudicate(fullDocument, fiservFirstDataFullStatementDriver, { statementCompleteness: "complete", known: false });
    const bound = baseline.admission.proof.reconciliationControlCandidates.find((control) =>
      control.semanticPurpose === "complete_fee_occurrence_population" && control.result === "pass");
    expect(bound).toMatchObject({
      bindingState: "bound",
      lineageState: "independent_or_declared_multi_field",
      toleranceBasis: "parser_declared_sum_precision",
    });
    expect(bound!.operandOccurrenceRefs.length).toBeGreaterThan(0);
    expect(bound!.authoritativeTotalOccurrenceRef).not.toBeNull();
    expect(bound!.tolerance).toBeGreaterThanOrEqual(0);

    const ambiguousFoundation = structuredClone(baseline.foundation);
    const feeTotal = ambiguousFoundation.sourceModel.occurrences.find((occurrence) =>
      occurrence.semanticRole === "fee_charge" && occurrence.contributionRole === "authoritative_contributor")!;
    feeTotal.printedDirection = "unknown";
    const ambiguous = resolveFiservRuntimeCapabilityAdmission({ document: fullDocument,
      driverId: "irrelevant-adapter-id", parserOutput: baseline.output,
      observationalFoundation: ambiguousFoundation, knownLayoutResolution: null });
    expect(capability(ambiguous.proof, "fee_total").status).toBe("unknown");
    expect(ambiguous.proof.reconciliationControlCandidates.some((control) =>
      control.semanticPurpose.includes("fee") && control.bindingState === "rejected")).toBe(true);

    const missingFoundation = structuredClone(baseline.foundation);
    missingFoundation.sourceModel.occurrences = missingFoundation.sourceModel.occurrences.filter((occurrence) =>
      !(occurrence.semanticRole === "fee_charge" && occurrence.contributionRole === "authoritative_contributor"));
    const missing = resolveFiservRuntimeCapabilityAdmission({ document: fullDocument,
      driverId: "candidate-extractor", parserOutput: baseline.output,
      observationalFoundation: missingFoundation, knownLayoutResolution: null });
    expect(capability(missing.proof, "fee_total").status).toBe("unknown");
    expect(missing.proof.reconciliationControlCandidates.some((control) =>
      control.semanticPurpose.includes("fee") && control.bindingState === "rejected")).toBe(true);

    const conflictingOutput = structuredClone(baseline.output);
    const conflicting = conflictingOutput.reconciliationResults.find((row: any) =>
      row.identity === "fee_detail:all_line_items_eq_total_fees");
    conflicting.status = "RECON_MATERIAL_BREAK";
    const conflictResult = adjudicate(fullDocument, fiservFirstDataFullStatementDriver,
      { statementCompleteness: "complete", known: false, output: conflictingOutput });
    expect(capability(conflictResult.admission.proof, "fee_total").status).toBe("unknown");
    expect(capability(conflictResult.admission.proof, "fee_detail").status).toBe("unknown");

    const noToleranceOutput = structuredClone(baseline.output);
    const noTolerance = noToleranceOutput.reconciliationResults.find((row: any) =>
      row.identity === "fee_detail:all_line_items_eq_total_fees");
    delete noTolerance.toleranceBand;
    const noToleranceResult = adjudicate(fullDocument, fiservFirstDataFullStatementDriver,
      { statementCompleteness: "complete", known: false, output: noToleranceOutput });
    expect(capability(noToleranceResult.admission.proof, "fee_detail").status).toBe("unknown");
    expect(noToleranceResult.admission.proof.reconciliationControlCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ semanticPurpose: "complete_fee_occurrence_population", bindingState: "rejected",
        toleranceBasis: "unbound" }),
    ]));

    const roundingOutput = structuredClone(baseline.output);
    roundingOutput.reconciliationResults.find((row: any) =>
      row.identity === "fee_detail:all_line_items_eq_total_fees").status = "RECON_ROUNDING";
    const roundingResult = adjudicate(fullDocument, fiservFirstDataFullStatementDriver,
      { statementCompleteness: "complete", known: false, output: roundingOutput });
    expect(roundingResult.admission.proof.reconciliationControlCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ semanticPurpose: "complete_fee_occurrence_population", result: "pass_with_rounding",
        toleranceBasis: "parser_declared_sum_precision" }),
    ]));
    expect(capability(roundingResult.admission.proof, "fee_detail").status).toBe("supported");

    const circularFoundation = structuredClone(baseline.foundation);
    const netOccurrences = circularFoundation.sourceModel.occurrences.filter((occurrence) => occurrence.semanticRole === "net_submitted");
    const authoritativeNet = netOccurrences.find((occurrence) => occurrence.contributionRole === "authoritative_contributor")!;
    netOccurrences.filter((occurrence) => occurrence.id !== authoritativeNet.id).forEach((occurrence) => {
      occurrence.evidenceRef = authoritativeNet.evidenceRef;
    });
    const crossOnlyOutput = structuredClone(baseline.output);
    crossOnlyOutput.reconciliationResults = crossOnlyOutput.reconciliationResults.filter((row: any) =>
      /^cross_reference:/.test(row.identity) || /^fee_detail:/.test(row.identity));
    const circularResult = resolveFiservRuntimeCapabilityAdmission({ document: fullDocument, driverId: "another-adapter",
      parserOutput: crossOnlyOutput, observationalFoundation: circularFoundation, knownLayoutResolution: null });
    expect(circularResult.proof.reconciliationControlCandidates.some((control) =>
      control.controlType === "cross_representation" && control.bindingState === "rejected")).toBe(true);
  });

  it("keeps headline authority limited when statement/fee coverage is partial and deduplicates repetitions", () => {
    const result = adjudicate(fullDocument, fiservFirstDataFullStatementDriver, { statementCompleteness: "unknown", known: false });
    expect(result.admission.proof.supportState).toBe("supported_limited");
    expect(result.admission.proof.coverage).toMatchObject({
      suppliedArtifactIntegrity: { state: "complete" },
      statementCompleteness: { state: "unknown" },
    });
    expect(result.admission.proof.outputPermissions.find((item) => item.output === "headline_effective_rate")?.state).toBe("permitted");
    expect(result.admission.proof.outputPermissions.find((item) => item.output === "complete_fee_inventory")?.state).toBe("withheld");
    expect(result.foundation.sourceModel.representationGroups.every((group) =>
      group.duplicateHandling !== "one_authoritative_contributor"
      || group.occurrenceRefs.filter((ref) => ref === group.authoritativeContributionOccurrenceRef).length === 1)).toBe(true);
  });

  it("takes statement completeness only from the explicit source profile, never adapter or mapping identity", () => {
    const implicit = executeDeterministicCanonicalAnalysisRun({ runId: "implicit-completeness",
      sourceDocumentRef: "same-complete-artifact", document: fullDocument }).run;
    const declared = executeDeterministicCanonicalAnalysisRun({ runId: "declared-completeness",
      sourceDocumentRef: "same-complete-artifact", document: fullDocument,
      sourceProfile: { statementCompleteness: "complete" } }).run;
    expect(implicit.knownLayoutAdmission).not.toBeNull();
    expect(declared.knownLayoutAdmission?.mappingId).toBe(implicit.knownLayoutAdmission?.mappingId);
    expect(implicit.capabilityProof).toMatchObject({
      coverage: { statementCompleteness: { state: "unknown" } },
      supportState: "supported_limited",
    });
    expect(declared.capabilityProof).toMatchObject({
      coverage: { statementCompleteness: { state: "complete" } },
      supportState: "supported_full",
    });
  });

  it("supports both direct-net and gross-minus-refunds routes and preserves zero as undefined", () => {
    const direct = adjudicate(genericDocument, genericFiservStatementDriver, { statementCompleteness: "unknown", known: false });
    expect(capability(direct.admission.proof, "canonical_net_submitted_card_volume").status).toBe("supported");
    expect(direct.admission.proof.reconciliationControlCandidates.some((control) =>
      control.semanticPurpose === "canonical_net_submitted_population" && control.result === "pass")).toBe(true);

    const baseline = adjudicate(fullDocument, fiservFirstDataFullStatementDriver,
      { statementCompleteness: "unknown", known: false });
    const grossOutput = structuredClone(baseline.output);
    const grossFoundation = structuredClone(baseline.foundation);
    const net = grossFoundation.sourceModel.occurrences.find((occurrence) =>
      occurrence.semanticRole === "net_submitted" && occurrence.contributionRole === "authoritative_contributor")!;
    const supporting = grossFoundation.sourceModel.occurrences.filter((occurrence) =>
      occurrence.semanticRole === "net_submitted" && occurrence.id !== net.id && occurrence.evidenceRef !== net.evidenceRef);
    grossFoundation.sourceModel.occurrences = grossFoundation.sourceModel.occurrences.filter((occurrence) =>
      occurrence.semanticRole !== "gross_sale" && occurrence.semanticRole !== "refund");
    const refundMinor = 10_000;
    grossOutput.selectedFinancials.grossSales = (net.printedAmount!.amountMinor + refundMinor) / 100;
    grossOutput.selectedFinancials.refunds = refundMinor / 100;
    grossFoundation.sourceModel.occurrences.push(
      { ...supporting[0]!, id: `${supporting[0]!.id}_gross_candidate`, semanticRole: "gross_sale",
        contributionRole: "supporting_detail", printedDirection: "positive",
        printedAmount: { ...net.printedAmount!, amountMinor: net.printedAmount!.amountMinor + refundMinor } },
      { ...supporting[1]!, id: `${supporting[1]!.id}_refund_candidate`, semanticRole: "refund",
        contributionRole: "supporting_detail", printedDirection: "unsigned",
        printedAmount: { ...net.printedAmount!, amountMinor: refundMinor } },
    );
    const grossRoute = resolveFiservRuntimeCapabilityAdmission({
      document: fullDocument,
      driverId: "candidate_extractor_without_authority",
      parserOutput: grossOutput,
      observationalFoundation: grossFoundation,
      knownLayoutResolution: null,
    });
    expect(grossRoute.proof.reconciliationControlCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ semanticPurpose: "canonical_net_from_gross_and_refunds", result: "pass" }),
    ]));
    expect(capability(grossRoute.proof, "canonical_net_submitted_card_volume").status).toBe("supported");

    const zero = executeDeterministicCanonicalAnalysisRun({ runId: "zero", sourceDocumentRef: "zero", document: zeroDocument }).run;
    expect(zero.artifacts.rb?.metrics.headlineEffectiveRate).toMatchObject({ state: "undefined_zero_denominator", value: null });
  });

  it("produces identical adjudication from identical normalized evidence regardless of adapter id", () => {
    const baseline = adjudicate(genericDocument, genericFiservStatementDriver, { statementCompleteness: "unknown", known: false });
    const alternate = resolveFiservRuntimeCapabilityAdmission({ document: genericDocument,
      driverId: "completely_different_candidate_adapter", parserOutput: baseline.output,
      observationalFoundation: baseline.foundation, knownLayoutResolution: null });
    expect(alternate.proof).toEqual(baseline.admission.proof);
  });

  it("keeps known-mapping diagnostics out of RB/RC/RD/RE authority and RH above neither permission set", () => {
    const without = executeDeterministicCanonicalAnalysisRun({ runId: "without", sourceDocumentRef: "same",
      document: genericDocument }).run;
    const withKnownDiagnostic = adjudicate(fullDocument, fiservFirstDataFullStatementDriver,
      { statementCompleteness: "unknown", known: true });
    const withoutKnownDiagnostic = adjudicate(fullDocument, fiservFirstDataFullStatementDriver,
      { statementCompleteness: "unknown", known: false });
    const rbWith = admittedFoundation(fullDocument, fiservFirstDataFullStatementDriver.id, withKnownDiagnostic);
    const rbWithout = admittedFoundation(fullDocument, fiservFirstDataFullStatementDriver.id, withoutKnownDiagnostic);
    expect(rbWith.financialPopulations).toEqual(rbWithout.financialPopulations);
    expect(rbWith.metrics).toEqual(rbWithout.metrics);
    const rcWith = buildObservationalCanonicalPricingV2FromFiserv(rbWith);
    const rcWithout = buildObservationalCanonicalPricingV2FromFiserv(rbWithout);
    expect(rcWith).toEqual(rcWithout);
    const rdWith = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(rcWith);
    const rdWithout = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(rcWithout);
    expect(rdWith).toEqual(rdWithout);
    expect(observeFiservEconomicsInCanonicalSynthesisV2(rdWith))
      .toEqual(observeFiservEconomicsInCanonicalSynthesisV2(rdWithout));
    expect(without.artifacts.rh?.projection.permissions.financial_metrics.state).not.toBe("denied");
    expect(without.artifacts.rh?.projection.permissions.inventory.state).not.toBe("permitted");
    expect(without.artifacts.rh?.projection.permissions.composition_percentages.state).toBe("denied");
  });

  it("contains no merchant, filename, hash, fixture amount, or Gold-answer runtime rule", async () => {
    const source = await readFile("src/canonical/v2/fiservCapabilityContract.ts", "utf8");
    const admission = await readFile("src/canonical/v2/fiservRuntimeCapabilityAdmission.ts", "utf8");
    const policy = `${source}\n${admission}`;
    expect(policy).not.toMatch(/SAMPLE_MERCHANT|JEFES|PEPES|ABDUL|BASHER|FUTURMARKET|\.pdf|gold[-_ ]answer/i);
    expect(policy).not.toMatch(/52460\.55|171283\.93|2712\.11|141\.31/);
  });
});

function adjudicate(document: ParsedDocument, driver: { id: string; parse(document: ParsedDocument): unknown }, options: {
  statementCompleteness: "complete" | "unknown";
  known: boolean;
  knownResolution?: ReturnType<typeof resolveFiservTemplateAdmission>["resolution"];
  output?: any;
}) {
  const rawOutput = options.output ?? driver.parse(document);
  const output = addNormalizedFiservProtocolEvidence(document, rawOutput);
  const foundation = buildCanonicalEconomicsV2FromFiserv({ document, parserOutput: output,
    sourceDocumentRef: "capability-contract-source", parserId: driver.id, provenanceStatus: "observational",
    documentIntegrity: integrity(document, options.statementCompleteness) });
  const known = options.knownResolution ?? resolveFiservTemplateAdmission({ driverId: driver.id, parserOutput: output,
    observationalFoundation: foundation }).resolution;
  const admission = resolveFiservRuntimeCapabilityAdmission({ document, driverId: driver.id, parserOutput: output,
    observationalFoundation: foundation, knownLayoutResolution: options.known ? known : null });
  return { output, foundation, known: options.known ? known : null, admission };
}

function admittedFoundation(document: ParsedDocument, parserId: string, result: ReturnType<typeof adjudicate>) {
  return buildCanonicalEconomicsV2FromFiserv({ document, parserOutput: result.output,
    sourceDocumentRef: "capability-contract-source", parserId, provenanceStatus: "observational",
    templateAdmission: result.admission.resolution!.templateAdmission,
    sectionAdmissions: result.admission.resolution!.sectionAdmissions,
    documentIntegrity: integrity(document, "unknown") });
}

function capability(proof: ReturnType<typeof resolveFiservRuntimeCapabilityAdmission>["proof"], id: string) {
  return proof.capabilities.find((item) => item.capability === id)!;
}

function integrity(document: ParsedDocument, completenessStatus: "complete" | "unknown") {
  const item = document.suppliedDocumentIntegrity!;
  return { suppliedDocumentStatus: "complete_supplied_document" as const,
    observedPageCount: item.enumeratedPageCount, processedPageCount: item.processedPageCount,
    fatalPageErrorCount: item.fatalPageErrorCount, extractionLineageComplete: item.extractionLineageComplete,
    localIngestionTruncated: item.localIngestionTruncated, completenessStatus };
}

function withQualifyingFiservOrigin(document: ParsedDocument): ParsedDocument {
  return { ...document, rows: [
    { page: "page-1", content: "Merchant Services Provider | Fiserv" },
    ...document.rows,
  ] };
}
