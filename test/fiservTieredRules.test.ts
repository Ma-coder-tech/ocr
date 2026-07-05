import { describe, expect, it } from "vitest";

import { buildFiservFeeAnalysisV2FromRawRows } from "../src/fiservFeeAnalysis.js";
import type { FiservRawFeeRowForNormalization } from "../src/fiservFeeNormalizer.js";

function row(params: {
  network: string;
  description: string;
  volumeBasis: number | null;
  count?: number | null;
  rate: number | null;
  amount: number;
  type?: string | null;
  sourceSection?: string;
}): FiservRawFeeRowForNormalization {
  return {
    date: null,
    type: params.type ?? "Service charges",
    network: params.network,
    description: params.description,
    volumeBasis: params.volumeBasis,
    count: params.count ?? null,
    rate: params.rate,
    amount: params.amount,
    bucket: "service_charges",
    sourceSection: params.sourceSection ?? "CARD FEES",
    evidenceLine: `${params.network} | ${params.description} | ${params.volumeBasis ?? ""} | ${params.count ?? ""} | ${params.rate ?? ""} | -$${params.amount.toFixed(2)}`,
    pageNumber: 2,
  };
}

describe("Fiserv V2 tiered pricing rules", () => {
  it("calculates CNP tier downgrades, auth ratio, and first-statement context", () => {
    const analysis = buildFiservFeeAnalysisV2FromRawRows({
      rows: [
        row({ network: "MASTERCARD", description: "MQUAL DISC", volumeBasis: null, rate: 0.0328, amount: 16.4 }),
        row({ network: "MC OFLN DB", description: "QUAL DISC", volumeBasis: 1050, rate: 0.0029, amount: 3.05 }),
        row({ network: "VISA", description: "NQUAL DISC", volumeBasis: 4100, rate: 0.0378, amount: 154.98 }),
        row({ network: "VS OFLN DB", description: "MQUAL DISC", volumeBasis: 2100, rate: 0.0328, amount: 68.88 }),
        row({ network: "MASTERCARD", description: "ECI CPU-G", volumeBasis: null, count: 5, rate: 0.19, amount: 0.95 }),
        row({ network: "MASTERCARD", description: "AVS ECIC-G", volumeBasis: null, count: 5, rate: 0.05, amount: 0.25 }),
        row({ network: "VISA", description: "ECI CPU-G", volumeBasis: null, count: 6, rate: 0.19, amount: 1.14 }),
        row({ network: "VISA", description: "AVS ECIC-G", volumeBasis: null, count: 6, rate: 0.05, amount: 0.3 }),
        row({ network: "VS OFLN DB", description: "ECI CPU-G", volumeBasis: null, count: 2, rate: 0.19, amount: 0.38 }),
        row({ network: "VS OFLN DB", description: "AVS ECIC-G", volumeBasis: null, count: 2, rate: 0.05, amount: 0.1 }),
        row({ network: "VISA", description: "FIXED NETWORK CNP FEE", volumeBasis: 4100, rate: 0.0015, amount: 6.15 }),
      ],
      printedTotal: 252.58,
      totalVolume: 7750,
      totalFees: 280.47,
      transactionCount: 7,
      pricingModel: {
        pricingModel: "tiered_pricing",
        confidence: "high",
        notes: ["QUAL/MQUAL/NQUAL discount rows detected."],
      },
      statementPeriodStart: "2025-04-01",
      statementPeriodEnd: "2025-04-30",
      merchantName: "ANIMAL DELTA HOUSE LLC",
      ytdGrossSales: 7750,
    });

    expect(analysis.merchantChannelAnalysis).toMatchObject({
      status: "detected",
      merchantChannel: "card_not_present",
      confidence: "high",
    });
    expect(analysis.tieredDowngradeAnalysis).toMatchObject({
      status: "ready",
      baselineRate: 0.0029,
      totalTieredVolume: 7750,
      qualifiedVolume: 1050,
      midQualifiedVolume: 2600,
      nonQualifiedVolume: 4100,
      qualifiedPct: 13.55,
      midQualifiedPct: 33.55,
      nonQualifiedPct: 52.9,
      notBestTierPct: 86.45,
      totalDowngradeCost: 220.83,
      largestDowngradeImpact: {
        description: "NQUAL DISC",
        amount: 154.98,
        amountPctOfFees: 55.26,
      },
    });
    expect(analysis.authorizationAnalysis).toMatchObject({
      status: "ready",
      transactionCount: 7,
      authorizationCount: 13,
      authRatio: 1.86,
      excessAuthorizationCount: 6,
      estimatedExcessAuthCost: 1.14,
    });
    expect(analysis.newAccountAnalysis).toMatchObject({
      status: "confirmed",
      currentMonthVolume: 7750,
      ytdGrossSales: 7750,
    });
    expect(analysis.bundledPricingBenchmark.cardMix).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardType: "mastercard_credit", volume: 500 }),
        expect.objectContaining({ cardType: "mastercard_debit", volume: 1050 }),
        expect.objectContaining({ cardType: "visa_credit", volume: 4100 }),
        expect.objectContaining({ cardType: "visa_debit", volume: 2100 }),
      ]),
    );
    expect(analysis.findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining([
        "card_not_present_detected",
        "tiered_downgrade_high_nqual",
        "tiered_downgrade_majority_not_qualified",
        "tiered_downgrade_cost",
        "authorization_ratio_high",
        "new_account_pricing_context",
      ]),
    );
  });
});

describe("Fiserv V2 Vortax regression rules", () => {
  it("treats uniform QUAL DISC plus itemized interchange and network fees as interchange-plus", () => {
    const fundingBatchRows = Array.from({ length: 15 }, (_, index) => ({
      adjustments: index + 1,
      chargebacks: 0,
      evidenceLine: `07/${String(index + 1).padStart(2, "0")} | batch | adjustment`,
    }));
    const analysis = buildFiservFeeAnalysisV2FromRawRows({
      rows: [
        row({ network: "MASTERCARD", description: "QUAL DISC", volumeBasis: 22100, rate: 0.015, amount: 331.5 }),
        row({ network: "VISA", description: "QUAL DISC", volumeBasis: 20210.13, rate: 0.015, amount: 303.15 }),
        row({ network: "MASTERCARD", description: "INTERCHANGE", volumeBasis: 22100, rate: 0.018, amount: 397.8, type: "CF" }),
        row({ network: "VISA", description: "INTERCHANGE", volumeBasis: 20210.13, rate: 0.017, amount: 343.57, type: "CF" }),
        row({ network: "MASTERCARD", description: "NABU FEES", volumeBasis: null, count: 160, rate: 0.0195, amount: 3.12, type: "Program Fees" }),
        row({ network: "VISA", description: "CR DUES AND ASSESS", volumeBasis: 20210.13, rate: 0.0014, amount: 28.29, type: "Program Fees" }),
        row({ network: "VISA", description: "ECI CPU-G", volumeBasis: null, count: 277, rate: 0.25, amount: 69.25 }),
        row({ network: "MASTERCARD", description: "COMM CARD I/C SAVINGS ADJ", volumeBasis: 9.96, rate: 0.75, amount: 7.47, type: "MISC", sourceSection: "ACCOUNT FEES" }),
        row({ network: "ACCOUNT", description: "CHARGEBACKS", volumeBasis: null, count: 11, rate: 25, amount: 275, type: "MISC", sourceSection: "ACCOUNT FEES" }),
        row({ network: "ACCOUNT", description: "ACH REJECT FEE", volumeBasis: null, count: 3, rate: 20, amount: 60, type: "MISC", sourceSection: "ACCOUNT FEES" }),
      ],
      printedTotal: 1819.15,
      totalVolume: 42310.13,
      totalFees: 1819.15,
      transactionCount: 259,
      pricingModel: {
        pricingModel: "flat_discount_pricing",
        confidence: "high",
        notes: ["Repeated QUAL DISC rows were visible."],
      },
      statementPeriodStart: "2022-04-01",
      statementPeriodEnd: "2022-04-30",
      merchantName: "VORTAX NXGEN",
      ytdGrossSales: null,
      fundingBatchRows,
    });

    expect(analysis.pricingModel).toMatchObject({
      pricingModel: "interchange_plus",
      confidence: "high",
      analysisStatus: "ic_plus_ready",
    });
    expect(analysis.processorMarkupAnalysis.nonAmexSalesDiscountRate).toBe(0.015);
    expect(analysis.perAuthBenchmarkAnalysis).toMatchObject({
      status: "ready",
      currentRate: 0.25,
      authorizationCount: 277,
      monthlyAuthCost: 69.25,
    });
    expect(analysis.processorMarkupAnalysis.hiddenPctMarkupRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "COMM CARD I/C SAVINGS ADJ",
          rate: 0.75,
          amount: 7.47,
          volumeBasis: 9.96,
        }),
      ]),
    );
    expect(analysis.disputeActivityAnalysis).toMatchObject({
      status: "ready",
      chargebackCount: 11,
      achRejectCount: 3,
      fundingAdjustmentCount: 15,
      disputeCostAmount: 335,
      disputeCostPctOfVolume: 0.00791773,
    });
    expect(analysis.findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(["per_auth_fee_benchmark", "hidden_percentage_markup", "dispute_activity_high"]),
    );
    expect(analysis.findings.find((finding) => finding.kind === "hidden_percentage_markup")?.evidence.join(" ")).toContain("75.00%");
  });

  it("keeps uniform QUAL DISC without itemized interchange and network detail as bundled flat-rate", () => {
    const analysis = buildFiservFeeAnalysisV2FromRawRows({
      rows: [
        row({ network: "MASTERCARD", description: "QUAL DISC", volumeBasis: 1000, rate: 0.038, amount: 38 }),
        row({ network: "VISA", description: "QUAL DISC", volumeBasis: 2000, rate: 0.038, amount: 76 }),
      ],
      printedTotal: 114,
      totalVolume: 3000,
      totalFees: 114,
      transactionCount: 80,
      pricingModel: {
        pricingModel: "flat_discount_pricing",
        confidence: "high",
        notes: ["Repeated QUAL DISC rows were visible."],
      },
      statementPeriodStart: "2020-04-01",
      statementPeriodEnd: "2020-04-30",
      merchantName: "JAMAICA FISH MARKET",
      ytdGrossSales: null,
    });

    expect(analysis.pricingModel).toMatchObject({
      pricingModel: "flat_rate_bundled",
      confidence: "high",
    });
    expect(analysis.processorMarkupAnalysis.status).toBe("pending_pricing_model_rules");
  });
});
