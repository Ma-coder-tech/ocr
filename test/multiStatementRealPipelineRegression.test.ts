import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildComparisonStatementInput } from "../src/multiStatementComparisonInput.js";
import type { AnalysisSummary } from "../src/types.js";

const PEPE_DIR = path.join(process.cwd(), "test", "fixtures", "multi-statement", "nov-dec-2024-real-pipeline");

function summary(name: string): AnalysisSummary {
  return JSON.parse(fs.readFileSync(path.join(PEPE_DIR, `${name}.single-summary.json`), "utf8")) as AnalysisSummary;
}

describe("real multi-statement regression: Pepe's November/December statements", () => {
  it("retains both parser observations but refuses their nonreportable comparison inputs", () => {
    const november = summary("nov_2024_statement");
    const december = summary("dec_2024_statement");

    expect(november.parserDecision?.reportable).toBe(false);
    expect(december.parserDecision?.reportable).toBe(false);
    expect([november.totalVolume, december.totalVolume]).toEqual([53291.02, 56343.39]);

    for (const observation of [november, december]) {
      expect(() => buildComparisonStatementInput(observation, {
        pipelineVersion: "real-pipeline-regression",
      })).toThrow("PARSER_FINANCIAL_OUTPUT_NOT_AUTHORIZED");
    }
  });
});
