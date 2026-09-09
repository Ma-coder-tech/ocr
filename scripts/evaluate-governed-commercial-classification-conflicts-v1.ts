import { readFile, mkdir, writeFile } from "node:fs/promises";
import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import {
  buildInternalAnalystFindingV1,
  canonicalFinancialTruthFingerprint,
  type InternalAnalystPricingModelInput,
} from "../src/canonical/internalAnalystFindingV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { parsePdf, type ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import { classifyCommercialRoleV1 } from "./lib/commercialDecompositionDiagnosticV1.js";

const SCHEMA_VERSION = "governed_commercial_classification_conflict_diagnostic_2026_09_09_v1" as const;
const SOURCE_EVALUATION = "evaluations/commercial-decomposition-validation-e1-e2-v1/evaluation-2026-09-09.json";
const OUTPUT_DIR = "evaluations/governed-commercial-classification-conflict-diagnostic-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-09.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-09.md`;
const PRODUCT_AUTHORITY = {
  file: "RateReveal_Commercial_Analysis_Research_FINAL_Product_Adjudicated_v1.md",
  sha256: "1d17472bf7437c9100b23afe989bd505763e4c1d8a98eace2ae018c35db78ce0",
};
const BASELINE = {
  branch: "codex/commercial-decomposition-validation-e1-e2-v1",
  commit: "eaf2ab9628b997e4bf1e9ce5eb1b05e27bc211f0",
};
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };
const GOLD: Array<{ file: string; businessType: BusinessTypeId }> = [
  { file: "Nov_2024_Statement.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT4_CLOVER.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf", businessType: "other" },
  { file: "fiserv_ABDUL_BASHER_Aug_2025.pdf", businessType: "retail" },
  { file: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_NXGEN_VORTAX_Sep_2022.pdf", businessType: "retail" },
  { file: "fiserv_PAYSAFE_Febr_2024.pdf", businessType: "professional_services" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", businessType: "ecommerce" },
  { file: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", businessType: "restaurant_food_beverage" },
];

type Impact = "HIGH" | "MEDIUM" | "LOW";
type Assessment =
  | "EXISTING_GOVERNED_INTERPRETATION_APPEARS_STRONGER"
  | "DIAGNOSTIC_TREATMENT_APPEARS_STRONGER"
  | "BOTH_CAN_COEXIST_DIFFERENT_FIELDS_OR_SCOPES"
  | "GENUINELY_UNRESOLVED_PRODUCT_DOMAIN_ADJUDICATION_REQUIRED";
type ResearchDisposition =
  | "CONSISTENCY_CLEANUP_ONLY"
  | "PRODUCT_ADJUDICATION_FROM_EXISTING_EVIDENCE"
  | "BOUNDED_DOMAIN_RESEARCH_BEFORE_PRODUCT_ADJUDICATION"
  | "NO_NEW_RESEARCH_DIFFERENT_SCOPES"
  | "MERCHANT_OR_PROVIDER_DOCUMENTS_MORE_USEFUL_THAN_PUBLIC_RESEARCH";
type FamilyId =
  | "MC_NETWORK_ACCESS_ALIAS_AND_LAYER_PRECEDENCE"
  | "VISA_INTERNATIONAL_SERVICE_FALLBACK_PRECEDENCE"
  | "AMEX_PROGRAM_COST_SCOPE_AND_RECONCILIATION"
  | "MC_CONNECTIVITY_KILOBYTE_ALIAS_AND_VINTAGE"
  | "TIERED_QUALIFICATION_ROW_VS_DOLLAR_COMPOSITION"
  | "DISPUTE_RETURN_CHARGEBACK_ROLE_AND_COMPOSITION"
  | "MC_ASSESSMENT_IDENTITY_VS_BUNDLED_COMPOSITION"
  | "REGULATORY_PRODUCT_FIVE_ROLE_MODEL_GAP";

type PriorDisagreement = {
  file: string;
  feeRowId: string;
  label: string;
  governedLayer: string;
  diagnosticRole: string;
  disagreement: string;
  canonicalOrGovernedMutationProposed: false;
};

type FamilyPolicy = {
  id: FamilyId;
  title: string;
  impact: Impact;
  rootCause: string;
  dimensions: string[];
  existingInterpretationSummary: string;
  diagnosticCautionSummary: string;
  diagnosticEvidenceRefs: string[];
  defaultAssessment: Assessment;
  defaultResearchDisposition: ResearchDisposition;
  alreadyAdjudicatedButInconsistentlyProjected: boolean;
  likelyAliasOrFallbackImplementationDefect: boolean;
  affects: {
    providerControlledDollars: boolean;
    residualCompleteness: boolean;
    commercialComparisonPermission: boolean;
    negotiabilityOrActionability: boolean;
    merchantFacingWording: boolean;
    researchWarrant: boolean;
  };
};

const FAMILY_POLICIES: Record<FamilyId, FamilyPolicy> = {
  MC_NETWORK_ACCESS_ALIAS_AND_LAYER_PRECEDENCE: {
    id: "MC_NETWORK_ACCESS_ALIAS_AND_LAYER_PRECEDENCE",
    title: "Mastercard network-access / NABU alias and layer precedence",
    impact: "HIGH",
    rootCause: "The exact governed NABU matcher recognizes NABU wording but not the printed NETWORK ACCESS AUTH FEE alias, allowing a generic per-item/acquiring projection to outrank stronger network-access evidence.",
    dimensions: ["identity/category", "economic layer", "rule/price setter", "merchant-facing price control", "commercial-dollar attribution"],
    existingInterpretationSummary: "The Open-World projection reports acquiring-commercial and acquiring-side price control from generic per-item/pricing rules.",
    diagnosticCautionSummary: "NETWORK ACCESS wording, the 0.0195 mechanic, and already-governed Mastercard NABU/network-access evidence support a network-family hypothesis; label and rate corroborate but do not alone prove identity or at-par billing.",
    diagnosticEvidenceRefs: ["RR-USN-07", "mastercard_nabu_2023_04", "CUR26-WRK-MC-NABU-US"],
    defaultAssessment: "DIAGNOSTIC_TREATMENT_APPEARS_STRONGER",
    defaultResearchDisposition: "PRODUCT_ADJUDICATION_FROM_EXISTING_EVIDENCE",
    alreadyAdjudicatedButInconsistentlyProjected: true,
    likelyAliasOrFallbackImplementationDefect: true,
    affects: effect(true, true, true, true, true, true),
  },
  VISA_INTERNATIONAL_SERVICE_FALLBACK_PRECEDENCE: {
    id: "VISA_INTERNATIONAL_SERVICE_FALLBACK_PRECEDENCE",
    title: "Visa international-service identity versus account-fee fallback",
    impact: "MEDIUM",
    rootCause: "A broad account/administrative fallback can outrank exact governed Visa international-service/ISA evidence, projecting acquiring-commercial control from category-only evidence.",
    dimensions: ["identity/category", "economic layer", "beneficiary", "price setter", "commercial-dollar attribution"],
    existingInterpretationSummary: "The Open-World result reports an F7 administrative/acquiring category and category-only acquiring-side controller.",
    diagnosticCautionSummary: "Explicit Visa international-service wording matches governed Visa ISA/international assessment knowledge for applicable periods; historical rows still require period-matched applicability.",
    diagnosticEvidenceRefs: ["visa_isa_2023_04", "CUR26-WRK-VISA-ISA-IAF"],
    defaultAssessment: "DIAGNOSTIC_TREATMENT_APPEARS_STRONGER",
    defaultResearchDisposition: "CONSISTENCY_CLEANUP_ONLY",
    alreadyAdjudicatedButInconsistentlyProjected: true,
    likelyAliasOrFallbackImplementationDefect: true,
    affects: effect(true, true, true, true, true, true),
  },
  AMEX_PROGRAM_COST_SCOPE_AND_RECONCILIATION: {
    id: "AMEX_PROGRAM_COST_SCOPE_AND_RECONCILIATION",
    title: "Amex program-cost scope and statement-local reconciliation",
    impact: "HIGH",
    rootCause: "Generic PROGRAM/acquiring rules and the conditional Amex program-cost adjudication cover different scopes; this printed AMEX ACQ row lacks the decisive reconciliation needed to assign the full billed amount.",
    dimensions: ["identity/category", "economic layer", "cardinality/composition", "beneficiary", "commercial-dollar attribution"],
    existingInterpretationSummary: "The current projection reports acquiring-commercial treatment for the printed AMEX ACQ program-cost row.",
    diagnosticCautionSummary: "Product permits network_program_cost only when statement-local program-cost structure reconciles; otherwise the layer and any acquiring uplift remain unresolved.",
    diagnosticEvidenceRefs: ["RR-B1-00", "RR-B1-02", "RR-B1-03"],
    defaultAssessment: "GENUINELY_UNRESOLVED_PRODUCT_DOMAIN_ADJUDICATION_REQUIRED",
    defaultResearchDisposition: "BOUNDED_DOMAIN_RESEARCH_BEFORE_PRODUCT_ADJUDICATION",
    alreadyAdjudicatedButInconsistentlyProjected: false,
    likelyAliasOrFallbackImplementationDefect: false,
    affects: effect(true, true, true, true, true, true),
  },
  MC_CONNECTIVITY_KILOBYTE_ALIAS_AND_VINTAGE: {
    id: "MC_CONNECTIVITY_KILOBYTE_ALIAS_AND_VINTAGE",
    title: "Mastercard auth-connectivity / kilobyte alias and evidence vintage",
    impact: "HIGH",
    rootCause: "A generic per-item/acquiring projection can outrank the governed Mastercard connectivity-kilobyte family; for the 2022 row, the available governed period scope is not strong enough to back-cast the later reference automatically.",
    dimensions: ["identity/category", "economic layer", "mechanic", "effective-period scope", "commercial-dollar attribution"],
    existingInterpretationSummary: "The Open-World result reports acquiring-commercial from generic per-item evidence while correctly recognizing the kilobyte mechanic; participant control is not consistently resolved across these rows.",
    diagnosticCautionSummary: "The exact connectivity/kilobyte label and 0.002294 unit align with governed Mastercard network evidence for supported periods; the current-value conflict does not erase historical identity, but it also must not be back-cast into 2022.",
    diagnosticEvidenceRefs: ["mastercard_connectivity_kb_2023_04", "CUR26-UNR-MC-CONNECTIVITY"],
    defaultAssessment: "DIAGNOSTIC_TREATMENT_APPEARS_STRONGER",
    defaultResearchDisposition: "CONSISTENCY_CLEANUP_ONLY",
    alreadyAdjudicatedButInconsistentlyProjected: true,
    likelyAliasOrFallbackImplementationDefect: true,
    affects: effect(true, true, true, true, true, true),
  },
  TIERED_QUALIFICATION_ROW_VS_DOLLAR_COMPOSITION: {
    id: "TIERED_QUALIFICATION_ROW_VS_DOLLAR_COMPOSITION",
    title: "QUAL / MQUAL / NQUAL pricing layer versus billed-dollar composition",
    impact: "HIGH",
    rootCause: "A correct acquiring-side merchant-facing tier/pricing classification is being read too broadly as if it proved that 100% of the billed row is provider-retained markup.",
    dimensions: ["pricing model", "price controller", "cardinality/composition", "underlying cost", "commercial-dollar attribution"],
    existingInterpretationSummary: "Governed Batch 1 correctly identifies the tier population and acquiring-side merchant-facing pricing program.",
    diagnosticCautionSummary: "The tier amount can bundle underlying interchange/program cost with acquiring-side spread; without component evidence, the full billed amount cannot be assigned to provider-controlled economics.",
    diagnosticEvidenceRefs: ["RR-B1-00", "RR-B1-01"],
    defaultAssessment: "BOTH_CAN_COEXIST_DIFFERENT_FIELDS_OR_SCOPES",
    defaultResearchDisposition: "NO_NEW_RESEARCH_DIFFERENT_SCOPES",
    alreadyAdjudicatedButInconsistentlyProjected: true,
    likelyAliasOrFallbackImplementationDefect: false,
    affects: effect(true, true, true, true, true, false),
  },
  DISPUTE_RETURN_CHARGEBACK_ROLE_AND_COMPOSITION: {
    id: "DISPUTE_RETURN_CHARGEBACK_ROLE_AND_COMPOSITION",
    title: "Dispute, return, chargeback, and ACH-reject role/composition",
    impact: "HIGH",
    rootCause: "Generic exception/per-item rules establish a merchant-facing event and sometimes an acquiring-side price, but do not establish whether the full amount is a network charge, processor service price, principal movement, or a bundle.",
    dimensions: ["identity/category", "economic layer", "assessment population", "participant roles", "cardinality/composition", "commercial-dollar attribution"],
    existingInterpretationSummary: "The existing projection commonly treats the row as acquiring-commercial with an exception/event mechanic.",
    diagnosticCautionSummary: "Network-named dispute fees, generic RETURNS/CHARGEBACKS, and ACH rejection charges have materially different economic meanings; collection and event count do not prove beneficiary or full-dollar provider retention.",
    diagnosticEvidenceRefs: ["RR-B2-00", "RR-B2-02", "mastercard_dispute_image_2026_07", "mastercard_dispute_case_2026_07"],
    defaultAssessment: "BOTH_CAN_COEXIST_DIFFERENT_FIELDS_OR_SCOPES",
    defaultResearchDisposition: "MERCHANT_OR_PROVIDER_DOCUMENTS_MORE_USEFUL_THAN_PUBLIC_RESEARCH",
    alreadyAdjudicatedButInconsistentlyProjected: false,
    likelyAliasOrFallbackImplementationDefect: false,
    affects: effect(true, true, true, true, true, true),
  },
  MC_ASSESSMENT_IDENTITY_VS_BUNDLED_COMPOSITION: {
    id: "MC_ASSESSMENT_IDENTITY_VS_BUNDLED_COMPOSITION",
    title: "Mastercard assessment identity versus bundled component composition",
    impact: "MEDIUM",
    rootCause: "The row's Mastercard network-assessment identity is stronger than the evidence for its exact 0.1475% component composition or absence of acquiring uplift.",
    dimensions: ["identity/category", "rate/mechanic", "cardinality/composition", "commercial-dollar attribution"],
    existingInterpretationSummary: "The governed layer correctly identifies a Mastercard network assessment family.",
    diagnosticCautionSummary: "Product already adjudicated 0.14% ABVF plus a plausible 0.0075% license component as a strong explanation, not proof; a small acquiring-side uplift cannot be excluded.",
    diagnosticEvidenceRefs: ["MC-FOCUSED-01", "MC-FOCUSED-02", "RR-MCF-08"],
    defaultAssessment: "BOTH_CAN_COEXIST_DIFFERENT_FIELDS_OR_SCOPES",
    defaultResearchDisposition: "NO_NEW_RESEARCH_DIFFERENT_SCOPES",
    alreadyAdjudicatedButInconsistentlyProjected: true,
    likelyAliasOrFallbackImplementationDefect: false,
    affects: effect(true, true, true, false, true, false),
  },
  REGULATORY_PRODUCT_FIVE_ROLE_MODEL_GAP: {
    id: "REGULATORY_PRODUCT_FIVE_ROLE_MODEL_GAP",
    title: "Regulatory product and five-role decomposition model gap",
    impact: "LOW",
    rootCause: "The governed layer has a government/non-processing pass-through category, while the five-role commercial diagnostic has no matching standalone bucket and therefore parks it in shared/unresolved.",
    dimensions: ["representation", "category mapping", "commercial-dollar attribution"],
    existingInterpretationSummary: "The governed result preserves a broad government/non-processing pass-through category without proving the exact recipient.",
    diagnosticCautionSummary: "The commercial diagnostic refuses to force the amount into network or provider economics; this is a representation mismatch, not contradictory evidence.",
    diagnosticEvidenceRefs: ["OWD-01", "OWD-02"],
    defaultAssessment: "BOTH_CAN_COEXIST_DIFFERENT_FIELDS_OR_SCOPES",
    defaultResearchDisposition: "NO_NEW_RESEARCH_DIFFERENT_SCOPES",
    alreadyAdjudicatedButInconsistentlyProjected: false,
    likelyAliasOrFallbackImplementationDefect: false,
    affects: effect(false, false, false, false, true, false),
  },
};

const prior = JSON.parse(await readFile(SOURCE_EVALUATION, "utf8")) as {
  classificationDisagreements: PriorDisagreement[];
};
if (prior.classificationDisagreements.length !== 37) throw new Error(`Expected 37 E1/E2 disagreements, found ${prior.classificationDisagreements.length}`);

const authority = new GovernedPaymentKnowledgeAuthority();
const disagreementsByFile = new Map<string, PriorDisagreement[]>();
for (const item of prior.classificationDisagreements) {
  const list = disagreementsByFile.get(item.file) ?? [];
  list.push(item);
  disagreementsByFile.set(item.file, list);
}

const rows: any[] = [];
const statementFingerprints: any[] = [];
for (const fixture of GOLD) {
  const selected = disagreementsByFile.get(fixture.file) ?? [];
  const document = await parsePdf(`test/fixtures/pdfs/${fixture.file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const before = canonicalFinancialTruthFingerprint(analysis);
  const pricingInput = deterministicPricing(document, fixture.file, fixture.businessType, analysis);
  const knowledge = authority.resolveStatement({ analysis, context: US_CONTEXT, suppliedPricingObservation: pricingInput });
  const analyst = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT, pricingModel: pricingInput, asOf: "2026-09-09" });
  const findings = new Map(analyst.findings.filter((finding) => finding.sourceFeeRowId).map((finding) => [finding.sourceFeeRowId!, finding]));

  for (const conflict of selected) {
    const row = analysis.feeLedger.rows.find((candidate) => candidate.id === conflict.feeRowId);
    if (!row) throw new Error(`Missing row ${conflict.feeRowId} in ${fixture.file}`);
    const open = knowledge.openWorldDeterminants.rowsByFeeRowId[row.id];
    const pricing = knowledge.pricingLayers.rowsByFeeRowId[row.id];
    const perItem = knowledge.perItem.rowsByFeeRowId[row.id];
    const dated = knowledge.datedNetworkFeeEvidence.rowsByFeeRowId[row.id];
    const usNetwork = knowledge.usNetworkFeeEvidence.rowsByFeeRowId[row.id];
    const current = knowledge.current2026UsCoreNetworkReference.rowsByFeeRowId[row.id];
    const focused = knowledge.mastercardFocusedEvidence.rowsByFeeRowId[row.id];
    const finding = findings.get(row.id) ?? null;
    if (!open || !pricing || !perItem || !dated || !usNetwork || !current || !focused) throw new Error(`Incomplete governed resolution for ${row.id}`);
    const commercial = classifyCommercialRoleV1({ row, knowledge, finding });
    const family = familyFor(row.selectedLabel);
    const policy = FAMILY_POLICIES[family];
    const period = analysis.identity.statementPeriod.value;
    const year = Number(period?.end?.slice(0, 4) ?? period?.start?.slice(0, 4) ?? "0");
    const assessment = rowAssessment(family, row.selectedLabel, year, policy.defaultAssessment);
    const researchDisposition = rowResearchDisposition(family, row.selectedLabel, year, policy.defaultResearchDisposition);
    const networkEvidenceRefs = unique([
      ...refs(dated),
      ...refs(usNetwork),
      ...refs(current),
      ...refs(focused),
    ]);
    const existingEvidenceRefs = unique([
      ...open.matchedRuleRefs,
      ...open.family.evidenceRefs,
      ...open.d1EconomicLayerAndControl.economicLayer.evidenceRefs,
      ...open.d1EconomicLayerAndControl.merchantFacingPriceController.evidenceRefs,
      ...pricing.matchedRuleRefs,
      ...pricing.evidenceRefs,
      ...perItem.matchedRuleRefs,
      ...perItem.evidenceRefs,
    ]);
    rows.push({
      conflictId: `commercial_conflict_${String(rows.length + 1).padStart(2, "0")}`,
      familyId: family,
      impact: policy.impact,
      statement: {
        file: fixture.file,
        processorFamily: analysis.identity.processorFamily.value,
        period,
        businessType: fixture.businessType,
        pricingModel: knowledge.pricingLayers.pricingModel,
      },
      feeRowId: row.id,
      printedLabel: row.selectedLabel,
      billedAmountMinor: row.selectedAmount?.amountMinor ?? 0,
      existingGovernedInterpretation: {
        exactIdentity: claim(open.exactIdentity),
        family: claim(open.family),
        broaderEconomicCategory: pricing.broaderEconomicCategory,
        economicLayer: claim(open.d1EconomicLayerAndControl.economicLayer),
        mechanic: claim(open.d2MechanicAndPopulation.mechanic),
        population: claim(open.d2MechanicAndPopulation.population),
        cardinality: claim(open.cardinality),
        participants: {
          collector: claim(open.d1EconomicLayerAndControl.collector),
          economicBeneficiary: claim(open.d1EconomicLayerAndControl.economicBeneficiary),
          ruleSetter: claim(open.d1EconomicLayerAndControl.ruleSetter),
          priceSetter: claim(open.d1EconomicLayerAndControl.priceSetter),
          merchantFacingPriceController: claim(open.d1EconomicLayerAndControl.merchantFacingPriceController),
        },
        actionClass: open.d4Actionability.actionClass,
        action: open.d4Actionability.action,
        researchDisposition: open.research.disposition,
        renderingPermissions: open.renderingPermissions,
      },
      commercialDiagnosticTreatment: {
        primaryRole: commercial.primaryRole,
        confidence: commercial.confidence,
        rationale: commercial.rationale,
        fullBilledAmountAssignedToProvider: false,
        governedMutationProposed: false,
      },
      disagreementDimensions: policy.dimensions,
      strongestEvidenceForExistingInterpretation: {
        explanation: `${policy.existingInterpretationSummary} ${open.d1EconomicLayerAndControl.economicLayer.explanation}`,
        evidenceRefs: existingEvidenceRefs,
      },
      strongestEvidenceForDiagnosticCaution: {
        explanation: `${policy.diagnosticCautionSummary} ${commercial.rationale}`,
        evidenceRefs: unique([...policy.diagnosticEvidenceRefs, ...networkEvidenceRefs, ...commercial.evidenceRefs]),
      },
      likelyRootCause: policy.rootCause,
      effects: policy.affects,
      codexAssessment: assessment,
      researchDisposition,
      productDomainAdjudicationRequired: [
        "PRODUCT_ADJUDICATION_FROM_EXISTING_EVIDENCE",
        "BOUNDED_DOMAIN_RESEARCH_BEFORE_PRODUCT_ADJUDICATION",
      ].includes(researchDisposition),
      alreadyAdjudicatedButInconsistentlyProjected: policy.alreadyAdjudicatedButInconsistentlyProjected && researchDisposition === "CONSISTENCY_CLEANUP_ONLY",
      likelyAliasOrFallbackImplementationDefect: policy.likelyAliasOrFallbackImplementationDefect,
      uncertaintyPreserved: true,
      canonicalFinancialMutation: "none",
    });
  }

  const after = canonicalFinancialTruthFingerprint(analysis);
  statementFingerprints.push({ file: fixture.file, before, after, invariant: before === after && analyst.canonicalFinancialTruth.unchanged });
}

if (rows.length !== 37) throw new Error(`Expected 37 reconstructed disagreements, found ${rows.length}`);

const families = Object.values(FAMILY_POLICIES).map((policy) => {
  const familyRows = rows.filter((row) => row.familyId === policy.id);
  return {
    ...policy,
    rowCount: familyRows.length,
    affectedDollarsMinor: sum(familyRows.map((row) => row.billedAmountMinor)),
    statementsAffected: unique(familyRows.map((row) => row.statement.file)),
    recurringAcrossTemplates: unique(familyRows.map((row) => row.statement.file)).length > 1,
    assessmentCounts: countBy(familyRows.map((row) => row.codexAssessment)),
    researchDispositionCounts: countBy(familyRows.map((row) => row.researchDisposition)),
    productDomainAdjudicationRequired: familyRows.some((row) => row.productDomainAdjudicationRequired),
  };
}).filter((family) => family.rowCount > 0);

const impact = (level: Impact) => {
  const impactRows = rows.filter((row) => row.impact === level);
  return {
    families: families.filter((family) => family.impact === level).length,
    rows: impactRows.length,
    dollarsMinor: sum(impactRows.map((row) => row.billedAmountMinor)),
  };
};
const evaluation = {
  schemaVersion: SCHEMA_VERSION,
  generatedAt: "2026-09-09",
  productAuthority: PRODUCT_AUTHORITY,
  baseline: BASELINE,
  scope: {
    diagnosticOnly: true,
    aiOrWebResearchExecuted: false,
    governedKnowledgeMutation: false,
    commercialRoleMutation: false,
    researchWarrantMutation: false,
    canonicalMutation: false,
    customerRenderingMutation: false,
  },
  summary: {
    totalRowsReviewed: rows.length,
    rootCauseFamilies: families.length,
    totalAffectedDollarsMinor: sum(rows.map((row) => row.billedAmountMinor)),
    impact: { HIGH: impact("HIGH"), MEDIUM: impact("MEDIUM"), LOW: impact("LOW") },
    assessments: countBy(rows.map((row) => row.codexAssessment)),
    researchDispositions: countBy(rows.map((row) => row.researchDisposition)),
    familiesAlreadyAdjudicatedButInconsistentlyProjected: families.filter((family) => family.alreadyAdjudicatedButInconsistentlyProjected).map((family) => family.id),
    likelyAliasOrFallbackImplementationDefects: families.filter((family) => family.likelyAliasOrFallbackImplementationDefect).map((family) => family.id),
    rowsAffectingProviderDollarAttribution: rows.filter((row) => row.effects.providerControlledDollars).length,
    dollarsAffectingProviderDollarAttributionMinor: sum(rows.filter((row) => row.effects.providerControlledDollars).map((row) => row.billedAmountMinor)),
    rowsAffectingResidualCompleteness: rows.filter((row) => row.effects.residualCompleteness).length,
    rowsAffectingMerchantWording: rows.filter((row) => row.effects.merchantFacingWording).length,
    canonicalFingerprintChanges: statementFingerprints.filter((item) => !item.invariant).length,
  },
  recommendedAdjudicationOrder: [
    "MC_NETWORK_ACCESS_ALIAS_AND_LAYER_PRECEDENCE",
    "MC_CONNECTIVITY_KILOBYTE_ALIAS_AND_VINTAGE",
    "VISA_INTERNATIONAL_SERVICE_FALLBACK_PRECEDENCE",
    "AMEX_PROGRAM_COST_SCOPE_AND_RECONCILIATION",
    "TIERED_QUALIFICATION_ROW_VS_DOLLAR_COMPOSITION",
    "DISPUTE_RETURN_CHARGEBACK_ROLE_AND_COMPOSITION",
    "MC_ASSESSMENT_IDENTITY_VS_BUNDLED_COMPOSITION",
    "REGULATORY_PRODUCT_FIVE_ROLE_MODEL_GAP",
  ],
  claudeResearchRecommendation: {
    recommendedForFamilies: [
      "AMEX_PROGRAM_COST_SCOPE_AND_RECONCILIATION",
      "MC_CONNECTIVITY_KILOBYTE_ALIAS_AND_VINTAGE",
      "VISA_INTERNATIONAL_SERVICE_FALLBACK_PRECEDENCE",
      "DISPUTE_RETURN_CHARGEBACK_ROLE_AND_COMPOSITION",
    ],
    limitation: "Only the rows marked BOUNDED_DOMAIN_RESEARCH_BEFORE_PRODUCT_ADJUDICATION are suitable for bounded public-source research. Generic returns/chargebacks/ACH rows are more likely to require processor or merchant documents, not broad web research. Product must authorize any research separately.",
  },
  families,
  rows,
  statementFingerprints,
  invariants: {
    exactlyThirtySevenRows: rows.length === 37,
    everyRowAssignedExactlyOneFamily: rows.every((row) => Boolean(row.familyId)),
    familyCountsReconcile: sum(families.map((family) => family.rowCount)) === 37,
    familyDollarsReconcile: sum(families.map((family) => family.affectedDollarsMinor)) === sum(rows.map((row) => row.billedAmountMinor)),
    uncertaintyPreserved: rows.every((row) => row.uncertaintyPreserved && row.canonicalFinancialMutation === "none"),
    canonicalFingerprintsInvariant: statementFingerprints.every((item) => item.invariant),
    noAiOrWebResearch: true,
    noGovernedMutation: true,
  },
};

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
await writeFile(OUTPUT_MD, renderReport(evaluation), "utf8");
if (Object.values(evaluation.invariants).some((value) => !value)) process.exitCode = 1;
console.log(JSON.stringify({ outputs: [OUTPUT_JSON, OUTPUT_MD], summary: evaluation.summary, invariants: evaluation.invariants }, null, 2));

function familyFor(labelInput: string): FamilyId {
  const label = labelInput.toUpperCase();
  if (/NETWORK ACCESS AUTH FEE/.test(label)) return "MC_NETWORK_ACCESS_ALIAS_AND_LAYER_PRECEDENCE";
  if (/VISA.*(?:INTL|INTERNATIONAL).*SERVICE FEE/.test(label)) return "VISA_INTERNATIONAL_SERVICE_FALLBACK_PRECEDENCE";
  if (/AMEX.*PROGRAM COST/.test(label)) return "AMEX_PROGRAM_COST_SCOPE_AND_RECONCILIATION";
  if (/AUTH CONNECTIVITY|KILOBYTE AUTH/.test(label)) return "MC_CONNECTIVITY_KILOBYTE_ALIAS_AND_VINTAGE";
  if (/\b(?:QUAL|MQUAL|NQUAL) DISC\b/.test(label)) return "TIERED_QUALIFICATION_ROW_VS_DOLLAR_COMPOSITION";
  if (/DISPUTE|RETURNS?|CHARGEBACKS?|ACH REJECT/.test(label)) return "DISPUTE_RETURN_CHARGEBACK_ROLE_AND_COMPOSITION";
  if (/MASTERCARD ASSESSMENT/.test(label)) return "MC_ASSESSMENT_IDENTITY_VS_BUNDLED_COMPOSITION";
  if (/REGULATORY PRODUCT/.test(label)) return "REGULATORY_PRODUCT_FIVE_ROLE_MODEL_GAP";
  throw new Error(`No conflict family for ${labelInput}`);
}

function rowAssessment(family: FamilyId, labelInput: string, year: number, fallback: Assessment): Assessment {
  const label = labelInput.toUpperCase();
  if (family === "MC_CONNECTIVITY_KILOBYTE_ALIAS_AND_VINTAGE" && year < 2023) return "GENUINELY_UNRESOLVED_PRODUCT_DOMAIN_ADJUDICATION_REQUIRED";
  if (family === "VISA_INTERNATIONAL_SERVICE_FALLBACK_PRECEDENCE" && year < 2023) return "GENUINELY_UNRESOLVED_PRODUCT_DOMAIN_ADJUDICATION_REQUIRED";
  if (family === "DISPUTE_RETURN_CHARGEBACK_ROLE_AND_COMPOSITION" && /(?:MASTERCARD|MC|VISA|VI).*DISPUTE/.test(label)) return "GENUINELY_UNRESOLVED_PRODUCT_DOMAIN_ADJUDICATION_REQUIRED";
  return fallback;
}

function rowResearchDisposition(family: FamilyId, labelInput: string, year: number, fallback: ResearchDisposition): ResearchDisposition {
  const label = labelInput.toUpperCase();
  if (family === "MC_CONNECTIVITY_KILOBYTE_ALIAS_AND_VINTAGE" && year < 2023) return "BOUNDED_DOMAIN_RESEARCH_BEFORE_PRODUCT_ADJUDICATION";
  if (family === "VISA_INTERNATIONAL_SERVICE_FALLBACK_PRECEDENCE" && year < 2023) return "BOUNDED_DOMAIN_RESEARCH_BEFORE_PRODUCT_ADJUDICATION";
  if (family === "DISPUTE_RETURN_CHARGEBACK_ROLE_AND_COMPOSITION" && /(?:MASTERCARD|MC|VISA|VI).*DISPUTE/.test(label)) return "BOUNDED_DOMAIN_RESEARCH_BEFORE_PRODUCT_ADJUDICATION";
  return fallback;
}

function effect(provider: boolean, residual: boolean, comparison: boolean, action: boolean, wording: boolean, research: boolean) {
  return {
    providerControlledDollars: provider,
    residualCompleteness: residual,
    commercialComparisonPermission: comparison,
    negotiabilityOrActionability: action,
    merchantFacingWording: wording,
    researchWarrant: research,
  };
}

function claim(value: any) {
  if (!value) return null;
  return {
    state: value.state ?? null,
    value: value.value ?? null,
    confidence: value.confidence ?? null,
    explanation: value.explanation ?? null,
    evidenceRefs: value.evidenceRefs ?? [],
  };
}

function refs(value: any): string[] {
  if (!value || typeof value !== "object") return [];
  const direct = [
    ...(Array.isArray(value.evidenceRefs) ? value.evidenceRefs : []),
    ...(Array.isArray(value.matchedRuleRefs) ? value.matchedRuleRefs : []),
    ...(Array.isArray(value.ruleRefs) ? value.ruleRefs : []),
    ...(Array.isArray(value.sourceRefs) ? value.sourceRefs : []),
  ];
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object" && !Array.isArray(nested)) direct.push(...refs(nested));
  }
  return unique(direct);
}

function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const value = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = value?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error(`deterministic pricing model unavailable for ${file}`);
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: value?.pricingModel?.confidence === "high" ? "high" : value?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function renderReport(e: typeof evaluation): string {
  const lines = [
    "# Governed Commercial Classification Conflict Diagnostic v1",
    "",
    "## Decision summary",
    "",
    `All ${e.summary.totalRowsReviewed} E1/E2 disagreements were reviewed and collapsed into ${e.summary.rootCauseFamilies} recurring root-cause families. No governed interpretation was changed. The principal issue is the distinction between a row's identity/layer and attribution of 100% of its billed dollars.`,
    "",
    `Product authority: \`${e.productAuthority.file}\` (SHA-256 \`${e.productAuthority.sha256}\`). Baseline: \`${e.baseline.commit}\`.`,
    "",
    "## Quantitative summary",
    "",
    `- Rows reviewed: ${e.summary.totalRowsReviewed}`,
    `- Total billed dollars implicated: ${money(e.summary.totalAffectedDollarsMinor)}`,
    `- High impact: ${familyCount(e.summary.impact.HIGH.families)} / ${e.summary.impact.HIGH.rows} rows / ${money(e.summary.impact.HIGH.dollarsMinor)}`,
    `- Medium impact: ${familyCount(e.summary.impact.MEDIUM.families)} / ${e.summary.impact.MEDIUM.rows} rows / ${money(e.summary.impact.MEDIUM.dollarsMinor)}`,
    `- Low impact: ${familyCount(e.summary.impact.LOW.families)} / ${e.summary.impact.LOW.rows} rows / ${money(e.summary.impact.LOW.dollarsMinor)}`,
    `- Provider-dollar attribution affected: ${e.summary.rowsAffectingProviderDollarAttribution} rows / ${money(e.summary.dollarsAffectingProviderDollarAttributionMinor)}`,
    `- Residual-completeness permission affected: ${e.summary.rowsAffectingResidualCompleteness} rows`,
    `- Merchant-facing wording affected: ${e.summary.rowsAffectingMerchantWording} rows`,
    "",
    "## Conflict families",
    "",
    "| Priority | Impact | Family | Rows | Dollars | Statements | Recurring | Product/domain decision | Likely consistency defect |",
    "|---:|---|---|---:|---:|---:|---|---|---|",
    ...e.recommendedAdjudicationOrder.map((familyId, index) => {
      const family = e.families.find((candidate) => candidate.id === familyId)!;
      return `| ${index + 1} | ${family.impact} | ${family.title} | ${family.rowCount} | ${money(family.affectedDollarsMinor)} | ${family.statementsAffected.length} | ${yesNo(family.recurringAcrossTemplates)} | ${yesNo(family.productDomainAdjudicationRequired)} | ${yesNo(family.likelyAliasOrFallbackImplementationDefect || family.alreadyAdjudicatedButInconsistentlyProjected)} |`;
    }),
    "",
    "## Family findings and all 37 rows",
    "",
  ];
  for (const familyId of e.recommendedAdjudicationOrder) {
    const family = e.families.find((candidate) => candidate.id === familyId)!;
    const familyRows = e.rows.filter((row) => row.familyId === familyId);
    lines.push(
      `### ${family.title}`,
      "",
      `Impact: **${family.impact}**. ${family.rowCount} rows / ${money(family.affectedDollarsMinor)} across ${family.statementsAffected.length} statement(s).`,
      "",
      `Root cause: ${family.rootCause}`,
      "",
      `Existing governed scope: ${family.existingInterpretationSummary}`,
      "",
      `Diagnostic scope: ${family.diagnosticCautionSummary}`,
      "",
    );
    for (const row of familyRows) {
      const participants = row.existingGovernedInterpretation.participants;
      lines.push(
        `#### ${row.conflictId} — ${row.statement.file}`,
        "",
        `- Context: ${row.statement.processorFamily}; ${formatPeriod(row.statement.period)}; ${row.statement.pricingModel.model} pricing.`,
        `- Printed row: \`${escapeInline(row.printedLabel)}\` — ${money(row.billedAmountMinor)}.`,
        `- Governed identity/category: exact ${formatClaim(row.existingGovernedInterpretation.exactIdentity)}; family ${formatClaim(row.existingGovernedInterpretation.family)}; broader category ${row.existingGovernedInterpretation.broaderEconomicCategory ?? "unresolved"}.`,
        `- Governed economic layer: ${formatClaim(row.existingGovernedInterpretation.economicLayer)}.`,
        `- Mechanic/population: ${formatClaim(row.existingGovernedInterpretation.mechanic)} / ${formatClaim(row.existingGovernedInterpretation.population)}; cardinality ${formatClaim(row.existingGovernedInterpretation.cardinality)}.`,
        `- Participants: collector ${formatClaim(participants.collector)}; beneficiary ${formatClaim(participants.economicBeneficiary)}; rule setter ${formatClaim(participants.ruleSetter)}; price setter ${formatClaim(participants.priceSetter)}; merchant-facing controller ${formatClaim(participants.merchantFacingPriceController)}.`,
        `- Diagnostic treatment: ${row.commercialDiagnosticTreatment.primaryRole} (${row.commercialDiagnosticTreatment.confidence}); the full billed amount is not assigned to provider-controlled dollars.`,
        `- Disagreement dimensions: ${row.disagreementDimensions.join(", ")}.`,
        `- Strongest existing evidence: ${row.strongestEvidenceForExistingInterpretation.explanation} Refs: ${formatRefs(row.strongestEvidenceForExistingInterpretation.evidenceRefs)}.`,
        `- Strongest caution evidence: ${row.strongestEvidenceForDiagnosticCaution.explanation} Refs: ${formatRefs(row.strongestEvidenceForDiagnosticCaution.evidenceRefs)}.`,
        `- Effects: ${effectText(row.effects)}.`,
        `- Codex assessment: **${row.codexAssessment}**. This is diagnostic advice, not Product truth.`,
        `- Review lane: ${row.researchDisposition}.`,
        "",
      );
    }
  }
  lines.push(
    "## Cross-layer architecture diagnosis",
    "",
    "- Legacy or generic fallback rules can outrank newer exact governed identities.",
    "- Generic token/per-item rules can outrank scoped network evidence.",
    "- Alias coverage gaps prevent an admitted fee family from reaching the Open-World layer.",
    "- Historical/current scope is sound in the newer reference layer, but downstream generic projections can still erase that distinction.",
    "- Row identity and price-controller claims are being confused with billed-component composition.",
    "- Collector, beneficiary, price setter, and merchant-facing controller remain separate in the schema, but commercial dollar allocation does not yet enforce those separations.",
    "- Exact-identity uncertainty can still inherit acquiring-side treatment from a broader fallback.",
    "- Statement-local composition evidence is missing for tiered and bundled lines.",
    "- The unified authority exists, but older projections inside it can still compete with newer governed layers.",
    "",
    "## Research versus consistency cleanup",
    "",
    "Families with an already-made governed decision but incomplete downstream projection: " + e.summary.familiesAlreadyAdjudicatedButInconsistentlyProjected.join(", ") + ". The specific historical rows marked for research remain exceptions to the cleanup-only lane.",
    "",
    "### Exact rows suitable for bounded domain/public-source research",
    "",
    ...laneTable(e.rows.filter((row) => row.researchDisposition === "BOUNDED_DOMAIN_RESEARCH_BEFORE_PRODUCT_ADJUDICATION")),
    "",
    "Product must separately authorize any Claude/web research. Generic RETURNS, CHARGEBACKS, and ACH REJECT rows are more likely to require processor or merchant documents; broad public research is unlikely to establish merchant-specific composition or retention.",
    "",
    "### Exact rows needing Product adjudication from existing evidence",
    "",
    ...laneTable(e.rows.filter((row) => row.researchDisposition === "PRODUCT_ADJUDICATION_FROM_EXISTING_EVIDENCE")),
    "",
    "### Exact consistency-cleanup rows",
    "",
    ...laneTable(e.rows.filter((row) => row.researchDisposition === "CONSISTENCY_CLEANUP_ONLY")),
    "",
    "The other rows need a claim-scope representation decision or merchant/provider documents, not new reusable market knowledge.",
    "",
    "## Recommended adjudication order",
    "",
    ...e.recommendedAdjudicationOrder.map((familyId, index) => `${index + 1}. ${e.families.find((family) => family.id === familyId)!.title}`),
    "",
    "## Safety and invariants",
    "",
    `Canonical fingerprints remained unchanged for ${e.statementFingerprints.filter((item) => item.invariant).length}/${e.statementFingerprints.length} statements. No AI/web research ran, and no governed knowledge, classifications, research warrants, network references, commercial behavior, or customer rendering changed.`,
  );
  return `${lines.join("\n")}\n`;
}

function formatClaim(value: any): string {
  if (!value) return "unresolved";
  return `${value.value ?? "unresolved"} (${value.state ?? "state unresolved"}/${value.confidence ?? "confidence unresolved"})`;
}
function formatPeriod(value: { start: string; end: string } | null): string { return value ? `${value.start} through ${value.end}` : "period unresolved"; }
function formatRefs(values: string[]): string { return values.length ? values.join(", ") : "statement-local label/structure only"; }
function laneTable(values: any[]): string[] {
  return [
    "| Conflict | Statement | Printed row | Dollars | Family |",
    "|---|---|---|---:|---|",
    ...values.map((row) => `| ${row.conflictId} | ${row.statement.file} | ${row.printedLabel.replaceAll("|", "\\|")} | ${money(row.billedAmountMinor)} | ${row.familyId} |`),
  ];
}
function effectText(value: Record<string, boolean>): string {
  const labels: Record<string, string> = {
    providerControlledDollars: "provider-controlled dollars",
    residualCompleteness: "residual completeness",
    commercialComparisonPermission: "commercial comparison permission",
    negotiabilityOrActionability: "negotiability/actionability",
    merchantFacingWording: "merchant-facing wording",
    researchWarrant: "research warrant",
  };
  const affected = Object.entries(value).filter(([, enabled]) => enabled).map(([key]) => labels[key]);
  return affected.length ? affected.join(", ") : "internal representation only";
}
function escapeInline(value: string): string { return value.replaceAll("`", "'"); }
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function money(minor: number): string { return `$${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function familyCount(value: number): string { return `${value} ${value === 1 ? "family" : "families"}`; }
function yesNo(value: boolean): string { return value ? "yes" : "no"; }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function countBy(values: string[]): Record<string, number> { const out: Record<string, number> = {}; for (const value of values) out[value] = (out[value] ?? 0) + 1; return out; }
