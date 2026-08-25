import { createHash } from "node:crypto";
import type {
  CandidateClaimSupport,
  IntelligencePorts,
  ProviderSafeQuestionContextV1,
  RuntimeClock,
  SearchRequest,
} from "../../../../src/canonical/v2/index.js";
import {
  ProviderOperationAuditLog,
  createPublicDocumentExtractionPort,
  createPublicSourceAuthorityAdmission,
} from "../../../../src/canonical/v2/index.js";

class InjectedClock implements RuntimeClock {
  private current = 0;
  nowMs(): number { return this.current; }
  async runWithTimeout<T>(_timeoutMs: number, operation: () => Promise<T>) {
    this.current += 1;
    try { return { status: "completed" as const, value: await operation() }; }
    catch { return { status: "failed" as const, reasonCode: "injected_operation_failed" }; }
  }
}

export function createInjectedStatement1Fixture() {
  const providerAudit = new ProviderOperationAuditLog();
  const downloadedBuffers: Uint8Array[] = [];
  const providerPayloads: string[] = [];
  let sequence = 0;
  const receipt = (operation: "search" | "retrieval" | "investigative_model" | "semantic_model", providerCode: string,
    reservationId: string, operationId: string) => {
    sequence += 1;
    providerAudit.record({ receiptId: `injected-receipt-${sequence}`, reservationId,
      operationId, operation, providerCode, logicalAttempt: 1, actualSendCount: 0, retryCount: 0,
      sendState: "not_sent", completionState: "completed", elapsedMs: 1, usageState: "known", outputTokens: null,
      providerRequestCount: operation === "search" ? 1 : null, usageCostUsd: operation === "search" ? 0 : null,
      providerConfigurationCode: operation === "search" ? "injected_openrouter_perplexity_v1" : null,
      httpStatus: null, localRequestId: null, providerRequestId: null, providerResponseId: null,
      requestedModelIdentifier: null, returnedModelIdentifier: null, finishReason: null, toolExecutionState: null,
      annotationCount: null, normalizedCandidateCount: null, providerErrorType: null, providerErrorCode: null, providerErrorParam: null,
      structuredOutputValidation: operation === "investigative_model" || operation === "semantic_model" ? "passed" : "not_applicable",
      safeReasonCode: "injected_response" });
  };
  const htmlByCandidate = new Map<string, string>();
  const approvedNonSwipedPath = "/content/dam/firstdata/us/en/documents/pdf/How_to_Read_Your_statement_swipe_Non_swipe.pdf";
  const approvedNonSwipedBody = "<!doctype html><html><body><h1>How to Read Your Statement - Swipe Non-Swipe</h1><p>Non swiped discount $15.97 at .0285 appears as a Service Charge. This sample demonstrates terminology and statement presentation only.</p></body></html>";
  const approvedNonSwipedFingerprint = createHash("sha256").update(new TextEncoder().encode(approvedNonSwipedBody)).digest("hex");
  const extraction = createPublicDocumentExtractionPort();
  const ports: IntelligencePorts = {
    clock: new InjectedClock(),
    search: {
      providerCode: "injected_openrouter_search_contract",
      async search(request: SearchRequest) {
        providerPayloads.push(JSON.stringify(request)); receipt("search", "injected_openrouter_search_contract", request.reservationId, request.attemptId);
        const application = request.queryText.toLowerCase().includes("application fee");
        const definitions = application ? [
          { id: "application-paysafe", url: "https://www.paysafe.com/us-en/merchant-welcome-portal/faqs/", title: "Paysafe Application Fee", hint: "Application Fee",
            body: "A plausible official definition from the wrong processor program." },
          { id: "application-stripe", url: "https://docs.stripe.com/api/application_fees", title: "Stripe Application Fees", hint: "Application Fee",
            body: "A plausible official marketplace definition from the wrong product." },
          { id: "application-sec", url: "https://www.sec.gov/Archives/edgar/data/896429/000162828020009890/a20200331-exx101.htm", title: "Account-specific First Data agreement", hint: "Application Fee",
            body: "An account-specific contract is not an approved public terminology authority." },
        ] : [
          { id: "non-swiped-interchange-plus", url: "https://merchants.fiserv.com/content/dam/firstdata/us/en/documents/pdf/How_To_Read_Your_Statement_Interchange_Plus_Pricing.pdf",
            title: "Interchange Plus statement guide", hint: "Discount", body: "Wrong publication family and pathname." },
          { id: "non-swiped-canada", url: "https://merchants.fiserv.com/content/dam/firstdata/ca/en/pdf/CA-Merchant-Terms.pdf",
            title: "Canada merchant terms", hint: "Discount", body: "Wrong geography and pathname." },
          { id: "non-swiped-definition", url: `https://merchants.fiserv.com${approvedNonSwipedPath}`,
            title: "How to Read Your Statement - Swipe Non-Swipe", hint: "Non swiped discount", body: approvedNonSwipedBody },
        ];
        const candidates = definitions.map((definition, index) => {
          const candidateId = `injected-${definition.id}`;
          htmlByCandidate.set(candidateId, definition.body.startsWith("<!doctype") ? definition.body
            : `<!doctype html><html><body><h1>${definition.hint}</h1><p>${definition.body}</p></body></html>`);
          const sourceDomain = new URL(definition.url).hostname;
          return { candidateId, questionId: request.questionId, attemptId: request.attemptId,
            url: definition.url, title: definition.title, claimedAuthority: "processor_publication" as const,
            sourceTypeCode: "official_processor_terminology", rank: index + 1, publicationDate: null,
            effectiveFrom: null, effectiveTo: null, locatorHint: null, selectionReasonCode: "injected_official_source",
            discoveryMetadata: { providerCode: "injected_openrouter_search_contract", configurationCode: "injected_openrouter_perplexity_v1",
              sourceDomain, providerRank: index + 1, providerSnippetUsedAsEvidence: false as const } };
        });
        return { attemptId: request.attemptId, questionId: request.questionId, candidates, suggestedAdaptiveReason: null,
          providerMetadata: { providerResponseId: `injected-response-${sequence}`, modelIdentifier: "openai/gpt-5.2", finishReason: "stop",
            webSearchRequestCount: 1, annotationCount: candidates.length, normalizedCandidateCount: candidates.length,
            providerCompletionState: "completed" as const, toolExecutionState: "verified" as const },
          outputAccounting: "search_discovery_not_model_generation" as const };
      },
    },
    destination: {
      async resolve(candidateId, normalizedUrl) {
        return { candidateId, normalizedUrl, addresses: ["93.184.216.34"], permitId: `permit-${candidateId}` };
      },
    },
    retrieval: {
      async retrieve(request) {
        receipt("retrieval", "injected_https_retrieval_contract", request.reservationId, request.reservationId.slice(0, -":document".length));
        const content = new TextEncoder().encode(request.permit.normalizedUrl.endsWith(approvedNonSwipedPath)
          ? approvedNonSwipedBody : htmlByCandidate.get(request.candidateId) ?? "");
        downloadedBuffers.push(content);
        request.recordReceivedBytes(content.byteLength);
        return { questionId: request.questionId, candidateId: request.candidateId, documentId: request.documentId,
          status: "retrieved" as const, connectedAddress: "93.184.216.34", redirects: [], mimeType: "text/html",
          content, byteLength: content.byteLength, streamedByteLength: content.byteLength,
          safetyContract: { streamingByteLimitEnforced: true as const, abortSignalObserved: true as const,
            destinationPermitEnforced: true as const } };
      },
    },
    extraction,
    investigative: {
      providerCode: "injected_openai_responses_contract", modelCode: "injected_investigative_model",
      async investigate(request) {
        providerPayloads.push(JSON.stringify(request)); receipt("investigative_model", "injected_openai_responses_contract", request.reservationId, request.reservationId.slice(0, -":call".length));
        return { batchId: request.batchId, attemptId: request.attemptId, schemaVersion: request.schemaVersion,
          reportedOutputTokens: 180, items: request.items.map((item) => {
            const locator = item.locators[0]!;
            const termCode = item.questionContext?.subjectCode ?? "application_fee_terminology";
            return { itemId: item.itemId, questionId: item.questionId, candidateId: item.candidateId, documentId: item.documentId,
            locatorId: locator.locatorId, documentFingerprint: item.documentFingerprint, interpretationCode: "bounded_public_term_definition",
              proposedValue: { kind: "term" as const, termCode, termValue: "official_definition_found" },
              sourceAuthorityCandidate: "processor_publication" as const, effectiveFromCandidate: null, effectiveToCandidate: null,
              limitationCodes: ["terminology_example_presentation_only", "public_scope_applicability_unproven"], financialMutationAllowed: false as const };
          }) };
      },
    },
    semantic: {
      providerCode: "injected_openai_responses_contract", modelCode: "injected_semantic_model",
      async verify(request) {
        providerPayloads.push(JSON.stringify(request)); receipt("semantic_model", "injected_openai_responses_contract", request.reservationId, request.reservationId.slice(0, -":call".length));
        return { batchId: request.batchId, attemptId: request.attemptId, schemaVersion: request.schemaVersion,
          reportedOutputTokens: 140, items: request.items.map((item): CandidateClaimSupport => ({
            itemId: item.itemId, supportId: `support-${createHash("sha256").update(item.candidate.candidateId).digest("hex").slice(0, 16)}`,
            questionId: item.question.questionId, claimType: item.question.claimType, subjectCode: item.question.subjectCode,
            candidateId: item.candidate.candidateId, documentId: item.documentId, locatorId: item.locator.locatorId,
            documentFingerprint: item.locator.documentFingerprint, investigativeObservationId: item.itemId,
            sourceAuthority: "processor_publication", sourceEffectiveFrom: null, sourceEffectiveTo: null,
            applicabilityScope: { ...item.question.scope }, proposedValue: item.proposedValue,
            assertionBasisCode: "claim_specific_public_definition", verificationStatus: "supported_candidate",
            limitationCodes: ["terminology_example_presentation_only", "public_scope_applicability_unproven",
              "public_definition_does_not_establish_account_applicability"], admissionAuthority: "none", financialMutationAllowed: false,
          })) };
      },
    },
  };
  const publicSourceAuthorityAdmissions = [createPublicSourceAuthorityAdmission({
    admissionId: "injected_fiserv_first_data_us_swipe_non_swipe_statement_guide_v1", admissionVersion: 1,
    authority: "processor_publication", origin: "https://merchants.fiserv.com",
    publicationFamilyCode: "first_data_us_swipe_non_swipe_statement_guide",
    publicationMetadata: { title: "How to Read Your Statement - Swipe Non-Swipe", version: null, publicationDate: null,
      samplePeriodStart: "2018-05-01", samplePeriodEnd: "2018-05-31", effectiveFrom: null, effectiveTo: null,
      periodApplicabilityPolicy: "historical_example_only", retrievalVerifiedOn: "2026-08-24", provenanceUrls: [] },
    pathMatchMode: "exact_document", maximumEvidentiaryScope: "terminology_example_presentation_only", allowedClaimTypes: ["processor_term"],
    allowedEvidenceClasses: ["official_processor_terminology"], allowedSourceTypeCodes: ["official_processor_terminology"],
    allowedSubjectCodes: ["non_swiped_discount_terminology"], allowedProcessorPrograms: ["fiserv_first_data"],
    allowedGeographyCodes: ["us"], allowedPathPrefixes: [approvedNonSwipedPath], approvedDocumentFingerprints: [approvedNonSwipedFingerprint],
  })];
  const providerPreflight = {
    schemaVersion: "internal_provider_preflight_input_v1" as const, runMode: "internal_live_evaluation" as const,
    executionMode: "injected_evaluation" as const, sourceAuthorityRegistryLoaded: true,
    search: { provider: "openrouter_web_search" as const, engine: "perplexity" as const, credentialPresent: false, modelConfigured: true,
      maxUses: 1 as const, maxToolCalls: 1 as const, resultCapBounded: true, fallbackProvidersAllowed: false as const,
      automaticRetries: 0 as const, timeoutSupported: true, abortSupported: true, oneAttemptTransport: true },
    models: { provider: "openai_responses_api" as const, credentialPresent: false, modelConfigured: true,
      structuredOutputSupported: true, outputTokenCeilingsSupported: true, automaticRetries: 0 as const,
      timeoutSupported: true, abortSupported: true, oneAttemptTransport: true },
    languageCapability: "disabled" as const, productOwnerLiveCallAuthorization: false,
  };
  return { ports, providerAudit, providerPreflight, publicSourceAuthorityAdmissions, downloadedBuffers, providerPayloads };
}

export function unsafeProviderContext(overrides: Record<string, unknown>): ProviderSafeQuestionContextV1 {
  return { schemaVersion: "provider_safe_question_context_v1", providerContextId: "provider-context-00000000-0000-4000-8000-000000000000", questionClass: "application_fee_public_definition",
    claimType: "processor_term", subjectCode: "application_fee_terminology", safeResearchLabel: "application fee",
    questionText: "Does an eligible authoritative public source define application fee terminology?", processorProgram: "fiserv_first_data",
    periodYear: "2025", allowedContext: "public_product_terminology_only", ...overrides } as ProviderSafeQuestionContextV1;
}
