import { createHash } from "node:crypto";
import type { SemanticFactProposal } from "./neutralContracts.js";

/** Binds an admitted fact to its source, package, proposal, controls and premise vector. */
export function neutralFactProofId(sourceSha256: string, packageId: string | null,
  packageVersion: string | null, fact: SemanticFactProposal): string {
  return `neutral-proof-v2:${createHash("sha256").update(JSON.stringify([
    sourceSha256, packageId, packageVersion, fact.id, fact.meaning,
    fact.population, fact.amountMinor, fact.unit, fact.evidenceRefs,
    fact.controlRefs, fact.assumptionIds, fact.premises,
  ])).digest("hex")}`;
}
