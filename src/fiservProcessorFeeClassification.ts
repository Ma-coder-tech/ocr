import { round2, round8 } from "./reconciliation.js";
import {
  findReferenceRateMatch,
  type ReferenceRateCatalogRow,
  type ReferenceRateMatchResult,
  type ReferenceRegion,
} from "./referenceRateCatalog.js";
import {
  findFiservProcessorRateFingerprint,
  type FiservProcessorRateFingerprintEvidence,
} from "./fiservProcessorRateFingerprint.js";

export type FiservProcessorFeeEconomicBucket =
  | "card_brand_pass_through"
  | "processor_controlled_tiered_fee"
  | "processor_controlled_flat_discount_fee"
  | "processor_transaction_or_auth"
  | "miscellaneous_or_statement_fee"
  | "unknown_needs_review"
  | "zero_amount_no_charge";

export type FiservProcessorAtCostStatus =
  | "proven_at_cost"
  | "not_at_cost"
  | "not_applicable"
  | "unprovable_by_model"
  | "unprovable_by_line"
  | "indeterminate";

export type FiservProcessorAtCostReasonCode =
  | "NOT_PASS_THROUGH_CATEGORY"
  | "ZERO_AMOUNT_NO_CHARGE"
  | "BLENDED_TIERED_BUCKET"
  | "FLAT_RATE_PROGRAM"
  | "PROGRAM_DOES_NOT_EXPOSE_COST"
  | "LUMP_LINE_NOT_DECOMPOSABLE"
  | "NO_REFERENCE_FOR_PERIOD"
  | "BASE_UNKNOWN"
  | "RATE_VARIABLE"
  | "REFERENCE_NOT_PROOF_ELIGIBLE"
  | "RATE_EXCEEDS_REFERENCE"
  | "RATE_BELOW_REFERENCE"
  | "RATE_MATCHES_REFERENCE"
  | "DURBIN_REGULATED_DEBIT_CAP_MATCH"
  | "DURBIN_REGULATED_DEBIT_CAP_NOT_EXCEEDED";

export type FiservProcessorCostExposure = "itemized" | "blended" | "flat" | "mixed" | "hidden" | "not_applicable";

export type FiservProcessorComparedBasis = "stated_rate" | "derived_from_volume" | "derived_from_count" | "not_compared";

export type FiservProcessorFeeClassification = {
  economicBucket: FiservProcessorFeeEconomicBucket;
  confidence: "high" | "medium" | "low";
  rule: string;
  reason: string;
  needsUnbundling: boolean;
  atCostStatus: FiservProcessorAtCostStatus;
  atCostReasonCode: FiservProcessorAtCostReasonCode;
  passedThroughAtCostKnown: boolean;
  costExposure: FiservProcessorCostExposure;
  comparedValue: number | null;
  comparedBasis: FiservProcessorComparedBasis;
  catalogFeeCode: string | null;
  catalogRate: number | null;
  marginAmountKnown: boolean;
  effectiveRatePct: number | null;
};

export type FiservProcessorFeeRowForClassification = {
  description: string;
  network: string | null;
  type: string | null;
  amount: number;
  volumeBasis: number | null;
  count: number | null;
  rate: number | null;
};

export type FiservProcessorClassifiedFeeRow<T extends FiservProcessorFeeRowForClassification> = T & {
  classification: FiservProcessorFeeClassification;
};

export type FiservProcessorFeeClassificationBucketTotal = {
  economicBucket: FiservProcessorFeeEconomicBucket;
  amount: number;
  rowCount: number;
};

export type FiservProcessorFeeResidualAnalysis = {
  basis: "printed_total" | "row_sum";
  basisTotal: number;
  identifiedCardBrandPassThroughAmount: number;
  knownProcessorFeeAmount: number;
  unbundledProcessorControlledAmount: number;
  unresolvedAmount: number;
  zeroAmount: number;
  markupOrUnknownPoolAmount: number;
  residualUnclassifiedAmount: number;
  rowSumDeltaToBasis: number;
  formula: string;
};

export type FiservProcessorFeeClassificationSummary = {
  status:
    | "not_mapped"
    | "validated"
    | "validated_with_rounding_delta"
    | "validated_with_unresolved_rows"
    | "unreconciled";
  rowCount: number;
  classifiedRowCount: number;
  unresolvedRowCount: number;
  needsUnbundlingRowCount: number;
  totalClassifiedAmount: number;
  printedTotal: number | null;
  delta: number;
  tolerance: number;
  bucketTotals: FiservProcessorFeeClassificationBucketTotal[];
  residualAnalysis: FiservProcessorFeeResidualAnalysis;
  notes: string[];
};

const CARD_BRAND_FEE_LABELS = new Set([
  "LICENSE RATE",
  "NABU FEES",
  "DUES & ASSESSMENTS",
  "INTERCHANGE",
  "PROGRAM FEES",
  "MC DIGITAL ENABLEMENT",
  "MC DIGITAL ENABLEMENT MAX",
  "KILOBYTE CLEARING FEE US",
  "KILOBYTE AUTH FEE US",
  "ACQR PROCESSOR FEES",
  "ACOR PROCESSOR FEES",
  "FIXED NETWORK CP FEE",
  "FIXED NETWORK CNP FEE",
  "FILE TRANSMISSION FEE",
  "CR DUES AND ASSESS",
  "DB DUES AND ASSESS",
  "BIN ICA FEE",
  "LOCATION FEE",
  "MC DISPUTE IMAGE FEE",
  "MC DISPUTE CASE FEE",
  "AMEX ACQR TRANSACTION FEE",
  "NETWORK FEE",
  "ACQ ISA FEE",
  "INTRNTL ACQ PROC FEE DB",
  "ZERO FLOOR FEES",
  "INTERNTL ACQUIRER FEE",
  "TRAN INTEGRITY FEE",
  "VISA DISPUTE NO ACCEPT",
  "ADDRESS VERIFICATION US",
  "DSCV AUTH FEE",
  "DSCV DATA USAGE FEE",
  "ADDR VERIFICATION SRV FEE",
  "DISC NETWORK AUTH FEE",
  "DIGITAL INVESTMENT FEE",
]);

const PROCESSOR_TRANSACTION_OR_AUTH_LABELS = new Set([
  "CPU GTWY",
  "AVS CPU-G",
  "ECI CPU-G",
  "AVS ECIC-G",
  "BATCH HEADER",
]);

const PROCESSOR_ACCOUNT_OR_MISC_LABELS = new Set([
  "RETURNS",
  "ACH REJECT FEE",
  "PCI MONTHLY FEE",
  "COMM CARD I/C SAVINGS ADJ",
  "REGULATORY PRODUCT",
  "STATEMENT FEE",
  "DEBIT MONTHLY FEE",
  "CHARGEBACKS",
]);

export type FiservProcessorFeeClassificationContext = {
  statementCostExposure: FiservProcessorCostExposure;
  referenceRateCatalog?: ReferenceRateCatalogRow[];
  statementPeriodStart?: string;
  region?: ReferenceRegion;
  acquirerName?: string | null;
  processorName?: string | null;
  merchantNumber?: string | null;
};

function normalizedDescription(row: FiservProcessorFeeRowForClassification): string {
  return row.description.replace(/\s+/g, " ").trim().toUpperCase();
}

function effectiveRatePct(row: FiservProcessorFeeRowForClassification): number | null {
  if (!row.volumeBasis || row.volumeBasis <= 0 || row.amount <= 0) return null;
  return round2((row.amount / row.volumeBasis) * 100);
}

function normalizedType(row: FiservProcessorFeeRowForClassification): string {
  return String(row.type ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

function hasCardBrandEvidence(row: FiservProcessorFeeRowForClassification): boolean {
  const description = normalizedDescription(row);
  const type = normalizedType(row);
  return type === "INTERCHANGE CHARGES" || type === "PROGRAM FEES" || CARD_BRAND_FEE_LABELS.has(description);
}

function isFlatDiscountLabel(row: FiservProcessorFeeRowForClassification): boolean {
  const description = normalizedDescription(row);
  return description === "QUAL DISC" || description.includes("SALES DISCOUNT") || description.includes("NON SWIPED DISCOUNT") || description.includes("DISC RATE");
}

function isTieredDiscountLabel(row: FiservProcessorFeeRowForClassification): boolean {
  const description = normalizedDescription(row);
  return description === "MQUAL DISC" || description === "NQUAL DISC";
}

function inferFiservProcessorStatementCostExposure(rows: FiservProcessorFeeRowForClassification[]): FiservProcessorCostExposure {
  const nonZeroRows = rows.filter((row) => row.amount !== 0);
  const hasItemizedCostRows = nonZeroRows.some(hasCardBrandEvidence);
  const hasTieredDiscountRows = nonZeroRows.some(isTieredDiscountLabel);
  const hasFlatDiscountRows = nonZeroRows.some(isFlatDiscountLabel);

  if (hasItemizedCostRows && (hasTieredDiscountRows || hasFlatDiscountRows)) return "mixed";
  if (hasItemizedCostRows) return "itemized";
  if (hasTieredDiscountRows) return "blended";
  if (hasFlatDiscountRows) return "flat";
  return "hidden";
}

function comparisonCandidate(row: FiservProcessorFeeRowForClassification): {
  comparedValue: number | null;
  comparedBasis: FiservProcessorComparedBasis;
} {
  if (row.rate !== null && Number.isFinite(row.rate)) {
    return { comparedValue: row.rate, comparedBasis: "stated_rate" };
  }
  if (row.volumeBasis !== null && row.volumeBasis > 0 && row.amount > 0) {
    return { comparedValue: round8(row.amount / row.volumeBasis), comparedBasis: "derived_from_volume" };
  }
  if (row.count !== null && row.count > 0 && row.amount > 0) {
    return { comparedValue: round8(row.amount / row.count), comparedBasis: "derived_from_count" };
  }
  return { comparedValue: null, comparedBasis: "not_compared" };
}

function residualRound2(value: number): number {
  const rounded = round2(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function classification(params: {
  economicBucket: FiservProcessorFeeEconomicBucket;
  confidence: "high" | "medium" | "low";
  rule: string;
  reason: string;
  row: FiservProcessorFeeRowForClassification;
  needsUnbundling?: boolean;
  atCostStatus: FiservProcessorAtCostStatus;
  atCostReasonCode: FiservProcessorAtCostReasonCode;
  costExposure: FiservProcessorCostExposure;
  comparedValue?: number | null;
  comparedBasis?: FiservProcessorComparedBasis;
  catalogFeeCode?: string | null;
  catalogRate?: number | null;
  marginAmountKnown?: boolean;
}): FiservProcessorFeeClassification {
  const comparison = comparisonCandidate(params.row);
  return {
    economicBucket: params.economicBucket,
    confidence: params.confidence,
    rule: params.rule,
    reason: params.reason,
    needsUnbundling: params.needsUnbundling ?? false,
    atCostStatus: params.atCostStatus,
    atCostReasonCode: params.atCostReasonCode,
    passedThroughAtCostKnown: params.atCostStatus === "proven_at_cost",
    costExposure: params.costExposure,
    comparedValue: params.comparedValue ?? comparison.comparedValue,
    comparedBasis: params.comparedBasis ?? comparison.comparedBasis,
    catalogFeeCode: params.catalogFeeCode ?? null,
    catalogRate: params.catalogRate ?? null,
    marginAmountKnown: params.marginAmountKnown ?? false,
    effectiveRatePct: effectiveRatePct(params.row),
  };
}

export function makeFiservProcessorSyntheticFeeClassification(params: {
  economicBucket: FiservProcessorFeeEconomicBucket;
  confidence: "high" | "medium" | "low";
  rule: string;
  reason: string;
  row: FiservProcessorFeeRowForClassification;
  needsUnbundling?: boolean;
  atCostStatus: FiservProcessorAtCostStatus;
  atCostReasonCode: FiservProcessorAtCostReasonCode;
  costExposure: FiservProcessorCostExposure;
  comparedValue?: number | null;
  comparedBasis?: FiservProcessorComparedBasis;
  catalogFeeCode?: string | null;
  catalogRate?: number | null;
  marginAmountKnown?: boolean;
}): FiservProcessorFeeClassification {
  return classification(params);
}

function referenceMatchFor(
  row: FiservProcessorFeeRowForClassification,
  context: FiservProcessorFeeClassificationContext,
): ReferenceRateMatchResult | null {
  if (!context.referenceRateCatalog || !context.statementPeriodStart || !context.region) return null;
  return findReferenceRateMatch(
    row,
    {
      statementPeriodStart: context.statementPeriodStart,
      region: context.region,
      acquirerName: context.acquirerName,
      processorName: context.processorName,
      merchantNumber: context.merchantNumber,
    },
    context.referenceRateCatalog,
  );
}

function atCostFromReferenceMatch(match: ReferenceRateMatchResult | null): {
  atCostStatus: FiservProcessorAtCostStatus;
  atCostReasonCode: FiservProcessorAtCostReasonCode;
  comparedValue?: number | null;
  comparedBasis?: FiservProcessorComparedBasis;
  catalogFeeCode?: string | null;
  catalogRate?: number | null;
} {
  if (match === null) {
    return {
      atCostStatus: "indeterminate",
      atCostReasonCode: "NO_REFERENCE_FOR_PERIOD",
    };
  }

  const comparedBasis: FiservProcessorComparedBasis =
    match.comparedBasis === "stated_rate"
      ? "stated_rate"
      : match.comparedBasis === "derived_from_volume"
        ? "derived_from_volume"
        : match.comparedBasis === "derived_from_count"
          ? "derived_from_count"
          : "not_compared";

  const shared = {
    comparedValue: match.comparedValue,
    comparedBasis,
    catalogFeeCode: match.catalogFeeCode,
    catalogRate: match.catalogRate,
  };

  if (match.status === "rate_matches_reference") {
    return {
      ...shared,
      atCostStatus: "proven_at_cost",
      atCostReasonCode: "RATE_MATCHES_REFERENCE",
    };
  }
  if (match.status === "rate_exceeds_reference") {
    return {
      ...shared,
      atCostStatus: "not_at_cost",
      atCostReasonCode: "RATE_EXCEEDS_REFERENCE",
    };
  }
  if (match.status === "rate_below_reference") {
    return {
      ...shared,
      atCostStatus: "indeterminate",
      atCostReasonCode: "RATE_BELOW_REFERENCE",
    };
  }
  if (match.status === "base_unknown") {
    return {
      ...shared,
      atCostStatus: "indeterminate",
      atCostReasonCode: "BASE_UNKNOWN",
    };
  }
  if (match.status === "not_proof_eligible") {
    return {
      ...shared,
      atCostStatus: "indeterminate",
      atCostReasonCode: "REFERENCE_NOT_PROOF_ELIGIBLE",
    };
  }
  return {
    ...shared,
    atCostStatus: "indeterminate",
    atCostReasonCode: "NO_REFERENCE_FOR_PERIOD",
  };
}

function atCostFromRateFingerprint(evidence: FiservProcessorRateFingerprintEvidence): {
  atCostStatus: FiservProcessorAtCostStatus;
  atCostReasonCode: FiservProcessorAtCostReasonCode;
  comparedValue?: number | null;
  comparedBasis?: FiservProcessorComparedBasis;
  catalogFeeCode?: string | null;
  catalogRate?: number | null;
} {
  const shared = {
    comparedValue: evidence.comparedValue,
    comparedBasis: evidence.comparedBasis,
    catalogFeeCode: evidence.catalogFeeCode,
    catalogRate: evidence.catalogRate,
  };

  if (evidence.status === "rate_matches_reference") {
    return {
      ...shared,
      atCostStatus: "proven_at_cost",
      atCostReasonCode: "RATE_MATCHES_REFERENCE",
    };
  }
  if (evidence.status === "rate_exceeds_reference") {
    return {
      ...shared,
      atCostStatus: "not_at_cost",
      atCostReasonCode: "RATE_EXCEEDS_REFERENCE",
    };
  }
  if (evidence.status === "rate_below_reference") {
    return {
      ...shared,
      atCostStatus: "indeterminate",
      atCostReasonCode: "RATE_BELOW_REFERENCE",
    };
  }
  if (evidence.status === "not_proof_eligible") {
    return {
      ...shared,
      atCostStatus: "indeterminate",
      atCostReasonCode: "REFERENCE_NOT_PROOF_ELIGIBLE",
    };
  }
  if (evidence.status === "durbin_cap_match") {
    return {
      ...shared,
      atCostStatus: "indeterminate",
      atCostReasonCode: "DURBIN_REGULATED_DEBIT_CAP_MATCH",
    };
  }
  return {
    ...shared,
    atCostStatus: "indeterminate",
    atCostReasonCode: "DURBIN_REGULATED_DEBIT_CAP_NOT_EXCEEDED",
  };
}

export function classifyFiservProcessorFeeRow(
  row: FiservProcessorFeeRowForClassification,
  context: FiservProcessorFeeClassificationContext = { statementCostExposure: inferFiservProcessorStatementCostExposure([row]) },
): FiservProcessorFeeClassification {
  const description = normalizedDescription(row);
  const type = normalizedType(row);
  const statementCostExposure = context.statementCostExposure;
  const itemizedCostExposure: FiservProcessorCostExposure = statementCostExposure === "mixed" ? "itemized" : statementCostExposure;
  const rateFingerprint = findFiservProcessorRateFingerprint(row, context);

  if (row.amount === 0) {
    return classification({
      economicBucket: "zero_amount_no_charge",
      confidence: "high",
      rule: "FISERV_ZERO_AMOUNT",
      reason: "The statement lists the row but no fee was charged, so it is preserved without assigning economic cost.",
      row,
      atCostStatus: "not_applicable",
      atCostReasonCode: "ZERO_AMOUNT_NO_CHARGE",
      costExposure: "not_applicable",
      comparedValue: null,
      comparedBasis: "not_compared",
      marginAmountKnown: false,
    });
  }

  if (type === "INTERCHANGE CHARGES" || type === "PROGRAM FEES") {
    const isLumpLine = /^INTERCHANGE(?:\s|$)/.test(description) || /^TOTAL INTERCHANGE/.test(description);
    const atCost = isLumpLine
      ? null
      : rateFingerprint
        ? atCostFromRateFingerprint(rateFingerprint)
        : atCostFromReferenceMatch(referenceMatchFor(row, context));
    return classification({
      economicBucket: "card_brand_pass_through",
      confidence: "high",
      rule: rateFingerprint?.rule ?? "FISERV_FULL_STATEMENT_CARD_ORG_TYPE",
      reason: rateFingerprint
        ? `${rateFingerprint.reason} The full First Data/Clover statement also places this row in an Interchange charges or Program Fees type.`
        : "The full First Data/Clover statement places this row in an Interchange charges or Program Fees type. That identifies the card-organization cost bucket, but not whether it was passed through at cost.",
      row,
      atCostStatus: isLumpLine ? "unprovable_by_line" : atCost?.atCostStatus ?? "indeterminate",
      atCostReasonCode: isLumpLine ? "LUMP_LINE_NOT_DECOMPOSABLE" : atCost?.atCostReasonCode ?? "NO_REFERENCE_FOR_PERIOD",
      costExposure: "itemized",
      comparedValue: atCost?.comparedValue,
      comparedBasis: atCost?.comparedBasis,
      catalogFeeCode: atCost?.catalogFeeCode,
      catalogRate: atCost?.catalogRate,
      marginAmountKnown: false,
    });
  }

  if (description.includes("SALES DISCOUNT") || description.includes("NON SWIPED DISCOUNT") || description.includes("DISC RATE")) {
    return classification({
      economicBucket: "processor_controlled_flat_discount_fee",
      confidence: "high",
      rule: "FISERV_DISCOUNT_SERVICE_CHARGE",
      reason:
        "Fiserv / First Data discount service-charge rows are processor-controlled discount pricing. The statement exposes the charged fee, not an interchange-versus-margin cost split.",
      row,
      needsUnbundling: false,
      atCostStatus: statementCostExposure === "flat" ? "unprovable_by_model" : "not_applicable",
      atCostReasonCode: statementCostExposure === "flat" ? "FLAT_RATE_PROGRAM" : "NOT_PASS_THROUGH_CATEGORY",
      costExposure: statementCostExposure === "flat" ? "flat" : itemizedCostExposure,
      marginAmountKnown: true,
    });
  }

  if (description === "MQUAL DISC" || description === "NQUAL DISC") {
    return classification({
      economicBucket: "processor_controlled_tiered_fee",
      confidence: "high",
      rule: "FISERV_TIERED_DISCOUNT_BUCKET",
      reason:
        "Qualified/non-qualified discount rows are processor-controlled blended tier pricing. The statement exposes the charged tier amount but not the interchange-versus-margin split.",
      row,
      needsUnbundling: true,
      atCostStatus: "unprovable_by_model",
      atCostReasonCode: "BLENDED_TIERED_BUCKET",
      costExposure: "blended",
      marginAmountKnown: false,
    });
  }

  if (description === "QUAL DISC") {
    return classification({
      economicBucket: "processor_controlled_flat_discount_fee",
      confidence: "high",
      rule: "FISERV_FLAT_QUAL_DISCOUNT_BUCKET",
      reason:
        "QUAL DISC rows using a consistent discount rate across card categories are processor-controlled flat discount pricing. The statement exposes charged fees but not interchange-versus-margin cost basis.",
      row,
      needsUnbundling: false,
      atCostStatus: statementCostExposure === "flat" ? "unprovable_by_model" : "not_applicable",
      atCostReasonCode: statementCostExposure === "flat" ? "FLAT_RATE_PROGRAM" : "NOT_PASS_THROUGH_CATEGORY",
      costExposure: statementCostExposure === "flat" ? "flat" : itemizedCostExposure,
      marginAmountKnown: false,
    });
  }

  if (description === "DISC 1" || description === "OTHER VOLUME FEES") {
    return classification({
      economicBucket: "processor_controlled_flat_discount_fee",
      confidence: "medium",
      rule: "FISERV_PROCESSOR_DISCOUNT_LABEL_EVIDENCE",
      reason:
        "The fee label and rate/volume math behave like processor-controlled discount markup, but the processor-specific abbreviation does not expose a card-brand pass-through reference.",
      row,
      needsUnbundling: false,
      atCostStatus: "not_applicable",
      atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
      costExposure: "not_applicable",
      marginAmountKnown: true,
    });
  }

  if (rateFingerprint) {
    const atCost = atCostFromRateFingerprint(rateFingerprint);
    return classification({
      economicBucket: "card_brand_pass_through",
      confidence: rateFingerprint.confidence,
      rule: rateFingerprint.rule,
      reason: rateFingerprint.reason,
      row,
      atCostStatus: atCost.atCostStatus,
      atCostReasonCode: atCost.atCostReasonCode,
      costExposure: "itemized",
      comparedValue: atCost.comparedValue,
      comparedBasis: atCost.comparedBasis,
      catalogFeeCode: atCost.catalogFeeCode,
      catalogRate: atCost.catalogRate,
      marginAmountKnown: false,
    });
  }

  if (CARD_BRAND_FEE_LABELS.has(description)) {
    const isLumpInterchangeLine = description === "INTERCHANGE" || description === "TOTAL INTERCHANGE";
    const atCost = isLumpInterchangeLine ? null : atCostFromReferenceMatch(referenceMatchFor(row, context));
    return classification({
      economicBucket: "card_brand_pass_through",
      confidence: "high",
      rule: "FISERV_CARD_BRAND_ASSESSMENT_LABEL",
      reason:
        "The fee name matches a card-brand or network assessment category. This identifies the category, not proof that the processor passed it through at cost.",
      row,
      atCostStatus: isLumpInterchangeLine ? "unprovable_by_line" : atCost?.atCostStatus ?? "indeterminate",
      atCostReasonCode: isLumpInterchangeLine ? "LUMP_LINE_NOT_DECOMPOSABLE" : atCost?.atCostReasonCode ?? "NO_REFERENCE_FOR_PERIOD",
      costExposure: "itemized",
      comparedValue: atCost?.comparedValue,
      comparedBasis: atCost?.comparedBasis,
      catalogFeeCode: atCost?.catalogFeeCode,
      catalogRate: atCost?.catalogRate,
      marginAmountKnown: false,
    });
  }

  if (PROCESSOR_TRANSACTION_OR_AUTH_LABELS.has(description)) {
    return classification({
      economicBucket: "processor_transaction_or_auth",
      confidence: "high",
      rule: "FISERV_TRANSACTION_AUTH_OR_BATCH_FEE",
      reason: "Gateway, AVS, authorization, and batch header lines are processor-controlled per-item or batch economics.",
      row,
      atCostStatus: "not_applicable",
      atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
      costExposure: "not_applicable",
      marginAmountKnown: true,
    });
  }

  if (description === "OTHER ITEM FEES") {
    return classification({
      economicBucket: "processor_transaction_or_auth",
      confidence: "medium",
      rule: "FISERV_GENERIC_ITEM_FEE",
      reason:
        "The row is a per-item charge with count and rate evidence, but the label is generic, so it is treated as processor-controlled with medium confidence.",
      row,
      atCostStatus: "not_applicable",
      atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
      costExposure: "not_applicable",
      marginAmountKnown: true,
    });
  }

  if (description === "SALES ITEMS") {
    return classification({
      economicBucket: "processor_transaction_or_auth",
      confidence: "medium",
      rule: "FISERV_GENERIC_SALES_ITEM_FEE",
      reason:
        "The row is a per-item sales charge with count and rate evidence, so it is treated as processor-controlled transaction economics with medium confidence.",
      row,
      atCostStatus: "not_applicable",
      atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
      costExposure: "not_applicable",
      marginAmountKnown: true,
    });
  }

  if (type === "SERVICE CHARGES") {
    return classification({
      economicBucket: "processor_transaction_or_auth",
      confidence: "medium",
      rule: "FISERV_FULL_STATEMENT_SERVICE_CHARGE_TYPE",
      reason:
        "The row is printed as a Service charges line in the full First Data/Clover fee ledger. It is processor-controlled, but the exact commercial purpose depends on the row label.",
      row,
      atCostStatus: "not_applicable",
      atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
      costExposure: "not_applicable",
      marginAmountKnown: true,
    });
  }

  if (
    type === "FEES" &&
    /(AUTH|AUTHORIZATION|TRANSACTION|BATCH|TOKEN|ACCESS|ACQUIRER|NETWORK|DIGITAL|INTEGRITY|BASE II|PRE-AUTH|ADDRESS VERIF)/.test(description)
  ) {
    return classification({
      economicBucket: "processor_transaction_or_auth",
      confidence: "medium",
      rule: "FISERV_FULL_STATEMENT_TRANSACTION_OR_NETWORK_FEE_LABEL",
      reason:
        "The row is printed as a Fees line and its label/count/rate pattern indicates a transaction, authorization, access, network, or batch-style charge.",
      row,
      atCostStatus: "not_applicable",
      atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
      costExposure: "not_applicable",
      marginAmountKnown: true,
    });
  }

  if (type === "FEES") {
    return classification({
      economicBucket: "miscellaneous_or_statement_fee",
      confidence: "medium",
      rule: "FISERV_FULL_STATEMENT_ACCOUNT_OR_OTHER_FEE_TYPE",
      reason: "The row is printed as a Fees line but does not expose enough detail to classify it more narrowly than account/other fee.",
      row,
      atCostStatus: "not_applicable",
      atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
      costExposure: "not_applicable",
      marginAmountKnown: true,
    });
  }

  if (PROCESSOR_ACCOUNT_OR_MISC_LABELS.has(description)) {
    return classification({
      economicBucket: "miscellaneous_or_statement_fee",
      confidence: "high",
      rule: "FISERV_MISCELLANEOUS_ACCOUNT_FEE",
      reason: "The fee label is a miscellaneous account, ACH, PCI, return, or processor-controlled adjustment charge.",
      row,
      atCostStatus: "not_applicable",
      atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
      costExposure: "not_applicable",
      marginAmountKnown: true,
    });
  }

  if (description === "**ADDITIONAL FEES" || description === "ADDITIONAL FEES") {
    return classification({
      economicBucket: "unknown_needs_review",
      confidence: "low",
      rule: "FISERV_ADDITIONAL_FEES_UNRESOLVED",
      reason: "The statement does not decompose this line. It must stay unresolved instead of being forced into markup or pass-through.",
      row,
      atCostStatus: "indeterminate",
      atCostReasonCode: "BASE_UNKNOWN",
      costExposure: "hidden",
      marginAmountKnown: false,
    });
  }

  return classification({
    economicBucket: "unknown_needs_review",
    confidence: "low",
    rule: "FISERV_NO_SPECIFIC_RULE",
    reason: "No conservative Fiserv / First Data processor-branded rule matched this fee label.",
    row,
    atCostStatus: "indeterminate",
    atCostReasonCode: "BASE_UNKNOWN",
    costExposure: "hidden",
    marginAmountKnown: false,
  });
}

export function classifyFiservProcessorFeeLedgerRows<T extends FiservProcessorFeeRowForClassification>(
  rows: T[],
  printedTotal: number | null,
  context: Omit<FiservProcessorFeeClassificationContext, "statementCostExposure"> = {},
): {
  rows: Array<FiservProcessorClassifiedFeeRow<T>>;
  summary: FiservProcessorFeeClassificationSummary;
} {
  const statementCostExposure = inferFiservProcessorStatementCostExposure(rows);
  const classifiedRows = rows.map((row) => ({
    ...row,
    classification: classifyFiservProcessorFeeRow(row, { ...context, statementCostExposure }),
  }));
  const summary = summarizeFiservProcessorFeeClassifications(classifiedRows, printedTotal);

  return {
    rows: classifiedRows,
    summary,
  };
}

export function summarizeFiservProcessorFeeClassifications<T extends FiservProcessorFeeRowForClassification>(
  classifiedRows: Array<FiservProcessorClassifiedFeeRow<T>>,
  printedTotal: number | null,
): FiservProcessorFeeClassificationSummary {
  const bucketTotals = Array.from(
    classifiedRows.reduce((buckets, row) => {
      const current = buckets.get(row.classification.economicBucket) ?? { amount: 0, rowCount: 0 };
      buckets.set(row.classification.economicBucket, {
        amount: round2(current.amount + row.amount),
        rowCount: current.rowCount + 1,
      });
      return buckets;
    }, new Map<FiservProcessorFeeEconomicBucket, { amount: number; rowCount: number }>()),
  )
    .map(([economicBucket, total]) => ({
      economicBucket,
      amount: total.amount,
      rowCount: total.rowCount,
    }))
    .sort((left, right) => right.amount - left.amount || left.economicBucket.localeCompare(right.economicBucket));

  const totalClassifiedAmount = round2(classifiedRows.reduce((sum, row) => sum + row.amount, 0));
  const delta = printedTotal === null ? 0 : round2(printedTotal - totalClassifiedAmount);
  const bucketAmount = (bucket: FiservProcessorFeeEconomicBucket): number =>
    bucketTotals.find((total) => total.economicBucket === bucket)?.amount ?? 0;
  const residualBasisTotal = printedTotal ?? totalClassifiedAmount;
  const identifiedCardBrandPassThroughAmount = bucketAmount("card_brand_pass_through");
  const knownProcessorFeeAmount = residualRound2(
    bucketAmount("processor_controlled_flat_discount_fee") +
      bucketAmount("processor_transaction_or_auth") +
      bucketAmount("miscellaneous_or_statement_fee"),
  );
  const unbundledProcessorControlledAmount = bucketAmount("processor_controlled_tiered_fee");
  const unresolvedAmount = bucketAmount("unknown_needs_review");
  const zeroAmount = bucketAmount("zero_amount_no_charge");
  const residualAnalysis: FiservProcessorFeeResidualAnalysis = {
    basis: printedTotal === null ? "row_sum" : "printed_total",
    basisTotal: residualBasisTotal,
    identifiedCardBrandPassThroughAmount,
    knownProcessorFeeAmount,
    unbundledProcessorControlledAmount,
    unresolvedAmount,
    zeroAmount,
    markupOrUnknownPoolAmount: residualRound2(residualBasisTotal - identifiedCardBrandPassThroughAmount),
    residualUnclassifiedAmount: residualRound2(
      residualBasisTotal -
        identifiedCardBrandPassThroughAmount -
        knownProcessorFeeAmount -
        unbundledProcessorControlledAmount -
        zeroAmount,
    ),
    rowSumDeltaToBasis: delta,
    formula:
      "basisTotal - identifiedCardBrandPassThroughAmount - knownProcessorFeeAmount - unbundledProcessorControlledAmount - zeroAmount",
  };
  const unresolvedRowCount = classifiedRows.filter((row) => row.classification.economicBucket === "unknown_needs_review").length;
  const needsUnbundlingRowCount = classifiedRows.filter((row) => row.classification.needsUnbundling).length;
  const tolerance = 0.02;
  const reconciled = printedTotal !== null && Math.abs(delta) <= tolerance;
  const status =
    printedTotal === null
      ? "not_mapped"
      : !reconciled
        ? "unreconciled"
        : unresolvedRowCount > 0 || needsUnbundlingRowCount > 0
          ? "validated_with_unresolved_rows"
          : Math.abs(delta) > 0
            ? "validated_with_rounding_delta"
            : "validated";

  const notes = [
    "Classification preserves the full fee ledger and does not split blended tier rows into interchange and markup without external evidence.",
  ];
  if (unresolvedRowCount > 0) {
    notes.push("At least one fee row remains unresolved because the statement does not disclose its composition.");
  }
  if (needsUnbundlingRowCount > 0) {
    notes.push("Tiered discount rows are processor-controlled blended pricing and need unbundling before clean margin reporting.");
  }
  if (Math.abs(delta) > 0) {
    notes.push(`Classified fee rows reconcile to the printed total with a $${Math.abs(delta).toFixed(2)} rounding delta.`);
  }
  if (Math.abs(residualAnalysis.residualUnclassifiedAmount) > tolerance) {
    notes.push(
      `Residual analysis leaves $${residualAnalysis.residualUnclassifiedAmount.toFixed(2)} after subtracting identified card-brand pass-through, known processor fees, and unbundled processor-controlled fees from the fee total.`,
    );
  }

  return {
    status,
    rowCount: classifiedRows.length,
    classifiedRowCount: classifiedRows.length,
    unresolvedRowCount,
    needsUnbundlingRowCount,
    totalClassifiedAmount,
    printedTotal,
    delta,
    tolerance,
    bucketTotals,
    residualAnalysis,
    notes,
  };
}
