import { beforeAll, describe, expect, it } from "vitest";

import {
  buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing,
  fiservFeeLedgerOccurrences,
  resolveFiservClaimScopedFeeRoundingResidualV1,
} from "../../../../src/canonical/v2/index.js";
import { inspectFiservOneStatementEvaluation } from "../../../../src/canonical/v2/evaluation/fiservEvaluationHarness.js";

const fixtures = {
  abdul: "fiserv_ABDUL_BASHER_Aug_2025.pdf",
  nxgen: "fiserv_NXGEN_VORTAX_Sep_2022.pdf",
  paysafeFeb: "fiserv_PAYSAFE_Febr_2024.pdf",
  paysafeOct: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
  priority: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  zero: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
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

describe("Bounded Fee-Total Rounding Residual v1", () => {
  it("admits exactly the four Product-scoped populations and records signed non-additive residuals", () => {
    const expected = {
      abdul: [50, 9_120, 9_119, -1],
      nxgen: [61, 200_771, 200_773, 2],
      paysafeFeb: [22, 156_571, 156_573, 2],
      paysafeOct: [42, 37_854, 37_855, 1],
    } as const;
    for (const [key, [count, rowSum, printed, residual]] of Object.entries(expected) as Array<[keyof typeof expected, (typeof expected)[keyof typeof expected]]>) {
      const item = prepared.get(key)!;
      expect(item.feeRoundingResidual).toMatchObject({
        status: "ADMITTED",
        control: {
          controlResult: "pass_with_rounding", normalizedNonzeroFeeRowCount: count,
          admittedFeeOccurrenceSumMinor: rowSum, printedStatementFeeTotalMinor: printed,
          signedResidualMinor: residual, absoluteResidualMinor: Math.abs(residual),
          maximumAcceptedAbsoluteResidualMinor: 2, residualCreatesAdditiveOccurrence: false,
          individualPrintedAmountsModified: false, principalOrAdjustmentRequiredForReconciliation: false,
        },
      });
      const stack = item.economic.economicLayer.costStack;
      expect(item.economic.economicLayer.admissionProfile.source).toBe("claim_scoped_fee_rounding");
      expect(item.economic.validation.status).toBe("valid");
      expect(stack.classifiedChargeNet.amountMinor).toBe(rowSum);
      expect(stack.authoritativeStatementFeeTotal?.amountMinor).toBe(printed);
      expect(stack.totalStatementProcessingCost?.amountMinor).toBe(printed);
      expect(stack.reconciliationDeltaMinor).toBe(residual);
      expect(stack.unresolvedRemainder).toBeNull();
      expect(stack.roundingResidual).toMatchObject({
        signedResidualMinor: residual, additiveChargeRef: null, category: null, participantOrOwner: null,
      });
      expect(item.economic.economicLayer.charges).toHaveLength(count);
      expect(item.economic.economicLayer.charges.every((charge) => charge.observedAmount!.amountMinor > 0 &&
        charge.financialDirection === "debit" && charge.contributingOccurrenceRef !== null)).toBe(true);
    }
  });

  it("does not alter the existing exact cohort or admit zero rows additively", () => {
    for (const key of ["priority", "zero"] as Key[]) {
      const item = prepared.get(key)!;
      expect(item.economic.economicLayer.admissionProfile.source).toBe("claim_scoped_fee_occurrence");
      expect(item.economic.economicLayer.costStack.roundingResidual).toBeUndefined();
    }
    const zero = prepared.get("zero")!;
    expect(fiservFeeLedgerOccurrences(zero.observationalFoundation).filter((row) => row.printedAmount?.amountMinor === 0)).toHaveLength(1);
    expect(zero.economic.economicLayer.charges.some((charge) => charge.observedAmount?.amountMinor === 0)).toBe(false);
  });

  it("fails closed beyond two minor units even when a broader parser tolerance says pass_with_rounding", () => {
    const item = prepared.get("nxgen")!;
    const foundation = structuredClone(item.observationalFoundation);
    const rows = fiservFeeLedgerOccurrences(foundation);
    const rowSum = rows.reduce((sum, row) => sum + row.printedAmount!.amountMinor, 0);
    const control = item.capabilityProof!.reconciliationControlCandidates.find((candidate) =>
      candidate.semanticPurpose === "complete_fee_occurrence_population" && candidate.result === "pass_with_rounding")!;
    const total = foundation.sourceModel.occurrences.find((occurrence) => occurrence.id === control.authoritativeTotalOccurrenceRef)!;
    total.printedAmount!.amountMinor = rowSum + 3;
    const admission = resolveFiservClaimScopedFeeRoundingResidualV1({
      document: item.document, parserOutput: item.parserOutput, foundation, capabilityProof: item.capabilityProof!,
    });
    expect(admission.status).toBe("WITHHELD");
    expect(admission.reasonCodes).toContain("residual_outside_two_minor_unit_product_boundary");
    expect(admission.admittedOccurrenceRefs).toEqual([]);
  });

  it("fails closed for repeat, unsafe direction, principal, and adjustment representations", () => {
    const item = prepared.get("nxgen")!;
    const firstRef = item.feeRoundingResidual!.admittedOccurrenceRefs[0]!;
    const mutate = (change: (occurrence: any) => void) => {
      const foundation = structuredClone(item.observationalFoundation);
      change(foundation.sourceModel.occurrences.find((row) => row.id === firstRef)!);
      return resolveFiservClaimScopedFeeRoundingResidualV1({
        document: item.document, parserOutput: item.parserOutput, foundation, capabilityProof: item.capabilityProof!,
      });
    };
    expect(mutate((row) => { row.contributionRole = "repeated_representation"; }).reasonCodes)
      .toContain("duplicate_repeat_or_summary_representation_present");
    expect(mutate((row) => { row.printedDirection = "negative"; }).reasonCodes)
      .toContain("fee_credit_or_unsafe_direction_outside_package");
    expect(mutate((row) => { row.semanticRole = "chargeback_principal_debit"; }).reasonCodes)
      .toContain("fee_credit_or_unsafe_direction_outside_package");
    expect(mutate((row) => { row.semanticRole = "settlement_adjustment"; }).reasonCodes)
      .toContain("fee_credit_or_unsafe_direction_outside_package");
  });

  it("rejects a tampered residual control at RD validation", () => {
    const item = prepared.get("nxgen")!;
    const admission = structuredClone(item.feeRoundingResidual!);
    admission.control.signedResidualMinor = 1;
    const invalid = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(
      item.pricing, [], [], item.feeOccurrenceAdmission, admission,
    );
    expect(invalid.validation.status).toBe("invalid");
  });
});
