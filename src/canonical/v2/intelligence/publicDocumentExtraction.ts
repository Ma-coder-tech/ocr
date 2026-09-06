import { createHash } from "node:crypto";
import type { DocumentExtractionRequest, DocumentExtractionResponse, ExtractedLocator, IntelligencePorts } from "./intelligenceTypes.js";
import { normalizeAndChunkPublicDocumentText } from "./publicDocumentTextNormalization.js";

export function createPublicDocumentExtractionPort(): NonNullable<IntelligencePorts["extraction"]> {
  return { extract: extractPublicDocument };
}

export async function extractPublicDocument(request: DocumentExtractionRequest): Promise<DocumentExtractionResponse> {
  const fingerprint = createHash("sha256").update(request.content).digest("hex");
  const base = { questionId: request.questionId, candidateId: request.candidateId, documentId: request.documentId, documentFingerprint: fingerprint };
  if (fingerprint !== request.expectedDocumentFingerprint) return { ...base, state: "extraction_failed", text: null,
    locators: [], reasonCodes: ["document_extraction_fingerprint_mismatch"] };
  const mime = request.mimeType.toLowerCase().split(";")[0]!.trim();
  const contentView = Buffer.from(request.content.buffer, request.content.byteOffset, request.content.byteLength);
  if (mime === "application/pdf" && contentView.includes(Buffer.from("/Encrypt"))) {
    return { ...base, state: "encrypted_pdf", text: null, locators: [], reasonCodes: ["document_pdf_encrypted"] };
  }
  try {
    const lines = mime === "application/pdf" ? await extractPdf(request.content)
      : mime === "text/html" || mime === "application/xhtml+xml" ? extractHtml(request.content)
        : mime === "text/plain" ? extractPlainText(request.content) : null;
    if (!lines) return { ...base, state: "unsupported_content_type", text: null, locators: [],
      reasonCodes: ["document_extraction_content_type_unsupported"] };
    const normalized = normalizeLines(lines, mime);
    if (normalized.state === "rejected") return { ...base, state: mime === "application/pdf" ? "malformed_pdf" : "extraction_failed",
      text: null, locators: [], reasonCodes: [normalized.reasonCode] };
    const locators: ExtractedLocator[] = normalized.lines.map((line, index) => ({
      locatorId: `locator-${createHash("sha256").update(`${request.documentId}\0${line.page ?? 0}\0${index + 1}\0${line.text}`).digest("hex").slice(0, 20)}`,
      documentId: request.documentId, documentFingerprint: fingerprint, page: line.page, sectionCode: line.sectionCode,
      lineStart: index + 1, lineEnd: index + 1, text: line.text, textDerivation: line.textDerivation,
    }));
    const completeText = locators.map((line) => line.text).join("\n");
    const outputBytes = Buffer.byteLength(completeText, "utf8")
      + locators.reduce((sum, locator) => sum + Buffer.byteLength(locator.text, "utf8"), 0);
    if (outputBytes > request.maximumOutputBytes) return { ...base, state: "extraction_failed", text: null, locators: [],
      reasonCodes: ["document_extraction_output_oversized_complete_text_required"] };
    return { ...base, state: "retrieved_extracted", text: completeText, locators, reasonCodes: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { ...base, state: /password|encrypted/i.test(message) ? "encrypted_pdf" : mime === "application/pdf" ? "malformed_pdf" : "extraction_failed",
      text: null, locators: [], reasonCodes: [safeExtractionReason(message, mime)] };
  }
}

type PublicLine = { page: number | null; sectionCode: string | null; text: string };

function extractPlainText(content: Uint8Array): PublicLine[] {
  return new TextDecoder("utf-8", { fatal: true }).decode(content).split(/\r?\n/)
    .filter((text) => text.length > 0).map((text) => ({ page: null, sectionCode: null, text }));
}

function extractHtml(content: Uint8Array): PublicLine[] {
  const html = new TextDecoder("utf-8", { fatal: true }).decode(content)
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<(?:nav|header|footer|aside|form|dialog)\b[^>]*>[\s\S]*?<\/(?:nav|header|footer|aside|form|dialog)>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\s*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"");
  return html.split(/\r?\n/).filter((text) => text.trim().length >= 3
      && !/(?:cookie (?:settings|preferences)|privacy choices|all rights reserved|skip to (?:content|navigation)|menu)/i.test(text))
    .map((text, index) => ({ page: null, sectionCode: index === 0 ? "document_heading" : "document_body", text }));
}

async function extractPdf(content: Uint8Array): Promise<PublicLine[]> {
  const globalScope = globalThis as Record<string, unknown>;
  if (!globalScope.DOMMatrix) globalScope.DOMMatrix = class DOMMatrix { a = 1; b = 0; c = 0; d = 1; e = 0; f = 0; };
  if (!globalScope.ImageData) globalScope.ImageData = class ImageData {};
  if (!globalScope.Path2D) globalScope.Path2D = class Path2D {};
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfBytes = Uint8Array.from(content);
  const task = pdfjs.getDocument({ data: pdfBytes, isEvalSupported: false, useWorkerFetch: false });
  const document = await task.promise;
  const lines: PublicLine[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const text = await page.getTextContent();
        const pageText = text.items.map((item: any) => typeof item.str === "string" ? item.str : "").filter(Boolean).join(" ");
        if (pageText) lines.push({ page: pageNumber, sectionCode: "pdf_page", text: pageText });
      } finally { page.cleanup(); }
    }
  } finally {
    await document.destroy();
    // PDF.js may transfer and detach its private copy; the caller still wipes the
    // independently retained retrieval buffer after extraction.
    if (pdfBytes.byteLength > 0) pdfBytes.fill(0);
  }
  return lines;
}

type NormalizedPublicLine = PublicLine & { textDerivation: NonNullable<ExtractedLocator["textDerivation"]> };

function normalizeLines(lines: PublicLine[], mimeType: string): { state: "normalized"; lines: NormalizedPublicLine[] }
  | { state: "rejected"; reasonCode: string } {
  const output: NormalizedPublicLine[] = [];
  for (const [sourceUnitIndex, line] of lines.entries()) {
    const normalized = normalizeAndChunkPublicDocumentText({ text: line.text, mimeType, sourceUnitIndex });
    if (normalized.state === "rejected") {
      if (normalized.reasonCode === "document_text_normalized_empty") continue;
      return normalized;
    }
    output.push(...normalized.chunks.map((chunk) => ({ ...line, text: chunk.text, textDerivation: chunk.derivation })));
  }
  if (output.length === 0) return { state: "rejected", reasonCode: "document_text_normalized_empty" };
  return { state: "normalized", lines: output };
}

function safeExtractionReason(message: string, mimeType: string): string {
  if (/password|encrypted/i.test(message)) return "document_pdf_encrypted";
  if (/encoding|utf-?8|decode/i.test(message)) return "document_text_malformed_unicode";
  return mimeType === "application/pdf" ? "document_pdf_malformed" : "document_extraction_failed";
}
