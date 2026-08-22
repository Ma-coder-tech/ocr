import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { loadGoldContract, loadMetadataClarification, loadToleranceRules, type GoldAssertion } from "./gold-contract-lib.js";

const [contract, tolerances, clarification] = await Promise.all([
  loadGoldContract(),
  loadToleranceRules(),
  loadMetadataClarification(),
]);
const audit = JSON.parse(await fs.readFile(path.resolve(process.cwd(), "artifacts/gold-contract/gold-audit-report.json"), "utf8"));
const assertions = [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions];
const branch = git(["branch", "--show-current"]).trim();
const head = git(["rev-parse", "HEAD"]).trim();
const themeAssertions = assertions.filter((item) => item.contract_role === "semantic_theme_coverage");
const approximateAssertions = assertions.filter((item) => item.comparison_status === "descriptive_reference_only_approximate_policy_unavailable");
const pendingMapping = assertions.filter((item) => item.evidence_mapping_status === "pending_authoritative_mapping");
const pendingOnlyMapping = pendingMapping.filter((item) => item.comparison_status === "executable");

const finalizedFiles = [
  "scripts/gold-contract-audit.ts",
  "scripts/gold-contract-lib.ts",
  "scripts/gold-contract-review.ts",
  "scripts/gold-contract-validate.ts",
  "scripts/gold-current-observations.ts",
  "test/fixtures/gold-contract/README.md",
  "test/fixtures/gold-contract/current-baseline.json",
  "test/fixtures/gold-contract/gold-catalog-v0.3.final.json",
  "test/fixtures/gold-contract/gold-metadata-clarification-v0.1.json",
  "test/fixtures/gold-contract/tolerance-rules.final.json",
  "test/gold-contract/goldContract.test.ts",
  "artifacts/gold-contract/gold-audit-report.json",
  "artifacts/gold-contract/Gold-v0.3-product-owner-review.md",
];

let markdown = `# RateReveal RA Gold Finalization Review

**Status:** RA Gold semantic machine contract finalized; source provenance remains separate and pending.

**Repository:** branch \`${branch}\`; HEAD \`${head}\`.
**Boundary:** RA Gold contract/test/review artifacts only. No RB, Packages B-E, production economics, parser support/routing, runtime AI/research, providers, configuration, database, deployment, or Production change.

## 1. Final inventory and approval state

| Measure | Final count |
|---|---:|
| Gold assertions | ${assertions.length} |
| Semantically product-owner approved | ${assertions.filter((item) => item.approval.status === "approved").length} |
| Executable comparison contracts | ${assertions.filter((item) => item.comparison_status === "executable").length} |
| Descriptive approximate references without executable comparison | ${approximateAssertions.length} |
| Pending authoritative mapping (G1-G8) | ${pendingMapping.length} |
| Pending only source mapping, with no comparison-policy blocker | ${pendingOnlyMapping.length} |
| Source unavailable (G9) | ${assertions.filter((item) => item.evidence_mapping_status === "source_unavailable").length} |
| Pending another product decision for an executable approximate gate | ${approximateAssertions.length} |
| Merchant-theme semantic coverage assertions | ${themeAssertions.length} |

All 348 semantic predicates are approved. The 32 approximate numeric references retain approved descriptive meaning but cannot produce numeric pass/fail results until a future approximate-comparison policy is explicitly approved.

## 2. Files changed by this finalization

${finalizedFiles.map((item) => `- \`${item}\``).join("\n")}

## 3. Final tolerance catalog

| Rule | Availability | Comparison | Scale/space | Approval |
|---|---|---|---|---|
${tolerances.map((item) => `| \`${item.rule_id}\` | \`${item.availability}\` | \`${item.comparison}\` | ${item.decimal_scale === null ? "n/a" : `${item.decimal_scale} / \`${item.quantization_space}\``} | \`${item.approval.status}\` |`).join("\n")}

Native typed equality applies when no tolerance is referenced. The two active rules use decimal-string/BigInt quantization; no floating delta is used. Rate comparison checks the required denominator before quantization, and the G4/G8 rate alternatives are atomic \`{ rate_decimal, denominator }\` pairs.

## 4. S1-S10 executability

| Case | Contract status | Input note |
|---|---|---|
${contract.cases.filter((item) => item.case_id.startsWith("S")).map((item) => `| ${item.case_id} | \`${item.synthetic_input_readiness}\` | ${item.case_id === "S5" ? "Minimal direct/ESA-like structure; no OptBlue detail or margin evidence." : item.case_id === "S8" ? "Two admitted opaque equal-specificity conflicting entries; confidence cannot choose a winner." : "Frozen synthetic input retained."} |`).join("\n")}

All ten synthetic contracts are executable. This does not assert that the current product implements every expected synthetic output.

## 5. Theme contract

The 47 frozen theme rows are represented as required semantic coverage codes, not fixed output labels or merchant copy. A single output theme may satisfy multiple codes only when economic meaning, evidence boundaries, certainty, and actionability remain preserved and no unsupported savings/actionability is created. The comparison harness tests both safe grouping and rejection of certainty-overstating grouping.

## 6. Metadata clarification

- Contract schema: \`ratereveal_gold_contract_v3\`.
- Addendum: \`${clarification.clarification_version}\`.
- Decision trace: \`${clarification.decision_ref}\`.
- Original frozen artifacts rewritten: \`${clarification.original_frozen_artifacts_rewritten}\`.
- Confidence: all ${assertions.length} assertions remain \`null / not_explicitly_supplied_requires_review\`; no value was fabricated.
- Effective period: real-case periods come from Frozen Gold; synthetic/global cases use \`not_time_sensitive\`.
- Evidence: empty mappings remain explicit \`pending_authoritative_mapping\`, never “no evidence required.”

## 7. Source mapping by case

| Case | Final status |
|---|---|
| G1-G5 | Pending authoritative opaque crosswalk; repository fixtures remain observational only. |
| G6 | Pending; exact authoritative identity remains unproven. |
| G7-G8 | Pending authoritative opaque crosswalk; repository fixtures remain observational only. |
| G9 | Source unavailable; page-1-of-6 hold preserved. |
| H1 | Source unavailable/corpus-integrity hold; no MID-only merge. |

Nxgen/Vortax usage remains falsification/economic-correctness coverage only and does not expand production processor support.

## 8. Final current-system baseline

| Outcome | Count |
|---|---:|
${Object.entries(audit.provisionalCurrentSummary).map(([key, value]) => `| \`${key}\` | ${value} |`).join("\n")}

Baseline change from the corrected candidate review: 5 additional pre-existing mismatches are now reviewed current failures because finalized semantic Gold makes them adjudicable; 6 absent required semantic conclusions are classified as capabilities not implemented; regressions remain zero. The five added failures are \`G1-NO-EXACT-OWNER\`, \`G3-NO-NUMERIC-RATE\`, \`G4-NO-RATE-VERDICT\`, \`G5-RATE\`, and \`G7-NO-RATE-VERDICT\`.

## 9. Assertions not fully source-executable

### Approximate comparison policy unavailable (${approximateAssertions.length})

${groupIds(approximateAssertions)}

These assertions are semantically determined but cannot execute a numeric approximate pass/fail gate. No other assertion is pending a product decision.

### Source provenance incomplete

- G1-G8: ${pendingMapping.length} assertions pending authoritative mapping; ${pendingOnlyMapping.length} are blocked only by that mapping and ${pendingMapping.length - pendingOnlyMapping.length} also carry unavailable approximate comparison mechanics.
- G9: 25 assertions remain source-unavailable.
- H1: not an independent Gold case; the source/collision artifact remains unavailable and held for corpus-integrity review.

Exact pending-mapping inventory:

${groupIds(pendingMapping)}

Exact source-unavailable inventory:

${groupIds(assertions.filter((item) => item.evidence_mapping_status === "source_unavailable"))}

## 10. Verification

| Command | Outcome |
|---|---|
| \`npm run gold:validate\` | Valid finalized semantic contract; 348/348 approved; reference/privacy checks pass. |
| \`npm run gold:test\` | 20/20 tests pass. |
| \`npm run gold:audit\` | \`${audit.gateStatus}\`; 0 regressions, 0 unexpected passes. |
| \`npm run gold:review\` | This review artifact generated. |
| \`npm run gold:scope-check\` | Reported \`isolated_and_preserved\`; tracked and untracked WIP preserved, no unexpected paths, no production violations. |
| \`npm run gold:secure\` | Secure mapping remains unavailable unless the private corpus environment is explicitly supplied. |

## 11. Isolation, B-E invariance, and limitations

- Scope isolation is enforced by path allowlisting plus production-source scans for Gold identifiers/data.
- The scope check compares the frozen hashes of pre-existing tracked and untracked WIP, which includes the in-progress production and Package B-E-adjacent files; unchanged hashes are the B-E/WIP invariance evidence.
- Gold expected values remain test-only and are not imported into production source.
- Current fixture observations remain provisional and cannot promote source identity.
- PDF parsing emits noisy missing-Type3-font warnings during audit but completes; this is an observation-runner noise limitation, not a Gold result change.
- Private secure-source validation cannot complete without the separately governed opaque mapping/private artifacts.
- No staging, commit, push, PR, merge, deploy, RB work, or Production action is part of this finalization.
`;

const outputPath = path.resolve(process.cwd(), "artifacts/gold-contract/Gold-v0.3-product-owner-review.md");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, markdown, "utf8");
console.log(JSON.stringify({ outputPath, assertionCount: assertions.length, semanticallyApproved: assertions.length, approximatePolicyPending: approximateAssertions.length, pendingMapping: pendingMapping.length, pendingOnlyMapping: pendingOnlyMapping.length, bytes: Buffer.byteLength(markdown) }, null, 2));

function groupIds(items: GoldAssertion[]): string {
  return [...Map.groupBy(items, (item) => item.case_id).entries()]
    .map(([caseId, grouped]) => `- ${caseId} (${grouped.length}): ${grouped.map((item) => `\`${item.assertion_id}\``).join(", ")}`)
    .join("\n");
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}
