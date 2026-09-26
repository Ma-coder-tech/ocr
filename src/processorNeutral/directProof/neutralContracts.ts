import type { ParsedDocument } from "../../parser.js";
import type { SourceEvidence } from "../contracts.js";
import type { DirectControl, PremiseDecision, ProofState } from "./types.js";

/** Research-only v1 boundary. Observations state what an extractor emitted, not what a table means. */
export type EvidencePacket = Readonly<{
  version: "family_neutral_evidence_v1";
  sourceSha256: string;
  sourceKind: "pdf_bytes" | "synthetic_mutation";
  byteLength: number | null;
  pageInventory: Readonly<{ enumerated: number | null; processed: number | null;
    fatalErrors: number | null; truncated: boolean | null }>;
  lanes: readonly Readonly<{ id: string; implementation: string; version: string;
    modality: "direct_text" | "ocr" | "structurally_recovered" }> [];
  /** Existing structured rows retain their stable identifiers for compatibility. */
  rows: readonly SourceEvidence[];
  /** Raw PDF.js text items. A position is only an observed PDF coordinate, not a table cell. */
  tokens: readonly Readonly<{ id: string; laneId: string; pageIndex: number;
    itemIndex: number; rawText: string; normalizedText: string;
    geometry: Readonly<{ coordinateSpace: "pdfjs_text_content";
      textTransform: readonly [number, number, number, number, number, number];
      width: number; height: number }> | null;
    transform: "none" | "unicode_typography_and_whitespace";
    conflictRefs: readonly string[] }> [];
  /** Explicit associations only; absent associations are never inferred from proximity. */
  relations: readonly Readonly<{ kind: "derived_from" | "same_cell" | "same_table";
    from: string; to: string; laneId: string }> [];
}>;

export type SemanticFactProposal = Readonly<{
  id: string;
  meaning: string;
  population: Readonly<{ scope: string;
    /** Printed header context does not establish when fees were earned or posted. */
    period: Readonly<{ printedContext: "statement" | "unknown";
      start: string | null; end: string | null; evidenceRefs: readonly string[];
      economicCoverage: "versioned_same_period" | "unresolved";
      activityCompatibility: "unresolved" | "not_applicable" }>;
    signConvention: string; currency: string | null;
    completeness: "bounded" | "unproven";
    occurrenceCompleteness: "not_applicable" | "unproven";
    representation: "single" | "deduplicated" | "unresolved" }>;
  amountMinor: number | null;
  unit: "printed_dollar" | "ratio" | null;
  premises: readonly PremiseDecision[];
  evidenceRefs: readonly string[];
  controlRefs: readonly string[];
  assumptionIds: readonly string[];
  reasonCodes: readonly string[];
}>;

/** Packages may parse different printed pagination grammars; the core checks page coverage. */
export type PageSequenceProposal = Readonly<{
  expectedPages: number;
  markers: readonly Readonly<{ pageIndex: number; printedPage: number; printedTotal: number;
    evidenceRefs: readonly string[] }> [];
}>;

export type NeutralProtocolPackage = Readonly<{
  id: string;
  version: string;
  probe: (packet: EvidencePacket) => Readonly<{ status: "candidate" | "unresolved";
    evidenceRefs: readonly string[] }>;
  evaluate: (input: Readonly<{ document: ParsedDocument; packet: EvidencePacket }>) => Readonly<{
    protocolStatus: "candidate" | "resolved" | "unresolved" | "conflicting";
    protocolEvidenceRefs: readonly string[];
    reasonCodes: readonly string[];
    statementPeriod: Readonly<{ state: ProofState; start: string | null; end: string | null;
      evidenceRefs: readonly string[]; reasonCodes: readonly string[] }>;
    controls: readonly DirectControl[];
    facts: readonly SemanticFactProposal[];
    pageSequence?: PageSequenceProposal;
    assumptions: readonly Readonly<{ id: string; state: "versioned_protocol" | "unresolved" | "conflicting";
      evidenceRefs: readonly string[]; dependentOutputs: readonly string[] }> [];
    diagnostics: Readonly<Record<string, unknown>>;
  }>;
}>;

export type NeutralProofRun = Readonly<{
  version: "family_neutral_protocol_proof_v2";
  inputSha256: string;
  evidence: EvidencePacket;
  documentClass: Readonly<{ kind: "merchant_processing_statement" | "deposit_account_statement" | "unknown";
    status: "candidate" | "ambiguous" | "unresolved"; evidenceRefs: readonly string[] }>;
  routing: Readonly<{ status: "selected" | "unknown_protocol" | "ambiguous" | "non_merchant";
    selectedId: string | null; candidates: readonly Readonly<{ id: string; version: string;
      status: "candidate" | "unresolved"; evidenceRefs: readonly string[] }> []; authority: "none" }>;
  sourceIntegrity: Readonly<{ suppliedArtifact: ProofState; statementPages: ProofState;
    expectedPages: number | null; observedPages: readonly number[]; evidenceRefs: readonly string[];
    reasonCodes: readonly string[] }>;
  protocol: Readonly<{ id: string | null; status: "candidate" | "resolved" | "unresolved" | "conflicting";
    evidenceRefs: readonly string[]; reasonCodes: readonly string[] }>;
  statementPeriod: Readonly<{ state: ProofState; start: string | null; end: string | null;
    evidenceRefs: readonly string[]; reasonCodes: readonly string[] }>;
  controls: readonly DirectControl[];
  facts: readonly (SemanticFactProposal & Readonly<{ proofId: string;
    state: "proven" | "withheld"; amountMinor: number | null;
    unit: "printed_dollar" | "ratio" | null }>)[];
  assumptions: readonly Readonly<{ id: string; state: "versioned_protocol" | "unresolved" | "conflicting";
    evidenceRefs: readonly string[]; dependentOutputs: readonly string[] }> [];
  diagnostics: Readonly<Record<string, unknown>>;
  backendProcessor: null;
  customerAuthority: "none_shadow_only";
  currentCustomerPermissions: "unchanged";
}>;
