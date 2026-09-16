import { describe, expect, it } from "vitest";
import { buildSourceReadinessEnvelope } from "../../../../src/canonical/v2/index.js";

const base = { parser: { driverId: "fiserv-first-data", reportable: true, decisionStatus: "accepted" as const, validationState: "validated" as const },
  source: { provenance: "authoritative" as const, templateAdmission: "admitted" as const,
    suppliedDocumentIntegrity: "complete_supplied_document" as const, statementCompleteness: "complete" as const,
    authority: "authoritative" as const, humanReviewRequired: false } };

describe("source admission and reportability readiness", () => {
  it("permits completion only for authoritative, admitted, complete, reportable input", () => {
    expect(buildSourceReadinessEnvelope(base).outcome).toMatchObject({ state: "authoritative_admitted", analysisCompletionPermitted: true });
  });
  it.each([
    [{ ...base, parser: { ...base.parser, reportable: false } }, "parser_not_reportable"],
    [{ ...base, parser: { ...base.parser, validationState: "missing" as const } }, "parser_not_reportable"],
    [{ ...base, source: { ...base.source, suppliedDocumentIntegrity: "incomplete_or_corrupt_supplied_document" as const } }, "incomplete_document"],
    [{ ...base, source: { ...base.source, statementCompleteness: "incomplete" as const } }, "incomplete_statement"],
    [{ ...base, source: { ...base.source, statementCompleteness: "unknown" as const } }, "statement_completeness_unknown"],
    [{ ...base, source: { ...base.source, templateAdmission: "unknown" as const } }, "template_admission_unknown"],
    [{ ...base, source: { ...base.source, provenance: "observational" as const, authority: "observational" as const } }, "observational"],
    [{ ...base, source: { ...base.source, humanReviewRequired: true } }, "requires_human_review"],
  ])("blocks completion for %s", (input, state) => {
    expect(buildSourceReadinessEnvelope(input).outcome).toMatchObject({ state, analysisCompletionPermitted: false });
  });

  it("keeps supplied-document integrity, statement completeness, and template admission independent", () => {
    const outcome = buildSourceReadinessEnvelope({
      ...base,
      source: { ...base.source, templateAdmission: "unknown", statementCompleteness: "unknown" },
    }).outcome;
    expect(outcome).toEqual({
      state: "template_admission_unknown",
      analysisCompletionPermitted: false,
      reasonCodes: ["template_not_admitted", "statement_completeness_not_proven"],
    });
  });
});
