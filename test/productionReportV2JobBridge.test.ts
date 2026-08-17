import { describe, expect, it, vi } from "vitest";
import { buildProductionReportV2ForJob, productionReportV2Enabled } from "../src/productionReportV2JobBridge.js";
import type { ProductionReportProjection } from "../src/canonical/productionReportProjectionTypes.js";

const unableProjection: ProductionReportProjection = {
  schemaVersion: "ratereveal_production_report_v2",
  experience: "unable_to_complete",
  header: { title: "Your RateReveal statement review", merchantName: null, processor: null, statementPeriod: null, statementScope: "One statement analyzed." },
  recovery: { title: "We couldn't complete this statement review", reasonCode: "review_could_not_be_completed", explanation: "Try another statement.", nextSteps: ["Upload another statement."] },
  report: null,
};

const input = {
  jobId: "job-transport-test",
  document: { pages: [] },
  businessType: "retail" as const,
  legacySummary: {},
};

describe("production report V2 job bridge", () => {
  it("is fail-closed and disabled unless explicitly enabled", async () => {
    const build = vi.fn();
    expect(productionReportV2Enabled({})).toBe(false);
    expect(await buildProductionReportV2ForJob({ ...input, env: {}, build })).toBeNull();
    expect(build).not.toHaveBeenCalled();
  });

  it("projects once through the complete Package 3 runtime without forcing intelligence off", async () => {
    const build = vi.fn(async () => ({ projection: unableProjection }));
    const projection = await buildProductionReportV2ForJob({ ...input, env: { RATEREVEAL_REPORT_V2_ENABLED: "true" }, build });
    expect(projection).toBe(unableProjection);
    expect(build).toHaveBeenCalledTimes(1);
    const runtimeInput = build.mock.calls[0]![0];
    expect(runtimeInput.runtimeDocumentRef).toBe("job_job-transport-test");
    expect(runtimeInput).not.toHaveProperty("wholeStatementFeeIntelligence");
    expect(runtimeInput).not.toHaveProperty("merchantLanguageInterpretation");
  });

  it("fails safely without replacing existing report paths when projection fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const projection = await buildProductionReportV2ForJob({
      ...input,
      env: { RATEREVEAL_REPORT_V2_ENABLED: "true" },
      build: async () => { throw new Error("synthetic projection failure"); },
    });
    expect(projection).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("production-report-v2-unavailable"), "synthetic projection failure");
    errorSpy.mockRestore();
  });
});
