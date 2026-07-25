import type { AnalysisSummary, DataQualitySignal } from "../../types.js";
import type { DataQualityReason, DataQualitySummary, ReportComponentId } from "./types.js";
import { confidenceFromLabel, confidenceFromScore, lowerConfidence } from "./utils.js";

const FINANCIAL_COMPONENTS: ReportComponentId[] = [
  "core_metrics",
  "benchmark",
  "fee_composition",
  "fee_inventory",
  "opportunity_summary",
  "findings",
  "action_toolkit",
];

export function normalizeDataQuality(summary: AnalysisSummary | undefined): DataQualitySummary {
  if (!summary) {
    return {
      extractionMode: "unusable",
      overallConfidence: "low",
      qualityScore: null,
      reportable: false,
      customerFacingTotalsAllowed: false,
      feeClassificationAllowed: false,
      reasons: [
        {
          code: "analysis_unavailable",
          severity: "critical",
          message: "The analysis did not produce a usable statement summary.",
          affectedComponents: FINANCIAL_COMPONENTS,
        },
      ],
    };
  }

  const validation = summary.parserDecision?.validationState;
  const extractionMode = summary.checklistReport?.extractionMode ?? (summary.sourceType === "pdf" ? "text_only" : "structured");
  const rawScore = summary.checklistReport?.extractionQualityScore ?? null;
  const qualityScore = normalizeQualityScore(rawScore);
  const parserConfidence = confidenceFromLabel(summary.parserDecision?.confidence ?? summary.confidence);
  const scoreConfidence = qualityScore === null ? parserConfidence : confidenceFromScore(qualityScore);
  const overallConfidence = lowerConfidence(parserConfidence, scoreConfidence);
  const missingPdfParserDecision = summary.sourceType === "pdf" && !summary.parserDecision;
  const reportable = summary.parserDecision ? summary.parserDecision.reportable : !missingPdfParserDecision;
  const customerFacingTotalsAllowed = validation ? validation.customerFacingTotalsAllowed : reportable;
  const feeClassificationAllowed = validation ? validation.feeClassificationAllowed : !missingPdfParserDecision;

  return {
    extractionMode,
    overallConfidence,
    qualityScore,
    reportable,
    customerFacingTotalsAllowed,
    feeClassificationAllowed,
    reasons: [
      ...parserDecisionReasons(summary),
      ...validationReasons(validation?.blockingReasons ?? [], "critical", ["core_metrics", "benchmark", "opportunity_summary", "findings"]),
      ...validationReasons(validation?.warningReasons ?? [], "warning", ["fee_composition", "fee_inventory", "findings"]),
      ...dataQualityReasons(summary.dataQuality),
      ...extractionReasons(summary),
    ],
  };
}

function normalizeQualityScore(score: number | null): number | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score > 1) return Math.max(0, Math.min(1, score / 100));
  return Math.max(0, Math.min(1, score));
}

function parserDecisionReasons(summary: AnalysisSummary): DataQualityReason[] {
  const decision = summary.parserDecision;
  if (!decision) {
    return summary.sourceType === "pdf"
      ? [
          {
            code: "parser_decision_missing",
            severity: "critical",
            message: "RateReveal could not confirm parser validation for this statement, so customer-facing financial conclusions are withheld.",
            affectedComponents: FINANCIAL_COMPONENTS,
          },
        ]
      : [];
  }
  const severity = decision.reportable ? (decision.status === "accepted_with_warnings" || decision.status === "needs_review" ? "warning" : "info") : "critical";
  return [
    {
      code: `parser_${decision.status}`,
      severity,
      message: decision.reportable
        ? decision.reason || "The parser produced a reportable statement analysis."
        : decision.reason || "The parser did not approve this statement for customer-facing financial metrics.",
      affectedComponents: severity === "critical" ? FINANCIAL_COMPONENTS : ["methodology"],
    },
  ];
}

function validationReasons(messages: string[], severity: "warning" | "critical", affectedComponents: ReportComponentId[]): DataQualityReason[] {
  return messages.map((message, index) => ({
    code: `${severity}_validation_${index + 1}`,
    severity,
    message,
    affectedComponents,
  }));
}

function dataQualityReasons(signals: DataQualitySignal[] | undefined): DataQualityReason[] {
  return (signals ?? []).map((signal, index) => ({
    code: `analysis_data_quality_${index + 1}`,
    severity: signal.level,
    message: signal.message,
    affectedComponents: signal.level === "critical" ? FINANCIAL_COMPONENTS : ["methodology"],
  }));
}

function extractionReasons(summary: AnalysisSummary): DataQualityReason[] {
  return (summary.checklistReport?.extractionReasons ?? []).slice(0, 5).map((message, index) => ({
    code: `extraction_${index + 1}`,
    severity: "info",
    message,
    affectedComponents: ["methodology"],
  }));
}
