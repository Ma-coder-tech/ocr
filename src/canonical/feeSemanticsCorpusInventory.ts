import type { CanonicalStatementAnalysis } from "./types.js";
import {
  buildFeeSemanticsShadowStatementReport,
  type FeeSemanticsShadowRowStatus,
  type FeeSemanticsShadowStatementContext,
} from "./feeSemanticsShadowStatementIntegration.js";
import type { QualifiedFeeSemanticCatalog } from "./qualifiedFeeSemanticsCatalog.js";

export const FEE_SEMANTICS_CORPUS_INVENTORY_VERSION = "fee_semantics_corpus_inventory_v1" as const;
export const FEE_SEMANTICS_CONCEPT_FAMILY_RETRIEVAL_POLICY_VERSION = "fee_semantics_concept_family_retrieval_v1" as const;

export type FeeSemanticsRetrievalFamilyId =
  | "interchange_presentation"
  | "discount_markup_presentation"
  | "authorization"
  | "verification"
  | "network_assessment"
  | "acquirer_processing"
  | "gateway_cpu"
  | "integrity_program"
  | "network_access"
  | "data_usage"
  | "location"
  | "connectivity_data_units"
  | "monthly_administrative"
  | "other_unclassified";

export type FeeSemanticsCorpusStatementInput = {
  documentFingerprint: string;
  analysis: Pick<CanonicalStatementAnalysis, "identity" | "feeLedger">;
  context: FeeSemanticsShadowStatementContext;
};

export type FeeSemanticsCorpusInventoryRow = {
  statementRef: string;
  documentFingerprint: string;
  feeRowId: string;
  printedLabel: string;
  retrievalLabel: string;
  expandedRetrievalLabel: string;
  expansionTokens: string[];
  statementPeriod: { start: string; end: string } | null;
  processorId: string | null;
  networkId: string | null;
  sourceSections: string[];
  printedSectionLabels: string[];
  sourceTypeCodes: string[];
  formulaBasis: string;
  sourceUnit: string | null;
  semanticStatus: FeeSemanticsShadowRowStatus;
  resolvedConceptId: string | null;
  candidateConceptIds: string[];
  retrievalFamilyIds: FeeSemanticsRetrievalFamilyId[];
  conceptFamilyIdentityEstablished: false;
  financialAuthority: "none";
};

export type FeeSemanticsCorpusFamilySummary = {
  familyId: FeeSemanticsRetrievalFamilyId;
  rowCount: number;
  statementCount: number;
  unresolvedRowCount: number;
  exactTrustedRowCount: number;
  distinctRetrievalLabels: number;
  sampleLabels: string[];
  identityStatus: "retrieval_family_only";
};

export type FeeSemanticsCorpusInventory = {
  inventoryVersion: typeof FEE_SEMANTICS_CORPUS_INVENTORY_VERSION;
  retrievalPolicyVersion: typeof FEE_SEMANTICS_CONCEPT_FAMILY_RETRIEVAL_POLICY_VERSION;
  mode: "shadow_evaluation_only";
  authority: "diagnostic_only";
  catalogVersion: string;
  suppliedStatementCount: number;
  uniqueDocumentCount: number;
  duplicateDocumentGroups: Array<{ documentFingerprint: string; statementRefs: string[] }>;
  totalFeeRows: number;
  rows: FeeSemanticsCorpusInventoryRow[];
  families: FeeSemanticsCorpusFamilySummary[];
  canonicalMutationAllowed: false;
  crossStatementIdentityInferenceAllowed: false;
  limitations: string[];
};

const ABBREVIATIONS: Readonly<Record<string, string>> = Object.freeze({
  ACQ: "ACQUIRER",
  ACQR: "ACQUIRER",
  ADDR: "ADDRESS",
  ADDRS: "ADDRESS",
  ASSESS: "ASSESSMENT",
  AUTH: "AUTHORIZATION",
  DCVR: "DISCOVER",
  DSCV: "DISCOVER",
  DSCVR: "DISCOVER",
  GTWY: "GATEWAY",
  MC: "MASTERCARD",
  MTHLY: "MONTHLY",
  NTWK: "NETWORK",
  PROC: "PROCESSING",
  SRV: "SERVICE",
  SVC: "SERVICE",
  SVCS: "SERVICES",
  VI: "VISA",
  VS: "VISA",
});

export function buildFeeSemanticsCorpusInventory(input: {
  statements: FeeSemanticsCorpusStatementInput[];
  catalog: QualifiedFeeSemanticCatalog;
}): FeeSemanticsCorpusInventory {
  const groups = new Map<string, FeeSemanticsCorpusStatementInput[]>();
  for (const statement of input.statements) {
    if (!/^[a-f0-9]{64}$/.test(statement.documentFingerprint)) {
      throw new Error(`fee_semantics_corpus_fingerprint_invalid:${statement.analysis.identity.sourceDocumentRef}`);
    }
    const group = groups.get(statement.documentFingerprint) ?? [];
    group.push(statement);
    groups.set(statement.documentFingerprint, group);
  }

  const uniqueStatements = [...groups.values()].map((items) => items[0]!);
  const rows = uniqueStatements.flatMap((statement) => inventoryRows(statement, input.catalog));
  const familyIds = [...new Set(rows.flatMap((row) => row.retrievalFamilyIds))].sort() as FeeSemanticsRetrievalFamilyId[];
  const families = familyIds.map((familyId): FeeSemanticsCorpusFamilySummary => {
    const familyRows = rows.filter((row) => row.retrievalFamilyIds.includes(familyId));
    const labels = [...new Set(familyRows.map((row) => row.retrievalLabel))].sort();
    return {
      familyId,
      rowCount: familyRows.length,
      statementCount: new Set(familyRows.map((row) => row.statementRef)).size,
      unresolvedRowCount: familyRows.filter((row) => row.semanticStatus !== "resolved_exact_trusted").length,
      exactTrustedRowCount: familyRows.filter((row) => row.semanticStatus === "resolved_exact_trusted").length,
      distinctRetrievalLabels: labels.length,
      sampleLabels: labels.slice(0, 8),
      identityStatus: "retrieval_family_only",
    };
  }).sort((left, right) => right.statementCount - left.statementCount || right.rowCount - left.rowCount || left.familyId.localeCompare(right.familyId));

  return deepFreeze({
    inventoryVersion: FEE_SEMANTICS_CORPUS_INVENTORY_VERSION,
    retrievalPolicyVersion: FEE_SEMANTICS_CONCEPT_FAMILY_RETRIEVAL_POLICY_VERSION,
    mode: "shadow_evaluation_only",
    authority: "diagnostic_only",
    catalogVersion: input.catalog.catalog.catalogVersion,
    suppliedStatementCount: input.statements.length,
    uniqueDocumentCount: uniqueStatements.length,
    duplicateDocumentGroups: [...groups.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([documentFingerprint, items]) => ({
        documentFingerprint,
        statementRefs: items.map((item) => item.analysis.identity.sourceDocumentRef).sort(),
      }))
      .sort((left, right) => left.documentFingerprint.localeCompare(right.documentFingerprint)),
    totalFeeRows: rows.length,
    rows,
    families,
    canonicalMutationAllowed: false,
    crossStatementIdentityInferenceAllowed: false,
    limitations: [
      "Concept-family grouping is retrieval and prioritization evidence only; it never establishes that two printed labels have the same identity.",
      "Obvious abbreviation expansion is reversible and candidate-only. Qualified scoped evidence is still required for catalog admission.",
      "Duplicate document bytes are counted once so copied fixture paths cannot inflate frequency.",
      "Statement rows are resolved independently before coverage is aggregated; no meaning is transferred between statements.",
      "Observed amounts are intentionally excluded from identity grouping because equal amounts do not prove semantic identity.",
    ],
  });
}

function inventoryRows(statement: FeeSemanticsCorpusStatementInput, catalog: QualifiedFeeSemanticCatalog): FeeSemanticsCorpusInventoryRow[] {
  const report = buildFeeSemanticsShadowStatementReport({
    analysis: statement.analysis,
    catalog,
    context: statement.context,
  });
  const interpretationById = new Map(statement.analysis.feeLedger.parserInterpretations.map((item) => [item.id, item]));
  const assignmentByRow = new Map(statement.analysis.feeLedger.partitionSourceProvenance.assignments.map((item) => [item.feeRowId, item]));
  const arithmeticByRow = new Map(statement.analysis.feeLedger.partitionSourceProvenance.rowArithmetic.map((item) => [item.feeRowId, item]));
  const shadowByRow = new Map(report.rows.map((item) => [item.feeRowId, item]));

  return statement.analysis.feeLedger.rows.map((row): FeeSemanticsCorpusInventoryRow => {
    const interpretations = row.parserInterpretationIds.map((id) => interpretationById.get(id)).filter(Boolean);
    const assignment = assignmentByRow.get(row.id);
    const arithmetic = arithmeticByRow.get(row.id);
    const shadow = shadowByRow.get(row.id)!;
    const retrievalLabel = normalizeRetrievalLabel(row.selectedLabel);
    const expanded = expandRetrievalAbbreviations(retrievalLabel);
    return {
      statementRef: report.statementRef,
      documentFingerprint: statement.documentFingerprint,
      feeRowId: row.id,
      printedLabel: row.selectedLabel,
      retrievalLabel,
      expandedRetrievalLabel: expanded.label,
      expansionTokens: expanded.expansions,
      statementPeriod: report.statementPeriod,
      processorId: shadow.processorId,
      networkId: shadow.networkId,
      sourceSections: [...new Set(interpretations.map((item) => item!.section).filter((item): item is string => Boolean(item)))].sort(),
      printedSectionLabels: [...new Set([assignment?.printedSectionLabel].filter((item): item is string => Boolean(item)))].sort(),
      sourceTypeCodes: [...new Set(interpretations.map((item) => item!.sourceTypeCode).filter((item): item is string => Boolean(item)))].sort(),
      formulaBasis: arithmetic?.formulaBasis ?? "unknown",
      sourceUnit: arithmetic?.sourceUnit ?? null,
      semanticStatus: shadow.status,
      resolvedConceptId: shadow.conceptId,
      candidateConceptIds: [...shadow.candidateConceptIds],
      retrievalFamilyIds: retrievalFamilies(expanded.label, interpretations.map((item) => item!.sourceTypeCode ?? "")),
      conceptFamilyIdentityEstablished: false,
      financialAuthority: "none",
    };
  });
}

export function normalizeRetrievalLabel(value: string): string {
  return value
    .replace(/\s+[\d,]+(?:\.\d+)?\s+(?:TRANSACTIONS?|ITEMS?)\s+AT\s+\$?(?:\d+(?:\.\d+)?|\.\d+)\s*$/i, "")
    .replace(/\s+\$?(?:\d+(?:\.\d+)?|\.\d+)\s+(?:DISC(?:OUNT)?\s+RATE\s+)?TIMES\s+\$?[\d,]+(?:\.\d+)?\s*$/i, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function expandRetrievalAbbreviations(value: string): { label: string; expansions: string[] } {
  const expansions: string[] = [];
  const tokens = value.split(" ").filter(Boolean).map((token) => {
    const expanded = ABBREVIATIONS[token];
    if (!expanded) return token;
    expansions.push(`${token}:${expanded}`);
    return expanded;
  });
  return { label: tokens.join(" "), expansions: [...new Set(expansions)].sort() };
}

function retrievalFamilies(label: string, sourceTypeCodes: string[]): FeeSemanticsRetrievalFamilyId[] {
  const values: FeeSemanticsRetrievalFamilyId[] = [];
  const source = sourceTypeCodes.join(" ").toUpperCase();
  if (/INTERCHANGE/.test(source) || /\bINTERCHANGE\b/.test(label)) values.push("interchange_presentation");
  if (/\bDISC(?:OUNT)?\s*[16]\b|\b(?:QUAL|NQUAL|MQUAL) DISC\b|SALES DISCOUNT/.test(label)) values.push("discount_markup_presentation");
  if (/AUTHORIZATION|PRE AUTH/.test(label)) values.push("authorization");
  if (/\bAVS\b|VERIFICATION/.test(label)) values.push("verification");
  if (/ASSESSMENT|\bDUES\b/.test(label)) values.push("network_assessment");
  if (/ACQUIRER.*PROCESS|INTRNTL ACQUIRER PROCESS/.test(label)) values.push("acquirer_processing");
  if (/\bCPU\b|GATEWAY/.test(label)) values.push("gateway_cpu");
  if (/INTEGRITY|PROGRAM INTEGRITY/.test(label)) values.push("integrity_program");
  if (/\bNABU\b|NETWORK ACCESS|\bACCESS FEE\b/.test(label)) values.push("network_access");
  if (/DATA USAGE/.test(label)) values.push("data_usage");
  if (/\bLOCATION\b/.test(label)) values.push("location");
  if (/KILOBYTE|CONNECTIVITY/.test(label)) values.push("connectivity_data_units");
  if (/MONTHLY|MTHLY|STATEMENT FEE|ONLINE ACCESS FEE/.test(label)) values.push("monthly_administrative");
  return values.length > 0 ? [...new Set(values)].sort() : ["other_unclassified"];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
