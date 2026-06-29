import {
  findFiservFeeReferenceEntry,
  loadFiservFeeReference,
  normalizeFiservFeeReferenceText,
  type FiservFeeReference,
  type FiservFeeReferenceCategory,
  type FiservFeeReferenceEntry,
} from "./fiservFeeReference.js";

export type FiservRawFeeRowForNormalization = {
  date: string | null;
  type: string | null;
  network: string | null;
  description: string;
  volumeBasis: number | null;
  count: number | null;
  rate: number | null;
  amount: number;
  bucket: string;
  sourceSection?: string;
  evidenceLine: string;
  pageNumber?: number | null;
};

export type FiservCanonicalFeeType =
  | "interchange"
  | "card_brand_network"
  | "processor_pct_markup"
  | "processor_per_item"
  | "processor_fixed"
  | "pin_debit_network"
  | "pin_debit_interchange"
  | "pin_debit_network_annual"
  | "compliance_penalty"
  | "third_party_service"
  | "suspicious_pass_through_like_fee"
  | "unknown"
  | "zero_amount";

export type FiservCanonicalMatchMethod = "exact" | "fuzzy" | "ai_candidate" | "none";

export type FiservAiCandidateReferenceEntry = {
  normalizedDescription: string;
  originalDescription: string;
  cardTypeSection: string | null;
  amount: number;
  volumeBasis: number | null;
  count: number | null;
  rate: number | null;
  sourceSection: string | null;
  evidenceLine: string;
  reason: string;
};

export type FiservCanonicalFeeRow = {
  rowIndex: number;
  originalDescription: string;
  normalizedDescription: string;
  cardTypeSection: string | null;
  normalizedCardTypeSection: string | null;
  network: string | null;
  date: string | null;
  feeType: FiservCanonicalFeeType;
  sourceFeeType: string | null;
  sourceSection: string | null;
  volumeBasis: number | null;
  count: number | null;
  rate: number | null;
  amount: number;
  bucket: string;
  rawEvidenceLine: string;
  pageNumber: number | null;
  matchMethod: FiservCanonicalMatchMethod;
  matchConfidence: "high" | "medium" | "low";
  referenceId: string | null;
  referenceCategory: FiservFeeReferenceCategory | null;
  canonicalName: string | null;
  referenceEntry: FiservFeeReferenceEntry | null;
  aiCandidate: FiservAiCandidateReferenceEntry | null;
};

export type FiservFeeNormalizationSummary = {
  rowCount: number;
  exactMatchCount: number;
  fuzzyMatchCount: number;
  aiCandidateCount: number;
  aiClassifiedCount?: number;
  unmatchedCount: number;
};

export type FiservFeeNormalizationResult = {
  rows: FiservCanonicalFeeRow[];
  summary: FiservFeeNormalizationSummary;
};

const FALLBACK_NETWORK_LABELS = new Set(["BIN ICA FEE"]);
const PROCESSOR_PER_ITEM_LABELS = new Set(["OTHER ITEM FEES", "CPU GTWY", "SALES ITEMS", "BATCH HEADER", "WATS AUTH FEE"]);
const THIRD_PARTY_SERVICE_LABELS = [
  "BENTOBOX",
  "DOORDASH",
  "GRUBHUB",
  "UBER EATS",
  "CLOVER APP",
  "ONLINE ORDER",
  "ONLINE ORDERING",
];

function networkFromSection(section: string | null | undefined): string | null {
  const normalized = normalizeFiservFeeReferenceText(section);
  if (!normalized) return null;
  if (normalized.includes("MASTERCARD") || normalized.startsWith("MC ")) return "Mastercard";
  if (normalized.includes("VISA") || normalized.startsWith("VS ")) return "Visa";
  if (normalized.includes("AMEX")) return "Amex";
  if (normalized.includes("DISCOVER") || normalized.includes("DCVR")) return "Discover";
  return null;
}

function compactDescriptionForMatching(description: string): string {
  return normalizeFiservFeeReferenceText(description)
    .replace(/\b\d+(?:\.\d+)?\s*(?:TIMES|X)\s*\$?\d+(?:\.\d+)?\b/g, " ")
    .replace(/\bAT\s+\d+(?:\.\d+)?\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\b/g, " ")
    .replace(/\bFEE(S)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function entryConfidence(entry: FiservFeeReferenceEntry | null, matchMethod: FiservCanonicalMatchMethod): "high" | "medium" | "low" {
  if (!entry) return matchMethod === "ai_candidate" ? "low" : "low";
  const notes = entry.notes.toUpperCase();
  if (matchMethod === "fuzzy") return "medium";
  if (notes.includes("LOW CONFIDENCE")) return "low";
  if (notes.includes("MEDIUM") || entry.tolerance_pct === null || entry.tolerance_pct > 15) return "medium";
  return "high";
}

function entryMatchesNetwork(entry: FiservFeeReferenceEntry, sectionNetwork: string | null): boolean {
  return !sectionNetwork || entry.network === "All" || entry.network === "Processor" || entry.network === sectionNetwork;
}

function fuzzyReferenceMatch(params: {
  description: string;
  section: string | null | undefined;
  reference: FiservFeeReference;
}): FiservFeeReferenceEntry | null {
  const description = compactDescriptionForMatching(params.description);
  if (!description) return null;
  const sectionNetwork = networkFromSection(params.section);
  const candidates = params.reference.fees
    .filter((entry) => entryMatchesNetwork(entry, sectionNetwork))
    .map((entry) => {
      const bestLabelScore = entry.fiserv_labels.reduce((score, label) => {
        const normalizedLabel = compactDescriptionForMatching(label);
        if (!normalizedLabel || normalizedLabel.length < 4) return score;
        if (description === normalizedLabel) return Math.max(score, 100);
        if (description.includes(normalizedLabel)) return Math.max(score, 80 + Math.min(normalizedLabel.length, 20));
        if (normalizedLabel.includes(description) && description.length >= 6) return Math.max(score, 70 + Math.min(description.length, 20));
        const words = normalizedLabel.split(" ").filter((word) => word.length >= 4);
        const matchedWords = words.filter((word) => description.includes(word)).length;
        return words.length > 0 && matchedWords === words.length ? Math.max(score, 60 + matchedWords) : score;
      }, 0);
      return { entry, score: bestLabelScore };
    })
    .filter((candidate) => candidate.score >= 70)
    .sort((left, right) => right.score - left.score);
  return candidates[0]?.entry ?? null;
}

function feeTypeFromReference(entry: FiservFeeReferenceEntry | null, row: FiservRawFeeRowForNormalization): FiservCanonicalFeeType {
  const description = normalizeFiservFeeReferenceText(row.description);
  if (row.amount === 0) return "zero_amount";
  const sourceSection = normalizeFiservFeeReferenceText(row.sourceSection);
  const sourceType = normalizeFiservFeeReferenceText(row.type);
  if (
    /(NON[- ]?COMPLIANCE|NON[- ]?VALIDATED|NON[- ]?COMPLIANT|SECURITY NON)/.test(description) &&
    /(PCI|MANAGED SECURITY|COMPLIANCE|SECURITY)/.test(description)
  ) {
    return "compliance_penalty";
  }
  if (THIRD_PARTY_SERVICE_LABELS.some((label) => description.includes(label))) return "third_party_service";
  if (sourceSection === "DEBIT NETWORK FEES" && sourceType === "INTERCHANGE CHARGES") return "pin_debit_interchange";
  if (/PIN DEBIT.*ANNUAL|ANNUAL.*PIN DEBIT|STAR PIN DEBIT|ACCEL PIN DEBIT|NYCE PIN DEBIT|PULSE PIN DEBIT/.test(description)) {
    return "pin_debit_network_annual";
  }
  if (description === "INTERCHANGE" || entry?.category === "interchange") return "interchange";
  if (entry?.category === "card_brand_network") return "card_brand_network";
  if (FALLBACK_NETWORK_LABELS.has(description) || /ACQUIRER TRANS(?:ACTION)? FEE|ACQR TRANS(?:ACTION)? FEE/.test(description)) {
    return "card_brand_network";
  }
  if (entry?.category === "pin_debit_network") return "pin_debit_network";
  if (description.match(/^DISC\s+\d+$/) || description === "OTHER VOLUME FEES") return "processor_pct_markup";
  if (/\bWATS AUTH FEE\b/.test(description)) return "processor_per_item";
  if (PROCESSOR_PER_ITEM_LABELS.has(description)) return "processor_per_item";
  if (description.includes("TIF") || description.includes("TRANSACTION INTEGRITY") || description.includes("MISUSE")) return "compliance_penalty";
  if (entry?.category === "processor_markup") return entry.rate_type === "pct_volume" ? "processor_pct_markup" : "processor_per_item";
  if (entry?.category === "processor_misc") return "processor_fixed";
  if (row.type === "Interchange charges" || row.type === "Program Fees") return "interchange";
  if (row.type === "Service charges") return row.count !== null && row.count > 0 ? "processor_per_item" : "processor_pct_markup";
  if (row.type === "MISC" || row.sourceSection === "ACCOUNT FEES") return "processor_fixed";
  return "unknown";
}

function aiCandidateFor(row: FiservRawFeeRowForNormalization, normalizedDescription: string): FiservAiCandidateReferenceEntry {
  return {
    normalizedDescription,
    originalDescription: row.description,
    cardTypeSection: row.network,
    amount: row.amount,
    volumeBasis: row.volumeBasis,
    count: row.count,
    rate: row.rate,
    sourceSection: row.sourceSection ?? null,
    evidenceLine: row.evidenceLine,
    reason: "No deterministic exact or fuzzy reference match; queue this row for AI classification and human review before promoting it to the trusted reference table.",
  };
}

export function normalizeFiservFeeRows(
  rawRows: FiservRawFeeRowForNormalization[],
  options: { reference?: FiservFeeReference } = {},
): FiservFeeNormalizationResult {
  const reference = options.reference ?? loadFiservFeeReference();
  const rows = rawRows.map((row, rowIndex): FiservCanonicalFeeRow => {
    const exactEntry = findFiservFeeReferenceEntry({ section: row.network, description: row.description, reference });
    const fuzzyEntry = exactEntry ? null : fuzzyReferenceMatch({ description: row.description, section: row.network, reference });
    const referenceEntry = exactEntry ?? fuzzyEntry;
    const normalizedDescription = normalizeFiservFeeReferenceText(row.description);
    const matchMethod: FiservCanonicalMatchMethod = exactEntry ? "exact" : fuzzyEntry ? "fuzzy" : "none";
    const feeType = feeTypeFromReference(referenceEntry, row);
    const needsAiCandidate = matchMethod === "none" && feeType === "unknown";
    return {
      rowIndex,
      originalDescription: row.description,
      normalizedDescription,
      cardTypeSection: row.network,
      normalizedCardTypeSection: row.network ? normalizeFiservFeeReferenceText(row.network) : null,
      network: referenceEntry?.network === "All" || referenceEntry?.network === "Processor" ? networkFromSection(row.network) : (referenceEntry?.network ?? networkFromSection(row.network)),
      date: row.date,
      feeType,
      sourceFeeType: row.type,
      sourceSection: row.sourceSection ?? null,
      volumeBasis: row.volumeBasis,
      count: row.count,
      rate: row.rate,
      amount: row.amount,
      bucket: row.bucket,
      rawEvidenceLine: row.evidenceLine,
      pageNumber: row.pageNumber ?? null,
      matchMethod: needsAiCandidate ? "ai_candidate" : matchMethod,
      matchConfidence: entryConfidence(referenceEntry, needsAiCandidate ? "ai_candidate" : matchMethod),
      referenceId: referenceEntry?.id ?? null,
      referenceCategory: referenceEntry?.category ?? null,
      canonicalName: referenceEntry?.canonical_name ?? null,
      referenceEntry: referenceEntry ?? null,
      aiCandidate: needsAiCandidate ? aiCandidateFor(row, normalizedDescription) : null,
    };
  });

  return {
    rows,
    summary: {
      rowCount: rows.length,
      exactMatchCount: rows.filter((row) => row.matchMethod === "exact").length,
      fuzzyMatchCount: rows.filter((row) => row.matchMethod === "fuzzy").length,
      aiCandidateCount: rows.filter((row) => row.matchMethod === "ai_candidate").length,
      unmatchedCount: rows.filter((row) => row.matchMethod === "none").length,
    },
  };
}
