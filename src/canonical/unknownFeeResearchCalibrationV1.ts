import type { OpenWorldFeeDeterminant } from "./governedOpenWorldDeterminantV1.js";

export const UNKNOWN_FEE_RESEARCH_CALIBRATION_V1 =
  "unknown_fee_research_calibration_retrieval_strategy_2026_09_08_v1" as const;

export type UnknownFeeResearchType =
  | "A_PROPRIETARY_BRANDED"
  | "B_GENERIC_DESCRIPTIVE"
  | "C_ABBREVIATED_CODED"
  | "D_NETWORK_LOOKING"
  | "E_THIRD_PARTY_OR_SERVICE"
  | "F_UNFAMILIAR_PER_ITEM_OR_RECURRING";

export type UnknownFeeQueryShapeKind =
  | "EXACT_QUOTED_LABEL"
  | "PROCESSOR_EXACT_LABEL"
  | "CODE_PROCESSOR_DOCUMENT_GENRE"
  | "PROCESSOR_MERCHANT_APPLICATION"
  | "PROCESSOR_FEE_SCHEDULE"
  | "PROCESSOR_PROGRAM_OR_STATEMENT_GUIDE"
  | "SAME_PLATFORM_PUBLIC_STATEMENT"
  | "MECHANIC_POPULATION_HYPOTHESIS"
  | "NETWORK_PERIOD_GEOGRAPHY_PRODUCT"
  | "NETWORK_RATE_OR_CHANGE_NOTICE"
  | "THIRD_PARTY_SERVICE_DOCUMENTATION";

export type UnknownFeeSourceLane =
  | "processor_own"
  | "acquirer_or_iso"
  | "same_platform_statement"
  | "procurement_or_institutional"
  | "specialist_industry"
  | "generic_or_ai_navigation";

export type UnknownFeeResearchQueryShapeV1 = {
  shapeId: string;
  kind: UnknownFeeQueryShapeKind;
  query: string;
  hypothesis: string;
  documentGenres: string[];
  distinctFromPriorBy: string[];
};

export type UnknownFeeResearchPlanV1 = {
  strategyVersion: typeof UNKNOWN_FEE_RESEARCH_CALIBRATION_V1;
  feeRowId: string;
  primaryType: UnknownFeeResearchType;
  applicableTypes: UnknownFeeResearchType[];
  labelFeatures: {
    normalizedRetrievalKey: string;
    distinctivePhrase: string;
    codeTokens: string[];
    processorName: string | null;
    statementYear: string | null;
    statementRole: string | null;
  };
  stage0: {
    decision: "RESEARCH" | "STOP_WITHOUT_EXTERNAL_RESEARCH";
    determinantSufficient: boolean;
    exactIdentityMateriallyChangesConclusion: boolean;
    unresolvedMaterialDeterminant: boolean;
    reasonCodes: string[];
    stoppingReason: "S1_DETERMINANT_SUFFICIENCY" | "S2_BELOW_MATERIALITY_FLOOR" | "STRUCTURAL_ANALYSIS_PREFERRED" | null;
  };
  budget: {
    maximumSearchShapes: number;
    maximumDocumentFetches: number;
    maximumSynthesisCalls: number;
    maximumExternalOperations: number;
    minimumDistinctNoEvidenceShapesBeforeStop: 2;
    exceptionalEscalationAllowed: false;
  };
  queryShapes: UnknownFeeResearchQueryShapeV1[];
  documentGenrePriority: Array<{ rank: number; genre: string }>;
  evidencePolicy: {
    searchUsefulnessSeparateFromAuthority: true;
    candidateCannotOverrideContradictoryStatementStructure: true;
    reusableKnowledgeSelfAdmissionAllowed: false;
    canonicalMutationAllowed: false;
  };
};

export type UnknownFeeResearchStopDecisionV1 = {
  stop: boolean;
  stoppingReason:
    | "S1_DETERMINANT_SUFFICIENCY"
    | "S2_BELOW_MATERIALITY_FLOOR"
    | "S3_TWO_DISTINCT_SHAPES_NO_USABLE_EVIDENCE"
    | "S3_RESEARCH_STAGNATION"
    | "S4_SOURCE_QUALITY_FAILURE"
    | "BUDGET_EXHAUSTED"
    | null;
  reasonCodes: string[];
};

export type UnknownFeeResearchCaseMetricV1 = {
  caseId: string;
  primaryType: UnknownFeeResearchType;
  stage0Decision: UnknownFeeResearchPlanV1["stage0"]["decision"];
  externalOperations: number;
  executedQueryShapes: Array<{ kind: UnknownFeeQueryShapeKind; usableEvidence: boolean }>;
  sources: Array<{ lane: UnknownFeeSourceLane; useful: boolean; authorityAccepted: boolean }>;
  determinantLift: Array<"D1" | "D2" | "D3" | "D4">;
  actionLift: boolean;
  evidenceTierImproved: boolean;
  correctionState: "none" | "downgraded" | "corrected" | "reversed";
};

const DOCUMENT_GENRE_PRIORITY = [
  "processor_or_iso_merchant_application",
  "processor_fee_or_pricing_schedule",
  "processor_program_or_statement_guide",
  "processor_support_documentation",
  "same_platform_public_merchant_statement",
  "government_university_or_acquirer_procurement_schedule",
  "specialist_industry_source",
  "generic_web_or_ai_navigation_only",
] as const;

const GENERIC_LABEL = /^(?:OTHER\s+)?(?:ADDITIONAL|MISC(?:ELLANEOUS)?|OTHER)\s+(?:ITEM\s+|VOLUME\s+)?FEES?$|^BATCH HEADER$/;
const NETWORK_TERM = /\b(?:VISA|MASTERCARD|MASTER CARD|MC|AMEX|AMERICAN EXPRESS|DISCOVER|DCVR|NETWORK|ASSESSMENT|DUES|INTEGRITY|ACCESS FEE|LICENSE)\b/;
const SERVICE_TERM = /\b(?:GATEWAY|GTWY|SOFTWARE|VIRTUAL TERMINAL|EQUIPMENT|TERMINAL|LEASE|TAX|REGULATORY|THIRD PARTY|SERVICE PROVIDER)\b/;
const PROPRIETARY_TERM = /\b(?:ADVANTAGE|CLOVER|PAYSAFE|BASYS|NXGEN|PRIORITY|WELLS FARGO|FIRST DATA|FISERV)\b/;
const RECURRING_OR_ITEM_TERM = /\b(?:MONTHLY|MTHLY|ANNUAL|PER ITEM|ITEM FEE|TRANSACTIONS? AT|BATCH|FIXED|LOCATION)\b/;
const CODE_ALLOWLIST = new Set(["CPU", "GTWY", "MCVDB", "AMDS", "ECI", "FRF", "CNP", "CP", "DB", "NQUAL", "MQUAL", "OFLN"]);
const COMMON_TOKENS = new Set(["OTHER", "FEE", "FEES", "MONTHLY", "TRANSACTION", "TRANSACTIONS", "BATCH", "SETTLEMENT", "VISA", "MASTERCARD", "AMEX", "DISCOVER", "SALES", "RATE", "TIMES", "ITEM", "VOLUME"]);

export function buildUnknownFeeResearchPlanV1(input: {
  feeRowId: string;
  printedLabel: string;
  processorName: string | null;
  statementYear: string | null;
  statementRole: string | null;
  determinant: OpenWorldFeeDeterminant;
}): UnknownFeeResearchPlanV1 {
  const label = normalize(input.printedLabel);
  const codeTokens = distinctiveCodeTokens(label);
  const applicableTypes = classifyUnknownFeeResearchTypesV1({ label, determinant: input.determinant, codeTokens });
  const primaryType = primaryResearchType(applicableTypes);
  const determinantSufficient = input.determinant.determinantSufficiency === "DETERMINANT_SUFFICIENT";
  const unresolvedMaterialDeterminant = input.determinant.d3Materiality.material && (
    input.determinant.d1EconomicLayerAndControl.economicLayer.value === "LAYER_UNRESOLVED" ||
    input.determinant.d2MechanicAndPopulation.mechanic.state === "unresolved" ||
    input.determinant.d2MechanicAndPopulation.population.state === "unresolved" ||
    input.determinant.d4Actionability.actionClass === "N7"
  );
  const exactIdentityMateriallyChangesConclusion = input.determinant.exactIdentity.necessaryForUsefulAction ||
    input.determinant.d4Actionability.actionClass === "N7" ||
    (input.determinant.exactIdentity.state !== "exact_supported" &&
      (input.determinant.d2MechanicAndPopulation.mechanic.state === "unresolved" || input.determinant.d2MechanicAndPopulation.population.state === "unresolved") &&
      ["per_event", "fixed_or_periodic", "conditional_or_exception"].includes(input.determinant.d3Materiality.volumeSensitivity)) ||
    (input.determinant.d3Materiality.highMateriality && unresolvedMaterialDeterminant);
  const merchantConclusionAlreadyUsable =
    input.determinant.exactIdentity.state === "exact_supported" &&
    input.determinant.d1EconomicLayerAndControl.economicLayer.value !== "LAYER_UNRESOLVED" &&
    input.determinant.d4Actionability.actionClass !== "N7" &&
    !input.determinant.d3Materiality.highMateriality;
  const genericStructuralDefault = primaryType === "B_GENERIC_DESCRIPTIVE" &&
    !input.determinant.d3Materiality.highMateriality &&
    input.determinant.d4Actionability.actionClass !== "N7";
  const stage0 = !input.determinant.d3Materiality.material
    ? {
        decision: "STOP_WITHOUT_EXTERNAL_RESEARCH" as const,
        determinantSufficient,
        exactIdentityMateriallyChangesConclusion,
        unresolvedMaterialDeterminant,
        reasonCodes: ["below_governed_merchant_materiality_threshold"],
        stoppingReason: "S2_BELOW_MATERIALITY_FLOOR" as const,
      }
    : input.determinant.research.disposition !== "ESCALATE_BOUNDED_RESEARCH"
      ? {
          decision: "STOP_WITHOUT_EXTERNAL_RESEARCH" as const,
          determinantSufficient,
          exactIdentityMateriallyChangesConclusion,
          unresolvedMaterialDeterminant,
          reasonCodes: ["governed_open_world_research_not_escalated", ...input.determinant.research.reasonCodes],
          stoppingReason: "S1_DETERMINANT_SUFFICIENCY" as const,
        }
    : (determinantSufficient || merchantConclusionAlreadyUsable) && !exactIdentityMateriallyChangesConclusion
      ? {
          decision: "STOP_WITHOUT_EXTERNAL_RESEARCH" as const,
          determinantSufficient,
          exactIdentityMateriallyChangesConclusion,
          unresolvedMaterialDeterminant,
          reasonCodes: [determinantSufficient ? "d1_d4_sufficient" : "merchant_conclusion_already_usable", "exact_identity_adds_no_material_merchant_value"],
          stoppingReason: "S1_DETERMINANT_SUFFICIENCY" as const,
        }
      : genericStructuralDefault
        ? {
            decision: "STOP_WITHOUT_EXTERNAL_RESEARCH" as const,
            determinantSufficient,
            exactIdentityMateriallyChangesConclusion,
            unresolvedMaterialDeterminant,
            reasonCodes: ["generic_label_prefers_statement_structure", "price_control_and_actionability_already_usable"],
            stoppingReason: "STRUCTURAL_ANALYSIS_PREFERRED" as const,
          }
        : {
            decision: "RESEARCH" as const,
            determinantSufficient,
            exactIdentityMateriallyChangesConclusion,
            unresolvedMaterialDeterminant,
            reasonCodes: [
              exactIdentityMateriallyChangesConclusion ? "identity_or_interpretation_materially_changes_conclusion" : "material_determinant_gap",
              ...applicableTypes.map((type) => `research_type_${type.toLowerCase()}`),
            ],
            stoppingReason: null,
          };
  const budget = researchBudget(primaryType, stage0.decision);
  const distinctivePhrase = distinctiveLabelPhrase(label);
  const queryShapes = stage0.decision === "RESEARCH"
    ? buildQueryShapes({
        primaryType,
        applicableTypes,
        label: distinctivePhrase,
        processorName: input.processorName,
        statementYear: input.statementYear,
        statementRole: input.statementRole,
        codeTokens,
        determinant: input.determinant,
      }).slice(0, budget.maximumSearchShapes)
    : [];
  return {
    strategyVersion: UNKNOWN_FEE_RESEARCH_CALIBRATION_V1,
    feeRowId: input.feeRowId,
    primaryType,
    applicableTypes,
    labelFeatures: {
      normalizedRetrievalKey: label,
      distinctivePhrase,
      codeTokens,
      processorName: input.processorName,
      statementYear: input.statementYear,
      statementRole: input.statementRole,
    },
    stage0,
    budget,
    queryShapes,
    documentGenrePriority: DOCUMENT_GENRE_PRIORITY.map((genre, index) => ({ rank: index + 1, genre })),
    evidencePolicy: {
      searchUsefulnessSeparateFromAuthority: true,
      candidateCannotOverrideContradictoryStatementStructure: true,
      reusableKnowledgeSelfAdmissionAllowed: false,
      canonicalMutationAllowed: false,
    },
  };
}

export function classifyUnknownFeeResearchTypesV1(input: {
  label: string;
  determinant: OpenWorldFeeDeterminant;
  codeTokens?: string[];
}): UnknownFeeResearchType[] {
  const label = normalize(input.label);
  const types = new Set<UnknownFeeResearchType>();
  if (GENERIC_LABEL.test(label.replace(/^OTHER\s+-\s+/, ""))) types.add("B_GENERIC_DESCRIPTIVE");
  if (PROPRIETARY_TERM.test(label) || /\bADVANTAGE\s+FEE\b/.test(label)) types.add("A_PROPRIETARY_BRANDED");
  if ((input.codeTokens ?? distinctiveCodeTokens(label)).length > 0) types.add("C_ABBREVIATED_CODED");
  if (NETWORK_TERM.test(label) || ["F2", "F3", "F4"].includes(input.determinant.family.value ?? "")) types.add("D_NETWORK_LOOKING");
  if (SERVICE_TERM.test(label) || ["F9", "F11", "F12"].includes(input.determinant.family.value ?? "") || input.determinant.attributes.includes("third_party_possible")) types.add("E_THIRD_PARTY_OR_SERVICE");
  if (RECURRING_OR_ITEM_TERM.test(label) || ["per_event", "fixed_or_periodic"].includes(input.determinant.d3Materiality.volumeSensitivity)) types.add("F_UNFAMILIAR_PER_ITEM_OR_RECURRING");
  if (types.size === 0) types.add("B_GENERIC_DESCRIPTIVE");
  return [...types].sort((left, right) => typePriority(left) - typePriority(right));
}

export function decideUnknownFeeResearchStopV1(input: {
  plan: UnknownFeeResearchPlanV1;
  determinantSufficientAfterResearch: boolean;
  exactIdentityStillNecessary: boolean;
  executedDistinctQueryShapes: number;
  usableEvidenceCount: number;
  retrievedOnlyLowQualityOrDuplicativeEvidence: boolean;
  evidenceOrConfidenceTierImproved: boolean;
  externalOperations: number;
}): UnknownFeeResearchStopDecisionV1 {
  if (input.plan.stage0.decision === "STOP_WITHOUT_EXTERNAL_RESEARCH") {
    return { stop: true, stoppingReason: input.plan.stage0.stoppingReason === "STRUCTURAL_ANALYSIS_PREFERRED" ? "S1_DETERMINANT_SUFFICIENCY" : input.plan.stage0.stoppingReason, reasonCodes: input.plan.stage0.reasonCodes };
  }
  if (input.determinantSufficientAfterResearch && !input.exactIdentityStillNecessary) {
    return { stop: true, stoppingReason: "S1_DETERMINANT_SUFFICIENCY", reasonCodes: ["determinant_sufficiency_reached_after_research"] };
  }
  if (input.retrievedOnlyLowQualityOrDuplicativeEvidence) {
    return { stop: true, stoppingReason: "S4_SOURCE_QUALITY_FAILURE", reasonCodes: ["retrieved_evidence_low_quality_duplicative_or_inapplicable"] };
  }
  if (input.executedDistinctQueryShapes >= input.plan.budget.minimumDistinctNoEvidenceShapesBeforeStop && input.usableEvidenceCount === 0) {
    return { stop: true, stoppingReason: "S3_TWO_DISTINCT_SHAPES_NO_USABLE_EVIDENCE", reasonCodes: ["two_genuinely_distinct_shapes_no_usable_evidence"] };
  }
  if (input.executedDistinctQueryShapes >= 2 && !input.evidenceOrConfidenceTierImproved) {
    return { stop: true, stoppingReason: "S3_RESEARCH_STAGNATION", reasonCodes: ["further_research_did_not_improve_evidence_or_confidence_tier"] };
  }
  if (input.externalOperations >= input.plan.budget.maximumExternalOperations) {
    return { stop: true, stoppingReason: "BUDGET_EXHAUSTED", reasonCodes: ["ordinary_external_operation_cap_reached"] };
  }
  return { stop: false, stoppingReason: null, reasonCodes: ["bounded_research_may_continue"] };
}

export function classifyUnknownFeeSourceLaneV1(input: {
  url: string;
  processorName: string | null;
  title?: string | null;
}): UnknownFeeSourceLane {
  const value = `${input.url} ${input.title ?? ""}`.toLowerCase();
  const hostname = safeHostname(input.url);
  const processor = normalize(input.processorName ?? "").toLowerCase().split(/\s+|\//).filter((token) => token.length >= 4);
  const knownProcessorDomain = /(?:^|\.)(?:fiserv\.com|firstdata\.com|clover\.com|paysafe\.com)$/.test(hostname);
  const processorOfficialTitle = /\b(?:official|merchant services|support|fee schedule|pricing)\b/.test((input.title ?? "").toLowerCase()) && processor.some((token) => (input.title ?? "").toLowerCase().includes(token));
  if (knownProcessorDomain || processorOfficialTitle) return "processor_own";
  if (/acquir|merchant services|payments|iso\b/.test(value)) return "acquirer_or_iso";
  if (/statement|processing-report|merchant-statement/.test(value)) return "same_platform_statement";
  if (/\.gov\b|\.edu\b|procurement|rfp|bid|contract|addendum/.test(value)) return "procurement_or_institutional";
  if (/cardfellow|tsg|paymentsjournal|merchantmaverick|digitaltransactions|thepaymentsassociation/.test(value)) return "specialist_industry";
  return "generic_or_ai_navigation";
}

function safeHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function summarizeUnknownFeeResearchQualityV1(cases: readonly UnknownFeeResearchCaseMetricV1[]) {
  const executed = cases.filter((item) => item.stage0Decision === "RESEARCH");
  const totalOperations = cases.reduce((sum, item) => sum + item.externalOperations, 0);
  const wastedOperations = cases
    .filter((item) => item.stage0Decision !== "RESEARCH")
    .reduce((sum, item) => sum + item.externalOperations, 0);
  const usefulCases = executed.filter((item) => item.determinantLift.length > 0 || item.actionLift || item.evidenceTierImproved);
  const shapeKinds = [...new Set(executed.flatMap((item) => item.executedQueryShapes.map((shape) => shape.kind)))];
  const lanes: UnknownFeeSourceLane[] = ["processor_own", "acquirer_or_iso", "same_platform_statement", "procurement_or_institutional", "specialist_industry", "generic_or_ai_navigation"];
  return {
    cases: cases.length,
    researchCases: executed.length,
    stage0Stops: cases.length - executed.length,
    determinantLiftCases: executed.filter((item) => item.determinantLift.length > 0).length,
    actionLiftCases: executed.filter((item) => item.actionLift).length,
    evidenceTierImprovementCases: executed.filter((item) => item.evidenceTierImproved).length,
    researchEfficiency: {
      usefulCases: usefulCases.length,
      totalExternalOperations: totalOperations,
      usefulCasesPerExternalOperation: totalOperations > 0 ? round(usefulCases.length / totalOperations) : null,
    },
    wastedBudgetRatePercent: totalOperations > 0
      ? round(wastedOperations / totalOperations * 100)
      : 0,
    queryShapeYield: Object.fromEntries(shapeKinds.map((kind) => {
      const shapes = executed.flatMap((item) => item.executedQueryShapes).filter((shape) => shape.kind === kind);
      return [kind, { executed: shapes.length, usableEvidence: shapes.filter((shape) => shape.usableEvidence).length }];
    })),
    sourceQualityDistribution: Object.fromEntries(lanes.map((lane) => {
      const sources = executed.flatMap((item) => item.sources).filter((source) => source.lane === lane);
      return [lane, { found: sources.length, useful: sources.filter((source) => source.useful).length, authorityAccepted: sources.filter((source) => source.authorityAccepted).length }];
    })),
    correctionTracking: {
      downgraded: cases.filter((item) => item.correctionState === "downgraded").length,
      corrected: cases.filter((item) => item.correctionState === "corrected").length,
      reversed: cases.filter((item) => item.correctionState === "reversed").length,
    },
  };
}

function researchBudget(primaryType: UnknownFeeResearchType, decision: UnknownFeeResearchPlanV1["stage0"]["decision"]): UnknownFeeResearchPlanV1["budget"] {
  if (decision === "STOP_WITHOUT_EXTERNAL_RESEARCH") return { maximumSearchShapes: 0, maximumDocumentFetches: 0, maximumSynthesisCalls: 0, maximumExternalOperations: 0, minimumDistinctNoEvidenceShapesBeforeStop: 2, exceptionalEscalationAllowed: false };
  if (primaryType === "B_GENERIC_DESCRIPTIVE") return { maximumSearchShapes: 3, maximumDocumentFetches: 2, maximumSynthesisCalls: 1, maximumExternalOperations: 6, minimumDistinctNoEvidenceShapesBeforeStop: 2, exceptionalEscalationAllowed: false };
  if (["A_PROPRIETARY_BRANDED", "C_ABBREVIATED_CODED", "D_NETWORK_LOOKING"].includes(primaryType)) return { maximumSearchShapes: 4, maximumDocumentFetches: 3, maximumSynthesisCalls: 1, maximumExternalOperations: 8, minimumDistinctNoEvidenceShapesBeforeStop: 2, exceptionalEscalationAllowed: false };
  return { maximumSearchShapes: 3, maximumDocumentFetches: 3, maximumSynthesisCalls: 1, maximumExternalOperations: 7, minimumDistinctNoEvidenceShapesBeforeStop: 2, exceptionalEscalationAllowed: false };
}

function buildQueryShapes(input: {
  primaryType: UnknownFeeResearchType;
  applicableTypes: UnknownFeeResearchType[];
  label: string;
  processorName: string | null;
  statementYear: string | null;
  statementRole: string | null;
  codeTokens: string[];
  determinant: OpenWorldFeeDeterminant;
}): UnknownFeeResearchQueryShapeV1[] {
  const processor = input.processorName ?? "payment processor";
  const year = input.statementYear ?? "statement period";
  const quoted = quote(input.label);
  const codeHypotheses = new Set(input.codeTokens);
  // Product-approved retrieval hypothesis only; it does not assert that the
  // codes are aliases or that either code identifies the printed fee.
  if (codeHypotheses.has("MCVDB")) codeHypotheses.add("AMDS");
  if (codeHypotheses.has("AMDS")) codeHypotheses.add("MCVDB");
  const code = [...codeHypotheses].join(" OR ") || input.label;
  const mechanic = input.determinant.d2MechanicAndPopulation.mechanic.value ?? input.determinant.d3Materiality.volumeSensitivity;
  const shapes: UnknownFeeResearchQueryShapeV1[] = [];
  const add = (kind: UnknownFeeQueryShapeKind, query: string, hypothesis: string, genres: string[], distinct: string[]) => {
    if (shapes.some((item) => normalize(item.query) === normalize(query))) return;
    shapes.push({ shapeId: `shape_${String(shapes.length + 1).padStart(2, "0")}_${kind.toLowerCase()}`, kind, query, hypothesis, documentGenres: genres, distinctFromPriorBy: distinct });
  };
  if (input.primaryType !== "B_GENERIC_DESCRIPTIVE") add("EXACT_QUOTED_LABEL", `${quoted} fee`, "The exact phrase appears in public documentation or a public statement.", ["exact_document"], ["exact_phrase"]);
  if (input.applicableTypes.includes("A_PROPRIETARY_BRANDED")) {
    add("PROCESSOR_EXACT_LABEL", `${quote(processor)} ${quoted}`, "The label is proprietary processor, ISO, or program nomenclature.", ["processor_documentation"], ["processor_context"]);
  }
  if (input.applicableTypes.includes("C_ABBREVIATED_CODED")) {
    add("CODE_PROCESSOR_DOCUMENT_GENRE", `${quote(code)} ${quote(processor)} "fee schedule" OR "merchant application" OR "statement guide" filetype:pdf`, "The distinctive code is defined in a processor-specific document genre.", ["fee_schedule", "merchant_application", "statement_guide"], ["code_or_suffix", "processor_context", "document_genre"]);
    add("SAME_PLATFORM_PUBLIC_STATEMENT", `${quote(code)} ${quote(processor)} "processing statement" OR "merchant statement"`, "The code recurs on same-platform statements with clearer headings or descriptions.", ["same_platform_public_statement"], ["same_platform_example"]);
  }
  if (input.applicableTypes.includes("A_PROPRIETARY_BRANDED")) {
    add("PROCESSOR_MERCHANT_APPLICATION", `${quote(processor)} ${quoted} "merchant application" OR "fee schedule" filetype:pdf`, "A merchant application or schedule defines the program and price layer.", ["merchant_application", "fee_schedule"], ["document_genre", "pdf"]);
    add("PROCESSOR_PROGRAM_OR_STATEMENT_GUIDE", `${quote(processor)} ${quoted} "program guide" OR "statement guide" OR "pricing schedule"`, "A program or statement guide expands the label and billed population.", ["program_guide", "statement_guide", "pricing_schedule"], ["document_genre"]);
  }
  if (input.applicableTypes.includes("D_NETWORK_LOOKING")) {
    add("NETWORK_PERIOD_GEOGRAPHY_PRODUCT", `${quoted} ${year} US network fee ${mechanic}`, "A dated U.S. network document establishes identity, product scope, mechanic, and period.", ["network_fee_schedule", "network_change_notice"], ["network", "period", "geography", "mechanic"]);
    add("NETWORK_RATE_OR_CHANGE_NOTICE", `${quoted} ${year} rate OR assessment OR bulletin filetype:pdf`, "A dated fee schedule or change notice establishes a published rate or scope.", ["network_fee_schedule", "change_notice"], ["rate_or_value", "dated_document"]);
  }
  if (input.applicableTypes.includes("E_THIRD_PARTY_OR_SERVICE")) {
    add("THIRD_PARTY_SERVICE_DOCUMENTATION", `${quoted} ${quote(processor)} gateway OR software OR equipment OR service pricing`, "A processor or named provider document establishes the service and controller.", ["service_documentation", "pricing_schedule"], ["service_hypothesis", "controller"]);
  }
  if (input.applicableTypes.includes("F_UNFAMILIAR_PER_ITEM_OR_RECURRING") || input.primaryType === "B_GENERIC_DESCRIPTIVE") {
    add("MECHANIC_POPULATION_HYPOTHESIS", `${quote(processor)} ${quoted} ${quote(mechanic)} ${quote(input.statementRole ?? "fee detail")} "fee schedule"`, "Statement mechanic, population, and section locate a matching processor definition.", ["fee_schedule", "statement_guide"], ["mechanic", "population", "statement_structure"]);
    add("PROCESSOR_FEE_SCHEDULE", `${quote(processor)} ${quoted} "pricing schedule" OR "pass-through fee schedule" filetype:pdf`, "A processor schedule identifies whether the charge is commercial, service, or pass-through.", ["pricing_schedule", "pass_through_fee_schedule"], ["processor_context", "document_genre"]);
  }
  return shapes;
}

function primaryResearchType(types: UnknownFeeResearchType[]): UnknownFeeResearchType {
  return [...types].sort((left, right) => typePriority(left) - typePriority(right))[0]!;
}

function typePriority(type: UnknownFeeResearchType): number {
  return ({
    A_PROPRIETARY_BRANDED: 1,
    D_NETWORK_LOOKING: 2,
    C_ABBREVIATED_CODED: 3,
    E_THIRD_PARTY_OR_SERVICE: 4,
    F_UNFAMILIAR_PER_ITEM_OR_RECURRING: 5,
    B_GENERIC_DESCRIPTIVE: 6,
  } satisfies Record<UnknownFeeResearchType, number>)[type];
}

function distinctiveCodeTokens(label: string): string[] {
  return [...new Set(normalize(label).split(/[^A-Z0-9-]+/).filter((token) =>
    CODE_ALLOWLIST.has(token) || (/^[A-Z][A-Z0-9-]{2,7}$/.test(token) && !COMMON_TOKENS.has(token) && /[0-9-]/.test(token))))].slice(0, 4);
}

function distinctiveLabelPhrase(label: string) {
  return normalize(label)
    .replace(/^OTHER\s+-\s+/, "")
    .replace(/\$\s*\d[\d,.]*/g, "")
    .replace(/\b\d+(?:\.\d+)?\b/g, "")
    .replace(/\b(?:TIMES|TRANSACTIONS? AT)\b.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9$%&./'" -]+/g, " ").replace(/\s+/g, " ").trim();
}

function quote(value: string) {
  return `"${value.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim()}"`;
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
