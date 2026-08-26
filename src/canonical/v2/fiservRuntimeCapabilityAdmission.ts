import type { CanonicalEconomicsV2TemplateAdmissionInput } from "./fiservAdapter.js";
import type { CanonicalEconomicsV2SectionAdmission } from "./sourceModel.js";
import type {
  CanonicalEconomicsV2CapabilityId,
  CanonicalEconomicsV2Foundation,
  CanonicalEconomicsV2PopulationSemantic,
  CanonicalEconomicsV2SourceOccurrence,
} from "./types.js";
import { fiservFeeLedgerOccurrences } from "./fiservAdapter.js";

export const FISERV_RUNTIME_CAPABILITY_POLICY_ID = "fiserv_family_deterministic_capability_policy";
export const FISERV_RUNTIME_CAPABILITY_POLICY_VERSION = "1.0.0";
const POLICY_AUTHORITY_REF = "approved-product-policy-fiserv-capability-admission-2026-08-26";
const POLICY_ADMITTED_AT = "2026-08-26T00:00:00.000Z";

export const FISERV_CAPABILITY_IDS = [
  "processor_identity",
  "statement_period",
  "gross_sale_volume",
  "refund_volume",
  "canonical_net_submitted_card_volume",
  "gross_sale_transaction_count",
  "submitted_transaction_count",
  "refund_transaction_count",
  "fee_total",
  "funding_batches",
  "settlement_adjustments",
  "chargeback_financial_populations",
  "fee_detail",
  "non_fee_financial_flow_exclusions",
  "reconciliation_controls",
] as const satisfies readonly CanonicalEconomicsV2CapabilityId[];

export type FiservCapabilityProofBasis = "approved_structural_mapping" | "deterministic_runtime_proof" | "unresolved";

export type FiservRuntimeCapabilityProof = {
  schemaVersion: "fiserv_runtime_capability_proof_v1";
  policyId: typeof FISERV_RUNTIME_CAPABILITY_POLICY_ID;
  policyVersion: typeof FISERV_RUNTIME_CAPABILITY_POLICY_VERSION;
  family: {
    status: "proven" | "unresolved";
    processorFamily: string | null;
    proofEvidenceRefs: string[];
    reasonCodes: string[];
  };
  capabilities: Array<{
    capability: CanonicalEconomicsV2CapabilityId;
    status: "supported" | "unknown";
    basis: FiservCapabilityProofBasis;
    proofEvidenceRefs: string[];
    reasonCodes: string[];
    limitations: string[];
  }>;
  knownLayoutMappingId: string | null;
  limitations: string[];
};

export type FiservRuntimeCapabilityAdmissionResolution = {
  mappingId: string;
  mappingVersion: string;
  authorityClass: "product_owner" | "deterministic_capability_policy";
  authorityRef: string;
  matched: true;
  templateAdmission: CanonicalEconomicsV2TemplateAdmissionInput;
  sectionAdmissions: CanonicalEconomicsV2SectionAdmission[];
  feeDetailCoverage: "complete_observed_occurrences" | "partial" | "unproven";
  capabilityProof: FiservRuntimeCapabilityProof;
};

type KnownLayoutResolution = {
  mappingId: string;
  mappingVersion: string;
  authorityClass: "product_owner";
  authorityRef: string;
  templateAdmission: CanonicalEconomicsV2TemplateAdmissionInput;
  sectionAdmissions: CanonicalEconomicsV2SectionAdmission[];
  feeDetailCoverage: "complete_observed_occurrences" | "partial";
};

export function resolveFiservRuntimeCapabilityAdmission(input: {
  driverId: string;
  parserOutput: unknown;
  observationalFoundation: CanonicalEconomicsV2Foundation;
  knownLayoutResolution?: KnownLayoutResolution | null;
  dynamicAdmissionAllowed?: boolean;
}): { resolution: FiservRuntimeCapabilityAdmissionResolution | null; proof: FiservRuntimeCapabilityProof } {
  const output = record(input.parserOutput);
  const identity = record(output.statementIdentity);
  const selected = record(output.selectedFinancials);
  const decision = record(output.decision);
  const validation = record(decision.validationState);
  const feeLedger = record(output.feeLedger);
  const feeRows = records(feeLedger.rows);
  const fundingLedger = record(output.fundingBatchLedger);
  const fundingRows = records(fundingLedger.rows);
  const foundation = input.observationalFoundation;
  const known = input.knownLayoutResolution ?? null;
  const dynamicAdmissionAllowed = input.dynamicAdmissionAllowed ?? true;

  const refsFor = (predicate: (occurrence: CanonicalEconomicsV2SourceOccurrence) => boolean) => unique(
    foundation.sourceModel.occurrences.filter(predicate).map((occurrence) => occurrence.evidenceRef),
  );
  const refsForRole = (role: CanonicalEconomicsV2SourceOccurrence["semanticRole"]) => refsFor(
    (occurrence) => occurrence.semanticRole === role,
  );
  const refsForLabel = (...labels: string[]) => refsFor((occurrence) => labels.includes(occurrence.sourceLabel));
  const identityRefs = refsForLabel("processorIdentity");
  const structureRefs = refsForLabel("processorStructure");
  const familyRefs = unique([...identityRefs, ...structureRefs]);
  const statementPeriodRefs = refsForLabel("statementPeriod");
  const suppliedDocumentComplete = foundation.documentIntegrity.suppliedDocumentStatus === "complete_supplied_document";
  const identityNamesFiserv = /fiserv|first data/i.test(String(identity.processorFamily ?? ""));
  const supportedDriver = [
    "fiserv_first_data_processor_statement",
    "fiserv_first_data_full_statement",
    "fiserv_first_data_short_statement",
    "generic_fiserv_family_statement",
  ].includes(input.driverId);
  const strongFamilyEvidence = identityRefs.length > 0 || structureRefs.length >= 3;
  const familyProven = supportedDriver && identityNamesFiserv && strongFamilyEvidence && suppliedDocumentComplete;
  const familyReasons = unique([
    ...(supportedDriver ? ["supported_fiserv_family_driver"] : ["unsupported_parser_driver"]),
    ...(identityNamesFiserv ? ["parser_identity_names_fiserv_family"] : ["parser_identity_not_fiserv_family"]),
    ...(strongFamilyEvidence ? ["source_family_markers_present"] : ["source_family_markers_insufficient"]),
    ...(suppliedDocumentComplete ? ["complete_supplied_document_lineage"] : ["supplied_document_lineage_incomplete"]),
  ]);
  const controls = foundation.reconciliation;
  const controlsFor = (pattern: RegExp) => controls.filter((control) => pattern.test(control.controlIdentity));
  const controlProof = (pattern: RegExp) => unique(controlsFor(pattern)
    .filter((control) => control.status === "pass" || control.status === "pass_with_rounding")
    .flatMap((control) => control.evidenceRefs));
  const controlsPass = (pattern: RegExp) => {
    const relevant = controlsFor(pattern);
    return relevant.some((control) => control.status === "pass" || control.status === "pass_with_rounding")
      && !relevant.some((control) => control.status === "fail");
  };
  const exactMoney = (left: number | null, right: number | null) => left !== null && right !== null && Math.abs(left - right) <= 0.01;
  const gross = finite(selected.grossSales);
  const refunds = finite(selected.refunds);
  const net = finite(selected.totalVolume);
  const fees = finite(selected.totalFees);
  const grossMathProven = gross !== null && refunds !== null && net !== null && exactMoney(gross - refunds, net);
  const topLevelAllowed = validation.customerFacingTotalsAllowed === true
    && validation.topLevelTotals !== "failed" && validation.topLevelTotals !== "missing";
  const feeControlPattern = /fee_detail|fee_bucket|fee.*total|effective_rate/i;
  const submittedControlPattern = /submitted|volume|effective_rate/i;
  const batchControlPattern = /batch|funding|amount_funded|processed/i;
  const feeRowsSum = feeRows.reduce((sum, row) => sum + (finite(row.amount) ?? Number.NaN), 0);
  const feeDetailProven = topLevelAllowed && validation.feeLedgerAllowed === true && feeRows.length > 0
    && ["reconciled", "reconciled_with_rounding_delta"].includes(String(feeLedger.status ?? ""))
    && fees !== null && Number.isFinite(feeRowsSum) && exactMoney(feeRowsSum, fees)
    && feeRows.every((row) => typeof row.evidenceLine === "string" && row.evidenceLine.trim().length > 0)
    && controlsPass(feeControlPattern);
  const fundingProven = validation.batchDetailAllowed === true && fundingRows.length > 0
    && ["reconciled", "reconciled_with_warnings"].includes(String(fundingLedger.status ?? ""))
    && controlsPass(batchControlPattern);
  const roleRefs: Partial<Record<CanonicalEconomicsV2CapabilityId, string[]>> = {
    processor_identity: familyRefs,
    statement_period: statementPeriodRefs,
    gross_sale_volume: refsForRole("gross_sale"),
    refund_volume: refsForRole("refund"),
    canonical_net_submitted_card_volume: refsForRole("net_submitted"),
    gross_sale_transaction_count: refsForRole("gross_sale_count"),
    submitted_transaction_count: refsForRole("submitted_count"),
    refund_transaction_count: refsForRole("refund_count"),
    fee_total: refsForRole("fee_charge"),
    funding_batches: refsForRole("funded_amount"),
    settlement_adjustments: refsForRole("settlement_adjustment"),
    chargeback_financial_populations: unique([...refsForRole("chargeback_principal_debit"), ...refsForRole("chargeback_representment")]),
    fee_detail: unique(fiservFeeLedgerOccurrences(foundation).map((occurrence) => occurrence.evidenceRef)),
    non_fee_financial_flow_exclusions: unique([
      ...refsForRole("refund"),
      ...refsForRole("settlement_adjustment"),
      ...refsForRole("chargeback_principal_debit"),
      ...refsForRole("chargeback_representment"),
    ]),
    reconciliation_controls: unique(controls
      .filter((control) => control.status === "pass" || control.status === "pass_with_rounding")
      .flatMap((control) => control.evidenceRefs)),
  };
  const period = foundation.identity.statementPeriod;
  const uniqueCount = (role: CanonicalEconomicsV2SourceOccurrence["semanticRole"]) => {
    const values = foundation.sourceModel.occurrences.filter((occurrence) => occurrence.semanticRole === role)
      .map((occurrence) => occurrence.printedCount).filter((value): value is number => value !== null);
    return values.length > 0 && new Set(values).size === 1;
  };
  const separatedAdjustments = fundingProven && fundingRows.every((row) => finite(row.adjustments) !== null);
  const separatedChargebacks = fundingProven && fundingRows.every((row) => finite(row.chargebacks) !== null);
  const dynamicSupported: Partial<Record<CanonicalEconomicsV2CapabilityId, boolean>> = {
    processor_identity: familyProven,
    statement_period: familyProven && period !== null && statementPeriodRefs.length > 0,
    gross_sale_volume: familyProven && topLevelAllowed && grossMathProven && (roleRefs.gross_sale_volume?.length ?? 0) > 0,
    refund_volume: familyProven && topLevelAllowed && grossMathProven && (roleRefs.refund_volume?.length ?? 0) > 0,
    canonical_net_submitted_card_volume: familyProven && topLevelAllowed && net !== null
      && (roleRefs.canonical_net_submitted_card_volume?.length ?? 0) > 0
      && (grossMathProven || controlsPass(submittedControlPattern)),
    gross_sale_transaction_count: familyProven && grossMathProven && uniqueCount("gross_sale_count"),
    submitted_transaction_count: familyProven && uniqueCount("submitted_count")
      && controlsPass(submittedControlPattern),
    refund_transaction_count: familyProven && uniqueCount("refund_count") && grossMathProven,
    fee_total: familyProven && topLevelAllowed && fees !== null && (roleRefs.fee_total?.length ?? 0) > 0
      && controlsPass(feeControlPattern),
    funding_batches: familyProven && fundingProven,
    settlement_adjustments: familyProven && separatedAdjustments && (roleRefs.settlement_adjustments?.length ?? 0) > 0,
    chargeback_financial_populations: familyProven && separatedChargebacks
      && (roleRefs.chargeback_financial_populations?.length ?? 0) > 0,
    fee_detail: familyProven && feeDetailProven && (roleRefs.fee_detail?.length ?? 0) > 0,
    non_fee_financial_flow_exclusions: familyProven && Boolean(
      (grossMathProven && (roleRefs.refund_volume?.length ?? 0) > 0)
      || (separatedAdjustments && (roleRefs.settlement_adjustments?.length ?? 0) > 0)
      || (separatedChargebacks && (roleRefs.chargeback_financial_populations?.length ?? 0) > 0)
    ),
    reconciliation_controls: familyProven && controls.some((control) => control.status === "pass" || control.status === "pass_with_rounding"),
  };
  const knownCapabilities = new Map(
    (known?.templateAdmission.capabilities ?? []).map((capability) => [capability.capability, capability]),
  );
  const capabilities = FISERV_CAPABILITY_IDS.map((capability) => {
    const knownCapability = knownCapabilities.get(capability);
    const knownSupported = knownCapability?.status === "supported" && (knownCapability.proofEvidenceRefs?.length ?? 0) > 0;
    const runtimeSupported = dynamicAdmissionAllowed && !known
      && dynamicSupported[capability] === true && (roleRefs[capability]?.length ?? 0) > 0;
    const proofEvidenceRefs = unique([
      ...(knownSupported ? knownCapability?.proofEvidenceRefs ?? [] : []),
      ...(runtimeSupported ? roleRefs[capability] ?? [] : []),
      ...(runtimeSupported && capability === "fee_total" ? controlProof(feeControlPattern) : []),
      ...(runtimeSupported && capability === "canonical_net_submitted_card_volume" ? controlProof(submittedControlPattern) : []),
      ...(runtimeSupported && capability === "funding_batches" ? controlProof(batchControlPattern) : []),
    ]);
    const supported = familyProven && (knownSupported || runtimeSupported) && proofEvidenceRefs.length > 0;
    return {
      capability,
      status: supported ? "supported" as const : "unknown" as const,
      basis: knownSupported ? "approved_structural_mapping" as const
        : runtimeSupported ? "deterministic_runtime_proof" as const : "unresolved" as const,
      proofEvidenceRefs,
      reasonCodes: supported
        ? unique([knownSupported ? "approved_structural_mapping_proof" : "claim_specific_deterministic_proof"])
        : [familyProven ? "claim_specific_proof_insufficient" : "fiserv_family_not_proven"],
      limitations: capabilityLimitations(capability, supported),
    };
  });
  const proof: FiservRuntimeCapabilityProof = {
    schemaVersion: "fiserv_runtime_capability_proof_v1",
    policyId: FISERV_RUNTIME_CAPABILITY_POLICY_ID,
    policyVersion: FISERV_RUNTIME_CAPABILITY_POLICY_VERSION,
    family: {
      status: familyProven ? "proven" : "unresolved",
      processorFamily: familyProven ? String(identity.processorFamily) : null,
      proofEvidenceRefs: familyRefs,
      reasonCodes: familyReasons,
    },
    capabilities,
    knownLayoutMappingId: known?.mappingId ?? null,
    limitations: [
      "Processor-statement completeness remains independently unknown.",
      "Capability proof admits only the enumerated claim and never pricing, ownership, control, benchmark, or savings semantics.",
    ],
  };
  if (!familyProven || (!known && !dynamicAdmissionAllowed)) return { resolution: null, proof };

  const supportedCapabilities = capabilities.filter((capability) => capability.status === "supported");
  const usesRuntimeCapabilityProof = supportedCapabilities.some(
    (capability) => capability.basis === "deterministic_runtime_proof",
  );
  const usesKnownLayoutAuthorityOnly = Boolean(known) && !usesRuntimeCapabilityProof;
  const admissionProofEvidenceRefs = unique(supportedCapabilities.flatMap((capability) => capability.proofEvidenceRefs));
  const knownAuthority = usesKnownLayoutAuthorityOnly ? known?.templateAdmission.admissionAuthority ?? null : null;
  const templateAdmission: CanonicalEconomicsV2TemplateAdmissionInput = {
    detectedFamily: String(identity.processorFamily ?? "Fiserv-family"),
    detectedTemplate: known?.templateAdmission.detectedTemplate ?? FISERV_RUNTIME_CAPABILITY_POLICY_ID,
    detectedVersion: known?.templateAdmission.detectedVersion ?? FISERV_RUNTIME_CAPABILITY_POLICY_VERSION,
    identityStatus: "proven",
    admissionStatus: "admitted",
    admissionAuthority: knownAuthority ?? {
      lifecycle: "admitted_with_conditions",
      authorityClass: "deterministic_capability_policy",
      authorityRef: POLICY_AUTHORITY_REF,
      admittedAt: POLICY_ADMITTED_AT,
      admissionVersion: FISERV_RUNTIME_CAPABILITY_POLICY_VERSION,
      effectiveFrom: null,
      effectiveTo: null,
    },
    completenessStatus: "unknown",
    admissionProofEvidenceRefs,
    capabilities: capabilities.map((capability) => ({
      capability: capability.capability,
      status: capability.status,
      proofEvidenceRefs: capability.proofEvidenceRefs,
      limitations: capability.limitations,
    })),
    limitations: proof.limitations,
  };
  const dynamicSections = buildDynamicSectionAdmissions(foundation, capabilities);
  const sectionAdmissions = mergeSectionAdmissions(known?.sectionAdmissions ?? [], dynamicSections);
  const feeDetailCoverage = capabilities.find((capability) => capability.capability === "fee_detail")?.status === "supported"
    ? "complete_observed_occurrences" as const
    : feeRows.length > 0 ? "partial" as const : "unproven" as const;
  return {
    proof,
    resolution: {
      mappingId: usesKnownLayoutAuthorityOnly ? known!.mappingId : FISERV_RUNTIME_CAPABILITY_POLICY_ID,
      mappingVersion: usesKnownLayoutAuthorityOnly ? known!.mappingVersion : FISERV_RUNTIME_CAPABILITY_POLICY_VERSION,
      authorityClass: usesKnownLayoutAuthorityOnly ? "product_owner" : "deterministic_capability_policy",
      authorityRef: usesKnownLayoutAuthorityOnly ? known!.authorityRef : POLICY_AUTHORITY_REF,
      matched: true,
      templateAdmission,
      sectionAdmissions,
      feeDetailCoverage,
      capabilityProof: proof,
    },
  };
}

function buildDynamicSectionAdmissions(
  foundation: CanonicalEconomicsV2Foundation,
  capabilities: FiservRuntimeCapabilityProof["capabilities"],
): CanonicalEconomicsV2SectionAdmission[] {
  const supported = new Set(capabilities.filter((capability) => capability.status === "supported").map((capability) => capability.capability));
  return foundation.sourceModel.sections.flatMap((section) => {
    const occurrences = foundation.sourceModel.occurrences.filter((occurrence) => occurrence.sectionRef === section.id);
    const populationSemantics = uniquePopulationSemantics(occurrences.flatMap((occurrence) => {
      const mapping = populationForRole(occurrence.semanticRole);
      return mapping && supported.has(mapping.capability) ? [mapping.population] : [];
    }));
    const evidenceRefs = unique(occurrences.map((occurrence) => occurrence.evidenceRef));
    if (populationSemantics.length === 0 && !/^header$/i.test(section.heading)) return [];
    return [{
      sourceSection: section.heading,
      populationSemantics,
      completenessStatus: supported.has("fee_detail") && populationSemantics.includes("fee_occurrences") ? "complete" as const : "unknown" as const,
      capabilityStatus: "supported" as const,
      evidenceRefs,
      limitations: ["Section authority is restricted to independently supported capability semantics."],
    }];
  });
}

function mergeSectionAdmissions(
  known: CanonicalEconomicsV2SectionAdmission[],
  dynamic: CanonicalEconomicsV2SectionAdmission[],
): CanonicalEconomicsV2SectionAdmission[] {
  const merged = new Map<string, CanonicalEconomicsV2SectionAdmission>();
  for (const section of [...known, ...dynamic]) {
    const key = section.sourceSection.trim().toLowerCase();
    const current = merged.get(key);
    merged.set(key, current ? {
      ...current,
      populationSemantics: uniquePopulationSemantics([...current.populationSemantics, ...section.populationSemantics]),
      evidenceRefs: unique([...(current.evidenceRefs ?? []), ...(section.evidenceRefs ?? [])]),
      limitations: unique([...(current.limitations ?? []), ...(section.limitations ?? [])]),
      completenessStatus: current.completenessStatus === "complete" || section.completenessStatus === "complete" ? "complete" : "unknown",
      capabilityStatus: "supported",
    } : section);
  }
  return [...merged.values()];
}

function populationForRole(role: CanonicalEconomicsV2SourceOccurrence["semanticRole"]): {
  capability: CanonicalEconomicsV2CapabilityId;
  population: CanonicalEconomicsV2PopulationSemantic;
} | null {
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
  if (!supported) return ["The available source, lineage, and reconciliation evidence did not prove this capability."];
  const common = "Support is claim-scoped and does not expand pricing, ownership, control, benchmark, or savings authority.";
  if (capability === "fee_total") return [common, "The fee total does not establish total acceptance cost or fee ownership."];
  if (capability === "fee_detail") return [common, "Occurrence identity, sign, amount, and observed-row coverage are admitted; economic category and ownership remain unresolved."];
  if (capability === "processor_identity") return ["Fiserv-family identity does not by itself prove any financial or economic capability."];
  return [common];
}

function uniquePopulationSemantics(values: CanonicalEconomicsV2PopulationSemantic[]): CanonicalEconomicsV2PopulationSemantic[] {
  return [...new Set(values)].sort();
}

function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function records(value: unknown): Record<string, any>[] { return Array.isArray(value) ? value.map(record) : []; }
function finite(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort(); }
