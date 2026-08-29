import { createHash } from "node:crypto";

import { canonicalJson } from "../canonicalJson.js";
import type { CanonicalRgVerifiedEvidence } from "./rgEvidenceExecution.js";
import { dynamicallyBindPublisherOrigin } from "./rgPublisherOriginAuthority.js";

/** Pure persisted-envelope integrity validation. Kept outside the provider executor so RE admission cannot
 * introduce a runtime/store dependency cycle while validating already-persisted evidence. */
export function persistedVerifiedEvidenceIntegrityValid(value: unknown): value is CanonicalRgVerifiedEvidence {
  if (!value || typeof value !== "object") return false;
  const evidence = value as CanonicalRgVerifiedEvidence;
  if (!["canonical_rg_verified_evidence_v1_1", "canonical_rg_verified_evidence_v1_2", "canonical_rg_verified_evidence_v1_3"].includes(evidence.schemaVersion)
    || !isSafeId(evidence.evidenceId) || !isSafeId(evidence.runId) || !/^[a-f0-9]{32}$/.test(evidence.planHash)
    || !isSafeId(evidence.workItemId) || !isSafeId(evidence.atomicClaimId) || !isSafeId(evidence.intentId)
    || !isSafeId(evidence.candidateId) || !isSafeId(evidence.documentId)
    || !/^[a-f0-9]{64}$/.test(evidence.documentFingerprint) || !/^[a-f0-9]{64}$/.test(evidence.frozenCandidateHash)) return false;
  if (!isSafeId(evidence.investigatorLocatorId) || !isSafeId(evidence.authorityLocatorId) || !isSafeId(evidence.supportLocatorId)
    || !safePublicText(evidence.authorityLocatorExcerpt, 4096) || !safePublicText(evidence.supportLocatorExcerpt, 4096)) return false;
  if (evidence.currentRunSupport !== "verified_claim_scoped_candidate_support"
    || evidence.reusableKnowledgeState !== "candidate_not_promoted" || evidence.rfAdmissionAuthority !== "none"
    || evidence.automaticKnowledgePromotion !== false || evidence.canonicalFinancialMutationAllowed !== false) return false;
  if (!validNullableDay(evidence.effectiveFrom) || !validNullableDay(evidence.effectiveTo)
    || !validStatementPeriod(evidence.statementPeriod)) return false;
  const identity = { runId: evidence.runId, planHash: evidence.planHash,
    ...(["canonical_rg_verified_evidence_v1_2", "canonical_rg_verified_evidence_v1_3"].includes(evidence.schemaVersion) ? {
      executionGrantId: evidence.executionGrantId ?? null,
      executionGeneration: evidence.executionGeneration ?? 0,
    } : {}), workItemId: evidence.workItemId,
    atomicClaimId: evidence.atomicClaimId, facet: evidence.facet, intentId: evidence.intentId,
    candidateId: evidence.candidateId, documentFingerprint: evidence.documentFingerprint,
    investigatorLocatorId: evidence.investigatorLocatorId, authorityLocatorId: evidence.authorityLocatorId,
    supportLocatorId: evidence.supportLocatorId, frozenCandidateHash: evidence.frozenCandidateHash,
    originPublisherBindingId: evidence.originPublisherProof?.bindingId,
    ...(evidence.schemaVersion === "canonical_rg_verified_evidence_v1_3" ? { scopeFingerprint: evidence.scopeFingerprint } : {}) };
  if (evidence.schemaVersion === "canonical_rg_verified_evidence_v1_3" && !/^[a-f0-9]{32}$/.test(evidence.scopeFingerprint ?? "")) return false;
  if (evidence.evidenceId !== `rg-evidence-${digest(identity).slice(0, 32)}`) return false;
  const rebound = dynamicallyBindPublisherOrigin({ sourceOrigin: evidence.sourceOrigin, finalUrl: evidence.sourceUrl,
    publisherIdentityCode: evidence.publisherIdentityCode, authorityClass: evidence.sourceAuthority,
    publicScope: evidence.applicabilityScope });
  return rebound !== null && digest(rebound) === digest(evidence.originPublisherProof);
}

function validStatementPeriod(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const period = value as { start?: unknown; end?: unknown };
  return typeof period.start === "string" && typeof period.end === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(period.start) && /^\d{4}-\d{2}-\d{2}$/.test(period.end)
    && period.start <= period.end;
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value);
}
function safePublicText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
}
function validNullableDay(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
function digest(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}
