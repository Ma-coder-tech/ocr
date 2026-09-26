/** Source-bound fee candidate gate. Customer permission is applied separately. */
import { FISERV_PROTOCOL_IDENTITY_RULE_VERSION,
  type FiservProtocolIdentityDecision } from "../canonical/v2/fiservCapabilityContract.js";
import { FISERV_STATEMENT_NEUTRAL_PACKAGE_ID, FISERV_STATEMENT_NEUTRAL_PACKAGE_VERSION } from "./directProof/neutralInstalledProtocols.js";
import { neutralFactProofId } from "./directProof/neutralProofId.js";
import type { NeutralProofRun } from "./directProof/neutralContracts.js";

export const FEE_FACT_CANDIDATE_RULE_VERSION = "statement_fee_charge_candidate_v1" as const;
export const FEE_PRODUCT_SCOPE_RULE_VERSION = "strict_fiserv_protocol_identity_for_fee_v1" as const;
const PACKAGE_ID = FISERV_STATEMENT_NEUTRAL_PACKAGE_ID;
const FACT_ID = "total_processing_fees";
const POPULATION_SCOPE = "statement_processing_fee_charge_aggregate_bounded_declared_components";
const FACT_MEANING = "Printed processing-fee charge aggregate over bounded declared components";

export type ResearchFeeFactCandidate = Readonly<{
  schemaVersion: typeof FEE_FACT_CANDIDATE_RULE_VERSION;
  sourceDocumentRef: string;
  sourceSha256: string;
  factId: typeof FACT_ID;
  population: Readonly<{ scope: typeof POPULATION_SCOPE;
    boundedDeclaredComponents: boolean; completeFeeOccurrenceInventory: false;
    processorOwnership: "unresolved" }>;
  amount: Readonly<{ sourceDebitMinor: number | null; displayChargeMagnitudeMinor: number | null;
    sourceSign: "negative_fee_debit"; displaySign: "positive_charge_magnitude";
    printedCurrencySymbol: "$" | null; isoCurrency: null }>;
  period: Readonly<{ context: "printed_statement_period_only" | "unresolved";
    start: string | null; end: string | null; evidenceRefs: readonly string[];
    feeEarningPeriod: "unresolved"; feePostingPeriod: "unresolved";
    cardActivityCompatibility: "unresolved" }>;
  proof: Readonly<{ proofId: string | null; neutralRuleVersion: NeutralProofRun["version"];
    protocolPackageId: string | null; protocolPackageVersion: string | null;
    factEvidenceRefs: readonly string[]; controlRefs: readonly string[];
    productScopeRuleVersion: typeof FEE_PRODUCT_SCOPE_RULE_VERSION;
    supportIdentityRuleVersion: typeof FISERV_PROTOCOL_IDENTITY_RULE_VERSION }>;
  permission: Readonly<{ customer: "disabled_research_only";
    prospective: "eligible_for_product_review" | "withheld"; reasonCodes: readonly string[] }>;
  backendProcessor: null;
}>;

export function evaluateResearchFeeFact(run: NeutralProofRun,
  support: Readonly<{ sourceSha256: string; identity: FiservProtocolIdentityDecision }>): ResearchFeeFactCandidate {
  const fact = run.facts.find((item) => item.id === FACT_ID);
  const selectedPackage = run.routing.candidates.find((item) => item.id === PACKAGE_ID);
  const reasons: string[] = [];
  if (run.evidence.sourceKind !== "pdf_bytes" || run.sourceIntegrity.suppliedArtifact !== "proven"
    || run.inputSha256 !== run.evidence.sourceSha256 || !run.evidence.byteLength
    || run.evidence.lanes.length === 0
    || run.evidence.lanes.some((lane) => lane.modality !== "direct_text"))
    reasons.push("supplied_pdf_bytes_not_proven");
  if (support.sourceSha256 !== run.inputSha256) reasons.push("support_proof_source_mismatch");
  if (run.documentClass.kind !== "merchant_processing_statement" || run.routing.status !== "selected"
    || run.routing.selectedId !== PACKAGE_ID || run.protocol.status !== "resolved"
    || selectedPackage?.version !== FISERV_STATEMENT_NEUTRAL_PACKAGE_VERSION)
    reasons.push("reviewed_merchant_protocol_not_resolved");
  if (support.identity.status !== "proven"
    || support.identity.ruleVersion !== FISERV_PROTOCOL_IDENTITY_RULE_VERSION
    || support.identity.route !== "route_a_origin_plus_protocol")
    reasons.push("current_product_support_identity_not_proven");
  if (run.sourceIntegrity.statementPages !== "proven") reasons.push("printed_page_sequence_not_proven");
  if (run.statementPeriod.state !== "proven") reasons.push("printed_statement_period_not_proven");
  if (!fact || fact.state !== "proven" || fact.amountMinor === null)
    reasons.push("fee_aggregate_direct_proof_withheld");
  if (fact && (fact.meaning !== FACT_MEANING || fact.population.scope !== POPULATION_SCOPE
    || fact.population.period.printedContext !== "statement"
    || fact.population.period.start !== run.statementPeriod.start
    || fact.population.period.end !== run.statementPeriod.end
    || run.statementPeriod.evidenceRefs.length === 0
    || !run.statementPeriod.evidenceRefs.every((ref) => fact.population.period.evidenceRefs.includes(ref))
    || fact.population.period.economicCoverage !== "unresolved"
    || fact.population.period.activityCompatibility !== "unresolved"
    || fact.population.occurrenceCompleteness !== "unproven"
    || fact.population.signConvention !== "source_negative_fee_debit"
    || fact.population.currency !== "$" || fact.unit !== "printed_dollar"
    || fact.amountMinor === null || fact.amountMinor >= 0))
    reasons.push("fee_semantic_contract_not_proven");
  if (fact && !["fee_component_sum", "fee_summary_alignment"].every((id) =>
    fact.controlRefs.includes(id) && run.controls.some((control) => control.id === id
      && control.status === "pass" && control.independent)))
    reasons.push("two_independent_fee_controls_not_proven");
  if (fact && (!fact.proofId.startsWith("neutral-proof-v2:")
    || fact.proofId !== neutralFactProofId(run.inputSha256,
      run.routing.selectedId, selectedPackage?.version ?? null, fact)
    || fact.evidenceRefs.length === 0 || fact.assumptionIds.some((id) =>
      !run.assumptions.some((assumption) => assumption.id === id && assumption.state === "versioned_protocol"))))
    reasons.push("proof_identity_or_assumption_unresolved");
  const eligible = reasons.length === 0;
  return { schemaVersion: FEE_FACT_CANDIDATE_RULE_VERSION,
    sourceDocumentRef: `sha256:${run.inputSha256}`, sourceSha256: run.inputSha256,
    factId: FACT_ID,
    population: { scope: POPULATION_SCOPE, boundedDeclaredComponents: eligible,
      completeFeeOccurrenceInventory: false, processorOwnership: "unresolved" },
    amount: { sourceDebitMinor: eligible ? fact!.amountMinor : null,
      displayChargeMagnitudeMinor: eligible ? -fact!.amountMinor! : null,
      sourceSign: "negative_fee_debit", displaySign: "positive_charge_magnitude",
      printedCurrencySymbol: eligible ? "$" : null, isoCurrency: null },
    period: { context: eligible ? "printed_statement_period_only" : "unresolved",
      start: eligible ? run.statementPeriod.start : null, end: eligible ? run.statementPeriod.end : null,
      evidenceRefs: eligible ? run.statementPeriod.evidenceRefs : [],
      feeEarningPeriod: "unresolved", feePostingPeriod: "unresolved",
      cardActivityCompatibility: "unresolved" },
    proof: { proofId: eligible ? fact!.proofId : null, neutralRuleVersion: run.version,
      protocolPackageId: run.routing.selectedId, protocolPackageVersion: selectedPackage?.version ?? null,
      factEvidenceRefs: eligible ? fact!.evidenceRefs : [],
      controlRefs: eligible ? fact!.controlRefs : [],
      productScopeRuleVersion: FEE_PRODUCT_SCOPE_RULE_VERSION,
      supportIdentityRuleVersion: FISERV_PROTOCOL_IDENTITY_RULE_VERSION },
    permission: { customer: "disabled_research_only",
      prospective: eligible ? "eligible_for_product_review" : "withheld",
      reasonCodes: eligible ? [] : [...new Set([...reasons, ...(fact?.reasonCodes ?? [])])] },
    backendProcessor: null };
}
