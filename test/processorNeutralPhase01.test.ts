import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parsePdfBytes } from "../src/parser.js";
import { executeDeterministicCanonicalAnalysisRun } from "../src/canonical/v2/runtime/analysisRun.js";
import { assertNoClaimWidening, diffAuthorityMatrix, type AuthorityMatrixCase } from "../src/processorNeutral/authorityDiff.js";
import { normalizeEvidenceText, observeParsedDocumentEvidence, observeProcessorNeutralShadow } from "../src/processorNeutral/shadow.js";
import { validateProcessorNeutralShadow } from "../src/processorNeutral/core.js";
import { fiservRepresentationObservations } from "../src/processorNeutral/fiservRepresentationAdapter.js";

describe("Phase 0/1 processor-neutral shadow boundary", () => {
  it("keeps typography normalization separate from raw source and does not resolve a backend", async () => {
    const bytes = await readFile("test/fixtures/pdfs/fiserv_PAYSAFE_Febr_2024.pdf");
    const document = await parsePdfBytes(bytes);
    const execution = executeDeterministicCanonicalAnalysisRun({
      runId: "phase01-test", sourceDocumentRef: "fixture:paysafe", document,
      executionContext: "evaluation_compatibility",
    });
    const oldPathBeforeShadow = JSON.stringify(execution.run);
    const shadow = observeProcessorNeutralShadow({ document, inputBytes: bytes, execution });
    expect(JSON.stringify(execution.run)).toBe(oldPathBeforeShadow);
    expect(normalizeEvidenceText("Total\u2013Fees   $1,000.00"))
      .toBe("Total Fees $1,000.00");
    expect(shadow.document.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(shadow.pages.status).toBe("complete");
    expect(shadow.evidence.length).toBeGreaterThan(0);
    expect(shadow.evidence.some((item) => item.rawText !== item.normalizedText)).toBe(true);
    expect(shadow.chain.find((role) => role.role === "backend_processor")?.status).toBe("unresolved");
    expect(shadow.chain.every((role) => role.status !== "supported")).toBe(true);
    expect(shadow.claimAuthority.mayAuthorizeFromShadow).toBe(false);
    expect(shadow.outputs.map((item) => item.legacyState))
      .toEqual(execution.run.capabilityProof?.outputPermissions.map((item) => item.state));
    expect(shadow.outputs.every((item) => item.authority === "shadow_translation_only")).toBe(true);
    const widened = structuredClone(shadow);
    const blocked = widened.outputs.find((item) => item.state === "withheld")!;
    (blocked as { state: string }).state = "permitted";
    expect(() => validateProcessorNeutralShadow(widened)).toThrow(/PERMISSION_WIDENING/);
  });

  it("flags a newly permitted output even if the original corpus matched", async () => {
    const baseline = JSON.parse(gunzipSync(await readFile("test/fixtures/phase01/authority-baseline.json.gz")).toString("utf8"));
    const before = [baseline.cases.find((item: AuthorityMatrixCase) => item.canonicalShadow.admission)] as AuthorityMatrixCase[];
    const after = structuredClone(before);
    const permission = after[0]!.canonicalShadow.admission!.outputPermissions
      .find((item) => item.state === "withheld")!;
    permission.state = "permitted";
    const diffs = diffAuthorityMatrix(before, after);
    expect(diffs).toEqual(expect.arrayContaining([expect.objectContaining({
      surface: "canonical_output", widening: true,
    })]));
    expect(() => assertNoClaimWidening(diffs)).toThrow(/CLAIM_AUTHORITY_WIDENING/);
    const reportAfter = structuredClone(before);
    const reportPermissions = reportAfter[0]!.canonicalShadow.report!.permissions as Record<string, { state: string }>;
    reportPermissions.financial_metrics.state = "permitted";
    expect(diffAuthorityMatrix(before, reportAfter)).toEqual(expect.arrayContaining([expect.objectContaining({
      surface: "report_permission", key: "financial_metrics", widening: true,
    })]));
    const customerAfter = structuredClone(before);
    (customerAfter[0]!.activeRuntime.reportV1 as Record<string, unknown>).testDrift = true;
    expect(diffAuthorityMatrix(before, customerAfter)).toEqual(expect.arrayContaining([expect.objectContaining({
      surface: "customer_report", key: "report_v1",
    })]));
  });

  it("records structural representation recovery as a candidate on the public sample", async () => {
    const bytes = await readFile("test/fixtures/pdfs/fiserv_OFFICIAL_INTERCHANGE_PLUS_SAMPLE.pdf");
    const document = await parsePdfBytes(bytes);
    const rows = observeParsedDocumentEvidence(document, createHash("sha256").update(bytes).digest("hex"));
    const signals = fiservRepresentationObservations(rows);
    expect(signals).toEqual(expect.arrayContaining([expect.objectContaining({
      witness: "gross_refund_net_bridge", basis: "table_structure", authority: "candidate_only",
    })]));
  });
});
