import type { SourceEvidence } from "../contracts.js";
import type { DirectProofRun } from "./types.js";

type Assessment = DirectProofRun["documentClass"];
const matching = (rows: readonly SourceEvidence[], pattern: RegExp): string[] =>
  rows.filter((row) => pattern.test(row.normalizedText)).map((row) => row.id);
const unique = (...groups: readonly string[][]): string[] => [...new Set(groups.flat())];

/** Candidate routing only. A class cue never proves a financial population. */
export function assessDocumentClass(rows: readonly SourceEvidence[]): Assessment {
  const ruleVersion = "document_class_candidate_v1" as const;
  const merchantTitle = matching(rows, /\b(?:merchant(?: processing)?|card processing|payment processing) statement\b/i);
  const merchantIdentifier = matching(rows, /\bmerchant\s*(?:number|id|#)\b/i);
  const processingSemantics = matching(rows,
    /\b(?:net sales|gross sales|processing summary|interchange charges|card type summary|summary by card type)\b/i);
  const depositAccount = matching(rows, /\b(?:deposit account|checking account|savings account)\b/i);
  const bankActivity = matching(rows,
    /\b(?:beginning balance|ending balance|available balance|electronic withdrawals|withdrawals|atm)\b/i);
  const merchant = merchantIdentifier.length > 0
    && (merchantTitle.length > 0 || processingSemantics.length > 0);
  const bank = depositAccount.length > 0 && bankActivity.length > 0;
  const evidenceRefs = unique(merchantTitle, merchantIdentifier, processingSemantics,
    depositAccount, bankActivity);
  if (merchant && bank) return { ruleVersion, kind: "unknown", status: "ambiguous", evidenceRefs,
    reasonCodes: ["merchant_and_deposit_account_cues_conflict"], authority: "routing_hint_only" };
  if (bank) return { ruleVersion, kind: "deposit_account_statement", status: "candidate", evidenceRefs,
    reasonCodes: ["deposit_account_and_bank_activity_cues"], authority: "routing_hint_only" };
  if (merchant) return { ruleVersion, kind: "merchant_processing_statement", status: "candidate", evidenceRefs,
    reasonCodes: ["merchant_identifier_and_processing_context_cues"], authority: "routing_hint_only" };
  return { ruleVersion, kind: "unknown", status: "unresolved", evidenceRefs,
    reasonCodes: [rows.length ? "document_class_cues_insufficient" : "no_extracted_document_evidence"],
    authority: "routing_hint_only" };
}
