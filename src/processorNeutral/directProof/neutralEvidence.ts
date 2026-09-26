import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ParsedDocument } from "../../parser.js";
import { normalizeEvidenceText, observeParsedDocumentEvidence } from "../shadow.js";
import type { EvidencePacket } from "./neutralContracts.js";

const require = createRequire(import.meta.url);
const PDFJS_VERSION = String(require("pdfjs-dist/package.json").version);
const CSV_VERSION = String(JSON.parse(readFileSync(path.resolve(
  path.dirname(require.resolve("csv-parse/sync")), "../../package.json"), "utf8")).version);
const PDFJS_STANDARD_FONT_DATA_URL = `${path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts")}/`;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function packetFromParsedDocument(document: ParsedDocument, sourceSha256: string,
  sourceKind: EvidencePacket["sourceKind"], byteLength: number | null,
  tokens: EvidencePacket["tokens"] = []): EvidencePacket {
  if (!/^[a-f0-9]{64}$/.test(sourceSha256)) throw new Error("EVIDENCE_SOURCE_SHA_REQUIRED");
  const integrity = document.suppliedDocumentIntegrity;
  return { version: "family_neutral_evidence_v1", sourceSha256, sourceKind, byteLength,
    pageInventory: { enumerated: integrity?.enumeratedPageCount ?? null,
      processed: integrity?.processedPageCount ?? null,
      fatalErrors: integrity?.fatalPageErrorCount ?? null,
      truncated: integrity?.localIngestionTruncated ?? null },
    lanes: [{ id: document.sourceType === "pdf" ? "pdfjs_current" : "csv_current",
      implementation: document.sourceType === "pdf" ? "existing_pdfjs_row_parser" : "existing_csv_parser",
      version: document.sourceType === "pdf" ? PDFJS_VERSION : CSV_VERSION, modality: "direct_text" },
    ...(tokens.length ? [{ id: "pdfjs_text_items_v1", implementation: "pdfjs_getTextContent",
      version: PDFJS_VERSION, modality: "direct_text" as const }] : [])],
    rows: observeParsedDocumentEvidence(document, sourceSha256), tokens,
    // The existing parser does not expose an item-to-row/cell mapping. Do not invent one.
    relations: [] };
}

/** Shadow supplement, run on the same immutable byte snapshot as the existing parser. */
export async function observePdfTextItems(bytes: Uint8Array, sourceSha256: string):
  Promise<EvidencePacket["tokens"]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false,
    useWorkerFetch: false, standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL, verbosity: 0 });
  const document = await task.promise;
  const tokens: Array<EvidencePacket["tokens"][number]> = [];
  try {
    for (let pageIndex = 0; pageIndex < document.numPages; pageIndex++) {
      const page = await document.getPage(pageIndex + 1);
      try {
        const content = await page.getTextContent();
        for (let itemIndex = 0; itemIndex < content.items.length; itemIndex++) {
          const item = content.items[itemIndex]!;
          if (!("str" in item) || !item.str) continue;
          const geometry = [...item.transform.slice(0, 6), item.width, item.height].every(Number.isFinite)
            && item.transform.length >= 6 ? { coordinateSpace: "pdfjs_text_content" as const,
              textTransform: item.transform.slice(0, 6) as [number, number, number, number, number, number],
              width: item.width, height: item.height } : null;
          tokens.push({ id: `item:${digest(`${sourceSha256}:pdfjs_text_items_v1:${pageIndex}:${itemIndex}:${item.str}`).slice(0, 24)}`,
            laneId: "pdfjs_text_items_v1", pageIndex, itemIndex, rawText: item.str,
            normalizedText: normalizeEvidenceText(item.str), geometry,
            transform: "unicode_typography_and_whitespace", conflictRefs: [] });
        }
      } finally { page.cleanup(); }
    }
  } finally { await document.destroy(); }
  return tokens;
}
