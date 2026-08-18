import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const REQUIRED_STAGING_ENV = {
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
  HOST: "0.0.0.0",
  FEECLEAR_DB_PATH: "/workspaces/.ratereveal-staging/feeclear.sqlite",
  RATEREVEAL_DATA_ROOT: "/workspaces/.ratereveal-staging",
};

describe("Package 4A staging configuration", () => {
  it("keeps the Codespace port private and the canonical runtime flags fail-closed", () => {
    const config = JSON.parse(fs.readFileSync(".devcontainer/devcontainer.json", "utf8"));
    expect(config.portsAttributes["3000"]).toMatchObject({ protocol: "https", visibility: "private" });
    expect(config.features["ghcr.io/devcontainers/features/sshd:1"]).toEqual({ version: "latest" });
    expect(config.remoteEnv).toMatchObject({
      ...REQUIRED_STAGING_ENV,
      VITE_RATEREVEAL_REPORT_V2_ENABLED: "true",
    });
    expect(config.remoteEnv).not.toHaveProperty("OPENAI_API_KEY");
    expect(config.postCreateCommand).toBe("npm install --include=dev && npm run build:all");
  });

  it("refuses to start without the securely injected OpenAI credential", () => {
    const result = runPreflight(REQUIRED_STAGING_ENV);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("OPENAI_API_KEY_staging_secret_missing");
  });

  it("refuses serverless execution and temporary persistence", () => {
    const serverless = runPreflight({ ...REQUIRED_STAGING_ENV, OPENAI_API_KEY: "test-only", VERCEL_ENV: "preview" });
    expect(serverless.status).toBe(1);
    expect(serverless.stderr).toContain("staging_runtime_must_not_run_as_vercel_function");

    const temporary = runPreflight({
      ...REQUIRED_STAGING_ENV,
      OPENAI_API_KEY: "test-only",
      FEECLEAR_DB_PATH: "/tmp/feeclear.sqlite",
      RATEREVEAL_DATA_ROOT: "/tmp/ratereveal",
    });
    expect(temporary.status).toBe(1);
    expect(temporary.stderr).toContain("staging_persistent_storage_must_not_use_tmp");
  });
});

function runPreflight(extraEnv: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["scripts/staging-runtime-preflight.mjs"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH, ...extraEnv },
    encoding: "utf8",
  });
}
