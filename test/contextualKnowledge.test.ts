import { beforeAll, describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildCommercialDecompositionContractV1 } from "../src/canonical/commercialDecompositionContractV1.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { inspectFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import { createContextualSnapshot, REQUIRED_PROHIBITIONS, resolveContextualRule } from "../src/contextualKnowledge/governance.js";
import { buildContextualFactPacket, evaluateContextualObservedCosts } from "../src/contextualKnowledge/evaluate.js";
import { FIRST_CONTEXTUAL_RECORDS, FIRST_CONTEXTUAL_SNAPSHOT } from "../src/contextualKnowledge/pack.js";
import { parsePdf } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import type { BusinessTypeId } from "../src/businessTypes.js";
import type { InternalAnalystPricingModelInput } from "../src/canonical/internalAnalystFindingV1.js";

const AS_OF = "2026-09-24";
const MERCHANT4 = "SAMPLE_MERCHANT4_CLOVER.pdf";
const JUNE = "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf";
const ZERO = "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf";

async function canonical(file: string, businessType: BusinessTypeId) {
  const doc = await parsePdf(`test/fixtures/pdfs/${file}`);
  return { doc, analysis: buildCanonicalStatementFactsFromParsedDocument(doc, { sourceFileName: file, businessType }) };
}
async function withRealFixedAdmission(file: string, businessType: BusinessTypeId) {
  const safeStatementId = file.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const inspected = await inspectFiservOneStatementEvaluation({ statementPaths: [`test/fixtures/pdfs/${file}`], safeStatementId });
  const analysis = buildCanonicalStatementFactsFromParsedDocument(inspected.document, { sourceFileName: file, businessType });
  const legacy = analyzeStatementDocument(inspected.document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error("pricing unavailable");
  const suppliedPricingObservation: InternalAnalystPricingModelInput = {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
  const knowledge = new GovernedPaymentKnowledgeAuthority().resolveStatement({
    analysis, context: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["supported_fiserv_us_scope"] } },
    suppliedPricingObservation,
  });
  const commercialDecomposition = buildCommercialDecompositionContractV1({ analysis, knowledge });
  const profile = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document, economic: inspected.economic, canonicalAnalysis: analysis, commercialDecomposition,
  }).profile;
  return { analysis, admission: profile.fixedCostSensitivityAdmission };
}

describe("governed contextual knowledge, offline", () => {
  let merchant4: Awaited<ReturnType<typeof withRealFixedAdmission>>;
  let zero: Awaited<ReturnType<typeof withRealFixedAdmission>>;
  let june: Awaited<ReturnType<typeof canonical>>;

  beforeAll(async () => {
    [merchant4, zero, june] = await Promise.all([
      withRealFixedAdmission(MERCHANT4, "restaurant_food_beverage"),
      withRealFixedAdmission(ZERO, "ecommerce"),
      canonical(JUNE, "other"),
    ]);
  }, 90_000);

  it("pins exactly two admitted Product rules with separate use and claim ceilings", () => {
    expect(FIRST_CONTEXTUAL_SNAPSHOT.records).toHaveLength(2);
    expect(FIRST_CONTEXTUAL_SNAPSHOT.records.map((r) => r.ruleId)).toEqual(["fixed_fee_burden", "observed_line_item_effect"]);
    expect(FIRST_CONTEXTUAL_RECORDS.map((r) => r.permittedUses)).toEqual([["display_observed_amount"], ["contextual_cost_burden"]]);
    for (const record of FIRST_CONTEXTUAL_SNAPSHOT.records) {
      expect(record.admission).toMatchObject({ lifecycle: "admitted", reviewAuthority: "Product" });
      expect(record.prohibitedClaimCodes).toEqual(REQUIRED_PROHIBITIONS);
    }
    expect(Object.isFrozen(FIRST_CONTEXTUAL_SNAPSHOT)).toBe(true);
    expect(Object.isFrozen(FIRST_CONTEXTUAL_SNAPSHOT.records[0])).toBe(true);
    const changed = structuredClone(FIRST_CONTEXTUAL_SNAPSHOT);
    changed.records[0]!.limitations.push("tampered");
    expect(resolveContextualRule(changed, { snapshotId: changed.snapshotId, ruleId: "fixed_fee_burden", asOf: AS_OF,
      processorFamily: "fiserv_first_data", merchantIdentifier: null, tenantRef: null, accountRef: null })).toMatchObject({ status: "not_assessed", reasonCodes: ["invalid_pinned_snapshot"] });
  });

  it("shows source-backed line items and only proven fixed burden on a positive-volume statement", () => {
    const packet = buildContextualFactPacket({ analysis: merchant4.analysis, fixedAdmission: merchant4.admission });
    const result = evaluateContextualObservedCosts({ packet, asOf: AS_OF });
    expect(result.observedLineItems.status).toBe("assessed");
    expect(result.observedLineItems.items.length).toBeGreaterThan(0);
    expect(result.observedLineItems.items[0]).toMatchObject({ presentationCeiling: "observed_charge_only", prohibitedClaimCodes: REQUIRED_PROHIBITIONS });
    expect(result.fixedFeeBurden).toMatchObject({ status: "assessed", fixedChargeTotal: { amountMinor: 125, currency: "USD" },
      compatibleProcessedVolume: { amountMinor: 5_246_055, currency: "USD" }, basisPointsEquivalent: "0.24" });
    expect(result.fixedFeeBurden.feeRowIds).toHaveLength(1);
    expect(result.fixedFeeBurden.evidenceRefs.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toMatch(/"(?:verifiedSavings|expectedSavings|annualizedSavings|modeledOpportunity)"/);
  });

  it("preserves a charge on a zero-volume statement and withholds its ratio", () => {
    const result = evaluateContextualObservedCosts({ packet: buildContextualFactPacket({ analysis: zero.analysis, fixedAdmission: zero.admission }), asOf: AS_OF });
    expect(result.observedLineItems.status).toBe("assessed");
    expect(result.fixedFeeBurden).toMatchObject({ status: "amount_only", fixedChargeTotal: { amountMinor: 495, currency: "USD" },
      compatibleProcessedVolume: null, basisPointsEquivalent: null, reasonCodes: ["zero_processed_volume"] });
  });

  it("does not classify an application fee as fixed from its label", () => {
    const result = evaluateContextualObservedCosts({ packet: buildContextualFactPacket({ analysis: june.analysis }), asOf: AS_OF });
    expect(result.observedLineItems.items.some((item) => item.statementLabel.includes("APPLICATION FEE"))).toBe(true);
    expect(result.fixedFeeBurden).toMatchObject({ status: "not_assessed", fixedChargeTotal: null, basisPointsEquivalent: null });
    expect(result.fixedFeeBurden.excluded.some((entry) => entry.reasonCodes.includes("fixed_mechanic_unproven"))).toBe(true);
  });

  it("rejects duplicate fee rows and conflicting fixed admissions", () => {
    const duplicated = structuredClone(merchant4.analysis);
    const row = duplicated.feeLedger.rows.find((r) => r.contributesToUniqueTotal && r.signedAmount?.amountMinor === 125)!;
    duplicated.feeLedger.rows.push(structuredClone(row));
    const result = evaluateContextualObservedCosts({ packet: buildContextualFactPacket({ analysis: duplicated, fixedAdmission: merchant4.admission }), asOf: AS_OF });
    expect(result.observedLineItems.items.some((item) => item.feeRowId === row.id)).toBe(false);
    expect(result.fixedFeeBurden.fixedChargeTotal).toBeNull();
    const conflicting = structuredClone(merchant4.admission);
    conflicting.admissions.push(structuredClone(conflicting.admissions[0]!));
    const other = evaluateContextualObservedCosts({ packet: buildContextualFactPacket({ analysis: merchant4.analysis, fixedAdmission: conflicting }), asOf: AS_OF });
    expect(other.fixedFeeBurden.status).toBe("not_assessed");
  });

  it("keeps credits signed and outside positive effects and fixed burden", () => {
    const altered: CanonicalStatementAnalysis = structuredClone(june.analysis);
    const row = altered.feeLedger.rows.find((r) => r.contributesToUniqueTotal)!;
    const sourceRef = row.sourceOccurrenceIds[0]!;
    const evidenceRef = altered.feeLedger.sourceOccurrences.find((o) => o.id === sourceRef)!.evidenceRef;
    altered.evidence.find((e) => e.id === evidenceRef)!.normalizedText = "REFUND CREDIT -42.31";
    row.role = "credit";
    row.selectedAmount = { amountMinor: 4_231, currency: "USD" };
    row.signedAmount = { amountMinor: -4_231, currency: "USD" };
    row.contributionDecision.reasonCode = "signed_credit_included";
    row.contributionDecision.signedAmountBasis = "printed_signed_amount";
    const result = evaluateContextualObservedCosts({ packet: buildContextualFactPacket({ analysis: altered }), asOf: AS_OF });
    expect(result.observedLineItems.creditsAndReversals).toContainEqual(expect.objectContaining({ feeRowId: row.id, signedAmount: { amountMinor: -4_231, currency: "USD" } }));
    expect(result.observedLineItems.items.some((item) => item.feeRowId === row.id)).toBe(false);
    expect(result.fixedFeeBurden.fixedChargeTotal).toBeNull();
    altered.evidence.find((e) => e.id === evidenceRef)!.normalizedText = "ADJUSTMENT 42.31";
    row.contributionDecision.signedAmountBasis = "fee_charge_magnitude";
    const ambiguous = evaluateContextualObservedCosts({ packet: buildContextualFactPacket({ analysis: altered }), asOf: AS_OF });
    expect(ambiguous.observedLineItems.creditsAndReversals.some((item) => item.feeRowId === row.id)).toBe(false);
  });

  it("fails closed on date, scope, privacy and unresolved same-rule conflicts", () => {
    const query = { snapshotId: FIRST_CONTEXTUAL_SNAPSHOT.snapshotId, ruleId: "fixed_fee_burden" as const,
      asOf: AS_OF, processorFamily: "fiserv_first_data" as const, merchantIdentifier: null, tenantRef: null, accountRef: null };
    expect(resolveContextualRule(FIRST_CONTEXTUAL_SNAPSHOT, { ...query, asOf: "2026-09-23" }).reasonCodes).toContain("assessment_predates_pinned_snapshot");
    expect(resolveContextualRule(FIRST_CONTEXTUAL_SNAPSHOT, { ...query, processorFamily: "unsupported" }).reasonCodes).toContain("unsupported_processor_family");
    const privateRecord = structuredClone(FIRST_CONTEXTUAL_RECORDS[1]!);
    privateRecord.id = "tenant_fixed_fee_burden_v1";
    privateRecord.scope = { ...privateRecord.scope, visibility: "tenant_private", tenantRef: "tenant_one" };
    const privateSnapshot = createContextualSnapshot(AS_OF, [privateRecord]);
    expect(resolveContextualRule(privateSnapshot, { ...query, snapshotId: privateSnapshot.snapshotId }).reasonCodes).toContain("scope_or_privacy_mismatch");
    expect(resolveContextualRule(privateSnapshot, { ...query, snapshotId: privateSnapshot.snapshotId, tenantRef: "tenant_one" }).status).toBe("resolved");
    const accountRecord = structuredClone(privateRecord);
    accountRecord.id = "account_fixed_fee_burden_v1";
    accountRecord.scope = { ...accountRecord.scope, visibility: "account_private", accountRef: "account_7", merchantIdentifier: "123456" };
    const accountSnapshot = createContextualSnapshot(AS_OF, [accountRecord]);
    const accountQuery = { ...query, snapshotId: accountSnapshot.snapshotId, tenantRef: "tenant_one", accountRef: "account_7" };
    expect(resolveContextualRule(accountSnapshot, { ...accountQuery, merchantIdentifier: "other_mid" }).reasonCodes).toContain("scope_or_privacy_mismatch");
    expect(resolveContextualRule(accountSnapshot, { ...accountQuery, merchantIdentifier: "123456" }).status).toBe("resolved");
    const conflict = structuredClone(FIRST_CONTEXTUAL_RECORDS[1]!);
    conflict.id = "product_fixed_fee_burden_conflict_v1";
    const conflictSnapshot = createContextualSnapshot(AS_OF, [...FIRST_CONTEXTUAL_RECORDS, conflict]);
    expect(resolveContextualRule(conflictSnapshot, { ...query, snapshotId: conflictSnapshot.snapshotId }).reasonCodes).toContain("unresolved_rule_conflict");
    conflict.version = 2;
    conflict.effectiveFrom = "2026-10-01";
    conflict.supersedes = [FIRST_CONTEXTUAL_RECORDS[1]!.id];
    const superseded = createContextualSnapshot(AS_OF, [...FIRST_CONTEXTUAL_RECORDS, conflict]);
    expect(resolveContextualRule(superseded, { ...query, snapshotId: superseded.snapshotId }).record?.id).toBe(FIRST_CONTEXTUAL_RECORDS[1]!.id);
    expect(resolveContextualRule(superseded, { ...query, snapshotId: superseded.snapshotId, asOf: "2026-10-01" }).record?.id).toBe(conflict.id);
  });

  it("does not promote prohibited claims through a forged record or tampered fact packet", () => {
    const forged = structuredClone(FIRST_CONTEXTUAL_RECORDS[0]!);
    forged.prohibitedClaimCodes = forged.prohibitedClaimCodes.filter((code) => code !== "verified_savings");
    expect(() => createContextualSnapshot(AS_OF, [forged])).toThrow("prohibitions_incomplete");
    const packet = structuredClone(buildContextualFactPacket({ analysis: june.analysis }));
    packet.feeFacts[0]!.signedAmount = { amountMinor: 999_999, currency: "USD" };
    const result = evaluateContextualObservedCosts({ packet, asOf: AS_OF });
    expect(result.observedLineItems.status).toBe("not_assessed");
    expect(result.fixedFeeBurden.status).toBe("not_assessed");
    expect(result.observedLineItems.reasonCodes).toContain("invalid_fact_packet");
  });
});
