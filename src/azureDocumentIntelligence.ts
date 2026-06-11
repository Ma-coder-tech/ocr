import fs from "node:fs/promises";

export type AzureDocumentIntelligenceConfig = {
  endpoint: string;
  key: string;
  apiVersion?: string;
  pollIntervalMs?: number;
  maxPolls?: number;
  maxRequestRetries?: number;
  requestRetryBaseDelayMs?: number;
  requestRetryMaxDelayMs?: number;
};

export type AzureBoundingRegion = {
  pageNumber: number;
  polygon?: number[];
};

export type AzureLayoutLine = {
  content: string;
  pageNumber: number;
  polygon?: number[];
};

export type AzureLayoutWord = {
  content: string;
  confidence: number | null;
  pageNumber: number;
  polygon?: number[];
};

export type AzureLayoutCell = {
  content: string;
  rowIndex: number;
  columnIndex: number;
  rowSpan: number;
  columnSpan: number;
  kind: string | null;
  boundingRegions: AzureBoundingRegion[];
};

export type AzureLayoutTable = {
  rowCount: number;
  columnCount: number;
  cells: AzureLayoutCell[];
  boundingRegions: AzureBoundingRegion[];
};

export type AzureLayoutPage = {
  pageNumber: number;
  width: number | null;
  height: number | null;
  unit: string | null;
  lines: AzureLayoutLine[];
  words: AzureLayoutWord[];
};

export type AzureLayoutDocument = {
  source: "azure_document_intelligence";
  modelId: "prebuilt-layout";
  apiVersion: string;
  pages: AzureLayoutPage[];
  tables: AzureLayoutTable[];
  content: string;
  metrics: {
    pageCount: number;
    lineCount: number;
    wordCount: number;
    tableCount: number;
    tableCellCount: number;
    amountTokenCount: number;
  };
};

type AnalyzeResponse = {
  status?: string;
  analyzeResult?: {
    content?: string;
    pages?: Array<{
      pageNumber?: number;
      width?: number;
      height?: number;
      unit?: string;
      lines?: Array<{ content?: string; polygon?: number[] }>;
      words?: Array<{ content?: string; confidence?: number; polygon?: number[] }>;
    }>;
    tables?: Array<{
      rowCount?: number;
      columnCount?: number;
      boundingRegions?: AzureBoundingRegion[];
      cells?: Array<{
        content?: string;
        rowIndex?: number;
        columnIndex?: number;
        rowSpan?: number;
        columnSpan?: number;
        kind?: string;
        boundingRegions?: AzureBoundingRegion[];
      }>;
    }>;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

const DEFAULT_API_VERSION = "2024-11-30";
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_MAX_POLLS = 90;
const DEFAULT_MAX_REQUEST_RETRIES = 4;
const DEFAULT_REQUEST_RETRY_BASE_DELAY_MS = 1_000;
const DEFAULT_REQUEST_RETRY_MAX_DELAY_MS = 45_000;

export function getAzureDocumentIntelligenceConfigFromEnv(): AzureDocumentIntelligenceConfig | null {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim();
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY?.trim();
  if (!endpoint || !key) return null;

  return {
    endpoint,
    key,
    apiVersion: process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION?.trim() || DEFAULT_API_VERSION,
  };
}

export async function analyzeAzureLayoutFromFile(
  filePath: string,
  config: AzureDocumentIntelligenceConfig,
): Promise<AzureLayoutDocument> {
  const buffer = await fs.readFile(filePath);
  return analyzeAzureLayout(buffer, config);
}

export async function analyzeAzureLayout(
  pdfBuffer: Buffer,
  config: AzureDocumentIntelligenceConfig,
): Promise<AzureLayoutDocument> {
  const apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
  const endpoint = normalizeEndpoint(config.endpoint);
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=${encodeURIComponent(apiVersion)}`;
  const retryOptions = getRetryOptions(config);

  const startResponse = await fetchAzureWithRetry(analyzeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "Ocp-Apim-Subscription-Key": config.key,
    },
    body: pdfBuffer,
  }, retryOptions);

  if (!startResponse.ok) {
    throw new Error(await buildAzureErrorMessage("Azure layout analysis request failed", startResponse));
  }

  const operationLocation = startResponse.headers.get("operation-location");
  if (!operationLocation) {
    throw new Error("Azure layout analysis did not return an operation-location header.");
  }

  const result = await pollAzureAnalyzeResult(operationLocation, config.key, {
    pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    maxPolls: config.maxPolls ?? DEFAULT_MAX_POLLS,
    retryOptions,
  });

  return normalizeAzureLayoutResult(result, apiVersion);
}

async function pollAzureAnalyzeResult(
  operationLocation: string,
  key: string,
  options: { pollIntervalMs: number; maxPolls: number; retryOptions: AzureRetryOptions },
): Promise<AnalyzeResponse> {
  for (let attempt = 1; attempt <= options.maxPolls; attempt += 1) {
    const response = await fetchAzureWithRetry(operationLocation, {
      headers: {
        "Ocp-Apim-Subscription-Key": key,
      },
    }, options.retryOptions);

    if (!response.ok) {
      throw new Error(await buildAzureErrorMessage("Azure layout analysis polling failed", response));
    }

    const payload = (await response.json()) as AnalyzeResponse;
    const status = payload.status?.toLowerCase();
    if (status === "succeeded") {
      return payload;
    }
    if (status === "failed") {
      throw new Error(`Azure layout analysis failed: ${payload.error?.message ?? payload.error?.code ?? "unknown error"}`);
    }

    await sleep(options.pollIntervalMs);
  }

  throw new Error(`Azure layout analysis did not finish after ${options.maxPolls} polling attempts.`);
}

type AzureRetryOptions = {
  maxRequestRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

async function fetchAzureWithRetry(url: string, init: RequestInit, options: AzureRetryOptions): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt <= options.maxRequestRetries; attempt += 1) {
    const response = await fetch(url, init);
    if (response.status !== 429 || attempt === options.maxRequestRetries) {
      return response;
    }

    lastResponse = response;
    await sleep(getRetryDelayMs(response, attempt, options));
  }

  return lastResponse ?? fetch(url, init);
}

function getRetryOptions(config: AzureDocumentIntelligenceConfig): AzureRetryOptions {
  return {
    maxRequestRetries: config.maxRequestRetries ?? DEFAULT_MAX_REQUEST_RETRIES,
    baseDelayMs: config.requestRetryBaseDelayMs ?? DEFAULT_REQUEST_RETRY_BASE_DELAY_MS,
    maxDelayMs: config.requestRetryMaxDelayMs ?? DEFAULT_REQUEST_RETRY_MAX_DELAY_MS,
  };
}

function getRetryDelayMs(response: Response, attempt: number, options: AzureRetryOptions): number {
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(Math.ceil(retryAfterSeconds * 1_000), options.maxDelayMs);
  }

  return Math.min(options.baseDelayMs * 2 ** attempt, options.maxDelayMs);
}

function normalizeAzureLayoutResult(result: AnalyzeResponse, apiVersion: string): AzureLayoutDocument {
  const analyzeResult = result.analyzeResult;
  if (!analyzeResult) {
    throw new Error("Azure layout analysis response did not include analyzeResult.");
  }

  const pages: AzureLayoutPage[] = (analyzeResult.pages ?? []).map((page) => {
    const pageNumber = page.pageNumber ?? 0;
    return {
      pageNumber,
      width: finiteNumberOrNull(page.width),
      height: finiteNumberOrNull(page.height),
      unit: page.unit ?? null,
      lines: (page.lines ?? [])
        .map((line) => ({
          content: String(line.content ?? "").trim(),
          pageNumber,
          polygon: line.polygon,
        }))
        .filter((line) => line.content.length > 0),
      words: (page.words ?? [])
        .map((word) => ({
          content: String(word.content ?? "").trim(),
          confidence: finiteNumberOrNull(word.confidence),
          pageNumber,
          polygon: word.polygon,
        }))
        .filter((word) => word.content.length > 0),
    };
  });

  const tables: AzureLayoutTable[] = (analyzeResult.tables ?? []).map((table) => ({
    rowCount: table.rowCount ?? 0,
    columnCount: table.columnCount ?? 0,
    boundingRegions: table.boundingRegions ?? [],
    cells: (table.cells ?? []).map((cell) => ({
      content: String(cell.content ?? "").trim(),
      rowIndex: cell.rowIndex ?? 0,
      columnIndex: cell.columnIndex ?? 0,
      rowSpan: cell.rowSpan ?? 1,
      columnSpan: cell.columnSpan ?? 1,
      kind: cell.kind ?? null,
      boundingRegions: cell.boundingRegions ?? [],
    })),
  }));

  const content = analyzeResult.content ?? pages.flatMap((page) => page.lines.map((line) => line.content)).join("\n");
  const lineCount = pages.reduce((sum, page) => sum + page.lines.length, 0);
  const wordCount = pages.reduce((sum, page) => sum + page.words.length, 0);
  const tableCellCount = tables.reduce((sum, table) => sum + table.cells.length, 0);

  return {
    source: "azure_document_intelligence",
    modelId: "prebuilt-layout",
    apiVersion,
    pages,
    tables,
    content,
    metrics: {
      pageCount: pages.length,
      lineCount,
      wordCount,
      tableCount: tables.length,
      tableCellCount,
      amountTokenCount: countAmountTokens(content),
    },
  };
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/g, "");
  if (!/^https:\/\//i.test(trimmed)) {
    throw new Error("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT must start with https://");
  }
  return trimmed;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function countAmountTokens(input: string): number {
  return input.match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})/g)?.length ?? 0;
}

async function buildAzureErrorMessage(prefix: string, response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  const safeBody = body.replace(/"key"\s*:\s*"[^"]+"/gi, '"key":"[redacted]"').slice(0, 1000);
  return `${prefix}: ${response.status} ${response.statusText}${safeBody ? ` - ${safeBody}` : ""}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
