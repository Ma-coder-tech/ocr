import { createHash } from "node:crypto";

import type { ExtractedLocator } from "./intelligenceTypes.js";

export const PUBLIC_DOCUMENT_TEXT_NORMALIZATION_VERSION = "public_document_text_normalization_v1" as const;
export const PUBLIC_DOCUMENT_LOCATOR_TEXT_DERIVATION_SCHEMA_VERSION =
  "public_document_locator_text_derivation_v1" as const;

const LOCATOR_TEXT_LIMIT = 4_096;
const BIDI_FORMAT_CODE_POINTS = new Set([0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d,
  0x202e, 0x2066, 0x2067, 0x2068, 0x2069]);

export type PublicDocumentTextNormalizationFailure = {
  state: "rejected";
  reasonCode:
    | "document_text_nul_forbidden"
    | "document_text_non_pdf_control_character_forbidden"
    | "document_text_directional_format_character_forbidden"
    | "document_text_malformed_unicode"
    | "document_text_normalized_empty";
};

export type NormalizedPublicDocumentTextChunk = {
  text: string;
  derivation: NonNullable<ExtractedLocator["textDerivation"]>;
};

export type PublicDocumentTextNormalizationSuccess = {
  state: "normalized";
  normalizedFullText: string;
  chunks: NormalizedPublicDocumentTextChunk[];
};

export function normalizeAndChunkPublicDocumentText(input: {
  text: string;
  mimeType: string;
  sourceUnitIndex?: number;
}): PublicDocumentTextNormalizationSuccess | PublicDocumentTextNormalizationFailure {
  if (hasMalformedUnicode(input.text) || input.text.includes("\ufffd") || containsUnicodeNoncharacter(input.text)) {
    return { state: "rejected", reasonCode: "document_text_malformed_unicode" };
  }
  let pdfControlCodePointsReplaced = 0;
  let unicodeWhitespaceRunsCollapsed = 0;
  let normalized = "";
  let pendingWhitespaceCount = 0;
  let pendingNonAsciiWhitespace = false;
  let pendingControlCount = 0;
  const pdf = normalizedMime(input.mimeType) === "application/pdf";
  const flushWhitespace = (atBoundary: boolean) => {
    if (pendingWhitespaceCount + pendingControlCount === 0) return;
    if (normalized.length > 0 && !atBoundary) normalized += " ";
    if (pendingWhitespaceCount > 0 && (pendingWhitespaceCount > 1 || pendingNonAsciiWhitespace
      || atBoundary || normalized.length === 0)) {
      unicodeWhitespaceRunsCollapsed += 1;
    }
    pendingWhitespaceCount = 0;
    pendingNonAsciiWhitespace = false;
    pendingControlCount = 0;
  };
  for (const character of input.text) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint === 0) return { state: "rejected", reasonCode: "document_text_nul_forbidden" };
    if (BIDI_FORMAT_CODE_POINTS.has(codePoint)) {
      return { state: "rejected", reasonCode: "document_text_directional_format_character_forbidden" };
    }
    const whitespace = /\s/u.test(character);
    const control = isNonWhitespaceControl(codePoint);
    if (control && !pdf) {
      return { state: "rejected", reasonCode: "document_text_non_pdf_control_character_forbidden" };
    }
    if (whitespace || control) {
      if (control) { pdfControlCodePointsReplaced += 1; pendingControlCount += 1; }
      else { pendingWhitespaceCount += 1; pendingNonAsciiWhitespace ||= character !== " "; }
      continue;
    }
    flushWhitespace(false);
    normalized += character;
  }
  flushWhitespace(true);
  if (!normalized) return { state: "rejected", reasonCode: "document_text_normalized_empty" };
  const texts = losslessChunks(normalized, LOCATOR_TEXT_LIMIT);
  const transformations: NonNullable<ExtractedLocator["textDerivation"]>["transformations"] = [];
  if (pdfControlCodePointsReplaced > 0) transformations.push("pdf_control_code_to_space");
  if (unicodeWhitespaceRunsCollapsed > 0) transformations.push("unicode_whitespace_to_ascii_space");
  if (texts.length > 1) transformations.push("bounded_lossless_chunking");
  const extractedTextInputHash = digest(input.text);
  const normalizedFullTextHash = digest(normalized);
  return { state: "normalized", normalizedFullText: normalized,
    chunks: texts.map((text, chunkIndex) => ({ text, derivation: {
      schemaVersion: PUBLIC_DOCUMENT_LOCATOR_TEXT_DERIVATION_SCHEMA_VERSION,
      normalizationVersion: PUBLIC_DOCUMENT_TEXT_NORMALIZATION_VERSION,
      extractedTextInputHash,
      normalizedFullTextHash,
      locatorTextHash: digest(text),
      sourceUnitIndex: input.sourceUnitIndex ?? 0,
      chunkIndex,
      chunkCount: texts.length,
      pdfControlCodePointsReplaced,
      unicodeWhitespaceRunsCollapsed,
      transformations: [...transformations],
    } })) };
}

export function validatePublicDocumentLocatorTextDerivation(input: {
  text: string;
  mimeType: string;
  derivation: ExtractedLocator["textDerivation"];
}): string | null {
  const derivation = input.derivation;
  if (!derivation || derivation.schemaVersion !== PUBLIC_DOCUMENT_LOCATOR_TEXT_DERIVATION_SCHEMA_VERSION
    || derivation.normalizationVersion !== PUBLIC_DOCUMENT_TEXT_NORMALIZATION_VERSION) {
    return "document_locator_text_derivation_missing_or_unsupported";
  }
  if (!hexDigest(derivation.extractedTextInputHash) || !hexDigest(derivation.normalizedFullTextHash)
    || !hexDigest(derivation.locatorTextHash) || derivation.locatorTextHash !== digest(input.text)) {
    return "document_locator_text_derivation_hash_mismatch";
  }
  if (!Number.isSafeInteger(derivation.sourceUnitIndex) || derivation.sourceUnitIndex < 0
    || !Number.isSafeInteger(derivation.chunkIndex) || !Number.isSafeInteger(derivation.chunkCount)
    || derivation.chunkIndex < 0 || derivation.chunkCount < 1 || derivation.chunkIndex >= derivation.chunkCount
    || !Number.isSafeInteger(derivation.pdfControlCodePointsReplaced)
    || !Number.isSafeInteger(derivation.unicodeWhitespaceRunsCollapsed)
    || derivation.pdfControlCodePointsReplaced < 0 || derivation.unicodeWhitespaceRunsCollapsed < 0) {
    return "document_locator_text_derivation_structure_invalid";
  }
  const allowed = new Set(["pdf_control_code_to_space", "unicode_whitespace_to_ascii_space", "bounded_lossless_chunking"]);
  if (!Array.isArray(derivation.transformations) || new Set(derivation.transformations).size !== derivation.transformations.length
    || derivation.transformations.some((item) => !allowed.has(item))) {
    return "document_locator_text_derivation_transformations_invalid";
  }
  if (normalizedMime(input.mimeType) !== "application/pdf" && derivation.pdfControlCodePointsReplaced > 0) {
    return "document_locator_text_derivation_pdf_control_scope_invalid";
  }
  if (derivation.pdfControlCodePointsReplaced > 0 !== derivation.transformations.includes("pdf_control_code_to_space")
    || derivation.unicodeWhitespaceRunsCollapsed > 0
      !== derivation.transformations.includes("unicode_whitespace_to_ascii_space")
    || derivation.chunkCount > 1 !== derivation.transformations.includes("bounded_lossless_chunking")) {
    return "document_locator_text_derivation_transformations_inconsistent";
  }
  if (input.text.length === 0 || input.text.length > LOCATOR_TEXT_LIMIT || unsafeNormalizedText(input.text)) {
    return "document_locator_normalized_text_invalid";
  }
  return null;
}

function losslessChunks(value: string, maximumUtf16Units: number): string[] {
  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length > maximumUtf16Units) {
    let boundary = maximumUtf16Units;
    if (isHighSurrogate(remaining.charCodeAt(boundary - 1)) && isLowSurrogate(remaining.charCodeAt(boundary))) boundary -= 1;
    const whitespaceBoundary = remaining.lastIndexOf(" ", boundary);
    if (whitespaceBoundary > 0) boundary = whitespaceBoundary;
    const chunk = remaining.slice(0, boundary).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function hasMalformedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (isHighSurrogate(code)) {
      if (index + 1 >= value.length || !isLowSurrogate(value.charCodeAt(index + 1))) return true;
      index += 1;
    } else if (isLowSurrogate(code)) return true;
  }
  return false;
}

function containsUnicodeNoncharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if ((codePoint >= 0xfdd0 && codePoint <= 0xfdef) || (codePoint & 0xffff) === 0xfffe
      || (codePoint & 0xffff) === 0xffff) return true;
  }
  return false;
}

function unsafeNormalizedText(value: string): boolean {
  return hasMalformedUnicode(value) || value.includes("\ufffd") || containsUnicodeNoncharacter(value)
    || [...value].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint === 0 || BIDI_FORMAT_CODE_POINTS.has(codePoint) || isNonWhitespaceControl(codePoint);
    });
}

function isNonWhitespaceControl(codePoint: number): boolean {
  return (codePoint >= 0x01 && codePoint <= 0x08) || codePoint === 0x0b || codePoint === 0x0e
    || codePoint === 0x0f || (codePoint >= 0x10 && codePoint <= 0x1f) || codePoint === 0x7f
    || (codePoint >= 0x80 && codePoint <= 0x9f);
}

function isHighSurrogate(value: number): boolean { return value >= 0xd800 && value <= 0xdbff; }
function isLowSurrogate(value: number): boolean { return value >= 0xdc00 && value <= 0xdfff; }
function normalizedMime(value: string): string { return value.toLowerCase().split(";")[0]!.trim(); }
function hexDigest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
