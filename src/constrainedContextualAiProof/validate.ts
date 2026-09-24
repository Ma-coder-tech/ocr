import { GOVERNED_AI_OUTPUT_VERSION, type GovernedAiInputPacket, type GovernedAiOutput, type GovernedAiValidation } from "./contracts.js";
import { validateGovernedAiPacket } from "./packet.js";

const outputKeys = [
  "schemaVersion", "selectedFindingIds", "orderedFindingIds", "selectedClauseIds", "merchantExplanation",
  "nextDocumentCode", "rationale", "evidenceRefsUsed", "knowledgeRecordIdsUsed",
];

function exactKeys(value: unknown, keys: string[]): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 200);
}
function unique(values: string[]): string[] { return [...new Set(values)].sort(); }
function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && unique(left).join("|") === unique(right).join("|");
}
function reject(reasonCodes: string[]): GovernedAiValidation {
  return { status: "rejected", reasonCodes: unique(reasonCodes), output: null };
}

/** Classification is diagnostic; the closed clause/claim allowlist is the authority gate. */
function prohibitedTextReasons(value: string): string[] {
  const text = value.toLowerCase();
  const reasons: string[] = [];
  if (/benchmark gap|merchants like you|usually pay|market rate/.test(text)) reasons.push("prohibited_benchmark_claim");
  if (/overpay|paying too much|pay more than (?:you )?should/.test(text)) reasons.push("prohibited_overpayment_claim");
  if (/processor markup|processor margin|processor profit/.test(text)) reasons.push("prohibited_processor_markup_claim");
  if (/processor (?:owns|controls|sets)|owned by the processor|controlled by the processor/.test(text)) reasons.push("prohibited_ownership_control_claim");
  if (/negotiab|negotiate|can bargain/.test(text)) reasons.push("prohibited_negotiability_claim");
  if (/removab|remove (?:this|the) fee|waivab|waive (?:this|the) fee/.test(text)) reasons.push("prohibited_removability_claim");
  if (/savings?|you can save|save \$|will save/.test(text)) reasons.push("prohibited_savings_claim");
  if (/should be paying|should pay (?:a|\$|\d)|ought to pay/.test(text)) reasons.push("prohibited_target_rate_claim");
  return reasons;
}

function unsupportedNumbers(text: string, packet: GovernedAiInputPacket): string[] {
  const allowed = new Set(packet.numericFacts.map((fact) => fact.display));
  const observed = text.match(/[-+]?\$?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
  return observed.filter((value) => !allowed.has(value));
}

/** Deterministic acceptance: every assertion is a selected, preapproved claim clause. */
export function validateGovernedAiOutput(packet: GovernedAiInputPacket, candidate: unknown): GovernedAiValidation {
  if (!validateGovernedAiPacket(packet)) return reject(["invalid_governed_packet"]);
  if (!exactKeys(candidate, outputKeys)) return reject(["invalid_output_shape"]);
  const output = candidate as GovernedAiOutput;
  if (output.schemaVersion !== GOVERNED_AI_OUTPUT_VERSION ||
    !strings(output.selectedFindingIds) || !strings(output.orderedFindingIds) || !strings(output.selectedClauseIds) ||
    typeof output.merchantExplanation !== "string" || output.merchantExplanation.length > 2500 ||
    typeof output.rationale !== "string" || output.rationale.length > 500 ||
    (typeof output.nextDocumentCode !== "string" && output.nextDocumentCode !== null) ||
    !strings(output.evidenceRefsUsed) || !strings(output.knowledgeRecordIdsUsed)) {
    return reject(["invalid_output_shape"]);
  }
  const reasons: string[] = [];
  const approvedIds = new Set(packet.approvedFindingIds);
  if (new Set(output.selectedFindingIds).size !== output.selectedFindingIds.length ||
    output.selectedFindingIds.some((id) => !approvedIds.has(id))) reasons.push("unapproved_finding_selected");
  if (packet.approvedFindingIds.length > 0 && output.selectedFindingIds.length === 0) reasons.push("no_finding_selected");
  if (!sameSet(output.orderedFindingIds, packet.approvedFindingIds) ||
    new Set(output.orderedFindingIds).size !== output.orderedFindingIds.length) reasons.push("ranking_not_permutation_of_approved_findings");
  const selected = new Set(output.selectedFindingIds);
  const clauseMap = new Map(packet.allowedClauses.map((clause) => [clause.id, clause]));
  const selectedClauses = output.selectedClauseIds.map((id) => clauseMap.get(id));
  if (new Set(output.selectedClauseIds).size !== output.selectedClauseIds.length ||
    selectedClauses.some((clause) => !clause || !selected.has(clause.findingId))) reasons.push("unapproved_claim_clause");
  if (selectedClauses.every(Boolean) && selectedClauses.some((clause, index) => index > 0 &&
    output.orderedFindingIds.indexOf(clause!.findingId) < output.orderedFindingIds.indexOf(selectedClauses[index - 1]!.findingId))) {
    reasons.push("explanation_order_conflicts_with_ranking");
  }
  for (const findingId of output.selectedFindingIds) {
    const finding = packet.findings.find((item) => item.id === findingId);
    if (!finding) continue;
    const claims = selectedClauses.filter((clause) => clause?.findingId === findingId).map((clause) => clause!.claimCode);
    const primary = finding.kind === "fixed_fee_burden" ? "fixed_total" :
      packet.allowedClauses.find((clause) => clause.findingId === findingId && clause.claimCode === "observed_credit") ? "observed_credit" : "observed_charge";
    if (!claims.includes(primary)) reasons.push("required_observation_missing");
    if (!claims.includes("changeability_unknown")) reasons.push("required_limitation_missing");
    if (finding.kind === "fixed_fee_burden" && !claims.includes(finding.state === "amount_only" ? "ratio_unavailable" : "fixed_ratio")) {
      reasons.push("fixed_ratio_state_not_preserved");
    }
  }
  if (packet.approvedFindingIds.length === 0 && (output.selectedFindingIds.length || output.selectedClauseIds.length || output.merchantExplanation)) {
    reasons.push("not_assessed_promoted_to_finding");
  }
  if (selectedClauses.every(Boolean)) {
    const expected = selectedClauses.map((clause) => clause!.text).join(" ");
    if (output.merchantExplanation !== expected) reasons.push("unsupported_merchant_assertion");
    const expectedEvidence = unique(selectedClauses.flatMap((clause) => clause!.evidenceRefs));
    const expectedKnowledge = unique(selectedClauses.map((clause) => clause!.knowledgeRecordId));
    if (!sameSet(output.evidenceRefsUsed, expectedEvidence) || new Set(output.evidenceRefsUsed).size !== output.evidenceRefsUsed.length) reasons.push("evidence_refs_mismatch");
    if (!sameSet(output.knowledgeRecordIdsUsed, expectedKnowledge) || new Set(output.knowledgeRecordIdsUsed).size !== output.knowledgeRecordIdsUsed.length) reasons.push("knowledge_ids_mismatch");
  }
  const document = packet.approvedNextDocuments.find((item) => item.code === output.nextDocumentCode);
  if (packet.approvedFindingIds.length === 0) {
    if (output.nextDocumentCode !== null || output.rationale !== "") reasons.push("not_assessed_promoted_to_document_guidance");
  } else if (!document) reasons.push("unapproved_next_document");
  else if (output.rationale !== document.rationale) reasons.push("unsupported_document_rationale");
  if (unsupportedNumbers(`${output.merchantExplanation} ${output.rationale}`, packet).length) reasons.push("unsupported_number");
  reasons.push(...prohibitedTextReasons(`${output.merchantExplanation} ${output.rationale}`));
  return reasons.length ? reject(reasons) : { status: "accepted", reasonCodes: [], output: structuredClone(output) };
}
