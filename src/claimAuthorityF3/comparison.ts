import { canonicalFactAt, validateCanonicalRef } from "../claimAuthorityF1/graph.js";
import type { CanonicalRef } from "../claimAuthorityF1/types.js";
import { resolveAdmittedPublicClaims, type F3PublicQuery } from "./resolver.js";
import { F3_COMPARISON_VERSION, type F3PublicResolution } from "./types.js";

export type F3ReferenceComparison = {
  comparisonVersion: typeof F3_COMPARISON_VERSION;
  standing: "shadow_only_narrow_reference_comparison";
  resolution: F3PublicResolution;
  status: "equal_within_tolerance" | "above_reference" | "below_reference" | "unknown" | "conflict" | "refused";
  reasonCode: "comparison_complete" | "reference_missing" | "reference_period_not_covered" | "reference_conflict" | "claim_not_reference_comparison" | "observed_rate_unavailable" | "reference_not_rate";
  observedRate: string | null;
  referenceRate: string | null;
  difference: string | null;
  tolerance: "0";
  roundingPolicy: "exact_decimal_no_rounding";
  observedCanonicalRef: CanonicalRef;
  // The result asserts no contract, spread, markup, avoidability, profit, or savings verdict.
};

function decimal(value: string): boolean { return /^\d+(\.\d+)?$/.test(value); }
function scaled(value: string, digits: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(`${whole}${fraction.padEnd(digits, "0")}`);
}
function formatted(value: bigint, digits: number): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  if (digits === 0) return `${sign}${absolute}`;
  const padded = absolute.toString().padStart(digits + 1, "0");
  return `${sign}${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Only a selected canonical processor-stated rate can be used as the observed value.
// Basis/population compatibility is exact-match input to the resolver, so this remains
// a shadow diagnostic until an independent basis proof is admitted in a later package.
export function compareAdmittedPublicRate(input: F3PublicQuery & {
  observedCanonicalRef: CanonicalRef;
}): F3ReferenceComparison {
  const resolution = resolveAdmittedPublicClaims(input);
  validateCanonicalRef(input.analysis, input.observedCanonicalRef);
  const claim = input.graph.claims.find((item) => item.claimId === input.claimId)!;
  const base = {
    comparisonVersion: F3_COMPARISON_VERSION, standing: "shadow_only_narrow_reference_comparison" as const,
    resolution, observedCanonicalRef: structuredClone(input.observedCanonicalRef), tolerance: "0" as const,
    roundingPolicy: "exact_decimal_no_rounding" as const,
  };
  const finish = (status: F3ReferenceComparison["status"], reasonCode: F3ReferenceComparison["reasonCode"], observedRate: string | null = null, referenceRate: string | null = null, difference: string | null = null): F3ReferenceComparison =>
    freeze({ ...base, status, reasonCode, observedRate, referenceRate, difference });
  if (claim.dimension !== "reference_comparison"
    || !["observed_rate_matches_admitted_reference", "observed_rate_exceeds_admitted_reference", "observed_rate_below_admitted_reference"].includes(claim.semanticCode)
    || JSON.stringify(claim.subject) !== JSON.stringify(input.observedCanonicalRef)) return finish("refused", "claim_not_reference_comparison");
  if (resolution.status === "conflict") return finish("conflict", "reference_conflict");
  if (resolution.reasonCode === "period_not_covered" || resolution.reasonCode === "publication_after_period_start") return finish("refused", "reference_period_not_covered");
  if (resolution.status !== "matched") return finish("unknown", "reference_missing");
  if (input.observedCanonicalRef.kind !== "fact" || input.observedCanonicalRef.path !== "financialFacts.processorStatedRate") return finish("unknown", "observed_rate_unavailable");
  const fact = canonicalFactAt(input.analysis, input.observedCanonicalRef.path);
  if (fact.status !== "selected" || typeof fact.value !== "string" || !decimal(fact.value)) return finish("unknown", "observed_rate_unavailable");
  const assertion = input.snapshot.assertions.find((item) => item.assertionId === resolution.selectedAssertions[0]?.assertionId && item.version === resolution.selectedAssertions[0]?.version);
  if (assertion?.value.kind !== "rate") return finish("refused", "reference_not_rate", fact.value);
  const observedRate = fact.value;
  const referenceRate = assertion.value.decimal;
  const digits = Math.max(...[observedRate, referenceRate].map((item) => item.split(".")[1]?.length ?? 0));
  const difference = scaled(observedRate, digits) - scaled(referenceRate, digits);
  const status = difference > 0n ? "above_reference" : difference < 0n ? "below_reference" : "equal_within_tolerance";
  return finish(status, "comparison_complete", observedRate, referenceRate, formatted(difference, digits));
}
