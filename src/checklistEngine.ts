import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ParsedDocument } from "./parser.js";
import { AnalysisSummary, ChecklistBucket, ChecklistReport, ChecklistRuleResult, RuleStatus } from "./types.js";

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

const PROCESSOR_SIGNATURES: Array<{ id: string; name: string; keywords: string[] }> = [
  { id: "heartland", name: "Heartland Payment Systems", keywords: ["heartland", "hps processing"] },
  { id: "tsys", name: "TSYS", keywords: ["tsys"] },
  {
    id: "fiserv_first_data_interchange_plus",
    name: "Fiserv / First Data (Interchange-Plus)",
    keywords: ["fiserv", "first data", "clover", "omaha, ne 68103-2394"],
  },
  {
    id: "fiserv_first_data_bundled",
    name: "Fiserv / First Data (Bundled)",
    keywords: ["qualified", "mid-qualified", "non-qualified", "fiserv", "first data"],
  },
  { id: "clearent", name: "Clearent", keywords: ["clearent"] },
  { id: "worldpay", name: "Worldpay", keywords: ["worldpay"] },
  { id: "elavon", name: "Elavon", keywords: ["elavon"] },
];

function getTextCorpus(doc: ParsedDocument): string {
  const rowText = doc.rows
    .slice(0, 1500)
    .map((row) => {
      if (typeof row.content === "string" && row.content.trim().length > 0) {
        return row.content;
      }
      // CSV rows do not have a `content` field, so fold key/value pairs into the corpus.
      return Object.entries(row)
        .map(([key, value]) => `${key} ${String(value)}`)
        .join(" ");
    })
    .join("\n");
  return `${doc.textPreview}\n${rowText}`.toLowerCase();
}

function countMatches(text: string, keyword: string): number {
  const safe = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = text.match(new RegExp(safe, "g"));
  return matches?.length ?? 0;
}

function detectProcessor(text: string): {
  detectedProcessorId: string | null;
  detectedProcessorName: string | null;
  confidence: number;
  matchedKeywords: string[];
} {
  let best: { id: string; name: string; score: number; matchedKeywords: string[] } | null = null;

  for (const signature of PROCESSOR_SIGNATURES) {
    const matchedKeywords = signature.keywords.filter((k) => text.includes(k));
    const score = matchedKeywords.reduce((acc, keyword) => acc + Math.max(1, countMatches(text, keyword)), 0);
    if (!best || score > best.score) {
      best = { id: signature.id, name: signature.name, score, matchedKeywords };
    }
  }

  if (!best || best.score === 0) {
    return {
      detectedProcessorId: null,
      detectedProcessorName: null,
      confidence: 0,
      matchedKeywords: [],
    };
  }

  const confidence = Math.min(1, 0.3 + best.score * 0.18);
  return {
    detectedProcessorId: best.id,
    detectedProcessorName: best.name,
    confidence,
    matchedKeywords: best.matchedKeywords,
  };
}

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
  const text = getTextCorpus(doc);

  const processorDetection = detectProcessor(text);

  const universalResults = packs.universal.elements.map((element) => evaluateUniversalRule(element, doc, summary, text));
  const universal: ChecklistBucket = {
    ...countStatuses(universalResults),
    results: universalResults,
  };

  const detectedPack = processorDetection.detectedProcessorId
    ? packs.processors.processors.find((p) => p.processor_id === processorDetection.detectedProcessorId)
    : null;

  let processorResults: ChecklistRuleResult[] = [];
  let skippedReason: string | undefined;

  if (!detectedPack || processorDetection.confidence < 0.5) {
    skippedReason = "Processor detection confidence is low or processor is outside current rule-pack coverage.";
  } else {
    processorResults = detectedPack.checks.map((check, index) =>
      evaluateProcessorRule(`P${String(index + 1).padStart(3, "0")}`, check, doc, text),
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
