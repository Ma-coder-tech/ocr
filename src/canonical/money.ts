import type { DecimalString, MoneyAmount } from "./types.js";

export const MONEY_POLICY_VERSION = "money_minor_units_usd_v1" as const;

export function moneyFromNumber(value: number): MoneyAmount | null {
  if (!Number.isFinite(value)) return null;
  const amountMinor = Math.round(value * 100);
  if (!Number.isSafeInteger(amountMinor)) return null;
  return {
    amountMinor,
    currency: "USD",
  };
}

export function moneyFromDecimalString(value: string): MoneyAmount | null {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!/^-?\d+(?:\.\d{1,})?$/.test(normalized)) return null;
  const [whole = "0", fraction = ""] = normalized.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const wholeDigits = whole.replace(/^-/, "");
  const centsDigits = fraction.padEnd(3, "0");
  let cents = BigInt(wholeDigits || "0") * 100n + BigInt(centsDigits.slice(0, 2));
  if (Number(centsDigits[2] ?? "0") >= 5) cents += 1n;
  cents *= BigInt(sign);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return {
    amountMinor: Number(cents),
    currency: "USD",
  };
}

export function moneyToNumber(value: MoneyAmount): number {
  return value.amountMinor / 100;
}

export function addMoney(values: MoneyAmount[]): MoneyAmount {
  return {
    amountMinor: values.reduce((sum, value) => sum + value.amountMinor, 0),
    currency: "USD",
  };
}

export function divideMoneyByCount(value: MoneyAmount, count: number): MoneyAmount | null {
  if (!Number.isSafeInteger(count) || count <= 0) return null;
  return {
    amountMinor: Math.round(value.amountMinor / count),
    currency: "USD",
  };
}

export function decimalRate(numerator: MoneyAmount, denominator: MoneyAmount, scale = 6): DecimalString | null {
  if (denominator.amountMinor <= 0) return null;
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > 12) return null;
  const sign = numerator.amountMinor < 0 ? "-" : "";
  const numeratorMinor = BigInt(Math.abs(numerator.amountMinor));
  const denominatorMinor = BigInt(denominator.amountMinor);
  const multiplier = 10n ** BigInt(scale);
  const scaled = (numeratorMinor * multiplier + denominatorMinor / 2n) / denominatorMinor;
  const whole = scaled / multiplier;
  const fraction = String(scaled % multiplier).padStart(scale, "0");
  return scale === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
}

export function isMoneyAmount(value: unknown): value is MoneyAmount {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as MoneyAmount).currency === "USD" &&
    Number.isSafeInteger((value as MoneyAmount).amountMinor)
  );
}
