import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument, canonicalActualValues } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalAiCapabilities } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { buildCanonicalCustomerState } from "../../src/canonical/customerStateResolver.js";
import { buildCanonicalFeeLedger } from "../../src/canonical/feeLedger.js";
import { buildCanonicalFeeOwnershipActionability, makeCanonicalFeeSpreadAssertion } from "../../src/canonical/feeOwnershipActionability.js";
import { buildCanonicalOpportunityEngine, aggregateCanonicalOpportunityComponents, type CanonicalOpportunityInput } from "../../src/canonical/opportunityEngine.js";
import { selectedFact } from "../../src/canonical/facts.js";
import { validateCanonicalStatementAnalysis } from "../../src/canonical/validate.js";
import type {
  CanonicalCalculationRecord,
  CanonicalFeeLedger,
  CanonicalOpportunityComponent,
  CanonicalOpportunityTargetProvenance,
  CanonicalStatementAnalysis,
  MoneyAmount,
} from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical opportunity engine", () => {
  it("builds Package E as canonical-only verification/exclusion output by default", () => {
    const analysis = analysisWithFeeRows([feeRow({ description: "CPU GTWY", evidenceLine: "CPU GTWY | 100 items at $0.10 | -$10.00", amount: 10 })]);
    const component = analysis.opportunityEngine.components[0]!;

    expect(analysis.opportunityEngine.policyVersion).toBe("canonical_opportunity_engine_v1");
    expect(component.feeRowRefs[0]?.feeRowId).toBe(analysis.feeLedger.rows[0]?.id);
    expect(component.ownership.economicBeneficiary).toBe("processor");
    expect(component.actionabilityCeiling).toBe("potentially_actionable");
    expect(component.eligibility).toBe("verification_only");
    expect(component.target.type).toBe("none");
    expect(analysis.opportunityEngine.summary.totalEligibleAnnualAmount).toEqual(money(0));
    expect(analysis.opportunityEngine.summary.verificationOnlyObservedAmount).toEqual(money(10));
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });

  it("produces deterministic eligible opportunity from authoritative monetary evidence", () => {
    const analysis = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    const input = monetaryOpportunityInput(analysis, {
      eligibility: "deterministic",
      targetDollars: 5,
      provenance: authoritativeProvenance(analysis, "merchant_contract"),
      formulaResultDollars: 60,
    });
    rebuildWithInputs(analysis, [input]);

    expect(analysis.opportunityEngine.summary.deterministicEligibleAnnualAmount).toEqual(money(60));
    expect(analysis.opportunityEngine.summary.masterSavingsAnnualAmount).toEqual(money(60));
    expect(analysis.opportunityEngine.components[0]?.observedAmount?.source).toBe("canonical_fee_row");
    expect(analysis.opportunityEngine.components[0]?.target.type).toBe("monetary");
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });

  it("produces deterministic per-item opportunity with proven target and population", () => {
    const analysis = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | 100 items | -$10.00", amount: 10 })]);
    const input = perItemOpportunityInput(analysis, {
      eligibility: "deterministic",
      targetDollars: 0.05,
      itemCount: 100,
      provenance: authoritativeProvenance(analysis, "processor_pricing_schedule"),
      formulaResultDollars: 60,
    });
    rebuildWithInputs(analysis, [input]);

    expect(analysis.opportunityEngine.components[0]?.kind).toBe("per_item_repricing");
    expect(analysis.opportunityEngine.summary.deterministicEligibleAnnualAmount).toEqual(money(60));
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });

  it("produces deterministic hidden spread only when Package D marks the spread proven", () => {
    const analysis = analysisWithFeeRows([feeRow({ description: "Monthly QUAL DISC", evidenceLine: "Monthly QUAL DISC | -$10.00", amount: 10 })]);
    const feeRowId = analysis.feeLedger.rows[0]!.id;
    analysis.feeOwnershipActionability.spreadAssertions = [
      makeCanonicalFeeSpreadAssertion({
        id: "spread_proven",
        baseFeeRowId: feeRowId,
        status: "proven",
        evidenceRefs: analysis.opportunityEngine.components[0]!.evidenceRefs,
        reference: canonicalReference("network_schedule_v1"),
        reason: "Synthetic proven spread.",
      }),
    ];
    const input = monetaryOpportunityInput(analysis, {
      kind: "hidden_processor_spread",
      eligibility: "deterministic",
      targetDollars: 6,
      provenance: authoritativeProvenance(analysis, "authoritative_network_government_regulatory"),
      formulaResultDollars: 48,
    });
    rebuildWithInputs(analysis, [input]);

    expect(analysis.opportunityEngine.components[0]?.observedAmount?.source).toBe("canonical_spread_calculation");
    expect(analysis.opportunityEngine.summary.deterministicEligibleAnnualAmount).toEqual(money(48));
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");

    const suspected = analysisWithFeeRows([feeRow({ description: "Monthly QUAL DISC", evidenceLine: "Monthly QUAL DISC | -$10.00", amount: 10 })]);
    suspected.feeOwnershipActionability.spreadAssertions = [
      makeCanonicalFeeSpreadAssertion({
        id: "spread_suspected",
        baseFeeRowId: suspected.feeLedger.rows[0]!.id,
        status: "suspected",
        evidenceRefs: suspected.opportunityEngine.components[0]!.evidenceRefs,
        reference: canonicalReference("network_schedule_v1"),
        reason: "Synthetic suspected spread.",
      }),
    ];
    rebuildWithInputs(suspected, [
      monetaryOpportunityInput(suspected, {
        kind: "hidden_processor_spread",
        eligibility: "deterministic",
        targetDollars: 6,
        provenance: authoritativeProvenance(suspected, "authoritative_network_government_regulatory"),
        formulaResultDollars: 48,
      }),
    ]);
    expect(() => validateCanonicalStatementAnalysis(suspected)).toThrow(/requires a Package D proven spread/i);
  });

  it("produces approved estimates from approved model and benchmark registry entries", () => {
    const model = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    rebuildWithInputs(model, [
      modelMonetaryOpportunityInput(model, {
        provenance: approvedEstimateProvenance(model, "ratereveal_policy", "rr_approved_model"),
        formulaResultDollars: 120,
      }),
    ]);
    expect(model.opportunityEngine.summary.approvedEstimatedAnnualAmount).toEqual(money(120));
    expect(validateCanonicalStatementAnalysis(model).validation.status).toBe("valid");

    const benchmark = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    rebuildWithInputs(benchmark, [
      modelMonetaryOpportunityInput(benchmark, {
        kind: "benchmark_concern",
        provenance: approvedEstimateProvenance(benchmark, "benchmark_registry", "rr_approved_benchmark"),
        formulaResultDollars: 96,
      }),
    ]);
    expect(benchmark.opportunityEngine.summary.approvedEstimatedAnnualAmount).toEqual(money(96));
    expect(validateCanonicalStatementAnalysis(benchmark).validation.status).toBe("valid");
  });

  it("enforces target evidence source, approval, period, and applicability rules", () => {
    for (const sourceType of ["merchant_contract", "processor_pricing_schedule", "written_processor_confirmation", "statement_notice"] as const) {
      const analysis = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
      rebuildWithInputs(analysis, [
        monetaryOpportunityInput(analysis, {
          eligibility: "deterministic",
          targetDollars: 5,
          provenance: authoritativeProvenance(analysis, sourceType),
          formulaResultDollars: 60,
          suffix: sourceType,
        }),
      ]);
      expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
    }

    const labelOnlyZero = analysisWithFeeRows([feeRow({ description: "Monthly PCI Non Compliance Fee", evidenceLine: "Monthly PCI Non Compliance Fee | -$50.00", amount: 50 })]);
    const zeroInput = monetaryOpportunityInput(labelOnlyZero, {
      eligibility: "approved_estimate",
      targetDollars: 0,
      provenance: approvedEstimateProvenance(labelOnlyZero, "ratereveal_policy", "rr_zero_policy"),
      formulaResultDollars: 600,
    });
    zeroInput.target = { type: "zero_removal", removalCondition: "Label-only PCI cleanup.", proofEvidenceRefs: [], aiSourced: false };
    rebuildWithInputs(labelOnlyZero, [zeroInput]);
    expect(() => validateCanonicalStatementAnalysis(labelOnlyZero)).toThrow(/zero-removal proof evidence/i);

    for (const bad of [
      { label: "unapproved policy", patch: { opportunityApproved: false } },
      { label: "expired reference", patch: { effectiveTo: "2025-12-31" } },
      { label: "future reference", patch: { effectiveFrom: "2027-01-01" } },
      { label: "wrong processor", patch: { applicableProcessor: "other_processor" } },
      { label: "wrong business type", patch: { applicableBusinessType: "retail" } },
      { label: "wrong channel", patch: { applicableChannel: "card_present" } },
      { label: "wrong card environment", patch: { applicableCardEnvironment: "commercial" } },
    ]) {
      const analysis = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
      const provenance = { ...approvedEstimateProvenance(analysis, "ratereveal_policy", `rr_${bad.label.replace(/\s+/g, "_")}`), ...bad.patch };
      rebuildWithInputs(analysis, [
        monetaryOpportunityInput(analysis, {
          eligibility: "approved_estimate",
          targetDollars: 5,
          provenance,
          formulaResultDollars: 60,
          suffix: bad.label,
        }),
      ]);
      expect(() => validateCanonicalStatementAnalysis(analysis), bad.label).toThrow(/approved estimate|not applicable/i);
    }
  });

  it("does not infer monthly cadence from one monthly statement unless fee-specific label evidence proves it", () => {
    const vague = analysisWithFeeRows([feeRow({ description: "Service Fee", evidenceLine: "Service Fee | -$10.00", amount: 10 })]);
    expect(vague.opportunityEngine.components[0]?.cadence.value).toBe("unknown");
    expect(vague.opportunityEngine.components[0]?.cadence.annualizationAllowed).toBe(false);

    const monthly = analysisWithFeeRows([feeRow({ description: "Monthly Service Fee", evidenceLine: "Monthly Service Fee | -$10.00", amount: 10 })]);
    expect(monthly.opportunityEngine.components[0]?.cadence.value).toBe("monthly");
    expect(monthly.opportunityEngine.components[0]?.cadence.annualizationAllowed).toBe(true);

    const perStatement = analysisWithFeeRows([feeRow({ description: "Statement Fee", evidenceLine: "Statement Fee | -$10.00", amount: 10 })]);
    expect(perStatement.opportunityEngine.components[0]?.cadence.value).toBe("statement_frequency");
    expect(perStatement.opportunityEngine.components[0]?.cadence.annualizationAllowed).toBe(false);
    expect(perStatement.opportunityEngine.summary.nonAnnualizedObservedAmount).toEqual(money(10));
  });

  it("rejects included verification-only and excluded components", () => {
    const analysis = analysisWithFeeRows([feeRow({ description: "CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    analysis.opportunityEngine.components[0]!.inclusionStatus = "included";
    expect(() => validateCanonicalStatementAnalysis(analysis)).toThrow(/included with verification_only eligibility/i);

    const excluded = analysisWithFeeRows([feeRow({ description: "Visa Interchange", type: "Interchange charges", evidenceLine: "Monthly Visa Interchange | -$10.00", amount: 10 })]);
    excluded.opportunityEngine.components[0]!.inclusionStatus = "included";
    expect(() => validateCanonicalStatementAnalysis(excluded)).toThrow(/included with excluded eligibility/i);
  });

  it("requires authoritative target evidence for deterministic zero-removal opportunity", () => {
    const analysis = analysisWithFeeRows([feeRow({ description: "Monthly PCI Non Compliance Fee", evidenceLine: "Monthly PCI Non Compliance Fee | -$50.00", amount: 50 })]);
    const component = includedComponent(analysis, "deterministic", approvedRateRevealPolicyProvenance(analysis));
    component.target = {
      type: "zero_removal",
      removalCondition: "Complete PCI validation.",
      proofEvidenceRefs: component.evidenceRefs,
      aiSourced: false,
    };
    replaceComponents(analysis, [component]);

    expect(() => validateCanonicalStatementAnalysis(analysis)).toThrow(/deterministic component .* authoritative target evidence/i);

    component.eligibility = "approved_estimate";
    component.targetProvenance.authoritativeForDeterministic = false;
    component.targetProvenance.approvedForEstimate = true;
    replaceComponents(analysis, [component]);
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });

  it("keeps the existing directional business benchmark verification-only unless a registry approves opportunity dollars", () => {
    const analysis = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    const component = includedComponent(analysis, "approved_estimate", {
      ...approvedRateRevealPolicyProvenance(analysis),
      sourceType: "benchmark_registry",
      referenceId: "ratereveal_directional_business_type_benchmark",
      version: "internal_v1",
      opportunityApproved: false,
      approvedForEstimate: true,
    });
    component.kind = "benchmark_concern";
    component.target = {
      type: "model_rate",
      modelId: "ratereveal_directional_business_type_benchmark",
      modelVersion: "internal_v1",
      rate: "0.020000",
      representation: "decimal_fraction",
      populationRef: "financialFacts.processedSales",
      aiSourced: false,
    };
    replaceComponents(analysis, [component]);

    expect(() => validateCanonicalStatementAnalysis(analysis)).toThrow(/approved estimate component .* versioned approved model or reference/i);
  });

  it("exposes Package E fields through canonical actual values for golden-corpus comparison", () => {
    const analysis = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    const actual = canonicalActualValues(analysis);

    expect(actual["opportunityEngine.status"]).toBe("available");
    expect(actual["opportunityEngine.componentCount"]).toBe(1);
    expect(actual["opportunityEngine.verificationOnlyComponentCount"]).toBe(1);
    expect(actual["opportunityEngine.deterministicEligibleAnnualAmount"]).toEqual(money(0));
    expect(actual["opportunityEngine.approvedEstimatedAnnualAmount"]).toEqual(money(0));
    expect(actual["opportunityEngine.nonAnnualizedObservedAmount"]).toEqual(money(0));
    expect(actual["opportunityEngine.includedComponentIds"]).toEqual([]);
    expect(actual["opportunityEngine.overlapValidationStatus"]).toBe("ok");
  });

  it("rejects annual totals from statement-frequency-only cadence", () => {
    const analysis = analysisWithFeeRows([feeRow({ description: "Statement Fee", evidenceLine: "Statement Fee | -$10.00", amount: 10 })]);
    const component = includedComponent(analysis, "approved_estimate", approvedRateRevealPolicyProvenance(analysis));
    component.cadence = { ...component.cadence, value: "statement_frequency", annualizationAllowed: true, frequencyPerYear: null };
    replaceComponents(analysis, [component]);

    expect(() => validateCanonicalStatementAnalysis(analysis)).toThrow(/statement-frequency cadence without frequency proof/i);
  });

  it("allows annual charge and future-supplied monthly statement-frequency evidence but rejects one-time and unknown cadence", () => {
    const annual = analysisWithFeeRows([feeRow({ description: "Annual Service Fee", evidenceLine: "Annual Service Fee | -$10.00", amount: 10 })]);
    const annualInput = monetaryOpportunityInput(annual, {
      eligibility: "deterministic",
      targetDollars: 5,
      provenance: authoritativeProvenance(annual, "merchant_contract"),
      formulaResultDollars: 5,
      suffix: "annual",
    });
    annualInput.target = { type: "monetary", amount: money(5), unit: "annual_charge", aiSourced: false };
    annualInput.cadence = { ...annualInput.cadence, value: "annual", frequencyPerYear: 1, proof: "fee_label_explicit" };
    annualInput.calculation.result = money(5);
    annual.calculations.find((calc) => calc.id === annualInput.calculation.calculationRef)!.result = money(5);
    rebuildWithInputs(annual, [annualInput]);
    expect(validateCanonicalStatementAnalysis(annual).validation.status).toBe("valid");

    const futureMulti = analysisWithFeeRows([feeRow({ description: "Per Statement Fee", evidenceLine: "Per Statement Fee | -$10.00", amount: 10 })]);
    const futureInput = monetaryOpportunityInput(futureMulti, {
      eligibility: "approved_estimate",
      targetDollars: 5,
      provenance: approvedEstimateProvenance(futureMulti, "ratereveal_policy", "future_multi_statement_cadence"),
      formulaResultDollars: 60,
      suffix: "future_multi_statement",
    });
    futureInput.cadence = {
      ...futureInput.cadence,
      value: "statement_frequency",
      proof: "multiple_statements",
      frequencyPerYear: 12,
      reason: "Future package supplied multiple-statement evidence that statements are monthly.",
    };
    rebuildWithInputs(futureMulti, [futureInput]);
    expect(validateCanonicalStatementAnalysis(futureMulti).validation.status).toBe("valid");

    for (const cadenceValue of ["one_time", "unknown"] as const) {
      const analysis = analysisWithFeeRows([feeRow({ description: "Service Fee", evidenceLine: "Service Fee | -$10.00", amount: 10 })]);
      const input = monetaryOpportunityInput(analysis, {
        eligibility: "approved_estimate",
        targetDollars: 5,
        provenance: approvedEstimateProvenance(analysis, "ratereveal_policy", `bad_${cadenceValue}`),
        formulaResultDollars: 60,
        suffix: cadenceValue,
      });
      input.cadence = {
        ...input.cadence,
        value: cadenceValue,
        proven: cadenceValue === "one_time",
        annualizationAllowed: false,
        frequencyPerYear: null,
        proof: cadenceValue === "one_time" ? "statement_notice" : "not_proven",
      };
      rebuildWithInputs(analysis, [input]);
      expect(() => validateCanonicalStatementAnalysis(analysis), cadenceValue).toThrow(/non-annualizable cadence/i);
    }
  });

  it("rejects duplicate fee-row claims without overlap resolution", () => {
    const analysis = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    const first = includedComponent(analysis, "approved_estimate", approvedRateRevealPolicyProvenance(analysis), "first");
    const second = includedComponent(analysis, "approved_estimate", approvedRateRevealPolicyProvenance(analysis), "second");
    replaceComponents(analysis, [first, second]);

    expect(() => validateCanonicalStatementAnalysis(analysis)).toThrow(/duplicates fee row/i);
  });

  it("keeps aggregation order-independent and requires explicit consistent supersession", () => {
    const ordered = analysisWithFeeRows([
      feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 }),
      feeRow({ description: "Monthly QUAL DISC", evidenceLine: "Monthly QUAL DISC | -$20.00", amount: 20 }),
    ]);
    const first = monetaryOpportunityInput(ordered, {
      eligibility: "approved_estimate",
      targetDollars: 5,
      provenance: approvedEstimateProvenance(ordered, "ratereveal_policy", "first_order"),
      formulaResultDollars: 60,
      suffix: "first_order",
    });
    const secondBase = ordered.opportunityEngine.components[1]!;
    const second = {
      ...monetaryOpportunityInput(ordered, {
        eligibility: "approved_estimate",
        targetDollars: 10,
        provenance: approvedEstimateProvenance(ordered, "ratereveal_policy", "second_order"),
        formulaResultDollars: 120,
        suffix: "second_order",
      }),
      feeRowIds: [secondBase.feeRowRefs[0]!.feeRowId],
    };
    rebuildWithInputs(ordered, [first, second]);
    const orderedIds = ordered.opportunityEngine.summary.approvedEstimatedComponentIds;
    const orderedTotal = ordered.opportunityEngine.summary.totalEligibleAnnualAmount;

    const reversed = analysisWithFeeRows([
      feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 }),
      feeRow({ description: "Monthly QUAL DISC", evidenceLine: "Monthly QUAL DISC | -$20.00", amount: 20 }),
    ]);
    const reversedFirst = monetaryOpportunityInput(reversed, {
      eligibility: "approved_estimate",
      targetDollars: 5,
      provenance: approvedEstimateProvenance(reversed, "ratereveal_policy", "first_order"),
      formulaResultDollars: 60,
      suffix: "first_order",
    });
    const reversedSecond = {
      ...monetaryOpportunityInput(reversed, {
        eligibility: "approved_estimate",
        targetDollars: 10,
        provenance: approvedEstimateProvenance(reversed, "ratereveal_policy", "second_order"),
        formulaResultDollars: 120,
        suffix: "second_order",
      }),
      feeRowIds: [reversed.opportunityEngine.components[1]!.feeRowRefs[0]!.feeRowId],
    };
    rebuildWithInputs(reversed, [reversedSecond, reversedFirst]);

    expect(reversed.opportunityEngine.summary.approvedEstimatedComponentIds).toEqual(orderedIds);
    expect(reversed.opportunityEngine.summary.totalEligibleAnnualAmount).toEqual(orderedTotal);
    expect(reversed.opportunityEngine.components.map((component) => component.overlap.aggregationKey).sort()).toEqual(
      ordered.opportunityEngine.components.map((component) => component.overlap.aggregationKey).sort(),
    );

    const supersession = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    const child = includedComponent(supersession, "approved_estimate", approvedRateRevealPolicyProvenance(supersession), "child");
    child.inclusionStatus = "superseded";
    child.overlap.supersededByComponentId = "parent";
    const parent = includedComponent(supersession, "approved_estimate", approvedRateRevealPolicyProvenance(supersession), "parent");
    parent.id = "parent";
    parent.overlap.resolution = "superseded";
    parent.overlap.supersedesComponentIds = [child.id];
    replaceComponents(supersession, [child, parent]);
    expect(validateCanonicalStatementAnalysis(supersession).validation.status).toBe("valid");
    expect(supersession.opportunityEngine.summary.totalEligibleAnnualAmount).toEqual(parent.calculation.result);

    const contradictory = structuredClone(supersession) as CanonicalStatementAnalysis;
    contradictory.opportunityEngine.components[0]!.inclusionStatus = "included";
    expect(() => validateCanonicalStatementAnalysis(contradictory)).toThrow(/contradictory supersession/i);

    const self = structuredClone(supersession) as CanonicalStatementAnalysis;
    self.opportunityEngine.components[1]!.overlap.supersedesComponentIds = [self.opportunityEngine.components[1]!.id];
    expect(() => validateCanonicalStatementAnalysis(self)).toThrow(/supersedes itself/i);

    const missing = structuredClone(supersession) as CanonicalStatementAnalysis;
    missing.opportunityEngine.components[1]!.overlap.supersedesComponentIds = ["missing"];
    expect(() => validateCanonicalStatementAnalysis(missing)).toThrow(/supersedes missing component/i);
  });

  it("rejects master summaries that introduce dollars beyond included components", () => {
    const analysis = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    const component = includedComponent(analysis, "approved_estimate", approvedRateRevealPolicyProvenance(analysis));
    replaceComponents(analysis, [component]);
    analysis.opportunityEngine.summary.masterSavingsAnnualAmount = money(999);

    expect(() => validateCanonicalStatementAnalysis(analysis)).toThrow(/master savings summary does not reconstruct/i);
  });

  it("rejects AI-sourced opportunity facts and circular supersession", () => {
    const ai = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    const aiComponent = includedComponent(ai, "approved_estimate", approvedRateRevealPolicyProvenance(ai));
    (aiComponent.target as any).aiSourced = true;
    replaceComponents(ai, [aiComponent]);
    expect(() => validateCanonicalStatementAnalysis(ai)).toThrow(/AI-sourced target/i);

    const circular = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    const first = includedComponent(circular, "approved_estimate", approvedRateRevealPolicyProvenance(circular), "first");
    const second = includedComponent(circular, "approved_estimate", approvedRateRevealPolicyProvenance(circular), "second");
    first.feeRowRefs = [];
    second.feeRowRefs = [];
    first.overlap.supersedesComponentIds = [second.id];
    second.overlap.supersedesComponentIds = [first.id];
    replaceComponents(circular, [first, second]);
    expect(() => validateCanonicalStatementAnalysis(circular)).toThrow(/circular relationship/i);
  });

  it("enforces money, currency, rate, and per-item unit invariants", () => {
    const zero = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    rebuildWithInputs(zero, [
      monetaryOpportunityInput(zero, {
        eligibility: "approved_estimate",
        targetDollars: 10,
        provenance: approvedEstimateProvenance(zero, "ratereveal_policy", "zero_result"),
        formulaResultDollars: 0,
        suffix: "zero",
      }),
    ]);
    expect(() => validateCanonicalStatementAnalysis(zero)).toThrow(/positive calculation result/i);

    const credit = analysisWithFeeRows([feeRow({ description: "Monthly Credit", evidenceLine: "Monthly Credit | ($5.00)", amount: -5 })]);
    expect(credit.opportunityEngine.components[0]?.eligibility).not.toBe("deterministic");
    expect(credit.opportunityEngine.summary.totalEligibleAnnualAmount).toEqual(money(0));

    const currency = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    const currencyInput = monetaryOpportunityInput(currency, {
      eligibility: "approved_estimate",
      targetDollars: 5,
      provenance: approvedEstimateProvenance(currency, "ratereveal_policy", "bad_currency"),
      formulaResultDollars: 60,
      suffix: "currency",
    });
    (currencyInput.target as any).amount = { amountMinor: 500, currency: "EUR" };
    rebuildWithInputs(currency, [currencyInput]);
    expect(() => validateCanonicalStatementAnalysis(currency)).toThrow(/unsupported or invalid currency|mixes currencies/i);

    for (const representation of ["basis_points", "percent_points", "decimal_fraction"] as const) {
      const rate = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
      const input = modelMonetaryOpportunityInput(rate, {
        provenance: approvedEstimateProvenance(rate, "ratereveal_policy", `rate_${representation}`),
        formulaResultDollars: 60,
      });
      input.target = {
        type: "model_rate",
        modelId: "approved_rate_model",
        modelVersion: "1.0.0",
        rate: representation === "basis_points" ? "25" : representation === "percent_points" ? "0.25" : "0.002500",
        representation,
        populationRef: "financialFacts.processedSales",
        aiSourced: false,
      };
      input.calculation.inputRefs.push("financialFacts.processedSales");
      rebuildWithInputs(rate, [input]);
      expect(validateCanonicalStatementAnalysis(rate).validation.status).toBe("valid");
    }

    const missingPopulation = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | 100 items | -$10.00", amount: 10 })]);
    const badPerItem = perItemOpportunityInput(missingPopulation, {
      eligibility: "approved_estimate",
      targetDollars: 0.05,
      itemCount: 100,
      provenance: approvedEstimateProvenance(missingPopulation, "ratereveal_policy", "missing_population"),
      formulaResultDollars: 60,
    });
    badPerItem.calculation.inputRefs = [badPerItem.feeRowIds[0]!];
    rebuildWithInputs(missingPopulation, [badPerItem]);
    expect(() => validateCanonicalStatementAnalysis(missingPopulation)).toThrow(/target population is not linked/i);
  });

  it("keeps Package D ownership objects independent from Package E output", () => {
    const analysis = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    const packageDOwnership = analysis.feeOwnershipActionability.rowClassifications[0]!.selected.ownership;
    analysis.opportunityEngine.components[0]!.ownership.economicBeneficiary = "unknown";

    expect(packageDOwnership.economicBeneficiary).toBe("processor");
  });

  it("rejects broken fee-row, evidence, calculation, classification, target, and summary links", () => {
    const brokenFee = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    brokenFee.opportunityEngine.components[0]!.feeRowRefs[0]!.feeRowId = "missing_fee_row";
    expect(() => validateCanonicalStatementAnalysis(brokenFee)).toThrow(/references missing fee row/i);

    const brokenEvidence = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    brokenEvidence.opportunityEngine.components[0]!.evidenceRefs = ["missing_evidence"];
    expect(() => validateCanonicalStatementAnalysis(brokenEvidence)).toThrow(/evidence ref missing_evidence is broken/i);

    const brokenCalc = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    rebuildWithInputs(brokenCalc, [
      monetaryOpportunityInput(brokenCalc, {
        eligibility: "approved_estimate",
        targetDollars: 5,
        provenance: approvedEstimateProvenance(brokenCalc, "ratereveal_policy", "broken_calc"),
        formulaResultDollars: 60,
      }),
    ]);
    brokenCalc.opportunityEngine.components[0]!.calculation.calculationRef = "missing_calc";
    expect(() => validateCanonicalStatementAnalysis(brokenCalc)).toThrow(/valid calculationRef/i);

    const brokenClassification = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    brokenClassification.opportunityEngine.components[0]!.feeRowRefs[0]!.classificationCandidateId = "wrong_candidate";
    expect(() => validateCanonicalStatementAnalysis(brokenClassification)).toThrow(/selected Package D candidate/i);

    const oneCent = analysisWithFeeRows([feeRow({ description: "Monthly CPU GTWY", evidenceLine: "Monthly CPU GTWY | -$10.00", amount: 10 })]);
    rebuildWithInputs(oneCent, [
      monetaryOpportunityInput(oneCent, {
        eligibility: "approved_estimate",
        targetDollars: 5,
        provenance: approvedEstimateProvenance(oneCent, "ratereveal_policy", "one_cent"),
        formulaResultDollars: 60,
      }),
    ]);
    oneCent.opportunityEngine.summary.totalEligibleAnnualAmount.amountMinor += 1;
    expect(() => validateCanonicalStatementAnalysis(oneCent)).toThrow(/total eligible summary does not reconstruct/i);
  });
});

function replaceComponents(analysis: CanonicalStatementAnalysis, components: CanonicalOpportunityComponent[]): void {
  analysis.opportunityEngine.components = components;
  analysis.opportunityEngine.summary = aggregateCanonicalOpportunityComponents(components);
  refreshPackageF(analysis);
}

function rebuildWithInputs(analysis: CanonicalStatementAnalysis, opportunityInputs: CanonicalOpportunityInput[]): void {
  analysis.opportunityEngine = buildCanonicalOpportunityEngine({
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    evidence: analysis.evidence,
    statementPeriodVerified: true,
    opportunityInputs,
  });
  refreshPackageF(analysis);
}

function refreshPackageF(analysis: CanonicalStatementAnalysis): void {
  analysis.aiCapabilities = buildCanonicalAiCapabilities({
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    evidence: analysis.evidence,
  });
  analysis.customerState = buildCanonicalCustomerState({
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    aiCapabilities: analysis.aiCapabilities,
  });
}

function monetaryOpportunityInput(
  analysis: CanonicalStatementAnalysis,
  options: {
    kind?: CanonicalOpportunityInput["kind"];
    eligibility: CanonicalOpportunityInput["eligibility"];
    targetDollars: number;
    provenance: CanonicalOpportunityTargetProvenance;
    formulaResultDollars: number;
    suffix?: string;
  },
): CanonicalOpportunityInput {
  const base = analysis.opportunityEngine.components[0]!;
  const calcRef = `calc_package_e_input_${options.suffix ?? options.kind ?? options.eligibility}`;
  analysis.calculations.push(calculation(calcRef, base.evidenceRefs, base.observedAmount!.amount, money(options.targetDollars), money(options.formulaResultDollars)));
  return {
    id: `input_${options.suffix ?? options.kind ?? options.eligibility}`,
    kind: options.kind ?? "fee_removal",
    eligibility: options.eligibility,
    feeRowIds: [base.feeRowRefs[0]!.feeRowId],
    target: {
      type: "monetary",
      amount: money(options.targetDollars),
      unit: "monthly_charge",
      aiSourced: false,
    },
    targetProvenance: options.provenance,
    cadence: monthlyCadence(base),
    calculation: {
      calculationRef: calcRef,
      formulaCode: "opportunity_monthly_delta_times_12",
      inputRefs: [base.feeRowRefs[0]!.feeRowId],
      result: money(options.formulaResultDollars),
      annualized: true,
      evidenceRefs: base.evidenceRefs,
    },
    confidence: "high",
    evidenceRefs: base.evidenceRefs,
  };
}

function perItemOpportunityInput(
  analysis: CanonicalStatementAnalysis,
  options: {
    eligibility: CanonicalOpportunityInput["eligibility"];
    targetDollars: number;
    itemCount: number;
    provenance: CanonicalOpportunityTargetProvenance;
    formulaResultDollars: number;
  },
): CanonicalOpportunityInput {
  const base = analysis.opportunityEngine.components[0]!;
  const calcRef = "calc_package_e_per_item";
  analysis.calculations.push({
    id: calcRef,
    formulaCode: "opportunity_monthly_delta_times_12",
    formulaVersion: "canonical_opportunity_formula_v1",
    inputs: [
      { label: "Observed monthly amount", value: base.observedAmount!.amount, unit: "money", evidenceRefs: base.evidenceRefs },
      { label: "Target per item", value: money(options.targetDollars), unit: "money", evidenceRefs: base.evidenceRefs },
      { label: "Observed item count", value: options.itemCount, unit: "count", evidenceRefs: base.evidenceRefs },
    ],
    result: money(options.formulaResultDollars),
    unit: "money",
    roundingPolicy: "money_minor_units_usd_v1",
  });
  return {
    id: "input_per_item",
    kind: "per_item_repricing",
    eligibility: options.eligibility,
    feeRowIds: [base.feeRowRefs[0]!.feeRowId],
    target: {
      type: "per_item",
      amount: money(options.targetDollars),
      unit: "per_authorization",
      populationRef: "observed_item_count",
      aiSourced: false,
    },
    targetProvenance: options.provenance,
    cadence: monthlyCadence(base),
    calculation: {
      calculationRef: calcRef,
      formulaCode: "opportunity_monthly_delta_times_12",
      inputRefs: [base.feeRowRefs[0]!.feeRowId, "observed_item_count"],
      result: money(options.formulaResultDollars),
      annualized: true,
      evidenceRefs: base.evidenceRefs,
    },
    confidence: "high",
    evidenceRefs: base.evidenceRefs,
  };
}

function modelMonetaryOpportunityInput(
  analysis: CanonicalStatementAnalysis,
  options: {
    kind?: CanonicalOpportunityInput["kind"];
    provenance: CanonicalOpportunityTargetProvenance;
    formulaResultDollars: number;
  },
): CanonicalOpportunityInput {
  const base = analysis.opportunityEngine.components[0]!;
  const calcRef = `calc_package_e_model_${options.kind ?? "monetary"}`;
  analysis.calculations.push({
    id: calcRef,
    formulaCode: "opportunity_annual_delta",
    formulaVersion: "canonical_opportunity_formula_v1",
    inputs: [{ label: "Approved model annual amount", value: money(options.formulaResultDollars), unit: "money", evidenceRefs: base.evidenceRefs }],
    result: money(options.formulaResultDollars),
    unit: "money",
    roundingPolicy: "money_minor_units_usd_v1",
  });
  return {
    id: `input_model_${options.kind ?? "monetary"}`,
    kind: options.kind ?? "rate_repricing",
    eligibility: "approved_estimate",
    feeRowIds: [base.feeRowRefs[0]!.feeRowId],
    target: {
      type: "model_monetary",
      modelId: options.provenance.referenceId ?? "approved_model",
      modelVersion: options.provenance.version ?? "1.0.0",
      amount: money(options.formulaResultDollars),
      unit: "annual_amount",
      aiSourced: false,
    },
    targetProvenance: options.provenance,
    cadence: monthlyCadence(base),
    calculation: {
      calculationRef: calcRef,
      formulaCode: "opportunity_annual_delta",
      inputRefs: [base.feeRowRefs[0]!.feeRowId],
      result: money(options.formulaResultDollars),
      annualized: true,
      evidenceRefs: base.evidenceRefs,
    },
    confidence: "medium",
    evidenceRefs: base.evidenceRefs,
  };
}

function monthlyCadence(component: CanonicalOpportunityComponent): CanonicalOpportunityComponent["cadence"] {
  return {
    value: "monthly",
    proven: true,
    annualizationAllowed: true,
    frequencyPerYear: 12,
    proof: "fee_label_explicit",
    evidenceRefs: component.evidenceRefs,
    reason: "Synthetic Package E test monthly cadence.",
    aiSourced: false,
  };
}

function includedComponent(
  analysis: CanonicalStatementAnalysis,
  eligibility: "deterministic" | "approved_estimate",
  provenance: CanonicalOpportunityTargetProvenance,
  suffix = "included",
): CanonicalOpportunityComponent {
  const base = structuredClone(analysis.opportunityEngine.components[0]!) as CanonicalOpportunityComponent;
  const calcRef = `calc_package_e_${suffix}`;
  const observed = base.observedAmount!.amount;
  const result = { amountMinor: observed.amountMinor * 12, currency: observed.currency };
  analysis.calculations.push(calculation(calcRef, base.evidenceRefs, observed, money(0), result));
  return {
    ...base,
    id: `${base.id}_${suffix}`,
    eligibility,
    inclusionStatus: "included",
    target: {
      type: "monetary",
      amount: money(0),
      unit: "monthly_charge",
      aiSourced: false,
    },
    targetProvenance: provenance,
    cadence: {
      ...base.cadence,
      value: "monthly",
      proven: true,
      annualizationAllowed: true,
      frequencyPerYear: 12,
      proof: "fee_label_explicit",
      evidenceRefs: base.evidenceRefs,
    },
    calculation: {
      calculationRef: calcRef,
      formulaCode: "opportunity_monthly_delta_times_12",
      formulaVersion: "canonical_opportunity_formula_v1",
      inputRefs: [base.feeRowRefs[0]!.feeRowId],
      result,
      resultUnit: "money",
      annualized: true,
      evidenceRefs: base.evidenceRefs,
      aiSourced: false,
    },
    inclusionReasonCodes: ["approved_test_component"],
    exclusionReasonCodes: [],
  };
}

function authoritativeProvenance(
  analysis: CanonicalStatementAnalysis,
  sourceType: CanonicalOpportunityTargetProvenance["sourceType"],
): CanonicalOpportunityTargetProvenance {
  return {
    ...approvedRateRevealPolicyProvenance(analysis),
    sourceType,
    referenceId: `auth_${sourceType}`,
    authoritativeForDeterministic: true,
    approvedForEstimate: false,
    opportunityApproved: true,
  };
}

function approvedEstimateProvenance(
  analysis: CanonicalStatementAnalysis,
  sourceType: CanonicalOpportunityTargetProvenance["sourceType"],
  referenceId: string,
): CanonicalOpportunityTargetProvenance {
  return {
    ...approvedRateRevealPolicyProvenance(analysis),
    sourceType,
    referenceId,
    authoritativeForDeterministic: false,
    approvedForEstimate: true,
    opportunityApproved: true,
  };
}

function approvedRateRevealPolicyProvenance(analysis: CanonicalStatementAnalysis): CanonicalOpportunityTargetProvenance {
  return {
    sourceType: "ratereveal_policy",
    referenceId: "rr_policy_test_zero_removal",
    version: "1.0.0",
    policyOwner: "rr_policy_owner",
    reviewer: "rr_reviewer",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    applicableProcessor: "fiserv",
    applicableBusinessType: "restaurant",
    applicableChannel: "unknown",
    applicableCardEnvironment: "unknown",
    methodology: "Synthetic Package E test policy.",
    limitations: ["Synthetic test provenance."],
    opportunityApproved: true,
    authoritativeForDeterministic: false,
    approvedForEstimate: true,
    evidenceRefs: [analysis.opportunityEngine.components[0]!.evidenceRefs[0]!],
    aiSourced: false,
  };
}

function canonicalReference(referenceId: string) {
  return {
    referenceId,
    version: "1.0.0",
    applicableProcessorOrNetwork: "fiserv",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceProvenance: "Synthetic Package E reference.",
    requiredMatchingFields: ["fee_row"],
    negativePatterns: [],
    periodApplicable: true,
  };
}

function calculation(id: string, evidenceRefs: string[], observed: MoneyAmount, target: MoneyAmount, result: MoneyAmount): CanonicalCalculationRecord {
  return {
    id,
    formulaCode: "opportunity_monthly_delta_times_12",
    formulaVersion: "canonical_opportunity_formula_v1",
    inputs: [
      { label: "Observed monthly amount", value: observed, unit: "money", evidenceRefs },
      { label: "Target monthly amount", value: target, unit: "money", evidenceRefs },
    ],
    result,
    unit: "money",
    roundingPolicy: "money_minor_units_usd_v1",
  };
}

function analysisWithFeeRows(rows: Record<string, unknown>[]): CanonicalStatementAnalysis {
  const { ledger, evidence, calculations } = ledgerFromRowsWithEvidence(rows);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(
    feeDocument(["Total Amount Submitted | $100.00", "Fees Charged | -$10.00"]),
    { sourceFileName: "package-e-validation.pdf", preferExtractedRows: true },
  );
  analysis.evidence = [...analysis.evidence, ...evidence.values()];
  analysis.calculations = [...analysis.calculations, ...calculations];
  analysis.identity.statementPeriod = selectedFact({
    value: { start: "2026-01-01", end: "2026-01-31" },
    confidence: "high",
    evidenceRefs: [analysis.evidence[0]!.id],
    selectionReason: "Synthetic Package E test period.",
  });
  analysis.identity.processorFamily = selectedFact({
    value: "fiserv",
    confidence: "high",
    evidenceRefs: [analysis.evidence[0]!.id],
    selectionReason: "Synthetic Package E processor context.",
  });
  analysis.identity.processorName = selectedFact({
    value: "Fiserv",
    confidence: "high",
    evidenceRefs: [analysis.evidence[0]!.id],
    selectionReason: "Synthetic Package E processor context.",
  });
  analysis.identity.businessType = selectedFact({
    value: "restaurant",
    confidence: "high",
    evidenceRefs: [analysis.evidence[0]!.id],
    selectionReason: "Synthetic Package E business context.",
  });
  analysis.feeLedger = ledger;
  analysis.feeOwnershipActionability = buildCanonicalFeeOwnershipActionability(ledger, {
    processorFamily: "fiserv",
    statementPeriodStart: "2026-01-01",
  });
  analysis.opportunityEngine = buildCanonicalOpportunityEngine({
    feeLedger: ledger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    evidence: analysis.evidence,
    statementPeriodVerified: true,
  });
  refreshPackageF(analysis);
  return analysis;
}

function ledgerFromRowsWithEvidence(rows: Record<string, unknown>[]): { ledger: CanonicalFeeLedger; evidence: Map<string, any>; calculations: any[] } {
  const evidence = new Map();
  const calculations: any[] = [];
  const lines = rows.map((row) => String(row.evidenceLine ?? `${row.description} | -$${Number(row.amount ?? 10).toFixed(2)}`));
  const ledger = buildCanonicalFeeLedger({
    doc: feeDocument([...lines, "Total Fees | -$10.00"]),
    documentId: "doc_package_e",
    matched: { driverId: "synthetic_parser", driverName: "Synthetic parser" },
    evidence,
    calculations,
    parserOutput: {
      feeLedger: {
        rows,
        controls: [{ label: "Total Fees", rowSum: 10, printedTotal: 10, delta: 0, evidenceLine: "Total Fees | -$10.00" }],
        printedTotal: 10,
        delta: 0,
      },
    },
  });
  return { ledger, evidence, calculations };
}

function feeRow(input: {
  description: string;
  amount?: number;
  network?: string | null;
  type?: string | null;
  section?: string;
  evidenceLine?: string;
}): Record<string, unknown> {
  return {
    network: input.network ?? null,
    type: input.type ?? null,
    description: input.description,
    amount: input.amount ?? 10,
    sourceSection: input.section ?? "Fees",
    evidenceLine: input.evidenceLine ?? `${input.description} | -$${(input.amount ?? 10).toFixed(2)}`,
    pageNumber: 1,
    confidence: "high",
  };
}

function feeDocument(lines: string[]): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: {
      mode: "structured",
      qualityScore: 1,
      reasons: ["Synthetic Package E fixture."],
      lineCount: lines.length,
      amountTokenCount: lines.length,
      hasExtractableText: true,
    },
  };
}

function money(dollars: number): MoneyAmount {
  return { amountMinor: Math.round(dollars * 100), currency: "USD" };
}
