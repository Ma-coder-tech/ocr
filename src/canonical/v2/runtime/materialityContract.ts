export const MATERIALITY_CONTRACT_VERSION = "canonical_materiality_contract_v1" as const;

export type EconomicMaterialityTier = "E2" | "E1" | "E0" | "unavailable";
export type DecisionMaterialityTier = "D2" | "D1" | "D0";
export type CanonicalClaimMateriality = "material" | "contextual" | "immaterial" | "unresolved";

export const MATERIALITY_CONTRACT_V1 = {
  version: MATERIALITY_CONTRACT_VERSION,
  authority: "versioned_product_semantics" as const,
  magnitudeBasis: "observed_statement_period_atomic_claim" as const,
  annualization: "prohibited" as const,
  businessTypeAuthority: "excluded" as const,
  benchmarkAuthority: "excluded" as const,
  relativeWhenAuthoritativeCostUnavailable: "unavailable_not_zero" as const,
  economicThresholds: {
    e2CombinedAbsoluteMinor: 10_000,
    e2CombinedRelativeBasisPoints: 100,
    e2AbsoluteMinor: 50_000,
    e2HighRelativeFloorMinor: 1_000,
    e2HighRelativeBasisPoints: 1_000,
    e1AbsoluteMinor: 1_000,
    e1RelativeBasisPoints: 100,
  },
  matrix: {
    E2: { D2: "material", D1: "material", D0: "contextual" },
    E1: { D2: "material", D1: "contextual", D0: "contextual" },
    E0: { D2: "material", D1: "contextual", D0: "immaterial" },
    unavailable: { D2: "material", D1: "contextual", D0: "unresolved" },
  },
} as const;

export type EconomicMaterialityEvaluation = {
  tier: EconomicMaterialityTier;
  amountMinor: number | null;
  authoritativeStatementCostMinor: number | null;
  relativeBasisPoints: number | null;
  relativeSignificance: "available" | "unavailable";
  reasonCodes: string[];
};

export function evaluateEconomicMateriality(input: {
  amountMinor: number | null;
  authoritativeStatementCostMinor: number | null;
}): EconomicMaterialityEvaluation {
  const amountMinor = validMagnitude(input.amountMinor);
  const totalMinor = validPositiveMagnitude(input.authoritativeStatementCostMinor);
  if (amountMinor === null) {
    return { tier: "unavailable", amountMinor: null, authoritativeStatementCostMinor: totalMinor,
      relativeBasisPoints: null, relativeSignificance: totalMinor === null ? "unavailable" : "available",
      reasonCodes: ["atomic_claim_magnitude_unavailable"] };
  }
  const relativeBasisPoints = totalMinor === null ? null
    : Number((BigInt(amountMinor) * 1_000_000n) / BigInt(totalMinor)) / 100;
  const atLeast = (basisPoints: number) => totalMinor !== null
    && BigInt(amountMinor) * 10_000n >= BigInt(totalMinor) * BigInt(basisPoints);
  const thresholds = MATERIALITY_CONTRACT_V1.economicThresholds;
  const reasonCodes: string[] = [];
  let tier: EconomicMaterialityTier;
  if ((amountMinor >= thresholds.e2CombinedAbsoluteMinor && atLeast(thresholds.e2CombinedRelativeBasisPoints))
      || amountMinor >= thresholds.e2AbsoluteMinor
      || (amountMinor >= thresholds.e2HighRelativeFloorMinor && atLeast(thresholds.e2HighRelativeBasisPoints))) {
    tier = "E2";
    if (amountMinor >= thresholds.e2AbsoluteMinor) reasonCodes.push("e2_absolute_500_dollars");
    if (amountMinor >= thresholds.e2CombinedAbsoluteMinor && atLeast(thresholds.e2CombinedRelativeBasisPoints)) {
      reasonCodes.push("e2_100_dollars_and_1_percent");
    }
    if (amountMinor >= thresholds.e2HighRelativeFloorMinor && atLeast(thresholds.e2HighRelativeBasisPoints)) {
      reasonCodes.push("e2_10_dollars_and_10_percent");
    }
  } else if (amountMinor >= thresholds.e1AbsoluteMinor || atLeast(thresholds.e1RelativeBasisPoints)) {
    tier = "E1";
    if (amountMinor >= thresholds.e1AbsoluteMinor) reasonCodes.push("e1_absolute_10_dollars");
    if (atLeast(thresholds.e1RelativeBasisPoints)) reasonCodes.push("e1_relative_1_percent");
  } else {
    tier = "E0";
    reasonCodes.push("below_e1_absolute_and_available_relative_thresholds");
  }
  if (totalMinor === null) reasonCodes.push("relative_significance_unavailable");
  return { tier, amountMinor, authoritativeStatementCostMinor: totalMinor, relativeBasisPoints,
    relativeSignificance: totalMinor === null ? "unavailable" : "available", reasonCodes };
}

export function combineMaterialityAxes(
  economicTier: EconomicMaterialityTier,
  decisionTier: DecisionMaterialityTier,
): CanonicalClaimMateriality {
  return MATERIALITY_CONTRACT_V1.matrix[economicTier][decisionTier];
}

function validMagnitude(value: number | null): number | null {
  return value !== null && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function validPositiveMagnitude(value: number | null): number | null {
  return value !== null && Number.isSafeInteger(value) && value > 0 ? value : null;
}
