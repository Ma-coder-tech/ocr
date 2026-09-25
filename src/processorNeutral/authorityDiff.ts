/** Permanent migration gate: any newly granted output or claim needs explicit review. */
export type AuthorityMatrixCase = {
  file: string;
  activeRuntime: { summary: Record<string, any>; reportV1?: unknown };
  canonicalV1?: { financialFacts: unknown; feeLedger: unknown; customerState: unknown; claimAuthority: unknown };
  canonicalShadow: {
    financial: Record<string, { status: string; value: unknown }>;
    reconciliation: Array<{ identity: string; status: string }>;
    admission: { outputPermissions: Array<{ output: string; state: string }> } | null;
    claimAuthority: { claims: Array<{ claimId: string; claimClass: string; state: string }> };
    report: { permissions: unknown; projectionSha256: string } | null;
  };
  processorNeutralShadow: { outputs: Array<{ outputId: string; state: string; legacyState: string }> };
};

export type AuthorityDifference = {
  file: string;
  surface: "customer" | "customer_report" | "canonical_v1" | "canonical_financial" | "reconciliation" | "claim_authority" |
    "canonical_output" | "report" | "report_permission" | "shadow_output";
  key: string;
  before: unknown;
  after: unknown;
  widening: boolean;
};

const outputRank: Record<string, number> = {
  withheld: 0, denied: 0, downstream_gated: 0, limited: 1, permitted: 2,
};
const claimRank: Record<string, number> = {
  unavailable: 0, unresolved: 0, withheld: 0, candidate: 0,
  limited: 1, supported: 2, permitted: 2, verified: 3, resolved: 3, admitted: 3,
};
const CUSTOMER_CLAIM_FIELDS = [
  "totalVolume", "totalFees", "effectiveRate", "estimatedAnnualSavings",
  "processorName", "executiveSummary", "benchmark", "feeBreakdown", "kpis",
  "parserDecision", "dataQuality",
] as const;

function stable(value: unknown): string { return JSON.stringify(value); }
function add(diffs: AuthorityDifference[], file: string, surface: AuthorityDifference["surface"],
  key: string, before: unknown, after: unknown, widening = false): void {
  if (stable(before) !== stable(after)) diffs.push({ file, surface, key, before, after, widening });
}
function rank(map: Record<string, number>, value: unknown): number {
  return map[String(value)] ?? 0;
}

export function diffAuthorityMatrix(before: readonly AuthorityMatrixCase[], after: readonly AuthorityMatrixCase[]): AuthorityDifference[] {
  const diffs: AuthorityDifference[] = [];
  const nextByFile = new Map(after.map((item) => [item.file, item]));
  for (const prior of before) {
    const next = nextByFile.get(prior.file);
    if (!next) { add(diffs, prior.file, "customer", "fixture_missing", true, false); continue; }
    for (const key of CUSTOMER_CLAIM_FIELDS) {
      add(diffs, prior.file, "customer", key, prior.activeRuntime.summary[key], next.activeRuntime.summary[key],
        key === "estimatedAnnualSavings" && Number(next.activeRuntime.summary[key]) > Number(prior.activeRuntime.summary[key]));
    }
    add(diffs, prior.file, "customer_report", "report_v1", prior.activeRuntime.reportV1, next.activeRuntime.reportV1);
    if (prior.canonicalV1 || next.canonicalV1) {
      for (const key of ["financialFacts", "feeLedger", "customerState", "claimAuthority"] as const) {
        add(diffs, prior.file, "canonical_v1", key, prior.canonicalV1?.[key], next.canonicalV1?.[key]);
      }
    }
    const oldFacts = prior.canonicalShadow.financial;
    const newFacts = next.canonicalShadow.financial;
    for (const key of new Set([...Object.keys(oldFacts), ...Object.keys(newFacts)])) {
      add(diffs, prior.file, "canonical_financial", key, oldFacts[key], newFacts[key],
        oldFacts[key]?.status !== "available" && newFacts[key]?.status === "available");
    }
    const oldRecon = new Map(prior.canonicalShadow.reconciliation.map((item) => [item.identity, item.status]));
    const newRecon = new Map(next.canonicalShadow.reconciliation.map((item) => [item.identity, item.status]));
    for (const key of new Set([...oldRecon.keys(), ...newRecon.keys()])) {
      add(diffs, prior.file, "reconciliation", key, oldRecon.get(key), newRecon.get(key));
    }
    const oldClaims = new Map(prior.canonicalShadow.claimAuthority.claims.map((item) => [item.claimId, item.state]));
    const newClaims = new Map(next.canonicalShadow.claimAuthority.claims.map((item) => [item.claimId, item.state]));
    for (const key of new Set([...oldClaims.keys(), ...newClaims.keys()])) {
      add(diffs, prior.file, "claim_authority", key, oldClaims.get(key), newClaims.get(key),
        rank(claimRank, newClaims.get(key)) > rank(claimRank, oldClaims.get(key))
        || (newClaims.has(key) && newClaims.get(key) !== oldClaims.get(key)
          && !["unavailable", "unresolved", "withheld", "candidate"].includes(newClaims.get(key)!)));
    }
    const oldPerm = new Map(prior.canonicalShadow.admission?.outputPermissions.map((item) => [item.output, item.state]));
    const newPerm = new Map(next.canonicalShadow.admission?.outputPermissions.map((item) => [item.output, item.state]));
    for (const key of new Set([...oldPerm.keys(), ...newPerm.keys()])) {
      add(diffs, prior.file, "canonical_output", key, oldPerm.get(key), newPerm.get(key),
        rank(outputRank, newPerm.get(key)) > rank(outputRank, oldPerm.get(key)));
    }
    add(diffs, prior.file, "report", "projection", prior.canonicalShadow.report, next.canonicalShadow.report);
    const oldReportPermissions = (prior.canonicalShadow.report?.permissions ?? {}) as Record<string, { state?: string }>;
    const newReportPermissions = (next.canonicalShadow.report?.permissions ?? {}) as Record<string, { state?: string }>;
    for (const key of new Set([...Object.keys(oldReportPermissions), ...Object.keys(newReportPermissions)])) {
      const oldState = oldReportPermissions[key]?.state;
      const newState = newReportPermissions[key]?.state;
      add(diffs, prior.file, "report_permission", key, oldState, newState,
        rank(outputRank, newState) > rank(outputRank, oldState));
    }
    const oldShadow = new Map(prior.processorNeutralShadow.outputs.map((item) => [item.outputId, item.state]));
    const newShadow = new Map(next.processorNeutralShadow.outputs.map((item) => [item.outputId, item.state]));
    for (const key of new Set([...oldShadow.keys(), ...newShadow.keys()])) {
      add(diffs, prior.file, "shadow_output", key, oldShadow.get(key), newShadow.get(key),
        rank(outputRank, newShadow.get(key)) > rank(outputRank, oldShadow.get(key)));
    }
  }
  for (const next of after) if (!before.some((item) => item.file === next.file)) {
    add(diffs, next.file, "customer", "fixture_added", false, true);
  }
  return diffs;
}

export function assertNoClaimWidening(diffs: readonly AuthorityDifference[]): void {
  const widened = diffs.filter((difference) => difference.widening);
  if (widened.length) throw new Error(`CLAIM_AUTHORITY_WIDENING: ${widened.map((item) =>
    `${item.file}:${item.surface}:${item.key}`).join(", ")}`);
}
