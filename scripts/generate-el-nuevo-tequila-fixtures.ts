import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { parsePdf } from "../src/parser.js";
import { analyzeStatementDocumentWithOptionalAi } from "../src/statementParserOrchestrator.js";
import {
  buildComparisonStatementInput,
  type ComparisonStatementFee,
  type ComparisonStatementFinding,
  type ComparisonStatementInput,
  type ComparisonStatementNotice,
} from "../src/multiStatementComparisonInput.js";

const ROOT = process.cwd();
const PDF_PATH = path.join(ROOT, "test", "fixtures", "pdfs", "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf");
const OUT_DIR = path.join(ROOT, "test", "fixtures", "multi-statement");
const BASELINE_PATH = path.join(OUT_DIR, "el_nuevo_tequila_sep_2024_baseline.comparison-input.json");
const GENERATED_PATH = path.join(OUT_DIR, "el_nuevo_tequila_multi_statement.generated.json");
const PIPELINE_VERSION = "layer1-fixture-pipeline-v1";
const GENERATED_AT = "2026-07-06T00:00:00.000Z";

type MonthPlan = {
  period: string;
  label: string;
  volume: number;
  chargebacks?: number;
  addNovemberWatsNotice?: boolean;
  addRegulatoryProduct?: boolean;
  watsRate?: number;
  addPciFee?: boolean;
  supplyShippingAmount?: number;
  monthlyServiceAmount?: number;
};

type ExpectedMoney = {
  structure: {
    includedPeriods: string[];
    missingPeriods: string[];
    newFees: Array<{ feeFamilyKey: string; firstAppeared: string; expectedStatus: "new_fee" }>;
    rateChanges: Array<{ feeFamilyKey: string; changeMonth: string; previousRateOrAmount: number; newRateOrAmount: number }>;
    noticeLinks: Array<{ noticePeriod: string; feeFamilyKey: string; effectivePeriod: string; expectedConfidence: "high" | "medium" | "low" }>;
    disputeSpikes: Array<{ period: string; chargebacks: number }>;
    effectiveRateDrivers: Array<{ period: string; expectedDriver: string }>;
  };
  dollars: {
    toleranceUsd: number;
    effectiveRateTolerance: number;
    effectiveRatesByPeriod: Record<string, number>;
    totalFeesByPeriod: Record<string, number>;
    cumulativeSavings: {
      alreadyOverpaid: { conservative: number; estimated: number; maximum: number };
      projectedAnnualIfUnchanged: { conservative: number; estimated: number; maximum: number };
    };
    newFeeImpacts: Record<string, { cumulativeAmountSinceAppearance: number; projectedAnnualCost: number }>;
    rateChangeImpacts: Record<string, { monthlyImpactIncrease: number; annualImpactIncrease: number; cumulativeImpact: number }>;
    disputeCostsByPeriod: Record<string, { chargebacks: number; chargebackFees: number; achRejects: number; achRejectFees: number; totalDisputeCost: number }>;
    globalFindingImpacts: Record<string, { cumulativeImpact: number; projectedAnnualImpact: number }>;
  };
};

const PLANS: MonthPlan[] = [
  { period: "2024-10", label: "quiet month", volume: 172000, chargebacks: 1 },
  { period: "2024-11", label: "notice and new fee", volume: 169000, addNovemberWatsNotice: true, addRegulatoryProduct: true },
  { period: "2024-12", label: "holiday volume spike", volume: 240000, addRegulatoryProduct: true },
  { period: "2025-01", label: "announced WATS increase hits", volume: 165000, addRegulatoryProduct: true, watsRate: 0.13 },
  { period: "2025-03", label: "PCI and chargeback spike", volume: 159000, addRegulatoryProduct: true, watsRate: 0.13, addPciFee: true, chargebacks: 5 },
  {
    period: "2025-04",
    label: "silent fixed-fee increases",
    volume: 170000,
    addRegulatoryProduct: true,
    watsRate: 0.13,
    addPciFee: true,
    chargebacks: 2,
    supplyShippingAmount: 19.95,
    monthlyServiceAmount: 15,
  },
];

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function keyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fixedFee(feeFamilyKey: string, displayName: string, amount: number, period: string): ComparisonStatementFee {
  return {
    compositeKey: `${feeFamilyKey}__processor_fixed`,
    feeFamilyKey,
    displayName,
    normalizedDescription: displayName,
    cardTypeSection: null,
    feeType: feeFamilyKey.includes("managed_security") ? "compliance_penalty" : "processor_fixed",
    amount,
    rate: null,
    count: null,
    volumeBasis: null,
    classification: feeFamilyKey.includes("managed_security") ? "compliance_penalty" : "processor_fixed",
    sourceSection: "ACCOUNT FEES",
    evidenceLine: `${displayName} | Synthetic ${period} fixture | -$${amount.toFixed(2)}`,
    source: "fiserv_fee_analysis_v2",
  };
}

function chargebackFee(chargebacks: number, period: string): ComparisonStatementFee {
  const amount = round(chargebacks * 25);
  return {
    compositeKey: "chargeback_fee__processor_fixed",
    feeFamilyKey: "chargeback_fee",
    displayName: "CHARGEBACK FEE",
    normalizedDescription: "CHARGEBACK FEE",
    cardTypeSection: null,
    feeType: "processor_fixed",
    amount,
    rate: 25,
    count: chargebacks,
    volumeBasis: null,
    classification: "processor_fixed",
    sourceSection: "ADJUSTMENTS",
    evidenceLine: `CHARGEBACK FEE | ${chargebacks} item(s) at $25.00 | Synthetic ${period} fixture | -$${amount.toFixed(2)}`,
    source: "fiserv_fee_analysis_v2",
  };
}

function watsNotice(): ComparisonStatementNotice {
  return {
    noticeType: "fee_increase",
    feeName: "WATS AUTH FEE",
    amount: 0.13,
    amountType: "money",
    cadence: "per_item",
    effectiveDate: "2025-01",
    confidence: "high",
    evidence: ["Synthetic fixture notice: WATS AUTH FEE will increase to $0.13 per authorization effective January 2025."],
    source: "ai_notice_extraction",
  };
}

function syntheticFinding(
  fingerprint: string,
  kind: string,
  title: string,
  monthlyCost: number,
  annualEstimate: number,
  evidence: string,
): ComparisonStatementFinding {
  return {
    fingerprint,
    kind,
    title,
    severity: "warning",
    amount: monthlyCost,
    monthlyCost,
    annualEstimate,
    savingsTier: kind.includes("compliance") || kind.includes("fixed") ? "confirmed" : "negotiable",
    action: kind.includes("compliance") ? "complete_pci_validation" : "negotiate_processor_rate",
    evidence: [evidence],
  };
}

function processorControlled(fee: ComparisonStatementFee): boolean {
  return [
    "processor_pct_markup",
    "processor_per_item",
    "processor_fixed",
    "compliance_penalty",
    "third_party_service",
    "suspicious_pass_through_like_fee",
  ].includes(fee.feeType);
}

function scaledFee(fee: ComparisonStatementFee, volumeFactor: number, transactionFactor: number, plan: MonthPlan): ComparisonStatementFee {
  const next = clone(fee);

  if (next.feeFamilyKey === "wats_auth_fee" && next.rate !== null && next.count !== null) {
    next.rate = plan.watsRate ?? next.rate;
    next.count = Math.max(1, Math.round(next.count * transactionFactor));
    next.amount = round(next.count * next.rate);
    return next;
  }

  if (next.rate !== null && next.count !== null) {
    next.count = Math.max(1, Math.round(next.count * transactionFactor));
    next.amount = round(next.count * next.rate);
    return next;
  }

  if (next.rate !== null && next.volumeBasis !== null) {
    next.volumeBasis = round(next.volumeBasis * volumeFactor);
    next.amount = round(next.volumeBasis * next.rate);
    return next;
  }

  if (next.feeFamilyKey === "supply_shipping_handling" && plan.supplyShippingAmount !== undefined) {
    next.amount = plan.supplyShippingAmount;
  }
  if (next.feeFamilyKey === "monthly_service_charge" && plan.monthlyServiceAmount !== undefined) {
    next.amount = plan.monthlyServiceAmount;
  }

  return next;
}

function updateTotals(input: ComparisonStatementInput): void {
  input.financials.totalFees = round(input.fees.reduce((sum, fee) => sum + fee.amount, 0));
  input.financials.effectiveRate = round(input.financials.totalFees / input.financials.totalVolume, 8);
  input.processorControlledTotal = round(input.fees.filter(processorControlled).reduce((sum, fee) => sum + fee.amount, 0));
  input.processorControlledPct = round(input.processorControlledTotal / input.financials.totalVolume, 8);
}

function applySavings(input: ComparisonStatementInput, annualEstimated: number, annualConservative: number): void {
  input.estimatedAnnualSavings = {
    conservative: round(annualConservative),
    estimated: round(annualEstimated),
    maximum: round(annualEstimated),
  };
}

function buildMonth(baseline: ComparisonStatementInput, plan: MonthPlan): ComparisonStatementInput {
  const input = clone(baseline);
  const volumeFactor = plan.volume / baseline.financials.totalVolume;
  const transactionFactor = baseline.financials.totalTransactions ? plan.volume / baseline.financials.totalVolume : 1;
  const transactions = baseline.financials.totalTransactions ? Math.round(baseline.financials.totalTransactions * transactionFactor) : null;

  input.statementPeriod = plan.period;
  input.sourceAnalysisId = `el-nuevo-tequila-${plan.period}-synthetic`;
  input.pipelineVersion = PIPELINE_VERSION;
  input.financials.totalVolume = plan.volume;
  input.financials.totalTransactions = transactions;
  input.financials.averageTicket = transactions && transactions > 0 ? round(plan.volume / transactions) : null;
  input.fees = baseline.fees.map((fee) => scaledFee(fee, volumeFactor, transactionFactor, plan));
  input.notices = plan.addNovemberWatsNotice ? [watsNotice()] : [];
  input.findings = [];
  input.disputes = {
    chargebacks: plan.chargebacks ?? 0,
    chargebackFees: round((plan.chargebacks ?? 0) * 25),
    achRejects: 0,
    achRejectFees: 0,
    totalDisputeCost: round((plan.chargebacks ?? 0) * 25),
  };

  if (plan.addRegulatoryProduct) input.fees.push(fixedFee("regulatory_product", "REGULATORY PRODUCT", 3.95, plan.period));
  if (plan.addPciFee) input.fees.push(fixedFee("managed_security_non_validated", "MANAGED SECURITY NON VALIDATED", 49.95, plan.period));
  if (plan.chargebacks) input.fees.push(chargebackFee(plan.chargebacks, plan.period));

  updateTotals(input);
  return input;
}

function prepareBaseline(input: ComparisonStatementInput): ComparisonStatementInput {
  const baseline = clone(input);
  baseline.sourceAnalysisId = "el-nuevo-tequila-2024-09-real-pipeline";
  baseline.pipelineVersion = PIPELINE_VERSION;
  baseline.disputes = {
    chargebacks: baseline.disputes.chargebacks ?? 0,
    chargebackFees: baseline.disputes.chargebackFees ?? 0,
    achRejects: baseline.disputes.achRejects ?? 0,
    achRejectFees: baseline.disputes.achRejectFees ?? 0,
    totalDisputeCost: baseline.disputes.totalDisputeCost ?? 0,
  };
  baseline.notices = baseline.notices;
  updateTotals(baseline);
  return baseline;
}

function feeAmount(statements: ComparisonStatementInput[], period: string, familyKey: string): number {
  const statement = statements.find((item) => item.statementPeriod === period);
  if (!statement) return 0;
  return round(statement.fees.filter((fee) => fee.feeFamilyKey === familyKey).reduce((sum, fee) => sum + fee.amount, 0));
}

function watsIncreaseImpact(statement: ComparisonStatementInput): number {
  return round(
    statement.fees
      .filter((fee) => fee.feeFamilyKey === "wats_auth_fee" && fee.count !== null)
      .reduce((sum, fee) => sum + fee.count! * 0.02, 0),
  );
}

function expectedResults(statements: ComparisonStatementInput[]): ExpectedMoney {
  const periods = statements.map((statement) => statement.statementPeriod);
  const effectiveRatesByPeriod = Object.fromEntries(statements.map((statement) => [statement.statementPeriod, statement.financials.effectiveRate]));
  const totalFeesByPeriod = Object.fromEntries(statements.map((statement) => [statement.statementPeriod, statement.financials.totalFees]));
  const disputeCostsByPeriod = Object.fromEntries(
    statements.map((statement) => [
      statement.statementPeriod,
      {
        chargebacks: statement.disputes.chargebacks ?? 0,
        chargebackFees: statement.disputes.chargebackFees ?? 0,
        achRejects: statement.disputes.achRejects ?? 0,
        achRejectFees: statement.disputes.achRejectFees ?? 0,
        totalDisputeCost: statement.disputes.totalDisputeCost ?? 0,
      },
    ]),
  );

  const regulatoryCumulative = round(["2024-11", "2024-12", "2025-01", "2025-03", "2025-04"].reduce((sum, period) => sum + feeAmount(statements, period, "regulatory_product"), 0));
  const pciCumulative = round(["2025-03", "2025-04"].reduce((sum, period) => sum + feeAmount(statements, period, "managed_security_non_validated"), 0));
  const supplyIncrease = round(feeAmount(statements, "2025-04", "supply_shipping_handling") - feeAmount(statements, "2025-03", "supply_shipping_handling"));
  const monthlyIncrease = round(feeAmount(statements, "2025-04", "monthly_service_charge") - feeAmount(statements, "2025-03", "monthly_service_charge"));
  const watsJan = watsIncreaseImpact(statements.find((statement) => statement.statementPeriod === "2025-01")!);
  const watsMar = watsIncreaseImpact(statements.find((statement) => statement.statementPeriod === "2025-03")!);
  const watsApr = watsIncreaseImpact(statements.find((statement) => statement.statementPeriod === "2025-04")!);
  const watsCumulative = round(watsJan + watsMar + watsApr);
  const conservative = round(regulatoryCumulative + pciCumulative + supplyIncrease + monthlyIncrease);
  const estimated = round(conservative + watsCumulative);
  const projectedConservative = round(47.4 + 599.4 + 48 + 60);
  const projectedWats = round(watsApr * 12);
  const projectedEstimated = round(projectedConservative + projectedWats);

  return {
    structure: {
      includedPeriods: periods,
      missingPeriods: ["2025-02"],
      newFees: [
        { feeFamilyKey: "regulatory_product", firstAppeared: "2024-11", expectedStatus: "new_fee" },
        { feeFamilyKey: "managed_security_non_validated", firstAppeared: "2025-03", expectedStatus: "new_fee" },
      ],
      rateChanges: [
        { feeFamilyKey: "wats_auth_fee", changeMonth: "2025-01", previousRateOrAmount: 0.11, newRateOrAmount: 0.13 },
        { feeFamilyKey: "supply_shipping_handling", changeMonth: "2025-04", previousRateOrAmount: 15.95, newRateOrAmount: 19.95 },
        { feeFamilyKey: "monthly_service_charge", changeMonth: "2025-04", previousRateOrAmount: 10, newRateOrAmount: 15 },
      ],
      noticeLinks: [{ noticePeriod: "2024-11", feeFamilyKey: "wats_auth_fee", effectivePeriod: "2025-01", expectedConfidence: "high" }],
      disputeSpikes: [{ period: "2025-03", chargebacks: 5 }],
      effectiveRateDrivers: [{ period: "2024-12", expectedDriver: "holiday volume spike diluted fixed fees" }],
    },
    dollars: {
      toleranceUsd: 0.5,
      effectiveRateTolerance: 0.00005,
      effectiveRatesByPeriod,
      totalFeesByPeriod,
      cumulativeSavings: {
        alreadyOverpaid: { conservative, estimated, maximum: estimated },
        projectedAnnualIfUnchanged: {
          conservative: projectedConservative,
          estimated: projectedEstimated,
          maximum: projectedEstimated,
        },
      },
      newFeeImpacts: {
        regulatory_product: { cumulativeAmountSinceAppearance: regulatoryCumulative, projectedAnnualCost: 47.4 },
        managed_security_non_validated: { cumulativeAmountSinceAppearance: pciCumulative, projectedAnnualCost: 599.4 },
      },
      rateChangeImpacts: {
        wats_auth_fee: { monthlyImpactIncrease: watsJan, annualImpactIncrease: round(watsJan * 12), cumulativeImpact: watsCumulative },
        supply_shipping_handling: { monthlyImpactIncrease: supplyIncrease, annualImpactIncrease: 48, cumulativeImpact: supplyIncrease },
        monthly_service_charge: { monthlyImpactIncrease: monthlyIncrease, annualImpactIncrease: 60, cumulativeImpact: monthlyIncrease },
      },
      disputeCostsByPeriod,
      globalFindingImpacts: {
        regulatory_product: { cumulativeImpact: regulatoryCumulative, projectedAnnualImpact: 47.4 },
        managed_security_non_validated: { cumulativeImpact: pciCumulative, projectedAnnualImpact: 599.4 },
        wats_auth_fee_increase: { cumulativeImpact: watsCumulative, projectedAnnualImpact: projectedWats },
        silent_fixed_fee_increases: { cumulativeImpact: round(supplyIncrease + monthlyIncrease), projectedAnnualImpact: 108 },
      },
    },
  };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const doc = await parsePdf(PDF_PATH);
  const summary = await analyzeStatementDocumentWithOptionalAi(doc, "restaurant_food_beverage", {
    sourceFileName: path.basename(PDF_PATH),
  });
  const adapted = buildComparisonStatementInput(summary, {
    sourceAnalysisId: "el-nuevo-tequila-2024-09-real-pipeline",
    pipelineVersion: PIPELINE_VERSION,
    merchant: {
      id: "merchant_el_nuevo_tequila",
      merchantNumber: null,
      merchantName: "EL NUEVO TEQUILA MEXICAN",
      isoName: "Wells Fargo",
      processorPlatform: "Fiserv / First Data",
      address: null,
      merchantCategory: "restaurant_food_beverage",
      merchantCategoryConfidence: "high",
    },
  });
  const baseline = prepareBaseline(adapted);
  const synthetic = PLANS.map((plan) => buildMonth(baseline, plan));
  const statements = [baseline, ...synthetic];

  const estimatedWatsAnnual = expectedResults(statements).dollars.globalFindingImpacts.wats_auth_fee_increase.projectedAnnualImpact;
  const conservativeAnnualByPeriod = new Map([
    ["2024-11", 47.4],
    ["2024-12", 47.4],
    ["2025-01", 47.4],
    ["2025-03", 47.4 + 599.4],
    ["2025-04", 47.4 + 599.4 + 48 + 60],
  ]);
  for (const statement of statements) {
    const conservativeAnnual = conservativeAnnualByPeriod.get(statement.statementPeriod) ?? 0;
    const estimatedAnnual = conservativeAnnual + (["2025-01", "2025-03", "2025-04"].includes(statement.statementPeriod) ? estimatedWatsAnnual : 0);
    applySavings(statement, estimatedAnnual, conservativeAnnual);
    if (statement.statementPeriod === "2025-03") {
      statement.findings.push(syntheticFinding("managed_security_non_validated__confirmed", "avoidable_compliance_fee", "PCI non-compliance fee appeared", 49.95, 599.4, "MANAGED SECURITY NON VALIDATED appeared in March 2025."));
    }
  }

  const fixture = {
    fixtureVersion: "1.0",
    generatedAt: GENERATED_AT,
    sourcePdf: path.relative(ROOT, PDF_PATH),
    baselineFixture: path.relative(ROOT, BASELINE_PATH),
    notes: [
      "Baseline is produced from the real September 2024 PDF through the single-statement pipeline and ComparisonStatementInput adapter.",
      "Synthetic months are deterministic mutations of the adapted baseline; tests must not call live AI.",
      "February 2025 is intentionally omitted to test missing-period handling.",
    ],
    statements,
    expectedComparisonResults: expectedResults(statements),
  };

  await fs.writeFile(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        fixtureVersion: "1.0",
        generatedAt: GENERATED_AT,
        sourcePdf: path.relative(ROOT, PDF_PATH),
        statement: baseline,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(GENERATED_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(JSON.stringify({ baseline: BASELINE_PATH, generated: GENERATED_PATH, periods: statements.map((statement) => statement.statementPeriod) }, null, 2));
}

await main();
