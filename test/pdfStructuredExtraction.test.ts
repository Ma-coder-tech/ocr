import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analyzer.js";
import { evaluateChecklistReport } from "../src/checklistEngine.js";
import { parsePdf } from "../src/parser.js";

const PDF_FIXTURE_DIR = path.resolve(process.cwd(), "test", "fixtures", "pdfs");
const MISSING_PDF_FIXTURE_MESSAGE = "PDF fixture not present — copy files into test/fixtures/pdfs/ to run this test";
const CLOVER_PDF = path.resolve(PDF_FIXTURE_DIR, "SAMPLE_MERCHANT4_CLOVER.pdf");
const CLOVER_JUNE_PROCESSING_PDF = path.resolve(PDF_FIXTURE_DIR, "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf");
const BLOOM_PDF = path.resolve(PDF_FIXTURE_DIR, "SAMPLE_MERCHANT_2Statement_Bloom-To-Beauty-By-Maria-Jan-24.pdf");
const SCANNED_PDF = path.resolve(PDF_FIXTURE_DIR, "110012-Arre_t_n_05-CJ-CM_Dos_2022-20_QUENUM_C_MEGNIGBETO.pdf");

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const hasCloverPdf = await fileExists(CLOVER_PDF);
const hasCloverJuneProcessingPdf = await fileExists(CLOVER_JUNE_PROCESSING_PDF);
const hasBloomPdf = await fileExists(BLOOM_PDF);
const hasScannedPdf = await fileExists(SCANNED_PDF);

describe("pdf structured extraction", () => {
  const cloverTest = hasCloverPdf ? it : it.skip;
  cloverTest(
    hasCloverPdf
      ? "recovers Clover statement totals from layout-aware parsing"
      : `recovers Clover statement totals from layout-aware parsing (${MISSING_PDF_FIXTURE_MESSAGE})`,
    async () => {
      const parsed = await parsePdf(CLOVER_PDF);
      const summary = analyzeDocument(parsed, "other");

      expect(parsed.extraction.mode).toBe("structured");
      expect(summary.totalVolume).toBe(52460.55);
      expect(summary.totalFees).toBe(1312.55);
      expect(summary.effectiveRate).toBe(2.5);
      expect(summary.processorName).toBe("Fiserv / First Data (Interchange-Plus)");

      const checklist = await evaluateChecklistReport(parsed, summary);
      expect(checklist.processorDetection.detectedProcessorName).toBe(summary.processorName);
      expect(checklist.processorSpecific.processorName).toBe(summary.processorName);
    },
  );

  const cloverJuneProcessingTest = hasCloverJuneProcessingPdf ? it : it.skip;
  cloverJuneProcessingTest(
    hasCloverJuneProcessingPdf
      ? "keeps processor identity aligned when detection relies on checklist aliases"
      : `keeps processor identity aligned when detection relies on checklist aliases (${MISSING_PDF_FIXTURE_MESSAGE})`,
    async () => {
      const parsed = await parsePdf(CLOVER_JUNE_PROCESSING_PDF);
      const summary = analyzeDocument(parsed, "other");
      const checklist = await evaluateChecklistReport(parsed, summary);

      expect(summary.processorName).toBe("Fiserv / First Data (Interchange-Plus)");
      expect(checklist.processorDetection.detectedProcessorName).toBe(summary.processorName);
      expect(checklist.processorSpecific.processorName).toBe(summary.processorName);
    },
  );

  const bloomTest = hasBloomPdf ? it : it.skip;
  bloomTest(
    hasBloomPdf
      ? "prefers total fees due over subtotal lines on the Bloom sample"
      : `prefers total fees due over subtotal lines on the Bloom sample (${MISSING_PDF_FIXTURE_MESSAGE})`,
    async () => {
      const parsed = await parsePdf(BLOOM_PDF);
      const summary = analyzeDocument(parsed, "other");

      expect(parsed.extraction.mode).toBe("structured");
      expect(summary.totalVolume).toBe(2222);
      expect(summary.totalFees).toBe(82.62);
      expect(summary.effectiveRate).toBe(3.72);
    },
  );

  const scannedTest = hasScannedPdf ? it : it.skip;
  scannedTest(
    hasScannedPdf
      ? "keeps scanned PDFs unusable instead of inventing structure"
      : `keeps scanned PDFs unusable instead of inventing structure (${MISSING_PDF_FIXTURE_MESSAGE})`,
    async () => {
      const parsed = await parsePdf(SCANNED_PDF);
      const summary = analyzeDocument(parsed, "other");

      expect(parsed.extraction.mode).toBe("unusable");
      expect(summary.totalVolume).toBe(0);
      expect(summary.totalFees).toBe(0);
    },
  );
});
