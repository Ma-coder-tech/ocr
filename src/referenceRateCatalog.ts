import { round8 } from "./reconciliation.js";

export type ReferenceNetwork = "VISA" | "MASTERCARD" | "DISCOVER" | "AMEX" | "PIN_DEBIT" | "OTHER";

export type ReferenceFeeFamily =
  | "interchange"
  | "assessment"
  | "network_per_item"
  | "dispute_fee"
  | "digital_fee"
  | "optblue_wholesale";

export type ReferenceFeeCategory =
  | "card_brand_interchange"
  | "card_brand_assessment"
  | "card_brand_network_fee"
  | "card_brand_dispute_fee"
  | "amex_optblue_wholesale";

export type ReferenceRateBasis = "percent_of_volume" | "per_item" | "per_auth" | "flat_monthly" | "variable";

export type ReferenceSourceType =
  | "official_network_doc"
  | "regulatory_filing"
  | "acquirer_schedule"
  | "processor_contract"
  | "inferred";

export type ReferenceRateScope =
  | "network_true"
  | "acquirer_specific"
  | "processor_specific"
  | "merchant_contract_specific"
  | "inferred";

export type ReferenceConfidence = "verified" | "draft" | "deprecated";
export type ReferenceRegion = "US" | "CA" | "EU" | "OTHER";

export type ReferenceRateCatalogRow = {
  feeCode: string;
  aliases: string[];
  network: ReferenceNetwork;
  cardProduct: string | null;
  feeFamily: ReferenceFeeFamily;
  feeCategory: ReferenceFeeCategory;
  rateBasis: ReferenceRateBasis;
  percentRate: number | null;
  perItemFee: number | null;
  flatFee: number | null;
  minimumFee: number | null;
  maximumFee: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceType: ReferenceSourceType;
  sourceName: string;
  sourceVersion: string;
  sourceFile: string;
  costProvableFromRateMatch: boolean;
  region: ReferenceRegion;
  rateScope: ReferenceRateScope;
  atCostProofEligible: boolean;
  matchTolerance: number | null;
  confidence: ReferenceConfidence;
  notes: string;
};

export type ReferenceRateStatementContext = {
  statementPeriodStart: string;
  region: ReferenceRegion;
  acquirerName?: string | null;
  processorName?: string | null;
  merchantNumber?: string | null;
};

export type ReferenceRateFeeLine = {
  description: string;
  network: string | null;
  amount: number;
  volumeBasis: number | null;
  count: number | null;
  rate: number | null;
};

export type ReferenceRateMatchStatus =
  | "not_attempted"
  | "no_candidate"
  | "no_period_correct_reference"
  | "not_proof_eligible"
  | "base_unknown"
  | "rate_matches_reference"
  | "rate_exceeds_reference"
  | "rate_below_reference";

export type ReferenceRateComparedBasis = "stated_rate" | "derived_from_volume" | "derived_from_count" | "derived_from_amount" | "not_compared";

export type ReferenceRateMatchResult = {
  status: ReferenceRateMatchStatus;
  passedThroughAtCostKnown: boolean;
  lineRateMatchesReference: boolean;
  comparedValue: number | null;
  comparedBasis: ReferenceRateComparedBasis;
  catalogFeeCode: string | null;
  catalogRate: number | null;
  catalogRateBasis: ReferenceRateBasis | null;
  delta: number | null;
  tolerance: number | null;
  reason: string;
};

const DEFAULT_PERCENT_TOLERANCE = 0.00002;
const DEFAULT_PER_ITEM_TOLERANCE = 0.0005;
const DEFAULT_AMOUNT_TOLERANCE = 0.01;

export function normalizeReferenceAlias(value: string): string {
  return value
    .replace(/[–—-]/g, " ")
    .replace(/[^A-Z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function isAtCostProofEligible(row: ReferenceRateCatalogRow): boolean {
  return (
    row.confidence === "verified" &&
    row.rateScope === "network_true" &&
    row.costProvableFromRateMatch &&
    row.atCostProofEligible &&
    row.sourceType !== "inferred"
  );
}

export function referenceRateFor(row: ReferenceRateCatalogRow): number | null {
  if (row.rateBasis === "percent_of_volume") return row.percentRate;
  if (row.rateBasis === "per_item" || row.rateBasis === "per_auth") return row.perItemFee;
  if (row.rateBasis === "flat_monthly") return row.flatFee;
  return null;
}

export function referenceToleranceFor(row: ReferenceRateCatalogRow): number {
  if (row.matchTolerance !== null) return row.matchTolerance;
  if (row.rateBasis === "percent_of_volume") return DEFAULT_PERCENT_TOLERANCE;
  if (row.rateBasis === "per_item" || row.rateBasis === "per_auth") return DEFAULT_PER_ITEM_TOLERANCE;
  return DEFAULT_AMOUNT_TOLERANCE;
}

function isDateInRange(statementPeriodStart: string, row: ReferenceRateCatalogRow): boolean {
  if (statementPeriodStart < row.effectiveFrom) return false;
  if (row.effectiveTo !== null && statementPeriodStart > row.effectiveTo) return false;
  return true;
}

function normalizedNetwork(value: string | null): ReferenceNetwork | null {
  const normalized = normalizeReferenceAlias(value ?? "");
  if (!normalized) return null;
  if (normalized.includes("VISA") || normalized === "VS" || normalized.startsWith("VI ")) return "VISA";
  if (normalized.includes("MASTERCARD") || normalized.startsWith("MC ")) return "MASTERCARD";
  if (normalized.includes("DISCOVER") || normalized === "DISC") return "DISCOVER";
  if (normalized.includes("AMEX") || normalized.includes("AMERICAN EXPRESS") || normalized.includes("AXP")) return "AMEX";
  if (normalized.includes("STAR") || normalized.includes("ACCEL") || normalized.includes("NYCE") || normalized.includes("PULSE")) return "PIN_DEBIT";
  return "OTHER";
}

function rowAppliesToContext(row: ReferenceRateCatalogRow, context: ReferenceRateStatementContext): boolean {
  if (row.region !== context.region) return false;
  if (row.rateScope === "network_true") return true;

  const source = normalizeReferenceAlias(row.sourceName);
  if (row.rateScope === "acquirer_specific") {
    const acquirer = normalizeReferenceAlias(context.acquirerName ?? "");
    return acquirer.length > 0 && source.includes(acquirer);
  }
  if (row.rateScope === "processor_specific") {
    const processor = normalizeReferenceAlias(context.processorName ?? "");
    return processor.length > 0 && source.includes(processor);
  }
  return false;
}

function candidateRows(
  line: ReferenceRateFeeLine,
  context: ReferenceRateStatementContext,
  catalog: ReferenceRateCatalogRow[],
): ReferenceRateCatalogRow[] {
  const description = normalizeReferenceAlias(line.description);
  const lineNetwork = normalizedNetwork(line.network);

  return catalog.filter((row) => {
    if (!rowAppliesToContext(row, context)) return false;
    if (lineNetwork !== null && row.network !== lineNetwork) return false;
    return row.aliases.some((alias) => normalizeReferenceAlias(alias) === description);
  });
}

function comparisonFor(
  line: ReferenceRateFeeLine,
  row: ReferenceRateCatalogRow,
): { comparedValue: number | null; comparedBasis: ReferenceRateComparedBasis } {
  if (line.rate !== null && Number.isFinite(line.rate)) {
    return { comparedValue: line.rate, comparedBasis: "stated_rate" };
  }

  const amount = Math.abs(line.amount);
  if (row.rateBasis === "percent_of_volume" && line.volumeBasis !== null && line.volumeBasis > 0) {
    return { comparedValue: round8(amount / line.volumeBasis), comparedBasis: "derived_from_volume" };
  }
  if ((row.rateBasis === "per_item" || row.rateBasis === "per_auth") && line.count !== null && line.count > 0) {
    return { comparedValue: round8(amount / line.count), comparedBasis: "derived_from_count" };
  }
  if (row.rateBasis === "flat_monthly") {
    return { comparedValue: round8(amount), comparedBasis: "derived_from_amount" };
  }
  return { comparedValue: null, comparedBasis: "not_compared" };
}

function emptyMatch(status: ReferenceRateMatchStatus, reason: string): ReferenceRateMatchResult {
  return {
    status,
    passedThroughAtCostKnown: false,
    lineRateMatchesReference: false,
    comparedValue: null,
    comparedBasis: "not_compared",
    catalogFeeCode: null,
    catalogRate: null,
    catalogRateBasis: null,
    delta: null,
    tolerance: null,
    reason,
  };
}

export function findReferenceRateMatch(
  line: ReferenceRateFeeLine,
  context: ReferenceRateStatementContext,
  catalog: ReferenceRateCatalogRow[],
): ReferenceRateMatchResult {
  const candidates = candidateRows(line, context, catalog);
  if (candidates.length === 0) {
    return emptyMatch("no_candidate", "No source-backed reference row matched this fee label, network, and region.");
  }

  const periodCandidates = candidates.filter((row) => isDateInRange(context.statementPeriodStart, row));
  if (periodCandidates.length === 0) {
    return emptyMatch(
      "no_period_correct_reference",
      "A matching reference label exists, but none of the source rows are effective for the statement period.",
    );
  }

  const comparable = periodCandidates
    .map((row) => {
      const catalogRate = referenceRateFor(row);
      const comparison = comparisonFor(line, row);
      const tolerance = referenceToleranceFor(row);
      const delta = comparison.comparedValue !== null && catalogRate !== null ? round8(comparison.comparedValue - catalogRate) : null;
      return { row, catalogRate, comparison, tolerance, delta };
    })
    .filter((candidate) => candidate.catalogRate !== null);

  if (comparable.length === 0) {
    return emptyMatch("not_proof_eligible", "The matching reference row is variable or does not carry a comparable fixed rate.");
  }

  const withComparableValue = comparable.filter((candidate) => candidate.comparison.comparedValue !== null && candidate.delta !== null);
  if (withComparableValue.length === 0) {
    const row = comparable[0].row;
    return {
      ...emptyMatch("base_unknown", "The statement line does not expose the rate or the base needed to derive the rate."),
      catalogFeeCode: row.feeCode,
      catalogRate: referenceRateFor(row),
      catalogRateBasis: row.rateBasis,
      tolerance: referenceToleranceFor(row),
    };
  }

  const sorted = withComparableValue.sort((left, right) => Math.abs(left.delta ?? 0) - Math.abs(right.delta ?? 0));
  const best = sorted[0];
  const matches = Math.abs(best.delta ?? 0) <= best.tolerance;
  const proofEligible = isAtCostProofEligible(best.row);
  const status: ReferenceRateMatchStatus = matches
    ? proofEligible
      ? "rate_matches_reference"
      : "not_proof_eligible"
    : (best.delta ?? 0) > best.tolerance
      ? "rate_exceeds_reference"
      : "rate_below_reference";

  return {
    status,
    passedThroughAtCostKnown: status === "rate_matches_reference",
    lineRateMatchesReference: matches,
    comparedValue: best.comparison.comparedValue,
    comparedBasis: best.comparison.comparedBasis,
    catalogFeeCode: best.row.feeCode,
    catalogRate: best.catalogRate,
    catalogRateBasis: best.row.rateBasis,
    delta: best.delta,
    tolerance: best.tolerance,
    reason: matches
      ? proofEligible
        ? "The fee line rate matches a verified, network-true reference row for the statement period."
        : "The fee line rate matches a reference row, but the row is not eligible to prove at-cost pass-through."
      : (best.delta ?? 0) > best.tolerance
        ? "The fee line rate exceeds the period-correct reference rate beyond tolerance."
        : "The fee line rate is below the period-correct reference rate beyond tolerance, so it cannot prove at-cost pass-through.",
  };
}
