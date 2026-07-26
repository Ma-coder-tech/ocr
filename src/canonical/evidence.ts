import crypto from "node:crypto";
import type {
  CanonicalConfidence,
  CanonicalEvidenceRecord,
  CanonicalEvidenceSourceRole,
  CanonicalExtractionMethod,
  CanonicalParserInterpretation,
  MoneyAmount,
  DecimalString,
  CountValue,
} from "./types.js";

const EVIDENCE_EXTRACTION_VERSION = "pdfjs_text_rows_v1";

export function stableSourceEvidenceId(input: {
  documentId: string;
  pageNumber: number | null;
  normalizedText: string | null;
  sourceRole: CanonicalEvidenceSourceRole;
  occurrenceIndex?: number | null;
}): string {
  const hash = hashText(
    [
      input.documentId,
      input.pageNumber ?? "page_unknown",
      input.sourceRole,
      normalizeEvidenceText(input.normalizedText ?? ""),
      input.occurrenceIndex ?? "occurrence_unknown",
    ].join("|"),
  );
  return `ev_${hash.slice(0, 20)}`;
}

export function makeEvidenceRecord(input: {
  documentId: string;
  pageNumber: number | null;
  rowIndex: number | null;
  lineId?: string | null;
  section?: string | null;
  extractedText: string | null;
  sourceRole: CanonicalEvidenceSourceRole;
  confidence?: Exclude<CanonicalConfidence, "needs_review">;
  extractionMethod?: CanonicalExtractionMethod;
}): CanonicalEvidenceRecord {
  const normalizedText = input.extractedText === null ? null : normalizeEvidenceText(input.extractedText);
  const id = stableSourceEvidenceId({
    documentId: input.documentId,
    pageNumber: input.pageNumber,
    normalizedText,
    sourceRole: input.sourceRole,
    occurrenceIndex: input.rowIndex,
  });
  const observationId = `obs_${hashText(`${id}|${input.extractionMethod ?? "pdf_text"}|${EVIDENCE_EXTRACTION_VERSION}`).slice(0, 20)}`;

  return {
    id,
    documentId: input.documentId,
    pageNumber: input.pageNumber,
    section: input.section ?? null,
    lineId: input.lineId ?? null,
    rowIndex: input.rowIndex,
    extractedText: input.extractedText,
    normalizedText,
    sourceRole: input.sourceRole,
    confidence: input.confidence ?? "medium",
    extractionObservations: [
      {
        id: observationId,
        evidenceRef: id,
        extractionMethod: input.extractionMethod ?? "pdf_text",
        extractionVersion: EVIDENCE_EXTRACTION_VERSION,
        observedText: input.extractedText,
        confidence: input.confidence ?? "medium",
      },
    ],
    parserInterpretations: [],
    customerSafe: {
      excerpt: customerSafeExcerpt(input.extractedText),
      redactionApplied: true,
    },
  };
}

export function attachParserInterpretation(
  evidence: CanonicalEvidenceRecord,
  input: {
    parserId: string | null;
    parserVersion: string | null;
    interpretedRole: string;
    interpretedValue: MoneyAmount | DecimalString | CountValue | string | null;
    confidence: CanonicalConfidence;
  },
): CanonicalEvidenceRecord {
  const extractionObservationRef = evidence.extractionObservations[0]?.id ?? null;
  const interpretation: CanonicalParserInterpretation = {
    id: `pi_${hashText(
      [
        evidence.id,
        extractionObservationRef ?? "no_observation",
        input.parserId ?? "no_parser",
        input.parserVersion ?? "no_version",
        input.interpretedRole,
        JSON.stringify(input.interpretedValue),
      ].join("|"),
    ).slice(0, 20)}`,
    evidenceRef: evidence.id,
    extractionObservationRef,
    parserId: input.parserId,
    parserVersion: input.parserVersion,
    interpretedRole: input.interpretedRole,
    interpretedValue: input.interpretedValue,
    confidence: input.confidence,
  };
  return {
    ...evidence,
    parserInterpretations: [...evidence.parserInterpretations, interpretation],
  };
}

export function normalizeEvidenceText(input: string): string {
  return input.replace(/\s+/g, " ").trim().toLowerCase();
}

export function documentIdForSource(sourceFileName?: string | null): string {
  return `doc_${hashText(sourceFileName?.trim() || "uploaded_statement").slice(0, 16)}`;
}

function customerSafeExcerpt(input: string | null): string | null {
  if (!input) return null;
  return input.replace(/\b\d{8,}\b/g, "[redacted-id]").slice(0, 240);
}

function hashText(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
