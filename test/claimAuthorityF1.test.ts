import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analyzer.js";
import { buildCanonicalRuntimeAnalysis } from "../src/canonical/runtimeAdapter.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { buildF1ClaimGraphFromCanonical, buildF1ShadowGraph } from "../src/claimAuthorityF1/canonicalAdapter.js";
import { createF1ClaimGraph, validateF1ClaimGraph } from "../src/claimAuthorityF1/graph.js";
import {
  authorityLanes, claimDimensions, reasoningClasses, universalityScopes,
  type F1ClaimDraft, type F1ClaimGraph,
} from "../src/claimAuthorityF1/types.js";
import { evaluateF0Assertion } from "../scripts/gold-f0-evaluation-lib.js";
import { authorityLanes as frozenAuthorityLanes, reasoningClasses as frozenReasoningClasses, universalityScopes as frozenUniversalityScopes } from "../scripts/gold-authority-derivability-lib.js";
import { f0ExecutableCandidates } from "./fixtures/gold-contract/f0-candidate-observations.js";
import type { NormalizedAuthorityRegister } from "../scripts/gold-authority-derivability-lib.js";
import type { ParsedDocument } from "../src/parser.js";
import { buildSingleStatementReportV1 } from "../src/reporting/v1/index.js";

function syntheticStatement(): ParsedDocument {
  const lines = [
    "Merchant: F1 Synthetic Cafe", "Processor: Fiserv", "Statement Period: 01/01/2026 - 01/31/2026",
    "Total Amount Submitted | $1,000.00", "Fees Charged | -$30.00", "Monthly Service Fee | -$10.00",
  ];
  return {
    sourceType: "pdf", headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: { mode: "structured", qualityScore: 1, reasons: ["F1 synthetic input"], lineCount: lines.length, amountTokenCount: lines.length, hasExtractableText: true },
  };
}

function canonical(): CanonicalStatementAnalysis {
  const analysis = buildCanonicalRuntimeAnalysis({
    document: syntheticStatement(), businessType: "restaurant_food_beverage",
    runtimeDocumentRef: "f1_synthetic_statement",
  }).analysis;
  // Supporting-only canonical row exercises typed fee references without adding money.
  analysis.evidence.push({
    id: "ev_f1_synthetic_fee", documentId: analysis.identity.sourceDocumentRef,
    pageNumber: 1, section: "fees", lineId: "f1-line", rowIndex: 0,
    extractedText: "Synthetic supporting row", normalizedText: "synthetic supporting row",
    sourceRole: "fee_row", confidence: "high", extractionObservations: [], parserInterpretations: [],
    customerSafe: { excerpt: null, redactionApplied: true },
  });
  analysis.feeLedger.sourceOccurrences.push({
    id: "occ_f1_synthetic_fee", evidenceRef: "ev_f1_synthetic_fee",
    documentId: analysis.identity.sourceDocumentRef, pageNumber: 1, section: "fees",
    lineId: "f1-line", rowIndex: 0, normalizedSourceText: "synthetic supporting row",
  });
  analysis.feeLedger.parserInterpretations.push({
    id: "int_f1_synthetic_fee", sourceOccurrenceId: "occ_f1_synthetic_fee",
    parserId: "f1_synthetic", parserVersion: "v1", label: "Synthetic supporting row",
    amount: null, signedAmount: null, rowRole: "supporting_evidence_only", section: "fees",
    pageNumber: 1, printedRate: null, printedPerItemRate: null, itemCount: null, volume: null,
    confidence: "high",
  });
  analysis.feeLedger.rows.push({
    id: "fee_f1_synthetic_support", role: "supporting_evidence_only",
    sourceOccurrenceIds: ["occ_f1_synthetic_fee"], parserInterpretationIds: ["int_f1_synthetic_fee"],
    selectedLabel: "Synthetic supporting row", selectedAmount: null, signedAmount: null,
    contributesToUniqueTotal: false,
    contributionDecision: {
      contributes: false, reasonCode: "supporting_evidence_only_excluded", controlRefs: [],
      evidenceRefs: ["ev_f1_synthetic_fee"], signedAmountBasis: "not_applicable",
      grossNetBasis: "not_applicable", confidence: "high", limitations: [],
    },
    mergeReason: null, mergeConfidence: "high", rejectedAmountCandidates: [], limitations: [],
  });
  return analysis;
}

function mutable(graph: F1ClaimGraph): F1ClaimGraph {
  return structuredClone(graph);
}

function draftFrom(graph: F1ClaimGraph): F1ClaimDraft {
  const source = graph.claims.find((item) => item.subject.kind === "fee_row" && item.dimension === "observation")
    ?? graph.claims.find((item) => item.value.kind === "known");
  if (!source) throw new Error("Synthetic canonical input lacks an observed claim");
  const { claimId: _claimId, ...draft } = source;
  return structuredClone(draft);
}

describe("F1 read-only claim graph", () => {
  it("mirrors the frozen vocabulary without collapsing reasoning, authority, or dimension", async () => {
    const register: NormalizedAuthorityRegister = JSON.parse(await fs.readFile(path.resolve("test/fixtures/gold-contract/gold-authority-derivability-v1.json"), "utf8"));
    expect(claimDimensions).toEqual(register.normativeRules.independentClaimDimensions);
    expect(reasoningClasses).toEqual(frozenReasoningClasses);
    expect(authorityLanes).toEqual(frozenAuthorityLanes);
    expect(universalityScopes).toEqual(frozenUniversalityScopes);
  });

  it("uses stable, frozen references and never copies canonical money into a claim", () => {
    const analysis = canonical();
    const before = JSON.stringify(analysis);
    const first = buildF1ClaimGraphFromCanonical(analysis);
    const replay = buildF1ClaimGraphFromCanonical(analysis);
    expect(first).toEqual(replay);
    expect(JSON.stringify(first)).toBe(JSON.stringify(replay));
    expect(first.graphId).toBe(replay.graphId);
    expect(first.canonicalInputDigest).toBe(replay.canonicalInputDigest);
    const revisedCanonical = structuredClone(analysis);
    revisedCanonical.versionManifest.canonicalBuilderVersion = `${revisedCanonical.versionManifest.canonicalBuilderVersion}_replayed_revision`;
    const revised = buildF1ClaimGraphFromCanonical(revisedCanonical);
    expect(revised.graphId).not.toBe(first.graphId);
    expect(revised.claims.map((item) => item.claimId)).toEqual(first.claims.map((item) => item.claimId));
    const downstreamChanged = structuredClone(analysis);
    downstreamChanged.customerState.limitations.push("synthetic_downstream_variant");
    downstreamChanged.opportunityEngine.limitations.push("synthetic_downstream_variant");
    downstreamChanged.createdAt = "2027-01-01T00:00:00.000Z";
    expect(buildF1ClaimGraphFromCanonical(downstreamChanged).graphId).toBe(first.graphId);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.claims)).toBe(true);
    expect(Object.isFrozen(first.claims[0]?.value)).toBe(true);
    const sharedPeriod = { start: "2026-01-01", end: "2026-01-31" };
    const detachedDraft = { ...draftFrom(first), candidateKey: "detached_input", temporal: sharedPeriod };
    const detachedGraph = createF1ClaimGraph(analysis, [detachedDraft]);
    expect(Object.isFrozen(sharedPeriod)).toBe(false);
    sharedPeriod.end = "2026-02-28";
    expect(detachedGraph.claims[0].temporal?.end).toBe("2026-01-31");
    expect(JSON.stringify(analysis)).toBe(before);
    expect(JSON.stringify(first)).not.toMatch(/"amountMinor"|"selectedAmount"|"uniqueChargeTotal"|"extractedText"/);
    const selectedSales = first.claims.find((item) => item.subject.kind === "fact" && item.subject.path === "financialFacts.processedSales");
    expect(selectedSales).toMatchObject({
      dimension: "observation",
      value: { kind: "known", representation: "canonical_reference", ref: { kind: "fact", path: "financialFacts.processedSales" } },
      authority: { assessment: "not_evaluated", satisfiedLanes: [] },
    });
    expect(first.claims.every((item) => item.authority.assessment === "not_evaluated" && item.authority.satisfiedLanes.length === 0)).toBe(true);
    validateF1ClaimGraph(first, analysis);
  });

  it("keeps mechanical fee-row records known while six owner dimensions and actionability stay unknown", () => {
    const analysis = canonical();
    const graph = buildF1ClaimGraphFromCanonical(analysis);
    expect(analysis.feeLedger.rows.length).toBeGreaterThan(0);
    const feeRowId = analysis.feeLedger.rows[0].id;
    const claims = graph.claims.filter((item) => item.subject.kind === "fee_row" && item.subject.id === feeRowId);
    expect(claims.find((item) => item.dimension === "observation")?.value.kind).toBe("known");
    for (const dimension of ["biller_statement_issuer", "collector", "economic_beneficiary", "contractual_controller", "merchant_facing_price_controller", "retained_margin_recipient", "actionability"]) {
      expect(claims.find((item) => item.dimension === dimension)?.value, dimension).toEqual({ kind: "unknown", reasonCode: "not_adjudicated_f1" });
    }
    expect(claims.find((item) => item.dimension === "actionability")?.policyDependency).toMatchObject({ ruleId: "customer_action_guidance_policy" });
    expect(claims.find((item) => item.dimension === "economic_beneficiary")?.reasoning.primaryClass).toBeNull();
    expect(claims.find((item) => item.dimension === "observation")?.reasoning.primaryClass).toBe("direct_observation");
    expect(graph.claims.some((item) => item.dimension === "calculation" && item.reasoning.primaryClass === "deterministic_calculation")).toBe(true);
  });

  it("preserves canonical not-applicable separately from unknown", () => {
    const analysis = canonical();
    const count = analysis.financialFacts.transactionCounts.unknownCounts;
    count.status = "not_applicable";
    count.value = null;
    count.selectedCandidateId = null;
    const graph = buildF1ClaimGraphFromCanonical(analysis);
    const claim = graph.claims.find((item) => item.subject.kind === "fact" && item.subject.path === "financialFacts.transactionCounts.unknownCounts");
    expect(claim?.value).toEqual({ kind: "not_applicable", reasonCode: "canonical_not_applicable" });
    expect(claim?.resolution.status).toBe("not_applicable");
    expect(graph.claims.some((item) => item.value.kind === "unknown")).toBe(true);
  });

  it("represents all seven provenance classes independently of resolution or confidence", () => {
    const analysis = canonical();
    const seed = draftFrom(buildF1ClaimGraphFromCanonical(analysis));
    const laneByClass = {
      direct_observation: "statement_source_document",
      deterministic_calculation: "deterministic_arithmetic",
      template_structural_inference: "versioned_template_mapping",
      economic_structural_inference: "statement_structural_evidence",
      governed_public_dependency: "governed_public_mixed",
      merchant_private_dependency: "merchant_private_contract_or_correspondence",
      product_policy_judgment: "reviewed_product_policy",
    } as const;
    const drafts: F1ClaimDraft[] = reasoningClasses.map((reasoningClass) => ({
      ...seed, candidateKey: `reasoning:${reasoningClass}`, semanticCode: `candidate_${reasoningClass}`,
      value: { kind: "known", representation: "semantic_code", code: "synthetic_candidate" },
      reasoning: { primaryClass: reasoningClass, supportingClasses: [reasoningClass], ruleId: "synthetic_provenance_fixture", ruleVersion: "f1_v1" },
      authority: { requiredLanes: [laneByClass[reasoningClass]], satisfiedLanes: [], assessment: "not_evaluated" },
      resolution: { status: "candidate_only", reasonCode: "synthetic_candidate", blockedDimensions: [] },
    }));
    drafts.push({
      ...seed, candidateKey: "reasoning:unresolved_observation", semanticCode: "unresolved_observation",
      value: { kind: "unknown", reasonCode: "missing_source_authority" },
      reasoning: { primaryClass: "direct_observation", supportingClasses: ["direct_observation"], ruleId: "synthetic_provenance_fixture", ruleVersion: "f1_v1" },
      resolution: { status: "unresolved", reasonCode: "missing_source_authority", blockedDimensions: [] },
    });
    const graph = createF1ClaimGraph(analysis, drafts);
    expect(new Set(graph.claims.map((item) => item.reasoning.primaryClass))).toEqual(new Set(reasoningClasses));
    expect(graph.claims.filter((item) => item.reasoning.primaryClass === "direct_observation").map((item) => item.resolution.status).sort()).toEqual(["candidate_only", "unresolved"]);
    expect(JSON.stringify(graph)).not.toMatch(/confidence|"satisfiedLanes":\[[^\]]+\]/);
  });

  it("preserves contradictions without selecting a winner or introducing dependency cycles", () => {
    const analysis = canonical();
    const seed = draftFrom(buildF1ClaimGraphFromCanonical(analysis));
    const a: F1ClaimDraft = { ...seed, candidateKey: "conflict:a", semanticCode: "synthetic_candidate_a", value: { kind: "known", representation: "semantic_code", code: "candidate_a" }, resolution: { status: "candidate_only", reasonCode: "synthetic_candidate", blockedDimensions: [] } };
    const b: F1ClaimDraft = { ...seed, candidateKey: "conflict:b", semanticCode: "synthetic_candidate_b", value: { kind: "known", representation: "semantic_code", code: "candidate_b" }, resolution: { status: "candidate_only", reasonCode: "synthetic_candidate", blockedDimensions: [] } };
    const graph = createF1ClaimGraph(analysis, [b, a], [{ kind: "contradicts", fromCandidateKey: "conflict:b", toCandidateKey: "conflict:a" }], [{ candidateKeys: ["conflict:b", "conflict:a"], sourceRelationshipRef: null }]);
    const replay = createF1ClaimGraph(analysis, [a, b], [{ kind: "contradicts", fromCandidateKey: "conflict:a", toCandidateKey: "conflict:b" }], [{ candidateKeys: ["conflict:a", "conflict:b"], sourceRelationshipRef: null }]);
    expect(graph.graphId).toBe(replay.graphId);
    expect(graph.conflicts).toHaveLength(1);
    expect(graph.conflicts[0].status).toBe("unresolved");
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].kind).toBe("contradicts");
    expect(() => createF1ClaimGraph(analysis, [a, b], [
      { kind: "depends_on", fromCandidateKey: "conflict:a", toCandidateKey: "conflict:b" },
      { kind: "depends_on", fromCandidateKey: "conflict:b", toCandidateKey: "conflict:a" },
    ])).toThrow(/dependency cycle/);
  });

  it("projects a canonical cross-summary amount conflict as unresolved diagnostic evidence", () => {
    const analysis = canonical();
    const period = { start: "2026-01-01", end: "2026-01-31" };
    const nodeBase = {
      summaryRef: "synthetic_summary", sourceKind: "printed_fee_control" as const,
      printedLabel: "Synthetic diagnostic total", measure: "fee_amount" as const,
      grain: "fee_section_total" as const, period,
      sourceDocumentRef: analysis.identity.sourceDocumentRef,
      identifierBasis: ["source_document_ref" as const], evidenceRefs: ["ev_f1_synthetic_fee"],
    };
    analysis.crossSummaryLinkEvidence.nodes.push(
      { ...nodeBase, id: "summary_f1_a", amount: { amountMinor: 1000, currency: "USD" } },
      { ...nodeBase, id: "summary_f1_b", amount: { amountMinor: 1200, currency: "USD" } },
    );
    analysis.crossSummaryLinkEvidence.relationships.push({
      id: "relation_f1_conflict", leftSummaryId: "summary_f1_a", rightSummaryId: "summary_f1_b",
      evaluatedCandidateType: "same_measure_same_population", relationshipType: "unknown", status: "unknown",
      comparison: {
        measure: "compatible", period: "same_statement_period", grain: "compatible",
        identifiers: "matched", explicitLinkEvidence: "absent", amount: "conflicts",
      },
      evidenceRefs: ["ev_f1_synthetic_fee"], countingTreatment: "reference_only_no_addition",
      reasonCodes: ["synthetic_conflict"], limitations: [],
      adjudication: {
        policyVersion: "cross_summary_reconciliation_adjudication_v1", outcome: "remain_unknown",
        relationshipClass: "unresolved_amount_conflict", reusableRuleId: null,
      },
    });
    const graph = buildF1ClaimGraphFromCanonical(analysis);
    expect(graph.conflicts).toHaveLength(1);
    expect(graph.conflicts[0]).toMatchObject({ status: "unresolved", sourceRelationshipRef: { kind: "cross_summary_relationship", id: "relation_f1_conflict" } });
    expect(graph.edges.filter((edge) => edge.kind === "contradicts")).toHaveLength(1);
    expect(JSON.stringify(graph)).not.toMatch(/"amountMinor"/);
    validateF1ClaimGraph(graph, analysis);
  });

  it("fails closed on unknown dimensions, enums, references, money copies, and authority promotion", () => {
    const analysis = canonical();
    const graph = buildF1ClaimGraphFromCanonical(analysis);
    const invalidDimension = mutable(graph);
    invalidDimension.claims[0].dimension = "unknown_dimension" as typeof invalidDimension.claims[0]["dimension"];
    expect(() => validateF1ClaimGraph(invalidDimension, analysis)).toThrow(/unknown dimension/);
    const invalidReasoning = mutable(graph);
    invalidReasoning.claims[0].reasoning.primaryClass = "confidence_score" as typeof invalidReasoning.claims[0]["reasoning"]["primaryClass"];
    expect(() => validateF1ClaimGraph(invalidReasoning, analysis)).toThrow(/unknown reasoning class/);
    const invalidRef = mutable(graph);
    invalidRef.claims[0].subject = { kind: "fee_row", id: "missing" };
    expect(() => validateF1ClaimGraph(invalidRef, analysis)).toThrow(/unstable|missing or duplicate/);
    const copiedMoney = mutable(graph);
    const known = copiedMoney.claims.find((item) => item.value.kind === "known");
    if (!known) throw new Error("No known claim in synthetic input");
    known.value = { ...known.value, amountMinor: 100 } as typeof known.value;
    expect(() => validateF1ClaimGraph(copiedMoney, analysis)).toThrow(/unrecognized field/);
    const promoted = mutable(graph);
    promoted.claims[0].authority.satisfiedLanes = ["governed_public_mixed"];
    expect(() => validateF1ClaimGraph(promoted, analysis)).toThrow(/cannot grant authority/);
    const unknownLane = mutable(graph);
    unknownLane.claims[0].authority.requiredLanes = ["ai_confidence" as typeof unknownLane.claims[0]["authority"]["requiredLanes"][number]];
    expect(() => validateF1ClaimGraph(unknownLane, analysis)).toThrow(/unknown authority lane/);
    const unselected = mutable(graph);
    const unavailableFact = unselected.claims.find((item) => item.subject.kind === "fact" && item.value.kind === "unknown");
    if (!unavailableFact) throw new Error("No unavailable synthetic canonical fact");
    unavailableFact.value = { kind: "known", representation: "canonical_reference", ref: unavailableFact.subject };
    unavailableFact.resolution.status = "represented_observation";
    expect(() => validateF1ClaimGraph(unselected, analysis)).toThrow(/unselected fact presented as known/);
    const omittedEvidence = mutable(graph);
    const evidencedFact = omittedEvidence.claims.find((item) => item.subject.kind === "fact" && item.value.kind === "known" && item.evidenceRefs.length > 0);
    if (!evidencedFact) throw new Error("No evidenced selected synthetic fact");
    evidencedFact.evidenceRefs = [];
    expect(() => validateF1ClaimGraph(omittedEvidence, analysis)).toThrow(/selected fact evidence was omitted/);
    const brokenCalculation = mutable(graph);
    brokenCalculation.claims[0].calculationRefs = ["missing_calculation"];
    expect(() => validateF1ClaimGraph(brokenCalculation, analysis)).toThrow(/broken calculation reference/);
    const invalidPeriod = mutable(graph);
    invalidPeriod.claims[0].temporal = { start: "2026-02-01", end: "2026-01-01" };
    expect(() => validateF1ClaimGraph(invalidPeriod, analysis)).toThrow(/unstable|invalid temporal interval/);
    const driftedCanonical = structuredClone(analysis);
    driftedCanonical.analysisId = "another_analysis";
    expect(() => validateF1ClaimGraph(graph, driftedCanonical)).toThrow(/canonical identity drift/);
    const damaged = structuredClone(analysis);
    damaged.canonicalSchemaVersion = "bad_version" as typeof damaged.canonicalSchemaVersion;
    expect(buildF1ShadowGraph(damaged)).toMatchObject({ status: "unavailable", graph: null, diagnostic: { failureCode: "invalid_canonical_or_graph" } });
  });

  it("can represent synthetic and Product-policy cases without granting their authority", async () => {
    const analysis = canonical();
    const seed = draftFrom(buildF1ClaimGraphFromCanonical(analysis));
    const synthetic: F1ClaimDraft = {
      ...seed, candidateKey: "f0:s1:underlying", dimension: "pricing_architecture",
      semanticCode: "synthetic_pricing_architecture", value: { kind: "known", representation: "semantic_code", code: "bundled_into_merchant_price" },
      resolution: { status: "candidate_only", reasonCode: "synthetic_candidate", blockedDimensions: [] },
      reasoning: { primaryClass: "economic_structural_inference", supportingClasses: ["economic_structural_inference"], ruleId: "synthetic_fixture_projection", ruleVersion: "f1_v1" },
      authority: { requiredLanes: ["synthetic_falsification_input"], satisfiedLanes: [], assessment: "not_evaluated" },
    };
    const policy: F1ClaimDraft = {
      ...seed, candidateKey: "f0:s1:no_tier", dimension: "product_policy",
      semanticCode: "synthetic_no_tier_inference", value: { kind: "unknown", reasonCode: "prohibited_positive_claim" },
      reasoning: { primaryClass: "product_policy_judgment", supportingClasses: ["product_policy_judgment"], ruleId: "synthetic_policy_fixture", ruleVersion: "f1_v1" },
      authority: { requiredLanes: ["reviewed_product_policy"], satisfiedLanes: [], assessment: "not_evaluated" },
      resolution: { status: "refused", reasonCode: "prohibited_positive_claim", blockedDimensions: [] },
      universality: "product_policy_only", policyDependency: { ruleId: "synthetic_policy_fixture", ruleVersion: "f1_v1" },
    };
    const graph = createF1ClaimGraph(analysis, [synthetic, policy]);
    expect(graph.claims.map((item) => item.reasoning.primaryClass).sort()).toEqual(["economic_structural_inference", "product_policy_judgment"]);
    expect(graph.claims.every((item) => item.authority.satisfiedLanes.length === 0)).toBe(true);
    const representedS1 = graph.claims.find((item) => item.candidateKey === "f0:s1:underlying");
    const representedPolicy = graph.claims.find((item) => item.candidateKey === "f0:s1:no_tier");
    expect(representedS1).toMatchObject({ value: { kind: "known", representation: "semantic_code", code: "bundled_into_merchant_price" }, resolution: { status: "candidate_only" } });
    expect(representedPolicy).toMatchObject({ value: { kind: "unknown", reasonCode: "prohibited_positive_claim" }, resolution: { status: "refused" }, policyDependency: { ruleId: "synthetic_policy_fixture" } });
    const register: NormalizedAuthorityRegister = JSON.parse(await fs.readFile(path.resolve("test/fixtures/gold-contract/gold-authority-derivability-v1.json"), "utf8"));
    for (const id of ["S1-UNDERLYING", "S1-NO-TIER"]) {
      const gold = register.assertions.find((item) => item.assertionId === id);
      const independentCandidate = f0ExecutableCandidates.find((item) => item.assertionId === id);
      if (!gold || !independentCandidate) throw new Error(`Missing F0 case ${id}`);
      if (id === "S1-UNDERLYING") {
        expect(representedS1?.reasoning.primaryClass).toBe(independentCandidate.reasoningClass);
        expect(representedS1?.authority.requiredLanes).toEqual(independentCandidate.authorityLanes);
        expect(representedS1?.value).toMatchObject({ code: independentCandidate.observed });
      }
      expect(evaluateF0Assertion(gold, independentCandidate).outcome).toBe(id === "S1-UNDERLYING" ? "correct_answer" : "correct_refusal");
    }
  });

  it("reports legacy semantic coverage differences without changing selected outputs", () => {
    const analysis = canonical();
    const feeRowId = analysis.feeLedger.rows[0].id;
    analysis.feeOwnershipActionability.rowClassifications.push({
      feeRowId, selected: {
        candidateId: "synthetic_legacy_selection", category: "processor_markup",
        ownership: { collector: "processor", economicBeneficiary: "processor", contractualController: "processor" },
        actionabilityCeiling: "potentially_actionable", documentationRequirement: "required_for_authority",
        confidence: "high", selectionReason: "synthetic comparison only", rejectedCandidateIds: [],
      },
      candidates: [], conflictStatus: "none", conflictReason: null,
    });
    const before = JSON.stringify(analysis);
    const result = buildF1ShadowGraph(analysis);
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("F1 fixture unexpectedly unavailable");
    expect(result.diagnostic.legacyComparison).toEqual({
      selectedOwnershipRowsNotAdjudicatedByF1: 1,
      selectedPotentiallyActionableRowsNotAdjudicatedByF1: 1,
    });
    expect(JSON.stringify(result.diagnostic)).not.toMatch(/Synthetic supporting row|fee_f1_synthetic_support|ev_f1_synthetic_fee/);
    expect(result.graph.claims.find((item) => item.subject.kind === "fee_row" && item.subject.id === feeRowId && item.dimension === "economic_beneficiary")?.value.kind).toBe("unknown");
    expect(JSON.stringify(analysis)).toBe(before);
  });

  it("keeps canonical analysis and Report V1 unchanged, including when sidecar construction fails", () => {
    const document = syntheticStatement();
    const summary = analyzeDocument(document, "restaurant_food_beverage");
    const beforeReport = buildSingleStatementReportV1({ analysis: summary, reportId: "f1_invariance", generatedAt: "2026-09-19T00:00:00.000Z" });
    const beforeSummary = JSON.stringify(summary);
    const analysis = canonical();
    const beforeCanonical = JSON.stringify(analysis);
    const result = buildF1ShadowGraph(analysis);
    expect(result.status).toBe("available");
    expect(JSON.stringify(analysis)).toBe(beforeCanonical);
    expect(JSON.stringify(summary)).toBe(beforeSummary);
    expect(buildSingleStatementReportV1({ analysis: summary, reportId: "f1_invariance", generatedAt: "2026-09-19T00:00:00.000Z" })).toEqual(beforeReport);
    const broken = structuredClone(analysis);
    broken.feeLedger.rows[0].sourceOccurrenceIds.push("missing_occurrence");
    expect(buildF1ShadowGraph(broken).status).toBe("unavailable");
    expect(JSON.stringify(analysis)).toBe(beforeCanonical);
    expect(buildSingleStatementReportV1({ analysis: summary, reportId: "f1_invariance", generatedAt: "2026-09-19T00:00:00.000Z" })).toEqual(beforeReport);
  });
});
