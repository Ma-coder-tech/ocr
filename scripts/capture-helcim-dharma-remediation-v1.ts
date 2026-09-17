import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const OUTPUT_ROOT = "evidence/commercial-source-capture-remediation-helcim-dharma-v1";
const ARTIFACT_ROOT = `${OUTPUT_ROOT}/artifacts`;
const FAILURE_ROOT = `${OUTPUT_ROOT}/failure-artifacts`;
const CDP_LIST_URL = "http://127.0.0.1:9223/json/list";
const LOAD_TIMEOUT_MS = 25_000;
const RENDER_SETTLE_MS = 3_000;

type SourceSpec = {
  captureId: string;
  provider: "helcim" | "dharma_merchant_services";
  sourceIdentity: string;
  sourceObservationId: string;
  requestedUrl: string;
  expectedAnchors: string[];
};

type CdpEvent = { method?: string; params?: any };
class CdpClient {
  private socket: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  readonly listeners = new Set<(event: CdpEvent) => void>();
  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener("message", (event) => {
      const value = JSON.parse(String(event.data));
      if (typeof value.id === "number") {
        const pending = this.pending.get(value.id);
        if (!pending) return;
        this.pending.delete(value.id);
        if (value.error) pending.reject(new Error(`${value.error.code}: ${value.error.message}`));
        else pending.resolve(value.result ?? {});
        return;
      }
      for (const listener of this.listeners) listener(value);
    });
  }
  async open(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("CDP WebSocket failed to open.")), { once: true });
    });
  }
  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  waitFor(method: string, timeoutMs: number): Promise<CdpEvent> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.listeners.delete(listener); reject(new Error(`${method} timed out after ${timeoutMs}ms.`)); }, timeoutMs);
      const listener = (event: CdpEvent) => {
        if (event.method !== method) return;
        clearTimeout(timeout);
        this.listeners.delete(listener);
        resolve(event);
      };
      this.listeners.add(listener);
    });
  }
  async close(): Promise<void> { this.socket.close(); }
}

const SOURCES: SourceSpec[] = [
  source("h1_helcim_fee_disclosures", "helcim", "us_fee_disclosures", "obs_helcim_h1_fee_disclosures_v1", "https://legal.helcim.com/us/fee-disclosures/", ["$1,000,001", "April 1, 2026", "Interchange Plus"]),
  source("h2_helcim_public_pricing", "helcim", "direct_public_pricing", "obs_helcim_h2_public_pricing_v1", "https://www.helcim.com/pricing/", ["$1M", "$5M", "custom"]),
  source("h3_helcim_acceptable_use", "helcim", "us_acceptable_use_policy", "obs_helcim_h3_acceptable_use_v1", "https://legal.helcim.com/us/acceptable-use-policy/", ["Prohibited", "Restricted", "August 15, 2025"]),
  source("h4_helcim_terms", "helcim", "us_merchant_terms", "obs_helcim_h4_terms_v1", "https://legal.helcim.com/us/terms-of-service/", ["application", "reject"]),
  source("d1_dharma_retail", "dharma_merchant_services", "direct_standard_retail", "obs_dharma_d1_retail_v1", "https://dharmamerchantservices.com/industries/retail-small-business/rates-fees/", ["$20/month", "0.15% + $0.08/authorization", "0.25% + $0.08/authorization"]),
  source("d2_dharma_virtual", "dharma_merchant_services", "direct_standard_virtual_online", "obs_dharma_d2_virtual_v1", "https://dharmamerchantservices.com/industries/ecommerce-online/rates-fees/", ["$20/month", "0.20% + $0.11/authorization", "0.30% + $0.11/authorization"]),
  source("d3_dharma_high_volume", "dharma_merchant_services", "direct_high_volume", "obs_dharma_d3_high_volume_v1", "https://dharmamerchantservices.com/pricing/high-volume-pricing/", ["$15/month", "0.10%", "0.20%", "$0.08 / authorization", "$0.11 / authorization"]),
  source("d4_dharma_supported_businesses", "dharma_merchant_services", "provider_supported_businesses_policy", "obs_dharma_d4_supported_businesses_v1", "https://dharmamerchantservices.com/faq/supported-businesses/", ["high-risk", "refer"]),
  source("d5_dharma_closure", "dharma_merchant_services", "provider_closure_policy", "obs_dharma_d5_closure_v1", "https://dharmamerchantservices.com/faq/is-there-a-closure-fee/", ["$49", "closure", "early termination"]),
  source("d6_dharma_pci", "dharma_merchant_services", "provider_pci_policy", "obs_dharma_d6_pci_v1", "https://dharmamerchantservices.com/resources/pci-compliance/", ["$39.95", "non-compliance", "PCI"]),
  source("d7_dharma_calculator", "dharma_merchant_services", "direct_plan_calculator_conflict", "obs_dharma_calculator_conflict_v1", "https://dharmamerchantservices.com/calculate-costs/cut-the-fat/", ["$25", "$20", "$15"]),
  source("d8_dharma_referral", "dharma_merchant_services", "teghkhuman_referral_special_offer", "obs_dharma_referral_isolation_v1", "https://dharmamerchantservices.com/getting-started/teghkhuman/", ["Tegh Khuman", "$12", "0.10%"]),
];

if (SOURCES.length !== 12 || new Set(SOURCES.map((item) => item.requestedUrl)).size !== 12) {
  throw new Error("The remediation capture set must contain exactly 12 distinct Product-authorized URLs.");
}

await mkdir(ARTIFACT_ROOT, { recursive: true });
await mkdir(FAILURE_ROOT, { recursive: true });

const targets = await (await fetch(CDP_LIST_URL)).json() as Array<{ type: string; url: string; webSocketDebuggerUrl?: string }>;
const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
if (!target?.webSocketDebuggerUrl) throw new Error("No isolated remediation browser page target is available.");

const cdp = new CdpClient(target.webSocketDebuggerUrl);
await cdp.open();
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Network.enable");

const records = [];
for (const spec of SOURCES) {
  const startedAt = new Date().toISOString();
  let documentResponse: null | { url: string; status: number; statusText: string; mimeType: string } = null;
  const responseListener = (event: CdpEvent) => {
    if (event.method === "Network.responseReceived" && event.params?.type === "Document") {
      documentResponse = {
        url: String(event.params.response?.url ?? ""),
        status: Number(event.params.response?.status ?? 0),
        statusText: String(event.params.response?.statusText ?? ""),
        mimeType: String(event.params.response?.mimeType ?? ""),
      };
    }
  };
  cdp.listeners.add(responseListener);
  let navigationError: string | null = null;
  try {
    const loaded = cdp.waitFor("Page.loadEventFired", LOAD_TIMEOUT_MS);
    const navigation = await cdp.send("Page.navigate", { url: spec.requestedUrl });
    if (navigation.errorText) navigationError = String(navigation.errorText);
    await loaded;
  } catch (error) {
    navigationError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  await new Promise((resolve) => setTimeout(resolve, RENDER_SETTLE_MS));
  cdp.listeners.delete(responseListener);

  const page = await cdp.send("Runtime.evaluate", {
    expression: "JSON.stringify({title:document.title,finalUrl:location.href,readyState:document.readyState,text:document.body?.innerText||''})",
    returnByValue: true,
  });
  const pageState = JSON.parse(String(page.result?.value ?? "{}")) as { title?: string; finalUrl?: string; readyState?: string; text?: string };
  const renderedText = pageState.text ?? "";
  const normalizedText = normalize(renderedText);
  const matchedAnchors = spec.expectedAnchors.filter((anchor) => normalizedText.includes(normalize(anchor)));
  const missingAnchors = spec.expectedAnchors.filter((anchor) => !matchedAnchors.includes(anchor));
  const denialMarker = ["403 forbidden", "sorry, you have been blocked", "access to this site has been limited", "cloudflare ray id", "attention required"].find((marker) => normalizedText.includes(marker)) ?? null;
  const hostChanged = pageState.finalUrl ? new URL(pageState.finalUrl).hostname !== new URL(spec.requestedUrl).hostname : false;
  const print = await cdp.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: false, paperWidth: 8.5, paperHeight: 11, marginTop: 0.35, marginBottom: 0.35, marginLeft: 0.35, marginRight: 0.35 });
  const pdfBytes = Buffer.from(String(print.data ?? ""), "base64");
  const usable = !navigationError && !denialMarker && !hostChanged && pdfBytes.byteLength > 0 && matchedAnchors.length > 0;
  const relativePath = `${usable ? ARTIFACT_ROOT : FAILURE_ROOT}/${spec.captureId}.rendered.pdf`;
  await writeFile(relativePath, pdfBytes);

  records.push({
    captureId: spec.captureId,
    provider: spec.provider,
    sourceIdentity: spec.sourceIdentity,
    sourceObservationId: spec.sourceObservationId,
    relationshipToAdmittedObservation: "rendered_first_party_capture_for_existing_product_adjudicated_observation",
    requestedUrl: spec.requestedUrl,
    finalUrl: pageState.finalUrl ?? documentResponse?.url ?? null,
    redirected: pageState.finalUrl ? pageState.finalUrl !== spec.requestedUrl : null,
    retrievalTimestampUtc: startedAt,
    timezone: "UTC",
    browserProfile: "fresh_temporary_noncredentialed_profile",
    captureMethod: "browser_rendered_print_to_pdf",
    contentType: "application/pdf",
    mainDocumentHttpStatus: documentResponse?.status ?? null,
    mainDocumentHttpStatusText: documentResponse?.statusText ?? null,
    mainDocumentMimeType: documentResponse?.mimeType ?? null,
    pageTitle: pageState.title ?? null,
    pageReadyState: pageState.readyState ?? null,
    byteLength: pdfBytes.byteLength,
    artifactPath: relativePath,
    artifactSha256: sha256(pdfBytes),
    artifactRole: usable ? "immutable_first_party_rendered_F1" : "remediation_failure_evidence_not_F1",
    remediationState: usable ? "captured" : "immutable_capture_unavailable_after_remediation",
    expectedAnchors: spec.expectedAnchors,
    matchedAnchors,
    missingAnchors,
    denialMarker,
    navigationError,
    hostChanged,
    credentialsUsed: false,
    authenticationUsed: false,
    antiBotBypassUsed: false,
  });
}

await cdp.close();
const manifest = {
  schemaVersion: "helcim_dharma_immutable_capture_remediation_manifest_2026_09_10_v1",
  productAuthority: {
    document: "RateReveal_Helcim_Dharma_Immutable_Capture_Remediation_Product_Authority_v1.md",
    sha256: "fdce0458e370b0ac9c532e5abd187c1470801e22fec8292036ca00de85eb3658",
  },
  exactBaseline: "ad33214ab99253c1fe5bfa151e1c6e7e99d8c642",
  constraints: {
    authorizedUrlCount: 12,
    urlsAttempted: records.length,
    generalWebSearchUsed: false,
    alternativeSourcesUsed: false,
    cookiesOrAuthenticationUsed: false,
    antiBotBypassUsed: false,
    unrelatedPagesCaptured: false,
  },
  records,
};
await writeFile(`${OUTPUT_ROOT}/capture-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ manifest: `${OUTPUT_ROOT}/capture-manifest.json`, attempted: records.length, captured: records.filter((item) => item.remediationState === "captured").length, unavailableAfterRemediation: records.filter((item) => item.remediationState !== "captured").length }, null, 2));

function source(captureId: string, provider: SourceSpec["provider"], sourceIdentity: string, sourceObservationId: string, requestedUrl: string, expectedAnchors: string[]): SourceSpec {
  return { captureId, provider, sourceIdentity, sourceObservationId, requestedUrl, expectedAnchors };
}
function normalize(value: string): string { return value.toLowerCase().replace(/[\s\u00a0]+/g, " ").replace(/[–—]/g, "-").trim(); }
function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
