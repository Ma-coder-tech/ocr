import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalRuntimeAnalysisWithRuntimeAi } from "../../src/canonical/runtimeAdapter.js";
import { calculateRuntimeClaimSupportDecisionRef } from "../../src/canonical/feeKnowledgeClaimSupportDecision.js";
import { buildSingleStatementReportV1 } from "../../src/reporting/v1/index.js";
import { analyzeDocument } from "../../src/analyzer.js";
import {
  buildFeeKnowledgeSourcePacket,
  validateFeeKnowledgeRegistry,
  type LegacyWholeStatementSourceRegistry,
} from "../../src/canonical/feeKnowledgeRegistry.js";
import {
  defaultFeeKnowledgeResearchQuestions,
  extractDiscoveryCandidates,
  openAiWebSearchAdapter,
  runFeeKnowledgeResearch,
  verifyCandidate,
  type FeeKnowledgeDiscoveryCandidate,
} from "../../src/canonical/feeKnowledgeResearch.js";
import { retrieveFeeKnowledgeDocument, validateClaimCitation } from "../../src/canonical/feeKnowledgeRetrieval.js";
import {
  WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
  buildWholeStatementFeeIntelligencePacket,
  validateWholeStatementFeeIntelligenceReview,
  type CanonicalWholeStatementFeeIntelligencePacket,
} from "../../src/canonical/wholeStatementFeeIntelligenceReview.js";
import {
  FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
  FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
  type ApprovedFeeKnowledgeSourceRegistry,
  type FeeKnowledgeClaimSupportRecord,
  type FeeKnowledgeDomainIdentityPolicy,
  type FeeKnowledgeSemanticSupportDecision,
  type FeeKnowledgeStructuredClaim,
} from "../../src/canonical/feeKnowledgeTypes.js";
import type { CanonicalFeeRow, CanonicalStatementAnalysis, MoneyAmount } from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical fee knowledge and provenance", () => {
  it("validates versioned registry lifecycle, supersession, URL safety, duplicate IDs, and stable source packets", () => {
    const active = reviewedRegistry();
    const expired = reviewedRegistry({ sourceId: "source_expired", claimId: "claim_expired", lifecycle: "expired", effectiveThrough: "2026-01-15" });
    const revoked = reviewedRegistry({ sourceId: "source_revoked", claimId: "claim_revoked", lifecycle: "revoked" });
    const contradicted = reviewedRegistry({ sourceId: "source_contradicted", claimId: "claim_contradicted", lifecycle: "contradicted" });
    const unsafe = reviewedRegistry({ sourceId: "source_unsafe", claimId: "claim_unsafe", canonicalUrl: "http://127.0.0.1/private" });
    const duplicate = { ...active, sources: [active.sources[0]!, active.sources[0]!] };

    expect(validateFeeKnowledgeRegistry(active).ok).toBe(true);
    expect(validateFeeKnowledgeRegistry(expired).ok).toBe(true);
    expect(validateFeeKnowledgeRegistry(revoked).ok).toBe(true);
    expect(validateFeeKnowledgeRegistry(contradicted).ok).toBe(true);
    expect(validateFeeKnowledgeRegistry(unsafe).errors).toContain("fee_knowledge_source_url_invalid:source_unsafe");
    expect(validateFeeKnowledgeRegistry(duplicate).errors).toContain("fee_knowledge_source_duplicate:source_alpha");

    const analysis = syntheticAnalysis();
    const first = buildFeeKnowledgeSourcePacket({ analysis, registry: active });
    const shuffled = buildFeeKnowledgeSourcePacket({ analysis, registry: { ...active, sources: [...active.sources].reverse() } });
    expect(first).toEqual(shuffled);
    expect(first.policyVersion).toBe("fee_knowledge_source_packet_v1");
    expect(first.rowPackets.find((row) => row.feeRowRef === firstFeeRow(analysis))?.applicableApprovedClaimSupportRefs.length).toBeGreaterThan(0);
    expect(first.customerSafeSources[0]).toMatchObject({
      title: "Synthetic Official Fee Guide",
      publisher: "Synthetic Processor",
      displayable: true,
    });
  });

  it("matches exact processor claims before broad claims and preserves inapplicable or contradicted outcomes", () => {
    const analysis = syntheticAnalysis();
    const registry = reviewedRegistryWithBroadAndContradiction();
    const packet = buildFeeKnowledgeSourcePacket({ analysis, registry });
    const row = packet.rowPackets.find((item) => item.feeRowRef === firstFeeRow(analysis))!;

    expect(packet.sourceMatches.map((match) => [match.sourceId, match.matchBasis, match.lifecycle])).toContainEqual([
      "source_exact",
      "exact_processor_or_network",
      "active",
    ]);
    expect(packet.sourceMatches.map((match) => [match.sourceId, match.matchBasis])).toContainEqual([
      "source_broad",
      "broader_official",
    ]);
    expect(row.permittedProvenanceChoices[0]?.sourceId).toBe("source_exact");
    expect(row.contradictionRefs.length).toBeGreaterThan(0);
  });

  it("enforces H1.4b row-scoped documentation authority and rejects unverified candidates", () => {
    const analysis = syntheticAnalysis();
    const registry = reviewedRegistry();
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, registry);
    const supportRef = packet.sourceProvenancePacket.rowPackets.find((row) => row.feeRowRef === firstFeeRow(analysis))!.applicableApprovedClaimSupportRefs[0]!;
    const sourceId = packet.sourceProvenancePacket.claimSupports.find((support) => support.claimSupportId === supportRef)!.sourceId;
    const accepted = validateWholeStatementFeeIntelligenceReview(
      review(packet, {
        [firstFeeRow(analysis)]: {
          evidenceProvenance: "approved_external_documentation",
          externalSourceRef: sourceId,
          externalClaimSupportRef: supportRef,
        },
      }),
      analysis,
      registry,
    );
    const fabricated = validateWholeStatementFeeIntelligenceReview(
      review(packet, {
        [firstFeeRow(analysis)]: {
          evidenceProvenance: "approved_external_documentation",
          externalSourceRef: "invented_source",
          externalClaimSupportRef: "invented_support",
        },
      }),
      analysis,
      registry,
    );

    expect(accepted.ok).toBe(true);
	    expect(accepted.output.acceptanceRecords.find((record) => record.feeRowRef === firstFeeRow(analysis))?.status).toBe("accepted_with_conditions");
    expect(fabricated.ok).toBe(true);
    expect(fabricated.output.acceptanceRecords.find((record) => record.feeRowRef === firstFeeRow(analysis))?.status).toBe("rejected");
    expect(fabricated.output.acceptanceRecords.find((record) => record.feeRowRef === firstFeeRow(analysis))?.acceptedSemanticFields.category).toBeNull();
  });

  it("allows runtime-verified documentation only after independent retrieval, fingerprinting, locator, and citation checks", async () => {
    const analysis = syntheticAnalysis();
    const question = {
      feeRowRef: firstFeeRow(analysis),
      sanitizedQuestionCategory: "classification" as const,
      triggerReason: "material_unfamiliar_label" as const,
      processorOrNetwork: "Synthetic Processor",
      feeLabel: "Monthly Service Fee",
	      statementSection: "individual_charge",
	      statementPeriodYear: "2026",
	      deterministicCategory: "network_access_or_authorization" as const,
	      semanticQuestion: "Find official documentation explaining the synthetic access fee.",
	    };
    const document = await retrieveFeeKnowledgeDocument("https://syntheticprocessor.test/fees", {
	      abortSignal: new AbortController().signal,
	      fetchImpl: async () => htmlResponse("Synthetic Processor official guide explains the Monthly Service Fee for 2026 card processing."),
	      resolveHost: async () => ["93.184.216.34"],
	    });
	    const verification = await verifyCandidate({
	      candidateId: "candidate_alpha",
	      attemptId: "research_alpha",
	      candidate: { url: "https://syntheticprocessor.test/fees", title: "Synthetic Guide", publisher: "Synthetic Processor" },
	      retrieved: document,
	      question,
	      domainIdentityPolicy: syntheticDomainPolicy(),
	      semanticSupport: semanticDecision("supports", {
	        claimKind: "classification",
	        feeLabel: "Monthly Service Fee",
	        processorOrNetwork: "Synthetic Processor",
	        statementPeriodYear: "2026",
	        proposedCategory: "network_access_or_authorization",
	        likelyEconomicOwner: "processor",
	        likelyContractualController: "merchant_contract",
	        conditions: [],
	        exclusions: [],
	        maximumConfidence: "high",
	        actionabilityCeiling: "verify_only",
	        ruleValue: null,
	        applicationBasis: "not_evaluated",
	      }),
	    });
    const sourcePacket = buildFeeKnowledgeSourcePacket({
      analysis,
      registry: reviewedRegistry({ sourceId: "source_no_match", claimId: "claim_no_match", label: "Other Fee" }),
      runtimeClaimSupports: [verification.claimSupport!],
      researchCandidates: [verification.candidate],
    });
    const h1Packet = buildWholeStatementFeeIntelligencePacket(analysis, reviewedRegistry(), sourcePacket);
    const runtimeSupportRef = sourcePacket.rowPackets.find((row) => row.feeRowRef === firstFeeRow(analysis))!.runtimeVerifiedClaimSupportRefs[0]!;
    const result = validateWholeStatementFeeIntelligenceReview(
      review(h1Packet, {
        [firstFeeRow(analysis)]: {
          evidenceProvenance: "runtime_verified_documentation",
          externalSourceRef: verification.claimSupport!.sourceId,
          externalClaimSupportRef: runtimeSupportRef,
        },
      }),
      analysis,
      reviewedRegistry(),
      sourcePacket,
    );

    expect(document.status).toBe("retrieved_text");
    expect(document.documentFingerprint).toMatch(/^sha256:/);
    expect(verification.candidate.verificationStatus).toBe("runtime_verified_documentation");
    expect(verification.claimSupport).toMatchObject({ citationExists: true, evidenceDecision: "verified_classification" });
	    expect(result.ok).toBe(true);
	    expect(result.output.acceptanceRecords.find((record) => record.feeRowRef === firstFeeRow(analysis))?.externalClaimSupportRef).toBe(runtimeSupportRef);
	  });

	  it("reconciles H1.4b semantics against runtime-verified claim support before accepting trusted fields", async () => {
	    const matching = await runtimeEvidenceReview({
	      interpretation: {
	        proposedCategory: "card_brand_network_assessment",
	        likelyEconomicOwner: "network",
	        likelyContractualController: "merchant_contract",
	        proposedActionabilityCeiling: "verify_only",
	      },
	    });
	    const removableMarkup = await runtimeEvidenceReview({
	      interpretation: {
	        proposedCategory: "processor_markup",
	        likelyEconomicOwner: "processor",
	        likelyContractualController: "merchant_contract",
	        proposedActionabilityCeiling: "potentially_actionable",
	        conflicts: [],
	        recommendedDisposition: "supported",
	      },
	    });
	    const ownerMismatch = await runtimeEvidenceReview({
	      interpretation: {
	        proposedCategory: "card_brand_network_assessment",
	        likelyEconomicOwner: "processor",
	        likelyContractualController: "merchant_contract",
	      },
	    });
	    const actionabilityTooStrong = await runtimeEvidenceReview({
	      interpretation: {
	        proposedCategory: "card_brand_network_assessment",
	        likelyEconomicOwner: "network",
	        likelyContractualController: "merchant_contract",
	        proposedActionabilityCeiling: "potentially_actionable",
	      },
	    });
	    const withConditions = await runtimeEvidenceReview({
	      support: { conditions: ["Applies only under cited network assessment conditions."] },
	      interpretation: {
	        proposedCategory: "card_brand_network_assessment",
	        likelyEconomicOwner: "network",
	        likelyContractualController: "merchant_contract",
	        proposedActionabilityCeiling: "verify_only",
	      },
	    });
	    const withExclusion = await runtimeEvidenceReview({
	      support: { exclusions: ["Excludes this statement context."] },
	      interpretation: {
	        proposedCategory: "card_brand_network_assessment",
	        likelyEconomicOwner: "network",
	        likelyContractualController: "merchant_contract",
	      },
	    });

	    expect(matching.status).toBe("accepted");
	    expect(matching.record.acceptedSemanticFields).toMatchObject({ category: "card_brand_network_assessment", likelyEconomicOwner: "network", actionabilityCeiling: "verify_only" });
	    expect(removableMarkup.status).toBe("rejected");
	    expect(removableMarkup.record.acceptedSemanticFields.category).toBeNull();
	    expect(ownerMismatch.status).toBe("rejected");
	    expect(actionabilityTooStrong.status).toBe("needs_verification");
	    expect(actionabilityTooStrong.record.acceptedSemanticFields.category).toBeNull();
	    expect(withConditions.status).toBe("accepted_with_conditions");
	    expect(withExclusion.status).toBe("needs_verification");
	    expect(withExclusion.record.acceptedSemanticFields.category).toBeNull();
	  });

	  it("does not let text similarity or failed semantic gates create trusted runtime documentation", async () => {
	    const analysis = syntheticAnalysis();
	    const unsupported = await verificationOutcome(analysis, { decision: "does_not_support" });
	    const noSemantic = await verifyCandidate({
	      candidateId: "candidate_no_semantic",
	      attemptId: "research_no_semantic",
	      candidate: { url: "https://syntheticprocessor.test/fees", title: "Synthetic Guide", publisher: "Synthetic Processor" },
	      retrieved: await retrieveFeeKnowledgeDocument("https://syntheticprocessor.test/fees", {
	        abortSignal: new AbortController().signal,
	        fetchImpl: async () => htmlResponse("Synthetic Processor official guide repeats Monthly Service Fee Monthly Service Fee for 2026."),
	        resolveHost: async () => ["93.184.216.34"],
	      }),
	      question: questionFor(analysis),
	      domainIdentityPolicy: syntheticDomainPolicy(),
	    });
	    const inapplicable = await verificationOutcome(analysis, { decision: "supports", processorOrNetwork: "Other Processor" });
	    const missingCitation = await verifyCandidate({
	      candidateId: "candidate_missing_citation",
	      attemptId: "research_missing_citation",
	      candidate: { url: "https://syntheticprocessor.test/fees", title: "Synthetic Guide", publisher: "Synthetic Processor" },
	      retrieved: await retrieveFeeKnowledgeDocument("https://syntheticprocessor.test/fees", {
	        abortSignal: new AbortController().signal,
	        fetchImpl: async () => htmlResponse("Synthetic Processor official guide discusses a different fee for 2026."),
	        resolveHost: async () => ["93.184.216.34"],
	      }),
	      question: questionFor(analysis),
	      domainIdentityPolicy: syntheticDomainPolicy(),
	      semanticSupport: semanticDecision("supports", structuredClaimForTest(questionFor(analysis))),
	    });

	    expect(unsupported.candidate.verificationStatus).not.toBe("runtime_verified_documentation");
	    expect(noSemantic.candidate.verificationStatus).not.toBe("runtime_verified_documentation");
	    expect(inapplicable.candidate.verificationStatus).not.toBe("runtime_verified_documentation");
	    expect(missingCitation.claimSupport).toBeNull();
	    expect(missingCitation.candidate.verificationStatus).toBe("provisional");
	  });

  it("keeps OpenAI web-search discovery bounded, sanitized, cancellable, and provider-neutral", async () => {
    const requests: Array<{ url: string; body: string; signal: AbortSignal }> = [];
    const adapter = openAiWebSearchAdapter({
	      apiKey: "test-key",
	      modelName: "gpt-5",
	      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), body: String(init?.body), signal: init?.signal as AbortSignal });
        return jsonResponse({
	          output: [
	            {
	              type: "web_search_call",
	              action: {
	                type: "search",
	                sources: [
	                  { type: "url", url: "https://syntheticprocessor.test/fees", title: "Synthetic Official Fee Guide" },
	                  { type: "url", url: "http://127.0.0.1/private", title: "Unsafe" },
	                ],
	              },
	            },
	            {
	              type: "message",
	              content: [
	                {
	                  type: "output_text",
	                  text: "Found sources.",
	                  annotations: [
	                    { type: "url_citation", url: "https://syntheticprocessor.test/fees", title: "Duplicate" },
	                    { type: "url_citation", url: "https://syntheticprocessor.test/rules", title: "Synthetic Rule" },
	                  ],
	                },
	              ],
	            },
	          ],
	        });
      },
    });
    const candidates = await adapter(
      {
        attemptId: "research_test",
        limits: {
          policyVersion: "fee_knowledge_research_policy_v1",
          maxSearchCalls: 2,
          maxRetrievalCandidates: 5,
          totalDeadlineMs: 15000,
          maxResultCandidatesPerSearch: 5,
        },
        questions: [
          {
            feeRowRef: "feerow_alpha",
            sanitizedQuestionCategory: "classification",
            triggerReason: "material_unfamiliar_label",
            processorOrNetwork: "Synthetic Processor",
            feeLabel: "Monthly Service Fee",
	            statementSection: "individual_charge",
	            statementPeriodYear: "2026",
	            deterministicCategory: "network_access_or_authorization",
	            semanticQuestion: "Find official documentation.",
	          },
        ],
      },
      { abortSignal: new AbortController().signal },
    );

    expect(requests[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(requests[0]?.body).toContain('"web_search"');
    expect(requests[0]?.body).not.toMatch(/merchant|account|\$|statement\.pdf|raw/i);
	    expect(candidates).toEqual([
	      { url: "https://syntheticprocessor.test/fees", title: "Synthetic Official Fee Guide", publisher: null },
	      { url: "https://syntheticprocessor.test/rules", title: "Synthetic Rule", publisher: null },
	    ]);
	    expect(JSON.stringify(candidates)).not.toMatch(/test-key|gpt-5|openai/i);
  });

	  it("records disabled research, failed retrieval, unsafe URL, text-unavailable PDF, and no-source outcomes without canonical proof", async () => {
    const analysis = syntheticAnalysis();
    const disabled = await runFeeKnowledgeResearch({
      analysis,
      questions: [
        {
          feeRowRef: firstFeeRow(analysis),
          sanitizedQuestionCategory: "classification",
          triggerReason: "material_unfamiliar_label",
          processorOrNetwork: "Synthetic Processor",
          feeLabel: "Monthly Service Fee",
	          statementSection: "individual_charge",
	          statementPeriodYear: "2026",
	          deterministicCategory: "network_access_or_authorization",
	          semanticQuestion: "Find official documentation.",
	        },
      ],
      options: { enabled: false },
    });
    const unsafe = await retrieveFeeKnowledgeDocument("https://127.0.0.1/private", {
      abortSignal: new AbortController().signal,
      resolveHost: async () => ["127.0.0.1"],
    });
    const emptyPdf = await retrieveFeeKnowledgeDocument("https://syntheticprocessor.test/file.pdf", {
	      abortSignal: new AbortController().signal,
	      fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "application/pdf" } }),
	      resolveHost: async () => ["93.184.216.34"],
	    });
	    const extracted = extractDiscoveryCandidates({ url: "ftp://unsafe.test/file", nested: [{ url: "https://safe.synthetic.test/doc" }] });

    expect(disabled.attempts[0]?.status).toBe("disabled");
    expect(unsafe.status).toBe("safety_blocked");
    expect(emptyPdf.status === "retrieval_succeeded_text_unavailable" || emptyPdf.status === "malformed").toBe(true);
	    expect(extracted).toEqual([]);
	  });

	  it("parses only documented OpenAI web-search result shapes and surfaces provider/model errors safely", async () => {
	    const documented = extractDiscoveryCandidates({
	      output: [
	        {
	          type: "web_search_call",
	          action: {
	            type: "search",
	            sources: [
	              { type: "url", url: "https://syntheticprocessor.test/fees", title: "A" },
	              { type: "url", url: "https://syntheticprocessor.test/fees", title: "Duplicate" },
	              { type: "url", url: "http://127.0.0.1/private", title: "Unsafe" },
	            ],
	          },
	        },
	        {
	          type: "message",
	          content: [
	            {
	              type: "output_text",
	              text: "Citation",
	              annotations: [{ type: "url_citation", url: "https://syntheticprocessor.test/rules", title: "Rule" }],
	            },
	          ],
	        },
	      ],
	      arbitrary: { url: "https://syntheticprocessor.test/arbitrary" },
	    });
	    expect(documented.map((candidate) => candidate.url)).toEqual([
	      "https://syntheticprocessor.test/fees",
	      "https://syntheticprocessor.test/rules",
	    ]);
	    expect(extractDiscoveryCandidates({ output: [{ type: "message", content: [{ type: "output_text", annotations: [] }] }] })).toEqual([]);

	    const request = {
	      attemptId: "research_error",
	      limits: {
	        policyVersion: "fee_knowledge_research_policy_v1" as const,
	        maxSearchCalls: 2,
	        maxRetrievalCandidates: 5,
	        totalDeadlineMs: 15000,
	        maxResultCandidatesPerSearch: 5,
	      },
	      questions: [questionFor(syntheticAnalysis())],
	    };
	    await expect(openAiWebSearchAdapter({ apiKey: "key", modelName: "text-embedding-3-large" })(request, { abortSignal: new AbortController().signal })).rejects.toMatchObject({
	      status: "unsupported_model",
	    });
	    await expect(
	      openAiWebSearchAdapter({
	        apiKey: "key",
	        modelName: "gpt-5",
	        fetchImpl: async () => new Response(JSON.stringify({ error: { message: "model does not support web_search tool" } }), { status: 400 }),
	      })(request, { abortSignal: new AbortController().signal }),
	    ).rejects.toMatchObject({
	      reasonCode: "provider_invalid_request",
	      reasonCodes: ["provider_http_status_400", "provider_http_status_class_4xx", "provider_invalid_request"],
	    });
	    await expect(
	      openAiWebSearchAdapter({
	        apiKey: "key",
	        modelName: "gpt-5",
	        fetchImpl: async () => jsonResponse({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }),
	      })(request, { abortSignal: new AbortController().signal }),
	    ).rejects.toMatchObject({
	      reasonCode: "provider_refused",
	      reasonCodes: ["provider_refused"],
	      accounting: { requestId: null },
	    });
	  });

	  it("actively aborts timed-out research and ignores late provider completion", async () => {
	    const analysis = syntheticAnalysis();
	    let aborted = false;
	    let lateCompleted = false;
	    const result = await runFeeKnowledgeResearch({
	      analysis,
	      questions: [questionFor(analysis)],
	      options: {
	        enabled: true,
	        timeoutMs: 5,
	        adapter: async (_request, context) => {
	          context.abortSignal.addEventListener("abort", () => {
	            aborted = true;
	          });
	          await new Promise((resolve) => setTimeout(resolve, 25));
	          lateCompleted = true;
	          return [{ url: "https://syntheticprocessor.test/late", title: null, publisher: null }];
	        },
	      },
	    });
	    expect(result.attempts[0]?.status).toBe("timed_out");
	    expect(result.candidates).toEqual([]);
	    expect(aborted).toBe(true);
	    await new Promise((resolve) => setTimeout(resolve, 35));
	    expect(lateCompleted).toBe(true);
	    expect(result.candidates).toEqual([]);
	  });

	  it("blocks DNS rebinding, private redirects, reserved address ranges, and unvalidated connection targets", async () => {
	    const dnsFailure = await retrieveFeeKnowledgeDocument("https://missing.syntheticprocessor.test/fees", {
	      abortSignal: new AbortController().signal,
	      resolveHost: async () => { throw Object.assign(new Error("not found"), { code: "ENOTFOUND" }); },
	    });
	    const rebinding = await retrieveFeeKnowledgeDocument("https://syntheticprocessor.test/fees", {
	      abortSignal: new AbortController().signal,
	      resolveHost: async () => ["93.184.216.34", "127.0.0.1"],
	    });
	    const privateRedirect = await retrieveFeeKnowledgeDocument("https://syntheticprocessor.test/fees", {
	      abortSignal: new AbortController().signal,
	      resolveHost: async (host) => (host === "syntheticprocessor.test" ? ["93.184.216.34"] : ["127.0.0.1"]),
	      fetchImpl: async () => new Response("", { status: 302, headers: { location: "https://127.0.0.1/private" } }),
	    });
	    const ipv6Private = await retrieveFeeKnowledgeDocument("https://syntheticprocessor.test/fees", {
	      abortSignal: new AbortController().signal,
	      resolveHost: async () => ["fc00::1"],
	    });
	    const targetMismatch = await retrieveFeeKnowledgeDocument("https://syntheticprocessor.test/fees", {
	      abortSignal: new AbortController().signal,
	      resolveHost: async () => ["93.184.216.34"],
	      fetchImpl: async (_url, init) => {
	        expect((init as RequestInit & { validatedIpAddresses?: string[] }).validatedIpAddresses).toEqual(["93.184.216.34"]);
	        return new Response("Synthetic Processor Monthly Service Fee", {
	          status: 200,
	          headers: { "content-type": "text/plain", "x-ratereveal-connected-address": "198.51.100.10" },
	        });
	      },
	    });

	    expect(dnsFailure.status).toBe("failed");
	    expect(dnsFailure.reasonCodes).toContain("fee_knowledge_retrieval_dns_resolution_failed");
	    expect(dnsFailure.safeDiagnostics).toMatchObject({
	      outcomeClass: "dns_resolution_failed",
	      sourceDomain: "missing.syntheticprocessor.test",
	      attemptedNetwork: false,
	    });
	    expect(rebinding.status).toBe("safety_blocked");
	    expect(rebinding.safeDiagnostics).toMatchObject({ outcomeClass: "destination_policy_blocked", blockedAddressClass: "private_or_reserved" });
	    expect(privateRedirect.status).toBe("safety_blocked");
	    expect(privateRedirect.safeDiagnostics).toMatchObject({ outcomeClass: "destination_policy_blocked", blockedAddressClass: "private_or_reserved" });
	    expect(ipv6Private.status).toBe("safety_blocked");
	    expect(targetMismatch.status).toBe("safety_blocked");
	    expect(targetMismatch.safeDiagnostics).toMatchObject({ outcomeClass: "destination_policy_blocked" });
	    expect(targetMismatch.reasonCodes).toContain("fee_knowledge_connection_target_unvalidated");
	  });

	  it.each([1, 2, 3])("follows %i safe redirects with every hop revalidated", async (redirectCount) => {
	    const resolvedHosts: string[] = [];
	    const fetchedUrls: string[] = [];
	    const document = await retrieveFeeKnowledgeDocument("https://redirect-0.syntheticprocessor.test/fees", {
	      abortSignal: new AbortController().signal,
	      resolveHost: async (host) => {
	        resolvedHosts.push(host);
	        return ["93.184.216.34"];
	      },
	      fetchImpl: async (url, init) => {
	        const currentUrl = String(url);
	        fetchedUrls.push(currentUrl);
	        expect(new URL(currentUrl).protocol).toBe("https:");
	        expect((init as RequestInit & { validatedIpAddresses?: string[] }).validatedIpAddresses).toEqual(["93.184.216.34"]);
	        const hop = Number(new URL(currentUrl).hostname.match(/redirect-(\d+)/)?.[1]);
	        if (hop < redirectCount) {
	          return new Response("", {
	            status: 302,
	            headers: { location: `https://redirect-${hop + 1}.syntheticprocessor.test/fees` },
	          });
	        }
	        return new Response("Synthetic Processor Monthly Service Fee", {
	          status: 200,
	          headers: {
	            "content-type": "text/plain",
	            "x-ratereveal-connected-address": "93.184.216.34",
	          },
	        });
	      },
	    });

	    expect(document.status).toBe("retrieved_text");
	    expect(document.redirectChain).toHaveLength(redirectCount);
	    expect(fetchedUrls).toHaveLength(redirectCount + 1);
	    expect(resolvedHosts).toHaveLength(redirectCount + 1);
	    expect(new Set(resolvedHosts).size).toBe(redirectCount + 1);
	  });

	  it("creates HTML/PDF locators and revalidates citations against fingerprint and locator hash", async () => {
	    const html = await retrieveFeeKnowledgeDocument("https://syntheticprocessor.test/fees", {
	      abortSignal: new AbortController().signal,
	      resolveHost: async () => ["93.184.216.34"],
	      fetchImpl: async () =>
	        new Response("<html><body><h2>Fee Rules</h2><p>Synthetic Processor Monthly Service Fee applies in 2026.</p><table><tr><td>Monthly Service Fee</td><td>Rule</td></tr></table></body></html>", {
	          status: 200,
	          headers: { "content-type": "text/html" },
	        }),
	    });
	    const citation = validateClaimCitation({ document: html, requiredText: "Monthly Service Fee" });
	    const changedFingerprint = validateClaimCitation({
	      document: html,
	      requiredText: "Monthly Service Fee",
	      locatorId: citation.locator?.locatorId,
	      expectedDocumentFingerprint: "sha256:changed",
	      expectedLocatorTextHash: citation.locator?.textHash,
	    });
	    const changedLocator = validateClaimCitation({
	      document: html,
	      requiredText: "Monthly Service Fee",
	      locatorId: citation.locator?.locatorId,
	      expectedDocumentFingerprint: html.documentFingerprint,
	      expectedLocatorTextHash: "changed",
	    });
	    const pdfBytes = await readFile(new URL("../fixtures/canonical/synthetic-pdfs/fiserv-summary-synthetic.pdf", import.meta.url));
	    const pdf = await retrieveFeeKnowledgeDocument("https://syntheticprocessor.test/doc.pdf", {
	      abortSignal: new AbortController().signal,
	      resolveHost: async () => ["93.184.216.34"],
	      fetchImpl: async () => new Response(pdfBytes, { status: 200, headers: { "content-type": "application/pdf" } }),
	    });

	    expect(html.locators.some((locator) => locator.kind === "html_heading" && locator.sectionLabel)).toBe(true);
	    expect(html.locators.some((locator) => locator.kind === "html_table" && locator.tableIndex === 0 && locator.rowIndex === 0)).toBe(true);
	    expect(citation.exists).toBe(true);
	    expect(changedFingerprint.exists).toBe(false);
	    expect(changedLocator.exists).toBe(false);
	    expect(pdf.status).toBe("retrieved_text");
	    expect(pdf.locators.some((locator) => locator.kind === "pdf_page" && locator.pageNumber && locator.textStart !== null && locator.textEnd !== null)).toBe(true);
	  });

	  it("proves every approved evidence outcome has a deterministic producer", async () => {
	    const analysis = syntheticAnalysis();
	    const outcomes = new Map<string, string | undefined>();
	    outcomes.set("verified_classification", (await verificationOutcome(analysis, { decision: "supports" })).claimSupport?.evidenceDecision);
	    outcomes.set("verified_rule", (await verificationOutcome(analysis, { decision: "supports", semanticQuestion: "Find the published rule rate for this fee." })).claimSupport?.evidenceDecision);
	    outcomes.set(
	      "verified_application",
	      (await verificationOutcome(analysis, { decision: "supports", semanticQuestion: "Calculate whether the published rule applies to the statement basis.", reasonCodes: ["deterministic_calculation_matches"] })).claimSupport?.evidenceDecision,
	    );
	    outcomes.set("possible_interpretation", (await verificationOutcome(analysis, { decision: "supports", deterministicCategory: null })).claimSupport?.evidenceDecision);
	    outcomes.set("needs_verification", (await verificationOutcome(analysis, { decision: "partially_supports" })).claimSupport?.evidenceDecision);
	    outcomes.set("conflicting_evidence", (await verificationOutcome(analysis, { decision: "contradicts" })).claimSupport?.evidenceDecision);
	    outcomes.set("unsupported", (await verificationOutcome(analysis, { decision: "does_not_support" })).claimSupport?.evidenceDecision);
	    outcomes.set("source_inapplicable", (await verificationOutcome(analysis, { decision: "supports", processorOrNetwork: "Other Processor" })).claimSupport?.evidenceDecision);
	    const unavailable = await verifyCandidate({
	      candidateId: "candidate_unavailable",
	      attemptId: "research_unavailable",
	      candidate: { url: "https://syntheticprocessor.test/file.pdf", title: null, publisher: null },
	      retrieved: {
	        type: "fee_knowledge_retrieved_document",
	        policyVersion: "fee_knowledge_retrieval_policy_v1",
	        status: "retrieval_succeeded_text_unavailable",
	        canonicalUrl: "https://syntheticprocessor.test/file.pdf",
	        redirectChain: [],
	        contentType: "application/pdf",
	        byteLength: 10,
	        documentFingerprint: "sha256:abc",
	        title: null,
	        text: "",
	        locators: [],
	        reasonCodes: ["fee_knowledge_pdf_text_unavailable"],
	      },
	      question: questionFor(analysis),
	      domainIdentityPolicy: syntheticDomainPolicy(),
	    });
	    const packet = buildFeeKnowledgeSourcePacket({ analysis, registry: null, researchCandidates: [unavailable.candidate] });
	    outcomes.set("source_unavailable", unavailable.candidate.verificationStatus);

	    expect(Object.fromEntries(outcomes)).toEqual({
	      verified_classification: "verified_classification",
	      verified_rule: "verified_rule",
	      verified_application: "verified_application",
	      possible_interpretation: "possible_interpretation",
	      needs_verification: "needs_verification",
	      conflicting_evidence: "conflicting_evidence",
	      unsupported: "unsupported",
	      source_inapplicable: "source_inapplicable",
	      source_unavailable: "source_unavailable",
	    });
	    expect(packet.provenanceDecisions.find((decision) => decision.candidateId === unavailable.candidate.candidateId)?.decision).toBe("insufficient_evidence");
	  });

	  it("triggers research deterministically, preserves row association, and records planning skips", async () => {
	    const analysis = syntheticAnalysisWithRows([
	      feeRow("feerow_unknown_a", "ev_a", "src_a", "Unknown Assessment", "individual_charge", true, -1000),
	      feeRow("feerow_unknown_b", "ev_b", "src_b", "Access Review Fee", "individual_charge", true, -900),
	      feeRow("feerow_unknown_c", "ev_c", "src_c", "Other Misc Fee", "individual_charge", true, -800),
	    ]);
	    const questions = defaultFeeKnowledgeResearchQuestions(analysis, null);
	    const result = await runFeeKnowledgeResearch({
	      analysis,
	      questions,
	      options: {
	        enabled: true,
	        domainIdentityPolicy: syntheticDomainPolicy(),
	        resolveHost: async () => ["93.184.216.34"],
	        adapter: async (request) => [{ url: `https://syntheticprocessor.test/${request.questions[0]!.feeRowRef}`, title: "Synthetic", publisher: "Synthetic Processor" }],
	        fetchImpl: async (_url) => htmlResponse("Synthetic Processor official guide explains the Unknown Assessment Access Review Fee Other Misc Fee for 2026 card processing."),
	        semanticSupportAdapter: async ({ structuredClaim }) => semanticDecision("supports", structuredClaim),
	      },
	    });
	    expect(questions).toHaveLength(3);
	    expect(result.attempts.filter((attempt) => attempt.status === "completed")).toHaveLength(3);
	    expect(result.attempts.filter((attempt) => attempt.status === "not_selected_planning")).toHaveLength(0);
	    expect(new Set(result.candidates.map((candidate) => candidate.feeRowRef))).toEqual(new Set(result.attempts.filter((attempt) => attempt.status === "completed").map((attempt) => attempt.feeRowRef)));
	    expect(result.candidates.every((candidate) => candidate.attemptId.startsWith("research_"))).toBe(true);
	  });

	  it("preserves Packages B-E, AnalysisSummary, parser output, and Report V1 across H1.4c outcomes", async () => {
    const document = syntheticDocument();
    const beforeDocument = JSON.parse(JSON.stringify(document));
    const legacySummary = analyzeDocument(document, "restaurant_food_beverage");
    const beforeSummary = JSON.parse(JSON.stringify(legacySummary));
    const reportBefore = buildSingleStatementReportV1({
      analysis: legacySummary,
      reportId: "report-h1-4c-invariance",
      generatedAt: "2026-08-01T00:00:00.000Z",
    });
    const baseline = buildCanonicalStatementFactsFromParsedDocument(document, {
      businessType: "restaurant_food_beverage",
      sourceAnalysisId: "job_h1_4c_base",
      sourceFileName: null,
    });
    const cases = [
      { name: "completed", adapter: async (packet: CanonicalWholeStatementFeeIntelligencePacket) => review(packet), research: { enabled: false } },
      { name: "disabled research", adapter: async (packet: CanonicalWholeStatementFeeIntelligencePacket) => review(packet), research: { enabled: false } },
      {
        name: "runtime verified",
        adapter: async (packet: CanonicalWholeStatementFeeIntelligencePacket) => review(packet),
        research: {
          enabled: true,
	          adapter: async (): Promise<FeeKnowledgeDiscoveryCandidate[]> => [{ url: "https://syntheticprocessor.test/fees", title: "Synthetic Guide", publisher: "Synthetic Processor" }],
	          fetchImpl: async () => htmlResponse("Synthetic Processor official guide explains the Monthly Service Fee for 2026 card processing."),
	          resolveHost: async () => ["93.184.216.34"],
	          domainIdentityPolicy: syntheticDomainPolicy(),
	          semanticSupportAdapter: async ({ structuredClaim }: { structuredClaim: FeeKnowledgeStructuredClaim }) => semanticDecision("supports", structuredClaim),
	        },
      },
      { name: "provider failure", adapter: async () => { throw new Error("provider failure"); }, research: { enabled: false } },
      { name: "malformed output", adapter: async () => ({ malformed: true }), research: { enabled: false } },
      { name: "incomplete coverage", adapter: async (packet: CanonicalWholeStatementFeeIntelligencePacket) => ({ ...review(packet), rowInterpretations: review(packet).rowInterpretations.slice(1) }), research: { enabled: false } },
    ] as const;

    for (const item of cases) {
      const result = await buildCanonicalRuntimeAnalysisWithRuntimeAi({
        document,
        businessType: "restaurant_food_beverage",
        runtimeDocumentRef: `job_h1_4c_${item.name.replace(/\s+/g, "_")}`,
        legacySummary,
        wholeStatementFeeIntelligence: {
          enabled: true,
          adapter: item.adapter,
          feeKnowledgeResearch: item.research,
        },
      });
      expect(financialProjection(result.analysis), item.name).toEqual(financialProjection(baseline));
      expect(result.analysis.customerState.actionGuidance.filter((action) => action.actionType === "request_removal" || action.actionType === "request_repricing"), item.name).toEqual([]);
    }

    const reportAfter = buildSingleStatementReportV1({
      analysis: legacySummary,
      reportId: "report-h1-4c-invariance",
      generatedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(document).toEqual(beforeDocument);
    expect(legacySummary).toEqual(beforeSummary);
    expect(reportAfter).toEqual(reportBefore);
  });
});

function reviewedRegistry(overrides: Partial<{ sourceId: string; claimId: string; lifecycle: ApprovedFeeKnowledgeSourceRegistry["sources"][number]["lifecycle"]; canonicalUrl: string; effectiveThrough: string; label: string }> = {}): ApprovedFeeKnowledgeSourceRegistry {
  const sourceId = overrides.sourceId ?? "source_alpha";
  const claimId = overrides.claimId ?? "claim_alpha";
  return {
    registrySchemaVersion: "fee_knowledge_registry_v1",
    registryVersion: "synthetic_registry_v1",
    policyVersion: "fee_knowledge_policy_v1",
    sources: [
      {
        sourceId,
        registrySchemaVersion: "fee_knowledge_registry_v1",
        policyVersion: "fee_knowledge_policy_v1",
        lifecycle: overrides.lifecycle ?? "active",
        kind: "official_processor_documentation",
        title: "Synthetic Official Fee Guide",
        publisher: "Synthetic Processor",
        canonicalUrl: overrides.canonicalUrl ?? "https://syntheticprocessor.test/fees",
        domainIdentity: {
          policyVersion: "fee_knowledge_policy_v1",
          publisherId: "synthetic_processor",
          officialDomains: ["syntheticprocessor.test"],
          aliases: ["synthetic processor"],
          verificationBasis: "registry_reviewed",
        },
        publicationDate: "2026-01-01",
        effectivePeriod: { from: "2026-01-01", through: overrides.effectiveThrough ?? null },
        retrievalDate: "2026-08-01",
        lastVerificationDate: "2026-08-01",
        reverifyAfterDate: null,
        jurisdiction: ["US"],
        market: ["card_payments"],
        processorIds: ["synthetic processor"],
        networkIds: [],
        aliases: ["synthetic processor"],
        supersedesSourceId: null,
        supersededBySourceId: null,
        contentFingerprint: "sha256:synthetic",
        displayPermission: "displayable",
        claims: [
          {
            claimId,
            claimType: "classification",
            feeLabels: [overrides.label ?? "Monthly Service Fee"],
            categories: [],
            processorIds: ["synthetic processor"],
            networkIds: [],
            semanticConclusion: {
              category: "network_access_or_authorization",
              likelyEconomicOwner: "processor",
              likelyContractualController: "merchant_contract",
            },
            conditions: ["Synthetic fixtures only."],
            exclusions: [],
            maximumConfidence: "high",
            actionabilityCeiling: "verify_only",
            effectivePeriod: { from: "2026-01-01", through: overrides.effectiveThrough ?? null },
            sourceLocator: "Synthetic fee section",
            customerSafeParaphrase: "Synthetic documentation describes the synthetic access fee.",
            displayPermission: "displayable",
          },
        ],
      },
    ],
  };
}

function reviewedRegistryWithBroadAndContradiction(): ApprovedFeeKnowledgeSourceRegistry {
  const exact = reviewedRegistry({ sourceId: "source_exact", claimId: "claim_exact" }).sources[0]!;
  const broad = reviewedRegistry({ sourceId: "source_broad", claimId: "claim_broad" }).sources[0]!;
  const contradiction = reviewedRegistry({ sourceId: "source_conflict", claimId: "claim_conflict", lifecycle: "contradicted" }).sources[0]!;
  return {
    ...reviewedRegistry(),
    sources: [
      exact,
      { ...broad, processorIds: [], aliases: [], claims: broad.claims.map((claim) => ({ ...claim, processorIds: [] })) },
      contradiction,
    ],
  };
}

function syntheticAnalysis(): CanonicalStatementAnalysis {
  const analysis = buildCanonicalStatementFactsFromParsedDocument(syntheticDocument(), {
    businessType: "restaurant_food_beverage",
    sourceAnalysisId: "job_h1_4c_synthetic",
    sourceFileName: null,
  });
  const row = feeRow("feerow_monthly_service", "ev_fee_monthly", "src_fee_monthly", "Monthly Service Fee", "individual_charge", true, -1000);
  return {
    ...analysis,
    evidence: [evidenceRecord("ev_fee_monthly")],
    feeLedger: {
      ...analysis.feeLedger,
      status: "partial",
      rows: [row],
      sourceOccurrences: [
        {
          id: "src_fee_monthly",
          evidenceRef: "ev_fee_monthly",
          documentId: "doc_h1_4c",
          pageNumber: 1,
          section: "fees",
          lineId: "line_1",
          rowIndex: 1,
          normalizedSourceText: null,
        },
      ],
      uniqueChargeTotal: money(-1000),
      controls: [],
      limitations: ["Synthetic partial ledger for fee knowledge provenance."],
    },
  };
}

function syntheticAnalysisWithRows(rows: CanonicalFeeRow[]): CanonicalStatementAnalysis {
  const analysis = syntheticAnalysis();
  return {
    ...analysis,
    evidence: rows.map((row, index) => evidenceRecord(`ev_${index}_${row.id}`)),
    feeLedger: {
      ...analysis.feeLedger,
      rows,
      sourceOccurrences: rows.map((row, index) => ({
        id: row.sourceOccurrenceIds[0]!,
        evidenceRef: `ev_${index}_${row.id}`,
        documentId: "doc_h1_4c",
        pageNumber: 1,
        section: "fees",
        lineId: `line_${index}`,
        rowIndex: index,
        normalizedSourceText: null,
      })),
    },
  };
}

function syntheticDocument(): ParsedDocument {
  const lines = [
    "Merchant: H1C Synthetic",
    "Processor: Synthetic Processor",
    "Statement Period: 01/01/2026 - 01/31/2026",
    "Total Amount Submitted | $1,000.00",
    "Fees Charged | -$30.00",
    "Monthly Service Fee | -$10.00",
  ];
  return {
    sourceType: "pdf",
    headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: {
      mode: "structured",
      qualityScore: 0.95,
      warnings: [],
      pageCount: 1,
    },
  };
}

function firstFeeRow(analysis: CanonicalStatementAnalysis): string {
  return analysis.feeLedger.rows.find((row) => /monthly service fee/i.test(row.selectedLabel))?.id ?? analysis.feeLedger.rows[0]!.id;
}

function questionFor(
  analysis: CanonicalStatementAnalysis,
  overrides: Partial<{
    decision: FeeKnowledgeSemanticSupportDecision["decision"];
    semanticQuestion: string;
    deterministicCategory: CanonicalStatementAnalysis["feeOwnershipActionability"]["rowClassifications"][number]["selected"]["category"] | null;
    deterministicEconomicOwner: FeeKnowledgeStructuredClaim["likelyEconomicOwner"];
    deterministicContractualController: FeeKnowledgeStructuredClaim["likelyContractualController"];
    deterministicActionabilityCeiling: FeeKnowledgeStructuredClaim["actionabilityCeiling"];
    deterministicConfidence: FeeKnowledgeStructuredClaim["maximumConfidence"];
    processorOrNetwork: string | null;
  }> = {},
) {
  return {
    feeRowRef: firstFeeRow(analysis),
    sanitizedQuestionCategory: "classification" as const,
    triggerReason: "material_unfamiliar_label" as const,
    processorOrNetwork: overrides.processorOrNetwork === undefined ? "Synthetic Processor" : overrides.processorOrNetwork,
    feeLabel: "Monthly Service Fee",
    statementSection: "individual_charge",
    statementPeriodYear: "2026",
    deterministicCategory: overrides.deterministicCategory === undefined ? "network_access_or_authorization" as const : overrides.deterministicCategory,
    deterministicEconomicOwner: overrides.deterministicEconomicOwner === undefined ? "processor" as const : overrides.deterministicEconomicOwner,
    deterministicContractualController: overrides.deterministicContractualController === undefined ? "merchant_contract" as const : overrides.deterministicContractualController,
    deterministicActionabilityCeiling: overrides.deterministicActionabilityCeiling ?? "verify_only",
    deterministicConfidence: overrides.deterministicConfidence ?? "high",
    semanticQuestion: overrides.semanticQuestion ?? "Find official documentation explaining this fee classification.",
  };
}

async function runtimeEvidenceReview(input: {
  support?: Partial<Pick<FeeKnowledgeStructuredClaim, "conditions" | "exclusions" | "actionabilityCeiling" | "maximumConfidence">>;
  interpretation: Partial<Record<string, unknown>>;
}) {
  const analysis = syntheticAnalysis();
  const question = questionFor(analysis, {
    deterministicCategory: "card_brand_network_assessment",
    deterministicEconomicOwner: "network",
    deterministicContractualController: "merchant_contract",
    deterministicActionabilityCeiling: input.support?.actionabilityCeiling ?? "verify_only",
    deterministicConfidence: input.support?.maximumConfidence ?? "high",
  });
  const verification = await verifyCandidate({
    candidateId: `candidate_runtime_${String(input.interpretation.proposedCategory ?? "match")}_${String(input.interpretation.likelyEconomicOwner ?? "owner")}_${String(input.interpretation.proposedActionabilityCeiling ?? "ceiling")}`.replace(/[^a-z0-9_]/gi, "_"),
    attemptId: "research_runtime_reconcile",
    candidate: { url: "https://syntheticprocessor.test/network-assessment", title: "Synthetic Network Guide", publisher: "Synthetic Processor" },
    retrieved: await retrieveFeeKnowledgeDocument("https://syntheticprocessor.test/network-assessment", {
      abortSignal: new AbortController().signal,
      fetchImpl: async () => htmlResponse("Synthetic Processor official guide explains the Monthly Service Fee as a network assessment for 2026 card processing."),
      resolveHost: async () => ["93.184.216.34"],
    }),
    question,
    domainIdentityPolicy: syntheticDomainPolicy(),
    semanticSupport: semanticDecision("supports", {
      ...structuredClaimForTest(question),
      conditions: input.support?.conditions ?? [],
      exclusions: input.support?.exclusions ?? [],
      maximumConfidence: input.support?.maximumConfidence ?? "high",
      actionabilityCeiling: input.support?.actionabilityCeiling ?? "verify_only",
    }),
  });
  if (verification.claimSupport) {
    verification.claimSupport.structuredClaim.conditions = input.support?.conditions ?? [];
    verification.claimSupport.structuredClaim.exclusions = input.support?.exclusions ?? [];
    verification.claimSupport.structuredClaim.maximumConfidence = input.support?.maximumConfidence ?? "high";
    verification.claimSupport.structuredClaim.actionabilityCeiling = input.support?.actionabilityCeiling ?? "verify_only";
    verification.claimSupport.exclusions = input.support?.exclusions ?? [];
    verification.claimSupport.actionabilityCeiling = input.support?.actionabilityCeiling ?? "verify_only";
    verification.candidate.claimSupportDecisionRef = calculateRuntimeClaimSupportDecisionRef({
      support: verification.claimSupport,
      candidate: verification.candidate,
    });
  }
  const sourcePacket = buildFeeKnowledgeSourcePacket({
    analysis,
    registry: null,
    runtimeClaimSupports: [verification.claimSupport!],
    researchCandidates: [verification.candidate],
  });
  const packet = buildWholeStatementFeeIntelligencePacket(analysis, null, sourcePacket);
  const supportRef = verification.claimSupport!.claimSupportId;
  const result = validateWholeStatementFeeIntelligenceReview(
    review(packet, {
      [firstFeeRow(analysis)]: {
        evidenceProvenance: "runtime_verified_documentation",
        externalSourceRef: verification.claimSupport!.sourceId,
        externalClaimSupportRef: supportRef,
        ...input.interpretation,
      },
    }),
    analysis,
    null,
    sourcePacket,
  );
  const record = result.output.acceptanceRecords.find((item) => item.feeRowRef === firstFeeRow(analysis))!;
  return { result, record, status: record.status };
}

async function verificationOutcome(
  analysis: CanonicalStatementAnalysis,
  options: {
    decision: FeeKnowledgeSemanticSupportDecision["decision"];
    semanticQuestion?: string;
    deterministicCategory?: CanonicalStatementAnalysis["feeOwnershipActionability"]["rowClassifications"][number]["selected"]["category"] | null;
    processorOrNetwork?: string | null;
    reasonCodes?: string[];
  },
) {
  const question = questionFor(analysis, options);
  const document = await retrieveFeeKnowledgeDocument("https://syntheticprocessor.test/fees", {
    abortSignal: new AbortController().signal,
    fetchImpl: async () => htmlResponse("Synthetic Processor official guide explains the Monthly Service Fee for 2026 card processing."),
    resolveHost: async () => ["93.184.216.34"],
  });
  return await verifyCandidate({
    candidateId: `candidate_${options.decision}_${options.semanticQuestion ?? "classification"}`.replace(/[^a-z0-9_]/gi, "_"),
    attemptId: "research_outcome",
    candidate: { url: "https://syntheticprocessor.test/fees", title: "Synthetic Guide", publisher: "Synthetic Processor" },
    retrieved: document,
    question,
    domainIdentityPolicy: syntheticDomainPolicy(),
    semanticSupport: semanticDecision(options.decision, {
      claimKind: /application|applies|calculate/i.test(question.semanticQuestion)
        ? "merchant_application"
        : /rule|rate/i.test(question.semanticQuestion)
          ? "published_rule"
          : "classification",
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
      applicationBasis: /application|applies|calculate/i.test(question.semanticQuestion) ? "statement_basis_matches" : "not_evaluated",
    }, options.reasonCodes),
  });
}

function structuredClaimForTest(question: ReturnType<typeof questionFor>): FeeKnowledgeStructuredClaim {
  return {
    claimKind: /application|applies|calculate/i.test(question.semanticQuestion)
      ? "merchant_application"
      : /rule|rate/i.test(question.semanticQuestion)
        ? "published_rule"
        : "classification",
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
    applicationBasis: /application|applies|calculate/i.test(question.semanticQuestion) ? "statement_basis_matches" : "not_evaluated",
  };
}

function feeRow(
  id: string,
  evidenceRef: string,
  sourceOccurrenceId: string,
  label: string,
  role: CanonicalFeeRow["role"],
  contributes: boolean,
  signedAmountMinor: number,
): CanonicalFeeRow {
  return {
    id,
    role,
    sourceOccurrenceIds: [sourceOccurrenceId],
    parserInterpretationIds: [],
    selectedLabel: label,
    selectedAmount: money(Math.abs(signedAmountMinor)),
    signedAmount: money(signedAmountMinor),
    contributesToUniqueTotal: contributes,
    contributionDecision: {
      contributes,
      reasonCode: "individual_charge_included",
      controlRefs: [],
      evidenceRefs: [evidenceRef],
      signedAmountBasis: "fee_charge_magnitude",
      grossNetBasis: "fee_charge_gross",
      confidence: "medium",
      limitations: [],
    },
    mergeReason: null,
    mergeConfidence: "medium",
    rejectedAmountCandidates: [],
    limitations: [],
  };
}

function evidenceRecord(id: string) {
  return {
    id,
    documentId: "doc_h1_4c",
    pageNumber: 1,
    section: "fees",
    lineId: "line_1",
    rowIndex: 1,
    extractedText: null,
    normalizedText: null,
    sourceRole: "fee_row" as const,
    confidence: "medium" as const,
    extractionObservations: [],
    parserInterpretations: [],
    customerSafe: { excerpt: null, redactionApplied: true },
  };
}

function money(amountMinor: number): MoneyAmount {
  return { amountMinor, currency: "USD" };
}

function review(
  packet: CanonicalWholeStatementFeeIntelligencePacket,
  overrides: Record<string, Partial<Record<string, unknown>>> = {},
) {
  return {
    type: "whole_statement_fee_intelligence_review",
    reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
    reviewStatus: "completed",
    evidenceRefs: packet.admittedFeeRows.flatMap((row) => row.evidenceRefs),
    factRefs: [],
    limitationCodes: [],
    rowInterpretations: packet.admittedFeeRows.map((row) => ({
      feeRowRef: row.feeRowRef,
      proposedCategory: "network_access_or_authorization",
      likelyEconomicOwner: "processor",
      likelyContractualController: "merchant_contract",
      proposedActionabilityCeiling: "verify_only",
      confidence: "high",
      conciseRationale: "Statement row label and section context support this semantic interpretation.",
      evidenceProvenance: "statement_evidence",
      evidenceRefs: row.evidenceRefs,
      externalSourceRef: null,
      externalClaimSupportRef: null,
      conflicts: [],
      missingEvidence: [],
      recommendedDisposition: "supported",
      authoritative: false,
      ...(overrides[row.feeRowRef] ?? {}),
    })),
    reasonCodes: ["whole_statement_fee_intelligence_reviewed"],
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function htmlResponse(body: string): Response {
  return new Response(`<html><head><title>Synthetic Official Fee Guide</title></head><body><p>${body}</p></body></html>`, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function syntheticDomainPolicy(): FeeKnowledgeDomainIdentityPolicy {
  return {
    policyVersion: FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
    reviewedPublisherDomains: [
      { publisherId: "synthetic_processor_test", aliases: ["synthetic processor"], officialDomains: ["syntheticprocessor.test"] },
    ],
    identityEvidence: [
      {
        type: "fee_knowledge_domain_identity_evidence",
        policyVersion: FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
        publisherId: "synthetic_processor_test",
        publisherDisplayName: "Synthetic Processor",
        officialDomain: "syntheticprocessor.test",
        evidenceUrl: "https://syntheticprocessor.test/identity",
        evidenceLocator: "Synthetic fixture identity record",
        evidenceSummary: "Synthetic fixture only; establishes test publisher identity without fee conclusions.",
        reviewedAt: "2026-08-01",
        establishesFeeConclusion: false,
      },
    ],
  };
}

function semanticDecision(
  decision: FeeKnowledgeSemanticSupportDecision["decision"],
  structuredClaim: FeeKnowledgeStructuredClaim,
  reasonCodes: string[] = [`semantic_${decision}`],
): FeeKnowledgeSemanticSupportDecision {
  return {
    type: "fee_knowledge_semantic_support_decision",
    policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
    decision,
    structuredClaim,
    reasonCodes,
    providerDetailsStripped: true,
  };
}

function financialProjection(analysis: CanonicalStatementAnalysis): Record<string, unknown> {
  return {
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
  };
}
