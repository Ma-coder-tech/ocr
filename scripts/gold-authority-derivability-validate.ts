import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { loadGoldContract } from "./gold-contract-lib.js";
import {
  CONTRACT_VERSION,
  MANIFEST_VERSION,
  REGISTER_VERSION,
  SCHEMA_VERSION,
  assertNormalizedRegister,
  buildNormalizedRegister,
  decomposedAssertionIds,
  jsonSchema,
  mixedAssertionIds,
  repositoryPath,
  sha256File,
  type NormalizedAuthorityRegister,
} from "./gold-authority-derivability-lib.js";

type FreezeManifest = {
  manifestVersion: string;
  identities: { contract: string; register: string; schema: string };
  counts: { originalAssertions: number; normalizedAssertions: number; productClarificationItems: number } & NormalizedAuthorityRegister["counts"];
  hashes: { contractArtifacts: Record<string, string>; sourceInputs: Record<string, string> };
  freezeSemantics: NormalizedAuthorityRegister["freezeSemantics"];
  validation: { invariants: number; manifestSelfHashExcluded: boolean };
};

const checks: string[] = [];
function check(name: string, test: () => void): void {
  test();
  checks.push(name);
}

async function main(): Promise<void> {
  const contract = await loadGoldContract();
  const registerPath = repositoryPath("test", "fixtures", "gold-contract", "gold-authority-derivability-v1.json");
  const schemaPath = repositoryPath("test", "fixtures", "gold-contract", "gold-authority-derivability.schema.json");
  const manifestPath = repositoryPath("artifacts", "gold-contract", "gold-authority-derivability-freeze-manifest-v1.json");
  const [register, schema, manifest] = await Promise.all([
    fs.readFile(registerPath, "utf8").then((contents) => JSON.parse(contents) as NormalizedAuthorityRegister),
    fs.readFile(schemaPath, "utf8").then(JSON.parse),
    fs.readFile(manifestPath, "utf8").then((contents) => JSON.parse(contents) as FreezeManifest),
  ]);
  const originals = [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions];
  const bySource = Map.groupBy(register.assertions, (item) => item.lineage.sourceAssertionId);

  check("01 every approved original assertion represented with exactly one preserving child", () => {
    assert.equal(originals.length, 348);
    assert.deepEqual([...bySource.keys()].sort(), originals.map((item) => item.assertion_id).sort());
    for (const original of originals) {
      const children = bySource.get(original.assertion_id)!;
      assert.equal(children.filter((child) => child.lineage.preservesOriginalExpected).length, 1, original.assertion_id);
      assert.deepEqual(children.find((child) => child.lineage.preservesOriginalExpected)!.claim.expected, original.expected_value_or_state, original.assertion_id);
      assert.ok(children.every((child) => child.caseId === original.case_id), original.assertion_id);
    }
  });
  check("02 counts and normalized register invariants reconcile", () => assertNormalizedRegister(register));
  check("03 no mixed assertion silently dropped", () => {
    assert.equal(mixedAssertionIds.size, 49);
    assert.equal(decomposedAssertionIds.size, 21);
    for (const id of mixedAssertionIds) assert.ok(bySource.has(id), id);
    for (const id of decomposedAssertionIds) assert.equal(bySource.get(id)?.length, 2, id);
  });
  check("04 no provisional source promoted", () => {
    assert.ok(register.assertions.filter((item) => /^G[1-8]$/.test(item.caseId)).every((item) => item.authority.sourceProvenanceStatus === "unproven" && item.provenance.evidenceMappingStatus === "pending_authoritative_mapping"));
    assert.equal(manifest.counts.sourceExecutionStatus.not_source_executable, 287);
  });
  check("05 G1-G8 source gaps visible", () => assert.ok(register.assertions.filter((item) => /^G[1-8]$/.test(item.caseId)).every((item) => item.resolution.status === "source_mapping_incomplete" && item.provenance.sourceExecutionStatus === "not_source_executable")));
  check("06 G6 exact source identity unresolved", () => assert.ok(register.assertions.filter((item) => item.caseId === "G6").every((item) => item.authority.sourceIdentityStatus === "unresolved_identity")));
  check("07 G9 historical and source-unavailable", () => assert.ok(register.assertions.filter((item) => item.caseId === "G9").every((item) => item.adjudication.status === "frozen_historical_guidance" && item.provenance.sourceExecutionStatus === "source_unavailable")));
  check("08 synthetic and global cases distinct", () => {
    assert.equal(register.assertions.filter((item) => item.caseId.startsWith("S")).length, 31);
    assert.equal(register.assertions.filter((item) => item.caseId === "GLOBAL").length, 25);
    assert.ok(register.assertions.filter((item) => item.caseId.startsWith("S")).every((item) => item.provenance.sourceExecutionStatus === "synthetic_executable"));
    assert.ok(register.assertions.filter((item) => item.caseId === "GLOBAL").every((item) => item.provenance.sourceExecutionStatus === "product_policy_executable"));
  });
  check("09 reasoning and resolution are independent", () => {
    assert.ok(register.assertions.every((item) => item.reasoning.primaryClass !== ("unresolved_or_refused" as string)));
    assert.ok(register.assertions.some((item) => item.reasoning.primaryClass === "product_policy_judgment" && item.resolution.status === "refused"));
    assert.equal(register.assertions.find((item) => item.assertionId === "G1-NO-EXACT-OWNER")?.resolution.semanticStatus, "refused");
    assert.equal(register.assertions.find((item) => item.assertionId === "G1-NO-EXACT-OWNER")?.resolution.status, "source_mapping_incomplete");
  });
  check("10 claim dimension and authority lane are independent", () => {
    assert.ok(register.assertions.every((item) => item.claim.dimension && item.authority.primaryLane && item.authority.requiredLanes.includes(item.authority.primaryLane)));
    assert.ok(register.assertions.some((item) => item.claim.dimension === "economic.normalized_identity" && item.authority.primaryLane === "governed_network_regulator"));
  });
  check("11 Product policy not financial or industry fact", () => {
    assert.ok(register.assertions.filter((item) => item.reasoning.primaryClass === "product_policy_judgment").every((item) => item.authority.primaryLane === "reviewed_product_policy" && item.productPolicy.dependsOnReviewedPolicy));
    assert.ok(register.assertions.filter((item) => item.caseId === "GLOBAL").every((item) => item.universality === "product_policy_only"));
  });
  check("12 no historical public back-projection", () => assert.ok(register.assertions.filter((item) => item.reasoning.primaryClass === "governed_public_dependency").every((item) => item.temporal.effectivePeriodDependency && item.temporal.backProjectionProhibited && item.reasoning.prohibitedShortcuts.includes("historical_back_projection"))));
  check("13 statement-only ownership shortcut prohibited", () => assert.ok(register.assertions.filter((item) => /MARKUP|MARGIN|OWNER|OWNERSHIP|WATS/.test(item.assertionId)).every((item) => item.reasoning.prohibitedShortcuts.includes("statement_structure_as_processor_margin_or_beneficiary"))));
  check("14 markup and at-cost gates retained", () => {
    const gates = register.normativeRules.strongClaimGates;
    assert.ok(gates.find((item) => item.id === "processor_markup")?.requiredEvidence.includes("compatible_underlying_cost_or_merchant_private_processor_control"));
    assert.ok(gates.find((item) => item.id === "reference_rate_equality")?.prohibitedShortcut === "rate_match_as_proven_at_cost");
    assert.ok(gates.find((item) => item.id === "contractual_pass_through")?.missingAuthorityOutcome === "contractual_pass_through_unverified");
  });
  check("15 recurrence and annualization independently gated", () => {
    assert.ok(register.normativeRules.strongClaimGates.some((item) => item.id === "recurrence"));
    assert.ok(register.normativeRules.strongClaimGates.some((item) => item.id === "annualization" && item.requiredEvidence.includes("annualization_permission")));
    assert.ok(register.normativeRules.independentClaimDimensions.includes("estimated_annual_amount"));
  });
  check("16 savings requires valid named counterfactual", () => {
    const savings = register.normativeRules.strongClaimGates.find((item) => item.id === "savings")!;
    assert.ok(savings.requiredEvidence.includes("named_counterfactual") && savings.requiredEvidence.includes("no_overlap"));
    assert.equal(savings.prohibitedShortcut, "observed_cost_as_savings");
  });
  check("17 merchant-private evidence cannot silently promote globally", () => assert.ok(register.assertions.filter((item) => item.reasoning.primaryClass === "merchant_private_dependency").every((item) => item.universality === "merchant_account_specific" && item.reasoning.prohibitedShortcuts.includes("merchant_private_evidence_promoted_to_global_knowledge"))));
  check("18 correct refusal remains passing", () => {
    assert.equal(register.normativeRules.passingAbstentionOutcome, "correct_refusal");
    assert.equal(register.counts.evaluationOutcome.correct_refusal, 38);
    assert.ok(register.counts.semanticEvaluationOutcome.correct_refusal > 38);
  });
  check("19 template and Fiserv semantics not universal", () => assert.ok(register.assertions.filter((item) => item.reasoning.primaryClass === "template_structural_inference" || (/^G[1-9]$/.test(item.caseId) && /QUAL|NQUAL|WATS|ECR|INTERCHANGE|PROGRAM/.test(item.assertionId) && item.reasoning.primaryClass !== "product_policy_judgment")).every((item) => item.universality !== "universal_acquiring_accounting")));
  check("20 schema, reproducibility, and SHA-256 freeze", () => {
    assert.deepEqual(schema, jsonSchema());
    assert.deepEqual(register, buildNormalizedRegister(contract));
    assert.equal(manifest.manifestVersion, MANIFEST_VERSION);
    assert.deepEqual(manifest.identities, { document: "RateReveal_Gold_Authority_Derivability_Contract_v1", contract: CONTRACT_VERSION, schema: SCHEMA_VERSION, register: REGISTER_VERSION });
    assert.equal(manifest.counts.originalAssertions, 348);
    assert.equal(manifest.counts.normalizedAssertions, 369);
    assert.equal(manifest.counts.productClarificationItems, 0);
    for (const [name, values] of Object.entries(register.counts)) {
      assert.deepEqual(manifest.counts[name as keyof NormalizedAuthorityRegister["counts"]], values, name);
    }
    assert.deepEqual(manifest.freezeSemantics, register.freezeSemantics);
    assert.equal(manifest.validation.manifestSelfHashExcluded, true);
    assert.equal(manifest.validation.invariants, 20);
  });

  for (const [group, files] of Object.entries(manifest.hashes)) {
    for (const [relativeFile, expected] of Object.entries(files)) {
      assert.equal(await sha256File(path.resolve(process.cwd(), relativeFile)), expected, `${group}: ${relativeFile}`);
    }
  }
  assert.equal(checks.length, 20);
  process.stdout.write(`${JSON.stringify({ ok: true, checksPassed: checks.length, checks, verifiedHashes: Object.values(manifest.hashes).reduce((sum, values) => sum + Object.keys(values).length, 0), originalAssertions: 348, normalizedAssertions: 369 }, null, 2)}\n`);
}

await main();
