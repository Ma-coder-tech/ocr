import { describe, expect, it, vi } from "vitest";
import { runMerchantAttentionAiRuntime } from "../../src/canonical/merchantAttentionAiRuntime.js";
import { package3Analysis, validPackage3Interpretation } from "./package3TestFixture.js";

describe("Package 3 merchant-language AI runtime", () => {
  it("uses admitted structured interpretation on the normal eligible path without changing authoritative layers", async () => {
    const analysis = package3Analysis([{ label: "ADDITIONAL FEES", amount: 9.48 }]);
    const protectedBefore = protectedProjection(analysis);
    const result = await runMerchantAttentionAiRuntime({
      model: analysis.merchantAttention,
      options: { adapter: async () => validPackage3Interpretation(analysis.merchantAttention) },
    });
    expect(result.status).toBe("admitted");
    expect(result.model.interpretation).toMatchObject({ source: "admitted_ai_interpretation", readiness: "ready" });
    expect(protectedProjection(analysis)).toEqual(protectedBefore);
  });

  it("keeps routine inventory deterministic and does not call a provider", async () => {
    const analysis = package3Analysis([{ label: "VISA INTERCHANGE", amount: 20, section: "Interchange Charges" }]);
    const adapter = vi.fn();
    const result = await runMerchantAttentionAiRuntime({ model: analysis.merchantAttention, options: { adapter } });
    expect(result.status).toBe("not_needed");
    expect(adapter).not.toHaveBeenCalled();
    expect(result.model.interpretation.source).toBe("deterministic_fallback");
  });

  it("sends only the bounded privacy-safe packet", async () => {
    const analysis = package3Analysis([{ label: "SERVICE ACCOUNT 1234-5678-9012", amount: 8 }]);
    analysis.identity.merchantName.value = "Private Merchant";
    analysis.identity.merchantIdentifier.value = "secret-account";
    let captured = "";
    await runMerchantAttentionAiRuntime({
      model: analysis.merchantAttention,
      options: { adapter: async (packet) => { captured = JSON.stringify(packet); return validPackage3Interpretation(analysis.merchantAttention); } },
    });
    expect(captured).not.toMatch(/Private Merchant|secret-account|1234-5678-9012|sourceDocumentRef|"rawStatementTextIncluded":true|\.pdf|\/Users\//i);
    expect(captured).toContain("[redacted]");
  });

  it("falls back safely for timeout, invalid schema, and semantic rejection", async () => {
    const analysis = package3Analysis([{ label: "ADDITIONAL FEES", amount: 9.48 }]);
    const timedOut = await runMerchantAttentionAiRuntime({
      model: analysis.merchantAttention,
      options: { timeoutMs: 5, adapter: async () => new Promise(() => undefined) },
    });
    const invalid = await runMerchantAttentionAiRuntime({ model: analysis.merchantAttention, options: { adapter: async () => ({ unsafe: true }) } });
    const strengthenedOutput = validPackage3Interpretation(analysis.merchantAttention);
    strengthenedOutput.items[0].reasonableConclusion = "This fee is definitely removable.";
    const strengthened = await runMerchantAttentionAiRuntime({ model: analysis.merchantAttention, options: { adapter: async () => strengthenedOutput } });
    expect([timedOut.status, invalid.status, strengthened.status]).toEqual(["timed_out", "rejected", "rejected"]);
    for (const result of [timedOut, invalid, strengthened]) expect(result.model).toEqual(analysis.merchantAttention);
  });

  it("returns provider-unavailable with zero calls when no credential or adapter exists", async () => {
    const analysis = package3Analysis([{ label: "ADDITIONAL FEES", amount: 9.48 }]);
    const result = await runMerchantAttentionAiRuntime({
      model: analysis.merchantAttention,
      options: { anthropicApiKey: "", openAiApiKey: "" },
    });
    expect(result).toMatchObject({ status: "provider_unavailable", attempted: false, admittedItemCount: 0 });
  });

  it("emits only bounded usage metadata from provider transport", async () => {
    const analysis = package3Analysis([{ label: "ADDITIONAL FEES", amount: 9.48 }]);
    const usage: unknown[] = [];
    const result = await runMerchantAttentionAiRuntime({
      model: analysis.merchantAttention,
      options: {
        provider: "openai",
        openAiApiKey: "test-only-key",
        sdk: {
          generateObject: async () => ({}),
          generateText: async () => ({
            output: validPackage3Interpretation(analysis.merchantAttention),
            usage: { inputTokens: 120, cachedInputTokens: 20, outputTokens: 80 },
            response: { id: "safe-request-id" },
          }),
          Output: { object: () => ({}) },
          createOpenAI: () => () => ({ fake: true }),
        },
        onProviderUsage: (value) => usage.push(value),
      },
    });
    expect(result.status).toBe("admitted");
    expect(usage).toEqual([{ requestId: "safe-request-id", inputTokens: 120, cachedInputTokens: 20, outputTokens: 80 }]);
    expect(JSON.stringify(usage)).not.toMatch(/test-only-key|prompt|response body/i);
  });

  it("batches a large eligible population and admits only after exact combined coverage", async () => {
    const analysis = package3Analysis([
      { label: "ADDITIONAL FEES", amount: 9.48 },
      { label: "PAPER STATEMENT FEE", amount: 5 },
      { label: "PROCESSOR MARKUP", amount: 100 },
    ]);
    const full = validPackage3Interpretation(analysis.merchantAttention);
    let calls = 0;
    const result = await runMerchantAttentionAiRuntime({
      model: analysis.merchantAttention,
      options: {
        maxItemsPerRequest: 1,
        adapter: async (packet) => {
          calls += 1;
          const allowed = new Set(packet.items.map((item) => item.attentionItemId));
          return { ...full, outputId: `merchant_language_batch_${calls}`, items: full.items.filter((item: any) => allowed.has(item.attentionItemId)) };
        },
      },
    });
    expect(calls).toBe(result.eligibleItemCount);
    expect(result).toMatchObject({ status: "admitted", admittedItemCount: result.eligibleItemCount });
  });
});

function protectedProjection(analysis: ReturnType<typeof package3Analysis>) {
  return structuredClone({
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    calculations: analysis.calculations,
  });
}
