import type { ParserDecision, ParserDriver } from "../../../parserFoundation.js";
import type { ParsedDocument } from "../../../parser.js";
import type { ReturnTypeOrNull } from "./typeUtilities.js";
import type { buildCanonicalEconomicsV2FromFiserv } from "../fiservAdapter.js";
import type { buildObservationalCanonicalPricingV2FromFiserv } from "../fiservPricingAdapter.js";
import type { buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing } from "../fiservEconomicAdapter.js";
import type { observeFiservEconomicsInCanonicalSynthesisV2 } from "../fiservSynthesisAdapter.js";
import type { composeCanonicalMerchantReportV2 } from "../report/reportHarness.js";
import type { buildSourceReadinessEnvelope } from "../evaluation/sourceReadiness.js";
import type { FiservTemplateAdmissionResolution } from "../fiservTemplateAdmission.js";
import type { FiservFullTemplateAdmissionDecision } from "../fiservFullTemplateAdmission.js";
import type {
  FiservRuntimeCapabilityAdmissionResolution,
  FiservRuntimeCapabilityProof,
} from "../fiservRuntimeCapabilityAdmission.js";
import type { CanonicalUnresolvedClaimInventory } from "./unresolvedClaims.js";
import type { CanonicalRfClaimResolution } from "./rfClaimResolution.js";
import type { CanonicalRgWorkLedger } from "./rgWorkLedger.js";
import type { CanonicalAnalysisRunAutonomousLifecycle } from "./adaptiveContinuationTypes.js";
import type { CanonicalSynthesisAdmissionContractId } from "../synthesisContractV1Types.js";

export const ANALYSIS_RUN_SCHEMA_VERSION = "canonical_analysis_run_v10";
export const ANALYSIS_RUN_IMPLEMENTATION_VERSION = "contract_v1_1_prerequisite_projection_v1";
export const ANALYSIS_RUN_POLICY_VERSION = "frozen_product_model_runtime_policy_v0_2";

export const ANALYSIS_RUN_STAGE_IDS = [
  "source_ingress",
  "capability_admission",
  "rb",
  "rc",
  "rf_resolution",
  "rd",
  "re",
  "claim_inventory",
  "rg_planning",
  "rh",
] as const;

export type AnalysisRunStageId = (typeof ANALYSIS_RUN_STAGE_IDS)[number];
export type AnalysisRunStageStatus = "pending" | "running" | "valid" | "invalid" | "unresolved" | "unsupported" | "failed";
export type AnalysisRunStatus = "running" | "completed" | "completed_with_limitations" | "unsupported" | "failed";

export type AnalysisRunStageOutcome = {
  stage: AnalysisRunStageId;
  status: AnalysisRunStageStatus;
  artifactHash: string | null;
  errors: string[];
  warnings: string[];
  limitations: string[];
};

export type AnalysisRunManifest = {
  schemaVersion: typeof ANALYSIS_RUN_SCHEMA_VERSION;
  implementationVersion: typeof ANALYSIS_RUN_IMPLEMENTATION_VERSION;
  policyVersion: typeof ANALYSIS_RUN_POLICY_VERSION;
  executionAuthority: "production_internal_canonical" | "evaluation_non_authoritative";
  customerReportAuthority: "legacy_report_unchanged";
  persistence: "durable_versioned_stage_snapshots" | "none";
  providerExecution: "durable_claim_bound_evidence_execution";
  publicResearch: "typed_search_intent_dynamic_authority_validation";
  rfProductionKnowledge: "governed_catalog_snapshot_resolution_enabled";
  rgPlanning: "durable_claim_scoped_execution_eligible";
  semanticConvergence: "current_run_exact_claim_revisioned";
  synthesisAdmissionContract: CanonicalSynthesisAdmissionContractId;
  adaptiveContinuation: "durable_deterministic_delta_admission";
  regeneratedPlanExecution: "continuation_authorized_existing_executor";
  benchmarkExecution: "disabled";
  savingsExecution: "disabled";
  businessContextAuthority: "excluded_from_canonical_economics";
  goldRuntimeAuthority: "prohibited_oracle_only";
};

export type CanonicalAnalysisArtifacts = {
  rb: ReturnTypeOrNull<typeof buildCanonicalEconomicsV2FromFiserv>;
  rc: ReturnTypeOrNull<typeof buildObservationalCanonicalPricingV2FromFiserv>;
  rfResolution: CanonicalRfClaimResolution | null;
  rd: ReturnTypeOrNull<typeof buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing>;
  re: ReturnTypeOrNull<typeof observeFiservEconomicsInCanonicalSynthesisV2>;
  unresolvedClaims: CanonicalUnresolvedClaimInventory | null;
  rgWorkLedger: CanonicalRgWorkLedger | null;
  rh: ReturnTypeOrNull<typeof composeCanonicalMerchantReportV2>;
};

export type CanonicalAnalysisRun = {
  manifest: AnalysisRunManifest;
  runId: string;
  sourceDocumentRef: string;
  sourceFingerprint: string;
  status: Exclude<AnalysisRunStatus, "running">;
  parser: {
    matched: boolean;
    driverId: string | null;
    reportable: boolean;
    decisionStatus: string;
    validationState: string;
  };
  familyStatus: "proven" | "unresolved" | "unsupported";
  capabilityProof: FiservRuntimeCapabilityProof | null;
  admission: FiservRuntimeCapabilityAdmissionResolution | null;
  knownLayoutAdmission: FiservTemplateAdmissionResolution | null;
  fullFamilyDecision: FiservFullTemplateAdmissionDecision | null;
  readiness: ReturnTypeOrNull<typeof buildSourceReadinessEnvelope>;
  artifacts: CanonicalAnalysisArtifacts;
  stageOutcomes: Record<AnalysisRunStageId, AnalysisRunStageOutcome>;
  canonicalTruthHash: string | null;
  financialFoundationHash: string | null;
  semanticHash: string | null;
  canonicalStateHash: string | null;
  semanticRevision: number;
  autonomousLifecycle: CanonicalAnalysisRunAutonomousLifecycle;
  canonicalTruthPreserved: true;
  limitations: string[];
};

export type CanonicalAnalysisRunDiagnostics = {
  document: ParsedDocument;
  driver: ParserDriver | null;
  parserOutput: Record<string, any> | null;
  decision: (ParserDecision & Record<string, unknown>) | null;
  identity: Record<string, any>;
  selected: Record<string, any>;
  observed: {
    processedSalesMinor: number | null;
    processingFeesMinor: number | null;
    effectiveRate: number | null;
    grossSaleTransactionCount: number | null;
    submittedTransactionCount: number | null;
    averageTicketMinor: number | null;
  };
  statementCompleteness: "complete" | "incomplete" | "unknown" | "unavailable";
  suppliedDocument: {
    status: "complete_supplied_document" | "incomplete_or_corrupt_supplied_document" | "unknown";
    openedSuccessfully: boolean;
    enumeratedPageCount: number;
    processedPageCount: number;
    fatalPageErrorCount: number;
    extractionLineageComplete: boolean;
    localIngestionTruncated: boolean;
  };
  profile: { statementCompleteness?: "complete" | "incomplete" | "unknown" | "unavailable"; humanReviewRequired?: boolean };
  provenance: "observational";
  authority: "observational";
  observationalFoundation: ReturnTypeOrNull<typeof buildCanonicalEconomicsV2FromFiserv>;
};

export type CanonicalAnalysisRunExecution = {
  run: CanonicalAnalysisRun;
  diagnostics: CanonicalAnalysisRunDiagnostics;
};

export type AnalysisRunStageObserver = {
  stageStarted?(stage: AnalysisRunStageId, input: { claimRef: string; evidenceObjective: string; expectedDecisionEffect: string }): void;
  stageFinished?(stage: AnalysisRunStageId, outcome: AnalysisRunStageOutcome, artifact: unknown): void;
};
