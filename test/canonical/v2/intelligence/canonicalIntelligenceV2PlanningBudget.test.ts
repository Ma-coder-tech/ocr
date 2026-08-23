import { describe, expect, it } from "vitest";
import {
  IntelligenceBudgetExceeded,
  IntelligenceBudgetLedger,
  RG_FREE_V1_BUDGET,
  planRuntimeResearchQuestions,
  validateRgFreeV1Budget,
} from "../../../../src/canonical/v2/index.js";
import { admittedRule, questionOrigin, queryScope, unknownItem } from "./intelligenceFixtures.js";

describe("Canonical Intelligence V2 question planning and RG-FREE-v1 budget", () => {
  it("implements the exact approved RG-FREE-v1 profile and consumes failed/unknown calls", () => {
    expect(validateRgFreeV1Budget(RG_FREE_V1_BUDGET)).toEqual([]);
    expect(RG_FREE_V1_BUDGET).toMatchObject({
      maxSelectedQuestions: 4,
      maxSearchCalls: 8,
      maxCandidatesPerQuestion: 3,
      maxCandidatesTotal: 8,
      maxRetrievalDocuments: 8,
      maxRetrievalBytesPerDocument: 5_242_880,
      maxRetrievalBytesTotal: 20_971_520,
      maxInvestigativeAiCalls: 4,
      maxSemanticVerificationCalls: 4,
      maxLanguageCalls: 2,
      automaticProviderRetries: 0,
      schemaRepairRetries: 0,
    });
    const ledger = new IntelligenceBudgetLedger();
    ledger.reserve({ reservationId: "search-1", operationId: "search-op-1", dimension: "search_calls", amount: 1 });
    ledger.settle("search-1", { state: "timeout", usageKnown: false });
    expect(ledger.snapshot().consumed.search_calls).toBe(1);
    expect(ledger.snapshot().reservations[0]).toMatchObject({ state: "timeout", usageState: "unknown_possible_billable" });
    for (let index = 2; index <= 8; index += 1) ledger.reserveAndComplete({ reservationId: `search-${index}`, operationId: `search-op-${index}`, dimension: "search_calls", amount: 1 });
    expect(() => ledger.reserve({ reservationId: "search-9", operationId: "search-op-9", dimension: "search_calls", amount: 1 })).toThrow(IntelligenceBudgetExceeded);
  });

  it("reconciles successful byte/token reservations but never refunds unknown usage", () => {
    const ledger = new IntelligenceBudgetLedger();
    ledger.reserve({ reservationId: "bytes-1", operationId: "retrieval-1", dimension: "retrieval_bytes", amount: 5_242_880 });
    ledger.settle("bytes-1", { state: "completed", actualAmount: 1_024 });
    ledger.reserve({ reservationId: "tokens-1", operationId: "semantic-1", dimension: "model_output_tokens", amount: 1_200 });
    ledger.settle("tokens-1", { state: "indeterminate", usageKnown: false });
    expect(ledger.snapshot().consumed).toMatchObject({ retrieval_bytes: 1_024, model_output_tokens: 1_200 });
  });

  it("resolves RF first, refuses private-document questions, deduplicates, and selects four deterministically", () => {
    const resolved = unknownItem({ id: "resolved-rule", subjectCode: "visa_future_rule" });
    const privateQuestion = unknownItem({
      id: "contract-term",
      claimType: "merchant_account_term",
      subjectCode: "private_pricing_term",
      requiredSourceAuthorities: ["merchant_contract"],
      dependencyCodes: ["merchant_pricing_document_required"],
    });
    const publicItems = Array.from({ length: 6 }, (_, index) => unknownItem({
      id: `public-${index + 1}`,
      subjectCode: `public_rule_${index + 1}`,
      originatingCanonicalRefs: [`notice-${index + 1}`],
    }));
    const duplicate = unknownItem({ ...publicItems[0], id: "public-1-duplicate" });
    const origins = [
      questionOrigin("resolved-rule"),
      questionOrigin("contract-term"),
      ...publicItems.map((item, index) => questionOrigin(item.id, { originatingCanonicalRefs: [`notice-${index + 1}`] })),
      questionOrigin("public-1-duplicate", { originatingCanonicalRefs: ["notice-1"] }),
    ];
    const planned = planRuntimeResearchQuestions({
      entries: [admittedRule()],
      unknownQueue: [privateQuestion, ...publicItems.slice().reverse(), duplicate, resolved],
      origins: origins.slice().reverse(),
      maximumSelectedQuestions: 4,
    });
    expect(planned.filter((item) => item.eligibility === "rf_resolved")).toHaveLength(1);
    expect(planned.find((item) => item.subjectCode === "private_pricing_term")?.eligibility).toBe("merchant_pricing_document_required");
    expect(planned.filter((item) => item.selection === "selected")).toHaveLength(4);
    expect(planned.filter((item) => item.reasonCodes.includes("semantic_duplicates_merged"))).toHaveLength(1);
    expect(planned.filter((item) => item.selection === "not_selected")).toHaveLength(2);
    expect(planned.map((item) => item.questionId)).toEqual([...planned.map((item) => item.questionId)].sort());
    expect(planned.every((item) => item.scope.tenantRef === queryScope.tenantRef)).toBe(true);
  });
});
