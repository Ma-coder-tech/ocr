import { describe, expect, it } from "vitest";
import {
  bindInvestigativeLocator,
  createDestinationPermit,
  deterministicLocatorGrounding,
  isPublicDestinationAddress,
  normalizeSafeHttpsUrl,
  partitionStructuredItems,
  validateRetrievalResponse,
  validateStructuredBatchResponse,
} from "../../../../src/canonical/v2/index.js";

describe("Canonical Intelligence V2 retrieval safety and identity-complete batching", () => {
  it("blocks credentials, non-HTTPS, local/private/reserved destinations, and permits public pinned addresses", () => {
    expect(() => normalizeSafeHttpsUrl("http://example.com/rule")).toThrow("retrieval_https_required");
    expect(() => normalizeSafeHttpsUrl("https://user:secret@example.com/rule")).toThrow("retrieval_url_credentials_forbidden");
    expect(() => normalizeSafeHttpsUrl("https://127.0.0.1/rule")).toThrow("retrieval_destination_forbidden");
    for (const address of ["10.0.0.1", "172.16.1.1", "192.168.1.1", "169.254.1.1", "::1", "fc00::1", "2001:db8::1"]) {
      expect(isPublicDestinationAddress(address)).toBe(false);
    }
    expect(isPublicDestinationAddress("93.184.216.34")).toBe(true);
    expect(createDestinationPermit({ candidateId: "candidate-1", rawUrl: "https://example.com/rule", resolvedAddresses: ["93.184.216.34"], permitId: "permit-1", nowMs: 0, ttlMs: 12_000 })).toMatchObject({ host: "example.com", approvedAddresses: ["93.184.216.34"] });
  });

  it("rejects DNS rebinding, unsafe redirects, identity swaps, and byte-cap violations", () => {
    const candidate = {
      candidateId: "candidate-1", questionId: "question-1", attemptId: "attempt-1", url: "https://example.com/rule",
      claimedAuthority: "official_network_publication" as const, sourceTypeCode: "official_rule", rank: 1,
      publicationDate: null, effectiveFrom: null, effectiveTo: null, locatorHint: "published rate", selectionReasonCode: "official_authority",
      retrievalEligibility: "eligible" as const, authorityAdmissionRef: "admission-1",
    };
    const permit = createDestinationPermit({ candidateId: candidate.candidateId, rawUrl: candidate.url, resolvedAddresses: ["93.184.216.34"], permitId: "permit-1", nowMs: 0, ttlMs: 12_000 });
    const issues = validateRetrievalResponse({
      candidate, documentId: "document-1", permit, nowMs: 1, maximumBytes: 100,
      response: {
        questionId: "question-other", candidateId: candidate.candidateId, documentId: "document-1", status: "retrieved",
        connectedAddress: "93.184.216.35",
        redirects: [{ normalizedUrl: "http://internal.example/", permitId: "unissued-permit", connectedAddress: "10.0.0.2" }],
        mimeType: "application/pdf", content: new Uint8Array(101), byteLength: 101, streamedByteLength: 101,
        safetyContract: { streamingByteLimitEnforced: true, abortSignalObserved: true, destinationPermitEnforced: true },
      },
      observedStreamedBytes: 101,
    });
    expect(issues).toEqual(expect.arrayContaining([
      "retrieval_question_identity_mismatch",
      "retrieval_dns_rebinding_or_unpinned_connection",
      "retrieval_https_required",
      "redirect_destination_permit_missing_or_mismatched",
      "retrieval_byte_limit_exceeded",
    ]));
  });

  it("grounds locators without treating text presence as semantic support and rejects parent swaps", () => {
    const candidate = { candidateId: "candidate-1", questionId: "question-1", locatorHint: "effective October 1" };
    const extraction = {
      questionId: "question-1", candidateId: "candidate-1", documentId: "document-1", documentFingerprint: "fingerprint-1", state: "retrieved_extracted" as const,
      text: "A rule is effective October 1.",
      locators: [{ locatorId: "locator-1", documentId: "document-1", documentFingerprint: "fingerprint-1", page: 2, sectionCode: "fees", lineStart: 4, lineEnd: 4, text: "A rule is effective October 1." }],
    };
    expect(deterministicLocatorGrounding(candidate, extraction)?.locatorId).toBe("locator-1");
    expect(bindInvestigativeLocator({
      extraction,
      observation: {
        itemId: "item-1", questionId: "question-1", candidateId: "candidate-other", documentId: "document-1",
        locatorId: extraction.locators[0]!.locatorId, documentFingerprint: "fingerprint-1", interpretationCode: "candidate_rule", proposedValue: { kind: "boolean", value: true },
        sourceAuthorityCandidate: "official_network_publication", effectiveFromCandidate: null, effectiveToCandidate: null,
        limitationCodes: [], financialMutationAllowed: false,
      },
    })).toBeNull();
  });

  it("rejects missing, duplicate, unknown, and cross-batch structured IDs with no repair retry", () => {
    const [batch] = partitionStructuredItems({
      runId: "run-1", stageCode: "semantic", schemaVersion: "v1", reservationIds: ["reservation-1"],
      maximumItemsPerBatch: 4, maximumOutputTokens: 100, items: [{ itemId: "item-1" }, { itemId: "item-2" }],
    });
    expect(validateStructuredBatchResponse(batch!, {
      batchId: batch!.batchId, attemptId: batch!.attemptId, schemaVersion: batch!.schemaVersion,
      items: [{ itemId: "item-1" }, { itemId: "item-1" }, { itemId: "item-other" }], reportedOutputTokens: 10,
    })).toEqual(expect.arrayContaining([
      "structured_duplicate_item_id",
      "structured_missing_item_id",
      "structured_unknown_or_cross_batch_item_id",
      "structured_membership_count_mismatch",
    ]));
  });
});
