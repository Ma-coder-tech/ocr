import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeAzureLayout,
  getAzureDocumentIntelligenceConfigFromEnv,
} from "../src/azureDocumentIntelligence.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("azure document intelligence adapter", () => {
  it("does not produce config unless endpoint and key are both present", () => {
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

    expect(getAzureDocumentIntelligenceConfigFromEnv()).toBeNull();

    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = "https://example.cognitiveservices.azure.com/";
    expect(getAzureDocumentIntelligenceConfigFromEnv()).toBeNull();
  });

  it("normalizes layout analysis into extraction metrics without exposing the key", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 202,
          headers: {
            "operation-location": "https://example.cognitiveservices.azure.com/operations/123",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status: "succeeded",
          analyzeResult: {
            content: "Total Fees $12.34",
            pages: [
              {
                pageNumber: 1,
                width: 8.5,
                height: 11,
                unit: "inch",
                lines: [{ content: "Total Fees $12.34", polygon: [0, 0, 1, 0, 1, 1, 0, 1] }],
                words: [
                  { content: "Total", confidence: 0.99 },
                  { content: "Fees", confidence: 0.98 },
                  { content: "$12.34", confidence: 0.97 },
                ],
              },
            ],
            tables: [
              {
                rowCount: 1,
                columnCount: 2,
                cells: [
                  { rowIndex: 0, columnIndex: 0, content: "Total Fees", kind: "rowHeader" },
                  { rowIndex: 0, columnIndex: 1, content: "$12.34" },
                ],
              },
            ],
          },
        }),
      );

    const result = await analyzeAzureLayout(Buffer.from("%PDF-1.7"), {
      endpoint: "https://example.cognitiveservices.azure.com/",
      key: "secret-key-that-must-not-be-returned",
      pollIntervalMs: 0,
      maxPolls: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/documentintelligence/documentModels/prebuilt-layout:analyze");
    expect(JSON.stringify(result)).not.toContain("secret-key-that-must-not-be-returned");
    expect(result.metrics).toMatchObject({
      pageCount: 1,
      lineCount: 1,
      wordCount: 3,
      tableCount: 1,
      tableCellCount: 2,
      amountTokenCount: 1,
    });
    expect(result.tables[0]?.cells[1]?.content).toBe("$12.34");
  });

  it("retries Azure rate-limit responses before failing the extraction", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: "429", message: "Rate limit" } },
          {
            status: 429,
            headers: {
              "retry-after": "0",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 202,
          headers: {
            "operation-location": "https://example.cognitiveservices.azure.com/operations/retry-ok",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          status: "succeeded",
          analyzeResult: {
            content: "Amount Funded $99.99",
            pages: [{ pageNumber: 1, lines: [{ content: "Amount Funded $99.99" }], words: [] }],
            tables: [],
          },
        }),
      );

    const result = await analyzeAzureLayout(Buffer.from("%PDF-1.7"), {
      endpoint: "https://example.cognitiveservices.azure.com/",
      key: "secret-key-that-must-not-be-returned",
      pollIntervalMs: 0,
      maxPolls: 1,
      maxRequestRetries: 1,
      requestRetryBaseDelayMs: 0,
      requestRetryMaxDelayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.metrics.amountTokenCount).toBe(1);
    expect(result.content).toBe("Amount Funded $99.99");
  });
});
