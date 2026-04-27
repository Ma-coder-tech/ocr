import type { ParsedDocument } from "./parser.js";
import {
  extractRepricingEventsFromNoticeLines,
  type RepricingNoticeLine,
} from "./repricingNotices.js";
import type {
  BlendedFeeSplit,
  BundledPricingBucket,
  BundledPricingModel,
  CardBrand,
  DowngradeAnalysis,
  DowngradeFindingRow,
  ExpressFundingPremiumModel,
  GuideMeasureModel,
  InterchangeAuditRow,
  InterchangeAuditSummary,
  MonthlyMinimumModel,
  NoticeFinding,
  PerItemFeeComponent,
  PerItemFeeModel,
  ProcessorMarkupAuditRow,
  RepricingEvent,
  SavingsShareAdjustmentModel,
  StatementEconomicBucket,
  StatementEconomicFeeRow,
  StatementEconomicRollup,
  StatementSection,
  StatementSectionType,
  StructuredFeeFinding,
  StructuredFeeFindingKind,
} from "./types.js";

export type StructuredStatementFacts = {
  statementSections: StatementSection[];
  interchangeAudit: InterchangeAuditSummary;
  interchangeAuditRows: InterchangeAuditRow[];
  blendedFeeSplits: BlendedFeeSplit[];
  processorMarkupRows: ProcessorMarkupAuditRow[];
  structuredFeeFindings: StructuredFeeFinding[];
  bundledPricing: BundledPricingModel;
  noticeFindings: NoticeFinding[];
  repricingEvents: RepricingEvent[];
  downgradeAnalysis: DowngradeAnalysis;
  perItemFeeModel: PerItemFeeModel;
  guideMeasures: GuideMeasureModel;
  economicRollup: StatementEconomicRollup;
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

type StatementAmountFact = {
  amount: number;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
};

type EconomicAccumulator = {
  totalVolumeFacts: StatementAmountFact[];
  totalFeeFacts: StatementAmountFact[];
  feeRows: StatementEconomicFeeRow[];
};

const MONEY_TOKEN_RE = /\(?-?\$?\d[\d,]*(?:\.\d+)?%?\)?/g;
const MONEY_VALUE_PATTERN = String.raw`\(?\$?\d[\d,]*(?:\.\d+)?\)?`;
const SECTION_NOISE_RE = /\b(page|merchant statement|customer service|attention)\b/i;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function amountToBps(amount: number | null, volume: number | null): number | null {
  if (amount === null || volume === null) return null;
  if (!Number.isFinite(amount) || !Number.isFinite(volume) || amount <= 0 || volume <= 0) return null;
  return round2((amount / volume) * 10_000);
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

function isPositiveAmount(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && value > 0;
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
  if (/chargebacks?\s*reversals?|no chargebacks|date submitted chargebacks/.test(lower)) return "summary";
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

function isNoticeContinuationLine(line: string): boolean {
  return /\b(effective|beginning|starts?|as of|increase|increased|increasing|billing change|pricing change|fee change|rate change|continued use|accept these terms|from\s+\$|to\s+\$)\b/i.test(
    line,
  );
}

function updateSection(
  sections: StatementSection[],
  current: SectionContext,
  line: string,
): SectionContext {
  if (!isLikelySectionHeading(line)) return current;

  const sectionType = classifySectionTitle(line);
  if (sectionType === "unknown") return current;
  if (current.type === "notices" && sectionType !== "notices" && isNoticeContinuationLine(line)) {
    return current;
  }

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

function isPerItemAmount(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0 && value <= 2;
}

function perItemKindFromContext(section: SectionContext, entries: FieldHit[], evidenceLine: string): PerItemFeeComponent["kind"] | null {
  if (section.type === "interchange_detail") return null;

  const context = normalize(
    [
      section.title,
      evidenceLine,
      ...entries.map((entry) => `${entry.key} ${String(entry.value)}`),
    ].join(" "),
  );
  const dense = compact(context);

  if (/\bauthori[sz]ation fees?\b|\bauth fees?\b|\bper auth\b|\bauth\b/.test(context) || /authorizationfee|authfee|perauth/.test(dense)) {
    return "authorization";
  }

  if (
    /\btransaction fees?\b|\bper transaction\b|\bper trans\b|\bper txn\b|\bper item\b|\bitem fees?\b/.test(context) ||
    /transactionfee|pertransaction|pertrans|pertxn|peritem|itemfee/.test(dense)
  ) {
    return "transaction";
  }

  return null;
}

function keyLooksLikePerItemAmount(key: string, dense: string, kind: PerItemFeeComponent["kind"]): boolean {
  if (/\b(count|qty|quantity|volume|sales|total paid|total fee|amount due|rate|percent|pct|bps|basis)\b/.test(key)) return false;
  if (/count|quantity|volume|sales|totalpaid|totalfee|amountdue|rate|percent|pct|bps|basis/.test(dense)) return false;

  if (kind === "authorization") {
    return /\bauthori[sz]ation fees?\b|\bauth fees?\b|\bper auth\b|\bfee\b|\bamount\b/.test(key) || /authorizationfee|authfee|perauth|fee|amount/.test(dense);
  }

  return /\btransaction fees?\b|\bper transaction\b|\bper trans\b|\bper txn\b|\bper item\b|\bitem fees?\b|\bfee\b|\bamount\b/.test(key) ||
    /transactionfee|pertransaction|pertrans|pertxn|peritem|itemfee|fee|amount/.test(dense);
}

function perItemAmountFromEntries(entries: FieldHit[], kind: PerItemFeeComponent["kind"]): number | null {
  const keyedCandidates = entries
    .map((entry) => {
      const amount = parseAmount(entry.value);
      const key = normalize(entry.key);
      return { amount, key, dense: compact(entry.key) };
    })
    .filter((candidate) => isPerItemAmount(candidate.amount))
    .filter((candidate) => keyLooksLikePerItemAmount(candidate.key, candidate.dense, kind));

  if (keyedCandidates.length > 0) {
    const amount = keyedCandidates[0].amount;
    return amount === null ? null : round4(amount);
  }

  return null;
}

function perItemAmountFromEvidence(evidenceLine: string): number | null {
  const tokens = evidenceLine.match(/\(?-?\$?\d[\d,]*(?:\.\d+)?%?\)?/g) ?? [];
  const amounts = tokens
    .filter((token) => !token.includes("%"))
    .filter((token) => token.includes("$") || token.includes("."))
    .map((token) => parseAmount(token))
    .filter((amount): amount is number => isPerItemAmount(amount));
  return amounts.length > 0 ? round4(amounts[0]) : null;
}

function buildPerItemFeeComponent(
  row: Record<string, string | number>,
  rowIndex: number,
  section: SectionContext,
  evidenceLine: string,
): PerItemFeeComponent | null {
  const entries = entriesFor(row);
  const kind = perItemKindFromContext(section, entries, evidenceLine);
  if (!kind) return null;

  const amount = perItemAmountFromEntries(entries, kind) ?? perItemAmountFromEvidence(evidenceLine);
  if (amount === null) return null;

  return {
    kind,
    amount,
    sourceSection: section.title || (kind === "authorization" ? "Authorization fee detail" : "Transaction fee detail"),
    evidenceLine,
    rowIndex,
    confidence: section.type === "processor_markup" || section.type === "add_on_fees" ? 0.84 : 0.68,
  };
}

function buildPerItemFeeModel(components: PerItemFeeComponent[]): PerItemFeeModel {
  const seen = new Set<string>();
  const deduped: PerItemFeeComponent[] = [];

  for (const component of components) {
    const key = [component.kind, component.amount, component.sourceSection, normalize(component.evidenceLine)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(component);
  }

  const transactionComponent = deduped.find((component) => component.kind === "transaction");
  const authorizationComponent = deduped.find((component) => component.kind === "authorization");
  const transactionFee = transactionComponent?.amount ?? null;
  const authorizationFee = authorizationComponent?.amount ?? null;
  const allInPerItemFee = transactionFee !== null && authorizationFee !== null ? round4(transactionFee + authorizationFee) : null;
  const confidence = deduped.length > 0 ? round2(deduped.reduce((sum, component) => sum + component.confidence, 0) / deduped.length) : 0;

  return {
    transactionFee,
    authorizationFee,
    allInPerItemFee,
    components: deduped,
    confidence,
  };
}

function rowContext(section: SectionContext, entries: FieldHit[], evidenceLine: string): string {
  return collapseWhitespace(
    [
      section.title,
      evidenceLine,
      ...entries.map((entry) => `${entry.key} ${String(entry.value)}`),
    ].join(" "),
  );
}

function amountFromEntries(entries: FieldHit[], predicate: (key: string, dense: string) => boolean): number | null {
  const hit = findNumericField(entries, predicate);
  return hit ? parseAmount(hit.value) : null;
}

function rateBpsFromEntries(entries: FieldHit[], predicate: (key: string, dense: string) => boolean): number | null {
  const hit = findField(entries, predicate);
  const rate = hit ? parseRate(hit.value, hit.key) : null;
  return rate?.bps ?? null;
}

function hasRecognizedSection(section: SectionContext): boolean {
  return section.type !== "unknown";
}

function amountNearPhrase(evidenceLine: string, phrases: RegExp[]): number | null {
  for (const phrase of phrases) {
    const regex = new RegExp(`${phrase.source}[^\\d$()%-]{0,45}(${MONEY_VALUE_PATTERN})`, "i");
    const match = evidenceLine.match(regex);
    if (!match) continue;
    const amount = parseAmount(match[1]);
    if (amount !== null) return amount;
  }
  return null;
}

function amountFromLabeledCells(evidenceLine: string, predicate: (label: string) => boolean): number | null {
  const cells = splitCells(evidenceLine);
  for (let index = 0; index < cells.length - 1; index += 1) {
    const label = normalize(cells[index]);
    if (!predicate(label)) continue;
    const amount = parseAmount(cells[index + 1]);
    if (amount !== null) return amount;
  }
  return null;
}

function numericAmountEntries(entries: FieldHit[]): Array<{ key: string; dense: string; amount: number }> {
  return entries
    .map((entry) => {
      const key = normalize(entry.key);
      const dense = compact(entry.key);
      const amount = parseAmount(entry.value);
      return { key, dense, amount };
    })
    .filter((candidate): candidate is { key: string; dense: string; amount: number } => candidate.amount !== null)
    .filter((candidate) => !/\b(count|qty|quantity|rate|percent|pct|bps|basis|page)\b/.test(candidate.key))
    .filter((candidate) => !/count|quantity|rate|percent|pct|bps|basis|page/.test(candidate.dense));
}

function firstRowAmount(entries: FieldHit[], evidenceLine: string): number | null {
  const entry = numericAmountEntries(entries)[0];
  if (entry) return round2(entry.amount);

  const cells = splitCells(evidenceLine);
  const cellAmount = cells.map((cell) => parseAmount(cell)).find((amount): amount is number => amount !== null);
  if (cellAmount !== undefined) return round2(cellAmount);

  const tokens = evidenceLine.match(MONEY_TOKEN_RE) ?? [];
  MONEY_TOKEN_RE.lastIndex = 0;
  const tokenAmount = tokens.map((token) => parseAmount(token)).find((amount): amount is number => amount !== null);
  return tokenAmount === undefined ? null : round2(tokenAmount);
}

function lastRowAmount(entries: FieldHit[], evidenceLine: string): number | null {
  const entryAmounts = numericAmountEntries(entries);
  if (entryAmounts.length > 0) return round2(entryAmounts[entryAmounts.length - 1].amount);

  const cells = splitCells(evidenceLine);
  const cellAmounts = cells.map((cell) => parseAmount(cell)).filter((amount): amount is number => amount !== null);
  if (cellAmounts.length > 0) return round2(cellAmounts[cellAmounts.length - 1]);

  const tokens = evidenceLine.match(MONEY_TOKEN_RE) ?? [];
  MONEY_TOKEN_RE.lastIndex = 0;
  const tokenAmounts = tokens.map((token) => parseAmount(token)).filter((amount): amount is number => amount !== null);
  return tokenAmounts.length === 0 ? null : round2(tokenAmounts[tokenAmounts.length - 1]);
}

function contextualAmount(
  entries: FieldHit[],
  evidenceLine: string,
  keyPredicate: (key: string, dense: string) => boolean,
  labelPredicate: (label: string) => boolean,
): number | null {
  const keyed = numericAmountEntries(entries).find((entry) => keyPredicate(entry.key, entry.dense));
  if (keyed) return round2(keyed.amount);
  return amountFromLabeledCells(evidenceLine, labelPredicate) ?? firstRowAmount(entries, evidenceLine);
}

function sourceSectionName(section: SectionContext, fallback: string): string {
  return section.title && section.title !== "Uncategorized" ? section.title : fallback;
}

function shouldSkipGenericFeeRow(context: string): boolean {
  return (
    /\b(total volume|total sales|sales volume|gross sales|net sales|processed volume|amount processed)\b/.test(context) ||
    /\b(total fees?|fees charged|statement fee total|grand total)\b/.test(context) ||
    /\bmonthly minimum|minimum discount|minimum markup\b/.test(context) ||
    /\bexpress merchant funding|express funding|accelerated funding|faster funding\b/.test(context) ||
    /\bcommercial card interchange savings adjustment|interchange savings adjustment|savings adjustment\b/.test(context)
  );
}

function feeBucketForSection(section: SectionContext, context: string): StatementEconomicBucket | null {
  if (section.type === "notices" || section.type === "summary") return null;
  if (section.type === "interchange_detail") return /\b(total|subtotal|interchange|program|card brand|card network)\b/.test(context)
    ? "card_brand_pass_through"
    : null;
  if (section.type === "processor_markup") return "processor_markup";
  if (section.type === "add_on_fees") return "add_on_fees";
  if (/\b(total interchange|interchange charges?|program fees?|card brand fees?|card network fees?)\b/.test(context)) {
    return "card_brand_pass_through";
  }
  if (/\b(processor markup|service charges?|discount fees?|processing fees?|assessment markup)\b/.test(context)) {
    return "processor_markup";
  }
  if (/\b(pci|gateway|statement fee|monthly fee|account fee|authorization fee|transaction fee|batch fee|chargeback|risk fee)\b/.test(context)) {
    return "add_on_fees";
  }
  return null;
}

function addEconomicFacts(
  acc: EconomicAccumulator,
  row: Record<string, string | number>,
  rowIndex: number,
  section: SectionContext,
  evidenceLine: string,
): void {
  const entries = entriesFor(row);
  const context = normalize(rowContext(section, entries, evidenceLine));
  const sourceSection = sourceSectionName(section, "Statement detail");

  if (/\b(total volume|total sales|sales volume|gross sales|net sales|processed volume|amount processed)\b/.test(context)) {
    const amount = contextualAmount(
      entries,
      evidenceLine,
      (key, dense) =>
        /\b(total volume|sales volume|gross sales|net sales|processed volume|amount processed|volume|sales)\b/.test(key) ||
        /totalvolume|salesvolume|grosssales|netsales|processedvolume|amountprocessed/.test(dense),
      (label) => /\b(total volume|total sales|sales volume|gross sales|net sales|processed volume|amount processed)\b/.test(label),
    );
    if (amount !== null && amount > 0) {
      acc.totalVolumeFacts.push({
        amount,
        sourceSection,
        evidenceLine,
        rowIndex,
        confidence: section.type === "summary" ? 0.9 : 0.78,
      });
    }
  }

  if (/\b(total fees?|fees charged|statement fee total|grand total fees?|month end charge|amount due)\b/.test(context)) {
    const amount = contextualAmount(
      entries,
      evidenceLine,
      (key, dense) =>
        /\b(total fees?|fees?|charges?|amount due|month end charge|fee amount)\b/.test(key) ||
        /totalfees|feescharged|amountdue|monthendcharge|feeamount/.test(dense),
      (label) => /\b(total fees?|fees charged|statement fee total|grand total fees?|month end charge|amount due)\b/.test(label),
    );
    if (amount !== null && amount > 0) {
      acc.totalFeeFacts.push({
        amount,
        sourceSection,
        evidenceLine,
        rowIndex,
        confidence: section.type === "summary" ? 0.9 : 0.78,
      });
    }
  }

  if (shouldSkipGenericFeeRow(context)) return;

  const bucket = feeBucketForSection(section, context);
  if (!bucket) return;

  const amount = lastRowAmount(entries, evidenceLine);
  if (amount === null || amount <= 0) return;

  acc.feeRows.push({
    label: labelFromRecord(row, entries, evidenceLine),
    amount,
    bucket,
    sourceSection,
    evidenceLine,
    rowIndex,
    confidence: section.type === "unknown" ? 0.55 : 0.74,
  });
}

function bpsFromEvidence(evidenceLine: string): number | null {
  const match = evidenceLine.match(/([+-]?\d+(?:\.\d+)?)\s*(?:bps|basis points?)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? round2(Math.abs(parsed)) : null;
}

function percentFromEvidence(evidenceLine: string): number | null {
  const match = evidenceLine.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? round2(Math.abs(parsed)) : null;
}

function percentFromEntries(entries: FieldHit[], predicate: (key: string, dense: string) => boolean): number | null {
  const hit = findField(entries, predicate);
  if (!hit) return null;
  const parsed = parseNumber(hit.value);
  if (parsed === null) return null;
  const raw = String(hit.value);
  if (raw.includes("%")) return round2(Math.abs(parsed));
  if (Math.abs(parsed) > 0 && Math.abs(parsed) <= 1) return round2(Math.abs(parsed) * 100);
  if (Math.abs(parsed) <= 100) return round2(Math.abs(parsed));
  return null;
}

function buildMonthlyMinimumModel(
  row: Record<string, string | number>,
  rowIndex: number,
  section: SectionContext,
  evidenceLine: string,
): MonthlyMinimumModel | null {
  const entries = entriesFor(row);
  const context = normalize(rowContext(section, entries, evidenceLine));
  if (!hasRecognizedSection(section)) return null;
  if (!/monthly minimum|minimum discount|minimum markup/.test(context)) return null;

  const minimumUsd =
    amountFromEntries(entries, (key, dense) =>
      /monthly minimum|minimum amount|minimum discount|minimum markup|required minimum/.test(key) ||
      /monthlyminimum|minimumamount|minimumdiscount|minimummarkup|requiredminimum/.test(dense),
    ) ??
    amountFromLabeledCells(evidenceLine, (label) => /monthly minimum|minimum amount|minimum discount|minimum markup|required minimum/.test(label)) ??
    amountNearPhrase(evidenceLine, [/monthly minimum/i, /minimum discount/i, /minimum markup/i, /required minimum/i]);

  const actualMarkupUsd =
    amountFromEntries(entries, (key, dense) =>
      /(actual|earned).*(markup|discount)|(markup|discount).*(actual|earned)/.test(key) ||
      /actualmarkup|earnedmarkup|actualdiscount|discountearned/.test(dense),
    ) ??
    amountFromLabeledCells(evidenceLine, (label) =>
      /(actual|earned).*(markup|discount)|(markup|discount).*(actual|earned)/.test(label),
    ) ??
    amountNearPhrase(evidenceLine, [/actual markup/i, /earned markup/i, /actual discount/i, /discount earned/i]);

  const explicitTopUpUsd =
    amountFromEntries(entries, (key, dense) =>
      /top.?up|difference|shortfall|minimum fee|minimum charge|amount charged/.test(key) ||
      /topup|difference|shortfall|minimumfee|minimumcharge|amountcharged/.test(dense),
    ) ??
    amountFromLabeledCells(evidenceLine, (label) => /top.?up|difference|shortfall|minimum fee|minimum charge|amount charged/.test(label)) ??
    amountNearPhrase(evidenceLine, [/top.?up/i, /difference/i, /shortfall/i, /amount charged/i, /minimum fee/i]);

  const monthlyVolumeUsd =
    amountFromEntries(entries, (key, dense) =>
      /monthly volume|processing volume|sales volume|total sales|volume/.test(key) ||
      /monthlyvolume|processingvolume|salesvolume|totalsales/.test(dense),
    ) ??
    amountFromLabeledCells(evidenceLine, (label) => /monthly volume|processing volume|sales volume|total sales/.test(label)) ??
    amountNearPhrase(evidenceLine, [/monthly volume/i, /processing volume/i, /sales volume/i, /total sales/i]);

  const topUpUsd =
    explicitTopUpUsd ??
    (minimumUsd !== null && actualMarkupUsd !== null ? round2(Math.max(0, minimumUsd - actualMarkupUsd)) : null);
  const inferredActualMarkupUsd =
    actualMarkupUsd ??
    (minimumUsd !== null && topUpUsd !== null ? round2(Math.max(0, minimumUsd - topUpUsd)) : null);
  const effectiveMarkupUsd =
    minimumUsd !== null && inferredActualMarkupUsd !== null ? round2(Math.max(minimumUsd, inferredActualMarkupUsd)) : null;
  const effectiveRateImpactPct =
    topUpUsd !== null && monthlyVolumeUsd !== null && monthlyVolumeUsd > 0 ? round4((topUpUsd / monthlyVolumeUsd) * 100) : null;
  const capturedFields = [minimumUsd, inferredActualMarkupUsd, monthlyVolumeUsd, topUpUsd, effectiveMarkupUsd].filter(
    (value) => value !== null,
  ).length;

  return {
    minimumUsd,
    actualMarkupUsd: inferredActualMarkupUsd,
    monthlyVolumeUsd,
    topUpUsd,
    effectiveMarkupUsd,
    effectiveRateImpactPct,
    sourceSection: section.title || "Monthly minimum detail",
    evidenceLine,
    rowIndex,
    confidence: clamp(0.42 + capturedFields * 0.08 + (section.type === "add_on_fees" ? 0.1 : 0), 0.45, 0.9),
  };
}

function buildExpressFundingPremiumModel(
  row: Record<string, string | number>,
  rowIndex: number,
  section: SectionContext,
  evidenceLine: string,
): ExpressFundingPremiumModel | null {
  const entries = entriesFor(row);
  const context = normalize(rowContext(section, entries, evidenceLine));
  if (!hasRecognizedSection(section)) return null;
  if (!/express merchant funding|express funding|accelerated funding|faster funding/.test(context)) return null;

  const premiumBps =
    rateBpsFromEntries(entries, (key, dense) =>
      /premium|bps|basis|rate|funding fee/.test(key) || /premium|bps|basis|rate|fundingfee/.test(dense),
    ) ?? bpsFromEvidence(evidenceLine);
  const fundingVolumeUsd =
    amountFromEntries(entries, (key, dense) =>
      /funding volume|funded amount|amount funded|processing volume|sales volume|volume/.test(key) ||
      /fundingvolume|fundedamount|amountfunded|processingvolume|salesvolume/.test(dense),
    ) ??
    amountFromLabeledCells(evidenceLine, (label) => /funding volume|funded amount|amount funded|processing volume|sales volume/.test(label)) ??
    amountNearPhrase(evidenceLine, [/funding volume/i, /funded amount/i, /amount funded/i, /processing volume/i, /sales volume/i]);
  const explicitPremiumUsd =
    amountFromEntries(entries, (key, dense) =>
      /premium amount|funding fee|express funding fee|fee amount|amount charged/.test(key) ||
      /premiumamount|fundingfee|expressfundingfee|feeamount|amountcharged/.test(dense),
    ) ?? amountFromLabeledCells(evidenceLine, (label) => /premium amount|funding fee|express funding fee|fee amount|amount charged/.test(label));
  const premiumUsd =
    premiumBps !== null && fundingVolumeUsd !== null ? round2((fundingVolumeUsd * premiumBps) / 10_000) : explicitPremiumUsd;
  const capturedFields = [premiumBps, fundingVolumeUsd, premiumUsd].filter((value) => value !== null).length;

  return {
    fundingVolumeUsd,
    premiumBps,
    premiumUsd,
    sourceSection: section.title || "Express funding detail",
    evidenceLine,
    rowIndex,
    confidence: clamp(0.45 + capturedFields * 0.12 + (section.type === "add_on_fees" ? 0.08 : 0), 0.45, 0.9),
  };
}

function buildSavingsShareAdjustmentModel(
  row: Record<string, string | number>,
  rowIndex: number,
  section: SectionContext,
  evidenceLine: string,
): SavingsShareAdjustmentModel | null {
  const entries = entriesFor(row);
  const context = normalize(rowContext(section, entries, evidenceLine));
  if (!hasRecognizedSection(section)) return null;
  if (!/commercial card interchange savings adjustment|interchange savings adjustment|savings adjustment/.test(context)) return null;

  const savingsSharePct =
    percentFromEntries(entries, (key, dense) =>
      /share|retained|percent|pct|savings adjustment/.test(key) || /share|retained|percent|pct|savingsadjustment/.test(dense),
    ) ?? percentFromEvidence(evidenceLine);
  const grossSavingsUsd =
    amountFromEntries(entries, (key, dense) =>
      /gross savings|savings amount|interchange savings|eligible savings/.test(key) ||
      /grosssavings|savingsamount|interchangesavings|eligiblesavings/.test(dense),
    ) ??
    amountFromLabeledCells(evidenceLine, (label) => /gross savings|savings amount|interchange savings|eligible savings/.test(label)) ??
    amountNearPhrase(evidenceLine, [/gross savings/i, /savings amount/i, /interchange savings/i, /eligible savings/i]);
  const explicitRetainedUsd =
    amountFromEntries(entries, (key, dense) =>
      /retained|adjustment fee|savings adjustment fee|fee amount|amount charged/.test(key) ||
      /retained|adjustmentfee|savingsadjustmentfee|feeamount|amountcharged/.test(dense),
    ) ?? amountFromLabeledCells(evidenceLine, (label) => /retained|adjustment fee|savings adjustment fee|fee amount|amount charged/.test(label));
  const retainedSavingsUsd =
    savingsSharePct !== null && grossSavingsUsd !== null ? round2((savingsSharePct / 100) * grossSavingsUsd) : explicitRetainedUsd;
  const capturedFields = [savingsSharePct, grossSavingsUsd, retainedSavingsUsd].filter((value) => value !== null).length;

  return {
    savingsSharePct,
    grossSavingsUsd,
    retainedSavingsUsd,
    sourceSection: section.title || "Savings-share adjustment detail",
    evidenceLine,
    rowIndex,
    confidence: clamp(0.45 + capturedFields * 0.12 + (section.type === "add_on_fees" ? 0.08 : 0), 0.45, 0.9),
  };
}

function buildGuideMeasureModel(
  monthlyMinimums: MonthlyMinimumModel[],
  expressFundingPremiums: ExpressFundingPremiumModel[],
  savingsShareAdjustments: SavingsShareAdjustmentModel[],
): GuideMeasureModel {
  const bestByConfidence = <T extends { confidence: number }>(items: T[]): T | null =>
    items.length > 0 ? [...items].sort((a, b) => b.confidence - a.confidence)[0] : null;

  return {
    monthlyMinimum: bestByConfidence(monthlyMinimums),
    expressFundingPremium: bestByConfidence(expressFundingPremiums),
    savingsShareAdjustment: bestByConfidence(savingsShareAdjustments),
  };
}

function structuredFeeKindFromContext(context: string): StructuredFeeFindingKind | null {
  if (/\bpci\b.*\b(non compliance|noncompliance)\b|\b(non compliance|noncompliance)\b.*\bpci\b/.test(context)) {
    return "pci_non_compliance";
  }
  if (/\bnon emv\b|\bnonemv\b|\bnon chip\b|\bemv non compliance\b/.test(context)) return "non_emv";
  if (/\brisk fee\b|\bportfolio risk\b|\brisk assessment\b|\brisk monitoring\b|\brisk adjustment\b/.test(context)) {
    return "risk_fee";
  }
  if (/\bcustomer intelligence suite\b/.test(context)) return "customer_intelligence_suite";
  return null;
}

function buildStructuredFeeFinding(
  row: Record<string, string | number>,
  rowIndex: number,
  section: SectionContext,
  evidenceLine: string,
): StructuredFeeFinding | null {
  if (!hasRecognizedSection(section)) return null;
  if (section.type !== "add_on_fees" && section.type !== "processor_markup" && section.type !== "summary") return null;

  const entries = entriesFor(row);
  const context = normalize(rowContext(section, entries, evidenceLine));
  const kind = structuredFeeKindFromContext(context);
  if (!kind) return null;

  const label = labelFromRecord(row, entries, evidenceLine);
  const explicitAmountUsd =
    numericAmountEntries(entries).find((entry) => {
      const isRate = /rate|percent|pct|basis|bps/.test(entry.key) || /rate|percent|pct|basis|bps/.test(entry.dense);
      const isVolume = /volume|sales|processed|affected/.test(entry.key) || /volume|sales|processed|affected/.test(entry.dense);
      if (isRate || isVolume) return false;
      return /amount|fee|charge|paid|total/.test(entry.key) || /amount|fee|charge|paid|total/.test(entry.dense);
    })?.amount ??
    amountFromLabeledCells(evidenceLine, (labelText) => {
      if (/volume|sales|processed|affected|rate|percent|pct|basis|bps/.test(labelText)) return false;
      return /amount|fee|charge|paid|total/.test(labelText);
    });
  const ratePercent =
    percentFromEntries(entries, (key, dense) =>
      /rate|percent|pct|extra markup|surcharge|non emv/.test(key) || /rate|percent|pct|extramarkup|surcharge|nonemv/.test(dense),
    ) ?? percentFromEvidence(evidenceLine);
  const affectedVolumeUsd =
    amountFromEntries(entries, (key, dense) =>
      /affected volume|non emv volume|qualifying volume|card not present volume|cnp volume|volume|sales/.test(key) ||
      /affectedvolume|nonemvvolume|qualifyingvolume|cardnotpresentvolume|cnpvolume|volume|sales/.test(dense),
    ) ??
    amountFromLabeledCells(evidenceLine, (labelText) =>
      /affected volume|non emv volume|qualifying volume|card not present volume|cnp volume|volume|sales/.test(labelText),
    ) ??
    amountNearPhrase(evidenceLine, [/affected volume/i, /non[-\s]?emv volume/i, /qualifying volume/i, /card[-\s]?not[-\s]?present volume/i]);
  const fallbackAmountUsd = lastRowAmount(entries, evidenceLine);
  const fallbackLooksLikeAffectedVolume =
    kind === "non_emv" &&
    fallbackAmountUsd !== null &&
    affectedVolumeUsd !== null &&
    Math.abs(fallbackAmountUsd - affectedVolumeUsd) <= 0.01;
  const amountUsd = explicitAmountUsd ?? (fallbackLooksLikeAffectedVolume ? null : fallbackAmountUsd);

  const estimatedImpactUsd =
    kind === "non_emv" && ratePercent !== null && affectedVolumeUsd !== null
      ? round2((affectedVolumeUsd * ratePercent) / 100 + (amountUsd ?? 0))
      : amountUsd;
  const capturedFields = [amountUsd, ratePercent, affectedVolumeUsd, estimatedImpactUsd].filter((value) => value !== null).length;

  return {
    kind,
    label,
    amountUsd,
    ratePercent,
    affectedVolumeUsd,
    estimatedImpactUsd,
    sourceSection: sourceSectionName(section, "Statement fee detail"),
    evidenceLine,
    rowIndex,
    confidence: clamp(0.48 + capturedFields * 0.1 + (section.type === "add_on_fees" ? 0.12 : 0), 0.5, 0.94),
  };
}

function qualificationFromContext(context: string): BundledPricingBucket["qualification"] {
  if (/\bmid qualified\b|\bmidqualified\b|\bmid qual\b|\bmidqual\b/.test(context)) return "mid_qualified";
  if (/\bnon qualified\b|\bnonqualified\b|\bnon qual\b|\bnonqual\b/.test(context)) return "non_qualified";
  if (/\bqualified\b|\bqual\b/.test(context)) return "qualified";
  return "unknown";
}

function countFromEntries(entries: FieldHit[]): number | null {
  const hit = findNumericField(entries, (key, dense) =>
    /\b(transaction|transactions|trans|txn|items|item count|count|qty|quantity|number)\b/.test(key) ||
    /transactioncount|txncount|itemcount|quantity|number/.test(dense),
  );
  const amount = hit ? parseAmount(hit.value) : null;
  return amount === null ? null : Math.round(amount);
}

function buildBundledPricingBucket(
  row: Record<string, string | number>,
  rowIndex: number,
  section: SectionContext,
  evidenceLine: string,
): BundledPricingBucket | null {
  if (!hasRecognizedSection(section) || section.type === "interchange_detail" || section.type === "notices") return null;

  const entries = entriesFor(row);
  const context = normalize(rowContext(section, entries, evidenceLine));
  const qualification = qualificationFromContext(context);
  if (qualification === "unknown") return null;

  const rate =
    percentFromEntries(entries, (key, dense) =>
      /\b(rate|percent|pct|discount rate|qualified rate)\b/.test(key) || /discountrate|qualifiedrate|rate|percent|pct/.test(dense),
    ) ?? percentFromEvidence(evidenceLine);
  const volumeUsd =
    amountFromEntries(entries, (key, dense) =>
      /\b(volume|sales amount|sales volume|amount processed|processed amount|total sales)\b/.test(key) ||
      /salesamount|salesvolume|amountprocessed|processedamount|totalsales/.test(dense),
    ) ?? amountFromLabeledCells(evidenceLine, (labelText) => /\b(volume|sales amount|sales volume|amount processed|total sales)\b/.test(labelText));
  const transactionCount = countFromEntries(entries);
  const feeAmountUsd =
    amountFromEntries(entries, (key, dense) => {
      const isVolume = /volume|sales|processed/.test(key) || /volume|sales|processed/.test(dense);
      const isRate = /rate|percent|pct|basis|bps/.test(key) || /rate|percent|pct|basis|bps/.test(dense);
      const isCount = /count|qty|quantity|transaction|trans|txn|items|number/.test(key) || /count|qty|quantity|transaction|txn|items|number/.test(dense);
      if (isVolume || isRate || isCount) return false;
      return /\b(fee|fees|charge|amount due|paid|total)\b/.test(key) || /fee|charge|amountdue|paid|total/.test(dense);
    }) ?? null;

  if (rate === null && volumeUsd === null && feeAmountUsd === null) return null;

  return {
    qualification,
    label: labelFromRecord(row, entries, evidenceLine),
    ratePercent: rate,
    volumeUsd,
    transactionCount,
    feeAmountUsd,
    sourceSection: sourceSectionName(section, "Bundled pricing detail"),
    evidenceLine,
    rowIndex,
    confidence: clamp(
      0.42 +
        (rate !== null ? 0.14 : 0) +
        (volumeUsd !== null ? 0.12 : 0) +
        (feeAmountUsd !== null ? 0.12 : 0) +
        (section.type === "processor_markup" || section.type === "summary" ? 0.08 : 0),
      0.45,
      0.92,
    ),
  };
}

function buildBundledPricingModel(buckets: BundledPricingBucket[]): BundledPricingModel {
  const seen = new Set<string>();
  const deduped: BundledPricingBucket[] = [];
  for (const bucket of buckets) {
    const key = [bucket.qualification, bucket.ratePercent ?? "", bucket.volumeUsd ?? "", normalize(bucket.evidenceLine)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(bucket);
  }

  const qualifications = new Set(deduped.map((bucket) => bucket.qualification));
  const hasTierSpread = qualifications.has("qualified") && (qualifications.has("mid_qualified") || qualifications.has("non_qualified"));
  const hasPenaltyTierWithRate = deduped.some(
    (bucket) => (bucket.qualification === "mid_qualified" || bucket.qualification === "non_qualified") && bucket.ratePercent !== null,
  );
  const rates = deduped.map((bucket) => bucket.ratePercent).filter((value): value is number => value !== null);
  const volumes = deduped.map((bucket) => bucket.volumeUsd).filter((value): value is number => value !== null);
  const fees = deduped.map((bucket) => bucket.feeAmountUsd).filter((value): value is number => value !== null);
  const active = deduped.length >= 2 && (hasTierSpread || hasPenaltyTierWithRate);

  return {
    active,
    buckets: deduped,
    highestRatePercent: rates.length > 0 ? round4(Math.max(...rates)) : null,
    totalVolumeUsd: volumes.length > 0 ? round2(volumes.reduce((sum, value) => sum + value, 0)) : null,
    totalFeesUsd: fees.length > 0 ? round2(fees.reduce((sum, value) => sum + value, 0)) : null,
    confidence: deduped.length > 0 ? round2(deduped.reduce((sum, bucket) => sum + bucket.confidence, 0) / deduped.length) : 0,
  };
}

function effectiveDateFromEvidence(evidenceLine: string): string | null {
  const match =
    evidenceLine.match(/\b(?:effective|beginning|starts?|as of)\s+([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4}|[A-Z][a-z]+\.?\s+\d{1,2}|[A-Z][a-z]+\.?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i) ??
    evidenceLine.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  return match ? collapseWhitespace(match[1]) : null;
}

function buildNoticeFindings(rowIndex: number, section: SectionContext, evidenceLine: string): NoticeFinding[] {
  if (section.type !== "notices") return [];
  const normalized = normalize(`${section.title} ${evidenceLine}`);
  const findings: NoticeFinding[] = [];
  const effectiveDate = effectiveDateFromEvidence(evidenceLine);

  const push = (kind: NoticeFinding["kind"], confidence: number) => {
    findings.push({
      kind,
      effectiveDate,
      sourceSection: sourceSectionName(section, "Statement notices"),
      evidenceLine,
      rowIndex,
      confidence,
    });
  };

  if (/billing change|fee change|pricing change|rate change|new fee|increase|adjustment|terms? change/.test(normalized)) {
    push("fee_change", 0.82);
  }
  if (/go online|visit.*website|website.*details|online.*details|log in.*details/.test(normalized)) {
    push("online_only", 0.84);
  }
  if (/continued use|use your account|accept these terms|acceptance|deemed accepted/.test(normalized)) {
    push("acceptance_by_use", 0.82);
  }
  if (effectiveDate) {
    push("effective_date", 0.78);
  }

  return findings;
}

function dedupeNoticeFindings(findings: NoticeFinding[]): NoticeFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = [finding.kind, finding.effectiveDate ?? "", normalize(finding.evidenceLine)].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildDowngradeAnalysis(rows: InterchangeAuditRow[]): DowngradeAnalysis {
  const downgradeRows: DowngradeFindingRow[] = rows
    .filter((row) => row.downgradeIndicators.length > 0)
    .map((row) => {
      const low = row.volume !== null ? round2(row.volume * 0.003) : null;
      const high = row.volume !== null ? round2(row.volume * 0.004) : null;
      return {
        label: row.label,
        indicators: row.downgradeIndicators,
        transactionCount: row.transactionCount,
        volumeUsd: row.volume,
        totalPaidUsd: row.totalPaid ?? row.expectedTotalPaid,
        estimatedPenaltyLowUsd: low,
        estimatedPenaltyHighUsd: high,
        sourceSection: row.sourceSection,
        evidenceLine: row.evidenceLine,
        rowIndex: row.rowIndex,
        confidence: row.confidence,
      };
    });

  const volumes = downgradeRows.map((row) => row.volumeUsd).filter((value): value is number => value !== null);
  const lows = downgradeRows.map((row) => row.estimatedPenaltyLowUsd).filter((value): value is number => value !== null);
  const highs = downgradeRows.map((row) => row.estimatedPenaltyHighUsd).filter((value): value is number => value !== null);

  return {
    rows: downgradeRows,
    affectedVolumeUsd: volumes.length > 0 ? round2(volumes.reduce((sum, value) => sum + value, 0)) : null,
    estimatedPenaltyLowUsd: lows.length > 0 ? round2(lows.reduce((sum, value) => sum + value, 0)) : null,
    estimatedPenaltyHighUsd: highs.length > 0 ? round2(highs.reduce((sum, value) => sum + value, 0)) : null,
    confidence:
      downgradeRows.length > 0 ? round2(downgradeRows.reduce((sum, row) => sum + row.confidence, 0) / downgradeRows.length) : 0,
  };
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

function hasProcessorMarkupContext(section: SectionContext, row: Record<string, string | number>, evidenceLine: string): boolean {
  if (section.type === "interchange_detail") return false;
  const context = collapseWhitespace(
    [
      section.title,
      evidenceLine,
      ...entriesFor(row).map((entry) => `${entry.key} ${String(entry.value)}`),
    ].join(" "),
  ).toLowerCase();

  if (/\binterchange\b|\bprogram fees?\b|\bcard brand\b|\bcard network\b/.test(context)) return false;
  return /\b(processor markup|service charges?|discount fees?|processing fees?|assessment markup|hps processing|markup)\b/.test(context);
}

function processorMarkupRowFromCandidate(candidate: PricingCandidate): ProcessorMarkupAuditRow {
  const totalPaid = candidate.totalPaid ?? candidate.expectedTotalPaid;
  return {
    label: candidate.label,
    cardBrand: candidate.cardBrand,
    cardType: candidate.cardType,
    transactionCount: candidate.transactionCount,
    volume: candidate.volume,
    ratePercent: candidate.ratePercent,
    rateBps: candidate.rateBps,
    effectiveRateBps: amountToBps(totalPaid, candidate.volume),
    perItemFee: candidate.perItemFee,
    totalPaid: candidate.totalPaid,
    expectedTotalPaid: candidate.expectedTotalPaid,
    sourceSection: candidate.sourceSection,
    evidenceLine: candidate.evidenceLine,
    rowIndex: candidate.rowIndex,
    confidence: 0.78,
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

function explicitAmountTotal(rows: StatementEconomicFeeRow[], bucket: StatementEconomicBucket): number | null {
  const total = rows.filter((row) => row.bucket === bucket).reduce((sum, row) => sum + row.amount, 0);
  return total > 0 ? round2(total) : null;
}

function processorMarkupTotal(rows: ProcessorMarkupAuditRow[], blendedFeeSplits: BlendedFeeSplit[]): number | null {
  const rowTotal = rows.reduce((sum, row) => sum + (row.totalPaid ?? row.expectedTotalPaid ?? 0), 0);
  const blendedTotal = blendedFeeSplits.reduce(
    (sum, split) => sum + (split.processorMarkup.totalPaid ?? split.processorMarkup.expectedTotalPaid ?? 0),
    0,
  );
  const total = rowTotal + blendedTotal;
  return total > 0 ? round2(total) : null;
}

function guideMeasureFeeRows(guideMeasures: GuideMeasureModel): StatementEconomicFeeRow[] {
  const rows: StatementEconomicFeeRow[] = [];
  const monthlyMinimum = guideMeasures.monthlyMinimum;
  const expressFunding = guideMeasures.expressFundingPremium;
  const savingsShare = guideMeasures.savingsShareAdjustment;

  if (isPositiveAmount(monthlyMinimum?.topUpUsd)) {
    rows.push({
      label: "monthly minimum top-up",
      amount: round2(monthlyMinimum.topUpUsd),
      bucket: "add_on_fees",
      sourceSection: monthlyMinimum.sourceSection,
      evidenceLine: monthlyMinimum.evidenceLine,
      rowIndex: monthlyMinimum.rowIndex,
      confidence: monthlyMinimum.confidence,
    });
  }

  if (isPositiveAmount(expressFunding?.premiumUsd)) {
    rows.push({
      label: "express funding premium",
      amount: round2(expressFunding.premiumUsd),
      bucket: "add_on_fees",
      sourceSection: expressFunding.sourceSection,
      evidenceLine: expressFunding.evidenceLine,
      rowIndex: expressFunding.rowIndex,
      confidence: expressFunding.confidence,
    });
  }

  if (isPositiveAmount(savingsShare?.retainedSavingsUsd)) {
    rows.push({
      label: "savings-share adjustment",
      amount: round2(savingsShare.retainedSavingsUsd),
      bucket: "add_on_fees",
      sourceSection: savingsShare.sourceSection,
      evidenceLine: savingsShare.evidenceLine,
      rowIndex: savingsShare.rowIndex,
      confidence: savingsShare.confidence,
    });
  }

  return rows;
}

function dedupeEconomicRows(rows: StatementEconomicFeeRow[]): StatementEconomicFeeRow[] {
  const seen = new Set<string>();
  const deduped: StatementEconomicFeeRow[] = [];

  for (const row of rows) {
    const key = [row.bucket, normalize(row.label), row.amount, row.rowIndex, normalize(row.evidenceLine)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function bestAmountFact(facts: StatementAmountFact[]): StatementAmountFact | null {
  if (facts.length === 0) return null;
  return [...facts].sort((a, b) => b.confidence - a.confidence || b.amount - a.amount || b.rowIndex - a.rowIndex)[0];
}

function buildEconomicRollup(
  acc: EconomicAccumulator,
  interchangeAudit: InterchangeAuditSummary,
  processorRows: ProcessorMarkupAuditRow[],
  blendedFeeSplits: BlendedFeeSplit[],
  guideMeasures: GuideMeasureModel,
): StatementEconomicRollup {
  const feeRows = dedupeEconomicRows([...acc.feeRows, ...guideMeasureFeeRows(guideMeasures)]);
  const cardBrandPassThrough = interchangeAudit.totalPaid ?? explicitAmountTotal(feeRows, "card_brand_pass_through");
  const markupTotal = processorMarkupTotal(processorRows, blendedFeeSplits) ?? explicitAmountTotal(feeRows, "processor_markup");
  const addOnTotal = explicitAmountTotal(feeRows, "add_on_fees");

  const synthesizedRows: StatementEconomicFeeRow[] = [];
  if (interchangeAudit.totalPaid !== null && interchangeAudit.totalPaid > 0) {
    synthesizedRows.push({
      label: "card brand interchange detail",
      amount: round2(interchangeAudit.totalPaid),
      bucket: "card_brand_pass_through",
      sourceSection: "Interchange detail",
      evidenceLine: "Rollup from captured interchange audit rows",
      rowIndex: -1,
      confidence: interchangeAudit.confidence,
    });
  }
  if (markupTotal !== null && markupTotal > 0 && processorRows.length + blendedFeeSplits.length > 0) {
    synthesizedRows.push({
      label: "processor markup detail",
      amount: markupTotal,
      bucket: "processor_markup",
      sourceSection: "Processor markup detail",
      evidenceLine: "Rollup from captured processor markup rows",
      rowIndex: -1,
      confidence: 0.82,
    });
  }

  const detailRows = feeRows.filter((row) => {
    if (row.bucket === "card_brand_pass_through" && interchangeAudit.totalPaid !== null) return false;
    if (row.bucket === "processor_markup" && processorRows.length + blendedFeeSplits.length > 0) return false;
    return true;
  });
  const allRows = dedupeEconomicRows([...synthesizedRows, ...detailRows]);
  const componentTotal = [cardBrandPassThrough, markupTotal, addOnTotal].reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const totalFeeFact = bestAmountFact(acc.totalFeeFacts);
  const totalVolumeFact = bestAmountFact(acc.totalVolumeFacts);
  const totalFees = totalFeeFact?.amount ?? (componentTotal > 0 ? round2(componentTotal) : null);
  const capturedCoreFacts = [totalVolumeFact, totalFees, cardBrandPassThrough, markupTotal, addOnTotal].filter((value) => value !== null).length;
  const confidence = clamp(0.25 + capturedCoreFacts * 0.12 + (allRows.length > 0 ? 0.12 : 0), 0, 0.92);

  return {
    totalVolume: totalVolumeFact?.amount ?? interchangeAudit.volume ?? null,
    totalFees,
    cardBrandPassThrough,
    processorMarkup: markupTotal,
    addOnFees: addOnTotal,
    feeRows: allRows,
    confidence: round2(confidence),
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
  const processorMarkupRows: ProcessorMarkupAuditRow[] = [];
  const structuredFeeFindings: StructuredFeeFinding[] = [];
  const bundledPricingBuckets: BundledPricingBucket[] = [];
  const noticeFindings: NoticeFinding[] = [];
  const repricingNoticeLines: RepricingNoticeLine[] = [];
  const perItemFeeComponents: PerItemFeeComponent[] = [];
  const monthlyMinimums: MonthlyMinimumModel[] = [];
  const expressFundingPremiums: ExpressFundingPremiumModel[] = [];
  const savingsShareAdjustments: SavingsShareAdjustmentModel[] = [];
  const blendedCandidates: PricingCandidate[] = [];
  const economicAccumulator: EconomicAccumulator = {
    totalVolumeFacts: [],
    totalFeeFacts: [],
    feeRows: [],
  };
  const parseBlendedRows = shouldParseBlendedRows(doc, options);
  let currentSection: SectionContext = { type: "unknown", title: "Uncategorized" };
  let currentAuditHeaders: string[] = [];

  doc.rows.forEach((row, rowIndex) => {
    const evidence = rowEvidence(row);
    if (!evidence) return;

    const previousSection = currentSection;
    currentSection = updateSection(sections, currentSection, evidence);
    if (currentSection.type !== previousSection.type || currentSection.title !== previousSection.title) {
      currentAuditHeaders = [];
    }
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

    addEconomicFacts(economicAccumulator, mappedRow, rowIndex, currentSection, evidence);

    const structuredFeeFinding = buildStructuredFeeFinding(mappedRow, rowIndex, currentSection, evidence);
    if (structuredFeeFinding) {
      structuredFeeFindings.push(structuredFeeFinding);
    }

    const bundledPricingBucket = buildBundledPricingBucket(mappedRow, rowIndex, currentSection, evidence);
    if (bundledPricingBucket) {
      bundledPricingBuckets.push(bundledPricingBucket);
    }

    noticeFindings.push(...buildNoticeFindings(rowIndex, currentSection, evidence));
    if (currentSection.type === "notices") {
      repricingNoticeLines.push({
        rowIndex,
        sourceSection: sourceSectionName(currentSection, "Statement notices"),
        evidenceLine: evidence,
      });
    }

    const perItemComponent = buildPerItemFeeComponent(mappedRow, rowIndex, currentSection, evidence);
    if (perItemComponent) {
      perItemFeeComponents.push(perItemComponent);
    }

    const monthlyMinimum = buildMonthlyMinimumModel(mappedRow, rowIndex, currentSection, evidence);
    if (monthlyMinimum) {
      monthlyMinimums.push(monthlyMinimum);
    }

    const expressFundingPremium = buildExpressFundingPremiumModel(mappedRow, rowIndex, currentSection, evidence);
    if (expressFundingPremium) {
      expressFundingPremiums.push(expressFundingPremium);
    }

    const savingsShareAdjustment = buildSavingsShareAdjustmentModel(mappedRow, rowIndex, currentSection, evidence);
    if (savingsShareAdjustment) {
      savingsShareAdjustments.push(savingsShareAdjustment);
    }

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

    if (hasProcessorMarkupContext(currentSection, mappedRow, evidence)) {
      const processorCandidate = buildPricingCandidate(mappedRow, rowIndex, currentSection, evidence);
      if (processorCandidate) {
        processorMarkupRows.push(processorMarkupRowFromCandidate(processorCandidate));
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
  const bundledPricing = buildBundledPricingModel(bundledPricingBuckets);
  const downgradeAnalysis = buildDowngradeAnalysis(dedupedRows);
  const perItemFeeModel = buildPerItemFeeModel(perItemFeeComponents);
  const guideMeasures = buildGuideMeasureModel(monthlyMinimums, expressFundingPremiums, savingsShareAdjustments);
  const repricingEvents = extractRepricingEventsFromNoticeLines(repricingNoticeLines);
  const economicRollup = buildEconomicRollup(
    economicAccumulator,
    interchangeAudit,
    processorMarkupRows,
    blendedFeeSplits,
    guideMeasures,
  );

  return {
    statementSections: sections,
    interchangeAudit,
    interchangeAuditRows: dedupedRows,
    blendedFeeSplits,
    processorMarkupRows,
    structuredFeeFindings,
    bundledPricing,
    noticeFindings: dedupeNoticeFindings(noticeFindings),
    repricingEvents,
    downgradeAnalysis,
    perItemFeeModel,
    guideMeasures,
    economicRollup,
  };
}
