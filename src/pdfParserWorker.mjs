import path from "node:path";
import { createRequire } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

const MAX_PAGES = 250;
const MAX_ITEMS_PER_PAGE = 100_000;
const MAX_LINES = 100_000;
const startedAt = Date.now();
const require = createRequire(import.meta.url);

function stage(name, detail = {}) {
  parentPort?.postMessage({ type: "stage", diagnostic: { stage: name, elapsedMs: Date.now() - startedAt, ...detail } });
}

function collapseWhitespace(input) {
  return input.replace(/\s+/g, " ").trim();
}

function collapseRepeatedHalves(input) {
  const normalized = collapseWhitespace(input);
  if (normalized.length < 6) return normalized;
  if (normalized.length % 2 === 0) {
    const half = normalized.length / 2;
    const left = normalized.slice(0, half).trim();
    const right = normalized.slice(half).trim();
    if (left && left === right) return left;
  }
  return normalized.replace(/^(.{3,}?)\1+$/u, "$1");
}

function cleanPdfCellText(input) {
  return collapseRepeatedHalves(input.replace(/\s*[:|]+\s*/g, (match) => (match.includes(":") ? ":" : " ")));
}

function splitPdfLineIntoCells(items) {
  const sorted = [...items].sort((left, right) => left.x - right.x);
  const cells = [];
  let current = null;
  for (const item of sorted) {
    const text = cleanPdfCellText(item.str);
    if (!text) continue;
    if (!current) {
      current = { text, x0: item.x, x1: item.x + item.width };
      continue;
    }
    const gap = item.x - current.x1;
    const threshold = Math.max(12, item.height * 1.2);
    if (gap > threshold) {
      cells.push({ ...current, text: cleanPdfCellText(current.text) });
      current = { text, x0: item.x, x1: item.x + item.width };
      continue;
    }
    current.text = cleanPdfCellText(`${current.text}${gap > 1 ? " " : ""}${text}`);
    current.x1 = Math.max(current.x1, item.x + item.width);
  }
  if (current) cells.push({ ...current, text: cleanPdfCellText(current.text) });
  return cells.filter((cell) => cell.text.length > 0);
}

function groupPdfItemsIntoLines(items, pageNumber) {
  const buckets = new Map();
  for (const item of items) {
    const bucketY = Math.round(item.y * 2) / 2;
    let existingKey = null;
    for (const key of buckets.keys()) {
      if (Math.abs(key - bucketY) <= 1.5) {
        existingKey = key;
        break;
      }
    }
    const targetKey = existingKey ?? bucketY;
    const current = buckets.get(targetKey) ?? [];
    current.push(item);
    buckets.set(targetKey, current);
  }
  return [...buckets.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([y, group]) => {
      const cells = splitPdfLineIntoCells(group);
      return { page: pageNumber, y, cells, text: collapseWhitespace(cells.map((cell) => cell.text).join(" | ")) };
    })
    .filter((line) => line.text.length > 0);
}

async function run() {
  const globalScope = globalThis;
  globalScope.DOMMatrix ??= class DOMMatrix { a = 1; b = 0; c = 0; d = 1; e = 0; f = 0; };
  globalScope.ImageData ??= class ImageData {};
  globalScope.Path2D ??= class Path2D {};

  stage("module_loading");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  stage("module_loaded");
  const standardFontDataUrl = `${path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts")}/`;
  const bytes = workerData?.bytes;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw Object.assign(new Error("invalid bytes"), { code: "pdf_bytes_invalid" });

  stage("document_loading");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useWorkerFetch: false,
    standardFontDataUrl,
    verbosity: pdfjs.VerbosityLevel?.ERRORS ?? 0,
  });
  let document = null;
  const lines = [];
  try {
    document = await loadingTask.promise;
    if (!Number.isInteger(document.numPages) || document.numPages <= 0 || document.numPages > MAX_PAGES) {
      throw Object.assign(new Error("page limit"), { code: "pdf_page_limit_exceeded" });
    }
    stage("document_loaded", { pageCount: document.numPages });
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      stage("page_acquisition_started", { pageNumber });
      const page = await document.getPage(pageNumber);
      stage("page_acquired", { pageNumber });
      try {
        stage("text_content_started", { pageNumber });
        const textContent = await page.getTextContent();
        if (!Array.isArray(textContent.items) || textContent.items.length > MAX_ITEMS_PER_PAGE) {
          throw Object.assign(new Error("item limit"), { code: "pdf_item_limit_exceeded" });
        }
        stage("text_content_completed", { pageNumber, itemCount: textContent.items.length });
        const items = textContent.items
          .filter((item) => item && typeof item.str === "string" && Array.isArray(item.transform))
          .map((item) => ({
            str: item.str,
            x: item.transform[4] ?? 0,
            y: item.transform[5] ?? 0,
            width: item.width ?? 0,
            height: item.height ?? 0,
          }))
          .filter((item) => item.str.length > 0);
        const pageLines = groupPdfItemsIntoLines(items, pageNumber);
        lines.push(...pageLines);
        if (lines.length > MAX_LINES) throw Object.assign(new Error("line limit"), { code: "pdf_line_limit_exceeded" });
        stage("page_completed", { pageNumber, lineCount: pageLines.length });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    stage("document_destroy_started");
    if (document) await document.destroy();
    else await loadingTask.destroy();
    stage("document_destroy_completed");
  }
  parentPort?.postMessage({ type: "result", lines });
}

run().catch((error) => {
  const code = typeof error?.code === "string" && /^[a-z0-9_]{1,80}$/i.test(error.code) ? error.code : "pdf_parse_failed";
  parentPort?.postMessage({ type: "error", code });
});
