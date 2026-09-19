import { createHash } from "node:crypto";
import type { CanonicalFactValue, CanonicalStatementAnalysis } from "../canonical/types.js";
import {
  authorityLanes, canonicalFactPaths, claimDimensions, F1_EVALUATOR_VERSION,
  F1_GRAPH_SCHEMA_VERSION, reasoningClasses, universalityScopes,
  type CanonicalRef, type F1Claim, type F1ClaimDraft, type F1ClaimGraph,
  type F1ConflictDraft, type F1ConflictGroup, type F1Edge, type F1EdgeDraft,
} from "./types.js";

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function canonicalCoreDigest(analysis: CanonicalStatementAnalysis): string {
  return digest({
    analysisId: analysis.analysisId,
    canonicalSchemaVersion: analysis.canonicalSchemaVersion,
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    crossSummaryLinkEvidence: analysis.crossSummaryLinkEvidence,
    evidence: analysis.evidence,
    calculations: analysis.calculations,
    versionManifest: analysis.versionManifest,
  });
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`F1 graph invalid: ${message}`);
}

function onlyKeys(value: object, keys: string[], label: string): void {
  check(Object.keys(value).every((key) => keys.includes(key)), `${label} contains an unrecognized field`);
}

function token(value: unknown): boolean {
  return typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value);
}

function exactId(array: Array<{ id: string }>, id: string): boolean {
  return array.filter((item) => item.id === id).length === 1;
}

export function canonicalFactAt(analysis: CanonicalStatementAnalysis, path: string): CanonicalFactValue<unknown> {
  check(canonicalFactPaths.includes(path as (typeof canonicalFactPaths)[number]), `unknown fact path ${path}`);
  const parts = path.split(".");
  let value: unknown = analysis;
  for (const part of parts) {
    check(value !== null && typeof value === "object" && part in value, `missing fact path ${path}`);
    value = (value as Record<string, unknown>)[part];
  }
  check(value !== null && typeof value === "object" && "status" in value && "evidenceRefs" in value, `invalid fact path ${path}`);
  return value as CanonicalFactValue<unknown>;
}

export function validateCanonicalRef(analysis: CanonicalStatementAnalysis, ref: CanonicalRef): void {
  check(ref !== null && typeof ref === "object" && typeof ref.kind === "string", "invalid canonical reference");
  if (ref.kind === "fact") {
    onlyKeys(ref, ["kind", "path", "selectedCandidateId"], "fact reference");
    check(typeof ref.path === "string" && (ref.selectedCandidateId === null || typeof ref.selectedCandidateId === "string"), "invalid fact reference");
    const fact = canonicalFactAt(analysis, ref.path);
    check((fact.selectedCandidateId ?? null) === ref.selectedCandidateId, `selected candidate drift at ${ref.path}`);
    if (ref.selectedCandidateId) check(fact.candidates.filter((item) => item.id === ref.selectedCandidateId && item.selected).length === 1, `missing selected candidate at ${ref.path}`);
    return;
  }
  onlyKeys(ref, ["kind", "id"], "canonical reference");
  check(typeof ref.id === "string" && ref.id.length > 0, "empty canonical reference ID");
  const collections: Record<Exclude<CanonicalRef["kind"], "fact">, Array<{ id: string }>> = {
    fee_row: analysis.feeLedger.rows,
    fee_occurrence: analysis.feeLedger.sourceOccurrences,
    fee_interpretation: analysis.feeLedger.parserInterpretations,
    fee_control: analysis.feeLedger.controls,
    calculation: analysis.calculations,
    evidence: analysis.evidence,
    cross_summary_node: analysis.crossSummaryLinkEvidence.nodes,
    cross_summary_relationship: analysis.crossSummaryLinkEvidence.relationships,
    fee_rollup: analysis.crossSummaryLinkEvidence.feeRollups,
  };
  check(ref.kind in collections, `unknown canonical reference kind ${ref.kind}`);
  check(exactId(collections[ref.kind as Exclude<CanonicalRef["kind"], "fact">], ref.id), `missing or duplicate ${ref.kind} reference ${ref.id}`);
}

function claimIdentity(analysisId: string, claim: F1ClaimDraft): string {
  return `f1_claim_${digest({ analysisId, candidateKey: claim.candidateKey, subject: claim.subject, dimension: claim.dimension, semanticCode: claim.semanticCode, temporal: claim.temporal, universality: claim.universality })}`;
}

function conflictIdentity(analysisId: string, claimIds: string[], sourceRelationshipRef: CanonicalRef | null): string {
  return `f1_conflict_${digest({ analysisId, claimIds: [...claimIds].sort(), sourceRelationshipRef })}`;
}

function payload(graph: F1ClaimGraph): Omit<F1ClaimGraph, "graphId"> {
  const { graphId: _graphId, ...rest } = graph;
  return rest;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createF1ClaimGraph(
  analysis: CanonicalStatementAnalysis,
  drafts: F1ClaimDraft[],
  edgeDrafts: F1EdgeDraft[] = [],
  conflictDrafts: F1ConflictDraft[] = [],
): F1ClaimGraph {
  check(analysis.canonicalSchemaVersion === "canonical_statement_analysis_v1" && analysis.validation.status !== "invalid", "canonical input unavailable");
  // Copy caller drafts before freezing the snapshot; they may contain shared input objects.
  const detachedDrafts = structuredClone(drafts);
  const detachedEdges = structuredClone(edgeDrafts);
  const detachedConflicts = structuredClone(conflictDrafts);
  check(new Set(detachedDrafts.map((item) => item.candidateKey)).size === detachedDrafts.length, "duplicate candidate key");
  const claims = detachedDrafts.map((draft) => ({ ...draft, claimId: claimIdentity(analysis.analysisId, draft) })).sort((a, b) => lexical(a.claimId, b.claimId));
  const byKey = new Map(claims.map((item) => [item.candidateKey, item.claimId]));
  const keyId = (key: string): string => {
    const id = byKey.get(key);
    check(id, `unknown edge candidate ${key}`);
    return id;
  };
  const edges: F1Edge[] = detachedEdges.map((edge) => {
    const left = keyId(edge.fromCandidateKey);
    const right = keyId(edge.toCandidateKey);
    return edge.kind === "contradicts"
      ? { kind: edge.kind, fromClaimId: [left, right].sort()[0], toClaimId: [left, right].sort()[1] }
      : { kind: edge.kind, fromClaimId: left, toClaimId: right };
  }).sort((a, b) => lexical(stable(a), stable(b)));
  const conflicts: F1ConflictGroup[] = detachedConflicts.map((conflict) => {
    const claimIds = conflict.candidateKeys.map(keyId).sort();
    return {
      conflictId: conflictIdentity(analysis.analysisId, claimIds, conflict.sourceRelationshipRef),
      claimIds, sourceRelationshipRef: conflict.sourceRelationshipRef, status: "unresolved" as const,
    };
  }).sort((a, b) => lexical(a.conflictId, b.conflictId));
  const graph: F1ClaimGraph = {
    schemaVersion: F1_GRAPH_SCHEMA_VERSION,
    evaluatorVersion: F1_EVALUATOR_VERSION,
    canonicalAnalysisId: analysis.analysisId,
    canonicalSchemaVersion: analysis.canonicalSchemaVersion,
    canonicalVersionDigest: digest(analysis.versionManifest),
    canonicalInputDigest: canonicalCoreDigest(analysis),
    graphId: "",
    claims, edges, conflicts,
  };
  graph.graphId = `f1_graph_${digest(payload(graph))}`;
  validateF1ClaimGraph(graph, analysis);
  return deepFreeze(graph);
}

export function validateF1ClaimGraph(graph: F1ClaimGraph, analysis: CanonicalStatementAnalysis): void {
  onlyKeys(graph, ["schemaVersion", "evaluatorVersion", "canonicalAnalysisId", "canonicalSchemaVersion", "canonicalVersionDigest", "canonicalInputDigest", "graphId", "claims", "edges", "conflicts"], "graph");
  check(graph.schemaVersion === F1_GRAPH_SCHEMA_VERSION && graph.evaluatorVersion === F1_EVALUATOR_VERSION, "unsupported graph version");
  check(graph.canonicalAnalysisId === analysis.analysisId && graph.canonicalSchemaVersion === analysis.canonicalSchemaVersion, "canonical identity drift");
  check(graph.canonicalVersionDigest === digest(analysis.versionManifest) && graph.canonicalInputDigest === canonicalCoreDigest(analysis), "canonical input/version drift");
  check(Array.isArray(graph.claims) && Array.isArray(graph.edges) && Array.isArray(graph.conflicts), "invalid graph collections");
  const claimIds = new Set<string>();
  const candidateKeys = new Set<string>();
  for (const claim of graph.claims) {
    onlyKeys(claim, ["claimId", "candidateKey", "subject", "dimension", "semanticCode", "value", "reasoning", "authority", "resolution", "temporal", "universality", "evidenceRefs", "calculationRefs", "canonicalRefs", "policyDependency"], "claim");
    check(typeof claim.candidateKey === "string" && claim.candidateKey.length > 0 && !candidateKeys.has(claim.candidateKey), "duplicate or empty candidate key");
    candidateKeys.add(claim.candidateKey);
    check(claimDimensions.includes(claim.dimension) && universalityScopes.includes(claim.universality), "unknown dimension or universality");
    check(token(claim.semanticCode), "invalid semantic code");
    const { claimId: _claimId, ...draft } = claim;
    check(claim.claimId === claimIdentity(analysis.analysisId, draft) && !claimIds.has(claim.claimId), "unstable or duplicate claim ID");
    claimIds.add(claim.claimId);
    validateCanonicalRef(analysis, claim.subject);
    check(claim.value !== null && typeof claim.value === "object", "invalid claim value");
    if (claim.value.kind === "known") {
      if (claim.value.representation === "canonical_reference") {
        check(claim.resolution.status === "represented_observation", "canonical reference was promoted beyond representation");
        onlyKeys(claim.value, ["kind", "representation", "ref"], "known reference value");
        const valueRef = claim.value.ref;
        validateCanonicalRef(analysis, valueRef);
        check(stable(valueRef) === stable(claim.subject), "known value does not reference its subject");
        if (valueRef.kind === "fact") {
          const fact = canonicalFactAt(analysis, valueRef.path);
          check(fact.status === "selected" && fact.value !== null, "unselected fact presented as known");
          check(fact.evidenceRefs.every((id) => claim.evidenceRefs.includes(id)), "selected fact evidence was omitted");
          check(!fact.calculationRef || claim.calculationRefs.includes(fact.calculationRef), "selected fact calculation was omitted");
        }
        if (valueRef.kind === "calculation") {
          const calculation = analysis.calculations.find((item) => item.id === valueRef.id);
          check(calculation !== undefined && calculation.result !== null, "unavailable calculation presented as known");
        }
        if (valueRef.kind === "cross_summary_node") {
          const node = analysis.crossSummaryLinkEvidence.nodes.find((item) => item.id === valueRef.id);
          check(node !== undefined && node.amount !== null, "unavailable cross-summary amount presented as known");
        }
        if (valueRef.kind === "cross_summary_relationship") {
          check(analysis.crossSummaryLinkEvidence.relationships.find((item) => item.id === valueRef.id)?.status === "proven", "unresolved relationship presented as known");
        }
        if (valueRef.kind === "fee_rollup") {
          const rollup = analysis.crossSummaryLinkEvidence.feeRollups.find((item) => item.id === valueRef.id);
          check(rollup !== undefined && rollup.status !== "unresolved", "unresolved rollup presented as known");
        }
      } else {
        check(claim.value.representation === "semantic_code", "unknown known-value representation");
        check(claim.resolution.status === "candidate_only", "semantic candidate was promoted beyond representation");
        onlyKeys(claim.value, ["kind", "representation", "code"], "known semantic value");
        check(token(claim.value.code), "known semantic value must be a nonnumeric code");
      }
    } else {
      check(claim.value.kind === "unknown" || claim.value.kind === "not_applicable", "unknown claim value state");
      onlyKeys(claim.value, ["kind", "reasonCode"], "unknown/not-applicable value");
      check(token(claim.value.reasonCode), "invalid value reason code");
      check(claim.value.kind === "unknown" ? ["unresolved", "conflict", "refused"].includes(claim.resolution.status) : claim.resolution.status === "not_applicable", "value/resolution mismatch");
    }
    check(claim.reasoning !== null && typeof claim.reasoning === "object", "missing reasoning provenance");
    onlyKeys(claim.reasoning, ["primaryClass", "supportingClasses", "ruleId", "ruleVersion"], "reasoning provenance");
    check(claim.reasoning.primaryClass === null || reasoningClasses.includes(claim.reasoning.primaryClass), "unknown reasoning class");
    check(Array.isArray(claim.reasoning.supportingClasses) && claim.reasoning.supportingClasses.every((item) => reasoningClasses.includes(item)), "unknown supporting reasoning class");
    check(claim.reasoning.primaryClass === null || claim.reasoning.supportingClasses.includes(claim.reasoning.primaryClass), "primary reasoning not in proof trail");
    check((claim.reasoning.ruleId === null && claim.reasoning.ruleVersion === null) || (token(claim.reasoning.ruleId) && token(claim.reasoning.ruleVersion)), "incomplete reasoning rule version");
    check(claim.authority !== null && typeof claim.authority === "object", "missing authority requirements");
    onlyKeys(claim.authority, ["requiredLanes", "satisfiedLanes", "assessment"], "authority state");
    check(Array.isArray(claim.authority.requiredLanes) && claim.authority.requiredLanes.every((lane) => authorityLanes.includes(lane)), "unknown authority lane");
    check(Array.isArray(claim.authority.satisfiedLanes) && claim.authority.satisfiedLanes.length === 0 && claim.authority.assessment === "not_evaluated", "F1 cannot grant authority");
    check(claim.resolution !== null && typeof claim.resolution === "object", "missing resolution");
    onlyKeys(claim.resolution, ["status", "reasonCode", "blockedDimensions"], "resolution");
    check(["represented_observation", "candidate_only", "unresolved", "not_applicable", "conflict", "refused"].includes(claim.resolution.status), "unknown resolution status");
    check(claim.resolution.reasonCode === null || token(claim.resolution.reasonCode), "invalid resolution reason");
    check(Array.isArray(claim.resolution.blockedDimensions) && claim.resolution.blockedDimensions.every((item) => claimDimensions.includes(item)), "unknown blocked dimension");
    if (claim.temporal !== null) {
      onlyKeys(claim.temporal, ["start", "end"], "temporal scope");
      check(/^\d{4}-\d{2}-\d{2}$/.test(claim.temporal.start) && /^\d{4}-\d{2}-\d{2}$/.test(claim.temporal.end) && claim.temporal.start <= claim.temporal.end, "invalid temporal interval");
    }
    check(Array.isArray(claim.evidenceRefs) && claim.evidenceRefs.every((id) => typeof id === "string" && exactId(analysis.evidence, id)), "broken evidence reference");
    check(Array.isArray(claim.calculationRefs) && claim.calculationRefs.every((id) => typeof id === "string" && exactId(analysis.calculations, id)), "broken calculation reference");
    check(Array.isArray(claim.canonicalRefs), "invalid canonical references");
    for (const ref of claim.canonicalRefs) validateCanonicalRef(analysis, ref);
    if (claim.policyDependency !== null) {
      onlyKeys(claim.policyDependency, ["ruleId", "ruleVersion"], "policy dependency");
      check(token(claim.policyDependency.ruleId) && token(claim.policyDependency.ruleVersion), "invalid Product-policy dependency");
    }
  }
  const edgeKeys = new Set<string>();
  const dependencyAdjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    onlyKeys(edge, ["kind", "fromClaimId", "toClaimId"], "edge");
    check(["depends_on", "contradicts", "policy_depends_on"].includes(edge.kind), "unknown edge kind");
    check(claimIds.has(edge.fromClaimId) && claimIds.has(edge.toClaimId) && edge.fromClaimId !== edge.toClaimId, "broken or self edge");
    const key = stable(edge);
    check(!edgeKeys.has(key), "duplicate edge");
    edgeKeys.add(key);
    if (edge.kind === "contradicts") check(edge.fromClaimId < edge.toClaimId, "contradiction edge must be canonicalized");
    else dependencyAdjacency.set(edge.fromClaimId, [...(dependencyAdjacency.get(edge.fromClaimId) ?? []), edge.toClaimId]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    check(!visiting.has(id), "dependency cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of dependencyAdjacency.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of claimIds) visit(id);
  const conflictIds = new Set<string>();
  for (const conflict of graph.conflicts) {
    onlyKeys(conflict, ["conflictId", "claimIds", "sourceRelationshipRef", "status"], "conflict");
    check(conflict.status === "unresolved" && Array.isArray(conflict.claimIds) && conflict.claimIds.length >= 2, "invalid conflict group");
    check(new Set(conflict.claimIds).size === conflict.claimIds.length && conflict.claimIds.every((id) => claimIds.has(id)), "broken conflict claims");
    check(conflict.claimIds.every((id) => graph.edges.some((edge) => edge.kind === "contradicts"
      && (edge.fromClaimId === id || edge.toClaimId === id)
      && conflict.claimIds.includes(edge.fromClaimId)
      && conflict.claimIds.includes(edge.toClaimId))), "conflict lacks internal contradiction edges");
    if (conflict.sourceRelationshipRef !== null) validateCanonicalRef(analysis, conflict.sourceRelationshipRef);
    check(conflict.conflictId === conflictIdentity(analysis.analysisId, conflict.claimIds, conflict.sourceRelationshipRef) && !conflictIds.has(conflict.conflictId), "unstable or duplicate conflict ID");
    conflictIds.add(conflict.conflictId);
  }
  check(graph.graphId === `f1_graph_${digest(payload(graph))}`, "snapshot digest mismatch");
}
