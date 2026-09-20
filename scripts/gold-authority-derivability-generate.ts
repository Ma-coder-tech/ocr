import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { loadCurrentBaseline, loadGoldContract } from "./gold-contract-lib.js";
import {
  CONTRACT_VERSION,
  FREEZE_DATE,
  MANIFEST_VERSION,
  REGISTER_VERSION,
  SCHEMA_VERSION,
  assertNormalizedRegister,
  buildNormalizedRegister,
  decomposedAssertionIds,
  jsonSchema,
  mixedAssertionIds,
  reannotatedMixedAssertionIds,
  repositoryPath,
  sha256File,
  stableJson,
  type NormalizedAuthorityRegister,
} from "./gold-authority-derivability-lib.js";

const artifactsRoot = repositoryPath("artifacts", "gold-contract");
const fixtureRoot = repositoryPath("test", "fixtures", "gold-contract");

const outputPaths = {
  humanSpecification: path.join(artifactsRoot, "RateReveal_Gold_Authority_Derivability_Contract_v1.md"),
  schema: path.join(fixtureRoot, "gold-authority-derivability.schema.json"),
  register: path.join(fixtureRoot, "gold-authority-derivability-v1.json"),
  conflictReport: path.join(artifactsRoot, "Gold_Authority_Derivability_Conflict_Report_v1.md"),
  manifest: path.join(artifactsRoot, "gold-authority-derivability-freeze-manifest-v1.json"),
} as const;

const sourceInputs = [
  repositoryPath("test", "fixtures", "gold-contract", "gold-catalog-v0.3.final.json"),
  repositoryPath("test", "fixtures", "gold-contract", "gold-metadata-clarification-v0.1.json"),
  repositoryPath("test", "fixtures", "gold-contract", "tolerance-rules.final.json"),
  repositoryPath("test", "fixtures", "gold-contract", "current-baseline.json"),
  repositoryPath("scripts", "gold-contract-lib.ts"),
] as const;

function relative(filePath: string): string {
  return path.relative(process.cwd(), filePath);
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" }).trim();
}

function recordTable(record: Record<string, number>): string {
  return Object.entries(record).map(([name, count]) => `| \`${name}\` | ${count} |`).join("\n");
}

function assertionList(values: Iterable<string>): string {
  return [...values].sort().map((value) => `\`${value}\``).join(", ");
}

function humanSpecification(register: NormalizedAuthorityRegister): string {
  const provenanceRows = register.caseProvenance.map((item) =>
    `| ${item.caseId} | ${item.caseKind} | ${item.originalAssertionCount} | ${item.normalizedAssertionCount} | \`${item.sourceIdentityStatus}\` | \`${item.sourceExecutionStatus}\` | \`${item.provenanceStatus}\` |`,
  ).join("\n");

  return `# RateReveal Gold Authority & Derivability Contract v1

Status: **Frozen Product contract**  
Contract identity: \`${CONTRACT_VERSION}\`  
Register identity: \`${REGISTER_VERSION}\`  
Schema identity: \`${SCHEMA_VERSION}\`  
Freeze date: ${FREEZE_DATE}

## 1. Purpose and force

This document and its machine-readable schema/register freeze the authority and derivability meaning of RateReveal Gold. Future engineering may implement this contract, but may not silently redefine its assertion semantics, authority lanes, missing-authority behavior, provenance boundaries, or permitted customer language.

This freeze authorizes future engineering specification against the contract and future independent evaluation of the frozen outcomes. It does **not** authorize production parser changes, canonical classification or ownership changes, opportunity/savings changes, Phase 2 evidence admission, live research, a universal fee taxonomy, private-document infrastructure, a knowledge-corpus migration, customer report or frontend changes, provider/model/configuration changes, deployment, or any claim that source mappings are complete.

## 2. Frozen Product principles

1. Material conclusions are independent claims. An observed value, calculation, structural inference, normalized identity, ownership dimension, policy judgment, and resolution state must not share one overloaded truth state.
2. Reasoning class is independent of resolution status. \`unresolved_or_refused\` is not a reasoning method.
3. Authority is claim-specific. There is no universal source hierarchy and no evidence lane may establish a dimension outside its authority.
4. Labels are evidence, not authority. Familiar labels can be observed and can create hypotheses; alone they cannot establish architecture, official identity, ownership, beneficiary, contractual control, at-cost treatment, negotiability, or removability.
5. Broad economic category is separate from exact normalized identity. \`merchant_pricing_component\` is not synonymous with \`processor_markup\`.
6. Processor markup is a strong claim. It requires compatible evidence of the merchant-facing component and underlying cost or merchant-private processor-control evidence. Markup is not retained profit.
7. Ownership is multidimensional: biller/issuer, collector, economic beneficiary, contractual controller, merchant-facing price controller, and retained-margin recipient remain separate.
8. Unknown is a valid state. Missing authority must not be coerced into a known category for coverage.
9. Product policy is not statement, financial, contractual, or industry truth, even when deterministic.
10. Correct refusal is successful behavior. Unsupported positive admission, evidence-lane leakage, historical back-projection, and unreviewed merchant-private-to-global promotion each have zero tolerance.

## 3. Stable reasoning classes

| Reasoning class | Permitted meaning |
|---|---|
| \`direct_observation\` | A value, label, date, amount, section, or other fact present in the accepted source scope. |
| \`deterministic_calculation\` | Reproducible arithmetic from admitted observations, with compatible sign, denominator, units, and population. |
| \`template_structural_inference\` | A documented relationship within a versioned statement/template family; never universal by default. |
| \`economic_structural_inference\` | Broad mechanics, component, or pricing-shape inference with explicit limitations. |
| \`governed_public_dependency\` | Effective-dated official network/regulator or processor/acquirer publication within publisher, scope, population, and geography. |
| \`merchant_private_dependency\` | Merchant-specific contract, schedule, correspondence, or processor explanation. |
| \`product_policy_judgment\` | Reviewed materiality, visibility, priority, blocking, reportability, severity, action-language, or suppression policy. |

Resolution uses the separate states \`supported\`, \`partially_supported\`, \`unresolved\`, \`refused\`, \`source_mapping_incomplete\`, \`source_unavailable\`, \`gold_ambiguity\`, and \`policy_blocked\`. A refusal can therefore retain the reasoning class that establishes why a positive claim is prohibited.

Each assertion records both \`resolution.semanticStatus\`/\`semanticEvaluationOutcome\` and \`resolution.status\`/\`expectedEvaluationOutcome\`. The former freezes the approved meaning (including a correct refusal); the latter records present source-execution readiness. Thus a G1-G8 refusal remains semantically refused while current evaluation is blocked by source mapping. G9 remains historical guidance, not a source-executable pass.

## 4. Claim-specific authority lanes

| Authority lane | Approved authority |
|---|---|
| \`statement_source_document\` | What was printed, represented, billed, and charged within accepted document scope. |
| \`deterministic_arithmetic\` | Arithmetic using admitted inputs and an explicit compatible denominator/population. |
| \`versioned_template_mapping\` | Documented within-template relationships only. |
| \`statement_structural_evidence\` | Broad mechanics or pricing shape; not exact owner, official identity, contract, or retained profit. |
| \`governed_network_regulator\` | Official network/regulatory rules, programs, rates, populations, and periods within stated scope. |
| \`governed_processor_acquirer_publication\` | The publisher's own schedule or program description within stated scope. |
| \`governed_public_mixed\` | A claim requiring compatible governed public lanes that cannot safely be reduced to one publisher class. |
| \`merchant_private_contract_or_correspondence\` | Merchant-specific contractual facts; never reusable global truth without a separate reviewed process. |
| \`reviewed_product_policy\` | Product materiality, wording, visibility, priority, blocking, and action ceilings. |
| \`synthetic_falsification_input\` | Adversarial test semantics only; never an expansion of production processor support. |

Every normalized assertion carries both a claim dimension and one or more authority lanes. Those fields are deliberately independent.

## 5. Strong-claim boundaries

### Processor markup and ownership

Position, percentage basis, processor-branded section, and labels such as \`DISC\`, \`QUAL\`, or \`NQUAL\` cannot establish processor markup. Processor billing or collection cannot establish economic beneficiary, contractual controller, price controller, or retained-margin recipient. Each ownership/control dimension needs compatible authority.

### Narrow replacement for \`proven_at_cost\`

The broad future meaning of \`proven_at_cost\` is retired. Rate equality may establish only an equality-under-tolerance claim after the reference publisher, effective period, scope/population, billing basis, and denominator are admitted. It does not prove contractual pass-through, absence of separately billed spread, or processor retention. Future implementations should use narrow states such as \`observed_rate_matches_admitted_reference\`, \`observed_rate_exceeds_admitted_reference\`, \`observed_rate_below_admitted_reference\`, \`reference_scope_or_period_insufficient\`, \`contractual_pass_through_unverified\`, and \`processor_retention_unverified\`.

### Recurrence and annualization

Observed statement-period amount, recurrence status, cadence, annualization permission, annualized amount, and estimated annual amount are separate claims. Recurrence requires explicit statement cadence, repeated compatible statements, an effective-dated governed program cadence, or merchant-private agreement. A single unlabeled occurrence is neither monthly nor annual.

### Benchmark, counterfactual, and savings

Observed cost alone does not create savings. A savings claim requires a named counterfactual plus target authority, compatible identity, scope, population, denominator, historical/effective period, merchant applicability, recurrence/cadence, document completeness, and overlap controls. Missing any required link produces a typed refusal or unresolved state and blocks downstream savings.

## 6. Independent completeness gates

| Gate | Minimum authority question |
|---|---|
| Observed-page fact eligibility | Is the fact present on an accepted page/section? |
| Statement-total eligibility | Are all contributing sections/pages and sign conventions reconciled? |
| Fee-composition eligibility | Are gross charges, credits/adjustments, repeated representations, unresolved amounts, and exclusions explicitly accounted for? |
| Pricing-architecture eligibility | Is the accepted scope sufficient for architecture, rather than one page or familiar labels? |
| Comparison eligibility | Are identity, scope, population, denominator, and effective period compatible? |
| Actionability eligibility | Is contractual/control authority present and is Product policy satisfied? |
| Savings eligibility | Is the full counterfactual, cadence, completeness, and non-overlap chain satisfied? |

Accounting completeness compares printed gross fees with reconciled contributing charges. Economic-classification completeness uses printed gross fees and separately identifies credits/adjustments. Merchant-facing completeness uses printed gross fees while explicitly reporting unresolved/excluded amounts, repeated representations, credits/adjustments, and partial coverage. Signed canonical contribution totals remain useful but are not the sole economic-coverage denominator.

## 7. Temporal, universality, provenance, and refusal

Public claims are effective-dated and cannot be projected backward. A current source does not prove a historical period. Every assertion declares one universality scope: universal acquiring/accounting, network-specific, processor-family-specific, template-specific, merchant/account-specific, or Product-policy-only.

Semantic approval is separate from source executability, source identity, and provenance. G1-G8 semantics are approved but source mapping remains incomplete; G6 exact source identity remains unresolved; G9 is preserved as non-executable historical semantic guidance because its original source is unavailable. Repository fixtures remain provisional unless authoritative equivalence is proven. S1-S10 remain synthetic. The 25 global prohibitions remain Product policy.

When authority is missing, the evaluator must preserve any independently supported narrower claim, return a typed refusal or unresolved state for the stronger claim, and block dependent dimensions. Correct refusal is a passing semantic outcome.

## 8. Decomposition and lineage

The source corpus contains ${register.sourceGold.originalAssertionCount} approved assertions. The normalized register contains ${register.decomposition.normalizedAssertionCount}. Product identified ${register.decomposition.adjudicatedMixedAssertionCount} mixed assertions: ${register.decomposition.decomposedOriginalAssertionCount} are split into independent children and ${register.decomposition.reannotatedOriginalAssertionCount} are re-annotated without changing their approved meaning.

Decomposed originals: ${assertionList(decomposedAssertionIds)}.

Re-annotated mixed originals: ${assertionList(reannotatedMixedAssertionIds)}.

Every normalized child carries \`lineage.sourceAssertionId\`, a decomposition kind, and a flag showing whether that child preserves the original expected value. No original assertion is dropped. No decomposition requires Product clarification under the completed adjudication.

## 9. Evaluation taxonomy and future metrics

The independent outcomes are \`correct_answer\`, \`correct_refusal\`, \`unsupported_inference\`, \`incorrect_conclusion\`, \`extraction_failure\`, \`missing_source_authority\`, \`gold_ambiguity\`, \`source_mapping_incomplete\`, and \`policy_mismatch\`.

The schema supports future measurement of direct-observation and deterministic-calculation accuracy; denominator/population correctness; reconciliation coverage; template/economic/normalized-identity precision; false admission and unsupported inference; correct refusal; public-authority coverage; private dependency; effective-date correctness; provenance completeness; unresolved gross/signed dollars; completeness gates; counterfactual validity; savings false positives; and Product-policy conformance. Search-result count and candidate retrieval count are not primary quality measures. This contract sets no new production threshold.

## 10. Frozen register counts

### Reasoning class

| Class | Count |
|---|---:|
${recordTable(register.counts.reasoningClass)}

### Primary authority lane

| Lane | Count |
|---|---:|
${recordTable(register.counts.primaryAuthorityLane)}

### Resolution status

| Status | Count |
|---|---:|
${recordTable(register.counts.resolutionStatus)}

### Approved semantic resolution (independent of source executability)

| Status | Count |
|---|---:|
${recordTable(register.counts.semanticResolutionStatus)}

### Source execution status

| Status | Count |
|---|---:|
${recordTable(register.counts.sourceExecutionStatus)}

### Source provenance status

| Status | Count |
|---|---:|
${recordTable(register.counts.sourceProvenanceStatus)}

## 11. Case provenance

| Case | Kind | Original | Normalized | Source identity | Execution | Provenance |
|---|---|---:|---:|---|---|---|
${provenanceRows}

## 12. Case-specific semantic boundaries

- **G1:** Composite pricing and the observed \`QUAL DISC\` label remain distinct; exact ownership, pricing-fairness, and dispute-ratio claims are refused without their own authority.
- **G2:** Tiered/bundled structure and \`ADDITIONAL FEES\` remain bounded observations; exact interchange/processor split is refused and Visa activity remains ambiguous.
- **G3:** Zero denominator yields an undefined effective rate, not numeric zero; minimum fee is observed, while recurrence and zero-volume pricing model remain independently unresolved.
- **G4:** Itemized mechanics, WATS, regulated-debit/rewards populations, and denominator-specific rate options are separate; neither labels nor ratios confer exact owner or a pricing verdict.
- **G5:** Preserve 2.0740% precision on its canonical denominator; ECR/WATS/Amex mapping and ownership limits remain distinct from any unsupported comparison-population counterfactual or savings.
- **G6:** Exact source identity and mapping remain unresolved; service removability depends on merchant-private terms and an authorization-fee label does not prove economic ownership.
- **G7:** Future notice is effective-dated, not back-projected; administrative/per-item ownership, debit share, and contract dependency are separately gated.
- **G8:** The 3.8% flat bundled merchant price is not all processor margin; benchmark, counterfactual, savings, and dispute-ratio claims remain refused without their separate evidence chains.
- **G9:** Page-bounded facts remain historical semantic guidance. The missing original source bars source execution, and partial-document coverage suppresses full pricing/decomposition/savings conclusions.
- **S1-S10:** Respectively preserve scope-specific bundled pricing; genuine hybrid structure; subscription plus pass-through; dual-pricing net burden; direct-Amex structure; adjustment outside fees; untrusted-content injection refusal; equal-specificity knowledge conflict; benchmark denominator mismatch; and savings-without-counterfactual refusal. They remain synthetic falsification cases.
- **GLOBAL:** All 25 prohibitions remain explicit reviewed Product-policy reasoning constraints, not inferred financial or industry facts.

## 13. Machine contract

The authoritative machine representation is \`test/fixtures/gold-contract/gold-authority-derivability-v1.json\`, validated by \`test/fixtures/gold-contract/gold-authority-derivability.schema.json\`. The deterministic freeze manifest binds this document, schema, register, conflict report, and source inputs with SHA-256 hashes.
`;
}

function conflictReport(register: NormalizedAuthorityRegister, baseline: Awaited<ReturnType<typeof loadCurrentBaseline>>): string {
  const reviewedRows = baseline.entries.map((item) =>
    `| \`${item.assertion_id}\` | \`${item.issue_id}\` | ${item.description} | ${item.deferred_to} |`,
  ).join("\n");
  const sourceGapRows = register.caseProvenance
    .filter((item) => item.caseKind === "real_statement")
    .map((item) => `| ${item.caseId} | \`${item.sourceIdentityStatus}\` | \`${item.sourceExecutionStatus}\` | ${item.limitation} |`)
    .join("\n");

  return `# RateReveal Gold Authority & Derivability Conflict Report v1

Status: Frozen companion report  
Contract: \`${CONTRACT_VERSION}\`  
Freeze date: ${FREEZE_DATE}

This report records conflicts and gaps; it does not change production behavior.

## 1. Reviewed current-output conflicts

| Gold assertion | Issue | Current conflict | Deferred package |
|---|---|---|---|
${reviewedRows}

The 10 reviewed baseline conflicts comprise seven cases where current behavior is stronger than Gold permits (G1 exact owner; G4 exact owner and rate verdict; G7 exact owner and rate verdict; G8 benchmark and savings) and three numeric/precision conflicts (G3 rate state and numeric conclusion; G5 rate precision).

## 2. Additional current canonical-semantic conflicts

These are code-level conflict surfaces, not additional rewritten Gold answers:

- \`src/fiservProcessorFeeClassification.ts:361-366\` and \`:418-423\` map a reference-rate match to broad \`proven_at_cost\`. The frozen contract permits only a narrow admitted-reference equality claim and keeps contractual pass-through, separately billed spread, and processor retention independent.
- \`src/canonical/feeOwnershipActionability.ts:331-347\` deterministically assigns interchange economic beneficiary and contractual controller. Gold requires claim-specific authority and preserves ownership limits where the statement alone is insufficient.
- \`src/canonical/feeOwnershipActionability.ts:389-405\` and \`:409-424\` can assign processor ownership/control from deterministic patterns. The frozen contract requires compatible component plus underlying-cost or merchant-private authority and forbids treating markup as retained profit.
- \`src/canonical/opportunityPolicy.ts:78-137\` already preserves conservative cadence/annualization separation; no conflict was found in that reviewed surface.

No production file is changed by this freeze.

## 3. Gold ambiguity and Product clarification

Product clarification items: **0**. Product adjudicated the 49 mixed assertions. Twenty-one are decomposed with explicit lineage and 28 are re-annotated without changing approved semantic meaning. Source gaps are not Product semantic ambiguity and remain visible as source statuses.

Decomposed originals: ${assertionList(decomposedAssertionIds)}.

Re-annotated mixed originals: ${assertionList(reannotatedMixedAssertionIds)}.

## 4. Source authority and executability gaps

| Case | Source identity | Source execution | Limitation |
|---|---|---|---|
${sourceGapRows}

The secure authoritative source manifest was not available to this offline package (\`RATEREVEAL_PRIVATE_CORPUS_DIR\` was not configured). No repository fixture was promoted. The normalized counts remain ${register.counts.sourceExecutionStatus.not_source_executable ?? 0} non-source-executable assertions for G1-G8 and ${register.counts.sourceExecutionStatus.source_unavailable ?? 0} source-unavailable normalized assertions for G9. A future independently adjudicated, source-backed partial-document case is still required before G9 behavior is fully source-executable.

## 5. Terminology for later deprecation or narrowing

| Existing term | Later action | Frozen replacement/boundary |
|---|---|---|
| \`proven_at_cost\` | Retire as broad truth | Narrow admitted-reference comparison plus separate pass-through, spread, and retention claims. |
| \`owner\` | Deprecate when unqualified | Biller/issuer, collector, economic beneficiary, contractual controller, merchant-facing price controller, retained-margin recipient. |
| \`processor markup\` from labels/position | Prohibit | Broad merchant pricing component unless required underlying-cost or private authority exists. |
| \`processor-controlled total\` | Narrow | Dimension-specific, evidence-bound control claims only. |
| \`junk fee\` / \`avoidable fee\` | Avoid as factual category | Reviewed Product policy plus authority-backed actionability. |
| \`monthly\` inferred from one statement | Prohibit | Explicit cadence evidence and separate annualization permission. |
| \`savings\` from observed cost | Prohibit | Named, authority-backed, compatible, non-overlapping counterfactual chain. |
| one \`pricing model\` label | Decompose | Underlying-cost mode, merchant price schedule shape, scope uniformity, and other independent axes. |

## 6. Freeze boundary

The conflicts above remain intentionally unfixed. This package does not authorize the future Claim and Authority implementation, production architecture changes, live evidence admission, private infrastructure, UI/report changes, or deployment.
`;
}

async function hashesFor(files: readonly string[]) {
  return Object.fromEntries(await Promise.all(files.map(async (filePath) => [relative(filePath), await sha256File(filePath)] as const)));
}

async function main(): Promise<void> {
  const [contract, baseline] = await Promise.all([loadGoldContract(), loadCurrentBaseline()]);
  const register = buildNormalizedRegister(contract);
  assertNormalizedRegister(register);

  await Promise.all([fs.mkdir(artifactsRoot, { recursive: true }), fs.mkdir(fixtureRoot, { recursive: true })]);
  await Promise.all([
    fs.writeFile(outputPaths.humanSpecification, humanSpecification(register)),
    fs.writeFile(outputPaths.schema, stableJson(jsonSchema())),
    fs.writeFile(outputPaths.register, stableJson(register)),
    fs.writeFile(outputPaths.conflictReport, conflictReport(register, baseline)),
  ]);

  const contractFiles = [outputPaths.humanSpecification, outputPaths.schema, outputPaths.register, outputPaths.conflictReport] as const;
  const manifest = {
    manifestVersion: MANIFEST_VERSION,
    frozenAt: FREEZE_DATE,
    deterministic: true,
    identities: {
      document: "RateReveal_Gold_Authority_Derivability_Contract_v1",
      contract: CONTRACT_VERSION,
      schema: SCHEMA_VERSION,
      register: REGISTER_VERSION,
    },
    repository: {
      branch: git("branch", "--show-current"),
      head: git("rev-parse", "HEAD"),
    },
    generation: {
      command: "node scripts/run-node-tool.mjs --import tsx scripts/gold-authority-derivability-generate.ts",
      node: process.version,
      networkCalls: false,
      sourceManifestAvailable: false,
      sourceManifestReason: "RATEREVEAL_PRIVATE_CORPUS_DIR was not configured; no provisional fixture was promoted.",
    },
    counts: {
      originalAssertions: register.sourceGold.originalAssertionCount,
      adjudicatedMixedAssertions: mixedAssertionIds.size,
      decomposedOriginalAssertions: decomposedAssertionIds.size,
      reannotatedMixedAssertions: reannotatedMixedAssertionIds.size,
      normalizedAssertions: register.assertions.length,
      productClarificationItems: register.assertions.filter((item) => item.adjudication.productClarificationRequired).length,
      reasoningClass: register.counts.reasoningClass,
      primaryAuthorityLane: register.counts.primaryAuthorityLane,
      resolutionStatus: register.counts.resolutionStatus,
      semanticResolutionStatus: register.counts.semanticResolutionStatus,
      sourceExecutionStatus: register.counts.sourceExecutionStatus,
      sourceIdentityStatus: register.counts.sourceIdentityStatus,
      sourceProvenanceStatus: register.counts.sourceProvenanceStatus,
      evidenceMappingStatus: register.counts.evidenceMappingStatus,
      semanticApprovalStatus: register.counts.semanticApprovalStatus,
      evaluationOutcome: register.counts.evaluationOutcome,
      semanticEvaluationOutcome: register.counts.semanticEvaluationOutcome,
      canonicalConflictStatus: register.counts.canonicalConflictStatus,
    },
    hashes: {
      contractArtifacts: await hashesFor(contractFiles),
      sourceInputs: await hashesFor(sourceInputs),
    },
    freezeSemantics: register.freezeSemantics,
    validation: {
      requiredCommand: "node scripts/run-node-tool.mjs --import tsx scripts/gold-authority-derivability-validate.ts",
      invariants: 20,
      manifestSelfHashExcluded: true,
    },
  };
  await fs.writeFile(outputPaths.manifest, stableJson(manifest));

  process.stdout.write(stableJson({
    ok: true,
    outputs: Object.fromEntries(Object.entries(outputPaths).map(([key, value]) => [key, relative(value)])),
    counts: manifest.counts,
    hashes: manifest.hashes.contractArtifacts,
  }));
}

await main();
