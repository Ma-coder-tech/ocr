import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const goldOutcomeValues = [
  "pass",
  "expected_current_failure",
  "capability_not_implemented",
  "source_unavailable",
  "regression",
  "unexpected_pass",
  "requires_human_review",
  "invalid_contract_or_fixture",
] as const;

export const canonicalDerivabilityTiers = [
  "stated_on_statement",
  "deterministically_derivable_from_statement",
  "inferable_from_statement_with_qualification",
  "requires_external_rule_or_schedule",
  "requires_merchant_pricing_document",
  "requires_additional_statement_history",
  "requires_processor_explanation",
  "not_derivable_from_this_document_class",
  "unresolved",
] as const;

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

const approvalSchema = z
  .object({
    status: z.enum(["candidate_only", "approved", "not_approved"]),
    authority: z.enum(["codex_candidate", "product_owner"]),
    approval_ref: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "approved" && (value.authority !== "product_owner" || !value.approval_ref)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only the product owner may approve machine-converted Gold." });
    }
    if (value.status === "candidate_only" && value.authority !== "codex_candidate") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Candidate assertions must retain Codex-candidate authority." });
    }
    if (value.status === "not_approved" && (value.authority !== "product_owner" || !value.approval_ref)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A product-owner rejection or retirement requires a traceable decision reference." });
    }
  });

export const toleranceRuleSchema = z
  .object({
    rule_id: z.string().regex(/^TOL-[A-Z0-9-]+$/),
    availability: z.enum(["active", "unavailable", "retired"]),
    comparison: z.enum(["quantized_decimal", "unavailable", "retired"]),
    decimal_scale: z.number().int().nonnegative().nullable(),
    quantization_space: z.enum(["major_currency_unit", "decimal_fraction_after_four_place_percentage_normalization", "not_applicable"]),
    units: z.string().min(1),
    rationale: z.string().min(1),
    source_refs: z.array(z.string().min(1)).min(1),
    review_classification: z.enum([
      "approved_corrected_machine_comparison",
      "unsupported_policy_unavailable",
      "retired_redundant",
    ]),
    review_reason: z.string().min(1),
    approval: approvalSchema,
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (rule.comparison === "quantized_decimal" && (rule.availability !== "active" || rule.decimal_scale === null || rule.approval.status !== "approved")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Quantized decimal rules must be active, scaled, and product-owner approved." });
    }
    if (rule.comparison !== "quantized_decimal" && (rule.decimal_scale !== null || rule.quantization_space !== "not_applicable" || rule.approval.status === "approved")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unavailable and retired rules cannot carry scale semantics or approval." });
    }
  });

const expectedValueOrStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("value"), value: jsonValueSchema }).strict(),
  z.object({ kind: z.literal("state"), state: z.string().min(1) }).strict(),
  z.object({
    kind: z.literal("conclusion"),
    claim_code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
    present: z.boolean(),
    polarity: z.enum(["required", "prohibited"]),
    claim_scope: z.enum(["case", "global"]),
  }).strict(),
  z.object({
    kind: z.literal("semantic_theme_coverage"),
    coverage_code: z.string().regex(/^THEME_[A-Z0-9_]+$/),
    requirement: z.literal("required_when_evidence_and_applicability_met"),
    grouping_policy: z.literal("grouping_allowed_only_when_economic_meaning_evidence_boundaries_and_actionability_are_preserved"),
  }).strict(),
]);

export const goldAssertionSchema = z
  .object({
    assertion_id: z.string().regex(/^(?:G[1-9]|S10|S[1-9]|GLOBAL)-[A-Z0-9-]+$/),
    case_id: z.string().regex(/^(?:G[1-9]|S10|S[1-9]|GLOBAL)$/),
    field_or_conclusion: z.string().min(1),
    expected_value_or_state: expectedValueOrStateSchema,
    tolerance_rule_ref: z.string().regex(/^TOL-[A-Z0-9-]+$/).nullable(),
    allowed_alternatives: z.array(jsonValueSchema),
    forbidden_values: z.array(jsonValueSchema),
    source_refs: z.array(z.string().min(1)).min(1),
    statement_evidence_refs: z.array(z.string().min(1)),
    statement_evidence_status: z.enum([
      "requires_authoritative_source_mapping",
      "source_unavailable",
      "not_applicable_synthetic",
      "not_applicable_global_policy",
    ]),
    evidence_mapping_status: z.enum([
      "pending_authoritative_mapping",
      "source_unavailable",
      "not_applicable_synthetic",
      "not_applicable_global_policy",
    ]),
    assertion_basis: z.enum(["source_observed", "deterministic_math", "approved_policy", "synthetic_scenario", "merchant_theme"]),
    derivability_tier: z.enum(canonicalDerivabilityTiers),
    knowledge_dependencies: z.array(z.string().min(1)),
    gold_scope: z.enum(["full_statement", "bounded_observed_sections", "limited_document", "synthetic_scenario", "global"]),
    applicability_scope: z.string().min(1),
    confidence: z.enum(["high", "medium", "low", "unavailable"]).nullable(),
    confidence_status: z.enum(["explicitly_frozen", "not_explicitly_supplied_requires_review"]),
    effective_period: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
    effective_period_status: z.enum(["explicitly_frozen", "not_time_sensitive"]),
    contract_role: z.enum(["canonical_value_or_state", "noncanonical_deterministic_projection", "semantic_claim", "semantic_theme_coverage"]),
    comparison_status: z.enum(["executable", "descriptive_reference_only_approximate_policy_unavailable"]),
    required_denominator: z.string().min(1).nullable(),
    approval: approvalSchema,
  })
  .strict();

const sourceSchema = z
  .object({
    kind: z.enum(["repository_fixture", "private_secure", "synthetic_structured"]),
    opaque_source_id: z.string().regex(/^SRC-[A-Z0-9-]+$/),
    availability: z.enum(["available", "source_unavailable", "requires_human_review"]),
    provenance_status: z.enum(["git_pinned_existing_fixture", "secure_mapping_verified", "synthetic_authored", "unproven"]),
    integrity: z.enum(["git_object", "private_sidecar", "synthetic_schema", "unverified"]),
  })
  .strict();

export const goldCaseSchema = z
  .object({
    case_id: z.string().regex(/^(?:G[1-9]|S10|S[1-9])$/),
    title: z.string().min(1),
    case_kind: z.enum(["real_statement", "synthetic_adversarial"]),
    gold_status: z.enum(["gold_full", "gold_bounded", "gold_limited", "synthetic"]),
    evaluation_scope: z.enum(["falsification_only", "supported_product_regression"]),
    source: sourceSchema,
    effective_period: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
    applicability_scope: z.string().min(1),
    synthetic_input_readiness: z
      .enum(["synthetic_input_fully_derivable", "synthetic_input_requires_product_decision", "synthetic_input_insufficiently_specified"])
      .nullable(),
    synthetic_input: jsonValueSchema.nullable(),
    assertions: z.array(goldAssertionSchema).min(1),
  })
  .strict()
  .superRefine((goldCase, ctx) => {
    if (goldCase.case_kind === "real_statement" && (goldCase.synthetic_input_readiness !== null || goldCase.synthetic_input !== null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Real-statement cases cannot carry synthetic input metadata." });
    }
    if (goldCase.synthetic_input_readiness === "synthetic_input_fully_derivable" && goldCase.synthetic_input === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fully derivable synthetic cases require a candidate input payload." });
    }
    if (goldCase.synthetic_input_readiness !== "synthetic_input_fully_derivable" && goldCase.synthetic_input !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only fully derivable synthetic cases may carry a candidate input payload." });
    }
  });

export const goldContractSchema = z
  .object({
    schema_version: z.literal("ratereveal_gold_contract_v3"),
    frozen_artifact: z.literal("RateReveal Gold Answer Tables v0.3"),
    conversion_status: z.literal("semantic_gold_finalized_source_provenance_pending"),
    metadata_clarification_version: z.literal("gold-v0.3-metadata-clarification-v0.1"),
    product_owner_decision_ref: z.literal("product-owner-gold-finalization-D1-D15-2026-08-22"),
    cases: z.array(goldCaseSchema).length(19),
    global_assertions: z.array(goldAssertionSchema).length(25),
  })
  .strict()
  .superRefine((contract, ctx) => {
    const expectedCases = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10"];
    const actualCases = contract.cases.map((item) => item.case_id).sort();
    if (JSON.stringify(actualCases) !== JSON.stringify(expectedCases.sort())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cases"], message: "Contract must contain exactly G1-G9 and S1-S10." });
    }
    const allAssertions = [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions];
    const ids = allAssertions.map((item) => item.assertion_id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Assertion IDs must be globally unique." });
    }
    for (const assertion of allAssertions) {
      if (assertion.approval.status !== "approved" || assertion.approval.authority !== "product_owner") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Finalized semantic Gold requires product-owner approval for ${assertion.assertion_id}.` });
      }
    }
  });

export const currentBaselineSchema = z
  .object({
    schema_version: z.literal("ratereveal_gold_current_baseline_v1"),
    repository_head: z.string().regex(/^[a-f0-9]{40}$/),
    entries: z.array(
      z
        .object({
          assertion_id: z.string().min(1),
          expected_outcome: z.enum(["expected_current_failure", "capability_not_implemented"]),
          observed_signature: jsonValueSchema.optional(),
          issue_id: z.string().regex(/^RA-CONFLICT-[A-Z0-9-]+$/),
          description: z.string().min(1),
          review_status: z.enum(["product_owner_reviewed", "candidate_only"]),
          approval_ref: z.string().min(1).nullable(),
          deferred_to: z.string().min(1),
        })
        .strict(),
    ),
    historical_conflicts: z.array(
      z
        .object({
          issue_id: z.string().regex(/^RA-CONFLICT-[A-Z0-9-]+$/),
          test_ref: z.string().min(1),
          description: z.string().min(1),
          deferred_to: z.string().min(1),
          review_status: z.enum(["product_owner_reviewed", "candidate_only"]),
        })
        .strict(),
    ),
  })
  .strict();

export type GoldContract = z.infer<typeof goldContractSchema>;
export type GoldAssertion = z.infer<typeof goldAssertionSchema>;
export type GoldCase = z.infer<typeof goldCaseSchema>;
export type ToleranceRule = z.infer<typeof toleranceRuleSchema>;
export type CurrentBaseline = z.infer<typeof currentBaselineSchema>;
export type GoldOutcome = (typeof goldOutcomeValues)[number];

export type GoldObservation = {
  caseId: string;
  sourceStatus: "available" | "source_unavailable" | "requires_human_review";
  values: Record<string, unknown>;
  states: Record<string, string>;
  claims: string[];
  valueContexts?: Record<string, { denominator: string }>;
  themeCoverage?: Array<{
    semanticThemeCodes: string[];
    preservesEconomicMeaning: boolean;
    preservesEvidenceBoundaries: boolean;
    preservesActionability: boolean;
    overstatesCertainty: boolean;
    createsUnsupportedSavingsOrActionability: boolean;
  }>;
};

export type AssertionResult = {
  assertionId: string;
  caseId: string;
  outcome: GoldOutcome;
  candidateComparison: "match" | "mismatch" | "missing" | "forbidden_detected" | "not_executed";
  issueId: string | null;
  message: string;
};

const fixtureRoot = path.resolve(process.cwd(), "test/fixtures/gold-contract");

const metadataClarificationSchema = z
  .object({
    schema_version: z.literal("ratereveal_gold_metadata_clarification_v1"),
    clarification_version: z.literal("gold-v0.3-metadata-clarification-v0.1"),
    applies_to: z.literal("RateReveal Gold Answer Tables v0.3"),
    decision_ref: z.literal("product-owner-gold-finalization-D15-2026-08-22"),
    original_frozen_artifacts_rewritten: z.literal(false),
    fields: z.object({
      confidence: z.object({ missing_value: z.null(), missing_status: z.literal("not_explicitly_supplied_requires_review"), rule: z.string().min(1) }).strict(),
      effective_period: z.object({ real_case_rule: z.string().min(1), not_time_sensitive_status: z.literal("not_time_sensitive") }).strict(),
      applicability_scope: z.object({ rule: z.string().min(1) }).strict(),
      evidence_mapping_status: z.object({ pending_status: z.literal("pending_authoritative_mapping"), rule: z.string().min(1) }).strict(),
    }).strict(),
  })
  .strict();

export async function loadMetadataClarification() {
  return metadataClarificationSchema.parse(
    JSON.parse(await fs.readFile(path.join(fixtureRoot, "gold-metadata-clarification-v0.1.json"), "utf8")),
  );
}

export async function loadGoldContract(): Promise<GoldContract> {
  const [catalog, clarification] = await Promise.all([
    compactCatalogSchema.parse(JSON.parse(await fs.readFile(path.join(fixtureRoot, "gold-catalog-v0.3.final.json"), "utf8"))),
    loadMetadataClarification(),
  ]);
  return goldContractSchema.parse({
    schema_version: "ratereveal_gold_contract_v3",
    frozen_artifact: "RateReveal Gold Answer Tables v0.3",
    conversion_status: "semantic_gold_finalized_source_provenance_pending",
    metadata_clarification_version: clarification.clarification_version,
    product_owner_decision_ref: "product-owner-gold-finalization-D1-D15-2026-08-22",
    cases: catalog.cases.map(expandCompactCase),
    global_assertions: catalog.global_prohibitions.map((item) =>
      expandCompactConclusion("GLOBAL", "global", "gold-v0.3:463-491", item),
    ),
  });
}

export async function loadToleranceRules(): Promise<ToleranceRule[]> {
  const raw = JSON.parse(await fs.readFile(path.join(fixtureRoot, "tolerance-rules.final.json"), "utf8"));
  return z.array(toleranceRuleSchema).min(1).parse(raw);
}

export async function loadCurrentBaseline(): Promise<CurrentBaseline> {
  return currentBaselineSchema.parse(JSON.parse(await fs.readFile(path.join(fixtureRoot, "current-baseline.json"), "utf8")));
}

export function evaluateGoldAssertion(
  assertion: GoldAssertion,
  observation: GoldObservation,
  tolerances: ToleranceRule[],
  baseline: CurrentBaseline,
): AssertionResult {
  if (observation.sourceStatus === "source_unavailable") {
    return makeResult(assertion, "source_unavailable", "not_executed", null, "Authoritative source is unavailable; no semantic result was inferred.");
  }
  if (observation.sourceStatus === "requires_human_review") {
    return makeResult(assertion, "requires_human_review", "not_executed", null, "Authoritative source mapping requires product-owner review.");
  }

  const comparison = compareAssertion(assertion, observation, tolerances);
  if (comparison === "not_executed") {
    return makeResult(
      assertion,
      "requires_human_review",
      comparison,
      null,
      "The semantic reference is approved, but its approximate numeric comparison policy is explicitly unavailable under D12.",
    );
  }
  const baselineEntry = baseline.entries.find((entry) => entry.assertion_id === assertion.assertion_id);
  if (baselineEntry) {
    const signatureMatches = baselineEntry.observed_signature === undefined || sameValue(observedValue(assertion, observation), baselineEntry.observed_signature);
    if (baselineEntry.expected_outcome === "expected_current_failure" && comparison !== "match" && signatureMatches) {
      return makeResult(assertion, "expected_current_failure", comparison, baselineEntry.issue_id, baselineEntry.description);
    }
    if (baselineEntry.expected_outcome === "expected_current_failure" && comparison === "match") {
      return makeResult(assertion, "unexpected_pass", comparison, baselineEntry.issue_id, "A reviewed current failure now appears to pass and requires adjudication.");
    }
    if (!signatureMatches) {
      return makeResult(assertion, "regression", comparison, baselineEntry.issue_id, "Observed behavior drifted outside the reviewed current-failure signature.");
    }
    if (baselineEntry.expected_outcome === "capability_not_implemented" && comparison === "missing") {
      return makeResult(assertion, "capability_not_implemented", comparison, baselineEntry.issue_id, baselineEntry.description);
    }
  }

  if (comparison === "missing") {
    return makeResult(assertion, "capability_not_implemented", comparison, null, "The required output concept is absent; absence was not treated as an explicit unknown.");
  }
  if (assertion.approval.status !== "approved") {
    return makeResult(
      assertion,
      "requires_human_review",
      comparison,
      null,
      "Candidate comparison was executed, but machine-converted Gold awaits product-owner approval.",
    );
  }
  return comparison === "match"
    ? makeResult(assertion, "pass", comparison, null, "Approved Gold assertion passed.")
    : makeResult(assertion, "regression", comparison, null, "Approved Gold assertion failed.");
}

export function compareAssertion(
  assertion: GoldAssertion,
  observation: GoldObservation,
  tolerances: ToleranceRule[],
): AssertionResult["candidateComparison"] {
  const expected = assertion.expected_value_or_state;
  if (expected.kind === "conclusion") {
    const present = observation.claims.includes(expected.claim_code);
    if (!expected.present && present) return "forbidden_detected";
    if (expected.present && !present) return "missing";
    return "match";
  }
  if (expected.kind === "semantic_theme_coverage") {
    const matchingGroup = observation.themeCoverage?.find((group) => group.semanticThemeCodes.includes(expected.coverage_code));
    if (!matchingGroup) return "missing";
    return matchingGroup.preservesEconomicMeaning &&
      matchingGroup.preservesEvidenceBoundaries &&
      matchingGroup.preservesActionability &&
      !matchingGroup.overstatesCertainty &&
      !matchingGroup.createsUnsupportedSavingsOrActionability
      ? "match"
      : "mismatch";
  }
  const actual = expected.kind === "state" ? observation.states[assertion.field_or_conclusion] : observation.values[assertion.field_or_conclusion];
  if (actual === undefined) return "missing";
  if (assertion.forbidden_values.some((value) => sameValue(value, actual))) return "mismatch";
  if (expected.kind === "state") {
    return actual === expected.state || assertion.allowed_alternatives.some((value) => sameValue(value, actual)) ? "match" : "mismatch";
  }
  if (assertion.required_denominator !== null && observation.valueContexts?.[assertion.field_or_conclusion]?.denominator !== assertion.required_denominator) {
    return "mismatch";
  }
  if (assertion.field_or_conclusion === "financial.effective_rate_options" && Array.isArray(expected.value) && !Array.isArray(actual)) {
    return expected.value.some((option) => sameValue(option, actual)) ? "match" : "mismatch";
  }
  if (assertion.allowed_alternatives.some((value) => sameValue(value, actual))) return "match";
  const tolerance = assertion.tolerance_rule_ref ? tolerances.find((rule) => rule.rule_id === assertion.tolerance_rule_ref) : undefined;
  if (!tolerance) return sameValue(actual, expected.value) ? "match" : "mismatch";
  if (tolerance.availability !== "active" || tolerance.comparison !== "quantized_decimal" || tolerance.decimal_scale === null) return "not_executed";
  if (typeof actual !== "number" || typeof expected.value !== "number") return "mismatch";
  return quantizeDecimalToInteger(actual, tolerance.decimal_scale) === quantizeDecimalToInteger(expected.value, tolerance.decimal_scale)
    ? "match"
    : "mismatch";
}

export function quantizeDecimalToInteger(value: number | string, scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0) throw new Error("Decimal scale must be a non-negative integer.");
  const text = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) throw new Error(`Invalid decimal value: ${text}`);
  const negative = match[1] === "-";
  const integerDigits = match[2];
  const fractionalDigits = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  const digits = `${integerDigits}${fractionalDigits}`;
  const decimalPosition = integerDigits.length + exponent;
  const targetLength = decimalPosition + scale;
  let retained: string;
  let discarded: string;
  if (targetLength <= 0) {
    retained = "0";
    discarded = `${"0".repeat(-targetLength)}${digits}`;
  } else if (targetLength >= digits.length) {
    retained = `${digits}${"0".repeat(targetLength - digits.length)}`;
    discarded = "";
  } else {
    retained = digits.slice(0, targetLength);
    discarded = digits.slice(targetLength);
  }
  let minorUnits = BigInt(retained || "0");
  if (discarded[0] !== undefined && discarded[0] >= "5") minorUnits += 1n;
  return negative ? -minorUnits : minorUnits;
}

export function detectLegacyForbiddenClaims(output: unknown): string[] {
  if (!output || typeof output !== "object") return [];
  const root = output as Record<string, any>;
  const analysis = root.fiservFeeAnalysisV2 && typeof root.fiservFeeAnalysisV2 === "object" ? root.fiservFeeAnalysisV2 : {};
  const claims = new Set<string>();
  if (root.selectedFinancials?.totalVolume === 0 && typeof root.selectedFinancials?.effectiveRate === "number") {
    claims.add("ZERO_VOLUME_NUMERIC_EFFECTIVE_RATE");
  }
  if (typeof analysis.processorMarkupAnalysis?.processorControlledTotal === "number") claims.add("EXACT_PROCESSOR_OWNERSHIP_WITHOUT_PROOF");
  if (analysis.bundledPricingBenchmark?.status === "ready") claims.add("UNQUALIFIED_BUNDLED_BENCHMARK");
  if (typeof analysis.estimatedAnnualSavings?.amount === "number" && analysis.estimatedAnnualSavings.amount > 0) {
    claims.add("SAVINGS_WITHOUT_VALID_COUNTERFACTUAL");
  }
  if (analysis.effectiveRateBenchmarkAnalysis?.verdict) claims.add("EFFECTIVE_RATE_AS_PRICING_VERDICT");
  return [...claims].sort();
}

export function summarizeResults(results: AssertionResult[]): Record<GoldOutcome, number> & { total: number } {
  const summary = Object.fromEntries(goldOutcomeValues.map((value) => [value, 0])) as Record<GoldOutcome, number>;
  for (const result of results) summary[result.outcome] += 1;
  return { total: results.length, ...summary };
}

export function validateContractReferences(contract: GoldContract, tolerances: ToleranceRule[], baseline: CurrentBaseline): string[] {
  const errors: string[] = [];
  const assertions = [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions];
  const assertionIds = new Set(assertions.map((item) => item.assertion_id));
  const toleranceIds = new Set(tolerances.map((item) => item.rule_id));
  for (const assertion of assertions) {
    if (assertion.tolerance_rule_ref && !toleranceIds.has(assertion.tolerance_rule_ref)) {
      errors.push(`${assertion.assertion_id} references missing tolerance ${assertion.tolerance_rule_ref}.`);
    }
    if (assertion.tolerance_rule_ref === "TOL-EXACT") errors.push(`${assertion.assertion_id} references retired TOL-EXACT instead of native typed equality.`);
    const tolerance = tolerances.find((item) => item.rule_id === assertion.tolerance_rule_ref);
    if (assertion.comparison_status === "executable" && tolerance?.availability === "unavailable") {
      errors.push(`${assertion.assertion_id} is executable but references unavailable ${tolerance.rule_id}.`);
    }
    if (assertion.comparison_status === "descriptive_reference_only_approximate_policy_unavailable" && tolerance?.availability !== "unavailable") {
      errors.push(`${assertion.assertion_id} is descriptive-only without an unavailable approximate rule.`);
    }
  }
  for (const entry of baseline.entries) {
    if (!assertionIds.has(entry.assertion_id)) errors.push(`Baseline references missing assertion ${entry.assertion_id}.`);
  }
  return errors;
}

export function findPrivacyViolations(value: unknown): string[] {
  const text = JSON.stringify(value);
  const patterns: Array<[string, RegExp]> = [
    ["private local path", /\/(?:Users|home)\//i],
    ["database/upload path", /(?:data\/uploads|\.sqlite)/i],
    ["secret-like value", /(?:\bsk-[A-Za-z0-9_-]+|API_KEY)/i],
    ["private hash", /\b[a-f0-9]{64}\b/i],
    ["known merchant identity", /(?:EL\s+NUEVO|TEQUILA|PHILIP\s+FUTURE|XPRESS\s+FIX|JAMAICA\s+FISH|ANTHONY\s+LAVERNE|VORTAX)/i],
    ["account identifier", /\b\d{8,}\b/],
  ];
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function observedValue(assertion: GoldAssertion, observation: GoldObservation): unknown {
  const expected = assertion.expected_value_or_state;
  if (expected.kind === "conclusion") return observation.claims.includes(expected.claim_code);
  return expected.kind === "state" ? observation.states[assertion.field_or_conclusion] : observation.values[assertion.field_or_conclusion];
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function makeResult(
  assertion: GoldAssertion,
  outcome: GoldOutcome,
  candidateComparison: AssertionResult["candidateComparison"],
  issueId: string | null,
  message: string,
): AssertionResult {
  return { assertionId: assertion.assertion_id, caseId: assertion.case_id, outcome, candidateComparison, issueId, message };
}

const compactFactSchema = z
  .object({
    id: z.string().regex(/^[A-Z0-9-]+$/),
    field: z.string().min(1),
    value: jsonValueSchema.optional(),
    state: z.string().min(1).optional(),
    tolerance: z.string().regex(/^TOL-[A-Z0-9-]+$/).optional(),
    basis: z.enum(["source_observed", "deterministic_math", "approved_policy", "synthetic_scenario"]).optional(),
    tier: z.enum(canonicalDerivabilityTiers).optional(),
    alternatives: z.array(jsonValueSchema).optional(),
    forbidden_values: z.array(jsonValueSchema).optional(),
    dependencies: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (("value" in item) === ("state" in item)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Compact facts require exactly one of value or state." });
    }
  });

const compactConclusionSchema = z
  .object({
    id: z.string().regex(/^[A-Z0-9-]+$/),
    code: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
    present: z.boolean(),
    basis: z.enum(["source_observed", "deterministic_math", "approved_policy", "synthetic_scenario", "merchant_theme"]).optional(),
    tier: z.enum(canonicalDerivabilityTiers).optional(),
    dependencies: z.array(z.string().min(1)).optional(),
  })
  .strict();

const compactCaseSchema = z
  .object({
    case_id: z.string().regex(/^(?:G[1-9]|S10|S[1-9])$/),
    title: z.string().min(1),
    case_kind: z.enum(["real_statement", "synthetic_adversarial"]),
    gold_status: z.enum(["gold_full", "gold_bounded", "gold_limited", "synthetic"]),
    evaluation_scope: z.enum(["falsification_only", "supported_product_regression"]),
    gold_scope: z.enum(["full_statement", "bounded_observed_sections", "limited_document", "synthetic_scenario"]),
    source_ref: z.string().min(1),
    source: sourceSchema,
    effective_period: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
    applicability_scope: z.string().min(1),
    synthetic_input_readiness: z
      .enum(["synthetic_input_fully_derivable", "synthetic_input_requires_product_decision", "synthetic_input_insufficiently_specified"])
      .nullable(),
    synthetic_input: jsonValueSchema.nullable(),
    facts: z.array(compactFactSchema),
    conclusions: z.array(compactConclusionSchema),
  })
  .strict();

const compactCatalogSchema = z
  .object({
    schema_version: z.literal("ratereveal_gold_catalog_final_v3"),
    cases: z.array(compactCaseSchema).length(19),
    global_prohibitions: z.array(compactConclusionSchema).length(25),
  })
  .strict();

type CompactCase = z.infer<typeof compactCaseSchema>;
type CompactConclusion = z.infer<typeof compactConclusionSchema>;

function expandCompactCase(item: CompactCase): GoldCase {
  const assertions: GoldAssertion[] = [
    ...item.facts.map((fact) => ({
      assertion_id: `${item.case_id}-${fact.id}`,
      case_id: item.case_id,
      field_or_conclusion: fact.field,
      expected_value_or_state: "state" in fact ? { kind: "state" as const, state: fact.state! } : { kind: "value" as const, value: fact.value },
      tolerance_rule_ref: fact.tolerance ?? null,
      allowed_alternatives: fact.alternatives ?? [],
      forbidden_values: fact.forbidden_values ?? [],
      source_refs: [item.source_ref],
      statement_evidence_refs: [],
      statement_evidence_status: statementEvidenceStatus(item),
      evidence_mapping_status: evidenceMappingStatus(item),
      assertion_basis: fact.basis ?? (item.case_kind === "synthetic_adversarial" ? "synthetic_scenario" : "source_observed"),
      derivability_tier:
        fact.tier ??
        (item.case_kind === "synthetic_adversarial"
          ? "deterministically_derivable_from_statement"
          : fact.basis === "deterministic_math"
            ? "deterministically_derivable_from_statement"
            : "stated_on_statement"),
      knowledge_dependencies: fact.dependencies ?? [],
      gold_scope: item.gold_scope,
      applicability_scope: item.applicability_scope,
      confidence: null,
      confidence_status: "not_explicitly_supplied_requires_review",
      effective_period: item.effective_period,
      effective_period_status: item.effective_period === null ? "not_time_sensitive" : "explicitly_frozen",
      contract_role: fact.id === "PRICE-SUMMARY" ? "noncanonical_deterministic_projection" : "canonical_value_or_state",
      comparison_status:
        fact.tolerance === "TOL-MONEY-APPROX" || fact.tolerance === "TOL-RATE-APPROX"
          ? "descriptive_reference_only_approximate_policy_unavailable"
          : "executable",
      required_denominator: fact.tolerance === "TOL-RATE-4DP-PERCENT" ? "canonical_net_submitted_card_volume" : null,
      approval: productOwnerApproval("product-owner-gold-finalization-D1-D8-2026-08-22"),
    })),
    ...item.conclusions.map((conclusion) =>
      expandCompactConclusion(
        item.case_id,
        item.gold_scope,
        item.source_ref,
        conclusion,
        item.effective_period,
        item.applicability_scope,
        statementEvidenceStatus(item),
      ),
    ),
  ];
  return {
    case_id: item.case_id,
    title: item.title,
    case_kind: item.case_kind,
    gold_status: item.gold_status,
    evaluation_scope: item.evaluation_scope,
    source: item.source,
    effective_period: item.effective_period,
    applicability_scope: item.applicability_scope,
    synthetic_input_readiness: item.synthetic_input_readiness,
    synthetic_input: item.synthetic_input,
    assertions,
  };
}

function expandCompactConclusion(
  caseId: string,
  goldScope: GoldAssertion["gold_scope"],
  sourceRef: string,
  item: CompactConclusion,
  effectivePeriod: string | null = null,
  applicabilityScope?: string,
  evidenceStatus?: GoldAssertion["statement_evidence_status"],
): GoldAssertion {
  const isTheme = item.basis === "merchant_theme";
  return {
    assertion_id: `${caseId}-${item.id}`,
    case_id: caseId,
    field_or_conclusion: `${isTheme ? "theme" : "claim"}.${item.code}`,
    expected_value_or_state: isTheme
      ? {
          kind: "semantic_theme_coverage",
          coverage_code: item.code,
          requirement: "required_when_evidence_and_applicability_met",
          grouping_policy: "grouping_allowed_only_when_economic_meaning_evidence_boundaries_and_actionability_are_preserved",
        }
      : {
          kind: "conclusion",
          claim_code: item.code,
          present: item.present,
          polarity: item.present ? "required" : "prohibited",
          claim_scope: caseId === "GLOBAL" ? "global" : "case",
        },
    tolerance_rule_ref: null,
    allowed_alternatives: [],
    forbidden_values: [],
    source_refs: [sourceRef],
    statement_evidence_refs: [],
    statement_evidence_status:
      evidenceStatus ??
      (caseId === "GLOBAL"
        ? "not_applicable_global_policy"
        : caseId.startsWith("S")
          ? "not_applicable_synthetic"
          : caseId === "G9"
            ? "source_unavailable"
            : "requires_authoritative_source_mapping"),
    evidence_mapping_status:
      caseId === "GLOBAL"
        ? "not_applicable_global_policy"
        : caseId.startsWith("S")
          ? "not_applicable_synthetic"
          : caseId === "G9"
            ? "source_unavailable"
            : "pending_authoritative_mapping",
    assertion_basis: item.basis ?? "approved_policy",
    derivability_tier: item.tier ?? "inferable_from_statement_with_qualification",
    knowledge_dependencies: item.dependencies ?? [],
    gold_scope: goldScope,
    applicability_scope:
      applicabilityScope ??
      (caseId === "GLOBAL"
        ? "all_supported_outputs_when_the_prohibited_economic_predicate_applies"
        : goldScope === "synthetic_scenario"
          ? "frozen_synthetic_scenario_only"
          : goldScope),
    confidence: null,
    confidence_status: "not_explicitly_supplied_requires_review",
    effective_period: effectivePeriod,
    effective_period_status: effectivePeriod === null ? "not_time_sensitive" : "explicitly_frozen",
    contract_role: isTheme ? "semantic_theme_coverage" : "semantic_claim",
    comparison_status: "executable",
    required_denominator: null,
    approval: productOwnerApproval(isTheme ? "product-owner-gold-finalization-D7-2026-08-22" : "product-owner-gold-finalization-D6-D8-2026-08-22"),
  };
}

function statementEvidenceStatus(item: CompactCase): GoldAssertion["statement_evidence_status"] {
  if (item.case_kind === "synthetic_adversarial") return "not_applicable_synthetic";
  return item.source.availability === "source_unavailable" ? "source_unavailable" : "requires_authoritative_source_mapping";
}

function evidenceMappingStatus(item: CompactCase): GoldAssertion["evidence_mapping_status"] {
  if (item.case_kind === "synthetic_adversarial") return "not_applicable_synthetic";
  return item.source.availability === "source_unavailable" ? "source_unavailable" : "pending_authoritative_mapping";
}

function productOwnerApproval(approvalRef: string) {
  return { status: "approved" as const, authority: "product_owner" as const, approval_ref: approvalRef };
}
