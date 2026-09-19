import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCanonicalRuntimeAnalysis } from "../src/canonical/runtimeAdapter.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { buildF1ClaimGraphFromCanonical } from "../src/claimAuthorityF1/canonicalAdapter.js";
import { createF1ClaimGraph } from "../src/claimAuthorityF1/graph.js";
import { claimDimensions, type AuthorityLane, type ClaimDimension, type F1Claim, type F1ClaimDraft, type ReasoningClass } from "../src/claimAuthorityF1/types.js";
import { evaluateF2, f2DimensionRules, f2FrozenDenominatorEvidence, f2FrozenGateEvidence, f2SubjectKey, tryEvaluateF2 } from "../src/claimAuthorityF2/evaluator.js";
import { processorMarkupRule } from "../src/claimAuthorityF2/rules.js";
import { completenessGateIds, denominatorPolicyIds, type F2EvaluationInput, type F2TestAttestation } from "../src/claimAuthorityF2/types.js";
import type { ParsedDocument } from "../src/parser.js";

function canonical(): CanonicalStatementAnalysis {
  const lines = ["Merchant: F2 Synthetic Cafe", "Processor: Fiserv", "Statement Period: 01/01/2026 - 01/31/2026", "Total Amount Submitted | $1,000.00", "Fees Charged | -$30.00"];
  const document: ParsedDocument = {
    sourceType: "pdf", headers: [], rows: lines.map((content) => ({ content, page: "page-1" })), textPreview: lines.join("\n"),
    extraction: { mode: "structured", qualityScore: 1, reasons: ["F2 hand-authored test input"], lineCount: lines.length, amountTokenCount: lines.length, hasExtractableText: true },
  };
  const analysis = buildCanonicalRuntimeAnalysis({ document, businessType: "restaurant_food_beverage", runtimeDocumentRef: "f2_synthetic_statement" }).analysis;
  analysis.evidence.push({
    id: "f2_test_printed_gross_ev", documentId: analysis.identity.sourceDocumentRef, pageNumber: 1, section: "fees", lineId: "f2-control-line", rowIndex: 4,
    extractedText: "Fees Charged | -$30.00", normalizedText: "fees charged 30.00", sourceRole: "control_total", confidence: "high",
    extractionObservations: [], parserInterpretations: [], customerSafe: { excerpt: null, redactionApplied: true },
  });
  analysis.feeLedger.controls.push({
    id: "f2_test_printed_gross_control", type: "printed_subtotal", label: "Synthetic printed gross fee control", evidenceRefs: ["f2_test_printed_gross_ev"],
    expectedAmount: { amountMinor: 3000, currency: "USD" }, actualAmount: { amountMinor: 3000, currency: "USD" },
    deltaMinor: 0, toleranceMinor: 0, tolerancePolicyId: "f2_test", status: "pass", derivationGroupId: "f2_test", coveredFeeRowIds: [],
    basis: "grand_control", amountBasis: "fee_charge_gross", independence: "printed_source_control", reasonCode: "f2_test", explanation: "Hand-authored non-authoritative test control",
  });
  return analysis;
}

function draft(analysis: CanonicalStatementAnalysis, key: string, dimension: ClaimDimension, semanticCode: string, reasoning: ReasoningClass | null, value: "known" | "unknown" = "known"): F1ClaimDraft {
  const seed = buildF1ClaimGraphFromCanonical(analysis).claims.find((item) => item.value.kind === "known" && item.subject.kind === "fact");
  if (!seed) throw new Error("Missing selected synthetic canonical fact");
  return {
    candidateKey: key, subject: seed.subject, dimension, semanticCode,
    value: value === "known" ? { kind: "known", representation: "semantic_code", code: semanticCode } : { kind: "unknown", reasonCode: "not_adjudicated" },
    reasoning: { primaryClass: reasoning, supportingClasses: reasoning ? [reasoning] : [], ruleId: reasoning ? "f2_hand_authored_test" : null, ruleVersion: reasoning ? "v1" : null },
    authority: { requiredLanes: [], satisfiedLanes: [], assessment: "not_evaluated" },
    resolution: { status: value === "known" ? "candidate_only" : "unresolved", reasonCode: "hand_authored_test", blockedDimensions: [] },
    temporal: { start: "2026-01-01", end: "2026-01-31" }, universality: "merchant_account_specific",
    evidenceRefs: [], calculationRefs: [], canonicalRefs: [], policyDependency: null,
  };
}

function inputFor(analysis: CanonicalStatementAnalysis, drafts: F1ClaimDraft[]): F2EvaluationInput {
  const graph = createF1ClaimGraph(analysis, drafts);
  const subjectKey = graph.claims[0] ? f2SubjectKey(graph.claims[0]) : "empty_graph_test_subject";
  return {
    analysis, graph, attestations: [],
    gates: completenessGateIds.map((gate) => ({ gate, subjectKey, evidence: [...f2FrozenGateEvidence[gate]] })),
    denominators: denominatorPolicyIds.map((policy) => ({ policy, basis: "printed_gross_fees", printedGrossRef: { kind: "fee_control", id: "f2_test_printed_gross_control" }, separatelyAccountedFor: [...f2FrozenDenominatorEvidence[policy]] })),
    policy: [], supersessions: [], narrowingLinks: [], accountKey: "synthetic_account", requestedPositiveClaimIds: [],
  };
}
function claim(input: F2EvaluationInput, key: string): F1Claim {
  const item = input.graph.claims.find((entry) => entry.candidateKey === key);
  if (!item) throw new Error(`Missing synthetic claim ${key}`);
  return item;
}
function prove(input: F2EvaluationInput, key: string, lane: AuthorityLane, facets: string[] = [], overrides: Partial<F2TestAttestation> = {}): void {
  const item = claim(input, key);
  input.attestations.push({
    id: `test_${key}_${lane}_${input.attestations.length}`, claimId: item.claimId, lane, facets,
    effectivePeriod: { start: "2025-01-01", end: "2026-12-31" }, scope: item.universality,
    subjectKey: f2SubjectKey(item), provenance: "hand_authored_non_authoritative_test",
    privateAccountKey: lane === "merchant_private_contract_or_correspondence" ? "synthetic_account" : null,
    promotedToGlobal: false, reviewedPromotion: false, ...overrides,
  });
}
function outcome(input: F2EvaluationInput, key: string) {
  const target = claim(input, key);
  return evaluateF2(input).decisions.find((item) => item.claimId === target.claimId)!;
}

describe("F2 dimension authority evaluator (shadow-only, hand-authored fixtures)", () => {
  it("matches the frozen dimensions, seven gates, denominator policies, and strong-claim facets", async () => {
    const register = JSON.parse(await fs.readFile(path.resolve("test/fixtures/gold-contract/gold-authority-derivability-v1.json"), "utf8"));
    expect(Object.keys(f2DimensionRules)).toEqual([...claimDimensions]);
    expect(completenessGateIds).toEqual(register.normativeRules.completenessGates.map((item: { id: string }) => item.id));
    for (const item of register.normativeRules.completenessGates) expect(f2FrozenGateEvidence[item.id as keyof typeof f2FrozenGateEvidence]).toEqual(item.requiredEvidence);
    expect(denominatorPolicyIds).toEqual(register.normativeRules.denominatorPolicies.map((item: { id: string }) => item.id));
    for (const item of register.normativeRules.denominatorPolicies) expect(f2FrozenDenominatorEvidence[item.id as keyof typeof f2FrozenDenominatorEvidence]).toEqual(item.separatelyAccountFor);
    expect(processorMarkupRule.requiredFacets).toEqual(register.normativeRules.strongClaimGates.find((item: { id: string }) => item.id === "processor_markup").requiredEvidence);
  });

  it("keeps six ownership/control dimensions independent and explicit unknown valid", () => {
    const analysis = canonical();
    const ownerDims: ClaimDimension[] = ["biller_statement_issuer", "collector", "economic_beneficiary", "contractual_controller", "merchant_facing_price_controller", "retained_margin_recipient"];
    const drafts = ownerDims.map((dimension) => draft(analysis, dimension, dimension, dimension, dimension === "biller_statement_issuer" || dimension === "collector" ? "direct_observation" : "merchant_private_dependency", dimension === "retained_margin_recipient" ? "unknown" : "known"));
    const input = inputFor(analysis, drafts);
    prove(input, "biller_statement_issuer", "statement_source_document", ["explicit_biller_or_issuer"]);
    prove(input, "collector", "statement_source_document", ["explicit_collector"]);
    expect(outcome(input, "biller_statement_issuer").status).toBe("supported");
    expect(outcome(input, "collector").status).toBe("supported");
    expect(outcome(input, "economic_beneficiary").status).toBe("missing_authority");
    expect(outcome(input, "contractual_controller").status).toBe("missing_authority");
    expect(outcome(input, "merchant_facing_price_controller").status).toBe("missing_authority");
    expect(outcome(input, "retained_margin_recipient")).toMatchObject({ status: "unresolved", admittedValue: "unknown" });
    prove(input, "economic_beneficiary", "statement_structural_evidence", ["dimension_specific_beneficiary"]);
    expect(outcome(input, "economic_beneficiary").hardFailures).toContain("evidence_lane_leakage");
    expect(outcome(input, "collector").status).toBe("supported");
  });

  it("preserves a broad component while refusing markup and retained profit without their own proof", () => {
    const analysis = canonical();
    const input = inputFor(analysis, [
      draft(analysis, "broad", "economic_broad_category", "merchant_pricing_component", "economic_structural_inference"),
      draft(analysis, "markup", "economic_broad_category", "processor_markup", "economic_structural_inference"),
      draft(analysis, "profit", "retained_margin_recipient", "processor_profit_candidate", "merchant_private_dependency"),
    ]);
    prove(input, "broad", "statement_source_document");
    prove(input, "broad", "statement_structural_evidence");
    prove(input, "markup", "statement_source_document", ["observed_merchant_facing_component"]);
    prove(input, "markup", "statement_structural_evidence", ["percent_discount_qual_nqual_disc_per_item"]);
    expect(outcome(input, "broad").status).toBe("supported");
    expect(outcome(input, "markup")).toMatchObject({ status: "refused", evaluationOutcome: "correct_refusal", admittedValue: "unknown" });
    expect(outcome(input, "profit").status).toBe("missing_authority");
    prove(input, "markup", "statement_source_document", ["compatible_underlying_cost_or_merchant_private_processor_control"]);
    prove(input, "markup", "merchant_private_contract_or_correspondence");
    expect(outcome(input, "markup").status).toBe("refused");
    prove(input, "markup", "merchant_private_contract_or_correspondence", ["compatible_underlying_cost_or_merchant_private_processor_control"]);
    expect(outcome(input, "markup").status).toBe("supported");
    expect(outcome(input, "profit").status).toBe("missing_authority");
  });

  it("expresses partial support only through an explicit same-subject narrower link", () => {
    const analysis = canonical();
    const input = inputFor(analysis, [
      draft(analysis, "narrow", "economic_broad_category", "merchant_pricing_component", "economic_structural_inference"),
      draft(analysis, "strong", "economic_broad_category", "processor_markup", "economic_structural_inference"),
    ]);
    prove(input, "narrow", "statement_source_document");
    prove(input, "narrow", "statement_structural_evidence");
    expect(outcome(input, "strong").status).toBe("refused");
    input.narrowingLinks.push({ strongClaimId: claim(input, "strong").claimId, narrowerClaimId: claim(input, "narrow").claimId });
    expect(outcome(input, "strong")).toMatchObject({ status: "partially_supported", evaluationOutcome: "correct_refusal", admittedValue: "unknown", narrowerSupportedClaimIds: [claim(input, "narrow").claimId] });
    expect(outcome(input, "narrow").status).toBe("supported");
  });

  it("supports narrow reference equality without contractual pass-through or retired at-cost meaning", () => {
    const analysis = canonical();
    const input = inputFor(analysis, [
      draft(analysis, "rate", "reference_comparison", "observed_rate_matches_admitted_reference", "governed_public_dependency"),
      draft(analysis, "contract", "contractual_pass_through", "contractual_pass_through_verified", "merchant_private_dependency"),
      draft(analysis, "atcost", "reference_comparison", "proven_at_cost", "governed_public_dependency"),
    ]);
    prove(input, "rate", "statement_source_document", ["observed_rate", "observed_basis"]);
    prove(input, "rate", "deterministic_arithmetic", ["approved_tolerance"]);
    prove(input, "rate", "governed_network_regulator", ["admitted_reference", "publisher", "effective_period", "scope_and_population"]);
    expect(outcome(input, "rate").status).toBe("supported");
    expect(outcome(input, "contract").status).toBe("refused");
    expect(outcome(input, "atcost").status).toBe("refused");
    prove(input, "contract", "merchant_private_contract_or_correspondence", ["merchant_private_contractual_terms", "separately_billed_spread_analysis", "processor_retention_evidence"]);
    expect(outcome(input, "contract").status).toBe("supported");
    expect(outcome(input, "atcost").status).toBe("refused");
  });

  it("fails closed on historical back-projection and distinguishes it from lane leakage", () => {
    const analysis = canonical();
    const input = inputFor(analysis, [draft(analysis, "historical", "reference_comparison", "observed_rate_matches_admitted_reference", "governed_public_dependency")]);
    prove(input, "historical", "statement_source_document", ["observed_rate", "observed_basis"]);
    prove(input, "historical", "deterministic_arithmetic", ["approved_tolerance"]);
    prove(input, "historical", "governed_network_regulator", ["admitted_reference", "publisher", "effective_period", "scope_and_population"], { effectivePeriod: { start: "2026-06-01", end: "2027-12-31" } });
    expect(outcome(input, "historical").status).toBe("refused");
    expect(outcome(input, "historical").hardFailures).toEqual(["historical_back_projection"]);
    input.attestations[input.attestations.length - 1].effectivePeriod = { start: "2025-01-01", end: "2026-12-31" };
    expect(outcome(input, "historical").status).toBe("supported");
    input.attestations[input.attestations.length - 1].scope = "network_specific";
    expect(outcome(input, "historical").status).toBe("missing_authority");
  });

  it("keeps seven gates independent and demands printed gross denominator controls", () => {
    const analysis = canonical();
    const input = inputFor(analysis, [
      draft(analysis, "observed", "observation", "observed_fee_label", "direct_observation"),
      draft(analysis, "pricing", "pricing_architecture", "pricing_shape", "economic_structural_inference"),
    ]);
    prove(input, "observed", "statement_source_document");
    prove(input, "pricing", "statement_source_document");
    prove(input, "pricing", "statement_structural_evidence");
    input.gates.find((item) => item.gate === "pricing_architecture")!.evidence = [];
    expect(outcome(input, "observed").status).toBe("supported");
    expect(outcome(input, "pricing").status).toBe("incomplete_document");
    expect(evaluateF2(input).gateDecisions).toHaveLength(7);
    input.gates.find((item) => item.gate === "pricing_architecture")!.evidence = [...f2FrozenGateEvidence.pricing_architecture];
    input.denominators.find((item) => item.policy === "merchant_facing_completeness")!.basis = "signed_canonical_total";
    expect(outcome(input, "pricing").status).toBe("incomplete_document");
    expect(evaluateF2(input).denominatorDecisions.find((item) => item.policy === "merchant_facing_completeness")?.missingEvidence).toContain("independent_printed_gross_fee_control");
    input.denominators.find((item) => item.policy === "merchant_facing_completeness")!.basis = "printed_gross_fees";
    expect(outcome(input, "pricing").status).toBe("supported");
    analysis.feeLedger.controls.find((item) => item.id === "f2_test_printed_gross_control")!.evidenceRefs = [];
    input.graph = createF1ClaimGraph(analysis, [
      draft(analysis, "observed", "observation", "observed_fee_label", "direct_observation"),
      draft(analysis, "pricing", "pricing_architecture", "pricing_shape", "economic_structural_inference"),
    ]);
    input.attestations = [];
    prove(input, "pricing", "statement_source_document");
    prove(input, "pricing", "statement_structural_evidence");
    expect(outcome(input, "pricing").status).toBe("incomplete_document");
  });

  it("does not borrow an eligible page gate from another canonical subject", () => {
    const analysis = canonical();
    const first = draft(analysis, "first", "observation", "observed_first", "direct_observation");
    const second = draft(analysis, "second", "observation", "observed_second", "direct_observation");
    const alternate = buildF1ClaimGraphFromCanonical(analysis).claims.find((item) => item.subject.kind === "fact" && JSON.stringify(item.subject) !== JSON.stringify(first.subject));
    if (!alternate) throw new Error("Missing second canonical subject");
    second.subject = alternate.subject;
    const input = inputFor(analysis, [first, second]);
    input.gates = input.gates.map((gate) => ({ ...gate, subjectKey: f2SubjectKey(claim(input, "first")) }));
    prove(input, "first", "statement_source_document");
    prove(input, "second", "statement_source_document");
    expect(outcome(input, "first").status).toBe("supported");
    expect(outcome(input, "second").status).toBe("incomplete_document");
  });

  it("separates reviewed Product policy from economic truth and blocks use without rewriting the claim", () => {
    const analysis = canonical();
    const input = inputFor(analysis, [draft(analysis, "policy", "product_policy", "reportability_permission", "product_policy_judgment")]);
    prove(input, "policy", "reviewed_product_policy", ["reviewed_rule"]);
    expect(outcome(input, "policy").status).toBe("refused");
    const policyClaim = claim(input, "policy");
    input.policy.push({ claimId: policyClaim.claimId, ruleId: "visibility_policy", ruleVersion: "v1", decision: "block", facet: "reportability", attestationId: input.attestations[0].id });
    expect(outcome(input, "policy")).toMatchObject({ status: "policy_blocked", policyDecision: "blocked", admittedValue: "unknown" });
    input.policy[0].decision = "permit";
    expect(outcome(input, "policy")).toMatchObject({ status: "supported", policyDecision: "permitted" });
  });

  it("uses policy as a separate permission, not an economic authority lane", () => {
    const analysis = canonical();
    const candidate = draft(analysis, "economic", "economic_broad_category", "merchant_pricing_component", "economic_structural_inference");
    candidate.policyDependency = { ruleId: "visibility_policy", ruleVersion: "v1" };
    const input = inputFor(analysis, [candidate]);
    prove(input, "economic", "statement_source_document");
    prove(input, "economic", "statement_structural_evidence");
    expect(outcome(input, "economic").status).toBe("refused");
    prove(input, "economic", "reviewed_product_policy", ["reviewed_rule"]);
    input.policy.push({ claimId: claim(input, "economic").claimId, ruleId: "visibility_policy", ruleVersion: "v1", decision: "permit", facet: "visibility", attestationId: input.attestations[2].id });
    const admitted = outcome(input, "economic");
    expect(admitted.status).toBe("supported");
    expect(admitted.satisfiedLanes).toEqual(["statement_source_document", "statement_structural_evidence"]);
    expect(admitted.policyAttestationId).toBe(input.attestations[2].id);
    expect(admitted.hardFailures).toEqual([]);
    input.policy[0].ruleVersion = "wrong_version";
    expect(outcome(input, "economic").status).toBe("refused");
  });

  it("does not borrow a different private account or let a public document prove merchant control", () => {
    const analysis = canonical();
    const input = inputFor(analysis, [draft(analysis, "controller", "contractual_controller", "contractual_controller", "merchant_private_dependency")]);
    prove(input, "controller", "governed_processor_acquirer_publication", ["merchant_contractual_control"]);
    expect(outcome(input, "controller").hardFailures).toContain("evidence_lane_leakage");
    input.attestations = [];
    prove(input, "controller", "merchant_private_contract_or_correspondence", ["merchant_contractual_control"], { privateAccountKey: "another_account" });
    expect(outcome(input, "controller").status).toBe("missing_authority");
    input.attestations[0].privateAccountKey = "synthetic_account";
    expect(outcome(input, "controller").status).toBe("supported");
  });

  it("does not infer annualized savings from observed period cost or one unlabeled occurrence", () => {
    const analysis = canonical();
    const input = inputFor(analysis, [
      draft(analysis, "observed", "observation", "observed_statement_period_cost", "direct_observation"),
      draft(analysis, "annual", "annualized_amount", "annualized_amount", "deterministic_calculation"),
      draft(analysis, "savings", "savings", "annual_savings", "deterministic_calculation"),
    ]);
    prove(input, "observed", "statement_source_document");
    prove(input, "annual", "statement_source_document", ["observed_statement_period_amount"]);
    prove(input, "annual", "deterministic_arithmetic");
    expect(outcome(input, "observed").status).toBe("supported");
    expect(outcome(input, "annual").status).toBe("refused");
    expect(outcome(input, "savings").status).toBe("refused");
  });

  it("blocks an otherwise complete savings fixture when composition or total coverage is missing", () => {
    const analysis = canonical();
    const input = inputFor(analysis, [draft(analysis, "savings", "savings", "named_savings_fixture", "deterministic_calculation")]);
    prove(input, "savings", "merchant_private_contract_or_correspondence", [...f2DimensionRules.savings.requiredFacets]);
    prove(input, "savings", "deterministic_arithmetic");
    prove(input, "savings", "reviewed_product_policy", ["reviewed_rule"]);
    input.policy.push({ claimId: claim(input, "savings").claimId, ruleId: "savings_visibility", ruleVersion: "v1", decision: "permit", facet: "visibility", attestationId: input.attestations[2].id });
    expect(outcome(input, "savings").status).toBe("supported");
    input.gates.find((item) => item.gate === "fee_composition")!.evidence = [];
    expect(outcome(input, "savings")).toMatchObject({ status: "incomplete_document", blockedGates: ["fee_composition"] });
    input.gates.find((item) => item.gate === "fee_composition")!.evidence = [...f2FrozenGateEvidence.fee_composition];
    input.gates.find((item) => item.gate === "statement_total")!.evidence = [];
    expect(outcome(input, "savings")).toMatchObject({ status: "incomplete_document", blockedGates: ["statement_total"] });
  });

  it("preserves conflict until reviewed supersession; source order never selects a winner", () => {
    const analysis = canonical();
    const a = draft(analysis, "a", "collector", "collector_a", "direct_observation");
    const b = draft(analysis, "b", "collector", "collector_b", "direct_observation");
    const input = inputFor(analysis, [a, b]);
    input.graph = createF1ClaimGraph(analysis, [a, b], [{ kind: "contradicts", fromCandidateKey: "a", toCandidateKey: "b" }], [{ candidateKeys: ["a", "b"], sourceRelationshipRef: null }]);
    prove(input, "a", "statement_source_document", ["explicit_collector"]);
    prove(input, "b", "statement_source_document", ["explicit_collector"]);
    expect(outcome(input, "a").status).toBe("conflict");
    expect(outcome(input, "b").status).toBe("conflict");
    input.attestations.reverse();
    expect(outcome(input, "a").status).toBe("conflict");
    input.supersessions.push({ conflictId: input.graph.conflicts[0].conflictId, winningClaimId: claim(input, "a").claimId, reviewedRuleId: "synthetic_supersession", reviewedRuleVersion: "v1", reviewDecisionId: "f2_test_review", reviewStatus: "admitted", provenance: "hand_authored_non_authoritative_test" });
    expect(outcome(input, "a").status).toBe("supported");
    expect(outcome(input, "b").status).toBe("refused");
  });

  it("reports four zero-tolerance mutations separately and treats refusal as success", () => {
    const analysis = canonical();
    const input = inputFor(analysis, [
      draft(analysis, "unknown", "economic_beneficiary", "beneficiary_unknown", null, "unknown"),
      draft(analysis, "leak", "economic_beneficiary", "beneficiary_claim", "merchant_private_dependency"),
      draft(analysis, "date", "reference_comparison", "historical_reference", "governed_public_dependency"),
      draft(analysis, "private", "contractual_controller", "contract_claim", "merchant_private_dependency"),
    ]);
    input.requestedPositiveClaimIds.push(claim(input, "unknown").claimId);
    prove(input, "leak", "statement_structural_evidence");
    prove(input, "date", "governed_network_regulator", [], { effectivePeriod: { start: "2027-01-01", end: "2027-12-31" } });
    prove(input, "private", "merchant_private_contract_or_correspondence", [], { promotedToGlobal: true });
    const result = evaluateF2(input);
    expect(result.hardFailures).toEqual([
      "evidence_lane_leakage", "historical_back_projection", "merchant_private_to_global_unreviewed_promotion", "unsupported_positive_admission",
    ]);
    expect(result.decisions.find((item) => item.claimId === claim(input, "unknown").claimId)?.status).toBe("unresolved");
    input.requestedPositiveClaimIds = [];
    expect(evaluateF2(input).hardFailures).not.toContain("unsupported_positive_admission");
  });

  it("replays deterministically, freezes outputs, protects canonical state, and fails independently", () => {
    const analysis = canonical();
    const graph = buildF1ClaimGraphFromCanonical(analysis);
    const input: F2EvaluationInput = { ...inputFor(analysis, []), graph };
    const observed = graph.claims.find((item) => item.value.kind === "known" && item.reasoning.primaryClass === "direct_observation" && item.evidenceRefs.length > 0);
    if (!observed) throw new Error("Missing canonical observed source claim");
    input.gates = completenessGateIds.map((gate) => ({ gate, subjectKey: f2SubjectKey(observed), evidence: [...f2FrozenGateEvidence[gate]] }));
    const before = JSON.stringify(analysis);
    const first = evaluateF2(input);
    const replay = evaluateF2(input);
    expect(first).toEqual(replay);
    expect(Object.isFrozen(first)).toBe(true);
    expect(JSON.stringify(analysis)).toBe(before);
    expect(JSON.stringify(first)).not.toMatch(/"amountMinor"|"selectedAmount"|"uniqueChargeTotal"|"extractedText"/);
    expect(first.authorityStanding).toBe("hand_authored_non_authoritative_test");
    expect(first.decisions.find((item) => item.claimId === observed.claimId)).toMatchObject({ status: "supported", satisfiedLanes: ["statement_source_document"] });
    const broken = { ...input, graph: { ...graph, graphId: "broken" } } as F2EvaluationInput;
    expect(tryEvaluateF2(broken)).toEqual({ status: "unavailable", result: null, failureCode: "invalid_evaluation_input" });
    const productionClaim = graph.claims[0];
    const disallowed = { ...input, attestations: [{
      id: "not_a_fixture", claimId: productionClaim.claimId, lane: "statement_source_document", facets: [],
      effectivePeriod: null, scope: productionClaim.universality, subjectKey: f2SubjectKey(productionClaim),
      provenance: "admitted_external_source", privateAccountKey: null, promotedToGlobal: false, reviewedPromotion: false,
    }] } as unknown as F2EvaluationInput;
    expect(tryEvaluateF2(disallowed).status).toBe("unavailable");
    expect(JSON.stringify(analysis)).toBe(before);
  });
});
