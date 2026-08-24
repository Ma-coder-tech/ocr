import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  runInternalLiveRunner,
  STATEMENT_ONE_INTERNAL_LIVE_PROFILE,
} from "../../../../scripts/run-fiserv-internal-live-evaluation.js";

describe("durable internal live runner", () => {
  it("cancels with zero sends before output allocation or Keychain access", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-cancel-"));
    const outputRoot = path.join(parent, "runs");
    const lines: string[] = [];
    let credentialReads = 0;
    const code = await runInternalLiveRunner({ profile: "statement-one", authorization: "NO", runId: "auto", outputRoot }, {
      log: (line) => lines.push(line),
      readCredential: async () => { credentialReads += 1; return "should-never-be-read"; },
    });
    expect(code).toBe(2);
    expect(credentialReads).toBe(0);
    expect(lines).toEqual(expect.arrayContaining(["executionStatus: cancelled", "Provider sends: 0"]));
    await expect(readdir(outputRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("isolates Statement 2 by rejecting its profile before output allocation or Keychain access", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-statement-two-"));
    const outputRoot = path.join(parent, "runs");
    const lines: string[] = [];
    let credentialReads = 0;
    const code = await runInternalLiveRunner({
      profile: "statement-two",
      authorization: "product-owner-approved",
      runId: "auto",
      outputRoot,
    }, {
      log: (line) => lines.push(line),
      readCredential: async () => { credentialReads += 1; return "should-never-be-read"; },
    });
    expect(code).toBe(2);
    expect(credentialReads).toBe(0);
    expect(lines).toEqual(expect.arrayContaining([
      "executionStatus: cancelled",
      "researchOutcome: not_started",
      "Provider sends: 0",
      "Safe reason: authorized_profile_required",
    ]));
    await expect(readdir(outputRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reaches construction-bound preflight with injected credentials and retains no secret", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-preflight-"));
    const lines: string[] = [];
    const secret = "synthetic-key-never-persist-123456789";
    let executed = 0;
    const code = await runInternalLiveRunner({ profile: "statement-one", authorization: "product-owner-approved",
      runId: "auto", outputRoot }, {
      log: (line) => lines.push(line),
      readCredential: async () => secret,
      execute: async ({ runId, outputDirectory }) => {
        executed += 1;
        expect(runId).toBe("statement-one-live-internal-evaluation-001");
        expect(STATEMENT_ONE_INTERNAL_LIVE_PROFILE.periodYear).toBe("2024");
        await mkdir(outputDirectory, { mode: 0o700 });
        await writeFile(path.join(outputDirectory, "internal-analysis.json"), "{\"safe\":true}\n", { mode: 0o600 });
        return { executionStatus: "completed", researchOutcome: "research_completed",
          artifactPath: path.join(outputDirectory, "internal-analysis.json") };
      },
    });
    expect(code).toBe(0);
    expect(executed).toBe(1);
    expect(lines).toEqual(expect.arrayContaining([
      "Preflight: passed; zero external sends", "Provider sends: 0", "executionStatus: completed",
      "researchOutcome: research_completed",
    ]));
    const persisted = `${lines.join("\n")}\n${await readFile(path.join(outputRoot,
      "statement-one-live-internal-evaluation-001/internal-analysis.json"), "utf8")}`;
    expect(persisted).not.toContain(secret);
    expect(process.env.OPENROUTER_API_KEY).toBeUndefined();
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
  });

  it("refuses an existing run ID without reading credentials or modifying the run", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "rr-live-runner-collision-"));
    const runId = "statement-one-live-internal-evaluation-003";
    const existing = path.join(outputRoot, runId);
    await mkdir(existing);
    await writeFile(path.join(existing, "preserved.txt"), "preserve-me\n");
    const lines: string[] = [];
    let credentialReads = 0;
    const code = await runInternalLiveRunner({ profile: "statement-one", authorization: "product-owner-approved",
      runId, outputRoot }, { log: (line) => lines.push(line),
      readCredential: async () => { credentialReads += 1; return "not-readable-synthetic-secret"; } });
    expect(code).toBe(1);
    expect(credentialReads).toBe(0);
    expect(await readdir(existing)).toEqual(["preserved.txt"]);
    expect(await readFile(path.join(existing, "preserved.txt"), "utf8")).toBe("preserve-me\n");
    expect(lines).toContain("Provider sends: 0");
  });

  it("defines an exact least-privilege network allowlist", async () => {
    const profile = JSON.parse(await readFile(path.resolve(process.cwd(),
      "config/ratereveal-internal-live-network-profile.json"), "utf8"));
    expect(profile).toMatchObject({ mode: "allowlist", wildcardsAllowed: false, registryOriginsAutoAllowed: false });
    expect([...profile.allowedHosts].sort()).toEqual(["api.openai.com", "merchants.fiserv.com", "openrouter.ai"]);
    expect(profile.allowedHosts.some((host: string) => host.includes("*"))).toBe(false);
    const nativeProfile = await readFile(path.resolve(process.cwd(), ".codex/config.toml"), "utf8");
    expect(nativeProfile).toContain('default_permissions = "ratereveal-live"');
    expect(nativeProfile).toContain("network_proxy = true");
    expect(nativeProfile).toContain('extends = ":workspace"');
    const nativeHosts = [...nativeProfile.matchAll(/^"([^"]+)" = "allow"$/gm)].map((match) => match[1]).sort();
    expect(nativeHosts).toEqual(["api.openai.com", "merchants.fiserv.com", "openrouter.ai"]);
    expect(nativeProfile).not.toMatch(/^".*\*.*" = "allow"$/m);
  });
});
