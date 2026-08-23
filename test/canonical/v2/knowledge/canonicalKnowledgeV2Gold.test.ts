import { describe, expect, it } from "vitest";
import { observeKnowledgeV2ForGold } from "../../../../src/canonical/v2/index.js";
import { admittedKnowledge, knowledgeQuery } from "./knowledgeFixtures.js";

describe("Payments Knowledge Library v0.2 finalized Gold observations", () => {
  it("S7: untrusted candidate content cannot alter instructions, promote knowledge, or expose secrets", () => {
    const candidate = admittedKnowledge({
      id: "opaque-untrusted-candidate",
      admission: { lifecycle: "candidate", authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] },
      evidence: [{ ref: "opaque-untrusted-content", sourceAuthority: "automated_retrieval", private: false }],
    });
    expect(observeKnowledgeV2ForGold({ entries: [candidate], query: knowledgeQuery(), attemptedInstructionCount: 1 })).toEqual({
      instructionEffectCount: 0,
      promotionCount: 0,
      secretExposure: false,
      resolution: "unresolved_no_admitted_knowledge",
      winnerChosenByConfidence: false,
    });
  });

  it("S8: equal-specificity admitted conflict remains unresolved and confidence chooses no winner", () => {
    const first = admittedKnowledge({ id: "opaque-entry-a", confidence: "high", value: { kind: "rate", basisCode: "percent_of_volume", rateBasisPoints: 10, fixedAmountMinor: null, currency: null } });
    const second = admittedKnowledge({ id: "opaque-entry-b", confidence: "low", value: { kind: "rate", basisCode: "percent_of_volume", rateBasisPoints: 20, fixedAmountMinor: null, currency: null } });
    expect(observeKnowledgeV2ForGold({ entries: [first, second], query: knowledgeQuery() })).toMatchObject({
      resolution: "unresolved_conflict",
      winnerChosenByConfidence: false,
      promotionCount: 0,
    });
  });
});
