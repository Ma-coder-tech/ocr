import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Runtime Intelligence Policy Amendment v0.4 integrity", () => {
  it("locks continuously replenishing operational admission to v0.3 and the Frozen Product Model", () => {
    const amendments = path.join(process.cwd(), "docs/product-model/amendments");
    const lock = JSON.parse(readFileSync(path.join(amendments,
      "runtime-intelligence-policy-amendment-v0-4.lock.json"), "utf8")) as Record<string, any>;
    const artifact = readFileSync(path.join(amendments, lock.artifact.file));
    const parent = readFileSync(path.join(amendments, lock.amends.artifact.file));
    const frozen = readFileSync(path.join(amendments, lock.normativeBaseline.frozenPackageLock.file));

    expect(lock).toMatchObject({
      contractId: "frozen_product_model_runtime_policy_amendment_v0_4",
      contractVersion: "v0.4", status: "authoritative_frozen_versioned_amendment",
      implementationAuthority: "operational_allowance_and_automatic_recovery_scheduling_only",
      customerReportAuthority: "unchanged",
      amends: { contractId: "frozen_product_model_runtime_policy_amendment_v0_3",
        contractVersion: "v0.3", historicalMeaning: "preserved_immutable" },
    });
    expect(artifact.byteLength).toBe(lock.artifact.bytes);
    expect(sha256(artifact)).toBe(lock.artifact.sha256);
    expect(sha256(parent)).toBe(lock.amends.artifact.sha256);
    expect(sha256(frozen)).toBe(lock.normativeBaseline.frozenPackageLock.sha256);
  });
});

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
