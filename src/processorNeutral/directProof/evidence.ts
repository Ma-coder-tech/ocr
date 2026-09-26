import type { ParsedDocument } from "../../parser.js";
import { observeParsedDocumentEvidence } from "../shadow.js";
import type { SourceEvidence } from "../contracts.js";
import type { DirectProofRun, ProofState } from "./types.js";

export function buildDirectEvidence(document: ParsedDocument, inputSha256: string): SourceEvidence[] {
  if (!/^[0-9a-f]{64}$/.test(inputSha256)) throw new Error("DIRECT_PROOF_INPUT_HASH_REQUIRED");
  return observeParsedDocumentEvidence(document, inputSha256);
}

export function proveSourceIntegrity(document: ParsedDocument, evidence: readonly SourceEvidence[]):
  DirectProofRun["sourceIntegrity"] {
  const diagnostics = document.suppliedDocumentIntegrity;
  const observedPages = [...new Set(evidence.map((item) => item.coordinate.pageIndex)
    .filter((page): page is number => page !== null).map((page) => page + 1))].sort((a, b) => a - b);
  const suppliedArtifact: ProofState = diagnostics?.openedSuccessfully
    && diagnostics.enumeratedPageCount > 0
    && diagnostics.processedPageCount === diagnostics.enumeratedPageCount
    && diagnostics.fatalPageErrorCount === 0 && diagnostics.extractionLineageComplete
    && !diagnostics.localIngestionTruncated
    && observedPages.length === diagnostics.enumeratedPageCount
    && observedPages.every((page, index) => page === index + 1)
    ? "proven" : diagnostics ? "conflicting" : "unresolved";
  const footers = evidence.flatMap((item) => [...item.rawText.matchAll(/\bpage\s*(\d+)\s*of\s*(\d+)\b/gi)]
    .map((match) => ({ printedPage: Number(match[1]), printedTotal: Number(match[2]),
      actualPage: item.coordinate.pageIndex === null ? null : item.coordinate.pageIndex + 1, ref: item.id })));
  const totals = [...new Set(footers.map((item) => item.printedTotal))];
  const expectedPages = totals.length === 1 ? totals[0]! : null;
  const footerConflict = totals.length > 1 || footers.some((item) => item.actualPage !== item.printedPage);
  const statementPages: ProofState = footerConflict ? "conflicting"
    : footers.length === 0 || expectedPages === null ? "unresolved"
      : expectedPages === diagnostics?.enumeratedPageCount
        && footers.length === expectedPages
        && new Set(footers.map((item) => item.printedPage)).size === expectedPages
        ? "proven" : "conflicting";
  return {
    suppliedArtifact, statementPages, expectedPages, observedPages,
    evidenceRefs: footers.map((item) => item.ref),
    reasonCodes: [
      suppliedArtifact === "proven" ? "all_supplied_pdf_pages_processed_without_truncation" : "supplied_artifact_integrity_unproven",
      statementPages === "proven" ? "printed_page_sequence_matches_pdf_inventory"
        : statementPages === "conflicting" ? "printed_page_sequence_conflicts_with_pdf_inventory"
          : "printed_page_sequence_unavailable",
    ],
  };
}

function dateFromParts(month: string, day: string, year: string): string | null {
  const yy = Number(year);
  const yyyy = year.length === 2 ? 2000 + yy : yy;
  const mm = Number(month);
  const dd = Number(day);
  const date = new Date(Date.UTC(yyyy, mm - 1, dd));
  return date.getUTCFullYear() === yyyy && date.getUTCMonth() + 1 === mm && date.getUTCDate() === dd
    ? `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}` : null;
}

export function proveStatementPeriod(evidence: readonly SourceEvidence[]): DirectProofRun["statementPeriod"] {
  const candidates = evidence.flatMap((item) => {
    const match = item.normalizedText.match(/\bstatement\s+period\b[^\d]{0,12}(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})\s*-\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/i);
    if (!match) return [];
    return [{ start: dateFromParts(match[1]!, match[2]!, match[3]!),
      end: dateFromParts(match[4]!, match[5]!, match[6]!), ref: item.id }];
  });
  const valid = candidates.filter((item) => item.start && item.end && item.start <= item.end);
  const periods = [...new Set(valid.map((item) => `${item.start}/${item.end}`))];
  const invalid = candidates.length !== valid.length;
  const state: ProofState = invalid || periods.length > 1 ? "conflicting"
    : periods.length === 1 ? "proven" : "unresolved";
  const first = state === "proven" ? valid[0]! : null;
  return { state, start: first?.start ?? null, end: first?.end ?? null,
    evidenceRefs: candidates.map((item) => item.ref),
    reasonCodes: [state === "proven" ? "consistent_source_printed_statement_period"
      : state === "conflicting" ? "conflicting_or_invalid_source_periods" : "source_period_not_bound"],
  };
}
