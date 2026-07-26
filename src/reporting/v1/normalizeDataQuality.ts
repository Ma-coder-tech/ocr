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

const ADVANCED_REVIEW_INCOMPLETE_MESSAGE =
  "RateReveal could not complete the required advanced statement review, so savings conclusions are withheld.";

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
  const customerFacingTotalsAllowed = reportable && (validation ? validation.customerFacingTotalsAllowed : true);
  const feeClassificationAllowed = reportable && (validation ? validation.feeClassificationAllowed : !missingPdfParserDecision);
  const advancedReview = advancedReviewCompletion(summary, reportable, customerFacingTotalsAllowed);
  const effectiveOverallConfidence = advancedReview.complete ? overallConfidence : "low";
  const effectiveFeeClassificationAllowed = feeClassificationAllowed && !advancedReview.feeClassificationIncomplete;

  return {
    extractionMode,
    overallConfidence: effectiveOverallConfidence,
    qualityScore,
    reportable,
    customerFacingTotalsAllowed,
    feeClassificationAllowed: effectiveFeeClassificationAllowed,
    reasons: [
      ...parserDecisionReasons(summary),
      ...validationReasons(validation?.blockingReasons ?? [], "critical", ["core_metrics", "benchmark", "opportunity_summary", "findings"]),
      ...validationReasons(validation?.warningReasons ?? [], "warning", ["fee_composition", "fee_inventory", "findings"]),
      ...dataQualityReasons(summary.dataQuality),
      ...advancedReview.reasons,
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
  return (signals ?? [])
    .filter((signal) => !/^AI .* status:/i.test(signal.message))
    .map((signal, index) => ({
      code: `analysis_data_quality_${index + 1}`,
      severity: signal.level,
      message: customerSafeDataQualityMessage(signal.message),
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

type AdvancedReviewCompletion = {
  complete: boolean;
  feeClassificationIncomplete: boolean;
  reasons: DataQualityReason[];
};

function advancedReviewCompletion(
  summary: AnalysisSummary,
  reportable: boolean,
  customerFacingTotalsAllowed: boolean,
): AdvancedReviewCompletion {
  if (summary.sourceType !== "pdf" || !summary.parserDecision || !reportable || !customerFacingTotalsAllowed) {
    return { complete: true, feeClassificationIncomplete: false, reasons: [] };
  }

  const analysis = recordOrNull(summary.fiservFeeAnalysisV2);
  if (!analysis) return { complete: true, feeClassificationIncomplete: false, reasons: [] };

  const results: StageEvaluation[] = [
    evaluateRequiredStage({
      code: "advanced_anomaly_review_incomplete",
      metadata: recordOrNull(analysis.aiAnomalyReview),
      acceptedStatuses: ["applied", "no_anomalies"],
      notNeededProof: (metadata) => hasStructuredNotNeededReason(metadata),
    }),
    evaluateRequiredStage({
      code: "advanced_notice_review_incomplete",
      metadata: recordOrNull(analysis.aiNoticeExtraction),
      acceptedStatuses: ["applied", "no_fee_changes"],
      notNeededProof: (metadata) => hasStructuredNotNeededReason(metadata) || !hasNoticeText(analysis),
    }),
    evaluateRequiredStage({
      code: "advanced_benchmark_review_incomplete",
      metadata: recordOrNull(analysis.benchmarkCategoryAi),
      acceptedStatuses: ["applied"],
      acceptedConditionalStatuses: ["no_usable_suggestion"],
      notNeededProof: (metadata) => hasStructuredNotNeededReason(metadata),
    }),
    evaluateRequiredStage({
      code: "advanced_fee_classification_incomplete",
      metadata: recordOrNull(analysis.ai),
      acceptedStatuses: ["applied", "no_usable_suggestions"],
      notNeededProof: (metadata) => Number(metadata.unresolvedInputRowCount ?? -1) === 0 && hasStructuredNotNeededReason(metadata),
      marksFeeClassificationIncomplete: true,
    }),
  ];

  const incomplete = results.filter((result) => !result.complete);
  return {
    complete: incomplete.length === 0,
    feeClassificationIncomplete: incomplete.some((result) => result.marksFeeClassificationIncomplete),
    reasons: [
      ...advancedReviewStatusReasons(analysis),
      ...incomplete.map((result) => ({
        code: result.code,
        severity: "warning" as const,
        message: ADVANCED_REVIEW_INCOMPLETE_MESSAGE,
        affectedComponents: FINANCIAL_COMPONENTS,
      })),
    ],
  };
}

type StageEvaluation = {
  code: string;
  complete: boolean;
  marksFeeClassificationIncomplete?: boolean;
};

function evaluateRequiredStage(params: {
  code: string;
  metadata: Record<string, unknown> | null;
  acceptedStatuses: string[];
  acceptedConditionalStatuses?: string[];
  notNeededProof: (metadata: Record<string, unknown>) => boolean;
  marksFeeClassificationIncomplete?: boolean;
}): StageEvaluation {
  if (!params.metadata) {
    return {
      code: params.code,
      complete: false,
      marksFeeClassificationIncomplete: params.marksFeeClassificationIncomplete,
    };
  }
  const status = typeof params.metadata?.status === "string" ? params.metadata.status : null;
  const complete =
    status !== null &&
    (params.acceptedStatuses.includes(status) ||
      (params.acceptedConditionalStatuses ?? []).includes(status) ||
      (status === "not_needed" && params.notNeededProof(params.metadata!)));
  return {
    code: params.code,
    complete,
    marksFeeClassificationIncomplete: params.marksFeeClassificationIncomplete,
  };
}

function hasStructuredNotNeededReason(metadata: Record<string, unknown>): boolean {
  const notes = Array.isArray(metadata.notes) ? metadata.notes : [];
  return notes.some((note) => typeof note === "string" && note.trim().length > 0);
}

function hasNoticeText(analysis: Record<string, unknown>): boolean {
  return typeof analysis.noticeText === "string" && analysis.noticeText.trim().length > 0;
}

function advancedReviewStatusReasons(analysis: Record<string, unknown>): DataQualityReason[] {
  const reasons: DataQualityReason[] = [];
  const feeAi = recordOrNull(analysis.ai);
  if (feeAi) {
    reasons.push(infoReason("advanced_fee_classification_status", `Advanced fee classification status: ${statusLabel(feeAi)}.`));
  }
  const benchmarkAi = recordOrNull(analysis.benchmarkCategoryAi);
  if (benchmarkAi) {
    reasons.push(infoReason("advanced_benchmark_review_status", `Advanced benchmark review status: ${statusLabel(benchmarkAi)}.`));
  }
  const noticeAi = recordOrNull(analysis.aiNoticeExtraction);
  if (noticeAi) {
    const noticeCount = Number.isFinite(noticeAi.noticeCount) ? `; notices ${noticeAi.noticeCount}` : "";
    const feeChangeCount = Number.isFinite(noticeAi.feeChangeCount) ? `; fee changes ${noticeAi.feeChangeCount}` : "";
    reasons.push(infoReason("advanced_notice_review_status", `Advanced notice review status: ${statusLabel(noticeAi)}${noticeCount}${feeChangeCount}.`));
  }
  const anomalyAi = recordOrNull(analysis.aiAnomalyReview);
  if (anomalyAi) {
    const anomalyCount = Number.isFinite(anomalyAi.anomalyCount) ? `; anomalies ${anomalyAi.anomalyCount}` : "";
    reasons.push(infoReason("advanced_statement_review_status", `Advanced statement review status: ${statusLabel(anomalyAi)}${anomalyCount}.`));
  }
  const narrativeAi = recordOrNull(analysis.aiMerchantNarrative);
  if (narrativeAi) {
    reasons.push(infoReason("advanced_report_narrative_status", `Advanced report narrative status: ${statusLabel(narrativeAi)}.`));
  }
  return reasons;
}

function infoReason(code: string, message: string): DataQualityReason {
  return {
    code,
    severity: "info",
    message,
    affectedComponents: ["methodology"],
  };
}

function statusLabel(metadata: Record<string, unknown>): string {
  return typeof metadata.status === "string" && metadata.status.trim() ? metadata.status.trim() : "unknown";
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function customerSafeDataQualityMessage(message: string): string {
  return message
    .replace(/^AI fee analysis classification status:/, "Advanced fee classification status:")
    .replace(/^AI benchmark category status:/, "Advanced benchmark review status:")
    .replace(/^AI notice extraction status:/, "Advanced notice review status:")
    .replace(/^AI full statement anomaly review status:/, "Advanced statement review status:")
    .replace(/^AI merchant narrative status:/, "Advanced report narrative status:")
    .replace(/\s+via\s+(openai|anthropic)\b/gi, "")
    .replace(/\b(OpenAI|Anthropic)\b/g, "advanced review provider")
    .replace(/\b(OPENAI_API_KEY|ANTHROPIC_API_KEY)\b/g, "required configuration");
}
