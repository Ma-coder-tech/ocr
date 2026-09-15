import { evaluateGoldPlannerSourceReferenceContainmentOfflineV1 } from "./validate-gold-planner-source-reference-containment-v1.js";
import { STABLE_PROVIDER_FACING_PLANNER_SCHEMA_VERSION_V1 } from "../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";

const evaluated = await evaluateGoldPlannerSourceReferenceContainmentOfflineV1();
const issues = evaluated.statements.flatMap((statement: any) => statement.issueResults);
const schemaHashes = new Set(issues.map((issue: any) => issue.compatibilityMetrics.providerSchemaSha256));
const schemaBytes = new Set(issues.map((issue: any) => issue.compatibilityMetrics.providerSchemaBytes));
const metricSignatures = new Set(issues.map((issue: any) => JSON.stringify({
  providerSchemaBytes: issue.compatibilityMetrics.providerSchemaBytes,
  schemaDepth: issue.compatibilityMetrics.schemaDepth,
  schemaNodeCount: issue.compatibilityMetrics.schemaNodeCount,
  enumNodeCount: issue.compatibilityMetrics.enumNodeCount,
  maximumEnumCardinality: issue.compatibilityMetrics.maximumEnumCardinality,
  totalEnumLiteralCount: issue.compatibilityMetrics.totalEnumLiteralCount,
  totalEnumLiteralBytes: issue.compatibilityMetrics.totalEnumLiteralBytes,
  constCount: issue.compatibilityMetrics.constCount,
  arraySchemaNodeCount: issue.compatibilityMetrics.arraySchemaNodeCount,
})));
const requestBytes = issues.map((issue: any) => issue.compatibilityMetrics.requestBodyBytes);
const exactSemanticInvarianceCount = issues.filter((issue: any) => issue.validation.exactReferenceRoundTrip
  && issue.validation.acceptedPlannerValidation).length;

if (evaluated.statementCount !== 11 || issues.length !== 60 || schemaHashes.size !== 1 || schemaBytes.size !== 1
  || metricSignatures.size !== 1 || exactSemanticInvarianceCount !== issues.length) {
  throw new Error("gold_stable_provider_schema_validation_failed");
}

const artifact = {
  schemaVersion: "gold_planner_stable_provider_facing_schema_offline_validation_2026_09_15_v1",
  providerSchemaVersion: STABLE_PROVIDER_FACING_PLANNER_SCHEMA_VERSION_V1,
  baselineCommit: "95894841a9cb09487bbcfd26565a35ea2e1f3761",
  providerCalls: 0,
  statementCount: evaluated.statementCount,
  issueCount: issues.length,
  issueClassDistribution: evaluated.issueClassDistribution,
  statements: evaluated.statements.map((statement: any) => ({
    statementAlias: statement.statementAlias,
    issueCount: statement.issueCount,
    issueClasses: statement.issueClasses,
    allSchemasStable: statement.issueResults.every((issue: any) => issue.compatibilityMetrics.providerSchemaSha256 === issues[0]!.compatibilityMetrics.providerSchemaSha256),
    exactGroundingCount: statement.issueResults.filter((issue: any) => issue.validation.exactReferenceRoundTrip).length,
    acceptedPlannerValidationCount: statement.issueResults.filter((issue: any) => issue.validation.acceptedPlannerValidation).length,
    invariance: statement.invariance,
  })),
  stableSchema: {
    identicalProviderSchemaAcrossAllIssues: true,
    uniqueProviderSchemaShaCount: schemaHashes.size,
    uniqueProviderSchemaByteCount: schemaBytes.size,
    uniqueStructuralMetricSignatureCount: metricSignatures.size,
    providerSchemaBytes: issues[0]!.compatibilityMetrics.providerSchemaBytes,
    providerSchemaSha256: issues[0]!.compatibilityMetrics.providerSchemaSha256,
    schemaDepth: issues[0]!.compatibilityMetrics.schemaDepth,
    schemaNodeCount: issues[0]!.compatibilityMetrics.schemaNodeCount,
    enumNodeCount: issues[0]!.compatibilityMetrics.enumNodeCount,
    maximumEnumCardinality: issues[0]!.compatibilityMetrics.maximumEnumCardinality,
    totalEnumLiteralCount: issues[0]!.compatibilityMetrics.totalEnumLiteralCount,
    totalEnumLiteralBytes: issues[0]!.compatibilityMetrics.totalEnumLiteralBytes,
    constCount: issues[0]!.compatibilityMetrics.constCount,
    arraySchemaNodeCount: issues[0]!.compatibilityMetrics.arraySchemaNodeCount,
    packetSpecificReferenceEnumCount: 0,
  },
  requestBodyBytes: { minimum: Math.min(...requestBytes), maximum: Math.max(...requestBytes) },
  grounding: {
    providerPacketReferenceOnlyDiffCount: evaluated.aggregate.providerPacketReferenceOnlyDiffCount,
    exactReferenceRoundTripCount: evaluated.aggregate.exactReferenceRoundTripCount,
    acceptedPlannerValidationCount: evaluated.aggregate.acceptedPlannerValidationCount,
    plannerSemanticInvarianceCount: exactSemanticInvarianceCount,
  },
  privacy: {
    rawInternalReferenceLeakageCount: evaluated.aggregate.rawInternalReferenceLeakageCount,
    sourceIdentityLeakageCount: evaluated.aggregate.sourceIdentityLeakageCount,
    reverseMapMaterialLeakageCount: evaluated.aggregate.reverseMapMaterialLeakageCount,
    reverseMapSerializedCount: evaluated.aggregate.reverseMapSerializedCount,
    unknownAliasAcceptanceCount: evaluated.aggregate.unknownAliasAcceptanceCount,
    classConfusionAcceptanceCount: evaluated.aggregate.classConfusionAcceptanceCount,
    rawReferenceAcceptanceCount: evaluated.aggregate.rawReferenceAcceptanceCount,
  },
  invariance: evaluated.invariance,
  executionBoundary: evaluated.executionBoundary,
  liveCompatibilityClaims: { openRouterFixed: false, anthropicAcceptanceProven: false, historicalHttp400Solved: false, providerLimitClaimed: false },
};

if (Object.values(artifact.privacy).some((value) => value !== 0)
  || Object.values(artifact.invariance).filter((value) => typeof value === "string" && /^\d+\/11$/.test(value)).some((value) => value !== "11/11")
  || !artifact.invariance.commercialSourceUnchanged || artifact.executionBoundary.providerCalls !== 0) {
  throw new Error("gold_stable_provider_schema_safety_or_invariance_failed");
}
console.log(JSON.stringify(artifact, null, 2));
