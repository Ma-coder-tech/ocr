import crypto from "node:crypto";
import { normalizeEvidenceText } from "./evidence.js";
import type { CanonicalEvidenceRecord, CanonicalFeeRowRole, CanonicalFeeSourceOccurrence } from "./types.js";

export function sourceOccurrenceId(input: {
  documentId: string;
  pageNumber: number | null;
  section: string | null;
  lineId: string | null;
  rowIndex: number | null;
  normalizedSourceText: string | null;
}): string {
  const stableLinePart = input.lineId ?? input.rowIndex ?? "row_unknown";
  const hash = hashText(
    [
      input.documentId,
      input.pageNumber ?? "page_unknown",
      normalizeIdentityText(input.section),
      stableLinePart,
      normalizeIdentityText(input.normalizedSourceText),
    ].join("|"),
  );
  return `srcocc_${hash.slice(0, 24)}`;
}

export function occurrenceFromEvidence(input: { evidence: CanonicalEvidenceRecord }): CanonicalFeeSourceOccurrence {
  return {
    id: sourceOccurrenceId({
      documentId: input.evidence.documentId,
      pageNumber: input.evidence.pageNumber,
      section: input.evidence.section,
      lineId: input.evidence.lineId,
      rowIndex: input.evidence.rowIndex,
      normalizedSourceText: input.evidence.normalizedText,
    }),
    evidenceRef: input.evidence.id,
    documentId: input.evidence.documentId,
    pageNumber: input.evidence.pageNumber,
    section: input.evidence.section,
    lineId: input.evidence.lineId,
    rowIndex: input.evidence.rowIndex,
    normalizedSourceText: input.evidence.normalizedText,
  };
}

export function semanticFeeRowId(input: {
  sourceOccurrenceIds: string[];
  role: CanonicalFeeRowRole;
  selectedAmountMinor: number | null;
}): string {
  const hash = hashText(
    [
      input.role,
      input.selectedAmountMinor ?? "amount_unknown",
      [...input.sourceOccurrenceIds].sort().join(","),
    ].join("|"),
  );
  return `feerow_${hash.slice(0, 24)}`;
}

export function normalizeFeeLabel(input: string): string {
  return normalizeEvidenceText(input)
    .replace(/\b(?:visa|mastercard|mc\s+ofln\s+db|vs\s+ofln\s+db|amexct\d+|dcvr\s+acq|discover\s+acq)\s*-\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIdentityText(input: string | null): string {
  return normalizeEvidenceText(input ?? "");
}

function hashText(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
