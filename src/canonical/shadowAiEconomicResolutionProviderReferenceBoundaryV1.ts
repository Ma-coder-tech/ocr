import { createHash } from "node:crypto";

import { canonicalJson } from "./v2/canonicalJson.js";
import { inspectShadowAiEconomicResolutionPacketPrivacyV1 } from "./shadowAiEconomicResolutionIssueSelectionV1.js";
import type { ShadowAiEconomicResolutionPacketV1 } from "./shadowAiEconomicResolutionPlannerTypesV1.js";

export const SHADOW_AI_PROVIDER_REFERENCE_BOUNDARY_SCHEMA_VERSION_V1 =
  "shadow_ai_provider_reference_boundary_2026_09_15_v1" as const;

export const SHADOW_AI_PROVIDER_REFERENCE_CLASSES_V1 = Object.freeze([
  "FACT",
  "STATEMENT_EVIDENCE",
  "GOVERNED_EVIDENCE",
  "ECONOMIC_CHARGE",
] as const);

export type ShadowAiProviderReferenceClassV1 = typeof SHADOW_AI_PROVIDER_REFERENCE_CLASSES_V1[number];

export type ShadowAiProviderReferenceMapEntryV1 = Readonly<{
  alias: string;
  referenceClass: ShadowAiProviderReferenceClassV1;
  internalReference: string;
}>;

export type ShadowAiProviderReferenceMapV1 = Readonly<{
  schemaVersion: typeof SHADOW_AI_PROVIDER_REFERENCE_BOUNDARY_SCHEMA_VERSION_V1;
  scopeToken: string;
  issueId: string;
  internalInputHash: string;
  providerInputHash: string;
  entries: readonly ShadowAiProviderReferenceMapEntryV1[];
}>;

export type ShadowAiProviderReferenceBoundaryV1 = Readonly<{
  providerPacket: ShadowAiEconomicResolutionPacketV1;
  referenceMap: ShadowAiProviderReferenceMapV1;
}>;

export type ShadowAiProviderReferenceBoundaryInspectionV1 = Readonly<{
  valid: boolean;
  reasonCodes: readonly string[];
  aliasCounts: Readonly<Record<ShadowAiProviderReferenceClassV1, number>>;
  rawInternalReferenceLeakageCount: number;
  rawReverseMapMaterialCount: number;
  sourceIdentityLeakageCount: number;
  unknownAliasCount: number;
  wrongClassAliasCount: number;
  malformedAliasCount: number;
  crossPacketAliasCount: number;
  collisionCount: number;
}>;

export type ShadowAiProviderReferenceRestoreResultV1 =
  | Readonly<{
      ok: true;
      output: unknown;
      errorCodes: readonly [];
      restoredReferenceCount: number;
    }>
  | Readonly<{
      ok: false;
      output: null;
      errorCodes: readonly string[];
      restoredReferenceCount: 0;
    }>;

const CLASS_CODE: Readonly<Record<ShadowAiProviderReferenceClassV1, string>> = Object.freeze({
  FACT: "f",
  STATEMENT_EVIDENCE: "s",
  GOVERNED_EVIDENCE: "g",
  ECONOMIC_CHARGE: "c",
});

const CODE_CLASS: Readonly<Record<string, ShadowAiProviderReferenceClassV1>> = Object.freeze(
  Object.fromEntries(Object.entries(CLASS_CODE).map(([referenceClass, code]) => [code, referenceClass])) as Record<string, ShadowAiProviderReferenceClassV1>,
);

const ALIAS_PATTERN = /^prv_([a-f0-9]{10})_([fsgc])_([0-9]{4})$/;
const ALIAS_TOKEN_IN_TEXT = /\bprv_[a-f0-9]{10}_[fsgc]_[0-9]{4}\b/g;
const SOURCE_IDENTITY = /(?:\/Users\/|\/private\/|[A-Za-z]:\\|\b\S+\.(?:pdf|md|markdown|csv|xlsx?|docx?|txt|json|ya?ml|xml|html?|png|jpe?g|tiff?)(?:#[^\s"']*)?\b|\bdocument-ir:|\bpdfjs-line-|\bsrcocc_)/i;
const RAW_INTERNAL_REFERENCE = /^(?:fact_v2_|accepted_profile_fact:|economic_charge_|document-ir:|evidence_v2_|ev_|srcocc_|OWD-|RR-|[a-f0-9]{64}$)/i;
const RAW_INTERNAL_REFERENCE_NAMESPACE = /(?:\bfact_v2_|accepted_profile_fact:|economic_charge_|document-ir:|evidence_v2_|\bev_|srcocc_|\bOWD-|\bRR-)/i;
const REVERSE_MAP_KEY = /^(?:referenceMap|reverseMap|internalReference|internalInputHash|entries|scopeToken)$/i;
const CLEAR_BUSINESS_ENTITY_MARKER = /\b(?:LLC|INC|CORP|COMPANY|CO\.?|RESTAURANT|CAFE|SHOP|STORE|MARKET|SERVICES?|SYSTEMS?|GROUP|PARTNERS?|FOUNDATION|ASSOCIATION|TACOS)\b/i;

export function compileShadowAiProviderReferenceBoundaryV1(
  packet: ShadowAiEconomicResolutionPacketV1,
): ShadowAiProviderReferenceBoundaryV1 {
  const internalPrivacy = inspectShadowAiEconomicResolutionPacketPrivacyV1(packet);
  if (!internalPrivacy.valid) throw new Error(`shadow_planner_internal_packet_privacy_invalid:${internalPrivacy.reasonCodes.join(",")}`);
  const businessContext = packet.merchantBusinessContext;
  if (businessContext?.businessName && businessContext.naturalPersonOrSoleProprietorAmbiguity === "POSSIBLE"
    && !/^Opaque Business(?:\s+[A-Za-z0-9_-]+)?$/i.test(businessContext.businessName)
    && !CLEAR_BUSINESS_ENTITY_MARKER.test(businessContext.businessName)) {
    throw new Error("shadow_planner_provider_possible_natural_person_name_unsuppressed");
  }

  const scopeToken = requestScopeToken(packet);
  const entries = buildEntries(packet, scopeToken);
  assertReferenceMapEntries(entries, scopeToken);
  const aliases = new Map(entries.map((entry) => [`${entry.referenceClass}\u0000${entry.internalReference}`, entry.alias] as const));
  const alias = (referenceClass: ShadowAiProviderReferenceClassV1, internalReference: string): string => {
    const resolved = aliases.get(`${referenceClass}\u0000${internalReference}`);
    if (!resolved) throw new Error(`shadow_planner_provider_alias_missing:${referenceClass}`);
    return resolved;
  };

  const packetWithoutHash: Record<string, unknown> = {
    ...deepClone(packet),
    acceptedIssueRelevantActivityFacts: packet.acceptedIssueRelevantActivityFacts.map((fact) => ({
      ...deepClone(fact),
      factRef: alias("FACT", fact.factRef),
      evidenceRefs: fact.evidenceRefs.map((reference) => alias("STATEMENT_EVIDENCE", reference)),
    })),
    selectedRdChargeRefs: packet.selectedRdChargeRefs.map((reference) => alias("ECONOMIC_CHARGE", reference)),
    acceptedParticipantControlStates: packet.acceptedParticipantControlStates.map((state) => ({
      ...deepClone(state),
      rdChargeRef: alias("ECONOMIC_CHARGE", state.rdChargeRef),
    })),
    acceptedFactRefs: packet.acceptedFactRefs.map((reference) => alias("FACT", reference)),
    currentGovernedEvidenceRefs: packet.currentGovernedEvidenceRefs.map((reference) => alias("GOVERNED_EVIDENCE", reference)),
  };
  delete packetWithoutHash.immutableInputHash;
  const providerInputHash = sha256(canonicalJson(packetWithoutHash));
  const providerPacket = deepFreeze({ ...packetWithoutHash, immutableInputHash: providerInputHash }) as unknown as ShadowAiEconomicResolutionPacketV1;
  const referenceMap = deepFreeze({
    schemaVersion: SHADOW_AI_PROVIDER_REFERENCE_BOUNDARY_SCHEMA_VERSION_V1,
    scopeToken,
    issueId: packet.issueId,
    internalInputHash: packet.immutableInputHash,
    providerInputHash,
    entries,
  });
  const inspection = inspectShadowAiProviderReferenceBoundaryV1(providerPacket, referenceMap);
  if (!inspection.valid) throw new Error(`shadow_planner_provider_reference_boundary_invalid:${inspection.reasonCodes.join(",")}`);
  if (!providerPacketDiffLimitedToReferenceContainmentV1(packet, providerPacket, referenceMap)) {
    throw new Error("shadow_planner_provider_packet_non_reference_change_detected");
  }
  return deepFreeze({ providerPacket, referenceMap });
}

export function providerPacketDiffLimitedToReferenceContainmentV1(
  internalPacket: ShadowAiEconomicResolutionPacketV1,
  providerPacket: ShadowAiEconomicResolutionPacketV1,
  referenceMap: ShadowAiProviderReferenceMapV1,
): boolean {
  const restored = deepClone(providerPacket) as Record<string, any>;
  const byAlias = new Map(referenceMap.entries.map((entry) => [entry.alias, entry] as const));
  const restore = (value: string, expectedClass: ShadowAiProviderReferenceClassV1): string | null => {
    const entry = byAlias.get(value);
    return entry?.referenceClass === expectedClass ? entry.internalReference : null;
  };
  try {
    restored.acceptedIssueRelevantActivityFacts = restored.acceptedIssueRelevantActivityFacts.map((fact: Record<string, any>) => ({
      ...fact,
      factRef: requiredRestored(restore(fact.factRef, "FACT")),
      evidenceRefs: fact.evidenceRefs.map((value: string) => requiredRestored(restore(value, "STATEMENT_EVIDENCE"))),
    }));
    restored.selectedRdChargeRefs = restored.selectedRdChargeRefs.map((value: string) => requiredRestored(restore(value, "ECONOMIC_CHARGE")));
    restored.acceptedParticipantControlStates = restored.acceptedParticipantControlStates.map((state: Record<string, any>) => ({
      ...state,
      rdChargeRef: requiredRestored(restore(state.rdChargeRef, "ECONOMIC_CHARGE")),
    }));
    restored.acceptedFactRefs = restored.acceptedFactRefs.map((value: string) => requiredRestored(restore(value, "FACT")));
    restored.currentGovernedEvidenceRefs = restored.currentGovernedEvidenceRefs.map((value: string) => requiredRestored(restore(value, "GOVERNED_EVIDENCE")));
    restored.immutableInputHash = referenceMap.internalInputHash;
  } catch {
    return false;
  }
  return canonicalJson(restored) === canonicalJson(internalPacket);
}

export function inspectShadowAiProviderReferenceBoundaryV1(
  providerPacket: ShadowAiEconomicResolutionPacketV1,
  referenceMap: ShadowAiProviderReferenceMapV1,
): ShadowAiProviderReferenceBoundaryInspectionV1 {
  const reasons: string[] = [];
  const counters = emptyCounters();
  const mapInspection = inspectReferenceMap(referenceMap);
  counters.collisionCount += mapInspection.collisionCount;
  reasons.push(...mapInspection.reasonCodes);
  if (providerPacket.issueId !== referenceMap.issueId || providerPacket.immutableInputHash !== referenceMap.providerInputHash) {
    reasons.push("shadow_planner_provider_packet_map_binding_invalid");
  }
  const { immutableInputHash: _ignored, ...withoutHash } = providerPacket;
  if (sha256(canonicalJson(withoutHash)) !== providerPacket.immutableInputHash) reasons.push("shadow_planner_provider_packet_hash_invalid");

  const byAlias = new Map(referenceMap.entries.map((entry) => [entry.alias, entry] as const));
  const inspectAlias = (value: string, expectedClass: ShadowAiProviderReferenceClassV1): void => {
    const finding = classifyAlias(value, expectedClass, referenceMap, byAlias);
    counters.unknownAliasCount += finding === "UNKNOWN" ? 1 : 0;
    counters.wrongClassAliasCount += finding === "WRONG_CLASS" ? 1 : 0;
    counters.malformedAliasCount += finding === "MALFORMED" ? 1 : 0;
    counters.crossPacketAliasCount += finding === "CROSS_PACKET" ? 1 : 0;
    if (finding !== "VALID") reasons.push(`shadow_planner_provider_packet_alias_${finding.toLowerCase()}`);
  };
  for (const fact of providerPacket.acceptedIssueRelevantActivityFacts) {
    inspectAlias(fact.factRef, "FACT");
    fact.evidenceRefs.forEach((value) => inspectAlias(value, "STATEMENT_EVIDENCE"));
  }
  providerPacket.selectedRdChargeRefs.forEach((value) => inspectAlias(value, "ECONOMIC_CHARGE"));
  providerPacket.acceptedParticipantControlStates.forEach((state) => inspectAlias(state.rdChargeRef, "ECONOMIC_CHARGE"));
  providerPacket.acceptedFactRefs.forEach((value) => inspectAlias(value, "FACT"));
  providerPacket.currentGovernedEvidenceRefs.forEach((value) => inspectAlias(value, "GOVERNED_EVIDENCE"));

  inspectOutboundValue(providerPacket, referenceMap, counters, reasons);
  const aliasCounts = countAliases(referenceMap.entries);
  return deepFreeze({
    valid: reasons.length === 0,
    reasonCodes: unique(reasons).sort(),
    aliasCounts,
    rawInternalReferenceLeakageCount: counters.rawInternalReferenceLeakageCount,
    rawReverseMapMaterialCount: counters.rawReverseMapMaterialCount,
    sourceIdentityLeakageCount: counters.sourceIdentityLeakageCount,
    unknownAliasCount: counters.unknownAliasCount,
    wrongClassAliasCount: counters.wrongClassAliasCount,
    malformedAliasCount: counters.malformedAliasCount,
    crossPacketAliasCount: counters.crossPacketAliasCount,
    collisionCount: counters.collisionCount,
  });
}

export function inspectShadowAiProviderBoundRequestPrivacyV1(
  requestBody: string,
  referenceMap: ShadowAiProviderReferenceMapV1,
): ShadowAiProviderReferenceBoundaryInspectionV1 {
  const reasons: string[] = [];
  const counters = emptyCounters();
  let parsed: unknown;
  try {
    parsed = JSON.parse(requestBody);
  } catch {
    reasons.push("shadow_planner_provider_request_json_invalid");
    return inspectionResult(reasons, counters, referenceMap.entries);
  }
  inspectOutboundValue(parsed, referenceMap, counters, reasons);
  return inspectionResult(reasons, counters, referenceMap.entries);
}

export function restoreShadowAiProviderReferencesV1(
  providerOutput: unknown,
  referenceMap: ShadowAiProviderReferenceMapV1 | null | undefined,
): ShadowAiProviderReferenceRestoreResultV1 {
  if (!referenceMap) {
    return deepFreeze({ ok: false as const, output: null, errorCodes: ["shadow_planner_provider_reference_map_missing"], restoredReferenceCount: 0 as const });
  }
  const mapInspection = inspectReferenceMap(referenceMap);
  if (mapInspection.reasonCodes.length > 0) {
    return deepFreeze({ ok: false as const, output: null, errorCodes: unique(mapInspection.reasonCodes).sort(), restoredReferenceCount: 0 as const });
  }
  if (!isRecord(providerOutput)) {
    return deepFreeze({ ok: false as const, output: null, errorCodes: ["shadow_planner_provider_output_not_object"], restoredReferenceCount: 0 as const });
  }
  const issueIdentityKeys = Object.keys(providerOutput).filter((key) => key.replace(/[^a-z0-9]/gi, "").toLowerCase() === "issueid");
  if (issueIdentityKeys.length !== 1 || issueIdentityKeys[0] !== "issueId") {
    return deepFreeze({ ok: false as const, output: null, errorCodes: ["shadow_planner_provider_output_binding_invalid"], restoredReferenceCount: 0 as const });
  }
  const rawLeakReasons: string[] = [];
  inspectProviderOutputForRawReferences(providerOutput, referenceMap, new Set(referenceMap.entries.map((entry) => entry.internalReference)), rawLeakReasons);
  if (rawLeakReasons.length > 0) {
    return deepFreeze({ ok: false as const, output: null, errorCodes: unique(rawLeakReasons).sort(), restoredReferenceCount: 0 as const });
  }
  if (providerOutput.issueId !== referenceMap.issueId || providerOutput.inputHash !== referenceMap.providerInputHash) {
    return deepFreeze({ ok: false as const, output: null, errorCodes: ["shadow_planner_provider_output_binding_invalid"], restoredReferenceCount: 0 as const });
  }

  const output = deepClone(providerOutput) as Record<string, any>;
  const byAlias = new Map(referenceMap.entries.map((entry) => [entry.alias, entry] as const));
  const errors: string[] = [];
  let restoredReferenceCount = 0;
  const restoreList = (owner: Record<string, any>, key: string, allowedClasses: readonly ShadowAiProviderReferenceClassV1[]): void => {
    const value = owner[key];
    if (!Array.isArray(value)) return;
    if (new Set(value).size !== value.length) errors.push("shadow_planner_provider_reference_alias_duplicate");
    const restored: string[] = [];
    for (const candidate of value) {
      if (typeof candidate !== "string") {
        errors.push("shadow_planner_provider_reference_alias_malformed");
        continue;
      }
      const entry = byAlias.get(candidate);
      const match = ALIAS_PATTERN.exec(candidate);
      if (!match) {
        errors.push("shadow_planner_provider_reference_alias_malformed");
      } else if (match[1] !== referenceMap.scopeToken) {
        errors.push("shadow_planner_provider_reference_alias_cross_packet");
      } else if (!entry) {
        errors.push("shadow_planner_provider_reference_alias_unknown");
      } else if (!allowedClasses.includes(entry.referenceClass)) {
        errors.push("shadow_planner_provider_reference_alias_wrong_class");
      } else {
        restored.push(entry.internalReference);
        restoredReferenceCount += 1;
      }
    }
    owner[key] = restored;
  };

  restoreList(output, "exactCitedFactRefs", ["FACT"]);
  for (const hypothesis of [output.primaryHypothesis, ...(Array.isArray(output.alternativeHypotheses) ? output.alternativeHypotheses : [])]) {
    if (!isRecord(hypothesis)) continue;
    restoreList(hypothesis, "supportingFactRefs", ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"]);
    restoreList(hypothesis, "contradictingFactRefs", ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"]);
  }
  for (const suspicion of Array.isArray(output.reconstructionSuspicions) ? output.reconstructionSuspicions : []) {
    if (!isRecord(suspicion)) continue;
    restoreList(suspicion, "exactAcceptedFactOrOccurrenceRefs", ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"]);
    restoreList(suspicion, "conflictingEvidenceRefs", ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"]);
  }
  if (errors.length > 0) {
    return deepFreeze({ ok: false as const, output: null, errorCodes: unique(errors).sort(), restoredReferenceCount: 0 as const });
  }
  output.inputHash = referenceMap.internalInputHash;
  return deepFreeze({ ok: true as const, output, errorCodes: [] as const, restoredReferenceCount });
}

export function providerAliasForInternalReferenceV1(
  referenceMap: ShadowAiProviderReferenceMapV1,
  referenceClass: ShadowAiProviderReferenceClassV1,
  internalReference: string,
): string | null {
  return referenceMap.entries.find((entry) => entry.referenceClass === referenceClass && entry.internalReference === internalReference)?.alias ?? null;
}

function buildEntries(packet: ShadowAiEconomicResolutionPacketV1, scopeToken: string): readonly ShadowAiProviderReferenceMapEntryV1[] {
  const refs: Record<ShadowAiProviderReferenceClassV1, Set<string>> = {
    FACT: new Set([...packet.acceptedFactRefs, ...packet.acceptedIssueRelevantActivityFacts.map((fact) => fact.factRef)]),
    STATEMENT_EVIDENCE: new Set(packet.acceptedIssueRelevantActivityFacts.flatMap((fact) => fact.evidenceRefs)),
    GOVERNED_EVIDENCE: new Set(packet.currentGovernedEvidenceRefs),
    ECONOMIC_CHARGE: new Set([...packet.selectedRdChargeRefs, ...packet.acceptedParticipantControlStates.map((state) => state.rdChargeRef)]),
  };
  return deepFreeze(SHADOW_AI_PROVIDER_REFERENCE_CLASSES_V1.flatMap((referenceClass) => {
    const values = [...refs[referenceClass]].sort();
    if (values.length > 9_999) throw new Error(`shadow_planner_provider_alias_class_budget_exceeded:${referenceClass}`);
    return values.map((internalReference, index) => ({
      alias: `prv_${scopeToken}_${CLASS_CODE[referenceClass]}_${String(index + 1).padStart(4, "0")}`,
      referenceClass,
      internalReference,
    }));
  }));
}

function inspectReferenceMap(referenceMap: ShadowAiProviderReferenceMapV1): Readonly<{ reasonCodes: readonly string[]; collisionCount: number }> {
  const reasons: string[] = [];
  let collisionCount = 0;
  if (!/^[a-f0-9]{10}$/.test(referenceMap.scopeToken)) reasons.push("shadow_planner_provider_reference_scope_invalid");
  const aliases = new Set<string>();
  const typedInternal = new Set<string>();
  for (const entry of referenceMap.entries) {
    if (aliases.has(entry.alias)) collisionCount += 1;
    aliases.add(entry.alias);
    const typedKey = `${entry.referenceClass}\u0000${entry.internalReference}`;
    if (typedInternal.has(typedKey)) collisionCount += 1;
    typedInternal.add(typedKey);
    const match = ALIAS_PATTERN.exec(entry.alias);
    if (!match || match[1] !== referenceMap.scopeToken || CODE_CLASS[match[2]!] !== entry.referenceClass) {
      reasons.push("shadow_planner_provider_reference_map_alias_invalid");
    }
    if (!entry.internalReference) reasons.push("shadow_planner_provider_reference_map_internal_ref_invalid");
  }
  if (collisionCount > 0) reasons.push("shadow_planner_provider_reference_map_collision");
  return deepFreeze({ reasonCodes: unique(reasons).sort(), collisionCount });
}

function assertReferenceMapEntries(entries: readonly ShadowAiProviderReferenceMapEntryV1[], scopeToken: string): void {
  const provisional: ShadowAiProviderReferenceMapV1 = {
    schemaVersion: SHADOW_AI_PROVIDER_REFERENCE_BOUNDARY_SCHEMA_VERSION_V1,
    scopeToken,
    issueId: "provisional",
    internalInputHash: "provisional",
    providerInputHash: "provisional",
    entries,
  };
  const inspection = inspectReferenceMap(provisional);
  if (inspection.reasonCodes.length > 0) {
    throw new Error(`shadow_planner_provider_reference_map_invalid:${inspection.reasonCodes.join(",")}`);
  }
}

function classifyAlias(
  alias: string,
  expectedClass: ShadowAiProviderReferenceClassV1,
  referenceMap: ShadowAiProviderReferenceMapV1,
  byAlias: Map<string, ShadowAiProviderReferenceMapEntryV1>,
): "VALID" | "UNKNOWN" | "WRONG_CLASS" | "MALFORMED" | "CROSS_PACKET" {
  const match = ALIAS_PATTERN.exec(alias);
  if (!match) return "MALFORMED";
  if (match[1] !== referenceMap.scopeToken) return "CROSS_PACKET";
  const entry = byAlias.get(alias);
  if (!entry) return "UNKNOWN";
  return entry.referenceClass === expectedClass ? "VALID" : "WRONG_CLASS";
}

function inspectOutboundValue(
  value: unknown,
  referenceMap: ShadowAiProviderReferenceMapV1,
  counters: MutableCounters,
  reasons: string[],
  key: string | null = null,
): void {
  if (Array.isArray(value)) {
    value.forEach((item) => inspectOutboundValue(item, referenceMap, counters, reasons, key));
    return;
  }
  if (isRecord(value)) {
    for (const [childKey, child] of Object.entries(value)) {
      if (REVERSE_MAP_KEY.test(childKey)) {
        counters.rawReverseMapMaterialCount += 1;
        reasons.push("shadow_planner_provider_reverse_map_material_present");
      }
      inspectOutboundValue(child, referenceMap, counters, reasons, childKey);
    }
    return;
  }
  if (typeof value !== "string") return;
  const aliasMatch = ALIAS_PATTERN.exec(value);
  if (aliasMatch && !referenceMap.entries.some((entry) => entry.alias === value)) {
    if (aliasMatch[1] === referenceMap.scopeToken) {
      counters.unknownAliasCount += 1;
      reasons.push("shadow_planner_provider_request_alias_unknown");
    } else {
      counters.crossPacketAliasCount += 1;
      reasons.push("shadow_planner_provider_request_alias_cross_packet");
    }
  }
  const approvedBindingValue = value === referenceMap.providerInputHash || value === referenceMap.issueId
    || /^shadow-run-[a-f0-9]{16,64}$/.test(value) || (aliasMatch && referenceMap.entries.some((entry) => entry.alias === value));
  if (!approvedBindingValue && (referenceMap.entries.some((entry) => value === entry.internalReference
      || (entry.internalReference.length >= 8 && value.includes(entry.internalReference)))
    || RAW_INTERNAL_REFERENCE.test(value) || RAW_INTERNAL_REFERENCE_NAMESPACE.test(value))) {
    counters.rawInternalReferenceLeakageCount += 1;
    reasons.push("shadow_planner_provider_raw_internal_reference_present");
  }
  if (SOURCE_IDENTITY.test(value)) {
    counters.sourceIdentityLeakageCount += 1;
    reasons.push("shadow_planner_provider_source_identity_present");
  }
  if (key === "businessName") return;
}

function inspectProviderOutputForRawReferences(
  value: unknown,
  referenceMap: ShadowAiProviderReferenceMapV1,
  internalReferences: Set<string>,
  errors: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item) => inspectProviderOutputForRawReferences(item, referenceMap, internalReferences, errors));
    return;
  }
  if (isRecord(value)) {
    Object.values(value).forEach((item) => inspectProviderOutputForRawReferences(item, referenceMap, internalReferences, errors));
    return;
  }
  const embeddedAliases = typeof value === "string" ? value.match(ALIAS_TOKEN_IN_TEXT) ?? [] : [];
  if (typeof value === "string" && embeddedAliases.length > 0 && !ALIAS_PATTERN.test(value)) {
    errors.push("shadow_planner_provider_reference_alias_embedded_in_prose");
  }
  const aliasMatch = typeof value === "string" ? ALIAS_PATTERN.exec(value) : null;
  if (aliasMatch && !referenceMap.entries.some((entry) => entry.alias === value)) {
    errors.push(aliasMatch[1] === referenceMap.scopeToken
      ? "shadow_planner_provider_reference_alias_unknown"
      : "shadow_planner_provider_reference_alias_cross_packet");
  }
  const approvedProviderValue = typeof value === "string"
    && (value === referenceMap.providerInputHash || value === referenceMap.issueId
      || Boolean(aliasMatch && referenceMap.entries.some((entry) => entry.alias === value)));
  if (typeof value === "string" && !approvedProviderValue
    && ([...internalReferences].some((reference) => value === reference || (reference.length >= 8 && value.includes(reference)))
      || RAW_INTERNAL_REFERENCE.test(value) || RAW_INTERNAL_REFERENCE_NAMESPACE.test(value) || SOURCE_IDENTITY.test(value))) {
    errors.push("shadow_planner_provider_output_raw_internal_reference_rejected");
  }
}

function inspectionResult(
  reasons: string[],
  counters: MutableCounters,
  entries: readonly ShadowAiProviderReferenceMapEntryV1[],
): ShadowAiProviderReferenceBoundaryInspectionV1 {
  return deepFreeze({
    valid: reasons.length === 0,
    reasonCodes: unique(reasons).sort(),
    aliasCounts: countAliases(entries),
    rawInternalReferenceLeakageCount: counters.rawInternalReferenceLeakageCount,
    rawReverseMapMaterialCount: counters.rawReverseMapMaterialCount,
    sourceIdentityLeakageCount: counters.sourceIdentityLeakageCount,
    unknownAliasCount: counters.unknownAliasCount,
    wrongClassAliasCount: counters.wrongClassAliasCount,
    malformedAliasCount: counters.malformedAliasCount,
    crossPacketAliasCount: counters.crossPacketAliasCount,
    collisionCount: counters.collisionCount,
  });
}

function countAliases(entries: readonly ShadowAiProviderReferenceMapEntryV1[]): Readonly<Record<ShadowAiProviderReferenceClassV1, number>> {
  return deepFreeze(Object.fromEntries(SHADOW_AI_PROVIDER_REFERENCE_CLASSES_V1.map((referenceClass) => [
    referenceClass,
    entries.filter((entry) => entry.referenceClass === referenceClass).length,
  ])) as Record<ShadowAiProviderReferenceClassV1, number>);
}

type MutableCounters = {
  rawInternalReferenceLeakageCount: number;
  rawReverseMapMaterialCount: number;
  sourceIdentityLeakageCount: number;
  unknownAliasCount: number;
  wrongClassAliasCount: number;
  malformedAliasCount: number;
  crossPacketAliasCount: number;
  collisionCount: number;
};

function emptyCounters(): MutableCounters {
  return { rawInternalReferenceLeakageCount: 0, rawReverseMapMaterialCount: 0, sourceIdentityLeakageCount: 0,
    unknownAliasCount: 0, wrongClassAliasCount: 0, malformedAliasCount: 0, crossPacketAliasCount: 0, collisionCount: 0 };
}

function requestScopeToken(packet: ShadowAiEconomicResolutionPacketV1): string {
  return sha256(canonicalJson({
    boundary: SHADOW_AI_PROVIDER_REFERENCE_BOUNDARY_SCHEMA_VERSION_V1,
    opaqueRunRef: packet.opaqueRunRef,
    issueId: packet.issueId,
    immutableInputHash: packet.immutableInputHash,
  })).slice(0, 10);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requiredRestored(value: string | null): string {
  if (!value) throw new Error("shadow_planner_provider_packet_parity_reference_missing");
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
