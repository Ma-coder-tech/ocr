import type { FiservFeeReferenceEntry } from "../../../fiservFeeReference.js";
import type { ReferenceRateCatalogRow } from "../../../referenceRateCatalog.js";
import {
  knowledgeExact,
  knowledgeUnknown,
  unboundedKnowledgeScope,
  type KnowledgeCandidatePacket,
  type KnowledgeClaimValue,
  type KnowledgeScope,
  type KnowledgeSourceAuthority,
} from "./knowledgeTypes.js";
import { containsPrivateLocatorOrPayload, hasExactKeys, isCanonicalCode, isRecord, isSafeStructuredString, isValidIsoDay, validateScopeShape, validClosedOpenInterval } from "./knowledgeSafety.js";
import { validateKnowledgeClaimValue } from "./knowledgeValidate.js";

const PACKET_KEYS = [
  "candidateId", "proposedClaimType", "proposedSubjectCode", "proposedValue", "sourceAuthority", "claimedConfidence", "lifecycle",
  "requiresHumanAdmission", "privacy", "proposedScope", "proposedVisibility", "tenantRef", "accountRef", "effectiveFrom",
  "effectiveTo", "publicationDate", "evidence", "basis", "provenance", "knownConflictCodes", "limitations",
] as const;
const SOURCE_AUTHORITIES = new Set([
  "official_network_publication", "processor_publication", "merchant_contract", "account_statement_observation", "statement_observation",
  "verified_cross_statement_observation", "admitted_template_specification", "approved_internal_manual_mapping", "synthetic_test_fixture",
  "legacy_reference_candidate", "automated_retrieval", "ai_inference",
]);
const BOUNDED_INTELLIGENCE_LIMITATION_CODES = new Set([
  "automated_research_candidate",
  "claim_specific_semantic_support_candidate",
  "human_review_required",
  "narrow_scope_only",
  "no_economic_category_or_savings_inference",
  "ownership_control_and_savings_unresolved",
  "public_definition_does_not_establish_account_applicability",
  "public_scope_applicability_unproven",
  "public_source_does_not_establish_account_applicability",
  "terminology_example_presentation_only",
  "verified_public_scope_must_be_preserved",
]);
const BOUNDED_INTELLIGENCE_CONFLICT_CODES = new Set(["conflicting_supported_candidates"]);
const safeCode = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";

function candidateScope(): KnowledgeScope {
  return { ...unboundedKnowledgeScope() };
}

function claimedAuthority(row: ReferenceRateCatalogRow): KnowledgeSourceAuthority {
  if (row.sourceType === "official_network_doc") return "official_network_publication";
  if (row.sourceType === "acquirer_schedule" || row.sourceType === "processor_contract") return "processor_publication";
  return "legacy_reference_candidate";
}

function referenceScope(row: ReferenceRateCatalogRow): KnowledgeScope {
  const scope = candidateScope();
  scope.network = knowledgeExact(safeCode(row.network));
  scope.region = knowledgeExact(safeCode(row.region));
  scope.jurisdiction = knowledgeExact(safeCode(row.region));
  if (row.cardProduct !== null) scope.cardProduct = knowledgeExact(safeCode(row.cardProduct));
  if (row.rateScope === "acquirer_specific") scope.acquirer = knowledgeExact(safeCode(row.sourceName));
  else if (row.rateScope === "processor_specific") scope.processor = knowledgeExact(safeCode(row.sourceName));
  else if (row.rateScope === "merchant_contract_specific" || row.rateScope === "inferred") {
    scope.acquirer = knowledgeUnknown();
    scope.processor = knowledgeUnknown();
  }
  return scope;
}

function referenceRateValue(row: ReferenceRateCatalogRow): KnowledgeClaimValue {
  const fixed = row.rateBasis === "per_item" || row.rateBasis === "per_auth" ? row.perItemFee
    : row.rateBasis === "flat_monthly" ? row.flatFee : null;
  return {
    kind: "rate",
    basisCode: row.rateBasis,
    rateBasisPoints: row.rateBasis === "percent_of_volume" && row.percentRate !== null ? row.percentRate * 10_000 : null,
    fixedAmountMinor: fixed === null ? null : fixed * 100,
    currency: null,
  };
}

function packetBase(params: {
  id: string;
  claimType: KnowledgeCandidatePacket["proposedClaimType"];
  subjectCode: string;
  value: KnowledgeClaimValue;
  scope: KnowledgeScope;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publicationDate: string | null;
  basis: KnowledgeCandidatePacket["basis"];
  provenance: KnowledgeCandidatePacket["provenance"];
  claimedConfidence?: KnowledgeCandidatePacket["claimedConfidence"];
  limitations: string[];
  knownConflictCodes?: string[];
}): KnowledgeCandidatePacket {
  return {
    candidateId: params.id,
    proposedClaimType: params.claimType,
    proposedSubjectCode: params.subjectCode,
    proposedValue: params.value,
    sourceAuthority: "legacy_reference_candidate",
    claimedConfidence: params.claimedConfidence ?? null,
    lifecycle: "candidate",
    requiresHumanAdmission: true,
    privacy: "private_by_default",
    proposedScope: params.scope,
    proposedVisibility: "reusable",
    tenantRef: null,
    accountRef: null,
    effectiveFrom: params.effectiveFrom,
    effectiveTo: params.effectiveTo,
    publicationDate: params.publicationDate,
    evidence: [{ ref: params.provenance.sourceRecordRef, sourceAuthority: "legacy_reference_candidate", private: false }],
    basis: params.basis,
    provenance: params.provenance,
    knownConflictCodes: params.knownConflictCodes ?? [],
    limitations: params.limitations,
  };
}

export function validateKnowledgeCandidatePacket(packet: KnowledgeCandidatePacket): readonly string[] {
  const raw = packet as unknown;
  const issues: string[] = [];
  if (!isRecord(raw) || !hasExactKeys(raw, PACKET_KEYS)) return ["invalid_candidate_packet_shape"];
  if (!isSafeStructuredString(raw.candidateId) || !isSafeStructuredString(raw.proposedSubjectCode)) issues.push("invalid_candidate_identity");
  if (raw.lifecycle !== "candidate" || raw.requiresHumanAdmission !== true || raw.privacy !== "private_by_default") issues.push("invalid_candidate_authority_state");
  if (!SOURCE_AUTHORITIES.has(String(raw.sourceAuthority))) issues.push("invalid_candidate_source_authority");
  if (raw.claimedConfidence !== null && !["high", "medium", "low", "unresolved"].includes(String(raw.claimedConfidence))) issues.push("invalid_candidate_confidence");
  issues.push(...validateKnowledgeClaimValue(raw.proposedClaimType, raw.proposedValue).map((item) => item.code));
  issues.push(...validateScopeShape(raw.proposedScope));
  if ((raw.effectiveFrom !== null && !isValidIsoDay(raw.effectiveFrom)) || (raw.effectiveTo !== null && !isValidIsoDay(raw.effectiveTo))
    || !validClosedOpenInterval(raw.effectiveFrom as string | null, raw.effectiveTo as string | null)) issues.push("invalid_candidate_effective_period");
  if (raw.publicationDate !== null && !isValidIsoDay(raw.publicationDate)) issues.push("invalid_candidate_publication_date");
  if (!Array.isArray(raw.evidence) || raw.evidence.some((item) => !isRecord(item) || !hasExactKeys(item, ["ref", "sourceAuthority", "private"])
    || !isSafeStructuredString(item.ref) || !SOURCE_AUTHORITIES.has(String(item.sourceAuthority)) || typeof item.private !== "boolean")
    || !Array.isArray(raw.limitations) || raw.limitations.some((item) => typeof item !== "string" || item.length > 500)
    || !Array.isArray(raw.knownConflictCodes) || raw.knownConflictCodes.some((item) => !isSafeStructuredString(item))
    || !isRecord(raw.basis) || !hasExactKeys(raw.basis, ["code", "unit", "denominator", "currency", "exactValue"])
    || Object.values(raw.basis).some((item) => item !== null && typeof item !== "string")
    || !isRecord(raw.provenance) || !hasExactKeys(raw.provenance, ["adapter", "sourceRecordRef", "sourceVersion", "sourceAuthorityClaim", "sourceFieldRefs"])
    || !["supplied", "reference_rate_catalog", "legacy_fiserv_fee_reference", "bounded_intelligence_runtime"].includes(String(raw.provenance?.adapter))
    || !isSafeStructuredString(raw.provenance?.sourceRecordRef) || !SOURCE_AUTHORITIES.has(String(raw.provenance?.sourceAuthorityClaim))
    || !Array.isArray(raw.provenance?.sourceFieldRefs) || raw.provenance.sourceFieldRefs.some((item) => !isSafeStructuredString(item))) issues.push("invalid_candidate_metadata");
  if (raw.tenantRef !== null && !isSafeStructuredString(raw.tenantRef)) issues.push("invalid_candidate_tenant_ref");
  if (raw.accountRef !== null && !isSafeStructuredString(raw.accountRef)) issues.push("invalid_candidate_account_ref");
  if (!["reusable", "tenant_private", "account_private"].includes(String(raw.proposedVisibility))) issues.push("invalid_candidate_visibility");
  else if (raw.proposedVisibility === "reusable" && (raw.tenantRef !== null || raw.accountRef !== null)) issues.push("candidate_reusable_boundary_contamination");
  else if (raw.proposedVisibility === "reusable" && Array.isArray(raw.evidence) && raw.evidence.some((item) => isRecord(item) && item.private === true)) issues.push("candidate_reusable_private_evidence");
  else if (raw.proposedVisibility === "tenant_private" && (raw.tenantRef === null || raw.accountRef !== null)) issues.push("invalid_candidate_tenant_boundary");
  else if (raw.proposedVisibility === "account_private" && (raw.tenantRef === null || raw.accountRef === null)) issues.push("invalid_candidate_account_boundary");
  if (isRecord(raw.provenance) && raw.provenance.adapter === "bounded_intelligence_runtime") {
    if (raw.proposedVisibility !== "account_private" || raw.tenantRef === null || raw.accountRef === null) {
      issues.push("bounded_intelligence_candidate_requires_account_private_boundary");
    }
    const identityAndReferenceStrings = [
      raw.candidateId,
      raw.provenance.sourceRecordRef,
      raw.provenance.sourceVersion,
      ...(Array.isArray(raw.provenance.sourceFieldRefs) ? raw.provenance.sourceFieldRefs : []),
      ...(Array.isArray(raw.evidence) ? raw.evidence.flatMap((item) => isRecord(item) ? [item.ref] : []) : []),
    ];
    if (identityAndReferenceStrings.some((item) => typeof item === "string" && containsPrivateLocatorOrPayload(item))) {
      issues.push("bounded_intelligence_candidate_contains_private_payload");
    }
    if (!Array.isArray(raw.limitations) || raw.limitations.some((item) => typeof item !== "string"
      || !isCanonicalCode(item) || !BOUNDED_INTELLIGENCE_LIMITATION_CODES.has(item))) {
      issues.push("bounded_intelligence_candidate_limitation_code_unapproved");
    }
    if (!Array.isArray(raw.knownConflictCodes) || raw.knownConflictCodes.some((item) => typeof item !== "string"
      || !BOUNDED_INTELLIGENCE_CONFLICT_CODES.has(item))) {
      issues.push("bounded_intelligence_candidate_conflict_code_unapproved");
    }
  }
  return [...new Set(issues)];
}

export function ingestKnowledgeCandidatePacket(packet: KnowledgeCandidatePacket): Readonly<KnowledgeCandidatePacket> {
  if (packet.provenance.adapter === "bounded_intelligence_runtime"
    && (packet.lifecycle !== "candidate" || packet.requiresHumanAdmission !== true || packet.privacy !== "private_by_default"
      || packet.proposedVisibility !== "account_private")) {
    throw new Error("bounded_intelligence_candidate_authority_strengthening_refused");
  }
  const normalized: KnowledgeCandidatePacket = {
    ...packet,
    lifecycle: "candidate",
    requiresHumanAdmission: true,
    privacy: "private_by_default",
  };
  const issues = validateKnowledgeCandidatePacket(normalized);
  if (issues.length > 0) throw new Error(`invalid_knowledge_candidate:${issues.join(",")}`);
  return Object.freeze({
    ...normalized,
    proposedValue: Object.freeze({ ...normalized.proposedValue }),
    proposedScope: Object.freeze(Object.fromEntries(Object.entries(normalized.proposedScope).map(([key, value]) => [key, Object.freeze({ ...value })]))) as KnowledgeScope,
    evidence: Object.freeze(normalized.evidence.map((item) => Object.freeze({ ...item }))) as unknown as KnowledgeCandidatePacket["evidence"],
    basis: Object.freeze({ ...normalized.basis }),
    provenance: Object.freeze({ ...normalized.provenance, sourceFieldRefs: Object.freeze([...normalized.provenance.sourceFieldRefs]) as unknown as string[] }),
    knownConflictCodes: Object.freeze([...normalized.knownConflictCodes]) as unknown as string[],
    limitations: Object.freeze([...normalized.limitations]) as unknown as string[],
  });
}

export function referenceRateRowToKnowledgeCandidates(row: ReferenceRateCatalogRow): KnowledgeCandidatePacket[] {
  const base = safeCode(row.feeCode);
  const scope = referenceScope(row);
  const exactValue = row.rateBasis === "percent_of_volume" ? row.percentRate
    : row.rateBasis === "flat_monthly" ? row.flatFee : row.perItemFee;
  const provenance: KnowledgeCandidatePacket["provenance"] = {
    adapter: "reference_rate_catalog",
    sourceRecordRef: `reference-rate:${base}:${safeCode(row.sourceVersion)}`,
    sourceVersion: row.sourceVersion,
    sourceAuthorityClaim: claimedAuthority(row),
    sourceFieldRefs: ["feeCode", "network", "cardProduct", "rateBasis", "effectiveFrom", "effectiveTo", "region", "rateScope", "sourceType", "sourceName", "sourceVersion"],
  };
  const basis: KnowledgeCandidatePacket["basis"] = {
    code: row.rateBasis,
    unit: row.rateBasis === "percent_of_volume" ? "decimal_rate" : "source_currency_unit",
    denominator: row.rateBasis === "percent_of_volume" ? "volume" : row.rateBasis === "per_auth" ? "authorization" : row.rateBasis === "per_item" ? "item" : "period",
    currency: null,
    exactValue: exactValue === null ? null : String(exactValue),
  };
  const common = {
    scope, effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo, publicationDate: null,
    basis, provenance, claimedConfidence: row.confidence === "verified" ? "high" as const : row.confidence === "deprecated" ? "low" as const : "unresolved" as const,
    knownConflictCodes: [row.minimumFee !== null ? "minimum_requires_review" : "", row.maximumFee !== null ? "maximum_requires_review" : ""].filter(Boolean),
  };
  return [
    packetBase({
      id: `legacy-rate-${base}`, claimType: "published_network_rate", subjectCode: base, value: referenceRateValue(row), ...common,
      limitations: ["Legacy catalog metadata is candidate evidence and requires claim-specific source admission."],
    }),
    ...row.aliases.map((alias, index) => packetBase({
      id: `legacy-alias-${base}-${index}`, claimType: "alias_identity", subjectCode: safeCode(alias),
      value: { kind: "mapping", canonicalCode: base, sourceCode: safeCode(alias) }, ...common,
      provenance: { ...provenance, sourceFieldRefs: ["feeCode", `aliases:${index}`, "network", "region", "rateScope", "effectiveFrom", "effectiveTo"] },
      limitations: ["A familiar label is candidate evidence only and cannot establish identity or rate applicability."],
    })),
  ];
}

function mapLegacyParticipant(value: string): KnowledgeClaimValue & { kind: "role" } {
  const code = safeCode(value);
  const role = code === "processor" ? "processor_platform"
    : code === "acquirer" ? "acquirer"
      : code.includes("network") ? "network_card_brand"
        : code === "merchant" ? "merchant"
          : null;
  return { kind: "role", participantRole: role, controlDimension: "economic_beneficiary", state: "unresolved" };
}

export function fiservFeeReferenceEntryToKnowledgeCandidates(row: FiservFeeReferenceEntry): KnowledgeCandidatePacket[] {
  const base = safeCode(row.id || row.canonical_name);
  const scope = candidateScope();
  scope.processor = knowledgeExact("fiserv");
  if (!/^all$|^processor$/i.test(row.network)) scope.network = knowledgeExact(safeCode(row.network));
  if (row.applies_to) scope.population = knowledgeExact(safeCode(row.applies_to));
  const provenance: KnowledgeCandidatePacket["provenance"] = {
    adapter: "legacy_fiserv_fee_reference",
    sourceRecordRef: `fiserv-reference:${base}`,
    sourceVersion: row.last_verified || null,
    sourceAuthorityClaim: "legacy_reference_candidate",
    sourceFieldRefs: ["id", "network", "canonical_name", "effective_date", "last_verified"],
  };
  const basis: KnowledgeCandidatePacket["basis"] = {
    code: safeCode(row.rate_type), unit: row.rate_unit || null, denominator: safeCode(row.applies_to),
    currency: /^[A-Z]{3}$/.test(row.rate_unit) ? row.rate_unit : null,
    exactValue: row.reference_rate === null ? null : String(row.reference_rate),
  };
  const common = { scope, effectiveFrom: row.effective_date || null, effectiveTo: null, publicationDate: null, basis, provenance };
  const packets: KnowledgeCandidatePacket[] = row.fiserv_labels.map((label, index) => packetBase({
    id: `fiserv-alias-${base}-${index}`, claimType: "alias_identity", subjectCode: safeCode(label),
    value: { kind: "mapping", canonicalCode: base, sourceCode: safeCode(label) }, ...common,
    provenance: { ...provenance, sourceFieldRefs: ["id", `fiserv_labels:${index}`, "network", "effective_date"] },
    limitations: ["Legacy Fiserv mappings are processor-scoped candidates, not canonical authority."],
  }));
  if (row.reference_rate !== null) packets.push(packetBase({
    id: `fiserv-rate-${base}`, claimType: "processor_term", subjectCode: base,
    value: { kind: "term", termCode: safeCode(row.rate_type), termValue: String(row.reference_rate) }, ...common,
    provenance: { ...provenance, sourceFieldRefs: ["reference_rate", "rate_type", "rate_unit", "applies_to", "effective_date", "verification_formula", "tolerance_pct"] },
    limitations: ["Legacy processor rate requires source, scope, effective-date, and human admission review."],
  }));
  packets.push(packetBase({
    id: `fiserv-beneficiary-${base}`, claimType: "participant_control_role", subjectCode: base,
    value: mapLegacyParticipant(row.paid_to), ...common,
    provenance: { ...provenance, sourceFieldRefs: ["paid_to", "network", "category", "effective_date"] },
    limitations: ["Legacy paid-to material is an unresolved candidate and cannot establish RD participant/control truth."],
  }));
  packets.push(packetBase({
    id: `fiserv-negotiability-${base}`, claimType: "merchant_lever_availability", subjectCode: base,
    value: { kind: "rule", ruleCode: "legacy_negotiability_assertion", outcomeCode: row.negotiable ? "claimed_negotiable" : "claimed_not_negotiable" }, ...common,
    provenance: { ...provenance, sourceFieldRefs: ["negotiable", "category", "notes", "effective_date"] },
    limitations: ["Legacy negotiability is a candidate assertion only and cannot establish a merchant lever."],
  }));
  return packets;
}
