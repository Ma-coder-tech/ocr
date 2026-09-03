import { createHash } from "node:crypto";

import { canonicalJson } from "../canonical/v2/canonicalJson.js";
import type { CanonicalEconomicsV2Foundation } from "../canonical/v2/types.js";
import type { ParsedDocument } from "../parser.js";

export const STATEMENT_COMPLETENESS_ASSESSMENT_SCHEMA =
  "statement_completeness_assessment_v1" as const;

export type StatementCompletenessAssessment = {
  schemaVersion: typeof STATEMENT_COMPLETENESS_ASSESSMENT_SCHEMA;
  sourceDocumentRef: string;
  suppliedPageProcessing: {
    status: "all_supplied_pages_processed" | "not_all_supplied_pages_processed" | "unproven";
    enumeratedPageCount: number | null;
    processedPageCount: number | null;
    fatalPageErrorCount: number | null;
    extractionLineageComplete: boolean | null;
    localIngestionTruncated: boolean | null;
    provesStatementCompleteness: false;
  };
  statementCompleteness: {
    status: "proven_complete" | "proven_incomplete" | "unproven";
    proofBasis: "printed_contiguous_page_x_of_n" | "printed_page_x_of_n_shortfall" | "none";
    authorityEligible: boolean;
    expectedStatementPageCount: number | null;
    suppliedPdfPageCount: number | null;
    observedStatementPageNumbers: number[];
    missingStatementPageNumbers: number[];
  };
  printedPaginationEvidence: Array<{
    physicalPdfPage: number;
    printedStatementPage: number;
    printedStatementPageCount: number;
    sourceLine: string;
  }>;
  ignoredPaginationEvidence: Array<{
    physicalPdfPage: number;
    printedStatementPage: number;
    printedStatementPageCount: number;
    sourceLine: string;
    reason: "not_the_dominant_physical_page_sequence";
  }>;
  reasonCodes: string[];
  limitations: string[];
  assessmentHash: string;
};

type PaginationMarker = Omit<
  StatementCompletenessAssessment["printedPaginationEvidence"][number], never
>;
type PaginationSequenceCandidate = {
  kind: "complete" | "incomplete";
  total: number;
  markers: PaginationMarker[];
  missing: number[];
};

/**
 * Independently assesses statement pagination from direct source rows. A PDF parser
 * enumerating and processing every supplied page is deliberately represented as a
 * separate proposition from the processor statement itself being complete.
 */
export function assessStatementCompleteness(input: {
  document: ParsedDocument;
  foundation?: CanonicalEconomicsV2Foundation;
  sourceDocumentRef: string;
}): StatementCompletenessAssessment {
  const supplied = assessSuppliedPageProcessing(input.document, input.foundation);
  const suppliedPdfPageCount = supplied.enumeratedPageCount;
  const allMarkers = extractPrintedPagination(input.document);
  const sequences = sequenceCandidates(allMarkers, suppliedPdfPageCount);
  const selected = sequences.length === 1 ? sequences[0] : null;

  const statementStatus = supplied.status !== "all_supplied_pages_processed"
    ? "unproven" as const
    : selected?.kind === "complete" ? "proven_complete" as const
      : selected?.kind === "incomplete" ? "proven_incomplete" as const : "unproven" as const;
  const selectedMarkers = selected?.markers ?? [];
  const selectedKeys = new Set(selectedMarkers.map(markerKey));
  const reasonCodes = unique([
    `supplied_processing_${supplied.status}`,
    ...(statementStatus === "proven_complete" ? ["printed_pagination_proves_complete_statement"] : []),
    ...(statementStatus === "proven_incomplete" ? ["printed_pagination_proves_supplied_statement_is_incomplete"] : []),
    ...(statementStatus === "unproven" ? ["statement_completeness_not_proven"] : []),
    ...(sequences.length > 1
      ? ["multiple_competing_printed_pagination_sequences"] : []),
  ]);
  const resultWithoutHash = {
    schemaVersion: STATEMENT_COMPLETENESS_ASSESSMENT_SCHEMA,
    sourceDocumentRef: input.sourceDocumentRef,
    suppliedPageProcessing: supplied,
    statementCompleteness: {
      status: statementStatus,
      proofBasis: statementStatus === "proven_complete"
        ? "printed_contiguous_page_x_of_n" as const
        : statementStatus === "proven_incomplete"
          ? "printed_page_x_of_n_shortfall" as const : "none" as const,
      authorityEligible: statementStatus === "proven_complete",
      expectedStatementPageCount: selected?.total ?? null,
      suppliedPdfPageCount,
      observedStatementPageNumbers: selected ? selected.markers.map((item) => item.printedStatementPage) : [],
      missingStatementPageNumbers: selected?.missing ?? [],
    },
    printedPaginationEvidence: selectedMarkers,
    ignoredPaginationEvidence: allMarkers
      .filter((item) => !selectedKeys.has(markerKey(item)))
      .map((item) => ({ ...item, reason: "not_the_dominant_physical_page_sequence" as const })),
    reasonCodes,
    limitations: [
      "This proves only physical-page processing and exact printed Page X of N continuity; it does not prove omitted inserts, external enclosures, or unnumbered companion documents.",
      "An approved artifact page count or PDF container page count identifies the supplied artifact; neither alone proves the processor statement is complete.",
      "Pagination without a unique sequence aligned to every physical PDF page remains unproven rather than guessed.",
    ],
  };
  return {
    ...resultWithoutHash,
    assessmentHash: createHash("sha256").update(canonicalJson(resultWithoutHash)).digest("hex"),
  };
}

function assessSuppliedPageProcessing(
  document: ParsedDocument,
  foundation?: CanonicalEconomicsV2Foundation,
): StatementCompletenessAssessment["suppliedPageProcessing"] {
  const parsed = document.suppliedDocumentIntegrity;
  const rb = foundation?.documentIntegrity;
  const enumeratedPageCount = parsed?.enumeratedPageCount ?? rb?.observedPageCount ?? null;
  const processedPageCount = parsed?.processedPageCount ?? rb?.processedPageCount ?? null;
  const fatalPageErrorCount = parsed?.fatalPageErrorCount ?? rb?.fatalPageErrorCount ?? null;
  const extractionLineageComplete = parsed?.extractionLineageComplete ?? rb?.extractionLineageComplete ?? null;
  const localIngestionTruncated = parsed?.localIngestionTruncated ?? rb?.localIngestionTruncated ?? null;
  const observed = enumeratedPageCount !== null && processedPageCount !== null;
  const rbConfirmsProcessing = rb?.suppliedDocumentStatus === "complete_supplied_document"
    && rb.observedPageCount === enumeratedPageCount
    && rb.processedPageCount === processedPageCount;
  const complete = observed && enumeratedPageCount === processedPageCount
    && fatalPageErrorCount === 0 && extractionLineageComplete === true
    && localIngestionTruncated === false
    && rbConfirmsProcessing;
  const explicitlyIncomplete = rb?.suppliedDocumentStatus === "incomplete_or_corrupt_supplied_document"
    || observed && enumeratedPageCount !== processedPageCount
    || fatalPageErrorCount !== null && fatalPageErrorCount > 0
    || extractionLineageComplete === false || localIngestionTruncated === true;
  return {
    status: complete ? "all_supplied_pages_processed"
      : explicitlyIncomplete ? "not_all_supplied_pages_processed" : "unproven",
    enumeratedPageCount,
    processedPageCount,
    fatalPageErrorCount,
    extractionLineageComplete,
    localIngestionTruncated,
    provesStatementCompleteness: false,
  };
}

function extractPrintedPagination(document: ParsedDocument): PaginationMarker[] {
  const markers: PaginationMarker[] = [];
  for (const row of document.rows) {
    const physicalPdfPage = physicalPageNumber(row.page);
    if (physicalPdfPage === null) continue;
    const sourceLine = String(row.content ?? "");
    const pattern = /\bpage\s+0*(\d+)\s+of\s+0*(\d+)\b/gi;
    for (const match of sourceLine.matchAll(pattern)) {
      const printedStatementPage = Number(match[1]);
      const printedStatementPageCount = Number(match[2]);
      if (!Number.isSafeInteger(printedStatementPage) || printedStatementPage <= 0
          || !Number.isSafeInteger(printedStatementPageCount) || printedStatementPageCount <= 0
          || printedStatementPage > printedStatementPageCount) continue;
      markers.push({ physicalPdfPage, printedStatementPage, printedStatementPageCount, sourceLine });
    }
  }
  return dedupeMarkers(markers);
}

function sequenceCandidates(
  markers: PaginationMarker[],
  suppliedPdfPageCount: number | null,
): PaginationSequenceCandidate[] {
  if (suppliedPdfPageCount === null || suppliedPdfPageCount <= 0) return [];
  const totals = [...new Set(markers.map((item) => item.printedStatementPageCount))];
  const candidates: PaginationSequenceCandidate[] = [];
  for (const total of totals) {
    const aligned = markers.filter((item) => item.printedStatementPageCount === total
      && item.printedStatementPage === item.physicalPdfPage
      && item.physicalPdfPage <= suppliedPdfPageCount);
    const byPhysical = new Map(aligned.map((item) => [item.physicalPdfPage, item]));
    const contiguousPrefix = Array.from({ length: suppliedPdfPageCount }, (_, index) => index + 1)
      .every((page) => byPhysical.has(page));
    if (!contiguousPrefix) continue;
    const missing = Array.from({ length: total }, (_, index) => index + 1)
      .filter((page) => !byPhysical.has(page));
    if (total === suppliedPdfPageCount && missing.length === 0) {
      candidates.push({ kind: "complete", total, markers: [...byPhysical.values()], missing });
      continue;
    }
    if (total > suppliedPdfPageCount && missing.length === total - suppliedPdfPageCount) {
      candidates.push({ kind: "incomplete", total, markers: [...byPhysical.values()], missing });
    }
  }
  return candidates;
}

function physicalPageNumber(value: string | number | undefined): number | null {
  const match = String(value ?? "").match(/^(?:page-)?(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function markerKey(item: PaginationMarker): string {
  return `${item.physicalPdfPage}:${item.printedStatementPage}:${item.printedStatementPageCount}:${item.sourceLine}`;
}

function dedupeMarkers(markers: PaginationMarker[]): PaginationMarker[] {
  return [...new Map(markers.map((item) => [markerKey(item), item])).values()]
    .sort((left, right) => left.physicalPdfPage - right.physicalPdfPage
      || left.printedStatementPageCount - right.printedStatementPageCount);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
