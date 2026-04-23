import type { ParsedDocument } from "./parser.js";

export type ProcessorDetection = {
  detectedProcessorId: string | null;
  detectedProcessorName: string | null;
  rulePackId: string | null;
  confidence: number;
  matchedKeywords: string[];
  source: "text_preview" | "row_corpus" | "unknown";
};

type ProcessorSignature = {
  id: string;
  name: string;
  rulePackId: string | null;
  keywords: string[];
  contextKeywords?: string[];
};

const PROCESSOR_SIGNATURES: ProcessorSignature[] = [
  {
    id: "heartland",
    name: "Heartland Payment Systems",
    rulePackId: "heartland",
    keywords: ["heartland", "hps processing"],
  },
  { id: "tsys", name: "TSYS", rulePackId: "tsys", keywords: ["tsys"] },
  {
    id: "fiserv_first_data_interchange_plus",
    name: "Fiserv / First Data (Interchange-Plus)",
    rulePackId: "fiserv_first_data_interchange_plus",
    keywords: ["fiserv", "first data", "clover", "omaha, ne 68103-2394"],
  },
  {
    id: "fiserv_first_data_bundled",
    name: "Fiserv / First Data (Bundled)",
    rulePackId: "fiserv_first_data_bundled",
    keywords: ["fiserv", "first data", "clover", "omaha, ne 68103-2394"],
    contextKeywords: ["qualified", "mid-qualified", "non-qualified"],
  },
  {
    id: "clearent",
    name: "Clearent",
    rulePackId: "clearent",
    keywords: ["clearent"],
  },
  {
    id: "worldpay",
    name: "Worldpay",
    rulePackId: "worldpay",
    keywords: ["worldpay"],
  },
  {
    id: "elavon",
    name: "Elavon",
    rulePackId: "elavon",
    keywords: ["elavon"],
  },
  { id: "paysafe", name: "Paysafe", rulePackId: null, keywords: ["paysafe"] },
  { id: "payarc", name: "Payarc", rulePackId: null, keywords: ["payarc"] },
  { id: "stripe", name: "Stripe", rulePackId: null, keywords: ["stripe"] },
  { id: "square", name: "Square", rulePackId: null, keywords: ["square"] },
  { id: "paypal", name: "PayPal", rulePackId: null, keywords: ["paypal"] },
  { id: "adyen", name: "Adyen", rulePackId: null, keywords: ["adyen"] },
  { id: "global_payments", name: "Global Payments", rulePackId: null, keywords: ["global payments"] },
];

function normalizeText(input: string): string {
  return input.toLowerCase();
}

function rowToCorpusText(row: Record<string, string | number>): string {
  if (typeof row.content === "string" && row.content.trim().length > 0) {
    return row.content;
  }

  // CSV rows do not have a `content` field, so fold key/value pairs into the corpus.
  return Object.entries(row)
    .map(([key, value]) => `${key} ${String(value)}`)
    .join(" ");
}

function countMatches(text: string, keyword: string): number {
  const safe = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = text.match(new RegExp(safe, "g"));
  return matches?.length ?? 0;
}

function emptyDetection(): ProcessorDetection {
  return {
    detectedProcessorId: null,
    detectedProcessorName: null,
    rulePackId: null,
    confidence: 0,
    matchedKeywords: [],
    source: "unknown",
  };
}

export function buildProcessorCorpus(doc: ParsedDocument): string {
  const headerText = doc.headers.join(" ");
  const rowText = doc.rows.slice(0, 1500).map(rowToCorpusText).join("\n");
  return normalizeText(`${headerText}\n${doc.textPreview}\n${rowText}`);
}

export function detectProcessorFromText(text: string): ProcessorDetection {
  const normalized = normalizeText(text);
  let best: { signature: ProcessorSignature; score: number; matchedKeywords: string[] } | null = null;

  for (const signature of PROCESSOR_SIGNATURES) {
    const matchedKeywords = signature.keywords.filter((keyword) => normalized.includes(keyword));
    if (matchedKeywords.length === 0) {
      continue;
    }
    const matchedContextKeywords = (signature.contextKeywords ?? []).filter((keyword) => normalized.includes(keyword));
    const allMatchedKeywords = [...matchedKeywords, ...matchedContextKeywords];
    const score = allMatchedKeywords.reduce((acc, keyword) => acc + Math.max(1, countMatches(normalized, keyword)), 0);
    if (!best || score > best.score) {
      best = { signature, score, matchedKeywords: allMatchedKeywords };
    }
  }

  if (!best || best.score === 0) {
    return emptyDetection();
  }

  return {
    detectedProcessorId: best.signature.id,
    detectedProcessorName: best.signature.name,
    rulePackId: best.signature.rulePackId,
    confidence: Math.min(1, 0.3 + best.score * 0.18),
    matchedKeywords: best.matchedKeywords,
    source: "unknown",
  };
}

export function detectProcessorIdentity(doc: ParsedDocument): ProcessorDetection {
  const previewCorpus = normalizeText(`${doc.headers.join(" ")}\n${doc.textPreview}`);
  const rowCorpus = normalizeText(doc.rows.slice(0, 1500).map(rowToCorpusText).join("\n"));
  const detection = detectProcessorFromText(`${previewCorpus}\n${rowCorpus}`);

  if (!detection.detectedProcessorId) {
    return detection;
  }

  const source = detection.matchedKeywords.some(
    (keyword) => !previewCorpus.includes(keyword) && rowCorpus.includes(keyword),
  )
    ? "row_corpus"
    : "text_preview";

  return {
    ...detection,
    source,
  };
}
