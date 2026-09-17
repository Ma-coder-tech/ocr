import { createHash } from "node:crypto";

import type { ClaimScopedQualificationIntegrityCostDriverAdmissionV1 } from "./claimScopedQualificationIntegrityCostDriverAdmissionV1.js";
import type { CommercialDecompositionContractV1, CommercialDecompositionRowV1 } from "./commercialDecompositionContractV1.js";
import type { CurrentRelationshipEconomicsProfileV1 } from "./currentRelationshipEconomicsProfileV1.js";
import { canonicalJson } from "./v2/canonicalJson.js";
import { combineMaterialityAxes, evaluateEconomicMateriality } from "./v2/runtime/materialityContract.js";
import {
  SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1,
  SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
  SHADOW_AI_ECONOMIC_RESOLUTION_PLANNER_SCHEMA_VERSION,
  type ShadowAiAcceptedActivityFactV1,
  type ShadowAiEconomicIssueClassV1,
  type ShadowAiEconomicResolutionIssueV1,
  type ShadowAiEconomicResolutionPacketV1,
  type ShadowAiEconomicResolutionSelectionV1,
  type ShadowAiMerchantBusinessContextV1,
  type ShadowAiParticipantControlStateV1,
  type ShadowAiRequiredEvidenceClassV1,
} from "./shadowAiEconomicResolutionPlannerTypesV1.js";

type Candidate = {
  issueClass: ShadowAiEconomicIssueClassV1;
  priority: 1 | 2 | 3;
  decisionTier: "D2" | "D1";
  rows: CommercialDecompositionRowV1[];
  rdRefs: string[];
  factRefs: string[];
  evidenceRefs: string[];
  facets: string[];
  reasons: string[];
  evidenceClasses: ShadowAiRequiredEvidenceClassV1[];
  competing: boolean;
  amountMinor: number | null;
  present: boolean;
};

export type ShadowAiMerchantBusinessContextInputV1 = Readonly<{
  businessName?: string | null;
  admittedBusinessCategory?: string | null;
  businessLocation?: Readonly<{ country?: string | null; region?: string | null; city?: string | null }> | null;
  knownChannel?: string | null;
  supportedOperatingContext?: readonly string[];
}>;

export type ShadowAiEconomicResolutionSelectionInputV1 = Readonly<{
  currentEconomics: CurrentRelationshipEconomicsProfileV1;
  commercialDecomposition: CommercialDecompositionContractV1;
  qualificationIntegrity: ClaimScopedQualificationIntegrityCostDriverAdmissionV1;
}>;

export function selectShadowAiEconomicResolutionIssuesV1(
  input: ShadowAiEconomicResolutionSelectionInputV1,
): ShadowAiEconomicResolutionSelectionV1 {
  assertSourceBindings(input);
  const candidates = buildCandidates(input);
  const selected: ShadowAiEconomicResolutionIssueV1[] = [];
  const suppressed: Array<ShadowAiEconomicResolutionSelectionV1["suppressedIssues"][number]> = [];
  const dedupe = new Set<string>();

  for (const candidate of candidates.sort((left, right) => left.priority - right.priority || left.issueClass.localeCompare(right.issueClass))) {
    const issueId = issueIdentity(input.currentEconomics, candidate);
    if (!candidate.present) {
      suppressed.push({ issueId, issueClass: candidate.issueClass, reasonCode: "NO_ACCEPTED_UNRESOLVED_INPUT" });
      continue;
    }
    const duplicateKey = canonicalJson({ issueClass: candidate.issueClass, rdRefs: unique(candidate.rdRefs), facets: unique(candidate.facets) });
    if (dedupe.has(duplicateKey)) {
      suppressed.push({ issueId, issueClass: candidate.issueClass, reasonCode: "DUPLICATE_INVESTIGATION" });
      continue;
    }
    if (candidate.rows.length > 0 && materialRows(candidate.rows, input.currentEconomics, candidate.decisionTier).length === 0) {
      suppressed.push({ issueId, issueClass: candidate.issueClass, reasonCode: "IMMATERIAL_OR_CONTEXT_ONLY" });
      continue;
    }
    if (selected.length >= SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumSelectedIssuesPerStatement) {
      suppressed.push({ issueId, issueClass: candidate.issueClass, reasonCode: "STATEMENT_ISSUE_BUDGET_EXHAUSTED" });
      continue;
    }
    dedupe.add(duplicateKey);
    selected.push(buildIssue(input, candidate, issueId));
  }

  return deepFreeze({
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_PLANNER_SCHEMA_VERSION,
    authority: "DETERMINISTIC_ISSUE_SELECTION",
    selectedIssues: selected,
    suppressedIssues: suppressed,
  });
}

export function compileShadowAiEconomicResolutionPacketsV1(input: {
  opaqueRunRef: string;
  selection: ShadowAiEconomicResolutionSelectionV1;
  currentEconomics: CurrentRelationshipEconomicsProfileV1;
  commercialDecomposition: CommercialDecompositionContractV1;
  merchantBusinessContext?: ShadowAiMerchantBusinessContextInputV1 | null;
  processorProgram?: string | null;
}): readonly ShadowAiEconomicResolutionPacketV1[] {
  if (!/^shadow-run-[a-f0-9]{16,64}$/.test(input.opaqueRunRef)) throw new Error("shadow_planner_opaque_run_ref_invalid");
  const merchantBusinessContext = compileMerchantBusinessContext(input.merchantBusinessContext ?? null, input.currentEconomics);
  const packets = input.selection.selectedIssues.map((issue) => {
    const packetWithoutHash = {
      schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
      purpose: "SHADOW_ECONOMIC_RESOLUTION_PLANNING_ONLY" as const,
      outputAuthorityRequired: "NON_AUTHORITATIVE" as const,
      opaqueRunRef: input.opaqueRunRef,
      issueId: issue.issueId,
      issueClass: issue.issueClass,
      processorFamily: safeProcessorValue(input.commercialDecomposition.statement.processorFamily),
      processorProgram: safeProcessorValue(input.processorProgram ?? null),
      statementPeriod: input.currentEconomics.statementPeriod ? { ...input.currentEconomics.statementPeriod } : null,
      acceptedIssueRelevantActivityFacts: activityFactsForIssue(issue.issueClass, input.currentEconomics),
      selectedRdChargeRefs: [...issue.selectedRdChargeRefs],
      sanitizedFeeLabels: [...issue.sanitizedFeeLabels],
      acceptedEconomicCategories: [...issue.acceptedEconomicCategories],
      acceptedSensitivityStates: [...issue.acceptedSensitivityStates],
      acceptedQualificationIntegrityState: issue.acceptedQualificationIntegrityState,
      acceptedParticipantControlStates: issue.acceptedParticipantControlStates.map((item) => deepClone(item)),
      unresolvedClaimFacets: [...issue.unresolvedClaimFacets],
      unresolvedReasonCodes: [...issue.unresolvedReasonCodes],
      acceptedFactRefs: [...issue.acceptedFactRefs],
      currentGovernedEvidenceRefs: [...issue.governedEvidenceRefs],
      allowedEvidenceClasses: [...issue.allowedEvidenceClasses],
      prohibitedConclusions: [...issue.prohibitedConclusions],
      merchantBusinessContext,
      competingHypothesisRequired: issue.competingHypothesisRequired,
    };
    const packet: ShadowAiEconomicResolutionPacketV1 = {
      ...packetWithoutHash,
      immutableInputHash: digest(packetWithoutHash),
    };
    assertShadowAiEconomicResolutionPacketPrivacyV1(packet);
    return deepFreeze(packet);
  });
  const bytes = Buffer.byteLength(canonicalJson(packets), "utf8");
  if (bytes > SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumInputBytes) {
    throw new Error("shadow_planner_input_budget_exceeded");
  }
  return deepFreeze(packets);
}

export function inspectShadowAiEconomicResolutionPacketPrivacyV1(
  packet: ShadowAiEconomicResolutionPacketV1,
): { valid: boolean; reasonCodes: string[] } {
  const reasons: string[] = [];
  const { immutableInputHash: _hash, ...withoutHash } = packet;
  if (digest(withoutHash) !== packet.immutableInputHash) reasons.push("shadow_planner_input_hash_mismatch");
  if (packet.merchantBusinessContext?.businessName &&
      packet.merchantBusinessContext.privacyClassification !== "PURPOSE_BOUND_BUSINESS_IDENTITY") {
    reasons.push("shadow_planner_business_identity_unclassified");
  }
  inspectValue(packet, "packet", reasons);
  return { valid: reasons.length === 0, reasonCodes: unique(reasons).sort() };
}

export function assertShadowAiEconomicResolutionPacketPrivacyV1(packet: ShadowAiEconomicResolutionPacketV1): void {
  const inspection = inspectShadowAiEconomicResolutionPacketPrivacyV1(packet);
  if (!inspection.valid) throw new Error(`shadow_planner_private_payload_blocked:${inspection.reasonCodes.join(",")}`);
}

function buildCandidates(input: ShadowAiEconomicResolutionSelectionInputV1): Candidate[] {
  const profile = input.currentEconomics;
  const rowsById = new Map(input.commercialDecomposition.rows.map((row) => [row.feeRowId, row] as const));
  const itemByRdRef = new Map(profile.chargedCostProfile.items.map((item) => [item.rdEconomicChargeRef, item] as const));
  const rowsForItems = (predicate: (row: CommercialDecompositionRowV1) => boolean) => profile.chargedCostProfile.items
    .filter((item) => item.financialDirection === "debit" && item.amount.amountMinor > 0 && item.commercialFeeRowRef)
    .map((item) => rowsById.get(item.commercialFeeRowRef!))
    .filter((row): row is CommercialDecompositionRowV1 => Boolean(row) && predicate(row!));
  const sharedRows = rowsForItems((row) => row.commercialDollarCategory === "SHARED_BUNDLED_OR_UNRESOLVED"
    || row.commercialDollarAttribution.unresolvedContributionMinor > 0);
  const participantRows = rowsForItems((row) => Object.values(row.participants).some((claim) => claim.state !== "supported" || claim.value === null));
  const gatewayRows = rowsForItems((row) => /\b(?:gateway|auth(?:entication|orization)?|access|avs|token(?:ization)?)\b/i.test(row.printedLabel)
    && (row.economicLayer.state !== "supported" || row.participants.merchantFacingPriceController.state !== "supported"));
  const contractRows = rowsForItems((row) => row.action.merchantAgreementRequiredForContractConclusion
    || row.participants.merchantFacingPriceController.value === null);
  const qualificationRefs = unique([
    ...input.qualificationIntegrity.findings.flatMap((finding) => finding.rdChargeRefs),
    ...input.qualificationIntegrity.unresolvedCandidates.flatMap((candidate) => candidate.rdChargeRefs),
  ]);
  const qualificationRows = qualificationRefs
    .map((ref) => itemByRdRef.get(ref)?.commercialFeeRowRef ?? null)
    .map((ref) => ref ? rowsById.get(ref) : null)
    .filter((row): row is CommercialDecompositionRowV1 => Boolean(row));
  const unknownAuthorizationFacts = ["authorizationCount", "approvedAuthorizationCount", "settledTransactionCount", "authorizationToSettlement"]
    .filter((field) => profile.activity[field as keyof typeof profile.activity].state === "UNKNOWN");

  return [
    candidate("QUALIFICATION_INTEGRITY_ROOT_CAUSE", 1, "D2", qualificationRows, qualificationRefs,
      [], unique([...input.qualificationIntegrity.findings.flatMap((finding) => finding.statementEvidenceRefs),
        ...input.qualificationIntegrity.unresolvedCandidates.flatMap((candidate) => candidate.statementEvidenceRefs)]),
      ["causal_reason", "operational_influence", "controllability", "avoidability"],
      input.qualificationIntegrity.findings.length > 0
        ? ["accepted_condition_present_root_cause_unknown"] : ["qualification_like_label_not_admitted"],
      ["PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA", "MERCHANT_CONTRACT_OR_SCHEDULE", "GOVERNED_PUBLIC_SOURCE"], true,
      sum(input.qualificationIntegrity.findings.map((finding) => finding.referencedChargedAmountMinor)),
      input.qualificationIntegrity.findings.length > 0 || input.qualificationIntegrity.unresolvedCandidates.length > 0),
    candidate("SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS", 1, "D1", sharedRows, refsForRows(sharedRows, profile),
      [], sharedRows.flatMap((row) => row.evidenceRefs), ["economic_category", "economic_beneficiary", "price_setter"],
      ["shared_or_bundled_composition_not_separable", "participant_specific_attribution_not_admitted"],
      ["GOVERNED_PUBLIC_SOURCE", "MERCHANT_CONTRACT_OR_SCHEDULE", "PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA"], true,
      amountForRows(sharedRows), sharedRows.length > 0),
    candidate("AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE", 1, "D2", [], [],
      unknownAuthorizationFacts.flatMap((field) => profile.activity[field as keyof typeof profile.activity].canonicalFactRefs),
      unknownAuthorizationFacts.flatMap((field) => profile.activity[field as keyof typeof profile.activity].evidenceRefs),
      unknownAuthorizationFacts, ["authorization_attempt_approval_settlement_populations_not_interchangeable"],
      ["PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA", "MERCHANT_ATTESTATION"], true, null,
      unknownAuthorizationFacts.length > 0),
    candidate("GATEWAY_PROCESSOR_TERMINOLOGY", 2, "D1", gatewayRows, refsForRows(gatewayRows, profile), [],
      gatewayRows.flatMap((row) => row.evidenceRefs), ["economic_category", "economic_beneficiary", "contractual_controller"],
      ["service_role_or_recipient_not_admitted"],
      ["GOVERNED_PUBLIC_SOURCE", "MERCHANT_CONTRACT_OR_SCHEDULE", "PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA"], true,
      amountForRows(gatewayRows), gatewayRows.length > 0),
    candidate("PARTICIPANT_CONTROL_UNCERTAINTY", 2, "D1", participantRows, refsForRows(participantRows, profile), [],
      participantRows.flatMap((row) => row.evidenceRefs),
      ["economic_beneficiary", "rule_setter", "price_setter", "merchant_facing_price_controller", "contractual_controller", "change_authority"],
      ["collection_does_not_prove_control", "statement_charge_does_not_prove_beneficiary"],
      ["GOVERNED_PUBLIC_SOURCE", "MERCHANT_CONTRACT_OR_SCHEDULE"], true,
      amountForRows(participantRows), participantRows.length > 0),
    candidate("COST_INCIDENCE_UNCERTAINTY", 2, "D2", [], [],
      profile.costIncidence.costOffsetRevenue.canonicalFactRefs, profile.costIncidence.evidenceRefs,
      ["merchant_program_use", "cost_offset_revenue", "net_merchant_borne_processing_cost"],
      ["statement_silence_does_not_establish_program_use_or_absence"],
      ["MERCHANT_ATTESTATION", "MERCHANT_CONTRACT_OR_SCHEDULE"], true, null,
      profile.costIncidence.state === "INCIDENCE_UNRESOLVED"),
    candidate("CONTRACT_OFF_STATEMENT_EVIDENCE_NEED", 3, "D1", contractRows, refsForRows(contractRows, profile), [],
      contractRows.flatMap((row) => row.evidenceRefs), ["contractual_controller", "change_authority", "pricing_schedule", "termination_terms"],
      ["merchant_specific_contract_facts_not_present_on_statement"],
      ["MERCHANT_CONTRACT_OR_SCHEDULE"], false, amountForRows(contractRows), contractRows.length > 0),
  ];
}

function candidate(
  issueClass: ShadowAiEconomicIssueClassV1,
  priority: 1 | 2 | 3,
  decisionTier: "D2" | "D1",
  rows: CommercialDecompositionRowV1[],
  rdRefs: string[],
  factRefs: string[],
  evidenceRefs: string[],
  facets: string[],
  reasons: string[],
  evidenceClasses: ShadowAiRequiredEvidenceClassV1[],
  competing: boolean,
  amountMinor: number | null,
  present: boolean,
): Candidate {
  return { issueClass, priority, decisionTier, rows, rdRefs: unique(rdRefs), factRefs: unique(factRefs),
    evidenceRefs: unique(evidenceRefs), facets: unique(facets), reasons: unique(reasons), evidenceClasses,
    competing, amountMinor, present };
}

function buildIssue(
  input: ShadowAiEconomicResolutionSelectionInputV1,
  candidateInput: Candidate,
  issueId: string,
): ShadowAiEconomicResolutionIssueV1 {
  const profile = input.currentEconomics;
  const material = candidateInput.rows.length > 0
    ? materialRows(candidateInput.rows, profile, candidateInput.decisionTier)
    : candidateInput.rows;
  const rows = material.length > 0 ? material : candidateInput.rows;
  const rdRefs = rows.length > 0 ? refsForRows(rows, profile) : candidateInput.rdRefs;
  const qualificationState = candidateInput.issueClass === "QUALIFICATION_INTEGRITY_ROOT_CAUSE"
    ? `${input.qualificationIntegrity.status}:${input.qualificationIntegrity.findings.length}_accepted:${input.qualificationIntegrity.unresolvedCandidates.length}_unresolved`
    : "NOT_ISSUE_PRIMARY";
  return deepFreeze({
    issueId,
    issueClass: candidateInput.issueClass,
    selectionPriority: candidateInput.priority,
    decisionMaterialityTier: candidateInput.decisionTier,
    selectedRdChargeRefs: unique(rdRefs).sort(),
    sanitizedFeeLabels: unique(rows.map((row) => sanitizeFeeLabel(row.printedLabel))).sort(),
    acceptedEconomicCategories: unique(rows.map((row) => row.commercialDollarCategory)).sort(),
    acceptedSensitivityStates: sensitivityStates(rdRefs, profile),
    acceptedQualificationIntegrityState: qualificationState,
    acceptedParticipantControlStates: participantStates(rows, profile),
    unresolvedClaimFacets: candidateInput.facets,
    unresolvedReasonCodes: candidateInput.reasons,
    acceptedFactRefs: candidateInput.factRefs,
    governedEvidenceRefs: unique([...candidateInput.evidenceRefs, ...rows.flatMap((row) => row.evidenceRefs)]).sort(),
    allowedEvidenceClasses: candidateInput.evidenceClasses,
    prohibitedConclusions: PROHIBITED_CONCLUSIONS,
    competingHypothesisRequired: candidateInput.competing,
    amountUnderReviewMinor: candidateInput.amountMinor,
    selectionReasonCodes: ["accepted_unresolved_state", `existing_materiality_policy_${candidateInput.decisionTier.toLowerCase()}`],
  });
}

const PROHIBITED_CONCLUSIONS = Object.freeze([
  "canonical_fact_change", "rd_change", "fee_amount_change", "population_change", "accepted_reclassification",
  "participant_or_control_truth", "completeness_change", "materiality_change", "unknown_to_zero",
  "savings_or_annualization", "avoidability", "merchant_or_processor_blame", "comparison_or_comparator_decision",
  "customer_action_or_finding",
]);

function activityFactsForIssue(
  issueClass: ShadowAiEconomicIssueClassV1,
  profile: CurrentRelationshipEconomicsProfileV1,
): readonly ShadowAiAcceptedActivityFactV1[] {
  const fields = issueClass === "AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE"
    ? ["authorizationCount", "approvedAuthorizationCount", "settledTransactionCount", "authorizationToSettlement", "transactionCount"]
    : issueClass === "COST_INCIDENCE_UNCERTAINTY"
      ? ["processedVolume", "transactionCount", "channel", "averageTicket"]
      : ["processedVolume", "transactionCount", "averageTicket", "channel"];
  return fields.map((field) => {
    const fact = profile.activity[field as keyof typeof profile.activity];
    return {
      factRef: fact.canonicalFactRefs[0] ?? `accepted_profile_fact:${field}`,
      field,
      state: fact.state,
      value: fact.value as ShadowAiAcceptedActivityFactV1["value"],
      population: fact.population,
      evidenceRefs: [...fact.evidenceRefs],
    };
  });
}

function compileMerchantBusinessContext(
  context: ShadowAiMerchantBusinessContextInputV1 | null,
  profile: CurrentRelationshipEconomicsProfileV1,
): ShadowAiMerchantBusinessContextV1 | null {
  if (!context) return null;
  const businessName = safeBusinessName(context.businessName ?? null);
  const averageTicket = profile.activity.averageTicket.state === "KNOWN" && profile.activity.averageTicket.value
    ? { ...profile.activity.averageTicket.value } : null;
  const compiled: ShadowAiMerchantBusinessContextV1 = {
    privacyClassification: "PURPOSE_BOUND_BUSINESS_IDENTITY",
    businessName,
    naturalPersonOrSoleProprietorAmbiguity: businessName && !BUSINESS_MARKER.test(businessName) ? "POSSIBLE" : "NOT_INDICATED",
    admittedBusinessCategory: safeContextText(context.admittedBusinessCategory ?? null, 80),
    businessLocation: {
      country: safeContextText(context.businessLocation?.country ?? null, 60),
      region: safeContextText(context.businessLocation?.region ?? null, 80),
      city: safeContextText(context.businessLocation?.city ?? null, 80),
    },
    knownChannel: safeContextText(context.knownChannel ?? null, 60),
    acceptedAverageTicket: averageTicket,
    supportedOperatingContext: unique((context.supportedOperatingContext ?? []).map((value) => safeContextText(value, 120)).filter((value): value is string => Boolean(value))),
  };
  return deepFreeze(compiled);
}

function materialRows(rows: CommercialDecompositionRowV1[], profile: CurrentRelationshipEconomicsProfileV1, decisionTier: "D2" | "D1") {
  const total = profile.chargedCostProfile.rdTotalStatementProcessingCost?.amountMinor ?? null;
  return rows.filter((row) => combineMaterialityAxes(evaluateEconomicMateriality({
    amountMinor: Math.abs(row.billedAmountMinor), authoritativeStatementCostMinor: total,
  }).tier, decisionTier) === "material");
}

function participantStates(rows: CommercialDecompositionRowV1[], profile: CurrentRelationshipEconomicsProfileV1): ShadowAiParticipantControlStateV1[] {
  const rowRefToRd = new Map(profile.chargedCostProfile.items.filter((item) => item.commercialFeeRowRef)
    .map((item) => [item.commercialFeeRowRef!, item.rdEconomicChargeRef] as const));
  return rows.map((row) => ({
    rdChargeRef: rowRefToRd.get(row.feeRowId) ?? "unbound_rd_charge",
    collector: { ...row.participants.collector },
    economicBeneficiary: { ...row.participants.economicBeneficiary },
    ruleSetter: { ...row.participants.ruleSetter },
    priceSetter: { ...row.participants.priceSetter },
    merchantFacingPriceController: { ...row.participants.merchantFacingPriceController },
  }));
}

function sensitivityStates(rdRefs: string[], profile: CurrentRelationshipEconomicsProfileV1): string[] {
  const groups: Array<[string, readonly string[]]> = [
    ["TRANSACTION_COUNT_DRIVEN", profile.costStructureSensitivity.countDrivenChargeRefs],
    ["VOLUME_DRIVEN", profile.costStructureSensitivity.volumeDrivenChargeRefs],
    ["FIXED_COST_DRIVEN", profile.costStructureSensitivity.fixedCostDrivenChargeRefs],
    ["MIXED_OR_MINIMUM", profile.costStructureSensitivity.mixedMinimumChargeRefs],
    ["UNRESOLVED", profile.costStructureSensitivity.unresolvedControllableChargeRefs],
  ];
  const states = groups.filter(([, refs]) => rdRefs.some((ref) => refs.includes(ref))).map(([state]) => state);
  return states.length > 0 ? states : ["UNRESOLVED_OR_NOT_APPLICABLE"];
}

function refsForRows(rows: CommercialDecompositionRowV1[], profile: CurrentRelationshipEconomicsProfileV1): string[] {
  const rowIds = new Set(rows.map((row) => row.feeRowId));
  return unique(profile.chargedCostProfile.items.filter((item) => item.commercialFeeRowRef && rowIds.has(item.commercialFeeRowRef))
    .map((item) => item.rdEconomicChargeRef));
}

function amountForRows(rows: CommercialDecompositionRowV1[]): number {
  return sum(rows.map((row) => Math.abs(row.billedAmountMinor)));
}

function issueIdentity(profile: CurrentRelationshipEconomicsProfileV1, candidateInput: Candidate): string {
  return `shadow-issue-${digest({ issueClass: candidateInput.issueClass, period: profile.statementPeriod,
    rdRefs: unique(candidateInput.rdRefs).sort(), facets: unique(candidateInput.facets).sort() }).slice(0, 32)}`;
}

function assertSourceBindings(input: ShadowAiEconomicResolutionSelectionInputV1): void {
  const source = input.currentEconomics.sourceDocumentRef;
  if (input.qualificationIntegrity.sourceDocumentRef !== source) throw new Error("shadow_planner_qualification_source_mismatch");
  if (input.commercialDecomposition.statement.statementPeriod && input.currentEconomics.statementPeriod &&
      canonicalJson(input.commercialDecomposition.statement.statementPeriod) !== canonicalJson(input.currentEconomics.statementPeriod)) {
    throw new Error("shadow_planner_period_mismatch");
  }
  if (!input.currentEconomics.safety.rdIsSoleAdditiveAuthority || input.currentEconomics.safety.canonicalMutationAllowed ||
      input.qualificationIntegrity.safety.rdMutationAllowed || input.qualificationIntegrity.safety.canonicalMutationAllowed ||
      input.commercialDecomposition.permissions.canonicalMutationAllowed || input.commercialDecomposition.permissions.aiOrResearchMutationAllowed) {
    throw new Error("shadow_planner_requires_immutable_deterministic_inputs");
  }
}

function inspectValue(value: unknown, path: string, reasons: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectValue(item, `${path}[${index}]`, reasons));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(key)) reasons.push("shadow_planner_forbidden_private_field");
      inspectValue(child, `${path}.${key}`, reasons);
    }
    return;
  }
  if (typeof value !== "string") return;
  if (FILE_OR_PATH.test(value)) reasons.push("shadow_planner_file_or_source_name_forbidden");
  if (CREDENTIAL.test(value)) reasons.push("shadow_planner_credential_material_forbidden");
  if (PRIVATE_IDENTIFIER.test(value)) reasons.push("shadow_planner_private_account_value_forbidden");
  if (EMAIL.test(value) || (PHONE.test(value) && !ISO_DATE.test(value))) reasons.push("shadow_planner_unnecessary_personal_data_forbidden");
  if (path.endsWith("businessName") && value.length > 120) reasons.push("shadow_planner_business_name_oversized");
}

const FORBIDDEN_KEY = /^(?:merchantNumber|merchantId|mid|account(?:Number|Id)?|routing(?:Number)?|bank(?:Account)?|cardNumber|pan|tax(?:Id)?|ssn|credential|secret|token|password|apiKey|fileName|filename|filePath|path|rawText|rawStatement|sourceDocument(?:Ref)?)$/i;
const FILE_OR_PATH = /(?:\/Users\/|\/private\/|[A-Za-z]:\\|\b\S+\.(?:pdf|csv|xlsx?|docx?|txt)\b)/i;
const CREDENTIAL = /(?:\b(?:Bearer|Basic)\s+\S+|\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN .*PRIVATE KEY-----|api[_ -]?key\s*[:=])/i;
const PRIVATE_IDENTIFIER = /\b(?:MID|merchant|account|routing|tax|card)\s*(?:id|number|no\.?|#)?\s*[:#-]\s*[A-Za-z0-9_-]{4,}\b/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:^|\s)\+?\d[\d(). -]{7,}\d(?:$|\s)/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BUSINESS_MARKER = /\b(?:LLC|INC|CORP|COMPANY|CO\.?|RESTAURANT|CAFE|SHOP|STORE|MARKET|SERVICES?|SYSTEMS?|GROUP|PARTNERS?|FOUNDATION|ASSOCIATION)\b/i;

function sanitizeFeeLabel(value: string): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || FILE_OR_PATH.test(normalized) || CREDENTIAL.test(normalized) || PRIVATE_IDENTIFIER.test(normalized)) return "[fee_label_withheld]";
  return normalized
    .replace(/[$€£¥]\s*\d[\d,.]*/g, "[amount]")
    .replace(/\b\d+(?:\.\d+)?\s*(?:%|bps|basis points?)\b/gi, "[rate]")
    .replace(/\b\d{6,}\b/g, "[identifier]")
    .slice(0, 140);
}

function safeBusinessName(value: string | null): string | null {
  const clean = safeContextText(value, 120);
  if (!clean || FILE_OR_PATH.test(clean) || CREDENTIAL.test(clean) || PRIVATE_IDENTIFIER.test(clean) || EMAIL.test(clean) || PHONE.test(clean)) return null;
  return clean;
}

function safeProcessorValue(value: string | null): string | null {
  return safeContextText(value, 80);
}

function safeContextText(value: string | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || FILE_OR_PATH.test(normalized) || CREDENTIAL.test(normalized) || PRIVATE_IDENTIFIER.test(normalized) || EMAIL.test(normalized) || PHONE.test(normalized)) return null;
  return normalized.slice(0, max);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
  }
  return value;
}
