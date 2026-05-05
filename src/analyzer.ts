import { BusinessTypeId, getBusinessTypeBenchmark, getBusinessTypeReportLabel } from "./businessTypes.js";
import {
  AnalysisSummary,
  BenchmarkResult,
  DataQualitySignal,
  DynamicField,
  FeeBreakdownRow,
  FeeInsight,
  InterchangeAuditRow,
  Level3OptimizationModel,
  KpiMetric,
  ProcessorMarkupAuditRow,
  ProcessorMarkupAuditSummary,
  SavingsOpportunity,
  StatementEconomicFeeRow,
  SuspiciousFee,
  TrendPoint,
} from "./types.js";
import { ParsedDocument } from "./parser.js";
import { refineTextOnlyPdfSummary } from "./pdfHeuristic.js";
import { detectProcessorIdentity } from "./processorDetection.js";
import { withFeeClassification } from "./feeClassification.js";
import { extractStructuredStatementFacts, type StructuredStatementFacts } from "./statementSections.js";
import { buildHiddenMarkupAudit } from "./hiddenMarkupAudit.js";

type ColumnStats = {
  sum: number;
  absSum: number;
  posSum: number;
  negAbsSum: number;
  count: number;
};

const FEE_TERMS = [
  "fee",
  "charge",
  "cost",
  "commission",
  "markup",
  "assessment",
  "dues",
  "discount",
  "interchange",
  "network",
  "pci",
  "statement",
  "gateway",
  "batch",
  "noncompliance",
  "chargeback",
  "retrieval",
];

const VOLUME_TERMS = ["volume", "gross", "sale", "sales", "revenue", "deposit", "processed", "amount"];
const EXCLUDE_VOLUME_TERMS = ["fee", "charge", "cost", "rate", "%", "count", "qty", "ticket", "avg"];
const PERIOD_TERMS = ["date", "month", "period", "statement", "year"];
const LEVEL3_REQUIRED_FIELDS = ["invoice_number", "product_code", "quantity", "item_description", "commodity_code"] as const;
const LEVEL3_DEFAULT_RATE_DELTA_BPS = 75;
const LEVEL3_ELIGIBILITY_SIGNAL =
  /\blevel\s*(?:3|iii)\b|\bb2b\b|\bb2g\b|\bcommercial card\b|\bbusiness card\b|\bcorporate card\b|\bpurchasing card\b|\bp-?card\b|\bprocurement card\b|\bgovernment card\b/i;
const LEVEL3_COMMERCIAL_ROW_SIGNAL =
  /\bcommercial\b|\bbusiness card\b|\bcorporate\b|\bpurchasing\b|\bp-?card\b|\bprocurement\b|\bgovernment\b/i;
const LEVEL3_FIELD_PATTERNS: Record<(typeof LEVEL3_REQUIRED_FIELDS)[number], RegExp> = {
  invoice_number: /\binvoice\s*(?:(?:number|no\.?)\b|#)|\binvoice_number\b/i,
  product_code: /\b(product|item|sku)\s*code\b|\bsku\b/i,
  quantity: /\bquantity\b|\bqty\b/i,
  item_description: /\bitem\s*description\b|\bline\s*item\s*description\b/i,
  commodity_code: /\bcommodity\s*code\b/i,
};

function includesAny(input: string, terms: string[]): boolean {
  const v = input.toLowerCase();
  return terms.some((t) => v.includes(t));
}

function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toPct(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseDateish(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$/;
  if (iso.test(trimmed)) {
    const safe = trimmed.replace(/\//g, "-");
    return safe.length >= 7 ? safe.slice(0, 7) : safe;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  const monthYear = /^([a-zA-Z]{3,9})\s+(\d{4})$/;
  const match = trimmed.match(monthYear);
  if (match) {
    const month = match[1].slice(0, 3).toLowerCase();
    const map: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    if (map[month]) return `${match[2]}-${map[month]}`;
  }

  return null;
}

function benchmarkForBusinessType(businessType: BusinessTypeId): Omit<BenchmarkResult, "status" | "deltaFromUpperRate"> {
  const benchmark = getBusinessTypeBenchmark(businessType);
  return {
    segment: `${getBusinessTypeReportLabel(businessType)} benchmark`,
    lowerRate: benchmark.lowerRate,
    upperRate: benchmark.upperRate,
  };
}

function severityFromShare(sharePct: number): SuspiciousFee["severity"] {
  if (sharePct >= 15) return "high";
  if (sharePct >= 7) return "medium";
  return "low";
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function isPositiveAmount(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && value > 0;
}

function amountToBps(amount: number | null, volume: number | null): number | null {
  if (amount === null || volume === null) return null;
  if (!Number.isFinite(amount) || !Number.isFinite(volume) || amount <= 0 || volume <= 0) return null;
  return toPct((amount / volume) * 10_000);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function compactEvidence(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function rowLevel3Context(row: InterchangeAuditRow): string {
  return [row.label, row.cardType, row.sourceSection, row.evidenceLine].filter(Boolean).join(" ");
}

function isLevel3EligibleInterchangeRow(row: InterchangeAuditRow): boolean {
  if (row.cardType === "Commercial") return true;
  return LEVEL3_COMMERCIAL_ROW_SIGNAL.test(rowLevel3Context(row));
}

function collectLevel3Text(doc: ParsedDocument, structuredFacts: StructuredStatementFacts): string {
  const rowText = doc.rows
    .slice(0, 500)
    .map((row) => Object.values(row).join(" "))
    .join(" ");
  const sectionText = structuredFacts.statementSections
    .map((section) => `${section.title} ${section.evidenceLines.join(" ")}`)
    .join(" ");
  const interchangeText = structuredFacts.interchangeAuditRows.map(rowLevel3Context).join(" ");
  return `${doc.headers.join(" ")} ${doc.textPreview} ${rowText} ${sectionText} ${interchangeText}`;
}

function buildLevel3OptimizationModel(
  doc: ParsedDocument,
  structuredFacts: StructuredStatementFacts,
  observedMonths: number,
): Level3OptimizationModel {
  const allText = collectLevel3Text(doc, structuredFacts);
  const eligibleRows = structuredFacts.interchangeAuditRows.filter(isLevel3EligibleInterchangeRow);
  const rowEligibleVolume = eligibleRows.reduce((sum, row) => sum + (row.volume ?? 0), 0);

  const evidence = uniqueStrings([
    ...eligibleRows
      .slice(0, 5)
      .map((row) => `Commercial interchange row: ${row.label}: volume=${row.volume ?? "n/a"}; ${row.evidenceLine}`),
    ...structuredFacts.statementSections
      .flatMap((section) =>
        section.evidenceLines
          .filter((line) => LEVEL3_ELIGIBILITY_SIGNAL.test(`${section.title} ${line}`))
          .slice(0, 2)
          .map((line) => `${section.type}: ${section.title}: ${compactEvidence(line)}`),
      )
      .slice(0, 5),
    LEVEL3_ELIGIBILITY_SIGNAL.test(doc.textPreview) ? `Statement text signal: ${doc.textPreview.match(LEVEL3_ELIGIBILITY_SIGNAL)?.[0] ?? "Level 3"}` : "",
  ]).slice(0, 8);

  const capturedFields = LEVEL3_REQUIRED_FIELDS.filter((field) => LEVEL3_FIELD_PATTERNS[field].test(allText));
  const hasEligibilitySignal = eligibleRows.length > 0 || LEVEL3_ELIGIBILITY_SIGNAL.test(allText);
  const eligibleVolumeUsd = rowEligibleVolume > 0 ? toMoney(rowEligibleVolume) : null;
  const rateDeltaBps = eligibleVolumeUsd !== null ? LEVEL3_DEFAULT_RATE_DELTA_BPS : null;
  const monthlyEligibleVolume = eligibleVolumeUsd !== null ? eligibleVolumeUsd / observedMonths : null;
  const estimatedMonthlySavingsUsd =
    monthlyEligibleVolume !== null && rateDeltaBps !== null ? toMoney((monthlyEligibleVolume * rateDeltaBps) / 10_000) : null;

  return {
    eligible: hasEligibilitySignal,
    confidence: hasEligibilitySignal
      ? toPct(Math.min(0.95, 0.35 + eligibleRows.length * 0.12 + (eligibleVolumeUsd !== null ? 0.18 : 0) + evidence.length * 0.04))
      : 0,
    eligibleVolumeUsd,
    rateDeltaBps,
    requiredFields: [...LEVEL3_REQUIRED_FIELDS],
    capturedFields,
    missingFields: hasEligibilitySignal ? LEVEL3_REQUIRED_FIELDS.filter((field) => !capturedFields.includes(field)) : [],
    detectedSignals: uniqueStrings([
      eligibleRows.length > 0 ? "commercial_card_interchange_rows" : "",
      /\blevel\s*(?:3|iii)\b/i.test(allText) ? "level_3_language" : "",
      /\bb2b\b/i.test(allText) ? "b2b_language" : "",
      /\bb2g\b|\bgovernment card\b/i.test(allText) ? "b2g_or_government_card_language" : "",
    ]),
    estimatedMonthlySavingsUsd,
    estimatedAnnualSavingsUsd: estimatedMonthlySavingsUsd !== null ? toMoney(estimatedMonthlySavingsUsd * 12) : null,
    evidence:
      rateDeltaBps !== null
        ? [...evidence, `Savings estimate uses conservative default Level 3 rate delta: ${rateDeltaBps.toFixed(2)} bps`].slice(0, 8)
        : evidence,
  };
}

function createProcessorMarkupAudit(structuredFacts: StructuredStatementFacts): ProcessorMarkupAuditSummary {
  const blendedRows: ProcessorMarkupAuditRow[] = structuredFacts.blendedFeeSplits
    .map((split) => {
      const totalPaid = split.processorMarkup.totalPaid ?? split.processorMarkup.expectedTotalPaid;
      const volume = split.volume;
      return {
        label: split.label,
        cardBrand: split.cardBrand,
        cardType: split.cardType,
        transactionCount: split.transactionCount,
        volume,
        ratePercent: split.processorMarkup.ratePercent,
        rateBps: split.processorMarkup.rateBps,
        effectiveRateBps: amountToBps(totalPaid, volume),
        perItemFee: split.processorMarkup.perItemFee,
        totalPaid: split.processorMarkup.totalPaid,
        expectedTotalPaid: split.processorMarkup.expectedTotalPaid,
        sourceSection: split.sourceSection,
        evidenceLine: split.evidenceLine,
        rowIndex: split.rowIndex,
        confidence: split.confidence,
      };
    });
  const rows = [...structuredFacts.processorMarkupRows, ...blendedRows].filter(
    (row) =>
      row.rateBps !== null ||
      row.effectiveRateBps !== null ||
      row.totalPaid !== null ||
      row.expectedTotalPaid !== null ||
      row.perItemFee !== null,
  );

  const transactionCountRaw = rows.reduce((sum, row) => sum + (row.transactionCount ?? 0), 0);
  const volumeRaw = rows.reduce((sum, row) => sum + (row.volume ?? 0), 0);
  const totalPaidRaw = rows.reduce((sum, row) => sum + (row.totalPaid ?? row.expectedTotalPaid ?? 0), 0);
  const weightedRate = rows.reduce(
    (acc, row) => {
      if (row.rateBps === null || row.volume === null || row.volume <= 0) return acc;
      return {
        weightedSum: acc.weightedSum + row.rateBps * row.volume,
        volume: acc.volume + row.volume,
      };
    },
    { weightedSum: 0, volume: 0 },
  );
  const confidenceRaw = rows.reduce((sum, row) => sum + row.confidence, 0);

  return {
    rows,
    rowCount: rows.length,
    transactionCount: transactionCountRaw > 0 ? Math.round(transactionCountRaw) : null,
    volume: volumeRaw > 0 ? toMoney(volumeRaw) : null,
    totalPaid: totalPaidRaw > 0 ? toMoney(totalPaidRaw) : null,
    weightedAverageRateBps: weightedRate.volume > 0 ? toPct(weightedRate.weightedSum / weightedRate.volume) : null,
    effectiveRateBps: amountToBps(totalPaidRaw, volumeRaw),
    confidence: rows.length > 0 ? toPct(confidenceRaw / rows.length) : 0,
  };
}

function structuredFeeRowsToBreakdown(
  rows: StatementEconomicFeeRow[],
  totalFees: number,
  processorName: string,
): FeeBreakdownRow[] {
  return rows
    .filter((row) => row.amount > 0)
    .map((row) =>
      withFeeClassification(
        {
          label: row.label,
          amount: toMoney(row.amount),
          sharePct: totalFees > 0 ? toPct((row.amount / totalFees) * 100) : 0,
          sourceSection: row.sourceSection,
          evidenceLine: row.evidenceLine,
        },
        { processorName },
      ),
    )
    .sort((a, b) => b.amount - a.amount);
}

function hasCoherentSectionRollup(structuredFacts: StructuredStatementFacts): boolean {
  const rollup = structuredFacts.economicRollup;
  if (rollup.totalVolume === null || rollup.totalFees === null) return false;
  if (rollup.totalVolume <= 0 || rollup.totalFees <= 0 || rollup.totalFees > rollup.totalVolume) return false;
  if (rollup.totalVolume > 100_000_000) return false;

  const effectiveRate = (rollup.totalFees / rollup.totalVolume) * 100;
  if (!Number.isFinite(effectiveRate) || effectiveRate < 0.05 || effectiveRate > 15) return false;

  const categorizedTotal = rollup.feeRows.reduce((sum, row) => sum + row.amount, 0);
  return (
    rollup.confidence >= 0.55 &&
    rollup.feeRows.length > 0 &&
    categorizedTotal >= rollup.totalFees * 0.95 &&
    categorizedTotal <= rollup.totalFees * 1.15
  );
}

function hasUsableEconomicTotals(summary: Pick<AnalysisSummary, "totalVolume" | "totalFees" | "effectiveRate">): boolean {
  if (summary.totalVolume <= 0 || summary.totalFees <= 0 || summary.totalFees > summary.totalVolume) return false;
  return Number.isFinite(summary.effectiveRate) && summary.effectiveRate >= 0.05 && summary.effectiveRate <= 15;
}

function inferPeriod(row: Record<string, string | number>, periodKeys: string[]): string | null {
  for (const key of periodKeys) {
    const value = row[key];
    if (typeof value === "string") {
      const parsed = parseDateish(value);
      if (parsed) return parsed;
    }
  }

  const yearEntry = Object.entries(row).find(([key]) => key.toLowerCase().includes("year"));
  const monthEntry = Object.entries(row).find(([key]) => key.toLowerCase().includes("month"));
  if (yearEntry && monthEntry) {
    const year = String(yearEntry[1]).trim();
    const month = String(monthEntry[1]).trim();
    const parsed = parseDateish(`${month} ${year}`);
    if (parsed) return parsed;
  }

  return null;
}

function createTextOnlyPdfSummary(
  doc: ParsedDocument,
  processorName: string,
  businessType: BusinessTypeId,
  structuredFacts: StructuredStatementFacts,
): AnalysisSummary {
  const benchmarkBase = benchmarkForBusinessType(businessType);
  const processorMarkupAudit = createProcessorMarkupAudit(structuredFacts);
  const benchmark: BenchmarkResult = {
    ...benchmarkBase,
    status: "within",
    deltaFromUpperRate: 0,
  };
  const hiddenMarkupAudit = buildHiddenMarkupAudit(structuredFacts.interchangeAuditRows);
  const level3Optimization = buildLevel3OptimizationModel(doc, structuredFacts, 1);

  const textWarnings = doc.extraction.reasons.map((message): DataQualitySignal => ({ level: "warning", message }));
  const dataQuality: DataQualitySignal[] = [
    {
      level: "critical",
      message:
        "PDF preflight quality gate blocked numeric extraction. The tool is running text-only analysis to avoid misleading fee/volume outputs.",
    },
    ...textWarnings,
  ];

  const insights: FeeInsight[] = [
    {
      title: "Text-only PDF analysis",
      detail: "This file did not pass structured numeric extraction. Use this output for qualitative review only.",
      impactUsd: 0,
    },
  ];

  if (processorName !== "Unknown") {
    insights.push({
      title: "Processor hint detected",
      detail: `The extracted text suggests processor family '${processorName}'. Processor-specific rules can still be partially evaluated.`,
      impactUsd: 0,
    });
  } else {
    insights.push({
      title: "Processor not confidently detected",
      detail: "No strong processor signature was found in extracted text. Universal checklist rules should be prioritized.",
      impactUsd: 0,
    });
  }

  return {
    businessType,
    processorName,
    sourceType: doc.sourceType,
    statementPeriod: "Not reliably extractable from current PDF text layer",
    executiveSummary:
      "The uploaded PDF could not be parsed into structured numeric tables. To avoid inaccurate conclusions, numeric fee metrics are withheld and only qualitative checks are returned.",
    totalVolume: 0,
    totalFees: 0,
    effectiveRate: 0,
    estimatedMonthlyVolume: 0,
    estimatedMonthlyFees: 0,
    estimatedAnnualFees: 0,
    estimatedAnnualSavings: 0,
    benchmark,
    statementSections: structuredFacts.statementSections,
    interchangeAudit: structuredFacts.interchangeAudit,
    interchangeAuditRows: structuredFacts.interchangeAuditRows,
    blendedFeeSplits: structuredFacts.blendedFeeSplits,
    processorMarkupAudit,
    hiddenMarkupAudit,
    structuredFeeFindings: structuredFacts.structuredFeeFindings,
    bundledPricing: structuredFacts.bundledPricing,
    noticeFindings: structuredFacts.noticeFindings,
    repricingEvents: structuredFacts.repricingEvents,
    downgradeAnalysis: structuredFacts.downgradeAnalysis,
    perItemFeeModel: structuredFacts.perItemFeeModel,
    guideMeasures: structuredFacts.guideMeasures,
    level3Optimization,
    kpis: [
      { label: "Effective Rate", value: "N/A", note: "Structured numeric extraction unavailable for this PDF." },
      { label: "Estimated Monthly Fees", value: "N/A", note: "Fee totals withheld to avoid misleading math." },
      { label: "Top Fee Concentration", value: "N/A", note: "Line-item fee breakdown could not be normalized." },
      { label: "Potential Annual Savings", value: "N/A", note: "Requires structured fee and volume fields." },
    ],
    feeBreakdown: [],
    suspiciousFees: [],
    savingsOpportunities: [],
    negotiationChecklist: [
      "Request CSV export (or machine-readable statement export) for accurate fee decomposition.",
      "If only PDF is available, provide a searchable/native PDF instead of image-only scans.",
      "Ask processor for a detailed fee schedule with interchange, markup, and per-item components separated.",
    ],
    actionPlan: [
      "Step 1: Obtain structured statement data (CSV preferred).",
      "Step 2: Re-run analysis with universal + processor-specific rule packs.",
      "Step 3: Validate high-impact fee findings against statement line-item evidence.",
    ],
    trend: [],
    dataQuality,
    dynamicFields: [],
    insights,
    confidence: processorName === "Unknown" ? "low" : "medium",
  };
}

export function analyzeDocument(doc: ParsedDocument, businessType: BusinessTypeId): AnalysisSummary {
  const processorDetection = detectProcessorIdentity(doc);
  const processorName = processorDetection.detectedProcessorName ?? "Unknown";
  const structuredFacts = extractStructuredStatementFacts(doc, {
    processorId: processorDetection.detectedProcessorId,
    rulePackId: processorDetection.rulePackId,
  });
  const hasStructuredRollup = hasCoherentSectionRollup(structuredFacts);
  if (doc.sourceType === "pdf" && doc.extraction.mode !== "structured") {
    const qualitativeSummary = createTextOnlyPdfSummary(doc, processorName, businessType, structuredFacts);
    const recoveredSummary = refineTextOnlyPdfSummary(doc, qualitativeSummary);
    if (recoveredSummary) {
      return recoveredSummary;
    }
    return qualitativeSummary;
  }

  const feeBuckets = new Map<string, number>();
  const numericColumns = new Set<string>();
  const columnStats = new Map<string, ColumnStats>();

  const sampled = doc.rows.slice(0, 5000);

  for (const row of sampled) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        numericColumns.add(key);
        const stats = columnStats.get(key) ?? { sum: 0, absSum: 0, posSum: 0, negAbsSum: 0, count: 0 };
        stats.sum += value;
        stats.absSum += Math.abs(value);
        stats.posSum += value > 0 ? value : 0;
        stats.negAbsSum += value < 0 ? Math.abs(value) : 0;
        stats.count += 1;
        columnStats.set(key, stats);
      }
    }
  }

  const columnEntries = [...columnStats.entries()];

  const volumeCandidates = columnEntries
    .map(([key, stats]) => {
      const low = key.toLowerCase();
      const hintBoost = includesAny(low, VOLUME_TERMS) ? 2 : 0;
      const penalty = includesAny(low, EXCLUDE_VOLUME_TERMS) ? 1.6 : 0;
      const score = stats.posSum * (1 + hintBoost) - stats.absSum * penalty;
      return { key, stats, score };
    })
    .sort((a, b) => b.score - a.score);

  const feeCandidates = columnEntries
    .map(([key, stats]) => {
      const low = key.toLowerCase();
      const hintBoost = includesAny(low, FEE_TERMS) ? 2.6 : 0;
      const signal = stats.negAbsSum > 0 ? stats.negAbsSum : stats.absSum;
      const score = signal * (1 + hintBoost);
      return { key, stats, score };
    })
    .sort((a, b) => b.score - a.score);

  const selectedVolume = volumeCandidates.find(
    (c) => c.stats.posSum > 0 && !includesAny(c.key.toLowerCase(), ["rate", "%", "ticket", "count"]),
  );
  const selectedFeeColumns = feeCandidates
    .filter((c) => c.score > 0)
    .filter((c) => includesAny(c.key.toLowerCase(), FEE_TERMS) || c.stats.negAbsSum > 0)
    .slice(0, 6);

  let totalVolume = toMoney(selectedVolume?.stats.posSum ?? 0);

  let totalFeesRaw = 0;
  for (const c of selectedFeeColumns) {
    const amount = c.stats.negAbsSum > 0 ? c.stats.negAbsSum : c.stats.absSum;
    if (amount <= 0) continue;
    const bucket = normalizeLabel(c.key).slice(0, 42) || "other fee";
    feeBuckets.set(bucket, (feeBuckets.get(bucket) ?? 0) + amount);
    totalFeesRaw += amount;
  }

  if (totalFeesRaw <= 0) {
    const fallback = feeCandidates.find((c) => c.stats.negAbsSum > 0);
    if (fallback) {
      totalFeesRaw = fallback.stats.negAbsSum;
      feeBuckets.set("inferred negative charges", totalFeesRaw);
    }
  }

  const processorMarkupAudit = createProcessorMarkupAudit(structuredFacts);
  const hiddenMarkupAudit = buildHiddenMarkupAudit(structuredFacts.interchangeAuditRows);
  const structuredRollup = structuredFacts.economicRollup;
  let usedStructuredRollup = false;
  const structuredInterchangePaid = structuredFacts.interchangeAudit.totalPaid ?? 0;
  const structuredProcessorMarkupTotal = toMoney(
    processorMarkupAudit.totalPaid ??
      structuredFacts.blendedFeeSplits.reduce(
        (sum, split) => sum + (split.processorMarkup.totalPaid ?? split.processorMarkup.expectedTotalPaid ?? 0),
        0,
      ),
  );
  const canUseProcessorMarkupRollup =
    structuredProcessorMarkupTotal > 0 &&
    (totalFeesRaw <= 0 ||
      (structuredInterchangePaid > 0 && Math.abs(totalFeesRaw - structuredInterchangePaid) <= Math.max(1, structuredInterchangePaid * 0.01)));
  const hasStructuredFeeSource =
    hasStructuredRollup || selectedFeeColumns.length > 0 || structuredInterchangePaid > 0 || structuredProcessorMarkupTotal > 0;

  if (hasStructuredRollup) {
    usedStructuredRollup = true;
    totalVolume = toMoney(structuredRollup.totalVolume ?? 0);
    totalFeesRaw = structuredRollup.totalFees ?? 0;
    feeBuckets.clear();
  } else if (totalFeesRaw <= 0 && (structuredInterchangePaid > 0 || structuredProcessorMarkupTotal > 0)) {
    totalFeesRaw = structuredInterchangePaid + structuredProcessorMarkupTotal;
    if (structuredInterchangePaid > 0) {
      feeBuckets.set("card brand interchange detail", structuredInterchangePaid);
    }
    if (structuredProcessorMarkupTotal > 0) {
      feeBuckets.set("processor markup detail", structuredProcessorMarkupTotal);
    }
  } else if (canUseProcessorMarkupRollup) {
    totalFeesRaw += structuredProcessorMarkupTotal;
    feeBuckets.set("processor markup detail", structuredProcessorMarkupTotal);
  }

  if (doc.sourceType === "pdf" && doc.extraction.mode === "structured" && totalFeesRaw <= 0) {
    const txt = doc.textPreview.toLowerCase();
    const roughFees = (txt.match(/fee|charge|commission|markup|assessment/g) ?? []).length;
    totalFeesRaw += roughFees * 0.4;
    feeBuckets.set("statement detected fees", roughFees * 0.4);
  }

  const totalFees = toMoney(totalFeesRaw);
  const effectiveRate = totalVolume > 0 ? toPct((totalFees / totalVolume) * 100) : 0;
  const guideMeasures = structuredFacts.guideMeasures;
  const interchangeTotalPaid = structuredFacts.interchangeAudit.totalPaid ?? 0;

  const structuredFeeBreakdown = usedStructuredRollup
    ? structuredFeeRowsToBreakdown(structuredRollup.feeRows, totalFees, processorName)
    : [];
  const structuredBreakdownTotal = structuredFeeBreakdown.reduce((sum, row) => sum + row.amount, 0);
  if (usedStructuredRollup && totalFees > structuredBreakdownTotal + 0.01) {
    structuredFeeBreakdown.push(
      withFeeClassification(
        {
          label: "uncategorized statement fees",
          amount: toMoney(totalFees - structuredBreakdownTotal),
          sharePct: toPct(((totalFees - structuredBreakdownTotal) / totalFees) * 100),
          sourceSection: "Statement summary",
          evidenceLine: "Remainder between statement total fees and section-classified fee rows",
        },
        { processorName },
      ),
    );
  }

  const feeBreakdown: FeeBreakdownRow[] = (
    usedStructuredRollup
      ? structuredFeeBreakdown
      : [...feeBuckets.entries()]
          .map(([label, amount]) => {
            const roundedAmount = toMoney(amount);
            const matchesInterchangeAudit =
              interchangeTotalPaid > 0 &&
              Math.abs(roundedAmount - interchangeTotalPaid) <= Math.max(1, interchangeTotalPaid * 0.01) &&
              includesAny(label, ["interchange", "card brand", "program", "fee amount", "fees paid", "total paid"]);

            return {
              label: matchesInterchangeAudit ? "card brand interchange detail" : label,
              amount: roundedAmount,
              sharePct: totalFees > 0 ? toPct((amount / totalFees) * 100) : 0,
              sourceSection: matchesInterchangeAudit ? "Interchange detail" : "Structured fee column",
              evidenceLine: matchesInterchangeAudit ? "Rollup from captured interchange audit rows" : label,
            };
          })
          .map((row) =>
            withFeeClassification(
              {
                ...row,
              },
              { processorName },
            ),
          )
  )
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15);

  const benchmarkBase = benchmarkForBusinessType(businessType);
  const benchmark: BenchmarkResult = {
    ...benchmarkBase,
    status:
      effectiveRate < benchmarkBase.lowerRate
        ? "below"
        : effectiveRate > benchmarkBase.upperRate
          ? "above"
          : "within",
    deltaFromUpperRate: toPct(effectiveRate - benchmarkBase.upperRate),
  };

  const periodKeys = doc.headers.filter((h) => includesAny(h.toLowerCase(), PERIOD_TERMS));
  const periodMap = new Map<string, { volume: number; fees: number }>();
  const feeKeySet = new Set(selectedFeeColumns.map((c) => c.key));

  for (const row of sampled) {
    const period = inferPeriod(row, periodKeys);
    if (!period) continue;
    const current = periodMap.get(period) ?? { volume: 0, fees: 0 };

    if (selectedVolume && typeof row[selectedVolume.key] === "number") {
      current.volume += Math.max(0, row[selectedVolume.key] as number);
    }

    for (const key of feeKeySet) {
      const value = row[key];
      if (typeof value !== "number") continue;
      current.fees += Math.abs(value);
    }

    periodMap.set(period, current);
  }

  const trend: TrendPoint[] = [...periodMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([period, totals]) => {
      const volume = toMoney(totals.volume);
      const fees = toMoney(totals.fees);
      const rate = volume > 0 ? toPct((fees / volume) * 100) : 0;
      return { period, volume, fees, effectiveRate: rate };
    });

  const observedMonths = Math.max(1, trend.length);
  const estimatedMonthlyVolume = toMoney(totalVolume / observedMonths);
  const estimatedMonthlyFees = toMoney(totalFees / observedMonths);
  const estimatedAnnualFees = toMoney(estimatedMonthlyFees * 12);
  const level3Optimization = buildLevel3OptimizationModel(doc, structuredFacts, observedMonths);

  const suspiciousFees: SuspiciousFee[] = feeBreakdown
    .filter((f) => f.amount > 0)
    .filter(
      (f) =>
        f.sharePct >= 6 ||
        includesAny(f.label, ["pci", "noncompliance", "statement", "batch", "gateway", "monthly", "minimum", "admin"]),
    )
    .slice(0, 8)
    .map((f) => ({
      label: f.label,
      amount: f.amount,
      severity: severityFromShare(f.sharePct),
      reason: includesAny(f.label, ["pci", "noncompliance", "statement", "monthly", "minimum", "admin"])
        ? "Looks like an ancillary fee that is often negotiable or removable."
        : `Represents ${f.sharePct.toFixed(2)}% of all fees, which is large enough to audit.`,
    }));

  const savingsOpportunities: SavingsOpportunity[] = [];

  if (benchmark.status === "above") {
    const targetRate = (benchmark.lowerRate + benchmark.upperRate) / 2;
    const reducibleRate = Math.max(0, effectiveRate - targetRate);
    const annualSavings = toMoney((estimatedMonthlyVolume * reducibleRate * 12) / 100);
    savingsOpportunities.push({
      title: "Reprice blended rate closer to benchmark midpoint",
      detail: `Current effective rate (${effectiveRate.toFixed(2)}%) sits above the benchmark (${benchmark.lowerRate.toFixed(2)}%-${benchmark.upperRate.toFixed(2)}%).`,
      monthlySavingsUsd: toMoney(annualSavings / 12),
      annualSavingsUsd: annualSavings,
      effort: "medium",
    });
  }

  const ancillaryPool = suspiciousFees
    .filter((f) => includesAny(f.label, ["pci", "statement", "monthly", "minimum", "batch", "gateway", "admin"]))
    .reduce((acc, cur) => acc + cur.amount, 0);

  if (ancillaryPool > 0) {
    const annualSavings = toMoney((ancillaryPool / observedMonths) * 12 * 0.7);
    savingsOpportunities.push({
      title: "Reduce or remove ancillary platform fees",
      detail: "Ancillary statement/platform charges are frequently negotiable when total processing volume is meaningful.",
      monthlySavingsUsd: toMoney(annualSavings / 12),
      annualSavingsUsd: annualSavings,
      effort: "low",
    });
  }

  const monthlyMinimumTopUp = guideMeasures.monthlyMinimum?.topUpUsd;
  if (isPositiveAmount(monthlyMinimumTopUp)) {
    const monthlySavings = toMoney(monthlyMinimumTopUp / observedMonths);
    savingsOpportunities.push({
      title: "Remove monthly minimum top-up",
      detail: `Structured statement sections modeled a monthly minimum top-up of ${formatMoney(monthlyMinimumTopUp)}.`,
      monthlySavingsUsd: monthlySavings,
      annualSavingsUsd: toMoney(monthlySavings * 12),
      effort: "low",
    });
  }

  const expressFundingPremium = guideMeasures.expressFundingPremium;
  if (isPositiveAmount(expressFundingPremium?.premiumUsd)) {
    const monthlySavings = toMoney(expressFundingPremium.premiumUsd / observedMonths);
    savingsOpportunities.push({
      title: "Validate express funding premium",
      detail:
        expressFundingPremium.premiumBps !== null
          ? `Structured statement sections modeled express funding at ${expressFundingPremium.premiumBps.toFixed(2)} bps.`
          : "Structured statement sections captured an express funding premium amount.",
      monthlySavingsUsd: monthlySavings,
      annualSavingsUsd: toMoney(monthlySavings * 12),
      effort: "low",
    });
  }

  const savingsShareAdjustment = guideMeasures.savingsShareAdjustment;
  if (isPositiveAmount(savingsShareAdjustment?.retainedSavingsUsd)) {
    const monthlySavings = toMoney(savingsShareAdjustment.retainedSavingsUsd / observedMonths);
    savingsOpportunities.push({
      title: "Challenge savings-share adjustment",
      detail:
        savingsShareAdjustment.savingsSharePct !== null
          ? `Structured statement sections modeled processor-retained savings at ${savingsShareAdjustment.savingsSharePct.toFixed(2)}%.`
          : "Structured statement sections captured a savings-share adjustment amount.",
      monthlySavingsUsd: monthlySavings,
      annualSavingsUsd: toMoney(monthlySavings * 12),
      effort: "medium",
    });
  }

  if (isPositiveAmount(level3Optimization.estimatedMonthlySavingsUsd)) {
    savingsOpportunities.push({
      title: "Enable Level 3 data pass-through",
      detail:
        level3Optimization.missingFields.length > 0
          ? `Commercial-card volume was detected; missing Level 3 field signals: ${level3Optimization.missingFields.join(", ")}.`
          : "Commercial-card volume was detected with required Level 3 field signals present.",
      monthlySavingsUsd: level3Optimization.estimatedMonthlySavingsUsd,
      annualSavingsUsd: level3Optimization.estimatedAnnualSavingsUsd ?? toMoney(level3Optimization.estimatedMonthlySavingsUsd * 12),
      effort: "medium",
    });
  }

  const largestBucket = feeBreakdown[0];
  if (largestBucket && includesAny(largestBucket.label, ["markup", "processing", "service"])) {
    const annualSavings = toMoney((largestBucket.amount / observedMonths) * 12 * 0.2);
    savingsOpportunities.push({
      title: "Negotiate processor markup on dominant fee bucket",
      detail: `${largestBucket.label} is your largest bucket at ${formatMoney(largestBucket.amount)} and should be repriced first.`,
      monthlySavingsUsd: toMoney(annualSavings / 12),
      annualSavingsUsd: annualSavings,
      effort: "medium",
    });
  }

  const estimatedAnnualSavings = toMoney(savingsOpportunities.reduce((acc, s) => acc + s.annualSavingsUsd, 0));

  const kpis: KpiMetric[] = [
    {
      label: "Effective Rate",
      value: `${effectiveRate.toFixed(2)}%`,
      note: `Total fees (${formatMoney(totalFees)}) / total volume (${formatMoney(totalVolume)}).`,
    },
    {
      label: "Estimated Monthly Fees",
      value: formatMoney(estimatedMonthlyFees),
      note: `Annualized run-rate is about ${formatMoney(estimatedAnnualFees)}.`,
    },
    {
      label: "Top Fee Concentration",
      value: largestBucket ? `${largestBucket.sharePct.toFixed(2)}%` : "N/A",
      note: largestBucket
        ? `${largestBucket.label} contributes ${formatMoney(largestBucket.amount)} of total fees.`
        : "No dominant fee category detected.",
    },
    {
      label: "Potential Annual Savings",
      value: formatMoney(estimatedAnnualSavings),
      note: "Modeled from repricing and ancillary-fee reduction opportunities.",
    },
  ];

  const insights: FeeInsight[] = [];

  insights.push({
    title: "Rate health check",
    detail:
      benchmark.status === "above"
        ? `Your effective rate (${effectiveRate.toFixed(2)}%) is ${Math.abs(benchmark.deltaFromUpperRate).toFixed(2)} percentage points above the benchmark ceiling.`
        : benchmark.status === "within"
          ? `Your effective rate (${effectiveRate.toFixed(2)}%) is inside the expected benchmark range (${benchmark.lowerRate.toFixed(2)}%-${benchmark.upperRate.toFixed(2)}%).`
          : `Your effective rate (${effectiveRate.toFixed(2)}%) is below the benchmark floor, which may indicate a favorable rate mix or incomplete fee capture.`,
    impactUsd: benchmark.status === "above" ? toMoney((estimatedMonthlyVolume * Math.max(0, benchmark.deltaFromUpperRate) * 12) / 100) : 0,
  });

  if (largestBucket) {
    insights.push({
      title: "Largest fee driver",
      detail: `${largestBucket.label} is the biggest fee category at ${formatMoney(largestBucket.amount)} (${largestBucket.sharePct.toFixed(2)}% of all fees).`,
      impactUsd: largestBucket.amount,
    });
  }

  if (structuredFacts.interchangeAudit.rowCount > 0) {
    insights.push({
      title: "Interchange audit detail captured",
      detail: `${structuredFacts.interchangeAudit.rowCount} row(s) were preserved as structured interchange detail before the summary fee buckets were calculated.`,
      impactUsd: structuredFacts.interchangeAudit.totalPaid ?? 0,
    });
  }

  if (structuredFacts.blendedFeeSplits.length > 0) {
    insights.push({
      title: "Blended pricing rows normalized",
      detail: `${structuredFacts.blendedFeeSplits.length} blended row pair(s) were split into card-brand interchange and processor markup before fee analysis.`,
      impactUsd: structuredProcessorMarkupTotal,
    });
  }

  for (const s of suspiciousFees.slice(0, 4)) {
    insights.push({
      title: `Audit candidate: ${s.label}`,
      detail: `${s.reason} Current amount: ${formatMoney(s.amount)}. Severity: ${s.severity.toUpperCase()}.`,
      impactUsd: s.amount,
    });
  }

  for (const s of savingsOpportunities.slice(0, 5)) {
    insights.push({
      title: s.title,
      detail: `${s.detail} Estimated annual savings: ${formatMoney(s.annualSavingsUsd)}.`,
      impactUsd: s.annualSavingsUsd,
    });
  }

  if (trend.length >= 2) {
    const last = trend[trend.length - 1];
    const prev = trend[trend.length - 2];
    const deltaRate = toPct(last.effectiveRate - prev.effectiveRate);
    insights.push({
      title: "Recent trend movement",
      detail: `Effective rate moved from ${prev.effectiveRate.toFixed(2)}% (${prev.period}) to ${last.effectiveRate.toFixed(2)}% (${last.period}), a ${deltaRate >= 0 ? "+" : ""}${deltaRate.toFixed(2)} pp change.`,
      impactUsd: toMoney((last.volume * Math.max(0, last.effectiveRate - benchmark.upperRate)) / 100),
    });
  }

  const dynamicFields: DynamicField[] = [...numericColumns]
    .filter((key) => key.trim().length > 0)
    .filter((key) => !includesAny(key, [...FEE_TERMS, ...VOLUME_TERMS, "rate", "%", "count", "qty"]))
    .slice(0, 12)
    .map((label) => ({
      label,
      value: toMoney((columnStats.get(label)?.sum ?? 0) / Math.max(1, columnStats.get(label)?.count ?? 1)),
      confidence: 0.65,
    }));

  const dataQuality: DataQualitySignal[] = [];

  if (usedStructuredRollup) {
    dataQuality.push({
      level: "info",
      message: "Used section-first statement rollup for total volume, total fees, and fee buckets; generic numeric-column inference was not needed.",
    });
  }

  if (!selectedVolume && !usedStructuredRollup) {
    dataQuality.push({ level: "critical", message: "No clear volume column was detected. Volume-based metrics may be inaccurate." });
  }

  if (selectedFeeColumns.length === 0 && !usedStructuredRollup) {
    dataQuality.push({ level: "critical", message: "No explicit fee columns were detected. Fee totals may be underreported." });
  }

  if (sampled.length < doc.rows.length) {
    dataQuality.push({
      level: "warning",
      message: `Only the first ${sampled.length} rows were analyzed out of ${doc.rows.length} rows to protect performance.`,
    });
  }

  if (doc.sourceType === "pdf") {
    dataQuality.push({
      level: "warning",
      message: "PDF parsing relies on text extraction and may miss table structure. CSV exports generally produce more accurate results.",
    });
  }

  if (structuredFacts.interchangeAudit.rowCount > 0) {
    dataQuality.push({
      level: "info",
      message: `Captured ${structuredFacts.interchangeAudit.rowCount} interchange audit row(s) before fee rollup, preserving transaction count, volume, rate, per-item fee, and total paid where present.`,
    });
  } else if (doc.extraction.mode === "structured") {
    dataQuality.push({
      level: "warning",
      message:
        "No interchange detail rows were captured. If the statement contains an interchange table, provide a clearer export or processor-specific layout mapping.",
    });
  }

  if (structuredFacts.blendedFeeSplits.length > 0) {
    dataQuality.push({
      level: "info",
      message:
        processorMarkupAudit.effectiveRateBps !== null
          ? `Normalized ${structuredFacts.blendedFeeSplits.length} blended pricing row pair(s) into separate interchange and processor-markup components (${processorMarkupAudit.effectiveRateBps.toFixed(2)} bps effective markup).`
          : `Normalized ${structuredFacts.blendedFeeSplits.length} blended pricing row pair(s) into separate interchange and processor-markup components.`,
    });
  }

  if (dataQuality.length === 0) {
    dataQuality.push({ level: "info", message: "Detected both volume and fee structures with no critical parsing issues." });
  }

  const statementPeriod = trend.length > 0 ? `${trend[0].period} to ${trend[trend.length - 1].period}` : "Inferred from uploaded statement";

  const negotiationChecklist: string[] = [
    `Ask for a line-by-line explanation of '${largestBucket?.label ?? "top fee bucket"}' and request a lower rate tier.`,
    "Request a full pass-through schedule showing interchange, assessments, and processor markup separately.",
    "Ask to waive monthly/statement/platform fees for at least 12 months based on your processing volume.",
    "Request downgrade and non-qualified volume reports and ask for root-cause remediation.",
    "Negotiate a written cap on annual effective rate increases and non-compliance penalties.",
    "Obtain side-by-side quote from another provider to create pricing leverage.",
  ];

  const actionPlan: string[] = [
    "Week 1: Export the last 6 months of statements and reconcile total deposits vs billed fees.",
    "Week 1: Audit all ancillary fees (PCI, statement, gateway, monthly minimum, batch) and mark removable items.",
    "Week 2: Send a repricing request using your current effective rate and benchmark target as anchors.",
    "Week 2: Escalate unresolved fee disputes to retention/underwriting teams, not only frontline support.",
    "Week 3: Run a side-by-side savings model for staying vs switching, including conversion costs.",
    "Week 4: Implement the chosen provider strategy and monitor effective rate weekly for regression.",
  ];

  const executiveSummary =
    benchmark.status === "above"
      ? `You appear to be over benchmark by ${Math.abs(benchmark.deltaFromUpperRate).toFixed(2)} percentage points. Modeled annual savings opportunity is ${formatMoney(estimatedAnnualSavings)} if repricing and ancillary cleanup are executed.`
      : `Your blended fees are within expected benchmark range. Main value will come from tightening ancillary fees and ongoing monitoring to prevent rate drift.`;

  const confidence: AnalysisSummary["confidence"] =
    usedStructuredRollup && dataQuality.every((d) => d.level !== "critical")
      ? "high"
      : selectedVolume && selectedFeeColumns.length > 0 && dataQuality.every((d) => d.level !== "critical")
      ? "high"
      : selectedVolume || selectedFeeColumns.length > 0
        ? "medium"
        : "low";

  const summary: AnalysisSummary = {
    businessType,
    processorName,
    sourceType: doc.sourceType,
    statementPeriod,
    executiveSummary,
    totalVolume,
    totalFees,
    effectiveRate,
    estimatedMonthlyVolume,
    estimatedMonthlyFees,
    estimatedAnnualFees,
    estimatedAnnualSavings,
    benchmark,
    statementSections: structuredFacts.statementSections,
    interchangeAudit: structuredFacts.interchangeAudit,
    interchangeAuditRows: structuredFacts.interchangeAuditRows,
    blendedFeeSplits: structuredFacts.blendedFeeSplits,
    processorMarkupAudit,
    hiddenMarkupAudit,
    structuredFeeFindings: structuredFacts.structuredFeeFindings,
    bundledPricing: structuredFacts.bundledPricing,
    noticeFindings: structuredFacts.noticeFindings,
    repricingEvents: structuredFacts.repricingEvents,
    downgradeAnalysis: structuredFacts.downgradeAnalysis,
    perItemFeeModel: structuredFacts.perItemFeeModel,
    guideMeasures,
    level3Optimization,
    kpis,
    feeBreakdown,
    suspiciousFees,
    savingsOpportunities,
    negotiationChecklist,
    actionPlan,
    trend,
    dataQuality,
    dynamicFields,
    insights,
    confidence,
  };

  if (
    doc.sourceType === "pdf" &&
    doc.extraction.mode === "structured" &&
    (!hasUsableEconomicTotals(summary) || !hasStructuredFeeSource)
  ) {
    const recoveredSummary = refineTextOnlyPdfSummary(doc, summary);
    if (recoveredSummary) {
      return recoveredSummary;
    }
  }

  return summary;
}
