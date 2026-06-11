import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import {
  analyzeAzureLayoutFromFile,
  getAzureDocumentIntelligenceConfigFromEnv,
  type AzureLayoutDocument,
} from "../src/azureDocumentIntelligence.js";
import { parsePdf } from "../src/parser.js";

type BakeoffRow = {
  fileName: string;
  pdfjs?: {
    mode: string;
    qualityScore: number;
    lineCount: number;
    amountTokenCount: number;
  };
  azure?: {
    pageCount: number;
    lineCount: number;
    wordCount: number;
    tableCount: number;
    tableCellCount: number;
    amountTokenCount: number;
    tablePreviews: string[];
  };
  pdfjsError?: string;
  azureError?: string;
};

const DEFAULT_FILES = [
  "test/fixtures/pdfs/fiserv_PAYSAFE_Febr_2024.pdf",
  "test/fixtures/pdfs/fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  "test/fixtures/pdfs/fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf",
  "test/fixtures/pdfs/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
  "test/fixtures/pdfs/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
  "test/fixtures/pdfs/SAMPLE_MERCHANT4_CLOVER.pdf",
  "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
];

const config = getAzureDocumentIntelligenceConfigFromEnv();
if (!config) {
  console.error(
    [
      "Azure Document Intelligence is not configured.",
      "Add AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY to .env, then rerun this command.",
    ].join(" "),
  );
  process.exitCode = 1;
} else {
  const inputFiles = await resolveInputFiles(process.argv.slice(2));
  const rows: BakeoffRow[] = [];

  for (const filePath of inputFiles) {
    const fileName = path.relative(process.cwd(), filePath);
    const row: BakeoffRow = { fileName };

    try {
      const pdfjs = await parsePdf(filePath);
      row.pdfjs = {
        mode: pdfjs.extraction.mode,
        qualityScore: Number(pdfjs.extraction.qualityScore.toFixed(2)),
        lineCount: pdfjs.extraction.lineCount,
        amountTokenCount: pdfjs.extraction.amountTokenCount,
      };
    } catch (error) {
      row.pdfjsError = error instanceof Error ? error.message : String(error);
    }

    try {
      const azure = await analyzeAzureLayoutFromFile(filePath, config);
      row.azure = summarizeAzure(azure);
    } catch (error) {
      row.azureError = error instanceof Error ? error.message : String(error);
    }

    rows.push(row);
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: "Azure output is extraction evidence only. It is not financial truth and does not alter parser decisions.",
        fileCount: rows.length,
        rows,
      },
      null,
      2,
    ),
  );
}

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
      // Missing optional fixture; skip it so the default command works across machines.
    }
  }

  if (files.length === 0) {
    throw new Error("No PDF files found. Pass one or more PDF paths to compare.");
  }

  return files;
}

function summarizeAzure(azure: AzureLayoutDocument): BakeoffRow["azure"] {
  return {
    pageCount: azure.metrics.pageCount,
    lineCount: azure.metrics.lineCount,
    wordCount: azure.metrics.wordCount,
    tableCount: azure.metrics.tableCount,
    tableCellCount: azure.metrics.tableCellCount,
    amountTokenCount: azure.metrics.amountTokenCount,
    tablePreviews: azure.tables.slice(0, 3).map((table) => previewTable(table.cells)),
  };
}

function previewTable(cells: AzureLayoutDocument["tables"][number]["cells"]): string {
  return cells
    .slice(0, 8)
    .map((cell) => `[${cell.rowIndex},${cell.columnIndex}] ${cell.content}`)
    .join(" | ")
    .slice(0, 500);
}
