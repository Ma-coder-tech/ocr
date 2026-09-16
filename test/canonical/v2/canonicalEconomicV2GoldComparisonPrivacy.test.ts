import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCanonicalEconomicsV2EconomicAnalysis,
  canonicalEconomicPrivacySafeDiagnostics,
  compareLegacyAndCanonicalEconomicsV2,
  observeCanonicalEconomicsV2ForGold,
  RD_SEMANTIC_AMENDMENT_IDS,
} from "../../../src/canonical/v2/index.js";
import { approvedEconomicInput, buildApprovedEconomics } from "./economicFixtures.js";

describe("Canonical Economics V2 RD Gold, comparison, privacy, and anti-overfitting", () => {
  it("exposes generic S6 exclusion and S10 observed-cost behavior without savings semantics", () => {
    const observation = observeCanonicalEconomicsV2ForGold(buildApprovedEconomics());

    expect(observation.provenanceStatus).toBe("approved_synthetic");
    expect(observation.states["financial.settlement_adjustment"]).toBe("funding_only_not_processing_cost");
    expect(observation.values["cost.observed_processor_billed_fee"]).toBe(31);
    expect(observation.values["risk.misc_chargebacks_fee"]).toBe(15);
    expect(observation.states["cost.statement_cost_scope"]).toBe("statement_evidenced_processing_cost_not_total_acceptance_cost");
    expect(observation.claims).toEqual([]);
    expect(observation.enforcedProhibitions).toEqual(expect.arrayContaining([
      "DOUBLE_COUNT_REPEATED_INTERCHANGE_DETAIL",
      "PROCESSOR_OWNERSHIP_FROM_ROUND_AMOUNT",
      "UNIVERSAL_PENNY_TOLERANCE",
      "TOTAL_ACCEPTANCE_COST_WITH_OFF_STATEMENT_UNKNOWNS",
      "FEE_EVENT_COUNT_AS_AUTHORITATIVE_DISPUTE_RATIO",
    ]));
    expect(Object.keys(observation.values)).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/savings|opportunity|benchmark/i),
    ]));
    expect(Object.keys(observation.states)).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/savings|opportunity|benchmark/i),
    ]));
  });

  it("classifies only approved legacy economic restructurings and detects unexplained shared-fact differences", () => {
    const input = approvedEconomicInput();
    input.charges!.find((charge) => charge.key === "statement_fee")!.category = "processor_acquirer_pricing";
    const analysis = buildCanonicalEconomicsV2EconomicAnalysis(input);
    const comparison = compareLegacyAndCanonicalEconomicsV2({
      statementProcessingFeeTotal: { amountMinor: 4500, currency: "USD" },
      uniqueChargeCount: 4,
      processorControlledTotal: { amountMinor: 3100, currency: "USD" },
      processorControlledTotalPositiveEvidenceProven: false,
      emitsExactOwnershipWithoutPositiveProof: true,
      mayDoubleCountRepeatedRepresentations: true,
      includesNonFeeSettlementActivityInFeeCost: true,
      describesStatementFeesAsTotalAcceptanceCost: true,
    }, analysis);

    expect(comparison.hasUnexpectedDivergence).toBe(false);
    expect(comparison.counts.approved_semantic_amendment).toBe(5);
    expect(comparison.items.filter((item) => item.classification === "approved_semantic_amendment").map((item) => item.amendmentId)).toEqual(expect.arrayContaining([
      "RD-AMEND-001-ECONOMIC-CHARGE-IDENTITY",
      "RD-AMEND-002-INDEPENDENT-CONTROL-ROLES",
      "RD-AMEND-003-POSITIVE-IDENTIFICATION",
      "RD-AMEND-005-FEE-DIRECTION-AND-NONFEE-EXCLUSION",
      "RD-AMEND-006-STATEMENT-COST-NOT-TOTAL-ACCEPTANCE-COST",
    ]));

    const unexpected = compareLegacyAndCanonicalEconomicsV2({
      statementProcessingFeeTotal: { amountMinor: 4600, currency: "USD" },
      uniqueChargeCount: 3,
      processorControlledTotal: null,
      emitsExactOwnershipWithoutPositiveProof: false,
      mayDoubleCountRepeatedRepresentations: false,
      includesNonFeeSettlementActivityInFeeCost: false,
      describesStatementFeesAsTotalAcceptanceCost: false,
    }, buildApprovedEconomics());
    expect(unexpected.hasUnexpectedDivergence).toBe(true);
    expect(unexpected.items).toContainEqual(expect.objectContaining({
      fact: "statement_processing_fee_total",
      classification: "unexpected_divergence",
    }));
  });

  it("declares exactly the six approved amendments", () => {
    const analysis = buildApprovedEconomics();
    expect(analysis.economicLayer.semanticAmendments.map((item) => item.id).sort()).toEqual([...RD_SEMANTIC_AMENDMENT_IDS].sort());
  });

  it("emits privacy-safe diagnostics with no identities, labels, refs, amounts, hashes, or mappings", () => {
    const analysis = buildApprovedEconomics();
    const comparison = compareLegacyAndCanonicalEconomicsV2({
      statementProcessingFeeTotal: { amountMinor: 4500, currency: "USD" },
      uniqueChargeCount: 3,
      processorControlledTotal: null,
      emitsExactOwnershipWithoutPositiveProof: false,
      mayDoubleCountRepeatedRepresentations: false,
      includesNonFeeSettlementActivityInFeeCost: false,
      describesStatementFeesAsTotalAcceptanceCost: false,
    }, analysis);
    const diagnostics = canonicalEconomicPrivacySafeDiagnostics(analysis, comparison);
    const serialized = JSON.stringify(diagnostics);

    expect(diagnostics).toMatchObject({
      validationStatus: "valid",
      chargeCount: 3,
      participantCount: 1,
      unresolvedRoleCount: 1,
      dependencyCount: 1,
      stackCompleteness: "complete",
      hasUnexpectedDivergence: false,
    });
    expect(serialized).not.toMatch(/Synthetic private|economic_(?:charge|participant|role|dependency)_|occurrence_|evidence_|sourceDocument|filename|fingerprint|hash|amountMinor|4500|3100|1500|100/);
  });

  it("keeps production RD logic free of merchant, Gold-case, private-hash, and legacy fee-dictionary branches", () => {
    const directory = path.resolve(process.cwd(), "src/canonical/v2");
    const sources = fs.readdirSync(directory)
      .filter((name) => /^(?:economic|fiservEconomic)/.test(name) && name.endsWith(".ts"))
      .map((name) => fs.readFileSync(path.join(directory, name), "utf8"))
      .join("\n");

    expect(sources).not.toMatch(/merchantName|sourceFileName|filename|goldCase|statementHash|sourceFingerprint|fiserv_fee_reference|loadFiservFeeReference/);
    expect(sources).not.toMatch(/G[1-9]-|S(?:10|[1-9])-/);
  });
});
