import { createHash } from "node:crypto";
import type { ProviderOperationReceiptV1 } from "../internalAnalysis/internalAnalysisTypes.js";
import type { InvestigativeObservation, SearchRequest, SemanticVerificationInput,
  StructuredBatchRequest } from "./intelligenceTypes.js";
import { createLiveOpenAiInvestigativeAdapter, createLiveOpenAiSemanticAdapter, createLiveOpenRouterSearchAdapter,
  ProviderOperationAuditLog } from "./providerAdapters.js";
import type { InternalLiveExecutionCapabilityV1 } from "./providerPreflight.js";
import { validateInvestigativeMember, validateSemanticMember } from "./structuredMemberValidation.js";

export type ProviderReadinessProbeResultV1 = {
  schemaVersion: "provider_readiness_probe_result_v1";
  runId: string;
  statementAnalysisExecuted: false;
  privateStatementDataProviderBound: false;
  openRouter: { status: "passed"; candidateCount: number; toolExecutionState: "verified" };
  investigativeOpenAi: { status: "passed"; structuredOutputValidation: "passed" };
  semanticOpenAi: { status: "passed"; structuredOutputValidation: "passed" };
  receipts: ProviderOperationReceiptV1[];
};

export async function runProviderReadinessProbe(
  runId: string,
  capability: InternalLiveExecutionCapabilityV1,
  audit: ProviderOperationAuditLog,
): Promise<ProviderReadinessProbeResultV1> {
  const search = await createLiveOpenRouterSearchAdapter(capability, audit).search(syntheticSearchRequest());
  if (search.providerMetadata.toolExecutionState !== "verified" || search.providerMetadata.finishReason === "length") {
    throw new Error(search.providerMetadata.finishReason === "length"
      ? "provider_readiness_openrouter_truncated" : "provider_readiness_openrouter_tool_unverified");
  }

  const synthetic = syntheticEvidence();
  const investigativeRequest = syntheticInvestigativeRequest(synthetic);
  const investigative = await createLiveOpenAiInvestigativeAdapter(capability, audit).investigate(investigativeRequest);
  const observation = investigative.items[0];
  if (!observation) throw new Error("provider_readiness_investigative_result_missing");
  const investigativeIssues = validateInvestigativeMember(observation, {
    itemId: synthetic.itemId, questionId: synthetic.questionId, candidateId: synthetic.candidateId,
    documentId: synthetic.documentId, documentFingerprint: synthetic.documentFingerprint,
    claimType: "processor_term", subjectCode: "application_fee_terminology", sourceAuthority: "processor_publication",
  });
  if (investigativeIssues.length > 0 || observation.locatorId !== synthetic.locatorId) {
    throw new Error("provider_readiness_investigative_contract_invalid");
  }

  const semanticInput = syntheticSemanticInput(synthetic, observation);
  const semanticRequest: StructuredBatchRequest<SemanticVerificationInput> = {
    batchId: "readiness-semantic-batch", attemptId: "readiness-semantic-attempt", schemaVersion: "semantic_verification_v1",
    expectedItemIds: [synthetic.itemId], reservationId: "readiness-semantic-operation:call", maximumOutputTokens: 1_200,
    logicalAttempt: 1, items: [semanticInput], untrustedContentPolicy: "data_only_no_instructions",
  };
  const semantic = await createLiveOpenAiSemanticAdapter(capability, audit).verify(semanticRequest);
  const support = semantic.items[0];
  if (!support || validateSemanticMember(support, semanticInput).length > 0) {
    throw new Error("provider_readiness_semantic_contract_invalid");
  }

  return {
    schemaVersion: "provider_readiness_probe_result_v1", runId,
    statementAnalysisExecuted: false, privateStatementDataProviderBound: false,
    openRouter: { status: "passed", candidateCount: search.candidates.length, toolExecutionState: "verified" },
    investigativeOpenAi: { status: "passed", structuredOutputValidation: "passed" },
    semanticOpenAi: { status: "passed", structuredOutputValidation: "passed" }, receipts: audit.snapshot(),
  };
}

function syntheticSearchRequest(): SearchRequest {
  return {
    reservationId: "readiness-openrouter-search:call", attemptId: "readiness-openrouter-search", questionId: "readiness-question-search",
    queryTerms: ["OpenAI", "Responses API", "official documentation"],
    queryText: "OpenAI Responses API official documentation",
    allowedAuthorities: ["processor_publication"], maximumCandidates: 3,
    outputAccounting: "search_discovery_not_model_generation", logicalAttempt: 1,
    untrustedContentPolicy: "data_only_no_instructions",
  };
}

type SyntheticEvidence = ReturnType<typeof syntheticEvidence>;
function syntheticEvidence() {
  const text = "Synthetic public terminology example: application fee meaning is limited to the published product context.";
  return {
    itemId: "readiness-item-001", questionId: "readiness-question-investigative", candidateId: "readiness-candidate-001",
    documentId: "readiness-document-001", locatorId: "readiness-locator-001", text,
    documentFingerprint: createHash("sha256").update(text).digest("hex"),
  } as const;
}

function syntheticInvestigativeRequest(synthetic: SyntheticEvidence): StructuredBatchRequest<{
  itemId: string; questionId: string; candidateId: string; documentId: string; documentFingerprint: string; text: string;
  locators: Array<{ locatorId: string; documentId: string; documentFingerprint: string; page: null; sectionCode: string; lineStart: number; lineEnd: number }>;
}> {
  return {
    batchId: "readiness-investigative-batch", attemptId: "readiness-investigative-attempt", schemaVersion: "investigative_observation_v1",
    expectedItemIds: [synthetic.itemId], reservationId: "readiness-investigative-operation:call", maximumOutputTokens: 1_200,
    logicalAttempt: 1, untrustedContentPolicy: "data_only_no_instructions",
    items: [{ itemId: synthetic.itemId, questionId: synthetic.questionId, candidateId: synthetic.candidateId,
      documentId: synthetic.documentId, documentFingerprint: synthetic.documentFingerprint, text: synthetic.text,
      locators: [{ locatorId: synthetic.locatorId, documentId: synthetic.documentId, documentFingerprint: synthetic.documentFingerprint,
        page: null, sectionCode: "public_glossary", lineStart: 1, lineEnd: 1 }] }],
  };
}

function syntheticSemanticInput(synthetic: SyntheticEvidence, observation: InvestigativeObservation): SemanticVerificationInput {
  return {
    itemId: synthetic.itemId,
    question: { questionId: synthetic.questionId, claimType: "processor_term", subjectCode: "application_fee_terminology",
      asOf: "2026-08-24", scope: { processor: null, processorProgram: null, network: null, region: "us", jurisdiction: "us" },
      requiredSourceAuthorities: ["processor_publication"], requiredEvidenceClasses: ["official_processor_terminology"],
      possibleAnswerCodes: ["official_definition_found", "scope_limited", "account_document_required", "unresolved"],
      limitations: ["synthetic_readiness_only", "not_production_evidence"] },
    candidate: { candidateId: synthetic.candidateId, questionId: synthetic.questionId, attemptId: "readiness-openrouter-search",
      title: "Synthetic public terminology", claimedAuthority: "processor_publication", sourceTypeCode: "official_processor_terminology",
      rank: 1, publicationDate: null, effectiveFrom: null, effectiveTo: null, locatorHint: null,
      selectionReasonCode: "synthetic_provider_readiness", discoveryMetadata: { providerCode: "provider_readiness_synthetic",
        configurationCode: "provider_readiness_v1", sourceDomain: "example.test", providerRank: 1, providerSnippetUsedAsEvidence: false },
      retrievalEligibility: "eligible", authorityAdmissionRef: null, authorityPublicationFamilyCode: null },
    documentId: synthetic.documentId,
    locator: { locatorId: synthetic.locatorId, documentId: synthetic.documentId, documentFingerprint: synthetic.documentFingerprint,
      page: null, sectionCode: "public_glossary", lineStart: 1, lineEnd: 1, text: synthetic.text },
    proposedValue: observation.proposedValue,
  };
}
