import { afterEach, describe, expect, it, vi } from "vitest";
import { readRateRevealApiJson } from "./apiResponse";

describe("RateReveal API response admission", () => {
  afterEach(() => vi.restoreAllMocks());

  it("admits normal JSON responses", async () => {
    await expect(readRateRevealApiJson<{ jobId: string }>(new Response('{"jobId":"job-safe"}', {
      status: 201,
      headers: { "content-type": "application/json" },
    }))).resolves.toEqual({ jobId: "job-safe" });
  });

  it("maps non-JSON serverless failures to safe recovery without logging the response body", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = new Response("An error occurred with private infrastructure detail", {
      status: 504,
      headers: { "content-type": "text/plain" },
    });

    await expect(readRateRevealApiJson(response)).rejects.toThrow(
      "We couldn't complete this statement review because the analysis service stopped unexpectedly.",
    );
    expect(consoleError).toHaveBeenCalledWith("[ratereveal-api] non-json-response", {
      status: 504,
      contentType: "text/plain",
      bodyPresent: true,
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("private infrastructure detail");
  });
});
