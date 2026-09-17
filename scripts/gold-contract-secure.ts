import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const configuredDir = process.env.RATEREVEAL_PRIVATE_CORPUS_DIR?.trim();
if (!configuredDir) {
  console.log(JSON.stringify({ status: "skipped", reason: "RATEREVEAL_PRIVATE_CORPUS_DIR is not set." }, null, 2));
  process.exit(0);
}

const root = path.resolve(process.cwd(), configuredDir);
const manifestPath = path.join(root, "gold-private-manifest.json");
const manifestSchema = z
  .object({
    schema_version: z.literal("ratereveal_gold_private_manifest_v1"),
    cases: z.array(
      z.object({ case_id: z.string().regex(/^G[1-9]$/), document_file: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
    ),
  })
  .strict();

try {
  const manifest = manifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")));
  const results = [];
  for (const item of manifest.cases) {
    const documentPath = path.resolve(root, item.document_file);
    if (!documentPath.startsWith(`${root}${path.sep}`)) throw new Error("Private manifest contains a path outside the configured corpus directory.");
    const actualHash = createHash("sha256").update(await fs.readFile(documentPath)).digest("hex");
    results.push({ caseId: item.case_id, integrityVerified: actualHash === item.sha256 });
  }
  const failed = results.filter((item) => !item.integrityVerified);
  console.log(JSON.stringify({ status: failed.length === 0 ? "verified" : "invalid_provenance", verifiedCaseCount: results.length - failed.length, failedCaseIds: failed.map((item) => item.caseId) }, null, 2));
  if (failed.length > 0) process.exit(1);
} catch (error) {
  console.error(JSON.stringify({ status: "invalid_provenance", reason: "Secure Gold manifest or source integrity validation failed; private paths and hashes are omitted.", errorType: error instanceof Error ? error.name : "UnknownError" }, null, 2));
  process.exit(1);
}
