import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import type { BusinessTypeId } from "../src/businessTypes.js";
import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildCommercialDecompositionContractV1 } from "../src/canonical/commercialDecompositionContractV1.js";
import { commercialSemanticFingerprintV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import { buildCurrentRelationshipEconomicsProfileV1 } from "../src/canonical/currentRelationshipEconomicsProfileV1.js";
import {
  buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1,
  FISERV_CLAIM_SCOPED_ACTIVITY_POPULATION_ADMISSION_V1,
} from "../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { canonicalFinancialTruthFingerprint, type InternalAnalystPricingModelInput } from "../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { inspectFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import type { ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const OUTPUT_DIR = "evaluations/fiserv-claim-scoped-activity-population-admission-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-12.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-12.md`;
const BASELINE = {
  branch: "codex/single-statement-current-relationship-economics-profile-v1",
  commit: "6b14cac4fa7f5241ffcff5802cc11f83a7a905f1",
  parent: "aa408d6b71fccacab7989ac6aef31af636362dca",
} as const;
const ACCEPTED_COMMERCIAL_SOURCE_SHA256 = "a204de0fa0bf4cedfb852ff32327b22f43d5b38c7f6eeb8bea4a26bf417bf456";
const REGISTRIES = [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1];
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };
const GOLD: Array<{ file: string; businessType: BusinessTypeId }> = [
  { file: "Nov_2024_Statement.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT4_CLOVER.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf", businessType: "other" },
  { file: "fiserv_ABDUL_BASHER_Aug_2025.pdf", businessType: "retail" },
  { file: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_NXGEN_VORTAX_Sep_2022.pdf", businessType: "retail" },
  { file: "fiserv_PAYSAFE_Febr_2024.pdf", businessType: "professional_services" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", businessType: "ecommerce" },
  { file: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", businessType: "restaurant_food_beverage" },
];
const ACTIVITY_FIELDS = [
  "processedVolume", "grossSalesVolume", "refundVolume", "transactionCount", "grossSaleTransactionCount",
  "refundTransactionCount", "authorizationCount", "approvedAuthorizationCount", "settledTransactionCount",
  "authorizationToSettlement", "chargebackCount", "chargebackPrincipal", "chargebackFee", "averageTicket", "channel",
] as const;
const EXPECTED_POPULATIONS: Record<string, string> = {
  processedVolume: "canonical_net_submitted_card_volume",
  grossSalesVolume: "gross_sale_volume",
  refundVolume: "refund_volume",
  transactionCount: "submitted_transaction_count",
  grossSaleTransactionCount: "gross_sale_transaction_count",
  refundTransactionCount: "refund_transaction_count",
  authorizationCount: "authorization_count",
  chargebackCount: "chargeback_count",
  chargebackFee: "chargeback_fee_amount",
  averageTicket: "gross_sale_volume_per_gross_sale_transaction",
  channel: "current_statement_processing_activity",
};

const authority = new GovernedPaymentKnowledgeAuthority();
const commercialSourceBefore = commercialSemanticFingerprintV1(REGISTRIES);
const statements: any[] = [];

for (const fixture of GOLD) {
  const safeStatementId = fixture.file.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const inspected = await inspectFiservOneStatementEvaluation({ statementPaths: [`test/fixtures/pdfs/${fixture.file}`], safeStatementId });
  const analysis = buildCanonicalStatementFactsFromParsedDocument(inspected.document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const pricing = deterministicPricing(inspected.document, fixture.file, fixture.businessType, analysis);
  const knowledge = authority.resolveStatement({ analysis, context: US_CONTEXT, suppliedPricingObservation: pricing });
  const decomposition = buildCommercialDecompositionContractV1({ analysis, knowledge });
  const canonicalBefore = canonicalFinancialTruthFingerprint(analysis);
  const rdBefore = fingerprint(inspected.economic);
  const rdChargeCountBefore = inspected.economic.economicLayer.charges.length;
  const rdFeeTotalBefore = inspected.economic.economicLayer.costStack.authoritativeStatementFeeTotal;
  const before = buildCurrentRelationshipEconomicsProfileV1({ economic: inspected.economic, commercialDecomposition: decomposition });
  const attached = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document,
    economic: inspected.economic,
    canonicalAnalysis: analysis,
    commercialDecomposition: decomposition,
  });
  const after = attached.profile;
  const canonicalAfter = canonicalFinancialTruthFingerprint(analysis);
  const rdAfter = fingerprint(inspected.economic);
  const beforeActivity = compactActivity(before.activity);
  const afterActivity = compactActivity(after.activity);
  const newlyObserved = ACTIVITY_FIELDS.filter((field) => !observed(before.activity[field]) && observed(after.activity[field]));
  const zeroAdmissions = attached.admission.decisions.filter((decision) =>
    (decision.decision === "ADMITTED" || decision.decision === "CANONICAL_ALREADY_AVAILABLE") && decision.valueMinorOrCount === 0);
  const inferredZeroFields = ACTIVITY_FIELDS.filter((field) => {
    const fact = after.activity[field];
    if (!observed(fact) || numeric(fact.value) !== 0 || observed(before.activity[field])) return false;
    return !zeroAdmissions.some((decision) => decision.field === field);
  });
  statements.push({
    file: fixture.file,
    businessType: fixture.businessType,
    period: after.statementPeriod,
    sourceBinding: attached.admission.sourceBinding,
    admissionStatus: attached.admission.status,
    decisions: attached.admission.decisions,
    sourceEvidenceCount: attached.admission.sourceEvidence.length,
    beforeActivity,
    afterActivity,
    beforeObservedCount: before.completeness.observedActivityFields.length,
    afterObservedCount: after.completeness.observedActivityFields.length,
    newlyObserved,
    stillUnresolved: after.completeness.unresolvedActivityFields,
    canonicalFingerprintBefore: canonicalBefore,
    canonicalFingerprintAfter: canonicalAfter,
    canonicalInvariant: canonicalBefore === canonicalAfter,
    rdFingerprintBefore: rdBefore,
    rdFingerprintAfter: rdAfter,
    rdInvariant: rdBefore === rdAfter,
    rdChargeCountBefore,
    rdChargeCountAfter: inspected.economic.economicLayer.charges.length,
    rdFeeTotalBefore,
    rdFeeTotalAfter: inspected.economic.economicLayer.costStack.authoritativeStatementFeeTotal,
    chargedCostProfileFingerprintBefore: fingerprint(before.chargedCostProfile),
    chargedCostProfileFingerprintAfter: fingerprint(after.chargedCostProfile),
    inferredZeroFields,
    admissionSafety: attached.admission.safety,
    profileSafety: after.safety,
  });
}

const commercialSourceAfter = commercialSemanticFingerprintV1(REGISTRIES);
const beforeFieldCoverage = fieldCoverage("beforeActivity");
const afterFieldCoverage = fieldCoverage("afterActivity");
const safetyCounters = {
  canonicalFingerprintChanges: statements.filter((item) => !item.canonicalInvariant).length,
  rdFingerprintChanges: statements.filter((item) => !item.rdInvariant).length,
  rdChargeCountChanges: statements.filter((item) => item.rdChargeCountBefore !== item.rdChargeCountAfter).length,
  rdFeeTotalChanges: statements.filter((item) => JSON.stringify(item.rdFeeTotalBefore) !== JSON.stringify(item.rdFeeTotalAfter)).length,
  additiveChargedCostProfileChanges: statements.filter((item) => item.chargedCostProfileFingerprintBefore !== item.chargedCostProfileFingerprintAfter).length,
  commercialSourceFingerprintChanges: commercialSourceBefore === commercialSourceAfter ? 0 : 1,
  sourceBindingAdmissionsWithoutMatch: statements.filter((item) => !item.sourceBinding.sourceFingerprintMatched
    && item.decisions.some((decision: any) => decision.decision === "ADMITTED")).length,
  channelAdmissionsWithoutCanonicalEvidence: statements.filter((item) => !item.sourceBinding.canonicalChannelEvidenceBound
    && item.decisions.some((decision: any) => decision.field === "channel" && decision.decision === "ADMITTED")).length,
  populationSubstitutions: statements.reduce((sum, item) => sum + item.decisions.filter((decision: any) =>
    EXPECTED_POPULATIONS[decision.field] && EXPECTED_POPULATIONS[decision.field] !== decision.population).length, 0),
  admissionsWithoutEvidenceOrControl: statements.reduce((sum, item) => sum + item.decisions.filter((decision: any) =>
    decision.decision === "ADMITTED" && (decision.evidenceRefs.length === 0 || decision.controlRefs.length === 0)).length, 0),
  inferredZeroFields: statements.reduce((sum, item) => sum + item.inferredZeroFields.length, 0),
  comparatorInputs: statements.reduce((sum, item) => sum + item.profileSafety.comparatorInputCount, 0),
  opportunities: statements.reduce((sum, item) => sum + item.profileSafety.opportunityOutputCount, 0),
  savings: statements.reduce((sum, item) => sum + item.profileSafety.savingsOutputCount, 0),
  annualizations: statements.reduce((sum, item) => sum + item.profileSafety.annualizationOutputCount, 0),
  customerRoutes: statements.filter((item) => item.profileSafety.customerRoutingAllowed || item.admissionSafety.customerRoutingAllowed).length,
  aiOrWebOperations: statements.reduce((sum, item) => sum + item.admissionSafety.aiOrWebOperationCount + item.profileSafety.aiOrWebOperationCount, 0),
  newKnowledgeAdmissions: statements.reduce((sum, item) => sum + item.admissionSafety.newKnowledgeAdmissionCount + item.profileSafety.newKnowledgeAdmissionCount, 0),
};
const evaluation = {
  schemaVersion: "fiserv_claim_scoped_activity_population_admission_evaluation_2026_09_12_v1",
  admissionVersion: FISERV_CLAIM_SCOPED_ACTIVITY_POPULATION_ADMISSION_V1,
  generatedAt: "2026-09-12T00:00:00.000Z",
  mode: "internal_offline",
  baseline: BASELINE,
  corpus: {
    statementCount: statements.length,
    beforeObservedActivityFacts: sum(statements.map((item) => item.beforeObservedCount)),
    afterObservedActivityFacts: sum(statements.map((item) => item.afterObservedCount)),
    netNewObservedActivityFacts: sum(statements.map((item) => item.newlyObserved.length)),
    statementsImproved: statements.filter((item) => item.newlyObserved.length > 0).length,
    statementsWithAnyObservedFactBefore: statements.filter((item) => item.beforeObservedCount > 0).length,
    statementsWithAnyObservedFactAfter: statements.filter((item) => item.afterObservedCount > 0).length,
    beforeFieldCoverage,
    afterFieldCoverage,
  },
  governedCommercialSource: {
    expectedSha256: ACCEPTED_COMMERCIAL_SOURCE_SHA256,
    beforeSha256: commercialSourceBefore,
    afterSha256: commercialSourceAfter,
    unchanged: commercialSourceBefore === commercialSourceAfter && commercialSourceAfter === ACCEPTED_COMMERCIAL_SOURCE_SHA256,
  },
  statements,
  safetyCounters,
  safetyCounterTotal: sum(Object.values(safetyCounters)),
  invariants: {
    exactElevenGoldStatements: statements.length === 11,
    canonicalFinancialTruthInvariant11Of11: statements.every((item) => item.canonicalInvariant),
    rdArtifactInvariant11Of11: statements.every((item) => item.rdInvariant),
    rdChargeLedgerAndFeeTotalInvariant11Of11: statements.every((item) => item.rdChargeCountBefore === item.rdChargeCountAfter
      && JSON.stringify(item.rdFeeTotalBefore) === JSON.stringify(item.rdFeeTotalAfter)),
    governedCommercialSourceInvariant: commercialSourceBefore === commercialSourceAfter && commercialSourceAfter === ACCEPTED_COMMERCIAL_SOURCE_SHA256,
    allAdmissionsSourceBound: statements.every((item) => item.sourceBinding.sourceFingerprintMatched
      && (item.sourceBinding.canonicalChannelEvidenceBound
        || !item.decisions.some((decision: any) => decision.field === "channel" && decision.decision === "ADMITTED"))),
    populationIdentityPreserved: safetyCounters.populationSubstitutions === 0,
    explicitZeroDistinctFromUnknown: safetyCounters.inferredZeroFields === 0,
    noAdditiveLedgerContribution: safetyCounters.additiveChargedCostProfileChanges === 0
      && statements.every((item) => !item.admissionSafety.feeLedgerContributionAllowed),
    noCanonicalOrRdMutationAuthority: statements.every((item) => !item.admissionSafety.canonicalMutationAllowed && !item.admissionSafety.rdMutationAllowed),
    noCustomerAiWebOrKnowledgeExpansion: statements.every((item) => !item.admissionSafety.customerRoutingAllowed
      && !item.profileSafety.customerRoutingAllowed && item.admissionSafety.aiOrWebOperationCount === 0
      && item.profileSafety.aiOrWebOperationCount === 0 && item.admissionSafety.newKnowledgeAdmissionCount === 0
      && item.profileSafety.newKnowledgeAdmissionCount === 0),
    noComparatorSavingsOrAnnualization: safetyCounters.comparatorInputs === 0 && safetyCounters.opportunities === 0
      && safetyCounters.savings === 0 && safetyCounters.annualizations === 0,
  },
  deferred: [
    "RB/RC canonical widening was not attempted; admissions remain claim-scoped to this profile.",
    "Approved authorization count, settled transaction count, and authorization-to-settlement compatibility remain unsupported unless independently evidenced.",
    "RD cost reconstruction, provider-cost expansion, incidence, comparative judgments, and customer routing remain out of scope.",
  ],
  verification: {
    focusedAdmissionAndProfileContracts: "3 files, 43/43 passed",
    canonicalRbThroughRe: "24 files, 183/183 passed",
    relevantRuntimeAndGovernance: "13 files passed",
    typescriptBuild: "passed",
  },
  knownUnrelatedIssues: [
    "Historical/current remains at the accepted 5/6 state and was not repaired.",
    "Merchant-attention remains at the accepted 62/63 state and was not repaired.",
    "Batch 2 remains at the accepted stale 149-vs-152 aggregate and was not repaired.",
    "The source-hygiene NXGEN assertion and prior SIGSEGV/139 history were not investigated or repaired.",
  ],
};

const failed = Object.entries(evaluation.invariants).filter(([, value]) => !value).map(([key]) => key);
if (evaluation.safetyCounterTotal !== 0) failed.push("safetyCounterTotal");
await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
await writeFile(OUTPUT_MD, renderReport(evaluation), "utf8");
console.log(JSON.stringify({ outputs: [OUTPUT_JSON, OUTPUT_MD], corpus: evaluation.corpus, safetyCounterTotal: evaluation.safetyCounterTotal, failed }, null, 2));
if (failed.length > 0) process.exitCode = 1;

function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const value = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = value?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) {
    throw new Error(`deterministic pricing model unavailable for ${file}`);
  }
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: value?.pricingModel?.confidence === "high" ? "high" : value?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function compactActivity(activity: Record<string, any>): Record<string, unknown> {
  return Object.fromEntries(ACTIVITY_FIELDS.map((field) => [field, {
    state: activity[field].state,
    value: activity[field].value,
    population: activity[field].population,
    evidenceAccess: activity[field].evidenceAccess,
    evidenceRefs: activity[field].evidenceRefs,
    limitations: activity[field].limitations,
  }]));
}

function fieldCoverage(side: "beforeActivity" | "afterActivity"): Record<string, { known: number; knownAbsent: number; unknown: number; notApplicable: number }> {
  return Object.fromEntries(ACTIVITY_FIELDS.map((field) => {
    const states = statements.map((item) => item[side][field].state);
    return [field, {
      known: states.filter((state) => state === "KNOWN").length,
      knownAbsent: states.filter((state) => state === "KNOWN_ABSENT").length,
      unknown: states.filter((state) => state === "UNKNOWN").length,
      notApplicable: states.filter((state) => state === "NOT_APPLICABLE").length,
    }];
  }));
}

function observed(fact: { state: string }): boolean { return fact.state === "KNOWN" || fact.state === "KNOWN_ABSENT"; }
function numeric(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "amountMinor" in value) return Number((value as { amountMinor: number }).amountMinor);
  return null;
}
function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }

function renderReport(value: typeof evaluation): string {
  const rows = value.statements.map((item) => `| ${item.file} | ${item.beforeObservedCount} | ${item.afterObservedCount} | ${item.newlyObserved.join(", ") || "none"} | ${item.admissionStatus} |`);
  const fieldRows = ACTIVITY_FIELDS.map((field) => {
    const before = value.corpus.beforeFieldCoverage[field]!;
    const after = value.corpus.afterFieldCoverage[field]!;
    return `| ${field} | ${before.known + before.knownAbsent} | ${after.known + after.knownAbsent} | ${after.unknown} | ${after.notApplicable} |`;
  });
  const details = value.statements.map((item) => {
    const admitted = item.decisions.filter((decision: any) => decision.decision === "ADMITTED")
      .map((decision: any) => `${decision.field}=${decision.field === "channel"
        ? item.afterActivity.channel.value
        : decision.valueMinorOrCount}`).join(", ") || "none";
    const withheld = item.decisions.filter((decision: any) => decision.decision === "WITHHELD")
      .map((decision: any) => `${decision.field}${decision.field === "channel" ? "=UNKNOWN" : ""} (${decision.reasonCodes.join("/")})`).join("; ") || "none";
    return `### ${item.file}\n\n- Newly observed: ${item.newlyObserved.join(", ") || "none"}\n- Profile-only admissions: ${admitted}\n- Withheld: ${withheld}\n- Source controls: card summary ${item.sourceBinding.cardSummary}; amount ${item.sourceBinding.cardSummaryAmountControl}; headline ${item.sourceBinding.cardSummaryHeadlineControl}; count ${item.sourceBinding.cardSummaryCountControl}.\n`;
  });
  return `# Fiserv Claim-Scoped Activity Population Admission v1\n\n## Outcome\n\nThe profile-only admission authority ran across all 11 supported Fiserv Gold statements. It carries exact statement-evidenced activity populations into the Current Relationship Economics Profile while leaving Canonical Economics V2, RD, governed commercial sources, and customer routing unchanged.\n\n- Baseline: \`${value.baseline.commit}\` (parent \`${value.baseline.parent}\`)\n- Observed activity facts: ${value.corpus.beforeObservedActivityFacts} before; ${value.corpus.afterObservedActivityFacts} after; +${value.corpus.netNewObservedActivityFacts}.\n- Statements improved: ${value.corpus.statementsImproved}/11.\n- Canonical fingerprint invariance: ${value.invariants.canonicalFinancialTruthInvariant11Of11 ? "11/11" : "FAIL"}.\n- RD artifact invariance: ${value.invariants.rdArtifactInvariant11Of11 ? "11/11" : "FAIL"}.\n- Governed commercial-source SHA-256: \`${value.governedCommercialSource.afterSha256}\`.\n- Safety counter total: ${value.safetyCounterTotal}.\n\n## Per-statement coverage\n\n| Statement | Before | After | Newly observed | Admission status |\n|---|---:|---:|---|---|\n${rows.join("\n")}\n\n## Per-field coverage\n\n| Field | Observed before | Observed after | Unknown after | N/A after |\n|---|---:|---:|---:|---:|\n${fieldRows.join("\n")}\n\n## Statement decisions\n\n${details.join("\n")}\n## Safety and scope\n\n- Exact population identity, source evidence, source fingerprint, complete-document status, and applicable reconciliation controls are mandatory.\n- Transaction, authorization, approval, settlement, refund, chargeback, and batch populations are never substituted.\n- Zero is retained only when printed for the exact population or established by explicit no-activity evidence; silence remains unknown.\n- Average ticket uses only a compatible gross-sale amount and gross-sale count from the same bounded card-summary population.\n- Chargeback count never comes from fee count, funding rows, or combined adjustment/chargeback amount. Chargeback fee remains canonical-only.\n- The package does not alter RD, reconstruct costs, use commercial sources, invoke AI/web research, admit knowledge, or route customer output.\n\n## Deferred\n\n${value.deferred.map((item) => `- ${item}`).join("\n")}\n`;
}
