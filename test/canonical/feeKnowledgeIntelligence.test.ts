import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildFeeKnowledgeSourcePacket } from "../../src/canonical/feeKnowledgeRegistry.js";
import { buildStatementGroundedIntelligence } from "../../src/canonical/feeKnowledgeIntelligence.js";
import { buildWholeStatementFeeIntelligencePacket } from "../../src/canonical/wholeStatementFeeIntelligenceReview.js";
import { buildWholeStatementFeeIntelligenceWorkPlan } from "../../src/canonical/wholeStatementFeeIntelligenceWorkPlan.js";
import { buildCanonicalRuntimeAnalysis } from "../../src/canonical/runtimeAdapter.js";
import {
  defaultFeeKnowledgeResearchQuestions,
  runFeeKnowledgeResearch,
  type FeeKnowledgeSemanticSupportAdapter,
} from "../../src/canonical/feeKnowledgeResearch.js";
import type { ApprovedFeeKnowledgeSourceRegistry } from "../../src/canonical/feeKnowledgeTypes.js";
import { parsePdfBytes } from "../../src/parser.js";
import { analyzeStatementDocument } from "../../src/statementParserOrchestrator.js";

const STATEMENT_1 = "test/fixtures/pdfs/fiserv_PAYSAFE_Febr_2024.pdf";
const STATEMENT_2 = "test/fixtures/pdfs/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf";

describe("fee knowledge intelligence state model", () => {
  it("replays statement #1 and #2 into statement-grounded provisional intelligence without mutating financial truth", async () => {
    for (const fixturePath of [STATEMENT_1, STATEMENT_2]) {
      const analysis = await analysisFromPdf(fixturePath, fixturePath);
      const beforeRows = analysis.feeLedger.rows.map((row) => ({ id: row.id, amount: row.amount, label: row.selectedLabel }));
      const questions = defaultFeeKnowledgeResearchQuestions(analysis, null);
      const intelligence = buildStatementGroundedIntelligence({ analysis, questions });
      const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null, runtimeIntelligence: intelligence });

      expect(questions.length).toBeGreaterThan(0);
      expect(intelligence.length).toBeGreaterThan(0);
      expect(sourcePacket.intelligence.some((item) => item.origin === "statement_grounded")).toBe(true);
      expect(sourcePacket.claimSupports).toEqual([]);
      expect(analysis.feeLedger.rows.map((row) => ({ id: row.id, amount: row.amount, label: row.selectedLabel })))
        .toEqual(beforeRows);
    }
  }, 30_000);

  it("constructs source-derived candidate evidence even when the exact fee-label citation gate is not satisfied", async () => {
    const analysis = await analysisFromPdf(STATEMENT_1, "statement_1_document_intelligence");
    const [question] = defaultFeeKnowledgeResearchQuestions(analysis, null);
    if (!question) throw new Error("expected at least one research question");
    const processor = question.processorOrNetwork ?? "Fiserv";
    let semanticCalls = 0;
    const semanticSupportAdapter: FeeKnowledgeSemanticSupportAdapter = async () => {
      semanticCalls += 1;
      throw new Error("semantic verification should not run before citation eligibility");
    };

    const research = await runFeeKnowledgeResearch({
      analysis,
      registry: null,
      questions: [question],
      options: {
        enabled: true,
        adapter: async () => [{ url: "https://evidence.test/rates", title: "Official rates", publisher: "Evidence Test" }],
        resolveHost: async () => ["93.184.216.34"],
        fetchImpl: async () => new Response(
          `<html><title>Official rates</title><p>${processor} publishes network assessment rates and fee schedules for payment card programs.</p></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        ),
        semanticSupportAdapter,
      },
    });

    expect(semanticCalls).toBe(0);
    expect(research.candidates).toHaveLength(1);
    expect(research.candidates[0]).toMatchObject({
      retrievalStatus: "retrieved_text",
      semanticVerificationStatus: "not_eligible",
      claimSupportDecisionRef: null,
    });
    expect(research.claimSupports).toEqual([]);
    expect(research.intelligence.some((item) =>
      item.origin === "retrieved_document" &&
      item.state === "source_derived_candidate_evidence" &&
      item.candidateEvidence?.supportStatus === "candidate_only"
    )).toBe(true);
  }, 30_000);

  it("carries provisional intelligence into Package 5B work units without promoting it to verified claim support", async () => {
    const analysis = await analysisFromPdf(STATEMENT_1, "statement_1_package_5b_intelligence");
    const [question] = defaultFeeKnowledgeResearchQuestions(analysis, null);
    if (!question) throw new Error("expected at least one research question");
    const research = await runFeeKnowledgeResearch({
      analysis,
      registry: null,
      questions: [question],
      options: {
        enabled: true,
        adapter: async () => [{ url: "https://evidence.test/unresolved", title: "Generic documentation", publisher: "Evidence Test" }],
        resolveHost: async () => ["93.184.216.34"],
        fetchImpl: async () => new Response("<p>Generic payment acceptance documentation for merchants.</p>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
        semanticSupportAdapter: async () => {
          throw new Error("semantic verification should not run for unresolved candidate evidence");
        },
      },
    });
    const sourcePacket = buildFeeKnowledgeSourcePacket({
      analysis,
      registry: null,
      runtimeIntelligence: research.intelligence,
      runtimeClaimSupports: research.claimSupports,
      researchAttempts: research.attempts,
      researchCandidates: research.candidates,
    });
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const plan = buildWholeStatementFeeIntelligenceWorkPlan({ packet, mode: "comprehensive", limits: { maxRowsPerUnit: 18 } });

    expect(sourcePacket.claimSupports).toEqual([]);
    expect(sourcePacket.intelligence.some((item) => item.state === "unresolved_review_needed")).toBe(true);
    expect(plan.units.some((unit) => unit.packet.sourceProvenancePacket.intelligence.length > 0)).toBe(true);
    expect(plan.units.every((unit) => unit.packet.sourceProvenancePacket.claimSupports.length === 0)).toBe(true);
  }, 30_000);

  it("promotes externally verified registry evidence while keeping contradictory evidence rejected", async () => {
    const analysis = await analysisFromPdf(STATEMENT_2, "statement_2_verified_registry_intelligence");
    const row = analysis.feeLedger.rows[0]!;
    const registry = registryFor(row.selectedLabel);
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry });
    const publishedRule = sourcePacket.intelligence.find((item) =>
      item.origin === "semantic_verification" &&
      item.subject === "published_rate" &&
      item.state === "externally_verified"
    );
    const contradiction = sourcePacket.intelligence.find((item) =>
      item.state === "rejected" &&
      item.reasonCodes.includes("fee_knowledge_intelligence_conflicting_evidence")
    );

    expect(sourcePacket.claimSupports.some((support) => support.evidenceDecision === "verified_rule")).toBe(true);
    expect(sourcePacket.claimSupports.some((support) => support.evidenceDecision === "conflicting_evidence")).toBe(true);
    expect(publishedRule).toMatchObject({
      confidence: "medium",
      merchantActionability: "merchant_display_verified",
      proofRequirement: "external_verification_required",
    });
    expect(contradiction).toMatchObject({
      merchantActionability: "merchant_display_supported",
      proofRequirement: "external_verification_required",
    });
  }, 30_000);
});

async function analysisFromPdf(path: string, ref: string) {
  const bytes = await readFile(path);
  const document = await parsePdfBytes(bytes);
  const summary = analyzeStatementDocument(document, "restaurant_food_beverage");
  return buildCanonicalRuntimeAnalysis({
    document,
    businessType: "restaurant_food_beverage",
    runtimeDocumentRef: ref,
    legacySummary: summary,
  }).analysis;
}

function registryFor(feeLabel: string): ApprovedFeeKnowledgeSourceRegistry {
  return {
    registrySchemaVersion: "fee_knowledge_registry_v1",
    registryVersion: "fee_knowledge_intelligence_fixture_v1",
    policyVersion: "fee_knowledge_policy_v1",
    sources: [
      {
        sourceId: "mastercard_fixture_rates",
        registrySchemaVersion: "fee_knowledge_registry_v1",
        policyVersion: "fee_knowledge_policy_v1",
        lifecycle: "active",
        kind: "official_card_network_documentation",
        title: "Mastercard Fee Schedule",
        publisher: "Mastercard",
        canonicalUrl: "https://www.mastercard.com/fees",
        domainIdentity: {
          policyVersion: "fee_knowledge_policy_v1",
          publisherId: "mastercard",
          officialDomains: ["mastercard.com"],
          aliases: ["mastercard"],
          verificationBasis: "registry_reviewed",
        },
        publicationDate: "2025-01-01",
        effectivePeriod: { from: "2025-01-01", through: null },
        retrievalDate: "2026-08-10",
        lastVerificationDate: "2026-08-10",
        reverifyAfterDate: null,
        jurisdiction: ["US"],
        market: ["merchant_services"],
        processorIds: [],
        networkIds: [],
        aliases: ["mastercard", "mc"],
        supersedesSourceId: null,
        supersededBySourceId: null,
        contentFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        displayPermission: "internal_only",
        claims: [
          {
            claimId: "mastercard_fixture_published_rule",
            claimType: "published_rule",
            feeLabels: [feeLabel],
            categories: [],
            processorIds: [],
            networkIds: [],
            semanticConclusion: {
              category: "card_brand_network_assessment",
              likelyEconomicOwner: "network",
              likelyContractualController: "network",
            },
            conditions: ["Applies only when the network and transaction context match."],
            exclusions: [],
            maximumConfidence: "medium",
            actionabilityCeiling: "verify_only",
            effectivePeriod: { from: "2025-01-01", through: null },
            sourceLocator: "published network assessment schedule",
            customerSafeParaphrase: "Mastercard publishes network assessment fee rules for applicable card programs.",
            displayPermission: "internal_only",
          },
        ],
      },
      {
        sourceId: "conflicting_fixture_source",
        registrySchemaVersion: "fee_knowledge_registry_v1",
        policyVersion: "fee_knowledge_policy_v1",
        lifecycle: "contradicted",
        kind: "approved_primary_source",
        title: "Contradicted Fee Note",
        publisher: "Reviewed source registry",
        canonicalUrl: "https://evidence.test/conflict",
        domainIdentity: {
          policyVersion: "fee_knowledge_policy_v1",
          publisherId: "reviewed_source_registry",
          officialDomains: ["evidence.test"],
          aliases: ["reviewed source registry"],
          verificationBasis: "registry_reviewed",
        },
        publicationDate: "2025-01-01",
        effectivePeriod: { from: "2025-01-01", through: null },
        retrievalDate: "2026-08-10",
        lastVerificationDate: "2026-08-10",
        reverifyAfterDate: null,
        jurisdiction: [],
        market: [],
        processorIds: [],
        networkIds: [],
        aliases: [feeLabel],
        supersedesSourceId: null,
        supersededBySourceId: null,
        contentFingerprint: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        displayPermission: "internal_only",
        claims: [
          {
            claimId: "conflicting_fixture_claim",
            claimType: "contradiction",
            feeLabels: [feeLabel],
            categories: [],
            processorIds: [],
            networkIds: [],
            semanticConclusion: {
              category: null,
              likelyEconomicOwner: null,
              likelyContractualController: null,
            },
            conditions: [],
            exclusions: ["Contradicted fixture source should not be admitted as verified support."],
            maximumConfidence: "low",
            actionabilityCeiling: "unknown",
            effectivePeriod: { from: "2025-01-01", through: null },
            sourceLocator: "contradicted registry note",
            customerSafeParaphrase: "This source is intentionally contradicted in the fixture.",
            displayPermission: "internal_only",
          },
        ],
      },
    ],
  };
}
