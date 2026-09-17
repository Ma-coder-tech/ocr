import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisSummary } from "../src/types.js";

const maybeRunAiRefinement = vi.hoisted(() => vi.fn(async (summary: AnalysisSummary) => summary));

vi.mock("../src/aiFallback.js", () => ({ maybeRunAiRefinement }));

describe("worker legacy AI fallback containment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("returns supported-Fiserv summaries before importing or dispatching aiFallback", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubEnv("FEECLEAR_DB_PATH", ":memory:");
    const { runAiRefinement } = await import("../src/worker.js");
    const summary = {
      parserSource: {
        driverId: "fiserv_first_data_processor_statement",
        driverName: "test",
        processorFamily: "Fiserv",
        statementFamily: "test",
      },
    } as AnalysisSummary;

    await expect(runAiRefinement(summary)).resolves.toBe(summary);
    expect(maybeRunAiRefinement).not.toHaveBeenCalled();
  });
});
