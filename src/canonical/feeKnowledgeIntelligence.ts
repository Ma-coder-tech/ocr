import { createHash } from "node:crypto";
import type { CanonicalStatementAnalysis } from "./types.js";
import {
  FEE_KNOWLEDGE_INTELLIGENCE_POLICY_VERSION,
  type FeeKnowledgeClaimSupportRecord,
  type FeeKnowledgeIntelligenceRecord,
  type FeeKnowledgeResearchCandidateRecord,
} from "./feeKnowledgeTypes.js";
import type { FeeKnowledgeResearchQuestion } from "./feeKnowledgeResearch.js";
import type { RetrievedDocument } from "./feeKnowledgeRetrieval.js";

export type FeeKnowledgeDocumentIntelligenceInput = {
  candidateId: string;
  attemptId: string;
  question: FeeKnowledgeResearchQuestion;
  retrieved: RetrievedDocument;
};

export function buildStatementGroundedIntelligence(input: {
  analysis: Pick<CanonicalStatementAnalysis, "feeLedger" | "feeOwnershipActionability">;
  questions: readonly FeeKnowledgeResearchQuestion[];
}): FeeKnowledgeIntelligenceRecord[] {
  const questionByRow = new Map(input.questions.map((question) => [question.feeRowRef, question]));
  const classificationByRow = new Map(input.analysis.feeOwnershipActionability.rowClassifications.map((item) => [item.feeRowId, item.selected]));
  const records: FeeKnowledgeIntelligenceRecord[] = [];
  for (const row of input.analysis.feeLedger.rows) {
    const question = questionByRow.get(row.id);
    const selected = classificationByRow.get(row.id);
    if (!question) continue;
    const label = safeSummary(row.selectedLabel || question.feeLabel);
    const unfamiliar = question.triggerReason === "material_unfamiliar_label" || selected?.category === "unknown_needs_review" || row.role === "unknown_unresolved";
    if (unfamiliar) {
      records.push(record({
        feeRowRef: row.id,
        origin: "statement_grounded",
        state: "ai_hypothesis",
        subject: "fee_meaning",
        summary: `Statement-grounded intelligence should investigate the meaning of ${label}.`,
        reasonCodes: ["fee_knowledge_statement_grounded_unfamiliar_fee"],
        confidence: "low",
        actionabilityCeiling: "verify_only",
        merchantActionability: "merchant_display_provisional",
        proofRequirement: "statement_grounded_labeling_only",
        statementEvidenceRefs: row.sourceOccurrenceIds ?? [],
      }));
    }
    if (selected?.actionabilityCeiling === "potentially_actionable" || /mark.?up|surcharge|non.?qual|monthly|annual|service|pci/i.test(label)) {
      records.push(record({
        feeRowRef: row.id,
        origin: "statement_grounded",
        state: "investigation_lead",
        subject: "markup_hypothesis",
        summary: `Statement-grounded intelligence may investigate whether ${label} is processor-controlled markup.`,
        reasonCodes: ["fee_knowledge_statement_grounded_markup_investigation_lead"],
        confidence: selected?.confidence === "high" ? "medium" : "low",
        actionabilityCeiling: "verify_only",
        merchantActionability: "merchant_display_provisional",
        proofRequirement: "external_and_math_required",
        statementEvidenceRefs: row.sourceOccurrenceIds ?? [],
      }));
    }
    if (row.role === "unknown_unresolved" || /misc|other|adjust|unknown|non.?qual/i.test(label)) {
      records.push(record({
        feeRowRef: row.id,
        origin: "statement_grounded",
        state: "anomaly_flag",
        subject: "anomaly",
        summary: `Statement-grounded intelligence flags ${label} for review because the fee structure is not self-explanatory.`,
        reasonCodes: ["fee_knowledge_statement_grounded_anomaly_flag"],
        confidence: "low",
        actionabilityCeiling: "unknown",
        merchantActionability: "human_review_only",
        proofRequirement: "human_review_required",
        statementEvidenceRefs: row.sourceOccurrenceIds ?? [],
      }));
    }
  }
  return dedupe(records);
}

export function buildRetrievedDocumentIntelligence(input: FeeKnowledgeDocumentIntelligenceInput): FeeKnowledgeIntelligenceRecord[] {
  if (input.retrieved.status !== "retrieved_text" || !input.retrieved.documentFingerprint) return [];
  const documentText = normalize(input.retrieved.text);
  const label = safeSummary(input.question.feeLabel);
  const labelTokens = meaningfulTokens(input.question.feeLabel);
  const processorTokens = meaningfulTokens(input.question.processorOrNetwork ?? "");
  const semanticTokens = meaningfulTokens(input.question.semanticQuestion);
  const hasLabelToken = labelTokens.some((token) => documentText.includes(token));
  const hasProcessorToken = processorTokens.some((token) => documentText.includes(token));
  const hasNetworkTerm = /\b(?:visa|mastercard|discover|american express|interchange|assessment|network|card brand)\b/.test(documentText);
  const hasRateLikeTerm = /\b(?:rate|rates|fee|fees|assessment|schedule|program|rule|rules|basis point|bps|percent)\b/.test(documentText);
  const records: FeeKnowledgeIntelligenceRecord[] = [];
  if (hasLabelToken || (hasProcessorToken && hasRateLikeTerm) || (hasNetworkTerm && semanticTokens.some((token) => documentText.includes(token)))) {
    records.push(record({
      feeRowRef: input.question.feeRowRef,
      origin: "retrieved_document",
      state: "source_derived_candidate_evidence",
      subject: hasRateLikeTerm ? "published_rate" : "source_relevance",
      summary: hasLabelToken
        ? `Retrieved documentation contains terminology related to ${label}; semantic verification is still required before admission.`
        : `Retrieved documentation appears relevant to the processor or network context for ${label}; semantic verification is still required before admission.`,
      reasonCodes: [
        "fee_knowledge_document_candidate_evidence_constructed",
        hasLabelToken ? "fee_knowledge_document_fee_label_term_matched" : "fee_knowledge_document_context_term_matched",
      ],
      confidence: hasLabelToken ? "medium" : "low",
      actionabilityCeiling: "verify_only",
      merchantActionability: "internal_only",
      proofRequirement: hasRateLikeTerm ? "external_verification_required" : "human_review_required",
      candidateRef: input.candidateId,
      researchAttemptRefs: [input.attemptId],
      candidateEvidence: {
        candidateRef: input.candidateId,
        documentFingerprint: input.retrieved.documentFingerprint,
        locatorHash: input.retrieved.locators[0]?.textHash ?? null,
        sourceDomain: input.retrieved.safeDiagnostics?.finalSourceDomain ?? input.retrieved.safeDiagnostics?.sourceDomain ?? null,
        supportStatus: "candidate_only",
      },
    }));
  } else {
    records.push(record({
      feeRowRef: input.question.feeRowRef,
      origin: "retrieved_document",
      state: "unresolved_review_needed",
      subject: "source_relevance",
      summary: `Retrieved documentation did not provide a clear candidate evidence basis for ${label}.`,
      reasonCodes: ["fee_knowledge_document_relevance_unresolved"],
      confidence: "low",
      actionabilityCeiling: "unknown",
      merchantActionability: "internal_only",
      proofRequirement: "human_review_required",
      candidateRef: input.candidateId,
      researchAttemptRefs: [input.attemptId],
      candidateEvidence: {
        candidateRef: input.candidateId,
        documentFingerprint: input.retrieved.documentFingerprint,
        locatorHash: null,
        sourceDomain: input.retrieved.safeDiagnostics?.finalSourceDomain ?? input.retrieved.safeDiagnostics?.sourceDomain ?? null,
        supportStatus: "semantic_not_run",
      },
    }));
  }
  return records;
}

export function buildIntelligenceFromClaimSupport(input: {
  support: FeeKnowledgeClaimSupportRecord;
  candidate?: FeeKnowledgeResearchCandidateRecord | null;
}): FeeKnowledgeIntelligenceRecord {
  const verified = input.support.evidenceDecision === "verified_classification" ||
    input.support.evidenceDecision === "verified_rule" ||
    input.support.evidenceDecision === "verified_application";
  const rateCompared = input.support.rateOrAmountComparison === "matches_published_rule" ||
    input.support.rateOrAmountComparison === "does_not_match_published_rule";
  return record({
    feeRowRef: input.support.feeRowRef,
    origin: rateCompared ? "deterministic_math" : "semantic_verification",
    state: verified && rateCompared ? "fully_verified" : verified ? "externally_verified" : input.support.semanticSupport.decision === "supports" ? "externally_supported" : "rejected",
    subject: input.support.structuredClaim.claimKind === "published_rule" ? "published_rate" : "fee_meaning",
    summary: verified
      ? "Verified fee intelligence is backed by admitted external claim support."
      : "External evidence was evaluated but did not reach verified admission strength.",
    reasonCodes: [`fee_knowledge_intelligence_${input.support.evidenceDecision}`],
    confidence: input.support.confidence,
    actionabilityCeiling: input.support.actionabilityCeiling,
    merchantActionability: verified ? "merchant_display_verified" : "merchant_display_supported",
    proofRequirement: rateCompared ? "external_and_math_required" : "external_verification_required",
    candidateRef: input.support.candidateId ?? undefined,
    claimSupportRefs: [input.support.claimSupportId],
    candidateEvidence: input.support.candidateId ? {
      candidateRef: input.support.candidateId,
      documentFingerprint: input.support.documentFingerprint,
      locatorHash: input.support.locatorTextHash,
      sourceDomain: null,
      supportStatus: verified ? "semantic_supported" : "semantic_rejected",
    } : null,
    mathVerification: {
      status: rateCompared ? "passed" : "not_required",
      deterministicCalculationRef: null,
    },
  });
}

function record(input: {
  feeRowRef: string;
  origin: FeeKnowledgeIntelligenceRecord["origin"];
  state: FeeKnowledgeIntelligenceRecord["state"];
  subject: FeeKnowledgeIntelligenceRecord["subject"];
  summary: string;
  reasonCodes: readonly string[];
  confidence: FeeKnowledgeIntelligenceRecord["confidence"];
  actionabilityCeiling: FeeKnowledgeIntelligenceRecord["actionabilityCeiling"];
  merchantActionability: FeeKnowledgeIntelligenceRecord["merchantActionability"];
  proofRequirement: FeeKnowledgeIntelligenceRecord["proofRequirement"];
  statementEvidenceRefs?: readonly string[];
  researchAttemptRefs?: readonly string[];
  candidateRef?: string;
  claimSupportRefs?: readonly string[];
  deterministicFactRefs?: readonly string[];
  candidateEvidence?: FeeKnowledgeIntelligenceRecord["candidateEvidence"];
  mathVerification?: FeeKnowledgeIntelligenceRecord["mathVerification"];
}): FeeKnowledgeIntelligenceRecord {
  const payload = {
    feeRowRef: input.feeRowRef,
    origin: input.origin,
    state: input.state,
    subject: input.subject,
    summary: safeSummary(input.summary),
    reasonCodes: safeCodes(input.reasonCodes),
    basis: {
      statementEvidenceRefs: safeRefs(input.statementEvidenceRefs ?? []),
      researchAttemptRefs: safeRefs(input.researchAttemptRefs ?? []),
      candidateRefs: input.candidateRef ? safeRefs([input.candidateRef]) : [],
      claimSupportRefs: safeRefs(input.claimSupportRefs ?? []),
      deterministicFactRefs: safeRefs(input.deterministicFactRefs ?? []),
    },
    candidateEvidence: input.candidateEvidence ?? null,
    mathVerification: input.mathVerification ?? { status: "not_required" as const, deterministicCalculationRef: null },
  };
  return {
    type: "fee_knowledge_intelligence",
    policyVersion: FEE_KNOWLEDGE_INTELLIGENCE_POLICY_VERSION,
    intelligenceId: `intel_${sha256Canonical(payload).slice(0, 32)}`,
    ...payload,
    confidence: input.confidence,
    actionabilityCeiling: input.actionabilityCeiling,
    merchantActionability: input.merchantActionability,
    proofRequirement: input.proofRequirement,
    supersededByIntelligenceRef: null,
    displayPermission: input.merchantActionability.startsWith("merchant_display") ? "human_review_required" : "internal_only",
  };
}

function dedupe(records: FeeKnowledgeIntelligenceRecord[]): FeeKnowledgeIntelligenceRecord[] {
  return [...new Map(records.map((item) => [item.intelligenceId, item])).values()]
    .sort((left, right) => left.intelligenceId.localeCompare(right.intelligenceId));
}

function safeSummary(value: string): string {
  return value
    .replace(/(?:\/Users\/|\/private\/|[A-Za-z]:\\)\S+/g, "[path_withheld]")
    .replace(/\b(?:api(?:\s|-)?key|credential|secret|bearer|sk-[A-Za-z0-9_-]+)\b/gi, "[credential_withheld]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220) || "Intelligence requires review.";
}

function safeCodes(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => /^[a-z0-9_]{1,120}$/.test(value)))].sort();
}

function safeRefs(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => /^[A-Za-z0-9_.:-]{1,160}$/.test(value)))].sort();
}

function meaningfulTokens(value: string): string[] {
  return normalize(value).split(" ").filter((token) => token.length >= 4 && !STOP_WORDS.has(token)).slice(0, 12);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

const STOP_WORDS = new Set([
  "official",
  "documentation",
  "payment",
  "processing",
  "processor",
  "network",
  "this",
  "that",
  "with",
  "from",
  "rule",
  "rules",
  "fees",
  "find",
  "label",
]);
