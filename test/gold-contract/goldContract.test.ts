import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalDerivabilityTiers,
  compareAssertion,
  currentBaselineSchema,
  detectLegacyForbiddenClaims,
  evaluateGoldAssertion,
  findPrivacyViolations,
  goldAssertionSchema,
  loadCurrentBaseline,
  loadGoldContract,
  loadMetadataClarification,
  loadToleranceRules,
  quantizeDecimalToInteger,
  validateContractReferences,
  type CurrentBaseline,
  type GoldAssertion,
  type GoldObservation,
} from "../../scripts/gold-contract-lib.js";

describe("RA executable Gold contract", () => {
  it("contains G1-G9, S1-S10, and all 25 global prohibitions", async () => {
    const contract = await loadGoldContract();
    expect(contract.cases.map((item) => item.case_id).sort()).toEqual(
      ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"].sort(),
    );
    expect(contract.global_assertions).toHaveLength(25);
    expect(contract.cases.every((item) => item.assertions.length > 0)).toBe(true);
    expect([...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions]).toHaveLength(348);
  });

  it("restores every frozen real-case merchant theme", async () => {
    const contract = await loadGoldContract();
    const expectedCounts: Record<string, number> = { G1: 5, G2: 6, G3: 4, G4: 6, G5: 6, G6: 6, G7: 5, G8: 6, G9: 3 };
    for (const [caseId, expectedCount] of Object.entries(expectedCounts)) {
      const goldCase = contract.cases.find((item) => item.case_id === caseId)!;
      expect(goldCase.assertions.filter((item) => item.assertion_basis === "merchant_theme"), caseId).toHaveLength(expectedCount);
    }
  });

  it("preserves every finalized GoldAssertion field and requires traceable product-owner approval", async () => {
    const contract = await loadGoldContract();
    const assertions = [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions];
    for (const assertion of assertions) {
      expect(Object.keys(assertion).sort()).toEqual(
        [
          "allowed_alternatives",
          "approval",
          "applicability_scope",
          "assertion_basis",
          "assertion_id",
          "case_id",
          "comparison_status",
          "confidence",
          "confidence_status",
          "contract_role",
          "derivability_tier",
          "effective_period",
          "effective_period_status",
          "evidence_mapping_status",
          "expected_value_or_state",
          "field_or_conclusion",
          "forbidden_values",
          "gold_scope",
          "knowledge_dependencies",
          "required_denominator",
          "source_refs",
          "statement_evidence_refs",
          "statement_evidence_status",
          "tolerance_rule_ref",
        ].sort(),
      );
      expect(assertion.approval.status).toBe("approved");
      expect(assertion.approval.authority).toBe("product_owner");
      expect(assertion.approval.approval_ref).toMatch(/^product-owner-gold-finalization-/);
    }

    expect(() =>
      goldAssertionSchema.parse({
        ...assertions[0],
        approval: { status: "approved", authority: "codex_candidate", approval_ref: "self-approved" },
      }),
    ).toThrow(/Only the product owner/);
  });

  it("validates finalized tolerance and baseline references without using current output as Gold", async () => {
    const [contract, tolerances, baseline] = await Promise.all([loadGoldContract(), loadToleranceRules(), loadCurrentBaseline()]);
    expect(validateContractReferences(contract, tolerances, baseline)).toEqual([]);
    expect(tolerances.filter((item) => item.approval.status === "approved").map((item) => item.rule_id).sort()).toEqual([
      "TOL-MONEY-CENT",
      "TOL-RATE-4DP-PERCENT",
    ]);
    expect(tolerances.filter((item) => item.approval.status === "not_approved").map((item) => item.rule_id).sort()).toEqual([
      "TOL-EXACT",
      "TOL-MONEY-APPROX",
      "TOL-RATE-APPROX",
    ]);
    expect(contract.conversion_status).toBe("semantic_gold_finalized_source_provenance_pending");
  });

  it("uses only canonical derivability tiers and explicit missing-metadata states", async () => {
    const contract = await loadGoldContract();
    const assertions = [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions];
    const tiers = new Set(canonicalDerivabilityTiers);
    expect(assertions.every((item) => tiers.has(item.derivability_tier))).toBe(true);
    expect(assertions.every((item) => item.confidence === null && item.confidence_status === "not_explicitly_supplied_requires_review")).toBe(true);
    expect(contract.cases.filter((item) => item.case_id.startsWith("G")).every((item) => item.effective_period !== null)).toBe(true);
  });

  it("uses canonical pricing enums and keeps G8 rate/basis pairs atomic", async () => {
    const contract = await loadGoldContract();
    const assertion = (caseId: string, assertionId: string) =>
      contract.cases.find((item) => item.case_id === caseId)!.assertions.find((item) => item.assertion_id === assertionId)!;
    expect(assertion("G1", "G1-PRICE-SHAPE").expected_value_or_state).toEqual({ kind: "value", value: "composite_multi_component" });
    expect(assertion("S3", "S3-SHAPE").expected_value_or_state).toEqual({ kind: "value", value: "composite_multi_component" });
    expect(assertion("G8", "G8-RATE-OPTIONS").expected_value_or_state).toEqual({
      kind: "value",
      value: [
        { rate_decimal: 0.038252, denominator: "canonical_net_submitted_card_volume" },
        { rate_decimal: 0.038248, denominator: "gross_card_sales" },
      ],
    });
    expect(contract.cases.find((item) => item.case_id === "G8")!.assertions.some((item) => item.assertion_id === "G8-RATE-BASIS")).toBe(false);
  });

  it("makes S1-S10 executable after the authorized minimal S5 and S8 inputs", async () => {
    const contract = await loadGoldContract();
    const synthetic = contract.cases.filter((item) => item.case_id.startsWith("S"));
    expect(synthetic.filter((item) => item.synthetic_input_readiness === "synthetic_input_fully_derivable").map((item) => item.case_id)).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
      "S8",
      "S9",
      "S10",
    ]);
    expect(synthetic.filter((item) => item.synthetic_input_readiness !== "synthetic_input_fully_derivable")).toEqual([]);
    expect(contract.cases.find((item) => item.case_id === "S5")!.synthetic_input).toEqual({
      direct_esa_like_structural_indicator_present: true,
      acquirer_program_detail_present: false,
      acquirer_margin_component_evidenced: false,
    });
    const s8 = contract.cases.find((item) => item.case_id === "S8")!.synthetic_input as any;
    expect(s8.entries).toHaveLength(2);
    expect(s8.entries[0].scope).toBe(s8.entries[1].scope);
    expect(s8.entries[0].specificity).toBe(s8.entries[1].specificity);
    expect(s8.entries[0].value).not.toBe(s8.entries[1].value);
    expect(s8.entries[0].confidence).not.toBe(s8.entries[1].confidence);
  });

  it("distinguishes explicit unknown from an absent capability", async () => {
    const [contract, tolerances, baseline] = await Promise.all([loadGoldContract(), loadToleranceRules(), loadCurrentBaseline()]);
    const assertion = contract.cases.find((item) => item.case_id === "G3")!.assertions.find((item) => item.assertion_id === "G3-PRICE-MODEL")!;
    const explicitUnknown: GoldObservation = { caseId: "G3", sourceStatus: "available", values: {}, states: { "pricing.current_period_model": "unknown" }, claims: [] };
    const missing: GoldObservation = { caseId: "G3", sourceStatus: "available", values: {}, states: {}, claims: [] };

    expect(compareAssertion(assertion, explicitUnknown, tolerances)).toBe("match");
    expect(evaluateGoldAssertion(assertion, explicitUnknown, tolerances, baseline).outcome).toBe("pass");
    expect(evaluateGoldAssertion(assertion, missing, tolerances, baseline).outcome).toBe("capability_not_implemented");
  });

  it("executes exact, tolerance, state, alternative, and forbidden-value comparisons", async () => {
    const tolerances = await loadToleranceRules();
    const observation: GoldObservation = {
      caseId: "S1",
      sourceStatus: "available",
      values: { money: 10.004, alternative: "allowed", forbidden: 0 },
      states: { state: "unknown" },
      claims: [],
    };
    expect(compareAssertion(testAssertion("VALUE", "money", { kind: "value", value: 10 }, "TOL-MONEY-CENT"), observation, tolerances)).toBe("match");
    expect(compareAssertion(testAssertion("STATE", "state", { kind: "state", state: "unknown" }), observation, tolerances)).toBe("match");
    expect(compareAssertion({ ...testAssertion("ALT", "alternative", { kind: "value", value: "primary" }), allowed_alternatives: ["allowed"] }, observation, tolerances)).toBe("match");
    expect(compareAssertion({ ...testAssertion("FORBID", "forbidden", { kind: "value", value: 1 }), forbidden_values: [0] }, observation, tolerances)).toBe("mismatch");
  });

  it("uses decimal quantization, never floating deltas, for approved cent and four-place percentage comparisons", async () => {
    const tolerances = await loadToleranceRules();
    expect(quantizeDecimalToInteger("10.004", 2)).toBe(1000n);
    expect(quantizeDecimalToInteger("10.005", 2)).toBe(1001n);
    expect(quantizeDecimalToInteger("0.04708849", 6)).toBe(47088n);
    expect(quantizeDecimalToInteger("0.04708850", 6)).toBe(47089n);

    const rate = {
      ...testAssertion("RATE", "rate", { kind: "value" as const, value: 0.047088 }, "TOL-RATE-4DP-PERCENT"),
      required_denominator: "canonical_net_submitted_card_volume",
    };
    const matching: GoldObservation = {
      caseId: "S1", sourceStatus: "available", values: { rate: 0.04708849 }, states: {}, claims: [],
      valueContexts: { rate: { denominator: "canonical_net_submitted_card_volume" } },
    };
    expect(compareAssertion(rate, matching, tolerances)).toBe("match");
    expect(compareAssertion({ ...rate }, { ...matching, valueContexts: { rate: { denominator: "gross_card_sales" } } }, tolerances)).toBe("mismatch");
  });

  it("keeps atomic rate/denominator alternatives paired and refuses cross-pair matching", async () => {
    const [contract, tolerances] = await Promise.all([loadGoldContract(), loadToleranceRules()]);
    const assertion = contract.cases.find((item) => item.case_id === "G8")!.assertions.find((item) => item.assertion_id === "G8-RATE-OPTIONS")!;
    const observation = (actual: unknown): GoldObservation => ({ caseId: "G8", sourceStatus: "available", values: { "financial.effective_rate_options": actual }, states: {}, claims: [] });
    expect(compareAssertion(assertion, observation({ rate_decimal: 0.038252, denominator: "canonical_net_submitted_card_volume" }), tolerances)).toBe("match");
    expect(compareAssertion(assertion, observation({ rate_decimal: 0.038252, denominator: "gross_card_sales" }), tolerances)).toBe("mismatch");
  });

  it("validates semantic theme coverage while permitting safe grouping", async () => {
    const [contract, tolerances] = await Promise.all([loadGoldContract(), loadToleranceRules()]);
    const themes = contract.cases.find((item) => item.case_id === "G1")!.assertions.filter((item) => item.contract_role === "semantic_theme_coverage");
    const semanticThemeCodes = themes.map((item) => (item.expected_value_or_state as any).coverage_code);
    const safeGroup = { semanticThemeCodes, preservesEconomicMeaning: true, preservesEvidenceBoundaries: true, preservesActionability: true, overstatesCertainty: false, createsUnsupportedSavingsOrActionability: false };
    const observation: GoldObservation = { caseId: "G1", sourceStatus: "available", values: {}, states: {}, claims: [], themeCoverage: [safeGroup] };
    expect(themes.every((item) => compareAssertion(item, observation, tolerances) === "match")).toBe(true);
    expect(compareAssertion(themes[0], { ...observation, themeCoverage: [{ ...safeGroup, overstatesCertainty: true }] }, tolerances)).toBe("mismatch");
  });

  it("keeps approximate references descriptive and non-executable", async () => {
    const [contract, tolerances, baseline] = await Promise.all([loadGoldContract(), loadToleranceRules(), loadCurrentBaseline()]);
    const assertion = contract.cases.find((item) => item.case_id === "G1")!.assertions.find((item) => item.assertion_id === "G1-INTERCHANGE-DETAIL")!;
    const observation: GoldObservation = { caseId: "G1", sourceStatus: "available", values: { [assertion.field_or_conclusion]: 798.63 }, states: {}, claims: [] };
    expect(assertion.approval.status).toBe("approved");
    expect(assertion.comparison_status).toBe("descriptive_reference_only_approximate_policy_unavailable");
    expect(compareAssertion(assertion, observation, tolerances)).toBe("not_executed");
    expect(evaluateGoldAssertion(assertion, observation, tolerances, baseline).outcome).toBe("requires_human_review");
  });

  it("loads the versioned D15 clarification without rewriting frozen artifacts", async () => {
    const clarification = await loadMetadataClarification();
    expect(clarification.clarification_version).toBe("gold-v0.3-metadata-clarification-v0.1");
    expect(clarification.original_frozen_artifacts_rewritten).toBe(false);
    expect(clarification.fields.evidence_mapping_status.pending_status).toBe("pending_authoritative_mapping");
  });

  it("detects every global forbidden conclusion", async () => {
    const [contract, tolerances] = await Promise.all([loadGoldContract(), loadToleranceRules()]);
    for (const assertion of contract.global_assertions) {
      const expected = assertion.expected_value_or_state;
      expect(expected.kind).toBe("conclusion");
      if (expected.kind !== "conclusion") continue;
      const observation: GoldObservation = { caseId: "GLOBAL", sourceStatus: "available", values: {}, states: {}, claims: [expected.claim_code] };
      expect(compareAssertion(assertion, observation, tolerances)).toBe("forbidden_detected");
    }
  });

  it("classifies reviewed failures, drift, unexpected passes, source absence, and approved passes distinctly", async () => {
    const tolerances = await loadToleranceRules();
    const assertion = approvedAssertion(testAssertion("FAILURE", "value", { kind: "value", value: 10 }));
    const baseline = baselineFor(assertion.assertion_id, 2);
    const observed = (value: number): GoldObservation => ({ caseId: "S1", sourceStatus: "available", values: { value }, states: {}, claims: [] });

    expect(evaluateGoldAssertion(assertion, observed(2), tolerances, baseline).outcome).toBe("expected_current_failure");
    expect(evaluateGoldAssertion(assertion, observed(4), tolerances, baseline).outcome).toBe("regression");
    expect(evaluateGoldAssertion(assertion, observed(10), tolerances, baseline).outcome).toBe("unexpected_pass");
    expect(evaluateGoldAssertion(assertion, { ...observed(2), sourceStatus: "source_unavailable" }, tolerances, baseline).outcome).toBe("source_unavailable");
    expect(
      evaluateGoldAssertion(approvedAssertion(testAssertion("PASS", "value", { kind: "value", value: 2 })), observed(2), tolerances, baselineFor()).outcome,
    ).toBe("pass");
  });

  it("finds current legacy forbidden-claim shapes without embedding Gold answers", () => {
    expect(
      detectLegacyForbiddenClaims({
        selectedFinancials: { totalVolume: 0, effectiveRate: 0 },
        fiservFeeAnalysisV2: {
          processorMarkupAnalysis: { processorControlledTotal: 42 },
          bundledPricingBenchmark: { status: "ready" },
          estimatedAnnualSavings: { amount: 100 },
          effectiveRateBenchmarkAnalysis: { verdict: "above_range" },
        },
      }),
    ).toEqual([
      "EFFECTIVE_RATE_AS_PRICING_VERDICT",
      "EXACT_PROCESSOR_OWNERSHIP_WITHOUT_PROOF",
      "SAVINGS_WITHOUT_VALID_COUNTERFACTUAL",
      "UNQUALIFIED_BUNDLED_BENCHMARK",
      "ZERO_VOLUME_NUMERIC_EFFECTIVE_RATE",
    ]);
  });

  it("keeps committed contract metadata privacy-safe", async () => {
    const [contract, tolerances, baseline] = await Promise.all([loadGoldContract(), loadToleranceRules(), loadCurrentBaseline()]);
    expect(findPrivacyViolations(contract)).toEqual([]);
    expect(findPrivacyViolations(tolerances)).toEqual([]);
    expect(findPrivacyViolations(baseline)).toEqual([]);
  });

  it("keeps Gold data and identifiers out of production source", async () => {
    const sourceFiles = (await listFiles(path.resolve(process.cwd(), "src"))).filter((item) => item.endsWith(".ts"));
    for (const filePath of sourceFiles) {
      const text = await fs.readFile(filePath, "utf8");
      expect(text, filePath).not.toMatch(/gold[-_/ ]contract|test\/fixtures\/gold/i);
      expect(text, filePath).not.toMatch(/\b(?:G[1-9]|S10|S[1-9])-[A-Z0-9-]{3,}\b/);
      expect(text, filePath).not.toMatch(/\b(?:EL\s+NUEVO|PHILIP\s+FUTURE|XPRESS\s+FIX|JAMAICA\s+FISH|ANTHONY\s+LAVERNE|VORTAX|NXGEN)\b/i);
    }
  });

  it("evaluates generalized facts independently of merchant and filename metadata", async () => {
    const [contract, tolerances] = await Promise.all([loadGoldContract(), loadToleranceRules()]);
    const assertion = contract.cases.find((item) => item.case_id === "S1")!.assertions.find((item) => item.assertion_id === "S1-UNDERLYING")!;
    const first = { caseId: "S1", sourceStatus: "available" as const, values: { "pricing.underlying_cost_billing_mode": "bundled_into_merchant_price", merchant: "A", filename: "a.pdf" }, states: {}, claims: [] };
    const renamed = { ...first, values: { ...first.values, merchant: "B", filename: "renamed.pdf" } };
    expect(compareAssertion(assertion, first, tolerances)).toBe("match");
    expect(compareAssertion(assertion, renamed, tolerances)).toBe("match");
  });
});

function testAssertion(id: string, field: string, expected: GoldAssertion["expected_value_or_state"], tolerance: string | null = null): GoldAssertion {
  return goldAssertionSchema.parse({
    assertion_id: `S1-${id}`,
    case_id: "S1",
    field_or_conclusion: field,
    expected_value_or_state: expected,
    tolerance_rule_ref: tolerance,
    allowed_alternatives: [],
    forbidden_values: [],
    source_refs: ["test:synthetic"],
    assertion_basis: "synthetic_scenario",
    statement_evidence_refs: [],
    statement_evidence_status: "not_applicable_synthetic",
    evidence_mapping_status: "not_applicable_synthetic",
    derivability_tier: "deterministically_derivable_from_statement",
    knowledge_dependencies: [],
    gold_scope: "synthetic_scenario",
    applicability_scope: "unit_test_synthetic_only",
    confidence: null,
    confidence_status: "not_explicitly_supplied_requires_review",
    effective_period: null,
    effective_period_status: "not_time_sensitive",
    contract_role: expected.kind === "conclusion" ? "semantic_claim" : expected.kind === "semantic_theme_coverage" ? "semantic_theme_coverage" : "canonical_value_or_state",
    comparison_status: tolerance === "TOL-MONEY-APPROX" || tolerance === "TOL-RATE-APPROX" ? "descriptive_reference_only_approximate_policy_unavailable" : "executable",
    required_denominator: null,
    approval: { status: "candidate_only", authority: "codex_candidate", approval_ref: null },
  });
}

function approvedAssertion(assertion: GoldAssertion): GoldAssertion {
  return goldAssertionSchema.parse({ ...assertion, approval: { status: "approved", authority: "product_owner", approval_ref: "unit-test-only" } });
}

function baselineFor(assertionId?: string, observedSignature?: unknown): CurrentBaseline {
  return currentBaselineSchema.parse({
    schema_version: "ratereveal_gold_current_baseline_v1",
    repository_head: "158eb671b7cf26a59e14d31da300ecc350f5305f",
    entries: assertionId
      ? [{ assertion_id: assertionId, expected_outcome: "expected_current_failure", observed_signature: observedSignature, issue_id: "RA-CONFLICT-TEST", description: "Test failure.", review_status: "product_owner_reviewed", approval_ref: "unit-test-only", deferred_to: "test" }]
      : [],
    historical_conflicts: [],
  });
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? listFiles(path.join(root, entry.name)) : [path.join(root, entry.name)])));
  return nested.flat();
}
