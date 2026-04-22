import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const uploadDir = path.join(cwd, "data", "uploads");
const parserModule = await import(path.join(cwd, "dist", "parser.js"));
const analyzerModule = await import(path.join(cwd, "dist", "analyzer.js"));
const twoBucketModule = await import(path.join(cwd, "dist", "twoBucketAnalysis.js"));

const { parsePdf } = parserModule;
const { analyzeDocument } = analyzerModule;
const { analyzeTwoBucketStatement } = twoBucketModule;

const files = (await fs.readdir(uploadDir))
  .filter((name) => name.toLowerCase().endsWith(".pdf"))
  .sort();

const rows = [];
for (const name of files) {
  const filePath = path.join(uploadDir, name);
  try {
    const parsed = await parsePdf(filePath);
    const summary = analyzeDocument(parsed, "other");
    const twoBucket = analyzeTwoBucketStatement(parsed, summary);
    rows.push({
      name,
      extractionMode: parsed.extraction.mode,
      extractionQualityScore: Number(parsed.extraction.qualityScore.toFixed(2)),
      lineCount: parsed.extraction.lineCount,
      amountTokenCount: parsed.extraction.amountTokenCount,
      totalVolume: summary.totalVolume,
      totalFees: summary.totalFees,
      effectiveRate: summary.effectiveRate,
      confidence: summary.confidence,
      twoBucketAvailable: twoBucket.available,
      twoBucketTotalFees: twoBucket.totalFees,
      twoBucketReason: twoBucket.reason,
      dataQuality: summary.dataQuality.map((item) => `${item.level}: ${item.message}`).slice(0, 3),
    });
  } catch (error) {
    rows.push({
      name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const modeCounts = rows.reduce(
  (acc, row) => {
    if (typeof row.extractionMode === "string") {
      acc[row.extractionMode] = (acc[row.extractionMode] ?? 0) + 1;
    } else if (row.error) {
      acc.error = (acc.error ?? 0) + 1;
    }
    return acc;
  },
  /** @type {Record<string, number>} */ ({}),
);

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), fileCount: rows.length, modeCounts, rows }, null, 2));
