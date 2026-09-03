import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { LIVE_HYPOTHESIS_EVALUATION_RECORD_VERSION } from "../src/reconstructionKernel/index.js";

const directory = process.argv[2];
if (!directory) throw new Error("Usage: enrich-live-hypothesis-evaluation-records.ts <record-directory>");

const mappings: Array<Record<string, string>> = [];
for (const name of (await readdir(directory)).filter((value) => value.endsWith(".json") && !value.startsWith("summary-")).sort()) {
  const sourcePath = join(directory, name);
  const source = JSON.parse(await readFile(sourcePath, "utf8")) as Record<string, any>;
  if (source.payload?.recordVersion !== "ratereveal-live-hypothesis-evaluation-record-v1") continue;
  const payload = structuredClone(source.payload);
  const required = [...payload.topicRegistry.exactTopic.qualification.materialEvidenceNeedIds];
  const acceptedByProposal = new Map(payload.evaluation.acceptedProviderHypotheses.map((hypothesis: any) => [
    hypothesis.ownership.proposalId,
    hypothesis,
  ]));
  const entries = payload.evaluation.providerAndQualifiedConfidence;
  payload.evaluation.providerAndQualifiedConfidence = entries.map((entry: any) => {
    const hypothesis: any = acceptedByProposal.get(entry.proposalId);
    const acknowledged = [...(hypothesis?.inference?.acknowledgedEvidenceNeedIds ?? [])];
    const acknowledgedSet = new Set(acknowledged);
    const competitors = [
      ...entries.filter((candidate: any) => candidate.proposalId !== entry.proposalId).map((candidate: any) => candidate.proposalId),
      "implicit-unknown-or-unmodelled-alternative",
    ];
    return {
      ...entry,
      requiredMaterialEvidenceNeedIds: required,
      acknowledgedEvidenceNeedIds: acknowledged,
      unacknowledgedMaterialEvidenceNeedIds: required.filter((id) => !acknowledgedSet.has(id)),
      competingAlternativeProposalIds: competitors,
      strongInferenceExplanation: entry.qualifiedInferenceStrength === "strong"
        ? {
            whyStrong: entry.rationale,
            competingAlternativeProposalIds: competitors,
            missingForConfirmation: entry.missingProof,
          }
        : null,
    };
  });
  payload.recordVersion = LIVE_HYPOTHESIS_EVALUATION_RECORD_VERSION;
  payload.supersedesIntegritySha256 = source.integrity.payloadSha256;
  const payloadSha256 = createHash("sha256").update(stableJson(payload)).digest("hex");
  const record = { integrity: { algorithm: "sha256", payloadSha256 }, payload };
  const outputPath = join(directory, `${basename(name, ".json")}-v2-${payloadSha256.slice(0, 12)}.json`);
  await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  mappings.push({ sourcePath, sourceSha256: source.integrity.payloadSha256, outputPath, payloadSha256 });
}

const manifestPayload = {
  manifestVersion: "ratereveal-live-hypothesis-record-enrichment-v1",
  createdAt: new Date().toISOString(),
  operation: "offline_record_enrichment_no_provider_calls",
  mappings,
};
const manifestSha256 = createHash("sha256").update(stableJson(manifestPayload)).digest("hex");
const manifestPath = join(directory, `enrichment-manifest-${manifestSha256.slice(0, 12)}.json`);
await writeFile(manifestPath, `${JSON.stringify({ integrity: { algorithm: "sha256", payloadSha256: manifestSha256 }, payload: manifestPayload }, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ manifestPath, manifestSha256, enrichedRecordCount: mappings.length })}\n`);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
