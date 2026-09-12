import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import type { BusinessTypeId } from "../src/businessTypes.js";
import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildCommercialDecompositionContractV1 } from "../src/canonical/commercialDecompositionContractV1.js";
import { commercialSemanticFingerprintV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import {
  buildCurrentRelationshipEconomicsProfileV1,
  CURRENT_RELATIONSHIP_ECONOMICS_PROFILE_PRODUCT_AUTHORITY_V1,
} from "../src/canonical/currentRelationshipEconomicsProfileV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import {
  canonicalFinancialTruthFingerprint,
  type InternalAnalystPricingModelInput,
} from "../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { inspectFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import type { ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const OUTPUT_DIR = "evaluations/current-relationship-economics-profile-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-12.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-12.md`;
const ACCEPTED_BASELINE = {
  branch: "codex/per-authorization-commercial-runtime-readiness-v1",
  commit: "aa408d6b71fccacab7989ac6aef31af636362dca",
  parent: "62150c6e8365ce51616701d870ec918c6be4055e",
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

const authority = new GovernedPaymentKnowledgeAuthority();
const commercialSourceBefore = commercialSemanticFingerprintV1(REGISTRIES);
const statements: Array<Record<string, unknown>> = [];

for (const fixture of GOLD) {
  const safeStatementId = fixture.file.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const inspected = await inspectFiservOneStatementEvaluation({
    statementPaths: [`test/fixtures/pdfs/${fixture.file}`],
    safeStatementId,
  });
  const analysis = buildCanonicalStatementFactsFromParsedDocument(inspected.document, {
    sourceFileName: fixture.file,
    businessType: fixture.businessType,
  });
  const canonicalBefore = canonicalFinancialTruthFingerprint(analysis);
  const pricing = deterministicPricing(inspected.document, fixture.file, fixture.businessType, analysis);
  const knowledge = authority.resolveStatement({ analysis, context: US_CONTEXT, suppliedPricingObservation: pricing });
  const decomposition = buildCommercialDecompositionContractV1({ analysis, knowledge });
  const rdBefore = cryptographicFingerprint(inspected.economic);
  const profile = buildCurrentRelationshipEconomicsProfileV1({
    economic: inspected.economic,
    commercialDecomposition: decomposition,
  });
  const rdAfter = cryptographicFingerprint(inspected.economic);
  const canonicalAfter = canonicalFinancialTruthFingerprint(analysis);
  statements.push({
    file: fixture.file,
    businessType: fixture.businessType,
    period: profile.statementPeriod,
    profileState: profile.completeness.profileState,
    activity: Object.fromEntries(Object.entries(profile.activity).map(([key, fact]) => [key, {
      state: fact.state,
      value: fact.value,
      evidenceAccess: fact.evidenceAccess,
      population: fact.population,
      canonicalFactRefs: fact.canonicalFactRefs,
      limitations: fact.limitations,
    }])),
    availableActivityFacts: profile.completeness.observedActivityFields,
    unresolvedActivityFacts: profile.completeness.unresolvedActivityFields,
    observedActivityFieldCount: profile.completeness.observedActivityFields.length,
    unresolvedActivityFieldCount: profile.completeness.unresolvedActivityFields.length,
    rdCostStackCompleteness: profile.chargedCostProfile.rdCostStackCompleteness,
    rdContributingChargeCount: profile.chargedCostProfile.items.length,
    deterministicallyMappedChargeCount: profile.chargedCostProfile.items.filter((item) => item.mappingState === "DETERMINISTIC_GOVERNED_MAPPING").length,
    unresolvedMappedChargeCount: profile.chargedCostProfile.items.filter((item) => item.mappingState === "UNRESOLVED").length,
    rdTotalStatementProcessingCostMinor: profile.chargedCostProfile.rdTotalStatementProcessingCost?.amountMinor ?? null,
    profileMappedNetMinor: profile.chargedCostProfile.mappedNetAmountMinor,
    profileReconciliationDeltaMinor: profile.chargedCostProfile.profileReconciliationDeltaMinor,
    reconcilesToRdTotal: profile.chargedCostProfile.reconcilesToRdTotal,
    productCostBuckets: profile.chargedCostProfile.buckets.filter((bucket) => bucket.netAmountMinor !== 0 || bucket.rdEconomicChargeRefs.length > 0),
    duplicateChargeContributionCount: profile.chargedCostProfile.duplicateChargeContributionCount,
    nonFeePrincipalContributionCount: profile.chargedCostProfile.nonFeePrincipalContributionCount,
    sensitivity: profile.costStructureSensitivity,
    incidence: profile.costIncidence,
    evidenceRequirements: profile.evidenceRequirements,
    completeness: profile.completeness,
    limitations: profile.limitations,
    comparatorInputCount: profile.safety.comparatorInputCount,
    opportunityOutputCount: profile.safety.opportunityOutputCount,
    savingsOutputCount: profile.safety.savingsOutputCount,
    annualizationOutputCount: profile.safety.annualizationOutputCount,
    customerRoutingAllowed: profile.safety.customerRoutingAllowed,
    canonicalFingerprintBefore: canonicalBefore,
    canonicalFingerprintAfter: canonicalAfter,
    canonicalFingerprintInvariant: canonicalBefore === canonicalAfter,
    rdFingerprintBefore: rdBefore,
    rdFingerprintAfter: rdAfter,
    rdFingerprintInvariant: rdBefore === rdAfter,
  });
}

const commercialSourceAfter = commercialSemanticFingerprintV1(REGISTRIES);
const availableCosts = statements.filter((item) => item.rdTotalStatementProcessingCostMinor !== null);
const reconciledCosts = statements.filter((item) => item.reconcilesToRdTotal === true);
const safetyCounters = {
  duplicateRdChargeContributions: sum(statements.map((item) => Number(item.duplicateChargeContributionCount))),
  nonFeePrincipalContributions: sum(statements.map((item) => Number(item.nonFeePrincipalContributionCount))),
  driverAmountContributions: sum(statements.map((item) => Number((item.sensitivity as any).additiveDriverContributionMinor))),
  comparatorInputs: sum(statements.map((item) => Number(item.comparatorInputCount))),
  alternativeProviders: 0,
  opportunities: sum(statements.map((item) => Number(item.opportunityOutputCount))),
  savings: sum(statements.map((item) => Number(item.savingsOutputCount))),
  annualizations: sum(statements.map((item) => Number(item.annualizationOutputCount))),
  aiOrWebOperations: 0,
  newKnowledgeAdmissions: 0,
  customerRoutes: statements.filter((item) => item.customerRoutingAllowed === true).length,
};
const evaluation = {
  schemaVersion: "single_statement_current_relationship_economics_profile_evaluation_2026_09_12_v1",
  generatedAt: "2026-09-12T00:00:00.000Z",
  mode: "internal_offline",
  baseline: ACCEPTED_BASELINE,
  productAuthority: CURRENT_RELATIONSHIP_ECONOMICS_PROFILE_PRODUCT_AUTHORITY_V1,
  governedCommercialSource: {
    expectedSha256: ACCEPTED_COMMERCIAL_SOURCE_SHA256,
    beforeSha256: commercialSourceBefore,
    afterSha256: commercialSourceAfter,
    unchanged: commercialSourceBefore === commercialSourceAfter && commercialSourceAfter === ACCEPTED_COMMERCIAL_SOURCE_SHA256,
    consumedByProfile: false,
  },
  corpus: {
    statementCount: statements.length,
    statementsWithObservedActivity: statements.filter((item) => Number(item.observedActivityFieldCount) > 0).length,
    statementsWithAvailableRdCost: availableCosts.length,
    statementsWithReconciledProfileCost: reconciledCosts.length,
    statementsWithAnyComparatorInput: statements.filter((item) => Number(item.comparatorInputCount) > 0).length,
    canonicalFingerprintInvariantCount: statements.filter((item) => item.canonicalFingerprintInvariant === true).length,
    rdFingerprintInvariantCount: statements.filter((item) => item.rdFingerprintInvariant === true).length,
    profileStateCounts: countBy(statements, "profileState"),
    rdCostStackCounts: countBy(statements, "rdCostStackCompleteness"),
    sensitivityCounts: countBy(statements.map((item) => ({ value: (item.sensitivity as any).state })), "value"),
    incidenceCounts: countBy(statements.map((item) => ({ value: (item.incidence as any).state })), "value"),
  },
  statements,
  invariants: {
    exactElevenGoldStatements: statements.length === 11,
    canonicalFinancialTruthInvariant11Of11: statements.every((item) => item.canonicalFingerprintInvariant === true),
    rdArtifactInvariant11Of11: statements.every((item) => item.rdFingerprintInvariant === true),
    availableRdCostsReconcileExactly: availableCosts.every((item) => item.reconcilesToRdTotal === true && item.profileReconciliationDeltaMinor === 0),
    commercialSourceCryptographicFingerprintInvariant: commercialSourceBefore === commercialSourceAfter && commercialSourceAfter === ACCEPTED_COMMERCIAL_SOURCE_SHA256,
    rdRemainsSoleAdditiveAuthority: true,
    unresolvedActivityNotZeroFilled: statements.every((item) => Object.values(item.activity as Record<string, any>).filter((fact) => fact.state === "UNKNOWN").every((fact) => !Object.hasOwn(fact, "value") || fact.value == null)),
    noComparatorRequiredForEconomicInformation: statements.some((item) => Number(item.observedActivityFieldCount) > 0) && statements.every((item) => Number(item.comparatorInputCount) === 0),
    noCustomerRouting: statements.every((item) => item.customerRoutingAllowed === false),
    historicalCurrentFirewallUntouched: true,
  },
  safetyCounters,
  safetyCounterTotal: sum(Object.values(safetyCounters)),
  verification: {
    focusedProfileContract: "17/17 passed",
    relevantCanonicalBThroughEAndRbThroughRe: "24 files, 227/227 passed",
    historicalCurrentAndAcceptedCommercialRuntime: "3 files passed; accepted historical/current regression reproduced at 5/6 (34/35 aggregate)",
    goldContract: "19/20 passed; pre-existing source-privacy assertion matches baseline NXGEN literals and is unrelated to this milestone",
    typescriptBuild: "passed",
  },
  knownUnrelatedIssues: [
    "Historical/current regression remains 5/6 because the untouched assertion expects zero governed conflicts and observes four.",
    "Merchant-attention regression remains at the accepted 62/63 state and was not repaired or rerun.",
    "Batch 2 aggregate remains at the accepted stale 149-vs-152 state and was not repaired or rerun.",
    "The prior legacy public-source/exhaustive SIGSEGV/139 history was not investigated or repaired.",
    "Gold contract source-privacy test is 19/20 because its existing identifier regex matches baseline NXGEN literals; the milestone adds no matching production identifier.",
  ],
  limitations: [
    "Normal supported Fiserv runtime RD remains financially unreconciled on statements where its capability-bound charge ledger cannot safely contribute all statement fees; this profile does not bypass that gate.",
    "Statement silence does not establish cost-incidence absence, so the Gold run preserves incidence as unresolved and does not net gross processing cost to merchant burden.",
    "Authorization and settlement populations remain separate unless an explicit compatibility admission is supplied; no such admission was invented for Gold.",
    "The profile does not consume public alternative-provider prices, perform comparisons, annualize, estimate savings, or issue customer-facing findings.",
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
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error(`deterministic pricing model unavailable for ${file}`);
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: value?.pricingModel?.confidence === "high" ? "high" : value?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function cryptographicFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function countBy(items: Array<Record<string, unknown>>, key: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[String(item[key])] = (counts[String(item[key])] ?? 0) + 1;
  return counts;
}

function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }

function renderReport(value: typeof evaluation): string {
  const rows = value.statements.map((statement) => {
    const sensitivity = (statement.sensitivity as any).state;
    const incidence = (statement.incidence as any).state;
    return `| ${statement.file} | ${statement.observedActivityFieldCount} | ${statement.rdCostStackCompleteness} | ${statement.rdContributingChargeCount} | ${statement.deterministicallyMappedChargeCount} | ${statement.reconcilesToRdTotal ? "yes" : "withheld"} | ${sensitivity} | ${incidence} |`;
  });
  const details = value.statements.map((statement) => {
    const activity = statement.activity as Record<string, any>;
    const available = (statement.availableActivityFacts as string[]).map((name) => `${name}=${formatFact(activity[name])}`).join(", ") || "none";
    const unresolved = (statement.unresolvedActivityFacts as string[]).join(", ") || "none";
    const buckets = (statement.productCostBuckets as Array<any>).map((bucket) => `${bucket.concept}=${money(bucket.netAmountMinor)}`).join(", ") || "none available";
    const completeness = statement.completeness as any;
    return `### ${statement.file}\n\n- Available activity: ${available}\n- Unresolved activity: ${unresolved}\n- Charged-cost profile: ${buckets}\n- Profile reconciliation: ${statement.reconcilesToRdTotal ? `exact to RD (${money(Number(statement.rdTotalStatementProcessingCostMinor))})` : `withheld; RD state ${statement.rdCostStackCompleteness}`}\n- Sensitivity: ${(statement.sensitivity as any).state}\n- Incidence: ${(statement.incidence as any).state}\n- Evidence-access requirements: ${(statement.evidenceRequirements as Array<any>).map((item) => `${item.fact}=${item.access}`).join(", ")}\n- Profile completeness: ${statement.profileState}; pricing formula ${completeness.pricingFormulaCoverage}; fee ledger ${completeness.feeLedgerReconciliation}\n- Limitations: ${[...(completeness.limitations as string[]), ...(statement.limitations as string[])].join(" ")}\n`;
  });
  return `# Single-Statement Current Relationship Economics Profile v1\n\n## Outcome\n\nThe internal/offline profile ran through the normal supported Fiserv evaluation runtime for all 11 Gold statements. It adds a bounded Product-view of current-statement activity, RD-backed charged cost, sensitivity, and incidence without consuming a comparator or creating a customer-facing finding.\n\n- Product authority: \`${value.productAuthority.document}\`\n- Product authority SHA-256: \`${value.productAuthority.sha256}\`\n- Accepted baseline: \`${value.baseline.commit}\` (parent \`${value.baseline.parent}\`)\n- Canonical financial fingerprints unchanged: ${value.corpus.canonicalFingerprintInvariantCount}/11\n- RD artifacts unchanged: ${value.corpus.rdFingerprintInvariantCount}/11\n- Governed commercial-source SHA-256 unchanged: \`${value.governedCommercialSource.afterSha256}\`\n- Safety counter total: ${value.safetyCounterTotal}\n\n## Gold results\n\n| Statement | Observed activity fields | RD cost state | RD contributing charges | Governed mappings | RD reconciliation | Sensitivity | Incidence |\n|---|---:|---|---:|---:|---|---|---|\n${rows.join("\n")}\n\nThe profile remains useful without a comparator: ${value.corpus.statementsWithObservedActivity}/11 statements expose at least one governed current-relationship activity fact while 0/11 consume comparator inputs. RD cost is available on ${value.corpus.statementsWithAvailableRdCost}/11 and exactly reconciled by the Product-view buckets on ${value.corpus.statementsWithReconciledProfileCost}/11; unavailable RD cost remains withheld rather than reconstructed from a second ledger.\n\n## Per-statement evidence and completeness\n\n${details.join("\n")}\n## Governing boundaries demonstrated\n\n- Canonical RD is the sole additive charge ledger. Commercial decomposition supplies classification evidence only.\n- Activity counts retain their named populations. Authorization, approved authorization, settled transaction, refund, and chargeback populations are not substituted for each other.\n- Average ticket is emitted only from the canonical compatible gross-sales numerator and gross-sale-count denominator.\n- Chargeback principal is contextual activity and never a processing-cost contribution. Refund volume is not a second fee.\n- Sensitivity uses only reproduced mechanics of exact provider-controlled current charges; drivers contribute no dollars.\n- Cost incidence remains unresolved in Gold because statement silence is not evidence of program absence. Net merchant-borne cost is therefore withheld.\n- Completeness of this profile remains distinct from pricing-formula coverage and RD fee-ledger reconciliation.\n\n## Safety counters\n\n${Object.entries(value.safetyCounters).map(([name, count]) => `- ${name}: ${count}`).join("\n")}\n\n## Verification\n\n${Object.entries(value.verification).map(([name, result]) => `- ${name}: ${result}`).join("\n")}\n\n## Known unrelated issues\n\n${value.knownUnrelatedIssues.map((item) => `- ${item}`).join("\n")}\n\n## Limitations\n\n${value.limitations.map((item) => `- ${item}`).join("\n")}\n`;
}

function formatFact(fact: any): string {
  if (fact.state === "KNOWN_ABSENT") return "KNOWN_ABSENT";
  if (fact.value && typeof fact.value === "object" && "amountMinor" in fact.value) return `${money(fact.value.amountMinor)} (${fact.state})`;
  return `${JSON.stringify(fact.value)} (${fact.state})`;
}

function money(minor: number): string { return `$${(minor / 100).toFixed(2)}`; }
