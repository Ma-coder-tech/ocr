import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ParsedDocument } from "./parser.js";
import { AnalysisSummary, ChecklistBucket, ChecklistReport, ChecklistRuleResult, RuleStatus } from "./types.js";
import { analyzeTwoBucketStatement } from "./twoBucketAnalysis.js";
import { buildProcessorCorpus, detectProcessorIdentity } from "./processorDetection.js";

type UniversalElement = {
  id: string;
  name: string;
  category: string;
  source_type: "explicit" | "inferred";
};

type MasterChecklist = {
  elements: UniversalElement[];
};

type ProcessorChecklist = {
  processors: Array<{
    processor_id: string;
    name: string;
    checks: string[];
  }>;
  cross_processor_checks: string[];
};

type LoadedChecklists = {
  universal: MasterChecklist;
  processors: ProcessorChecklist;
};

let checklistCachePromise: Promise<LoadedChecklists> | null = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOUNDATION_DIR = path.resolve(__dirname, "..", "data", "merchant-statement-foundation");
const UNIVERSAL_PATH = path.join(FOUNDATION_DIR, "master-checklist.json");
const PROCESSOR_PATH = path.join(FOUNDATION_DIR, "processor-grouped-checklist.json");

const NUMERIC_HEAVY_CATEGORIES = new Set([
  "core_economics_and_formulas",
  "fee_classes",
  "red_flags_and_unnecessary_fees",
  "data_quality_and_downgrade_signals",
  "cost_optimization_levers",
  "ongoing_monitoring_and_review_cadence",
]);

const UNIVERSAL_KEYWORD_RULES: Record<string, RegExp[]> = {
  E014: [/\beffective\b/i, /billing change/i, /terms/i],
  E015: [/go online/i, /website/i, /online/i],
  E023: [/pci\s*non-?compliance/i, /non-?compliance/i],
  E024: [/non[\s-]?emv/i],
  E025: [/\brisk fee\b/i],
  E031: [/customer intelligence suite/i],
  E033: [/non[\s-]?emv/i],
  E038: [/qualified/i, /mid-?qualified/i, /non-?qualified/i],
  E043: [/eirf/i, /non-?qualified/i],
  E061: [/surcharge/i],
  E062: [/cash discount/i],
  E063: [/surcharge/i, /3%/i],
  E064: [/surcharge/i, /debit/i],
  E065: [/surcharge/i],
};

const UNIVERSAL_FAIL_ON_MATCH = new Set(["E023", "E024", "E033", "E064"]);

function countStatuses(results: ChecklistRuleResult[]): Omit<ChecklistBucket, "results"> {
  const bucket = {
    total: results.length,
    pass: 0,
    fail: 0,
    warning: 0,
    unknown: 0,
    notApplicable: 0,
  };

  for (const result of results) {
    if (result.status === "pass") bucket.pass += 1;
    else if (result.status === "fail") bucket.fail += 1;
    else if (result.status === "warning") bucket.warning += 1;
    else if (result.status === "unknown") bucket.unknown += 1;
    else if (result.status === "not_applicable") bucket.notApplicable += 1;
  }

  return bucket;
}

function firstEvidence(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match ? `Matched pattern: ${match[0]}` : null;
}

function evaluateUniversalRule(
  element: UniversalElement,
  doc: ParsedDocument,
  summary: AnalysisSummary,
  text: string,
): ChecklistRuleResult {
  let status: RuleStatus = "unknown";
  let reason = "Automated evaluator for this rule is not fully implemented yet.";
  const evidence: string[] = [];

  if (element.id === "E001" || element.id === "E003" || element.id === "E004") {
    const analysis = analyzeTwoBucketStatement(doc, summary);
    const numericEvidence = [
      analysis.totalFees !== null ? `Total fees: ${analysis.totalFees.toFixed(2)}` : null,
      analysis.cardBrandTotal !== null ? `Card-brand total: ${analysis.cardBrandTotal.toFixed(2)}` : null,
      analysis.processorOwnedTotal !== null ? `Processor-owned total: ${analysis.processorOwnedTotal.toFixed(2)}` : null,
      analysis.cardBrandSharePct !== null ? `Card-brand share: ${analysis.cardBrandSharePct.toFixed(2)}%` : null,
      analysis.processorOwnedSharePct !== null ? `Processor-owned share: ${analysis.processorOwnedSharePct.toFixed(2)}%` : null,
      analysis.reconciliationDeltaUsd !== null ? `Reconciliation delta: ${analysis.reconciliationDeltaUsd.toFixed(2)}` : null,
    ].filter((item): item is string => Boolean(item));

    const lineEvidence = [
      ...analysis.evidence.cardBrand,
      ...analysis.evidence.processorOwned,
      ...analysis.evidence.totalFees,
    ]
      .slice(0, 6)
      .map((item) => `${item.label}: ${item.line}`);

    evidence.push(...numericEvidence, ...lineEvidence);

    if (!analysis.available) {
      return {
        id: element.id,
        title: element.name,
        status: "unknown",
        reason: analysis.reason,
        evidence,
      };
    }

    if (element.id === "E001") {
      return {
        id: element.id,
        title: element.name,
        status: "pass",
        reason: analysis.reason,
        evidence,
      };
    }

    if (element.id === "E003") {
      const within = analysis.cardBrandSharePct !== null && analysis.cardBrandSharePct >= 60 && analysis.cardBrandSharePct <= 80;
      return {
        id: element.id,
        title: element.name,
        status: within ? "pass" : "warning",
        reason: within
          ? `Card-brand share (${analysis.cardBrandSharePct?.toFixed(2)}%) is inside the expected 60%-80% range.`
          : `Card-brand share (${analysis.cardBrandSharePct?.toFixed(2)}%) is outside the expected 60%-80% range.`,
        evidence,
      };
    }

    const within =
      analysis.processorOwnedSharePct !== null &&
      analysis.processorOwnedSharePct >= 20 &&
      analysis.processorOwnedSharePct <= 40;
    return {
      id: element.id,
      title: element.name,
      status: within ? "pass" : "warning",
      reason: within
        ? `Processor-owned share (${analysis.processorOwnedSharePct?.toFixed(2)}%) is inside the expected 20%-40% range.`
        : `Processor-owned share (${analysis.processorOwnedSharePct?.toFixed(2)}%) is outside the expected 20%-40% range.`,
      evidence,
    };
  }

  if (element.id === "E002") {
    const rowCount = summary.interchangeAudit?.rowCount ?? 0;
    const auditRows = summary.interchangeAuditRows ?? summary.interchangeAudit?.rows ?? [];
    if (rowCount > 0) {
      return {
        id: element.id,
        title: element.name,
        status: "pass",
        reason: `Interchange is modeled as row-level detail (${rowCount} row${rowCount === 1 ? "" : "s"} captured), not a single flat wholesale rate.`,
        evidence: auditRows.slice(0, 4).map((row) => row.evidenceLine),
      };
    }
    return {
      id: element.id,
      title: element.name,
      status: /interchange|card brand|program fees/i.test(text) ? "warning" : "unknown",
      reason: /interchange|card brand|program fees/i.test(text)
        ? "Interchange text was detected, but row-level interchange detail was not captured."
        : "No interchange detail table was detected in the extracted statement text.",
      evidence,
    };
  }

  if (element.id === "E010") {
    const sections = summary.statementSections ?? [];
    if (sections.length > 0) {
      return {
        id: element.id,
        title: element.name,
        status: "pass",
        reason: `Statement was parsed into ${sections.length} structured section${sections.length === 1 ? "" : "s"} before fee rollup.`,
        evidence: sections.slice(0, 5).map((section) => `${section.type}: ${section.title}`),
      };
    }
    return {
      id: element.id,
      title: element.name,
      status: "warning",
      reason: "No structured statement sections were identified; analysis may be relying on generic numeric columns.",
      evidence,
    };
  }

  if (element.id === "E011") {
    const rows = summary.interchangeAuditRows ?? summary.interchangeAudit?.rows ?? [];
    if (rows.length > 0) {
      const fullyCapturedRows = rows.filter(
        (row) =>
          row.transactionCount !== null &&
          row.volume !== null &&
          row.ratePercent !== null &&
          row.perItemFee !== null &&
          row.totalPaid !== null,
      );
      const inferredPaidRows = rows.filter((row) => row.totalPaid === null && row.expectedTotalPaid !== null);
      return {
        id: element.id,
        title: element.name,
        status: fullyCapturedRows.length === rows.length ? "pass" : "warning",
        reason:
          fullyCapturedRows.length === rows.length
            ? `All ${rows.length} captured interchange row${rows.length === 1 ? "" : "s"} include count, volume, rate, per-item fee, and an extracted total paid value.`
            : inferredPaidRows.length > 0
              ? `${fullyCapturedRows.length} of ${rows.length} captured interchange row${rows.length === 1 ? "" : "s"} include an extracted total paid value; ${inferredPaidRows.length} rely on calculated expected paid only.`
              : `${fullyCapturedRows.length} of ${rows.length} captured interchange row${rows.length === 1 ? "" : "s"} include the full audit field set.`,
        evidence: rows
          .slice(0, 5)
          .map(
            (row) =>
              `${row.label}: count=${row.transactionCount ?? "n/a"}, volume=${row.volume ?? "n/a"}, rate=${row.ratePercent ?? "n/a"}%, perItem=${row.perItemFee ?? "n/a"}, paid=${row.totalPaid ?? "n/a"}, expected=${row.expectedTotalPaid ?? "n/a"}`,
          ),
      };
    }
    return {
      id: element.id,
      title: element.name,
      status: /interchange|program fees|card brand/i.test(text) ? "warning" : "not_applicable",
      reason: /interchange|program fees|card brand/i.test(text)
        ? "Interchange language was detected, but no row-level audit detail was captured."
        : "No interchange detail signal was detected in this statement.",
      evidence,
    };
  }

  if (element.id === "E012") {
    const rowsWithRates = (summary.interchangeAuditRows ?? summary.interchangeAudit?.rows ?? []).filter(
      (row) => row.ratePercent !== null && row.rateBps !== null,
    );
    if (rowsWithRates.length > 0) {
      return {
        id: element.id,
        title: element.name,
        status: "pass",
        reason: `${rowsWithRates.length} interchange rate${rowsWithRates.length === 1 ? "" : "s"} normalized to both percent and basis points.`,
        evidence: rowsWithRates.slice(0, 5).map((row) => `${row.label}: ${row.ratePercent}% / ${row.rateBps} bps`),
      };
    }
    return {
      id: element.id,
      title: element.name,
      status: /%|\bbps\b|basis|0\.00\d/i.test(text) ? "warning" : "unknown",
      reason: "No normalized interchange rate rows were available for basis-point validation.",
      evidence,
    };
  }

  if (element.id === "E013") {
    const splits = summary.blendedFeeSplits ?? [];
    if (splits.length > 0) {
      return {
        id: element.id,
        title: element.name,
        status: "pass",
        reason: `${splits.length} blended pricing row pair${splits.length === 1 ? "" : "s"} split into interchange and processor-markup components.`,
        evidence: splits
          .slice(0, 5)
          .map(
            (split) =>
              `${split.label}: processor=${split.processorMarkup.totalPaid ?? split.processorMarkup.expectedTotalPaid ?? "n/a"}, interchange=${split.interchange.totalPaid ?? split.interchange.expectedTotalPaid ?? "n/a"}`,
          ),
      };
    }
    return {
      id: element.id,
      title: element.name,
      status: /tsys|top number|bottom number|blended|bundl/i.test(text) ? "warning" : "not_applicable",
      reason: /tsys|top number|bottom number|blended|bundl/i.test(text)
        ? "Blended-pricing language was detected, but no top/bottom row pair was normalized."
        : "No blended-pricing presentation signal was detected in this statement.",
      evidence,
    };
  }

  if (element.id === "E006") {
    if (summary.totalVolume > 0) {
      status = "pass";
      reason = `Net effective rate computed (${summary.effectiveRate.toFixed(2)}%).`;
    } else {
      status = doc.extraction.mode === "structured" ? "warning" : "unknown";
      reason = "Net effective rate could not be computed from structured fee and volume values.";
    }
    return { id: element.id, title: element.name, status, reason, evidence };
  }

  const patterns = UNIVERSAL_KEYWORD_RULES[element.id] ?? [];
  const anyMatched = patterns.some((p) => p.test(text));

  if (patterns.length > 0) {
    if (anyMatched) {
      status = UNIVERSAL_FAIL_ON_MATCH.has(element.id) ? "fail" : "warning";
      reason = "Rule-related keyword was detected in extracted statement text.";
      for (const pattern of patterns) {
        const hit = firstEvidence(text, pattern);
        if (hit) evidence.push(hit);
      }
    } else if (element.id === "E061" || element.id === "E062" || element.id === "E063" || element.id === "E065") {
      status = "not_applicable";
      reason = "No surcharge/cash-discount signal detected in statement text.";
    } else {
      status = "unknown";
      reason = "No direct text signal detected for this rule.";
    }
    return { id: element.id, title: element.name, status, reason, evidence };
  }

  if (doc.extraction.mode !== "structured" && NUMERIC_HEAVY_CATEGORIES.has(element.category)) {
    status = "unknown";
    reason = "Rule requires structured numeric extraction, but current document is text-only/unusable.";
    return { id: element.id, title: element.name, status, reason, evidence };
  }

  return { id: element.id, title: element.name, status, reason, evidence };
}

function processorPatternForCheck(check: string): RegExp | null {
  const lower = check.toLowerCase();
  if (lower.includes("non-emv")) return /non[\s-]?emv/i;
  if (lower.includes("pci")) return /\bpci\b/i;
  if (lower.includes("monthly minimum")) return /monthly minimum/i;
  if (lower.includes("authorization fee")) return /authorization/i;
  if (lower.includes("customer intelligence suite")) return /customer intelligence suite/i;
  if (lower.includes("repricing") || lower.includes("fine print") || lower.includes("effective")) return /effective|billing change|terms/i;
  if (lower.includes("eirf") || lower.includes("non-qualified") || lower.includes("downgrade")) return /eirf|non-?qualified|downgrade/i;
  if (lower.includes("surcharge")) return /surcharge/i;
  return null;
}

function evaluateProcessorRule(
  id: string,
  title: string,
  doc: ParsedDocument,
  summary: AnalysisSummary,
  text: string,
): ChecklistRuleResult {
  if (doc.extraction.mode === "unusable") {
    return {
      id,
      title,
      status: "unknown",
      reason: "No extractable text; processor-specific rule cannot be evaluated.",
      evidence: [],
    };
  }

  if (/blended|top number|bottom number|unbundl|normalize blended|processor component|interchange component/i.test(title)) {
    const splits = summary.blendedFeeSplits ?? [];
    if (splits.length > 0) {
      return {
        id,
        title,
        status: "pass",
        reason: `${splits.length} blended pricing row pair${splits.length === 1 ? "" : "s"} normalized into separate interchange and processor components.`,
        evidence: splits.slice(0, 4).map((split) => split.evidenceLine),
      };
    }
    return {
      id,
      title,
      status: /tsys|blended|bundl/i.test(text) ? "warning" : "unknown",
      reason: /tsys|blended|bundl/i.test(text)
        ? "TSYS/blended-pricing context detected, but no blended row pair was split."
        : "Rule loaded, but no blended-pricing signal was found in the current statement text.",
      evidence: [],
    };
  }

  const pattern = processorPatternForCheck(title);
  if (!pattern) {
    return {
      id,
      title,
      status: "unknown",
      reason: "Rule loaded, but automated evaluator for this check is pending.",
      evidence: [],
    };
  }

  if (pattern.test(text)) {
    return {
      id,
      title,
      status: "warning",
      reason: "A check-related signal was found in extracted text and should be reviewed.",
      evidence: [`Matched pattern: ${text.match(pattern)?.[0] ?? "signal"}`],
    };
  }

  return {
    id,
    title,
    status: "not_applicable",
    reason: "No direct text signal found for this check in the current statement.",
    evidence: [],
  };
}

function evaluateCrossChecks(doc: ParsedDocument, summary: AnalysisSummary, text: string, checks: string[]): ChecklistBucket {
  const resolveCrossCheckTag = (check: string):
    | "net_effective_rate"
    | "fee_split"
    | "share_benchmark"
    | "unnecessary_fees"
    | "hidden_markup"
    | "fee_drift"
    | "surcharge_cap"
    | "surcharge_debit_exclusion"
    | "surcharge_uniformity"
    | "debit_identification_controls"
    | "review_cadence"
    | "unknown" => {
    const lower = check.toLowerCase();
    if (lower.includes("net effective rate") || lower.includes("total fees divided by total sales")) {
      return "net_effective_rate";
    }
    if (lower.includes("split all fees") || (lower.includes("card-brand") && lower.includes("processor-owned"))) {
      return "fee_split";
    }
    if (lower.includes("benchmark") && lower.includes("card-brand share")) {
      return "share_benchmark";
    }
    if (lower.includes("unnecessary fees")) {
      return "unnecessary_fees";
    }
    if (lower.includes("hidden markup")) {
      return "hidden_markup";
    }
    if (lower.includes("fee drift") || lower.includes("newly introduced recurring fees")) {
      return "fee_drift";
    }
    if (lower.includes("surcharge cap")) {
      return "surcharge_cap";
    }
    if (lower.includes("debit exclusion")) {
      return "surcharge_debit_exclusion";
    }
    if (lower.includes("uniform surcharge")) {
      return "surcharge_uniformity";
    }
    if (lower.includes("debit identification controls") || lower.includes("bin automation")) {
      return "debit_identification_controls";
    }
    if (lower.includes("review cadence") || lower.includes("6 to 12 months")) {
      return "review_cadence";
    }
    return "unknown";
  };

  const hasSurchargeContext = /surcharge|cash discount|debit/i.test(text);
  const results: ChecklistRuleResult[] = checks.map((check, index) => {
    const id = `X${String(index + 1).padStart(3, "0")}`;
    const tag = resolveCrossCheckTag(check);

    if (tag === "net_effective_rate") {
      if (summary.totalVolume > 0) {
        return {
          id,
          title: check,
          status: "pass",
          reason: `Net effective rate available (${summary.effectiveRate.toFixed(2)}%).`,
          evidence: [],
        };
      }
      return {
        id,
        title: check,
        status: "unknown",
        reason: "Net effective rate unavailable due to missing structured numeric fields.",
        evidence: [],
      };
    }

    if (
      tag === "surcharge_cap" ||
      tag === "surcharge_debit_exclusion" ||
      tag === "surcharge_uniformity" ||
      tag === "debit_identification_controls"
    ) {
      if (hasSurchargeContext) {
        return {
          id,
          title: check,
          status: "warning",
          reason: "Policy-related keywords detected; compliance checks should be reviewed.",
          evidence: ["Matched surcharge/cash/debit terminology"],
        };
      }
      return {
        id,
        title: check,
        status: "not_applicable",
        reason: "No surcharge/cash-discount context detected in this statement.",
        evidence: [],
      };
    }

    if (
      doc.extraction.mode !== "structured" &&
      (tag === "fee_split" ||
        tag === "share_benchmark" ||
        tag === "unnecessary_fees" ||
        tag === "hidden_markup" ||
        tag === "fee_drift")
    ) {
      return {
        id,
        title: check,
        status: "unknown",
        reason: "Requires structured numeric extraction and table-level parsing.",
        evidence: [],
      };
    }

    if (tag === "review_cadence") {
      return {
        id,
        title: check,
        status: "unknown",
        reason: "Review-cadence rule is loaded but requires policy/workflow tracking not present in statement text alone.",
        evidence: [],
      };
    }

    return {
      id,
      title: check,
      status: "unknown",
      reason: "Rule loaded; automated evaluator is partially implemented.",
      evidence: [],
    };
  });

  return { ...countStatuses(results), results };
}

async function loadChecklists(): Promise<LoadedChecklists> {
  if (checklistCachePromise) {
    return checklistCachePromise;
  }

  checklistCachePromise = (async () => {
    const [universalRaw, processorsRaw] = await Promise.all([
      fs.readFile(UNIVERSAL_PATH, "utf8"),
      fs.readFile(PROCESSOR_PATH, "utf8"),
    ]);

    return {
      universal: JSON.parse(universalRaw) as MasterChecklist,
      processors: JSON.parse(processorsRaw) as ProcessorChecklist,
    };
  })().catch((error) => {
    // Avoid sticky rejected promise: allow subsequent attempts to retry loading.
    checklistCachePromise = null;
    throw error;
  });

  return checklistCachePromise;
}

export async function evaluateChecklistReport(doc: ParsedDocument, summary: AnalysisSummary): Promise<ChecklistReport> {
  const packs = await loadChecklists();
  const text = buildProcessorCorpus(doc);

  const processorDetection = detectProcessorIdentity(doc);

  const universalResults = packs.universal.elements.map((element) => evaluateUniversalRule(element, doc, summary, text));
  const universal: ChecklistBucket = {
    ...countStatuses(universalResults),
    results: universalResults,
  };

  const detectedPack = processorDetection.rulePackId
    ? packs.processors.processors.find((p) => p.processor_id === processorDetection.rulePackId)
    : null;

  let processorResults: ChecklistRuleResult[] = [];
  let skippedReason: string | undefined;

  if (!detectedPack || processorDetection.confidence < 0.5) {
    skippedReason = "Processor detection confidence is low or processor is outside current rule-pack coverage.";
  } else {
    processorResults = detectedPack.checks.map((check, index) =>
      evaluateProcessorRule(`P${String(index + 1).padStart(3, "0")}`, check, doc, summary, text),
    );
  }

  const processorSpecific: ChecklistReport["processorSpecific"] = {
    ...countStatuses(processorResults),
    results: processorResults,
    processorId: detectedPack?.processor_id ?? null,
    processorName: detectedPack?.name ?? null,
    skippedReason,
  };

  const crossProcessor = evaluateCrossChecks(doc, summary, text, packs.processors.cross_processor_checks);

  return {
    extractionMode: doc.extraction.mode,
    extractionQualityScore: doc.extraction.qualityScore,
    extractionReasons: doc.extraction.reasons,
    processorDetection,
    universal,
    processorSpecific,
    crossProcessor,
  };
}
