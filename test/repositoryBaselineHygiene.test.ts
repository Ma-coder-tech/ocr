import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("repository baseline hygiene", () => {
  it("uses a process-isolated Vitest pool for native-backed suites", async () => {
    const [config, packageJsonText, baselineRunner] = await Promise.all([
      readFile(path.resolve(root, "vitest.config.ts"), "utf8"),
      readFile(path.resolve(root, "package.json"), "utf8"),
      readFile(path.resolve(root, "scripts/run-test-baseline.mjs"), "utf8"),
    ]);
    const packageJson = JSON.parse(packageJsonText);

    expect(config).toMatch(/pool:\s*["']forks["']/);
    expect(config).not.toMatch(/pool:\s*["']threads["']/);
    expect(packageJson.scripts.test).toBe("node scripts/check-toolchain.mjs && node scripts/run-test-baseline.mjs");
    expect(baselineRunner).toContain("--exclude");
    expect(baselineRunner.match(/test\/evaluationPackage5BIntegration\.test\.ts/g)).toHaveLength(2);
  });

  it("keeps the historical dirty-worktree Gold scope checker retired", async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(root, "package.json"), "utf8"));

    expect(packageJson.scripts["gold:scope-check"]).toBeUndefined();
    expect(packageJson.scripts["repo:clean-check"]).toBe("node scripts/check-clean-checkout.mjs");
    await expect(access(path.resolve(root, "scripts/gold-contract-scope-check.ts")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the live observation non-authoritative and removes the external temp-path dependency", async () => {
    const [fixture, workPlanTest, forensicVerifier] = await Promise.all([
      readFile(path.resolve(root, "test/fixtures/evaluation/five-statement-live-work-plan-observation-v1.json"), "utf8"),
      readFile(path.resolve(root, "test/canonical/wholeStatementFeeIntelligenceWorkPlan.test.ts"), "utf8"),
      readFile(path.resolve(root, "scripts/verify-five-statement-live-artifact.ts"), "utf8"),
    ]);
    const observation = JSON.parse(fixture);

    expect(observation).toMatchObject({
      authority: "non_authoritative_forensic_observation",
      sourceArtifactAvailability: "external_not_repository_fixture",
    });
    expect(observation.limitations.join(" ")).toMatch(/grants no evidence or product authority/i);
    expect(workPlanTest).not.toContain("/private/tmp/ratereveal-five-statement-live-final-");
    expect(workPlanTest).not.toContain("RATEREVEAL_FIVE_STATEMENT_LIVE_ARTIFACT_PATH");
    expect(forensicVerifier).toContain("RATEREVEAL_FIVE_STATEMENT_LIVE_ARTIFACT_PATH");
  });
});
