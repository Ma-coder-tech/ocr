import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import {
  FEE_SEMANTICS_SHADOW_STATEMENT_INTEGRATION_VERSION,
  buildFeeSemanticsShadowStatementReport,
  type FeeSemanticsShadowStatementContext,
} from "../../src/canonical/feeSemanticsShadowStatementIntegration.js";
import { QUALIFIED_FEE_SEMANTICS_SEED_V1 } from "../../src/canonical/feeSemanticsSeedCatalog.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { parsePdf } from "../../src/parser.js";

const US_CONTEXT: FeeSemanticsShadowStatementContext = {
  geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["statement_us_scope"] },
};

describe("fee semantics shadow statement integration v1", () => {
  it("resolves an exact scoped alias after reversible printed-label transformations without mutating the fee row", () => {
    const analysis = syntheticAnalysis(["MASTERCARD - NABU FEES 12 TRANSACTIONS AT .0195"]);
    const before = structuredClone(analysis);
    const report = buildFeeSemanticsShadowStatementReport({ analysis, catalog: QUALIFIED_FEE_SEMANTICS_SEED_V1, context: US_CONTEXT });
    const row = report.rows[0]!;

    expect(report).toMatchObject({
      integrationVersion: FEE_SEMANTICS_SHADOW_STATEMENT_INTEGRATION_VERSION,
      mode: "shadow_evaluation_only",
      authority: "diagnostic_only",
      canonicalMutationAllowed: false,
    });
    expect(row).toMatchObject({
      status: "resolved_exact_trusted",
      conceptId: "mastercard_network_access_brand_usage",
      matchedAlias: "NABU FEES",
      retrievalBasis: "exact_alias",
      networkId: "mastercard",
      networkEvidenceBasis: "printed_network_prefix",
      usefulSemanticResolution: true,
      pricingCorrectnessEstablished: false,
      merchantSpecificApplicabilityEstablished: false,
      financialAuthority: "none",
    });
    expect(row.selectedLookupVariant).toEqual({
      label: "NABU FEES",
      transformations: ["remove_printed_network_prefix", "remove_printed_arithmetic_suffix"],
    });
    expect(row.semanticAxes).toMatchObject({
      identity: { status: "resolved", value: "mastercard_network_access_brand_usage" },
      assessment_unit: { status: "resolved" },
      ownership: { status: "resolved", value: "mastercard_network" },
      applicability: { status: "resolved" },
      pricing_correctness: { status: "unresolved", value: null },
    });
    expect(row.trustedCatalogEvidenceRefs.length).toBeGreaterThan(0);
    expect(row.qualifiedResearchEvidenceRefs.length).toBeGreaterThan(0);
    expect(row.aiHypothesisEvidenceRefs).toEqual([]);
    expect(analysis).toEqual(before);
    expect(Object.isFrozen(report)).toBe(true);
  });

  it("prefers the most specific exact label that preserves printed network evidence", () => {
    const analysis = syntheticAnalysis(["DISCOVER - NETWORK AUTHORIZATION FEE 62 TRANSACTIONS AT 0.019"]);
    const row = buildFeeSemanticsShadowStatementReport({
      analysis,
      catalog: QUALIFIED_FEE_SEMANTICS_SEED_V1,
      context: US_CONTEXT,
    }).rows[0]!;

    expect(row).toMatchObject({
      status: "resolved_exact_trusted",
      conceptId: "discover_network_authorization_fee",
      matchedAlias: "DISCOVER NETWORK AUTHORIZATION FEE",
      networkId: "discover",
    });
    expect(row.selectedLookupVariant?.transformations).toEqual(["remove_printed_arithmetic_suffix"]);
  });

  it("keeps exact but unqualified Fiserv labels as candidates and similarity-only leads as unknown retrieval results", () => {
    const analysis = syntheticAnalysis(["CPU GTWY", "REGULATORY PRODUCT", "AMEX ACQR TRANSACTION FEE", "VISA - PROGRAM INTEGRITY FEE"]);
    const report = buildFeeSemanticsShadowStatementReport({ analysis, catalog: QUALIFIED_FEE_SEMANTICS_SEED_V1, context: US_CONTEXT });

    expect(report.rows[0]).toMatchObject({
      status: "candidate_only",
      conceptId: null,
      candidateConceptIds: ["electronic_payments_cpu_gateway_authorization"],
      usefulSemanticResolution: false,
    });
    expect(report.rows[1]).toMatchObject({
      status: "candidate_only",
      conceptId: null,
      candidateConceptIds: ["unresolved_regulatory_product"],
    });
    expect(report.rows[2]).toMatchObject({
      status: "retrieval_candidates_only",
      conceptId: null,
      usefulSemanticResolution: false,
    });
    expect(report.rows[2]!.reasonCodes).toContain("fee_semantics_shadow_similarity_candidate_only");
    expect(report.rows[3]).toMatchObject({
      status: "candidate_only",
      conceptId: null,
      applicableExactCandidateConceptIds: ["visa_processing_integrity_fee_family"],
      inapplicableExactCandidateConceptIds: ["mastercard_processing_integrity_fee_family"],
      usefulSemanticResolution: false,
    });
    expect(report.rows[3]!.retrievalLeadConceptIds).toEqual(expect.arrayContaining([
      "mastercard_processing_integrity_fee_family",
      "visa_transaction_integrity_fee",
    ]));
    expect(report.rows[3]!.aiHypothesisEvidenceRefs).toContain("ai_program_integrity_research_hypothesis");
    expect(report.coverage).toMatchObject({
      candidateOnlyRows: 3,
      exactUnacceptedCandidateRows: 3,
      retrievalCandidateOnlyRows: 1,
      exactTrustedResolutionRows: 0,
    });
  });

  it("reports processor, network, geography, and date mismatches instead of borrowing an inapplicable alias", () => {
    const processor = shadowRow("DISC 1", syntheticAnalysis(["DISC 1"]), US_CONTEXT);
    const network = shadowRow("VI TRANSACTION INTEGRITY FEE 1 TRANSACTIONS AT .1",
      syntheticAnalysis(["VI TRANSACTION INTEGRITY FEE 1 TRANSACTIONS AT .1"]), US_CONTEXT);
    const geography = shadowRow("MASTERCARD - NABU FEES", syntheticAnalysis(["MASTERCARD - NABU FEES"]), {
      geography: { value: "europe", evidenceClass: "statement_local", evidenceRefs: ["statement_europe_scope"] },
    });
    const date = shadowRow("DCSF", syntheticAnalysis(["DCSF"], { start: "2025-08-01", end: "2025-08-31" }), {
      geography: { value: "ap", evidenceClass: "statement_local", evidenceRefs: ["statement_ap_scope"] },
      networkIdByFeeRowId: {
        fee_0: { value: "visa", evidenceClass: "statement_local", evidenceRefs: ["statement_visa_scope"] },
      },
    });

    expect(processor).toMatchObject({ status: "unresolved_scope_or_period", scopeConflictAxes: ["processor"] });
    expect(network).toMatchObject({ status: "unresolved_scope_or_period", scopeConflictAxes: ["network"] });
    expect(geography).toMatchObject({ status: "unresolved_scope_or_period", scopeConflictAxes: ["geography"] });
    expect(date).toMatchObject({ status: "unresolved_scope_or_period", scopeConflictAxes: ["period"] });
    for (const row of [processor, network, geography, date]) {
      expect(row.conceptId).toBeNull();
      expect(row.financialAuthority).toBe("none");
    }
  });

  it("rejects conflicting printed and supplied network context before catalog resolution", () => {
    const analysis = syntheticAnalysis(["VISA - NABU FEES"]);
    const row = buildFeeSemanticsShadowStatementReport({
      analysis,
      catalog: QUALIFIED_FEE_SEMANTICS_SEED_V1,
      context: {
        ...US_CONTEXT,
        networkIdByFeeRowId: {
          fee_0: { value: "mastercard", evidenceClass: "statement_local", evidenceRefs: ["statement_network_context"] },
        },
      },
    }).rows[0]!;

    expect(row).toMatchObject({
      status: "unresolved_conflict",
      conceptId: null,
      networkId: null,
      networkEvidenceBasis: "conflicting",
      scopeConflictAxes: ["network"],
      usefulSemanticResolution: false,
    });
  });

  it("does not use an unproven non-null scope value", () => {
    const analysis = syntheticAnalysis(["MASTERCARD - NABU FEES"]);
    const row = buildFeeSemanticsShadowStatementReport({
      analysis,
      catalog: QUALIFIED_FEE_SEMANTICS_SEED_V1,
      context: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: [] } },
    }).rows[0]!;

    expect(row).toMatchObject({
      status: "unresolved_scope_or_period",
      conceptId: null,
      scopeConflictAxes: ["geography"],
    });
  });

  it("measures bounded real Fiserv coverage without cross-statement inference or canonical mutation", async () => {
    const files = [
      "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
      "fiserv_ABDUL_BASHER_Aug_2025.pdf",
      "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
      "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
      "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
    ];
    const reports = [];
    for (const file of files) {
      const document = await parsePdf(`test/fixtures/pdfs/${file}`);
      const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: file });
      const canonicalBefore = canonicalFinancialProjection(analysis);
      const report = buildFeeSemanticsShadowStatementReport({
        analysis,
        catalog: QUALIFIED_FEE_SEMANTICS_SEED_V1,
        context: US_CONTEXT,
      });
      expect(canonicalFinancialProjection(analysis)).toEqual(canonicalBefore);
      reports.push(report);
    }

    const totals = reports.reduce((sum, report) => ({
      rows: sum.rows + report.coverage.totalFeeRows,
      resolved: sum.resolved + report.coverage.exactTrustedResolutionRows,
      exactCandidates: sum.exactCandidates + report.coverage.exactUnacceptedCandidateRows,
      retrievalOnly: sum.retrievalOnly + report.coverage.retrievalCandidateOnlyRows,
      scopeRejected: sum.scopeRejected + report.coverage.scopeOrPeriodConflictRows,
      conflicts: sum.conflicts + report.coverage.conflictingRows,
      noEvidence: sum.noEvidence + report.coverage.noEvidenceRows,
    }), { rows: 0, resolved: 0, exactCandidates: 0, retrievalOnly: 0, scopeRejected: 0, conflicts: 0, noEvidence: 0 });

    expect(totals).toEqual({
      rows: 324,
      resolved: 12,
      exactCandidates: 7,
      retrievalOnly: 41,
      scopeRejected: 10,
      conflicts: 0,
      noEvidence: 254,
    });
    expect(reports.flatMap((report) => report.coverage.resolvedConceptIds)).toEqual(expect.arrayContaining([
      "interchange_fee",
      "network_assessment_fee",
      "mastercard_network_access_brand_usage",
      "visa_acquirer_processing_fee",
      "visa_transaction_integrity_fee",
      "discover_data_usage_fee",
      "discover_network_authorization_fee",
    ]));
    expect(reports.flatMap((report) => report.rows)
      .filter((row) => row.status === "resolved_exact_trusted")
      .every((row) => row.retrievalBasis === "exact_alias" && row.financialAuthority === "none")).toBe(true);
  }, 30_000);
});

function shadowRow(
  label: string,
  analysis: Pick<CanonicalStatementAnalysis, "identity" | "feeLedger">,
  context: FeeSemanticsShadowStatementContext,
) {
  return buildFeeSemanticsShadowStatementReport({ analysis, catalog: QUALIFIED_FEE_SEMANTICS_SEED_V1, context })
    .rows.find((row) => row.printedLabel === label)!;
}

function syntheticAnalysis(
  labels: string[],
  period: { start: string; end: string } = { start: "2025-10-01", end: "2025-10-31" },
): Pick<CanonicalStatementAnalysis, "identity" | "feeLedger"> {
  return {
    identity: {
      sourceDocumentRef: "synthetic_fee_semantics_statement",
      processorFamily: { value: "Fiserv / First Data", evidenceRefs: ["processor_family_evidence"] },
      processorName: { value: "Fiserv", evidenceRefs: ["processor_name_evidence"] },
      statementPeriod: { value: period, evidenceRefs: ["statement_period_evidence"] },
    },
    feeLedger: {
      sourceOccurrences: labels.map((_, index) => ({ id: `occ_${index}`, evidenceRef: `fee_evidence_${index}` })),
      rows: labels.map((label, index) => ({
        id: `fee_${index}`,
        selectedLabel: label,
        sourceOccurrenceIds: [`occ_${index}`],
      })),
    },
  } as unknown as Pick<CanonicalStatementAnalysis, "identity" | "feeLedger">;
}

function canonicalFinancialProjection(analysis: CanonicalStatementAnalysis): unknown {
  return {
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    crossSummaryLinkEvidence: analysis.crossSummaryLinkEvidence,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    versionManifest: analysis.versionManifest,
  };
}
