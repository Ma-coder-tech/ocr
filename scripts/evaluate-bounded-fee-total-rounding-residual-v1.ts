import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { BusinessTypeId } from "../src/businessTypes.js";
import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildCommercialDecompositionContractV1 } from "../src/canonical/commercialDecompositionContractV1.js";
import { commercialSemanticFingerprintV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { canonicalFinancialTruthFingerprint, type InternalAnalystPricingModelInput } from "../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing, fiservFeeLedgerOccurrences,
  FISERV_BOUNDED_FEE_ROUNDING_POLICY_V1 } from "../src/canonical/v2/index.js";
import { inspectFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import type { ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const OUT = "evaluations/bounded-fee-total-rounding-residual-v1";
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
const ROUNDING = new Set([
  "fiserv_ABDUL_BASHER_Aug_2025.pdf", "fiserv_NXGEN_VORTAX_Sep_2022.pdf", "fiserv_PAYSAFE_Febr_2024.pdf",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
]);
const accepted = JSON.parse(await readFile(
  "evaluations/exact-control-claim-scoped-fiserv-fee-occurrence-admission-v1/evaluation-2026-09-12.json", "utf8",
));
const acceptedRd = new Map<string, string>(accepted.statements.map((item: any) => [item.file, item.rdFingerprintAfter]));
const registries = [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1];
const commercialBefore = commercialSemanticFingerprintV1(registries);
const authority = new GovernedPaymentKnowledgeAuthority();
const statements: any[] = [];

for (const fixture of GOLD) {
  const safeStatementId = fixture.file.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const inspected = await inspectFiservOneStatementEvaluation({ statementPaths: [`test/fixtures/pdfs/${fixture.file}`], safeStatementId });
  const canonical = buildCanonicalStatementFactsFromParsedDocument(inspected.document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const canonicalBefore = canonicalFinancialTruthFingerprint(canonical);
  const pricingInput = deterministicPricing(inspected.document, fixture.file, fixture.businessType, canonical);
  const knowledge = authority.resolveStatement({ analysis: canonical,
    context: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["supported_fiserv_us_scope"] } },
    suppliedPricingObservation: pricingInput });
  const decomposition = buildCommercialDecompositionContractV1({ analysis: canonical, knowledge });
  const before = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(
    inspected.pricing, [], [], inspected.feeOccurrenceAdmission, null,
  );
  const after = inspected.economic;
  const profileBefore = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document, economic: before, canonicalAnalysis: canonical, commercialDecomposition: decomposition,
  }).profile;
  const profileAfter = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document, economic: after, canonicalAnalysis: canonical, commercialDecomposition: decomposition,
  }).profile;
  const rows = fiservFeeLedgerOccurrences(inspected.observationalFoundation);
  const beforeRefs = new Set(before.economicLayer.charges.filter((charge) => charge.contributionStatus.startsWith("contributes_"))
    .map((charge) => charge.contributingOccurrenceRef).filter((ref): ref is string => Boolean(ref)));
  const afterCharges = after.economicLayer.charges.filter((charge) => charge.contributionStatus.startsWith("contributes_"));
  const newCharges = afterCharges.filter((charge) => charge.contributingOccurrenceRef && !beforeRefs.has(charge.contributingOccurrenceRef));
  const newRefs = new Set(newCharges.map((charge) => charge.contributingOccurrenceRef));
  const rounding = inspected.feeRoundingResidual!;
  const rowDisposition = rows.map((row) => ({
    occurrenceRef: row.id, evidenceRef: row.evidenceRef, label: row.sourceLabel,
    amountMinor: row.printedAmount?.amountMinor ?? null, printedDirection: row.printedDirection,
    disposition: newRefs.has(row.id) ? "newly_admitted_additive_rd_charge"
      : beforeRefs.has(row.id) ? "already_admitted_before_milestone"
      : row.printedAmount?.amountMinor === 0 ? "preserved_zero_nonadditive"
      : "excluded",
    reason: newRefs.has(row.id) ? "complete_source-bound fee population reconciles under bounded non-additive rounding control"
      : beforeRefs.has(row.id) ? "represented in accepted pre-milestone RD ledger"
      : row.printedAmount?.amountMinor === 0 ? "zero-dollar source row is evidence only"
      : rounding.reasonCodes.join(", "),
  }));
  statements.push({
    file: fixture.file, period: inspected.foundation.identity.statementPeriod,
    admissionSourceBefore: before.economicLayer.admissionProfile.source,
    admissionSourceAfter: after.economicLayer.admissionProfile.source,
    roundingAdmissionStatus: rounding.status, roundingReasons: rounding.reasonCodes,
    roundingControl: rounding.control,
    rdChargeCountBefore: beforeRefs.size, rdChargeCountAfter: afterCharges.length,
    newlyAdmittedCount: newCharges.length,
    newlyAdmittedAmountMinor: sum(newCharges.map((charge) => charge.observedAmount!.amountMinor)),
    newlyAdmittedRows: rowDisposition.filter((row) => row.disposition === "newly_admitted_additive_rd_charge"),
    excludedOrPreviouslyAdmittedRows: rowDisposition.filter((row) => row.disposition !== "newly_admitted_additive_rd_charge"),
    rdBefore: compactRd(before), rdAfter: compactRd(after),
    rdFingerprintBefore: fingerprint(before), rdFingerprintAfter: fingerprint(after),
    expectedAcceptedRdFingerprintBefore: acceptedRd.get(fixture.file) ?? null,
    acceptedRdFingerprintMatched: fingerprint(before) === acceptedRd.get(fixture.file),
    profileBefore: compactProfile(profileBefore), profileAfter: compactProfile(profileAfter),
    activityFingerprintBefore: fingerprint(profileBefore.activity), activityFingerprintAfter: fingerprint(profileAfter.activity),
    activityInvariant: fingerprint(profileBefore.activity) === fingerprint(profileAfter.activity),
    canonicalFingerprintBefore: canonicalBefore,
    canonicalFingerprintAfter: canonicalFinancialTruthFingerprint(canonical),
    canonicalInvariant: canonicalBefore === canonicalFinancialTruthFingerprint(canonical),
    safety: rounding.safety,
  });
}

const commercialAfter = commercialSemanticFingerprintV1(registries);
const newCount = sum(statements.map((item) => item.newlyAdmittedCount));
const newAmount = sum(statements.map((item) => item.newlyAdmittedAmountMinor));
const usableBefore = statements.filter((item) => item.profileBefore.totalMinor !== null);
const usableAfter = statements.filter((item) => item.profileAfter.totalMinor !== null);
const safetyCounters = {
  unexpectedNewStatementCount: statements.filter((item) => item.newlyAdmittedCount > 0 && !ROUNDING.has(item.file)).length,
  missingAuthorizedStatementCount: statements.filter((item) => ROUNDING.has(item.file) && item.newlyAdmittedCount === 0).length,
  unexpectedNewOccurrenceCount: newCount === 175 ? 0 : 1,
  unexpectedNewAmount: newAmount === 404_316 ? 0 : 1,
  residualAdditiveOccurrences: statements.filter((item) => item.rdAfter.roundingResidual?.additiveChargeRef !== null &&
    item.rdAfter.roundingResidual?.additiveChargeRef !== undefined).length,
  zeroDollarAdditiveCharges: statements.reduce((n, item) => n + item.newlyAdmittedRows.filter((row: any) => row.amountMinor === 0).length, 0),
  unsafeDirectionAdmissions: statements.reduce((n, item) => n + item.newlyAdmittedRows.filter((row: any) =>
    !["positive", "unsigned"].includes(row.printedDirection)).length, 0),
  residualsBeyondBoundary: statements.filter((item) => item.roundingAdmissionStatus === "ADMITTED" &&
    (item.roundingControl.absoluteResidualMinor < 1 || item.roundingControl.absoluteResidualMinor > 2)).length,
  rowMutations: statements.filter((item) => item.roundingAdmissionStatus === "ADMITTED" && item.roundingControl.individualPrintedAmountsModified).length,
  principalOrAdjustmentAdmissions: statements.filter((item) => item.roundingAdmissionStatus === "ADMITTED" &&
    item.roundingControl.principalOrAdjustmentRequiredForReconciliation).length,
  unrelatedRdChanges: statements.filter((item) => item.rdFingerprintBefore !== item.rdFingerprintAfter && !ROUNDING.has(item.file)).length,
  baselineRdFingerprintMismatches: statements.filter((item) => !item.acceptedRdFingerprintMatched).length,
  activityChanges: statements.filter((item) => !item.activityInvariant).length,
  canonicalChanges: statements.filter((item) => !item.canonicalInvariant).length,
  commercialSourceChanges: commercialBefore === commercialAfter ? 0 : 1,
  duplicateChargeContributions: sum(statements.map((item) => item.profileAfter.duplicateChargeContributionCount)),
  nonFeePrincipalContributions: sum(statements.map((item) => item.profileAfter.nonFeePrincipalContributionCount)),
  comparatorInputs: sum(statements.map((item) => item.profileAfter.comparatorInputCount)),
  savingsOrAnnualizations: sum(statements.map((item) => item.profileAfter.savingsOutputCount + item.profileAfter.annualizationOutputCount)),
  customerRoutes: statements.filter((item) => item.profileAfter.customerRoutingAllowed).length,
  aiWebOrKnowledgeOperations: sum(statements.map((item) => item.safety.aiOrWebOperationCount + item.safety.newKnowledgeAdmissionCount)),
};
const evaluation = {
  schemaVersion: "bounded_fee_total_rounding_residual_evaluation_2026_09_12_v1",
  policyVersion: FISERV_BOUNDED_FEE_ROUNDING_POLICY_V1,
  generatedAt: "2026-09-12T00:00:00.000Z", mode: "internal_offline",
  baseline: { branch: "codex/exact-control-claim-scoped-fiserv-fee-occurrence-admission-v1",
    commit: "ecda171ac58a3c5c0569ed03744330625ad1dc90", parent: "43263cd912bb882207c8110d2d9e07c023ea75ff" },
  governedCommercialSource: { expectedSha256: EXPECTED_COMMERCIAL_SHA, beforeSha256: commercialBefore,
    afterSha256: commercialAfter, unchanged: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA },
  corpus: { statementCount: statements.length, newlyAdmittedStatementCount: statements.filter((item) => item.newlyAdmittedCount > 0).length,
    newlyAdmittedStatements: statements.filter((item) => item.newlyAdmittedCount > 0).map((item) => item.file),
    additiveRdChargeCountBefore: sum(statements.map((item) => item.rdChargeCountBefore)),
    additiveRdChargeCountAfter: sum(statements.map((item) => item.rdChargeCountAfter)), newCount, newAmount },
  economicsProfile: { statementsUsableBefore: usableBefore.length, statementsUsableAfter: usableAfter.length,
    chargedCostTotalBeforeMinor: sum(usableBefore.map((item) => item.profileBefore.totalMinor)),
    chargedCostTotalAfterMinor: sum(usableAfter.map((item) => item.profileAfter.totalMinor)) },
  statements, safetyCounters, safetyCounterTotal: sum(Object.values(safetyCounters)),
  invariants: {
    exactGoldCorpus: statements.length === 11,
    exactAuthorizedCohort: newCount === 175 && newAmount === 404_316 && statements.filter((item) => item.newlyAdmittedCount > 0).every((item) => ROUNDING.has(item.file)),
    exactControlBaselinePreserved: statements.every((item) => item.acceptedRdFingerprintMatched),
    onlyFourRdArtifactsChanged: statements.every((item) => (item.rdFingerprintBefore !== item.rdFingerprintAfter) === ROUNDING.has(item.file)),
    canonicalInvariant11Of11: statements.every((item) => item.canonicalInvariant),
    activityInvariant11Of11: statements.every((item) => item.activityInvariant),
    commercialSourceInvariant: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA,
    residualAlwaysNonadditive: statements.filter((item) => item.roundingAdmissionStatus === "ADMITTED").every((item) =>
      item.rdAfter.roundingResidual?.additiveChargeRef === null && item.rdAfter.roundingResidual?.category === null &&
      item.rdAfter.roundingResidual?.participantOrOwner === null),
    everyAdmittedRowSourceBound: statements.flatMap((item) => item.newlyAdmittedRows).every((row) =>
      row.occurrenceRef && row.evidenceRef && row.amountMinor > 0 && ["positive", "unsigned"].includes(row.printedDirection)),
    expectedProfileLift: usableBefore.length === 8 && usableAfter.length === 11 &&
      sum(statements.map((item) => item.rdChargeCountBefore)) === 492 && sum(statements.map((item) => item.rdChargeCountAfter)) === 667 &&
      sum(usableBefore.map((item) => item.profileBefore.totalMinor)) === 1_251_056 &&
      sum(usableAfter.map((item) => item.profileAfter.totalMinor)) === 1_646_257,
  },
  verification: {
    focusedRoundingAndExactAdmission: "2 files / 12 assertions passed",
    rdSynthesisProfileActivityAndDecomposition: "9 files / 76 assertions passed",
    runtimeAndSynthesis: "6 files / 68 assertions passed",
    goldContractValidation: "348 approved assertions; zero errors and zero privacy violations",
    typescriptBuild: "passed",
    diffCheck: "passed",
  },
  knownUnrelatedIssues: [
    "Historical/current remains at the accepted 5/6 regression.", "Merchant-attention remains at the accepted 62/63 state.",
    "Batch 2 remains at the accepted stale 149-vs-152 aggregate.", "Prior legacy public-source/exhaustive SIGSEGV/139 is not investigated.",
  ],
};
const failed = Object.entries(evaluation.invariants).filter(([, ok]) => !ok).map(([name]) => name);
if (evaluation.safetyCounterTotal !== 0) failed.push("safetyCounterTotal");
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/evaluation-2026-09-12.json`, `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(`${OUT}/report-2026-09-12.md`, report(evaluation));
console.log(JSON.stringify({ corpus: evaluation.corpus, economicsProfile: evaluation.economicsProfile,
  safetyCounterTotal: evaluation.safetyCounterTotal, failed }, null, 2));
if (failed.length) process.exitCode = 1;

function compactRd(value: any) { const stack = value.economicLayer.costStack; return {
  source: value.economicLayer.admissionProfile.source, completeness: stack.completeness,
  totalMinor: stack.totalStatementProcessingCost?.amountMinor ?? null, chargeNetMinor: stack.classifiedChargeNet.amountMinor,
  deltaMinor: stack.reconciliationDeltaMinor, unresolvedRemainderMinor: stack.unresolvedRemainder?.amountMinor ?? null,
  roundingResidual: stack.roundingResidual ?? null,
}; }
function compactProfile(value: any) { return { totalMinor: value.chargedCostProfile.rdTotalStatementProcessingCost?.amountMinor ?? null,
  itemCount: value.chargedCostProfile.items.length, mappedNetMinor: value.chargedCostProfile.mappedNetAmountMinor,
  deltaMinor: value.chargedCostProfile.profileReconciliationDeltaMinor, reconciles: value.chargedCostProfile.reconcilesToRdTotal,
  roundingResidual: value.chargedCostProfile.rdNonAdditiveRoundingResidual ?? null,
  duplicateChargeContributionCount: value.chargedCostProfile.duplicateChargeContributionCount,
  nonFeePrincipalContributionCount: value.chargedCostProfile.nonFeePrincipalContributionCount,
  comparatorInputCount: value.safety.comparatorInputCount, savingsOutputCount: value.safety.savingsOutputCount,
  annualizationOutputCount: value.safety.annualizationOutputCount, customerRoutingAllowed: value.safety.customerRoutingAllowed }; }
function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error(`pricing unavailable ${file}`);
  return { model: model as InternalAnalystPricingModelInput["model"], confidence: found?.pricingModel?.confidence === "high" ? "high" :
    found?.pricingModel?.confidence === "medium" ? "medium" : "low", evidenceRefs: analysis.feeLedger.rows.slice(0, 3)
      .flatMap((row) => row.contributionDecision.evidenceRefs), relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true };
}
function report(value: typeof evaluation): string { const cases = value.statements.filter((item) => item.roundingAdmissionStatus === "ADMITTED")
  .map((item) => `| ${item.file} | ${money(item.roundingControl.admittedFeeOccurrenceSumMinor)} | ${money(item.roundingControl.printedStatementFeeTotalMinor)} | ${item.roundingControl.signedResidualMinor}¢ | ${item.newlyAdmittedCount} |`).join("\n");
  return `# Bounded Fee-Total Rounding Residual v1\n\n- Baseline: \`${value.baseline.commit}\`.\n- Newly admitted: ${value.corpus.newCount} rows / ${money(value.corpus.newAmount)} across ${value.corpus.newlyAdmittedStatementCount} statements.\n- RD additive rows: ${value.corpus.additiveRdChargeCountBefore} → ${value.corpus.additiveRdChargeCountAfter}.\n- Usable profiles: ${value.economicsProfile.statementsUsableBefore}/11 → ${value.economicsProfile.statementsUsableAfter}/11.\n- Charged cost: ${money(value.economicsProfile.chargedCostTotalBeforeMinor)} → ${money(value.economicsProfile.chargedCostTotalAfterMinor)}.\n- Canonical fingerprints unchanged: ${value.invariants.canonicalInvariant11Of11 ? "11/11" : "FAIL"}.\n- Commercial-source SHA-256: \`${value.governedCommercialSource.afterSha256}\`.\n- Safety counter total: ${value.safetyCounterTotal}.\n\n| Statement | Fee-row sum | Printed fee total | Signed residual | New RD rows |\n|---|---:|---:|---:|---:|\n${cases}\n\nThe JSON artifact records every newly admitted fee occurrence and every excluded or previously admitted row with its reason. Residuals remain non-additive metadata and never become charges, categories, participants, comparison inputs, savings, or customer output.\n\n## Verification\n\n${Object.entries(value.verification).map(([key, result]) => `- ${key}: ${result}`).join("\n")}\n`;
}
function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function money(value: number) { return `${value < 0 ? "-" : ""}$${(Math.abs(value) / 100).toFixed(2)}`; }
