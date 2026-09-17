import fs from "node:fs/promises";
import path from "node:path";
import {
  evaluateGoldAssertion,
  findPrivacyViolations,
  loadCurrentBaseline,
  loadGoldContract,
  loadToleranceRules,
  summarizeResults,
  validateContractReferences,
  type AssertionResult,
  type GoldObservation,
} from "./gold-contract-lib.js";
import { loadCurrentGoldObservations } from "./gold-current-observations.js";

const [contract, tolerances, baseline, observations] = await Promise.all([
  loadGoldContract(),
  loadToleranceRules(),
  loadCurrentBaseline(),
  loadCurrentGoldObservations(),
]);

const referenceErrors = validateContractReferences(contract, tolerances, baseline);
const privacyViolations = [...findPrivacyViolations(contract), ...findPrivacyViolations(tolerances), ...findPrivacyViolations(baseline)];
if (referenceErrors.length > 0 || privacyViolations.length > 0) {
  console.error(JSON.stringify({ status: "invalid_contract_or_fixture", referenceErrors, privacyViolations }, null, 2));
  process.exit(1);
}

const authoritativeResults: AssertionResult[] = [];
const provisionalCurrentResults: AssertionResult[] = [];
for (const goldCase of contract.cases) {
  const provisional = observations.get(goldCase.case_id) ?? unavailable(goldCase.case_id, "source_unavailable");
  const authoritative = { ...provisional, sourceStatus: goldCase.source.availability } as GoldObservation;
  for (const assertion of goldCase.assertions) {
    authoritativeResults.push(evaluateGoldAssertion(assertion, authoritative, tolerances, baseline));
    provisionalCurrentResults.push(evaluateGoldAssertion(assertion, provisional, tolerances, baseline));
  }
}

const globalObservation = observations.get("GLOBAL") ?? unavailable("GLOBAL", "source_unavailable");
for (const assertion of contract.global_assertions) {
  authoritativeResults.push(evaluateGoldAssertion(assertion, globalObservation, tolerances, baseline));
  provisionalCurrentResults.push(evaluateGoldAssertion(assertion, globalObservation, tolerances, baseline));
}

const disallowedOutcomes = new Set(["regression", "unexpected_pass", "invalid_contract_or_fixture"]);
const gateFailures = provisionalCurrentResults.filter((item) => disallowedOutcomes.has(item.outcome));
const report = {
  schemaVersion: "ratereveal_gold_audit_report_v2",
  frozenArtifact: contract.frozen_artifact,
  conversionStatus: contract.conversion_status,
  gateStatus: gateFailures.length === 0 ? "finalized_gold_baseline_established" : "failed",
  inventory: {
    realGoldCases: contract.cases.filter((item) => item.case_id.startsWith("G")).length,
    syntheticCases: contract.cases.filter((item) => item.case_id.startsWith("S")).length,
    globalProhibitions: contract.global_assertions.length,
    caseAssertions: contract.cases.reduce((sum, item) => sum + item.assertions.length, 0),
    totalAssertions: authoritativeResults.length,
  },
  semanticContract: {
    approvedAssertions: [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions].filter((item) => item.approval.status === "approved").length,
    executableAssertions: [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions].filter((item) => item.comparison_status === "executable").length,
    descriptiveApproximateAssertions: [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions].filter((item) => item.comparison_status === "descriptive_reference_only_approximate_policy_unavailable").length,
    pendingAuthoritativeMappingAssertions: [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions].filter((item) => item.evidence_mapping_status === "pending_authoritative_mapping").length,
    sourceUnavailableAssertions: [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions].filter((item) => item.evidence_mapping_status === "source_unavailable").length,
    metadataClarificationVersion: contract.metadata_clarification_version,
  },
  toleranceCatalog: tolerances.map((item) => ({
    ruleId: item.rule_id,
    availability: item.availability,
    comparison: item.comparison,
    decimalScale: item.decimal_scale,
    quantizationSpace: item.quantization_space,
    approvalStatus: item.approval.status,
  })),
  syntheticExecutability: Object.fromEntries(
    contract.cases.filter((item) => item.case_id.startsWith("S")).map((item) => [item.case_id, item.synthetic_input_readiness]),
  ),
  sourceMapping: {
    G1: "pending_authoritative_mapping",
    G2: "pending_authoritative_mapping",
    G3: "pending_authoritative_mapping",
    G4: "pending_authoritative_mapping",
    G5: "pending_authoritative_mapping",
    G6: "pending_authoritative_mapping_identity_unproven",
    G7: "pending_authoritative_mapping",
    G8: "pending_authoritative_mapping",
    G9: "source_unavailable",
    H1: "source_unavailable_corpus_integrity_hold",
  },
  notFullyExecutableAssertions: [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions]
    .filter((item) => item.comparison_status !== "executable")
    .map((item) => ({ assertionId: item.assertion_id, reason: "approximate_comparison_policy_unavailable" })),
  authoritativeSummary: summarizeResults(authoritativeResults),
  provisionalCurrentSummary: summarizeResults(provisionalCurrentResults),
  reviewedSemanticConflicts: baseline.entries.map((item) => ({
    assertionId: item.assertion_id,
    issueId: item.issue_id,
    expectedOutcome: item.expected_outcome,
    deferredTo: item.deferred_to,
  })),
  historicalSemanticConflicts: baseline.historical_conflicts,
  unavailableOrReviewCases: contract.cases
    .filter((item) => item.source.availability !== "available")
    .map((item) => ({ caseId: item.case_id, sourceOutcome: item.source.availability, provenanceStatus: item.source.provenance_status })),
  authoritativeResults: redactResults(authoritativeResults),
  provisionalCurrentResults: redactResults(provisionalCurrentResults),
  provenanceValidation: {
    status: "valid_with_unavailable_sources",
    publicMetadataPrivacySafe: true,
    referenceErrors: [],
  },
  gateFailures: redactResults(gateFailures),
};

const outputDir = path.resolve(process.cwd(), "artifacts/gold-contract");
await fs.mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "gold-audit-report.json");
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`RateReveal Gold audit completed. Privacy-safe report: ${outputPath}`);
console.log(JSON.stringify({ gateStatus: report.gateStatus, inventory: report.inventory, authoritativeSummary: report.authoritativeSummary, provisionalCurrentSummary: report.provisionalCurrentSummary }, null, 2));
if (gateFailures.length > 0) process.exit(1);

function unavailable(caseId: string, sourceStatus: GoldObservation["sourceStatus"]): GoldObservation {
  return { caseId, sourceStatus, values: {}, states: {}, claims: [] };
}

function redactResults(results: AssertionResult[]) {
  return results.map((item) => ({
    assertionId: item.assertionId,
    caseId: item.caseId,
    outcome: item.outcome,
    candidateComparison: item.candidateComparison,
    issueId: item.issueId,
    message: item.message,
  }));
}
