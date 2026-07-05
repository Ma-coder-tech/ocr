import { getBusinessTypeBenchmark, getBusinessTypeReportLabel } from "./businessTypes.js";
import { analyzeDocument } from "./analyzer.js";
import { withFeeClassification } from "./feeClassification.js";
import { maybeRunBenchmarkCategoryAiInferenceForParserOutput } from "./benchmarkCategoryAiInference.js";
import { maybeRunFiservFeeAnalysisAiClassificationForParserOutput } from "./fiservFeeAnalysisAiClassification.js";
import { maybeRunFiservProcessorFeeAiClassificationForParserOutput } from "./fiservProcessorFeeAiClassification.js";
import { maybeRunFullStatementAnomalyReviewForParserOutput } from "./fullStatementAnomalyReviewAi.js";
import { maybeRunMerchantNarrativeAiForParserOutput } from "./merchantNarrativeAi.js";
import { maybeRunStatementNoticeAiExtractionForParserOutput } from "./statementNoticeAiExtraction.js";
import {
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataFullStatementDriver,
  fiservFirstDataShortStatementDriver,
} from "./fiservFirstDataParser.js";
import { genericFiservStatementDriver } from "./genericFiservStatementParser.js";
import type { ParserDecision, ParserDriver, ParserConfidence } from "./parserFoundation.js";
import type { ParsedDocument } from "./parser.js";
import type { AnalysisSummary, BenchmarkResult, DataQualitySignal, FeeBreakdownRow } from "./types.js";
import type { BusinessTypeId } from "./businessTypes.js";

type ParserWarning = {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
  evidenceLine: string | null;
};

type ParserStatementIdentity = {
  processorFamily: string;
  visibleBrand: string;
  statementFamily: string;
  statementPeriodStart: string;
  statementPeriodEnd: string;
  merchantName?: string | null;
  merchantNumber?: string | null;
};

type ParserSelectedFinancials = {
  totalVolume: number;
  totalFees: number;
  effectiveRate: number;
  transactionCount?: {
    primaryTransactionCount: number | null;
  };
};

type ParserFeeLedgerRow = {
  network: string | null;
  description: string;
  amount: number;
  sourceSection: string;
  evidenceLine: string;
  confidence: ParserConfidence;
  classification?: {
    economicBucket: string;
    confidence: "high" | "medium" | "low";
    rule: string;
    reason: string;
  };
};

type ParserFeeLedger = {
  rows: ParserFeeLedgerRow[];
  status: string;
  printedTotal: number | null;
};

type ParserFundingBatchLedger = {
  status: string;
  rowCount?: number | null;
  anomalyCount?: number | null;
};

type ValidatedParserOutput = {
  statementIdentity: ParserStatementIdentity;
  selectedFinancials: ParserSelectedFinancials;
  feeLedger?: ParserFeeLedger;
  fundingBatchLedger?: ParserFundingBatchLedger;
  fiservFeeAnalysisV2?: unknown;
  decision: ParserDecision;
  warnings: ParserWarning[];
};

type MatchedParser = {
  driver: ParserDriver<unknown>;
  output: ValidatedParserOutput;
};

const pdfParserDrivers: ParserDriver<unknown>[] = [
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataFullStatementDriver,
  fiservFirstDataShortStatementDriver,
  genericFiservStatementDriver,
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function effectiveRatePct(output: ParserSelectedFinancials): number {
  return round2(output.effectiveRate * 100);
}

function statementPeriod(identity: ParserStatementIdentity): string {
  const startMonth = identity.statementPeriodStart.slice(0, 7);
  const endMonth = identity.statementPeriodEnd.slice(0, 7);
  return startMonth === endMonth ? startMonth : `${startMonth} to ${endMonth}`;
}

function benchmarkFor(businessType: BusinessTypeId, effectiveRate: number): BenchmarkResult {
  const benchmark = getBusinessTypeBenchmark(businessType);
  return {
    segment: `${getBusinessTypeReportLabel(businessType)} benchmark`,
    lowerRate: benchmark.lowerRate,
    upperRate: benchmark.upperRate,
    status: effectiveRate < benchmark.lowerRate ? "below" : effectiveRate > benchmark.upperRate ? "above" : "within",
    deltaFromUpperRate: round2(effectiveRate - benchmark.upperRate),
  };
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function masterEstimatedAnnualSavings(output: ValidatedParserOutput, benchmarkSavings: number): number {
  const analysis = output.fiservFeeAnalysisV2;
  if (!analysis || typeof analysis !== "object") return benchmarkSavings;

  const savings = (analysis as Record<string, any>).estimatedAnnualSavings;
  if (!savings || typeof savings !== "object") return benchmarkSavings;

  const estimated = (savings as Record<string, any>).estimated;
  return Number.isFinite(estimated) ? round2(estimated) : benchmarkSavings;
}

function dataQualityFromParser(output: ValidatedParserOutput): DataQualitySignal[] {
  const signals: DataQualitySignal[] = [
    {
      level: output.decision.reportable ? "info" : "critical",
      message: output.decision.reportable
        ? "Validated parser output was used as the source of truth for statement totals."
        : `Parser did not approve this statement for customer-facing financial totals: ${output.decision.reason}`,
    },
  ];

  for (const warning of output.warnings) {
    signals.push({
      level: warning.severity === "high" ? "critical" : "warning",
      message: warning.evidenceLine ? `${warning.message} Evidence: ${warning.evidenceLine}` : warning.message,
    });
  }

  if (output.statementIdentity.statementFamily === "generic_fiserv_family_statement") {
    signals.push({
      level: "info",
      message: `Generic Fiserv-family parser used; totals reconciled, fee ledger status is ${output.feeLedger?.status ?? "not_mapped"}, funding ledger status is ${output.fundingBatchLedger?.status ?? "not_mapped"}.`,
    });
  }

  const aiSignals = aiDataQualitySignals(output.fiservFeeAnalysisV2);
  signals.push(...aiSignals);

  return signals;
}

function aiDataQualitySignals(analysis: unknown): DataQualitySignal[] {
  if (!analysis || typeof analysis !== "object") return [];
  const record = analysis as Record<string, any>;
  const signals: DataQualitySignal[] = [];
  const feeAi = record.ai;
  if (feeAi && typeof feeAi === "object" && typeof feeAi.status === "string") {
    signals.push({
      level: feeAi.status === "failed" ? "warning" : "info",
      message: `AI fee analysis classification status: ${feeAi.status}${feeAi.provider ? ` via ${feeAi.provider}` : ""}.`,
    });
  }
  const benchmarkAi = record.benchmarkCategoryAi;
  if (benchmarkAi && typeof benchmarkAi === "object" && typeof benchmarkAi.status === "string") {
    signals.push({
      level: benchmarkAi.status === "failed" ? "warning" : "info",
      message: `AI benchmark category status: ${benchmarkAi.status}${benchmarkAi.provider ? ` via ${benchmarkAi.provider}` : ""}.`,
    });
  }
  const noticeAi = record.aiNoticeExtraction;
  if (noticeAi && typeof noticeAi === "object" && typeof noticeAi.status === "string") {
    const noticeCount = Number.isFinite(noticeAi.noticeCount) ? `; notices ${noticeAi.noticeCount}` : "";
    const feeChangeCount = Number.isFinite(noticeAi.feeChangeCount) ? `; fee changes ${noticeAi.feeChangeCount}` : "";
    signals.push({
      level: noticeAi.status === "failed" ? "warning" : "info",
      message: `AI notice extraction status: ${noticeAi.status}${noticeAi.provider ? ` via ${noticeAi.provider}` : ""}${noticeCount}${feeChangeCount}.`,
    });
  }
  const narrativeAi = record.aiMerchantNarrative;
  const anomalyAi = record.aiAnomalyReview;
  if (anomalyAi && typeof anomalyAi === "object" && typeof anomalyAi.status === "string") {
    const anomalyCount = Number.isFinite(anomalyAi.anomalyCount) ? `; anomalies ${anomalyAi.anomalyCount}` : "";
    signals.push({
      level: anomalyAi.status === "failed" ? "warning" : "info",
      message: `AI full statement anomaly review status: ${anomalyAi.status}${anomalyAi.provider ? ` via ${anomalyAi.provider}` : ""}${anomalyCount}.`,
    });
  }
  if (narrativeAi && typeof narrativeAi === "object" && typeof narrativeAi.status === "string") {
    signals.push({
      level: narrativeAi.status === "failed" ? "warning" : "info",
      message: `AI merchant narrative status: ${narrativeAi.status}${narrativeAi.provider ? ` via ${narrativeAi.provider}` : ""}.`,
    });
  }
  return signals;
}

function feeRowsFromLedger(output: ValidatedParserOutput): FeeBreakdownRow[] | null {
  const rows = output.feeLedger?.rows ?? [];
  if (rows.length === 0) return null;

  return rows
    .filter((row) => Number.isFinite(row.amount) && row.amount > 0)
    .map((row) => {
      const label = [row.network, row.description].filter(Boolean).join(" - ");
      const base: FeeBreakdownRow = {
        label,
        amount: round2(row.amount),
        sharePct: output.selectedFinancials.totalFees > 0 ? round2((row.amount / output.selectedFinancials.totalFees) * 100) : 0,
        sourceSection: row.sourceSection,
        evidenceLine: row.evidenceLine,
        classificationConfidence: row.confidence === "high" ? "high" : "medium",
      };
      if (row.classification) {
        const mapped = feeBreakdownClassificationFromParser(row.classification.economicBucket);
        return {
          ...base,
          ...mapped,
          classificationConfidence: row.classification.confidence,
          classificationRule: row.classification.rule,
          classificationReason: row.classification.reason,
        };
      }
      return withFeeClassification(base, { processorName: output.statementIdentity.processorFamily });
    })
    .sort((left, right) => right.amount - left.amount);
}

function feeBreakdownClassificationFromParser(economicBucket: string): Pick<FeeBreakdownRow, "feeClass" | "broadType"> {
  switch (economicBucket) {
    case "card_brand_pass_through":
      return { feeClass: "card_brand_pass_through", broadType: "Pass-through" };
    case "processor_transaction_or_auth":
    case "processor_controlled_flat_discount_fee":
      return { feeClass: "processor_transaction_or_auth", broadType: "Processor" };
    case "miscellaneous_or_statement_fee":
      return { feeClass: "processor_service_add_on", broadType: "Service / compliance" };
    case "processor_controlled_tiered_fee":
    case "unknown_needs_review":
    default:
      return { feeClass: "unknown", broadType: "Unknown" };
  }
}

function applyValidatedParserOutput(
  baseSummary: AnalysisSummary,
  matched: MatchedParser,
  businessType: BusinessTypeId,
): AnalysisSummary {
  const { driver, output } = matched;
  const totalVolume = round2(output.selectedFinancials.totalVolume);
  const totalFees = round2(output.selectedFinancials.totalFees);
  const effectiveRate = effectiveRatePct(output.selectedFinancials);
  const estimatedAnnualFees = round2(totalFees * 12);
  const feeBreakdown = feeRowsFromLedger(output) ?? baseSummary.feeBreakdown;
  const benchmark = benchmarkFor(businessType, effectiveRate);
  const benchmarkGapSavings =
    benchmark.status === "above" ? round2(((effectiveRate - benchmark.upperRate) / 100) * totalVolume * 12) : 0;
  const estimatedAnnualSavings = masterEstimatedAnnualSavings(output, benchmarkGapSavings);

  return {
    ...baseSummary,
    processorName: output.statementIdentity.visibleBrand || output.statementIdentity.processorFamily,
    statementPeriod: statementPeriod(output.statementIdentity),
    totalVolume,
    totalFees,
    effectiveRate,
    estimatedMonthlyVolume: totalVolume,
    estimatedMonthlyFees: totalFees,
    estimatedAnnualFees,
    estimatedAnnualSavings,
    benchmark,
    feeBreakdown,
    kpis: [
      {
        label: "Effective Rate",
        value: `${effectiveRate.toFixed(2)}%`,
        note: `Validated parser total fees (${formatMoney(totalFees)}) / validated parser total volume (${formatMoney(totalVolume)}).`,
      },
      {
        label: "Total Fees",
        value: formatMoney(totalFees),
        note: "Selected from the validated parser output after reconciliation.",
      },
      {
        label: "Total Volume",
        value: formatMoney(totalVolume),
        note: "Selected from the validated parser output after total-selection reconciliation.",
      },
    ],
    dataQuality: [...dataQualityFromParser(output), ...baseSummary.dataQuality],
    executiveSummary:
      benchmark.status === "above"
        ? `Validated parser totals show an effective rate of ${effectiveRate.toFixed(2)}%, above the ${benchmark.segment} ceiling of ${benchmark.upperRate.toFixed(2)}%.`
        : `Validated parser totals show an effective rate of ${effectiveRate.toFixed(2)}%, within or below the ${benchmark.segment} range.`,
    confidence: output.decision.confidence === "needs_review" ? "low" : output.decision.confidence,
    twoBucketAnalysis: undefined,
    parserDecision: output.decision,
    parserSource: {
      driverId: driver.id,
      driverName: driver.displayName,
      processorFamily: output.statementIdentity.processorFamily,
      statementFamily: output.statementIdentity.statementFamily,
    },
    fiservFeeAnalysisV2: output.fiservFeeAnalysisV2,
  };
}

function findValidatedPdfParser(doc: ParsedDocument, sourceFileName?: string, businessType?: BusinessTypeId): MatchedParser | null {
  for (const driver of pdfParserDrivers) {
    if (!driver.supports(doc)) continue;
    try {
      const output = driver.parse(doc, { sourceFileName, businessType }) as ValidatedParserOutput;
      return { driver, output };
    } catch (error) {
      console.warn(
        `[statement-parser] ${driver.id} supported the document but failed to parse; trying next parser. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return null;
}

export function analyzeStatementDocument(
  doc: ParsedDocument,
  businessType: BusinessTypeId,
  options: { sourceFileName?: string } = {},
): AnalysisSummary {
  const baseSummary = analyzeDocument(doc, businessType);
  if (doc.sourceType !== "pdf") return baseSummary;

  const matched = findValidatedPdfParser(doc, options.sourceFileName, businessType);
  if (!matched) return baseSummary;

  return applyValidatedParserOutput(baseSummary, matched, businessType);
}

export async function analyzeStatementDocumentWithOptionalAi(
  doc: ParsedDocument,
  businessType: BusinessTypeId,
  options: { sourceFileName?: string } = {},
): Promise<AnalysisSummary> {
  const baseSummary = analyzeDocument(doc, businessType);
  if (doc.sourceType !== "pdf") return baseSummary;

  const matched = findValidatedPdfParser(doc, options.sourceFileName, businessType);
  if (!matched) return baseSummary;

  const noticeEnhanced = await maybeRunStatementNoticeAiExtractionForParserOutput(matched.output as any);
  const categoryEnhanced = await maybeRunBenchmarkCategoryAiInferenceForParserOutput(noticeEnhanced.output as any);
  const feeLedgerEnhanced = await maybeRunFiservProcessorFeeAiClassificationForParserOutput(categoryEnhanced.output as any);
  const v2Enhanced = await maybeRunFiservFeeAnalysisAiClassificationForParserOutput(feeLedgerEnhanced.output as any);
  const anomalyEnhanced = await maybeRunFullStatementAnomalyReviewForParserOutput(v2Enhanced.output as any);
  const narrativeEnhanced = await maybeRunMerchantNarrativeAiForParserOutput(anomalyEnhanced.output as any);
  return applyValidatedParserOutput(baseSummary, { ...matched, output: narrativeEnhanced.output as ValidatedParserOutput }, businessType);
}
