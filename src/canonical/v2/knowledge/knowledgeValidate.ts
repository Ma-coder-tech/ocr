import {
  APPROVED_ADMISSION_AUTHORITIES,
  KNOWLEDGE_CLAIM_POLICIES,
  NON_AUTHORITATIVE_SOURCE_CLASSES,
  RESOLVING_LIFECYCLE_STATES,
} from "./knowledgePolicy.js";
import {
  KNOWLEDGE_CLAIM_TYPES,
  KNOWLEDGE_LIFECYCLE_STATES,
  type KnowledgeClaimType,
  type KnowledgeClaimValue,
  type KnowledgeEntry,
  type KnowledgeQuery,
  type KnowledgeValidationIssue,
  type KnowledgeValidationResult,
} from "./knowledgeTypes.js";
import {
  KNOWLEDGE_SCOPE_DIMENSIONS,
  containsPrivateLocatorOrPayload,
  hasExactKeys,
  isCanonicalCode,
  isRecord,
  isSafeStructuredString,
  isValidIsoDay,
  isValidIsoInstant,
  sameOrNarrowerVisibility,
  scopeNarrowerOrEqual,
  validateQueryScopeShape,
  validateScopeShape,
  validClosedOpenInterval,
} from "./knowledgeSafety.js";

const CLAIM_TYPES = new Set<string>(KNOWLEDGE_CLAIM_TYPES);
const LIFECYCLES = new Set<string>(KNOWLEDGE_LIFECYCLE_STATES);
const VISIBILITIES = new Set(["reusable", "tenant_private", "account_private"]);
const CONFIDENCE = new Set(["high", "medium", "low", "unresolved"]);
const AUTHORITIES = new Set([
  "official_network_publication", "processor_publication", "merchant_contract", "account_statement_observation",
  "statement_observation", "verified_cross_statement_observation", "admitted_template_specification",
  "approved_internal_manual_mapping", "synthetic_test_fixture", "legacy_reference_candidate", "automated_retrieval", "ai_inference",
]);
const ROLE_VALUES = new Set([
  "merchant", "processor_platform", "acquirer", "iso_reseller_agent", "gateway", "network_card_brand",
  "issuer_interchange_system", "debit_network", "service_provider", "equipment_lessor", "funding_provider", "rule_regulatory_authority",
]);
const CONTROL_DIMENSIONS = new Set([
  "collector", "billing_intermediary", "economic_beneficiary", "economic_owner", "rule_setter", "price_setter",
  "negotiator_change_authority", "contractual_controller", "constraint",
]);
const RESOLUTION_STATES = new Set(["proven", "unresolved", "conflicting", "unavailable", "not_applicable"]);
const RATE_BASES = new Set(["percent_of_volume", "per_item", "per_auth", "flat_monthly", "variable"]);
const ENTRY_KEYS = [
  "id", "version", "claimType", "subjectCode", "value", "scope", "visibility", "tenantRef", "accountRef",
  "effectiveFrom", "effectiveTo", "evidence", "admission", "supersedes", "limitations", "confidence",
] as const;

function issue(code: string, entryRef: string | null, message: string): KnowledgeValidationIssue {
  return { code, entryRef, message };
}

function finiteOrNull(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isSafeStructuredString);
}

export function validateKnowledgeClaimValue(claimType: unknown, rawValue: unknown, entryRef: string | null = null): KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  if (typeof claimType !== "string" || !CLAIM_TYPES.has(claimType)) {
    return [issue("unknown_claim_type", entryRef, "Knowledge claim type is not registered by RF v0.2.")];
  }
  if (!isRecord(rawValue) || typeof rawValue.kind !== "string") {
    return [issue("invalid_claim_value", entryRef, "Knowledge claim value must use a recognized typed value.")];
  }
  const value = rawValue as Record<string, unknown>;
  const exact = (keys: readonly string[]): void => {
    if (!hasExactKeys(value, keys)) issues.push(issue("invalid_value_shape", entryRef, "Knowledge value contains missing or unsupported fields."));
  };
  switch (value.kind) {
    case "identity":
      exact(["kind", "canonicalCode"]);
      if (!isCanonicalCode(value.canonicalCode)) issues.push(issue("invalid_identity_value", entryRef, "Identity values require a canonical code."));
      break;
    case "mapping":
      exact(["kind", "canonicalCode", "sourceCode"]);
      if (!isCanonicalCode(value.canonicalCode) || !isCanonicalCode(value.sourceCode)) issues.push(issue("invalid_mapping_value", entryRef, "Mapping values require canonical source and target codes."));
      break;
    case "rate":
      exact(["kind", "basisCode", "rateBasisPoints", "fixedAmountMinor", "currency"]);
      if (!RATE_BASES.has(String(value.basisCode)) || !finiteOrNull(value.rateBasisPoints) || !finiteOrNull(value.fixedAmountMinor)
        || (value.rateBasisPoints === null && value.fixedAmountMinor === null)
        || (value.currency !== null && (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)))) {
        issues.push(issue("invalid_rate_value", entryRef, "Rate values require an approved basis, exact finite components, and optional ISO currency."));
      }
      break;
    case "term":
      exact(["kind", "termCode", "termValue"]);
      if (!isCanonicalCode(value.termCode) || !isSafeStructuredString(value.termValue)) issues.push(issue("invalid_term_value", entryRef, "Term values require a canonical term code and structured value."));
      break;
    case "rule":
      exact(["kind", "ruleCode", "outcomeCode"]);
      if (!isCanonicalCode(value.ruleCode) || !isCanonicalCode(value.outcomeCode)) issues.push(issue("invalid_rule_value", entryRef, "Rule values require canonical rule and outcome codes."));
      break;
    case "threshold":
      exact(["kind", "numeratorCode", "denominatorCode", "thresholdBasisPoints"]);
      if (!isCanonicalCode(value.numeratorCode) || !isCanonicalCode(value.denominatorCode)
        || typeof value.thresholdBasisPoints !== "number" || !Number.isFinite(value.thresholdBasisPoints)) {
        issues.push(issue("invalid_threshold_value", entryRef, "Threshold values require typed populations and a finite threshold."));
      }
      break;
    case "role":
      exact(["kind", "participantRole", "controlDimension", "state"]);
      if ((value.participantRole !== null && !ROLE_VALUES.has(String(value.participantRole)))
        || !CONTROL_DIMENSIONS.has(String(value.controlDimension)) || !RESOLUTION_STATES.has(String(value.state))
        || (value.state === "proven" && value.participantRole === null)) {
        issues.push(issue("invalid_role_value", entryRef, "Participant/control knowledge must use approved RD role, control, and resolution vocabularies."));
      }
      break;
    case "boolean":
      exact(["kind", "value"]);
      if (typeof value.value !== "boolean") issues.push(issue("invalid_boolean_value", entryRef, "Boolean knowledge requires a boolean value."));
      break;
    default:
      issues.push(issue("invalid_claim_value", entryRef, "Knowledge claim value kind is not recognized."));
  }
  const expectedKinds: Record<KnowledgeClaimType, readonly KnowledgeClaimValue["kind"][]> = {
    template_identity: ["identity"], template_section_semantics: ["mapping", "rule"], alias_identity: ["mapping"],
    network_program_mapping: ["mapping"], stable_facet_mapping: ["mapping"], published_network_rate: ["rate"],
    processor_term: ["term"], merchant_account_term: ["term"], refund_underlying_cost_rule: ["rule"],
    refund_processor_pricing_rule: ["rule"], pricing_program_rule: ["rule"], dispute_threshold_rule: ["threshold"],
    participant_control_role: ["role"], amex_acceptance_structure: ["mapping"], notice_notification_fact: ["boolean", "term"],
    notice_external_rule: ["rule", "term"], merchant_lever_availability: ["boolean", "rule"], benchmark_qualification: ["rule", "threshold"],
  };
  if (!expectedKinds[claimType as KnowledgeClaimType].includes(value.kind as KnowledgeClaimValue["kind"])) {
    issues.push(issue("claim_value_kind_mismatch", entryRef, `Value kind ${String(value.kind)} cannot establish ${claimType}.`));
  }
  return issues;
}

function reusableStrings(entry: Record<string, unknown>): string[] {
  const value = isRecord(entry.value) ? Object.values(entry.value).filter((item): item is string => typeof item === "string") : [];
  const limitations = Array.isArray(entry.limitations) ? entry.limitations.filter((item): item is string => typeof item === "string") : [];
  const evidence = Array.isArray(entry.evidence)
    ? entry.evidence.flatMap((item) => isRecord(item) && typeof item.ref === "string" ? [item.ref] : [])
    : [];
  const scopeValues = isRecord(entry.scope)
    ? Object.values(entry.scope).flatMap((item) => isRecord(item) && typeof item.value === "string" ? [item.value] : [])
    : [];
  const admissionValues = isRecord(entry.admission)
    ? [typeof entry.admission.authorityRef === "string" ? entry.admission.authorityRef : "",
      ...(Array.isArray(entry.admission.conditions) ? entry.admission.conditions.flatMap((condition) => isRecord(condition) && isRecord(condition.requiredScope)
        ? Object.values(condition.requiredScope).filter((item): item is string => typeof item === "string") : []) : [])]
    : [];
  return [String(entry.id ?? ""), String(entry.subjectCode ?? ""), ...value, ...limitations, ...evidence, ...scopeValues, ...admissionValues];
}

export function validateKnowledgeEntry(rawEntry: KnowledgeEntry): KnowledgeValidationResult {
  const entryRecord = rawEntry as unknown;
  if (!isRecord(entryRecord)) return { valid: false, issues: [issue("invalid_entry_shape", null, "Knowledge entry must be an object.")] };
  const entryRef = typeof entryRecord.id === "string" ? entryRecord.id : null;
  const issues: KnowledgeValidationIssue[] = [];
  if (!hasExactKeys(entryRecord, ENTRY_KEYS)) issues.push(issue("invalid_entry_shape", entryRef, "Knowledge entry contains missing or unsupported fields."));
  if (!isSafeStructuredString(entryRecord.id) || !isCanonicalCode(entryRecord.subjectCode)
    || !Number.isInteger(entryRecord.version) || Number(entryRecord.version) < 1) issues.push(issue("invalid_identity", entryRef, "Entry identity, canonical subject, and positive version are required."));
  if (typeof entryRecord.claimType !== "string" || !CLAIM_TYPES.has(entryRecord.claimType)) issues.push(issue("unknown_claim_type", entryRef, "Knowledge claim type is not registered by RF v0.2."));
  issues.push(...validateKnowledgeClaimValue(entryRecord.claimType, entryRecord.value, entryRef));

  const scopeIssues = validateScopeShape(entryRecord.scope);
  for (const code of scopeIssues) issues.push(issue(code.split(":")[0]!, entryRef, code));
  const visibilityValid = typeof entryRecord.visibility === "string" && VISIBILITIES.has(entryRecord.visibility);
  if (!visibilityValid) issues.push(issue("invalid_visibility", entryRef, "Knowledge visibility is invalid."));
  if (entryRecord.tenantRef !== null && !isSafeStructuredString(entryRecord.tenantRef)) issues.push(issue("invalid_tenant_ref", entryRef, "Tenant references must be opaque structured identifiers."));
  if (entryRecord.accountRef !== null && !isSafeStructuredString(entryRecord.accountRef)) issues.push(issue("invalid_account_ref", entryRef, "Account references must be opaque structured identifiers."));
  if ((entryRecord.effectiveFrom !== null && !isValidIsoDay(entryRecord.effectiveFrom)) || (entryRecord.effectiveTo !== null && !isValidIsoDay(entryRecord.effectiveTo))) {
    issues.push(issue("invalid_effective_date", entryRef, "Effective dates must be real ISO calendar days or explicit null bounds."));
  } else if (!validClosedOpenInterval(entryRecord.effectiveFrom as string | null, entryRecord.effectiveTo as string | null)) {
    issues.push(issue("invalid_effective_interval", entryRef, "Knowledge requires a non-empty closed-open effective interval."));
  }

  if (!Array.isArray(entryRecord.evidence)) issues.push(issue("invalid_evidence", entryRef, "Evidence must be an array."));
  else for (const rawEvidence of entryRecord.evidence) {
    if (!isRecord(rawEvidence) || !hasExactKeys(rawEvidence, ["ref", "sourceAuthority", "private"])
      || !isSafeStructuredString(rawEvidence.ref) || !AUTHORITIES.has(String(rawEvidence.sourceAuthority)) || typeof rawEvidence.private !== "boolean") {
      issues.push(issue("invalid_evidence", entryRef, "Evidence references must use the exact typed evidence contract."));
    }
  }

  if (!isRecord(entryRecord.admission) || !hasExactKeys(entryRecord.admission, ["lifecycle", "authorityClass", "authorityRef", "admittedAt", "conditions"])) issues.push(issue("invalid_admission_shape", entryRef, "Admission metadata must use the exact RF admission contract."));
  const admission = isRecord(entryRecord.admission) ? entryRecord.admission : {};
  if (typeof admission.lifecycle !== "string" || !LIFECYCLES.has(admission.lifecycle)) issues.push(issue("invalid_lifecycle", entryRef, "Admission lifecycle is invalid."));
  if (admission.authorityClass !== null && !APPROVED_ADMISSION_AUTHORITIES.has(String(admission.authorityClass))) issues.push(issue("invalid_admission_authority", entryRef, "Admission authority must be approved."));
  if (admission.authorityRef !== null && !isSafeStructuredString(admission.authorityRef)) issues.push(issue("invalid_admission_authority_ref", entryRef, "Admission authority reference must be opaque."));
  if (admission.admittedAt !== null && !isValidIsoInstant(admission.admittedAt)) issues.push(issue("invalid_admission_timestamp", entryRef, "Admission timestamp must be a valid UTC instant."));
  if (!Array.isArray(admission.conditions)) issues.push(issue("invalid_admission_conditions", entryRef, "Admission conditions must be an array."));
  else for (const rawCondition of admission.conditions) {
    if (!isRecord(rawCondition) || !hasExactKeys(rawCondition, ["type", "claimType", "requiredSourceAuthorities", "requiredScope", "effectiveFrom", "effectiveTo", "evaluation", "evaluatedAt"])) {
      issues.push(issue("invalid_admission_condition", entryRef, "Conditions must use the structured claim/evidence/scope/period contract."));
      continue;
    }
    if (rawCondition.type !== "claim_evidence_scope_period" || rawCondition.claimType !== entryRecord.claimType
      || rawCondition.evaluation !== "satisfied" || !isValidIsoInstant(rawCondition.evaluatedAt)
      || !validClosedOpenInterval(rawCondition.effectiveFrom as string | null, rawCondition.effectiveTo as string | null)) {
      issues.push(issue("invalid_admission_condition", entryRef, "Condition identity, state, evaluation time, or period is invalid."));
    }
    if (!Array.isArray(rawCondition.requiredSourceAuthorities) || rawCondition.requiredSourceAuthorities.length === 0
      || rawCondition.requiredSourceAuthorities.some((authority) => !AUTHORITIES.has(String(authority)))) issues.push(issue("invalid_condition_evidence", entryRef, "A condition must require registered source authority evidence."));
    else if (Array.isArray(entryRecord.evidence)) {
      const evidenceItems = entryRecord.evidence as unknown[];
      if (rawCondition.requiredSourceAuthorities.some((authority) => !evidenceItems.some((evidence) => isRecord(evidence) && evidence.sourceAuthority === authority))) issues.push(issue("unproven_condition_evidence", entryRef, "Required condition evidence is not attached to the entry."));
    }
    if (!isRecord(rawCondition.requiredScope) || Object.keys(rawCondition.requiredScope).some((key) => !KNOWLEDGE_SCOPE_DIMENSIONS.includes(key as never))
      || Object.values(rawCondition.requiredScope).some((value) => !isSafeStructuredString(value))) issues.push(issue("invalid_condition_scope", entryRef, "Condition scope must use registered dimensions and structured exact values."));
  }

  if (!stringArray(entryRecord.supersedes) || new Set(entryRecord.supersedes).size !== entryRecord.supersedes.length) issues.push(issue("invalid_supersession_refs", entryRef, "Supersession references must be unique opaque IDs."));
  if (!Array.isArray(entryRecord.limitations) || !entryRecord.limitations.every((item) => typeof item === "string" && item.length <= 500)) issues.push(issue("invalid_limitations", entryRef, "Limitations must be bounded strings."));
  if (typeof entryRecord.confidence !== "string" || !CONFIDENCE.has(entryRecord.confidence)) issues.push(issue("invalid_confidence", entryRef, "Confidence state is invalid."));

  if (visibilityValid && entryRecord.visibility === "reusable") {
    const evidence = Array.isArray(entryRecord.evidence) ? entryRecord.evidence : [];
    if (entryRecord.tenantRef !== null || entryRecord.accountRef !== null || evidence.some((item) => isRecord(item) && item.private === true)) issues.push(issue("reusable_private_contamination", entryRef, "Reusable knowledge cannot contain tenant/account references or private evidence."));
    if (reusableStrings(entryRecord).some(containsPrivateLocatorOrPayload)) issues.push(issue("reusable_private_payload", entryRef, "Reusable knowledge contains a private locator, identifier, or account-derived payload."));
    if (evidence.some((item) => isRecord(item) && ["statement_observation", "verified_cross_statement_observation", "account_statement_observation"].includes(String(item.sourceAuthority)))) issues.push(issue("observation_cannot_be_reusable_authority", entryRef, "Statement recurrence may prioritize research but cannot establish reusable knowledge."));
  }
  if (visibilityValid && entryRecord.visibility === "tenant_private" && (entryRecord.tenantRef === null || entryRecord.accountRef !== null)) issues.push(issue("invalid_tenant_visibility", entryRef, "Tenant-private knowledge requires only a tenant reference."));
  if (visibilityValid && entryRecord.visibility === "account_private" && (entryRecord.tenantRef === null || entryRecord.accountRef === null)) issues.push(issue("invalid_account_visibility", entryRef, "Account-private knowledge requires tenant and account references."));
  if (entryRecord.claimType === "merchant_account_term" && entryRecord.visibility !== "account_private") issues.push(issue("account_term_scope_violation", entryRef, "A merchant account term cannot become reusable or merely tenant-wide knowledge."));

  const claimPolicy = typeof entryRecord.claimType === "string" && CLAIM_TYPES.has(entryRecord.claimType) ? KNOWLEDGE_CLAIM_POLICIES[entryRecord.claimType as KnowledgeClaimType] : null;
  if (claimPolicy && RESOLVING_LIFECYCLE_STATES.has(String(admission.lifecycle))) {
    if (admission.authorityClass === null || !APPROVED_ADMISSION_AUTHORITIES.has(String(admission.authorityClass)) || !isSafeStructuredString(admission.authorityRef) || !isValidIsoInstant(admission.admittedAt)) issues.push(issue("missing_human_admission", entryRef, "Resolvable knowledge requires approved human admission metadata."));
    if (!Array.isArray(entryRecord.evidence) || entryRecord.evidence.length === 0) issues.push(issue("missing_evidence", entryRef, "Resolvable knowledge requires claim-specific evidence."));
    for (const rawEvidence of Array.isArray(entryRecord.evidence) ? entryRecord.evidence : []) {
      if (!isRecord(rawEvidence) || typeof rawEvidence.sourceAuthority !== "string") continue;
      if (!claimPolicy.allowedSourceAuthorities.includes(rawEvidence.sourceAuthority as never)) issues.push(issue("evidence_policy_rejection", entryRef, `Source authority ${rawEvidence.sourceAuthority} is not admitted for ${entryRecord.claimType}.`));
      if (NON_AUTHORITATIVE_SOURCE_CLASSES.has(rawEvidence.sourceAuthority)) issues.push(issue("candidate_source_cannot_resolve", entryRef, "Candidate, automated, or AI evidence cannot establish admitted knowledge."));
    }
  }
  if (admission.lifecycle === "admitted_with_conditions" && (!Array.isArray(admission.conditions) || admission.conditions.length === 0)) issues.push(issue("unsatisfied_admission_conditions", entryRef, "Conditionally admitted knowledge requires validated conditions."));
  if (admission.lifecycle !== "admitted_with_conditions" && Array.isArray(admission.conditions) && admission.conditions.length > 0) issues.push(issue("conditions_on_unconditional_state", entryRef, "Only conditionally admitted entries may carry admission conditions."));
  if (scopeIssues.length === 0 && claimPolicy) {
    const scope = entryRecord.scope as KnowledgeEntry["scope"];
    if (scope.templateVersion.kind === "exact" && scope.templateFamily.kind !== "exact") issues.push(issue("orphan_template_version", entryRef, "An exact template version requires an exact template family."));
    for (const dimension of KNOWLEDGE_SCOPE_DIMENSIONS) if (scope[dimension].kind === "unbounded" && !claimPolicy.reusableUnboundedDimensions.includes(dimension)) issues.push(issue("unbounded_scope_not_permitted", entryRef, `Claim policy does not permit an unbounded ${dimension} dimension.`));
  }
  return { valid: issues.length === 0, issues };
}

export function validateKnowledgeQuery(rawQuery: KnowledgeQuery): KnowledgeValidationResult {
  const query = rawQuery as unknown;
  const issues: KnowledgeValidationIssue[] = [];
  if (!isRecord(query) || !hasExactKeys(query, ["claimType", "subjectCode", "asOf", "scope"])) return { valid: false, issues: [issue("invalid_query_shape", null, "Knowledge query must use the exact RF query contract.")] };
  if (typeof query.claimType !== "string" || !CLAIM_TYPES.has(query.claimType)) issues.push(issue("unknown_claim_type", null, "Knowledge query claim is not registered."));
  if (!isCanonicalCode(query.subjectCode)) issues.push(issue("invalid_query_subject", null, "Knowledge query subject must be canonical."));
  if (!isValidIsoDay(query.asOf)) issues.push(issue("invalid_query_date", null, "Knowledge query date must be a real ISO calendar day."));
  for (const code of validateQueryScopeShape(query.scope)) issues.push(issue(code.split(":")[0]!, null, code));
  return { valid: issues.length === 0, issues };
}

export function validateKnowledgeLibrary(entries: readonly KnowledgeEntry[]): KnowledgeValidationResult {
  const validations = new Map<KnowledgeEntry, KnowledgeValidationResult>();
  const issues = entries.flatMap((entry) => {
    const validation = validateKnowledgeEntry(entry);
    validations.set(entry, validation);
    return validation.issues;
  });
  const safeEntries = entries.filter((entry): entry is KnowledgeEntry => isRecord(entry));
  const ids = new Set<string>();
  for (const entry of safeEntries) {
    if (ids.has(entry.id)) issues.push(issue("duplicate_entry_id", entry.id, "Entry IDs must be unique and immutable."));
    ids.add(entry.id);
  }
  const byId = new Map(safeEntries.filter((entry) => typeof entry.id === "string").map((entry) => [entry.id, entry]));
  const graph = new Map<string, string[]>();
  const evidenceRank = (entry: KnowledgeEntry): number => {
    const groups = KNOWLEDGE_CLAIM_POLICIES[entry.claimType]?.precedence ?? [];
    for (let index = 0; index < groups.length; index += 1) {
      if (entry.evidence.some((evidence) => groups[index]!.includes(evidence.sourceAuthority))) return index;
    }
    return Number.POSITIVE_INFINITY;
  };
  for (const successor of safeEntries) {
    const successorRefs = Array.isArray((successor as KnowledgeEntry).supersedes) ? successor.supersedes : [];
    if (typeof successor.id === "string") graph.set(successor.id, [...successorRefs]);
    for (const predecessorRef of successorRefs) {
      const predecessor = byId.get(predecessorRef);
      if (!predecessor) {
        issues.push(issue("missing_superseded_entry", successor.id, "A supersession reference must identify an entry in the supplied immutable library."));
        continue;
      }
      if (predecessor.id === successor.id) issues.push(issue("circular_supersession", successor.id, "An entry cannot supersede itself."));
      if (predecessor.claimType !== successor.claimType || predecessor.subjectCode !== successor.subjectCode) issues.push(issue("cross_claim_supersession", successor.id, "Supersession cannot cross claim identity."));
      if (successor.version <= predecessor.version) issues.push(issue("non_monotonic_supersession", successor.id, "A successor must have a greater version than its predecessor."));
      if (!validations.get(successor)?.valid || !validations.get(predecessor)?.valid) continue;
      if (!sameOrNarrowerVisibility(successor, predecessor)) issues.push(issue("cross_boundary_supersession", successor.id, "A successor cannot broaden or cross tenant/account visibility."));
      if (!scopeNarrowerOrEqual(successor.scope, predecessor.scope)) issues.push(issue("scope_incompatible_supersession", successor.id, "A successor must be equal or narrower on every applicable scope dimension."));
      if (successor.effectiveFrom === null || (predecessor.effectiveFrom !== null && successor.effectiveFrom < predecessor.effectiveFrom)) issues.push(issue("period_incompatible_supersession", successor.id, "A successor requires an explicit start no earlier than its predecessor."));
      if (evidenceRank(successor) > evidenceRank(predecessor)) issues.push(issue("source_incompatible_supersession", successor.id, "A successor cannot suppress stronger claim-specific source authority."));
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) if (graph.has(next) && visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of graph.keys()) if (visit(id)) issues.push(issue("circular_supersession", id, "Supersession graph must be acyclic."));
  return { valid: issues.length === 0, issues };
}
