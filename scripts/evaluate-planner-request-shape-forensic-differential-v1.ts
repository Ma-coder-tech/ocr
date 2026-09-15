import { readFileSync } from "node:fs";

import type { ShadowAiEconomicResolutionPacketV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { createSyntheticFullPlannerPacketV1 } from "../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import {
  buildMeaningfulDifferentialV1,
  reconstructForensicAnchorsV1,
  safeRequestShapeV1,
  schemaKeywordPathsV1,
} from "../src/evaluationIntegrity/plannerRequestShapeForensicDifferentialV1.js";

const HISTORICAL_PATH = "evaluations/issue-diversity-shadow-ai-economic-analyst-pilot-v1/evaluation-2026-09-15.json";
const MINIMAL_PREFLIGHT_PATH = "evaluations/openrouter-claude-structured-output-preflight-v2/preflight-2026-09-14.json";
const FULL_PREFLIGHT_PATH = "evaluations/full-planner-schema-synthetic-preflight-v2/preflight-2026-09-15.json";
const LIVE_REJECTED_PATH = "evaluations/planner-stable-schema-live-compatibility-check-v1/evaluation-2026-09-15.json";

const historical = JSON.parse(readFileSync(HISTORICAL_PATH, "utf8"));
const minimalArtifact = JSON.parse(readFileSync(MINIMAL_PREFLIGHT_PATH, "utf8"));
const fullArtifact = JSON.parse(readFileSync(FULL_PREFLIGHT_PATH, "utf8"));
const rejectedArtifact = JSON.parse(readFileSync(LIVE_REJECTED_PATH, "utf8"));
const authorization = historical.executions.find((execution: any) => execution.family === "AUTHORIZATION_ECONOMICS");
const rejectedAuthorization = rejectedArtifact.results.find((result: any) => result.family === "AUTHORIZATION_ECONOMICS");
if (!authorization || !rejectedAuthorization) throw new Error("authorization_control_anchor_missing");

const anchors = reconstructForensicAnchorsV1({
  historicalAuthorizationPacket: authorization.packet.transmitted as ShadowAiEconomicResolutionPacketV1,
  historicalSyntheticPacket: createSyntheticFullPlannerPacketV1(),
});
const shapes = {
  historicalReal: safeRequestShapeV1(anchors.historicalReal),
  historicalMinimalSynthetic: safeRequestShapeV1(anchors.historicalMinimalSynthetic),
  historicalFullSynthetic: safeRequestShapeV1(anchors.historicalFullSynthetic),
  currentRejected: safeRequestShapeV1(anchors.currentRejected),
};

assertAnchor("historical_real_body", shapes.historicalReal.compatibility.requestBodyBytes, 12_427);
assertAnchor("historical_real_sha", shapes.historicalReal.compatibility.requestBodySha256, "a152044d4115cc1b18a1e19c7c42dc4e58d50ea3f4034926ccd3333b38a18bb7");
assertAnchor("historical_real_schema", shapes.historicalReal.compatibility.providerSchemaSha256, "ec1bb57e087be8b31f73e6df7e09a94a7ac38f9a6653ee8ae07ff0f164367114");
assertAnchor("minimal_body", shapes.historicalMinimalSynthetic.compatibility.requestBodySha256, minimalArtifact.request.bodySha256);
assertAnchor("full_body", shapes.historicalFullSynthetic.compatibility.requestBodySha256, fullArtifact.request.bodySha256);
assertAnchor("current_body", shapes.currentRejected.compatibility.requestBodySha256, rejectedAuthorization.requestIntegrity.requestBodySha256);
assertAnchor("current_schema", shapes.currentRejected.compatibility.providerSchemaSha256, rejectedAuthorization.requestIntegrity.providerSchemaSha256);

const artifact = {
  schemaVersion: "planner_request_shape_forensic_differential_2026_09_15_v1",
  parent: "0b969b5647ae77749a68fdea9d9830903ba79cfb",
  branch: "codex/planner-request-shape-forensic-differential-v1",
  purpose: "OFFLINE_REQUEST_SHAPE_FORENSIC_DIFFERENTIAL_ONLY",
  conclusion: {
    code: "CURRENT_REJECTION_NOT_EXPLAINED_BY_TOP_LEVEL_TRANSPORT_OR_GENERATION_SETTINGS",
    statement: "The last accepted real authorization request and the current rejected authorization request use identical endpoint, method, safe header-name set, model, store, stream, temperature, max_tokens, message-role envelope, provider routing, response-format wrapper, strict mode, root type, root required fields, and additionalProperties policy. Material changes are Package B request-scoped aliasing and Package C provider-schema name/binding/reference constraints. Offline evidence ranks the nine-pattern schema as the strongest construct-level compatibility hypothesis but cannot prove provider causality.",
    exactProviderLimitClaimed: false,
    compatibilityFixImplemented: false,
  },
  anchors: {
    historicalAcceptedRealPlanner: anchor({
      kind: "REAL_ISSUE_GROUNDED_PLANNER",
      commit: "aa9f377de74dd447545c7a2a2b536f44a3e56bed",
      artifact: HISTORICAL_PATH,
      provider: "OpenRouter",
      requestedModel: "anthropic/claude-opus-4.6",
      httpResult: 200,
      shape: shapes.historicalReal,
      recordedTelemetry: authorization.provider.telemetry,
    }),
    historicalAcceptedMinimalSynthetic: anchor({
      kind: "MINIMAL_SYNTHETIC_STRUCTURED_OUTPUT_PREFLIGHT",
      commit: "8655fd73e5efdfdfd3acda9aaa3766e22767922e",
      artifact: MINIMAL_PREFLIGHT_PATH,
      provider: "OpenRouter",
      requestedModel: "anthropic/claude-opus-4.6",
      httpResult: 200,
      shape: shapes.historicalMinimalSynthetic,
      recordedTelemetry: minimalArtifact.telemetry,
    }),
    historicalAcceptedFullPlannerSynthetic: anchor({
      kind: "FULL_PLANNER_SYNTHETIC_STRUCTURED_OUTPUT_PREFLIGHT",
      commit: "e489730b188b0349fdf1e8f8e659ce1e12172e99",
      artifact: FULL_PREFLIGHT_PATH,
      provider: "OpenRouter",
      requestedModel: "anthropic/claude-opus-4.6",
      httpResult: 200,
      shape: shapes.historicalFullSynthetic,
      recordedTelemetry: fullArtifact.telemetry,
    }),
    currentRejectedPackageC: anchor({
      kind: "REAL_ISSUE_GROUNDED_PLANNER_STABLE_SCHEMA_CONTROL",
      commit: "0b969b5647ae77749a68fdea9d9830903ba79cfb",
      artifact: LIVE_REJECTED_PATH,
      provider: "OpenRouter",
      requestedModel: "anthropic/claude-opus-4.6",
      httpResult: 400,
      shape: shapes.currentRejected,
      recordedTelemetry: rejectedAuthorization.provider,
    }),
  },
  requestShapeDifferential: buildMeaningfulDifferentialV1(shapes.historicalReal, shapes.currentRejected),
  schemaConstructDifferential: [
    constructDiff("body.response_format.json_schema.name", "shadow_ai_economic_resolution_plan_issue_grounded_v1", "shadow_ai_economic_resolution_plan_stable_v1", "CHANGED"),
    constructDiff("schema.properties.issueId.const", "packet-specific string", null, "REMOVED"),
    constructDiff("schema.properties.issueId.pattern", null, "stable identifier regex", "NEW"),
    constructDiff("schema.properties.inputHash.const", "packet-specific 64-hex string", null, "REMOVED"),
    constructDiff("schema.properties.inputHash.pattern", "64-hex regex", "64-hex regex", "UNCHANGED"),
    constructDiff("schema.properties.exactCitedFactRefs.items.enum", "packet-specific fact references", null, "REMOVED"),
    constructDiff("schema.properties.exactCitedFactRefs.items.pattern", null, "typed FACT alias regex", "NEW"),
    constructDiff("schema.properties.primaryHypothesis.properties.supportingFactRefs.items.enum", "packet-specific support references", null, "REMOVED"),
    constructDiff("schema.properties.primaryHypothesis.properties.supportingFactRefs.items.pattern", null, "typed support-alias regex", "NEW"),
    constructDiff("schema.properties.primaryHypothesis.properties.contradictingFactRefs.items.enum", "packet-specific support references", null, "REMOVED"),
    constructDiff("schema.properties.primaryHypothesis.properties.contradictingFactRefs.items.pattern", null, "typed support-alias regex", "NEW"),
    constructDiff("schema.properties.alternativeHypotheses.items.properties.supportingFactRefs.items.enum", "packet-specific support references", null, "REMOVED"),
    constructDiff("schema.properties.alternativeHypotheses.items.properties.supportingFactRefs.items.pattern", null, "typed support-alias regex", "NEW"),
    constructDiff("schema.properties.alternativeHypotheses.items.properties.contradictingFactRefs.items.enum", "packet-specific support references", null, "REMOVED"),
    constructDiff("schema.properties.alternativeHypotheses.items.properties.contradictingFactRefs.items.pattern", null, "typed support-alias regex", "NEW"),
    constructDiff("schema.properties.reconstructionSuspicions.items.properties.exactAcceptedFactOrOccurrenceRefs.items.enum", "packet-specific support references", null, "REMOVED"),
    constructDiff("schema.properties.reconstructionSuspicions.items.properties.exactAcceptedFactOrOccurrenceRefs.items.pattern", null, "typed support-alias regex", "NEW"),
    constructDiff("schema.properties.reconstructionSuspicions.items.properties.conflictingEvidenceRefs.items.enum", "packet-specific support references", null, "REMOVED"),
    constructDiff("schema.properties.reconstructionSuspicions.items.properties.conflictingEvidenceRefs.items.pattern", null, "typed support-alias regex", "NEW"),
    constructDiff("schema.properties.requiredEvidenceClasses.items.enum", "authorization packet subset: cardinality 2", "fixed Product evidence classes: cardinality 8", "CHANGED"),
  ],
  authorizationEconomicsControlRegression: {
    issueFamily: "AUTHORIZATION_ECONOMICS",
    statementAlias: authorization.statementAlias,
    historicalHttpStatus: 200,
    currentHttpStatus: 400,
    historicalRequestBody: selectRequestIdentity(shapes.historicalReal),
    currentRequestBody: selectRequestIdentity(shapes.currentRejected),
    unchanged: [
      "endpoint", "method", "header names", "top-level body keys", "model", "store=false", "stream=false",
      "temperature=0", "max_tokens=4000", "message roles [system,user]", "system prompt bytes and SHA-256",
      "provider.allow_fallbacks=false", "provider.require_parameters=true", "response_format.type=json_schema",
      "json_schema.strict=true", "schema root type=object", "schema root required fields", "schema root additionalProperties=false",
    ],
    changed: [
      { construct: "user message content", historicalBytes: shapes.historicalReal.messageByteCounts[1], currentBytes: shapes.currentRejected.messageByteCounts[1], reason: "Package B replaces internal references with typed request-scoped opaque aliases and recomputes provider-bound input hash; envelope remains {issueContext,packet}." },
      { construct: "schema name", historical: shapes.historicalReal.schemaName, current: shapes.currentRejected.schemaName },
      { construct: "issueId constraint", historical: "packet-specific const", current: "stable identifier pattern" },
      { construct: "inputHash constraint", historical: "packet-specific const plus hexadecimal pattern", current: "hexadecimal pattern only" },
      { construct: "seven reference-list item constraints", historical: "packet-specific enum", current: "typed alias patterns" },
      { construct: "requiredEvidenceClasses", historical: "packet-specific enum subset (2 for authorization)", current: "fixed complete Product enum (8)" },
      { construct: "translated schema metrics", historical: metricSubset(shapes.historicalReal), current: metricSubset(shapes.currentRejected) },
    ],
    whyRegressionCannotBeProvenOffline: "The repository records the accepted and rejected bodies and reproduces both exactly, but the provider returned no structured output or allowlisted parameter path. Multiple schema deltas were introduced across Packages B/C and provider behavior may also have changed between live dates.",
  },
  syntheticComparison: {
    provenAcceptedIngredients: [
      "same endpoint and POST method", "same model identifier", "same three safe header names", "store=false", "stream=false",
      "temperature=0", "provider.allow_fallbacks=false", "provider.require_parameters=true", "response_format.type=json_schema",
      "strict=true", "object root", "additionalProperties=false", "const", "enum", "arrays", "minItems", "anyOf",
      "max_tokens=4000 in the full-planner synthetic anchor", "one inputHash pattern in the full-planner synthetic anchor",
    ],
    notProvenAccepted: [
      "nine-pattern stable provider schema", "typed reference-alias regexes", "stable issueId regex in combination with typed alias regexes",
      "Package C stable schema name", "current Package B provider-bound real packet combined with Package C schema",
    ],
    sizeFinding: "Request size alone is contradicted: the current rejected request is smaller than the accepted real request, and the accepted Gold-shaped synthetic lineage recorded an 18,830-byte request.",
  },
  schemaTranslationAudit: {
    translatorBehavior: "Recursively removes only minLength, maxLength, and maxItems; it retains type, properties, required, additionalProperties, const, enum, pattern, arrays, minItems, and anyOf.",
    removedInBothHistoricalAndCurrent: ["minLength", "maxLength", "maxItems"],
    retainedInBoth: ["type", "properties", "required", "additionalProperties", "const", "enum", "arrays", "minItems", "anyOf", "pattern"],
    historicalKeywordPaths: materialSchemaKeywordPaths(anchors.historicalReal.providerSchema),
    currentKeywordPaths: materialSchemaKeywordPaths(anchors.currentRejected.providerSchema),
    materialChanges: [
      "pattern count increased from 1 to 9",
      "enum nodes decreased from 12 to 5; packet-specific reference enums were removed",
      "const count decreased from 15 to 13; issueId and inputHash request-binding consts moved to deterministic local validation",
      "schema depth decreased from 8 to 7 while node count remained 76",
      "required fields, object closure, array-schema count, minItems count, and anyOf count are unchanged",
      "fixed requiredEvidenceClasses enum is broader than the historical authorization-specific subset",
    ],
    unsupportedKeywordFinding: "No repository evidence proves that any retained keyword is categorically unsupported. The newly repeated pattern construct is a compatibility hypothesis, not a finding of an exact provider restriction.",
  },
  failureLayerClassification: {
    A_OPENROUTER_REQUEST_LEVEL: {
      observed: true,
      evidence: "OpenRouter returned HTTP 400 before structured output with MALFORMED_REQUEST / REQUEST_PARAMETER_REJECTED / invalid_request_error.",
      candidateDifferences: ["schema name", "translated schema constructs", "message/provider-packet content"],
    },
    B_ROUTED_ANTHROPIC_STRUCTURED_OUTPUT: {
      observed: false,
      evidence: "No model output or returned model identity was available; a routed provider may have rejected response_format before generation, but that layer is not distinguishable from the safe response.",
      candidateDifferences: ["nine pattern nodes", "typed alias regex syntax", "strict-mode interaction with stable patterns"],
    },
    C_LOCAL_CONSTRUCTION_TRANSLATION: {
      observed: true,
      evidence: "Local code deterministically constructed a different schema/body and the hashes reproduce repository evidence exactly; local validators passed before transport.",
      candidateDifferences: ["Package B alias projection", "Package C stable schema", "translator intentionally retains pattern"],
    },
  },
  safeErrorTelemetryAudit: {
    currentResult: {
      safeErrorType: rejectedAuthorization.provider.safeErrorType,
      safeErrorCode: rejectedAuthorization.provider.safeErrorCode,
      safeErrorParameter: rejectedAuthorization.provider.safeErrorParameter,
      providerSafeErrorCode: rejectedAuthorization.provider.providerSafeErrorCode,
      providerDiagnosticSource: rejectedAuthorization.provider.providerDiagnosticSource,
    },
    parsingFinding: "The runtime parses nested error.metadata.raw JSON and inspects nested error.type/code/param/parameter/message, but safeProviderParameter retains only exact allowlisted roots. A more specific dotted or JSON-pointer parameter path is discarded rather than normalized.",
    usefulMachineFieldCurrentlyMayBeDiscarded: true,
    cannotRecoverFromCommittedEvidence: true,
    reason: "The committed safe artifact has null parameter and no raw response. The exact discarded value, if one existed, is intentionally unavailable post hoc.",
    candidateNarrowImprovement: "In a separate package, allow a bounded syntax-validated parameter path rooted only at response_format, model, messages, provider, max_tokens, temperature, store, or stream; retain normalized root plus safe schema-keyword class while discarding property/literal values. Add redaction fixtures before any live use.",
    implementedHere: false,
  },
  rankedHypotheses: [
    hypothesis(1, "REPEATED_PATTERN_CONSTRUCT_COMPATIBILITY", "Current schema has nine pattern nodes versus one in both accepted real and accepted full-planner synthetic requests; seven patterns constrain typed reference aliases and one newly constrains issueId.",
      "It is the largest newly introduced schema-keyword-class delta and affects the formerly successful authorization control.",
      "JSON Schema pattern is structurally valid, and one pattern was previously accepted; repository evidence does not prove a pattern count or regex-feature limit.",
      "Not falsifiable offline because local translation/validation accepts it.",
      "After exact accepted controls, send one synthetic full-planner request changing only the seven reference item constraints from historical enums to the current typed patterns."),
    hypothesis(2, "SCHEMA_NAME_OR_SCHEMA_VERSION_BINDING", "Schema name changed from shadow_ai_economic_resolution_plan_issue_grounded_v1 to shadow_ai_economic_resolution_plan_stable_v1.",
      "The name is part of response_format and therefore request-level validation.",
      "Both names are syntax-safe and multiple historical names were accepted; name alone does not explain the construct-focused error.",
      "Offline syntax checks eliminate malformed-character and length concerns, not provider semantics.",
      "Only if pattern isolation succeeds, change the accepted synthetic full-planner schema name alone to the stable name."),
    hypothesis(3, "STRICT_SCHEMA_COMBINATION_AFTER_CONST_TO_PATTERN", "IssueId/inputHash request-binding consts were removed from provider schema and issueId became a pattern under strict=true.",
      "Provider structured-output validators may reject a valid local combination even when individual keywords are supported.",
      "Strict mode, const, and the inputHash pattern were accepted before; local schema remains deterministic and closed.",
      "Offline comparison identifies the exact delta but cannot emulate routed Anthropic validation.",
      "Use synthetic data and change only issueId const to the current issueId pattern after reference-pattern testing."),
    hypothesis(4, "PROVIDER_PACKET_ALIAS_CONTENT_INTERACTION", "Package B changes raw internal references to request-scoped typed aliases and changes the provider-bound input hash/user message.",
      "It affects the control request and is the only major message-content delta.",
      "Ordinary message strings should not cause request-parameter rejection; privacy aliases passed all local validators and contain no unsupported top-level parameter.",
      "Offline validation eliminates malformed JSON, envelope, reference-class, and binding errors.",
      "A synthetic request with the accepted schema and only alias-shaped synthetic reference values would isolate content from schema."),
    hypothesis(5, "PROVIDER_OR_ROUTE_BEHAVIOR_DRIFT", "A previously accepted control now fails despite identical transport/generation/routing parameters.",
      "All four current requests failed uniformly, including the control, and no returned model was recorded.",
      "This is vague and not tied to a repository request delta; accepted historical evidence cannot establish present service behavior.",
      "Not falsifiable offline.",
      "First replay the exact minimal accepted synthetic request, then the exact full-planner synthetic request, with zero retries."),
    hypothesis(6, "REQUEST_SIZE_OR_TOP_LEVEL_PARAMETER", "Request size or a top-level parameter was rejected.",
      "HTTP 400 classification is request-level.",
      "Eliminated as a material request-shape delta: top-level keys and values are unchanged, and the rejected request is smaller than accepted planner-shaped requests.",
      "Eliminated offline for the recorded shapes, except for unobserved provider policy drift.",
      "No size-specific live test recommended before higher-ranked controls."),
  ],
  eliminatedOffline: [
    "endpoint change", "HTTP method change", "header-name change", "model identifier change", "store change", "stream change",
    "temperature change", "max_tokens change for the real control", "provider routing object change", "fallback setting change",
    "require_parameters change", "response-format wrapper type change", "strict-mode change", "root schema type change",
    "root required-field change", "root additionalProperties change", "malformed JSON serialization", "request size growth as the recorded control regression mechanism",
  ],
  minimalFutureLiveExperiment: {
    authorizedNow: false,
    data: "synthetic only; no merchant or Gold data",
    route: "OpenRouter / anthropic/claude-opus-4.6",
    retriesPerCall: 0,
    orderedCalls: [
      { ordinal: 1, request: "byte-exact previously accepted minimal synthetic preflight", purpose: "current transport/model/account control" },
      { ordinal: 2, condition: "only if call 1 succeeds", request: "byte-exact previously accepted full-planner synthetic request", purpose: "current acceptance of historical planner schema" },
      { ordinal: 3, condition: "only if call 2 succeeds", request: "same full-planner synthetic request with only the reference-item constraint family changed from packet-specific enums to typed alias patterns", purpose: "isolate dominant repeated-pattern hypothesis" },
    ],
    expectedProviderCalls: "1 to 3, conditionally; stop immediately on the first failed control",
    deferredFollowUps: "Schema name, issueId const-to-pattern, and alias-shaped content must each be isolated in later separately authorized calls only if the three-call sequence leaves them unresolved.",
  },
  architecture: {
    conflictFound: false,
    packageBPrivacyPreserved: true,
    packageCStabilityPreserved: true,
    recommendedDirection: "Retain Packages B/C and improve observability/compatibility evidence incrementally; do not revert privacy containment or stable-schema architecture based on an undifferentiated HTTP 400.",
  },
  executionBoundary: {
    offlineOnly: true, providerCalls: 0, networkCalls: 0, retries: 0, fallbacks: 0, webSearches: 0,
    researchOperations: 0, evidenceAdmissions: 0, truthMutations: 0, customerOutputs: 0,
    productionRoutingChanges: 0, plannerChanges: 0, providerRequestBehaviorChanges: 0,
  },
  contentBoundary: {
    apiKeysStored: false, authorizationHeaderValuesStored: false, rawRequestBodiesStored: false,
    rawProviderResponsesStored: false, merchantPayloadValuesStored: false, rawInternalReferencesStored: false,
    sourceFilenamesStoredInOutboundShape: false, canonicalShapesContainOnlySafeSettingsMetricsHashesAndRepositoryEvidenceLabels: true,
  },
};

const output = JSON.stringify(artifact, null, 2);
const prohibited = [
  authorization.packet.transmitted.merchantBusinessContext?.businessName,
  ...authorization.packet.transmitted.sanitizedFeeLabels,
  ...authorization.packet.transmitted.acceptedFactRefs,
  ...authorization.packet.transmitted.currentGovernedEvidenceRefs,
  ...authorization.packet.transmitted.selectedRdChargeRefs,
  ...authorization.packet.transmitted.acceptedIssueRelevantActivityFacts.flatMap((fact: any) => [fact.factRef, ...fact.evidenceRefs]),
].filter((value): value is string => typeof value === "string" && value.length > 0);
if (prohibited.some((value) => output.includes(value))) throw new Error("forensic_artifact_merchant_or_internal_reference_leak");
if (/Bearer\s|sk-or-v1-|authorization.*offline-placeholder/i.test(output)) throw new Error("forensic_artifact_secret_material_leak");
console.log(output);

function anchor(input: any) {
  return {
    kind: input.kind,
    source: { commit: input.commit, artifact: input.artifact },
    provider: input.provider,
    requestedModel: input.requestedModel,
    endpoint: input.shape.endpoint,
    method: input.shape.method,
    httpResult: input.httpResult,
    requestBodyBytes: input.shape.compatibility.requestBodyBytes,
    requestBodySha256: input.shape.compatibility.requestBodySha256,
    providerSchemaBytes: input.shape.compatibility.providerSchemaBytes,
    providerSchemaSha256: input.shape.compatibility.providerSchemaSha256,
    generationSettings: { temperature: input.shape.temperature, maxTokens: input.shape.maximumOutputTokens },
    transportSettings: { store: input.shape.store, stream: input.shape.stream, messageRoles: input.shape.messageRoles },
    responseFormat: { type: input.shape.responseFormatType, schemaName: input.shape.schemaName, strict: input.shape.strict },
    providerRouting: input.shape.provider,
    safeHeaderNames: input.shape.headerNames,
    compatibilityMetrics: metricSubset(input.shape),
    reconstructedBodyMatchesRecordedArtifact: true,
  };
}

function selectRequestIdentity(shape: any) {
  return {
    bytes: shape.compatibility.requestBodyBytes,
    sha256: shape.compatibility.requestBodySha256,
    providerSchemaBytes: shape.compatibility.providerSchemaBytes,
    providerSchemaSha256: shape.compatibility.providerSchemaSha256,
  };
}

function metricSubset(shape: any) {
  const value = shape.compatibility;
  return {
    schemaDepth: value.schemaDepth, schemaNodeCount: value.schemaNodeCount, propertyDefinitionCount: value.propertyDefinitionCount,
    requiredFieldLiteralCount: value.requiredFieldLiteralCount, enumNodeCount: value.enumNodeCount,
    maximumEnumCardinality: value.maximumEnumCardinality, totalEnumLiteralCount: value.totalEnumLiteralCount,
    totalEnumLiteralBytes: value.totalEnumLiteralBytes, constCount: value.constCount,
    arraySchemaNodeCount: value.arraySchemaNodeCount, minimumItemsConstraintCount: value.minimumItemsConstraintCount,
    maximumItemsConstraintCount: value.maximumItemsConstraintCount, anyOfCount: value.anyOfCount,
    oneOfCount: value.oneOfCount, allOfCount: value.allOfCount, patternCount: value.patternCount,
    minimumLengthConstraintCount: value.minimumLengthConstraintCount, maximumLengthConstraintCount: value.maximumLengthConstraintCount,
  };
}

function hypothesis(rank: number, code: string, construct: string, supporting: string, against: string, offline: string, live: string) {
  return { rank, code, exactDifferingConstruct: construct, whyItCouldExplainHttp400: supporting, evidenceSupporting: supporting, evidenceAgainst: against,
    affectsHistoricalAuthorizationControl: true,
    offlineFalsification: offline, smallestFutureLiveTest: live };
}

function constructDiff(path: string, historicalAccepted: unknown, currentRejected: unknown, changeType: "UNCHANGED" | "CHANGED" | "NEW" | "REMOVED") {
  return { path, historicalAccepted, currentRejected, changeType, privacySafe: true,
    potentialFailureLayer: path.startsWith("body.") ? "A_OR_B" : "B_OR_C",
    evidenceSource: "exact offline reconstruction of accepted aa9f377 and rejected 0b969b5 bodies" };
}

function materialSchemaKeywordPaths(schema: unknown) {
  const paths = schemaKeywordPathsV1(schema);
  return {
    const: paths.const ?? [],
    enum: paths.enum ?? [],
    pattern: paths.pattern ?? [],
    counts: Object.fromEntries(Object.entries(paths).map(([keyword, values]) => [keyword, values.length])),
  };
}

function assertAnchor(name: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`${name}_mismatch:${String(actual)}:${String(expected)}`);
}
