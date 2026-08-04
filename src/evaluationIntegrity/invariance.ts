import type { CanonicalStatementAnalysis } from "../canonical/types.js";
import { sha256Canonical } from "./stable.js";
import { FINANCIAL_INVARIANCE_PROJECTION_VERSION, type FinancialInvarianceResult, type PackageName } from "./types.js";

export type PackagesBEProjectionInput = Pick<
  CanonicalStatementAnalysis,
  "financialFacts" | "feeLedger" | "feeOwnershipActionability" | "opportunityEngine"
> & Partial<Pick<CanonicalStatementAnalysis, "calculations">>;
type PackageRoot = "financialFacts" | "feeLedger" | "feeOwnershipActionability" | "opportunityEngine";

export const packageFinancialProjectionDefinitions: ReadonlyArray<{
  package: PackageName;
  root: PackageRoot;
  projectionVersion: string;
}> = [
  { package: "package_b", root: "financialFacts", projectionVersion: "package_b_financial_facts_projection_v2" },
  { package: "package_c", root: "feeLedger", projectionVersion: "package_c_fee_ledger_projection_v2" },
  { package: "package_d", root: "feeOwnershipActionability", projectionVersion: "package_d_ownership_actionability_projection_v2" },
  { package: "package_e", root: "opportunityEngine", projectionVersion: "package_e_opportunity_projection_v2" },
];

export const excludedFinancialProjectionKeys = new Set([
  "createdAt",
  "updatedAt",
  "timestamp",
  "timestamps",
  "requestId",
  "requestIds",
  "executionRef",
  "provider",
  "providerRoute",
  "model",
  "runtimeMetadata",
  "reviewedAt",
  "documentId",
  "pageNumber",
  "lineId",
  "rowIndex",
  "normalizedSourceText",
]);

export function provePackagesBEFinancialInvariance(before: PackagesBEProjectionInput, after: PackagesBEProjectionInput): FinancialInvarianceResult {
  const packages = packageFinancialProjectionDefinitions.map(({ package: packageName, root, projectionVersion }) => {
    const beforeProjection = projectPackage(before, packageName, root);
    const afterProjection = projectPackage(after, packageName, root);
    const mismatchPaths = diffPaths(beforeProjection, afterProjection, packageName);
    return {
      package: packageName,
      projectionVersion,
      beforeHash: sha256Canonical(beforeProjection),
      afterHash: sha256Canonical(afterProjection),
      invariant: mismatchPaths.length === 0,
      mismatchPaths,
    };
  });
  const beforeCombinedHash = sha256Canonical(Object.fromEntries(packageFinancialProjectionDefinitions.map(({ package: name, root, projectionVersion }) => [name, {
    projectionVersion,
    value: projectPackage(before, name, root),
  }])));
  const afterCombinedHash = sha256Canonical(Object.fromEntries(packageFinancialProjectionDefinitions.map(({ package: name, root, projectionVersion }) => [name, {
    projectionVersion,
    value: projectPackage(after, name, root),
  }])));
  const mismatchPaths = packages.flatMap((item) => item.mismatchPaths);
  return {
    type: "packages_b_e_financial_invariance_v1",
    projectionVersion: FINANCIAL_INVARIANCE_PROJECTION_VERSION,
    packages,
    beforeCombinedHash,
    afterCombinedHash,
    invariant: mismatchPaths.length === 0,
    mismatchPaths,
    liveRunBlocked: mismatchPaths.length > 0,
  };
}

function projectPackage(input: PackagesBEProjectionInput, packageName: PackageName, root: PackageRoot): unknown {
  const projectedRoot = financialCanonicalProjection(input[root]);
  if (packageName !== "package_e") return projectedRoot;
  return {
    ...(projectedRoot as Record<string, unknown>),
    canonicalCalculationRecords: financialCanonicalProjection(input.calculations ?? []),
  };
}

export function financialCanonicalProjection(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(financialCanonicalProjection);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key, item]) => !excludedFinancialProjectionKeys.has(key) && item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, financialCanonicalProjection(item)]),
    );
  }
  return value;
}

function diffPaths(before: unknown, after: unknown, path: string): string[] {
  if (Object.is(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const paths: string[] = [];
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      paths.push(...diffPaths(before[index], after[index], `${path}[${index}]`));
    }
    return paths;
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key) => diffPaths(before[key], after[key], `${path}.${key}`));
  }
  return [path];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
