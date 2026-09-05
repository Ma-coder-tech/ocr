import type { CanonicalFeeSourceUnit, DecimalString } from "./types.js";

export const FEE_OPERAND_UNIT_SEMANTICS_POLICY_VERSION = "fee_operand_unit_semantics_adjudication_v1" as const;

export type FeeOperandUnitResolution =
  | {
      status: "resolved";
      basisKind: "money_volume" | "transaction_count" | "other_source_units";
      sourceUnit: CanonicalFeeSourceUnit | null;
      ruleId:
        | "explicit_count_description_v1"
        | "explicit_money_volume_description_v1"
        | "explicit_source_unit_description_v1"
        | "explicit_batch_unit_description_v1"
        | "explicit_authorization_unit_description_v1"
        | "explicit_rejection_unit_description_v1"
        | "explicit_verification_unit_description_v1";
      evidenceBasis: "printed_fee_description";
    }
  | {
      status: "conflicting";
      reasonCode: "explicit_count_language_conflicts_with_fractional_basis";
      evidenceBasis: "printed_fee_description_and_source_format";
    }
  | {
      status: "unknown";
      reasonCode: "no_explicit_unit_semantics";
    };

/**
 * Resolves a printed fee basis only from the statement's own unit language.
 * Charge amount and arithmetic fit are intentionally not accepted as inputs.
 */
export function resolvePrintedFeeOperandUnit(input: {
  label: string;
  basisToken: DecimalString;
}): FeeOperandUnitResolution {
  const label = normalize(input.label);
  const integerBasis = integerValue(input.basisToken);

  // A spelled-out physical/source unit outranks an event word elsewhere in the
  // description (for example, "KILOBYTE AUTH FEE").
  if (/\bkilobytes?\b/.test(label)) return resolvedSourceUnit("kilobytes", "explicit_source_unit_description_v1");
  if (/\bbatch(?:es)?\b/.test(label)) return resolvedSourceUnit("batches", "explicit_batch_unit_description_v1");
  if (/\breject(?:ed|ion|ions|s)?\b/.test(label)) return resolvedSourceUnit("rejection_events", "explicit_rejection_unit_description_v1");
  if (/\bverifications?\b/.test(label)) return resolvedSourceUnit("verification_events", "explicit_verification_unit_description_v1");
  if (/\b(?:auth|auths|authorization|authorizations)\b/.test(label)) return resolvedSourceUnit("authorization_events", "explicit_authorization_unit_description_v1");

  if (/\b(?:items?|transactions?)\b/.test(label)) {
    if (integerBasis === null) {
      return {
        status: "conflicting",
        reasonCode: "explicit_count_language_conflicts_with_fractional_basis",
        evidenceBasis: "printed_fee_description_and_source_format",
      };
    }
    return {
      status: "resolved",
      basisKind: "transaction_count",
      sourceUnit: null,
      ruleId: "explicit_count_description_v1",
      evidenceBasis: "printed_fee_description",
    };
  }

  if (/\bvolumes?\b/.test(label)) {
    return {
      status: "resolved",
      basisKind: "money_volume",
      sourceUnit: null,
      ruleId: "explicit_money_volume_description_v1",
      evidenceBasis: "printed_fee_description",
    };
  }

  return { status: "unknown", reasonCode: "no_explicit_unit_semantics" };
}

function resolvedSourceUnit(
  sourceUnit: CanonicalFeeSourceUnit,
  ruleId: Extract<FeeOperandUnitResolution, { status: "resolved" }>["ruleId"],
): Extract<FeeOperandUnitResolution, { status: "resolved" }> {
  return {
    status: "resolved",
    basisKind: "other_source_units",
    sourceUnit,
    ruleId,
    evidenceBasis: "printed_fee_description",
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function integerValue(value: DecimalString): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
