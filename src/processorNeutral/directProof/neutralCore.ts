import type { ParsedDocument } from "../../parser.js";
import { observeParsedDocumentEvidence } from "../shadow.js";
import { assessDocumentClass } from "./documentUnderstanding.js";
import { proveSourceIntegrity, proveStatementPeriod } from "./evidence.js";
import { DIRECT_PREMISES } from "./types.js";
import type { EvidencePacket, NeutralProofRun, NeutralProtocolPackage, PageSequenceProposal } from "./neutralContracts.js";
import { neutralFactProofId } from "./neutralProofId.js";

function assessPageSequence(packet: EvidencePacket, baseline: NeutralProofRun["sourceIntegrity"],
  proposal: PageSequenceProposal): NeutralProofRun["sourceIntegrity"] {
  const byRef = new Map([...packet.rows.map((row) => [row.id,
    { pageIndex: row.coordinate.pageIndex, text: row.rawText }] as const),
    ...packet.tokens.map((token) => [token.id,
      { pageIndex: token.pageIndex, text: token.rawText }] as const)]);
  const pages = packet.pageInventory.enumerated;
  const valid = baseline.statementPages !== "conflicting"
    && Number.isSafeInteger(proposal.expectedPages) && proposal.expectedPages > 0
    && pages === proposal.expectedPages && proposal.markers.length === pages
    && proposal.markers.every((marker) => Number.isSafeInteger(marker.pageIndex)
      && marker.pageIndex >= 0 && marker.pageIndex < pages
      && marker.printedPage === marker.pageIndex + 1
      && marker.printedTotal === pages && marker.evidenceRefs.length > 0
      && marker.evidenceRefs.every((ref) => byRef.get(ref)?.pageIndex === marker.pageIndex)
      && new RegExp(`\\b${marker.printedPage}\\b`).test(marker.evidenceRefs
        .map((ref) => byRef.get(ref)?.text ?? "").join(" "))
      && new RegExp(`\\b${marker.printedTotal}\\b`).test(marker.evidenceRefs
        .map((ref) => byRef.get(ref)?.text ?? "").join(" ")))
    && new Set(proposal.markers.map((marker) => marker.pageIndex)).size === pages;
  return { ...baseline, statementPages: valid ? "proven" : "conflicting",
    expectedPages: valid ? pages : null,
    evidenceRefs: proposal.markers.flatMap((marker) => marker.evidenceRefs),
    reasonCodes: [baseline.reasonCodes[0]!, valid
      ? "package_printed_page_sequence_matches_pdf_inventory"
      : "package_printed_page_sequence_invalid"] };
}

/** Generic research admission. Packages propose facts; the core alone marks them proven. */
export function proveNeutral(input: { document: ParsedDocument; packet: EvidencePacket },
  packages: readonly NeutralProtocolPackage[]): NeutralProofRun {
  const { packet, document } = input;
  if (packet.version !== "family_neutral_evidence_v1" || !/^[a-f0-9]{64}$/.test(packet.sourceSha256))
    throw new Error("NEUTRAL_INVALID_EVIDENCE_PACKET");
  const expectedRows = observeParsedDocumentEvidence(document, packet.sourceSha256);
  if (expectedRows.length !== packet.rows.length || expectedRows.some((row, index) =>
    row.id !== packet.rows[index]?.id || row.rawText !== packet.rows[index]?.rawText))
    throw new Error("NEUTRAL_UNBOUND_ROW_EVIDENCE");
  const refs = new Set([...packet.rows.map((row) => row.id), ...packet.tokens.map((token) => token.id)]);
  const laneByRef = new Map([...packet.rows.map((row) => [row.id, row.laneId] as const),
    ...packet.tokens.map((token) => [token.id, token.laneId] as const)]);
  if (refs.size !== packet.rows.length + packet.tokens.length) throw new Error("NEUTRAL_DUPLICATE_EVIDENCE");
  const hasRefs = (values: readonly string[]) => values.every((ref) => refs.has(ref));
  const documentClass = assessDocumentClass(packet.rows);
  const baselineSourceIntegrity = proveSourceIntegrity(document, packet.rows);
  const ids = new Set<string>();
  const candidates = packages.map((item) => {
    if (ids.has(item.id)) throw new Error("NEUTRAL_DUPLICATE_PACKAGE");
    ids.add(item.id);
    const probe = item.probe(packet);
    if (!hasRefs(probe.evidenceRefs)) throw new Error("NEUTRAL_INVALID_PROBE_REFS");
    return { id: item.id, version: item.version, status: probe.status,
      evidenceRefs: probe.evidenceRefs };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const plausible = candidates.filter((item) => item.status === "candidate");
  const status: NeutralProofRun["routing"]["status"] = documentClass.status === "ambiguous" ? "ambiguous"
    : documentClass.kind === "deposit_account_statement" ? "non_merchant"
      : plausible.length > 1 ? "ambiguous" : plausible.length === 0 ? "unknown_protocol" : "selected";
  const selectedId = status === "selected" ? plausible[0]!.id : null;
  const routing = { status, selectedId, candidates, authority: "none" as const };
  const selected = packages.find((item) => item.id === selectedId);
  const result = selected?.evaluate(input);
  const sourceIntegrity = result?.pageSequence
    ? assessPageSequence(packet, baselineSourceIntegrity, result.pageSequence)
    : baselineSourceIntegrity;
  const period = result?.statementPeriod ?? proveStatementPeriod(packet.rows);
  const controls = result?.controls ?? [];
  const controlIds = new Set<string>();
  for (const control of controls) {
    if (controlIds.has(control.id) || !hasRefs(control.inputRefs)
      || (control.targetRef !== null && !refs.has(control.targetRef)))
      throw new Error("NEUTRAL_INVALID_CONTROL");
    controlIds.add(control.id);
    if (control.status === "pass" && (control.expectedMinor === null
      || control.observedMinor === null || control.expectedMinor !== control.observedMinor))
      throw new Error("NEUTRAL_FALSE_CONTROL_PASS");
    if (control.independent && (!control.targetRef || control.inputRefs.length === 0
      || control.inputRefs.includes(control.targetRef)
      || control.independenceBasis !== "distinct_source_rows_same_extraction_lane"
      || control.inputRefs.some((ref) => laneByRef.get(ref) !== laneByRef.get(control.targetRef!))))
      throw new Error("NEUTRAL_FALSE_INDEPENDENCE");
  }
  const byControl = new Map(controls.map((item) => [item.id, item]));
  const assumptions = result?.assumptions ?? [];
  const assumptionIds = new Set(assumptions.map((item) => item.id));
  if (assumptionIds.size !== assumptions.length || assumptions.some((item) => !hasRefs(item.evidenceRefs)))
    throw new Error("NEUTRAL_INVALID_ASSUMPTIONS");
  const factIds = new Set<string>();
  const facts = (result?.facts ?? []).map((fact) => {
    if (factIds.has(fact.id) || !hasRefs(fact.evidenceRefs)
      || !hasRefs(fact.population.period.evidenceRefs)
      || !fact.controlRefs.every((ref) => controlIds.has(ref))
      || !fact.assumptionIds.every((id) => assumptionIds.has(id)))
      throw new Error(`NEUTRAL_INVALID_FACT_REFS:${fact.id}`);
    factIds.add(fact.id);
    const premises = new Map(fact.premises.map((item) => [item.premise, item]));
    if (premises.size !== DIRECT_PREMISES.length || fact.premises.length !== DIRECT_PREMISES.length
      || DIRECT_PREMISES.some((key) => !premises.has(key)))
      throw new Error(`NEUTRAL_INCOMPLETE_PROOF_VECTOR:${fact.id}`);
    for (const premise of fact.premises) {
      if (!hasRefs(premise.evidenceRefs)
        || !premise.controlRefs.every((ref) => controlIds.has(ref))
        || (premise.assumptionId !== null && !assumptionIds.has(premise.assumptionId)))
        throw new Error(`NEUTRAL_INVALID_PREMISE_REFS:${fact.id}`);
    }
    const required = DIRECT_PREMISES.filter((key) => key !== "operand_compatibility");
    const admissible = status === "selected" && result?.protocolStatus === "resolved"
      && sourceIntegrity.suppliedArtifact === "proven"
      && sourceIntegrity.statementPages === "proven"
      && fact.amountMinor !== null && Number.isSafeInteger(fact.amountMinor)
      && fact.unit !== null && fact.population.currency !== null
      && fact.population.scope.trim().length > 0 && fact.population.signConvention.trim().length > 0
      && fact.population.completeness === "bounded"
      && fact.population.representation !== "unresolved"
      && fact.population.period.printedContext === "statement"
      && fact.population.period.evidenceRefs.length > 0
      && period.state === "proven" && fact.population.period.start === period.start
      && fact.population.period.end === period.end
      && fact.evidenceRefs.length > 0 && fact.controlRefs.length > 0
      && fact.controlRefs.every((ref) => byControl.get(ref)?.status === "pass")
      && fact.controlRefs.some((ref) => byControl.get(ref)?.independent === true)
      && required.every((key) => premises.get(key)?.state === "proven")
      && ["proven", "not_applicable"].includes(premises.get("operand_compatibility")?.state ?? "")
      && fact.assumptionIds.every((id) => assumptions.find((item) => item.id === id)?.state === "versioned_protocol");
    const proofId = neutralFactProofId(packet.sourceSha256,
      selected?.id ?? null, selected?.version ?? null, fact);
    return { ...fact, proofId, state: admissible ? "proven" as const : "withheld" as const,
      amountMinor: admissible ? fact.amountMinor : null,
      unit: admissible ? fact.unit : null };
  });
  if (result && (!hasRefs(result.protocolEvidenceRefs) || !hasRefs(period.evidenceRefs)))
    throw new Error("NEUTRAL_INVALID_PROTOCOL_REFS");
  return { version: "family_neutral_protocol_proof_v2", inputSha256: packet.sourceSha256,
    evidence: packet, documentClass: { kind: documentClass.kind, status: documentClass.status,
      evidenceRefs: documentClass.evidenceRefs }, routing, sourceIntegrity,
    protocol: { id: selectedId, status: result?.protocolStatus ?? "unresolved",
      evidenceRefs: result?.protocolEvidenceRefs ?? [], reasonCodes: result?.reasonCodes ?? [status] },
    statementPeriod: period, controls, facts, assumptions,
    diagnostics: result?.diagnostics ?? {}, backendProcessor: null,
    customerAuthority: "none_shadow_only", currentCustomerPermissions: "unchanged" };
}
