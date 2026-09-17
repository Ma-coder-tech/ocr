import { describe, expect, it } from "vitest";

import {
  buildCanonicalEconomicsV2FromFiserv,
  buildUnavailableCanonicalEconomicsV2Foundation,
  canonicalEconomicsV2GoldObservation,
} from "../../../src/canonical/v2/index.js";
import { v2SyntheticStatement } from "./fixtures.js";

describe("Canonical Economics V2 metric states and financial direction", () => {
  it("makes zero-volume headline effective rate explicitly undefined rather than 0%", () => {
    const fixture = v2SyntheticStatement({
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
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      ...fixture,
      sourceDocumentRef: "SYNTH-G3-ZERO-VOLUME",
      parserId: "synthetic_fiserv_foundation_parser",
      provenanceStatus: "approved_synthetic",
    });
    const observation = canonicalEconomicsV2GoldObservation(foundation);

    expect(foundation.validation.status).toBe("valid");
    expect(foundation.metrics.headlineEffectiveRate).toMatchObject({
      state: "undefined_zero_denominator",
      value: null,
      calculationRef: null,
    });
    expect(observation.states["financial.effective_rate_state"]).toBe("undefined");
    expect(observation.values).not.toHaveProperty("financial.effective_rate_decimal");
    expect(foundation.metrics.headlineAverageTicket.state).toBe("undefined_zero_count");
  });

  it("preserves fee credits, settlement adjustments, chargeback principal, and chargeback fees as distinct populations", () => {
    const fixture = v2SyntheticStatement();
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      ...fixture,
      sourceDocumentRef: "SYNTH-RB-DIRECTION",
      parserId: "synthetic_fiserv_foundation_parser",
      provenanceStatus: "approved_synthetic",
    });
    const facts = foundation.financialPopulations;

    expect(facts.totalStatementProcessingFees.value).toEqual({ amountMinor: 4_500, currency: "USD" });
    expect(facts.feeCreditAmount.value).toEqual({ amountMinor: 100, currency: "USD" });
    expect(facts.settlementAdjustmentAmount.value).toEqual({ amountMinor: -400, currency: "USD" });
    expect(facts.chargebackPrincipalDebitAmount.value).toEqual({ amountMinor: 600, currency: "USD" });
    expect(facts.chargebackRepresentmentAmount.value).toEqual({ amountMinor: 0, currency: "USD" });
    expect(facts.chargebackFeeAmount.value).toEqual({ amountMinor: 1_500, currency: "USD" });
    expect(facts.unresolvedAdjustmentChargebackAmount.status).toBe("unavailable");
    expect(facts.chargebackCount.status).toBe("unavailable");
  });

  it("keeps chargeback-labelled fee rows observational until row semantics are explicitly admitted", () => {
    const fixture = v2SyntheticStatement();
    const unadmitted = buildCanonicalEconomicsV2FromFiserv({
      document: fixture.document,
      parserOutput: fixture.parserOutput,
      sourceDocumentRef: "SYNTH-RB-UNADMITTED-CHARGEBACK-FEE",
      parserId: "synthetic_fiserv_foundation_parser",
      provenanceStatus: "approved_synthetic",
    });

    expect(unadmitted.financialPopulations.chargebackFeeAmount).toMatchObject({ status: "unavailable", value: null });
    const labelled = unadmitted.sourceModel.occurrences.find((occurrence) =>
      occurrence.limitations.some((limitation) => /no admitted fee-row semantics/i.test(limitation)),
    );
    expect(labelled).toMatchObject({ semanticRole: "fee_charge" });
    expect(labelled?.limitations.join(" ")).toMatch(/candidate.*no admitted fee-row semantics/i);

    const admitted = buildCanonicalEconomicsV2FromFiserv({
      ...fixture,
      sourceDocumentRef: "SYNTH-RB-ADMITTED-CHARGEBACK-FEE",
      parserId: "synthetic_fiserv_foundation_parser",
      provenanceStatus: "approved_synthetic",
    });
    expect(admitted.financialPopulations.chargebackFeeAmount).toMatchObject({
      status: "available",
      value: { amountMinor: 1_500, currency: "USD" },
    });
  });

  it("does not infer funding cadence from reconciled funding rows", () => {
    const fixture = v2SyntheticStatement();
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      ...fixture,
      sourceDocumentRef: "SYNTH-RB-FUNDING-CADENCE",
      parserId: "synthetic_fiserv_foundation_parser",
      provenanceStatus: "approved_synthetic",
    });

    expect(foundation.financialPopulations.fundingBatchCount.value).toBe(1);
    expect(foundation.billingAndFunding.fundingCadence).toBe("unknown");
  });

  it("fails closed when the gross-sale count population is not explicitly proven", () => {
    const fixture = v2SyntheticStatement({ grossSaleCount: null });
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      ...fixture,
      sourceDocumentRef: "SYNTH-RB-NO-GROSS-COUNT",
      parserId: "synthetic_fiserv_foundation_parser",
      provenanceStatus: "approved_synthetic",
    });

    expect(foundation.financialPopulations.grossSaleTransactionCount.status).toBe("unavailable");
    expect(foundation.metrics.headlineAverageTicket).toMatchObject({
      state: "unavailable_denominator",
      value: null,
      calculationRef: null,
    });
  });

  it("retains exact deterministic precision needed by G5 rather than a two-decimal percent display", () => {
    const netSubmitted = 171_283.93;
    const totalFees = 3_552.45;
    const fixture = v2SyntheticStatement({
      grossSales: netSubmitted,
      refunds: 0,
      netSubmitted,
      totalFees,
      amountFunded: 167_731.48,
      grossSaleCount: 3_310,
      refundCount: 0,
      adjustment: 0,
      chargeback: 0,
      chargebackFee: 0,
      feeCredit: 0,
    });
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      ...fixture,
      sourceDocumentRef: "SYNTH-G5-EXACT-RATE",
      parserId: "synthetic_fiserv_foundation_parser",
      provenanceStatus: "approved_synthetic",
    });

    expect(foundation.metrics.headlineEffectiveRate.value).toBe("0.020740");
    expect(canonicalEconomicsV2GoldObservation(foundation).values["financial.effective_rate_decimal"]).toBe(0.02074);
  });

  it("preserves G9 source-unavailable and H1 corpus-hold refusal states without inferred facts", () => {
    const g9 = buildUnavailableCanonicalEconomicsV2Foundation({
      sourceDocumentRef: "SRC-G9",
      provenanceStatus: "source_unavailable",
      reason: "Authoritative source is unavailable.",
    });
    const h1 = buildUnavailableCanonicalEconomicsV2Foundation({
      sourceDocumentRef: "H1-CORPUS",
      provenanceStatus: "corpus_integrity_hold",
      reason: "Corpus integrity hold prevents source use.",
    });

    expect(g9.validation.status).toBe("valid");
    expect(g9.templateCapability).toMatchObject({ admissionStatus: "unavailable", completenessStatus: "unavailable" });
    expect(g9.identity).toMatchObject({ sourceFingerprint: null, sourceFingerprintStatus: "unavailable" });
    expect(Object.values(g9.financialPopulations).every((fact) => fact.status === "unavailable" && fact.value === null)).toBe(true);
    expect(g9.metrics.headlineEffectiveRate.state).toBe("unavailable_numerator");
    expect(g9.sourceModel.occurrences).toEqual([]);
    expect(h1.validation.status).toBe("valid");
    expect(h1.identity.provenanceStatus).toBe("corpus_integrity_hold");
    expect(Object.values(h1.financialPopulations).every((fact) => fact.value === null)).toBe(true);
  });
});
