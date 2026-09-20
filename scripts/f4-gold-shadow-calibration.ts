import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parsePdf, type ParsedDocument } from "../src/parser.js";
import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { evaluateF4Shadow, type F4LegacyComparison, type F4ShadowDecision } from "../src/claimAuthorityF4/shadow.js";

// These are existing repository observations, not authenticated Gold source mappings.
// Names stay local to the loader and never enter the privacy-safe result.
const fixtures = [
  { caseId: "G1", file: "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf", businessType: "other" },
  { caseId: "G2", file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce" },
  { caseId: "G3", file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", businessType: "ecommerce" },
  { caseId: "G4", file: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", businessType: "restaurant_food_beverage" },
  { caseId: "G5", file: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", businessType: "restaurant_food_beverage" },
  { caseId: "G7", file: "fiserv_ABDUL_BASHER_Aug_2025.pdf", businessType: "retail" },
  { caseId: "G8", file: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", businessType: "restaurant_food_beverage" },
] as const satisfies ReadonlyArray<{ caseId: string; file: string; businessType: BusinessTypeId }>;

const semanticAnchors: Record<string, Record<string, "supported" | "refused" | "unresolved">> = {
  G1: { "G1-PRICE-UNDERLYING": "supported", "G1-NO-EXACT-OWNER": "refused" },
  G2: { "G2-MARKUP-SPLIT": "unresolved", "G2-NO-EXACT-MARKUP": "refused", "G2-NO-NQUAL-SAVINGS": "refused" },
  G3: { "G3-MINIMUM-FEE": "supported", "G3-NO-RECURRENCE": "refused", "G3-NO-NUMERIC-RATE": "refused" },
  G4: { "G4-NO-EXACT-OWNER": "refused", "G4-NO-ZERO-MARKUP": "refused", "G4-NO-WATS-PROFIT": "refused" },
  G5: { "G5-MARKUP": "unresolved", "G5-NO-EXACT-MARKUP": "refused",
    "G5-KEYED-DOWNGRADE-COUNTERFACTUAL": "supported", "G5-NO-FULL-AVOIDABLE": "refused" },
  G7: { "G7-NO-EXACT-OWNER": "refused", "G7-NO-FUTURE-CURRENT": "refused" },
  G8: { "G8-MARKUP-SPLIT": "unresolved", "G8-NO-MARGIN": "refused",
    "G8-NO-SAVINGS": "refused", "G8-NO-BUNDLED-BENCHMARK": "refused" },
};

type Count = Record<string, number>;
function counts(values: string[]): Count {
  const result: Count = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function materialGroups(comparisons: F4LegacyComparison[], decisions: F4ShadowDecision[]) {
  const byKey = new Map(decisions.map((item) => [item.key, item]));
  const groups = new Map<string, {
    dimension: string; semanticCode: string; basis: string; currentStatus: string; shadowStatus: string;
    relation: string; reasonCodes: string[]; missingGates: string[]; missingFacets: string[];
    missingLanes: string[][]; count: number;
  }>();
  for (const comparison of comparisons) {
    if (comparison.relation === "agreement") continue;
    const decision = byKey.get(comparison.decisionKey);
    if (!decision) throw new Error("F4 calibration decision/comparison mismatch");
    const entry = {
      dimension: decision.dimension, semanticCode: decision.semanticCode,
      basis: comparison.comparisonBasis, currentStatus: comparison.currentStatus,
      shadowStatus: comparison.shadowStatus, relation: comparison.relation,
      reasonCodes: comparison.reasonCodes, missingGates: decision.missingGates,
      missingFacets: decision.missingFacets, missingLanes: decision.missingLanes,
    };
    const key = JSON.stringify(entry);
    const prior = groups.get(key);
    groups.set(key, { ...entry, count: (prior?.count ?? 0) + 1 });
  }
  return [...groups.values()].sort((a, b) => a.dimension.localeCompare(b.dimension)
    || a.semanticCode.localeCompare(b.semanticCode) || a.relation.localeCompare(b.relation));
}

const catalogBytes = readFileSync(new URL("../test/fixtures/gold-contract/gold-catalog-v0.3.final.json", import.meta.url));
const catalog = JSON.parse(catalogBytes.toString("utf8")) as { schema_version: string; cases: Array<{
  case_id: string; case_kind: string; source: { availability: string; provenance_status: string };
}> };
if (catalog.schema_version !== "ratereveal_gold_catalog_final_v3") throw new Error("F4 Gold catalog version drift");
const registerBytes = readFileSync(new URL("../test/fixtures/gold-contract/gold-authority-derivability-v1.json", import.meta.url));
const register = JSON.parse(registerBytes.toString("utf8")) as { schemaVersion: string; assertions: Array<{
  assertionId: string; caseId: string; resolution: { semanticStatus: string };
  provenance: { sourceExecutionStatus: string };
}> };
if (register.schemaVersion !== "ratereveal_gold_authority_derivability_register_v1")
  throw new Error("F4 Gold authority register version drift");

const cases = [];
for (const fixture of fixtures) {
  const gold = catalog.cases.find((item) => item.case_id === fixture.caseId);
  if (!gold || gold.case_kind !== "real_statement" || gold.source.availability !== "requires_human_review")
    throw new Error(`F4 Gold source state changed for ${fixture.caseId}`);
  const anchors = Object.entries(semanticAnchors[fixture.caseId]).map(([assertionId, expected]) => {
    const assertion = register.assertions.find((item) => item.assertionId === assertionId && item.caseId === fixture.caseId);
    if (!assertion || assertion.resolution.semanticStatus !== expected
      || assertion.provenance.sourceExecutionStatus !== "not_source_executable")
      throw new Error(`F4 Gold semantic anchor drift: ${assertionId}`);
    return { assertionId, semanticStatus: expected, sourceExecutionStatus: assertion.provenance.sourceExecutionStatus };
  });
  const originalLog = console.log;
  const originalWarn = console.warn;
  let document: ParsedDocument;
  try {
    // The PDF parser prints progress and font diagnostics; keep the result valid JSON.
    console.log = () => {};
    console.warn = () => {};
    document = await parsePdf(fileURLToPath(new URL(`../test/fixtures/pdfs/${fixture.file}`, import.meta.url)));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, {
    sourceFileName: fixture.file, businessType: fixture.businessType,
  });
  const report = evaluateF4Shadow({ analysis });
  if (report.publicProbe !== null || report.decisions.some((item) => item.status === "supported"
    && item.semanticCode !== "merchant_facing_fee_component"))
    throw new Error(`F4 Gold calibration produced an out-of-scope positive claim for ${fixture.caseId}`);
  const exact = report.comparisons.filter((item) => item.comparisonBasis === "exact_semantic");
  const proxy = report.comparisons.filter((item) => item.comparisonBasis === "proxy_only");
  const readiness = report.comparisons.find((item) => item.decisionKey === "statement:ownership_actionability_claim_readiness");
  if (!readiness) throw new Error("F4 customer readiness comparison absent");
  const componentUnknownByRole: Record<string, number> = {};
  const componentSupportedByRole: Record<string, number> = {};
  for (const decision of report.decisions.filter((item) => item.semanticCode === "merchant_facing_fee_component" && item.status === "supported")) {
    const row = analysis.feeLedger.rows.find((item) => item.id === decision.feeRowId);
    if (!row) throw new Error("F4 supported component decision row absent");
    const key = `${row.role}/${row.contributionDecision.reasonCode}/${row.contributesToUniqueTotal ? "included" : "excluded"}`;
    componentSupportedByRole[key] = (componentSupportedByRole[key] ?? 0) + 1;
  }
  for (const decision of report.decisions.filter((item) => item.semanticCode === "merchant_facing_fee_component" && item.status === "unknown")) {
    const row = analysis.feeLedger.rows.find((item) => item.id === decision.feeRowId);
    if (!row) throw new Error("F4 component decision row absent");
    const key = `${row.role}/${row.contributionDecision.reasonCode}/${row.contributesToUniqueTotal ? "included" : "excluded"}`;
    componentUnknownByRole[key] = (componentUnknownByRole[key] ?? 0) + 1;
  }
  cases.push({
    caseId: fixture.caseId, standing: "repository_fixture_provisional_not_authoritative_gold_source_execution",
    semanticAnchors: anchors,
    canonicalStatus: analysis.validation.status, feeLedgerStatus: analysis.feeLedger.status,
    feeRowCount: analysis.feeLedger.rows.length,
    comparisons: { exact: counts(exact.map((item) => item.relation)), proxy: counts(proxy.map((item) => item.relation)) },
    decisionStatusByDimension: Object.fromEntries([...new Set(report.decisions.map((item) => item.dimension))].sort()
      .map((dimension) => [dimension, counts(report.decisions.filter((item) => item.dimension === dimension).map((item) => item.status))])),
    materialDivergences: materialGroups(report.comparisons, report.decisions),
    customerReadiness: { currentPermission: readiness.currentValue, shadowStatus: readiness.shadowStatus,
      comparisonBasis: readiness.comparisonBasis, relation: readiness.relation },
    componentSupportedByRole: Object.fromEntries(Object.entries(componentSupportedByRole).sort(([a], [b]) => a.localeCompare(b))),
    componentUnknownByRole: Object.fromEntries(Object.entries(componentUnknownByRole).sort(([a], [b]) => a.localeCompare(b))),
    completeness: {
      savingsMissingStatementTotal: report.decisions.filter((item) => item.dimension === "savings" && item.missingGates.includes("statement_total")).length,
      savingsMissingFeeComposition: report.decisions.filter((item) => item.dimension === "savings" && item.missingGates.includes("fee_composition")).length,
      savingsMissingSavingsGate: report.decisions.filter((item) => item.dimension === "savings" && item.missingGates.includes("savings")).length,
      grandControls: counts(analysis.feeLedger.controls.filter((item) => item.basis === "grand_control")
        .map((item) => `${item.independence}/${item.status}`)),
    },
  });
}

const totals = { exact: {} as Count, proxy: {} as Count };
for (const item of cases) {
  for (const basis of ["exact", "proxy"] as const) {
    for (const [relation, count] of Object.entries(item.comparisons[basis]))
      totals[basis][relation] = (totals[basis][relation] ?? 0) + count;
  }
}
for (const basis of ["exact", "proxy"] as const)
  totals[basis] = Object.fromEntries(Object.entries(totals[basis]).sort(([a], [b]) => a.localeCompare(b)));

const result = {
  schemaVersion: "f4_gold_shadow_calibration_v1",
  standing: "provisional_repository_fixture_observation_no_gold_source_promotion",
  goldCatalogSha256: createHash("sha256").update(catalogBytes).digest("hex"),
  goldAuthorityRegisterSha256: createHash("sha256").update(registerBytes).digest("hex"),
  caseIds: fixtures.map((item) => item.caseId),
  excluded: [
    { caseId: "G6", reason: "exact_source_identity_and_mapping_unresolved" },
    { caseId: "G9", reason: "original_gold_source_unavailable" },
  ],
  totals, cases,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
