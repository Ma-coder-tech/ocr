import type {
  CanonicalConfidence,
  CanonicalExtractionMethod,
  CanonicalFactCandidate,
  CanonicalFactCandidateRole,
  CanonicalFactValue,
} from "./types.js";

export function selectedFact<T>(input: {
  value: T;
  confidence: CanonicalConfidence;
  evidenceRefs: string[];
  selectionReason: string;
  candidates?: CanonicalFactCandidate<T>[];
  selectedCandidateId?: string;
  calculationRef?: string;
}): CanonicalFactValue<T> {
  return {
    value: input.value,
    status: "selected",
    confidence: input.confidence,
    selectedCandidateId: input.selectedCandidateId,
    evidenceRefs: input.evidenceRefs,
    calculationRef: input.calculationRef,
    selectionReason: input.selectionReason,
    candidates: input.candidates ?? [],
    limitations: [],
  };
}

export function unavailableFact<T>(reason: string, candidates: CanonicalFactCandidate<T>[] = []): CanonicalFactValue<T> {
  return {
    value: null,
    status: "unavailable",
    confidence: null,
    evidenceRefs: [],
    selectionReason: null,
    candidates,
    limitations: [reason],
  };
}

export function notApplicableFact<T>(reason: string): CanonicalFactValue<T> {
  return {
    value: null,
    status: "not_applicable",
    confidence: null,
    evidenceRefs: [],
    selectionReason: null,
    candidates: [],
    limitations: [reason],
  };
}

export function ambiguousFact<T>(reason: string, candidates: CanonicalFactCandidate<T>[]): CanonicalFactValue<T> {
  return {
    value: null,
    status: "ambiguous",
    confidence: "needs_review",
    evidenceRefs: candidates.flatMap((candidate) => candidate.evidenceRefs),
    selectionReason: null,
    candidates,
    limitations: [reason],
  };
}

export function candidate<T>(input: {
  id: string;
  role: CanonicalFactCandidateRole;
  value: T;
  evidenceRefs: string[];
  parserId: string | null;
  parserVersion: string | null;
  extractionMethod?: CanonicalExtractionMethod;
  confidence: CanonicalConfidence;
  selected: boolean;
  selectionReason: string | null;
  rejectionReason: string | null;
}): CanonicalFactCandidate<T> {
  return {
    id: input.id,
    role: input.role,
    value: input.value,
    evidenceRefs: input.evidenceRefs,
    parserId: input.parserId,
    parserVersion: input.parserVersion,
    extractionMethod: input.extractionMethod ?? "pdf_text",
    confidence: input.confidence,
    selected: input.selected,
    selectionReason: input.selectionReason,
    rejectionReason: input.rejectionReason,
  };
}
