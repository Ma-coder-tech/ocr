import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Package 3 to Package 4 transport boundary", () => {
  it("exposes the persisted projection only behind the backend V2 feature gate", () => {
    const server = source("src/server.ts");
    expect(server).toContain('process.env.RATEREVEAL_REPORT_V2_ENABLED === "true"');
    expect(server.match(/productionReportV2: reportV2Enabled \? job\.productionReportV2 \?\? null : null/g)).toHaveLength(2);
  });

  it("persists one projection and does not also run canonical shadow analysis", () => {
    const worker = source("src/worker.ts");
    expect(worker).toMatch(/if \(productionReportV2\) \{[\s\S]*updateJob\(jobId, \{ productionReportV2 \}[\s\S]*\} else \{[\s\S]*maybeRunCanonicalRuntimeShadow/);
  });

  it("keeps React on the production report DTO side of the customer meaning boundary", () => {
    const app = source("web/src/App.tsx");
    const screen = source("web/src/report-v2/ReportV2Screen.tsx");
    const gate = source("web/src/report-v2/ReportV2Gate.tsx");
    expect(app).toContain("<ReportV2Gate");
    expect(gate).toContain("guardProductionReportV2");
    for (const forbidden of ["CanonicalStatementAnalysis", "MerchantAttention", "benchmarkRegistry", "opportunityComponents", "evidenceRegistry"]) {
      expect(`${app}\n${screen}\n${gate}`).not.toContain(forbidden);
    }
  });
});
