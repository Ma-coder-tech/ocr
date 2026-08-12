import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildFeeKnowledgeSourcePacket } from "../../src/canonical/feeKnowledgeRegistry.js";
import {
  buildRuntimeClaimSupportDecisionPayload,
  calculateRuntimeClaimSupportDecisionRef,
} from "../../src/canonical/feeKnowledgeClaimSupportDecision.js";
import { validateResearchLinkage } from "../../src/canonical/wholeStatementFeeIntelligenceAdmission.js";
import {
  feeKnowledgeQuestionRef,
  FeeKnowledgeSearchProviderError,
  openAiSemanticSupportAdapter,
  runFeeKnowledgeResearch,
  verifyCandidate,
  type FeeKnowledgeResearchQuestion,
} from "../../src/canonical/feeKnowledgeResearch.js";
import { retrieveFeeKnowledgeDocument } from "../../src/canonical/feeKnowledgeRetrieval.js";
import {
  FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
  FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
  type FeeKnowledgeDomainIdentityPolicy,
} from "../../src/canonical/feeKnowledgeTypes.js";
import type { ParsedDocument } from "../../src/parser.js";
import { parsePdfBytes } from "../../src/parser.js";
import { analyzeStatementDocument } from "../../src/statementParserOrchestrator.js";
import { buildCanonicalRuntimeAnalysis } from "../../src/canonical/runtimeAdapter.js";

describe("canonical research admission integration", () => {
  it("keeps two questions and every selected candidate independently attributable", async () => {
    const currentAnalysis = await analysisWithCanonicalFeeRows();
    const [firstRow, secondRow] = currentAnalysis.feeLedger.rows;
    if (!firstRow || !secondRow) throw new Error("expected two canonical fee rows");
    const questions = [question(firstRow.id, firstRow.selectedLabel), question(secondRow.id, secondRow.selectedLabel)];
    const result = await runFeeKnowledgeResearch({
      analysis: currentAnalysis,
      questions,
      options: {
        enabled: true,
        timeoutMs: 1000,
        domainIdentityPolicy: domainPolicy(),
        resolveHost: async () => ["93.184.216.34"],
        adapter: async ({ questions: [current] }) => [0, 1].map((ordinal) => ({ url: `https://evidence.test/${current!.feeRowRef}/${ordinal}`, title: `Official guide ${ordinal}`, publisher: "Fiserv" })),
        fetchImpl: async (url) => htmlResponse(`Fiserv official ${url} explains ${firstRow.selectedLabel} and ${secondRow.selectedLabel} for 2026.`),
        semanticSupportAdapter: async ({ structuredClaim }) => ({
          type: "fee_knowledge_semantic_support_decision",
          policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
          decision: "supports",
          structuredClaim,
          reasonCodes: ["synthetic_semantic_support"],
          providerDetailsStripped: true,
        }),
      },
    });

    expect(result.attempts).toHaveLength(2);
    expect(result.candidates).toHaveLength(4);
    expect(new Set(result.attempts.map((attempt) => attempt.questionRef))).toEqual(new Set(questions.map((item, index) => feeKnowledgeQuestionRef(item, index))));
    expect(result.candidates.every((candidate) => {
      const parent = result.attempts.find((attempt) => attempt.attemptId === candidate.attemptId);
      return parent?.questionRef === candidate.questionRef && parent.feeRowRef === candidate.feeRowRef && parent.candidateIds.includes(candidate.candidateId);
    })).toBe(true);
    expect(result.claimSupports).toHaveLength(4);
    expect(result.candidates.every((candidate) => {
      const support = result.claimSupports.find((item) => item.candidateId === candidate.candidateId);
      return Boolean(support) && candidate.claimSupportDecisionRef === calculateRuntimeClaimSupportDecisionRef({ support: support!, candidate });
    })).toBe(true);
    for (const candidate of result.candidates) {
      const support = result.claimSupports.find((item) => item.candidateId === candidate.candidateId)!;
      const decision = buildRuntimeClaimSupportDecisionPayload({ support, candidate });
      expect(decision.reasonCodes).toEqual([`fee_knowledge_${support.evidenceDecision}`]);
      expect(calculateRuntimeClaimSupportDecisionRef({ support, candidate })).toBe(candidate.claimSupportDecisionRef);
      expect(calculateRuntimeClaimSupportDecisionRef({ support: structuredClone(support), candidate: structuredClone(candidate) }))
        .toBe(candidate.claimSupportDecisionRef);
    }
    const classificationSupport = result.claimSupports[0]!;
    const classificationCandidate = result.candidates.find((candidate) => candidate.candidateId === classificationSupport.candidateId)!;
    const ruleSupport = structuredClone(classificationSupport);
    ruleSupport.evidenceDecision = "verified_rule";
    ruleSupport.structuredClaim = { ...ruleSupport.structuredClaim, claimKind: "published_rule", applicationBasis: "not_evaluated" };
    ruleSupport.semanticSupport = { ...ruleSupport.semanticSupport, structuredClaim: ruleSupport.structuredClaim };
    const firstRuleRef = calculateRuntimeClaimSupportDecisionRef({ support: ruleSupport, candidate: classificationCandidate });
    expect(calculateRuntimeClaimSupportDecisionRef({ support: structuredClone(ruleSupport), candidate: structuredClone(classificationCandidate) }))
      .toBe(firstRuleRef);
    expect(buildRuntimeClaimSupportDecisionPayload({ support: ruleSupport, candidate: classificationCandidate }).reasonCodes)
      .toEqual(["fee_knowledge_verified_rule"]);
    const packet = buildFeeKnowledgeSourcePacket({ analysis: currentAnalysis, registry: null, runtimeClaimSupports: result.claimSupports, researchAttempts: result.attempts, researchCandidates: result.candidates });
    expect(validateResearchLinkage(packet)).toEqual([]);
  });

  it("fails closed without orphaning candidate decisions when runtime support linkage is incomplete", async () => {
    const currentAnalysis = await analysisWithCanonicalFeeRows();
    const [firstRow] = currentAnalysis.feeLedger.rows;
    if (!firstRow) throw new Error("expected canonical fee row");
    const current = question(firstRow.id, firstRow.selectedLabel);
    const result = await runFeeKnowledgeResearch({
      analysis: currentAnalysis,
      questions: [current],
      options: {
        enabled: true,
        timeoutMs: 1000,
        domainIdentityPolicy: domainPolicy(),
        resolveHost: async () => ["93.184.216.34"],
        adapter: async () => [{ url: "https://evidence.test/orphan-linkage", title: "Official guide", publisher: "Fiserv" }],
        fetchImpl: async () => htmlResponse(`Fiserv official guide explains ${firstRow.selectedLabel} for 2026.`),
        semanticSupportAdapter: async ({ structuredClaim }) => ({
          type: "fee_knowledge_semantic_support_decision",
          policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
          decision: "supports",
          structuredClaim,
          reasonCodes: ["synthetic_semantic_support"],
          providerDetailsStripped: true,
        }),
      },
    });
    expect(result.candidates[0]?.claimSupportDecisionRef).toMatch(/^claim_support_decision_/);
    expect(result.claimSupports).toHaveLength(1);

    const packet = buildFeeKnowledgeSourcePacket({
      analysis: currentAnalysis,
      registry: null,
      runtimeClaimSupports: [],
      researchAttempts: result.attempts,
      researchCandidates: result.candidates,
    });

    expect(packet.registryValidation).toMatchObject({
      status: "invalid",
      reasonCodes: ["fee_knowledge_runtime_linkage_invalid"],
    });
    expect(packet.claimSupports).toEqual([]);
    expect(packet.researchCandidates).toHaveLength(1);
    expect(packet.researchCandidates[0]!.claimSupportDecisionRef).toBeNull();
    expect(packet.researchCandidates[0]!.reasonCodes).toContain("fee_knowledge_runtime_linkage_invalid");
    expect(validateResearchLinkage(packet)).toEqual([]);
  });

  it("preserves completed records when a later question times out", async () => {
    const questions = [question("feerow_aaaaaaaaaaaaaaaaaaaaaaaa", "Alpha Fee"), question("feerow_bbbbbbbbbbbbbbbbbbbbbbbb", "Beta Fee")];
    let searches = 0;
    const result = await runFeeKnowledgeResearch({
      analysis: analysis(),
      questions,
      options: {
        enabled: true,
        timeoutMs: 35,
        domainIdentityPolicy: domainPolicy(),
        resolveHost: async () => ["93.184.216.34"],
        adapter: async ({ questions: [current] }) => {
          searches += 1;
          if (searches === 2) await new Promise((resolve) => setTimeout(resolve, 80));
          return [{ url: `https://evidence.test/${current!.feeRowRef}`, title: "Official guide", publisher: "Fiserv" }];
        },
        fetchImpl: async () => htmlResponse("Fiserv official guide explains Alpha Fee and Beta Fee for 2026."),
        semanticSupportAdapter: async ({ structuredClaim }) => ({
          type: "fee_knowledge_semantic_support_decision",
          policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
          decision: "supports",
          structuredClaim,
          reasonCodes: ["synthetic_semantic_support"],
          providerDetailsStripped: true,
        }),
      },
    });

    expect(result.attempts.some((attempt) => attempt.status === "completed")).toBe(true);
    expect(result.attempts.some((attempt) => attempt.status === "timed_out")).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.claimSupports).toHaveLength(1);
  });

  it("uses a distinct safe state for malformed semantic JSON", async () => {
    const current = question("feerow_aaaaaaaaaaaaaaaaaaaaaaaa", "Alpha Fee");
    const retrieved = await retrieveFeeKnowledgeDocument("https://evidence.test/alpha", {
      abortSignal: new AbortController().signal,
      resolveHost: async () => ["93.184.216.34"],
      fetchImpl: async () => htmlResponse("Fiserv official guide explains Alpha Fee for 2026."),
    });
    const semantic = openAiSemanticSupportAdapter({
      apiKey: "synthetic_test_key",
      fetchImpl: async () => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "not-json" }] }] }), { status: 200, headers: { "content-type": "application/json" } }),
    });
    const result = await verifyCandidate({ candidateId: "candidate_aaaaaaaaaaaaaaaa", attemptId: "research_aaaaaaaaaaaaaaaa", candidate: { url: "https://evidence.test/alpha", title: "Official guide", publisher: "Fiserv" }, retrieved, question: current, questionOrdinal: 0, domainIdentityPolicy: domainPolicy(), semanticSupportAdapter: semantic });

    expect(result.candidate.semanticVerificationStatus).toBe("parse_failed");
    expect(result.candidate.reasonCodes).toContain("fee_knowledge_semantic_parse_failed");
    expect(result.candidate.claimSupportDecisionRef).toBeNull();
    expect(result.claimSupport).toBeNull();
  });

  it("requests strict structured output for semantic verification", async () => {
    const bodies: unknown[] = [];
    const current = question("feerow_aaaaaaaaaaaaaaaaaaaaaaaa", "Alpha Fee");
    const adapter = openAiSemanticSupportAdapter({
      apiKey: "synthetic_test_key",
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({
          id: "resp_test_semantic_schema",
          output: [{
            type: "message",
            content: [{
              type: "output_text",
              text: JSON.stringify({ decision: "unsupported", reasonCodes: ["synthetic_semantic_unsupported"] }),
            }],
          }],
          usage: { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 0 } },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    await adapter({
      structuredClaim: {
        claimKind: "classification",
        feeLabel: current.feeLabel,
        processorOrNetwork: current.processorOrNetwork,
        statementPeriodYear: current.statementPeriodYear,
        proposedCategory: current.deterministicCategory,
        likelyEconomicOwner: current.deterministicEconomicOwner,
        likelyContractualController: current.deterministicContractualController,
        conditions: [],
        exclusions: [],
        maximumConfidence: current.deterministicConfidence,
        actionabilityCeiling: current.deterministicActionabilityCeiling,
        ruleValue: null,
        applicationBasis: "not_evaluated",
      },
      documentFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      locatorTextHash: "locator_hash",
      boundedEvidenceExcerpt: "Fiserv official guide discusses Alpha Fee.",
      applicability: { processorOrNetwork: true, jurisdiction: null, transactionContext: null, statementPeriod: true },
    }, { abortSignal: new AbortController().signal });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      text: {
        format: {
          type: "json_schema",
          name: "fee_knowledge_semantic_support_decision",
          strict: true,
        },
      },
    });
    const required = (bodies[0] as { text: { format: { schema: { required: string[] } } } }).text.format.schema.required;
    expect(required).toEqual(["decision", "reasonCodes"]);
  });

  it("marks invalid registries with a stable registry failure code", () => {
    const packet = buildFeeKnowledgeSourcePacket({ analysis: analysis(), registry: { registrySchemaVersion: "fee_knowledge_registry_v1", registryVersion: "../invalid", policyVersion: "fee_knowledge_policy_v1", sources: [] } });
    expect(packet.registryValidation).toEqual({ status: "invalid", reasonCodes: ["fee_knowledge_registry_invalid"] });
    expect(packet.claimSupports).toEqual([]);
  });

  it("distinguishes successful unsupported semantics from provider-unavailable and HTTP-failure results", async () => {
    const current = question("feerow_aaaaaaaaaaaaaaaaaaaaaaaa", "Alpha Fee");
    const retrieved = await retrieveFeeKnowledgeDocument("https://evidence.test/alpha", {
      abortSignal: new AbortController().signal,
      resolveHost: async () => ["93.184.216.34"],
      fetchImpl: async () => htmlResponse("Fiserv official guide explains Alpha Fee for 2026."),
    });
    const base = {
      candidateId: "candidate_provider_state",
      attemptId: "research_provider_state",
      candidate: { url: "https://evidence.test/alpha", title: "Official guide", publisher: "Fiserv" },
      retrieved,
      question: current,
      questionOrdinal: 0,
      domainIdentityPolicy: domainPolicy(),
    };
    const successfulUnsupported = await verifyCandidate({
      ...base,
      semanticSupport: {
        type: "fee_knowledge_semantic_support_decision",
        policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
        decision: "unsupported",
        structuredClaim: {
          claimKind: "classification",
          feeLabel: "Alpha Fee",
          processorOrNetwork: "Fiserv",
          statementPeriodYear: "2026",
          proposedCategory: "processor_markup",
          likelyEconomicOwner: "processor",
          likelyContractualController: "merchant_contract",
          conditions: [],
          exclusions: [],
          maximumConfidence: "medium",
          actionabilityCeiling: "verify_only",
          ruleValue: null,
          applicationBasis: "not_evaluated",
        },
        reasonCodes: ["synthetic_semantic_unsupported"],
        providerDetailsStripped: true,
      },
    });
    const unavailable = await verifyCandidate({
      ...base,
      candidateId: "candidate_provider_unavailable",
      semanticSupportAdapter: openAiSemanticSupportAdapter({ apiKey: "" }),
    });
    const httpFailure = () => verifyCandidate({
      ...base,
      candidateId: "candidate_provider_http_failure",
      semanticSupportAdapter: openAiSemanticSupportAdapter({
        apiKey: "synthetic_test_key",
        fetchImpl: async () => new Response("{}", { status: 503, headers: { "content-type": "application/json" } }),
      }),
    });

    expect(successfulUnsupported.candidate.semanticVerificationStatus).toBe("completed");
    expect(successfulUnsupported.claimSupport).toMatchObject({ evidenceDecision: "unsupported" });
    expect(unavailable.candidate.semanticVerificationStatus).toBe("failed");
    expect(unavailable.candidate.reasonCodes).toContain("fee_knowledge_semantic_failed");
    expect(unavailable.candidate.claimSupportDecisionRef).toBeNull();
    expect(unavailable.claimSupport).toBeNull();
    await expect(httpFailure()).rejects.toMatchObject({
      reasonCode: "provider_server_error",
      reasonCodes: ["provider_http_status_503", "provider_http_status_class_5xx", "provider_server_error"],
    });
  });

  it("preserves unsupported-model and discovery safety-block statuses exactly", async () => {
    for (const status of ["unsupported_model", "safety_blocked"] as const) {
      const result = await runFeeKnowledgeResearch({
        analysis: analysis(),
        questions: [question("feerow_aaaaaaaaaaaaaaaaaaaaaaaa", "Alpha Fee")],
        options: {
          enabled: true,
          timeoutMs: 100,
          adapter: async () => { throw new FeeKnowledgeSearchProviderError(status, "synthetic provider state"); },
        },
      });
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0]).toMatchObject({
        status,
        reasonCodes: [status === "unsupported_model" ? "fee_knowledge_web_search_model_unsupported" : "fee_knowledge_research_safety_blocked"],
      });
      expect(result.candidates).toEqual([]);
      expect(result.claimSupports).toEqual([]);
    }
  });

  it("preserves encrypted PDF retrieval as encrypted rather than malformed", async () => {
    const result = await retrieveFeeKnowledgeDocument("https://evidence.test/encrypted.pdf", {
      abortSignal: new AbortController().signal,
      resolveHost: async () => ["93.184.216.34"],
      fetchImpl: async () => new Response(new Uint8Array([37, 80, 68, 70]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
      pdfParserForTesting: async () => {
        throw new Error("PasswordException: encrypted PDF requires a password");
      },
    });

    expect(result).toMatchObject({
      status: "encrypted",
      reasonCodes: ["fee_knowledge_pdf_encrypted"],
    });
  });

  it("returns an immutable linked timeout snapshot even when semantic work ignores abort", async () => {
    const questions = [
      question("feerow_aaaaaaaaaaaaaaaaaaaaaaaa", "Alpha Fee"),
      question("feerow_bbbbbbbbbbbbbbbbbbbbbbbb", "Beta Fee"),
      question("feerow_aaaaaaaaaaaaaaaaaaaaaaaa", "Gamma Fee"),
    ];
    const result = await runFeeKnowledgeResearch({
      analysis: analysis(),
      questions,
      options: {
        enabled: true,
        timeoutMs: 20,
        domainIdentityPolicy: domainPolicy(),
        resolveHost: async () => ["93.184.216.34"],
        adapter: async ({ questions: [current] }) => [{ url: `https://evidence.test/${current!.feeRowRef}`, title: "Official guide", publisher: "Fiserv" }],
        fetchImpl: async () => htmlResponse("Fiserv official guide explains Alpha Fee, Beta Fee, and Gamma Fee for 2026."),
        semanticSupportAdapter: async ({ structuredClaim }) => {
          await new Promise((resolve) => setTimeout(resolve, 80));
          return {
            type: "fee_knowledge_semantic_support_decision",
            policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
            decision: "supports",
            structuredClaim,
            reasonCodes: ["synthetic_late_semantic_support"],
            providerDetailsStripped: true,
          };
        },
      },
    });
    const immediateJson = JSON.stringify(result);
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(JSON.stringify(result)).toBe(immediateJson);
    expect(result.attempts.map((attempt) => attempt.status)).toEqual(["timed_out", "timed_out", "timed_out"]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ retrievalStatus: "retrieved_text", semanticVerificationStatus: "timed_out" });
    const packet = buildFeeKnowledgeSourcePacket({
      analysis: analysis(),
      registry: null,
      runtimeClaimSupports: result.claimSupports,
      researchAttempts: result.attempts,
      researchCandidates: result.candidates,
    });
    expect(validateResearchLinkage(packet)).toEqual([]);
  });
});

function question(feeRowRef: string, feeLabel: string): FeeKnowledgeResearchQuestion {
  return {
    feeRowRef,
    sanitizedQuestionCategory: "classification",
    triggerReason: "material_unfamiliar_label",
    processorOrNetwork: "Fiserv",
    feeLabel,
    statementSection: "individual_charge",
    statementPeriodYear: "2026",
    deterministicCategory: "processor_markup",
    deterministicEconomicOwner: "processor",
    deterministicContractualController: "merchant_contract",
    deterministicActionabilityCeiling: "verify_only",
    deterministicConfidence: "medium",
    semanticQuestion: "Find official documentation explaining this fee classification.",
  };
}

function analysis() {
  return buildCanonicalStatementFactsFromParsedDocument(document(), { businessType: "restaurant_food_beverage", sourceAnalysisId: "package_5b_research_fixture", sourceFileName: null });
}

async function analysisWithCanonicalFeeRows() {
  const bytes = await readFile(path.resolve(process.cwd(), "test/fixtures/pdfs/Nov_2024_Statement.pdf"));
  const parsed = await parsePdfBytes(bytes);
  return buildCanonicalRuntimeAnalysis({
    document: parsed,
    businessType: "restaurant_food_beverage",
    runtimeDocumentRef: "package_5b_research_graph_fixture",
    legacySummary: analyzeStatementDocument(parsed, "restaurant_food_beverage"),
  }).analysis;
}

function document(): ParsedDocument {
  return { sourceType: "pdf", headers: [], rows: [{ content: "SYNTHETIC FISERV STATEMENT", page: "page-1" }], textPreview: "SYNTHETIC FISERV STATEMENT", extraction: { mode: "structured", qualityScore: 0.99, warnings: [], pageCount: 1 } };
}

function domainPolicy(): FeeKnowledgeDomainIdentityPolicy {
  return { policyVersion: FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION, reviewedPublisherDomains: [{ publisherId: "fiserv_synthetic", aliases: ["fiserv"], officialDomains: ["evidence.test"] }], identityEvidence: [] };
}

function htmlResponse(body: string): Response {
  return new Response(`<html><body><p>${body}</p></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
}
