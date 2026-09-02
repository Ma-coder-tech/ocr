import {
  findPrivacyViolations,
  loadCurrentBaseline,
  loadGoldContract,
  loadMetadataClarification,
  loadToleranceRules,
  validateContractReferences,
} from "./gold-contract-lib.js";

const [contract, tolerances, baseline, clarification] = await Promise.all([
  loadGoldContract(),
  loadToleranceRules(),
  loadCurrentBaseline(),
  loadMetadataClarification(),
]);
const errors = validateContractReferences(contract, tolerances, baseline);
const privacyViolations = [...findPrivacyViolations(contract), ...findPrivacyViolations(tolerances), ...findPrivacyViolations(baseline)];
const assertions = [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions];

const result = {
  status: errors.length === 0 && privacyViolations.length === 0 ? "valid_finalized_semantic_contract" : "invalid_contract_or_fixture",
  conversionStatus: contract.conversion_status,
  caseIds: contract.cases.map((item) => item.case_id),
  caseAssertionCount: assertions.length - contract.global_assertions.length,
  globalProhibitionCount: contract.global_assertions.length,
  totalAssertionCount: assertions.length,
  toleranceRuleCount: tolerances.length,
  toleranceStates: Object.fromEntries(tolerances.map((item) => [item.rule_id, { availability: item.availability, approval: item.approval.status, comparison: item.comparison }])),
  toleranceReviewClassifications: Object.fromEntries(
    [...new Set(tolerances.map((item) => item.review_classification))].sort().map((classification) => [
      classification,
      tolerances.filter((item) => item.review_classification === classification).length,
    ]),
  ),
  syntheticInputReadiness: Object.fromEntries(
    contract.cases
      .filter((item) => item.case_id.startsWith("S"))
      .map((item) => [item.case_id, item.synthetic_input_readiness]),
  ),
  missingConfidenceCount: assertions.filter((item) => item.confidence === null).length,
  metadataClarificationVersion: clarification.clarification_version,
  approvedAssertionCount: assertions.filter((item) => item.approval.status === "approved").length,
  candidateAssertionCount: assertions.filter((item) => item.approval.status === "candidate_only").length,
  executableAssertionCount: assertions.filter((item) => item.comparison_status === "executable").length,
  descriptiveApproximateAssertionCount: assertions.filter((item) => item.comparison_status === "descriptive_reference_only_approximate_policy_unavailable").length,
  pendingAuthoritativeMappingCount: assertions.filter((item) => item.evidence_mapping_status === "pending_authoritative_mapping").length,
  sourceUnavailableAssertionCount: assertions.filter((item) => item.evidence_mapping_status === "source_unavailable").length,
  errors,
  privacyViolations,
};

console.log(JSON.stringify(result, null, 2));
if (result.status !== "valid_finalized_semantic_contract") process.exit(1);
