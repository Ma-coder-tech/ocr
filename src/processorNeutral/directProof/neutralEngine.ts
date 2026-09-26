import { createHash } from "node:crypto";
import { parsePdfBytes, type ParsedDocument } from "../../parser.js";
import { packetFromParsedDocument, observePdfTextItems } from "./neutralEvidence.js";
import { proveNeutral } from "./neutralCore.js";
import { NEUTRAL_INSTALLED_PROTOCOLS } from "./neutralInstalledProtocols.js";
import type { NeutralProofRun, NeutralProtocolPackage } from "./neutralContracts.js";

export function proveNeutralSynthetic(document: ParsedDocument,
  packages: readonly NeutralProtocolPackage[] = NEUTRAL_INSTALLED_PROTOCOLS): NeutralProofRun {
  const sha = createHash("sha256").update(JSON.stringify(document)).digest("hex");
  return proveNeutral({ document,
    packet: packetFromParsedDocument(document, sha, "synthetic_mutation", null) }, packages);
}

/** Production path: reuse the parsed rows from the same immutable PDF bytes. */
export function proveNeutralFromParsedPdfBytes(document: ParsedDocument, bytes: Uint8Array,
  packages: readonly NeutralProtocolPackage[] = NEUTRAL_INSTALLED_PROTOCOLS): NeutralProofRun {
  const sha = createHash("sha256").update(bytes).digest("hex");
  return proveNeutral({ document,
    packet: packetFromParsedDocument(document, sha, "pdf_bytes", bytes.byteLength) }, packages);
}

/** Local research path only; never imported by production analysis or persistence. */
export async function proveNeutralFromPdfBytes(bytes: Uint8Array,
  packages: readonly NeutralProtocolPackage[] = NEUTRAL_INSTALLED_PROTOCOLS): Promise<NeutralProofRun> {
  const snapshot = Uint8Array.from(bytes);
  const sha = createHash("sha256").update(snapshot).digest("hex");
  const document = await parsePdfBytes(snapshot);
  const tokens = await observePdfTextItems(snapshot, sha);
  return proveNeutral({ document,
    packet: packetFromParsedDocument(document, sha, "pdf_bytes", snapshot.byteLength, tokens) }, packages);
}
