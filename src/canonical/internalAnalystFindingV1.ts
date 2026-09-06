import { createHash } from "node:crypto";
import {
  GovernedPaymentKnowledgeAuthority,
  type GovernedIndustryNorm,
} from "./governedPaymentKnowledgeAuthority.js";
import type { FeeSemanticsShadowStatementContext, FeeSemanticsShadowRowResult } from "./feeSemanticsShadowStatementIntegration.js";
import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "./types.js";
import { assessCanonicalExactFeeRowArithmetic } from "./exactSourceArithmeticBridge.js";
import {
  FEE_KNOWLEDGE_RESEARCH_LIMITS,
  defaultFeeKnowledgeResearchQuestions,
  feeKnowledgeQuestionRef,
  planFeeKnowledgeResearchQuestions,
  type FeeKnowledgeResearchQuestion,
} from "./feeKnowledgeResearch.js";

export const INTERNAL_ANALYST_FINDING_V1_SCHEMA_VERSION = "internal_analyst_finding_v1" as const;

export type AnalystConfidence = "CONFIRMED" | "STRONG" | "LIKELY" | "CATEGORY_ONLY" | "UNRESOLVED" | "CONTRADICTED";
export type AnalystEvidenceClass =
  | "G1_governed_payment_knowledge"
  | "E1_statement"
  | "E2_merchant_document"
  | "E3_network_publication"
  | "E4_processor_or_iso_publication"
  | "E5_professional_industry_norm"
  | "E6_market_comparable"
  | "E7_public_research"
  | "E8_ai_hypothesis";
export type AnalystClaimState =
  | "confirmed"
  | "supported"
  | "industry_judgment"
  | "candidate"
  | "unresolved"
  | "conflicting"
  | "not_assessable"
  | "not_applicable"
  | "contract_required";

export type AnalystEvidenceBasis = {
  evidenceClass: AnalystEvidenceClass;
  refs: string[];
  characterization: "statement_fact" | "official_or_published" | "governed_knowledge" | "industry_norm" | "market_comparable" | "research" | "ai_lead" | "merchant_specific";
};

export type AnalystClaim<T> = {
  state: AnalystClaimState;
  value: T | null;
  confidence: AnalystConfidence;
  evidence: AnalystEvidenceBasis[];
  explanation: string;
  limitations: string[];
};

export type AnalystParticipant =
  | "card_network"
  | "issuer"
  | "processor_or_acquirer"
  | "iso_or_agent"
  | "gateway_or_technology_provider"
  | "third_party"
  | "merchant"
  | "unknown";

export type InternalAnalystFindingSurface =
  | "explicit_fee"
  | "processor_markup"
  | "interchange_qualification"
  | "dispute_or_exception"
  | "authorization_or_configuration"
  | "revenue_leakage"
  | "pricing_model_opacity"
  | "other_merchant_economics";

export type InternalAnalystResearchContribution = {
  contributionId: string;
  targetFeeRowId: string;
  status: "admitted_verified" | "candidate_only" | "conflicting";
  reviewedAt: string | null;
  admission: {
    basis: "runtime_verified_documentation" | "governed_human_review";
    decisionRef: string;
    reviewerId: string;
    documentFingerprint: string;
    evidenceLocatorHash: string;
  } | null;
  evidenceClasses: AnalystEvidenceClass[];
  sourceRefs: string[];
  aiAssisted: boolean;
  claims: Partial<{
    exactFeeIdentity: string;
    broaderEconomicCategory: string;
    assessmentUnit: string;
    collector: AnalystParticipant;
    economicBeneficiary: AnalystParticipant;
    ruleSetter: AnalystParticipant;
    priceSetter: AnalystParticipant;
    merchantFacingPriceController: AnalystParticipant;
  }>;
  interpretation: string;
  limitations: string[];
};

export type InternalAnalystMerchantContext = {
  verticalId: string | null;
  riskClass: "standard" | "high_risk" | "unknown";
  channel: "card_present" | "card_not_present" | "mixed" | "unknown";
  averageTicketUsd: number | null;
  evidenceRefs: string[];
  basis: "merchant_confirmed" | "statement_supported" | "qualified_canonical_context" | "unresolved";
};

export type InternalAnalystPricingModelInput = {
  model: "flat_discount_pricing" | "tiered_pricing" | "interchange_plus" | "flat_rate" | "unknown";
  confidence: "high" | "medium" | "low";
  evidenceRefs: string[];
  relevantPopulation: string | null;
  deterministic: true;
};

export type InternalAnalystFinding = {
  findingId: string;
  surface: InternalAnalystFindingSurface;
  sourceFeeRowId: string | null;
  title: string;
  observedAmountMinor: number | null;
  materiality: {
    level: "critical" | "major" | "moderate" | "minor" | "unquantified";
    basisPointsOfProcessedSales: number | null;
    statementPeriodOnly: true;
  };
  exactFeeIdentity: AnalystClaim<string>;
  broaderEconomicCategory: AnalystClaim<string>;
  assessmentUnitOrMechanic: AnalystClaim<string>;
  collector: AnalystClaim<AnalystParticipant>;
  economicBeneficiary: AnalystClaim<AnalystParticipant>;
  ruleSetter: AnalystClaim<AnalystParticipant>;
  priceSetter: AnalystClaim<AnalystParticipant>;
  merchantFacingPriceController: AnalystClaim<AnalystParticipant>;
  printedArithmeticCorrectness: AnalystClaim<"reproduces" | "reproduces_with_rounding" | "does_not_reproduce">;
  pricingModel: AnalystClaim<InternalAnalystPricingModelInput["model"]>;
  relevantPopulationOrBase: AnalystClaim<string>;
  commercialReasonableness: AnalystClaim<"within_norm" | "elevated" | "materially_elevated" | "context_justified">;
  negotiability: AnalystClaim<"frequently_negotiable" | "sometimes_negotiable" | "rarely_negotiable">;
  behavioralInfluence: AnalystClaim<"behavior_can_reduce_incidence" | "configuration_review_may_reduce_population" | "not_ordinarily_behavioral">;
  waivabilityOrRemovability: AnalystClaim<"frequently_waivable" | "sometimes_waivable" | "rarely_waivable">;
  contractualCompliance: AnalystClaim<"compliant" | "noncompliant">;
  competingInterpretations: Array<{
    source: "governed_retrieval" | "research";
    interpretation: string;
    evidenceRefs: string[];
    status: "candidate" | "conflicting";
  }>;
  whyItMatters: AnalystClaim<string>;
  practicalMerchantAction: AnalystClaim<string>;
};

export type InternalAnalystResearchQueueV1 = {
  schemaVersion: "internal_analyst_research_queue_v1";
  transport: "feeKnowledge_research_v1";
  authority: "research_leads_only";
  execution: "not_run_by_report_builder";
  selected: Array<{
    questionRef: string;
    findingId: string;
    question: FeeKnowledgeResearchQuestion;
    priorityScore: number;
    reasonCodes: string[];
  }>;
  deferred: Array<{
    questionRef: string;
    findingId: string;
    question: FeeKnowledgeResearchQuestion;
    priorityScore: number;
    reasonCodes: string[];
  }>;
  limitations: string[];
};

export type InternalAnalystFindingReportV1 = {
  schemaVersion: typeof INTERNAL_ANALYST_FINDING_V1_SCHEMA_VERSION;
  mode: "internal_analyst_only";
  customerFacingAuthority: "none";
  statementRef: string;
  analysisAsOf: string;
  statementPeriod: { start: string; end: string } | null;
  canonicalFinancialTruth: {
    beforeFingerprint: string;
    afterFingerprint: string;
    unchanged: true;
    mutationAllowed: false;
  };
  knowledgeAuthority: {
    authorityVersion: string;
    authorityFingerprint: string;
    semanticCatalogVersion: string;
    normCatalogVersion: string;
    legacyFeeCatalog: "retrieval_only_not_governing";
    feeKnowledgeResearchSystem: "research_transport_not_governing";
  };
  merchantContext: InternalAnalystMerchantContext;
  findings: InternalAnalystFinding[];
  researchQueue: InternalAnalystResearchQueueV1;
  coverage: {
    materialFeeRows: number;
    findings: number;
    officialOrPublishedBackedFindings: number;
    industryNormJudgments: number;
    admittedResearchResolutions: number;
    unresolvedOrCompetingFindings: number;
    noAgreementActionFindings: number;
    contractDependentFindings: number;
    queuedResearchQuestions: number;
  };
  limitations: string[];
};

export function buildInternalAnalystFindingV1(input: {
  analysis: CanonicalStatementAnalysis;
  statementContext: FeeSemanticsShadowStatementContext;
  pricingModel?: InternalAnalystPricingModelInput | null;
  merchantContext?: InternalAnalystMerchantContext | null;
  researchContributions?: InternalAnalystResearchContribution[];
  knowledgeAuthority?: GovernedPaymentKnowledgeAuthority;
  asOf?: string;
}): InternalAnalystFindingReportV1 {
  const before = canonicalFinancialTruthFingerprint(input.analysis);
  const authority = input.knowledgeAuthority ?? new GovernedPaymentKnowledgeAuthority();
  const analysisAsOf = input.asOf ?? input.analysis.identity.statementPeriod.value?.end ?? "0001-01-01";
  const knowledge = authority.resolveStatement({ analysis: input.analysis, context: input.statementContext, asOf: analysisAsOf });
  const merchantContext = input.merchantContext ?? merchantContextFromCanonical(input.analysis);
  const contributions = input.researchContributions ?? [];
  const semanticByRow = new Map(knowledge.semantics.rows.map((row) => [row.feeRowId, row]));
  const materialRows = input.analysis.feeLedger.rows.filter((row) => isMaterialFeeRow(row, input.analysis));
  const findings = materialRows.map((row) => buildFeeFinding({
    row,
    analysis: input.analysis,
    semantic: semanticByRow.get(row.id)!,
    semanticSourceAuthorityByEvidenceRef: knowledge.semanticSourceAuthorityByEvidenceRef,
    norms: knowledge.normsByFeeRowId[row.id] ?? [],
    merchantContext,
    pricingModel: input.pricingModel ?? null,
    contributions: contributions.filter((item) => item.targetFeeRowId === row.id),
  }));
  if (!input.pricingModel || input.pricingModel.model === "unknown" || input.pricingModel.model === "tiered_pricing" || input.pricingModel.model === "flat_rate") {
    findings.push(buildPricingOpacityFinding(input.analysis, input.pricingModel ?? null, merchantContext));
  }
  const researchQueue = buildInternalAnalystResearchQueue(input.analysis, findings);
  const after = canonicalFinancialTruthFingerprint(input.analysis);
  if (before !== after) throw new Error("internal_analyst_finding_mutated_canonical_financial_truth");

  const report: InternalAnalystFindingReportV1 = {
    schemaVersion: INTERNAL_ANALYST_FINDING_V1_SCHEMA_VERSION,
    mode: "internal_analyst_only",
    customerFacingAuthority: "none",
    statementRef: input.analysis.identity.sourceDocumentRef,
    analysisAsOf,
    statementPeriod: input.analysis.identity.statementPeriod.evidenceRefs.length > 0 ? input.analysis.identity.statementPeriod.value : null,
    canonicalFinancialTruth: { beforeFingerprint: before, afterFingerprint: after, unchanged: true, mutationAllowed: false },
    knowledgeAuthority: {
      authorityVersion: knowledge.authorityVersion,
      authorityFingerprint: authority.fingerprint(),
      semanticCatalogVersion: knowledge.semanticCatalogVersion,
      normCatalogVersion: knowledge.normCatalogVersion,
      legacyFeeCatalog: knowledge.legacyAuthorities.legacyFeeCatalog,
      feeKnowledgeResearchSystem: knowledge.legacyAuthorities.feeKnowledgeResearchSystem,
    },
    merchantContext,
    findings,
    researchQueue,
    coverage: coverage(findings, contributions, researchQueue),
    limitations: [
      "This artifact is internal analyst work and has no customer-report authority.",
      "It analyzes one statement period; recurrence, trends, annual cadence, and annual savings are not inferred.",
      "A fee identity or industry norm does not establish the merchant's contracted rate or a contractual breach.",
      "AI-assisted contributions cannot alter statement amounts, fee membership, arithmetic, pricing-model evidence, or canonical financial truth.",
      "The research queue is transport-only: queued prompts, search results, and AI output are leads until independently evidenced, reviewed, and admitted.",
      "Processor markup is not computed when interchange and the relevant population are not independently available.",
      "Fiserv is the supported statement family, while the claim model, evidence classes, participant axes, and knowledge authority are processor-neutral.",
    ],
  };
  return deepFreeze(report);
}

export function canonicalFinancialTruthFingerprint(analysis: CanonicalStatementAnalysis): string {
  const projection = {
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    crossSummaryLinkEvidence: analysis.crossSummaryLinkEvidence,
    versionManifest: analysis.versionManifest,
  };
  return createHash("sha256").update(JSON.stringify(projection)).digest("hex");
}

function buildFeeFinding(input: {
  row: CanonicalFeeRow;
  analysis: CanonicalStatementAnalysis;
  semantic: FeeSemanticsShadowRowResult;
  semanticSourceAuthorityByEvidenceRef: Readonly<Record<string, string>>;
  norms: GovernedIndustryNorm[];
  merchantContext: InternalAnalystMerchantContext;
  pricingModel: InternalAnalystPricingModelInput | null;
  contributions: InternalAnalystResearchContribution[];
}): InternalAnalystFinding {
  const admitted = input.contributions.find(isAdmittedResearchContribution) ?? null;
  const semantic = input.semantic;
  const rowEvidence = semantic.feeRowEvidenceRefs;
  const publishedEvidence = semantic.qualifiedResearchEvidenceRefs;
  const publishedBasis = semanticPublishedEvidence(publishedEvidence, input.semanticSourceAuthorityByEvidenceRef);
  const knowledgeBasis = semantic.curatedKnowledgeEvidenceRefs.length > 0
    ? evidence("G1_governed_payment_knowledge", semantic.curatedKnowledgeEvidenceRefs, "governed_knowledge")
    : null;
  const researchBasis = admitted ? evidence(admittedResearchEvidenceClass(admitted), admitted.sourceRefs, "research") : null;
  const identityValue = semantic.status === "resolved_exact_trusted" ? semantic.semanticAxes?.identity.value ?? semantic.conceptId : admitted?.claims.exactFeeIdentity ?? null;
  const identity = identityValue
    ? claim("supported", identityValue, semantic.status === "resolved_exact_trusted" ? "STRONG" : "LIKELY", [...publishedBasis, ...compact([knowledgeBasis, researchBasis])], semantic.status === "resolved_exact_trusted" ? "Exact scoped alias resolved through admitted governed knowledge." : "Previously unresolved terminology resolved by an independently evidenced, reviewed research contribution.")
    : unresolvedClaim<string>("Exact identity is not established; candidates remain research leads.", [evidence("E1_statement", rowEvidence, "statement_fact")]);
  const categoryValue = admitted?.claims.broaderEconomicCategory ?? categoryFor(semantic, input.row.selectedLabel);
  const category = categoryValue
    ? claim(identityValue ? "supported" : "industry_judgment", categoryValue, identityValue ? "STRONG" : "CATEGORY_ONLY", [...publishedBasis, ...compact([knowledgeBasis, researchBasis, evidence("E1_statement", rowEvidence, "statement_fact")])], identityValue ? "Economic category follows the admitted meaning, independently of pricing or contract conclusions." : "Category is supported by printed mechanics/position even though exact identity remains unresolved.")
    : unresolvedClaim<string>("Neither an exact identity nor a defensible broader category is established.", [evidence("E1_statement", rowEvidence, "statement_fact")]);
  const mechanicValue = semantic.semanticAxes?.assessment_unit.status === "resolved" ? semantic.semanticAxes.assessment_unit.value : admitted?.claims.assessmentUnit ?? mechanicFromCanonical(input.row, input.analysis);
  const mechanic = mechanicValue
    ? claim("supported", mechanicValue, semantic.semanticAxes?.assessment_unit.status === "resolved" ? "STRONG" : "LIKELY", [...publishedBasis, ...compact([knowledgeBasis, researchBasis, evidence("E1_statement", rowEvidence, "statement_fact")])], "Assessment mechanic is kept separate from identity and commercial judgment.")
    : unresolvedClaim<string>("The statement does not expose a reliable assessment base.", [evidence("E1_statement", rowEvidence, "statement_fact")]);
  const ownership = semantic.semanticAxes?.ownership.status === "resolved" ? semantic.semanticAxes.ownership.value : null;
  const beneficiary = participantClaim(admitted?.claims.economicBeneficiary ?? beneficiaryFor(ownership), ownership ? "Published semantic ownership supports the likely economic beneficiary; collection and merchant price control remain separate." : "Economic beneficiary is not established.", [...publishedBasis, ...compact([researchBasis])]);
  const collector = participantClaim(admitted?.claims.collector ?? (input.analysis.identity.processorFamily.evidenceRefs.length > 0 ? "processor_or_acquirer" : null), "The processor/acquirer presents or collects the statement charge; this does not prove it retains the economics.", [evidence("E1_statement", [...rowEvidence, ...input.analysis.identity.processorFamily.evidenceRefs], "statement_fact")]);
  const ruleSetter = participantClaim(admitted?.claims.ruleSetter ?? (ownership?.includes("network") ? "card_network" : null), "Rule setting is distinct from collection and price control.", [...publishedBasis, ...compact([researchBasis])]);
  const priceSetter = participantClaim(admitted?.claims.priceSetter ?? (ownership?.includes("network") ? "card_network" : null), "Underlying schedule setter is stated only where supported; the billed merchant price may differ.", [...publishedBasis, ...compact([researchBasis])]);
  const controller = participantClaim(admitted?.claims.merchantFacingPriceController ?? null, "The evidence does not establish whether the processor, ISO, or another party controls the merchant-facing amount or adds spread.", compact([researchBasis]));
  const arithmetic = arithmeticClaim(input.row, input.analysis);
  const pricing = pricingClaim(input.pricingModel);
  const population = mechanicValue
    ? claim("supported", input.pricingModel?.relevantPopulation ?? mechanicValue, "LIKELY", [evidence("E1_statement", rowEvidence, "statement_fact")], "Relevant population is stated independently from pricing model.")
    : unresolvedClaim<string>("Relevant transaction or volume population is not established.", [evidence("E1_statement", rowEvidence, "statement_fact")]);
  const reasonableness = commercialClaim(input.row, input.analysis, input.norms, input.merchantContext);
  const primaryNorm = input.norms[0] ?? null;
  const networkUnderlying = ownership?.includes("network") ?? false;
  const negotiability = primaryNorm && primaryNorm.normId.includes("chargeback") && input.merchantContext.riskClass === "high_risk"
    ? claim<"frequently_negotiable" | "sometimes_negotiable" | "rarely_negotiable">("industry_judgment", "rarely_negotiable", "LIKELY", [frameworkNormEvidence(primaryNorm), ...contextEvidence(input.merchantContext)], "High-risk/dispute-heavy context reduces ordinary negotiating leverage for exception pricing; this is a contextual commercial judgment, not a contractual conclusion.")
    : primaryNorm
    ? normDispositionClaim(primaryNorm.negotiabilityNorm, primaryNorm, "Negotiability is an industry judgment conditioned by merchant leverage, risk, volume, and the party controlling the billed price.")
    : networkUnderlying
      ? claim<"frequently_negotiable" | "sometimes_negotiable" | "rarely_negotiable">("industry_judgment", "rarely_negotiable", "LIKELY", publishedBasis, "The underlying network schedule is rarely negotiated by an ordinary merchant, but processor-added spread or presentation remains reviewable.")
      : unresolvedClaim<"frequently_negotiable" | "sometimes_negotiable" | "rarely_negotiable">("Negotiability is not inferred from a legacy processor/network label.", []);
  const waivability = primaryNorm
    ? normDispositionClaim(primaryNorm.waivabilityNorm, primaryNorm, "Waivability/removability is a governed industry norm, not a promise about this merchant's agreement.")
    : networkUnderlying
      ? claim<"frequently_waivable" | "sometimes_waivable" | "rarely_waivable">("industry_judgment", "rarely_waivable", "LIKELY", publishedBasis, "The underlying network assessment is rarely waived, while unsupported padding or duplicate billing may still be challenged.")
      : unresolvedClaim<"frequently_waivable" | "sometimes_waivable" | "rarely_waivable">("Waivability is not established for this charge.", []);
  const behavioral = behavioralClaim(identityValue, categoryValue, input.row.selectedLabel, rowEvidence);
  const contract = contractRequiredClaim();
  const materiality = materialityFor(input.row, input.analysis);
  const action = actionClaim({ category: categoryValue, identity: identityValue, reasonableness, controller, behavioral, networkUnderlying });
  const alternatives = competingInterpretations(semantic, input.contributions);
  return {
    findingId: `iaf_${stableId(input.row.id)}`,
    surface: surfaceFor(categoryValue, input.row.selectedLabel),
    sourceFeeRowId: input.row.id,
    title: identityValue ?? categoryValue ?? `Unresolved charge: ${input.row.selectedLabel}`,
    observedAmountMinor: input.row.selectedAmount?.amountMinor ?? null,
    materiality,
    exactFeeIdentity: identity,
    broaderEconomicCategory: category,
    assessmentUnitOrMechanic: mechanic,
    collector,
    economicBeneficiary: beneficiary,
    ruleSetter,
    priceSetter,
    merchantFacingPriceController: controller,
    printedArithmeticCorrectness: arithmetic,
    pricingModel: pricing,
    relevantPopulationOrBase: population,
    commercialReasonableness: reasonableness,
    negotiability,
    behavioralInfluence: behavioral,
    waivabilityOrRemovability: waivability,
    contractualCompliance: contract,
    competingInterpretations: alternatives,
    whyItMatters: claim("supported", whyItMatters(input.row, materiality, categoryValue), "LIKELY", [evidence("E1_statement", rowEvidence, "statement_fact")], "Materiality is period-bounded and does not assume recurrence."),
    practicalMerchantAction: action,
  };
}

function buildPricingOpacityFinding(
  analysis: CanonicalStatementAnalysis,
  pricingModel: InternalAnalystPricingModelInput | null,
  merchantContext: InternalAnalystMerchantContext,
): InternalAnalystFinding {
  const model = pricingModel?.model ?? "unknown";
  const pricing = pricingClaim(pricingModel);
  const evidenceRefs = pricingModel?.evidenceRefs ?? [];
  const message = model === "tiered_pricing" || model === "flat_rate"
    ? "The statement's bundled/tiered presentation does not independently expose interchange, so processor markup is not computable from this statement."
    : "The pricing architecture is not established, which blocks a reliable processor-markup decomposition.";
  return {
    findingId: "iaf_pricing_model_opacity",
    surface: "pricing_model_opacity",
    sourceFeeRowId: null,
    title: "Pricing-model opacity",
    observedAmountMinor: null,
    materiality: { level: "unquantified", basisPointsOfProcessedSales: null, statementPeriodOnly: true },
    exactFeeIdentity: notApplicableClaim("This is a statement-level pricing finding, not an individual fee identity."),
    broaderEconomicCategory: claim("supported", "pricing_model_opacity", "STRONG", [evidence("E1_statement", evidenceRefs, "statement_fact")], message),
    assessmentUnitOrMechanic: unresolvedClaim("Processor markup cannot be reconstructed without independently exposed interchange and the relevant base.", [evidence("E1_statement", evidenceRefs, "statement_fact")]),
    collector: participantClaim("processor_or_acquirer", "The processor/acquirer presents the merchant-facing program.", [evidence("E1_statement", analysis.identity.processorFamily.evidenceRefs, "statement_fact")]),
    economicBeneficiary: unresolvedClaim("Bundled economics cannot be allocated between processor, ISO, networks, and issuers from the statement presentation alone.", []),
    ruleSetter: unresolvedClaim("Multiple parties set component rules inside the bundled price.", []),
    priceSetter: unresolvedClaim("The component price setter cannot be isolated from the statement alone.", []),
    merchantFacingPriceController: participantClaim("processor_or_acquirer", "The merchant-facing pricing program is ordinarily controlled at the acquiring/processor contract layer; exact authority remains contract-specific.", [evidence("E1_statement", evidenceRefs, "statement_fact")]),
    printedArithmeticCorrectness: notApplicableClaim("No fabricated markup arithmetic is performed."),
    pricingModel: pricing,
    relevantPopulationOrBase: pricingModel?.relevantPopulation
      ? claim("confirmed", pricingModel.relevantPopulation, "CONFIRMED", [evidence("E1_statement", evidenceRefs, "statement_fact")], "Population supplied by deterministic statement analysis.")
      : unresolvedClaim("The base required to decompose markup is unavailable.", []),
    commercialReasonableness: merchantContext.verticalId && merchantContext.riskClass !== "unknown"
      ? unresolvedClaim("A comparable-program benchmark may support a reasonableness judgment, but no individual markup amount is asserted here.", contextEvidence(merchantContext))
      : notAssessableClaim("Commercial benchmarking is gated until both merchant vertical and risk are supported."),
    negotiability: claim("industry_judgment", "sometimes_negotiable", "LIKELY", [frameworkNormEvidence()], "A merchant-facing pricing program is commonly reviewable, but leverage and contract term affect the outcome."),
    behavioralInfluence: claim("industry_judgment", "not_ordinarily_behavioral", "LIKELY", [frameworkNormEvidence()], "Program price is primarily commercial; transaction behavior may still change underlying interchange qualification."),
    waivabilityOrRemovability: claim("industry_judgment", "rarely_waivable", "LIKELY", [frameworkNormEvidence()], "The entire pricing program is not ordinarily waived; repricing is the useful commercial lever."),
    contractualCompliance: contractRequiredClaim(),
    competingInterpretations: [],
    whyItMatters: claim("supported", message, "STRONG", [evidence("E1_statement", evidenceRefs, "statement_fact")], "Opacity is a commercially material finding even when markup dollars are not computable."),
    practicalMerchantAction: claim("industry_judgment", "Request an interchange-cost and processor-markup breakout and a pricing review; this request does not require the merchant agreement. Use the agreement only to determine whether the current program violates an exact contracted term.", "STRONG", [frameworkNormEvidence()], "Commercial inquiry is distinct from a legal or contractual conclusion."),
  };
}

function isAdmittedResearchContribution(item: InternalAnalystResearchContribution): boolean {
  const verifyingClasses: AnalystEvidenceClass[] = ["E1_statement", "E2_merchant_document", "E3_network_publication", "E4_processor_or_iso_publication", "E7_public_research"];
  return item.status === "admitted_verified" &&
    Boolean(item.reviewedAt) &&
    Boolean(item.admission?.decisionRef && item.admission.reviewerId && item.admission.documentFingerprint && item.admission.evidenceLocatorHash) &&
    item.sourceRefs.length > 0 &&
    item.evidenceClasses.some((evidenceClass) => verifyingClasses.includes(evidenceClass));
}

function admittedResearchEvidenceClass(item: InternalAnalystResearchContribution): AnalystEvidenceClass {
  const preference: AnalystEvidenceClass[] = ["E3_network_publication", "E4_processor_or_iso_publication", "E2_merchant_document", "E7_public_research", "E1_statement"];
  const selected = preference.find((evidenceClass) => item.evidenceClasses.includes(evidenceClass));
  if (!selected) throw new Error(`research_contribution_missing_admissible_evidence:${item.contributionId}`);
  return selected;
}

function arithmeticClaim(row: CanonicalFeeRow, analysis: CanonicalStatementAnalysis): AnalystClaim<"reproduces" | "reproduces_with_rounding" | "does_not_reproduce"> {
  const arithmetic = analysis.feeLedger.partitionSourceProvenance.rowArithmetic.find((item) => item.feeRowId === row.id) ?? null;
  const result = assessCanonicalExactFeeRowArithmetic(arithmetic);
  const basis = [evidence("E1_statement", result.evidenceRefs, "statement_fact")];
  if (result.status === "unavailable") return unresolvedClaim("The deterministic exact-source arithmetic bridge lacks a complete printed rate/base pair for this row.", basis);
  if (result.status === "does_not_reproduce") return claim("confirmed", "does_not_reproduce", "CONFIRMED", basis, "Exact rational reconstruction does not reproduce the printed charged amount.");
  const exact = result.exactAmount!;
  const rounded = BigInt(exact.roundedAmountMinor) * BigInt(exact.denominator) !== BigInt(exact.numeratorMinorUnits);
  return claim("confirmed", rounded ? "reproduces_with_rounding" : "reproduces", "CONFIRMED", basis, "The existing exact rational reconstruction reproduces the printed charged amount under the canonical rounding policy.");
}

function commercialClaim(
  row: CanonicalFeeRow,
  analysis: CanonicalStatementAnalysis,
  norms: GovernedIndustryNorm[],
  context: InternalAnalystMerchantContext,
): AnalystClaim<"within_norm" | "elevated" | "materially_elevated" | "context_justified"> {
  if (!context.verticalId || context.riskClass === "unknown") return notAssessableClaim("Commercial reasonableness requires both a supported vertical and risk class.");
  const norm = norms.find((item) => normApplicable(item, context));
  if (!norm) return notAssessableClaim("No current governed norm is applicable to this fee and merchant context.");
  const observed = observedNormValue(row, analysis, norm);
  if (observed === null || norm.elevatedAbove === null || norm.typicalHigh === null) return notAssessableClaim("The statement does not expose the unit/base needed by the applicable norm.");
  const evidenceBasis = [frameworkNormEvidence(norm), ...contextEvidence(context), evidence("E1_statement", row.contributionDecision.evidenceRefs, "statement_fact")];
  if (context.riskClass === "high_risk" && norm.normId.includes("chargeback") && observed > norm.typicalHigh) {
    return claim("industry_judgment", "context_justified", "LIKELY", evidenceBasis, `Observed $${observed.toFixed(2)} is above the standard SMB band, but elevated dispute pricing may be commercially normal for high-risk accounts; this is not labeled excessive.`);
  }
  const averageTicketNote = context.averageTicketUsd !== null && norm.unit === "usd_per_event"
    ? ` At an average ticket of $${context.averageTicketUsd.toFixed(2)}, per-event pricing has ${context.averageTicketUsd < 25 ? "heightened" : "lower"} proportional importance.`
    : "";
  if (observed > norm.elevatedAbove) return claim("industry_judgment", "materially_elevated", "STRONG", evidenceBasis, `Observed ${formatNormValue(observed, norm)} exceeds the governed elevated threshold of ${formatNormValue(norm.elevatedAbove, norm)}.${averageTicketNote}`);
  if (observed > norm.typicalHigh) return claim("industry_judgment", "elevated", "STRONG", evidenceBasis, `Observed ${formatNormValue(observed, norm)} is above the governed typical band ending at ${formatNormValue(norm.typicalHigh, norm)}.${averageTicketNote}`);
  return claim("industry_judgment", "within_norm", "STRONG", evidenceBasis, `Observed ${formatNormValue(observed, norm)} falls within the governed professional norm.${averageTicketNote}`);
}

function observedNormValue(row: CanonicalFeeRow, analysis: CanonicalStatementAnalysis, norm: GovernedIndustryNorm): number | null {
  if (norm.unit === "usd_per_month") return row.selectedAmount ? row.selectedAmount.amountMinor / 100 : null;
  if (norm.unit !== "usd_per_event") return null;
  const arithmetic = analysis.feeLedger.partitionSourceProvenance.rowArithmetic.find((item) => item.feeRowId === row.id);
  const direct = arithmetic?.printedPerItemRate?.numericValue ?? arithmetic?.printedPerUnitRate?.numericValue;
  if (direct && Number.isFinite(Number(direct))) return Number(direct);
  const count = arithmetic?.itemCount ?? (arithmetic?.sourceUnitBasis ? Number(arithmetic.sourceUnitBasis) : null);
  if (!row.selectedAmount || !count || count <= 0) return null;
  return row.selectedAmount.amountMinor / 100 / count;
}

function merchantContextFromCanonical(analysis: CanonicalStatementAnalysis): InternalAnalystMerchantContext {
  const qualification = analysis.businessQualification;
  const averageTicket = analysis.financialFacts.averageTicket.value;
  return {
    verticalId: qualification.status === "qualified" ? qualification.resolvedSegmentId : null,
    riskClass: qualification.risk.status === "qualified" ? qualification.risk.value : "unknown",
    channel: qualification.channel.status === "qualified" ? qualification.channel.value : "unknown",
    averageTicketUsd: averageTicket ? averageTicket.amountMinor / 100 : null,
    evidenceRefs: qualification.evidenceRefs,
    basis: qualification.status === "qualified" ? "qualified_canonical_context" : "unresolved",
  };
}

function pricingClaim(input: InternalAnalystPricingModelInput | null): AnalystClaim<InternalAnalystPricingModelInput["model"]> {
  if (!input || input.model === "unknown") return unresolvedClaim("Deterministic statement analysis did not establish the pricing model.", input ? [evidence("E1_statement", input.evidenceRefs, "statement_fact")] : []);
  return claim(input.confidence === "high" ? "confirmed" : "supported", input.model, input.confidence === "high" ? "CONFIRMED" : "STRONG", [evidence("E1_statement", input.evidenceRefs, "statement_fact")], "Pricing model comes from deterministic statement evidence and is not authored or changed by AI/research.");
}

function contractRequiredClaim(): AnalystClaim<"compliant" | "noncompliant"> {
  return claim<"compliant" | "noncompliant">("contract_required", null, "UNRESOLVED", [], "Whether the charged rate or term complies with this merchant's agreement requires the operative agreement/pricing schedule and relevant amendments.", ["An industry norm can support a commercial judgment but cannot prove a contractual promise, breach, right, or remedy."]);
}

function actionClaim(input: {
  category: string | null;
  identity: string | null;
  reasonableness: AnalystClaim<unknown>;
  controller: AnalystClaim<unknown>;
  behavioral: AnalystClaim<unknown>;
  networkUnderlying: boolean;
}): AnalystClaim<string> {
  let value: string;
  if (input.reasonableness.value === "elevated" || input.reasonableness.value === "materially_elevated") {
    value = "Ask the processor/ISO to itemize the billed unit and population, explain the price controller, and reduce or waive the merchant-facing charge. This commercial request does not require the merchant agreement.";
  } else if (input.behavioral.value === "behavior_can_reduce_incidence" || input.behavioral.value === "configuration_review_may_reduce_population") {
    value = "Request event-level detail and review authorization, reversal, clearing, batching, or gateway configuration to reduce avoidable incidence; also ask whether any processor-added amount can be removed. This operational and commercial review does not require the merchant agreement.";
  } else if (input.networkUnderlying) {
    value = "Verify the billed unit and current published schedule, then ask the processor to disclose any spread or bundling above the underlying charge. The underlying network rule and merchant-facing price are separate questions.";
  } else {
    value = "Request an itemized explanation, billed population, price owner, and a commercial review or waiver where applicable; no agreement is needed to make this request.";
  }
  return claim("industry_judgment", value, "LIKELY", [frameworkNormEvidence()], "The action is a practical commercial inquiry, not a contract-compliance or legal conclusion.");
}

function behavioralClaim(identity: string | null, category: string | null, label: string, refs: string[]): AnalystClaim<"behavior_can_reduce_incidence" | "configuration_review_may_reduce_population" | "not_ordinarily_behavioral"> {
  const text = `${identity ?? ""} ${category ?? ""} ${label}`.toUpperCase();
  if (/INTEGRITY|MISUSE|UNMATCHED|ZERO FLOOR|QUALIFICATION/.test(text)) return claim("supported", "behavior_can_reduce_incidence", "STRONG", [evidence("E1_statement", refs, "statement_fact")], "The fee family is triggered by transaction qualification or exception conditions; process changes may reduce incidence without changing the underlying schedule.");
  if (/AUTH|GATEWAY|AVS|CPU/.test(text)) return claim("industry_judgment", "configuration_review_may_reduce_population", "LIKELY", [frameworkNormEvidence()], "Authorization or gateway configuration may affect the billed event population; this does not imply current configuration is wrong.");
  return claim("industry_judgment", "not_ordinarily_behavioral", "LIKELY", [frameworkNormEvidence()], "No supported behavioral trigger is established for this charge.");
}

function participantClaim(value: AnalystParticipant | null, explanation: string, basis: AnalystEvidenceBasis[]): AnalystClaim<AnalystParticipant> {
  return value ? claim("supported", value, "LIKELY", basis, explanation) : unresolvedClaim(explanation, basis);
}

function categoryFor(semantic: FeeSemanticsShadowRowResult, label: string): string | null {
  const id = semantic.conceptId ?? "";
  const text = `${id} ${label}`.toUpperCase();
  if (/INTERCHANGE/.test(text)) return "interchange";
  if (/ASSESSMENT|NABU|ACQUIRER_PROCESSING|NETWORK_ACCESS|DATA_USAGE|INTEGRITY|MISUSE|ZERO_FLOOR/.test(text)) return "network_or_pass_through";
  if (/CHARGEBACK|RETRIEVAL|DISPUTE|ACH REJECT/.test(text)) return "exception_and_dispute";
  if (/AUTH|GATEWAY|GTWY|AVS|CPU/.test(text)) return "authorization_gateway_technology";
  if (/PCI|COMPLIANCE/.test(text)) return "compliance_and_security";
  if (/MONTHLY|STATEMENT|ACCOUNT FEE|REGULATORY PRODUCT/.test(text)) return "administrative_and_account";
  if (/DISC(?:OUNT)? RATE|QUAL DISC|MQUAL|NQUAL/.test(text)) return "processor_markup_or_tier";
  return null;
}

function mechanicFromCanonical(row: CanonicalFeeRow, analysis: CanonicalStatementAnalysis): string | null {
  const arithmetic = analysis.feeLedger.partitionSourceProvenance.rowArithmetic.find((item) => item.feeRowId === row.id);
  if (!arithmetic || arithmetic.formulaBasis === "unknown" || arithmetic.formulaBasis === "ambiguous") return null;
  if (arithmetic.sourceUnit) return `${arithmetic.formulaBasis}:${arithmetic.sourceUnit}`;
  return arithmetic.formulaBasis;
}

function beneficiaryFor(ownership: string | null): AnalystParticipant | null {
  if (!ownership) return null;
  if (ownership.includes("network")) return "card_network";
  if (ownership.includes("processor")) return "processor_or_acquirer";
  if (ownership.includes("issuer")) return "issuer";
  return null;
}

function surfaceFor(category: string | null, label: string): InternalAnalystFindingSurface {
  const text = `${category ?? ""} ${label}`.toUpperCase();
  if (/INTERCHANGE|QUAL|MQUAL|NQUAL/.test(text)) return "interchange_qualification";
  if (/CHARGEBACK|DISPUTE|RETRIEVAL|ACH REJECT/.test(text)) return "dispute_or_exception";
  if (/AUTH|GATEWAY|AVS|CPU|INTEGRITY|MISUSE|ZERO FLOOR/.test(text)) return "authorization_or_configuration";
  if (/MARKUP|DISC(?:OUNT)? RATE/.test(text)) return "processor_markup";
  return "explicit_fee";
}

function materialityFor(row: CanonicalFeeRow, analysis: CanonicalStatementAnalysis): InternalAnalystFinding["materiality"] {
  const amount = row.selectedAmount?.amountMinor ?? null;
  const sales = analysis.financialFacts.processedSales.value?.amountMinor ?? null;
  const bps = amount !== null && sales && sales > 0 ? round(amount / sales * 10_000, 2) : null;
  const level = bps === null ? "unquantified" : bps >= 25 ? "critical" : bps >= 10 ? "major" : bps >= 3 ? "moderate" : "minor";
  return { level, basisPointsOfProcessedSales: bps, statementPeriodOnly: true };
}

function whyItMatters(row: CanonicalFeeRow, materiality: InternalAnalystFinding["materiality"], category: string | null): string {
  const dollars = row.selectedAmount ? `$${(row.selectedAmount.amountMinor / 100).toFixed(2)}` : "an unquantified amount";
  const share = materiality.basisPointsOfProcessedSales === null ? "with no reliable volume-relative measure" : `${materiality.basisPointsOfProcessedSales.toFixed(2)} basis points of processed sales`;
  return `The statement shows ${dollars} for this period (${share}); ${category ?? "the unresolved category"} can affect merchant economics, operating behavior, or pricing transparency.`;
}

function isMaterialFeeRow(row: CanonicalFeeRow, analysis: CanonicalStatementAnalysis): boolean {
  if (!row.contributesToUniqueTotal || !row.selectedAmount || row.selectedAmount.amountMinor <= 0) return false;
  const sales = analysis.financialFacts.processedSales.value?.amountMinor ?? 0;
  const bps = sales > 0 ? row.selectedAmount.amountMinor / sales * 10_000 : 0;
  return row.selectedAmount.amountMinor >= 100 || bps >= 0.25;
}

function competingInterpretations(semantic: FeeSemanticsShadowRowResult, contributions: InternalAnalystResearchContribution[]): InternalAnalystFinding["competingInterpretations"] {
  const governed = [...new Set([...semantic.candidateConceptIds, ...semantic.retrievalLeadConceptIds])].map((interpretation) => ({
    source: "governed_retrieval" as const,
    interpretation,
    evidenceRefs: [...semantic.aiHypothesisEvidenceRefs, ...semantic.qualifiedResearchEvidenceRefs],
    status: semantic.status === "unresolved_conflict" ? "conflicting" as const : "candidate" as const,
  }));
  const research = contributions.filter((item) => !isAdmittedResearchContribution(item)).map((item) => ({
    source: "research" as const,
    interpretation: item.interpretation,
    evidenceRefs: item.sourceRefs,
    status: item.status === "conflicting" ? "conflicting" as const : "candidate" as const,
  }));
  return [...governed, ...research];
}

function buildInternalAnalystResearchQueue(
  analysis: CanonicalStatementAnalysis,
  findings: InternalAnalystFinding[],
): InternalAnalystResearchQueueV1 {
  const findingByFeeRowId = new Map(
    findings
      .filter((finding): finding is InternalAnalystFinding & { sourceFeeRowId: string } => Boolean(finding.sourceFeeRowId))
      .map((finding) => [finding.sourceFeeRowId, finding]),
  );
  const questions = defaultFeeKnowledgeResearchQuestions(analysis)
    .filter((question) => {
      const finding = findingByFeeRowId.get(question.feeRowRef);
      return Boolean(finding && (
        finding.exactFeeIdentity.state === "unresolved" ||
        finding.exactFeeIdentity.state === "conflicting" ||
        finding.competingInterpretations.some((interpretation) => interpretation.status === "conflicting")
      ));
    })
    .map((question): FeeKnowledgeResearchQuestion => ({
      ...question,
      deterministicCategory: null,
      deterministicEconomicOwner: null,
      deterministicContractualController: null,
      deterministicActionabilityCeiling: "verify_only",
      deterministicConfidence: "medium",
      semanticQuestion: `Find authoritative and applicable evidence for the printed payment-processing label ${JSON.stringify(question.feeLabel)}. Resolve, where evidence permits, exact identity, aliases, broader category, assessment unit, collector, economic beneficiary, rule setter, price setter, and merchant-facing price controller. Preserve competing interpretations and do not infer negotiability or contract compliance from a processor/network label.`,
    }));
  const plan = planFeeKnowledgeResearchQuestions(questions, FEE_KNOWLEDGE_RESEARCH_LIMITS);
  const queueItem = (item: (typeof plan.selected)[number]) => ({
    questionRef: feeKnowledgeQuestionRef(item.question, item.originalIndex),
    findingId: findingByFeeRowId.get(item.question.feeRowRef)!.findingId,
    question: item.question,
    priorityScore: item.score,
    reasonCodes: item.reasonCodes,
  });
  return {
    schemaVersion: "internal_analyst_research_queue_v1",
    transport: "feeKnowledge_research_v1",
    authority: "research_leads_only",
    execution: "not_run_by_report_builder",
    selected: plan.selected.map(queueItem),
    deferred: plan.notSelectedQuestions.map(queueItem),
    limitations: [
      "This queue routes unresolved material fee questions to the existing bounded research transport; it does not execute network research while building the deterministic finding.",
      "Legacy category, ownership, contract-control, confidence, and actionability fields are neutralized before queueing so older deterministic conclusions do not bias research authority.",
      "Research output remains non-authoritative until the analyst admission gate receives independent evidence, source references, and a review date.",
    ],
  };
}

function coverage(
  findings: InternalAnalystFinding[],
  contributions: InternalAnalystResearchContribution[],
  researchQueue: InternalAnalystResearchQueueV1,
): InternalAnalystFindingReportV1["coverage"] {
  return {
    materialFeeRows: findings.filter((item) => item.sourceFeeRowId).length,
    findings: findings.length,
    officialOrPublishedBackedFindings: findings.filter((item) => allEvidence(item).some((basis) => basis.evidenceClass === "E3_network_publication" || basis.evidenceClass === "E4_processor_or_iso_publication")).length,
    industryNormJudgments: findings.filter((item) => allEvidence(item).some((basis) => basis.evidenceClass === "E5_professional_industry_norm")).length,
    admittedResearchResolutions: contributions.filter(isAdmittedResearchContribution).length,
    unresolvedOrCompetingFindings: findings.filter((item) => item.exactFeeIdentity.state === "unresolved" || item.competingInterpretations.length > 0).length,
    noAgreementActionFindings: findings.filter((item) => item.practicalMerchantAction.value?.toLowerCase().includes("does not require") || item.practicalMerchantAction.value?.toLowerCase().includes("no agreement")).length,
    contractDependentFindings: findings.filter((item) => item.contractualCompliance.state === "contract_required").length,
    queuedResearchQuestions: researchQueue.selected.length + researchQueue.deferred.length,
  };
}

function allEvidence(finding: InternalAnalystFinding): AnalystEvidenceBasis[] {
  return Object.values(finding).flatMap((value) => value && typeof value === "object" && "evidence" in value ? (value as AnalystClaim<unknown>).evidence : []);
}

function normApplicable(norm: GovernedIndustryNorm, context: InternalAnalystMerchantContext): boolean {
  const vertical = context.verticalId ?? "";
  const verticalMatch = norm.applicableVerticals.includes(vertical) || norm.applicableVerticals.includes("other");
  const riskMatch = context.riskClass !== "unknown" && norm.applicableRiskClasses.includes(context.riskClass);
  const channelMatch = context.channel === "unknown" || norm.applicableChannels.includes(context.channel);
  return verticalMatch && riskMatch && channelMatch;
}

function normDispositionClaim<T extends "frequently_negotiable" | "sometimes_negotiable" | "rarely_negotiable" | "frequently_waivable" | "sometimes_waivable" | "rarely_waivable">(
  value: T,
  norm: GovernedIndustryNorm,
  explanation: string,
): AnalystClaim<T> {
  return claim("industry_judgment", value, "LIKELY", [frameworkNormEvidence(norm)], explanation);
}

function frameworkNormEvidence(norm?: GovernedIndustryNorm): AnalystEvidenceBasis {
  return evidence("E5_professional_industry_norm", [norm?.sourceRef ?? "CLAUDE_RateReveal_Fee_Analysis_Framework_v1.md#governed-commercial-heuristics"], "industry_norm");
}

function contextEvidence(context: InternalAnalystMerchantContext): AnalystEvidenceBasis[] {
  return context.evidenceRefs.length > 0 ? [evidence(context.basis === "merchant_confirmed" ? "E2_merchant_document" : "E1_statement", context.evidenceRefs, context.basis === "merchant_confirmed" ? "merchant_specific" : "statement_fact")] : [];
}

function semanticPublishedEvidence(refs: string[], authorities: Readonly<Record<string, string>>): AnalystEvidenceBasis[] {
  const grouped = new Map<AnalystEvidenceClass, string[]>();
  for (const ref of refs) {
    const authority = authorities[ref];
    const evidenceClass: AnalystEvidenceClass = authority === "official_network_publication"
      ? "E3_network_publication"
      : authority === "processor_publication" || authority === "processor_support_documentation" || authority === "iso_material"
        ? "E4_processor_or_iso_publication"
        : authority === "merchant_agreement"
          ? "E2_merchant_document"
          : authority === "expert_curated"
            ? "G1_governed_payment_knowledge"
            : "E7_public_research";
    grouped.set(evidenceClass, [...(grouped.get(evidenceClass) ?? []), ref]);
  }
  return [...grouped.entries()].map(([evidenceClass, evidenceRefs]) => evidence(
    evidenceClass,
    evidenceRefs,
    evidenceClass === "G1_governed_payment_knowledge" ? "governed_knowledge" : evidenceClass === "E2_merchant_document" ? "merchant_specific" : "official_or_published",
  ));
}

function evidence(evidenceClass: AnalystEvidenceClass, refs: string[], characterization: AnalystEvidenceBasis["characterization"]): AnalystEvidenceBasis {
  return { evidenceClass, refs: [...new Set(refs)].sort(), characterization };
}

function claim<T>(state: AnalystClaimState, value: T | null, confidence: AnalystConfidence, basis: AnalystEvidenceBasis[], explanation: string, limitations: string[] = []): AnalystClaim<T> {
  return { state, value, confidence, evidence: basis, explanation, limitations };
}

function unresolvedClaim<T>(explanation: string, basis: AnalystEvidenceBasis[]): AnalystClaim<T> {
  return claim<T>("unresolved", null, "UNRESOLVED", basis, explanation);
}

function notAssessableClaim<T>(explanation: string): AnalystClaim<T> {
  return claim<T>("not_assessable", null, "UNRESOLVED", [], explanation);
}

function notApplicableClaim<T>(explanation: string): AnalystClaim<T> {
  return claim<T>("not_applicable", null, "CONFIRMED", [], explanation);
}

function compact<T>(values: Array<T | null | undefined>): T[] { return values.filter((value): value is T => value !== null && value !== undefined); }
function stableId(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function round(value: number, digits: number): number { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
function formatNormValue(value: number, norm: GovernedIndustryNorm): string { return norm.unit.startsWith("usd") ? `$${value.toFixed(2)}` : String(value); }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
