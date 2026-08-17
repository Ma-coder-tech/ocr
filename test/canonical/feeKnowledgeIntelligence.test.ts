import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildFeeKnowledgeSourcePacket } from "../../src/canonical/feeKnowledgeRegistry.js";
import { buildFeeKnowledgeIntelligenceRecord, buildStatementGroundedIntelligence, deriveFeeKnowledgeResolutionRequirement } from "../../src/canonical/feeKnowledgeIntelligence.js";
import { buildWholeStatementFeeIntelligencePacket } from "../../src/canonical/wholeStatementFeeIntelligenceReview.js";
import { buildWholeStatementFeeIntelligenceWorkPlan } from "../../src/canonical/wholeStatementFeeIntelligenceWorkPlan.js";
import { buildCanonicalRuntimeAnalysis } from "../../src/canonical/runtimeAdapter.js";
import {
  FEE_KNOWLEDGE_RESEARCH_LIMITS,
  adaptiveEvidenceResolutionRequirement,
  buildAdaptiveFeeKnowledgeResearchQuestion,
  buildFeeKnowledgeWebSearchInput,
  defaultFeeKnowledgeResearchQuestions,
  feeKnowledgeResolutionAllowsAdaptivePublicResearch,
  planFeeKnowledgeResearchQuestions,
  rankFeeKnowledgeDiscoveryCandidates,
  runFeeKnowledgeResearch,
  type FeeKnowledgeSemanticSupportAdapter,
} from "../../src/canonical/feeKnowledgeResearch.js";
import {
  candidateEvidenceLocatorHash,
  openAiInvestigativeIntelligenceAdapter,
  parseInvestigativeProviderOutput,
  serializeInvestigativeProviderInput,
  type FeeKnowledgeInvestigativeIntelligenceAdapter,
} from "../../src/canonical/feeKnowledgeInvestigativeIntelligence.js";
import type { ApprovedFeeKnowledgeSourceRegistry, FeeKnowledgeDomainIdentityPolicy } from "../../src/canonical/feeKnowledgeTypes.js";
import { parsePdfBytes } from "../../src/parser.js";
import { analyzeStatementDocument } from "../../src/statementParserOrchestrator.js";

const STATEMENT_1 = "test/fixtures/pdfs/fiserv_PAYSAFE_Febr_2024.pdf";
const STATEMENT_2 = "test/fixtures/pdfs/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf";
const STATEMENT_3 = "test/fixtures/pdfs/fiserv_ABDUL_BASHER_Aug_2025.pdf";
const STATEMENT_4 = "test/fixtures/pdfs/fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf";
const STATEMENT_5 = "test/fixtures/pdfs/SAMPLE_MERCHANT4_CLOVER.pdf";

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
      expect(sourcePacket.intelligence.every((item) => item.resolutionRequirement)).toBe(true);
      expect(sourcePacket.intelligence.some((item) => item.resolutionRequirement === "public_evidence_required")).toBe(true);
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
      return {
        type: "fee_knowledge_semantic_support_decision",
        policyVersion: "fee_knowledge_claim_support_v1",
        decision: "unsupported",
        structuredClaim: {
          claimKind: "classification",
          feeLabel: question.feeLabel,
          processorOrNetwork: question.processorOrNetwork,
          statementPeriodYear: question.statementPeriodYear,
          proposedCategory: question.deterministicCategory,
          likelyEconomicOwner: question.deterministicEconomicOwner,
          likelyContractualController: question.deterministicContractualController,
          conditions: [],
          exclusions: [],
          maximumConfidence: question.deterministicConfidence,
          actionabilityCeiling: question.deterministicActionabilityCeiling,
          ruleValue: null,
          applicationBasis: "not_evaluated",
        },
        reasonCodes: ["fee_knowledge_semantic_unsupported"],
        providerDetailsStripped: true,
      };
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

    expect(semanticCalls).toBe(1);
    expect(research.candidates).toHaveLength(1);
    expect(research.candidates[0]).toMatchObject({
      retrievalStatus: "retrieved_text",
      semanticVerificationStatus: "completed",
    });
    expect(research.claimSupports[0]!.evidenceDecision).not.toMatch(/^verified_/);
    expect(research.diagnostics).toMatchObject({
      policyVersion: "fee_knowledge_research_diagnostics_v1",
      enabled: true,
      questionCount: 1,
      selectedQuestionCount: 1,
      searchCallCount: 1,
      candidateCount: 1,
      retrievalAttemptCount: 1,
      semanticVerificationAttemptCount: 1,
      investigative: {
        statement: { attempted: false, status: "disabled" },
        retrievedDocument: { attemptCount: 0 },
      },
    });
    expect(research.diagnostics.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(research.diagnostics)).not.toMatch(/evidence\.test|Official rates|network assessment rates|https?:\/\//i);
    expect(research.intelligence.some((item) =>
      item.origin === "retrieved_document" &&
      item.state === "source_derived_candidate_evidence" &&
      item.candidateEvidence?.supportStatus === "candidate_only" &&
      item.resolutionRequirement === "public_evidence_required"
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
    expect(sourcePacket.intelligence.some((item) => item.resolutionRequirement === "unresolved_review_required")).toBe(true);
    expect(plan.units.some((unit) => unit.packet.sourceProvenancePacket.intelligence.length > 0)).toBe(true);
    expect(plan.units.flatMap((unit) => unit.packet.sourceProvenancePacket.intelligence)
      .every((item) => item.resolutionRequirement)).toBe(true);
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
      resolutionRequirement: "current_statement_sufficient",
    });
    expect(contradiction).toMatchObject({
      merchantActionability: "merchant_display_supported",
      proofRequirement: "external_verification_required",
      resolutionRequirement: "public_evidence_required",
    });
  }, 30_000);

  it("runs provider-backed statement investigation for statement #1 and #2 without mutating Packages B-E facts", async () => {
    for (const fixturePath of [STATEMENT_1, STATEMENT_2]) {
      const analysis = await analysisFromPdf(fixturePath, `ai_statement_replay_${fixturePath}`);
      const beforeRows = analysis.feeLedger.rows.map((row) => ({ id: row.id, amount: row.amount, label: row.selectedLabel }));
      const questions = defaultFeeKnowledgeResearchQuestions(analysis, null).slice(0, 2);
      let statementInvestigationCalls = 0;
      const investigativeAdapter: FeeKnowledgeInvestigativeIntelligenceAdapter = async (request) => {
        if (request.scope !== "statement") return { findings: [] };
        statementInvestigationCalls += 1;
        const first = request.questions[0]!;
        return {
          findings: [
            {
              feeRowRef: first.feeRowRef,
              state: "ai_hypothesis",
              subject: "processor_vs_network",
              summary: "The statement label may represent processor-specific terminology rather than a directly published network label.",
              reasonCodes: ["fee_knowledge_ai_ownership_hypothesis"],
              confidence: "low",
              actionabilityCeiling: "verify_only",
              merchantActionability: "merchant_display_provisional",
              proofRequirement: "external_verification_required",
            },
            {
              feeRowRef: first.feeRowRef,
              state: "investigation_lead",
              subject: "markup_hypothesis",
              summary: "The fee deserves markup review because deterministic rules cannot establish whether it is processor-controlled.",
              reasonCodes: ["fee_knowledge_ai_markup_hypothesis"],
              confidence: "low",
              actionabilityCeiling: "verify_only",
              merchantActionability: "merchant_display_provisional",
              proofRequirement: "external_and_math_required",
            },
          ],
        };
      };

      const research = await runFeeKnowledgeResearch({
        analysis,
        registry: null,
        questions,
        options: {
          enabled: true,
          adapter: async () => [],
          investigativeIntelligence: { enabled: true, adapter: investigativeAdapter },
        },
      });

      expect(statementInvestigationCalls).toBe(1);
      expect(research.claimSupports).toEqual([]);
      expect(research.intelligence.some((item) =>
        item.reasonCodes.includes("fee_knowledge_ai_statement_context_investigated") &&
        item.state === "ai_hypothesis"
      )).toBe(true);
      expect(research.intelligence.some((item) =>
        item.reasonCodes.includes("fee_knowledge_ai_markup_hypothesis") &&
        item.proofRequirement === "external_and_math_required" &&
        item.resolutionRequirement === "merchant_pricing_document_required"
      )).toBe(true);
      expect(analysis.feeLedger.rows.map((row) => ({ id: row.id, amount: row.amount, label: row.selectedLabel })))
        .toEqual(beforeRows);
    }
  }, 30_000);

  it("lets AI inspect retrieved documents without exact fee-label matches and sends candidate evidence through semantic verification", async () => {
    const analysis = await analysisFromPdf(STATEMENT_2, "statement_2_ai_document_alias_evidence");
    const [question] = defaultFeeKnowledgeResearchQuestions(analysis, null);
    if (!question) throw new Error("expected at least one research question");
    let semanticCalls = 0;
    const semanticSupportAdapter: FeeKnowledgeSemanticSupportAdapter = async (request) => {
      semanticCalls += 1;
      expect(request.boundedEvidenceExcerpt).toContain("Discover Network Assessment");
      return {
        type: "fee_knowledge_semantic_support_decision",
        policyVersion: "fee_knowledge_claim_support_v1",
        decision: "supports",
        structuredClaim: request.structuredClaim,
        reasonCodes: ["semantic_supports_alias_candidate"],
        providerDetailsStripped: true,
      };
    };
    const investigativeAdapter: FeeKnowledgeInvestigativeIntelligenceAdapter = async (request) => {
      if (request.scope !== "retrieved_document" || !request.candidate) return { findings: [] };
      const locator = request.candidate.retrieved.locators.find((item) =>
        request.candidate!.retrieved.text.slice(item.textStart ?? 0, item.textEnd ?? 0).includes("Discover Network Assessment")
      ) ?? request.candidate.retrieved.locators[0]!;
      return {
        findings: [
          {
            feeRowRef: request.candidate.question.feeRowRef,
            state: "source_derived_candidate_evidence",
            subject: "fee_alias",
            summary: "The official document uses Discover Network Assessment terminology that may correspond to the processor statement label.",
            reasonCodes: ["fee_knowledge_ai_alias_hypothesis", "fee_knowledge_ai_candidate_evidence_locator"],
            confidence: "medium",
            actionabilityCeiling: "verify_only",
            merchantActionability: "internal_only",
            proofRequirement: "external_verification_required",
            candidateRef: request.candidate.candidateId,
            locatorTextHash: locator.textHash,
            supportStatus: "candidate_only",
          },
        ],
      };
    };

    const research = await runFeeKnowledgeResearch({
      analysis,
      registry: null,
      questions: [question],
      options: {
        enabled: true,
        adapter: async () => [{ url: "https://discover.test/network-rules", title: "Discover Rules", publisher: "Discover" }],
        resolveHost: async () => ["93.184.216.34"],
        fetchImpl: async () => new Response(
          "<html><p>Discover Network Assessment fees are published in network program materials for applicable merchants.</p></html>",
          { status: 200, headers: { "content-type": "text/html" } },
        ),
        semanticSupportAdapter,
        domainIdentityPolicy: domainPolicy(question.processorOrNetwork ?? "Fiserv", "discover.test"),
        investigativeIntelligence: { enabled: true, adapter: investigativeAdapter },
      },
    });

    expect(semanticCalls).toBe(1);
    expect(research.candidates[0]).toMatchObject({
      retrievalStatus: "retrieved_text",
      semanticVerificationStatus: "completed",
    });
    expect(research.claimSupports).toHaveLength(1);
    expect(research.diagnostics).toMatchObject({
      enabled: true,
      searchCallCount: 1,
      retrievalAttemptCount: 1,
      investigative: {
        statement: { attempted: true, status: "completed" },
        retrievedDocument: { attemptCount: 1, statusCounts: { completed: 1 } },
      },
      semanticVerificationAttemptCount: 1,
      claimSupportCount: 1,
      verifiedClaimSupportCount: 0,
    });
    expect(JSON.stringify(research.diagnostics)).not.toMatch(/discover\.test|Discover Rules|Network Assessment|semantic_supports_alias_candidate|https?:\/\//i);
    expect(research.intelligence.some((item) =>
      item.origin === "retrieved_document" &&
      item.state === "source_derived_candidate_evidence" &&
      item.subject === "fee_alias" &&
      item.candidateEvidence?.locatorHash
    )).toBe(true);
  }, 30_000);

  it("keeps wrong or contradictory AI-discovered evidence rejected instead of verified", async () => {
    const analysis = await analysisFromPdf(STATEMENT_1, "statement_1_ai_contradictory_evidence");
    const [question] = defaultFeeKnowledgeResearchQuestions(analysis, null);
    if (!question) throw new Error("expected at least one research question");
    const semanticSupportAdapter: FeeKnowledgeSemanticSupportAdapter = async (request) => ({
      type: "fee_knowledge_semantic_support_decision",
      policyVersion: "fee_knowledge_claim_support_v1",
      decision: "contradicts",
      structuredClaim: request.structuredClaim,
      reasonCodes: ["semantic_support_contradicts_claim"],
      providerDetailsStripped: true,
    });
    const investigativeAdapter: FeeKnowledgeInvestigativeIntelligenceAdapter = async (request) => {
      if (request.scope !== "retrieved_document" || !request.candidate) return { findings: [] };
      const locator = request.candidate.retrieved.locators[0]!;
      return {
        findings: [{
          feeRowRef: request.candidate.question.feeRowRef,
          state: "source_derived_candidate_evidence",
          subject: "published_rate",
          summary: "AI overconfidently proposes this source as a published rate candidate.",
          reasonCodes: ["fee_knowledge_ai_candidate_rate_or_rule"],
          confidence: "high",
          actionabilityCeiling: "potentially_actionable",
          merchantActionability: "merchant_display_verified",
          proofRequirement: "external_verification_required",
          candidateRef: request.candidate.candidateId,
          locatorTextHash: locator.textHash,
          supportStatus: "candidate_only",
        }],
      };
    };

    const research = await runFeeKnowledgeResearch({
      analysis,
      registry: null,
      questions: [question],
      options: {
        enabled: true,
        adapter: async () => [{ url: "https://evidence.test/conflict", title: "Conflicting source", publisher: "Evidence Test" }],
        resolveHost: async () => ["93.184.216.34"],
        fetchImpl: async () => new Response("<p>Evidence Test publishes a conflicting rule for this processor context.</p>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
        semanticSupportAdapter,
        domainIdentityPolicy: domainPolicy(question.processorOrNetwork ?? "Fiserv", "evidence.test"),
        investigativeIntelligence: { enabled: true, adapter: investigativeAdapter },
      },
    });

    expect(research.claimSupports).toHaveLength(1);
    expect(research.claimSupports[0]!.evidenceDecision).toBe("conflicting_evidence");
    expect(research.candidates[0]!.verificationStatus).toBe("conflicting_evidence");
    expect(research.intelligence.some((item) =>
      item.state === "source_derived_candidate_evidence" &&
      item.merchantActionability !== "merchant_display_verified"
    )).toBe(true);
  }, 30_000);

  it("normalizes malformed or unsafe investigative provider output before mapping", () => {
    const parsed = parseInvestigativeProviderOutput({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            findings: [
              {
                feeRowRef: "fee_row_safe",
                state: "fully_verified",
                subject: "published_rate",
                summary: "Unsafe attempt to self-verify.",
                reasonCodes: ["fee_knowledge_ai_candidate_rate_or_rule", "model_invented_but_safe", "unsafe-url"],
                confidence: "high",
                actionabilityCeiling: "potentially_actionable",
                merchantActionability: "merchant_display_verified",
                proofRequirement: "external_verification_required",
                resolutionRequirement: "merchant_document_upload_required",
                candidateRef: "candidate_aaaaaaaaaaaaaaaa",
                locatorTextHash: "bad/url",
              },
              { feeRowRef: "fee_row_safe", state: "invented_state", subject: "fee_alias" },
            ],
          }),
        }],
      }],
    });

    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatchObject({
      feeRowRef: "fee_row_safe",
      state: "fully_verified",
      reasonCodes: ["fee_knowledge_ai_candidate_rate_or_rule"],
      locatorTextHash: null,
    });
    expect(parsed.findings[0]).not.toHaveProperty("resolutionRequirement");
  });

  it("requests strict structured output for provider-backed investigative intelligence", async () => {
    const bodies: unknown[] = [];
    const adapter = openAiInvestigativeIntelligenceAdapter({
      openAiApiKey: "test_key",
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({
          id: "resp_test_investigative_schema",
          output: [{
            type: "message",
            content: [{
              type: "output_text",
              text: JSON.stringify({ findings: [] }),
            }],
          }],
          usage: { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 0 } },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    const analysis = await analysisFromPdf(STATEMENT_2, "statement_2_investigative_schema_contract");
    const [question] = defaultFeeKnowledgeResearchQuestions(analysis, null);
    if (!question) throw new Error("expected at least one research question");

    await adapter({
      scope: "statement",
      analysis,
      questions: [question],
      existingIntelligence: [],
    }, { abortSignal: new AbortController().signal });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      reasoning: { effort: "low" },
      max_output_tokens: 3200,
      text: {
        format: {
          type: "json_schema",
          name: "fee_knowledge_investigative_findings",
          strict: true,
        },
      },
    });
    const required = (bodies[0] as { text: { format: { schema: { properties: { findings: { items: { required: string[] } } } } } } })
      .text.format.schema.properties.findings.items.required;
    expect(required).toContain("locatorTextHash");
    const reasonCodeSchema = (bodies[0] as {
      text: { format: { schema: { properties: { findings: { items: { properties: { reasonCodes: { items: { enum: string[]; pattern?: string } } } } } } } } };
    }).text.format.schema.properties.findings.items.properties.reasonCodes.items;
    expect(reasonCodeSchema.enum).toContain("fee_knowledge_ai_candidate_rate_or_rule");
    expect(reasonCodeSchema.enum).not.toContain("model_invented_but_safe");
    expect(reasonCodeSchema.pattern).toBeUndefined();
  }, 30_000);

  it("prioritizes substantive retrieved-document locators over navigation snippets for AI investigation", async () => {
    const analysis = await analysisFromPdf(STATEMENT_2, "statement_2_investigative_locator_selection");
    const [baseQuestion] = defaultFeeKnowledgeResearchQuestions(analysis, null);
    if (!baseQuestion) throw new Error("expected at least one research question");
    const question = {
      ...baseQuestion,
      feeLabel: "DCVR ACQ - DISC NETWORK AUTH FEE",
      processorOrNetwork: "Discover Global Network",
      semanticQuestion: "Find official Discover Network material explaining Discover acquirers or processors.",
    };
    const text = [
      "Skip to main content",
      "Our Network Main Menu",
      "Solutions Main Menu",
      "Find an acquirer that can help your business accept Discover Network payments through a processor or bank.",
    ].join("\n\n");

    const input = serializeInvestigativeProviderInput({
      scope: "retrieved_document",
      analysis,
      questions: [question],
      existingIntelligence: [],
      candidate: {
        candidateId: "candidate_locator_selection",
        attemptId: "research_locator_selection",
        question,
        retrieved: {
          status: "retrieved_text",
          reasonCodes: ["fee_knowledge_text_retrieved"],
          canonicalUrl: "https://www.discover.test/acquirer",
          text,
          contentType: "text/html",
          byteLength: text.length,
          documentFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          safeDiagnostics: {
            policyVersion: "fee_knowledge_retrieval_policy_v1",
            outcomeClass: "successful_usable_retrieval",
            reasonCodes: ["fee_knowledge_text_retrieved"],
            sourceDomain: "www.discover.test",
            finalSourceDomain: "www.discover.test",
            sourceOriginHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            finalSourceOriginHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            sourceHostnameHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            finalSourceHostnameHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            protocol: "https",
            finalProtocol: "https",
            redirectCount: 0,
            attemptedNetwork: true,
            resolvedAddressCount: 1,
            resolvedAddressFamilies: ["ipv4"],
            blockedAddressClass: null,
            httpStatus: 200,
            contentType: "text/html",
            byteLength: text.length,
            documentFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
          locators: [
            { locatorId: "nav_skip", kind: "html_paragraph", pageNumber: null, sectionLabel: null, paragraphIndex: 0, tableIndex: null, rowIndex: null, textStart: 0, textEnd: 20, textHash: "navskip" },
            { locatorId: "nav_menu", kind: "html_paragraph", pageNumber: null, sectionLabel: null, paragraphIndex: 1, tableIndex: null, rowIndex: null, textStart: 22, textEnd: 43, textHash: "navmenu" },
            { locatorId: "substantive", kind: "html_paragraph", pageNumber: null, sectionLabel: null, paragraphIndex: 3, tableIndex: null, rowIndex: null, textStart: 65, textEnd: text.length, textHash: "substantivehash" },
          ],
        },
      },
    });

    expect(input.indexOf("Find an acquirer")).toBeGreaterThan(-1);
    expect(input.indexOf("Find an acquirer")).toBeLessThan(input.indexOf("Skip to main content"));
  }, 30_000);

  it("prefers AI-discovered candidate evidence locators over deterministic fallback locators", () => {
    const deterministic = buildFeeKnowledgeIntelligenceRecord({
      feeRowRef: "fee_row",
      origin: "retrieved_document",
      state: "source_derived_candidate_evidence",
      subject: "source_relevance",
      summary: "Deterministic fallback locator.",
      reasonCodes: ["fee_knowledge_document_candidate_evidence_constructed"],
      confidence: "low",
      actionabilityCeiling: "verify_only",
      merchantActionability: "internal_only",
      proofRequirement: "external_verification_required",
      candidateRef: "candidate_1",
      candidateEvidence: {
        candidateRef: "candidate_1",
        documentFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        locatorHash: "navigation_hash",
        sourceDomain: "discover.test",
        supportStatus: "candidate_only",
      },
    });
    const ai = buildFeeKnowledgeIntelligenceRecord({
      feeRowRef: "fee_row",
      origin: "retrieved_document",
      state: "investigation_lead",
      subject: "source_relevance",
      summary: "AI selected substantive locator.",
      reasonCodes: ["fee_knowledge_ai_investigative_intelligence", "fee_knowledge_ai_retrieved_document_investigated"],
      confidence: "medium",
      actionabilityCeiling: "verify_only",
      merchantActionability: "internal_only",
      proofRequirement: "external_verification_required",
      candidateRef: "candidate_1",
      candidateEvidence: {
        candidateRef: "candidate_1",
        documentFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        locatorHash: "substantive_hash",
        sourceDomain: "discover.test",
        supportStatus: "candidate_only",
      },
    });

    expect(candidateEvidenceLocatorHash([deterministic, ai], "candidate_1")).toBe("substantive_hash");
  });

  it("derives bounded evidence-resolution requirements and gates adaptive public research", () => {
    expect(deriveFeeKnowledgeResolutionRequirement({
      state: "investigation_lead",
      subject: "markup_hypothesis",
      proofRequirement: "external_and_math_required",
    })).toBe("merchant_pricing_document_required");
    expect(deriveFeeKnowledgeResolutionRequirement({
      state: "anomaly_flag",
      subject: "anomaly",
      proofRequirement: "human_review_required",
    })).toBe("unresolved_review_required");
    expect(deriveFeeKnowledgeResolutionRequirement({
      state: "externally_verified",
      subject: "published_rate",
      proofRequirement: "external_verification_required",
      mathVerification: { status: "required_not_run", deterministicCalculationRef: null },
    })).toBe("deterministic_math_required");
    expect(deriveFeeKnowledgeResolutionRequirement({
      state: "source_derived_candidate_evidence",
      subject: "published_rate",
      proofRequirement: "external_verification_required",
      reasonCodes: ["fee_knowledge_http_403"],
    })).toBe("public_evidence_unavailable");

    expect(feeKnowledgeResolutionAllowsAdaptivePublicResearch("public_evidence_required")).toBe(true);
    expect(feeKnowledgeResolutionAllowsAdaptivePublicResearch("public_evidence_unavailable")).toBe(true);
    expect(feeKnowledgeResolutionAllowsAdaptivePublicResearch("merchant_pricing_document_required")).toBe(false);
    expect(feeKnowledgeResolutionAllowsAdaptivePublicResearch("additional_statement_history_required")).toBe(false);
    expect(feeKnowledgeResolutionAllowsAdaptivePublicResearch("deterministic_math_required")).toBe(false);

    expect(adaptiveEvidenceResolutionRequirement(null, {
      structuredClaim: { claimKind: "merchant_application" },
      rateOrAmountComparison: "not_evaluated",
    } as any)).toBe("merchant_pricing_document_required");
    expect(adaptiveEvidenceResolutionRequirement(null, {
      structuredClaim: { claimKind: "published_rule" },
      evidenceDecision: "verified_rule",
      rateOrAmountComparison: "not_evaluated",
    } as any)).toBe("deterministic_math_required");
  });

  it("builds bounded adaptive follow-up questions from rejected or inaccessible evidence", async () => {
    const analysis = await analysisFromPdf(STATEMENT_2, "statement_2_adaptive_followup_replay");
    const parentQuestion = defaultFeeKnowledgeResearchQuestions(analysis, null)[0]!;
    const parentQuestionRef = "question_" + "a".repeat(64);
    const inaccessibleFollowUp = buildAdaptiveFeeKnowledgeResearchQuestion({
      parentQuestion,
      parentQuestionRef,
      parentAttemptId: "research_parent",
      candidate: {
        candidateId: "candidate_blocked",
        retrievalStatus: "unavailable",
        verificationStatus: "source_unavailable",
        semanticVerificationStatus: "not_started",
        title: `${parentQuestion.processorOrNetwork} ${parentQuestion.feeLabel} official fee schedule ${parentQuestion.statementPeriodYear}`,
        publisher: parentQuestion.processorOrNetwork,
        reasonCodes: ["fee_knowledge_http_403"],
        safeRetrievalDiagnostics: { httpStatus: 403, sourceDomain: "paysafe.com", finalSourceDomain: "paysafe.com" },
      } as any,
      claimSupport: null,
    });

    expect(inaccessibleFollowUp).not.toBeNull();
    expect(inaccessibleFollowUp!.triggerReason).toBe("adaptive_inaccessible_authoritative_source");
    expect(inaccessibleFollowUp!.adaptiveFollowUp).toMatchObject({
      parentQuestionRef,
      parentAttemptId: "research_parent",
      parentCandidateId: "candidate_blocked",
      missingDimensions: ["authoritative_source_inaccessible"],
      sourceReasonCodes: ["fee_knowledge_http_403"],
    });
    const inaccessiblePrompt = buildFeeKnowledgeWebSearchInput([inaccessibleFollowUp!]);
    expect(inaccessiblePrompt).toContain("alternate official PDFs");
    expect(inaccessiblePrompt).toContain("adaptiveFollowUp");

    const communityFollowUp = buildAdaptiveFeeKnowledgeResearchQuestion({
      parentQuestion,
      parentQuestionRef,
      parentAttemptId: "research_community_parent",
      candidate: {
        candidateId: "candidate_reddit_blocked",
        retrievalStatus: "unavailable",
        verificationStatus: "rejected",
        semanticVerificationStatus: "not_started",
        title: `${parentQuestion.feeLabel} discussion`,
        publisher: "Reddit",
        reasonCodes: ["fee_knowledge_http_403"],
        safeRetrievalDiagnostics: { httpStatus: 403, sourceDomain: "www.reddit.com", finalSourceDomain: "www.reddit.com" },
      } as any,
      claimSupport: null,
    });
    expect(communityFollowUp).toBeNull();

    const rejectedFollowUp = buildAdaptiveFeeKnowledgeResearchQuestion({
      parentQuestion,
      parentQuestionRef,
      parentAttemptId: "research_parent",
      candidate: null,
      claimSupport: {
        candidateId: "candidate_inapplicable",
        evidenceDecision: "source_inapplicable",
        applicability: { processorOrNetwork: true, statementPeriod: false, jurisdiction: false, transactionContext: null },
        rateOrAmountComparison: "not_calculable",
        structuredClaim: { claimKind: "published_rule" },
        semanticSupport: { decision: "does_not_support", reasonCodes: ["missing rate rule evidence"] },
        exclusions: [],
      } as any,
    });

    expect(rejectedFollowUp).not.toBeNull();
    expect(rejectedFollowUp!.triggerReason).toBe("adaptive_missing_rate_rule_evidence");
    expect(rejectedFollowUp!.adaptiveFollowUp?.missingDimensions).toEqual(expect.arrayContaining([
      "rate_rule_missing",
      "period_mismatch",
      "applicability_missing",
      "fee_or_alias_missing",
    ]));
    expect(planFeeKnowledgeResearchQuestions([parentQuestion, rejectedFollowUp!], FEE_KNOWLEDGE_RESEARCH_LIMITS).selected[0]!.question)
      .toBe(rejectedFollowUp);

    expect(buildAdaptiveFeeKnowledgeResearchQuestion({
      parentQuestion,
      parentQuestionRef,
      parentAttemptId: "research_parent",
      candidate: null,
      claimSupport: {
        structuredClaim: { claimKind: "merchant_application" },
        rateOrAmountComparison: "not_evaluated",
      } as any,
    })).toBeNull();
    expect(buildAdaptiveFeeKnowledgeResearchQuestion({
      parentQuestion,
      parentQuestionRef,
      parentAttemptId: "research_parent",
      candidate: null,
      claimSupport: {
        structuredClaim: { claimKind: "published_rule" },
        evidenceDecision: "verified_rule",
        rateOrAmountComparison: "not_evaluated",
      } as any,
    })).toBeNull();
  }, 30_000);

  it("replays statements #2, #3, #4, and #5 with broader evidence-acquisition planning", async () => {
    for (const fixturePath of [STATEMENT_2, STATEMENT_3, STATEMENT_4, STATEMENT_5]) {
      const analysis = await analysisFromPdf(fixturePath, `evidence_acquisition_replay_${fixturePath}`);
      const questions = defaultFeeKnowledgeResearchQuestions(analysis, null);
      const plan = planFeeKnowledgeResearchQuestions(questions, FEE_KNOWLEDGE_RESEARCH_LIMITS);
      const prompt = buildFeeKnowledgeWebSearchInput(plan.selectedQuestions.slice(0, 1));

      expect(questions.length).toBeGreaterThan(0);
      expect(plan.selected).toHaveLength(Math.min(FEE_KNOWLEDGE_RESEARCH_LIMITS.maxSearchCalls, questions.length));
      expect(plan.selected.length).toBeGreaterThanOrEqual(Math.min(4, questions.length));
      expect(plan.selected.every((item) => item.score > 0)).toBe(true);
      expect(plan.selected.some((item) =>
        item.reasonCodes.includes("fee_knowledge_research_priority_actionable") ||
        item.reasonCodes.includes("fee_knowledge_research_priority_markup") ||
        item.reasonCodes.includes("fee_knowledge_research_priority_network_fee") ||
        item.reasonCodes.includes("fee_knowledge_research_priority_uncertain")
      )).toBe(true);
      expect(prompt).toContain("applicabilityTargets");
      expect(prompt).toContain("sourcePreferences");
      expect(prompt).toContain("alternative official");
    }
  }, 60_000);

  it("ranks candidates by applicability to the specific question, not by official domain alone", async () => {
    const analysis = await analysisFromPdf(STATEMENT_4, "statement_4_candidate_ranking_replay");
    const question = defaultFeeKnowledgeResearchQuestions(analysis, null).find((item) =>
      item.deterministicCategory === "card_brand_network_assessment" ||
      /visa|assessment|network/i.test(item.feeLabel)
    ) ?? defaultFeeKnowledgeResearchQuestions(analysis, null)[0]!;
    const ranked = rankFeeKnowledgeDiscoveryCandidates([
      {
        url: "https://usa.visa.com/pay-with-visa/featured-technologies/small-business.html",
        title: "Visa small business education",
        publisher: "Visa",
      },
      {
        url: "https://usa.visa.com/dam/VCOM/download/merchants/visa-usa-interchange-reimbursement-fees.pdf",
        title: "Visa USA Interchange Reimbursement Fees",
        publisher: "Visa",
      },
      {
        url: "https://example.com/blog/payment-processing-fees-explained",
        title: "Payment processing fees explained",
        publisher: "Example Blog",
      },
    ], question);

    expect(ranked[0]!.url).toContain("interchange-reimbursement-fees.pdf");
    expect(ranked.at(-1)!.url).toContain("example.com");
  }, 30_000);

  it("keeps relevant processor evidence ahead of generic official, academic, and community material", async () => {
    const analysis = await analysisFromPdf(STATEMENT_4, "statement_4_source_quality_ranking_replay");
    const baseQuestion = defaultFeeKnowledgeResearchQuestions(analysis, null)[0]!;
    const question = {
      ...baseQuestion,
      processorOrNetwork: "Basys",
      feeLabel: "Visa Sales Discount",
      statementPeriodYear: "2020",
    };
    const ranked = rankFeeKnowledgeDiscoveryCandidates([
      {
        url: "https://arxiv.org/abs/2401.00001",
        title: "General payment processing research",
        publisher: "arXiv",
      },
      {
        url: "https://www.legislation.gov.au/example/payment-regulation.pdf",
        title: "Generic payments legislation",
        publisher: "Australian Government",
      },
      {
        url: "https://www.reddit.com/r/smallbusiness/comments/example/visa_sales_discount/",
        title: "Visa sales discount discussion",
        publisher: "Reddit",
      },
      {
        url: "https://www.basyspro.com/resources/visa-sales-discount-fee-schedule.pdf",
        title: "Basys Visa Sales Discount Fee Schedule 2020",
        publisher: "Basys",
      },
    ], question);

    expect(ranked[0]!.url).toContain("basyspro.com");
    expect(ranked.findIndex((candidate) => candidate.url.includes("reddit.com")))
      .toBeGreaterThan(ranked.findIndex((candidate) => candidate.url.includes("basyspro.com")));
    expect(ranked.findIndex((candidate) => candidate.url.includes("arxiv.org")))
      .toBeGreaterThan(ranked.findIndex((candidate) => candidate.url.includes("basyspro.com")));
    expect(ranked.findIndex((candidate) => candidate.url.includes("legislation.gov.au")))
      .toBeGreaterThan(ranked.findIndex((candidate) => candidate.url.includes("basyspro.com")));
    expect(ranked.findIndex((candidate) => candidate.url.includes("reddit.com")))
      .toBeLessThan(ranked.findIndex((candidate) => candidate.url.includes("legislation.gov.au")));
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

function domainPolicy(alias: string, officialDomain: string): FeeKnowledgeDomainIdentityPolicy {
  return {
    policyVersion: "fee_knowledge_domain_identity_policy_v1",
    reviewedPublisherDomains: [{
      publisherId: "runtime_fixture",
      aliases: [alias.toLowerCase(), "fiserv", "discover"],
      officialDomains: [officialDomain],
    }],
    identityEvidence: [],
  };
}
