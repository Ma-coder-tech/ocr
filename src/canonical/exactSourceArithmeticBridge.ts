import type {
  CanonicalExactSourceArithmeticAmount,
  CanonicalExactSourceArithmeticAssessment,
  CanonicalFeeLedgerControl,
  CanonicalFeePartitionSourceProvenance,
} from "./types.js";

export const EXACT_SOURCE_ARITHMETIC_BRIDGE_POLICY_VERSION = "exact_source_arithmetic_bridge_v1" as const;

type Rational = { numerator: bigint; denominator: bigint };

export function buildExactSourceArithmeticAssessment(input: {
  grand: CanonicalFeeLedgerControl;
  sections: CanonicalFeeLedgerControl[];
  eligibleFeeRowIds: string[];
  provenance: CanonicalFeePartitionSourceProvenance;
  residualMinor: number | null;
  membershipComplete: boolean;
}): CanonicalExactSourceArithmeticAssessment {
  const base = {
    policyVersion: EXACT_SOURCE_ARITHMETIC_BRIDGE_POLICY_VERSION,
    authority: "diagnostic_relationship_only" as const,
    roundingMode: "nearest_cent_half_away_from_zero" as const,
    reconstructedFeeRowIds: [] as string[],
    incompleteFeeRowIds: [] as string[],
    ambiguousFeeRowIds: [] as string[],
    mismatchedFeeRowIds: [] as string[],
    sectionAmounts: [] as CanonicalExactSourceArithmeticAssessment["sectionAmounts"],
    grandAmount: null as CanonicalExactSourceArithmeticAmount | null,
    evidenceRefs: [] as string[],
  };
  if (input.residualMinor === 0) return { ...base, status: "not_needed_exact", reasonCode: "printed_totals_exact" };
  if (input.residualMinor === null) return { ...base, status: "unresolved", reasonCode: "printed_totals_not_comparable" };
  if (!input.membershipComplete) return { ...base, status: "unresolved", reasonCode: "incomplete_partition_membership" };

  const assignments = new Map(input.provenance.assignments.map((item) => [item.feeRowId, item]));
  const arithmetic = new Map(input.provenance.rowArithmetic.map((item) => [item.feeRowId, item]));
  const sectionIds = new Set(input.sections.map((section) => section.id));
  const exactByRow = new Map<string, Rational>();
  const evidenceRefs = new Set<string>();
  const incompleteFeeRowIds: string[] = [];
  const ambiguousFeeRowIds: string[] = [];
  const mismatchedFeeRowIds: string[] = [];
  let unsupported = false;

  for (const feeRowId of input.eligibleFeeRowIds) {
    const assignment = assignments.get(feeRowId);
    const row = arithmetic.get(feeRowId);
    if (!assignment || assignment.status !== "assigned" || !assignment.sectionControlRef || !sectionIds.has(assignment.sectionControlRef)) {
      incompleteFeeRowIds.push(feeRowId);
      continue;
    }
    if (!row || row.status === "ambiguous") {
      ambiguousFeeRowIds.push(feeRowId);
      continue;
    }
    if (row.status !== "complete" || !row.chargedAmount) {
      incompleteFeeRowIds.push(feeRowId);
      continue;
    }
    const exact = exactAmountMinor(row);
    const rounded = exact ? roundRational(exact) : null;
    if (!exact || rounded === null) {
      unsupported = true;
      incompleteFeeRowIds.push(feeRowId);
      continue;
    }
    for (const evidenceRef of Object.values(row.fieldEvidenceRefs).flat()) evidenceRefs.add(evidenceRef);
    exactByRow.set(feeRowId, exact);
    if (rounded !== row.chargedAmount.amountMinor) mismatchedFeeRowIds.push(feeRowId);
  }

  const shared = {
    ...base,
    reconstructedFeeRowIds: [...exactByRow.keys()].sort(),
    incompleteFeeRowIds: sortedUnique(incompleteFeeRowIds),
    ambiguousFeeRowIds: sortedUnique(ambiguousFeeRowIds),
    mismatchedFeeRowIds: sortedUnique(mismatchedFeeRowIds),
    evidenceRefs: [...evidenceRefs].sort(),
  };
  if (ambiguousFeeRowIds.length > 0) return { ...shared, status: "unresolved", reasonCode: "ambiguous_source_arithmetic" };
  if (incompleteFeeRowIds.length > 0) {
    return { ...shared, status: "unresolved", reasonCode: unsupported ? "unsupported_source_arithmetic" : "incomplete_source_arithmetic" };
  }
  if (mismatchedFeeRowIds.length > 0) return { ...shared, status: "unresolved", reasonCode: "source_arithmetic_row_mismatch" };

  const sectionAmounts: CanonicalExactSourceArithmeticAssessment["sectionAmounts"] = [];
  for (const section of input.sections) {
    const feeRowIds = input.eligibleFeeRowIds.filter((feeRowId) => assignments.get(feeRowId)?.sectionControlRef === section.id).sort();
    const exactRows = feeRowIds.map((feeRowId) => exactByRow.get(feeRowId)).filter((item): item is Rational => Boolean(item));
    const exactAmount = exactRows.length === feeRowIds.length ? serializableAmount(sumRationals(exactRows)) : null;
    if (!exactAmount || !section.expectedAmount) {
      return { ...shared, status: "unresolved", reasonCode: "unsupported_source_arithmetic" };
    }
    const printedAmountMinor = section.expectedAmount.amountMinor;
    for (const evidenceRef of section.evidenceRefs) evidenceRefs.add(evidenceRef);
    sectionAmounts.push({
      controlRef: section.id,
      feeRowIds,
      exactAmount,
      printedAmountMinor,
      reproducesPrintedTotal: exactAmount.roundedAmountMinor === printedAmountMinor,
    });
  }
  const grandExact = sumRationals([...exactByRow.values()]);
  const grandAmount = serializableAmount(grandExact);
  for (const evidenceRef of input.grand.evidenceRefs) evidenceRefs.add(evidenceRef);
  const complete = {
    ...shared,
    sectionAmounts,
    grandAmount,
    evidenceRefs: [...evidenceRefs].sort(),
  };
  if (sectionAmounts.some((section) => !section.reproducesPrintedTotal)) {
    return { ...complete, status: "unresolved", reasonCode: "source_arithmetic_section_mismatch" };
  }
  if (!grandAmount) return { ...complete, status: "unresolved", reasonCode: "unsupported_source_arithmetic" };
  if (!input.grand.expectedAmount || grandAmount.roundedAmountMinor !== input.grand.expectedAmount.amountMinor) {
    return { ...complete, status: "unresolved", reasonCode: "source_arithmetic_grand_mismatch" };
  }
  return { ...complete, status: "proven_rounding", reasonCode: "exact_source_arithmetic_proves_rounding" };
}

function exactAmountMinor(
  row: CanonicalFeePartitionSourceProvenance["rowArithmetic"][number],
): Rational | null {
  if (row.formulaBasis === "rate_times_volume" && row.printedRate?.normalizedFractionalRate && row.volumeBasis) {
    const rate = decimalRational(row.printedRate.normalizedFractionalRate);
    return rate ? multiply(rate, BigInt(row.volumeBasis.amountMinor)) : null;
  }
  if (row.formulaBasis === "per_item" && row.printedPerItemRate?.normalizedFractionalRate && row.itemCount !== null) {
    if (!Number.isSafeInteger(row.itemCount) || row.itemCount < 0) return null;
    const rateDollars = decimalRational(row.printedPerItemRate.normalizedFractionalRate);
    return rateDollars ? multiply(rateDollars, BigInt(row.itemCount) * 100n) : null;
  }
  if (row.formulaBasis === "source_units_times_per_unit" && row.printedPerUnitRate?.normalizedFractionalRate && row.sourceUnitBasis) {
    const units = decimalRational(row.sourceUnitBasis);
    const rateDollars = decimalRational(row.printedPerUnitRate.normalizedFractionalRate);
    return units && rateDollars ? multiply(multiplyRationals(units, rateDollars), 100n) : null;
  }
  return null;
}

function decimalRational(value: string): Rational | null {
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const fraction = match[3] ?? "";
  const sign = match[1] === "-" ? -1n : 1n;
  return normalize({ numerator: sign * BigInt(`${match[2]}${fraction}`), denominator: 10n ** BigInt(fraction.length) });
}

function multiply(value: Rational, factor: bigint): Rational {
  return normalize({ numerator: value.numerator * factor, denominator: value.denominator });
}

function multiplyRationals(left: Rational, right: Rational): Rational {
  return normalize({ numerator: left.numerator * right.numerator, denominator: left.denominator * right.denominator });
}

function sumRationals(values: Rational[]): Rational {
  return values.reduce(
    (sum, value) => normalize({
      numerator: sum.numerator * value.denominator + value.numerator * sum.denominator,
      denominator: sum.denominator * value.denominator,
    }),
    { numerator: 0n, denominator: 1n },
  );
}

function serializableAmount(value: Rational): CanonicalExactSourceArithmeticAmount | null {
  const rounded = roundRational(value);
  return rounded === null
    ? null
    : { numeratorMinorUnits: value.numerator.toString(), denominator: value.denominator.toString(), roundedAmountMinor: rounded };
}

function roundRational(value: Rational): number | null {
  const sign = value.numerator < 0n ? -1n : 1n;
  const absolute = value.numerator < 0n ? -value.numerator : value.numerator;
  const quotient = absolute / value.denominator;
  const remainder = absolute % value.denominator;
  const rounded = sign * (quotient + (remainder * 2n >= value.denominator ? 1n : 0n));
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) && rounded >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(rounded) : null;
}

function normalize(value: Rational): Rational {
  if (value.denominator === 0n) return value;
  const sign = value.denominator < 0n ? -1n : 1n;
  const divisor = gcd(value.numerator, value.denominator);
  return { numerator: (value.numerator / divisor) * sign, denominator: (value.denominator / divisor) * sign };
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a === 0n ? 1n : a;
}

function sortedUnique(values: string[]): string[] { return [...new Set(values)].sort(); }
