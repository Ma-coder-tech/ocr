import { APPROVED_ADMISSION_AUTHORITIES, RESOLVING_LIFECYCLE_STATES } from "./knowledgePolicy.js";
import type {
  KnowledgeAuditEvent,
  KnowledgeEntry,
  KnowledgeLifecycleState,
  KnowledgeValidationIssue,
  KnowledgeValidationResult,
} from "./knowledgeTypes.js";
import {
  canonicalJson,
  intervalsOverlap,
  isSafeStructuredString,
  isValidIsoInstant,
  scopesMayOverlap,
  scopeNarrowerOrEqual,
} from "./knowledgeSafety.js";
import { validateKnowledgeEntry } from "./knowledgeValidate.js";

const ALLOWED_REASON_CODES = new Set([
  "created_candidate", "research_completed", "verification_completed", "claim_evidence_verified", "condition_evidence_verified",
  "scope_evidence_reviewed", "privacy_reviewed", "conflict_reviewed", "effective_period_reviewed", "supersession_reviewed",
  "contradiction_recorded", "supersession_recorded", "deprecation_recorded", "rejection_recorded",
]);

const EVENT_NEXT_STATES: Record<KnowledgeAuditEvent["eventType"], readonly KnowledgeLifecycleState[]> = {
  created: ["candidate"], researched: ["researched"], verified: ["verified"], admitted: ["admitted", "admitted_with_conditions"],
  condition_changed: ["admitted_with_conditions"], contradicted: ["contradicted"], superseded: ["superseded"],
  deprecated: ["deprecated"], rejected: ["rejected"],
};

const ALLOWED_PRIOR_STATES: Record<KnowledgeAuditEvent["eventType"], readonly (KnowledgeLifecycleState | null)[]> = {
  created: [null], researched: ["candidate", "researched"], verified: ["candidate", "researched", "verified"],
  admitted: ["candidate", "researched", "verified", "contradicted"], condition_changed: ["admitted_with_conditions"],
  contradicted: ["verified", "admitted", "admitted_with_conditions"], superseded: ["admitted", "admitted_with_conditions"],
  deprecated: ["admitted", "admitted_with_conditions", "superseded"], rejected: ["candidate", "researched", "verified", "contradicted"],
};

function addIssue(issues: KnowledgeValidationIssue[], entryRef: string | null, code: string, message: string): void {
  issues.push({ code, entryRef, message });
}

function eventIntegrityIssues(event: KnowledgeAuditEvent): KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  if (!isSafeStructuredString(event.eventId) || !isSafeStructuredString(event.entryRef)
    || (event.previousEntryRef !== null && !isSafeStructuredString(event.previousEntryRef))) addIssue(issues, event.entryRef || null, "invalid_audit_identity", "Audit event identifiers must be opaque structured references.");
  if (!isValidIsoInstant(event.occurredAt)) addIssue(issues, event.entryRef, "invalid_audit_timestamp", "Audit event timestamp must be a valid UTC instant.");
  if (!Number.isInteger(event.nextVersion) || event.nextVersion < 1
    || (event.priorVersion !== null && (!Number.isInteger(event.priorVersion) || event.nextVersion !== event.priorVersion + 1))) addIssue(issues, event.entryRef, "invalid_audit_version_order", "Audit versions must be positive and sequential.");
  if ((event.priorVersion === null) !== (event.priorState === null) || (event.priorVersion === null) !== (event.previousEntryRef === null)) addIssue(issues, event.entryRef, "inconsistent_audit_predecessor", "Audit predecessor version, state, and reference must agree.");
  if (!EVENT_NEXT_STATES[event.eventType]?.includes(event.nextState)) addIssue(issues, event.entryRef, "audit_event_state_mismatch", "Audit event type does not produce the stated lifecycle state.");
  if (!ALLOWED_PRIOR_STATES[event.eventType]?.includes(event.priorState)) addIssue(issues, event.entryRef, "impossible_audit_transition", "Audit prior/result lifecycle transition is not allowed.");
  if (event.policyVersion !== "payments_knowledge_library_v0_2") addIssue(issues, event.entryRef, "audit_policy_version_mismatch", "Audit event policy version is invalid.");
  if (!Array.isArray(event.reasonCodes) || event.reasonCodes.length === 0 || event.reasonCodes.some((code) => !ALLOWED_REASON_CODES.has(code))) addIssue(issues, event.entryRef, "invalid_audit_reason", "Audit event requires approved deterministic reason codes.");
  if (RESOLVING_LIFECYCLE_STATES.has(event.nextState)
    && (event.authorityClass === null || !APPROVED_ADMISSION_AUTHORITIES.has(event.authorityClass) || !isSafeStructuredString(event.authorityRef))) addIssue(issues, event.entryRef, "missing_audit_admission_authority", "Admission audit events require approved human authority.");
  if (!RESOLVING_LIFECYCLE_STATES.has(event.nextState) && event.eventType !== "contradicted"
    && event.authorityClass !== null && !APPROVED_ADMISSION_AUTHORITIES.has(event.authorityClass)) addIssue(issues, event.entryRef, "invalid_audit_authority", "Audit authority is not approved.");
  if ((event.priorVisibility === null) !== (event.priorState === null)) addIssue(issues, event.entryRef, "audit_visibility_state_mismatch", "Audit visibility and prior state must describe the same predecessor.");
  return issues;
}

function boundariesMayOverlap(left: KnowledgeEntry, right: KnowledgeEntry): boolean {
  if (left.visibility === "reusable" || right.visibility === "reusable") return true;
  if (left.tenantRef !== right.tenantRef) return false;
  if (left.visibility === "tenant_private" || right.visibility === "tenant_private") return true;
  return left.accountRef === right.accountRef;
}

export function validateKnowledgePromotion(params: {
  previous: KnowledgeEntry;
  next: KnowledgeEntry;
  event: KnowledgeAuditEvent;
  existingEntries?: readonly KnowledgeEntry[];
}): KnowledgeValidationResult {
  const { previous, next, event } = params;
  const issues: KnowledgeValidationIssue[] = [
    ...validateKnowledgeEntry(previous).issues.map((item) => ({ ...item, code: `previous_${item.code}` })),
    ...validateKnowledgeEntry(next).issues,
    ...eventIntegrityIssues(event),
  ];
  const add = (code: string, message: string): void => addIssue(issues, next.id, code, message);
  if (next.version !== previous.version + 1) add("non_sequential_version", "Promotion must create the next immutable version.");
  if (next.claimType !== previous.claimType || next.subjectCode !== previous.subjectCode) add("claim_identity_changed", "Promotion cannot change claim identity.");
  if (event.previousEntryRef !== previous.id || event.entryRef !== next.id || event.priorVersion !== previous.version || event.nextVersion !== next.version) add("audit_version_mismatch", "Audit event must identify the exact immutable transition.");
  if (event.priorState !== previous.admission.lifecycle || event.nextState !== next.admission.lifecycle
    || event.priorVisibility !== previous.visibility || event.nextVisibility !== next.visibility) add("audit_entry_state_mismatch", "Audit lifecycle and visibility must match both entry versions.");
  if (event.eventType !== "admitted" || !RESOLVING_LIFECYCLE_STATES.has(next.admission.lifecycle)) add("invalid_promotion_transition", "Promotion validation only admits a valid transition into an admitted lifecycle.");
  if (event.authorityClass !== next.admission.authorityClass || event.authorityRef !== next.admission.authorityRef
    || event.occurredAt !== next.admission.admittedAt) add("admission_authority_mismatch", "Admission entry and audit authority/timestamp must agree exactly.");
  if (!event.reasonCodes.includes("claim_evidence_verified")) add("missing_claim_evidence_review", "Admission requires explicit claim-specific evidence review.");
  if (event.reasonCodes.some((code) => ["repeated_observation", "confidence_increase", "ai_output", "parser_success", "retrieval_success"].includes(code))) add("unauthorized_promotion_reason", "Recurrence, confidence, parser, retrieval, or AI state cannot authorize admission.");
  if (!scopeNarrowerOrEqual(next.scope, previous.scope) && !event.reasonCodes.includes("scope_evidence_reviewed")) add("unreviewed_scope_expansion", "Scope broadening requires explicit scope-evidence review.");
  if ((previous.visibility === "account_private" && next.visibility === "account_private" && (next.tenantRef !== previous.tenantRef || next.accountRef !== previous.accountRef))
    || (previous.visibility === "account_private" && next.visibility === "tenant_private" && next.tenantRef !== previous.tenantRef)
    || (previous.visibility === "tenant_private" && next.visibility !== "reusable" && next.tenantRef !== previous.tenantRef)) add("cross_boundary_promotion", "Promotion cannot move private knowledge into another tenant or account boundary.");
  if (previous.visibility !== "reusable" && next.visibility === "reusable") {
    if (!event.reasonCodes.includes("scope_evidence_reviewed") || !event.reasonCodes.includes("privacy_reviewed")) add("unreviewed_scope_expansion", "Reusable promotion requires scope and privacy review.");
    if (previous.evidence.some((evidence) => ["account_statement_observation", "statement_observation", "verified_cross_statement_observation"].includes(evidence.sourceAuthority))
      || next.evidence.some((evidence) => evidence.private || ["account_statement_observation", "statement_observation", "verified_cross_statement_observation"].includes(evidence.sourceAuthority))) add("unsafe_scope_expansion", "Statement-derived observations or private successor evidence cannot be globalized into reusable knowledge.");
    const priorEvidenceRefs = new Set(previous.evidence.map((evidence) => evidence.ref));
    if (next.evidence.some((evidence) => priorEvidenceRefs.has(evidence.ref))) add("private_provenance_reused", "Reusable promotion cannot carry private predecessor provenance forward.");
  }
  if (next.effectiveFrom !== previous.effectiveFrom || next.effectiveTo !== previous.effectiveTo) {
    if (!event.reasonCodes.includes("effective_period_reviewed")) add("unreviewed_period_change", "Promotion period changes require explicit effective-period review.");
  }
  for (const existing of params.existingEntries ?? []) {
    if (existing.id === previous.id || existing.id === next.id || !validateKnowledgeEntry(existing).valid
      || !RESOLVING_LIFECYCLE_STATES.has(existing.admission.lifecycle)) continue;
    const sameClaim = existing.claimType === next.claimType && existing.subjectCode === next.subjectCode;
    const overlap = boundariesMayOverlap(existing, next) && scopesMayOverlap(existing.scope, next.scope)
      && intervalsOverlap(existing.effectiveFrom, existing.effectiveTo, next.effectiveFrom, next.effectiveTo);
    const differentValue = canonicalJson(existing.value) !== canonicalJson(next.value);
    if (sameClaim && overlap && differentValue && !next.supersedes.includes(existing.id)) add("unresolved_promotion_conflict", "Promotion cannot silently create an overlapping unresolved conflict.");
  }
  return { valid: issues.length === 0, issues };
}

export function appendKnowledgeAuditEvent(existing: readonly KnowledgeAuditEvent[], event: KnowledgeAuditEvent): readonly KnowledgeAuditEvent[] {
  if (existing.some((item) => item.eventId === event.eventId)) throw new Error("duplicate_knowledge_audit_event");
  if (existing.some((item) => item.entryRef === event.entryRef && item.nextVersion === event.nextVersion)) throw new Error("duplicate_knowledge_version_audit_event");
  const issues = eventIntegrityIssues(event);
  if (event.priorVersion !== null && existing.length > 0) {
    const predecessor = existing.find((item) => item.entryRef === event.previousEntryRef && item.nextVersion === event.priorVersion);
    if (!predecessor) addIssue(issues, event.entryRef, "missing_audit_predecessor", "Audit history does not contain the stated predecessor event.");
    else if (predecessor.nextState !== event.priorState || predecessor.nextVisibility !== event.priorVisibility || predecessor.occurredAt > event.occurredAt) addIssue(issues, event.entryRef, "inconsistent_audit_predecessor", "Audit predecessor state, visibility, or chronology is inconsistent.");
  }
  if (issues.length > 0) throw new Error(`invalid_knowledge_audit_event:${issues.map((item) => item.code).join(",")}`);
  return Object.freeze([...existing, Object.freeze({ ...event, reasonCodes: Object.freeze([...event.reasonCodes]) as unknown as string[] })]);
}
