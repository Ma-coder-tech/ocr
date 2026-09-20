import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("F4 provisional real Gold fixture calibration", () => {
  it("pins frozen semantic anchors and emits only aggregate, source-limited comparisons", () => {
    const raw = execFileSync(process.execPath, ["--import", "tsx", "scripts/f4-gold-shadow-calibration.ts"], {
      cwd: process.cwd(), encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const report = JSON.parse(raw);
    expect(report).toMatchObject({
      schemaVersion: "f4_gold_shadow_calibration_v1",
      standing: "provisional_repository_fixture_observation_no_gold_source_promotion",
      caseIds: ["G1", "G2", "G3", "G4", "G5", "G7", "G8"],
      excluded: [
        { caseId: "G6", reason: "exact_source_identity_and_mapping_unresolved" },
        { caseId: "G9", reason: "original_gold_source_unavailable" },
      ],
      totals: {
        exact: { agreement: 850, stronger_refusal: 24, unresolved_unknown: 714 },
        proxy: { agreement: 1109, stronger_refusal: 54, unresolved_unknown: 35 },
      },
    });
    expect(report.cases).toHaveLength(7);
    expect(report.cases.every((item: any) => item.canonicalStatus === "valid"
      && item.standing === "repository_fixture_provisional_not_authoritative_gold_source_execution")).toBe(true);
    const markupRefusals = report.cases.flatMap((item: any) => item.materialDivergences)
      .filter((item: any) => item.basis === "exact_semantic" && item.relation === "stronger_refusal");
    expect(markupRefusals.every((item: any) => item.semanticCode === "processor_markup")).toBe(true);
    expect(markupRefusals.reduce((sum: number, item: any) => sum + item.count, 0)).toBe(24);
    expect(report.cases.find((item: any) => item.caseId === "G1").componentUnknownByRole)
      .toMatchObject({ "interchange_detail_row/pass_through_fee_charge_included/included": 6 });
    expect(report.cases.find((item: any) => item.caseId === "G7").componentUnknownByRole)
      .toMatchObject({ "interchange_detail_row/pass_through_fee_charge_included/included": 6 });
    expect(report.cases.find((item: any) => item.caseId === "G8").semanticAnchors)
      .toContainEqual({ assertionId: "G8-NO-SAVINGS", semanticStatus: "refused",
        sourceExecutionStatus: "not_source_executable" });
    expect(raw).not.toMatch(/sourceFileName|selectedLabel|feeRowId|sourceDocumentRef|merchantName|\.pdf|accountId/);
  }, 30_000);
});
