import { describe, expect, it } from "vitest";
import {
  authorizedQuestionPayload,
  candidateOnlyContributions,
  runOpenWorldLiveResearchEvaluationV1,
  sanitizeAuthorizedFeeLabel,
} from "../../scripts/evaluate-open-world-live-research-v1.js";

describe("open-world live research evaluation v1 safety boundary", () => {
  it("requires the exact Product authorization before credential access or provider work", async () => {
    await expect(runOpenWorldLiveResearchEvaluationV1({ authorization: null, apiKey: "unused" }))
      .rejects.toThrow("exact_product_authorization_required");
  });

  it("converts AI research only into non-admitted competing-interpretation contributions", () => {
    const contributions = candidateOnlyContributions({
      attempts: [],
      candidates: [],
      claimSupports: [],
      intelligence: [{
        feeRowRef: "fee-row-1",
        reasonCodes: ["fee_knowledge_ai_investigative_intelligence"],
        summary: "A processor-program interpretation is plausible, but network ownership remains unresolved.",
        basis: { candidateRefs: ["candidate-1"] },
      }],
    } as any, ["fee-row-1"]);

    expect(contributions).toHaveLength(1);
    expect(contributions[0]).toMatchObject({
      targetFeeRowId: "fee-row-1",
      status: "candidate_only",
      reviewedAt: null,
      admission: null,
      aiAssisted: true,
      claims: {},
      sourceRefs: ["candidate-1"],
    });
    expect(contributions[0]?.limitations).toEqual(expect.arrayContaining([
      expect.stringContaining("cannot alter canonical facts"),
      expect.stringContaining("Product/domain review"),
    ]));
  });

  it("limits provider question context and redacts numeric statement values embedded in labels", () => {
    const label = "Other - BATCH SETTLEMENT FEE 56 TRANSACTIONS AT 0.15 TIMES $1,234.56";
    const payload = authorizedQuestionPayload({
      processorOrNetwork: "Clover",
      statementPeriodYear: "2024",
      statementSection: "individual_charge",
      feeLabel: label,
    });

    expect(Object.keys(payload).sort()).toEqual([
      "printedFeeLabel",
      "processorName",
      "statementRole",
      "statementYear",
    ]);
    expect(payload.printedFeeLabel).toBe(sanitizeAuthorizedFeeLabel(label));
    expect(payload.printedFeeLabel).not.toContain("56");
    expect(payload.printedFeeLabel).not.toContain("0.15");
    expect(payload.printedFeeLabel).not.toContain("1,234.56");
  });
});
