import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, type WorkerOptions } from "node:worker_threads";

export type PdfParserStageDiagnostic = {
  stage:
    | "module_loading"
    | "module_loaded"
    | "document_loading"
    | "document_loaded"
    | "page_acquisition_started"
    | "page_acquired"
    | "text_content_started"
    | "text_content_completed"
    | "page_completed"
    | "document_destroy_started"
    | "document_destroy_completed";
  elapsedMs: number;
  pageNumber?: number;
  pageCount?: number;
  itemCount?: number;
  lineCount?: number;
};

export type IsolatedPdfLine = {
  page: number;
  y: number;
  cells: Array<{ text: string; x0: number; x1: number }>;
  text: string;
};

export type PdfParserIsolationOptions = {
  timeoutMs?: number;
  onStage?: (diagnostic: PdfParserStageDiagnostic) => void;
  workerFactory?: () => Worker;
};

type WorkerMessage =
  | { type: "stage"; diagnostic: PdfParserStageDiagnostic }
  | { type: "result"; lines: unknown }
  | { type: "error"; code: string };

export class PdfParserTimeoutError extends Error {
  readonly code = "pdf_parse_timeout";

  constructor(timeoutMs: number) {
    super(`PDF parsing timed out after ${timeoutMs}ms. The file may be corrupted or too complex to process.`);
    this.name = "PdfParserTimeoutError";
  }
}

export async function runIsolatedPdfParser(
  bytes: Uint8Array,
  options: PdfParserIsolationOptions = {},
): Promise<IsolatedPdfLine[]> {
  const timeoutMs = boundedTimeout(options.timeoutMs ?? 60_000);
  const worker = options.workerFactory?.() ?? createProductionWorker(bytes);
  worker.stdout?.resume();
  worker.stderr?.resume();

  return await new Promise<IsolatedPdfLine[]>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      worker.removeAllListeners();
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      void worker.terminate().finally(() => reject(new PdfParserTimeoutError(timeoutMs)));
    }, timeoutMs);

    worker.on("message", (message: WorkerMessage) => {
      if (message?.type === "stage") {
        if (validDiagnostic(message.diagnostic)) options.onStage?.(message.diagnostic);
        return;
      }
      if (message?.type === "result") {
        try {
          const lines = validateLines(message.lines);
          finish(() => resolve(lines));
        } catch {
          finish(() => reject(new Error("PDF parsing failed validation in the isolated runtime.")));
        }
        return;
      }
      if (message?.type === "error") {
        finish(() => reject(new Error(`PDF parsing failed in the isolated runtime (${safeCode(message.code)}).`)));
      }
    });
    worker.once("error", () => finish(() => reject(new Error("PDF parsing failed in the isolated runtime."))));
    worker.once("exit", (code) => {
      if (!settled) finish(() => reject(new Error(`PDF parsing isolated runtime exited before completion (${code}).`)));
    });
  });
}

function createProductionWorker(bytes: Uint8Array): Worker {
  const workerPath = resolveWorkerPath();
  const workerOptions: WorkerOptions = {
    workerData: { bytes: Buffer.from(bytes) },
    stdout: true,
    stderr: true,
  };
  return new Worker(pathToFileURL(workerPath), workerOptions);
}

export function resolvePdfParserWorkerPathForDeployment(): string {
  return resolveWorkerPath();
}

function resolveWorkerPath(): string {
  const candidates = [
    path.join(process.cwd(), "src", "pdfParserWorker.mjs"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "pdfParserWorker.mjs"),
  ];
  const workerPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!workerPath) throw new Error("PDF parser isolated runtime is unavailable.");
  return workerPath;
}

function boundedTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 60_000;
  return Math.max(10, Math.min(120_000, Math.floor(value)));
}

function validDiagnostic(value: unknown): value is PdfParserStageDiagnostic {
  if (!value || typeof value !== "object") return false;
  const diagnostic = value as Record<string, unknown>;
  return typeof diagnostic.stage === "string" && typeof diagnostic.elapsedMs === "number";
}

function validateLines(value: unknown): IsolatedPdfLine[] {
  if (!Array.isArray(value) || value.length > 100_000) throw new Error("invalid line collection");
  return value.map((line) => {
    if (!line || typeof line !== "object") throw new Error("invalid line");
    const candidate = line as Record<string, unknown>;
    if (
      !Number.isInteger(candidate.page) || Number(candidate.page) <= 0 ||
      typeof candidate.y !== "number" ||
      typeof candidate.text !== "string" || candidate.text.length > 20_000 ||
      !Array.isArray(candidate.cells) || candidate.cells.length > 10_000
    ) throw new Error("invalid line shape");
    const cells = candidate.cells.map((cell) => {
      if (!cell || typeof cell !== "object") throw new Error("invalid cell");
      const item = cell as Record<string, unknown>;
      if (typeof item.text !== "string" || item.text.length > 20_000 || typeof item.x0 !== "number" || typeof item.x1 !== "number") {
        throw new Error("invalid cell shape");
      }
      return { text: item.text, x0: item.x0, x1: item.x1 };
    });
    return { page: Number(candidate.page), y: candidate.y, text: candidate.text, cells };
  });
}

function safeCode(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_]{1,80}$/i.test(value) ? value : "pdf_parse_failed";
}
