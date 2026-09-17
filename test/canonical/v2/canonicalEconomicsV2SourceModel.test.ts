import { describe, expect, it } from "vitest";

import {
  buildCanonicalEconomicsV2FromFiserv,
  privacySafeCanonicalEconomicsV2Diagnostic,
  validateCanonicalEconomicsV2Foundation,
} from "../../../src/canonical/v2/index.js";
import { v2SyntheticStatement } from "./fixtures.js";

describe("Canonical Economics V2 source and repeated-representation model", () => {
  it("links repeated submitted-volume representations to exactly one contributor", () => {
    const foundation = buildSourceFixture();
    const group = foundation.sourceModel.representationGroups.find(
      (item) => item.canonicalFactRef === foundation.financialPopulations.canonicalNetSubmittedCardVolume.id,
    );

    expect(group).toBeDefined();
    expect(group).toMatchObject({ duplicateHandling: "one_authoritative_contributor" });
    expect(group!.evidenceRefs.length).toBeGreaterThan(0);
    expect(group!.occurrenceRefs.length).toBeGreaterThan(1);
    const groupedOccurrences = group!.occurrenceRefs.map((ref) => foundation.sourceModel.occurrences.find((item) => item.id === ref)!);
    expect(groupedOccurrences.filter((item) => item.contributionRole === "authoritative_contributor")).toHaveLength(1);
    expect(groupedOccurrences.filter((item) => item.contributionRole === "repeated_representation").length).toBeGreaterThan(0);
    expect(groupedOccurrences.some((item) => item.contributionRole === "funding_only")).toBe(false);
  });

  it("rejects a repeated-representation group with two authoritative contributors", () => {
    const foundation = structuredClone(buildSourceFixture());
    const group = foundation.sourceModel.representationGroups[0]!;
    for (const ref of group.occurrenceRefs.slice(0, 2)) {
      foundation.sourceModel.occurrences.find((item) => item.id === ref)!.contributionRole = "authoritative_contributor";
    }
    expect(validateCanonicalEconomicsV2Foundation(foundation).validation.errors).toContain(
      `Representation group ${group.id} has more than one authoritative contributor.`,
    );
  });

  it("rejects overlapping representation groups for the same occurrence", () => {
    const foundation = structuredClone(buildSourceFixture());
    foundation.sourceModel.representationGroups.push({
      ...structuredClone(foundation.sourceModel.representationGroups[0]!),
      id: "representation_v2_overlapping_test",
    });

    expect(validateCanonicalEconomicsV2Foundation(foundation).validation.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/belongs to more than one representation group/),
    ]));
  });

  it("keeps diagnostics redacted while retaining section/page/line occurrence lineage", () => {
    const fixture = v2SyntheticStatement({ includeSensitiveLabel: true });
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      ...fixture,
      sourceDocumentRef: "SYNTH-RB-PRIVACY",
      parserId: "synthetic_fiserv_foundation_parser",
      provenanceStatus: "approved_synthetic",
    });
    const serializedEvidence = JSON.stringify(foundation.sourceModel.evidence);

    expect(foundation.validation.status).toBe("valid");
    expect(serializedEvidence).not.toContain("123456789");
    expect(serializedEvidence).not.toContain("owner@example.com");
    expect(serializedEvidence).toContain("[redacted-id]");
    expect(serializedEvidence).toContain("[redacted-email]");
    expect(foundation.sourceModel.occurrences.some((item) => item.pageNumber !== null && item.lineRef !== null)).toBe(true);
    expect(foundation.sourceModel.parserInterpretations.every((item) => item.authority === "deterministic_parser_only")).toBe(true);

    const diagnostic = JSON.stringify(privacySafeCanonicalEconomicsV2Diagnostic(foundation));
    const diagnosticObject = privacySafeCanonicalEconomicsV2Diagnostic(foundation) as Record<string, unknown>;
    expect(diagnosticObject).not.toHaveProperty("sourceRefHash");
    expect(diagnosticObject).not.toHaveProperty("sourceFingerprint");
    expect(diagnosticObject).not.toHaveProperty("sourceDocumentRef");
    expect(diagnostic).not.toContain(foundation.identity.sourceFingerprint!);
    expect(diagnostic).not.toContain("SYNTH-RB-PRIVACY");
    expect(diagnostic).not.toContain("123456789");
    expect(diagnostic).not.toContain("owner@example.com");
    expect(diagnostic).not.toContain("Chargeback fee merchant");
    expect(diagnostic).not.toContain("1000");
  });

  it("preserves unknown page provenance instead of substituting a placeholder page", () => {
    const fixture = v2SyntheticStatement();
    const parserOutput = structuredClone(fixture.parserOutput) as Record<string, unknown>;
    parserOutput.evidence = [];
    parserOutput.candidateTotals = [];
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      document: fixture.document,
      parserOutput,
      sourceDocumentRef: "SYNTH-RB-UNKNOWN-PAGE",
      parserId: "synthetic_fiserv_foundation_parser",
      provenanceStatus: "approved_synthetic",
    });
    const section = foundation.sourceModel.sections.find((item) => item.heading === "SELECTED FINANCIALS");
    const occurrences = foundation.sourceModel.occurrences.filter((item) => item.sectionRef === section?.id);

    expect(section).toMatchObject({ pageStart: null, pageEnd: null });
    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences.every((item) => item.pageNumber === null)).toBe(true);
    expect(occurrences.every((item) => foundation.sourceModel.evidence.find((evidence) => evidence.id === item.evidenceRef)?.pageNumber === null)).toBe(true);
  });
});

function buildSourceFixture() {
  const fixture = v2SyntheticStatement();
  return buildCanonicalEconomicsV2FromFiserv({
    ...fixture,
    sourceDocumentRef: "SYNTH-RB-SOURCE",
    parserId: "synthetic_fiserv_foundation_parser",
    provenanceStatus: "approved_synthetic",
  });
}
