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
}): FiservRawFeeRowForNormalization {
  return {
    date: null,
    type: "Service charges",
    network: params.network,
    description: params.description,
    volumeBasis: params.volumeBasis,
    count: params.count ?? null,
    rate: params.rate,
    amount: params.amount,
    bucket: "service_charges",
    sourceSection: "CARD FEES",
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
