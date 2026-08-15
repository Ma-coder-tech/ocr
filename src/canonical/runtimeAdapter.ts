import { buildCanonicalStatementFactsFromParsedDocument } from "./buildCanonicalFacts.js";
import {
  buildCanonicalAiAdmissionAudit,
  passedDiagnosticSignals,
  type CanonicalAiAdmissionAudit,
} from "./aiAdmissionDiagnostics.js";
import { buildCanonicalAiCapabilities } from "./buildCanonicalAiCapabilities.js";
import { buildCanonicalCustomerState } from "./customerStateResolver.js";
import {
  buildRuntimeAiCapabilityHarnessInputs,
  type CanonicalRuntimeWholeStatementFeeIntelligenceReview,
  type RuntimeAiCapabilitySnapshot,
} from "./runtimeAiCapabilityAdapter.js";
import {
  runWholeStatementFeeIntelligenceRuntimeWithContext,
  type WholeStatementFeeIntelligenceRuntimeOptions,
} from "./wholeStatementFeeIntelligenceRuntime.js";
import {
  addDeterministicAnomalySubstitution,
  buildDeterministicRuntimeSafetyReview,
} from "./deterministicRuntimeSafetyReview.js";
import { validateCanonicalStatementAnalysis } from "./validate.js";
import { buildCanonicalMerchantAttentionModel } from "./merchantAttention.js";
import type { BusinessTypeId } from "../businessTypes.js";
import type { CanonicalBusinessProfileInput } from "./businessQualification.js";
import type { ParsedDocument } from "../parser.js";
import type { AnalysisSummary } from "../types.js";
import type {
  CanonicalAiCapabilityHarnessInput,
} from "./buildCanonicalAiCapabilities.js";
import type {
  CanonicalAiCapabilityStatus,
  CanonicalAiWholeStatementFeeIntelligenceOutput,
  CanonicalStatementAnalysis,
} from "./types.js";
import type { FeeKnowledgeIntelligenceRecord } from "./feeKnowledgeTypes.js";

export type CanonicalRuntimeInputAdmissionStatus =
  | "canonical_evidence"
  | "provisional_with_limitation"
  | "diagnostic_only"
  | "rejected"
  | "unavailable";

export type CanonicalRuntimeInputAdmission = {
  input: string;
  status: CanonicalRuntimeInputAdmissionStatus;
  canonicalUse: string;
  reasonCode: string;
};

export const CANONICAL_RUNTIME_INPUT_ADMISSION_TABLE: readonly CanonicalRuntimeInputAdmission[] = [
  {
    input: "parsed_document_rows_and_extraction_diagnostics",
    status: "canonical_evidence",
    canonicalUse: "Canonical fact construction, evidence availability, and fee-row source support.",
    reasonCode: "transient_parser_document_ir_available",
  },
  {
    input: "runtime_business_type",
    status: "provisional_with_limitation",
    canonicalUse: "Merchant-selected declaration input only; it remains distinct from account MCC and cannot create savings authority.",
    reasonCode: "business_context_limited",
  },
  {
    input: "canonical_business_profile",
    status: "canonical_evidence",
    canonicalUse: "Merchant declaration, optional confirmation, and U.S. product-scope context for Package 1 business qualification.",
    reasonCode: "business_qualification_input_v1",
  },
  {
    input: "opaque_runtime_document_ref",
    status: "diagnostic_only",
    canonicalUse: "Shadow correlation only; not customer identity and not canonical evidence.",
    reasonCode: "opaque_runtime_reference",
  },
  {
    input: "legacy_core_totals",
    status: "diagnostic_only",
    canonicalUse: "Structural shadow comparison only; canonical totals must reconstruct from canonical evidence.",
    reasonCode: "legacy_totals_not_canonical_truth",
  },
  {
    input: "legacy_savings_totals",
    status: "rejected",
    canonicalUse: "Never admitted as canonical opportunity or financial truth.",
    reasonCode: "legacy_savings_rejected",
  },
  {
    input: "fiserv_master_savings",
    status: "rejected",
    canonicalUse: "Never admitted as a component or summary; Package E summaries compute from components only.",
    reasonCode: "master_savings_rejected",
  },
  {
    input: "legacy_structured_findings",
    status: "rejected",
    canonicalUse: "May be compared structurally, but cannot create canonical eligibility, cadence, target, or inclusion.",
    reasonCode: "legacy_findings_rejected",
  },
  {
    input: "legacy_processor_hidden_markup_amounts",
    status: "rejected",
    canonicalUse: "Never admitted as canonical observed amount, target, spread, or opportunity.",
    reasonCode: "legacy_markup_amounts_rejected",
  },
  {
    input: "legacy_benchmark_savings",
    status: "rejected",
    canonicalUse: "Never admitted as canonical eligible savings; directional benchmark remains verification-only unless approved by registry.",
    reasonCode: "legacy_benchmark_savings_rejected",
  },
  {
    input: "ai_generated_amounts",
    status: "rejected",
    canonicalUse: "Never admitted as canonical observed amounts, targets, cadence, ownership, calculations, or totals.",
    reasonCode: "ai_amounts_rejected",
  },
  {
    input: "report_v1_totals_or_state",
    status: "rejected",
    canonicalUse: "Report V1 is downstream legacy projection and cannot feed canonical truth.",
    reasonCode: "report_v1_rejected",
  },
  {
    input: "visible_string_amounts",
    status: "rejected",
    canonicalUse: "Display strings are not admissible canonical financial evidence.",
    reasonCode: "visible_strings_rejected",
  },
  {
    input: "fee_breakdown_aliases_without_canonical_source_identity",
    status: "rejected",
    canonicalUse: "Legacy fee aliases cannot create canonical fee rows or duplicate charges.",
    reasonCode: "fee_aliases_rejected",
  },
  {
    input: "approved_package_e_runtime_opportunity_inputs",
    status: "unavailable",
    canonicalUse: "No approved runtime opportunity-input source exists in H1.",
    reasonCode: "runtime_opportunity_inputs_unavailable",
  },
  {
    input: "runtime_ai_capability_status_metadata",
    status: "diagnostic_only",
    canonicalUse: "Package F readiness only; never canonical facts, fee rows, targets, cadence, calculations, opportunities, Report V1, or customer output.",
    reasonCode: "runtime_ai_readiness_adapter",
  },
] as const;

export type CanonicalRuntimeAdapterInput = {
  document: ParsedDocument;
  businessType: BusinessTypeId;
  runtimeDocumentRef: string;
  legacySummary?: AnalysisSummary | null;
  businessProfile?: CanonicalBusinessProfileInput | null;
  wholeStatementFeeIntelligence?: WholeStatementFeeIntelligenceRuntimeOptions;
};

export type CanonicalRuntimeAdapterResult = {
  analysis: CanonicalStatementAnalysis;
  aiAdmissionAudit: CanonicalAiAdmissionAudit;
  inputAdmission: CanonicalRuntimeInputAdmission[];
  runtimeAiCapabilitySnapshots: RuntimeAiCapabilitySnapshot[];
};

export function buildCanonicalRuntimeAnalysis(input: CanonicalRuntimeAdapterInput): CanonicalRuntimeAdapterResult {
  const document = cloneJson(input.document);
  const businessType = input.businessType;
  const runtimeDocumentRef = opaqueRuntimeRef(input.runtimeDocumentRef);
  const legacySummary = cloneJson(input.legacySummary ?? null);

  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, {
    businessType,
    businessProfile: runtimeBusinessProfile(input.businessProfile, businessType),
    sourceAnalysisId: runtimeDocumentRef,
    sourceFileName: null,
  });
  const runtimeAi = buildRuntimeAiCapabilityHarnessInputs({
    summary: legacySummary,
    analysis,
  });
  const deterministicRuntimeSafetyReview = buildDeterministicRuntimeSafetyReview({
    analysis,
    runtimeAiCapabilitySnapshots: runtimeAi.snapshots,
  });
  const harnessInputs = addDeterministicAnomalySubstitution({
    harnessInputs: runtimeAi.harnessInputs,
    review: deterministicRuntimeSafetyReview,
    runtimeAiCapabilitySnapshots: runtimeAi.snapshots,
  });
  const aiCapabilities =
    harnessInputs.length === 0 && !deterministicRuntimeSafetyReview
      ? analysis.aiCapabilities
      : buildCanonicalAiCapabilities({
          identity: analysis.identity,
          businessQualification: analysis.businessQualification,
          financialFacts: analysis.financialFacts,
          feeLedger: analysis.feeLedger,
          feeOwnershipActionability: analysis.feeOwnershipActionability,
          opportunityEngine: analysis.opportunityEngine,
          evidence: analysis.evidence,
          harnessInputs,
          deterministicRuntimeSafetyReview,
        });
  const finalAnalysis = harnessInputs.length === 0 && !deterministicRuntimeSafetyReview
    ? analysis
    : rebuildCustomerProjectionLayers(analysis, aiCapabilities);

  return {
    analysis: finalAnalysis,
    aiAdmissionAudit: buildCanonicalAiAdmissionAudit({
      capabilities: finalAnalysis.aiCapabilities.capabilities,
      attempts: runtimeAi.snapshots,
    }),
    inputAdmission: canonicalRuntimeInputAdmissionTable(),
    runtimeAiCapabilitySnapshots: runtimeAi.snapshots,
  };
}

export async function buildCanonicalRuntimeAnalysisWithRuntimeAi(input: CanonicalRuntimeAdapterInput): Promise<CanonicalRuntimeAdapterResult> {
  const document = cloneJson(input.document);
  const businessType = input.businessType;
  const runtimeDocumentRef = opaqueRuntimeRef(input.runtimeDocumentRef);
  const legacySummary = cloneJson(input.legacySummary ?? null);

  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, {
    businessType,
    businessProfile: runtimeBusinessProfile(input.businessProfile, businessType),
    sourceAnalysisId: runtimeDocumentRef,
    sourceFileName: null,
  });
  const runtimeAi = buildRuntimeAiCapabilityHarnessInputs({
    summary: legacySummary,
    analysis,
  });
  const wholeStatementRuntime = await runWholeStatementFeeIntelligenceRuntimeWithContext({
    analysis,
    options: input.wholeStatementFeeIntelligence,
  });
  const wholeStatementOutput = wholeStatementRuntime.output;
  const wholeStatementHarnessInput: CanonicalAiCapabilityHarnessInput = {
    capability: "whole_statement_fee_intelligence_review",
    status: wholeStatementOutput.reviewStatus === "partial" ? "completed" : wholeStatementOutput.reviewStatus,
    output: wholeStatementOutput.reviewStatus === "completed" || wholeStatementOutput.reviewStatus === "partial" ? wholeStatementOutput : null,
    executionRef: null,
    independentReviewRefs: [],
  };
  const wholeStatementSnapshot = snapshotForWholeStatementFeeIntelligence(wholeStatementOutput);
  const snapshots = [...runtimeAi.snapshots, wholeStatementSnapshot].sort((left, right) =>
    left.capability.localeCompare(right.capability),
  );
  const deterministicRuntimeSafetyReview = buildDeterministicRuntimeSafetyReview({
    analysis,
    runtimeAiCapabilitySnapshots: snapshots,
  });
  const harnessInputs = addDeterministicAnomalySubstitution({
    harnessInputs: [...runtimeAi.harnessInputs, wholeStatementHarnessInput],
    review: deterministicRuntimeSafetyReview,
    runtimeAiCapabilitySnapshots: snapshots,
  });
  const aiCapabilities = buildCanonicalAiCapabilities({
    identity: analysis.identity,
    businessQualification: analysis.businessQualification,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    evidence: analysis.evidence,
    harnessInputs,
    deterministicRuntimeSafetyReview,
  });
  const finalAnalysis = rebuildCustomerProjectionLayers(
    analysis,
    aiCapabilities,
    ["completed", "partial"].includes(wholeStatementOutput.reviewStatus)
      ? wholeStatementRuntime.feeKnowledgeIntelligence
      : [],
  );

  return {
    analysis: finalAnalysis,
    aiAdmissionAudit: buildCanonicalAiAdmissionAudit({
      capabilities: finalAnalysis.aiCapabilities.capabilities,
      attempts: snapshots,
    }),
    inputAdmission: canonicalRuntimeInputAdmissionTable(),
    runtimeAiCapabilitySnapshots: snapshots,
  };
}

function runtimeBusinessProfile(
  profile: CanonicalBusinessProfileInput | null | undefined,
  businessType: BusinessTypeId,
): CanonicalBusinessProfileInput {
  return {
    ...profile,
    merchantDeclaration: {
      selectedCategoryId: profile?.merchantDeclaration?.selectedCategoryId ?? businessType,
      freeTextDescription: profile?.merchantDeclaration?.freeTextDescription ?? null,
    },
    market: profile?.market ?? "US",
  };
}

function rebuildCustomerProjectionLayers(
  analysis: CanonicalStatementAnalysis,
  aiCapabilities: CanonicalStatementAnalysis["aiCapabilities"],
  feeKnowledgeIntelligence: readonly FeeKnowledgeIntelligenceRecord[] = [],
): CanonicalStatementAnalysis {
  const customerState = buildCanonicalCustomerState({
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    aiCapabilities,
    rateComparison: analysis.customerState.rateComparison,
  });
  const candidate = { ...analysis, aiCapabilities, customerState };
  return validateCanonicalStatementAnalysis({
    ...candidate,
    merchantAttention: buildCanonicalMerchantAttentionModel(candidate, { feeKnowledgeIntelligence }),
  });
}

export function canonicalRuntimeInputAdmissionTable(): CanonicalRuntimeInputAdmission[] {
  return CANONICAL_RUNTIME_INPUT_ADMISSION_TABLE.map((row) => ({ ...row }));
}

export function opaqueRuntimeRef(value: string): string {
  const normalized = value.trim();
  if (
    !normalized ||
    /[\\/\s]/.test(normalized) ||
    /\.[A-Za-z0-9]{2,5}$/.test(normalized) ||
    /(?:^|[^a-z0-9])(?:merchant|account|acct|mid|file|path|hash|raw|prompt|response|provider|model|api|billing)(?:[^a-z0-9]|$)/i.test(normalized) ||
    /\b[A-Fa-f0-9]{32,}\b/.test(normalized)
  ) {
    return "runtime_document_unknown";
  }
  return normalized.slice(0, 96);
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function snapshotForWholeStatementFeeIntelligence(output: CanonicalAiWholeStatementFeeIntelligenceOutput): RuntimeAiCapabilitySnapshot {
  return {
    capability: "whole_statement_fee_intelligence_review",
    attempted: output.reviewStatus !== "disabled",
    normalizedStatus: output.reviewStatus === "partial" ? "completed" : output.reviewStatus as CanonicalAiCapabilityStatus,
    safeCounts: {
      expectedFeeRowCount: output.coverageProof.expectedFeeRowRefs.length,
      reviewedFeeRowCount: output.coverageProof.reviewedFeeRowRefs.length,
      acceptedRecordCount: output.acceptanceRecords.filter((record) => record.status === "accepted" || record.status === "accepted_with_conditions").length,
      needsVerificationCount: output.acceptanceRecords.filter((record) => record.status === "needs_verification").length,
      humanReviewCount: output.acceptanceRecords.filter((record) => record.status === "human_review").length,
      rejectedRecordCount: output.acceptanceRecords.filter((record) => record.status === "rejected").length,
    },
    executionRef: null,
    reasonCodes: [`whole_statement_fee_intelligence_${output.reviewStatus}` as const],
    diagnosticSignals:
      output.reviewStatus === "completed"
        ? passedDiagnosticSignals(["schema_validation", "evidence_citation", "linkage", "deterministic_reconciliation", "privacy_safety"])
        : output.reviewStatus === "safety_blocked"
          ? [{ stage: "privacy_safety", state: "failed", reasonCode: "whole_statement_fee_intelligence_safety_blocked", fieldPath: "review" }]
          : [],
    diagnosticReferences: {
      feeRowRefs: [...output.coverageProof.expectedFeeRowRefs, ...output.coverageProof.reviewedFeeRowRefs],
      evidenceRefs: output.evidenceRefs,
    },
    runtimeWholeStatementFeeIntelligenceReview: runtimeReviewForWholeStatementFeeIntelligence(output),
  };
}

function runtimeReviewForWholeStatementFeeIntelligence(
  output: CanonicalAiWholeStatementFeeIntelligenceOutput,
): CanonicalRuntimeWholeStatementFeeIntelligenceReview {
  return {
    type: "whole_statement_fee_intelligence_runtime_review",
    policyVersion: "whole_statement_fee_intelligence_runtime_review_v1",
    reviewStatus: output.reviewStatus,
    coverageProof: output.coverageProof,
    rowInterpretationCount: output.rowInterpretations.length,
    acceptanceRecordCount: output.acceptanceRecords.length,
    reasonCodes: [...output.reasonCodes],
    authoritative: false,
    providerDetailsStripped: true,
  };
}
