import { round2, round8 } from "./reconciliation.js";
import {
  findReferenceRateMatch,
  isAtCostProofEligible,
  normalizeReferenceAlias,
  referenceRateFor,
  referenceToleranceFor,
  type ReferenceNetwork,
  type ReferenceRateCatalogRow,
  type ReferenceRateMatchResult,
  type ReferenceRegion,
} from "./referenceRateCatalog.js";
import { wellsFargo2026ReferenceRateCatalog } from "./referenceRateCatalogData.js";
import type {
  FiservProcessorComparedBasis,
  FiservProcessorFeeRowForClassification,
} from "./fiservProcessorFeeClassification.js";

export type FiservProcessorRateFingerprintKind =
  | "source_reference_rate"
  | "compact_alias_reference_rate"
  | "rate_only_reference_fingerprint"
  | "durbin_regulated_debit_cap";

export type FiservProcessorRateFingerprintStatus =
  | "rate_matches_reference"
  | "rate_exceeds_reference"
  | "rate_below_reference"
  | "not_proof_eligible"
  | "durbin_cap_match"
  | "durbin_cap_not_exceeded";

export type FiservProcessorRateFingerprintEvidence = {
  kind: FiservProcessorRateFingerprintKind;
  status: FiservProcessorRateFingerprintStatus;
  confidence: "high" | "medium";
  rule: string;
  reason: string;
  comparedValue: number | null;
  comparedBasis: FiservProcessorComparedBasis;
  catalogFeeCode: string | null;
  catalogRate: number | null;
  catalogRateBasis: string | null;
  delta: number | null;
  tolerance: number | null;
  atCostProofEligible: boolean;
};

export type FiservProcessorRateFingerprintContext = {
  referenceRateCatalog?: ReferenceRateCatalogRow[];
  statementPeriodStart?: string;
  region?: ReferenceRegion;
  acquirerName?: string | null;
  processorName?: string | null;
  merchantNumber?: string | null;
};

type ComparableReferenceCandidate = {
  row: ReferenceRateCatalogRow;
  comparedValue: number | null;
  comparedBasis: FiservProcessorComparedBasis;
  catalogRate: number | null;
  delta: number | null;
  tolerance: number;
};

const DURBIN_BASE_CENTS = 0.21;
const DURBIN_FRAUD_ADJUSTMENT_CENTS = 0.01;
const DURBIN_AD_VALOREM_RATE = 0.0005;
const DURBIN_AMOUNT_TOLERANCE = 0.02;

const RATE_FINGERPRINT_TOKENS = new Set([
  "ACQ",
  "ACQR",
  "ACQUIRER",
  "APF",
  "ASSESS",
  "ASSESSMENT",
  "AUTH",
  "BASE",
  "BIN",
  "CLEARING",
  "DATA",
  "DUES",
  "FANF",
  "FILE",
  "ICA",
  "KILOBYTE",
  "LICENSE",
  "LOCATION",
  "NABU",
  "NETWORK",
  "PROC",
  "PROCESSOR",
  "TRANSMISSION",
  "USAGE",
]);

function compact(value: string): string {
  return normalizeReferenceAlias(value).replace(/\s+/g, "");
}

function normalizedNetwork(value: string | null): ReferenceNetwork | null {
  const normalized = normalizeReferenceAlias(value ?? "");
  if (!normalized) return null;
  if (normalized.includes("VISA") || normalized === "VI" || normalized.startsWith("VI ")) return "VISA";
  if (normalized.includes("MASTERCARD") || normalized === "MC" || normalized.startsWith("MC ") || normalized.includes("MASTER CARD")) {
    return "MASTERCARD";
  }
  if (normalized.includes("DISCOVER") || normalized === "DISC" || normalized.includes("DSCV")) return "DISCOVER";
  if (normalized.includes("AMEX") || normalized.includes("AMERICAN EXPRESS") || normalized.includes("AXP")) return "AMEX";
  if (normalized.includes("STAR") || normalized.includes("ACCEL") || normalized.includes("NYCE") || normalized.includes("PULSE")) return "PIN_DEBIT";
  return null;
}

function rowNetwork(row: FiservProcessorFeeRowForClassification): ReferenceNetwork | null {
  return normalizedNetwork(row.network) ?? normalizedNetwork(row.description);
}

function rowAppliesToPeriodAndRegion(row: ReferenceRateCatalogRow, context: FiservProcessorRateFingerprintContext): boolean {
  if (!context.statementPeriodStart || !context.region) return false;
  if (row.region !== context.region) return false;
  if (context.statementPeriodStart < row.effectiveFrom) return false;
  if (row.effectiveTo !== null && context.statementPeriodStart > row.effectiveTo) return false;
  return true;
}

function rowAppliesToProcessorContext(row: ReferenceRateCatalogRow, context: FiservProcessorRateFingerprintContext): boolean {
  if (row.rateScope === "network_true") return true;
  const sourceName = normalizeReferenceAlias(row.sourceName);
  if (row.rateScope === "acquirer_specific") {
    const acquirer = normalizeReferenceAlias(context.acquirerName ?? "");
    return acquirer.length > 0 && sourceName.includes(acquirer);
  }
  if (row.rateScope === "processor_specific") {
    const processor = normalizeReferenceAlias(context.processorName ?? "");
    return processor.length > 0 && sourceName.includes(processor);
  }
  return false;
}

function comparableReferenceCandidate(
  line: FiservProcessorFeeRowForClassification,
  row: ReferenceRateCatalogRow,
): ComparableReferenceCandidate {
  const catalogRate = referenceRateFor(row);
  const amount = Math.abs(line.amount);
  let comparedValue: number | null = null;
  let comparedBasis: FiservProcessorComparedBasis = "not_compared";

  if (line.rate !== null && Number.isFinite(line.rate)) {
    comparedValue = line.rate;
    comparedBasis = "stated_rate";
  } else if (row.rateBasis === "percent_of_volume" && line.volumeBasis !== null && line.volumeBasis > 0) {
    comparedValue = round8(amount / line.volumeBasis);
    comparedBasis = "derived_from_volume";
  } else if ((row.rateBasis === "per_item" || row.rateBasis === "per_auth") && line.count !== null && line.count > 0) {
    comparedValue = round8(amount / line.count);
    comparedBasis = "derived_from_count";
  }

  const delta = comparedValue !== null && catalogRate !== null ? round8(comparedValue - catalogRate) : null;
  return {
    row,
    comparedValue,
    comparedBasis,
    catalogRate,
    delta,
    tolerance: referenceToleranceFor(row),
  };
}

function statusForCandidate(candidate: ComparableReferenceCandidate): FiservProcessorRateFingerprintStatus | null {
  if (candidate.comparedValue === null || candidate.catalogRate === null || candidate.delta === null) return null;
  if (Math.abs(candidate.delta) <= candidate.tolerance) {
    return isAtCostProofEligible(candidate.row) ? "rate_matches_reference" : "not_proof_eligible";
  }
  return candidate.delta > 0 ? "rate_exceeds_reference" : "rate_below_reference";
}

function evidenceFromReferenceMatch(match: ReferenceRateMatchResult): FiservProcessorRateFingerprintEvidence | null {
  if (
    match.status !== "rate_matches_reference" &&
    match.status !== "rate_exceeds_reference" &&
    match.status !== "rate_below_reference" &&
    match.status !== "not_proof_eligible"
  ) {
    return null;
  }
  return {
    kind: "source_reference_rate",
    status: match.status,
    confidence: "high",
    rule: "FISERV_SOURCE_BACKED_REFERENCE_RATE",
    reason: match.reason,
    comparedValue: match.comparedValue,
    comparedBasis:
      match.comparedBasis === "derived_from_count"
        ? "derived_from_count"
        : match.comparedBasis === "derived_from_volume"
          ? "derived_from_volume"
          : match.comparedBasis === "stated_rate"
            ? "stated_rate"
            : "not_compared",
    catalogFeeCode: match.catalogFeeCode,
    catalogRate: match.catalogRate,
    catalogRateBasis: match.catalogRateBasis,
    delta: match.delta,
    tolerance: match.tolerance,
    atCostProofEligible: match.passedThroughAtCostKnown,
  };
}

function referenceRowsForContext(
  row: FiservProcessorFeeRowForClassification,
  context: FiservProcessorRateFingerprintContext,
): ReferenceRateCatalogRow[] {
  const catalog = context.referenceRateCatalog ?? wellsFargo2026ReferenceRateCatalog;
  const network = rowNetwork(row);
  return catalog.filter((catalogRow) => {
    if (!rowAppliesToPeriodAndRegion(catalogRow, context)) return false;
    if (!rowAppliesToProcessorContext(catalogRow, context)) return false;
    if (network !== null && catalogRow.network !== network) return false;
    return referenceRateFor(catalogRow) !== null;
  });
}

function compactAliasEvidence(
  row: FiservProcessorFeeRowForClassification,
  context: FiservProcessorRateFingerprintContext,
): FiservProcessorRateFingerprintEvidence | null {
  const description = normalizeReferenceAlias(row.description);
  const compactDescription = compact(row.description);
  const candidates = referenceRowsForContext(row, context)
    .filter((referenceRow) =>
      referenceRow.aliases.some((alias) => normalizeReferenceAlias(alias) !== description && compact(alias) === compactDescription),
    )
    .map((referenceRow) => comparableReferenceCandidate(row, referenceRow))
    .filter((candidate) => candidate.catalogRate !== null && candidate.comparedValue !== null && candidate.delta !== null)
    .sort((left, right) => Math.abs(left.delta ?? 0) - Math.abs(right.delta ?? 0));
  const best = candidates[0];
  if (!best) return null;

  const status = statusForCandidate(best);
  if (status === null) return null;

  return {
    kind: "compact_alias_reference_rate",
    status,
    confidence: "high",
    rule: "FISERV_COMPACT_ALIAS_REFERENCE_RATE",
    reason:
      "The fee label matches a source-backed network fee after normalizing OCR spacing/punctuation, and the stated or derived rate was compared against the reference schedule.",
    comparedValue: best.comparedValue,
    comparedBasis: best.comparedBasis,
    catalogFeeCode: best.row.feeCode,
    catalogRate: best.catalogRate,
    catalogRateBasis: best.row.rateBasis,
    delta: best.delta,
    tolerance: best.tolerance,
    atCostProofEligible: status === "rate_matches_reference" && isAtCostProofEligible(best.row),
  };
}

function hasSafeRateFingerprintToken(row: FiservProcessorFeeRowForClassification, referenceRow: ReferenceRateCatalogRow): boolean {
  const descriptionTokens = new Set(normalizeReferenceAlias(row.description).split(" ").filter(Boolean));
  const hasKnownFeeToken = [...descriptionTokens].some((token) => RATE_FINGERPRINT_TOKENS.has(token));
  if (!hasKnownFeeToken) return false;

  return referenceRow.aliases.some((alias) => {
    const aliasTokens = normalizeReferenceAlias(alias).split(" ").filter(Boolean);
    return aliasTokens.some((token) => descriptionTokens.has(token) && RATE_FINGERPRINT_TOKENS.has(token));
  });
}

function rateOnlyReferenceEvidence(
  row: FiservProcessorFeeRowForClassification,
  context: FiservProcessorRateFingerprintContext,
): FiservProcessorRateFingerprintEvidence | null {
  if (rowNetwork(row) === null) return null;

  const candidates = referenceRowsForContext(row, context)
    .filter((referenceRow) => hasSafeRateFingerprintToken(row, referenceRow))
    .map((referenceRow) => comparableReferenceCandidate(row, referenceRow))
    .filter((candidate) => {
      const status = statusForCandidate(candidate);
      return status === "rate_matches_reference" || status === "not_proof_eligible";
    })
    .sort((left, right) => Math.abs(left.delta ?? 0) - Math.abs(right.delta ?? 0));
  const best = candidates[0];
  if (!best) return null;

  const status = statusForCandidate(best);
  if (status === null) return null;

  return {
    kind: "rate_only_reference_fingerprint",
    status,
    confidence: "medium",
    rule: "FISERV_RATE_ONLY_REFERENCE_FINGERPRINT",
    reason:
      "The row has network identity, network-fee label tokens, and rate/count/volume math matching a source-backed card-network fee. The label was not an exact catalog alias, so confidence is medium.",
    comparedValue: best.comparedValue,
    comparedBasis: best.comparedBasis,
    catalogFeeCode: best.row.feeCode,
    catalogRate: best.catalogRate,
    catalogRateBasis: best.row.rateBasis,
    delta: best.delta,
    tolerance: best.tolerance,
    atCostProofEligible: status === "rate_matches_reference" && isAtCostProofEligible(best.row),
  };
}

function hasDebitInterchangeEvidence(row: FiservProcessorFeeRowForClassification): boolean {
  const description = normalizeReferenceAlias(row.description);
  const network = normalizeReferenceAlias(row.network ?? "");
  const type = normalizeReferenceAlias(row.type ?? "");
  const debitEvidence =
    description.includes("DEBIT") ||
    description.includes(" DB ") ||
    network.includes("DEBIT") ||
    network.includes(" DB") ||
    network.includes("SIGNATURE DEBIT") ||
    rowNetwork(row) === "PIN_DEBIT";
  const interchangeEvidence = type === "INTERCHANGE CHARGES" || description.includes("INTERCHANGE");
  return debitEvidence && interchangeEvidence;
}

function durbinDebitCapEvidence(row: FiservProcessorFeeRowForClassification): FiservProcessorRateFingerprintEvidence | null {
  if (!hasDebitInterchangeEvidence(row)) return null;
  if (row.count === null || row.count <= 0 || row.volumeBasis === null || row.volumeBasis <= 0 || row.amount <= 0) return null;

  const amount = Math.abs(row.amount);
  const capWithoutFraud = round2(row.count * DURBIN_BASE_CENTS + row.volumeBasis * DURBIN_AD_VALOREM_RATE);
  const capWithFraud = round2(row.count * (DURBIN_BASE_CENTS + DURBIN_FRAUD_ADJUSTMENT_CENTS) + row.volumeBasis * DURBIN_AD_VALOREM_RATE);
  const matchedCap =
    Math.abs(amount - capWithFraud) <= DURBIN_AMOUNT_TOLERANCE
      ? { amount: capWithFraud, code: "REG_II_DEBIT_CAP_WITH_FRAUD_ADJUSTMENT" }
      : Math.abs(amount - capWithoutFraud) <= DURBIN_AMOUNT_TOLERANCE
        ? { amount: capWithoutFraud, code: "REG_II_DEBIT_CAP_WITHOUT_FRAUD_ADJUSTMENT" }
        : null;

  if (matchedCap) {
    return {
      kind: "durbin_regulated_debit_cap",
      status: "durbin_cap_match",
      confidence: "high",
      rule: "FISERV_DURBIN_REGULATED_DEBIT_CAP_FINGERPRINT",
      reason:
        "The debit interchange row matches the Regulation II cap formula of 21 cents plus 5 basis points, with the optional 1-cent fraud-prevention adjustment considered. This supports regulated debit interchange classification, but it is not proof of processor pass-through at cost.",
      comparedValue: round8(amount / row.volumeBasis),
      comparedBasis: "derived_from_volume",
      catalogFeeCode: matchedCap.code,
      catalogRate: round8(matchedCap.amount / row.volumeBasis),
      catalogRateBasis: "regulated_debit_formula",
      delta: round2(amount - matchedCap.amount),
      tolerance: DURBIN_AMOUNT_TOLERANCE,
      atCostProofEligible: false,
    };
  }

  if (amount < capWithFraud - DURBIN_AMOUNT_TOLERANCE) {
    return {
      kind: "durbin_regulated_debit_cap",
      status: "durbin_cap_not_exceeded",
      confidence: "medium",
      rule: "FISERV_DURBIN_REGULATED_DEBIT_CAP_NOT_EXCEEDED",
      reason:
        "The debit interchange row is below the Regulation II maximum formula. That is compatible with regulated debit interchange, but the row may include exempt issuers or network-specific debit programs, so it remains an at-cost-indeterminate pass-through classification.",
      comparedValue: round8(amount / row.volumeBasis),
      comparedBasis: "derived_from_volume",
      catalogFeeCode: "REG_II_DEBIT_CAP_MAXIMUM_WITH_FRAUD_ADJUSTMENT",
      catalogRate: round8(capWithFraud / row.volumeBasis),
      catalogRateBasis: "regulated_debit_formula",
      delta: round2(amount - capWithFraud),
      tolerance: DURBIN_AMOUNT_TOLERANCE,
      atCostProofEligible: false,
    };
  }

  return null;
}

export function findFiservProcessorRateFingerprint(
  row: FiservProcessorFeeRowForClassification,
  context: FiservProcessorRateFingerprintContext,
): FiservProcessorRateFingerprintEvidence | null {
  const exact =
    context.statementPeriodStart && context.region
      ? evidenceFromReferenceMatch(
          findReferenceRateMatch(
            row,
            {
              statementPeriodStart: context.statementPeriodStart,
              region: context.region,
              acquirerName: context.acquirerName,
              processorName: context.processorName,
              merchantNumber: context.merchantNumber,
            },
            context.referenceRateCatalog ?? wellsFargo2026ReferenceRateCatalog,
          ),
        )
      : null;
  if (exact) return exact;

  return compactAliasEvidence(row, context) ?? rateOnlyReferenceEvidence(row, context) ?? durbinDebitCapEvidence(row);
}
