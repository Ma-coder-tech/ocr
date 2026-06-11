import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { analyzeAzureLayoutFromFile, getAzureDocumentIntelligenceConfigFromEnv } from "../src/azureDocumentIntelligence.js";
import { documentIrFromAzureLayout } from "../src/documentIrFromAzure.js";
import { documentIrFromPdfjsParsedDocument } from "../src/documentIrFromPdfjs.js";
import {
  assessFiservFirstDataFamily,
  attachFiservDocumentSections,
} from "../src/fiservDocumentSections.js";
import { mergeDocumentIr } from "../src/mergeDocumentIr.js";
import { parsePdf } from "../src/parser.js";

const DEFAULT_FILES = [
  "test/fixtures/pdfs/fiserv_PAYSAFE_Febr_2024.pdf",
  "test/fixtures/pdfs/fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  "test/fixtures/pdfs/fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf",
  "test/fixtures/pdfs/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
  "test/fixtures/pdfs/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
  "test/fixtures/pdfs/SAMPLE_MERCHANT4_CLOVER.pdf",
  "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
];

const azureConfig = getAzureDocumentIntelligenceConfigFromEnv();
const files = await resolveInputFiles(process.argv.slice(2));
const rows = [];

for (const filePath of files) {
  const fileName = path.relative(process.cwd(), filePath);
  const sourceIrs = [];
  const errors: string[] = [];

  try {
    const parsed = await parsePdf(filePath);
    sourceIrs.push(documentIrFromPdfjsParsedDocument(parsed, { sourceFileName: fileName }));
  } catch (error) {
    errors.push(`pdfjs: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (azureConfig) {
    try {
      const azure = await analyzeAzureLayoutFromFile(filePath, azureConfig);
      sourceIrs.push(documentIrFromAzureLayout(azure, { sourceFileName: fileName }));
    } catch (error) {
      errors.push(`azure: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (sourceIrs.length === 0) {
    rows.push({ fileName, errors });
    continue;
  }

  const merged = attachFiservDocumentSections(mergeDocumentIr(sourceIrs, { sourceFileName: fileName }));
  const family = assessFiservFirstDataFamily(merged);

  rows.push({
    fileName,
    extractionSources: merged.extractionSources,
    family,
    quality: {
      bySource: merged.quality.bySource.map((quality) => ({
        source: quality.source,
        pages: quality.pageCount,
        lines: quality.lineCount,
        words: quality.wordCount,
        tables: quality.tableCount,
        cells: quality.tableCellCount,
        amounts: quality.amountTokenCount,
      })),
      merged: {
        pages: merged.quality.merged.pageCount,
        lines: merged.quality.merged.lineCount,
        words: merged.quality.merged.wordCount,
        tables: merged.quality.merged.tableCount,
        cells: merged.quality.merged.tableCellCount,
        amounts: merged.quality.merged.amountTokenCount,
      },
    },
    sections: merged.sections.map((section) => ({
      type: section.type,
      family: section.family,
      familySectionType: section.familySectionType,
      label: section.label,
      page: section.pageNumber,
      confidence: Number(section.confidence.toFixed(2)),
      tables: section.tableIds.length,
      method: section.detectionMethod,
    })),
    errors,
  });
}

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: "DocumentIR is extraction evidence. This bakeoff currently attaches Fiserv/First Data sections and does not alter financial parser decisions yet.",
      azureConfigured: Boolean(azureConfig),
      fileCount: rows.length,
      rows,
    },
    null,
    2,
  ),
);

async function resolveInputFiles(args: string[]): Promise<string[]> {
  const candidates = args.length > 0 ? args : DEFAULT_FILES;
  const files: string[] = [];
  for (const candidate of candidates) {
    const resolved = path.resolve(process.cwd(), candidate);
    try {
      const stat = await fs.stat(resolved);
      if (stat.isFile() && resolved.toLowerCase().endsWith(".pdf")) {
        files.push(resolved);
      }
    } catch {
      // Optional fixtures can be absent across machines.
    }
  }
  if (files.length === 0) {
    throw new Error("No PDF files found. Pass one or more PDF paths to inspect.");
  }
  return files;
}
