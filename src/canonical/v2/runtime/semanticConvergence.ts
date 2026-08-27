import { canonicalJson } from "../canonicalJson.js";
import type { CanonicalEconomicSemanticApplicationAdmission } from "../economicAnalysis.js";
import { resolveKnowledge } from "../knowledge/knowledgeResolver.js";
import type { KnowledgeClaimValue, KnowledgeEntry } from "../knowledge/knowledgeTypes.js";
import { reloadGovernedRfCatalogBinding } from "./rfKnowledgeCatalog.js";
import type { CanonicalRgClaimAdmission, CanonicalRgOperation } from "./rgWorkLedger.js";
import { buildSemanticTailPlan, buildSemanticTailRd, buildSemanticTailRe, buildSemanticTailRh,
  buildSemanticTailUnresolved } from "./semanticTail.js";
import {
  persistedVerifiedEvidenceIntegrityValid,
  type CanonicalRgVerifiedEvidence,
} from "./rgEvidenceExecution.js";
import {
  getPersistedAnalysisRun,
  persistCanonicalSemanticConvergence,
  type PersistedAnalysisRunRecord,
} from "./analysisRunStore.js";
import {
  canonicalStateHash as buildCanonicalStateHash,
  digestCanonical,
  financialFoundationHash,
  semanticStateHash,
} from "./integrityHashes.js";
import type { CanonicalAnalysisArtifacts, CanonicalAnalysisRun, AnalysisRunStageId } from "./analysisRunTypes.js";
import {
  CURRENT_RUN_EVIDENCE_REGISTRY_SCHEMA_VERSION,
  SEMANTIC_CONVERGENCE_SCHEMA_VERSION,
  type CanonicalCurrentRunExternalEvidenceRegistry,
  type CanonicalSemanticApplicationDisposition,
  type CanonicalSemanticConvergenceRevision,
} from "./semanticConvergenceTypes.js";
import { canonicalSemanticValueApplicable, LOSSLESS_ROLE_FACETS } from "./atomicClaims.js";

export type CanonicalSemanticConvergenceResult = {
  run: CanonicalAnalysisRun;
  revision: CanonicalSemanticConvergenceRevision;
  registry: CanonicalCurrentRunExternalEvidenceRegistry;
  appliedCount: number;
  withheldCount: number;
  providerCalls: 0;
};

export function convergeDurableCanonicalAnalysisRun(input: { runId: string }): CanonicalSemanticConvergenceResult {
  const persisted = getPersistedAnalysisRun(input.runId);
  if (!persisted?.result) throw new Error("semantic_convergence_analysis_run_unavailable");
  const current = persisted.result;
  if (!current.artifacts.rb || !current.artifacts.rc || !current.artifacts.rd || !current.artifacts.rfResolution || !current.readiness) {
    throw new Error("semantic_convergence_canonical_tail_unavailable");
  }
  const registry = buildCurrentRunExternalEvidenceRegistry(persisted);
  const rfSnapshot = persisted.rfCatalogBinding?.availability === "available"
    ? reloadGovernedRfCatalogBinding(persisted.rfCatalogBinding)
    : null;
  if (persisted.rfCatalogBinding?.availability === "available" && (!rfSnapshot || rfSnapshot.availability !== "available" ||
    rfSnapshot.snapshotHash !== persisted.rfSnapshotHash)) throw new Error("semantic_convergence_bound_rf_snapshot_unavailable");

  const latestRevision = persisted.semanticRevisions.at(-1);
  if (latestRevision && latestRevision.evidenceRegistryHash === registry.registryHash &&
    latestRevision.semanticHash === current.semanticHash && latestRevision.revision === persisted.semanticRevision) {
    return { run: current, revision: latestRevision, registry,
      appliedCount: latestRevision.applications.filter((item) => item.disposition === "applied" ||
        item.disposition === "already_resolved_by_rf").length,
      withheldCount: latestRevision.applications.filter((item) => item.disposition.includes("withheld") ||
        item.disposition.includes("unapplied")).length,
      providerCalls: 0 };
  }

  const resolution = resolveApplications({ persisted, registry, rfEntries: rfSnapshot?.entries ?? [] });
  const rd = buildSemanticTailRd({ pricing: current.artifacts.rc, applications: resolution.applications,
    externalEvidenceRefs: registry.evidence.map((item) => item.evidenceId) });
  if (rd.validation.status !== "valid") {
    throw new Error(`semantic_convergence_invalid_rd:${rd.validation.errors.join("|")}`);
  }
  const re = buildSemanticTailRe({ economic: rd });
  if (re.validation.status !== "valid") {
    throw new Error(`semantic_convergence_invalid_re:${re.validation.errors.join("|")}`);
  }
  const facetDispositions: NonNullable<Parameters<typeof buildSemanticTailUnresolved>[0]["facetDispositions"]> = [];
  for (const item of resolution.decisions) {
    for (const chargeRef of item.chargeRefs) {
      if (item.disposition === "applied" || item.disposition === "already_resolved_by_rf") {
        facetDispositions.push({ chargeRef, facet: item.facet, disposition: "resolved",
          reasonCode: item.reasonCodes[0] ?? "resolved" });
      } else if (["verified_but_unapplied_contract_insufficient", "withheld_conflicting_rf_and_rg",
        "withheld_conflicting_current_run_evidence"].includes(item.disposition)) {
        facetDispositions.push({ chargeRef, facet: item.facet, disposition: "verified_but_unapplied",
          reasonCode: item.reasonCodes[0] ?? item.disposition });
      }
    }
  }
  const unresolvedClaims = buildSemanticTailUnresolved({ pricing: current.artifacts.rc, economic: rd, synthesis: re,
    facetDispositions });
  if (unresolvedClaims.validation.status !== "valid") {
    throw new Error(`semantic_convergence_invalid_claim_inventory:${unresolvedClaims.validation.errors.join("|")}`);
  }
  const rgWorkLedger = buildSemanticTailPlan({ inventory: unresolvedClaims, economic: rd, synthesis: re,
    rfResolution: current.artifacts.rfResolution });
  if (rgWorkLedger.validation.status !== "valid") {
    throw new Error(`semantic_convergence_invalid_rg_plan:${rgWorkLedger.validation.errors.join("|")}`);
  }
  const rh = buildSemanticTailRh({ synthesisAnalysis: re, sourceReadiness: current.readiness });
  const artifacts: CanonicalAnalysisArtifacts = { ...current.artifacts, rd, re, unresolvedClaims, rgWorkLedger, rh };

  const beforeFinancialHash = persisted.financialFoundationHash ?? current.financialFoundationHash ??
    financialFoundationHash({ sourceFingerprint: current.sourceFingerprint, capabilityProof: current.capabilityProof,
      artifacts: current.artifacts });
  const afterFinancialHash = financialFoundationHash({ sourceFingerprint: current.sourceFingerprint,
    capabilityProof: current.capabilityProof, artifacts });
  if (!beforeFinancialHash || beforeFinancialHash !== afterFinancialHash) throw new Error("semantic_convergence_financial_foundation_mutation");
  const invariantErrors = validateFinancialInvariance(current.artifacts, artifacts);
  if (invariantErrors.length > 0) throw new Error(invariantErrors.join(","));

  const semanticHash = semanticStateHash(artifacts, resolution.decisions);
  const canonicalStateHash = buildCanonicalStateHash({ financialFoundationHash: afterFinancialHash, semanticHash,
    rfSnapshotHash: persisted.rfSnapshotHash });
  const existing = persisted.semanticRevisions.find((item) => item.semanticHash === semanticHash);
  if (existing) return { run: current, revision: existing, registry,
    appliedCount: existing.applications.filter((item) => item.disposition === "applied" || item.disposition === "already_resolved_by_rf").length,
    withheldCount: existing.applications.filter((item) => item.disposition.includes("withheld") || item.disposition.includes("unapplied")).length,
    providerCalls: 0 };

  const revisionNumber = persisted.semanticRevision + 1;
  const now = new Date().toISOString();
  const revision: CanonicalSemanticConvergenceRevision = {
    schemaVersion: SEMANTIC_CONVERGENCE_SCHEMA_VERSION,
    runId: current.runId,
    revision: revisionNumber,
    parentSemanticHash: persisted.semanticHash ?? current.semanticHash,
    financialFoundationHash: afterFinancialHash,
    semanticHash,
    canonicalStateHash,
    evidenceRegistryHash: registry.registryHash,
    priorPlanHash: current.artifacts.rgWorkLedger?.planHash ?? null,
    nextPlanHash: rgWorkLedger.planHash,
    applications: resolution.decisions,
    providerExecution: "not_executed_during_convergence",
    rfPromotion: "prohibited",
    financialFoundationPreserved: true,
    createdAt: now,
  };
  const canonicalTruthHash = digestCanonical({ rb: artifacts.rb, rc: artifacts.rc, rd: artifacts.rd, re: artifacts.re });
  const run: CanonicalAnalysisRun = {
    ...current,
    artifacts,
    stageOutcomes: revisedStageOutcomes(current.stageOutcomes, artifacts),
    canonicalTruthHash,
    financialFoundationHash: afterFinancialHash,
    semanticHash,
    canonicalStateHash,
    semanticRevision: revisionNumber,
    limitations: unique([...current.limitations, ...registry.validation.errors.map((item) => `RG evidence withheld: ${item}`)]),
  };
  persistCanonicalSemanticConvergence({ run, revision, registry });
  return { run, revision, registry,
    appliedCount: resolution.decisions.filter((item) => item.disposition === "applied" || item.disposition === "already_resolved_by_rf").length,
    withheldCount: resolution.decisions.filter((item) => item.disposition.includes("withheld") || item.disposition.includes("unapplied")).length,
    providerCalls: 0 };
}

export function buildCurrentRunExternalEvidenceRegistry(
  persisted: PersistedAnalysisRunRecord,
): CanonicalCurrentRunExternalEvidenceRegistry {
  const errors: string[] = [];
  errors.push(...persisted.externalEvidenceRegistryErrors);
  const evidence = new Map<string, CanonicalRgVerifiedEvidence>();
  for (const retained of persisted.externalEvidenceRegistry) {
    if (!persistedVerifiedEvidenceIntegrityValid(retained)) errors.push("external_evidence_integrity_invalid:unknown");
    else evidence.set(retained.evidenceId, retained);
  }
  for (const operation of persisted.rgOperations.filter((item) => item.kind === "independent_verification" && item.state === "completed")) {
    const candidate = (operation.result as { verifiedEvidence?: CanonicalRgVerifiedEvidence } | null)?.verifiedEvidence;
    if (!candidate) continue;
    const chainErrors = validateFullEvidenceChain(candidate, operation, persisted);
    if (chainErrors.length > 0) errors.push(...chainErrors.map((item) => `${item}:${candidate.evidenceId}`));
    else evidence.set(candidate.evidenceId, candidate);
  }
  const values = [...evidence.values()].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  return {
    schemaVersion: CURRENT_RUN_EVIDENCE_REGISTRY_SCHEMA_VERSION,
    runId: persisted.id,
    evidence: values,
    registryHash: digestCanonical(values),
    validation: { status: errors.length === 0 ? "valid" : "invalid", errors: unique(errors) },
  };
}

function validateFullEvidenceChain(evidence: CanonicalRgVerifiedEvidence, verification: CanonicalRgOperation,
  persisted: PersistedAnalysisRunRecord): string[] {
  const errors: string[] = [];
  if (!persistedVerifiedEvidenceIntegrityValid(evidence)) errors.push("rg_evidence_envelope_invalid");
  const admission = persisted.rgClaimAdmissions.find((item) => item.atomicClaimId === evidence.atomicClaimId);
  const work = persisted.rgWorkItems.find((item) => item.workItemId === evidence.workItemId);
  if (!admission || !work || work.atomicClaimId !== evidence.atomicClaimId || verification.atomicClaimId !== evidence.atomicClaimId ||
    verification.workItemId !== evidence.workItemId || verification.planHash !== evidence.planHash) errors.push("rg_evidence_claim_plan_binding_invalid");
  const verificationResult = verification.result as { judgment?: Record<string, unknown>; verifiedEvidence?: unknown } | null;
  if (!verificationResult || digestCanonical(verificationResult.verifiedEvidence) !== digestCanonical(evidence) ||
    verificationResult.judgment?.frozenCandidateHash !== evidence.frozenCandidateHash ||
    verificationResult.judgment?.supportLocatorId !== evidence.supportLocatorId ||
    verificationResult.judgment?.authorityLocatorId !== evidence.authorityLocatorId) errors.push("rg_evidence_verification_binding_invalid");
  const investigation = operationFor(persisted.rgOperations, evidence, "investigation");
  const retrieval = operationFor(persisted.rgOperations, evidence, "public_retrieval");
  const investigated = investigation?.result as Record<string, unknown> | null;
  const retrieved = retrieval?.result as { documentFingerprint?: string; finalUrl?: string; sourceOrigin?: string;
    locators?: Array<{ locatorId: string; textExcerpt: string }> } | null;
  if (!investigation || !investigated || digestCanonical(investigated) !== evidence.frozenCandidateHash ||
    digestCanonical(investigated.proposedValue) !== digestCanonical(evidence.proposedValue) ||
    investigated.documentFingerprint !== evidence.documentFingerprint) errors.push("rg_evidence_frozen_investigation_invalid");
  const authority = retrieved?.locators?.find((item) => item.locatorId === evidence.authorityLocatorId);
  const support = retrieved?.locators?.find((item) => item.locatorId === evidence.supportLocatorId);
  if (!retrieval || !retrieved || retrieved.documentFingerprint !== evidence.documentFingerprint ||
    retrieved.finalUrl !== evidence.sourceUrl || retrieved.sourceOrigin !== evidence.sourceOrigin ||
    authority?.textExcerpt !== evidence.authorityLocatorExcerpt || support?.textExcerpt !== evidence.supportLocatorExcerpt) {
    errors.push("rg_evidence_retrieval_locator_lineage_invalid");
  }
  return unique(errors);
}

function operationFor(operations: CanonicalRgOperation[], evidence: CanonicalRgVerifiedEvidence,
  kind: CanonicalRgOperation["kind"]): CanonicalRgOperation | undefined {
  return operations.find((item) => item.kind === kind && item.workItemId === evidence.workItemId &&
    item.planHash === evidence.planHash && item.candidateId === evidence.candidateId && item.state === "completed");
}

function resolveApplications(input: {
  persisted: PersistedAnalysisRunRecord;
  registry: CanonicalCurrentRunExternalEvidenceRegistry;
  rfEntries: readonly KnowledgeEntry[];
}): { applications: CanonicalEconomicSemanticApplicationAdmission[]; decisions: CanonicalSemanticApplicationDisposition[] } {
  const applications: CanonicalEconomicSemanticApplicationAdmission[] = [];
  const decisions: CanonicalSemanticApplicationDisposition[] = [];
  const run = input.persisted.result!;
  const claimsRequiringReevaluation = new Set(input.persisted.rgClaimAdmissions.map((item) => item.atomicClaimId));
  const priorDecisionByClaim = new Map(input.persisted.semanticRevisions.at(-1)?.applications
    .map((item) => [item.atomicClaimId, item] as const) ?? []);
  for (const existing of run.artifacts.rd?.economicLayer.semanticApplications ?? []) {
    if (claimsRequiringReevaluation.has(existing.atomicClaimId)) continue;
    const admission = { ...structuredClone(existing), key: existing.id };
    delete (admission as { id?: string }).id;
    applications.push(admission);
    const priorDecision = priorDecisionByClaim.get(existing.atomicClaimId);
    decisions.push(priorDecision ?? disposition(existing.atomicClaimId, [existing.chargeRef], existing.facet,
      existing.sourceKind, existing.sourceKind === "governed_rf_snapshot" ? "already_resolved_by_rf" : "applied",
      [admission], existing.externalEvidenceRefs, existing.selectedEntryRefs,
      [existing.sourceKind === "governed_rf_snapshot"
        ? "bound_rf_exact_atomic_resolution_preserved"
        : "verified_current_run_exact_atomic_resolution_preserved"]));
  }
  const evidenceByClaim = new Map<string, CanonicalRgVerifiedEvidence[]>();
  for (const evidence of input.registry.evidence) evidenceByClaim.set(evidence.atomicClaimId,
    [...(evidenceByClaim.get(evidence.atomicClaimId) ?? []), evidence]);
  for (const admission of input.persisted.rgClaimAdmissions) {
    if (applications.some((item) => item.atomicClaimId === admission.atomicClaimId)) continue;
    const rgEvidence = evidenceByClaim.get(admission.atomicClaimId) ?? [];
    const representability = representabilityReason(admission);
    if (representability) {
      if (rgEvidence.length > 0) decisions.push(dispositionForAdmission(admission, null,
        "verified_but_unapplied_contract_insufficient", rgEvidence.map((item) => item.evidenceId), [], [representability]));
      continue;
    }
    const rfResolution = admission.knowledgeQuery ? resolveKnowledge(input.rfEntries, admission.knowledgeQuery) : null;
    const rfValue = rfResolution && ["resolved_single", "resolved_corroborated"].includes(rfResolution.status)
      && valueApplicable(rfResolution.value, admission) ? rfResolution.value : null;
    const rgValues = uniqueValues(rgEvidence.filter((item) => valueApplicable(item.proposedValue, admission)));
    if (rfValue) {
      if (rgValues.some((value) => canonicalJson(value) !== canonicalJson(rfValue))) {
        decisions.push(dispositionForAdmission(admission, "governed_rf_snapshot", "withheld_conflicting_rf_and_rg",
          rgEvidence.map((item) => item.evidenceId), rfResolution!.selectedEntryRefs, ["exact_current_run_evidence_contradicts_bound_rf"]));
        continue;
      }
      const claimApplications = applicationsFor(admission, run, rfValue, "governed_rf_snapshot", input.persisted.rfSnapshotHash,
        rfResolution!.selectedEntryRefs, rfResolution!.sourceAuthorities, []);
      if (claimApplications.length !== admission.canonicalRefs.length) {
        decisions.push(dispositionForAdmission(admission, "governed_rf_snapshot", "rejected_integrity_or_applicability", [],
          rfResolution!.selectedEntryRefs, ["exact_atomic_claim_canonical_occurrence_binding_incomplete"]));
        continue;
      }
      applications.push(...claimApplications);
      decisions.push(dispositionForAdmission(admission, "governed_rf_snapshot", "already_resolved_by_rf", [],
        rfResolution!.selectedEntryRefs, ["bound_rf_resolved_exact_atomic_claim"], claimApplications));
      continue;
    }
    if (rgValues.length > 1) {
      decisions.push(dispositionForAdmission(admission, "current_run_verified_rg_evidence",
        "withheld_conflicting_current_run_evidence", rgEvidence.map((item) => item.evidenceId), [],
        ["conflicting_verified_current_run_values"]));
      continue;
    }
    if (rgValues.length === 1) {
      const supporting = rgEvidence.filter((item) => canonicalJson(item.proposedValue) === canonicalJson(rgValues[0]));
      const claimApplications = applicationsFor(admission, run, rgValues[0]!, "current_run_verified_rg_evidence", null, [],
        unique(supporting.map((item) => item.sourceAuthority)), supporting.map((item) => item.evidenceId), supporting);
      if (claimApplications.length !== admission.canonicalRefs.length) {
        decisions.push(dispositionForAdmission(admission, "current_run_verified_rg_evidence",
          "rejected_integrity_or_applicability", supporting.map((item) => item.evidenceId), [],
          ["exact_atomic_claim_canonical_occurrence_binding_incomplete"]));
        continue;
      }
      applications.push(...claimApplications);
      decisions.push(dispositionForAdmission(admission, "current_run_verified_rg_evidence", "applied",
        supporting.map((item) => item.evidenceId), [], ["verified_exact_claim_current_run_support"], claimApplications));
      continue;
    }
    if (rgEvidence.length > 0) decisions.push(dispositionForAdmission(admission, null, "rejected_integrity_or_applicability",
      rgEvidence.map((item) => item.evidenceId), [], ["verified_value_not_losslessly_applicable"]));
  }
  return { applications: dedupeApplications(applications), decisions: dedupeDecisions(decisions) };
}

function applicationsFor(admission: CanonicalRgClaimAdmission, run: CanonicalAnalysisRun, value: KnowledgeClaimValue,
  sourceKind: "governed_rf_snapshot" | "current_run_verified_rg_evidence", knowledgeSnapshotHash: string | null,
  selectedEntryRefs: string[], sourceAuthorities: CanonicalEconomicSemanticApplicationAdmission["sourceAuthorities"],
  externalEvidenceRefs: string[], evidence: CanonicalRgVerifiedEvidence[] = []): CanonicalEconomicSemanticApplicationAdmission[] {
  const chargeByRef = new Map(run.artifacts.rd?.economicLayer.charges.map((charge) => [charge.id, charge]) ?? []);
  return admission.canonicalRefs.flatMap((chargeRef) => {
    const charge = chargeByRef.get(chargeRef);
    const occurrenceRef = charge?.contributingOccurrenceRef;
    if (!occurrenceRef || !admission.occurrenceRefs.includes(occurrenceRef)) return [];
    const key = `semantic_${digestCanonical({ atomicClaimId: admission.atomicClaimId, chargeRef, sourceKind, value }).slice(0, 24)}`;
    return [{
      key, claimRef: admission.parentClaimIds[0] ?? admission.atomicClaimId, atomicClaimId: admission.atomicClaimId,
      facet: admission.facet as CanonicalEconomicSemanticApplicationAdmission["facet"],
      claimClass: admission.facet === "economic_category" ? "economic_category" : "participant_control_role",
      chargeRef, occurrenceRef, value: structuredClone(value), sourceKind,
      knowledgeClaimType: admission.facet === "economic_category" ? "stable_facet_mapping" : "participant_control_role",
      knowledgeSubjectCode: admission.knowledgeQuery!.subjectCode, knowledgeSnapshotHash,
      selectedEntryRefs: unique(selectedEntryRefs), sourceAuthorities: unique(sourceAuthorities),
      externalEvidenceRefs: unique(externalEvidenceRefs), asOf: admission.knowledgeQuery!.asOf,
      effectiveFrom: evidence.length === 0 ? null : commonNullable(evidence.map((item) => item.effectiveFrom)),
      effectiveTo: evidence.length === 0 ? null : commonNullable(evidence.map((item) => item.effectiveTo)),
      scopeFingerprint: admission.scopeFingerprint,
      limitations: [sourceKind === "governed_rf_snapshot"
        ? "The immutable run-bound RF snapshot resolves only this exact atomic facet."
        : "Verified current-run evidence resolves only this exact atomic facet and is not RF knowledge."],
    }];
  });
}

function valueApplicable(value: KnowledgeClaimValue | null, admission: CanonicalRgClaimAdmission): value is KnowledgeClaimValue {
  return canonicalSemanticValueApplicable({ facet: admission.facet,
    subjectCode: admission.knowledgeQuery?.subjectCode ?? "", value });
}

function representabilityReason(admission: CanonicalRgClaimAdmission): string | null {
  if (!admission.knowledgeQuery && (admission.facet === "economic_category" ||
    LOSSLESS_ROLE_FACETS.has(admission.facet))) return "exact_knowledge_scope_unavailable";
  if (admission.facet === "constraint") return "constraint_requires_canonical_constraint_payload";
  if (admission.facet === "merchant_lever") return "boolean_lever_does_not_define_action_or_prerequisites";
  if (["underlying_cost_billing_mode", "merchant_price_schedule_shape", "pricing_scope_uniformity"].includes(admission.facet)) {
    return "pricing_axis_application_contract_not_available";
  }
  if (["recurrence", "counterfactual"].includes(admission.facet)) return "synthesis_claim_application_contract_not_available";
  if (admission.facet === "fee_detail_coverage") return "fee_detail_requires_source_capability_evidence";
  return null;
}

function validateFinancialInvariance(before: CanonicalAnalysisArtifacts, after: CanonicalAnalysisArtifacts): string[] {
  const errors: string[] = [];
  if (canonicalJson(before.rb) !== canonicalJson(after.rb)) errors.push("semantic_convergence_changed_rb");
  if (canonicalJson(before.rc) !== canonicalJson(after.rc)) errors.push("semantic_convergence_changed_rc");
  const projection = (artifacts: CanonicalAnalysisArtifacts) => artifacts.rd?.economicLayer.charges.map((charge) => ({
    id: charge.id, sourceOccurrenceRefs: charge.sourceOccurrenceRefs, representationGroupRef: charge.representationGroupRef,
    contributingOccurrenceRef: charge.contributingOccurrenceRef, observedAmount: charge.observedAmount,
    financialDirection: charge.financialDirection,
    contributionMembership: charge.contributionStatus.startsWith("contributes_") ? "contributing" : charge.contributionStatus,
    statementPeriodApplicability: charge.statementPeriodApplicability, evidenceRefs: charge.evidenceRefs,
    reconciliationRefs: charge.reconciliationRefs,
  }));
  if (canonicalJson(projection(before)) !== canonicalJson(projection(after))) errors.push("semantic_convergence_changed_charge_financial_truth");
  const stack = (artifacts: CanonicalAnalysisArtifacts) => ({
    authoritativeStatementFeeTotal: artifacts.rd?.economicLayer.costStack.authoritativeStatementFeeTotal,
    totalStatementProcessingCost: artifacts.rd?.economicLayer.costStack.totalStatementProcessingCost,
    reconciliationDeltaMinor: artifacts.rd?.economicLayer.costStack.reconciliationDeltaMinor,
    reconciliationRef: artifacts.rd?.economicLayer.costStack.reconciliationRef,
  });
  if (canonicalJson(stack(before)) !== canonicalJson(stack(after))) errors.push("semantic_convergence_changed_statement_cost_or_reconciliation");
  return errors;
}

function revisedStageOutcomes(outcomes: CanonicalAnalysisRun["stageOutcomes"], artifacts: CanonicalAnalysisArtifacts) {
  const result = structuredClone(outcomes);
  const values: Array<[AnalysisRunStageId, unknown]> = [["rd", artifacts.rd], ["re", artifacts.re],
    ["claim_inventory", artifacts.unresolvedClaims], ["rg_planning", artifacts.rgWorkLedger], ["rh", artifacts.rh]];
  for (const [stage, artifact] of values) {
    const validation = artifact && typeof artifact === "object"
      ? (artifact as { validation?: { warnings?: string[] } }).validation
      : undefined;
    result[stage] = { ...result[stage], status: "valid", artifactHash: digestCanonical(artifact),
      errors: [], warnings: unique(validation?.warnings ?? result[stage].warnings),
      limitations: [...result[stage].limitations] };
  }
  return result;
}

function dispositionForAdmission(admission: CanonicalRgClaimAdmission,
  sourceKind: CanonicalSemanticApplicationDisposition["sourceKind"],
  dispositionValue: CanonicalSemanticApplicationDisposition["disposition"], evidenceRefs: string[], rfEntryRefs: string[],
  reasonCodes: string[], applications: CanonicalEconomicSemanticApplicationAdmission[] = []): CanonicalSemanticApplicationDisposition {
  return disposition(admission.atomicClaimId, admission.canonicalRefs, admission.facet, sourceKind,
    dispositionValue, applications, evidenceRefs, rfEntryRefs, reasonCodes);
}

function disposition(atomicClaimId: string, chargeRefs: string[], facet: CanonicalSemanticApplicationDisposition["facet"],
  sourceKind: CanonicalSemanticApplicationDisposition["sourceKind"], dispositionValue: CanonicalSemanticApplicationDisposition["disposition"],
  applications: CanonicalEconomicSemanticApplicationAdmission[], evidenceRefs: string[], rfEntryRefs: string[],
  reasonCodes: string[]): CanonicalSemanticApplicationDisposition {
  return { applicationId: `semantic-decision-${digestCanonical({ atomicClaimId, sourceKind, dispositionValue }).slice(0, 32)}`,
    atomicClaimId, chargeRef: chargeRefs[0]!, chargeRefs: unique(chargeRefs), facet, sourceKind, disposition: dispositionValue,
    semanticApplication: applications[0] ?? null, semanticApplications: [...applications],
    evidenceRefs: unique(evidenceRefs), rfEntryRefs: unique(rfEntryRefs), reasonCodes: unique(reasonCodes) };
}

function uniqueValues(evidence: CanonicalRgVerifiedEvidence[]): KnowledgeClaimValue[] {
  const values = new Map<string, KnowledgeClaimValue>();
  for (const item of evidence) values.set(canonicalJson(item.proposedValue), item.proposedValue);
  return [...values.values()];
}

function dedupeApplications(values: CanonicalEconomicSemanticApplicationAdmission[]): CanonicalEconomicSemanticApplicationAdmission[] {
  const byClaim = new Map<string, CanonicalEconomicSemanticApplicationAdmission>();
  for (const value of values) byClaim.set(`${value.atomicClaimId}:${value.chargeRef}:${value.facet}`, value);
  return [...byClaim.values()].sort((left, right) => left.atomicClaimId.localeCompare(right.atomicClaimId)
    || left.chargeRef.localeCompare(right.chargeRef));
}

function dedupeDecisions(values: CanonicalSemanticApplicationDisposition[]): CanonicalSemanticApplicationDisposition[] {
  const byClaim = new Map<string, CanonicalSemanticApplicationDisposition>();
  for (const value of values) byClaim.set(value.atomicClaimId, value);
  return [...byClaim.values()].sort((left, right) => left.atomicClaimId.localeCompare(right.atomicClaimId));
}

function commonNullable(values: Array<string | null>): string | null {
  const uniqueValues = [...new Set(values)];
  return uniqueValues.length === 1 ? uniqueValues[0]! : null;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}
