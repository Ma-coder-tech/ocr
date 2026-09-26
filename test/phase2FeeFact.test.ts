import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePdfBytes } from "../src/parser.js";
import { adjudicateSupportedFiservProtocolIdentity } from "../src/canonical/v2/fiservCapabilityContract.js";
import { proveNeutralFromParsedPdfBytes, proveNeutralFromPdfBytes } from
  "../src/processorNeutral/directProof/neutralEngine.js";
import { evaluateResearchFeeFact } from "../src/processorNeutral/feeFactCandidate.js";
import { evaluatePhase2FeeForNewUpload, publicPhase2FeeFact, publicPhase2FeeFactForJob,
  PHASE2_FEE_FLAG } from
  "../src/phase2FeeFact.js";

const fixture = (name: string) => readFile(path.join(process.cwd(), "test/fixtures/pdfs", name));
const originalFlag = process.env[PHASE2_FEE_FLAG];
afterEach(() => {
  if (originalFlag === undefined) delete process.env[PHASE2_FEE_FLAG];
  else process.env[PHASE2_FEE_FLAG] = originalFlag;
});

describe("Phase 2 printed fee charge permission", () => {
  it.each([
    ["Nov_2024_Statement.pdf", -133096],
    ["SAMPLE_MERCHANT4_CLOVER.pdf", -131255],
  ])("admits only the isolated charge on supported %s", async (name, debit) => {
    const bytes = await fixture(name);
    const document = await parsePdfBytes(bytes);
    const audit = evaluatePhase2FeeForNewUpload(document, bytes);
    expect(audit.decision).toBe("eligible");
    expect(audit.candidate.amount).toMatchObject({ sourceDebitMinor: debit,
      displayChargeMagnitudeMinor: -debit, sourceSign: "negative_fee_debit",
      displaySign: "positive_charge_magnitude", printedCurrencySymbol: "$", isoCurrency: null });
    expect(audit.candidate.period).toMatchObject({ context: "printed_statement_period_only",
      feeEarningPeriod: "unresolved", feePostingPeriod: "unresolved", cardActivityCompatibility: "unresolved" });
    expect(audit.candidate.population).toMatchObject({ boundedDeclaredComponents: true,
      completeFeeOccurrenceInventory: false, processorOwnership: "unresolved" });
    expect(audit.candidate.proof.proofId).toMatch(/^neutral-proof-v2:[a-f0-9]{64}$/);
    expect(audit.candidate.backendProcessor).toBeNull();
    delete process.env[PHASE2_FEE_FLAG];
    expect(publicPhase2FeeFact(audit)).toBeNull();
    process.env[PHASE2_FEE_FLAG] = "true";
    expect(publicPhase2FeeFact(audit)).toEqual({
      kind: "printed_processing_fee_charge_aggregate_v1",
      permissionVersion: "phase2_printed_fee_charge_permission_v1",
      displayChargeMagnitudeMinor: -debit, printedCurrencySymbol: "$",
      printedStatementPeriod: { start: audit.candidate.period.start, end: audit.candidate.period.end },
      scope: "bounded_declared_processing_fee_charge_aggregate", completeFeeOccurrenceInventory: false,
    });
    expect(JSON.stringify(publicPhase2FeeFact(audit))).not.toMatch(/processor|savings|rate|markup|proof|sourceSha/);
  });

  it.each([
    "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
    "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
    "SAMPLE_MERCHANT_2Statement_Bloom-To-Beauty-By-Maria-Jan-24.pdf",
    "110012-Arre_t_n_05-CJ-CM_Dos_2022-20_QUENUM_C_MEGNIGBETO.pdf",
  ])("withholds unsupported or nonmerchant %s", async (name) => {
    process.env[PHASE2_FEE_FLAG] = "true";
    const bytes = await fixture(name);
    const audit = evaluatePhase2FeeForNewUpload(await parsePdfBytes(bytes), bytes);
    expect(audit.decision).toBe("withheld");
    expect(publicPhase2FeeFact(audit)).toBeNull();
    expect(audit.candidate.amount.sourceDebitMinor).toBeNull();
  });

  it("reuses the first PDF parse without changing the research proof result", async () => {
    const bytes = await fixture("SAMPLE_MERCHANT4_CLOVER.pdf");
    const document = await parsePdfBytes(bytes);
    const reused = proveNeutralFromParsedPdfBytes(document, bytes);
    const reparsed = await proveNeutralFromPdfBytes(bytes);
    expect(reused.facts.map((fact) => [fact.id, fact.state, fact.amountMinor]))
      .toEqual(reparsed.facts.map((fact) => [fact.id, fact.state, fact.amountMinor]));
    expect(reused.evidence.tokens).toEqual([]);
    expect(reused.evidence.rows.length).toBeGreaterThan(0);
    expect(reused.inputSha256).toBe(reparsed.inputSha256);
  });

  it("rejects mutated controls, amount, protocol, source and permission metadata", async () => {
    const bytes = await fixture("SAMPLE_MERCHANT4_CLOVER.pdf");
    const document = await parsePdfBytes(bytes);
    const identity = adjudicateSupportedFiservProtocolIdentity(document);
    const run = proveNeutralFromParsedPdfBytes(document, bytes);
    const support = { sourceSha256: run.inputSha256, identity };
    const fee = run.facts.find((fact) => fact.id === "total_processing_fees")!;
    const alteredFee = (changed: typeof fee) => ({ ...run,
      facts: run.facts.map((fact) => fact.id === fee.id ? changed : fact) });
    const weakened = [
      alteredFee({ ...fee, amountMinor: -131254 }),
      alteredFee({ ...fee, amountMinor: 131255 }),
      alteredFee({ ...fee, controlRefs: ["fee_component_sum"] }),
      alteredFee({ ...fee, controlRefs: ["fee_component_sum", "nonexistent_control"] }),
      alteredFee({ ...fee, evidenceRefs: ["nonexistent_evidence"] }),
      alteredFee({ ...fee, unit: null }),
      alteredFee({ ...fee, population: { ...fee.population, currency: null } }),
      alteredFee({ ...fee, population: { ...fee.population, period: { ...fee.population.period,
        economicCoverage: "versioned_same_period" as const } } }),
      { ...run, routing: { ...run.routing, status: "ambiguous_protocol" as const, selectedId: null } },
      { ...run, sourceIntegrity: { ...run.sourceIntegrity, statementPages: "conflicting" as const } },
      { ...run, evidence: { ...run.evidence, lanes: run.evidence.lanes.map((lane) =>
        ({ ...lane, modality: "ocr" as const })) } },
    ];
    for (const changed of weakened) {
      expect(evaluateResearchFeeFact(changed, support).permission.prospective).toBe("withheld");
    }
    const audit = evaluatePhase2FeeForNewUpload(document, bytes);
    process.env[PHASE2_FEE_FLAG] = "true";
    expect(publicPhase2FeeFact({ ...audit, permissionVersion: "wrong" as never })).toBeNull();
    expect(publicPhase2FeeFact({ ...audit, candidate: { ...audit.candidate,
      amount: { ...audit.candidate.amount, displayChargeMagnitudeMinor: 1 } } })).toBeNull();
    expect(publicPhase2FeeFactForJob({ status: "failed", phase2FeeAudit: audit })).toBeNull();
    expect(publicPhase2FeeFactForJob({ status: "queued", phase2FeeAudit: audit })).toBeNull();
  });
});
