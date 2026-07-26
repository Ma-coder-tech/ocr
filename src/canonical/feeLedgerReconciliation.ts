import { moneyFromDecimalString } from "./money.js";
import type {
  CanonicalFeeLedgerControl,
  CanonicalPrintedRate,
  CanonicalRateRepresentation,
  DecimalString,
  MoneyAmount,
} from "./types.js";

export const PRINTED_MONETARY_CONTROL_POLICY_ID = "fee_ledger_printed_monetary_control_v1";
export const RATE_VOLUME_PRECISION_POLICY_ID = "fee_ledger_rate_volume_precision_v1";
export const PER_ITEM_PRECISION_POLICY_ID = "fee_ledger_per_item_precision_v1";

export function printedMonetaryControl(input: {
  id: string;
  label: string;
  evidenceRefs: string[];
  expectedAmount: MoneyAmount | null;
  actualAmount: MoneyAmount | null;
  derivationGroupId: string;
  documentedOneCentRounding?: boolean;
}): CanonicalFeeLedgerControl {
  const deltaMinor = input.expectedAmount && input.actualAmount ? input.actualAmount.amountMinor - input.expectedAmount.amountMinor : null;
  const toleranceMinor = input.documentedOneCentRounding ? 1 : 0;
  const withinTolerance = deltaMinor !== null && Math.abs(deltaMinor) <= toleranceMinor;
  return {
    id: input.id,
    type: "printed_charge_sum",
    label: input.label,
    evidenceRefs: input.evidenceRefs,
    expectedAmount: input.expectedAmount,
    actualAmount: input.actualAmount,
    deltaMinor,
    toleranceMinor,
    tolerancePolicyId: PRINTED_MONETARY_CONTROL_POLICY_ID,
    status:
      deltaMinor === null
        ? "limited"
        : deltaMinor === 0
          ? "pass"
          : withinTolerance
            ? "pass_with_rounding"
            : "verification_required",
    derivationGroupId: input.derivationGroupId,
    explanation:
      "Printed monetary charge rows must reconcile to printed controls exactly, with only documented one-cent printed rounding accepted.",
  };
}

export function parsePrintedRate(input: string): CanonicalPrintedRate {
  const original = input.trim();
  const lower = original.toLowerCase();
  const representation: CanonicalRateRepresentation = lower.includes("bps")
    ? "basis_points"
    : lower.includes("%")
      ? "percent_points"
      : /^-?\d+(?:\.\d+)?$/.test(original)
        ? "decimal_fraction"
        : "unknown";
  const numeric = original.match(/-?\d+(?:\.\d+)?/)?.[0] ?? "";
  const displayedDecimalPlaces = numeric.includes(".") ? numeric.split(".")[1]!.length : 0;
  const numericValue = numeric || "0";
  const normalized = representation === "unknown" || !numeric ? null : normalizeRateToFraction(numericValue, representation);
  return {
    original,
    numericValue,
    displayedDecimalPlaces,
    representation,
    normalizedFractionalRate: normalized,
  };
}

export function normalizeRateToFraction(value: DecimalString, representation: Exclude<CanonicalRateRepresentation, "unknown">): DecimalString {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  const fraction =
    representation === "percent_points" ? numeric / 100 : representation === "basis_points" ? numeric / 10_000 : numeric;
  return fraction.toFixed(10).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

export function rateUnitFraction(rate: CanonicalPrintedRate): number | null {
  if (rate.representation === "unknown") return null;
  const displayedUnit = 10 ** -rate.displayedDecimalPlaces;
  if (rate.representation === "percent_points") return displayedUnit / 100;
  if (rate.representation === "basis_points") return displayedUnit / 10_000;
  return displayedUnit;
}

export function rateTimesVolumeToleranceMinor(input: { volume: MoneyAmount; printedRate: CanonicalPrintedRate }): number | null {
  const unit = rateUnitFraction(input.printedRate);
  if (unit === null) return null;
  const volumeUsd = Math.abs(input.volume.amountMinor) / 100;
  const maxMoneyUncertaintyUsd = volumeUsd * (unit / 2);
  return Math.ceil(maxMoneyUncertaintyUsd * 100 + 0.5);
}

export function perItemToleranceMinor(input: { itemCount: number; printedRate: CanonicalPrintedRate }): number | null {
  const unit = rateUnitFraction(input.printedRate);
  if (unit === null || !Number.isSafeInteger(input.itemCount) || input.itemCount < 0) return null;
  const maxMoneyUncertaintyUsd = input.itemCount * (unit / 2);
  return Math.ceil(maxMoneyUncertaintyUsd * 100 + 0.5);
}

export function diagnosticRateVolumeControl(input: {
  id: string;
  label: string;
  evidenceRefs: string[];
  printedAmount: MoneyAmount;
  volume: MoneyAmount;
  printedRate: CanonicalPrintedRate;
  derivationGroupId: string;
  materialUncertaintyThresholdMinor?: number;
}): CanonicalFeeLedgerControl {
  const toleranceMinor = rateTimesVolumeToleranceMinor({ volume: input.volume, printedRate: input.printedRate });
  const materialUncertaintyThresholdMinor = input.materialUncertaintyThresholdMinor ?? 100;
  const expectedAmount = input.printedRate.normalizedFractionalRate
    ? moneyFromDecimalString(String((Number(input.printedRate.normalizedFractionalRate) * (input.volume.amountMinor / 100)).toFixed(4)))
    : null;
  const deltaMinor = expectedAmount ? input.printedAmount.amountMinor - expectedAmount.amountMinor : null;
  const materiallyUncertain = toleranceMinor !== null && toleranceMinor > materialUncertaintyThresholdMinor;
  return {
    id: input.id,
    type: "rate_times_volume",
    label: input.label,
    evidenceRefs: input.evidenceRefs,
    expectedAmount,
    actualAmount: input.printedAmount,
    deltaMinor,
    toleranceMinor,
    tolerancePolicyId: RATE_VOLUME_PRECISION_POLICY_ID,
    status:
      toleranceMinor === null || deltaMinor === null
        ? "verification_required"
        : materiallyUncertain
          ? "limited"
        : Math.abs(deltaMinor) <= toleranceMinor
          ? "pass"
          : "limited",
    derivationGroupId: input.derivationGroupId,
    explanation:
      "Rate-times-volume checks normalize the printed rate unit and derive tolerance from displayed precision; printed monetary charges remain the observed amounts.",
  };
}

export function diagnosticPerItemControl(input: {
  id: string;
  label: string;
  evidenceRefs: string[];
  printedAmount: MoneyAmount;
  itemCount: number;
  printedRate: CanonicalPrintedRate;
  derivationGroupId: string;
  materialUncertaintyThresholdMinor?: number;
}): CanonicalFeeLedgerControl {
  const toleranceMinor = perItemToleranceMinor({ itemCount: input.itemCount, printedRate: input.printedRate });
  const materialUncertaintyThresholdMinor = input.materialUncertaintyThresholdMinor ?? 100;
  const expectedAmount = input.printedRate.normalizedFractionalRate
    ? moneyFromDecimalString(String((Number(input.printedRate.normalizedFractionalRate) * input.itemCount).toFixed(4)))
    : null;
  const deltaMinor = expectedAmount ? input.printedAmount.amountMinor - expectedAmount.amountMinor : null;
  const materiallyUncertain = toleranceMinor !== null && toleranceMinor > materialUncertaintyThresholdMinor;
  return {
    id: input.id,
    type: "per_item_rate",
    label: input.label,
    evidenceRefs: input.evidenceRefs,
    expectedAmount,
    actualAmount: input.printedAmount,
    deltaMinor,
    toleranceMinor,
    tolerancePolicyId: PER_ITEM_PRECISION_POLICY_ID,
    status:
      toleranceMinor === null || deltaMinor === null
        ? "verification_required"
        : materiallyUncertain
          ? "limited"
        : Math.abs(deltaMinor) <= toleranceMinor
          ? "pass"
          : "limited",
    derivationGroupId: input.derivationGroupId,
    explanation:
      "Per-item checks normalize the printed rate unit and derive tolerance from displayed precision; printed monetary charges remain the observed amounts.",
  };
}

export function fundingFormulaControl(input: {
  id: string;
  label: string;
  evidenceRefs: string[];
  expectedFundedAmount: MoneyAmount | null;
  actualFundedAmount: MoneyAmount | null;
  formulaComplete: boolean;
  derivationGroupId: string;
}): CanonicalFeeLedgerControl {
  const deltaMinor =
    input.expectedFundedAmount && input.actualFundedAmount
      ? input.actualFundedAmount.amountMinor - input.expectedFundedAmount.amountMinor
      : null;
  const completeAndComparable = input.formulaComplete && deltaMinor !== null;
  return {
    id: input.id,
    type: "funding_formula",
    label: input.label,
    evidenceRefs: input.evidenceRefs,
    expectedAmount: input.expectedFundedAmount,
    actualAmount: input.actualFundedAmount,
    deltaMinor,
    toleranceMinor: completeAndComparable ? 1 : null,
    tolerancePolicyId: "fee_ledger_funding_formula_v1",
    status: !completeAndComparable ? "limited" : Math.abs(deltaMinor) <= 1 ? "pass" : "verification_required",
    derivationGroupId: input.derivationGroupId,
    explanation:
      "Funding formula reconciliation allows one cent only when all printed monetary components are complete; incomplete formulas are limited rather than treated as rounding failures.",
  };
}
