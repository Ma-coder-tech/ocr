# Provider-bound reference inventory

Baseline: Package A commit `e268d6e48823a15996c4c5c401459dab710f1a5a`.

This inventory classifies identifiers at the provider request boundary. It does not change planner semantics, prompts, packet selection, reference-set cardinality, provider schema topology, authority, or validation rules.

| Reference or identifier | Class | Provider treatment | Inbound treatment |
|---|---|---|---|
| Planner schema versions, issue class, unresolved facets/reason codes, evidence-class enums, resolution-path enums | A — semantic identifier | Retained because these are bounded non-source semantic vocabulary | Validated by the existing planner contract |
| `issueId` | A — semantic binding identifier | Retained to bind the one-issue/one-plan exchange | Must equal the request-local issue ID |
| `opaqueRunRef` | B — safe opaque correlation identifier | Retained; contains no source identity | Not accepted as a citation |
| Provider packet `immutableInputHash` | B — request correlation identifier | Recomputed over the aliased provider packet; the internal packet hash is withheld | Provider value must equal the request-local provider hash, then is restored to the original internal hash before local validation |
| `acceptedIssueRelevantActivityFacts[].factRef` | C — internal reference | Replaced by typed request-scoped `FACT` alias | May be cited only in fact/support locations; reverse-mapped locally |
| `acceptedIssueRelevantActivityFacts[].evidenceRefs[]` | C — internal statement-evidence reference | Replaced by typed request-scoped `STATEMENT_EVIDENCE` alias | Not admitted to planner citation fields; remains distinct from fact/governed/charge classes |
| `acceptedFactRefs[]` | C — internal reference | Replaced by the same request-local `FACT` alias used for the same fact in other structural locations | Reverse-mapped locally; duplicate output aliases rejected |
| `currentGovernedEvidenceRefs[]` | C — internal governed-evidence reference | Replaced by typed request-scoped `GOVERNED_EVIDENCE` alias | May be used only in governed support/suspicion locations; reverse-mapped locally |
| `selectedRdChargeRefs[]` | C — internal economic-charge reference | Replaced by typed request-scoped `ECONOMIC_CHARGE` alias | May be used only in support/suspicion locations; reverse-mapped locally |
| `acceptedParticipantControlStates[].rdChargeRef` | C — internal economic-charge reference | Uses the same request-local charge alias for the same charge | Reverse-mapped locally with class enforcement |
| Provider output citation arrays | C — aliased reference surface | Schema enums contain only aliases valid for that request and allowed field class | Malformed, unknown, cross-request, wrong-class, duplicate, or raw internal references fail closed |
| Source filenames, `.pdf`/`.md`/document-like names, filesystem paths, raw statement/block namespaces | D — withheld | Rejected by outbound privacy inspection | Raw or invented source-like values in output are rejected |
| Internal packet hash and raw input/reference namespaces | D — withheld | Never serialized; provider receives only the rebound provider hash and aliases | Restored only from the trusted in-memory request map |
| Alias-to-internal reverse map, internal reference values, map scope material | D — withheld local control material | Never included in request body, provider schema, telemetry, logs, or committed evaluation artifacts | Required for acceptance; missing, invalid, colliding, or mismatched maps fail closed |
| MID/account/bank/routing/tax/card/credential/personal contact/raw statement fields | D — withheld by existing privacy boundary | Remain prohibited | Never admitted |
| Possible natural-person/sole-proprietor business names | D unless already replaced | Provider boundary rejects an unsuppressed ambiguous name; accepted opaque business references remain allowed | No inference upgrades identity or classification |

Alias form: `prv_<request-scope>_<typed-class>_<request-local-ordinal>`. The scope is derived from request-local binding material, not from a reusable hash of an internal reference. Aliases reveal reference class and within-request cardinality only; they do not expose source names, paths, internal namespaces, or stable cross-request identifiers.
