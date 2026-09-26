import type { SourceEvidence } from "../contracts.js";

export const DIRECT_PROOF_VERSION = "processor_neutral_direct_proof_architecture_v3" as const;

export const DIRECT_PREMISES = [
  "input_integrity", "statement_page_completeness", "document_kind", "section_binding",
  "population_meaning", "period_meaning", "sign_semantics", "currency_unit",
  "representation_deduplication", "detail_completeness", "arithmetic",
  "independent_control", "operand_compatibility",
] as const;
export type DirectPremise = (typeof DIRECT_PREMISES)[number];
export type ProofState = "proven" | "unresolved" | "conflicting" | "not_applicable";
export type PremiseDecision = Readonly<{
  premise: DirectPremise;
  state: ProofState;
  basis: "direct_source" | "versioned_protocol_assumption" | "unresolved" | "not_applicable";
  assumptionId: string | null;
  reasonCode: string;
  evidenceRefs: readonly string[];
  controlRefs: readonly string[];
}>;
export type DirectControl = Readonly<{
  id: string;
  kind: "detail_sum" | "cross_section_equality" | "semantic_equation" | "component_sum";
  status: "pass" | "fail" | "unresolved";
  independent: boolean;
  independenceBasis: "distinct_source_rows_same_extraction_lane" | "same_source_row" | "unproven";
  inputRefs: readonly string[];
  targetRef: string | null;
  expectedMinor: number | null;
  observedMinor: number | null;
  reasonCode: string;
}>;
export type DirectOutput = Readonly<{
  id: string;
  state: "proven" | "withheld";
  amountMinor: number | null;
  unit: "printed_dollar" | "ratio" | null;
  premises: readonly PremiseDecision[];
  evidenceRefs: readonly string[];
  controlRefs: readonly string[];
  reasonCodes: readonly string[];
  customerAuthority: "none_shadow_only";
}>;
export type DirectProofRun = Readonly<{
  version: typeof DIRECT_PROOF_VERSION;
  documentClass: {
    ruleVersion: "document_class_candidate_v1";
    kind: "merchant_processing_statement" | "deposit_account_statement" | "unknown";
    status: "candidate" | "ambiguous" | "unresolved";
    evidenceRefs: readonly string[];
    reasonCodes: readonly string[];
    authority: "routing_hint_only";
  };
  routing: {
    ruleVersion: "protocol_router_v1";
    status: "selected" | "unknown_protocol" | "ambiguous" | "non_merchant";
    candidates: readonly Readonly<{ id: string; version: string;
      status: "candidate" | "unresolved"; evidenceRefs: readonly string[] }>[];
    selectedId: string | null;
    reasonCodes: readonly string[];
    authority: "none";
  };
  inputSha256: string;
  sourceKind: "pdf_bytes" | "synthetic_mutation";
  provenance: {
    extractionLane: "pdfjs_current" | "csv_current";
    extractorVersion: string;
    parsedDocumentSha256: string;
    inputBytesHashVerified: boolean;
    parseBoundToInputBytes: boolean;
    sourceCoordinateScope: "page_and_extracted_row_only";
    tokenSpansAvailable: false;
    geometryAvailable: false;
    independentExtractionLaneAvailable: false;
  };
  sourceIntegrity: {
    suppliedArtifact: ProofState;
    statementPages: ProofState;
    expectedPages: number | null;
    observedPages: readonly number[];
    evidenceRefs: readonly string[];
    reasonCodes: readonly string[];
  };
  statementPeriod: {
    state: ProofState;
    start: string | null;
    end: string | null;
    evidenceRefs: readonly string[];
    reasonCodes: readonly string[];
  };
  periodCompatibility: {
    cardActivityStatementContext: ProofState;
    feeSectionStatementContext: ProofState;
    ratioOperands: ProofState;
    evidenceRefs: readonly string[];
    reasonCodes: readonly string[];
  };
  feeInventory: {
    observedFeeRows: readonly string[];
    boundedComponentRows: readonly string[];
    boundedSubtotal: ProofState;
    completeOccurrences: ProofState;
    reasonCodes: readonly string[];
  };
  assumptions: readonly Readonly<{
    id: string;
    proposition: string;
    state: "versioned_protocol" | "unresolved" | "conflicting";
    ruleVersion: string;
    evidenceRefs: readonly string[];
    dependentOutputs: readonly string[];
  }>[];
  protocol: {
    id: string | null;
    status: "candidate" | "resolved" | "unresolved" | "conflicting";
    evidenceRefs: readonly string[];
    reasonCodes: readonly string[];
  };
  chain: {
    backendProcessor: { status: "unresolved" | "conflicting"; value: null;
      competingValues: readonly string[]; knowledgeRelease: null };
    merchantFacingBrand: { status: "candidate" | "unresolved"; value: string | null };
    knowledgeRelease: null;
  };
  evidence: readonly SourceEvidence[];
  controls: readonly DirectControl[];
  outputs: readonly DirectOutput[];
  currentCustomerPermissions: "unchanged";
}>;

/** Package results are shadow proposals; the generic orchestrator adds class/routing and validates authority. */
export type PackageProofRun = Omit<DirectProofRun, "documentClass" | "routing">;

export type BoundAmount = Readonly<{
  minor: number;
  ref: string;
  printedUnit: "dollar_symbol" | "unmarked";
  printedSign: "positive" | "negative" | "zero";
}>;
export type BoundCardTable = Readonly<{
  schemaRefs: readonly string[];
  sectionRef: string;
  totalRef: string;
  gross: BoundAmount;
  refunds: BoundAmount;
  net: BoundAmount;
  detailRows: readonly Readonly<{ ref: string; cardType: string; gross: BoundAmount;
    refunds: BoundAmount; net: BoundAmount }>[];
  detailComplete: boolean;
  duplicateRepresentation: boolean;
  reasonCodes: readonly string[];
}>;
export type BoundFeeComposition = Readonly<{
  sectionRef: string;
  aggregate: BoundAmount;
  components: readonly Readonly<{ kind: string; amount: BoundAmount }>[];
  componentSetComplete: boolean;
  duplicateRepresentation: boolean;
  reasonCodes: readonly string[];
}>;
export type ProtocolBindings = Readonly<{
  documentKind: { state: ProofState; reasonCode: string; evidenceRefs: readonly string[] };
  protocolEvidenceRefs: readonly string[];
  cardSectionCandidateCount: number;
  summaryVolume: readonly BoundAmount[];
  summaryFees: readonly BoundAmount[];
  cardTables: readonly BoundCardTable[];
  feeCompositions: readonly BoundFeeComposition[];
  unboundCardCandidates: readonly string[];
  reasonCodes: readonly string[];
}>;
