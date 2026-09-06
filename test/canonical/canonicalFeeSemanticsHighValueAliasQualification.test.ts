import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import {
  FEE_SEMANTICS_CORPUS_INVENTORY_VERSION,
  buildFeeSemanticsCorpusInventory,
  expandRetrievalAbbreviations,
  type FeeSemanticsCorpusStatementInput,
} from "../../src/canonical/feeSemanticsCorpusInventory.js";
import {
  QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_IDS_V1,
  QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_PACK_V1,
} from "../../src/canonical/feeSemanticsFiservAliasPack.js";
import { retrieveGuardedFeeSemanticCandidates } from "../../src/canonical/feeSemanticsGuardedCandidateRetrieval.js";
import { QUALIFIED_FEE_SEMANTICS_SEED_V1 } from "../../src/canonical/feeSemanticsSeedCatalog.js";
import { validateQualifiedFeeSemanticCatalog } from "../../src/canonical/qualifiedFeeSemanticsCatalog.js";
import { parsePdf } from "../../src/parser.js";

const CORPUS_FILES = [
  "Nov_2024_Statement.pdf",
  "SAMPLE_MERCHANT4_CLOVER.pdf",
  "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
  "fiserv_ABDUL_BASHER_Aug_2025.pdf",
  "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
  "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf",
  "fiserv_NXGEN_VORTAX_Sep_2022.pdf",
  "fiserv_PAYSAFE_Febr_2024.pdf",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
  "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
] as const;

describe("fee semantics high-value alias qualification and retrieval precision v1", () => {
  it("admits only the bounded, scoped, source-bound alias pack", () => {
    expect(validateQualifiedFeeSemanticCatalog(QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_PACK_V1)).toEqual([]);
    expect(QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_IDS_V1).toHaveLength(15);
    const additions = QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_PACK_V1.catalog.concepts
      .flatMap((concept) => concept.aliases.map((alias) => ({ conceptId: concept.conceptId, alias })))
      .filter((item) => QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_IDS_V1.includes(item.alias.aliasId));

    expect(new Set(additions.map((item) => item.conceptId))).toEqual(new Set([
      "authorization_service_fee",
      "discover_network_authorization_fee",
      "network_assessment_fee",
      "visa_misuse_of_authorization_system_fee",
    ]));
    expect(additions.every((item) => item.alias.status === "admitted"
      && item.alias.scope.geographies.includes("us")
      && item.alias.scope.processorIds.includes("fiserv_first_data")
      && item.alias.evidenceRefs.includes("fiserv_corpus_high_value_alias_adjudication_2026")
      && item.alias.evidenceRefs.length >= 2)).toBe(true);
    expect(QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_PACK_V1.catalog.concepts
      .flatMap((concept) => concept.assertions)
      .some((assertion) => assertion.axis === "pricing_correctness" && assertion.status === "admitted")).toBe(false);
  });

  it("uses abbreviation and token-set similarity only for guarded candidate retrieval", () => {
    const rapidFuzzEvaluation = JSON.parse(readFileSync("test/fixtures/feeSemantics/retrieval-falsification-v1.json", "utf8"));
    expect(rapidFuzzEvaluation).toMatchObject({
      evaluatedLibrary: "rapidfuzz",
      evaluatedVersion: "3.14.6",
      runtimeDisposition: "evaluation_only_not_added_as_project_dependency",
    });
    expect(rapidFuzzEvaluation.cases.filter((item: { expectedUse: string }) => item.expectedUse.includes("helpful"))).toHaveLength(4);
    expect(rapidFuzzEvaluation.cases.filter((item: { observedCollision?: string }) => item.observedCollision)).toHaveLength(3);

    expect(expandRetrievalAbbreviations("DCVR ACQ ADDRS VERIFICATION SRV FEE")).toEqual({
      label: "DISCOVER ACQUIRER ADDRESS VERIFICATION SERVICE FEE",
      expansions: ["ACQ:ACQUIRER", "ADDRS:ADDRESS", "DCVR:DISCOVER", "SRV:SERVICE"],
    });

    const avs = guarded("DCVR ACQ - ADDRS VERIFICATION SERVICE FEE", "discover");
    expect(avs[0]).toMatchObject({
      conceptId: "address_verification_service_fee",
      score: 1,
      contextCompatible: true,
      identityEstablished: false,
      authority: "none",
    });
    const misuse = guarded("VISA - VISA MISUSE OF AUTH FEE", "visa");
    expect(misuse[0]).toMatchObject({
      conceptId: "visa_misuse_of_authorization_system_fee",
      contextCompatible: true,
      identityEstablished: false,
    });

    for (const [label, networkId] of [
      ["AMEX SYSTEM PROCESSING FEE", "american_express"],
      ["AMEX ACQR TRANSACTION FEE", "american_express"],
      ["MC-COMMERCIAL T&E FLEET", "mastercard"],
      ["LOCATION FEE", "mastercard"],
      ["AVS WATS AUTHORIZATION FEE", "american_express"],
    ] as const) {
      expect(guarded(label, networkId)).toEqual([]);
    }
  });

  it("inventories the full deduplicated Fiserv-family corpus by retrieval family and improves only exact qualified coverage", async () => {
    const statements: FeeSemanticsCorpusStatementInput[] = [];
    const canonicalHashes = new Map<string, string>();
    for (const file of CORPUS_FILES) {
      const path = `test/fixtures/pdfs/${file}`;
      const document = await parsePdf(path);
      const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: file });
      canonicalHashes.set(analysis.identity.sourceDocumentRef, objectHash(analysis));
      statements.push({
        documentFingerprint: createHash("sha256").update(readFileSync(path)).digest("hex"),
        analysis,
        context: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: [`statement_us_scope:${file}`] } },
      });
    }

    const baseline = buildFeeSemanticsCorpusInventory({ statements, catalog: QUALIFIED_FEE_SEMANTICS_SEED_V1 });
    const qualified = buildFeeSemanticsCorpusInventory({ statements, catalog: QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_PACK_V1 });

    expect(qualified).toMatchObject({
      inventoryVersion: FEE_SEMANTICS_CORPUS_INVENTORY_VERSION,
      mode: "shadow_evaluation_only",
      authority: "diagnostic_only",
      suppliedStatementCount: 12,
      uniqueDocumentCount: 11,
      totalFeeRows: 695,
      canonicalMutationAllowed: false,
      crossStatementIdentityInferenceAllowed: false,
    });
    expect(qualified.duplicateDocumentGroups).toHaveLength(1);
    expect(qualified.duplicateDocumentGroups[0]?.statementRefs).toHaveLength(2);
    expect(statusCounts(baseline.rows)).toEqual({
      candidate_only: 14,
      resolved_exact_trusted: 47,
      retrieval_candidates_only: 57,
      unresolved_no_evidence: 546,
      unresolved_scope_or_period: 31,
    });
    expect(statusCounts(qualified.rows)).toEqual({
      candidate_only: 14,
      resolved_exact_trusted: 87,
      retrieval_candidates_only: 71,
      unresolved_no_evidence: 492,
      unresolved_scope_or_period: 31,
    });

    const families = Object.fromEntries(qualified.families.map((family) => [family.familyId, family]));
    expect(families.network_assessment).toMatchObject({ rowCount: 36, statementCount: 8, exactTrustedRowCount: 36, unresolvedRowCount: 0 });
    expect(families.authorization).toMatchObject({ rowCount: 50, statementCount: 7, exactTrustedRowCount: 17, unresolvedRowCount: 33 });
    expect(families.verification).toMatchObject({ rowCount: 19, statementCount: 7, exactTrustedRowCount: 2, unresolvedRowCount: 17 });
    expect(families.acquirer_processing).toMatchObject({ rowCount: 17, statementCount: 7, exactTrustedRowCount: 6, unresolvedRowCount: 11 });
    expect(families.gateway_cpu).toMatchObject({ rowCount: 24, statementCount: 4, exactTrustedRowCount: 0, unresolvedRowCount: 24 });
    expect(families.integrity_program).toMatchObject({ rowCount: 9, statementCount: 6, exactTrustedRowCount: 3, unresolvedRowCount: 6 });
    expect(families.location).toMatchObject({ rowCount: 9, statementCount: 9, exactTrustedRowCount: 0, unresolvedRowCount: 9 });

    const sourceUnitRow = qualified.rows.find((row) => /KILOBYTE CLEARING FEE/.test(row.printedLabel)
      && row.formulaBasis === "source_units_times_per_unit");
    expect(sourceUnitRow).toMatchObject({
      formulaBasis: "source_units_times_per_unit",
      sourceUnit: "kilobytes",
      semanticStatus: "unresolved_no_evidence",
      conceptFamilyIdentityEstablished: false,
      financialAuthority: "none",
    });
    expect(sourceUnitRow?.statementPeriod).not.toBeNull();
    expect(sourceUnitRow?.sourceSections.length).toBeGreaterThan(0);
    expect(qualified.rows.filter((row) => /CPU GTWY/.test(row.printedLabel)).every((row) => row.resolvedConceptId === null)).toBe(true);
    expect(qualified.rows.filter((row) => /PROGRAM INTEGRITY/.test(row.printedLabel)).every((row) => row.resolvedConceptId === null)).toBe(true);
    expect(qualified.rows.filter((row) => row.semanticStatus === "resolved_exact_trusted")
      .every((row) => row.resolvedConceptId !== null && row.financialAuthority === "none")).toBe(true);

    for (const statement of statements) {
      expect(objectHash(statement.analysis)).toBe(canonicalHashes.get(statement.analysis.identity.sourceDocumentRef));
    }
  }, 45_000);
});

function guarded(label: string, networkId: string) {
  return retrieveGuardedFeeSemanticCandidates({
    catalog: QUALIFIED_FEE_SEMANTICS_SEED_V1.catalog,
    query: {
      statementRef: "retrieval-falsification",
      label,
      asOf: "2025-01-31",
      geography: "us",
      processorId: "fiserv_first_data",
      isoId: null,
      networkId,
      merchantAccountId: null,
      statementLocalMeaning: "unknown",
    },
  });
}

function statusCounts(rows: Array<{ semanticStatus: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.semanticStatus] = (counts[row.semanticStatus] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function objectHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
