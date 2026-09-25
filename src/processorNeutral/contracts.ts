/** Shadow-only contracts. A decision here cannot authorize a customer output. */
export const PROCESSOR_NEUTRAL_CONTRACT_VERSION = "processor_neutral_single_statement_v1" as const;

export type EvidenceRef = string;
export type ResolutionState = "observed" | "supported" | "candidate" | "conflicting" | "unresolved" | "not_applicable";
export type EvidenceModality = "direct_text" | "structurally_recovered" | "ocr" | "unknown";

export type DocumentIdentity = Readonly<{
  sha256: string;
  byteLength: number;
  sourceType: "pdf" | "csv";
}>;
export type PageInventory = Readonly<{
  enumerated: number | null;
  processed: number | null;
  fatalErrors: number | null;
  localTruncation: boolean | null;
  status: "complete" | "incomplete" | "unknown";
}>;
export type ExtractorLane = Readonly<{
  id: string;
  implementation: string;
  buildVersion: string;
  modelVersion: string | null;
  configHash: string | null;
  modality: EvidenceModality;
}>;
export type SourceCoordinate = Readonly<{
  pageIndex: number | null;
  rowIndex: number | null;
  tokenStart: number | null;
  tokenEnd: number | null;
  polygon: readonly [number, number][] | null;
}>;
export type SourceEvidence = Readonly<{
  id: EvidenceRef;
  laneId: string;
  rawText: string;
  normalizedText: string;
  coordinate: SourceCoordinate;
  modality: EvidenceModality;
  transformation: "unicode_typography_and_whitespace" | "none";
  legacyRef: string | null;
  conflictRefs: readonly EvidenceRef[];
}>;

export type ProtocolCandidate = Readonly<{
  grammarId: string;
  variantId: string | null;
  version: string;
  driverId: string | null;
  status: "candidate" | "resolved" | "conflicting" | "unresolved";
  evidenceRefs: readonly EvidenceRef[];
  negativeCollisionRefs: readonly EvidenceRef[];
  representationObservations: readonly Readonly<{
    witness: "card_type_representation" | "gross_refund_net_bridge";
    basis: "direct_text" | "table_structure";
    evidenceRefs: readonly EvidenceRef[];
    authority: "candidate_only";
  }>[];
  reasonCodes: readonly string[];
}>;
export type ChainRole = "merchant_facing_brand" | "statement_issuer_or_servicer" | "sponsor_bank" |
  "backend_processor" | "processing_platform" | "statement_renderer";
export type ChainRoleDecision = Readonly<{
  role: ChainRole;
  status: ResolutionState;
  value: string | null;
  competingValues: readonly string[];
  sourceRefs: readonly EvidenceRef[];
  knowledgeRelease: string | null;
  ruleId: string | null;
  limitations: readonly string[];
}>;

export type FinancialPopulation = Readonly<{
  id: string;
  meaning: string;
  periodRelation: "current" | "prior" | "mixed" | "unknown";
  signSemantics: "source_proven" | "versioned_assumption" | "unproven";
  currency: string | null;
  sourceRefs: readonly EvidenceRef[];
  duplicateGroup: string | null;
}>;
export type Assumption = Readonly<{
  id: string;
  proposition: string;
  status: "document_proven" | "versioned_variant" | "unproven" | "conflicting";
  evidenceRefs: readonly EvidenceRef[];
  dependentOutputs: readonly string[];
  ruleVersion: string;
}>;
export type AdmissionPremise = "source_integrity" | "population_binding" | "population_meaning" |
  "sign_semantics" | "period_semantics" | "duplicate_representation" |
  "independent_controls" | "output_assumptions";
export type FinancialAdmission = Readonly<{
  outputId: string;
  status: "admitted" | "withheld" | "unresolved";
  premises: Readonly<Record<AdmissionPremise, "proven" | "failed" | "unresolved" | "legacy_translated">>;
  populationIds: readonly string[];
  controlIds: readonly string[];
  evidenceRefs: readonly EvidenceRef[];
  assumptionIds: readonly string[];
  reasonCodes: readonly string[];
}>;
export type ReconciliationProof = Readonly<{
  id: string;
  populationIds: readonly string[];
  independent: boolean | null;
  result: "pass" | "pass_with_rounding" | "warning" | "fail" | "missing_input" | "not_applicable" | "rejected";
  evidenceRefs: readonly EvidenceRef[];
  tolerance: string | null;
}>;
export type OutputDecision = Readonly<{
  outputId: string;
  state: "permitted" | "limited" | "withheld";
  legacyState: "permitted" | "limited" | "withheld" | "downstream_gated";
  reasonCodes: readonly string[];
  evidenceRefs: readonly EvidenceRef[];
  assumptionIds: readonly string[];
  controlIds: readonly string[];
  policyVersion: string;
  authority: "shadow_translation_only";
}>;
export type ClaimAuthorityBoundary = Readonly<{
  consumer: "existing_claim_authority";
  inputs: readonly string[];
  decisionHash: string | null;
  mayAuthorizeFromShadow: false;
}>;
export type ProcessorNeutralRunManifest = Readonly<{
  schemaVersion: typeof PROCESSOR_NEUTRAL_CONTRACT_VERSION;
  inputSha256: string;
  extractorLanes: readonly ExtractorLane[];
  grammarReleases: readonly string[];
  chainKnowledgeRelease: string | null;
  financialPolicyVersion: string;
  outputPolicyVersion: string;
  claimAuthorityVersion: string;
  legacyRunVersion: string;
  mode: "shadow";
}>;
export type ProcessorNeutralShadow = Readonly<{
  manifest: ProcessorNeutralRunManifest;
  document: DocumentIdentity;
  pages: PageInventory;
  evidence: readonly SourceEvidence[];
  protocol: ProtocolCandidate;
  chain: readonly ChainRoleDecision[];
  populations: readonly FinancialPopulation[];
  assumptions: readonly Assumption[];
  controls: readonly ReconciliationProof[];
  financialAdmission: readonly FinancialAdmission[];
  outputs: readonly OutputDecision[];
  canonicalFinancialHash: string | null;
  claimAuthority: ClaimAuthorityBoundary;
  rollback: "omit_shadow_observer";
}>;
