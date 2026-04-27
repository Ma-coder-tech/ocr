import type {
  RepricingCadence,
  RepricingDisclosureStyle,
  RepricingEvent,
  RepricingEventKind,
  RepricingValue,
  RepricingValueSource,
  RepricingValueType,
} from "./types.js";

export type RepricingNoticeLine = {
  rowIndex: number;
  sourceSection: string;
  evidenceLine: string;
};

const MONEY_PATTERN = String.raw`\$\s*(?:\d[\d,]*(?:\.\d+)?|\.\d+)`;
const CHANGE_SIGNAL_RE =
  /\b(billing change|fee change|pricing change|rate change|new fee|new charge|increase|increased|increasing|adjustment|will apply|will be assessed|basis points?|bps)\b/i;
const ONLINE_RE = /\b(go online|visit.*website|website.*details|online.*details|log in.*details)\b/i;
const ACCEPTANCE_RE = /\b(continued use|use your account|accept these terms|acceptance|deemed accepted)\b/i;
const RATE_CONTEXT_RE = /\b(rate|rates|basis points?|bps|percent|percentage)\b/i;
const FEE_LABEL_RE =
  /\b(monthly service fee|monthly fee|statement fee|pci compliance fee|pci fee|gateway fee|authorization fee|auth fee|transaction fee|per item fee|processing fee|service fee|administrative fee|regulatory fee|risk fee|batch fee|annual fee|monthly minimum)\b/i;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function parseNumber(raw: string): number | null {
  const parsed = Number(raw.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? round2(parsed) : null;
}

function inferredOldMoneyValue(newAmount: number | null, delta: number, cadence: RepricingCadence): RepricingValue | null {
  if (newAmount === null) return null;
  const oldAmount = newAmount - delta;
  return oldAmount >= 0 ? value(oldAmount, "money", cadence, "inferred") : null;
}

function value(
  rawValue: number,
  valueType: RepricingValueType,
  cadence: RepricingCadence,
  source: RepricingValueSource,
): RepricingValue {
  return {
    value: round2(rawValue),
    valueType,
    cadence,
    source,
  };
}

function effectiveDateFromEvidence(evidenceLine: string): string | null {
  const match =
    evidenceLine.match(/\b(?:effective|beginning|starts?|as of)\s+([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4}|[A-Z][a-z]+\.?\s+\d{1,2}|[A-Z][a-z]+\.?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i) ??
    evidenceLine.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  return match ? collapseWhitespace(match[1]) : null;
}

function cadenceFromText(text: string): RepricingCadence {
  if (/\b(per item|per trans(?:action)?|per txn|authorization|auth fee|transaction fee)\b/i.test(text)) return "per_item";
  if (/\b(annual|annually|yearly|per year)\b/i.test(text)) return "annual";
  if (/\b(monthly|per month|month)\b/i.test(text)) return "monthly";
  if (/\b(one[-\s]?time|one time)\b/i.test(text)) return "one_time";
  return "unknown";
}

function disclosureStyleFromText(text: string, hasExplicitValue: boolean): RepricingDisclosureStyle {
  if (ONLINE_RE.test(text)) return "online_only";
  if (ACCEPTANCE_RE.test(text)) return "acceptance_by_use";
  return hasExplicitValue ? "explicit_on_statement" : "ambiguous";
}

function feeLabelFromText(text: string): string | null {
  const explicit = text.match(FEE_LABEL_RE);
  if (explicit) return collapseWhitespace(explicit[1].toLowerCase());

  const beforeChange = text.match(/\b([A-Za-z][A-Za-z\s/-]{2,60}?(?:fee|charge|rate))\s+(?:will\s+)?(?:increase|increased|change|adjust)/i);
  if (beforeChange) return collapseWhitespace(beforeChange[1].toLowerCase());

  const newFee = text.match(/\bnew\s+([A-Za-z][A-Za-z\s/-]{2,60}?(?:fee|charge|rate))\b/i);
  return newFee ? collapseWhitespace(newFee[1].toLowerCase()) : null;
}

function confidenceFor(event: Omit<RepricingEvent, "confidence">): number {
  let confidence = 0.62;
  if (event.feeLabel) confidence += 0.08;
  if (event.effectiveDate) confidence += 0.08;
  if (event.oldValue && event.newValue) confidence += 0.12;
  if (event.deltaValue) confidence += 0.08;
  if (event.evidenceLines.length > 1) confidence += 0.03;
  if (event.disclosureStyle === "online_only" || event.disclosureStyle === "acceptance_by_use") confidence -= 0.04;
  if ([event.oldValue, event.newValue, event.deltaValue].some((item) => item?.source === "inferred")) confidence -= 0.03;
  return round2(clamp(confidence, 0.5, 0.95));
}

function buildEvent(
  fields: {
    kind: RepricingEventKind;
    feeLabel: string | null;
    oldValue: RepricingValue | null;
    newValue: RepricingValue | null;
    deltaValue: RepricingValue | null;
    effectiveDate: string | null;
  },
  lines: RepricingNoticeLine[],
): RepricingEvent {
  const evidenceLines = lines.map((line) => line.evidenceLine);
  const evidenceLine = collapseWhitespace(evidenceLines.join(" "));
  const event = {
    ...fields,
    disclosureStyle: disclosureStyleFromText(evidenceLine, Boolean(fields.oldValue || fields.newValue || fields.deltaValue)),
    sourceSection: lines[0]?.sourceSection ?? "Statement notices",
    evidenceLine,
    evidenceLines,
    rowStartIndex: lines[0]?.rowIndex ?? -1,
    rowEndIndex: lines[lines.length - 1]?.rowIndex ?? -1,
  };
  return { ...event, confidence: confidenceFor(event) };
}

function extractFromText(lines: RepricingNoticeLine[]): RepricingEvent | null {
  const text = collapseWhitespace(lines.map((line) => line.evidenceLine).join(" "));
  if (!CHANGE_SIGNAL_RE.test(text)) return null;

  const effectiveDate = effectiveDateFromEvidence(text);
  const cadence = cadenceFromText(text);
  const feeLabel = feeLabelFromText(text);

  const moneyFromTo = text.match(new RegExp(`\\bfrom\\s+(${MONEY_PATTERN})\\s+(?:to|up to)\\s+(${MONEY_PATTERN})`, "i"));
  if (moneyFromTo) {
    const oldAmount = parseNumber(moneyFromTo[1]);
    const newAmount = parseNumber(moneyFromTo[2]);
    if (oldAmount !== null && newAmount !== null && newAmount >= oldAmount) {
      return buildEvent(
        {
          kind: "fee_increase",
          feeLabel,
          oldValue: value(oldAmount, "money", cadence, "explicit"),
          newValue: value(newAmount, "money", cadence, "explicit"),
          deltaValue: value(newAmount - oldAmount, "money", cadence, "inferred"),
          effectiveDate,
        },
        lines,
      );
    }
  }

  const percentFromTo = text.match(/\bfrom\s+(\d+(?:\.\d+)?)\s*%\s+(?:to|up to)\s+(\d+(?:\.\d+)?)\s*%/i);
  if (percentFromTo && RATE_CONTEXT_RE.test(text)) {
    const oldRate = parseNumber(percentFromTo[1]);
    const newRate = parseNumber(percentFromTo[2]);
    if (oldRate !== null && newRate !== null && newRate >= oldRate) {
      return buildEvent(
        {
          kind: "rate_increase",
          feeLabel,
          oldValue: value(oldRate, "percentage", cadence, "explicit"),
          newValue: value(newRate, "percentage", cadence, "explicit"),
          deltaValue: value(newRate - oldRate, "percentage", cadence, "inferred"),
          effectiveDate,
        },
        lines,
      );
    }
  }

  const increaseByMoney = text.match(new RegExp(`\\bincreas(?:e|ed|ing)?\\b.{0,50}?\\bby\\s+(${MONEY_PATTERN})`, "i"));
  if (increaseByMoney) {
    const delta = parseNumber(increaseByMoney[1]);
    const toAmount = text.match(new RegExp(`\\bto\\s+(${MONEY_PATTERN})`, "i"));
    const newAmount = toAmount ? parseNumber(toAmount[1]) : null;
    if (delta !== null) {
      return buildEvent(
        {
          kind: "fee_increase",
          feeLabel,
          oldValue: inferredOldMoneyValue(newAmount, delta, cadence),
          newValue: newAmount !== null ? value(newAmount, "money", cadence, "explicit") : null,
          deltaValue: value(delta, "money", cadence, "explicit"),
          effectiveDate,
        },
        lines,
      );
    }
  }

  const newFee = text.match(new RegExp(`\\bnew\\b.{0,80}?\\b(?:fee|charge)\\b.{0,40}?\\b(?:of|for|at)\\s+(${MONEY_PATTERN})`, "i"));
  if (newFee) {
    const newAmount = parseNumber(newFee[1]);
    if (newAmount !== null) {
      return buildEvent(
        {
          kind: "new_fee",
          feeLabel,
          oldValue: value(0, "money", cadence, "inferred"),
          newValue: value(newAmount, "money", cadence, "explicit"),
          deltaValue: value(newAmount, "money", cadence, "inferred"),
          effectiveDate,
        },
        lines,
      );
    }
  }

  const increaseToMoney = text.match(new RegExp(`\\bincreas(?:e|ed|ing)?\\b.{0,80}?\\bto\\s+(${MONEY_PATTERN})`, "i"));
  if (increaseToMoney) {
    const newAmount = parseNumber(increaseToMoney[1]);
    if (newAmount !== null) {
      return buildEvent(
        {
          kind: "fee_increase",
          feeLabel,
          oldValue: null,
          newValue: value(newAmount, "money", cadence, "explicit"),
          deltaValue: null,
          effectiveDate,
        },
        lines,
      );
    }
  }

  const bpsIncrease = text.match(/\bincreas(?:e|ed|ing)?\b.{0,60}?\b(?:by\s+)?(\d+(?:\.\d+)?)\s*(?:basis points?|bps)\b/i);
  if (bpsIncrease) {
    const delta = parseNumber(bpsIncrease[1]);
    if (delta !== null) {
      return buildEvent(
        {
          kind: "rate_increase",
          feeLabel,
          oldValue: null,
          newValue: null,
          deltaValue: value(delta, "basis_points", cadence, "explicit"),
          effectiveDate,
        },
        lines,
      );
    }
  }

  const percentIncrease = text.match(/\bincreas(?:e|ed|ing)?\b.{0,60}?\bby\s+(\d+(?:\.\d+)?)\s*%/i);
  if (percentIncrease && RATE_CONTEXT_RE.test(text)) {
    const delta = parseNumber(percentIncrease[1]);
    if (delta !== null) {
      return buildEvent(
        {
          kind: "rate_increase",
          feeLabel,
          oldValue: null,
          newValue: null,
          deltaValue: value(delta, "percentage", cadence, "explicit"),
          effectiveDate,
        },
        lines,
      );
    }
  }

  return null;
}

function dedupeEvents(events: RepricingEvent[]): RepricingEvent[] {
  const byKey = new Map<string, RepricingEvent>();
  for (const event of events) {
    const key = [
      event.kind,
      event.feeLabel ?? "",
      event.oldValue ? `${event.oldValue.valueType}:${event.oldValue.value}` : "",
      event.newValue ? `${event.newValue.valueType}:${event.newValue.value}` : "",
      event.deltaValue ? `${event.deltaValue.valueType}:${event.deltaValue.value}` : "",
    ].join("|");
    const current = byKey.get(key);
    if (
      !current ||
      event.confidence > current.confidence ||
      (event.confidence === current.confidence && event.evidenceLines.length < current.evidenceLines.length)
    ) {
      byKey.set(key, event);
    }
  }
  return [...byKey.values()].sort((a, b) => a.rowStartIndex - b.rowStartIndex || b.confidence - a.confidence);
}

export function extractRepricingEventsFromNoticeLines(lines: RepricingNoticeLine[]): RepricingEvent[] {
  const events: RepricingEvent[] = [];
  for (let start = 0; start < lines.length; start += 1) {
    for (let size = 1; size <= 3 && start + size <= lines.length; size += 1) {
      const window = lines.slice(start, start + size);
      if (window.some((line) => line.sourceSection !== window[0]?.sourceSection)) continue;
      const event = extractFromText(window);
      if (event) events.push(event);
    }
  }
  return dedupeEvents(events);
}
