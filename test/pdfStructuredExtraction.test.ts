import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analyzer.js";
import { parsePdf } from "../src/parser.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "data", "uploads");

describe("pdf structured extraction", () => {
  it("recovers Clover statement totals from layout-aware parsing", async () => {
    const parsed = await parsePdf(path.join(UPLOAD_DIR, "1776726662317-SAMPLE_MERCHANT4_CLOVER.pdf"));
    const summary = analyzeDocument(parsed, "other");

    expect(parsed.extraction.mode).toBe("structured");
    expect(summary.totalVolume).toBe(52460.55);
    expect(summary.totalFees).toBe(1312.55);
    expect(summary.effectiveRate).toBe(2.5);
  });

  it("prefers total fees due over subtotal lines on the Bloom sample", async () => {
    const parsed = await parsePdf(path.join(UPLOAD_DIR, "1776725929008-SAMPLE_MERCHANT_2Statement_Bloom-To-Beauty-By-Maria-Jan-24.pdf"));
    const summary = analyzeDocument(parsed, "other");

    expect(parsed.extraction.mode).toBe("structured");
    expect(summary.totalVolume).toBe(2222);
    expect(summary.totalFees).toBe(82.62);
    expect(summary.effectiveRate).toBe(3.72);
  });

  it("keeps scanned PDFs unusable instead of inventing structure", async () => {
    const parsed = await parsePdf(path.join(UPLOAD_DIR, "1776726627359-110012-Arre_t_n_05-CJ-CM_Dos_2022-20_QUENUM_C_MEGNIGBETO.pdf"));
    const summary = analyzeDocument(parsed, "other");

    expect(parsed.extraction.mode).toBe("unusable");
    expect(summary.totalVolume).toBe(0);
    expect(summary.totalFees).toBe(0);
  });
});
