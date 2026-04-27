import type {
  CardBrand,
  HiddenMarkupAuditRow,
  HiddenMarkupAuditSummary,
  InterchangeAuditRow,
  InterchangeScheduleMatch,
} from "./types.js";

export type InterchangeScheduleReference = {
  referenceId: string;
  version: string;
  brand: CardBrand;
  descriptor: string;
  descriptorPattern: string;
  rateBps: number;
  perItemFee: number;
  source: string;
  confidence: number;
};

// Deliberately empty until trusted, versioned card-brand schedules are loaded.
const DEFAULT_INTERCHANGE_SCHEDULE_REFERENCES: InterchangeScheduleReference[] = [];
const DOLLAR_TOLERANCE = 1;
const BPS_TOLERANCE = 2;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function amountToBps(amount: number | null, volume: number | null): number | null {
  if (amount === null || volume === null) return null;
  if (!Number.isFinite(amount) || !Number.isFinite(volume) || volume <= 0) return null;
  return round2((amount / volume) * 10_000);
}

function expectedCost(row: InterchangeAuditRow, reference: InterchangeScheduleReference): number | null {
  if (reference.rateBps > 0 && row.volume === null) return null;
  if (reference.perItemFee > 0 && row.transactionCount === null) return null;
  if (row.volume === null && row.transactionCount === null) return null;

  const volumeComponent = row.volume === null ? 0 : row.volume * (reference.rateBps / 10_000);
  const itemComponent = row.transactionCount === null ? 0 : row.transactionCount * reference.perItemFee;
  return round2(volumeComponent + itemComponent);
}

function descriptorMatches(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern, "i").test(value);
  } catch {
    return false;
  }
}

function matchScheduleReference(
  row: InterchangeAuditRow,
  references: InterchangeScheduleReference[],
): InterchangeScheduleReference | null {
  const candidates = references.filter((reference) => {
    if (reference.brand !== "Unknown" && row.cardBrand !== "Unknown" && reference.brand !== row.cardBrand) return false;
    return descriptorMatches(reference.descriptorPattern, row.label) || descriptorMatches(reference.descriptorPattern, row.evidenceLine);
  });

  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => right.confidence - left.confidence)[0];
}

function toScheduleMatch(reference: InterchangeScheduleReference): InterchangeScheduleMatch {
  return {
    referenceId: reference.referenceId,
    version: reference.version,
    brand: reference.brand,
    descriptor: reference.descriptor,
    rateBps: reference.rateBps,
    perItemFee: reference.perItemFee,
    source: reference.source,
    confidence: reference.confidence,
  };
}

function auditMatchedRow(row: InterchangeAuditRow, reference: InterchangeScheduleReference): HiddenMarkupAuditRow {
  const actualTotalPaid = row.totalPaid;
  const expectedCardBrandCost = expectedCost(row, reference);
  if (actualTotalPaid === null || expectedCardBrandCost === null) {
    return {
      label: row.label,
      cardBrand: row.cardBrand,
      transactionCount: row.transactionCount,
      volume: row.volume,
      actualTotalPaid,
      expectedCardBrandCost,
      expectedRateBps: reference.rateBps,
      expectedPerItemFee: reference.perItemFee,
      embeddedMarkupUsd: null,
      embeddedMarkupBps: null,
      status: "unknown",
      reason: "A trusted schedule matched, but actual paid or expected-cost inputs were incomplete.",
      scheduleMatch: toScheduleMatch(reference),
      sourceSection: row.sourceSection,
      evidenceLine: row.evidenceLine,
      rowIndex: row.rowIndex,
      confidence: round2(Math.min(row.confidence, reference.confidence) * 0.8),
    };
  }

  const embeddedMarkupUsd =
    actualTotalPaid !== null && expectedCardBrandCost !== null ? round2(actualTotalPaid - expectedCardBrandCost) : null;
  const embeddedMarkupBps = amountToBps(embeddedMarkupUsd, row.volume);
  const excessUsd = embeddedMarkupUsd ?? 0;
  const excessBps = embeddedMarkupBps ?? 0;
  const isFlagged = excessUsd > DOLLAR_TOLERANCE && (embeddedMarkupBps === null || excessBps > BPS_TOLERANCE);

  return {
    label: row.label,
    cardBrand: row.cardBrand,
    transactionCount: row.transactionCount,
    volume: row.volume,
    actualTotalPaid,
    expectedCardBrandCost,
    expectedRateBps: reference.rateBps,
    expectedPerItemFee: reference.perItemFee,
    embeddedMarkupUsd: embeddedMarkupUsd !== null && embeddedMarkupUsd > 0 ? embeddedMarkupUsd : null,
    embeddedMarkupBps: embeddedMarkupBps !== null && embeddedMarkupBps > 0 ? embeddedMarkupBps : null,
    status: isFlagged ? "warning" : "pass",
    reason: isFlagged
      ? "Charged interchange amount is above the trusted card-brand schedule match after tolerance."
      : "Charged interchange amount is within tolerance of the trusted card-brand schedule match.",
    scheduleMatch: toScheduleMatch(reference),
    sourceSection: row.sourceSection,
    evidenceLine: row.evidenceLine,
    rowIndex: row.rowIndex,
    confidence: round2(Math.min(row.confidence, reference.confidence)),
  };
}

function auditUnmatchedRow(row: InterchangeAuditRow): HiddenMarkupAuditRow {
  return {
    label: row.label,
    cardBrand: row.cardBrand,
    transactionCount: row.transactionCount,
    volume: row.volume,
    actualTotalPaid: row.totalPaid,
    expectedCardBrandCost: null,
    expectedRateBps: null,
    expectedPerItemFee: null,
    embeddedMarkupUsd: null,
    embeddedMarkupBps: null,
    status: "unknown",
    reason: "No trusted interchange schedule reference matched this structured row.",
    scheduleMatch: null,
    sourceSection: row.sourceSection,
    evidenceLine: row.evidenceLine,
    rowIndex: row.rowIndex,
    confidence: round2(row.confidence * 0.5),
  };
}

export function buildHiddenMarkupAudit(
  rows: InterchangeAuditRow[],
  references: InterchangeScheduleReference[] = DEFAULT_INTERCHANGE_SCHEDULE_REFERENCES,
): HiddenMarkupAuditSummary {
  if (rows.length === 0) {
    return {
      rows: [],
      rowCount: 0,
      matchedRowCount: 0,
      flaggedRowCount: 0,
      hiddenMarkupUsd: null,
      hiddenMarkupBps: null,
      status: "not_applicable",
      confidence: 0,
    };
  }

  const auditRows = rows.map((row) => {
    const reference = matchScheduleReference(row, references);
    return reference ? auditMatchedRow(row, reference) : auditUnmatchedRow(row);
  });

  const matchedRows = auditRows.filter((row) => row.scheduleMatch !== null);
  const flaggedRows = auditRows.filter((row) => row.status === "warning");
  const unknownRows = auditRows.filter((row) => row.status === "unknown");
  const hiddenMarkupUsdRaw = flaggedRows.reduce((sum, row) => sum + (row.embeddedMarkupUsd ?? 0), 0);
  const matchedVolumeRaw = matchedRows.reduce((sum, row) => sum + (row.volume ?? 0), 0);
  const hiddenMarkupBps = amountToBps(hiddenMarkupUsdRaw > 0 ? hiddenMarkupUsdRaw : null, matchedVolumeRaw > 0 ? matchedVolumeRaw : null);
  const confidenceRaw = auditRows.reduce((sum, row) => sum + row.confidence, 0);

  return {
    rows: auditRows,
    rowCount: auditRows.length,
    matchedRowCount: matchedRows.length,
    flaggedRowCount: flaggedRows.length,
    hiddenMarkupUsd: hiddenMarkupUsdRaw > 0 ? round2(hiddenMarkupUsdRaw) : null,
    hiddenMarkupBps,
    status: flaggedRows.length > 0 ? "warning" : unknownRows.length === 0 && matchedRows.length === auditRows.length ? "pass" : "unknown",
    confidence: auditRows.length > 0 ? round2(confidenceRaw / auditRows.length) : 0,
  };
}
