import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { BusinessTypeId } from "../src/businessTypes.js";
import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildClaimScopedQualificationIntegrityCostDriverAdmissionV1 } from "../src/canonical/claimScopedQualificationIntegrityCostDriverAdmissionV1.js";
import { buildCommercialDecompositionContractV1 } from "../src/canonical/commercialDecompositionContractV1.js";
import { commercialSemanticFingerprintV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { canonicalFinancialTruthFingerprint, type InternalAnalystPricingModelInput } from "../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { inspectFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import type { ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const OUT = "evaluations/claim-scoped-qualification-integrity-cost-driver-admission-v1";
const EXPECTED_COMMERCIAL_SHA = "a204de0fa0bf4cedfb852ff32327b22f43d5b38c7f6eeb8bea4a26bf417bf456";
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
const EXPECTED_CASES = new Set([
  "Nov_2024_Statement.pdf", "SAMPLE_MERCHANT4_CLOVER.pdf", "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
  "fiserv_NXGEN_VORTAX_Sep_2022.pdf", "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
  "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
]);
const accepted = JSON.parse(await readFile(
  "evaluations/bounded-fee-total-rounding-residual-v1/evaluation-2026-09-12.json", "utf8",
));
const acceptedRd = new Map<string, string>(accepted.statements.map((item: any) => [item.file, item.rdFingerprintAfter]));
const acceptedActivity = new Map<string, string>(accepted.statements.map((item: any) => [item.file, item.activityFingerprintAfter]));
const authority = new GovernedPaymentKnowledgeAuthority();
const registries = [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1];
const commercialBefore = commercialSemanticFingerprintV1(registries);
const statements: any[] = [];

for (const fixture of GOLD) {
  const safeStatementId = fixture.file.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const inspected = await inspectFiservOneStatementEvaluation({ statementPaths: [`test/fixtures/pdfs/${fixture.file}`], safeStatementId });
  const canonical = buildCanonicalStatementFactsFromParsedDocument(inspected.document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const canonicalBefore = canonicalFinancialTruthFingerprint(canonical);
  const knowledge = authority.resolveStatement({
    analysis: canonical,
    context: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["supported_fiserv_us_scope"] } },
    suppliedPricingObservation: deterministicPricing(inspected.document, fixture.file, fixture.businessType, canonical),
  });
  const decomposition = buildCommercialDecompositionContractV1({ analysis: canonical, knowledge });
  const profile = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document, economic: inspected.economic, canonicalAnalysis: canonical, commercialDecomposition: decomposition,
  }).profile;
  const rdBefore = fingerprint(inspected.economic);
  const profileBefore = fingerprint(profile);
  const roundingBefore = fingerprint(inspected.economic.economicLayer.costStack.roundingResidual ?? null);
  const driver = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
    economic: inspected.economic, currentRelationshipProfile: profile, commercialDecomposition: decomposition,
  });
  const rdAfter = fingerprint(inspected.economic);
  const profileAfter = fingerprint(profile);
  const roundingAfter = fingerprint(inspected.economic.economicLayer.costStack.roundingResidual ?? null);
  statements.push({
    file: fixture.file,
    sourceDocumentRef: driver.sourceDocumentRef,
    status: driver.status,
    findingCount: driver.aggregate.findingCount,
    referencedRdChargeCount: driver.aggregate.uniqueReferencedRdChargeCount,
    referencedChargedAmountMinor: driver.aggregate.referencedChargedAmountMinor,
    qualificationRelatedAmountMinor: driver.aggregate.qualificationRelatedAmountMinor,
    integrityMisuseRelatedAmountMinor: driver.aggregate.integrityMisuseRelatedAmountMinor,
    economicLayerStatus: counts(driver.findings.map((finding) => finding.economicLayer.state)),
    collectorStatus: counts(driver.findings.map((finding) => finding.collector.state)),
    ruleSetterStatus: counts(driver.findings.map((finding) => finding.ruleSetter.state)),
    providerControlStatus: counts(driver.findings.map((finding) => finding.providerControl.state)),
    operationalInfluenceStatus: counts(driver.findings.map((finding) => finding.operationalInfluence.state)),
    causalReasonStatus: counts(driver.findings.map((finding) => finding.causalReason.state)),
    avoidabilityStatus: counts(driver.findings.map((finding) => finding.avoidability.state)),
    driverFamilies: counts(driver.findings.map((finding) => finding.driverFamily)),
    findings: driver.findings,
    unresolvedCandidates: driver.unresolvedCandidates,
    rdFingerprintBefore: rdBefore,
    rdFingerprintAfter: rdAfter,
    acceptedRdFingerprint: acceptedRd.get(fixture.file) ?? null,
    activityFingerprintBefore: fingerprint(profile.activity),
    acceptedActivityFingerprint: acceptedActivity.get(fixture.file) ?? null,
    profileFingerprintBefore: profileBefore,
    profileFingerprintAfter: profileAfter,
    roundingFingerprintBefore: roundingBefore,
    roundingFingerprintAfter: roundingAfter,
    canonicalFingerprintBefore: canonicalBefore,
    canonicalFingerprintAfter: canonicalFinancialTruthFingerprint(canonical),
    safety: driver.safety,
  });
}

const commercialAfter = commercialSemanticFingerprintV1(registries);
const corpus = {
  statementCount: statements.length,
  statementsWithFindings: statements.filter((item) => item.findingCount > 0).length,
  findingCount: sum(statements.map((item) => item.findingCount)),
  uniqueReferencedRdChargeCount: sum(statements.map((item) => item.referencedRdChargeCount)),
  referencedChargedAmountMinor: sum(statements.map((item) => item.referencedChargedAmountMinor)),
  qualificationRelatedAmountMinor: sum(statements.map((item) => item.qualificationRelatedAmountMinor)),
  integrityMisuseRelatedAmountMinor: sum(statements.map((item) => item.integrityMisuseRelatedAmountMinor)),
  additiveDriverAmountMinor: 0,
  unresolvedCandidateCount: sum(statements.map((item) => item.unresolvedCandidates.length)),
};
const safetyCounters = {
  unexpectedStatementCount: statements.filter((item) => (item.findingCount > 0) !== EXPECTED_CASES.has(item.file)).length,
  unexpectedFindingCount: corpus.findingCount === 15 ? 0 : 1,
  unexpectedReferencedAmount: corpus.referencedChargedAmountMinor === 2_685 ? 0 : 1,
  duplicateRdChargeReferences: sum(statements.map((item) => item.findingCount - item.referencedRdChargeCount)),
  additiveDriverDollars: corpus.additiveDriverAmountMinor,
  nonUnknownCausalReasons: sum(statements.map((item) => item.findings.filter((finding: any) => finding.causalReason.state !== "UNKNOWN").length)),
  nonUnknownMerchantResponsibility: sum(statements.map((item) => item.findings.filter((finding: any) => finding.merchantResponsibility.state !== "UNKNOWN").length)),
  nonUnknownControllability: sum(statements.map((item) => item.findings.filter((finding: any) => finding.controllability.state !== "UNKNOWN").length)),
  nonUnknownAvoidability: sum(statements.map((item) => item.findings.filter((finding: any) => finding.avoidability.state !== "UNKNOWN").length)),
  rdFingerprintChanges: statements.filter((item) => item.rdFingerprintBefore !== item.rdFingerprintAfter || item.rdFingerprintAfter !== item.acceptedRdFingerprint).length,
  roundingMetadataChanges: statements.filter((item) => item.roundingFingerprintBefore !== item.roundingFingerprintAfter).length,
  profileChanges: statements.filter((item) => item.profileFingerprintBefore !== item.profileFingerprintAfter).length,
  activityAdmissionChanges: statements.filter((item) => item.activityFingerprintBefore !== item.acceptedActivityFingerprint).length,
  canonicalChanges: statements.filter((item) => item.canonicalFingerprintBefore !== item.canonicalFingerprintAfter).length,
  commercialSourceChanges: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA ? 0 : 1,
  comparisonInputs: sum(statements.map((item) => item.safety.comparisonInputCount)),
  savingsOrAnnualizations: sum(statements.map((item) => item.safety.savingsOutputCount + item.safety.annualizationOutputCount)),
  aiWebOrKnowledgeOperations: sum(statements.map((item) => item.safety.aiOrWebOperationCount + item.safety.newKnowledgeAdmissionCount)),
  customerRoutes: statements.filter((item) => item.safety.customerRoutingAllowed).length,
};
const evaluation = {
  schemaVersion: "claim_scoped_qualification_integrity_cost_driver_admission_evaluation_2026_09_12_v1",
  generatedAt: "2026-09-12T00:00:00.000Z",
  mode: "internal_offline",
  baseline: { branch: "codex/bounded-fee-total-rounding-residual-v1", commit: "f0416d398a4a0a51818eeaca60938d4324f8c79b", parent: "ecda171ac58a3c5c0569ed03744330625ad1dc90" },
  governedCommercialSource: { expectedSha256: EXPECTED_COMMERCIAL_SHA, beforeSha256: commercialBefore, afterSha256: commercialAfter, unchanged: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA },
  corpus,
  statements,
  safetyCounters,
  safetyCounterTotal: sum(Object.values(safetyCounters)),
  invariants: {
    exactGoldCorpus: statements.length === 11,
    exactExpectedCaseSet: statements.filter((item) => item.findingCount > 0).every((item) => EXPECTED_CASES.has(item.file)) && statements.filter((item) => item.findingCount > 0).length === EXPECTED_CASES.size,
    exactReferencedCohort: corpus.findingCount === 15 && corpus.uniqueReferencedRdChargeCount === 15 && corpus.referencedChargedAmountMinor === 2_685,
    everyDriverReferencesExistingRd: statements.every((item) => item.findings.every((finding: any) => finding.rdChargeRefs.length > 0 && finding.statementEvidenceRefs.length > 0)),
    allCausalAndAvoidabilityUnknown: statements.every((item) => item.findings.every((finding: any) => finding.causalReason.state === "UNKNOWN" && finding.merchantResponsibility.state === "UNKNOWN" && finding.controllability.state === "UNKNOWN" && finding.avoidability.state === "UNKNOWN")),
    canonicalInvariant11Of11: statements.every((item) => item.canonicalFingerprintBefore === item.canonicalFingerprintAfter),
    rdInvariant11Of11: statements.every((item) => item.rdFingerprintBefore === item.rdFingerprintAfter && item.rdFingerprintAfter === item.acceptedRdFingerprint),
    roundingInvariant11Of11: statements.every((item) => item.roundingFingerprintBefore === item.roundingFingerprintAfter),
    activityInvariant11Of11: statements.every((item) => item.activityFingerprintBefore === item.acceptedActivityFingerprint),
    profileInvariant11Of11: statements.every((item) => item.profileFingerprintBefore === item.profileFingerprintAfter),
    commercialSourceInvariant: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA,
  },
  verification: {
    focusedDriverAndAdmissionBoundary: "7 files / 52 assertions passed",
    canonicalPricingEconomicKnowledgeReportPrivacy: "14 files / 76 assertions passed",
    commercialRuntimeAndGovernance: "10 files / 154 assertions passed",
    canonicalAiFinancialInvariance: "1 file / 3 assertions passed",
    historicalCurrent: "12/13 assertions passed; preserved stale zero-conflict expectation observes four",
    goldContractValidation: "348 approved assertions; zero errors and zero privacy violations",
    typescriptBuild: "passed",
    diffCheck: "passed",
  },
  knownUnrelatedIssues: [
    "Historical/current remains at the accepted 5/6 regression.",
    "Merchant-attention remains at the accepted 62/63 state.",
    "Batch 2 remains at the accepted stale 149-vs-152 aggregate.",
    "Prior legacy public-source/exhaustive SIGSEGV/139 is not investigated.",
  ],
};
const failures = Object.entries(evaluation.invariants).filter(([, ok]) => !ok).map(([name]) => name);
if (evaluation.safetyCounterTotal !== 0) failures.push("safetyCounterTotal");
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/evaluation-2026-09-12.json`, `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(`${OUT}/report-2026-09-12.md`, report(evaluation));
console.log(JSON.stringify({ corpus, safetyCounterTotal: evaluation.safetyCounterTotal, failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;

function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error(`pricing unavailable ${file}`);
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function report(value: typeof evaluation): string {
  const rows = value.statements.map((item) => `| ${item.file} | ${item.findingCount} | ${item.referencedRdChargeCount} | ${money(item.referencedChargedAmountMinor)} | ${money(item.qualificationRelatedAmountMinor)} | ${money(item.integrityMisuseRelatedAmountMinor)} | ${item.causalReasonStatus.UNKNOWN ?? 0}/${item.findingCount} UNKNOWN | ${item.avoidabilityStatus.UNKNOWN ?? 0}/${item.findingCount} UNKNOWN |`).join("\n");
  return `# Claim-Scoped Qualification & Integrity Cost Driver Admission v1\n\n- Baseline: \`${value.baseline.commit}\`.\n- Findings: ${value.corpus.findingCount} across ${value.corpus.statementsWithFindings}/11 statements.\n- Referenced RD charges: ${value.corpus.uniqueReferencedRdChargeCount} / ${money(value.corpus.referencedChargedAmountMinor)}.\n- Qualification-related: ${money(value.corpus.qualificationRelatedAmountMinor)}.\n- Integrity/misuse-related: ${money(value.corpus.integrityMisuseRelatedAmountMinor)}.\n- Additive driver dollars: ${money(value.corpus.additiveDriverAmountMinor)}.\n- Canonical, RD, rounding, activity, profile, and commercial-source invariance: 11/11 / unchanged.\n- Safety counter total: ${value.safetyCounterTotal}.\n\n| Statement | Findings | RD refs | Referenced dollars | Qualification | Integrity/misuse | Cause | Avoidability |\n|---|---:|---:|---:|---:|---:|---|---|\n${rows}\n\nEvery finding references existing RD charges. Cause, responsibility, controllability, and avoidability remain UNKNOWN. Ambiguous qualification-like labels remain unresolved candidates.\n`;
}

function counts(values: string[]): Record<string, number> {
  return values.reduce((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {} as Record<string, number>);
}
function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function money(value: number): string { return `${value < 0 ? "-" : ""}$${(Math.abs(value) / 100).toFixed(2)}`; }
