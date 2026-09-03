import { createHash } from "node:crypto";

import { canonicalJson } from "../canonical/v2/canonicalJson.js";
import {
  RB_KERNEL_LIMITED_AUTHORITY_REF,
  rbKernelAuthorityProofHash,
  type RbKernelAuthorityProofCore,
} from "../canonical/v2/kernelAuthorityContract.js";
import {
  RB_DEPENDENCY_REGISTRY,
  evaluateRbDependencyRegistry,
  type RbDependencyPermission,
  type RbDependencyRelationshipControl,
  type RbDependencyRegistryProjection,
} from "../canonical/v2/rbDependencyRegistry.js";
import type {
  CanonicalEconomicsV2Calculation,
  CanonicalEconomicsV2EvidenceRecord,
  CanonicalEconomicsV2FinancialPopulations,
  CanonicalEconomicsV2Foundation,
} from "../canonical/v2/types.js";
import { validateCanonicalEconomicsV2Foundation } from "../canonical/v2/validate.js";
import {
  CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS,
  type CanonicalRbLimitedAuthorityPopulation,
  type CanonicalRbLimitedAuthorityResult,
} from "./canonicalRbLimitedAuthority.js";

export const CANONICAL_RB_AUTHORITY_REGENERATION_SCHEMA =
  "canonical_rb_limited_authority_dependency_regeneration_v1" as const;
export const CANONICAL_RB_AUTHORITY_REGENERATION_POLICY =
  "isolated_rb_claim_local_dependency_graph_v1" as const;

export type CanonicalRbLimitedAuthorityRegenerationResult = {
  schemaVersion: typeof CANONICAL_RB_AUTHORITY_REGENERATION_SCHEMA;
  policyVersion: typeof CANONICAL_RB_AUTHORITY_REGENERATION_POLICY;
  executionBoundary: "isolated_evaluation_rb_dependency_graph";
  productionUse: "prohibited";
  canonicalPersistence: "none";
  downstreamExecution: "prohibited";
  authorityScope: readonly CanonicalRbLimitedAuthorityPopulation[];
  authorityOverlayHash: string | null;
  status: "regenerated" | "no_authority_applied" | "failed";
  application: {
    appliedPopulationKeys: CanonicalRbLimitedAuthorityPopulation[];
    changedPopulationKeys: CanonicalRbLimitedAuthorityPopulation[];
    confirmedPopulationKeys: CanonicalRbLimitedAuthorityPopulation[];
    authorityFactRefs: Partial<Record<CanonicalRbLimitedAuthorityPopulation, string>>;
  };
  projection: {
    rbFoundation: CanonicalEconomicsV2Foundation;
    rbValidation: CanonicalEconomicsV2Foundation["validation"];
    dependencyRegistryVersion: RbDependencyRegistryProjection["registryVersion"];
    dependencyRegistryValidation: RbDependencyRegistryProjection["registryValidation"];
    dependencyRegistryNodes: RbDependencyRegistryProjection["nodeOutcomes"];
    financialPopulations: CanonicalEconomicsV2FinancialPopulations;
    metrics: CanonicalEconomicsV2Foundation["metrics"];
    calculations: CanonicalEconomicsV2Calculation[];
    relationshipControls: {
      before: RbDependencyRelationshipControl[];
      after: RbDependencyRelationshipControl[];
    };
    calculationPermissions: {
      headlineEffectiveRate: { before: RbDependencyPermission; after: RbDependencyPermission };
      grossBasedRateDiagnostic: { before: RbDependencyPermission; after: RbDependencyPermission };
      headlineAverageTicket: { before: RbDependencyPermission; after: RbDependencyPermission };
      grossRefundNetControl: { before: RbDependencyPermission; after: RbDependencyPermission };
      submittedCountControl: { before: RbDependencyPermission; after: RbDependencyPermission };
    };
  };
  changes: Array<{
    nodeId: string;
    kind: "financial_population" | "metric" | "calculation" | "calculation_permission" | "relationship_control";
    dependencyPopulationKeys: string[];
    beforeHash: string;
    afterHash: string;
    reasonCode: string;
  }>;
  integrity: {
    baseFoundationHashBefore: string;
    baseFoundationHashAfter: string;
    baseFoundationUnchanged: boolean;
    nonAllowlistedPopulationHashBefore: string;
    nonAllowlistedPopulationHashAfter: string;
    nonAllowlistedPopulationsUnchanged: boolean;
    unrelatedFoundationHashBefore: string;
    unrelatedFoundationHashAfter: string;
    unrelatedFoundationFieldsUnchanged: boolean;
    protectedDownstreamHashBefore: string;
    protectedDownstreamHashAfter: string;
    protectedDownstreamArtifactsUnchanged: boolean;
    onlyAllowlistedPopulationKeysChanged: boolean;
    onlyDeclaredDependencyNodesChanged: boolean;
    projectedRbValidationPassed: boolean;
    kernelEvidenceRecordCount: number;
    resultHash: string;
  };
  errors: string[];
};

export function evaluateCanonicalRbLimitedAuthorityRegeneration(input: {
  foundation: CanonicalEconomicsV2Foundation;
  authority: CanonicalRbLimitedAuthorityResult;
  protectedDownstreamArtifacts: unknown;
  executionContext: "evaluation_compatibility";
}): CanonicalRbLimitedAuthorityRegenerationResult {
  if ((input as { executionContext?: string }).executionContext !== "evaluation_compatibility") {
    throw new Error("RECONSTRUCTION_AUTHORITY_REGENERATION_REQUIRES_EVALUATION_CONTEXT");
  }

  const baseFoundationHashBefore = hash(input.foundation);
  const protectedDownstreamHashBefore = hash(input.protectedDownstreamArtifacts);
  const basePopulations = structuredClone(input.foundation.financialPopulations);
  let projectedPopulations = structuredClone(input.foundation.financialPopulations);
  const authorityFactRefs: Partial<Record<CanonicalRbLimitedAuthorityPopulation, string>> = {};
  const appliedPopulationKeys: CanonicalRbLimitedAuthorityPopulation[] = [];
  const changedPopulationKeys: CanonicalRbLimitedAuthorityPopulation[] = [];
  const confirmedPopulationKeys: CanonicalRbLimitedAuthorityPopulation[] = [];
  let projectedEvidence = structuredClone(input.foundation.sourceModel.evidence);
  const errors: string[] = [];

  if (!sameValues(input.authority.allowlistedPopulations, CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS)) {
    errors.push("authority_allowlist_does_not_match_product_approved_scope");
  }
  if (input.authority.status === "failed") errors.push("limited_authority_overlay_failed");
  if (!input.authority.canonicalOverlayHash || !/^[a-f0-9]{64}$/.test(input.authority.canonicalOverlayHash)) {
    errors.push("authority_overlay_hash_missing_or_invalid");
  }
  if (!input.foundation.identity.sourceFingerprint || !/^[a-f0-9]{64}$/.test(input.foundation.identity.sourceFingerprint)) {
    errors.push("rb_source_fingerprint_missing_or_invalid");
  }

  if (errors.length === 0) {
    for (const populationKey of CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS) {
      const authorityFact = input.authority.canonicalFacts[populationKey];
      if (!authorityFact) continue;
      const base = projectedPopulations[populationKey];
      if (base.population !== authorityFact.population) {
        errors.push(`authority_population_mismatch:${populationKey}`);
        continue;
      }
      const value = structuredClone(authorityFact.value) as typeof base.value;
      const changed = base.status !== "available" || !sameValues(base.value, value);
      const evidenceRefs = authorityFact.sourceEvidence.map((evidence) => kernelEvidenceId({
        populationKey,
        authorityFactRef: authorityFact.id,
        observationRef: evidence.observationRef,
        documentRef: evidence.documentRef,
        page: evidence.page,
        lineRef: evidence.lineRef,
        authorityOverlayHash: input.authority.canonicalOverlayHash!,
      }));
      const proofCore: RbKernelAuthorityProofCore = {
        kind: "statement_reconstruction_kernel_limited_authority",
        populationKey,
        authorityRef: RB_KERNEL_LIMITED_AUTHORITY_REF,
        policyVersion: authorityFact.authorityPolicy,
        authorityFactRef: authorityFact.id,
        authorityOverlayHash: input.authority.canonicalOverlayHash!,
        sourceDocumentRef: input.foundation.identity.sourceDocumentRef,
        sourceFingerprint: input.foundation.identity.sourceFingerprint!,
        evidenceRefs,
        controlProofs: structuredClone(authorityFact.controlProofs),
        deterministicOnly: true,
        providerAuthority: "prohibited",
      };
      const proofHash = rbKernelAuthorityProofHash(proofCore);
      projectedEvidence.push(...authorityFact.sourceEvidence.map((evidence, index): CanonicalEconomicsV2EvidenceRecord => ({
        id: evidenceRefs[index]!,
        documentRef: evidence.documentRef,
        sectionRef: null,
        pageNumber: evidence.page,
        lineRef: evidence.lineRef,
        rowIndex: null,
        extractionMethod: "reconstruction_kernel_deterministic",
        redactedExcerpt: null,
        redactionApplied: true,
        kernelProof: {
          authorityFactRef: authorityFact.id,
          populationKey,
          observationRef: evidence.observationRef,
          authorityOverlayHash: input.authority.canonicalOverlayHash!,
          sourceFingerprint: input.foundation.identity.sourceFingerprint!,
          proofHash,
        },
      })));
      (projectedPopulations as unknown as Record<string, unknown>)[populationKey] = {
        ...base,
        status: "available",
        value,
        confidence: "high",
        provenanceStatus: "authoritative",
        evidenceRefs,
        occurrenceRefs: [],
        calculationRef: null,
        authorityBasis: { ...proofCore, proofHash },
        limitations: [
          "Claim-local value supplied by the Product-approved limited Kernel authority overlay.",
          "Authority remains confined to the isolated evaluation RB dependency graph.",
        ],
      } as typeof base;
      authorityFactRefs[populationKey] = authorityFact.id;
      appliedPopulationKeys.push(populationKey);
      (changed ? changedPopulationKeys : confirmedPopulationKeys).push(populationKey);
    }
  }

  if (errors.length > 0) {
    projectedPopulations = structuredClone(basePopulations);
    projectedEvidence = structuredClone(input.foundation.sourceModel.evidence);
    appliedPopulationKeys.length = 0;
    changedPopulationKeys.length = 0;
    confirmedPopulationKeys.length = 0;
    for (const key of Object.keys(authorityFactRefs)) {
      delete authorityFactRefs[key as CanonicalRbLimitedAuthorityPopulation];
    }
  }

  let dependencyProjection = evaluateRbDependencyRegistry({
    foundation: input.foundation,
    before: basePopulations,
    after: errors.length === 0 ? projectedPopulations : basePopulations,
  });
  if (dependencyProjection.registryValidation.status !== "valid") {
    errors.push(...dependencyProjection.registryValidation.errors.map((error) => `dependency_registry_invalid:${error}`));
  }
  let projectedFoundation = buildProjectedFoundation({
    base: input.foundation,
    populations: projectedPopulations,
    evidence: projectedEvidence,
    dependencyProjection,
    kernelAuthorityApplied: appliedPopulationKeys.length > 0,
  });
  const candidateValidation = projectedFoundation.validation;
  if (candidateValidation.status !== "valid") {
    errors.push(...candidateValidation.errors.map((error) => `rb_validation_failed:${error}`));
  }
  if (errors.length > 0) {
    projectedPopulations = structuredClone(basePopulations);
    projectedEvidence = structuredClone(input.foundation.sourceModel.evidence);
    appliedPopulationKeys.length = 0;
    changedPopulationKeys.length = 0;
    confirmedPopulationKeys.length = 0;
    for (const key of Object.keys(authorityFactRefs)) {
      delete authorityFactRefs[key as CanonicalRbLimitedAuthorityPopulation];
    }
    dependencyProjection = evaluateRbDependencyRegistry({
      foundation: input.foundation,
      before: basePopulations,
      after: basePopulations,
    });
    projectedFoundation = structuredClone(input.foundation);
  }
  const projectedMetrics = dependencyProjection.metrics;
  const projectedCalculations = dependencyProjection.calculations;
  const beforeRelationships = dependencyProjection.relationshipControls.before;
  const afterRelationships = dependencyProjection.relationshipControls.after;
  const pairedPermissions = dependencyProjection.calculationPermissions;
  const beforeAverage = input.foundation.metrics.headlineAverageTicket;
  const beforeGrossRate = input.foundation.metrics.grossBasedRateDiagnostic;

  const changes = [
    ...populationChanges(basePopulations, projectedPopulations),
    ...nodeChange("metric_v2_headline_average_ticket", "metric" as const,
      registryDependencies("metric_v2_headline_average_ticket"), beforeAverage, projectedMetrics.headlineAverageTicket,
      "approved_population_dependency_regenerated"),
    ...nodeChange("metric_v2_gross_based_rate_diagnostic", "metric" as const,
      registryDependencies("metric_v2_gross_based_rate_diagnostic"), beforeGrossRate, projectedMetrics.grossBasedRateDiagnostic,
      "configured_gross_rate_dependency_regenerated"),
    ...calculationChanges(input.foundation.calculations, projectedCalculations),
    ...permissionChanges(pairedPermissions),
    ...relationshipChanges(beforeRelationships, afterRelationships),
  ];

  const baseFoundationHashAfter = hash(input.foundation);
  const protectedDownstreamHashAfter = hash(input.protectedDownstreamArtifacts);
  const nonAllowlistedBefore = nonAllowlistedPopulations(basePopulations);
  const nonAllowlistedAfter = nonAllowlistedPopulations(projectedPopulations);
  const unrelatedBefore = unrelatedFoundation(input.foundation);
  const unrelatedAfter = unrelatedFoundation(projectedFoundation);
  const allowedChangedNodes = new Set([
    ...CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS.map((key) => `financial_population:${key}`),
    ...dependencyProjection.nodeOutcomes.filter((item) => item.nodeKind === "metric")
      .map((item) => `metric:${item.nodeId}`),
    ...dependencyProjection.nodeOutcomes.flatMap((item) => item.calculationId
      ? [`calculation:${item.calculationId}`] : []),
    "calculation_permission:headlineAverageTicket",
    "calculation_permission:grossBasedRateDiagnostic",
    "calculation_permission:grossRefundNetControl",
    "calculation_permission:submittedCountControl",
    ...dependencyProjection.nodeOutcomes.filter((item) => item.nodeKind === "control")
      .map((item) => `relationship_control:${item.nodeId}`),
  ]);
  const onlyAllowlistedPopulationKeysChanged = populationChanges(basePopulations, projectedPopulations)
    .every((item) => CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS.includes(item.nodeId as CanonicalRbLimitedAuthorityPopulation));
  const onlyDeclaredDependencyNodesChanged = changes.every((item) => allowedChangedNodes.has(`${item.kind}:${item.nodeId}`));
  if (!onlyAllowlistedPopulationKeysChanged) errors.push("non_allowlisted_population_changed");
  if (!onlyDeclaredDependencyNodesChanged) errors.push("undeclared_dependency_node_changed");
  if (baseFoundationHashBefore !== baseFoundationHashAfter) errors.push("base_foundation_mutated");
  if (protectedDownstreamHashBefore !== protectedDownstreamHashAfter) errors.push("protected_downstream_artifact_mutated");

  const resultWithoutIntegrity = {
    schemaVersion: CANONICAL_RB_AUTHORITY_REGENERATION_SCHEMA,
    policyVersion: CANONICAL_RB_AUTHORITY_REGENERATION_POLICY,
    executionBoundary: "isolated_evaluation_rb_dependency_graph" as const,
    productionUse: "prohibited" as const,
    canonicalPersistence: "none" as const,
    downstreamExecution: "prohibited" as const,
    authorityScope: CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS,
    authorityOverlayHash: input.authority.canonicalOverlayHash,
    status: errors.length > 0 ? "failed" as const
      : appliedPopulationKeys.length > 0 ? "regenerated" as const : "no_authority_applied" as const,
    application: { appliedPopulationKeys, changedPopulationKeys, confirmedPopulationKeys, authorityFactRefs },
    projection: {
      rbFoundation: projectedFoundation,
      rbValidation: candidateValidation,
      dependencyRegistryVersion: dependencyProjection.registryVersion,
      dependencyRegistryValidation: dependencyProjection.registryValidation,
      dependencyRegistryNodes: dependencyProjection.nodeOutcomes,
      financialPopulations: projectedPopulations,
      metrics: projectedMetrics,
      calculations: projectedCalculations,
      relationshipControls: { before: beforeRelationships, after: afterRelationships },
      calculationPermissions: pairedPermissions,
    },
    changes,
    errors: unique(errors),
  };
  const integrityWithoutHash = {
    baseFoundationHashBefore,
    baseFoundationHashAfter,
    baseFoundationUnchanged: baseFoundationHashBefore === baseFoundationHashAfter,
    nonAllowlistedPopulationHashBefore: hash(nonAllowlistedBefore),
    nonAllowlistedPopulationHashAfter: hash(nonAllowlistedAfter),
    nonAllowlistedPopulationsUnchanged: sameValues(nonAllowlistedBefore, nonAllowlistedAfter),
    unrelatedFoundationHashBefore: hash(unrelatedBefore),
    unrelatedFoundationHashAfter: hash(unrelatedAfter),
    unrelatedFoundationFieldsUnchanged: sameValues(unrelatedBefore, unrelatedAfter),
    protectedDownstreamHashBefore,
    protectedDownstreamHashAfter,
    protectedDownstreamArtifactsUnchanged: protectedDownstreamHashBefore === protectedDownstreamHashAfter,
    onlyAllowlistedPopulationKeysChanged,
    onlyDeclaredDependencyNodesChanged,
    projectedRbValidationPassed: candidateValidation.status === "valid",
    kernelEvidenceRecordCount: projectedEvidence.filter((item) => item.kernelProof).length,
  };
  return {
    ...resultWithoutIntegrity,
    integrity: {
      ...integrityWithoutHash,
      resultHash: hash({ ...resultWithoutIntegrity, integrity: integrityWithoutHash }),
    },
  };
}

function calculationChanges(before: CanonicalEconomicsV2Calculation[], after: CanonicalEconomicsV2Calculation[]) {
  return RB_DEPENDENCY_REGISTRY.filter((item) => item.calculationId !== null).flatMap((registryEntry) => nodeChange(
    registryEntry.calculationId!, "calculation" as const, [...registryEntry.dependencies],
    before.find((item) => item.id === registryEntry.calculationId) ?? null,
    after.find((item) => item.id === registryEntry.calculationId) ?? null,
    "dependent_calculation_lineage_regenerated"));
}

function populationChanges(before: CanonicalEconomicsV2FinancialPopulations, after: CanonicalEconomicsV2FinancialPopulations) {
  return Object.keys(before).flatMap((nodeId) => nodeChange(nodeId, "financial_population" as const, [nodeId],
    before[nodeId as keyof CanonicalEconomicsV2FinancialPopulations],
    after[nodeId as keyof CanonicalEconomicsV2FinancialPopulations], "limited_authority_fact_applied"));
}

function permissionChanges(pairs: RbDependencyRegistryProjection["calculationPermissions"]) {
  return (Object.keys(pairs) as Array<keyof typeof pairs>).flatMap((nodeId) => nodeChange(nodeId,
    "calculation_permission" as const, pairs[nodeId].after.dependencyPopulationKeys,
    pairs[nodeId].before, pairs[nodeId].after,
    "dependency_permission_regenerated"));
}

function relationshipChanges(before: RbDependencyRelationshipControl[], after: RbDependencyRelationshipControl[]) {
  return before.flatMap((item, index) => nodeChange(item.id, "relationship_control" as const,
    item.dependencyPopulationKeys, item, after[index], "relationship_control_regenerated"));
}

function nodeChange<TKind extends CanonicalRbLimitedAuthorityRegenerationResult["changes"][number]["kind"]>(
  nodeId: string,
  kind: TKind,
  dependencyPopulationKeys: string[],
  before: unknown,
  after: unknown,
  reasonCode: string,
): CanonicalRbLimitedAuthorityRegenerationResult["changes"] {
  const beforeHash = hash(before);
  const afterHash = hash(after);
  return beforeHash === afterHash ? [] : [{ nodeId, kind, dependencyPopulationKeys, beforeHash, afterHash, reasonCode }];
}

function nonAllowlistedPopulations(populations: CanonicalEconomicsV2FinancialPopulations) {
  return Object.fromEntries(Object.entries(populations)
    .filter(([key]) => !CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS.includes(key as CanonicalRbLimitedAuthorityPopulation)));
}

function unrelatedFoundation(foundation: CanonicalEconomicsV2Foundation) {
  const { financialPopulations: _financialPopulations, metrics: _metrics, calculations: _calculations,
    validation: _validation, sourceModel, versionManifest, ...unrelated } = foundation;
  const { evidence: _evidence, ...sourceModelWithoutEvidence } = sourceModel;
  const { kernelAuthorityMode: _kernelAuthorityMode, ...versionManifestWithoutKernelMode } = versionManifest;
  return { ...unrelated, sourceModel: sourceModelWithoutEvidence, versionManifest: versionManifestWithoutKernelMode };
}

function registryDependencies(nodeId: string): string[] {
  return [...(RB_DEPENDENCY_REGISTRY.find((item) => item.nodeId === nodeId)?.dependencies ?? [])];
}

function kernelEvidenceId(input: {
  populationKey: CanonicalRbLimitedAuthorityPopulation;
  authorityFactRef: string;
  observationRef: string;
  documentRef: string;
  page: number;
  lineRef: string;
  authorityOverlayHash: string;
}): string {
  return `evidence_v2_kernel_${hash(input).slice(0, 24)}`;
}

function buildProjectedFoundation(input: {
  base: CanonicalEconomicsV2Foundation;
  populations: CanonicalEconomicsV2FinancialPopulations;
  evidence: CanonicalEconomicsV2EvidenceRecord[];
  dependencyProjection: RbDependencyRegistryProjection;
  kernelAuthorityApplied: boolean;
}): CanonicalEconomicsV2Foundation {
  const candidate: CanonicalEconomicsV2Foundation = {
    ...structuredClone(input.base),
    versionManifest: {
      ...structuredClone(input.base.versionManifest),
      ...(input.kernelAuthorityApplied ? { kernelAuthorityMode: "evaluation_limited_overlay" as const } : {}),
    },
    sourceModel: { ...structuredClone(input.base.sourceModel), evidence: input.evidence },
    financialPopulations: input.populations,
    metrics: input.dependencyProjection.metrics,
    calculations: input.dependencyProjection.calculations,
  };
  return validateCanonicalEconomicsV2Foundation(candidate);
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function sameValues(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
