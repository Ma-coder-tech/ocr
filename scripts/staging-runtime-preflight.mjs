import path from "node:path";

const requiredValues = {
  RATEREVEAL_REPORT_V2_ENABLED: "true",
  RATEREVEAL_FEE_KNOWLEDGE_RESEARCH_ENABLED: "true",
  RATEREVEAL_FEE_KNOWLEDGE_INVESTIGATIVE_AI_ENABLED: "true",
  RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_ENABLED: "true",
  RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_PROVIDER: "openai",
  RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_TIMEOUT_MS: "180000",
  RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_MAX_ROWS_PER_REQUEST: "20",
  RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_MAX_CONCURRENT_REQUESTS: "2",
  RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_MAX_OUTPUT_TOKENS: "8000",
  RATEREVEAL_MERCHANT_LANGUAGE_AI_PROVIDER: "openai",
  RATEREVEAL_MERCHANT_LANGUAGE_AI_TIMEOUT_MS: "60000",
  RATEREVEAL_MERCHANT_LANGUAGE_AI_MAX_OUTPUT_TOKENS: "12000",
  AI_FULL_STATEMENT_ANOMALY_ENABLED: "false",
};

for (const [name, expected] of Object.entries(requiredValues)) {
  if (process.env[name] !== expected) fail(`${name}_staging_configuration_invalid`);
}

if (!process.env.OPENAI_API_KEY) fail("OPENAI_API_KEY_staging_secret_missing");
if (process.env.VERCEL || process.env.VERCEL_ENV) fail("staging_runtime_must_not_run_as_vercel_function");

const dbPath = process.env.FEECLEAR_DB_PATH?.trim() ?? "";
const dataRoot = process.env.RATEREVEAL_DATA_ROOT?.trim() ?? "";
if (!path.isAbsolute(dbPath) || !path.isAbsolute(dataRoot)) fail("staging_persistent_storage_path_invalid");
if (dbPath.startsWith("/tmp/") || dataRoot.startsWith("/tmp/")) fail("staging_persistent_storage_must_not_use_tmp");
if ((process.env.HOST ?? "") !== "0.0.0.0") fail("staging_host_must_bind_all_interfaces");

console.log("[staging-preflight] configuration accepted; secret values were not inspected or logged");
await import("../dist/server.js");

function fail(code) {
  console.error(`[staging-preflight] ${code}`);
  process.exit(1);
}
