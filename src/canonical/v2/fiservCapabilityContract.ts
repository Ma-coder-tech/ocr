import type { ParsedDocument } from "../../parser.js";

export const SUPPORTED_FISERV_PROTOCOL_ID = "supported_fiserv_statement_protocol_family" as const;
export const FISERV_PROTOCOL_IDENTITY_RULE_VERSION = "fiserv_protocol_route_a_v1" as const;
export const FISERV_CAPABILITY_CONTRACT_VERSION = "supported_fiserv_capability_contract_v1_0" as const;

export const FISERV_SUPPORT_STATES = [
  "supported_full",
  "supported_limited",
  "recognized_but_insufficient",
  "unsupported_document_class",
  "unreadable_or_incomplete",
] as const;

export type FiservSupportState = (typeof FISERV_SUPPORT_STATES)[number];

export const FISERV_OUTPUT_IDS = [
  "statement_period_source_identity",
  "net_submitted_volume",
  "total_processing_fees",
  "headline_effective_rate",
  "gross_sales_refunds",
  "transaction_count",
  "average_ticket",
  "partial_fee_inventory",
  "complete_fee_inventory",
  "partial_fee_composition",
  "complete_fee_composition",
  "funding_batch_analysis",
  "pricing_architecture",
  "economic_roles",
  "recurrence",
  "savings_impact",
  "merchant_action",
] as const;

export type FiservOutputId = (typeof FISERV_OUTPUT_IDS)[number];
export type FiservOutputPermission = {
  output: FiservOutputId;
  state: "permitted" | "limited" | "withheld" | "downstream_gated";
  prerequisiteCapabilities: string[];
  reasonCodes: string[];
};

export type FiservNormalizedProtocolObservation = {
  id: string;
  evidenceClass: "source_observed_origin" | "structural_protocol_signature" | "financial_relationship_signature"
    | "representation_signature" | "artifact_lineage";
  feature: string;
  sourceSemanticRole: "statement_issuer_provider" | "merchant_services_provider" | "processing_platform_origin"
    | "legal_provider_footer" | "remittance_support_provider_block" | null;
  evidenceRef: string;
  pageNumber: number | null;
  rowIndex: number;
};

export type FiservCandidateExtractionAssessment = {
  schemaVersion: "fiserv_candidate_extraction_assessment_v1";
  eligible: boolean;
  evidenceRefs: string[];
  reasonCodes: string[];
};

export type FiservProtocolIdentityDecision = {
  schemaVersion: "fiserv_protocol_identity_decision_v1";
  target: typeof SUPPORTED_FISERV_PROTOCOL_ID;
  ruleVersion: typeof FISERV_PROTOCOL_IDENTITY_RULE_VERSION;
  route: "route_a_origin_plus_protocol" | "none";
  status: "proven" | "unresolved";
  observations: FiservNormalizedProtocolObservation[];
  proofEvidenceRefs: string[];
  reasonCodes: string[];
  negativeCollisionGuard: "pass" | "fail";
  contradictoryOriginEvidenceRefs: string[];
};

type RowObservation = {
  content: string;
  rowIndex: number;
  pageNumber: number | null;
  evidenceRef: string;
};

/*
 * These are admitted source-observed ecosystem/origin indicators for Route A.
 * Their presence has zero authority without every mandatory structural feature.
 */
const ROUTE_A_ORIGIN_TERMS: ReadonlyArray<[string, RegExp]> = [
  ["fiserv_origin", /\bfiserv\b/i],
  ["first_data_origin", /\bfirst\s+data\b/i],
  ["clover_origin", /\bclover\b/i],
];

const ROUTE_A_ORIGIN_CONTEXTS: ReadonlyArray<[
  NonNullable<FiservNormalizedProtocolObservation["sourceSemanticRole"]>, RegExp,
]> = [
  ["statement_issuer_provider", /\b(?:statement\s+(?:issuer|provider)|issued\s+by|statement\s+provided\s+by)\b/i],
  ["merchant_services_provider", /\bmerchant\s+services(?:\s+provider)?\b/i],
  ["processing_platform_origin", /\b(?:processing\s+(?:provider|platform|origin)|platform\s+origin|processor\s+provider)\b/i],
  ["legal_provider_footer", /(?:©|\bcopyright\b|\blegal\s+provider\b|\ball\s+rights\s+reserved\b)/i],
  ["remittance_support_provider_block", /\b(?:remittance|remit\s+to|customer\s+service|provider\s+support|support\s+provider)\b/i],
];

const STRUCTURAL_FEATURE_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["statement_scope", /\byour\s+card\s+processing\s+statement\b/i],
  ["submitted_population", /\btotal\s+(?:amount\s+)?submitted\b|\bamounts?\s+submitted\b/i],
  ["processing_fee_total", /\btotal\s+(?:processing\s+)?fees?\b|\bfees?\s+charged\b|\btotal\s*\([^)]*(?:service\s+charges|interchange)[^)]*fees?[^)]*\)/i],
  ["funding_or_cost_bridge", /\btotal\s+(?:amount\s+)?(?:funded|processed)\b|\bservice\s+charges\b|\binterchange\s+charges(?:\s*\/\s*program\s+fees)?\b/i],
];

const FINANCIAL_RELATIONSHIP_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["gross_refund_net_population_bridge",
    /\btotal\s+(?:gross\s+)?sales\s+you\s+submitted\b.*\brefunds\b.*\btotal\s+amount\s+you\s+submitted\b/i],
];

const REPRESENTATION_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["card_type_population_representation", /\bsummary\s+by\s+card\s+type\b/i],
];

const GENERIC_EXTRACTION_ANCHORS: RegExp[] = [
  /\bstatement\s+period\b/i,
  /\btotal\s+(?:amount\s+)?submitted\b/i,
  /\btotal\s+(?:processing\s+)?fees?\b|\bfees?\s+charged\b/i,
  /\btotal\s+(?:amount\s+)?(?:funded|processed)\b/i,
  /\bservice\s+charges\b|\binterchange\s+charges\b/i,
];

export function assessFiservCandidateExtraction(document: ParsedDocument): FiservCandidateExtractionAssessment {
  const rows = normalizedRows(document);
  const anchorRows = rows.filter((row) => GENERIC_EXTRACTION_ANCHORS.some((pattern) => pattern.test(row.content)));
  const basysHintRows = rows.filter((row) => /\bbasys(?:pro)?\b/i.test(row.content));
  const extractionUsable = document.extraction.mode !== "unusable" && document.extraction.hasExtractableText;
  const eligible = document.sourceType === "pdf" && extractionUsable && unique(anchorRows.map((row) => row.evidenceRef)).length >= 2;
  return {
    schemaVersion: "fiserv_candidate_extraction_assessment_v1",
    eligible,
    evidenceRefs: unique([...anchorRows, ...basysHintRows].map((row) => row.evidenceRef)),
    reasonCodes: unique([
      document.sourceType === "pdf" ? "pdf_document_class_candidate" : "non_pdf_document_class",
      extractionUsable ? "extractable_source_text" : "source_text_unusable",
      anchorRows.length >= 2 ? "multiple_financial_structure_anchors" : "financial_structure_anchors_insufficient",
      ...(basysHintRows.length > 0 ? ["basys_ecosystem_hint_zero_support_authority"] : []),
      "candidate_eligibility_confers_zero_support_authority",
    ]),
  };
}

export function adjudicateSupportedFiservProtocolIdentity(document: ParsedDocument): FiservProtocolIdentityDecision {
  const rows = normalizedRows(document);
  const observations: FiservNormalizedProtocolObservation[] = [];
  for (const [feature, pattern] of ROUTE_A_ORIGIN_TERMS) {
    const qualified = rows.map((row) => ({ row, role: originContextRole(row.content) }))
      .find((candidate) => candidate.role !== null && pattern.test(candidate.row.content));
    if (qualified?.role) observations.push(observation("source_observed_origin", feature, qualified.row, qualified.role));
  }
  const omahaOriginAddress = rows.find((candidate) => /\bpo\s+box\s+2394\b.*\bomaha\b.*\b68103-2394\b/i.test(candidate.content));
  const omahaOriginService = rows.find((candidate) => /\b(?:phone|customer\s+service|support)\b.*\b1-877-273-8191\b/i.test(candidate.content));
  if (omahaOriginAddress && omahaOriginService && omahaOriginAddress.pageNumber === omahaOriginService.pageNumber
    && Math.abs(omahaOriginAddress.rowIndex - omahaOriginService.rowIndex) <= 12) {
    observations.push(observation("source_observed_origin", "fiserv_omaha_statement_origin_address", omahaOriginAddress,
      "remittance_support_provider_block"));
    observations.push(observation("source_observed_origin", "fiserv_omaha_statement_origin_service", omahaOriginService,
      "remittance_support_provider_block"));
  }
  const processorStatementService = rows.find((candidate) =>
    /\b(?:customer\s+service|provider\s+support|support\s+provider)\b.*\b1-888-781-0404\b/i.test(candidate.content));
  if (processorStatementService) {
    observations.push(observation("source_observed_origin", "fiserv_processor_statement_service_origin", processorStatementService,
      "remittance_support_provider_block"));
  }
  for (const [feature, pattern] of STRUCTURAL_FEATURE_PATTERNS) {
    const row = rows.find((candidate) => pattern.test(candidate.content));
    if (row) observations.push(observation("structural_protocol_signature", feature, row));
  }
  for (const [feature, pattern] of FINANCIAL_RELATIONSHIP_PATTERNS) {
    const row = rows.find((candidate) => pattern.test(candidate.content));
    if (row) observations.push(observation("financial_relationship_signature", feature, row));
  }
  for (const [feature, pattern] of REPRESENTATION_PATTERNS) {
    const row = rows.find((candidate) => pattern.test(candidate.content));
    if (row) observations.push(observation("representation_signature", feature, row));
  }
  const integrity = suppliedArtifactLineageIntact(document);
  if (integrity) {
    observations.push({
      id: "protocol_observation_artifact_lineage",
      evidenceClass: "artifact_lineage",
      feature: "complete_supplied_artifact_lineage",
      evidenceRef: "document_integrity:complete_supplied_document",
      sourceSemanticRole: null,
      pageNumber: null,
      rowIndex: -1,
    });
  }
  const origin = observations.filter((item) => item.evidenceClass === "source_observed_origin");
  const structures = new Set(observations
    .filter((item) => item.evidenceClass === "structural_protocol_signature")
    .map((item) => item.feature));
  const mandatoryStructure = STRUCTURAL_FEATURE_PATTERNS.every(([feature]) => structures.has(feature));
  const financialRelationships = new Set(observations
    .filter((item) => item.evidenceClass === "financial_relationship_signature")
    .map((item) => item.feature));
  const mandatoryFinancialRelationships = FINANCIAL_RELATIONSHIP_PATTERNS.every(([feature]) => financialRelationships.has(feature));
  const representations = new Set(observations
    .filter((item) => item.evidenceClass === "representation_signature")
    .map((item) => item.feature));
  const mandatoryRepresentations = REPRESENTATION_PATTERNS.every(([feature]) => representations.has(feature));
  const contradictoryOriginEvidenceRefs: string[] = [];
  const negativeCollisionGuard = origin.length > 0 && mandatoryStructure && mandatoryFinancialRelationships
    && mandatoryRepresentations ? "pass" as const : "fail" as const;
  const proven = origin.length > 0 && mandatoryStructure && mandatoryFinancialRelationships && mandatoryRepresentations
    && integrity && negativeCollisionGuard === "pass";
  return {
    schemaVersion: "fiserv_protocol_identity_decision_v1",
    target: SUPPORTED_FISERV_PROTOCOL_ID,
    ruleVersion: FISERV_PROTOCOL_IDENTITY_RULE_VERSION,
    route: proven ? "route_a_origin_plus_protocol" : "none",
    status: proven ? "proven" : "unresolved",
    observations,
    proofEvidenceRefs: proven ? unique(observations.map((item) => item.evidenceRef)) : [],
    reasonCodes: unique([
      origin.length > 0 ? "admitted_source_observed_origin_present" : "admitted_source_observed_origin_missing",
      mandatoryStructure ? "mandatory_protocol_structure_present" : "mandatory_protocol_structure_missing",
      mandatoryFinancialRelationships ? "mandatory_financial_relationship_signature_present"
        : "mandatory_financial_relationship_signature_missing",
      mandatoryRepresentations ? "mandatory_representation_signature_present" : "mandatory_representation_signature_missing",
      integrity ? "artifact_lineage_intact" : "artifact_lineage_not_intact",
      negativeCollisionGuard === "pass" ? "negative_collision_guard_passed" : "negative_collision_guard_failed",
      "brand_parser_adapter_mapping_and_filename_have_zero_independent_authority",
      "structural_only_route_b_not_designated_for_v1",
    ]),
    negativeCollisionGuard,
    contradictoryOriginEvidenceRefs,
  };
}

export function addNormalizedFiservProtocolEvidence(
  document: ParsedDocument,
  parserOutput: Record<string, any>,
): Record<string, any> {
  const evidence = Array.isArray(parserOutput.evidence) ? [...parserOutput.evidence] : [];
  const decision = adjudicateSupportedFiservProtocolIdentity(document);
  for (const item of decision.observations.filter((candidate) => candidate.rowIndex >= 0)) {
    const row = document.rows[item.rowIndex] ?? {};
    evidence.push({
      field: "protocolEvidence",
      sourceSection: "PROTOCOL_IDENTITY",
      pageNumber: item.pageNumber,
      lineIndex: item.rowIndex,
      evidenceLine: String(row.content ?? "").trim(),
      value: item.feature,
    });
  }
  return { ...parserOutput, evidence };
}

function normalizedRows(document: ParsedDocument): RowObservation[] {
  return document.rows.map((row, rowIndex) => {
    const pageMatch = String(row.page ?? "").match(/page-(\d+)/i);
    const pageNumber = pageMatch ? Number(pageMatch[1]) : null;
    return {
      content: String(row.content ?? Object.values(row).join(" | ")).replace(/\s+/g, " ").trim(),
      rowIndex,
      pageNumber,
      evidenceRef: `document_row:${pageNumber ?? "unknown"}:${rowIndex}`,
    };
  }).filter((row) => row.content.length > 0);
}

function observation(
  evidenceClass: FiservNormalizedProtocolObservation["evidenceClass"],
  feature: string,
  row: RowObservation,
  sourceSemanticRole: FiservNormalizedProtocolObservation["sourceSemanticRole"] = null,
): FiservNormalizedProtocolObservation {
  return {
    id: `protocol_observation_${evidenceClass}_${feature}`,
    evidenceClass,
    feature,
    sourceSemanticRole,
    evidenceRef: row.evidenceRef,
    pageNumber: row.pageNumber,
    rowIndex: row.rowIndex,
  };
}

function originContextRole(content: string): FiservNormalizedProtocolObservation["sourceSemanticRole"] {
  return ROUTE_A_ORIGIN_CONTEXTS.find(([, pattern]) => pattern.test(content))?.[0] ?? null;
}

function suppliedArtifactLineageIntact(document: ParsedDocument): boolean {
  const integrity = document.suppliedDocumentIntegrity;
  return Boolean(document.extraction.mode !== "unusable"
    && document.extraction.hasExtractableText
    && integrity?.openedSuccessfully
    && integrity.enumeratedPageCount === integrity.processedPageCount
    && integrity.fatalPageErrorCount === 0
    && integrity.extractionLineageComplete
    && !integrity.localIngestionTruncated);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
