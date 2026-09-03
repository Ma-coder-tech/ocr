import { createHash } from "node:crypto";

import type { ParsedStatementObservationPacket, ShadowReplayDefinition } from "./statementReplay.js";

export const RESCUE_SOURCE_MANIFEST_SCHEMA = "rescue-source-manifest-v1" as const;

export interface ApprovedReplaySource {
  schemaVersion: typeof RESCUE_SOURCE_MANIFEST_SCHEMA;
  approvalReference: string;
  caseId: string;
  mediaType: "application/pdf";
  contentSha256: string;
  byteLength: number;
  expectedPageCount: number;
  expectedSourceRowCount: number;
  expectedSourceRowFingerprint: string;
}

export interface ProvenancedReplaySource {
  bytes: Uint8Array;
  manifest: ApprovedReplaySource;
}

export interface ReplayProvenanceResult {
  verified: boolean;
  observedContentSha256: string;
  errors: string[];
}

const SHA256 = /^[a-f0-9]{64}$/;

function hasPdfHeader(bytes: Uint8Array): boolean {
  const leadingBytes = bytes.subarray(0, Math.min(bytes.byteLength, 1_024));
  return new TextDecoder().decode(leadingBytes).includes("%PDF-");
}

export function verifyReplaySourceProvenance(
  source: ProvenancedReplaySource,
  packet: ParsedStatementObservationPacket,
  definition: ShadowReplayDefinition,
): ReplayProvenanceResult {
  const errors = [...packet.errors];
  const { manifest, bytes } = source;
  const observedContentSha256 = createHash("sha256").update(bytes).digest("hex");

  if (manifest.schemaVersion !== RESCUE_SOURCE_MANIFEST_SCHEMA) errors.push(`Unsupported rescue source manifest schema ${String(manifest.schemaVersion)}.`);
  if (!manifest.approvalReference.trim()) errors.push("Rescue source manifest has no approval reference.");
  if (manifest.caseId !== definition.id) errors.push(`Manifest case ${manifest.caseId} does not match replay definition ${definition.id}.`);
  if (definition.inputTemplate.statementId !== definition.id) errors.push(`Replay template statement ${definition.inputTemplate.statementId} does not match definition ${definition.id}.`);
  if (manifest.mediaType !== "application/pdf") errors.push(`Unsupported rescue source media type ${String(manifest.mediaType)}.`);
  if (!SHA256.test(manifest.contentSha256)) errors.push("Manifest source SHA-256 is malformed.");
  if (observedContentSha256 !== manifest.contentSha256) errors.push(`Source byte SHA-256 ${observedContentSha256} does not match approved ${manifest.contentSha256}.`);
  if (bytes.byteLength !== manifest.byteLength) errors.push(`Source byte length ${bytes.byteLength} does not match approved ${manifest.byteLength}.`);
  if (!hasPdfHeader(bytes)) errors.push("Source bytes do not have a PDF header in the first 1,024 bytes.");
  if (packet.pageCount !== manifest.expectedPageCount) errors.push(`Parsed page count ${packet.pageCount} does not match approved ${manifest.expectedPageCount}.`);
  if (packet.sourceRows.length !== manifest.expectedSourceRowCount) errors.push(`Extracted row count ${packet.sourceRows.length} does not match approved ${manifest.expectedSourceRowCount}.`);
  if (!SHA256.test(manifest.expectedSourceRowFingerprint)) errors.push("Manifest source-row fingerprint is malformed.");
  if (packet.sourceRowFingerprint !== manifest.expectedSourceRowFingerprint) errors.push(`Source-row fingerprint ${packet.sourceRowFingerprint} does not match approved ${manifest.expectedSourceRowFingerprint}.`);

  const uniqueErrors = [...new Set(errors)].sort();
  return { verified: uniqueErrors.length === 0, observedContentSha256, errors: uniqueErrors };
}
