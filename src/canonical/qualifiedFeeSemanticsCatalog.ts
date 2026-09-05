import { createHash } from "node:crypto";
import {
  FEE_SEMANTICS_EVIDENCE_MODEL_VERSION,
  resolveFeeSemantics,
  validateFeeSemanticCatalog,
  type FeeSemanticCatalog,
  type FeeSemanticEvidenceRecord,
  type FeeSemanticQuery,
  type FeeSemanticResolution,
} from "./feeSemanticsEvidenceModel.js";

export const QUALIFIED_FEE_SEMANTICS_CATALOG_SCHEMA_VERSION = "qualified_fee_semantics_catalog_v1" as const;
export const QUALIFIED_FEE_SEMANTICS_GOVERNANCE_POLICY_VERSION = "qualified_fee_semantics_governance_v1" as const;

export type FeeSemanticReviewerRole = "payments_domain_reviewer" | "data_steward" | "product_owner";
export type FeeSemanticGovernedSubjectType = "concept" | "alias" | "assertion";

export type FeeSemanticSourceSnapshot = {
  snapshotId: string;
  evidenceRef: string;
  catalogVersion: string;
  lifecycle: "active" | "superseded" | "revoked";
  qualificationDecision: "qualified" | "candidate" | "rejected";
  fingerprintAlgorithm: "sha256";
  fingerprintScope: "qualified_claim_packet";
  fingerprint: string;
  capturedAt: string;
  reviewedAt: string | null;
  reviewDueAt: string | null;
  reviewerRole: FeeSemanticReviewerRole | null;
  reviewerRef: string | null;
  supersedesSnapshotRefs: string[];
  supersededBySnapshotRef: string | null;
};

export type FeeSemanticAdmissionRecord = {
  admissionId: string;
  catalogVersion: string;
  subjectType: FeeSemanticGovernedSubjectType;
  subjectRef: string;
  lifecycle: "active" | "historical" | "superseded" | "rejected";
  reviewerRole: FeeSemanticReviewerRole;
  reviewerRef: string;
  decidedAt: string;
  sourceSnapshotRefs: string[];
  supersedesAdmissionRefs: string[];
  supersededByAdmissionRef: string | null;
  reasonCodes: string[];
};

export type FeeSemanticCatalogAuditEvent = {
  auditEventId: string;
  policyVersion: typeof QUALIFIED_FEE_SEMANTICS_GOVERNANCE_POLICY_VERSION;
  eventType: "source_captured" | "knowledge_admitted" | "knowledge_retained_historically" | "knowledge_rejected" | "knowledge_superseded";
  subjectRef: string;
  admissionRef: string | null;
  sourceSnapshotRefs: string[];
  occurredAt: string;
  reviewerRole: FeeSemanticReviewerRole | null;
  reviewerRef: string | null;
  reasonCodes: string[];
};

export type QualifiedFeeSemanticCatalog = {
  schemaVersion: typeof QUALIFIED_FEE_SEMANTICS_CATALOG_SCHEMA_VERSION;
  governancePolicyVersion: typeof QUALIFIED_FEE_SEMANTICS_GOVERNANCE_POLICY_VERSION;
  catalog: FeeSemanticCatalog;
  sourceSnapshots: FeeSemanticSourceSnapshot[];
  admissions: FeeSemanticAdmissionRecord[];
  auditTrail: FeeSemanticCatalogAuditEvent[];
};

export type QualifiedFeeSemanticResolution = {
  governanceStatus: "valid" | "invalid";
  catalogVersion: string;
  validationErrors: string[];
  resolution: FeeSemanticResolution;
  admissionRefs: string[];
  sourceSnapshotRefs: string[];
};

const ADMITTED_LIFECYCLES = new Set<FeeSemanticAdmissionRecord["lifecycle"]>(["active", "historical"]);

export function feeSemanticClaimPacketFingerprint(evidence: FeeSemanticEvidenceRecord): string {
  const payload = JSON.stringify({
    evidenceId: evidence.evidenceId,
    evidenceClass: evidence.evidenceClass,
    sourceAuthority: evidence.sourceAuthority,
    qualification: evidence.qualification,
    title: evidence.title,
    publisher: evidence.publisher,
    sourceUrl: evidence.sourceUrl,
    sourceLocator: evidence.sourceLocator,
    scope: evidence.scope,
    visibility: evidence.visibility,
    limitations: evidence.limitations,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function validateQualifiedFeeSemanticCatalog(input: QualifiedFeeSemanticCatalog): string[] {
  const errors: string[] = [];
  if (input.schemaVersion !== QUALIFIED_FEE_SEMANTICS_CATALOG_SCHEMA_VERSION) errors.push("qualified_fee_semantics_schema_version_invalid");
  if (input.governancePolicyVersion !== QUALIFIED_FEE_SEMANTICS_GOVERNANCE_POLICY_VERSION) errors.push("qualified_fee_semantics_governance_policy_invalid");
  if (input.catalog.modelVersion !== FEE_SEMANTICS_EVIDENCE_MODEL_VERSION) errors.push("qualified_fee_semantics_model_version_invalid");
  errors.push(...validateFeeSemanticCatalog(input.catalog));

  const evidenceById = new Map(input.catalog.evidence.map((item) => [item.evidenceId, item]));
  const subjectIndex = governedSubjectIndex(input.catalog);
  const evidenceBySubject = governedSubjectEvidenceIndex(input.catalog);
  const snapshotById = new Map<string, FeeSemanticSourceSnapshot>();
  const snapshotsByEvidence = new Map<string, FeeSemanticSourceSnapshot[]>();
  for (const snapshot of input.sourceSnapshots) {
    if (!safeId(snapshot.snapshotId) || snapshotById.has(snapshot.snapshotId)) errors.push(`qualified_fee_semantics_snapshot_duplicate_or_invalid:${snapshot.snapshotId}`);
    snapshotById.set(snapshot.snapshotId, snapshot);
    snapshotsByEvidence.set(snapshot.evidenceRef, [...(snapshotsByEvidence.get(snapshot.evidenceRef) ?? []), snapshot]);
    const evidence = evidenceById.get(snapshot.evidenceRef);
    if (!evidence) errors.push(`qualified_fee_semantics_snapshot_evidence_missing:${snapshot.snapshotId}`);
    if (snapshot.catalogVersion !== input.catalog.catalogVersion) errors.push(`qualified_fee_semantics_snapshot_catalog_version_mismatch:${snapshot.snapshotId}`);
    if (!/^[a-f0-9]{64}$/.test(snapshot.fingerprint)) errors.push(`qualified_fee_semantics_snapshot_fingerprint_invalid:${snapshot.snapshotId}`);
    if (evidence && snapshot.fingerprint !== feeSemanticClaimPacketFingerprint(evidence)) errors.push(`qualified_fee_semantics_snapshot_fingerprint_mismatch:${snapshot.snapshotId}`);
    if (!validIsoInstant(snapshot.capturedAt)) errors.push(`qualified_fee_semantics_snapshot_capture_time_invalid:${snapshot.snapshotId}`);
    if (snapshot.reviewedAt !== null && !validIsoInstant(snapshot.reviewedAt)) errors.push(`qualified_fee_semantics_snapshot_review_time_invalid:${snapshot.snapshotId}`);
    if (snapshot.reviewDueAt !== null && !validIsoDay(snapshot.reviewDueAt)) errors.push(`qualified_fee_semantics_snapshot_review_due_invalid:${snapshot.snapshotId}`);
    if (snapshot.qualificationDecision === "qualified" && (!snapshot.reviewerRole || !snapshot.reviewerRef || !snapshot.reviewedAt)) {
      errors.push(`qualified_fee_semantics_snapshot_qualified_without_review:${snapshot.snapshotId}`);
    }
    if (snapshot.qualificationDecision === "qualified" && evidence?.qualification !== "qualified") errors.push(`qualified_fee_semantics_snapshot_overstates_evidence:${snapshot.snapshotId}`);
    if (snapshot.lifecycle === "active" && snapshot.supersededBySnapshotRef !== null) errors.push(`qualified_fee_semantics_active_snapshot_has_successor:${snapshot.snapshotId}`);
  }
  for (const evidence of input.catalog.evidence) {
    if ((snapshotsByEvidence.get(evidence.evidenceId) ?? []).length === 0) errors.push(`qualified_fee_semantics_evidence_snapshot_missing:${evidence.evidenceId}`);
  }
  for (const snapshot of input.sourceSnapshots) {
    for (const predecessorRef of snapshot.supersedesSnapshotRefs) {
      const predecessor = snapshotById.get(predecessorRef);
      if (!predecessor) errors.push(`qualified_fee_semantics_snapshot_predecessor_missing:${snapshot.snapshotId}:${predecessorRef}`);
      else if (predecessor.supersededBySnapshotRef !== snapshot.snapshotId) errors.push(`qualified_fee_semantics_snapshot_supersession_not_reciprocal:${snapshot.snapshotId}:${predecessorRef}`);
    }
    if (snapshot.supersededBySnapshotRef && !snapshotById.has(snapshot.supersededBySnapshotRef)) errors.push(`qualified_fee_semantics_snapshot_successor_missing:${snapshot.snapshotId}`);
  }

  const admissionById = new Map<string, FeeSemanticAdmissionRecord>();
  const admissionsBySubject = new Map<string, FeeSemanticAdmissionRecord[]>();
  for (const admission of input.admissions) {
    if (!safeId(admission.admissionId) || admissionById.has(admission.admissionId)) errors.push(`qualified_fee_semantics_admission_duplicate_or_invalid:${admission.admissionId}`);
    admissionById.set(admission.admissionId, admission);
    admissionsBySubject.set(admission.subjectRef, [...(admissionsBySubject.get(admission.subjectRef) ?? []), admission]);
    if (admission.catalogVersion !== input.catalog.catalogVersion) errors.push(`qualified_fee_semantics_admission_catalog_version_mismatch:${admission.admissionId}`);
    if (subjectIndex.get(admission.subjectRef) !== admission.subjectType) errors.push(`qualified_fee_semantics_admission_subject_invalid:${admission.admissionId}`);
    if (!validIsoInstant(admission.decidedAt) || !safeId(admission.reviewerRef)) errors.push(`qualified_fee_semantics_admission_review_invalid:${admission.admissionId}`);
    if (admission.sourceSnapshotRefs.length === 0 || admission.sourceSnapshotRefs.some((ref) => !snapshotById.has(ref))) errors.push(`qualified_fee_semantics_admission_source_missing:${admission.admissionId}`);
    const permittedEvidenceRefs = evidenceBySubject.get(admission.subjectRef) ?? new Set<string>();
    if (admission.sourceSnapshotRefs.some((ref) => {
      const snapshot = snapshotById.get(ref);
      return snapshot ? !permittedEvidenceRefs.has(snapshot.evidenceRef) : false;
    })) errors.push(`qualified_fee_semantics_admission_source_not_bound_to_subject:${admission.admissionId}`);
    if (ADMITTED_LIFECYCLES.has(admission.lifecycle) && admission.sourceSnapshotRefs.some((ref) => snapshotById.get(ref)?.qualificationDecision !== "qualified")) {
      errors.push(`qualified_fee_semantics_weak_source_admitted:${admission.admissionId}`);
    }
    if (admission.lifecycle === "active" && admission.supersededByAdmissionRef !== null) errors.push(`qualified_fee_semantics_active_admission_has_successor:${admission.admissionId}`);
  }
  for (const admission of input.admissions) {
    for (const predecessorRef of admission.supersedesAdmissionRefs) {
      const predecessor = admissionById.get(predecessorRef);
      if (!predecessor) errors.push(`qualified_fee_semantics_admission_predecessor_missing:${admission.admissionId}:${predecessorRef}`);
      else if (predecessor.supersededByAdmissionRef !== admission.admissionId) errors.push(`qualified_fee_semantics_admission_supersession_not_reciprocal:${admission.admissionId}:${predecessorRef}`);
    }
    if (admission.supersededByAdmissionRef && !admissionById.has(admission.supersededByAdmissionRef)) errors.push(`qualified_fee_semantics_admission_successor_missing:${admission.admissionId}`);
  }

  for (const concept of input.catalog.concepts) {
    const governedChildren = [...concept.aliases, ...concept.assertions];
    const hasAdmittedChild = governedChildren.some((item) => item.status === "admitted");
    if (hasAdmittedChild && !hasAdmittedRecord(admissionsBySubject.get(concept.conceptId))) errors.push(`qualified_fee_semantics_concept_admission_missing:${concept.conceptId}`);
    for (const item of governedChildren) {
      const records = admissionsBySubject.get("aliasId" in item ? item.aliasId : item.assertionId);
      if (item.status === "admitted" && !hasAdmittedRecord(records)) errors.push(`qualified_fee_semantics_subject_admission_missing:${"aliasId" in item ? item.aliasId : item.assertionId}`);
      if (item.status !== "admitted" && hasAdmittedRecord(records)) errors.push(`qualified_fee_semantics_candidate_or_conflict_admitted:${"aliasId" in item ? item.aliasId : item.assertionId}`);
    }
  }
  for (const [subjectRef, records] of admissionsBySubject) {
    if (records.filter((item) => ADMITTED_LIFECYCLES.has(item.lifecycle)).length > 1) errors.push(`qualified_fee_semantics_multiple_admitted_records:${subjectRef}`);
  }

  const auditIds = new Set<string>();
  const auditedAdmissions = new Set<string>();
  const auditedSnapshots = new Set<string>();
  for (const event of input.auditTrail) {
    if (!safeId(event.auditEventId) || auditIds.has(event.auditEventId)) errors.push(`qualified_fee_semantics_audit_duplicate_or_invalid:${event.auditEventId}`);
    auditIds.add(event.auditEventId);
    if (event.policyVersion !== QUALIFIED_FEE_SEMANTICS_GOVERNANCE_POLICY_VERSION || !validIsoInstant(event.occurredAt)) errors.push(`qualified_fee_semantics_audit_event_invalid:${event.auditEventId}`);
    if (event.admissionRef !== null) {
      if (!admissionById.has(event.admissionRef)) errors.push(`qualified_fee_semantics_audit_admission_missing:${event.auditEventId}`);
      auditedAdmissions.add(event.admissionRef);
    }
    for (const ref of event.sourceSnapshotRefs) {
      if (!snapshotById.has(ref)) errors.push(`qualified_fee_semantics_audit_snapshot_missing:${event.auditEventId}:${ref}`);
      auditedSnapshots.add(ref);
    }
  }
  for (const admission of input.admissions) if (!auditedAdmissions.has(admission.admissionId)) errors.push(`qualified_fee_semantics_admission_audit_missing:${admission.admissionId}`);
  for (const snapshot of input.sourceSnapshots) if (!auditedSnapshots.has(snapshot.snapshotId)) errors.push(`qualified_fee_semantics_snapshot_audit_missing:${snapshot.snapshotId}`);
  return [...new Set(errors)].sort();
}

export function createQualifiedFeeSemanticCatalog(input: QualifiedFeeSemanticCatalog): QualifiedFeeSemanticCatalog {
  const errors = validateQualifiedFeeSemanticCatalog(input);
  if (errors.length > 0) throw new Error(`invalid_qualified_fee_semantics_catalog:${errors.join(",")}`);
  return deepFreeze(structuredClone(input));
}

export function resolveQualifiedFeeSemanticsCatalog(
  input: QualifiedFeeSemanticCatalog,
  query: FeeSemanticQuery,
): QualifiedFeeSemanticResolution {
  const validationErrors = validateQualifiedFeeSemanticCatalog(input);
  if (validationErrors.length > 0) {
    const emptyCatalog: FeeSemanticCatalog = {
      modelVersion: FEE_SEMANTICS_EVIDENCE_MODEL_VERSION,
      catalogVersion: input.catalog.catalogVersion,
      evidence: [],
      concepts: [],
    };
    const resolution = resolveFeeSemantics(emptyCatalog, query);
    return {
      governanceStatus: "invalid",
      catalogVersion: input.catalog.catalogVersion,
      validationErrors,
      resolution: { ...resolution, reasonCodes: ["qualified_fee_semantics_catalog_invalid", ...validationErrors] },
      admissionRefs: [],
      sourceSnapshotRefs: [],
    };
  }
  const resolution = resolveFeeSemantics(input.catalog, query);
  const evidenceRefs = new Set(resolution.qualifiedKnowledgeRefs);
  const sourceSnapshots = input.sourceSnapshots.filter((item) => evidenceRefs.has(item.evidenceRef));
  const sourceSnapshotRefs = sourceSnapshots.map((item) => item.snapshotId).sort();
  const sourceSnapshotSet = new Set(sourceSnapshotRefs);
  const subjectRefs = new Set([
    ...(resolution.conceptId ? [resolution.conceptId] : []),
    ...resolution.candidates.filter((item) => item.acceptanceEligible).map((item) => item.aliasId),
    ...Object.values(resolution.axes).flatMap((axis) => axis.assertionRefs),
  ]);
  const admissionRefs = input.admissions
    .filter((item) => ADMITTED_LIFECYCLES.has(item.lifecycle) && subjectRefs.has(item.subjectRef)
      && item.sourceSnapshotRefs.some((ref) => sourceSnapshotSet.has(ref)))
    .map((item) => item.admissionId)
    .sort();
  return {
    governanceStatus: "valid",
    catalogVersion: input.catalog.catalogVersion,
    validationErrors: [],
    resolution,
    admissionRefs,
    sourceSnapshotRefs,
  };
}

function governedSubjectIndex(catalog: FeeSemanticCatalog): Map<string, FeeSemanticGovernedSubjectType> {
  const index = new Map<string, FeeSemanticGovernedSubjectType>();
  for (const concept of catalog.concepts) {
    index.set(concept.conceptId, "concept");
    for (const alias of concept.aliases) index.set(alias.aliasId, "alias");
    for (const assertion of concept.assertions) index.set(assertion.assertionId, "assertion");
  }
  return index;
}

function governedSubjectEvidenceIndex(catalog: FeeSemanticCatalog): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const concept of catalog.concepts) {
    index.set(concept.conceptId, new Set([...concept.aliases, ...concept.assertions].flatMap((item) => item.evidenceRefs)));
    for (const alias of concept.aliases) index.set(alias.aliasId, new Set(alias.evidenceRefs));
    for (const assertion of concept.assertions) index.set(assertion.assertionId, new Set(assertion.evidenceRefs));
  }
  return index;
}

function hasAdmittedRecord(records: readonly FeeSemanticAdmissionRecord[] | undefined): boolean {
  return Boolean(records?.some((item) => ADMITTED_LIFECYCLES.has(item.lifecycle)));
}

function safeId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value);
}

function validIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

function validIsoInstant(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
