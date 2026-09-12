import { beforeAll, describe, expect, it } from "vitest";

import {
  buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing,
  fiservFeeLedgerOccurrences,
  resolveFiservClaimScopedFeeOccurrenceAdmissionV1,
} from "../../../../src/canonical/v2/index.js";
import { inspectFiservOneStatementEvaluation } from "../../../../src/canonical/v2/evaluation/fiservEvaluationHarness.js";

const fixtures = {
  nov: "Nov_2024_Statement.pdf",
  clover: "SAMPLE_MERCHANT4_CLOVER.pdf",
  short: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
  abdul: "fiserv_ABDUL_BASHER_Aug_2025.pdf",
  basys: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
  nxgen: "fiserv_NXGEN_VORTAX_Sep_2022.pdf",
  paysafeFeb: "fiserv_PAYSAFE_Febr_2024.pdf",
  paysafeOct: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
  zero: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
  priority: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  wells: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
} as const;

type Key = keyof typeof fixtures;
type Prepared = Awaited<ReturnType<typeof inspectFiservOneStatementEvaluation>>;
const prepared = new Map<Key, Prepared>();

beforeAll(async () => {
  await Promise.all((Object.entries(fixtures) as Array<[Key, string]>).map(async ([key, file]) => {
    const safeStatementId = file.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    prepared.set(key, await inspectFiservOneStatementEvaluation({
      statementPaths: [`test/fixtures/pdfs/${file}`], safeStatementId,
    }));
  }));
}, 60_000);

describe("Exact-Control Claim-Scoped Fiserv Fee Occurrence Admission v1", () => {
  it("admits only the exact-control cohort while preserving the existing capability-bound rows", () => {
    const expected = {
      nov: ["claim_scoped_fee_occurrence", 134, 133_096],
      clover: ["runtime_capability", 134, 131_255],
      short: ["runtime_capability", 2, 14_131],
      abdul: ["runtime_capability", 0, 9_119],
      basys: ["claim_scoped_fee_occurrence", 105, 355_245],
      nxgen: ["observational", 0, null],
      paysafeFeb: ["observational", 0, null],
      paysafeOct: ["observational", 0, null],
      zero: ["claim_scoped_fee_occurrence", 5, 4_490],
      priority: ["claim_scoped_fee_occurrence", 8, 308_282],
      wells: ["claim_scoped_fee_occurrence", 104, 295_438],
    } as const;
    for (const [key, [source, count, total]] of Object.entries(expected) as Array<[Key, (typeof expected)[Key]]>) {
      const economic = prepared.get(key)!.economic;
      expect(economic.economicLayer.admissionProfile.source, key).toBe(source);
      expect(economic.economicLayer.charges.filter((charge) => charge.contributionStatus.startsWith("contributes_")).length, key).toBe(count);
      expect(economic.economicLayer.costStack.totalStatementProcessingCost?.amountMinor ?? null, key).toBe(total);
      expect(economic.validation.status, key).toBe("valid");
    }
    const newlyAdmitted = (["nov", "basys", "zero", "priority", "wells"] as Key[])
      .reduce((sum, key) => sum + prepared.get(key)!.economic.economicLayer.charges
        .filter((charge) => charge.contributionStatus.startsWith("contributes_")).length, 0);
    expect(newlyAdmitted).toBe(356);
  });

  it("fails one- and two-cent mismatches closed without residual allocation", () => {
    const expectedDelta = { abdul: 1, nxgen: -2, paysafeFeb: -2, paysafeOct: -1 } as const;
    for (const key of Object.keys(expectedDelta) as Array<keyof typeof expectedDelta>) {
      const admission = prepared.get(key)!.feeOccurrenceAdmission!;
      expect(admission.status, key).toBe("WITHHELD");
      const printedFeeTotal = prepared.get(key)!.observationalFoundation.financialPopulations
        .totalStatementProcessingFees.value!.amountMinor;
      expect(admission.control.normalizedFeeTotalMinor! - printedFeeTotal, key)
        .toBe(expectedDelta[key]);
      expect(admission.reasonCodes, key).toEqual(expect.arrayContaining([
        "exact_fee_population_control_not_proven",
        "fee_population_not_exact_in_integer_minor_units",
      ]));
      expect(admission.admittedOccurrenceRefs, key).toEqual([]);
    }
    expect(prepared.get("abdul")!.economic.economicLayer.costStack.unresolvedRemainder?.amountMinor).toBe(9_119);
  });

  it("preserves zero-dollar rows as provenance without creating additive charges", () => {
    const item = prepared.get("zero")!;
    expect(item.feeOccurrenceAdmission).toMatchObject({
      status: "ADMITTED",
      control: { normalizedFeeRowCount: 6, normalizedNonzeroFeeRowCount: 5, normalizedZeroDollarRowCount: 1 },
    });
    expect(item.feeOccurrenceAdmission!.decisions.filter((decision) => decision.decision === "PRESERVED_ZERO_NONADDITIVE"))
      .toHaveLength(1);
    expect(item.economic.economicLayer.charges).toHaveLength(5);

    const incomplete = structuredClone(item.feeOccurrenceAdmission!);
    incomplete.zeroDollarOccurrenceRefs = [];
    const invalid = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(item.pricing, [], [], incomplete);
    expect(invalid.validation.status).toBe("invalid");
    expect(invalid.validation.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("does not exhaust the normalized fee occurrence population"),
    ]));
  });

  it("keeps duplicate, repeat, summary, unsafe-direction, principal, and adjustment candidates non-additive", () => {
    const item = prepared.get("wells")!;
    const firstRef = item.feeOccurrenceAdmission!.admittedOccurrenceRefs[0]!;
    const mutate = (change: (foundation: Prepared["observationalFoundation"], ref: string) => void) => {
      const foundation = structuredClone(item.observationalFoundation);
      change(foundation, firstRef);
      return resolveFiservClaimScopedFeeOccurrenceAdmissionV1({
        document: item.document, parserOutput: item.parserOutput, foundation, capabilityProof: item.capabilityProof!,
      });
    };
    const occurrence = (foundation: Prepared["observationalFoundation"], ref: string) =>
      foundation.sourceModel.occurrences.find((candidate) => candidate.id === ref)!;

    expect(mutate((foundation, ref) => { occurrence(foundation, ref).printedDirection = "unknown"; }).reasonCodes)
      .toContain("printed_fee_direction_not_known");
    expect(mutate((foundation, ref) => { occurrence(foundation, ref).printedDirection = "negative"; }).reasonCodes)
      .toContain("fee_credit_or_unsafe_direction_outside_package");
    expect(mutate((foundation, ref) => { occurrence(foundation, ref).contributionRole = "repeated_representation"; }).reasonCodes)
      .toContain("duplicate_repeat_or_summary_representation_present");
    expect(mutate((foundation, ref) => {
      foundation.sourceModel.representationGroups.push({
        id: "unresolved-test-group", canonicalFactRef: "fact_v2_total_statement_processing_fees",
        occurrenceRefs: [ref], authoritativeContributionOccurrenceRef: null, supportingOccurrenceRefs: [],
        duplicateHandling: "unresolved", reconciliationRefs: [], evidenceRefs: [], limitations: ["test mutation"],
      });
    }).reasonCodes).toContain("duplicate_repeat_or_summary_representation_present");
    expect(mutate((foundation, ref) => { occurrence(foundation, ref).semanticRole = "chargeback_principal_debit"; }).reasonCodes)
      .toContain("fee_credit_or_unsafe_direction_outside_package");
    expect(mutate((foundation, ref) => { occurrence(foundation, ref).semanticRole = "settlement_adjustment"; }).reasonCodes)
      .toContain("fee_credit_or_unsafe_direction_outside_package");
  });

  it("decouples November fee truth from its activity-summary contradiction", () => {
    const item = prepared.get("nov")!;
    expect(item.feeOccurrenceAdmission).toMatchObject({
      status: "ADMITTED",
      control: {
        normalizedNonzeroFeeRowCount: 134,
        authoritativeFeeTotalMinor: 133_096,
        normalizedFeeTotalMinor: 133_096,
        exactIntegerMinorUnitReconciliation: true,
      },
    });
    expect(item.admission?.capabilityProof.capabilities.find((capability) => capability.capability === "fee_total")?.status)
      .toBe("unknown");
    expect(item.economic.economicLayer.admissionProfile.source).toBe("claim_scoped_fee_occurrence");
    expect(item.economic.economicLayer.costStack).toMatchObject({
      classifiedChargeNet: { amountMinor: 133_096 }, reconciliationDeltaMinor: 0,
      unresolvedRemainder: null, completeness: "partial_but_financially_reconciled",
    });
  });

  it("keeps every admitted charge statement-bound and economically unresolved", () => {
    for (const key of ["nov", "basys", "zero", "priority", "wells"] as Key[]) {
      const item = prepared.get(key)!;
      const occurrenceById = new Map(item.economic.pricingAnalysis.foundation.sourceModel.occurrences.map((row) => [row.id, row]));
      const contributing = item.economic.economicLayer.charges.filter((charge) => charge.contributionStatus.startsWith("contributes_"));
      expect(contributing).toHaveLength(item.feeOccurrenceAdmission!.admittedOccurrenceRefs.length);
      expect(contributing.every((charge) => {
        const row = occurrenceById.get(charge.contributingOccurrenceRef!);
        return row?.semanticRole === "fee_charge" && row.printedAmount!.amountMinor > 0 &&
          ["positive", "unsigned"].includes(row.printedDirection) && charge.financialDirection === "debit" &&
          charge.category === "unresolved_unclassified" && charge.categoryResolution === "unresolved" &&
          charge.pricingComponentRefs.length === 0 && charge.pricingPopulationRefs.length === 0;
      }), key).toBe(true);
    }
  });

  it("cannot use semantic classification to create an additional RD occurrence", () => {
    const item = prepared.get("wells")!;
    const baseline = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(
      item.pricing, [], [], item.feeOccurrenceAdmission,
    );
    expect(baseline.economicLayer.charges.map((charge) => charge.contributingOccurrenceRef).sort())
      .toEqual([...item.feeOccurrenceAdmission!.admittedOccurrenceRefs].sort());
    expect(baseline.economicLayer.charges).toHaveLength(104);
    expect(fiservFeeLedgerOccurrences(item.observationalFoundation)).toHaveLength(104);
  });
});
