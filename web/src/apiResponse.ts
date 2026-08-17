const SAFE_UNEXPECTED_RESPONSE_MESSAGE =
  "We couldn't complete this statement review because the analysis service stopped unexpectedly. Please try again or upload another PDF.";

export async function readRateRevealApiJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    console.error("[ratereveal-api] non-json-response", {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "unknown",
      bodyPresent: body.length > 0,
    });
    throw new Error(SAFE_UNEXPECTED_RESPONSE_MESSAGE);
  }
}
