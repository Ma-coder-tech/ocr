import {
  makeEvidence,
  type DocumentEvidence,
  type DocumentIR,
  type DocumentLine,
  type DocumentSection,
  type DocumentSectionType,
  type DocumentTable,
} from "./documentIr.js";

export type FiservFamilyAssessment = {
  isLikelyFiservFirstData: boolean;
  confidence: number;
  matchedSignals: string[];
  decisionReason: string;
};

export type FiservDocumentSectionType =
  | "summary"
  | "amounts_submitted"
  | "amounts_funded_by_batch"
  | "fees_charged"
  | "interchange_charges_program_fees"
  | "summary_by_card_type"
  | "tax_gross_reportable_sales"
  | "account_fees"
  | "notices";

type SectionMatch = {
  type: DocumentSectionType;
  familySectionType: FiservDocumentSectionType;
  label: string;
  confidence: number;
};

type LineSectionMatch = {
  line: DocumentLine;
  lineIndex: number;
  match: SectionMatch;
};

type FamilySignalStrength = "brand" | "strong_structural" | "medium_structural" | "weak_generic";

const FAMILY_SIGNALS: Array<{ label: string; pattern: RegExp; weight: number; strength: FamilySignalStrength }> = [
  { label: "Fiserv", pattern: /\bfiserv\b/i, weight: 0.42, strength: "brand" },
  { label: "First Data", pattern: /\bfirst data\b/i, weight: 0.42, strength: "brand" },
  { label: "Clover", pattern: /\bclover\b/i, weight: 0.36, strength: "brand" },
  { label: "THIS IS NOT A BILL", pattern: /\bthis is not a bill\b/i, weight: 0.18, strength: "strong_structural" },
  {
    label: "Amounts Funded by Batch",
    pattern: /\bamounts funded by batch\b|\bdate submitted\b[\s\S]*\bsubmitted amount\b[\s\S]*\bamount processed\b/i,
    weight: 0.22,
    strength: "strong_structural",
  },
  { label: "Amount Funded", pattern: /\bamount\s+funded\b|\btotal amount funded\b/i, weight: 0.16, strength: "strong_structural" },
  { label: "Third Party Transactions", pattern: /\bthird party transactions\b/i, weight: 0.12, strength: "strong_structural" },
  {
    label: "Adjustments/Chargebacks",
    pattern: /\badjustments?\s*\/?\s*chargebacks?\b|\bchargebacks?\s*\/?\s*reversals?\b/i,
    weight: 0.12,
    strength: "strong_structural",
  },
  { label: "Amounts Submitted", pattern: /\bamounts?\s+submitted\b/i, weight: 0.12, strength: "medium_structural" },
  { label: "Fees Charged", pattern: /\bfees?\s+charged\b/i, weight: 0.12, strength: "medium_structural" },
  { label: "Total Card/Misc Fees", pattern: /\btotal card fees\b|\btotal miscellaneous fees\b/i, weight: 0.1, strength: "medium_structural" },
  { label: "Merchant Number", pattern: /\bmerchant number\b/i, weight: 0.04, strength: "weak_generic" },
  { label: "Statement Period", pattern: /\bstatement\s*period\b/i, weight: 0.04, strength: "weak_generic" },
];

export function assessFiservFirstDataFamily(ir: DocumentIR): FiservFamilyAssessment {
  const corpus = documentCorpus(ir);
  const matched = FAMILY_SIGNALS.filter((signal) => signal.pattern.test(corpus));
  const matchedSignals = matched.map((signal) => signal.label);
  const score = matched.reduce((sum, signal) => sum + signal.weight, 0);
  const hasBrandSignal = matched.some((signal) => signal.strength === "brand");
  const strongStructuralCount = matched.filter((signal) => signal.strength === "strong_structural").length;
  const mediumStructuralCount = matched.filter((signal) => signal.strength === "medium_structural").length;
  const hasFiservOrFirstDataBrand = matched.some((signal) => signal.label === "Fiserv" || signal.label === "First Data");
  const hasCloverBrand = matched.some((signal) => signal.label === "Clover");
  const hasFundingCluster =
    matchedSignals.includes("Amounts Funded by Batch") ||
    (matchedSignals.includes("Amount Funded") && matchedSignals.includes("Amounts Submitted"));
  const hasFeesSection = matchedSignals.includes("Fees Charged");
  const acceptedByStructure =
    hasFundingCluster && hasFeesSection && strongStructuralCount >= 2 && strongStructuralCount + mediumStructuralCount >= 3;
  const brandConfidenceFloor = hasFiservOrFirstDataBrand ? 0.76 : hasCloverBrand ? 0.68 : 0;
  const confidence = Math.min(1, Math.max(score + (acceptedByStructure ? 0.12 : 0), brandConfidenceFloor));
  const isLikelyFiservFirstData = hasBrandSignal || acceptedByStructure;
  return {
    isLikelyFiservFirstData,
    confidence,
    matchedSignals,
    decisionReason: hasBrandSignal
      ? "Accepted by explicit Fiserv/First Data/Clover brand signal."
      : acceptedByStructure
        ? "Accepted by Fiserv/First Data funding and fee-section structure."
        : "Not accepted: generic merchant-statement labels did not form a distinctive Fiserv/First Data cluster.",
  };
}

export function detectFiservDocumentSections(ir: DocumentIR): DocumentSection[] {
  const lineMatches = ir.pages.flatMap((page) =>
    page.lines
      .map((line, lineIndex) => ({ line, lineIndex, match: matchLineSection(line) }))
      .filter((item): item is LineSectionMatch => item.match !== null),
  );

  const tableMatches = ir.pages.flatMap((page) =>
    page.tables
      .map((table) => ({ table, match: matchTableSection(table) }))
      .filter((item): item is { table: DocumentTable; match: SectionMatch } => item.match !== null),
  );

  const sections: DocumentSection[] = [];
  const seenLineSections = new Set<string>();
  const acceptedLineMatches: LineSectionMatch[] = [];
  for (const item of lineMatches) {
    const sectionKey = `${item.match.familySectionType}:${item.line.pageNumber}`;
    if (seenLineSections.has(sectionKey)) {
      continue;
    }
    seenLineSections.add(sectionKey);
    acceptedLineMatches.push(item);
  }

  for (const item of acceptedLineMatches) {
    const range = lineRangeForSection(ir, acceptedLineMatches, item);
    sections.push({
      id: `fiserv-section-${sections.length}`,
      type: item.match.type,
      family: "fiserv_first_data",
      familySectionType: item.match.familySectionType,
      label: item.match.label,
      pageNumber: item.line.pageNumber,
      startLineId: item.line.id,
      endLineId: range.at(-1)?.id ?? item.line.id,
      lineIds: range.map((line) => line.id),
      tableIds: tablesForSection(ir, item.match.familySectionType, item.line.pageNumber),
      confidence: item.match.confidence,
      detectionMethod: "heading_match",
      evidence: item.line.evidence,
    });
  }

  for (const item of tableMatches) {
    if (
      sections.some(
        (section) =>
          section.familySectionType === item.match.familySectionType && section.pageNumber === item.table.pageNumber,
      )
    ) {
      continue;
    }
    sections.push({
      id: `fiserv-section-${sections.length}`,
      type: item.match.type,
      family: "fiserv_first_data",
      familySectionType: item.match.familySectionType,
      label: item.match.label,
      pageNumber: item.table.pageNumber,
      startLineId: null,
      endLineId: null,
      lineIds: [],
      tableIds: [item.table.id],
      confidence: item.match.confidence,
      detectionMethod: "table_heading_match",
      evidence: item.table.evidence,
    });
  }

  return sections.sort((left, right) => left.pageNumber - right.pageNumber || left.id.localeCompare(right.id));
}

export function attachFiservDocumentSections(ir: DocumentIR): DocumentIR {
  return {
    ...ir,
    sections: detectFiservDocumentSections(ir),
  };
}

function lineRangeForSection(
  ir: DocumentIR,
  acceptedLineMatches: LineSectionMatch[],
  current: LineSectionMatch,
): DocumentLine[] {
  const page = ir.pages.find((candidate) => candidate.pageNumber === current.line.pageNumber);
  if (!page) return [current.line];
  const nextSectionOnPage = acceptedLineMatches
    .filter((item) => item.line.pageNumber === current.line.pageNumber && item.lineIndex > current.lineIndex)
    .sort((left, right) => left.lineIndex - right.lineIndex)[0];
  const endExclusive = nextSectionOnPage?.lineIndex ?? page.lines.length;
  return page.lines.slice(current.lineIndex, endExclusive);
}

function matchLineSection(line: DocumentLine): SectionMatch | null {
  const text = normalize(line.text);
  if (looksLikeSummarySection(text)) {
    return { type: "summary", familySectionType: "summary", label: "SUMMARY", confidence: 0.9 };
  }
  if (/\bamounts submitted\b/.test(text) && !isSummaryControlLine(text)) {
    return { type: "card_activity", familySectionType: "amounts_submitted", label: "AMOUNTS SUBMITTED", confidence: 0.74 };
  }
  if (/\bamounts funded by batch\b|\bdate submitted\b.*\bsubmitted amount\b.*\bamount processed\b/.test(text)) {
    return {
      type: "funding",
      familySectionType: "amounts_funded_by_batch",
      label: "AMOUNTS FUNDED BY BATCH",
      confidence: 0.86,
    };
  }
  if (/^fees charged$|^fees charged\b.*\bdate\b.*\btype\b.*\bdescription\b/.test(text)) {
    return { type: "fees", familySectionType: "fees_charged", label: "FEES CHARGED", confidence: 0.86 };
  }
  if (/\binterchange charges\b|\bprogram fees\b/.test(text)) {
    return {
      type: "interchange",
      familySectionType: "interchange_charges_program_fees",
      label: "INTERCHANGE CHARGES / PROGRAM FEES",
      confidence: 0.84,
    };
  }
  if (/\bsummary by card type\b|\bamounts submitted by card type\b/.test(text)) {
    return { type: "card_activity", familySectionType: "summary_by_card_type", label: "SUMMARY BY CARD TYPE", confidence: 0.82 };
  }
  if (/\btax gross reportable sales\b|\bgross reportable sales\b/.test(text)) {
    return {
      type: "tax_reporting",
      familySectionType: "tax_gross_reportable_sales",
      label: "TAX GROSS REPORTABLE SALES",
      confidence: 0.8,
    };
  }
  if (/^account fees\b|\baccount fees charged\b/.test(text)) {
    return { type: "account", familySectionType: "account_fees", label: "ACCOUNT FEES", confidence: 0.78 };
  }
  if (/^notices?\b|^important information\b/.test(text)) {
    return { type: "notices", familySectionType: "notices", label: "NOTICES", confidence: 0.72 };
  }
  return null;
}

function matchTableSection(table: DocumentTable): SectionMatch | null {
  const text = normalize(table.cells.slice(0, 12).map((cell) => cell.text).join(" "));
  if (looksLikeSummarySection(text)) {
    return { type: "summary", familySectionType: "summary", label: "SUMMARY", confidence: 0.82 };
  }
  if (/\bamounts submitted\b/.test(text) && /\bthird party transactions\b|\badjustments chargebacks\b|\bfees charged\b/.test(text)) {
    return { type: "summary", familySectionType: "summary", label: "SUMMARY", confidence: 0.78 };
  }
  if (/\bdate submitted\b.*\bsubmitted amount\b.*\bamount processed\b/.test(text)) {
    return {
      type: "funding",
      familySectionType: "amounts_funded_by_batch",
      label: "AMOUNTS FUNDED BY BATCH",
      confidence: 0.86,
    };
  }
  if (/\bfees charged\b.*\bmonth end charge\b|\btotal card fees\b|\btotal miscellaneous fees\b/.test(text)) {
    return { type: "fees", familySectionType: "fees_charged", label: "FEES CHARGED", confidence: 0.82 };
  }
  return null;
}

function tablesForSection(ir: DocumentIR, familySectionType: FiservDocumentSectionType, pageNumber: number): string[] {
  return ir.pages
    .find((page) => page.pageNumber === pageNumber)
    ?.tables.filter((table) => matchTableSection(table)?.familySectionType === familySectionType)
    .map((table) => table.id) ?? [];
}

function documentCorpus(ir: DocumentIR): string {
  return [
    ...ir.pages.flatMap((page) => page.lines.map((line) => line.text)),
    ...ir.pages.flatMap((page) => page.tables.flatMap((table) => table.cells.map((cell) => cell.text))),
  ].join("\n");
}

function looksLikeSummarySection(text: string): boolean {
  return /^summary\b/.test(text) || /\bsummary\b.*\boverview of account activity\b/.test(text);
}

function isSummaryControlLine(text: string): boolean {
  return /\bpage\b|\bthird party transactions\b|\badjustments chargebacks\b|\bfees charged\b|\bamount funded\b/.test(text);
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9/$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function evidenceFromText(sourceId: string, pageNumber: number, text: string): DocumentEvidence {
  return makeEvidence({ source: "pdfjs", sourceId, pageNumber, text });
}
