import type { ParsedDocument } from "../../parser.js";
import type { CanonicalEconomicsV2TemplateAdmissionInput } from "./fiservAdapter.js";
import { fiservFeeLedgerOccurrences } from "./fiservAdapter.js";
import type { CanonicalEconomicsV2SectionAdmission } from "./sourceModel.js";
import type { CanonicalEconomicsV2CapabilityId, CanonicalEconomicsV2Foundation,
  CanonicalEconomicsV2PopulationSemantic, CanonicalEconomicsV2SourceOccurrence } from "./types.js";
import { FISERV_CAPABILITY_CONTRACT_VERSION, FISERV_OUTPUT_IDS,
  adjudicateSupportedFiservProtocolIdentity, assessFiservCandidateExtraction,
  type FiservCandidateExtractionAssessment, type FiservOutputPermission,
  type FiservProtocolIdentityDecision, type FiservSupportState } from "./fiservCapabilityContract.js";

export const FISERV_RUNTIME_CAPABILITY_POLICY_ID = "fiserv_statement_level_dynamic_capability_policy";
export const FISERV_RUNTIME_CAPABILITY_POLICY_VERSION = "2.0.0";
const POLICY_AUTHORITY_REF = "runtime-intelligence-policy-amendment-v0.5-supported-fiserv-contract-v1.0";
const POLICY_ADMITTED_AT = "2026-09-01T00:00:00.000Z";

export const FISERV_CAPABILITY_IDS = [
  "processor_identity", "statement_period", "gross_sale_volume", "refund_volume",
  "canonical_net_submitted_card_volume", "gross_sale_transaction_count", "submitted_transaction_count",
  "refund_transaction_count", "fee_total", "funding_batches", "settlement_adjustments",
  "chargeback_financial_populations", "fee_detail", "non_fee_financial_flow_exclusions",
  "reconciliation_controls",
] as const satisfies readonly CanonicalEconomicsV2CapabilityId[];

export type FiservCapabilityProofBasis = "statement_level_capability_proof" | "unresolved";
export type FiservCoverageState = "complete" | "partial" | "unknown" | "unavailable";
export type FiservPreboundReconciliationControl = {
  id: string;
  sourceControlIdentity: string;
  bindingState: "bound" | "rejected";
  controlType: "declared_equation" | "subtotal_composition" | "cross_representation" | "derived_financial_identity";
  semanticPurpose: string;
  population: string;
  operator: "sum" | "gross_minus_refunds" | "submitted_adjustments_fees_to_funded" | "equality";
  operandOccurrenceRefs: string[];
  authoritativeTotalOccurrenceRef: string | null;
  evidenceRefs: string[];
  lineageState: "independent_or_declared_multi_field" | "circular_or_ambiguous";
  toleranceBasis: "printed_currency_precision" | "parser_declared_sum_precision" | "unbound";
  tolerance: number | null;
  result: "pass" | "pass_with_rounding" | "fail" | "missing_input" | "rejected";
  reasonCodes: string[];
};

export type FiservRuntimeCapabilityProof = {
  schemaVersion: "fiserv_runtime_capability_proof_v2";
  contractVersion: typeof FISERV_CAPABILITY_CONTRACT_VERSION;
  policyId: typeof FISERV_RUNTIME_CAPABILITY_POLICY_ID;
  policyVersion: typeof FISERV_RUNTIME_CAPABILITY_POLICY_VERSION;
  candidateExtraction: FiservCandidateExtractionAssessment;
  protocolIdentity: FiservProtocolIdentityDecision;
  family: { status: "proven" | "unresolved"; processorFamily: "supported_fiserv_statement_protocol_family" | null;
    proofEvidenceRefs: string[]; reasonCodes: string[] };
  coverage: {
    suppliedArtifactIntegrity: { state: FiservCoverageState; evidenceRefs: string[]; reasonCodes: string[] };
    statementCompleteness: { state: FiservCoverageState; evidenceRefs: string[]; reasonCodes: string[] };
    sections: Array<{ sectionRef: string; kind: string; state: FiservCoverageState; evidenceRefs: string[]; reasonCodes: string[] }>;
    observedOccurrences: { population: "fee_occurrences"; state: FiservCoverageState; occurrenceRefs: string[];
      evidenceRefs: string[]; reasonCodes: string[] };
  };
  reconciliationControlCandidates: FiservPreboundReconciliationControl[];
  capabilities: Array<{ capability: CanonicalEconomicsV2CapabilityId; status: "supported" | "unknown";
    basis: FiservCapabilityProofBasis; population: CanonicalEconomicsV2PopulationSemantic | null;
    occurrenceRefs: string[]; proofEvidenceRefs: string[]; reconciliationControlRefs: string[];
    reasonCodes: string[]; limitations: string[] }>;
  supportState: FiservSupportState;
  outputPermissions: FiservOutputPermission[];
  knownLayoutMappingId: string | null;
  mappingAuthority: "diagnostic_only_zero_canonical_authority";
  limitations: string[];
};

export type FiservRuntimeCapabilityAdmissionResolution = {
  mappingId: string;
  mappingVersion: string;
  authorityClass: "deterministic_capability_policy";
  authorityRef: string;
  matched: true;
  templateAdmission: CanonicalEconomicsV2TemplateAdmissionInput;
  sectionAdmissions: CanonicalEconomicsV2SectionAdmission[];
  feeDetailCoverage: "complete_observed_occurrences" | "partial" | "unproven";
  capabilityProof: FiservRuntimeCapabilityProof;
};

type KnownLayoutResolution = { mappingId: string; mappingVersion: string; authorityClass: "product_owner"; authorityRef: string;
  templateAdmission: CanonicalEconomicsV2TemplateAdmissionInput; sectionAdmissions: CanonicalEconomicsV2SectionAdmission[];
  feeDetailCoverage: "complete_observed_occurrences" | "partial" };

export function resolveFiservRuntimeCapabilityAdmission(input: {
  document: ParsedDocument;
  driverId: string;
  parserOutput: unknown;
  observationalFoundation: CanonicalEconomicsV2Foundation;
  knownLayoutResolution?: KnownLayoutResolution | null;
  candidateExtraction?: FiservCandidateExtractionAssessment;
  protocolIdentity?: FiservProtocolIdentityDecision;
}): { resolution: FiservRuntimeCapabilityAdmissionResolution | null; proof: FiservRuntimeCapabilityProof } {
  const output = record(input.parserOutput);
  const selected = record(output.selectedFinancials);
  const validation = record(record(output.decision).validationState);
  const feeLedger = record(output.feeLedger);
  const feeRows = records(feeLedger.rows);
  const fundingLedger = record(output.fundingBatchLedger);
  const fundingRows = records(fundingLedger.rows);
  const foundation = input.observationalFoundation;
  const candidateExtraction = input.candidateExtraction ?? assessFiservCandidateExtraction(input.document);
  const protocolIdentity = input.protocolIdentity ?? adjudicateSupportedFiservProtocolIdentity(input.document);
  const familyProven = protocolIdentity.status === "proven";
  const artifactComplete = foundation.documentIntegrity.suppliedDocumentStatus === "complete_supplied_document"
    && foundation.documentIntegrity.extractionLineageComplete === true;
  const statementComplete = foundation.documentIntegrity.completenessStatus === "complete";
  const occurrencesForRole = (role: CanonicalEconomicsV2SourceOccurrence["semanticRole"]) =>
    foundation.sourceModel.occurrences.filter((occurrence) => occurrence.semanticRole === role);
  const exactAuthoritative = (role: CanonicalEconomicsV2SourceOccurrence["semanticRole"]) => {
    const candidates = occurrencesForRole(role).filter((occurrence) => occurrence.contributionRole === "authoritative_contributor");
    return candidates.length === 1 ? candidates[0]! : null;
  };
  const exactUnadmittedCandidate = (role: "gross_sale" | "refund", expected: number | null) => {
    if (expected === null) return null;
    const expectedMinor = Math.round(expected * 100);
    const candidates = occurrencesForRole(role).filter((occurrence) =>
      occurrence.contributionRole !== "funding_only" && occurrence.printedAmount !== null
      && occurrence.printedDirection !== "unknown" && occurrence.evidenceRef,
    );
    if (candidates.length === 0 || candidates.some((occurrence) => occurrence.printedAmount!.amountMinor !== expectedMinor)) return null;
    return [...candidates].sort((left, right) => left.id.localeCompare(right.id))[0]!;
  };
  const occurrenceRefsForRole = (role: CanonicalEconomicsV2SourceOccurrence["semanticRole"]) =>
    unique(occurrencesForRole(role).map((occurrence) => occurrence.id));
  const protocolOccurrences = foundation.sourceModel.occurrences.filter((occurrence) => occurrence.sourceLabel === "protocolEvidence");
  const protocolEvidenceRefs = unique(protocolOccurrences.map((occurrence) => occurrence.evidenceRef));
  const statementPeriodOccurrences = foundation.sourceModel.occurrences.filter((occurrence) => occurrence.sourceLabel === "statementPeriod");
  const netOccurrence = exactAuthoritative("net_submitted");
  const feeOccurrence = exactAuthoritative("fee_charge");
  const grossOccurrence = exactAuthoritative("gross_sale") ?? exactUnadmittedCandidate("gross_sale", finite(selected.grossSales));
  const refundOccurrence = exactAuthoritative("refund") ?? exactUnadmittedCandidate("refund", finite(selected.refunds));
  const fundingOccurrence = exactAuthoritative("funded_amount");
  const feeDetailOccurrences = fiservFeeLedgerOccurrences(foundation);
  const controls = buildPreboundControlCandidates({ foundation, parserOutput: output, netOccurrence, feeOccurrence,
    grossOccurrence, refundOccurrence, fundingOccurrence, feeDetailOccurrences });
  const passingControl = (purpose: string) => {
    const relevant = controls.filter((control) => control.semanticPurpose === purpose);
    if (relevant.some((control) => control.result === "fail")) return [];
    return relevant.filter((control) => control.result === "pass" || control.result === "pass_with_rounding");
  };
  const topLevelAllowed = validation.customerFacingTotalsAllowed === true
    && !["failed", "missing"].includes(String(validation.topLevelTotals ?? "missing"));
  const exactMoney = (left: number | null, right: number | null) => left !== null && right !== null && Math.abs(left - right) <= 0.01;
  const gross = finite(selected.grossSales);
  const refunds = finite(selected.refunds);
  const net = finite(selected.totalVolume);
  const fees = finite(selected.totalFees);
  const grossMinusRefundsProven = Boolean(grossOccurrence && refundOccurrence && netOccurrence
    && gross !== null && refunds !== null && exactMoney(gross - refunds, net)
    && passingControl("canonical_net_from_gross_and_refunds").length > 0);
  const directNetProven = Boolean(netOccurrence && net !== null && passingControl("canonical_net_submitted_population").length > 0);
  const feeControlConflict = controls.some((control) => ["processing_fee_total", "complete_fee_occurrence_population"].includes(control.semanticPurpose)
    && control.result === "fail");
  const feeTotalProven = Boolean(feeOccurrence && fees !== null && !feeControlConflict
    && (passingControl("processing_fee_total").length > 0 || passingControl("complete_fee_occurrence_population").length > 0));
  const representationAmbiguous = foundation.sourceModel.representationGroups.some((group) => group.duplicateHandling === "unresolved"
    && ["fact_v2_canonical_net_submitted_card_volume", "fact_v2_total_statement_processing_fees"].includes(group.canonicalFactRef));
  const headlineProof = familyProven && artifactComplete && topLevelAllowed
    && foundation.identity.sourceFingerprintStatus === "available" && foundation.identity.statementPeriod !== null
    && statementPeriodOccurrences.length > 0 && (directNetProven || grossMinusRefundsProven) && feeTotalProven && !representationAmbiguous;

  const feeRowsSum = feeRows.reduce((sum, row) => sum + (finite(row.amount) ?? Number.NaN), 0);
  const feeDetailControl = passingControl("complete_fee_occurrence_population");
  const feeOccurrenceComplete = feeRows.length > 0 && feeDetailOccurrences.length === feeRows.length
    && feeDetailOccurrences.every((occurrence) => occurrence.evidenceRef && occurrence.printedAmount !== null
      && occurrence.printedDirection !== "unknown")
    && Number.isFinite(feeRowsSum) && fees !== null && exactMoney(feeRowsSum, fees)
    && feeDetailControl.length > 0 && !feeControlConflict;
  const feeSections = foundation.sourceModel.sections.filter((section) => section.kind === "fees" || section.kind === "interchange"
    || feeDetailOccurrences.some((occurrence) => occurrence.sectionRef === section.id));
  const feeSectionsComplete = statementComplete && feeSections.length > 0 && feeOccurrenceComplete;
  const dedupeComplete = !foundation.sourceModel.representationGroups.some((group) => group.duplicateHandling === "unresolved");
  const fullFoundation = headlineProof && statementComplete && feeSectionsComplete && feeOccurrenceComplete
    && dedupeComplete && feeDetailControl.length > 0;
  const separatedAdjustments = validation.batchDetailAllowed === true && fundingRows.length > 0
    && fundingRows.every((row) => finite(row.adjustments) !== null);
  const separatedChargebacks = validation.batchDetailAllowed === true && fundingRows.length > 0
    && fundingRows.every((row) => finite(row.chargebacks) !== null);
  const uniqueCount = (role: CanonicalEconomicsV2SourceOccurrence["semanticRole"]) => {
    const values = occurrencesForRole(role).map((occurrence) => occurrence.printedCount).filter((value): value is number => value !== null);
    return values.length > 0 && new Set(values).size === 1;
  };
  const fundingProven = validation.batchDetailAllowed === true && fundingRows.length > 0
    && ["reconciled", "reconciled_with_warnings"].includes(String(fundingLedger.status ?? ""))
    && passingControl("funding_population").length > 0;
  const dynamicSupported: Partial<Record<CanonicalEconomicsV2CapabilityId, boolean>> = {
    processor_identity: familyProven,
    statement_period: familyProven && foundation.identity.statementPeriod !== null && statementPeriodOccurrences.length > 0,
    gross_sale_volume: headlineProof && grossMinusRefundsProven,
    refund_volume: headlineProof && grossMinusRefundsProven,
    canonical_net_submitted_card_volume: headlineProof && (directNetProven || grossMinusRefundsProven),
    gross_sale_transaction_count: familyProven && uniqueCount("gross_sale_count"),
    submitted_transaction_count: familyProven && uniqueCount("submitted_count"),
    refund_transaction_count: familyProven && uniqueCount("refund_count") && grossMinusRefundsProven,
    fee_total: headlineProof && feeTotalProven,
    funding_batches: familyProven && fundingProven,
    settlement_adjustments: familyProven && separatedAdjustments && occurrenceRefsForRole("settlement_adjustment").length > 0,
    chargeback_financial_populations: familyProven && separatedChargebacks
      && unique([...occurrenceRefsForRole("chargeback_principal_debit"), ...occurrenceRefsForRole("chargeback_representment")]).length > 0,
    fee_detail: familyProven && feeOccurrenceComplete,
    non_fee_financial_flow_exclusions: familyProven && Boolean(grossMinusRefundsProven || separatedAdjustments || separatedChargebacks),
    reconciliation_controls: familyProven && controls.some((control) => control.result === "pass" || control.result === "pass_with_rounding"),
  };
  const roleByCapability: Partial<Record<CanonicalEconomicsV2CapabilityId, CanonicalEconomicsV2SourceOccurrence["semanticRole"][]>> = {
    gross_sale_volume: ["gross_sale"], refund_volume: ["refund"], canonical_net_submitted_card_volume: ["net_submitted"],
    gross_sale_transaction_count: ["gross_sale_count"], submitted_transaction_count: ["submitted_count"],
    refund_transaction_count: ["refund_count"], fee_total: ["fee_charge"], funding_batches: ["funded_amount"],
    settlement_adjustments: ["settlement_adjustment"],
    chargeback_financial_populations: ["chargeback_principal_debit", "chargeback_representment"],
    non_fee_financial_flow_exclusions: ["refund", "settlement_adjustment", "chargeback_principal_debit", "chargeback_representment"],
  };
  const purposeByCapability: Partial<Record<CanonicalEconomicsV2CapabilityId, string[]>> = {
    canonical_net_submitted_card_volume: ["canonical_net_submitted_population", "canonical_net_from_gross_and_refunds"],
    gross_sale_volume: ["canonical_net_from_gross_and_refunds"], refund_volume: ["canonical_net_from_gross_and_refunds"],
    fee_total: ["processing_fee_total", "complete_fee_occurrence_population"], funding_batches: ["funding_population"],
    fee_detail: ["complete_fee_occurrence_population"], reconciliation_controls: controls.map((control) => control.semanticPurpose),
  };
  const capabilities = FISERV_CAPABILITY_IDS.map((capability) => {
    const roles = roleByCapability[capability] ?? [];
    const occurrenceRefs = capability === "processor_identity" ? protocolOccurrences.map((occurrence) => occurrence.id)
      : capability === "statement_period" ? statementPeriodOccurrences.map((occurrence) => occurrence.id)
        : capability === "fee_detail" ? feeDetailOccurrences.map((occurrence) => occurrence.id)
          : unique(roles.flatMap((role) => occurrenceRefsForRole(role)));
    const relevantControls = controls.filter((control) => (purposeByCapability[capability] ?? []).includes(control.semanticPurpose)
      && (control.result === "pass" || control.result === "pass_with_rounding"));
    const proofEvidenceRefs = unique([...(capability === "processor_identity" ? protocolEvidenceRefs : []),
      ...occurrenceRefs.map((ref) => foundation.sourceModel.occurrences.find((occurrence) => occurrence.id === ref)?.evidenceRef ?? ""),
      ...relevantControls.flatMap((control) => control.evidenceRefs)]);
    const supported = dynamicSupported[capability] === true && proofEvidenceRefs.length > 0;
    return { capability, status: supported ? "supported" as const : "unknown" as const,
      basis: supported ? "statement_level_capability_proof" as const : "unresolved" as const,
      population: populationForCapability(capability), occurrenceRefs: supported ? unique(occurrenceRefs) : [],
      proofEvidenceRefs: supported ? proofEvidenceRefs : [],
      reconciliationControlRefs: supported ? relevantControls.map((control) => control.id) : [],
      reasonCodes: supported ? ["exact_occurrence_population_and_claim_relevant_control_proven"]
        : [familyProven ? "claim_specific_statement_proof_insufficient" : "supported_fiserv_protocol_identity_unresolved"],
      limitations: capabilityLimitations(capability, supported) };
  });
  const supportState: FiservSupportState = !artifactComplete ? "unreadable_or_incomplete"
    : !familyProven ? "unsupported_document_class" : !headlineProof ? "recognized_but_insufficient"
      : fullFoundation ? "supported_full" : "supported_limited";
  const observedOccurrenceState: FiservCoverageState = feeOccurrenceComplete ? "complete"
    : feeDetailOccurrences.length > 0 ? "partial" : "unknown";
  const coverage = buildCoverage(foundation, artifactComplete, statementComplete, feeSections, feeSectionsComplete,
    feeDetailOccurrences, feeOccurrenceComplete, observedOccurrenceState);
  const outputPermissions = buildOutputPermissions(capabilities, supportState);
  const proof: FiservRuntimeCapabilityProof = {
    schemaVersion: "fiserv_runtime_capability_proof_v2", contractVersion: FISERV_CAPABILITY_CONTRACT_VERSION,
    policyId: FISERV_RUNTIME_CAPABILITY_POLICY_ID, policyVersion: FISERV_RUNTIME_CAPABILITY_POLICY_VERSION,
    candidateExtraction, protocolIdentity,
    family: { status: familyProven ? "proven" : "unresolved",
      processorFamily: familyProven ? "supported_fiserv_statement_protocol_family" : null,
      proofEvidenceRefs: familyProven ? protocolEvidenceRefs : [], reasonCodes: protocolIdentity.reasonCodes },
    coverage, reconciliationControlCandidates: controls, capabilities, supportState, outputPermissions,
    knownLayoutMappingId: input.knownLayoutResolution?.mappingId ?? null,
    mappingAuthority: "diagnostic_only_zero_canonical_authority",
    limitations: [
      "Known mappings, adapter identity, driver identity, parser-assigned family, filename, merchant identity, and amounts confer zero support authority.",
      "Arithmetic controls prove only their pre-bound semantic purpose and never identity, completeness, pricing, economic roles, recurrence, savings, or actionability.",
      "No standalone structural-only Route B protocol signature is designated in v1.",
    ],
  };
  if (!familyProven) return { resolution: null, proof };
  const supportedCapabilities = capabilities.filter((capability) => capability.status === "supported");
  const templateAdmission: CanonicalEconomicsV2TemplateAdmissionInput = {
    detectedFamily: "supported_fiserv_statement_protocol_family", detectedTemplate: FISERV_RUNTIME_CAPABILITY_POLICY_ID,
    detectedVersion: FISERV_RUNTIME_CAPABILITY_POLICY_VERSION, identityStatus: "proven", admissionStatus: "admitted",
    admissionAuthority: { lifecycle: "admitted_with_conditions", authorityClass: "deterministic_capability_policy",
      authorityRef: POLICY_AUTHORITY_REF, admittedAt: POLICY_ADMITTED_AT,
      admissionVersion: FISERV_RUNTIME_CAPABILITY_POLICY_VERSION, effectiveFrom: null, effectiveTo: null },
    completenessStatus: statementComplete ? "complete" : foundation.documentIntegrity.completenessStatus,
    admissionProofEvidenceRefs: unique(supportedCapabilities.flatMap((capability) => capability.proofEvidenceRefs)),
    capabilities: capabilities.map((capability) => ({ capability: capability.capability, status: capability.status,
      proofEvidenceRefs: capability.proofEvidenceRefs, limitations: capability.limitations })), limitations: proof.limitations,
  };
  const sectionAdmissions = buildDynamicSectionAdmissions(foundation, capabilities, coverage);
  const feeDetailCoverage = observedOccurrenceState === "complete" ? "complete_observed_occurrences" as const
    : feeDetailOccurrences.length > 0 ? "partial" as const : "unproven" as const;
  return { proof, resolution: { mappingId: FISERV_RUNTIME_CAPABILITY_POLICY_ID,
    mappingVersion: FISERV_RUNTIME_CAPABILITY_POLICY_VERSION, authorityClass: "deterministic_capability_policy",
    authorityRef: POLICY_AUTHORITY_REF, matched: true, templateAdmission, sectionAdmissions, feeDetailCoverage,
    capabilityProof: proof } };
}

function buildCoverage(
  foundation: CanonicalEconomicsV2Foundation,
  artifactComplete: boolean,
  statementComplete: boolean,
  feeSections: CanonicalEconomicsV2Foundation["sourceModel"]["sections"],
  feeSectionsComplete: boolean,
  feeDetailOccurrences: CanonicalEconomicsV2SourceOccurrence[],
  feeOccurrenceComplete: boolean,
  observedOccurrenceState: FiservCoverageState,
): FiservRuntimeCapabilityProof["coverage"] {
  return {
    suppliedArtifactIntegrity: {
      state: artifactComplete ? "complete" : foundation.documentIntegrity.suppliedDocumentStatus === "incomplete_or_corrupt_supplied_document" ? "partial" : "unknown",
      evidenceRefs: artifactComplete ? ["document_integrity:complete_supplied_document"] : [],
      reasonCodes: [artifactComplete ? "supplied_artifact_and_lineage_complete" : "supplied_artifact_integrity_not_proven"],
    },
    statementCompleteness: {
      state: statementComplete ? "complete" : foundation.documentIntegrity.completenessStatus === "incomplete" ? "partial" : "unknown",
      evidenceRefs: statementComplete ? foundation.documentIntegrity.proofEvidenceRefs : [],
      reasonCodes: [statementComplete ? "statement_completeness_proven" : "statement_completeness_not_proven"],
    },
    sections: foundation.sourceModel.sections.map((section) => {
      const isFeeSection = feeSections.some((candidate) => candidate.id === section.id);
      const state: FiservCoverageState = isFeeSection && feeSectionsComplete ? "complete"
        : isFeeSection && feeDetailOccurrences.some((occurrence) => occurrence.sectionRef === section.id) ? "partial"
          : section.completenessStatus === "complete" ? "complete" : "unknown";
      return { sectionRef: section.id, kind: section.kind, state, evidenceRefs: unique(section.evidenceRefs),
        reasonCodes: [state === "complete" ? "section_scope_and_observation_complete" : "section_completeness_not_proven"] };
    }),
    observedOccurrences: {
      population: "fee_occurrences", state: observedOccurrenceState,
      occurrenceRefs: unique(feeDetailOccurrences.map((occurrence) => occurrence.id)),
      evidenceRefs: unique(feeDetailOccurrences.map((occurrence) => occurrence.evidenceRef)),
      reasonCodes: [feeOccurrenceComplete ? "all_observed_fee_occurrences_bound_directional_deduplicated_and_reconciled"
        : "observed_fee_occurrence_completeness_not_proven"],
    },
  };
}

function buildPreboundControlCandidates(input: {
  foundation: CanonicalEconomicsV2Foundation;
  parserOutput: Record<string, any>;
  netOccurrence: CanonicalEconomicsV2SourceOccurrence | null;
  feeOccurrence: CanonicalEconomicsV2SourceOccurrence | null;
  grossOccurrence: CanonicalEconomicsV2SourceOccurrence | null;
  refundOccurrence: CanonicalEconomicsV2SourceOccurrence | null;
  fundingOccurrence: CanonicalEconomicsV2SourceOccurrence | null;
  feeDetailOccurrences: CanonicalEconomicsV2SourceOccurrence[];
}): FiservPreboundReconciliationControl[] {
  const rawRows = records(input.parserOutput.reconciliationResults);
  const results = rawRows.map((row, index) => {
    const identity = String(row.identity ?? `unknown_control_${index}`);
    const spec = controlSpec(identity);
    if (!spec) return rejectedControl(identity, index, "control_identity_not_in_bounded_policy");
    let operands: CanonicalEconomicsV2SourceOccurrence[] = [];
    let total: CanonicalEconomicsV2SourceOccurrence | null = null;
    if (spec.semanticPurpose === "canonical_net_submitted_population") {
      total = input.netOccurrence;
      operands = input.foundation.sourceModel.occurrences.filter((occurrence) =>
        occurrence.semanticRole === "net_submitted" && occurrence.id !== total?.id);
      if (operands.length === 0 && input.fundingOccurrence) operands = [input.fundingOccurrence];
    } else if (spec.semanticPurpose === "processing_fee_total") {
      total = input.feeOccurrence;
      operands = spec.controlType === "subtotal_composition" ? input.feeDetailOccurrences
        : [input.netOccurrence, input.fundingOccurrence].filter(isOccurrence);
    } else if (spec.semanticPurpose === "complete_fee_occurrence_population") {
      total = input.feeOccurrence;
      operands = input.feeDetailOccurrences;
    } else if (spec.semanticPurpose === "funding_population") {
      total = input.fundingOccurrence;
      operands = [input.netOccurrence, input.feeOccurrence].filter(isOccurrence);
    }
    return bindAndEvaluateControl({ identity, index, row, spec, operands, total });
  });
  if (input.netOccurrence && input.grossOccurrence && input.refundOccurrence) {
    const gross = input.grossOccurrence.printedAmount?.amountMinor ?? null;
    const refunds = input.refundOccurrence.printedAmount?.amountMinor ?? null;
    const net = input.netOccurrence.printedAmount?.amountMinor ?? null;
    const delta = gross === null || refunds === null || net === null ? null : net - (gross - refunds);
    results.push(bindAndEvaluateControl({
      identity: "statement_derived:gross_minus_refunds_equals_net_submitted", index: rawRows.length,
      row: { status: delta === null ? "RECON_MISSING_INPUT" : Math.abs(delta) <= 1 ? "RECON_OK" : "RECON_MATERIAL_BREAK",
        toleranceBand: 0.01 },
      spec: { controlType: "derived_financial_identity", semanticPurpose: "canonical_net_from_gross_and_refunds",
        population: "canonical_net_submitted_card_volume", operator: "gross_minus_refunds" },
      operands: [input.grossOccurrence, input.refundOccurrence], total: input.netOccurrence,
    }));
  }
  return results;
}

function controlSpec(identity: string): {
  controlType: FiservPreboundReconciliationControl["controlType"];
  semanticPurpose: string;
  population: string;
  operator: FiservPreboundReconciliationControl["operator"];
} | null {
  if (/^cross_reference:.*submitted/i.test(identity)) return { controlType: "cross_representation",
    semanticPurpose: "canonical_net_submitted_population", population: "canonical_net_submitted_card_volume", operator: "equality" };
  if (/^headline:(?:funding_formula|submitted_plus_adjustments_minus_fees_eq_processed)/i.test(identity)) return {
    controlType: "declared_equation", semanticPurpose: "canonical_net_submitted_population",
    population: "canonical_net_submitted_card_volume", operator: "submitted_adjustments_fees_to_funded" };
  if (/^fee_detail:(?:all_line_items_eq_total_fees|generic_row_sum_eq_printed_total)/i.test(identity)) return {
    controlType: "subtotal_composition", semanticPurpose: "complete_fee_occurrence_population",
    population: "fee_occurrences", operator: "sum" };
  if (/^fee_detail:.*line_sum_eq_printed_total/i.test(identity) || /^summary_split:.*total_fees/i.test(identity)) return {
    controlType: "subtotal_composition", semanticPurpose: "processing_fee_total",
    population: "statement_processing_fee_total", operator: "sum" };
  if (/^batch_columns:.*(?:submitted|funded|fees)/i.test(identity) || /^batch_row:.*funding_formula/i.test(identity)) return {
    controlType: "subtotal_composition", semanticPurpose: "funding_population", population: "funding_batches", operator: "sum" };
  return null;
}

function bindAndEvaluateControl(input: { identity: string; index: number; row: Record<string, any>;
  spec: NonNullable<ReturnType<typeof controlSpec>>; operands: CanonicalEconomicsV2SourceOccurrence[];
  total: CanonicalEconomicsV2SourceOccurrence | null }): FiservPreboundReconciliationControl {
  const tolerance = finite(input.row.toleranceBand);
  const evidenceRefs = unique([...input.operands.map((occurrence) => occurrence.evidenceRef), input.total?.evidenceRef ?? ""]);
  const circular = !input.total || input.operands.length === 0 || input.operands.some((occurrence) => occurrence.id === input.total?.id)
    || new Set(input.operands.map((occurrence) => occurrence.id)).size !== input.operands.length
    || (input.spec.controlType === "cross_representation" && input.operands.every((occurrence) =>
      occurrence.evidenceRef === input.total?.evidenceRef));
  const signsAmbiguous = input.operands.some((occurrence) => occurrence.printedDirection === "unknown")
    || input.total?.printedDirection === "unknown";
  const bound = !circular && !signsAmbiguous && tolerance !== null && tolerance >= 0 && evidenceRefs.length > 0;
  const parserResult = String(input.row.status ?? "RECON_MISSING_INPUT");
  const result: FiservPreboundReconciliationControl["result"] = !bound ? "rejected"
    : parserResult === "RECON_OK" ? "pass" : parserResult === "RECON_ROUNDING" ? "pass_with_rounding"
      : parserResult === "RECON_MISSING_INPUT" ? "missing_input" : "fail";
  return {
    id: `prebound_control_${input.index}_${slug(input.identity)}`, sourceControlIdentity: input.identity,
    bindingState: bound ? "bound" : "rejected", ...input.spec,
    operandOccurrenceRefs: bound ? unique(input.operands.map((occurrence) => occurrence.id)) : [],
    authoritativeTotalOccurrenceRef: bound ? input.total!.id : null, evidenceRefs: bound ? evidenceRefs : [],
    lineageState: bound ? "independent_or_declared_multi_field" : "circular_or_ambiguous",
    toleranceBasis: bound ? (input.spec.operator === "sum" ? "parser_declared_sum_precision" : "printed_currency_precision") : "unbound",
    tolerance: bound ? tolerance : null, result,
    reasonCodes: bound ? ["meaning_population_operands_signs_total_lineage_and_tolerance_prebound_before_result"]
      : unique([circular ? "circular_missing_or_ambiguous_lineage" : "", signsAmbiguous ? "ambiguous_printed_direction" : "",
        tolerance === null || tolerance < 0 ? "tolerance_basis_missing" : ""]),
  };
}

function rejectedControl(identity: string, index: number, reason: string): FiservPreboundReconciliationControl {
  return { id: `prebound_control_${index}_${slug(identity)}`, sourceControlIdentity: identity, bindingState: "rejected",
    controlType: "declared_equation", semanticPurpose: "unbound", population: "unknown", operator: "equality",
    operandOccurrenceRefs: [], authoritativeTotalOccurrenceRef: null, evidenceRefs: [],
    lineageState: "circular_or_ambiguous", toleranceBasis: "unbound", tolerance: null, result: "rejected", reasonCodes: [reason] };
}

function buildOutputPermissions(capabilities: FiservRuntimeCapabilityProof["capabilities"],
  supportState: FiservSupportState): FiservOutputPermission[] {
  const supported = new Set(capabilities.filter((capability) => capability.status === "supported").map((capability) => capability.capability));
  const has = (...ids: CanonicalEconomicsV2CapabilityId[]) => ids.every((id) => supported.has(id));
  const permitted = (output: FiservOutputPermission["output"], prerequisites: CanonicalEconomicsV2CapabilityId[], pass: boolean,
    passState: FiservOutputPermission["state"] = "permitted"): FiservOutputPermission => ({ output,
      state: pass ? passState : "withheld", prerequisiteCapabilities: prerequisites,
      reasonCodes: [pass ? "upstream_capability_prerequisites_satisfied" : "upstream_capability_prerequisites_unresolved"] });
  const permissions: FiservOutputPermission[] = [
    permitted("statement_period_source_identity", ["processor_identity", "statement_period"], has("processor_identity", "statement_period")),
    permitted("net_submitted_volume", ["canonical_net_submitted_card_volume"], has("canonical_net_submitted_card_volume")),
    permitted("total_processing_fees", ["fee_total"], has("fee_total")),
    permitted("headline_effective_rate", ["canonical_net_submitted_card_volume", "fee_total"], has("canonical_net_submitted_card_volume", "fee_total")),
    permitted("gross_sales_refunds", ["gross_sale_volume", "refund_volume"], has("gross_sale_volume", "refund_volume")),
    permitted("transaction_count", ["gross_sale_transaction_count"], has("gross_sale_transaction_count")),
    permitted("average_ticket", ["gross_sale_volume", "gross_sale_transaction_count"], has("gross_sale_volume", "gross_sale_transaction_count")),
    permitted("partial_fee_inventory", ["fee_detail"], has("fee_detail"), "limited"),
    permitted("complete_fee_inventory", ["fee_detail"], supportState === "supported_full" && has("fee_detail")),
    permitted("partial_fee_composition", ["fee_detail"], has("fee_detail"), "limited"),
    permitted("complete_fee_composition", ["fee_detail"], supportState === "supported_full" && has("fee_detail")),
    permitted("funding_batch_analysis", ["funding_batches"], has("funding_batches")),
  ];
  for (const output of ["pricing_architecture", "economic_roles", "recurrence", "savings_impact", "merchant_action"] as const) {
    permissions.push({ output, state: "downstream_gated", prerequisiteCapabilities: [],
      reasonCodes: ["rb_support_identity_and_reconciliation_confer_zero_downstream_semantic_authority"] });
  }
  return FISERV_OUTPUT_IDS.map((output) => permissions.find((permission) => permission.output === output)!);
}

function buildDynamicSectionAdmissions(foundation: CanonicalEconomicsV2Foundation,
  capabilities: FiservRuntimeCapabilityProof["capabilities"], coverage: FiservRuntimeCapabilityProof["coverage"]): CanonicalEconomicsV2SectionAdmission[] {
  const supported = new Set(capabilities.filter((capability) => capability.status === "supported").map((capability) => capability.capability));
  return foundation.sourceModel.sections.flatMap((section) => {
    const occurrences = foundation.sourceModel.occurrences.filter((occurrence) => occurrence.sectionRef === section.id);
    const populationSemantics = uniquePopulationSemantics(occurrences.flatMap((occurrence) => {
      const mapping = populationForRole(occurrence.semanticRole);
      return mapping && supported.has(mapping.capability) ? [mapping.population] : [];
    }));
    if (populationSemantics.length === 0 && !/^header$/i.test(section.heading)) return [];
    const sectionCoverage = coverage.sections.find((candidate) => candidate.sectionRef === section.id);
    return [{ sourceSection: section.heading, populationSemantics,
      completenessStatus: sectionCoverage?.state === "complete" ? "complete" as const
        : sectionCoverage?.state === "partial" ? "incomplete" as const : "unknown" as const,
      capabilityStatus: "supported" as const, evidenceRefs: unique(occurrences.map((occurrence) => occurrence.evidenceRef)),
      limitations: ["Section authority is restricted to independently proven statement-level capability semantics."] }];
  });
}

function populationForCapability(capability: CanonicalEconomicsV2CapabilityId): CanonicalEconomicsV2PopulationSemantic | null {
  const values: Partial<Record<CanonicalEconomicsV2CapabilityId, CanonicalEconomicsV2PopulationSemantic>> = {
    gross_sale_volume: "gross_sale_volume", refund_volume: "refund_volume",
    canonical_net_submitted_card_volume: "canonical_net_submitted_card_volume",
    gross_sale_transaction_count: "gross_sale_transaction_count", refund_transaction_count: "refund_transaction_count",
    submitted_transaction_count: "submitted_transaction_count", fee_total: "statement_processing_fee_total",
    fee_detail: "fee_occurrences", funding_batches: "funding_batches", settlement_adjustments: "settlement_adjustment_amount",
    chargeback_financial_populations: "chargeback_principal_amount",
  };
  return values[capability] ?? null;
}

function populationForRole(role: CanonicalEconomicsV2SourceOccurrence["semanticRole"]): {
  capability: CanonicalEconomicsV2CapabilityId; population: CanonicalEconomicsV2PopulationSemantic } | null {
  switch (role) {
    case "gross_sale": return { capability: "gross_sale_volume", population: "gross_sale_volume" };
    case "refund": return { capability: "refund_volume", population: "refund_volume" };
    case "net_submitted": return { capability: "canonical_net_submitted_card_volume", population: "canonical_net_submitted_card_volume" };
    case "gross_sale_count": return { capability: "gross_sale_transaction_count", population: "gross_sale_transaction_count" };
    case "refund_count": return { capability: "refund_transaction_count", population: "refund_transaction_count" };
    case "submitted_count": return { capability: "submitted_transaction_count", population: "submitted_transaction_count" };
    case "fee_charge":
    case "fee_credit": return { capability: "fee_detail", population: "fee_occurrences" };
    case "settlement_adjustment": return { capability: "settlement_adjustments", population: "settlement_adjustment_amount" };
    case "chargeback_principal_debit":
    case "chargeback_representment": return { capability: "chargeback_financial_populations", population: "chargeback_principal_amount" };
    case "funded_amount": return { capability: "funding_batches", population: "net_funded_amount" };
    default: return null;
  }
}

function capabilityLimitations(capability: CanonicalEconomicsV2CapabilityId, supported: boolean): string[] {
  if (!supported) return ["The available statement evidence, exact occurrences, population binding, coverage, and claim-relevant controls did not prove this capability."];
  const common = "Support is output-scoped and does not expand pricing, ownership, control, benchmark, recurrence, savings, or actionability authority.";
  if (capability === "fee_total") return [common, "The fee total does not establish total acceptance cost or fee ownership."];
  if (capability === "fee_detail") return [common, "Occurrence identity, sign, amount, and observed-row coverage are admitted; economic category and ownership remain unresolved."];
  if (capability === "processor_identity") return ["Statement-protocol compatibility does not establish the legal or contractual processor and proves no financial capability by itself."];
  return [common];
}

function uniquePopulationSemantics(values: CanonicalEconomicsV2PopulationSemantic[]): CanonicalEconomicsV2PopulationSemantic[] {
  return [...new Set(values)].sort();
}
function isOccurrence(value: CanonicalEconomicsV2SourceOccurrence | null): value is CanonicalEconomicsV2SourceOccurrence { return value !== null; }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 96); }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function records(value: unknown): Record<string, any>[] { return Array.isArray(value) ? value.map(record) : []; }
function finite(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort(); }
