import { describe, expect, it } from "vitest";

import {
  compareAssertion,
  loadGoldContract,
  loadToleranceRules,
  type GoldAssertion,
} from "../../../scripts/gold-contract-lib.js";
import {
  buildCanonicalEconomicsV2FromFiserv,
  canonicalEconomicsV2GoldObservation,
} from "../../../src/canonical/v2/index.js";
import { v2SyntheticStatement } from "./fixtures.js";

describe("Canonical Economics V2 finalized Gold observation compatibility", () => {
  it("matches G1 proven financial facts while withholding unproven split activity", async () => {
    const fixture = v2SyntheticStatement({
      grossSales: 43_498.06,
      refunds: 859.98,
      netSubmitted: 42_638.08,
      totalFees: 2_007.73,
      amountFunded: 40_842.11,
      grossSaleCount: null,
      refundCount: 3,
      adjustment: 201.76,
      chargeback: -10,
      chargebackFee: 0,
      feeCredit: 0,
    });
    const parserOutput = structuredClone(fixture.parserOutput) as Record<string, unknown>;
    const ledger = parserOutput.fundingBatchLedger as { rows: Array<Record<string, unknown>> };
    ledger.rows.push({
      ...ledger.rows[0],
      batchNumber: "B2",
      amountSubmitted: 0,
      thirdPartyTransactions: 0,
      adjustments: 0,
      chargebacks: 20,
      feesCharged: 0,
      amountFunded: 20,
      formulaResult: 20,
    });
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      document: fixture.document,
      parserOutput,
      sourceDocumentRef: "SYNTH-RB-GOLD-G1",
      parserId: "synthetic_fiserv_foundation_parser",
      provenanceStatus: "approved_synthetic",
    });
    const observation = canonicalEconomicsV2GoldObservation(foundation, { caseId: "G1" });

    await expectMatches("G1", [
      "G1-FIN-GROSS",
      "G1-FIN-REFUNDS",
      "G1-FIN-REFUND-COUNT",
      "G1-FIN-NET-SUBMITTED",
      "G1-FIN-FEES",
      "G1-FIN-FUNDED",
      "G1-RATE",
      "G1-NO-NET-DISPUTE",
      "G1-NO-DOUBLE-COUNT",
    ], observation);
    expect(observation.states).not.toHaveProperty("financial.settlement_adjustment");
    expect(observation.values).not.toHaveProperty("financial.settlement_adjustment");
    expect(observation.claims).not.toContain("OPPOSING_ADJUSTMENT_ACTIVITY_PRESERVED");
  });

  it("matches the G3 zero-volume financial state without a numeric rate", async () => {
    const observation = observationFor("G3", {
      grossSales: 0,
      refunds: 0,
      netSubmitted: 0,
      totalFees: 44.9,
      amountFunded: -44.9,
      grossSaleCount: 0,
      refundCount: 0,
      adjustment: 0,
      chargeback: 0,
      chargebackFee: 0,
      feeCredit: 0,
    });

    await expectMatches("G3", [
      "G3-FIN-NET-SUBMITTED",
      "G3-FIN-FEES",
      "G3-FIN-FUNDED",
      "G3-RATE-STATE",
      "G3-NO-NUMERIC-RATE",
    ], observation);
    expect(observation.values).not.toHaveProperty("financial.effective_rate_decimal");
  });

  it("matches G4 atomic rate/denominator alternatives and foundational populations", async () => {
    const observation = observationFor("G4", {
      grossSales: 177_417.44,
      refunds: 16.72,
      netSubmitted: 177_400.72,
      totalFees: 2_954.38,
      grossSaleCount: 4_136,
      refundCount: 2,
      adjustment: -1.08,
      chargeback: 0,
      chargebackFee: 0,
      feeCredit: 0,
    }, true);

    await expectMatches("G4", [
      "G4-FIN-GROSS",
      "G4-FIN-REFUNDS",
      "G4-FIN-REFUND-COUNT",
      "G4-FIN-NET-SUBMITTED",
      "G4-FIN-FEES",
      "G4-FIN-ITEMS",
      "G4-RATE-OPTIONS",
      "G4-NO-RATE-VERDICT",
    ], observation);
    expect(observation.states).not.toHaveProperty("financial.settlement_adjustment");
    expect(observation.values).not.toHaveProperty("financial.settlement_adjustment");
    expect(observation.values["financial.effective_rate_options"]).toEqual([
      { rate_decimal: 0.016654, denominator: "canonical_net_submitted_card_volume" },
      { rate_decimal: 0.016652, denominator: "gross_card_sales" },
    ]);
  });

  it("matches the G5 exact denominator context without manufacturing net-processed semantics", async () => {
    const observation = observationFor("G5", {
      grossSales: 171_283.93,
      refunds: 0,
      netSubmitted: 171_283.93,
      totalFees: 3_552.45,
      amountFunded: 167_731.48,
      grossSaleCount: 3_310,
      refundCount: 0,
      adjustment: 0,
      chargeback: 0,
      chargebackFee: 0,
      feeCredit: 0,
    });

    await expectMatches("G5", ["G5-FIN-NET-SUBMITTED", "G5-FIN-FEES", "G5-FIN-TXNS", "G5-RATE"], observation);
    expect(observation.valueContexts["financial.effective_rate_decimal"]).toEqual({
      denominator: "canonical_net_submitted_card_volume",
    });
    expect(observation.values).not.toHaveProperty("financial.net_processed");
  });

  it("matches G8 reconciliation, rate alternatives, and chargeback-count safety", async () => {
    const observation = observationFor("G8", {
      grossSales: 80_601.44,
      refunds: 10,
      netSubmitted: 80_591.44,
      totalFees: 3_082.82,
      grossSaleCount: 1_094,
      refundCount: 0,
      adjustment: 0,
      chargeback: 0,
      chargebackFee: 0,
      feeCredit: 0,
    }, true);

    await expectMatches("G8", [
      "G8-FIN-GROSS",
      "G8-FIN-REFUNDS",
      "G8-FIN-NET-SUBMITTED",
      "G8-FIN-FEES",
      "G8-FIN-ITEMS",
      "G8-RATE-OPTIONS",
      "G8-FINANCIAL-RECONCILIATION",
      "G8-NO-DISPUTE-COUNT",
    ], observation);
  });
});

function observationFor(
  caseId: string,
  options: Parameters<typeof v2SyntheticStatement>[0],
  includeGrossBasedRateDiagnostic = false,
) {
  const fixture = v2SyntheticStatement(options);
  const foundation = buildCanonicalEconomicsV2FromFiserv({
    ...fixture,
    sourceDocumentRef: `SYNTH-RB-GOLD-${caseId}`,
    parserId: "synthetic_fiserv_foundation_parser",
    provenanceStatus: "approved_synthetic",
    includeGrossBasedRateDiagnostic,
  });
  expect(foundation.validation.status).toBe("valid");
  return canonicalEconomicsV2GoldObservation(foundation, { caseId });
}

async function expectMatches(
  caseId: string,
  assertionIds: string[],
  observation: ReturnType<typeof canonicalEconomicsV2GoldObservation>,
): Promise<void> {
  const [contract, tolerances] = await Promise.all([loadGoldContract(), loadToleranceRules()]);
  const goldCase = contract.cases.find((candidate) => candidate.case_id === caseId);
  expect(goldCase).toBeDefined();
  const assertions = assertionIds.map((assertionId) => {
    const assertion = goldCase!.assertions.find((candidate) => candidate.assertion_id === assertionId);
    expect(assertion, `missing finalized Gold assertion ${assertionId}`).toBeDefined();
    return assertion as GoldAssertion;
  });
  for (const assertion of assertions) {
    expect(compareAssertion(assertion, observation, tolerances), assertion.assertion_id).toBe("match");
  }
}
