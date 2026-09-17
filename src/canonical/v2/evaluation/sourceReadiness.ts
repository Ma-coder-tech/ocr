import type {
  CanonicalEconomicsV2CompletenessStatus,
  CanonicalEconomicsV2SourceProvenance,
  CanonicalEconomicsV2SuppliedDocumentIntegrityStatus,
  CanonicalEconomicsV2TemplateAdmissionStatus,
} from "../types.js";
import type { FiservOutputPermission, FiservSupportState } from "../fiservCapabilityContract.js";

export const SOURCE_READINESS_STATES = [
  "authoritative_admitted",
  "observational",
  "requires_human_review",
  "template_admission_unknown",
  "statement_completeness_unknown",
  "incomplete_statement",
  "incomplete_document",
  "parser_not_reportable",
  "unsupported_source",
] as const;

export type SourceReadinessState = (typeof SOURCE_READINESS_STATES)[number];
export type SourceReadinessReasonCode =
  | "source_authoritative_and_admitted"
  | "source_is_observational"
  | "source_requires_human_review"
  | "template_not_admitted"
  | "statement_completeness_not_proven"
  | "statement_incomplete"
  | "supplied_document_not_complete"
  | "parser_blocked_reporting"
  | "parser_validation_failed"
  | "source_unsupported";

export type SourceReadinessEnvelope = {
  schemaVersion: "canonical_source_readiness_v1";
  parser: {
    driverId: string;
    reportable: boolean;
    decisionStatus: "accepted" | "accepted_with_warnings" | "needs_review" | "unsupported" | "failed";
    validationState: "validated" | "validated_with_warnings" | "failed" | "missing";
  };
  source: {
    provenance: CanonicalEconomicsV2SourceProvenance;
    templateAdmission: CanonicalEconomicsV2TemplateAdmissionStatus;
    suppliedDocumentIntegrity: CanonicalEconomicsV2SuppliedDocumentIntegrityStatus;
    statementCompleteness: CanonicalEconomicsV2CompletenessStatus;
    authority: "authoritative" | "observational" | "withheld";
    humanReviewRequired: boolean;
    capabilitySupport?: {
      state: FiservSupportState;
      outputPermissions: FiservOutputPermission[];
    };
  };
  outcome: {
    state: SourceReadinessState;
    analysisCompletionPermitted: boolean;
    reasonCodes: SourceReadinessReasonCode[];
  };
};

export type BuildSourceReadinessInput = Omit<SourceReadinessEnvelope, "schemaVersion" | "outcome">;

export function buildSourceReadinessEnvelope(input: BuildSourceReadinessInput): SourceReadinessEnvelope {
  const reasons: SourceReadinessReasonCode[] = [];
  if (input.source.templateAdmission !== "admitted") reasons.push("template_not_admitted");
  if (input.source.statementCompleteness === "incomplete") reasons.push("statement_incomplete");
  else if (input.source.statementCompleteness !== "complete") reasons.push("statement_completeness_not_proven");
  if (input.source.suppliedDocumentIntegrity !== "complete_supplied_document") reasons.push("supplied_document_not_complete");
  let state: SourceReadinessState;
  if (input.parser.decisionStatus === "unsupported" || input.source.provenance === "source_unavailable"
    || input.source.provenance === "corpus_integrity_hold") {
    state = "unsupported_source";
    reasons.push("source_unsupported");
  } else if (!input.parser.reportable || input.parser.validationState === "failed" || input.parser.validationState === "missing") {
    state = "parser_not_reportable";
    if (!input.parser.reportable) reasons.push("parser_blocked_reporting");
    if (input.parser.validationState === "failed") reasons.push("parser_validation_failed");
    if (input.parser.validationState === "missing") reasons.push("parser_validation_failed");
  } else if (input.source.suppliedDocumentIntegrity !== "complete_supplied_document") {
    state = "incomplete_document";
  } else if (input.source.statementCompleteness === "incomplete") {
    state = "incomplete_statement";
  } else if (input.source.humanReviewRequired || input.source.provenance === "requires_human_review"
    || input.parser.decisionStatus === "needs_review") {
    state = "requires_human_review";
    reasons.push("source_requires_human_review");
  } else if (input.source.templateAdmission !== "admitted") {
    state = "template_admission_unknown";
  } else if (input.source.statementCompleteness !== "complete") {
    state = "statement_completeness_unknown";
  } else if (input.source.authority !== "authoritative"
    || input.source.provenance === "observational") {
    state = "observational";
    reasons.push("source_is_observational");
  } else {
    state = "authoritative_admitted";
    reasons.push("source_authoritative_and_admitted");
  }
  return {
    schemaVersion: "canonical_source_readiness_v1",
    parser: { ...input.parser },
    source: { ...input.source },
    outcome: {
      state,
      analysisCompletionPermitted: input.source.capabilitySupport
        ? ["supported_limited", "supported_full"].includes(input.source.capabilitySupport.state)
        : state === "authoritative_admitted",
      reasonCodes: reasons,
    },
  };
}
