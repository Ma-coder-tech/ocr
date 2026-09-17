import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_ROOT = "evidence/commercial-source-captures/v1";
const ARTIFACT_ROOT = `${OUTPUT_ROOT}/artifacts`;
const RETRIEVAL_TIMEOUT_MS = 60_000;

type SourceSpec = {
  captureId: string;
  provider: "authorize_net" | "helcim" | "dharma_merchant_services";
  sourceIdentity: string;
  observationId: string;
  requestedUrl: string;
  expectedGenre: "html" | "pdf";
  expectedAnchors: string[];
};

const SOURCES: SourceSpec[] = [
  source("a1_authorize_net_gateway_pricing", "authorize_net", "direct_gateway_only_pricing", "commercial_source_obs_authorize_net_direct_gateway_pricing_2026_09_10_v1", "https://www.authorize.net/sign-up/pricing.html", "html", ["Gateway only", "$25", "10¢", "batch"]),
  source("a2_authorize_net_account_updater", "authorize_net", "direct_account_updater_datasheet", "commercial_source_obs_authorize_net_account_updater_datasheet_2026_09_10_v1", "https://www.authorize.net/content/dam/documents/en/account-updater.pdf", "pdf", ["$0.25", "successful", "updated response"]),
  source("a3_authorize_net_direct_partner_support", "authorize_net", "direct_vs_partner_plan_taxonomy", "commercial_source_obs_authorize_net_support_ka_07342_2026_09_10_v1", "https://support.authorize.net/knowledgebase/Knowledgearticle/?code=KA-07342", "html", ["KA-07342", "Payment Gateway", "partner", "04/09/2025"]),
  source("h1_helcim_fee_disclosures", "helcim", "us_fee_disclosures", "obs_helcim_h1_fee_disclosures_v1", "https://legal.helcim.com/us/fee-disclosures/", "html", ["February 2, 2026", "April 1, 2026", "$1,000,001", "Interchange Plus"]),
  source("h2_helcim_public_pricing", "helcim", "direct_public_pricing", "obs_helcim_h2_public_pricing_v1", "https://www.helcim.com/pricing/", "html", ["$1M", "$5M", "$5 million", "+0.4%"]),
  source("h3_helcim_acceptable_use", "helcim", "us_acceptable_use_policy", "obs_helcim_h3_acceptable_use_v1", "https://legal.helcim.com/us/acceptable-use-policy/", "html", ["August 15, 2025", "Prohibited Businesses", "Restricted Businesses", "review"]),
  source("h4_helcim_terms", "helcim", "us_merchant_terms", "obs_helcim_h4_terms_v1", "https://legal.helcim.com/us/terms-of-service/", "html", ["Terms", "application", "reject"]),
  source("d1_dharma_retail", "dharma_merchant_services", "direct_standard_retail", "obs_dharma_d1_retail_v1", "https://dharmamerchantservices.com/industries/retail-small-business/rates-fees/", "html", ["$20", "0.15%", "$0.08", "authorization"]),
  source("d2_dharma_virtual", "dharma_merchant_services", "direct_standard_virtual_online", "obs_dharma_d2_virtual_v1", "https://dharmamerchantservices.com/industries/ecommerce-online/rates-fees/", "html", ["$20", "0.20%", "$0.11", "authorization"]),
  source("d3_dharma_high_volume", "dharma_merchant_services", "direct_high_volume", "obs_dharma_d3_high_volume_v1", "https://dharmamerchantservices.com/pricing/high-volume-pricing/", "html", ["$15", "0.10%", "$0.08", "$0.11", "$25 or less"]),
  source("d4_dharma_supported_businesses", "dharma_merchant_services", "provider_supported_businesses_policy", "obs_dharma_d4_supported_businesses_v1", "https://dharmamerchantservices.com/faq/supported-businesses/", "html", ["high-risk", "refer"]),
  source("d5_dharma_closure", "dharma_merchant_services", "provider_closure_policy", "obs_dharma_d5_closure_v1", "https://dharmamerchantservices.com/faq/is-there-a-closure-fee/", "html", ["$49", "closure", "early termination"]),
  source("d6_dharma_pci", "dharma_merchant_services", "provider_pci_policy", "obs_dharma_d6_pci_v1", "https://dharmamerchantservices.com/resources/pci-compliance/", "html", ["$39.95", "non-compliance", "PCI"]),
  source("d7_dharma_calculator", "dharma_merchant_services", "direct_plan_calculator_conflict", "obs_dharma_calculator_conflict_v1", "https://dharmamerchantservices.com/calculate-costs/cut-the-fat/", "html", ["$25", "$20", "high volume"]),
  source("d8_dharma_referral", "dharma_merchant_services", "teghkhuman_referral_special_offer", "obs_dharma_referral_isolation_v1", "https://dharmamerchantservices.com/getting-started/teghkhuman/", "html", ["$12", "0.10%", "$0.08", "$0.11"]),
];

if (SOURCES.length !== 15 || new Set(SOURCES.map((item) => item.requestedUrl)).size !== 15) {
  throw new Error("The Product-authorized capture set must contain exactly 15 distinct URLs.");
}

await mkdir(ARTIFACT_ROOT, { recursive: true });
const attemptedAt = new Date().toISOString();
const records = [];
for (const spec of SOURCES) {
  const retrievedAt = new Date().toISOString();
  try {
    const response = await fetch(spec.requestedUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(RETRIEVAL_TIMEOUT_MS),
      headers: {
        Accept: spec.expectedGenre === "pdf" ? "application/pdf" : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": "RateReveal-Immutable-Source-Capture/1.0 (+bounded Product-authorized audit capture)",
      },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type");
    const looksPdf = isPdf(bytes, contentType);
    const extension = looksPdf ? "pdf" : "html";
    const relativeArtifactPath = `${ARTIFACT_ROOT}/${spec.captureId}.${extension}`;
    await writeFile(relativeArtifactPath, bytes);
    records.push({
      captureId: spec.captureId,
      provider: spec.provider,
      sourceIdentity: spec.sourceIdentity,
      sourceObservationId: spec.observationId,
      relationshipToAdmittedObservation: "immutable_first_party_f1_for_existing_product_adjudicated_observation",
      requestedUrl: spec.requestedUrl,
      finalUrl: response.url,
      redirected: response.redirected || response.url !== spec.requestedUrl,
      retrievalTimestampUtc: retrievedAt,
      timezone: "UTC",
      httpStatus: response.status,
      httpStatusText: response.statusText,
      contentType,
      captureMethod: looksPdf ? "original_pdf_response_body" : "original_http_response_body",
      captureState: response.ok && bytes.byteLength > 0 ? "captured" : "capture_unavailable",
      byteLength: bytes.byteLength,
      etag: response.headers.get("etag"),
      lastModifiedHeader: response.headers.get("last-modified"),
      artifactPath: relativeArtifactPath,
      artifactSha256: sha256(bytes),
      expectedGenre: spec.expectedGenre,
      expectedAnchors: spec.expectedAnchors,
      sensitiveHeadersRetained: [],
      attemptCount: 1,
      failure: response.ok ? null : `HTTP ${response.status} ${response.statusText}`,
    });
  } catch (error) {
    records.push({
      captureId: spec.captureId,
      provider: spec.provider,
      sourceIdentity: spec.sourceIdentity,
      sourceObservationId: spec.observationId,
      relationshipToAdmittedObservation: "immutable_first_party_f1_for_existing_product_adjudicated_observation",
      requestedUrl: spec.requestedUrl,
      finalUrl: null,
      redirected: null,
      retrievalTimestampUtc: retrievedAt,
      timezone: "UTC",
      httpStatus: null,
      httpStatusText: null,
      contentType: null,
      captureMethod: "capture_unavailable",
      captureState: "capture_unavailable",
      byteLength: null,
      etag: null,
      lastModifiedHeader: null,
      artifactPath: null,
      artifactSha256: null,
      expectedGenre: spec.expectedGenre,
      expectedAnchors: spec.expectedAnchors,
      sensitiveHeadersRetained: [],
      attemptCount: 1,
      failure: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }
}

const manifest = {
  schemaVersion: "immutable_first_party_commercial_source_capture_manifest_2026_09_10_v1",
  captureRunStartedAtUtc: attemptedAt,
  captureRunCompletedAtUtc: new Date().toISOString(),
  productAuthority: {
    document: "RateReveal_Immutable_FirstParty_Commercial_Source_Capture_Baseline_Product_Authority_v1.md",
    sha256: "7efd4f553f2b9a61ee6cace0d7e1a0b8a395e44a276f8f61c50e32b80aead412",
  },
  constraints: {
    authorizedUrlCount: 15,
    urlsAttempted: records.length,
    retries: 0,
    generalWebSearchUsed: false,
    alternativeSourcesUsed: false,
    cookiesOrAuthenticationUsed: false,
    sensitiveHeadersRetained: false,
  },
  records,
};
await writeFile(`${OUTPUT_ROOT}/capture-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ manifest: `${OUTPUT_ROOT}/capture-manifest.json`, attempted: records.length, captured: records.filter((item) => item.captureState === "captured").length, unavailable: records.filter((item) => item.captureState === "capture_unavailable").length }, null, 2));

function source(captureId: string, provider: SourceSpec["provider"], sourceIdentity: string, observationId: string, requestedUrl: string, expectedGenre: SourceSpec["expectedGenre"], expectedAnchors: string[]): SourceSpec {
  return { captureId, provider, sourceIdentity, observationId, requestedUrl, expectedGenre, expectedAnchors };
}
function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function isPdf(bytes: Uint8Array, contentType: string | null): boolean {
  return contentType?.toLowerCase().includes("application/pdf") === true || new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-";
}
