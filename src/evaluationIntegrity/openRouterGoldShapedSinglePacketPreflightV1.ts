import { createHash } from "node:crypto";

import { inspectShadowAiEconomicResolutionPacketPrivacyV1 } from "../canonical/shadowAiEconomicResolutionIssueSelectionV1.js";
import {
  SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
  type ShadowAiEconomicResolutionPacketV1,
} from "../canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../canonical/v2/canonicalJson.js";

export function createGoldShapedSyntheticPlannerPacketV1(): ShadowAiEconomicResolutionPacketV1 {
  const withoutHash: Omit<ShadowAiEconomicResolutionPacketV1, "immutableInputHash"> = {
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
    purpose: "SHADOW_ECONOMIC_RESOLUTION_PLANNING_ONLY",
    outputAuthorityRequired: "NON_AUTHORITATIVE",
    opaqueRunRef: "shadow-run-synthetic-large-shape-0001",
    issueId: "synthetic_large_shape_shared_bundle_issue_001",
    issueClass: "SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS",
    processorFamily: "SYNTHETIC_PROCESSOR_FAMILY_X",
    processorProgram: "SYNTHETIC_SERVICE_PROGRAM_X",
    statementPeriod: { start: "2099-07-01", end: "2099-07-31" },
    acceptedIssueRelevantActivityFacts: Object.freeze([
      syntheticFact("001", "synthetic_processed_event_count", "KNOWN", 4_321, "synthetic_processed_event_population", ["synthetic_evidence_activity_001", "synthetic_evidence_summary_001"]),
      syntheticFact("002", "synthetic_approved_event_count", "KNOWN", 4_087, "synthetic_approved_event_population", ["synthetic_evidence_activity_002"]),
      syntheticFact("003", "synthetic_settled_event_count", "KNOWN", 3_944, "synthetic_settled_event_population", ["synthetic_evidence_activity_003", "synthetic_evidence_summary_001"]),
      syntheticFact("004", "synthetic_average_ticket", "KNOWN", { amountMinor: 12_345, currency: "USD" }, "synthetic_compatible_sales_population", ["synthetic_evidence_activity_004"]),
      syntheticFact("005", "synthetic_channel", "KNOWN", "SYNTHETIC_CARD_PRESENT_AND_REMOTE", "synthetic_channel_population", ["synthetic_evidence_activity_005"]),
      syntheticFact("006", "synthetic_authorization_to_settlement", "UNKNOWN", null, "synthetic_operational_population", ["synthetic_evidence_limitation_001"]),
    ]),
    selectedRdChargeRefs: Object.freeze([
      "synthetic_rd_charge_ref_001",
      "synthetic_rd_charge_ref_002",
      "synthetic_rd_charge_ref_003",
      "synthetic_rd_charge_ref_004",
    ]),
    sanitizedFeeLabels: Object.freeze([
      "SYNTHETIC SERVICE PROGRAM X",
      "SYNTHETIC PLATFORM ACCESS COMPONENT Y",
      "SYNTHETIC SUPPORT COMPONENT Z",
    ]),
    acceptedEconomicCategories: Object.freeze([
      "SHARED_BUNDLED_OR_UNRESOLVED",
      "PROCESSOR_SERVICE_OR_GATEWAY_UNRESOLVED",
    ]),
    acceptedSensitivityStates: Object.freeze([
      "SYNTHETIC_COUNT_SENSITIVITY_UNKNOWN",
      "SYNTHETIC_VOLUME_SENSITIVITY_UNKNOWN",
      "SYNTHETIC_FIXED_COMPONENT_POSSIBLE_NOT_ESTABLISHED",
    ]),
    acceptedQualificationIntegrityState: "SYNTHETIC_QUALIFICATION_INTEGRITY_UNRESOLVED",
    acceptedParticipantControlStates: Object.freeze([
      participant("001", "SYNTHETIC_COLLECTOR_ROLE_A"),
      participant("002", "SYNTHETIC_COLLECTOR_ROLE_A"),
      participant("003", null),
      participant("004", "SYNTHETIC_COLLECTOR_ROLE_B"),
    ]),
    unresolvedClaimFacets: Object.freeze([
      "synthetic_economic_role",
      "synthetic_fee_composition",
      "synthetic_contract_basis",
      "synthetic_participant_control",
      "synthetic_population_driver",
    ]),
    unresolvedReasonCodes: Object.freeze([
      "synthetic_composition_not_separable",
      "synthetic_governing_document_absent",
      "synthetic_participant_roles_not_established",
      "synthetic_operational_population_not_reconciled",
      "synthetic_pricing_mechanic_not_reproduced",
    ]),
    acceptedFactRefs: Object.freeze([
      "synthetic_fact_fee_label_001",
      "synthetic_fact_fee_label_002",
      "synthetic_fact_fee_label_003",
      "synthetic_fact_statement_period_001",
      "synthetic_fact_processor_family_001",
      "synthetic_fact_business_context_001",
      "synthetic_fact_fee_occurrence_001",
      "synthetic_fact_fee_occurrence_002",
    ]),
    currentGovernedEvidenceRefs: Object.freeze([
      "synthetic_governed_evidence_ref_001",
      "synthetic_governed_evidence_ref_002",
      "synthetic_governed_evidence_ref_003",
      "synthetic_governed_evidence_ref_004",
      "synthetic_governed_evidence_ref_005",
      "synthetic_governed_evidence_ref_006",
    ]),
    allowedEvidenceClasses: Object.freeze([
      "ACCEPTED_STATEMENT_FACT",
      "MERCHANT_ATTESTATION",
      "MERCHANT_CONTRACT_OR_SCHEDULE",
      "PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA",
      "ADDITIONAL_COMPATIBLE_STATEMENT",
    ]),
    prohibitedConclusions: Object.freeze([
      "canonical_fact_change",
      "rd_change",
      "fee_amount_change",
      "population_change",
      "accepted_reclassification",
      "participant_or_control_truth",
      "completeness_change",
      "materiality_change",
      "unknown_to_zero",
      "savings_or_annualization",
      "avoidability",
      "merchant_or_processor_blame",
      "comparison_or_comparator_decision",
      "customer_action_or_finding",
    ]),
    merchantBusinessContext: {
      privacyClassification: "PURPOSE_BOUND_BUSINESS_IDENTITY",
      businessName: "SYNTHETIC_BUSINESS_ENTITY_ALPHA_LLC",
      naturalPersonOrSoleProprietorAmbiguity: "NOT_INDICATED",
      admittedBusinessCategory: "SYNTHETIC_MULTI_CHANNEL_SPECIALTY_RETAIL",
      businessLocation: { country: "XZ", region: "SYNTHETIC_REGION_7", city: null },
      knownChannel: "SYNTHETIC_CARD_PRESENT_AND_REMOTE",
      acceptedAverageTicket: { amountMinor: 12_345, currency: "USD" },
      supportedOperatingContext: Object.freeze([
        "SYNTHETIC_CONTEXT_MIXED_ACCEPTANCE_CHANNELS",
        "SYNTHETIC_CONTEXT_RECURRING_PLATFORM_ACCESS_POSSIBLE",
        "SYNTHETIC_CONTEXT_NO_CONTRACT_DOCUMENT_ADMITTED",
      ]),
    },
    competingHypothesisRequired: true,
  };
  const packet = deepFreeze({ ...withoutHash, immutableInputHash: sha256(canonicalJson(withoutHash)) });
  const boundary = inspectGoldShapedSyntheticPacketBoundaryV1(packet);
  if (!boundary.valid) throw new Error(`gold_shaped_synthetic_packet_invalid:${boundary.reasonCodes.join(",")}`);
  return packet;
}

export function inspectGoldShapedSyntheticPacketBoundaryV1(
  packet: ShadowAiEconomicResolutionPacketV1,
): Readonly<{ valid: boolean; reasonCodes: readonly string[] }> {
  const reasons: string[] = [];
  const privacy = inspectShadowAiEconomicResolutionPacketPrivacyV1(packet);
  reasons.push(...privacy.reasonCodes);
  const serialized = canonicalJson(packet);
  if (packet.issueClass !== "SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS") reasons.push("synthetic_issue_class_invalid");
  if (!packet.competingHypothesisRequired) reasons.push("competing_hypothesis_not_required");
  if (packet.acceptedFactRefs.length < 6 || packet.selectedRdChargeRefs.length < 3
    || packet.currentGovernedEvidenceRefs.length < 5 || packet.acceptedIssueRelevantActivityFacts.length < 5
    || packet.acceptedParticipantControlStates.length < 3 || packet.allowedEvidenceClasses.length < 4) {
    reasons.push("gold_shaped_cardinality_insufficient");
  }
  if (!packet.processorFamily?.startsWith("SYNTHETIC_") || !packet.processorProgram?.startsWith("SYNTHETIC_")) {
    reasons.push("synthetic_processor_identity_missing");
  }
  if (!packet.merchantBusinessContext?.businessName?.startsWith("SYNTHETIC_")) reasons.push("synthetic_business_identity_missing");
  if (packet.statementPeriod?.start.slice(0, 4) !== "2099" || packet.statementPeriod.end.slice(0, 4) !== "2099") {
    reasons.push("synthetic_period_invalid");
  }
  if (/\.pdf\b|(?:^|["'\s])\/(?:Users|home|private|tmp)\//i.test(serialized)) reasons.push("source_file_or_path_present");
  if (/\b(?:MID|merchant number|account number|routing number|tax id|card number|phone|email)\b/i.test(serialized)) {
    reasons.push("prohibited_identifier_marker_present");
  }
  return Object.freeze({ valid: reasons.length === 0, reasonCodes: Object.freeze([...new Set(reasons)].sort()) });
}

function syntheticFact(
  ordinal: string,
  field: string,
  state: "KNOWN" | "UNKNOWN",
  value: number | Readonly<{ amountMinor: number; currency: "USD" }> | string | null,
  population: string,
  evidenceRefs: readonly string[],
) {
  return Object.freeze({ factRef: `synthetic_activity_fact_${ordinal}`, field, state, value, population, evidenceRefs: Object.freeze([...evidenceRefs]) });
}

function participant(ordinal: string, collector: string | null) {
  return Object.freeze({
    rdChargeRef: `synthetic_rd_charge_ref_${ordinal}`,
    collector: { state: collector ? "SUPPORTED_SYNTHETIC" : "UNKNOWN", value: collector },
    economicBeneficiary: { state: "UNKNOWN", value: null },
    ruleSetter: { state: "UNKNOWN", value: null },
    priceSetter: { state: "UNKNOWN", value: null },
    merchantFacingPriceController: { state: "UNKNOWN", value: null },
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}
