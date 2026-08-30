import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { extractPublicDocument } from "../../../../src/canonical/v2/intelligence/publicDocumentExtraction.js";
import {
  normalizeAndChunkPublicDocumentText,
  validatePublicDocumentLocatorTextDerivation,
} from "../../../../src/canonical/v2/intelligence/publicDocumentTextNormalization.js";
import {
  admitCanonicalRgRetrievedDocument,
  type CanonicalRgDiscoveryCandidate,
  type CanonicalRgRetrievedDocument,
} from "../../../../src/canonical/v2/runtime/rgEvidenceExecution.js";

describe("public document derived-text normalization and provenance", () => {
  it("normalizes the PDF control-code class deterministically without changing raw source identity", () => {
    const input = "Application\u0002 Fee\u001b  Schedule\u0085June";
    const normalized = normalizeAndChunkPublicDocumentText({ text: input, mimeType: "application/pdf" });

    expect(normalized).toMatchObject({ state: "normalized", normalizedFullText: "Application Fee Schedule June" });
    if (normalized.state !== "normalized") return;
    expect(normalized.chunks).toHaveLength(1);
    expect(normalized.chunks[0]).toMatchObject({ text: "Application Fee Schedule June", derivation: {
      schemaVersion: "public_document_locator_text_derivation_v1",
      normalizationVersion: "public_document_text_normalization_v1",
      extractedTextInputHash: createHash("sha256").update(input).digest("hex"),
      pdfControlCodePointsReplaced: 3,
      chunkIndex: 0,
      chunkCount: 1,
      transformations: expect.arrayContaining(["pdf_control_code_to_space", "unicode_whitespace_to_ascii_space"]),
    } });
    expect(validatePublicDocumentLocatorTextDerivation({ text: normalized.chunks[0]!.text,
      mimeType: "application/pdf", derivation: normalized.chunks[0]!.derivation })).toBeNull();
  });

  it("fails closed for controls outside PDF extraction and for semantically unsafe or malformed Unicode", () => {
    expect(normalizeAndChunkPublicDocumentText({ text: "Application\u0002Fee", mimeType: "text/plain" }))
      .toEqual({ state: "rejected", reasonCode: "document_text_non_pdf_control_character_forbidden" });
    expect(normalizeAndChunkPublicDocumentText({ text: "Application\u0000Fee", mimeType: "application/pdf" }))
      .toEqual({ state: "rejected", reasonCode: "document_text_nul_forbidden" });
    expect(normalizeAndChunkPublicDocumentText({ text: "Application\u202eFee", mimeType: "application/pdf" }))
      .toEqual({ state: "rejected", reasonCode: "document_text_directional_format_character_forbidden" });
    expect(normalizeAndChunkPublicDocumentText({ text: `Application${String.fromCharCode(0xd800)}Fee`,
      mimeType: "application/pdf" })).toEqual({ state: "rejected", reasonCode: "document_text_malformed_unicode" });
  });

  it("losslessly chunks long normalized text and binds every chunk to one complete source-line hash", () => {
    const source = Array.from({ length: 1_800 }, (_, index) => `term${index}`).join(" ");
    const normalized = normalizeAndChunkPublicDocumentText({ text: source, mimeType: "text/plain" });

    expect(normalized.state).toBe("normalized");
    if (normalized.state !== "normalized") return;
    expect(normalized.chunks.length).toBeGreaterThan(2);
    expect(normalized.chunks.every((chunk) => chunk.text.length <= 4_096)).toBe(true);
    expect(normalized.chunks.map((chunk) => chunk.text).join(" ")).toBe(normalized.normalizedFullText);
    expect(normalized.chunks.map((chunk) => chunk.derivation.chunkIndex))
      .toEqual(normalized.chunks.map((_, index) => index));
    expect(new Set(normalized.chunks.map((chunk) => chunk.derivation.normalizedFullTextHash))).toHaveLength(1);
  });

  it("extracts complete bounded text with derivation records and refuses silent output truncation", async () => {
    const source = Array.from({ length: 1_400 }, (_, index) => `public-term-${index}`).join(" ");
    const content = new TextEncoder().encode(source);
    const fingerprint = createHash("sha256").update(content).digest("hex");
    const request = { questionId: "question-normalization", candidateId: "candidate-normalization",
      documentId: "document-normalization", mimeType: "text/plain", content,
      expectedDocumentFingerprint: fingerprint };

    const complete = await extractPublicDocument({ ...request, maximumOutputBytes: 100_000 });
    expect(complete).toMatchObject({ state: "retrieved_extracted", documentFingerprint: fingerprint,
      reasonCodes: [] });
    expect(complete.locators.length).toBeGreaterThan(2);
    expect(complete.locators.map((locator) => locator.text).join(" ")).toBe(source);
    expect(complete.locators.every((locator) => locator.textDerivation?.locatorTextHash
      === createHash("sha256").update(locator.text).digest("hex"))).toBe(true);

    const bounded = await extractPublicDocument({ ...request, maximumOutputBytes: 1_000 });
    expect(bounded).toEqual(expect.objectContaining({ state: "extraction_failed", text: null, locators: [],
      reasonCodes: ["document_extraction_output_oversized_complete_text_required"] }));
  });

  it("detects locator-text alteration after derivation binding", () => {
    const normalized = normalizeAndChunkPublicDocumentText({ text: "Official Fiserv application fee schedule",
      mimeType: "application/pdf" });
    if (normalized.state !== "normalized") throw new Error("expected normalized fixture");
    expect(validatePublicDocumentLocatorTextDerivation({ text: `${normalized.chunks[0]!.text} altered`,
      mimeType: "application/pdf", derivation: normalized.chunks[0]!.derivation }))
      .toBe("document_locator_text_derivation_hash_mismatch");
  });

  it("upgrades a legacy PDF locator containing benign extraction controls without changing source identity", () => {
    const fingerprint = "a".repeat(64);
    const candidate = discoveryCandidate();
    const document = retrievedDocument(candidate, fingerprint, [{ locatorId: "locator-legacy-control", page: 1,
      sectionCode: "pdf_page", lineStart: 1, lineEnd: 1, textExcerpt: "Official\u0002 Fiserv fee schedule" }]);

    const admission = admitCanonicalRgRetrievedDocument(document, candidate);
    expect(admission).toMatchObject({ state: "admitted", reasonCode: "rg_retrieved_document_admitted",
      normalizedLocatorCount: 1, document: { documentFingerprint: fingerprint, byteLength: 42,
        locators: [{ locatorId: "locator-legacy-control", textExcerpt: "Official Fiserv fee schedule",
          textDerivation: { pdfControlCodePointsReplaced: 1, transformations: expect.arrayContaining([
            "pdf_control_code_to_space",
          ]) } }] } });
  });

  it("rejects incomplete lossless chunk lineage even when every individual locator hash is valid", () => {
    const fingerprint = "b".repeat(64);
    const candidate = discoveryCandidate();
    const normalized = normalizeAndChunkPublicDocumentText({
      text: Array.from({ length: 1_800 }, (_, index) => `term${index}`).join(" "),
      mimeType: "application/pdf",
      sourceUnitIndex: 0,
    });
    if (normalized.state !== "normalized") throw new Error("expected normalized fixture");
    const locators = normalized.chunks.map((chunk, index) => ({ locatorId: `locator-chunk-${index}`,
      page: 1, sectionCode: "pdf_page", lineStart: index + 1, lineEnd: index + 1,
      textExcerpt: chunk.text, textDerivation: chunk.derivation }));
    const incomplete = retrievedDocument(candidate, fingerprint, locators.slice(0, -1));

    expect(admitCanonicalRgRetrievedDocument(incomplete, candidate)).toEqual({ state: "rejected",
      reasonCode: "rg_document_admission_locator_chunk_lineage_incomplete", documentFingerprint: fingerprint });
  });
});

function discoveryCandidate(): CanonicalRgDiscoveryCandidate {
  return { candidateId: "candidate-document-admission", url: "https://www.fiserv.com/public-document",
    title: "Public document", claimedAuthority: "processor_publication", publicationDate: null,
    effectiveFrom: null, effectiveTo: null };
}

function retrievedDocument(candidate: CanonicalRgDiscoveryCandidate, fingerprint: string,
  locators: CanonicalRgRetrievedDocument["locators"]): CanonicalRgRetrievedDocument {
  return { candidateId: candidate.candidateId, requestedUrl: candidate.url, finalUrl: candidate.url,
    sourceOrigin: "https://www.fiserv.com", documentId: "document-admission-test", documentFingerprint: fingerprint,
    mimeType: "application/pdf", byteLength: 42, independentlyRetrieved: true, locators };
}
