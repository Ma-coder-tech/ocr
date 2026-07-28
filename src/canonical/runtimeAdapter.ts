import { buildCanonicalStatementFactsFromParsedDocument } from "./buildCanonicalFacts.js";
import { buildCanonicalAiCapabilities } from "./buildCanonicalAiCapabilities.js";
import { buildCanonicalCustomerState } from "./customerStateResolver.js";
import {
  buildRuntimeAiCapabilityHarnessInputs,
  type RuntimeAiCapabilitySnapshot,
} from "./runtimeAiCapabilityAdapter.js";
import {
  addDeterministicAnomalySubstitution,
  buildDeterministicRuntimeSafetyReview,
} from "./deterministicRuntimeSafetyReview.js";
import { validateCanonicalStatementAnalysis } from "./validate.js";
import type { BusinessTypeId } from "../businessTypes.js";
import type { ParsedDocument } from "../parser.js";
import type { AnalysisSummary } from "../types.js";
import type { CanonicalStatementAnalysis } from "./types.js";

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
    canonicalUse: "Business-type context only; not authority for financial conclusions or benchmark opportunity.",
    reasonCode: "business_context_limited",
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
};

export type CanonicalRuntimeAdapterResult = {
  analysis: CanonicalStatementAnalysis;
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
          financialFacts: analysis.financialFacts,
          feeLedger: analysis.feeLedger,
          feeOwnershipActionability: analysis.feeOwnershipActionability,
          opportunityEngine: analysis.opportunityEngine,
          evidence: analysis.evidence,
          harnessInputs,
          deterministicRuntimeSafetyReview,
        });
  const finalAnalysis =
    harnessInputs.length === 0 && !deterministicRuntimeSafetyReview
      ? analysis
      : validateCanonicalStatementAnalysis({
          ...analysis,
          aiCapabilities,
          customerState: buildCanonicalCustomerState({
            identity: analysis.identity,
            financialFacts: analysis.financialFacts,
            feeLedger: analysis.feeLedger,
            feeOwnershipActionability: analysis.feeOwnershipActionability,
            opportunityEngine: analysis.opportunityEngine,
            aiCapabilities,
          }),
        });

  return {
    analysis: finalAnalysis,
    inputAdmission: canonicalRuntimeInputAdmissionTable(),
    runtimeAiCapabilitySnapshots: runtimeAi.snapshots,
  };
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
