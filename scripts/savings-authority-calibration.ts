import path from "node:path";
import { parsePdf } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import { buildCanonicalRuntimeAnalysis } from "../src/canonical/runtimeAdapter.js";
import type { BusinessTypeId } from "../src/businessTypes.js";
import type { SavingsAuthorityStatus, SavingsAuthoritySourceStream } from "../src/claimAuthorityF4/savingsAuthorityComparison.js";

// Repository observations only. These are not authenticated Gold source mappings.
const fixtures = [
  { caseId: "G1", file: "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf", businessType: "other", acceptedF4Calibration: true },
  { caseId: "G2", file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce", acceptedF4Calibration: true },
  { caseId: "G3", file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", businessType: "ecommerce", acceptedF4Calibration: true },
  { caseId: "G4", file: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", businessType: "restaurant_food_beverage", acceptedF4Calibration: true },
  { caseId: "G5", file: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", businessType: "restaurant_food_beverage", acceptedF4Calibration: true },
  { caseId: "G6", file: "fiserv_NXGEN_VORTAX_Sep_2022.pdf", businessType: "retail", acceptedF4Calibration: false },
  { caseId: "G7", file: "fiserv_ABDUL_BASHER_Aug_2025.pdf", businessType: "retail", acceptedF4Calibration: true },
  { caseId: "G8", file: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", businessType: "restaurant_food_beverage", acceptedF4Calibration: true },
  { caseId: "G9", file: "fiserv_PAYSAFE_Febr_2024.pdf", businessType: "professional_services", acceptedF4Calibration: false },
] as const satisfies ReadonlyArray<{
  caseId: string;
  file: string;
  businessType: BusinessTypeId;
  acceptedF4Calibration: boolean;
}>;

type StatusCounts = Record<SavingsAuthorityStatus, number>;

const fixtureRoot = path.resolve("test/fixtures/pdfs");
const cases = [];

for (const fixture of fixtures) {
  const document = await parsePdf(path.join(fixtureRoot, fixture.file));
  const summary = analyzeStatementDocument(document, fixture.businessType, { sourceFileName: fixture.file });
  const summaryBefore = JSON.stringify(summary);
  const result = buildCanonicalRuntimeAnalysis({
    document,
    businessType: fixture.businessType,
    runtimeDocumentRef: `savings_authority_${fixture.caseId}`,
    legacySummary: summary,
  });
  const comparison = result.internalSupportedFiservSavingsAuthorityComparison;
  cases.push({
    caseId: fixture.caseId,
    standing: "provisional_repository_fixture_not_authenticated_gold",
    acceptedF4Calibration: fixture.acceptedF4Calibration,
    status: comparison.status,
    liveLegacySummaryUnchanged: JSON.stringify(summary) === summaryBefore,
    positiveLegacyTopLevel: comparison.comparison.positiveLegacyTopLevel,
    positiveCustomerReport: comparison.comparison.positiveCustomerReport,
    positiveFiservRange: comparison.comparison.positiveFiservRange,
    positiveReportV1Opportunity: comparison.comparison.positiveReportV1Opportunity,
    positiveCanonicalPackageE: comparison.comparison.positiveCanonicalPackageE,
    legacyCalculatorDisagreement: comparison.comparison.legacyCalculatorDisagreement,
    authorityGatedRows: comparison.packageEInvariant.authorityGatedRowCount,
    packageEInvariant: comparison.packageEInvariant,
    streamCounts: countsByStream(comparison.rows.map((row) => ({ stream: row.sourceStream, status: row.authority.status }))),
    positiveStreamCounts: countsByStream(comparison.rows.filter((row) => row.positiveClaim)
      .map((row) => ({ stream: row.sourceStream, status: row.authority.status }))),
    missingEvidence: counts(comparison.rows.flatMap((row) => row.authority.missingAuthorityOrEvidence)),
    overlap: {
      conflictingCalculatorRows: comparison.comparison.conflictingCalculatorRowIds.length,
      potentialDoubleCountRows: comparison.comparison.potentialDoubleCountRowIds.length,
    },
  });
}

const allStreamCounts = mergeStreamCounts(cases.map((item) => item.streamCounts));
const positiveStreamCounts = mergeStreamCounts(cases.map((item) => item.positiveStreamCounts));
const output = {
  version: "supported_fiserv_savings_authority_calibration_v1",
  standing: "provisional_repository_fixture_observation_not_authenticated_gold",
  statementCount: cases.length,
  statementsWithPositiveLegacyTopLevel: cases.filter((item) => item.positiveLegacyTopLevel).length,
  statementsWithPositiveCustomerReportSavings: cases.filter((item) => item.positiveCustomerReport).length,
  statementsWithLegacyCalculatorDisagreement: cases.filter((item) => item.legacyCalculatorDisagreement).length,
  statementsWithPositiveFiservRange: cases.filter((item) => item.positiveFiservRange).length,
  statementsWithPositiveReportV1Opportunity: cases.filter((item) => item.positiveReportV1Opportunity).length,
  statementsWithPositiveCanonicalPackageESavings: cases.filter((item) => item.positiveCanonicalPackageE).length,
  acceptedSevenFixtureAuthorityGatedRows: cases.filter((item) => item.acceptedF4Calibration)
    .reduce((sum, item) => sum + item.authorityGatedRows, 0),
  fullRepositoryFixtureAuthorityGatedRows: cases.reduce((sum, item) => sum + item.authorityGatedRows, 0),
  packageEInvariantFailures: cases.filter((item) => !packageEInvariantHolds(item.packageEInvariant)).map((item) => item.caseId),
  liveLegacySummaryMutationCount: cases.filter((item) => !item.liveLegacySummaryUnchanged).length,
  authorityResultCountsByStream: allStreamCounts,
  positiveAuthorityResultCountsByStream: positiveStreamCounts,
  majorMissingEvidenceReasons: topCounts(cases.flatMap((item) => Object.entries(item.missingEvidence)
    .flatMap(([reason, count]) => Array.from({ length: count }, () => reason))), 20),
  overlapAndDisagreement: {
    statementsWithConflictingCalculators: cases.filter((item) => item.overlap.conflictingCalculatorRows > 0).length,
    conflictingCalculatorRows: cases.reduce((sum, item) => sum + item.overlap.conflictingCalculatorRows, 0),
    potentialDoubleCountRows: cases.reduce((sum, item) => sum + item.overlap.potentialDoubleCountRows, 0),
  },
  cases,
};

process.stdout.write(`SAVINGS_AUTHORITY_CALIBRATION_JSON_START\n${JSON.stringify(output, null, 2)}\nSAVINGS_AUTHORITY_CALIBRATION_JSON_END\n`);

function emptyStatusCounts(): StatusCounts {
  return { supported: 0, refused: 0, unknown: 0 };
}

function countsByStream(items: Array<{ stream: SavingsAuthoritySourceStream; status: SavingsAuthorityStatus }>): Partial<Record<SavingsAuthoritySourceStream, StatusCounts>> {
  const result: Partial<Record<SavingsAuthoritySourceStream, StatusCounts>> = {};
  for (const item of items) {
    const current = result[item.stream] ?? emptyStatusCounts();
    current[item.status]++;
    result[item.stream] = current;
  }
  return result;
}

function mergeStreamCounts(items: Array<Partial<Record<SavingsAuthoritySourceStream, StatusCounts>>>): Partial<Record<SavingsAuthoritySourceStream, StatusCounts>> {
  const result: Partial<Record<SavingsAuthoritySourceStream, StatusCounts>> = {};
  for (const item of items) {
    for (const [stream, statusCounts] of Object.entries(item) as Array<[SavingsAuthoritySourceStream, StatusCounts]>) {
      const current = result[stream] ?? emptyStatusCounts();
      current.supported += statusCounts.supported;
      current.refused += statusCounts.refused;
      current.unknown += statusCounts.unknown;
      result[stream] = current;
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function counts(values: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function topCounts(values: string[], limit: number): Record<string, number> {
  return Object.fromEntries(Object.entries(counts(values))
    .sort(([, left], [, right]) => right - left)
    .slice(0, limit));
}

function packageEInvariantHolds(invariant: (typeof cases)[number]["packageEInvariant"]): boolean {
  return invariant.noPositiveOpportunityLinkage
    && invariant.noApprovedTarget
    && invariant.noEligibleCalculation
    && invariant.eligibleSavings.amountMinor === 0
    && invariant.masterSavings.amountMinor === 0
    && invariant.observedAmountsPreserved
    && invariant.verificationOnlyEvidenceReviewPreserved;
}
