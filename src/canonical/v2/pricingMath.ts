import type { DecimalString } from "../types.js";

type ParsedDecimal = {
  negative: boolean;
  digits: bigint;
  scale: number;
};

export function canonicalDecimal(value: DecimalString): DecimalString | null {
  const parsed = parseDecimal(value);
  if (!parsed) return null;
  return formatDecimal(parsed.negative, parsed.digits, parsed.scale);
}

export function normalizePrintedPricingRate(
  printedRate: DecimalString,
  unit: "decimal" | "percent" | "basis_points",
): DecimalString | null {
  const parsed = parseDecimal(printedRate);
  if (!parsed || parsed.negative) return null;
  const unitScale = unit === "percent" ? 2 : unit === "basis_points" ? 4 : 0;
  return formatDecimal(false, parsed.digits, parsed.scale + unitScale);
}

export function sameDecimal(left: DecimalString | null, right: DecimalString | null): boolean {
  if (left === null || right === null) return left === right;
  return canonicalDecimal(left) === canonicalDecimal(right);
}

export function multiplyMinorByDecimalRate(amountMinor: number, rate: DecimalString): number | null {
  if (!Number.isSafeInteger(amountMinor)) return null;
  const parsed = parseDecimal(rate);
  if (!parsed || parsed.negative) return null;
  const denominator = 10n ** BigInt(parsed.scale);
  const product = BigInt(amountMinor) * parsed.digits;
  const negative = product < 0n;
  const absolute = negative ? -product : product;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = quotient + (remainder * 2n >= denominator ? 1n : 0n);
  const signed = negative ? -rounded : rounded;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(signed);
}

function parseDecimal(value: string): ParsedDecimal | null {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = match[3] ?? "";
  return {
    negative: match[1] === "-",
    digits: BigInt(`${match[2]}${fraction}`),
    scale: fraction.length,
  };
}

function formatDecimal(negative: boolean, digits: bigint, scale: number): string {
  let text = digits.toString().padStart(scale + 1, "0");
  if (scale > 0) text = `${text.slice(0, -scale)}.${text.slice(-scale)}`;
  text = text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  if (text.endsWith(".")) text = text.slice(0, -1);
  if (!text) text = "0";
  return negative && text !== "0" ? `-${text}` : text;
}
