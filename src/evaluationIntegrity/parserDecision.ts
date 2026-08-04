import type { ParserConfidence, ParserDecisionStatus } from "../parserFoundation.js";
import type { ReconciliationCheck } from "../reconciliation.js";
import type { PreflightParserControl, PreservedParserDecision } from "./types.js";

export type ParserDecisionPreservationInput = {
  decision: {
    status: ParserDecisionStatus;
    reportable: boolean;
    confidence: ParserConfidence;
    reason: string;
  };
  exactReasonCode?: string;
  controls: Array<{
    controlId: string;
    check: ReconciliationCheck;
    basisId?: string | null;
    populationId?: string | null;
    reportabilityImpact?: "blocking" | "warning" | "none";
  }>;
};

export function preserveParserDecision(input: ParserDecisionPreservationInput): PreservedParserDecision {
  const controls = input.controls
    .map((item): PreflightParserControl => ({
      controlId: item.controlId,
      status: item.check.status,
      basisId: item.basisId ?? null,
      populationId: item.populationId ?? null,
      expected: item.check.expected,
      actual: item.check.actual,
      delta: item.check.delta,
      tolerance: item.check.tolerance,
      reportabilityImpact: item.reportabilityImpact ?? defaultImpact(item.check.status),
    }))
    .sort((left, right) => left.controlId.localeCompare(right.controlId));
  return {
    ...input.decision,
    reasonCode: input.exactReasonCode ?? parserDecisionReasonCode(input.decision),
    failedControls: controls.filter((control) => control.status === "fail"),
    warningControls: controls.filter((control) => control.status === "warning"),
    reportabilityImpact: !input.decision.reportable
      ? "blocks_report"
      : input.decision.status === "accepted_with_warnings"
        ? "allows_report_with_warnings"
        : "allows_report",
  };
}

function parserDecisionReasonCode(decision: ParserDecisionPreservationInput["decision"]): string {
  if (decision.status === "unsupported") return "parser_unsupported";
  if (decision.status === "failed") return "parser_failed";
  if (/missing required reconciliation/i.test(decision.reason)) return "parser_missing_required_reconciliation";
  if (/failed reconciliation/i.test(decision.reason)) return "parser_reconciliation_failed";
  if (/validation state/i.test(decision.reason)) return "parser_validation_state_blocked";
  if (/high-severity parser warning/i.test(decision.reason)) return "parser_high_severity_warning";
  if (/confidence level/i.test(decision.reason)) return "parser_confidence_blocked";
  if (decision.status === "accepted_with_warnings") return "parser_accepted_with_warnings";
  if (decision.status === "accepted") return "parser_accepted";
  return "parser_needs_review";
}

function defaultImpact(status: ReconciliationCheck["status"]): PreflightParserControl["reportabilityImpact"] {
  if (status === "fail") return "blocking";
  if (status === "warning") return "warning";
  return "none";
}
