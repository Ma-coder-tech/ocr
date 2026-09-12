import { beforeAll, describe, expect, it } from "vitest";

import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildFiservClaimScopedActivityPopulationAdmissionV1 } from "../../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { inspectFiservOneStatementEvaluation } from "../../src/canonical/v2/evaluation/fiservEvaluationHarness.js";

const fixtures = {
  nov: { file: "Nov_2024_Statement.pdf", businessType: "restaurant_food_beverage" },
  abdul: { file: "fiserv_ABDUL_BASHER_Aug_2025.pdf", businessType: "retail" },
  zero: { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", businessType: "ecommerce" },
} as const satisfies Record<string, { file: string; businessType: BusinessTypeId }>;

type FixtureKey = keyof typeof fixtures;
type Prepared = Awaited<ReturnType<typeof inspectFiservOneStatementEvaluation>> & {
  canonicalAnalysis: ReturnType<typeof buildCanonicalStatementFactsFromParsedDocument>;
};
const prepared = new Map<FixtureKey, Prepared>();

beforeAll(async () => {
  await Promise.all((Object.entries(fixtures) as Array<[FixtureKey, (typeof fixtures)[FixtureKey]]>).map(async ([key, fixture]) => {
    const safeStatementId = fixture.file.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    const inspected = await inspectFiservOneStatementEvaluation({
      statementPaths: [`test/fixtures/pdfs/${fixture.file}`], safeStatementId,
    });
    const analysis = buildCanonicalStatementFactsFromParsedDocument(inspected.document, {
      sourceFileName: fixture.file, businessType: fixture.businessType,
    });
    prepared.set(key, { ...inspected, canonicalAnalysis: analysis });
  }));
}, 30_000);

function admission(key: FixtureKey) {
  const item = prepared.get(key)!;
  return buildFiservClaimScopedActivityPopulationAdmissionV1({
    document: item.document, economic: item.economic, canonicalAnalysis: item.canonicalAnalysis,
  });
}

describe("Fiserv Claim-Scoped Activity Population Admission v1", () => {
  it("admits a structurally continued exact card-summary population without inventing a submitted count", () => {
    const result = admission("abdul");
    expect(result.sourceBinding).toMatchObject({
      supportedFiservFamily: true,
      cardSummary: "mapped",
      cardSummaryAmountControl: "pass",
      cardSummaryHeadlineControl: "pass",
      cardSummaryCountControl: "not_applicable",
    });
    expect(result.facts.grossSalesVolume?.value).toEqual({ amountMinor: 271_211, currency: "USD" });
    expect(result.facts.refundVolume?.value).toEqual({ amountMinor: 0, currency: "USD" });
    expect(result.facts.grossSaleTransactionCount?.value).toBe(64);
    expect(result.facts.refundTransactionCount?.value).toBe(0);
    expect(result.facts.averageTicket?.value).toEqual({ amountMinor: 4_238, currency: "USD" });
    expect(result.facts.transactionCount).toBeUndefined();
    expect(result.decisions.find((item) => item.field === "transactionCount")).toMatchObject({
      decision: "WITHHELD",
      reasonCodes: expect.arrayContaining(["explicit_submitted_count_and_passing_count_formula_required"]),
    });
  });

  it("retains exact counts but withholds contradictory card-summary amounts", () => {
    const result = admission("nov");
    expect(result.sourceBinding).toMatchObject({
      cardSummary: "mapped",
      cardSummaryAmountControl: "pass",
      cardSummaryHeadlineControl: "fail",
      cardSummaryCountControl: "pass",
    });
    expect(result.facts.grossSalesVolume).toBeUndefined();
    expect(result.facts.refundVolume).toBeUndefined();
    expect(result.facts.averageTicket).toBeUndefined();
    expect(result.facts.transactionCount?.value).toBe(1_828);
    expect(result.facts.grossSaleTransactionCount?.value).toBe(1_825);
    expect(result.facts.refundTransactionCount?.value).toBe(3);
    expect(result.decisions.find((item) => item.field === "grossSalesVolume")).toMatchObject({
      decision: "WITHHELD", reasonCodes: expect.arrayContaining(["card_summary_headline_not_matching"]),
    });
  });

  it("preserves an explicit statement zero without filling silent populations with zero", () => {
    const result = admission("zero");
    expect(result.facts.processedVolume?.value).toEqual({ amountMinor: 0, currency: "USD" });
    expect(result.facts.transactionCount).toBeUndefined();
    expect(result.facts.authorizationCount).toBeUndefined();
    expect(result.facts.chargebackCount).toBeUndefined();
    expect(result.channelAdmission).toBeNull();
    expect(result.safety.inferredZeroAllowed).toBe(false);
  });

  it("bridges only a qualified statement-evidenced channel and retains its evidence", () => {
    const qualified = admission("abdul");
    expect(qualified.channelAdmission).toMatchObject({
      value: expect.stringMatching(/card_present|card_not_present|mixed/),
      canonicalFactRef: "businessQualification.channel",
      evidenceAccess: "STATEMENT_DERIVABLE",
      evidenceRefs: expect.arrayContaining([expect.any(String)]),
    });
    expect(admission("zero").channelAdmission).toBeNull();

    const abdul = prepared.get("abdul")!;
    const wrongStatement = buildFiservClaimScopedActivityPopulationAdmissionV1({
      document: abdul.document,
      economic: abdul.economic,
      canonicalAnalysis: prepared.get("nov")!.canonicalAnalysis,
    });
    expect(wrongStatement.channelAdmission).toBeNull();
    expect(wrongStatement.decisions.find((item) => item.field === "channel")?.reasonCodes)
      .toContain("channel_evidence_not_bound_to_canonical_analysis");
  });

  it("fails all admissions closed when the supplied document no longer matches the canonical source fingerprint", () => {
    const item = prepared.get("abdul")!;
    const changed = structuredClone(item.document);
    changed.rows[0]!.content = `${String(changed.rows[0]!.content)} source mutation`;
    const result = buildFiservClaimScopedActivityPopulationAdmissionV1({
      document: changed, economic: item.economic, canonicalAnalysis: item.canonicalAnalysis,
    });
    expect(result.sourceBinding.sourceFingerprintMatched).toBe(false);
    expect(Object.keys(result.facts)).toHaveLength(0);
    expect(result.channelAdmission).toBeNull();
    expect(result.decisions.every((decision) => decision.decision === "WITHHELD" || decision.decision === "NOT_APPLICABLE")).toBe(true);
  });

  it("contains no mutation, substitution, customer, AI, or knowledge-admission authority", () => {
    const result = admission("abdul");
    expect(result.safety).toEqual({
      exactPopulationIdentityRequired: true,
      sourceEvidenceRequired: true,
      canonicalMutationAllowed: false,
      rdMutationAllowed: false,
      feeLedgerContributionAllowed: false,
      populationSubstitutionAllowed: false,
      inferredZeroAllowed: false,
      customerRoutingAllowed: false,
      aiOrWebOperationCount: 0,
      newKnowledgeAdmissionCount: 0,
    });
    expect(Object.keys(result.facts)).not.toContain("chargebackPrincipal");
  });
});
