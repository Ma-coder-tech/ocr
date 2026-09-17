import { createHash } from "node:crypto";

import type { ParsedDocument } from "../parser.js";
import { reconstructStatement } from "./kernel.js";
import { verifyReplaySourceProvenance, type ProvenancedReplaySource } from "./sourceProvenance.js";
import type {
  Claim,
  Observation,
  ObservationAuthority,
  ObservationKind,
  ReconstructionInput,
  ReconstructionResult,
  ScalarValue,
} from "./types.js";

export interface SourceRowEvidence {
  id: string;
  index: number;
  page: number | null;
  content: string;
}

export interface ParsedStatementObservationPacket {
  statementId: string;
  sourceRowFingerprint: string;
  pageCount: number;
  sourceRows: SourceRowEvidence[];
  parserCandidates: Observation[];
  errors: string[];
}

type ReplayValueParser = "money_minor" | "integer" | "date_iso" | "string";

interface ReplayBindingBase {
  id: string;
  observationKind: ObservationKind;
  expectedValue: ScalarValue;
  relatedObservationRefs?: string[];
  section: string;
}

export interface SingleRowReplayBinding extends ReplayBindingBase {
  extractor: "single";
  rowPattern: RegExp;
  captureGroup: number;
  parseAs: ReplayValueParser;
  occurrence?: number;
  authority?: Extract<ObservationAuthority, "source_printed" | "deterministic_extraction">;
}

export interface SumReplayBinding extends ReplayBindingBase {
  extractor: "sum";
  rowPattern: RegExp;
  captureGroup: number;
  parseAs: "money_minor" | "integer";
  minimumMatches?: number;
}

export interface MatchCountReplayBinding extends ReplayBindingBase {
  extractor: "match_count";
  rowPattern: RegExp;
}

export interface LiteralReplayBinding extends ReplayBindingBase {
  extractor: "literal";
  rowPattern: RegExp;
  value: ScalarValue;
  minimumMatches?: number;
  maximumMatches?: number;
}

export interface ArithmeticReplayTerm {
  rowPattern: RegExp;
  captureGroup: number;
  parseAs: "money_minor" | "integer";
  coefficient: number;
  minimumMatches?: number;
}

export interface ArithmeticReplayBinding extends ReplayBindingBase {
  extractor: "arithmetic";
  terms: ArithmeticReplayTerm[];
}

export type ReplayObservationBinding =
  | SingleRowReplayBinding
  | SumReplayBinding
  | MatchCountReplayBinding
  | LiteralReplayBinding
  | ArithmeticReplayBinding;

export interface ShadowReplayDefinition {
  id: string;
  inputTemplate: ReconstructionInput;
  bindings: ReplayObservationBinding[];
}

export type ShadowReplayStatus = "replayed" | "provenance_rejected" | "source_mismatch" | "kernel_rejected";

export interface ShadowReplayResult {
  id: string;
  status: ShadowReplayStatus;
  errors: string[];
  packet: {
    provenanceVerified: boolean;
    sourceContentSha256: string;
    sourceRowFingerprint: string;
    pageCount: number;
    sourceRowCount: number;
    parserCandidateCount: number;
    boundObservationCount: number;
  };
  reconstruction: ReconstructionResult | null;
}

function pageNumber(row: Record<string, string | number>): number | null {
  const match = String(row.page ?? "").match(/page-(\d+)/i);
  return match ? Number(match[1]) : null;
}

function candidateKind(row: Record<string, string | number>): ObservationKind {
  if (row.kind === "amount" && typeof row.value === "number") return "amount";
  if (typeof row.value === "string" && /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(row.value)) return "date";
  return "text";
}

function candidateValue(row: Record<string, string | number>, kind: ObservationKind): ScalarValue {
  if (kind === "amount" && typeof row.value === "number") return Math.round(row.value * 100);
  return row.value ?? row.content ?? null;
}

export function adaptParsedDocumentToObservationPacket(
  statementId: string,
  document: ParsedDocument,
): ParsedStatementObservationPacket {
  const errors: string[] = [];
  if (document.sourceType !== "pdf") errors.push("Shadow statement replay requires a PDF source document.");
  if (!document.suppliedDocumentIntegrity?.openedSuccessfully) errors.push("Source document did not open successfully.");
  if (!document.suppliedDocumentIntegrity?.extractionLineageComplete) errors.push("Source extraction lineage is incomplete.");
  if ((document.suppliedDocumentIntegrity?.fatalPageErrorCount ?? 1) !== 0) errors.push("Source extraction reported fatal page errors.");
  if (document.extraction.mode === "unusable" || !document.extraction.hasExtractableText) {
    errors.push("Source document has no usable extractable text for native-text reconstruction.");
  }

  const sourceRows: SourceRowEvidence[] = document.rows.map((row, index) => ({
    id: `source-row-${String(index + 1).padStart(4, "0")}`,
    index,
    page: pageNumber(row),
    content: String(row.content ?? "").trim(),
  }));
  if (sourceRows.length === 0) errors.push("Source document produced no source-evidence rows.");
  const sourceRowFingerprint = createHash("sha256")
    .update(JSON.stringify(sourceRows.map(({ page, content }) => ({ page, content }))))
    .digest("hex");
  const parserCandidates = document.rows.flatMap((row, index): Observation[] => {
    if (row.value === undefined) return [];
    const kind = candidateKind(row);
    return [{
      id: `parser-candidate-${String(index + 1).padStart(4, "0")}`,
      kind,
      value: candidateValue(row, kind),
      authority: "parser_candidate",
      locator: {
        documentId: statementId,
        page: pageNumber(row) ?? undefined,
        row: `source-row-${String(index + 1).padStart(4, "0")}`,
        label: String(row.label ?? "parser value"),
      },
    }];
  });

  return {
    statementId,
    sourceRowFingerprint,
    pageCount: document.suppliedDocumentIntegrity?.enumeratedPageCount ?? Math.max(0, ...sourceRows.map((row) => row.page ?? 0)),
    sourceRows,
    parserCandidates,
    errors,
  };
}

function cleanPattern(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.replaceAll("g", ""));
}

function rowMatches(rows: SourceRowEvidence[], pattern: RegExp): Array<{ row: SourceRowEvidence; match: RegExpMatchArray }> {
  const safePattern = cleanPattern(pattern);
  return rows.flatMap((row) => {
    const match = row.content.match(safePattern);
    return match ? [{ row, match }] : [];
  });
}

function parseDate(input: string): string | null {
  const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const year = match[3]!.length === 2 ? `20${match[3]}` : match[3]!;
  return `${year}-${match[1]!.padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
}

function parseCapturedValue(input: string, parseAs: ReplayValueParser): ScalarValue | undefined {
  if (parseAs === "string") return input.trim();
  if (parseAs === "date_iso") return parseDate(input) ?? undefined;
  const normalized = input.trim().replace(/^\((.*)\)$/, "-$1").replace(/[$,\s]/g, "");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return undefined;
  return parseAs === "money_minor" ? Math.round(numeric * 100) : Math.trunc(numeric);
}

function locator(statementId: string, binding: ReplayObservationBinding, rows: SourceRowEvidence[]) {
  return {
    documentId: statementId,
    page: rows[0]?.page ?? undefined,
    section: binding.section,
    row: rows.length > 0 ? rows.map((row) => row.id).join(",") : "complete-document-match-count",
    label: binding.id,
    extractedText: rows.length > 0 ? rows.map((row) => row.content).join("\n") : undefined,
  };
}

function valuesEqual(left: ScalarValue, right: ScalarValue): boolean {
  return left === right;
}

function extractBinding(
  packet: ParsedStatementObservationPacket,
  binding: ReplayObservationBinding,
): { observation?: Observation; errors: string[] } {
  const errors: string[] = [];
  let value: ScalarValue | undefined;
  let evidenceRows: SourceRowEvidence[] = [];
  let authority: ObservationAuthority = "deterministic_extraction";

  if (binding.extractor === "single") {
    const matches = rowMatches(packet.sourceRows, binding.rowPattern);
    const selected = binding.occurrence === undefined
      ? matches.length === 1 ? matches[0] : undefined
      : matches[binding.occurrence];
    if (!selected) {
      errors.push(`${binding.id}: expected ${binding.occurrence === undefined ? "exactly one" : `occurrence ${binding.occurrence}`} source row, found ${matches.length}.`);
    } else {
      const capture = selected.match[binding.captureGroup];
      value = capture === undefined ? undefined : parseCapturedValue(capture, binding.parseAs);
      evidenceRows = [selected.row];
      authority = binding.authority ?? "source_printed";
      if (value === undefined) errors.push(`${binding.id}: selected row did not yield a valid ${binding.parseAs} value.`);
    }
  } else if (binding.extractor === "sum") {
    const matches = rowMatches(packet.sourceRows, binding.rowPattern);
    if (matches.length < (binding.minimumMatches ?? 1)) errors.push(`${binding.id}: found ${matches.length} rows, below minimum ${binding.minimumMatches ?? 1}.`);
    const parsed = matches.map(({ match }) => parseCapturedValue(match[binding.captureGroup] ?? "", binding.parseAs));
    if (parsed.some((item) => typeof item !== "number")) errors.push(`${binding.id}: an aggregate row did not yield a numeric value.`);
    else value = (parsed as number[]).reduce((sum, item) => sum + item, 0);
    evidenceRows = matches.map(({ row }) => row);
  } else if (binding.extractor === "match_count") {
    const matches = rowMatches(packet.sourceRows, binding.rowPattern);
    value = matches.length;
    evidenceRows = matches.map(({ row }) => row);
  } else if (binding.extractor === "literal") {
    const matches = rowMatches(packet.sourceRows, binding.rowPattern);
    const minimum = binding.minimumMatches ?? 1;
    const maximum = binding.maximumMatches ?? Number.POSITIVE_INFINITY;
    if (matches.length < minimum || matches.length > maximum) errors.push(`${binding.id}: source row count ${matches.length} is outside [${minimum}, ${maximum}].`);
    value = binding.value;
    evidenceRows = matches.map(({ row }) => row);
  } else {
    let total = 0;
    for (const term of binding.terms) {
      const matches = rowMatches(packet.sourceRows, term.rowPattern);
      if (matches.length < (term.minimumMatches ?? 1)) errors.push(`${binding.id}: arithmetic term found ${matches.length} rows, below minimum ${term.minimumMatches ?? 1}.`);
      for (const { row, match } of matches) {
        const parsed = parseCapturedValue(match[term.captureGroup] ?? "", term.parseAs);
        if (typeof parsed !== "number") errors.push(`${binding.id}: arithmetic term did not yield a numeric value.`);
        else total += parsed * term.coefficient;
        evidenceRows.push(row);
      }
    }
    value = total;
  }

  if (value !== undefined && !valuesEqual(value, binding.expectedValue)) {
    errors.push(`${binding.id}: source value ${JSON.stringify(value)} does not match accepted replay value ${JSON.stringify(binding.expectedValue)}.`);
  }
  if (errors.length > 0 || value === undefined) return { errors };
  return {
    observation: {
      id: binding.id,
      kind: binding.observationKind,
      value,
      authority,
      locator: locator(packet.statementId, binding, evidenceRows),
      relatedObservationRefs: binding.relatedObservationRefs,
    },
    errors,
  };
}

export function bindReplayObservations(
  packet: ParsedStatementObservationPacket,
  bindings: ReplayObservationBinding[],
): { observations: Observation[]; errors: string[] } {
  const observations: Observation[] = [];
  const errors = [...packet.errors];
  const seen = new Set<string>();
  for (const binding of bindings) {
    if (seen.has(binding.id)) {
      errors.push(`Duplicate replay binding ${binding.id}.`);
      continue;
    }
    seen.add(binding.id);
    const extracted = extractBinding(packet, binding);
    errors.push(...extracted.errors);
    if (extracted.observation) observations.push(extracted.observation);
  }
  return { observations, errors: [...new Set(errors)].sort() };
}

function parserCandidateClaims(observations: Observation[]): Claim[] {
  return observations.map((observation) => ({
    key: `shadow.${observation.id}`,
    value: observation.value,
    support: "parser_candidate",
    observationRefs: [observation.id],
  }));
}

export function replayParsedStatement(
  document: ParsedDocument,
  definition: ShadowReplayDefinition,
  source: ProvenancedReplaySource,
): ShadowReplayResult {
  const packet = adaptParsedDocumentToObservationPacket(definition.id, document);
  const provenance = verifyReplaySourceProvenance(source, packet, definition);
  const baseSummary = {
    provenanceVerified: provenance.verified,
    sourceContentSha256: provenance.observedContentSha256,
    sourceRowFingerprint: packet.sourceRowFingerprint,
    pageCount: packet.pageCount,
    sourceRowCount: packet.sourceRows.length,
    parserCandidateCount: packet.parserCandidates.length,
  };
  if (!provenance.verified) {
    return {
      id: definition.id,
      status: "provenance_rejected",
      errors: provenance.errors,
      packet: { ...baseSummary, boundObservationCount: 0 },
      reconstruction: null,
    };
  }
  const bound = bindReplayObservations(packet, definition.bindings);
  const summary = {
    ...baseSummary,
    boundObservationCount: bound.observations.length,
  };
  if (bound.errors.length > 0) {
    return { id: definition.id, status: "source_mismatch", errors: bound.errors, packet: summary, reconstruction: null };
  }
  const requiredObservationIds = new Set(definition.inputTemplate.observations.map((observation) => observation.id));
  const boundIds = new Set(bound.observations.map((observation) => observation.id));
  const missing = [...requiredObservationIds].filter((id) => !boundIds.has(id)).sort();
  const errors = [...bound.errors, ...missing.map((id) => `No successful raw-source binding for required observation ${id}.`)];
  if (errors.length > 0) {
    return { id: definition.id, status: "source_mismatch", errors: [...new Set(errors)].sort(), packet: summary, reconstruction: null };
  }

  const input: ReconstructionInput = {
    ...structuredClone(definition.inputTemplate),
    observations: [...bound.observations, ...packet.parserCandidates],
    baseClaims: [
      ...structuredClone(definition.inputTemplate.baseClaims),
      ...parserCandidateClaims(packet.parserCandidates),
    ],
  };
  const reconstruction = reconstructStatement(input);
  return {
    id: definition.id,
    status: reconstruction.status === "invalid_input" ? "kernel_rejected" : "replayed",
    errors: reconstruction.errors,
    packet: summary,
    reconstruction,
  };
}
