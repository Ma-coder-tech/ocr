import type { CanonicalEconomicSemanticApplicationAdmission } from "../economicAnalysis.js";
import type { CanonicalRgVerifiedEvidence } from "./rgEvidenceExecution.js";
import type { CanonicalAtomicClaimFacet } from "./atomicClaims.js";

export const CURRENT_RUN_EVIDENCE_REGISTRY_SCHEMA_VERSION = "canonical_current_run_external_evidence_registry_v1" as const;
export const SEMANTIC_CONVERGENCE_SCHEMA_VERSION = "canonical_analysis_semantic_convergence_v1" as const;

export type CanonicalCurrentRunExternalEvidenceRegistry = {
  schemaVersion: typeof CURRENT_RUN_EVIDENCE_REGISTRY_SCHEMA_VERSION;
  runId: string;
  evidence: CanonicalRgVerifiedEvidence[];
  registryHash: string;
  validation: { status: "valid" | "invalid"; errors: string[] };
};

export type CanonicalSemanticApplicationDisposition = {
  applicationId: string;
  atomicClaimId: string;
  chargeRef: string;
  chargeRefs: string[];
  facet: CanonicalAtomicClaimFacet;
  sourceKind: "governed_rf_snapshot" | "current_run_verified_rg_evidence" | null;
  disposition:
    | "applied"
    | "already_resolved_by_rf"
    | "withheld_conflicting_rf_and_rg"
    | "withheld_conflicting_current_run_evidence"
    | "verified_but_unapplied_contract_insufficient"
    | "rejected_integrity_or_applicability"
    | "unresolved_no_evidence";
  semanticApplication: CanonicalEconomicSemanticApplicationAdmission | null;
  semanticApplications: CanonicalEconomicSemanticApplicationAdmission[];
  evidenceRefs: string[];
  rfEntryRefs: string[];
  reasonCodes: string[];
};

export type CanonicalSemanticConvergenceRevision = {
  schemaVersion: typeof SEMANTIC_CONVERGENCE_SCHEMA_VERSION;
  runId: string;
  revision: number;
  parentSemanticHash: string | null;
  financialFoundationHash: string;
  semanticHash: string;
  canonicalStateHash: string;
  evidenceRegistryHash: string;
  priorPlanHash: string | null;
  nextPlanHash: string | null;
  applications: CanonicalSemanticApplicationDisposition[];
  providerExecution: "not_executed_during_convergence";
  rfPromotion: "prohibited";
  financialFoundationPreserved: true;
  createdAt: string;
};
