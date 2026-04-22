import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analyzer.js";
import { parsePdf } from "../src/parser.js";
import { refineTextOnlyPdfSummary } from "../src/pdfHeuristic.js";
import { evaluateChecklistReport } from "../src/checklistEngine.js";
import { analyzeTwoBucketStatement } from "../src/twoBucketAnalysis.js";

type GoldenFixture = {
  id: string;
  sourceFile: string;
  expected: {
    phase: string;
    e001Status: string;
    e003Status: string;
    e004Status: string;
    totalFees: number | null;
    cardBrandTotal: number | null;
    processorOwnedTotal: number | null;
    unknownTotal: number | null;
    cardBrandSharePct: number | null;
    processorOwnedSharePct: number | null;
    coveragePct: number | null;
    reconciliationDeltaUsd: number | null;
  };
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "fixtures", "two-bucket-golden");
const FIXTURE_FILES = [
  "clover_october_2024_pass.json",
  "clover_november_2024_pass.json",
  "bloom_january_2024_warning.json",
  "clover_june_processing_unknown.json",
] as const;
const MISSING_PDF_FIXTURE_MESSAGE = "PDF fixture not present — copy files into test/fixtures/pdfs/ to run this test";

async function loadFixture(fileName: string): Promise<GoldenFixture> {
  const raw = await fs.readFile(path.join(FIXTURE_DIR, fileName), "utf8");
  return JSON.parse(raw) as GoldenFixture;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const FIXTURE_CASES = await Promise.all(
  FIXTURE_FILES.map(async (fileName) => {
    const fixture = await loadFixture(fileName);
    const sourceFile = path.resolve(process.cwd(), fixture.sourceFile);
    return {
      fileName,
      fixture,
      sourceFile,
      exists: await fileExists(sourceFile),
    };
  }),
);

describe("two-bucket golden fixtures", () => {
  for (const { fileName, fixture, sourceFile, exists } of FIXTURE_CASES) {
    const run = exists ? it : it.skip;
    const testName = exists
      ? `matches phase-1 checklist statuses for ${fileName}`
      : `matches phase-1 checklist statuses for ${fileName} (${MISSING_PDF_FIXTURE_MESSAGE})`;

    run(testName, async () => {
      const parsed = await parsePdf(sourceFile);
      const baseSummary = analyzeDocument(parsed, "other");
      const summary = parsed.extraction.mode === "text_only" ? refineTextOnlyPdfSummary(parsed, baseSummary) ?? baseSummary : baseSummary;
      const checklist = await evaluateChecklistReport(parsed, summary);
      const twoBucket = analyzeTwoBucketStatement(parsed, summary);

      const e001 = checklist.universal.results.find((rule) => rule.id === "E001");
      const e003 = checklist.universal.results.find((rule) => rule.id === "E003");
      const e004 = checklist.universal.results.find((rule) => rule.id === "E004");

      expect(e001?.status).toBe(fixture.expected.e001Status);
      expect(e003?.status).toBe(fixture.expected.e003Status);
      expect(e004?.status).toBe(fixture.expected.e004Status);
      expect(twoBucket.totalFees).toBe(fixture.expected.totalFees);
      expect(twoBucket.cardBrandTotal).toBe(fixture.expected.cardBrandTotal);
      expect(twoBucket.processorOwnedTotal).toBe(fixture.expected.processorOwnedTotal);
      expect(twoBucket.unknownTotal).toBe(fixture.expected.unknownTotal);
      expect(twoBucket.cardBrandSharePct).toBe(fixture.expected.cardBrandSharePct);
      expect(twoBucket.processorOwnedSharePct).toBe(fixture.expected.processorOwnedSharePct);
      expect(twoBucket.coveragePct).toBe(fixture.expected.coveragePct);
      expect(twoBucket.reconciliationDeltaUsd).toBe(fixture.expected.reconciliationDeltaUsd);
    });
  }
});
