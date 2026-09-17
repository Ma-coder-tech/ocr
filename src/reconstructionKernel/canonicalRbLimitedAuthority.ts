import { createHash } from "node:crypto";

import { canonicalJson } from "../canonical/v2/canonicalJson.js";
import {
  RB_KERNEL_LIMITED_AUTHORITY_DESCRIPTORS,
  RB_KERNEL_LIMITED_AUTHORITY_POLICY,
  RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS,
  RB_KERNEL_LIMITED_AUTHORITY_REF,
  type RbKernelLimitedAuthorityPopulation,
} from "../canonical/v2/kernelAuthorityContract.js";
import type { CanonicalEconomicsV2Foundation } from "../canonical/v2/types.js";
import type { RbKernelReconstructableControlProof } from "../canonical/v2/kernelControlProof.js";
import type { ParsedDocument } from "../parser.js";
import { reconstructStatement } from "./kernel.js";
import { buildRbKernelReconstructableControlProof } from "./kernelControlProof.js";
import { buildCanonicalRbReconstructionInput, runCanonicalRbReconstructionShadow } from "./canonicalRbShadow.js";
import type { Claim, ControlState, DeterministicControl, Observation } from "./types.js";

export const CANONICAL_RB_LIMITED_AUTHORITY_SCHEMA = "canonical_rb_limited_authority_v1" as const;
export const CANONICAL_RB_LIMITED_AUTHORITY_POLICY = RB_KERNEL_LIMITED_AUTHORITY_POLICY;
export const CANONICAL_RB_LIMITED_AUTHORITY_REF = RB_KERNEL_LIMITED_AUTHORITY_REF;
export const CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS = RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS;
export type CanonicalRbLimitedAuthorityPopulation = RbKernelLimitedAuthorityPopulation;

type AuthorityDecision = {
  populationKey: CanonicalRbLimitedAuthorityPopulation;
  population: string;
  valueKind: "money_minor" | "count";
  rbStatus: "available" | "unavailable" | "ambiguous" | "unsupported";
  rbValue: number | null;
  candidateValue: number | null;
  decision: "granted_changes_rb" | "granted_confirms_rb" | "withheld";
  requiredControlIds: string[];
  sourceObservationRefs: string[];
  sourceEvidence: Array<{
    observationRef: string;
    documentRef: string;
    page: number;
    lineRef: string;
    sourceLine: string;
  }>;
  controlProofs: RbKernelReconstructableControlProof[];
  reasonCodes: string[];
};

export type CanonicalRbLimitedAuthorityResult = {
  schemaVersion: typeof CANONICAL_RB_LIMITED_AUTHORITY_SCHEMA;
  policyVersion: typeof CANONICAL_RB_LIMITED_AUTHORITY_POLICY;
  authorityRef: typeof CANONICAL_RB_LIMITED_AUTHORITY_REF;
  authority: "limited_canonical_financial_population_authority";
  executionBoundary: "evaluation_only_rb_population_overlay";
  productionUse: "prohibited";
  downstreamUse: "prohibited";
  persistence: "none";
  providerAuthority: "prohibited";
  baseFoundationMutation: "none";
  canonicalOverlayHash: string | null;
  status: "granted" | "partially_granted" | "withheld" | "failed";
  sourceBinding: {
    sourceDocumentRef: string;
    sourceFingerprint: string | null;
    fingerprintMatched: boolean;
    completeSuppliedDocument: boolean;
    familyAccepted: boolean;
    admittedFiservFamily: boolean;
    exactCardSummaryMapped: boolean;
  };
  allowlistedPopulations: readonly CanonicalRbLimitedAuthorityPopulation[];
  decisions: AuthorityDecision[];
  canonicalFacts: Partial<Record<CanonicalRbLimitedAuthorityPopulation, {
    id: string;
    population: string;
    status: "available";
    value: number | { amountMinor: number; currency: "USD" };
    confidence: "high";
    provenanceStatus: "authoritative";
    authorityPolicy: typeof CANONICAL_RB_LIMITED_AUTHORITY_POLICY;
    sourceObservationRefs: string[];
    sourceEvidence: AuthorityDecision["sourceEvidence"];
    requiredControlIds: string[];
    controlProofs: RbKernelReconstructableControlProof[];
    limitations: string[];
  }>>;
  errors: string[];
};

export function grantCanonicalRbLimitedAuthority(input: {
  document: ParsedDocument;
  sourceDocumentRef: string;
  foundation: CanonicalEconomicsV2Foundation;
  executionContext: "evaluation_compatibility";
}): CanonicalRbLimitedAuthorityResult {
  try {
    if ((input as { executionContext?: string }).executionContext !== "evaluation_compatibility") {
      throw new Error("RECONSTRUCTION_LIMITED_AUTHORITY_REQUIRES_EVALUATION_CONTEXT");
    }
    const reconstructionInput = buildCanonicalRbReconstructionInput(input.document, input.sourceDocumentRef);
    const reconstruction = reconstructStatement(reconstructionInput);
    const shadow = runCanonicalRbReconstructionShadow(input);
    const observations = new Map(reconstructionInput.observations.map((item) => [item.id, item]));
    const claims = new Map(reconstruction.canonicalClaims.map((item) => [populationKeyForClaim(item), item]));
    const controls = new Map(reconstruction.controlResults.map((item) => [item.controlId, item.state]));
    const controlDefinitions = new Map(reconstructionInput.controls.map((item) => [item.id, item]));
    const sourceFingerprint = kernelParsedDocumentFingerprint(input.document);
    const integrity = input.foundation.documentIntegrity;
    const completeSuppliedDocument = integrity.suppliedDocumentStatus === "complete_supplied_document"
      && integrity.observedPageCount !== null && integrity.processedPageCount === integrity.observedPageCount
      && integrity.fatalPageErrorCount === 0 && integrity.extractionLineageComplete === true
      && integrity.localIngestionTruncated === false;
    const fingerprintMatched = input.foundation.identity.sourceFingerprintStatus === "available"
      && input.foundation.identity.sourceFingerprint === sourceFingerprint
      && input.foundation.identity.sourceDocumentRef === input.sourceDocumentRef;
    const admittedFiservFamily = input.foundation.templateCapability.admissionStatus === "admitted"
      && input.foundation.templateCapability.identityStatus === "proven"
      && input.foundation.templateCapability.admissionAuthority !== null;
    const familyAccepted = shadow.sourceEvidence.familyAccepted && shadow.sourceEvidence.topLevelExtraction === "complete";
    const exactCardSummaryMapped = shadow.sourceEvidence.independentExtractors.cardSummary === "mapped";
    const globalReasons = unique([
      ...(input.document.sourceType === "pdf" ? [] : ["authority_requires_pdf_source"]),
      ...(input.document.extraction.mode !== "unusable" && input.document.extraction.hasExtractableText
        ? [] : ["authority_requires_extractable_source_text"]),
      ...(input.foundation.validation.status === "valid" ? [] : ["rb_foundation_invalid"]),
      ...(completeSuppliedDocument ? [] : ["supplied_document_integrity_not_complete"]),
      ...(fingerprintMatched ? [] : ["source_fingerprint_or_reference_mismatch"]),
      ...(admittedFiservFamily ? [] : ["fiserv_family_not_admitted"]),
      ...(familyAccepted ? [] : ["independent_fiserv_family_or_top_level_proof_failed"]),
      ...(exactCardSummaryMapped ? [] : ["exact_card_summary_structure_not_mapped"]),
      ...(reconstruction.status === "complete" ? [] : ["kernel_reconstruction_not_complete"]),
      ...(shadow.status === "compared" ? [] : ["shadow_source_replay_not_clean"]),
    ]);

    const decisions = CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS.map((populationKey) => authorityDecision({
      populationKey,
      foundation: input.foundation,
      claim: claims.get(populationKey) ?? null,
      observations,
      controls,
      controlDefinitions,
      sourceFingerprint,
      completeSuppliedDocument,
      globalReasons,
    }));
    const canonicalFacts: CanonicalRbLimitedAuthorityResult["canonicalFacts"] = {};
    for (const decision of decisions) {
      if (decision.decision === "withheld" || decision.candidateValue === null) continue;
      canonicalFacts[decision.populationKey] = {
        id: `limited_authority.${decision.populationKey}`,
        population: decision.population,
        status: "available",
        value: decision.valueKind === "money_minor"
          ? { amountMinor: decision.candidateValue, currency: "USD" }
          : decision.candidateValue,
        confidence: "high",
        provenanceStatus: "authoritative",
        authorityPolicy: CANONICAL_RB_LIMITED_AUTHORITY_POLICY,
        sourceObservationRefs: decision.sourceObservationRefs,
        sourceEvidence: decision.sourceEvidence,
        requiredControlIds: decision.requiredControlIds,
        controlProofs: decision.controlProofs,
        limitations: [
          "Authority is claim-local to an exact, independently reconciled SUMMARY BY CARD TYPE population.",
          "The overlay cannot authorize downstream economics, reporting, persistence, or any non-allowlisted Kernel claim.",
        ],
      };
    }
    const grantedCount = Object.keys(canonicalFacts).length;
    const canonicalOverlayHash = createHash("sha256").update(canonicalJson({
      schemaVersion: CANONICAL_RB_LIMITED_AUTHORITY_SCHEMA,
      policyVersion: CANONICAL_RB_LIMITED_AUTHORITY_POLICY,
      authorityRef: CANONICAL_RB_LIMITED_AUTHORITY_REF,
      sourceDocumentRef: input.sourceDocumentRef,
      sourceFingerprint,
      decisions,
      canonicalFacts,
    })).digest("hex");
    return {
      schemaVersion: CANONICAL_RB_LIMITED_AUTHORITY_SCHEMA,
      policyVersion: CANONICAL_RB_LIMITED_AUTHORITY_POLICY,
      authorityRef: CANONICAL_RB_LIMITED_AUTHORITY_REF,
      authority: "limited_canonical_financial_population_authority",
      executionBoundary: "evaluation_only_rb_population_overlay",
      productionUse: "prohibited",
      downstreamUse: "prohibited",
      persistence: "none",
      providerAuthority: "prohibited",
      baseFoundationMutation: "none",
      canonicalOverlayHash,
      status: grantedCount === 0 ? "withheld"
        : grantedCount === CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS.length ? "granted" : "partially_granted",
      sourceBinding: {
        sourceDocumentRef: input.sourceDocumentRef,
        sourceFingerprint,
        fingerprintMatched,
        completeSuppliedDocument,
        familyAccepted,
        admittedFiservFamily,
        exactCardSummaryMapped,
      },
      allowlistedPopulations: CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS,
      decisions,
      canonicalFacts,
      errors: [],
    };
  } catch (error) {
    return failedAuthorityResult(input, error);
  }
}

function authorityDecision(input: {
  populationKey: CanonicalRbLimitedAuthorityPopulation;
  foundation: CanonicalEconomicsV2Foundation;
  claim: Claim | null;
  observations: Map<string, Observation>;
  controls: Map<string, ControlState>;
  controlDefinitions: Map<string, DeterministicControl>;
  sourceFingerprint: string;
  completeSuppliedDocument: boolean;
  globalReasons: string[];
}): AuthorityDecision {
  const fact = input.foundation.financialPopulations[input.populationKey];
  const descriptor = RB_KERNEL_LIMITED_AUTHORITY_DESCRIPTORS[input.populationKey];
  const valueKind = descriptor.valueKind;
  const requiredControlIds = [...descriptor.requiredControlIds];
  const sourceObservationRefs = input.claim?.observationRefs ?? [];
  const sourceObservations = sourceObservationRefs.map((ref) => input.observations.get(ref));
  const sourceEvidence = sourceObservationRefs.flatMap((observationRef, index) => {
    const observation = sourceObservations[index];
    if (!observation || observation.locator.page === undefined || !observation.locator.row || !observation.locator.label) return [];
    return [{ observationRef, documentRef: observation.locator.documentId, page: observation.locator.page,
      lineRef: observation.locator.row, sourceLine: observation.locator.label }];
  });
  const candidateValue = typeof input.claim?.value === "number" ? input.claim.value : null;
  const rbValue = fact.status !== "available" || fact.value === null ? null
    : typeof fact.value === "number" ? fact.value : fact.value.amountMinor;
  const controlProofBuilds = requiredControlIds.map((controlId) => buildRbKernelReconstructableControlProof({
    control: input.controlDefinitions.get(controlId),
    observations: [...input.observations.values()],
    sourceDocumentRef: input.foundation.identity.sourceDocumentRef,
    sourceFingerprint: input.sourceFingerprint,
    completeSuppliedDocument: input.completeSuppliedDocument,
    exclusionConditions: [
      { conditionId: "population_within_product_approved_allowlist", state: "satisfied", basis: "policy" },
      { conditionId: "claim_remains_direct_source_fact", state: "satisfied", basis: "policy" },
      { conditionId: "provider_authority_prohibited", state: "satisfied", basis: "policy" },
      { conditionId: "downstream_use_prohibited", state: "satisfied", basis: "policy" },
    ],
  }));
  const controlProofs = controlProofBuilds.flatMap((item) => item.proof ? [item.proof] : []);
  const claimReasons = unique([
    ...input.globalReasons,
    ...(input.claim?.support === "source_observation" ? [] : ["candidate_is_not_direct_source_observation"]),
    ...(sourceObservationRefs.length === 1 && sourceObservations.every(Boolean)
      ? [] : ["candidate_requires_one_exact_source_observation"]),
    ...(sourceObservations.every((observation) => observation?.authority === "source_printed")
      ? [] : ["candidate_observation_lacks_source_printed_authority"]),
    ...(sourceObservations.every((observation) => observation?.locator.page !== undefined
      && Boolean(observation.locator.row) && /^Total\s*\|/i.test(observation.locator.label ?? ""))
      ? [] : ["candidate_source_locator_is_not_exact_card_summary_total"]),
    ...(candidateValue !== null && Number.isSafeInteger(candidateValue) && candidateValue >= 0
      ? [] : ["candidate_value_is_not_safe_nonnegative_integer"]),
    ...requiredControlIds.flatMap((controlId) => input.controls.get(controlId) === "pass"
      ? [] : [`required_control_not_passing:${controlId}`]),
    ...controlProofBuilds.flatMap((item, index) => item.errors.map((error) =>
      `control_proof_invalid:${requiredControlIds[index]}:${error}`)),
    ...(controlProofs.length === requiredControlIds.length && controlProofs.every((proof) => proof.state === "pass")
      ? [] : ["required_controls_lack_reconstructable_passing_proof"]),
    ...(fact.status === "available" && rbValue !== candidateValue ? ["rb_kernel_value_contradiction"] : []),
    ...(fact.status === "ambiguous" ? ["rb_population_is_ambiguous"] : []),
    ...(fact.status === "unsupported" ? ["rb_population_is_unsupported"] : []),
  ]);
  const granted = claimReasons.length === 0;
  return {
    populationKey: input.populationKey,
    population: fact.population,
    valueKind,
    rbStatus: fact.status,
    rbValue,
    candidateValue,
    decision: !granted ? "withheld" : fact.status === "available" ? "granted_confirms_rb" : "granted_changes_rb",
    requiredControlIds,
    controlProofs,
    sourceObservationRefs,
    sourceEvidence,
    reasonCodes: granted ? unique([
      "allowlisted_direct_card_summary_population",
      "exact_source_locator_bound",
      "all_claim_specific_controls_passing",
      fact.status === "available" ? "kernel_confirms_existing_rb_value" : "kernel_authority_fills_rb_withheld_population",
    ]) : claimReasons,
  };
}

function populationKeyForClaim(claim: Claim): CanonicalRbLimitedAuthorityPopulation | "not_allowlisted" {
  const prefix = "shadow.financial_population.";
  const key = claim.key.startsWith(prefix) ? claim.key.slice(prefix.length) : "";
  return (CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS as readonly string[]).includes(key)
    ? key as CanonicalRbLimitedAuthorityPopulation : "not_allowlisted";
}

export function kernelParsedDocumentFingerprint(document: ParsedDocument): string {
  const normalized = document.rows.map((row) => `${String(row.page ?? "")}|${String(row.content ?? "")}`).join("\n");
  return createHash("sha256").update(normalized).digest("hex");
}

function failedAuthorityResult(input: {
  sourceDocumentRef: string;
  foundation: CanonicalEconomicsV2Foundation;
  executionContext?: string;
}, error: unknown): CanonicalRbLimitedAuthorityResult {
  return {
    schemaVersion: CANONICAL_RB_LIMITED_AUTHORITY_SCHEMA,
    policyVersion: CANONICAL_RB_LIMITED_AUTHORITY_POLICY,
    authorityRef: CANONICAL_RB_LIMITED_AUTHORITY_REF,
    authority: "limited_canonical_financial_population_authority",
    executionBoundary: "evaluation_only_rb_population_overlay",
    productionUse: "prohibited",
    downstreamUse: "prohibited",
    persistence: "none",
    providerAuthority: "prohibited",
    baseFoundationMutation: "none",
    canonicalOverlayHash: null,
    status: "failed",
    sourceBinding: { sourceDocumentRef: input.sourceDocumentRef,
      sourceFingerprint: input.foundation.identity.sourceFingerprint, fingerprintMatched: false,
      completeSuppliedDocument: false, familyAccepted: false, admittedFiservFamily: false,
      exactCardSummaryMapped: false },
    allowlistedPopulations: CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS,
    decisions: [], canonicalFacts: {},
    errors: [`Limited Kernel authority failed closed: ${error instanceof Error ? error.message : "unknown_error"}`],
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
