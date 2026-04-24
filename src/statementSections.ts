import type { ParsedDocument } from "./parser.js";
import type {
  BlendedFeeSplit,
  CardBrand,
  InterchangeAuditRow,
  InterchangeAuditSummary,
  StatementSection,
  StatementSectionType,
} from "./types.js";

export type StructuredStatementFacts = {
  statementSections: StatementSection[];
  interchangeAudit: InterchangeAuditSummary;
  interchangeAuditRows: InterchangeAuditRow[];
  blendedFeeSplits: BlendedFeeSplit[];
};

type StructuredStatementOptions = {
  processorId?: string | null;
  rulePackId?: string | null;
};

type SectionContext = {
  type: StatementSectionType;
  title: string;
};

type FieldHit = {
  key: string;
  value: string | number;
};

type PricingCandidate = {
  label: string;
  cardBrand: CardBrand;
  cardType?: string;
  transactionCount: number | null;
  volume: number | null;
  ratePercent: number | null;
  rateBps: number | null;
  perItemFee: number | null;
  totalPaid: number | null;
  expectedTotalPaid: number | null;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
};

const MONEY_TOKEN_RE = /\(?-?\$?\d[\d,]*(?:\.\d+)?%?\)?/g;
const SECTION_NOISE_RE = /\b(page|merchant statement|customer service|attention)\b/i;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compact(input: string): string {
  return normalize(input).replace(/\s+/g, "");
}

function rowEvidence(row: Record<string, string | number>): string {
  if (typeof row.content === "string") return collapseWhitespace(row.content);
  return collapseWhitespace(
    Object.entries(row)
      .filter(([key]) => !/^page$/i.test(key))
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(" | "),
  );
}

function splitCells(line: string): string[] {
  const pipeCells = line
    .split("|")
    .map((cell) => collapseWhitespace(cell))
    .filter(Boolean);
  if (pipeCells.length > 1) return pipeCells;
  return [];
}

function parseNumber(value: string | number | undefined | null): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/^\((.*)\)$/, "-$1").replace(/[$,%\s,]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAmount(value: string | number | undefined | null): number | null {
  const parsed = parseNumber(value);
  return parsed === null ? null : Math.abs(parsed);
}

function parseRate(value: string | number | undefined | null, key = ""): { percent: number; bps: number } | null {
  const parsed = parseNumber(value);
  if (parsed === null) return null;

  const raw = typeof value === "string" ? value : String(value ?? "");
  const context = `${key} ${raw}`.toLowerCase();
  let percent: number;

  if (/\bbps\b|basis/.test(context)) {
    percent = Math.abs(parsed) / 100;
  } else if (raw.includes("%")) {
    percent = Math.abs(parsed);
  } else if (Math.abs(parsed) > 10 && Math.abs(parsed) <= 1_000 && /\brate|percent|pct|disc/.test(context)) {
    percent = Math.abs(parsed) / 100;
  } else if (Math.abs(parsed) < 0.1 && /\brate|percent|pct|disc/.test(context)) {
    // Source guidance calls out decimal display styles, e.g. 0.008 -> 0.80% -> 80 bps.
    percent = Math.abs(parsed) * 100;
  } else {
    percent = Math.abs(parsed);
  }

  if (!Number.isFinite(percent) || percent <= 0 || percent > 25) return null;
  return { percent: round4(percent), bps: round2(percent * 100) };
}

function classifySectionTitle(line: string): StatementSectionType {
  const lower = normalize(line);
  const dense = compact(line);

  if (/\bnotice|notices|terms|billing change|effective date|acceptance\b/.test(lower)) return "notices";
  if (/interchange|programfees|cardbrand|cardnetwork/.test(dense)) return "interchange_detail";
  if (/\bsummary\b|deposit|batch totals?|sales activity|processing activity|card type sales/.test(lower)) return "summary";
  if (/processing fees?|service charges?|discount fees?|processor markup|assessment markup|hps processing/.test(lower)) {
    return "processor_markup";
  }
  if (/other fees?|account fees?|authorization|gateway|pci|monthly|surcharge|non emv|risk fee|chargeback/.test(lower)) {
    return "add_on_fees";
  }

  return "unknown";
}

function isLikelySectionHeading(line: string): boolean {
  const normalized = collapseWhitespace(line);
  if (!normalized || normalized.length > 180 || SECTION_NOISE_RE.test(normalized)) return false;
  const cells = splitCells(normalized);
  if (cells.length >= 3 && isAuditHeaderCells(cells)) return false;
  if (MONEY_TOKEN_RE.test(normalized)) {
    MONEY_TOKEN_RE.lastIndex = 0;
    return false;
  }
  MONEY_TOKEN_RE.lastIndex = 0;
  return /[a-z]/i.test(normalized);
}

function isAuditHeaderCells(cells: string[]): boolean {
  const joined = normalize(cells.join(" "));
  let score = 0;
  if (/\b(card|brand|description|program|type)\b/.test(joined)) score += 1;
  if (/\b(transaction|trans|txn|count|items|number|qty)\b/.test(joined)) score += 1;
  if (/\b(volume|amount|sales|submitted|processed)\b/.test(joined)) score += 1;
  if (/\b(rate|percent|pct|bps|basis)\b/.test(joined)) score += 1;
  if (/\b(per item|item fee|per trans|transaction fee|auth fee|authorization)\b/.test(joined)) score += 1;
  if (/\b(total|paid|fee amount|fees|charge)\b/.test(joined)) score += 1;
  return score >= 3;
}

function updateSection(
  sections: StatementSection[],
  current: SectionContext,
  line: string,
): SectionContext {
  if (!isLikelySectionHeading(line)) return current;

  const sectionType = classifySectionTitle(line);
  if (sectionType === "unknown") return current;

  const title = collapseWhitespace(line.replace(/[|:]+/g, " "));
  const existing = sections.find((section) => section.type === sectionType && section.title === title);
  if (!existing) {
    sections.push({
      type: sectionType,
      title,
      rowCount: 0,
      confidence: sectionType === "interchange_detail" ? 0.84 : 0.72,
      evidenceLines: [title],
    });
  }

  return { type: sectionType, title };
}

function noteSectionRow(sections: StatementSection[], section: SectionContext, evidence: string): void {
  if (section.type === "unknown") return;
  const target = sections.find((item) => item.type === section.type && item.title === section.title);
  if (!target) return;
  target.rowCount += 1;
  if (target.evidenceLines.length < 4 && evidence && !target.evidenceLines.includes(evidence)) {
    target.evidenceLines.push(evidence);
  }
}

function entriesFor(row: Record<string, string | number>): FieldHit[] {
  return Object.entries(row)
    .filter(([key]) => !/^(content|page|kind)$/i.test(key))
    .map(([key, value]) => ({ key, value }));
}

function findField(entries: FieldHit[], predicate: (key: string, compactKey: string) => boolean): FieldHit | null {
  for (const entry of entries) {
    const key = normalize(entry.key);
    if (predicate(key, compact(key))) return entry;
  }
  return null;
}

function findNumericField(entries: FieldHit[], predicate: (key: string, compactKey: string) => boolean): FieldHit | null {
  const hit = findField(entries, predicate);
  return hit && parseAmount(hit.value) !== null ? hit : null;
}

function labelFromRecord(row: Record<string, string | number>, entries: FieldHit[], evidence: string): string {
  const labelHit = findField(entries, (key, dense) =>
    /\b(description|descriptor|card type|card brand|brand|program|qualification|category|fee name|label)\b/.test(key) ||
    /cardtype|cardbrand|feename/.test(dense),
  );
  if (labelHit && typeof labelHit.value === "string" && labelHit.value.trim()) return collapseWhitespace(labelHit.value);

  const firstString = entries.find((entry) => typeof entry.value === "string" && /[a-z]/i.test(entry.value));
  if (firstString) return collapseWhitespace(String(firstString.value));

  const cells = splitCells(evidence);
  const firstTextCell = cells.find((cell) => /[a-z]/i.test(cell) && parseAmount(cell) === null);
  return firstTextCell ? collapseWhitespace(firstTextCell) : collapseWhitespace(evidence).slice(0, 120);
}

function detectCardBrand(input: string): CardBrand {
  const lower = normalize(input);
  if (/\bamex\b|american express|optblue/.test(lower)) return "AmEx";
  if (/\bmastercard\b|\bmaster card\b|\bmc\b|mstrcard|mastrcard/.test(lower)) return "Mastercard";
  if (/\bdiscover\b|\bdisc\b/.test(lower)) return "Discover";
  if (/\bvisa\b/.test(lower)) return "Visa";
  return "Unknown";
}

function detectCardType(input: string): string | undefined {
  const lower = normalize(input);
  if (/\bdebit\b/.test(lower)) return "Debit";
  if (/\bcredit\b/.test(lower)) return "Credit";
  if (/\brewards?\b|signature|world|infinite/.test(lower)) return "Rewards";
  if (/\bcommercial\b|business|purchasing|corporate/.test(lower)) return "Commercial";
  return undefined;
}

function detectEntryMode(input: string): string | undefined {
  const lower = normalize(input);
  if (/card not present|\bcnp\b|keyed|ecommerce|e commerce|mail order|moto/.test(lower)) return "Card-not-present";
  if (/card present|\bcp\b|swiped|chip|emv|contactless|tapped/.test(lower)) return "Card-present";
  return undefined;
}

function downgradeIndicators(input: string): string[] {
  const lower = normalize(input);
  const indicators: string[] = [];
  if (/non qualified|nonqualified|non qual/.test(lower)) indicators.push("non-qualified");
  if (/\beirf\b/.test(lower)) indicators.push("EIRF");
  if (/downgrade|downgraded/.test(lower)) indicators.push("downgrade");
  return indicators;
}

function expectedPaid(
  volume: number | null,
  ratePercent: number | null,
  transactionCount: number | null,
  perItemFee: number | null,
): number | null {
  const rateComponent = volume !== null && ratePercent !== null ? volume * (ratePercent / 100) : 0;
  const itemComponent = transactionCount !== null && perItemFee !== null ? transactionCount * perItemFee : 0;
  if (rateComponent <= 0 && itemComponent <= 0) return null;
  return round2(rateComponent + itemComponent);
}

function hasExplicitInterchangeContext(section: SectionContext, entries: FieldHit[], evidenceLine: string): boolean {
  const keyContext = entries.map((entry) => normalize(entry.key)).join(" ");
  const explicitContext = normalize(`${section.title} ${evidenceLine} ${keyContext}`);
  return /\binterchange\b|\bprogram fees?\b|\bcard brand\b|\bcard network\b/.test(explicitContext);
}

function buildInterchangeRow(
  row: Record<string, string | number>,
  rowIndex: number,
  section: SectionContext,
  evidenceLine: string,
): InterchangeAuditRow | null {
  const entries = entriesFor(row);
  if (entries.length === 0 && !evidenceLine) return null;

  const context = collapseWhitespace(
    [
      section.title,
      evidenceLine,
      ...entries.map((entry) => `${entry.key} ${String(entry.value)}`),
    ].join(" "),
  );
  const label = labelFromRecord(row, entries, evidenceLine);
  const cardBrand = detectCardBrand(`${label} ${context}`);

  const hasInterchangeContext = section.type === "interchange_detail" || hasExplicitInterchangeContext(section, entries, evidenceLine);

  if (!hasInterchangeContext) return null;
  if (/^\s*(total|subtotal|grand total)\b/i.test(label)) return null;

  const transactionHit = findNumericField(entries, (key, dense) =>
    /\b(transaction|transactions|trans|txn|items|item count|count|qty|number)\b/.test(key) ||
    /transactioncount|txncount|numbertrans|numtrans|itemcount/.test(dense),
  );
  const volumeHit = findNumericField(entries, (key, dense) =>
    /\b(volume|sales amount|amount of sales|sales volume|net sales|gross sales|amount submitted|processed amount)\b/.test(key) ||
    /salesamount|amountofsales|salesvolume|netsales|grosssales|amountsubmitted|processedamount/.test(dense),
  );
  const rateHit = findField(entries, (key, dense) =>
    /\b(rate|percent|pct|bps|basis|disc ?%)\b/.test(key) || /discountpercent|discpercent|ratebps/.test(dense),
  );
  const perItemHit = findNumericField(entries, (key, dense) =>
    /\b(per item|item fee|per trans|per txn|transaction fee|auth fee|authorization fee)\b/.test(key) ||
    /peritem|itemfee|pertrans|pertxn|transactionfee|authorizationfee|authfee/.test(dense),
  );
  const totalPaidHit = findNumericField(entries, (key, dense) => {
    const isPerItem = /peritem|itemfee|pertrans|pertxn|authorizationfee|authfee/.test(dense) || /\bper item|item fee|per trans|auth fee/.test(key);
    const isVolume = /volume|sales|submitted|processed/.test(key);
    const isRate = /rate|percent|pct|bps|basis/.test(key);
    if (isPerItem || isVolume || isRate) return false;
    return (
      /\b(total paid|paid|fee amount|fees paid|total fee|interchange fee|charge amount|amount due|processing fee)\b/.test(key) ||
      /totalpaid|feepaid|feespaid|feeamount|interchangefee|chargeamount|amountdue|processingfee/.test(dense)
    );
  });

  const transactionCount = transactionHit ? parseAmount(transactionHit.value) : null;
  const volume = volumeHit ? parseAmount(volumeHit.value) : null;
  const rate = rateHit ? parseRate(rateHit.value, rateHit.key) : null;
  const perItemFee = perItemHit ? parseAmount(perItemHit.value) : null;
  const totalPaid = totalPaidHit ? parseAmount(totalPaidHit.value) : null;
  const expectedTotalPaid = expectedPaid(volume, rate?.percent ?? null, transactionCount, perItemFee);
  const variance = totalPaid !== null && expectedTotalPaid !== null ? round2(totalPaid - expectedTotalPaid) : null;

  const capturedFieldCount = [transactionCount, volume, rate, perItemFee, totalPaid].filter((value) => value !== null).length;
  if (capturedFieldCount < 3) return null;
  if (totalPaid === null && expectedTotalPaid === null) return null;

  const confidence = clamp(
    0.18 +
      capturedFieldCount * 0.12 +
      (section.type === "interchange_detail" ? 0.14 : 0) +
      (cardBrand !== "Unknown" ? 0.1 : 0) +
      (variance !== null && Math.abs(variance) <= 0.05 ? 0.08 : 0),
    0.35,
    0.98,
  );

  return {
    label,
    cardBrand,
    cardType: detectCardType(context),
    entryMode: detectEntryMode(context),
    transactionCount: transactionCount === null ? null : Math.round(transactionCount),
    volume: volume === null ? null : round2(volume),
    ratePercent: rate?.percent ?? null,
    rateBps: rate?.bps ?? null,
    perItemFee: perItemFee === null ? null : round4(perItemFee),
    totalPaid: totalPaid === null ? null : round2(totalPaid),
    expectedTotalPaid,
    variance,
    sourceSection: section.title || "Interchange detail",
    evidenceLine,
    rowIndex,
    confidence: round2(confidence),
    downgradeIndicators: downgradeIndicators(context),
  };
}

function buildPricingCandidate(
  row: Record<string, string | number>,
  rowIndex: number,
  section: SectionContext,
  evidenceLine: string,
): PricingCandidate | null {
  const entries = entriesFor(row);
  if (entries.length === 0 && !evidenceLine) return null;

  const context = collapseWhitespace(
    [
      section.title,
      evidenceLine,
      ...entries.map((entry) => `${entry.key} ${String(entry.value)}`),
    ].join(" "),
  );
  const label = labelFromRecord(row, entries, evidenceLine);
  const cardBrand = detectCardBrand(`${label} ${context}`);
  if (cardBrand === "Unknown") return null;
  if (/^\s*(total|subtotal|grand total)\b/i.test(label)) return null;

  const transactionHit = findNumericField(entries, (key, dense) =>
    /\b(transaction|transactions|trans|txn|items|item count|count|qty|number)\b/.test(key) ||
    /transactioncount|txncount|numbertrans|numtrans|itemcount/.test(dense),
  );
  const volumeHit = findNumericField(entries, (key, dense) =>
    /\b(volume|sales amount|amount of sales|sales volume|net sales|gross sales|amount submitted|processed amount|total sales)\b/.test(key) ||
    /salesamount|amountofsales|salesvolume|netsales|grosssales|amountsubmitted|processedamount|totalsales/.test(dense),
  );
  const rateHit = findField(entries, (key, dense) =>
    /\b(rate|percent|pct|bps|basis|disc ?%)\b/.test(key) || /discountpercent|discpercent|ratebps/.test(dense),
  );
  const perItemHit = findNumericField(entries, (key, dense) =>
    /\b(per item|item fee|per trans|per txn|transaction fee|auth fee|authorization fee)\b/.test(key) ||
    /peritem|itemfee|pertrans|pertxn|transactionfee|authorizationfee|authfee/.test(dense),
  );
  const totalPaidHit = findNumericField(entries, (key, dense) => {
    const isPerItem = /peritem|itemfee|pertrans|pertxn|authorizationfee|authfee/.test(dense) || /\bper item|item fee|per trans|auth fee/.test(key);
    const isVolume = /volume|sales|submitted|processed/.test(key);
    const isRate = /rate|percent|pct|bps|basis/.test(key);
    if (isPerItem || isVolume || isRate) return false;
    return (
      /\b(total paid|paid|fee amount|fees paid|total fee|interchange fee|charge amount|amount due|processing fee|amount)\b/.test(key) ||
      /totalpaid|feepaid|feespaid|feeamount|interchangefee|chargeamount|amountdue|processingfee/.test(dense)
    );
  });

  const transactionCount = transactionHit ? parseAmount(transactionHit.value) : null;
  const volume = volumeHit ? parseAmount(volumeHit.value) : null;
  const rate = rateHit ? parseRate(rateHit.value, rateHit.key) : null;
  const perItemFee = perItemHit ? parseAmount(perItemHit.value) : null;
  const totalPaid = totalPaidHit ? parseAmount(totalPaidHit.value) : null;
  const expectedTotalPaid = expectedPaid(volume, rate?.percent ?? null, transactionCount, perItemFee);

  if (!rate && totalPaid === null && expectedTotalPaid === null) return null;
  if (volume === null && transactionCount === null) return null;

  return {
    label,
    cardBrand,
    cardType: detectCardType(context),
    transactionCount: transactionCount === null ? null : Math.round(transactionCount),
    volume: volume === null ? null : round2(volume),
    ratePercent: rate?.percent ?? null,
    rateBps: rate?.bps ?? null,
    perItemFee: perItemFee === null ? null : round4(perItemFee),
    totalPaid: totalPaid === null ? null : round2(totalPaid),
    expectedTotalPaid,
    sourceSection: section.title || "Blended fee presentation",
    evidenceLine,
    rowIndex,
  };
}

function samePricingSubject(left: PricingCandidate, right: PricingCandidate): boolean {
  if (left.cardBrand !== right.cardBrand) return false;
  if (normalize(left.label) !== normalize(right.label)) return false;
  if (left.transactionCount !== null && right.transactionCount !== null && left.transactionCount !== right.transactionCount) return false;
  if (left.volume !== null && right.volume !== null && Math.abs(left.volume - right.volume) > Math.max(1, left.volume * 0.005)) return false;
  return true;
}

function blendedAmount(candidate: Pick<PricingCandidate, "totalPaid" | "expectedTotalPaid">): number | null {
  return candidate.totalPaid ?? candidate.expectedTotalPaid;
}

function splitBlendedCandidates(top: PricingCandidate, bottom: PricingCandidate): BlendedFeeSplit | null {
  if (!samePricingSubject(top, bottom)) return null;
  if (top.rowIndex + 2 < bottom.rowIndex) return null;

  const processorAmount = blendedAmount(top);
  const interchangeAmount = blendedAmount(bottom);
  if (processorAmount === null && interchangeAmount === null) return null;
  if (top.ratePercent === null && top.perItemFee === null && processorAmount === null) return null;
  if (bottom.ratePercent === null && bottom.perItemFee === null && interchangeAmount === null) return null;

  return {
    label: top.label,
    cardBrand: top.cardBrand,
    cardType: top.cardType ?? bottom.cardType,
    transactionCount: top.transactionCount ?? bottom.transactionCount,
    volume: top.volume ?? bottom.volume,
    processorMarkup: {
      ratePercent: top.ratePercent,
      rateBps: top.rateBps,
      perItemFee: top.perItemFee,
      totalPaid: top.totalPaid,
      expectedTotalPaid: top.expectedTotalPaid,
    },
    interchange: {
      ratePercent: bottom.ratePercent,
      rateBps: bottom.rateBps,
      perItemFee: bottom.perItemFee,
      totalPaid: bottom.totalPaid,
      expectedTotalPaid: bottom.expectedTotalPaid,
    },
    sourceSection: top.sourceSection || bottom.sourceSection || "Blended fee presentation",
    evidenceLine: `${top.evidenceLine} / ${bottom.evidenceLine}`,
    rowIndex: top.rowIndex,
    confidence: 0.82,
  };
}

function interchangeRowFromBlendedSplit(split: BlendedFeeSplit): InterchangeAuditRow | null {
  const totalPaid = split.interchange.totalPaid;
  const expectedTotalPaid = split.interchange.expectedTotalPaid;
  if (totalPaid === null && expectedTotalPaid === null) return null;

  return {
    label: split.label,
    cardBrand: split.cardBrand,
    cardType: split.cardType,
    transactionCount: split.transactionCount,
    volume: split.volume,
    ratePercent: split.interchange.ratePercent,
    rateBps: split.interchange.rateBps,
    perItemFee: split.interchange.perItemFee,
    totalPaid,
    expectedTotalPaid,
    variance: totalPaid !== null && expectedTotalPaid !== null ? round2(totalPaid - expectedTotalPaid) : null,
    sourceSection: "Blended interchange detail",
    evidenceLine: split.evidenceLine,
    rowIndex: split.rowIndex,
    confidence: split.confidence,
    downgradeIndicators: downgradeIndicators(split.evidenceLine),
  };
}

function recordFromCells(cells: string[], headers: string[], baseRow: Record<string, string | number>): Record<string, string | number> {
  const mapped: Record<string, string | number> = { content: rowEvidence(baseRow) };
  if (headers.length === 0 || cells.length === 0) return mapped;

  if (cells.length <= headers.length) {
    cells.forEach((cell, index) => {
      mapped[headers[index] ?? `column_${index + 1}`] = cell;
    });
    return mapped;
  }

  const leadingLabelWidth = cells.length - headers.length + 1;
  mapped[headers[0] ?? "description"] = cells.slice(0, leadingLabelWidth).join(" ");
  for (let index = 1; index < headers.length; index += 1) {
    mapped[headers[index] ?? `column_${index + 1}`] = cells[leadingLabelWidth + index - 1] ?? "";
  }
  return mapped;
}

function fallbackInterchangeRowFromLine(line: string, rowIndex: number, section: SectionContext): InterchangeAuditRow | null {
  if (section.type !== "interchange_detail") return null;
  if (/^\s*(total|subtotal|grand total)\b/i.test(line)) return null;

  const cardBrand = detectCardBrand(line);
  if (cardBrand === "Unknown") return null;

  const cells = splitCells(line);
  if (cells.length < 4) return null;

  const firstNumericIndex = cells.findIndex((cell) => parseAmount(cell) !== null || /%/.test(cell));
  if (firstNumericIndex <= 0) return null;

  const label = cells.slice(0, firstNumericIndex).join(" ");
  const numericCells = cells.slice(firstNumericIndex);
  const rateCell = numericCells.find((cell) => /%/.test(cell) || /\brate|bps|basis/i.test(cell));
  const rate = rateCell ? parseRate(rateCell, "rate") : null;
  const amounts = numericCells
    .filter((cell) => cell !== rateCell)
    .map((cell) => parseAmount(cell))
    .filter((amount): amount is number => amount !== null);

  const transactionCount = amounts.length > 0 && Number.isInteger(amounts[0]) && amounts[0] < 100_000 ? amounts[0] : null;
  const amountPool = transactionCount === null ? amounts : amounts.slice(1);
  const totalPaid = amountPool.length > 0 ? amountPool[amountPool.length - 1] : null;
  const volume = amountPool.find((amount) => totalPaid === null || amount > Math.max(10, totalPaid * 2)) ?? null;
  const perItemFee = amountPool.find((amount) => amount > 0 && amount <= 2 && amount !== totalPaid) ?? null;

  return buildInterchangeRow(
    {
      description: label,
      transactionCount: transactionCount ?? "",
      volume: volume ?? "",
      rate: rateCell ?? "",
      perItemFee: perItemFee ?? "",
      totalPaid: totalPaid ?? "",
      content: line,
    },
    rowIndex,
    section,
    line,
  );
}

function dedupeInterchangeRows(rows: InterchangeAuditRow[]): InterchangeAuditRow[] {
  const seen = new Set<string>();
  const deduped: InterchangeAuditRow[] = [];

  for (const row of rows) {
    const key = [
      normalize(row.label),
      row.transactionCount ?? "",
      row.volume ?? "",
      row.rateBps ?? "",
      row.perItemFee ?? "",
      row.totalPaid ?? "",
      normalize(row.evidenceLine),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function buildInterchangeAudit(rows: InterchangeAuditRow[]): InterchangeAuditSummary {
  const rowCount = rows.length;
  const countValues = rows.map((row) => row.transactionCount).filter((value): value is number => value !== null);
  const volumeValues = rows.map((row) => row.volume).filter((value): value is number => value !== null);
  const paidValues = rows.map((row) => row.totalPaid).filter((value): value is number => value !== null);
  const varianceValues = rows.map((row) => row.variance).filter((value): value is number => value !== null);
  const weightedRateNumerator = rows.reduce((sum, row) => {
    if (row.volume === null || row.rateBps === null) return sum;
    return sum + row.volume * row.rateBps;
  }, 0);
  const weightedRateVolume = rows.reduce((sum, row) => (row.volume === null || row.rateBps === null ? sum : sum + row.volume), 0);

  return {
    rows,
    rowCount,
    transactionCount: countValues.length > 0 ? Math.round(countValues.reduce((sum, value) => sum + value, 0)) : null,
    volume: volumeValues.length > 0 ? round2(volumeValues.reduce((sum, value) => sum + value, 0)) : null,
    totalPaid: paidValues.length > 0 ? round2(paidValues.reduce((sum, value) => sum + value, 0)) : null,
    weightedAverageRateBps: weightedRateVolume > 0 ? round2(weightedRateNumerator / weightedRateVolume) : null,
    totalVariance: varianceValues.length > 0 ? round2(varianceValues.reduce((sum, value) => sum + value, 0)) : null,
    confidence: rowCount > 0 ? round2(rows.reduce((sum, row) => sum + row.confidence, 0) / rowCount) : 0,
  };
}

export function emptyInterchangeAudit(): InterchangeAuditSummary {
  return buildInterchangeAudit([]);
}

function shouldParseBlendedRows(doc: ParsedDocument, options: StructuredStatementOptions): boolean {
  const processorHint = `${options.processorId ?? ""} ${options.rulePackId ?? ""}`.toLowerCase();
  if (processorHint.includes("tsys")) return true;

  const corpus = collapseWhitespace(
    [
      doc.headers.join(" "),
      doc.textPreview,
      ...doc.rows.slice(0, 200).map(rowEvidence),
    ].join(" "),
  ).toLowerCase();
  return /tsys|total system services|top number|bottom number|blended|bundl/.test(corpus);
}

export function extractStructuredStatementFacts(
  doc: ParsedDocument,
  options: StructuredStatementOptions = {},
): StructuredStatementFacts {
  const sections: StatementSection[] = [];
  const interchangeRows: InterchangeAuditRow[] = [];
  const blendedFeeSplits: BlendedFeeSplit[] = [];
  const blendedCandidates: PricingCandidate[] = [];
  const parseBlendedRows = shouldParseBlendedRows(doc, options);
  let currentSection: SectionContext = { type: "unknown", title: "Uncategorized" };
  let currentAuditHeaders: string[] = [];

  doc.rows.forEach((row, rowIndex) => {
    const evidence = rowEvidence(row);
    if (!evidence) return;

    currentSection = updateSection(sections, currentSection, evidence);
    noteSectionRow(sections, currentSection, evidence);

    const isContentLine = typeof row.content === "string";
    const cells = splitCells(evidence);
    if (isContentLine && cells.length >= 3 && isAuditHeaderCells(cells)) {
      currentAuditHeaders = cells;
      return;
    }

    const mappedRow =
      isContentLine && currentAuditHeaders.length > 0 && cells.length >= Math.max(3, currentAuditHeaders.length - 1)
        ? recordFromCells(cells, currentAuditHeaders, row)
        : row;

    if (parseBlendedRows) {
      const candidate = buildPricingCandidate(mappedRow, rowIndex, currentSection, evidence);
      if (candidate) {
        const previous = blendedCandidates[blendedCandidates.length - 1];
        const split = previous ? splitBlendedCandidates(previous, candidate) : null;
        if (split) {
          blendedFeeSplits.push(split);
        }
        blendedCandidates.push(candidate);
      }
    }

    const columnRow = buildInterchangeRow(mappedRow, rowIndex, currentSection, evidence);
    if (columnRow) {
      interchangeRows.push(columnRow);
      return;
    }

    const fallbackRow = fallbackInterchangeRowFromLine(evidence, rowIndex, currentSection);
    if (fallbackRow) {
      interchangeRows.push(fallbackRow);
    }
  });

  const blendedInterchangeRows = blendedFeeSplits
    .map(interchangeRowFromBlendedSplit)
    .filter((row): row is InterchangeAuditRow => row !== null);
  const dedupedRows = dedupeInterchangeRows([...interchangeRows, ...blendedInterchangeRows]);
  const interchangeAudit = buildInterchangeAudit(dedupedRows);

  return {
    statementSections: sections,
    interchangeAudit,
    interchangeAuditRows: dedupedRows,
    blendedFeeSplits,
  };
}
