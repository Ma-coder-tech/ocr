import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

import { parsePdf, type ParsedDocument } from "../src/parser.js";
import {
  adaptParsedDocumentToObservationPacket,
  replayParsedStatement,
  verifyReplaySourceProvenance,
  type ShadowReplayDefinition,
  type ShadowReplayResult,
} from "../src/reconstructionKernel/index.js";
import { rescueCorpus } from "./fixtures/reconstructionKernel/rescueCorpus.js";
import { realStatementReplayCases } from "./fixtures/reconstructionKernel/realStatementReplay.js";
import {
  rescueSourceFiles,
  rescueSourceManifest,
} from "./fixtures/reconstructionKernel/rescueSourceManifest.js";

const documents = new Map<string, ParsedDocument>();
const sourceBytes = new Map<string, Uint8Array>();
const results = new Map<string, ShadowReplayResult>();

beforeAll(async () => {
  for (const replayCase of realStatementReplayCases) {
    const [document, bytes] = await Promise.all([
      parsePdf(replayCase.pdfPath),
      readFile(replayCase.pdfPath),
    ]);
    documents.set(replayCase.definition.id, document);
    sourceBytes.set(replayCase.definition.id, bytes);
    results.set(replayCase.definition.id, replayParsedStatement(document, replayCase.definition, {
      bytes,
      manifest: replayCase.sourceManifest,
    }));
  }
}, 30_000);

describe("Statement Reconstruction Kernel real-statement shadow replay", () => {
  for (const replayCase of realStatementReplayCases) {
    it(`replays ${replayCase.definition.id} through the exact approved PDF extraction path`, () => {
      const result = results.get(replayCase.definition.id)!;
      const expected = rescueCorpus.find((item) => item.id === replayCase.definition.id)!;

      expect(result.status).toBe("replayed");
      expect(result.errors).toEqual([]);
      expect(result.packet.provenanceVerified).toBe(true);
      expect(result.packet.sourceContentSha256).toBe(replayCase.sourceManifest.contentSha256);
      expect(result.packet.pageCount).toBeGreaterThan(0);
      expect(result.packet.sourceRowCount).toBeGreaterThan(0);
      expect(result.packet.parserCandidateCount).toBeGreaterThan(0);
      expect(result.packet.boundObservationCount).toBe(replayCase.definition.inputTemplate.observations.length);
      expect(result.packet.sourceRowFingerprint).toBe(replayCase.sourceManifest.expectedSourceRowFingerprint);
      expect(result.reconstruction?.status).toBe("complete");
      expect(result.reconstruction?.canonicalClaims.map((claim) => claim.key)).toEqual([...expected.canonicalKeys].sort());
      expect(result.reconstruction?.unresolvedHypothesisGroupIds).toEqual([...expected.unresolvedGroups].sort());
    });
  }

  it("keeps parser candidates visible to replay but outside canonical truth", () => {
    for (const replayCase of realStatementReplayCases) {
      const result = results.get(replayCase.definition.id)!;
      expect(result.packet.parserCandidateCount).toBeGreaterThan(0);
      for (const claim of result.reconstruction!.canonicalClaims) {
        expect(claim.key.startsWith("shadow.parser-candidate-")).toBe(false);
        expect(claim.observationRefs.some((reference) => reference.startsWith("parser-candidate-"))).toBe(false);
      }
    }
  });

  it("preserves ambiguity proved by the raw Wells and Clover statements", () => {
    const wells = results.get("wells-fargo-september-2024")!.reconstruction!;
    const clover = results.get("clover-duplicate-resubmission")!.reconstruction!;

    expect(wells.possibleWorlds).toHaveLength(3);
    expect(wells.unresolvedHypothesisGroupIds).toContain("wells.shipping-tax-lifecycle");
    expect(wells.canonicalClaims.some((claim) => claim.key === "shipping_tax.same_lifecycle")).toBe(false);
    expect(clover.possibleWorlds).toHaveLength(3);
    expect(clover.unresolvedHypothesisGroupIds).toContain("clover.duplicate-resubmission");
    expect(clover.canonicalClaims.some((claim) => claim.key === "batches.same_lifecycle")).toBe(false);
  });

  it("fails closed on a one-cent extracted-row mutation before invoking the Kernel", () => {
    const replayCase = realStatementReplayCases.find((item) => item.definition.id === "paysafe-october-2025")!;
    const document = structuredClone(documents.get(replayCase.definition.id)!);
    const row = document.rows.find((item) => String(item.content).startsWith("Total (Misc Fees and Card Fees)"))!;
    row.content = String(row.content).replace("378.55", "378.54");

    const result = replayParsedStatement(document, replayCase.definition, {
      bytes: sourceBytes.get(replayCase.definition.id)!,
      manifest: replayCase.sourceManifest,
    });
    expect(result.status).toBe("provenance_rejected");
    expect(result.packet.provenanceVerified).toBe(false);
    expect(result.packet.boundObservationCount).toBe(0);
    expect(result.reconstruction).toBeNull();
    expect(result.errors.some((error) => error.startsWith("Source-row fingerprint "))).toBe(true);
  });

  it("refuses incomplete extraction lineage before deterministic adjudication", () => {
    const replayCase = realStatementReplayCases[0];
    const document = structuredClone(documents.get(replayCase.definition.id)!);
    document.suppliedDocumentIntegrity!.extractionLineageComplete = false;

    const packet = adaptParsedDocumentToObservationPacket(replayCase.definition.id, document);
    const result = replayParsedStatement(document, replayCase.definition, {
      bytes: sourceBytes.get(replayCase.definition.id)!,
      manifest: replayCase.sourceManifest,
    });
    expect(packet.errors).toContain("Source extraction lineage is incomplete.");
    expect(result.status).toBe("provenance_rejected");
    expect(result.packet.boundObservationCount).toBe(0);
    expect(result.reconstruction).toBeNull();
  });
});

describe("rescue corpus source provenance", () => {
  it("requires one approved source and one fixture path for every rescue case", () => {
    const corpusIds = rescueCorpus.map((item) => item.id).sort();
    expect(Object.keys(rescueSourceManifest).sort()).toEqual(corpusIds);
    expect(Object.keys(rescueSourceFiles).sort()).toEqual(corpusIds);
  });

  for (const rescueCase of rescueCorpus) {
    it(`binds ${rescueCase.id} to its exact approved PDF and extraction fingerprint`, async () => {
      const caseId = rescueCase.id as keyof typeof rescueSourceFiles;
      const pdfPath = rescueSourceFiles[caseId];
      const manifest = rescueSourceManifest[caseId];
      const [document, bytes] = await Promise.all([parsePdf(pdfPath), readFile(pdfPath)]);
      const definition: ShadowReplayDefinition = {
        id: rescueCase.id,
        inputTemplate: rescueCase.input,
        bindings: [],
      };
      const packet = adaptParsedDocumentToObservationPacket(rescueCase.id, document);

      const result = verifyReplaySourceProvenance({ bytes, manifest }, packet, definition);

      expect(result.verified).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.observedContentSha256).toBe(manifest.contentSha256);
      expect(packet.pageCount).toBe(manifest.expectedPageCount);
      expect(packet.sourceRows).toHaveLength(manifest.expectedSourceRowCount);
      expect(packet.sourceRowFingerprint).toBe(manifest.expectedSourceRowFingerprint);
    });
  }

  it("rejects the similarly named legacy Abdul PDF for the approved VORTAX case", async () => {
    const legacyPath = "test/fixtures/pdfs/fiserv_ABDUL_BASHER_Aug_2025.pdf";
    const [document, bytes] = await Promise.all([parsePdf(legacyPath), readFile(legacyPath)]);
    const rescueCase = rescueCorpus.find((item) => item.id === "vortax-september-2022")!;
    const definition: ShadowReplayDefinition = { id: rescueCase.id, inputTemplate: rescueCase.input, bindings: [] };
    const packet = adaptParsedDocumentToObservationPacket(rescueCase.id, document);

    const result = verifyReplaySourceProvenance({
      bytes,
      manifest: rescueSourceManifest["vortax-september-2022"],
    }, packet, definition);

    expect(result.verified).toBe(false);
    expect(result.errors.some((error) => error.startsWith("Source byte SHA-256 "))).toBe(true);
    expect(result.errors).toContain("Parsed page count 5 does not match approved 10.");
    expect(result.errors.some((error) => error.startsWith("Source-row fingerprint "))).toBe(true);
  });

  it("rejects changed or truncated bytes even when paired with an approved parsed packet", async () => {
    const caseId = "vortax-september-2022";
    const pdfPath = rescueSourceFiles[caseId];
    const [document, originalBytes] = await Promise.all([parsePdf(pdfPath), readFile(pdfPath)]);
    const rescueCase = rescueCorpus.find((item) => item.id === caseId)!;
    const definition: ShadowReplayDefinition = { id: caseId, inputTemplate: rescueCase.input, bindings: [] };
    const packet = adaptParsedDocumentToObservationPacket(caseId, document);
    const changedBytes = Uint8Array.from(originalBytes);
    changedBytes[changedBytes.length - 1] ^= 1;
    const truncatedBytes = originalBytes.subarray(0, originalBytes.length - 128);

    const changed = verifyReplaySourceProvenance({ bytes: changedBytes, manifest: rescueSourceManifest[caseId] }, packet, definition);
    const truncated = verifyReplaySourceProvenance({ bytes: truncatedBytes, manifest: rescueSourceManifest[caseId] }, packet, definition);

    expect(changed.verified).toBe(false);
    expect(changed.errors.some((error) => error.startsWith("Source byte SHA-256 "))).toBe(true);
    expect(truncated.verified).toBe(false);
    expect(truncated.errors).toContain(`Source byte length ${truncatedBytes.byteLength} does not match approved ${originalBytes.byteLength}.`);
  });

  it("rejects a valid approved source paired to the wrong rescue case", () => {
    const replayCase = realStatementReplayCases[0];
    const bytes = sourceBytes.get(replayCase.definition.id)!;
    const packet = adaptParsedDocumentToObservationPacket(replayCase.definition.id, documents.get(replayCase.definition.id)!);
    const wrongManifest = rescueSourceManifest["paysafe-october-2025"];

    const result = verifyReplaySourceProvenance({ bytes, manifest: wrongManifest }, packet, replayCase.definition);

    expect(result.verified).toBe(false);
    expect(result.errors).toContain("Manifest case paysafe-october-2025 does not match replay definition basys-march-2020.");
  });
});
