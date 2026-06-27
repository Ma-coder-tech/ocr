import { getBusinessTypeBenchmark, getBusinessTypeReportLabel } from "./businessTypes.js";
import { analyzeDocument } from "./analyzer.js";
import { withFeeClassification } from "./feeClassification.js";
import { maybeRunFiservFeeAnalysisAiClassificationForParserOutput } from "./fiservFeeAnalysisAiClassification.js";
import { maybeRunFiservProcessorFeeAiClassificationForParserOutput } from "./fiservProcessorFeeAiClassification.js";
import {
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataFullStatementDriver,
  fiservFirstDataShortStatementDriver,
} from "./fiservFirstDataParser.js";
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

type ValidatedParserOutput = {
  statementIdentity: ParserStatementIdentity;
  selectedFinancials: ParserSelectedFinancials;
  feeLedger?: ParserFeeLedger;
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
  const estimatedAnnualSavings =
    benchmark.status === "above" ? round2(((effectiveRate - benchmark.upperRate) / 100) * totalVolume * 12) : 0;

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

function findValidatedPdfParser(doc: ParsedDocument, sourceFileName?: string): MatchedParser | null {
  for (const driver of pdfParserDrivers) {
    if (!driver.supports(doc)) continue;
    const output = driver.parse(doc, { sourceFileName }) as ValidatedParserOutput;
    return { driver, output };
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

  const matched = findValidatedPdfParser(doc, options.sourceFileName);
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

  const matched = findValidatedPdfParser(doc, options.sourceFileName);
  if (!matched) return baseSummary;

  const feeLedgerEnhanced = await maybeRunFiservProcessorFeeAiClassificationForParserOutput(matched.output as any);
  const v2Enhanced = await maybeRunFiservFeeAnalysisAiClassificationForParserOutput(feeLedgerEnhanced.output as any);
  return applyValidatedParserOutput(baseSummary, { ...matched, output: v2Enhanced.output as ValidatedParserOutput }, businessType);
}
