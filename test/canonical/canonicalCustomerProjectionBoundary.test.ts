import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_CUSTOMER_REPORT_PROTECTED_CONTRACTS,
  CANONICAL_CUSTOMER_REPORT_PROJECTION_READINESS,
  CANONICAL_CUSTOMER_REPORT_PROJECTION_VERSION,
} from "../../src/canonical/customerReportProjectionTypes.js";
import type { CustomerReportDTO } from "../../src/reporting/types.js";
import type { ContractVersion } from "../../src/reporting/v1/types.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const prerequisiteModulePattern = /customerReportProjection(?:Types|Validation)?/;

describe("canonical customer projection prerequisite boundary", () => {
  it("protects only the non-production canonical projection contract", () => {
    const reportV1Contract: ContractVersion = "single_statement_report_v1";
    const olderCustomerReportContract = "legacy_customer_report_dto";
    const olderCustomerReportShape: Pick<CustomerReportDTO, "kind"> = { kind: "single_statement_result" };
    const protectedContracts: readonly string[] = CANONICAL_CUSTOMER_REPORT_PROTECTED_CONTRACTS;

    expect(CANONICAL_CUSTOMER_REPORT_PROJECTION_READINESS).toBe("non_production_not_merchant_ready");
    expect(protectedContracts).toEqual([CANONICAL_CUSTOMER_REPORT_PROJECTION_VERSION]);
    expect(protectedContracts).not.toContain(reportV1Contract);
    expect(protectedContracts).not.toContain(olderCustomerReportContract);
    expect(olderCustomerReportShape.kind).toBe("single_statement_result");
  });

  it("is absent from tracked server, worker, reporting, persistence, and frontend runtime paths", () => {
    const runtimePaths = trackedRuntimePaths();
    const imports = runtimePaths.filter((path) => prerequisiteModulePattern.test(readFileSync(resolve(repositoryRoot, path), "utf8")));

    expect(runtimePaths).toContain("src/server.ts");
    expect(runtimePaths).toContain("src/worker.ts");
    expect(runtimePaths).toContain("src/reporting/index.ts");
    expect(runtimePaths.some((path) => path.startsWith("web/src/"))).toBe(true);
    expect(imports).toEqual([]);
  });

  it("documents Report V1 as a separate runtime path behind its existing feature flag", () => {
    const serverSource = readFileSync(resolve(repositoryRoot, "src/server.ts"), "utf8");
    const frontendSource = readFileSync(resolve(repositoryRoot, "web/src/App.tsx"), "utf8");

    expect(serverSource).toContain('process.env.RATEREVEAL_REPORT_V1_ENABLED === "true"');
    expect(serverSource).toContain("buildSingleStatementReportV1");
    expect(serverSource).toContain("reportV1: reportV1ForJob(job)");
    expect(frontendSource).toContain("guardSingleStatementReportV1");
    expect(frontendSource).toContain("<ReportV1Gate reportV1={job.reportV1}");
  });
});

function trackedRuntimePaths(): string[] {
  return execFileSync("git", ["ls-files", "src", "web/src"], { cwd: repositoryRoot, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter(
      (path) =>
        path === "src/server.ts" ||
        path.endsWith("worker.ts") ||
        path.endsWith("Worker.ts") ||
        path === "src/reporting/index.ts" ||
        /(?:^|\/)(?:store|[A-Za-z]+Store)\.ts$/.test(path) ||
        path.startsWith("web/src/"),
    );
}
