import crypto from "node:crypto";

import type { DocumentIR, DocumentSection } from "../../documentIr.js";
import { moneyFromNumber } from "../money.js";
import type {
  CanonicalEconomicsV2CapabilityStatus,
  CanonicalEconomicsV2CompletenessStatus,
  CanonicalEconomicsV2ContributionRole,
  CanonicalEconomicsV2OccurrenceRole,
  CanonicalEconomicsV2PopulationSemantic,
  CanonicalEconomicsV2PrintedDirection,
  CanonicalEconomicsV2RepresentationGroup,
  CanonicalEconomicsV2SectionKind,
  CanonicalEconomicsV2SourceModel,
} from "./types.js";

export type CanonicalEconomicsV2SectionAdmission = {
  sourceSection: string;
  populationSemantics: CanonicalEconomicsV2PopulationSemantic[];
  completenessStatus?: CanonicalEconomicsV2CompletenessStatus;
  capabilityStatus?: CanonicalEconomicsV2CapabilityStatus;
  representsSameEconomicsAs?: string[];
  evidenceRefs?: string[];
  limitations?: string[];
};

export type CanonicalEconomicsV2OccurrenceInput = {
  key: string;
  sourceSection: string;
  pageNumber: number | null;
  rowIndex?: number | null;
  evidenceLine?: string | null;
  sourceLabel: string;
  semanticRole: CanonicalEconomicsV2OccurrenceRole;
  printedDirection?: CanonicalEconomicsV2PrintedDirection;
  printedAmount?: number | null;
  volumeBasis?: number | null;
  printedRate?: number | string | null;
  printedCount?: number | null;
  perItemAmount?: number | null;
  contributionRole: CanonicalEconomicsV2ContributionRole;
  confidence?: "high" | "medium" | "low" | "needs_review";
  reconciliationRefs?: string[];
  limitations?: string[];
};

export type CanonicalEconomicsV2RepresentationAdmission = {
  key: string;
  canonicalFactRef: string;
  occurrenceKeys: string[];
  authoritativeOccurrenceKey: string | null;
  supportingOccurrenceKeys: string[];
  reconciliationRefs?: string[];
  evidenceRefs?: string[];
  limitations?: string[];
};

export function buildCanonicalEconomicsV2SourceModel(input: {
  documentIr: DocumentIR;
  sourceDocumentRef: string;
  parserId: string;
  parserVersion: string | null;
  sectionAdmissions?: CanonicalEconomicsV2SectionAdmission[];
  occurrences: CanonicalEconomicsV2OccurrenceInput[];
  representationAdmissions?: CanonicalEconomicsV2RepresentationAdmission[];
}): { sourceModel: CanonicalEconomicsV2SourceModel; occurrenceRefByKey: Map<string, string> } {
  const sectionAdmissions = new Map(
    (input.sectionAdmissions ?? []).map((admission) => [normalize(admission.sourceSection), admission]),
  );
  const sections = [...input.documentIr.sections];
  const syntheticPageBySectionId = new Map<string, number | null>();
  for (const occurrence of input.occurrences) {
    if (!findSection(sections, occurrence.sourceSection)) {
      const section = syntheticSection(occurrence.sourceSection, occurrence.pageNumber, sections.length);
      sections.push(section);
      syntheticPageBySectionId.set(section.id, occurrence.pageNumber);
    }
  }

  const outputSections = sections.map((section) => {
    const admission = sectionAdmissions.get(normalize(section.label)) ??
      sectionAdmissions.get(normalize(section.familySectionType ?? "")) ??
      sectionAdmissions.get(normalize(section.type));
    const linePages = linesForSection(input.documentIr, section).map((line) => line.pageNumber);
    const fallbackPage = syntheticPageBySectionId.has(section.id)
      ? syntheticPageBySectionId.get(section.id) ?? null
      : section.pageNumber ?? null;
    const pageStart = linePages.length > 0 ? Math.min(...linePages) : fallbackPage;
    const pageEnd = linePages.length > 0 ? Math.max(...linePages) : fallbackPage;
    return {
      id: stableId("section", input.sourceDocumentRef, section.id, section.label),
      sourceSectionRef: section.id,
      kind: sectionKind(section),
      heading: redactSourceLabel(section.label),
      pageStart,
      pageEnd,
      lineRefs: [...section.lineIds],
      tableRefs: [...section.tableIds],
      populationSemantics: admission?.populationSemantics ?? ["unknown"],
      declaredControlOccurrenceRefs: [] as string[],
      representsSameEconomicsAsSectionRefs: admission?.representsSameEconomicsAs ?? [],
      completenessStatus: admission?.completenessStatus ?? "unknown",
      capabilityStatus: admission?.capabilityStatus ?? "unknown",
      evidenceRefs: unique(admission?.evidenceRefs ?? []),
      limitations: unique([
        ...(admission?.limitations ?? []),
        ...(admission ? [] : ["No versioned template admission established this section's population semantics or completeness."]),
      ]),
    };
  });
  const sectionRefBySourceId = new Map(outputSections.map((section) => [section.sourceSectionRef, section.id]));

  const occurrenceRefByKey = new Map<string, string>();
  const evidence = [] as CanonicalEconomicsV2SourceModel["evidence"];
  const parserInterpretations = [] as CanonicalEconomicsV2SourceModel["parserInterpretations"];
  const occurrences = input.occurrences.map((occurrence, index) => {
    const section = findSection(sections, occurrence.sourceSection) ?? syntheticSection(occurrence.sourceSection, occurrence.pageNumber, index);
    const line = findLine(input.documentIr, occurrence.evidenceLine ?? null, occurrence.pageNumber);
    const sectionRef = sectionRefBySourceId.get(section.id) ?? stableId("section", input.sourceDocumentRef, section.id, section.label);
    const occurrenceId = stableId(
      "occurrence",
      input.sourceDocumentRef,
      section.id,
      occurrence.pageNumber,
      line?.id ?? occurrence.rowIndex ?? index,
      occurrence.semanticRole,
      occurrence.key,
    );
    occurrenceRefByKey.set(occurrence.key, occurrenceId);
    const evidenceId = stableId("evidence", occurrenceId, line?.id ?? occurrence.rowIndex ?? index);
    evidence.push({
      id: evidenceId,
      documentRef: input.sourceDocumentRef,
      sectionRef,
      pageNumber: line?.pageNumber ?? occurrence.pageNumber,
      lineRef: line?.id ?? null,
      rowIndex: occurrence.rowIndex ?? rowIndexFromLineRef(line?.id ?? null),
      extractionMethod: line ? "document_ir" : "deterministic_parser",
      redactedExcerpt: redactSourceLabel(occurrence.sourceLabel),
      redactionApplied: true,
    });
    const interpretationId = stableId("interpretation", occurrenceId, input.parserId, occurrence.semanticRole);
    parserInterpretations.push({
      id: interpretationId,
      parserId: input.parserId,
      parserVersion: input.parserVersion,
      occurrenceRef: occurrenceId,
      interpretedRole: occurrence.semanticRole,
      authority: "deterministic_parser_only",
      confidence: occurrence.confidence ?? "medium",
    });
    return {
      id: occurrenceId,
      sectionRef,
      evidenceRef: evidenceId,
      pageNumber: line?.pageNumber ?? occurrence.pageNumber,
      lineRef: line?.id ?? null,
      rowIndex: occurrence.rowIndex ?? rowIndexFromLineRef(line?.id ?? null),
      sourceLabel: redactSourceLabel(occurrence.sourceLabel),
      semanticRole: occurrence.semanticRole,
      printedDirection: occurrence.printedDirection ?? directionFor(occurrence.printedAmount),
      printedAmount: occurrence.printedAmount === null || occurrence.printedAmount === undefined ? null : moneyFromNumber(occurrence.printedAmount),
      volumeBasis: occurrence.volumeBasis === null || occurrence.volumeBasis === undefined ? null : moneyFromNumber(occurrence.volumeBasis),
      printedRate: decimalString(occurrence.printedRate),
      printedCount: validCount(occurrence.printedCount),
      perItemAmount: occurrence.perItemAmount === null || occurrence.perItemAmount === undefined ? null : moneyFromNumber(occurrence.perItemAmount),
      contributionRole: occurrence.contributionRole,
      parserInterpretationRefs: [interpretationId],
      reconciliationRefs: unique(occurrence.reconciliationRefs ?? []),
      limitations: unique(occurrence.limitations ?? []),
    };
  });

  const representationGroups = (input.representationAdmissions ?? []).map((admission) =>
    representationGroup(admission, occurrenceRefByKey, input.sourceDocumentRef),
  );
  const occurrenceById = new Map(occurrences.map((occurrence) => [occurrence.id, occurrence]));
  for (const group of representationGroups) {
    group.evidenceRefs = unique([
      ...group.evidenceRefs,
      ...group.occurrenceRefs
        .map((occurrenceRef) => occurrenceById.get(occurrenceRef)?.evidenceRef)
        .filter((value): value is string => Boolean(value)),
    ]);
    for (const occurrenceRef of group.occurrenceRefs) {
      const occurrence = occurrenceById.get(occurrenceRef);
      if (!occurrence) continue;
      occurrence.contributionRole = occurrenceRef === group.authoritativeContributionOccurrenceRef
        ? "authoritative_contributor"
        : "repeated_representation";
    }
  }
  for (const section of outputSections) {
    section.declaredControlOccurrenceRefs = occurrences
      .filter((occurrence) => occurrence.sectionRef === section.id && occurrence.contributionRole === "control_only")
      .map((occurrence) => occurrence.id);
  }

  return {
    sourceModel: {
      sections: outputSections,
      occurrences,
      representationGroups,
      evidence,
      parserInterpretations,
    },
    occurrenceRefByKey,
  };
}

function representationGroup(
  admission: CanonicalEconomicsV2RepresentationAdmission,
  occurrenceRefByKey: Map<string, string>,
  sourceDocumentRef: string,
): CanonicalEconomicsV2RepresentationGroup {
  const occurrenceRefs = admission.occurrenceKeys.map((key) => occurrenceRefByKey.get(key)).filter((value): value is string => Boolean(value));
  const authoritativeContributionOccurrenceRef = admission.authoritativeOccurrenceKey === null
    ? null
    : occurrenceRefByKey.get(admission.authoritativeOccurrenceKey) ?? null;
  const supportingOccurrenceRefs = admission.supportingOccurrenceKeys
    .map((key) => occurrenceRefByKey.get(key))
    .filter((value): value is string => Boolean(value));
  return {
    id: stableId("representation", sourceDocumentRef, admission.key, admission.canonicalFactRef),
    canonicalFactRef: admission.canonicalFactRef,
    occurrenceRefs: unique(occurrenceRefs),
    authoritativeContributionOccurrenceRef,
    supportingOccurrenceRefs: unique(supportingOccurrenceRefs),
    duplicateHandling: authoritativeContributionOccurrenceRef
      ? "one_authoritative_contributor"
      : occurrenceRefs.length > 0
        ? "supporting_only"
        : "unresolved",
    reconciliationRefs: unique(admission.reconciliationRefs ?? []),
    evidenceRefs: unique(admission.evidenceRefs ?? []),
    limitations: unique(admission.limitations ?? []),
  };
}

function findSection(sections: DocumentSection[], label: string): DocumentSection | null {
  const wanted = normalize(label);
  return sections.find((section) =>
    [section.id, section.label, section.familySectionType, section.type]
      .filter((value): value is string => Boolean(value))
      .some((value) => normalize(value) === wanted),
  ) ?? null;
}

function syntheticSection(label: string, pageNumber: number | null, index: number): DocumentSection {
  return {
    id: `v2-source-section-${stableHash(`${label}|${pageNumber ?? "unknown"}|${index}`).slice(0, 16)}`,
    type: "unknown",
    family: null,
    familySectionType: null,
    label,
    // DocumentSection predates nullable page provenance. The V2 projection keeps
    // the original nullable value in syntheticPageBySectionId rather than
    // exposing this schema-only sentinel as evidence.
    pageNumber: pageNumber ?? 0,
    startLineId: null,
    endLineId: null,
    lineIds: [],
    tableIds: [],
    confidence: 0,
    detectionMethod: "layout_heuristic",
    evidence: [],
  };
}

function linesForSection(ir: DocumentIR, section: DocumentSection) {
  const refs = new Set(section.lineIds);
  return ir.pages.flatMap((page) => page.lines).filter((line) => refs.has(line.id));
}

function findLine(ir: DocumentIR, evidenceLine: string | null, pageNumber: number | null) {
  if (!evidenceLine) return null;
  const wanted = normalize(evidenceLine);
  const lines = ir.pages.flatMap((page) => page.lines).filter((line) => pageNumber === null || line.pageNumber === pageNumber);
  return lines.find((line) => normalize(line.text) === wanted) ??
    lines.find((line) => normalize(line.text).includes(wanted) || wanted.includes(normalize(line.text))) ??
    null;
}

function sectionKind(section: DocumentSection): CanonicalEconomicsV2SectionKind {
  const value = normalize(`${section.type} ${section.familySectionType ?? ""} ${section.label}`);
  if (/chargeback/.test(value)) return "chargebacks";
  if (/adjustment/.test(value)) return "adjustments";
  if (/fund|batch/.test(value)) return "funding";
  if (/interchange|program fee/.test(value)) return "interchange";
  if (/fee/.test(value)) return "fees";
  if (/card type|card activity/.test(value)) return "card_activity";
  if (/amount submitted|sales activity/.test(value)) return "sales_activity";
  if (/summary/.test(value)) return "summary";
  if (/tax/.test(value)) return "tax_reporting";
  if (/account/.test(value)) return "account";
  if (/notice|important information/.test(value)) return "notices";
  return "unknown";
}

function directionFor(value: number | null | undefined): CanonicalEconomicsV2PrintedDirection {
  if (value === null || value === undefined) return "unknown";
  if (value === 0) return "zero";
  return value < 0 ? "negative" : "positive";
}

function decimalString(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  return /^-?\d+(?:\.\d+)?$/.test(value) ? value : null;
}

function validCount(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function redactSourceLabel(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b\d{6,}\b/g, "[redacted-id]")
    .slice(0, 160);
}

function rowIndexFromLineRef(lineRef: string | null): number | null {
  const match = lineRef?.match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stableId(prefix: string, ...parts: unknown[]): string {
  return `${prefix}_v2_${stableHash(parts.map((part) => String(part ?? "null")).join("|")).slice(0, 24)}`;
}

function stableHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
