import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import {
  buildCanonicalFeeOwnershipActionability,
  createStatementSpecificHumanOverride,
  makeCanonicalFeeAiSuggestion,
  makeCanonicalFeeSpreadAssertion,
  referenceRuleToCanonicalReference,
  resolveFeeClassificationCandidates,
  reusableRuleCannotBeCreatedAutomatically,
  type CanonicalFeeReferenceRuleInput,
} from "../../src/canonical/feeOwnershipActionability.js";
import { buildCanonicalFeeLedger } from "../../src/canonical/feeLedger.js";
import { validateCanonicalStatementAnalysis } from "../../src/canonical/validate.js";
import type {
  CanonicalFeeClassificationCandidate,
  CanonicalFeeLedger,
  CanonicalFeeSelectedClassification,
  CanonicalStatementAnalysis,
} from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical fee ownership and actionability", () => {
  it.each([
    {
      name: "known interchange row",
      row: feeRow({ description: "Visa CPS Retail Interchange", type: "Interchange charges", section: "Interchange Charges" }),
      expectedCategory: "interchange",
      expectedOwner: "issuer_or_interchange",
      expectedActionability: "not_actionable",
    },
    {
      name: "known card-brand assessment",
      row: feeRow({ description: "CR DUES AND ASSESS", network: "VISA", section: "Card Brand Fees" }),
      expectedCategory: "card_brand_network_assessment",
      expectedOwner: "card_brand",
      expectedActionability: "not_actionable",
    },
    {
      name: "known network authorization fee",
      row: feeRow({ description: "NABU FEES", network: "MASTERCARD", section: "Network Fees" }),
      expectedCategory: "network_access_or_authorization",
      expectedOwner: "card_brand",
      expectedActionability: "not_actionable",
    },
    {
      name: "processor per-item fee",
      row: feeRow({ description: "CPU GTWY", section: "Service Charges" }),
      expectedCategory: "processor_per_item_fee",
      expectedOwner: "processor",
      expectedActionability: "potentially_actionable",
    },
    {
      name: "processor percentage markup",
      row: feeRow({ description: "QUAL DISC", section: "Service Charges" }),
      expectedCategory: "processor_markup",
      expectedOwner: "processor",
      expectedActionability: "potentially_actionable",
    },
    {
      name: "administrative monthly fee",
      row: feeRow({ description: "Monthly Admin Fee", section: "Fees" }),
      expectedCategory: "administrative_fee",
      expectedOwner: "processor",
      expectedActionability: "verify_only",
    },
    {
      name: "compliance fee",
      row: feeRow({ description: "PCI Non Compliance Fee", section: "Account Fees" }),
      expectedCategory: "compliance_fee",
      expectedOwner: "merchant_contract",
      expectedActionability: "verify_only",
    },
    {
      name: "equipment lease",
      row: feeRow({ description: "Terminal Lease Fee", section: "Account Fees" }),
      expectedCategory: "equipment_or_lease",
      expectedOwner: "merchant_contract",
      expectedActionability: "verify_only",
    },
    {
      name: "third-party product",
      row: feeRow({ description: "DoorDash Online Ordering", section: "Third Party Fees" }),
      expectedCategory: "third_party_product",
      expectedOwner: "third_party",
      expectedActionability: "verify_only",
    },
    {
      name: "tax/government fee with authoritative evidence",
      row: feeRow({ description: "State Government Tax", section: "Tax Government Fees" }),
      expectedCategory: "tax_or_government",
      expectedOwner: "tax_or_government",
      expectedActionability: "not_actionable",
    },
    {
      name: "unknown fee",
      row: feeRow({ description: "Misc Review Fee", section: "Fees" }),
      expectedCategory: "unknown_needs_review",
      expectedOwner: "unknown",
      expectedActionability: "unknown",
    },
    {
      name: "contract-dependent fee",
      row: feeRow({ description: "Chargeback Fee", section: "Account Fees" }),
      expectedCategory: "chargeback_or_dispute",
      expectedOwner: "merchant_contract",
      expectedActionability: "verify_only",
    },
  ])("$name gets the approved Package D safe classification", ({ row, expectedCategory, expectedOwner, expectedActionability }) => {
    const selected = selectedFor(singleRowLedger(row));

    expect(selected.category).toBe(expectedCategory);
    expect(selected.ownership.economicBeneficiary).toBe(expectedOwner);
    expect(selected.actionabilityCeiling).toBe(expectedActionability);
  });

  it("network-like labels with insufficient proof stay verification-only and cannot become potentially actionable", () => {
    const selected = selectedFor(singleRowLedger(feeRow({ description: "Network Assessment Fee", section: "Fees" })));

    expect(selected.category).toBe("unknown_needs_review");
    expect(selected.ownership.economicBeneficiary).toBe("unknown");
    expect(selected.actionabilityCeiling).toBe("verify_only");
    expect(selected.selectionReason).toMatch(/keywords are insufficient/i);
  });

  it("processor collection does not imply processor ownership for network and interchange base fees", () => {
    const network = selectedFor(singleRowLedger(feeRow({ description: "NABU FEES", network: "MASTERCARD", section: "Network Fees" })));
    const interchange = selectedFor(singleRowLedger(feeRow({ description: "Visa Retail Interchange", type: "Interchange charges", section: "Interchange Charges" })));

    expect(network.ownership.collector).toBe("processor");
    expect(network.ownership.economicBeneficiary).toBe("card_brand");
    expect(network.actionabilityCeiling).toBe("not_actionable");
    expect(interchange.ownership.collector).toBe("processor");
    expect(interchange.ownership.economicBeneficiary).toBe("issuer_or_interchange");
    expect(interchange.actionabilityCeiling).toBe("not_actionable");
  });

  it.each([
    ["Network Fee", "verify_only"],
    ["Assessment Fee", "verify_only"],
    ["Regulatory Product", "verify_only"],
    ["Tax Recovery Fee", "verify_only"],
    ["Compliance Fee", "unknown"],
    ["Authorization Fee", "unknown"],
    ["Gateway Fee", "verify_only"],
    ["Service Fee", "unknown"],
    ["Equipment Fee", "unknown"],
    ["PCI Fee", "unknown"],
  ])("%s label alone does not prove authoritative ownership or savings actionability", (description, actionability) => {
    const selected = selectedFor(singleRowLedger(feeRow({ description, section: "Fees" })));

    expect(selected.actionabilityCeiling).toBe(actionability);
    expect(selected.actionabilityCeiling).not.toBe("potentially_actionable");
  });

  it("medium-confidence processor labels remain verification-only", () => {
    const selected = selectedFor(singleRowLedger(feeRow({ description: "Processor Fee", section: "Fees", confidence: "medium" })));

    expect(selected.category).toBe("administrative_fee");
    expect(selected.ownership.economicBeneficiary).toBe("processor");
    expect(selected.actionabilityCeiling).toBe("verify_only");
  });

  it("low-confidence classifications remain unknown", () => {
    const selected = selectedFor(singleRowLedger(feeRow({ description: "CPU GTWY", section: "Service Charges", confidence: "low" })));

    expect(selected.category).toBe("unknown_needs_review");
    expect(selected.actionabilityCeiling).toBe("unknown");
  });

  it("third-party fees remain verification-only without service or contract evidence", () => {
    const selected = selectedFor(singleRowLedger(feeRow({ description: "Uber Eats Marketplace", section: "Third Party Fees" })));

    expect(selected.ownership.economicBeneficiary).toBe("third_party");
    expect(selected.actionabilityCeiling).toBe("verify_only");
    expect(selected.selectionReason).toMatch(/default to verification-only/i);
  });

  it("AI suggestions are provider-neutral, sanitized, and non-authoritative", () => {
    const ledger = singleRowLedger(feeRow({ description: "Network Assessment Fee", section: "Fees" }));
    const feeRowId = ledger.rows[0]!.id;
    const suggestion = makeCanonicalFeeAiSuggestion({
      id: "ai_fee_1",
      feeRowId,
      provider: "openai",
      model: "test-model",
      suggestedCategory: "processor_markup",
      suggestedOwnership: ownership("processor"),
      suggestedActionabilityCeiling: "potentially_actionable",
      confidence: "high",
      reasonCodes: ["ai_only"],
      safeEvidenceRefs: [],
      sanitizedExplanation: "Provider output mentioned /Users/example/private.pdf and sk-secret-key.",
    });
    const layer = buildCanonicalFeeOwnershipActionability(ledger, { aiSuggestions: [suggestion] });

    expect(suggestion.authoritative).toBe(false);
    expect(suggestion.sanitizedExplanation).not.toMatch(/\/Users|sk-secret/);
    expect(layer.aiSuggestions).toHaveLength(1);
    expect(layer.rowClassifications[0]!.selected.actionabilityCeiling).toBe("verify_only");
  });

  it("human overrides are statement-specific and never create reusable rules automatically", () => {
    const ledger = singleRowLedger(feeRow({ description: "DoorDash Online Ordering", section: "Third Party Fees" }));
    const previous = selectedFor(ledger);
    const feeRowId = ledger.rows[0]!.id;
    const override = createStatementSpecificHumanOverride({
      id: "override_1",
      feeRowId,
      reviewerId: "reviewer_42",
      reviewedAt: "2026-07-27T00:00:00.000Z",
      evidenceRefs: ledger.sourceOccurrences.map((item) => item.evidenceRef),
      reason: "Contract excerpt says this service was not authorized and can be cancelled.",
      previousClassification: previous,
      newClassification: {
        ...previous,
        candidateId: "human_override_candidate",
        actionabilityCeiling: "potentially_actionable",
        confidence: "high",
        selectionReason: "Human-verified statement-specific contract evidence.",
      },
      supersedesOverrideId: null,
      supersededByOverrideId: null,
    });
    const layer = buildCanonicalFeeOwnershipActionability(ledger, { humanOverrides: [override] });

    expect(override.scope).toBe("statement_specific");
    expect(override.reusableRuleCreated).toBe(false);
    expect(reusableRuleCannotBeCreatedAutomatically()).toBe(false);
    expect(layer.humanOverrides).toHaveLength(1);
    expect(layer.rowClassifications[0]!.selected.actionabilityCeiling).toBe("potentially_actionable");
  });

  it("period-inapplicable references cannot prove classification for an older statement", () => {
    const ledger = singleRowLedger(feeRow({ description: "NABU FEES", section: "Fees" }));
    const layer = buildCanonicalFeeOwnershipActionability(ledger, {
      statementPeriodStart: "2024-09-01",
      referenceRules: [nabu2026Reference()],
    });
    const selected = layer.rowClassifications[0]!.selected;

    expect(selected.category).toBe("unknown_needs_review");
    expect(selected.actionabilityCeiling).toBe("verify_only");
    expect(layer.rowClassifications[0]!.candidates.some((candidate) => candidate.reference?.periodApplicable === false)).toBe(true);
  });

  it("period-applicable references can prove non-actionable base network classification", () => {
    const ledger = singleRowLedger(feeRow({ description: "NABU FEES", section: "Fees" }));
    const layer = buildCanonicalFeeOwnershipActionability(ledger, {
      statementPeriodStart: "2026-05-01",
      referenceRules: [nabu2026Reference()],
    });
    const selected = layer.rowClassifications[0]!.selected;

    expect(selected.category).toBe("network_access_or_authorization");
    expect(selected.ownership.economicBeneficiary).toBe("card_brand");
    expect(selected.actionabilityCeiling).toBe("not_actionable");
  });

  it("conflicts never resolve by source order", () => {
    const feeRowId = "fee_conflict";
    const left = manualCandidate(feeRowId, "left", "processor_markup", ownership("processor"), "potentially_actionable");
    const right = manualCandidate(feeRowId, "right", "card_brand_network_assessment", ownership("card_brand"), "not_actionable");
    const resolution = resolveFeeClassificationCandidates(feeRowId, [right, left], []);
    const reversed = resolveFeeClassificationCandidates(feeRowId, [left, right], []);

    expect(resolution.conflictStatus).toBe("requires_human_review");
    expect(resolution.selected.category).toBe("unknown_needs_review");
    expect(resolution.selected.actionabilityCeiling).toBe("unknown");
    expect(resolution.selected.selectionReason).toMatch(/source order/i);
    expect(reversed.conflictStatus).toBe(resolution.conflictStatus);
    expect(reversed.selected.category).toBe(resolution.selected.category);
    expect(reversed.selected.ownership).toEqual(resolution.selected.ownership);
    expect(reversed.selected.actionabilityCeiling).toBe(resolution.selected.actionabilityCeiling);
  });

  it("weaker generic candidates cannot override stronger source-backed evidence", () => {
    const feeRowId = "fee_strength";
    const sourceBacked = manualCandidate(feeRowId, "source_backed", "card_brand_network_assessment", ownership("card_brand"), "not_actionable", {
      sourceType: "deterministic_rule",
      confidence: "high",
    });
    const generic = manualCandidate(feeRowId, "generic", "administrative_fee", ownership("processor"), "verify_only", {
      sourceType: "safe_default",
      confidence: "medium",
    });
    const resolution = resolveFeeClassificationCandidates(feeRowId, [generic, sourceBacked], []);

    expect(resolution.conflictStatus).toBe("resolved_by_stronger_evidence");
    expect(resolution.selected.category).toBe("card_brand_network_assessment");
    expect(resolution.selected.rejectedCandidateIds).toContain("generic");
  });

  it("hidden spread is represented separately from the base network/card-brand fee", () => {
    const reference = referenceRuleToCanonicalReference(nabu2026Reference(), "2026-05-01");
    const suspected = makeCanonicalFeeSpreadAssertion({
      id: "spread_suspected",
      baseFeeRowId: "base_fee",
      status: "suspected",
      evidenceRefs: ["ev_1"],
      reference,
      reason: "Observed rate differs from expected base, but proof is incomplete.",
    });
    const proven = makeCanonicalFeeSpreadAssertion({
      id: "spread_proven",
      baseFeeRowId: "base_fee",
      status: "proven",
      evidenceRefs: ["ev_1"],
      reference,
      reason: "Period-correct authoritative evidence proves processor spread.",
    });
    const rejected = makeCanonicalFeeSpreadAssertion({
      id: "spread_rejected",
      baseFeeRowId: "base_fee",
      status: "rejected",
      evidenceRefs: ["ev_1"],
      reference,
      reason: "No spread supported.",
    });

    expect(suspected).toMatchObject({ owner: "unknown", actionabilityCeiling: "verify_only", authoritative: false });
    expect(proven).toMatchObject({ owner: "processor", actionabilityCeiling: "potentially_actionable", authoritative: true });
    expect(rejected).toMatchObject({ owner: "unknown", actionabilityCeiling: "not_actionable", authoritative: false });
  });

  it("proven hidden spread requires period-applicable reference and matching fee-row evidence", () => {
    const inapplicable = referenceRuleToCanonicalReference(nabu2026Reference(), "2024-09-01");

    expect(() =>
      makeCanonicalFeeSpreadAssertion({
        id: "spread_bad_reference",
        baseFeeRowId: "base_fee",
        status: "proven",
        evidenceRefs: ["ev_1"],
        reference: inapplicable,
        reason: "Invalid proof.",
      }),
    ).toThrow(/period-applicable/i);
    expect(() =>
      makeCanonicalFeeSpreadAssertion({
        id: "spread_bad_evidence",
        baseFeeRowId: "base_fee",
        status: "proven",
        evidenceRefs: [],
        reference: referenceRuleToCanonicalReference(nabu2026Reference(), "2026-05-01"),
        reason: "Invalid proof.",
      }),
    ).toThrow(/evidence/i);
  });

  it("Package D output contains no savings or annualized opportunity amounts", () => {
    const layer = buildCanonicalFeeOwnershipActionability(singleRowLedger(feeRow({ description: "QUAL DISC", section: "Service Charges" })));

    const serialized = JSON.stringify(layer);
    expect(serialized).not.toMatch(/annualSavings|estimatedAnnual|opportunitySummary|annualImpact|monthlyImpact|amountUsd|amountMinor/i);
  });

  it("covers the El Nuevo-style network/actionability regression as a generic pattern", () => {
    const ledger = singleRowLedger(feeRow({ description: "ACCESS FEE", network: "VISA", section: "Fees" }));
    const selected = selectedFor(ledger);

    expect(selected.category).toBe("unknown_needs_review");
    expect(selected.actionabilityCeiling).toBe("verify_only");
    expect(selected.ownership.economicBeneficiary).toBe("unknown");
  });

  it("preserves legitimate same labels with different owners as separate row-level classifications", () => {
    const ledger = ledgerFromRows([
      feeRow({ description: "Monthly Fee", section: "Fees" }),
      feeRow({ description: "Monthly Fee", section: "Third Party Fees", evidenceLine: "Monthly Fee Third Party Service | -$10.00" }),
    ]);
    const layer = buildCanonicalFeeOwnershipActionability(ledger);

    expect(layer.rowClassifications).toHaveLength(2);
    expect(new Set(layer.rowClassifications.map((row) => row.feeRowId)).size).toBe(2);
  });

  it("records rule-version changes through candidate rule versions", () => {
    const selected = buildCanonicalFeeOwnershipActionability(singleRowLedger(feeRow({ description: "QUAL DISC", section: "Service Charges" })))
      .rowClassifications[0]!
      .candidates.find((candidate) => candidate.ruleId === "D-OWN-PROCESSOR-MARKUP-HIGH");

    expect(selected?.ruleVersion).toBe("1.0.0");
  });

  it("validation rejects missing Package D classification results and unsafe actionability", () => {
    const analysis = canonicalAnalysisForValidation();
    analysis.feeOwnershipActionability.rowClassifications = [];
    expect(() => validateCanonicalStatementAnalysis(analysis)).toThrow(/missing classification result/i);

    const unsafe = canonicalAnalysisForValidation();
    const selected = unsafe.feeOwnershipActionability.rowClassifications[0]!.selected;
    selected.ownership.economicBeneficiary = "unknown";
    selected.actionabilityCeiling = "potentially_actionable";
    selected.confidence = "medium";
    expect(() => validateCanonicalStatementAnalysis(unsafe)).toThrow(/protected or unknown economic owner|without high-confidence/i);
  });

  it("validation rejects malformed human overrides", () => {
    const analysis = canonicalAnalysisForValidation();
    const previous = analysis.feeOwnershipActionability.rowClassifications[0]!.selected;
    const override = createStatementSpecificHumanOverride({
      id: "override_bad",
      feeRowId: analysis.feeLedger.rows[0]!.id,
      reviewerId: "reviewer@example.com",
      reviewedAt: "not-a-date",
      evidenceRefs: [],
      reason: "",
      previousClassification: previous,
      newClassification: {
        ...previous,
        candidateId: "override_bad_candidate",
        actionabilityCeiling: "potentially_actionable",
        confidence: "medium",
      },
      supersedesOverrideId: null,
      supersededByOverrideId: null,
    });
    analysis.feeOwnershipActionability.humanOverrides = [override];

    expect(() => validateCanonicalStatementAnalysis(analysis)).toThrow(/human override/i);
  });

  it("validation enforces override supersession history and statement-specific applicability", () => {
    const analysis = canonicalAnalysisForValidation();
    const previous = analysis.feeOwnershipActionability.rowClassifications[0]!.selected;
    const first = createStatementSpecificHumanOverride({
      id: "override_first",
      feeRowId: analysis.feeLedger.rows[0]!.id,
      reviewerId: "reviewer_42",
      reviewedAt: "2026-07-27T00:00:00.000Z",
      evidenceRefs: [analysis.evidence.at(-1)!.id],
      reason: "Initial statement-specific review.",
      previousClassification: previous,
      newClassification: { ...previous, candidateId: "override_first_candidate", confidence: "high" },
      supersedesOverrideId: null,
      supersededByOverrideId: "override_second",
    });
    const second = createStatementSpecificHumanOverride({
      id: "override_second",
      feeRowId: analysis.feeLedger.rows[0]!.id,
      reviewerId: "reviewer_43",
      reviewedAt: "2026-07-28T00:00:00.000Z",
      evidenceRefs: [analysis.evidence.at(-1)!.id],
      reason: "Reversal creates a superseding record instead of mutating the first override.",
      previousClassification: first.newClassification,
      newClassification: previous,
      supersedesOverrideId: "override_first",
      supersededByOverrideId: null,
    });
    analysis.feeOwnershipActionability.humanOverrides = [first, second];

    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");

    const otherStatement = canonicalAnalysisForValidation();
    otherStatement.feeOwnershipActionability.humanOverrides = [{ ...second, feeRowId: "fee_row_from_other_statement" }];
    expect(() => validateCanonicalStatementAnalysis(otherStatement)).toThrow(/unknown fee row/i);
  });

  it("validation rejects AI-authoritative classifications, broken refs, missing versions, forbidden financial-impact fields, and unsupported conflict resolution", () => {
    const aiAuthoritative = canonicalAnalysisForValidation();
    aiAuthoritative.feeOwnershipActionability.rowClassifications[0]!.candidates[0]!.sourceType = "ai_suggestion";
    (aiAuthoritative.feeOwnershipActionability.rowClassifications[0]!.candidates[0] as CanonicalFeeClassificationCandidate).authoritative = true;
    expect(() => validateCanonicalStatementAnalysis(aiAuthoritative)).toThrow(/AI candidate/i);

    const brokenRef = canonicalAnalysisForValidation();
    brokenRef.feeOwnershipActionability.rowClassifications[0]!.candidates[0]!.evidenceRefs = ["ev_missing"];
    expect(() => validateCanonicalStatementAnalysis(brokenRef)).toThrow(/evidence ref ev_missing is broken/i);

    const missingVersion = canonicalAnalysisForValidation();
    (missingVersion.feeOwnershipActionability as any).ruleRegistryVersion = null;
    expect(() => validateCanonicalStatementAnalysis(missingVersion)).toThrow(/fee_ownership_rules_v1/i);

    const forbiddenField = canonicalAnalysisForValidation();
    (forbiddenField.feeOwnershipActionability.rowClassifications[0] as any).annualSavings = 10;
    expect(() => validateCanonicalStatementAnalysis(forbiddenField)).toThrow(/forbidden financial-impact field/i);

    const unsupportedConflict = canonicalAnalysisForValidation();
    const classification = unsupportedConflict.feeOwnershipActionability.rowClassifications[0]!;
    classification.conflictStatus = "resolved_by_stronger_evidence";
    classification.conflictReason = null;
    classification.selected.rejectedCandidateIds = [];
    expect(() => validateCanonicalStatementAnalysis(unsupportedConflict)).toThrow(/without resolution evidence/i);
  });
});

function selectedFor(ledger: CanonicalFeeLedger): CanonicalFeeSelectedClassification {
  const classification = buildCanonicalFeeOwnershipActionability(ledger).rowClassifications[0];
  expect(classification).toBeDefined();
  return classification!.selected;
}

function nabu2026Reference(): CanonicalFeeReferenceRuleInput {
  return {
    referenceId: "MC_NABU_AUTH_US_2026_04",
    version: "Effective April 2026; test",
    aliases: ["NABU FEES"],
    category: "network_access_or_authorization",
    owner: "card_brand",
    applicableProcessorOrNetwork: "MASTERCARD",
    effectiveFrom: "2026-04-01",
    effectiveTo: null,
    sourceProvenance: "Synthetic period-safety reference.",
    requiredMatchingFields: ["label", "statementPeriodStart"],
    negativePatterns: ["processor markup"],
  };
}

function manualCandidate(
  feeRowId: string,
  id: string,
  category: CanonicalFeeClassificationCandidate["category"],
  candidateOwnership: CanonicalFeeClassificationCandidate["ownership"],
  actionabilityCeiling: CanonicalFeeClassificationCandidate["actionabilityCeiling"],
  options: Partial<Pick<CanonicalFeeClassificationCandidate, "sourceType" | "confidence">> = {},
): CanonicalFeeClassificationCandidate {
  return {
    id,
    feeRowId,
    category,
    ownership: candidateOwnership,
    actionabilityCeiling,
    documentationRequirement: "recommended",
    confidence: options.confidence ?? "high",
    sourceType: options.sourceType ?? "deterministic_rule",
    ruleId: `D-TEST-${id}`,
    ruleVersion: "1.0.0",
    ruleProvenance: "Synthetic conflict test.",
    evidenceRefs: [],
    reference: null,
    authoritative: true,
    reason: `Synthetic ${id} candidate.`,
    permissionConsequences: [],
    limitations: [],
  };
}

function ownership(owner: "processor" | "card_brand" | "third_party"): CanonicalFeeClassificationCandidate["ownership"] {
  return { collector: owner === "processor" ? "processor" : "processor", economicBeneficiary: owner, contractualController: owner };
}

function singleRowLedger(row: Record<string, unknown>): CanonicalFeeLedger {
  return ledgerFromRows([row]);
}

function ledgerFromRows(rows: Record<string, unknown>[]): CanonicalFeeLedger {
  return ledgerFromRowsWithEvidence(rows).ledger;
}

function ledgerFromRowsWithEvidence(rows: Record<string, unknown>[]): { ledger: CanonicalFeeLedger; evidence: Map<string, any>; calculations: any[] } {
  const evidence = new Map();
  const calculations: any[] = [];
  const lines = rows.map((row) => String(row.evidenceLine ?? `${row.description} | -$${Number(row.amount ?? 1).toFixed(2)}`));
  const ledger = buildCanonicalFeeLedger({
    doc: feeDocument([...lines, "Total Fees | -$1.00"]),
    documentId: "doc_package_d",
    matched: { driverId: "synthetic_parser", driverName: "Synthetic parser" },
    evidence,
    calculations,
    parserOutput: {
      feeLedger: {
        rows,
        controls: [{ label: "Total Fees", rowSum: 1, printedTotal: 1, delta: 0, evidenceLine: "Total Fees | -$1.00" }],
        printedTotal: 1,
        delta: 0,
      },
    },
  });
  return { ledger, evidence, calculations };
}

function canonicalAnalysisForValidation(): CanonicalStatementAnalysis {
  const { ledger, evidence, calculations } = ledgerFromRowsWithEvidence([feeRow({ description: "QUAL DISC", section: "Service Charges" })]);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(
    feeDocument(["Total Amount Submitted | $100.00", "Fees Charged | -$1.00"]),
    { sourceFileName: "package-d-validation.pdf", preferExtractedRows: true },
  );
  analysis.feeLedger = ledger;
  analysis.feeOwnershipActionability = buildCanonicalFeeOwnershipActionability(ledger);
  analysis.evidence = [...analysis.evidence, ...evidence.values()];
  analysis.calculations = [...analysis.calculations, ...calculations];
  return analysis;
}

function feeRow(input: {
  description: string;
  network?: string | null;
  type?: string | null;
  section?: string;
  confidence?: "high" | "medium" | "low";
  evidenceLine?: string;
}): Record<string, unknown> {
  return {
    network: input.network ?? null,
    type: input.type ?? null,
    description: input.description,
    amount: 1,
    sourceSection: input.section ?? "Fees",
    evidenceLine: input.evidenceLine ?? `${input.description} | -$1.00`,
    pageNumber: 1,
    confidence: input.confidence ?? "high",
  };
}

function feeDocument(lines: string[]): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: {
      mode: "structured",
      qualityScore: 1,
      reasons: ["Synthetic Package D fixture."],
      lineCount: lines.length,
      amountTokenCount: lines.length,
      hasExtractableText: true,
    },
  };
}
