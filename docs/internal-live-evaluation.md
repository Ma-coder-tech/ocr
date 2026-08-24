# RateReveal internal live evaluation

This interface is for Codex-owned, explicitly product-authorized internal evaluations. It is not a general statement runner. The initial committed profile supports only `statement-one` (`fsv-03-clover-short-jun`) with the 2024 public research context.

## One-time credential setup

The product owner creates two Generic Password items in macOS Keychain Access:

- `RateReveal/OpenRouter`
- `RateReveal/OpenAI`

The password value of each item is the corresponding existing API credential. Credentials are not entered in Terminal, chat, repository files, shell configuration, command arguments, or artifacts.

On first authorized Codex access, macOS may display a SecurityAgent prompt stating that `security` wants to use confidential information stored in a Keychain entry. The runner reads `RateReveal/OpenRouter` first and does not request `RateReveal/OpenAI` until the first lookup has conclusively succeeded. Prompts therefore occur one at a time. The product owner may choose an appropriate one-time **Allow**; **Always Allow** is optional and is not required for correctness. No Terminal command, credential copy/paste, or provider operation is involved in approving the prompt.

Each Keychain lookup has a 120-second timeout. This allows time to notice and approve a macOS dialog while preventing an unattended SecurityAgent prompt from blocking Codex indefinitely. A timeout terminates that lookup, starts no second lookup, sends nothing to a provider, and clears any credential reference already acquired by the broker. Keychain failures retain only the service code (`openrouter` or `openai`) and one safe category: entry missing, access denied/cancelled, keychain locked, broker timeout, or unclassified read failure. Raw Keychain output is never logged or persisted.

## Live provider and retrieval diagnostics

The OpenRouter discovery request uses the beta `openrouter:web_search` server tool with the Perplexity engine, one allowed tool call, no fallback, reasoning disabled, and a 512-token completion ceiling. A `finish_reason` of `length` is always retained as `openrouter_search_response_truncated` and never accepted as verified tool execution, even if citations are present. Search candidates remain limited to documented `url_citation` annotations; assistant prose is neither evidence nor a transport-identity channel. The synchronous local operation binds each response to its reserved request; the documented response envelope (`id`, requested `model`, one assistant choice at index zero) is validated independently of generated text.

Provider receipts retain only allowlisted operational diagnostics: HTTP status, local request ID, safe provider request/response IDs, requested and returned model identifiers, finish reason, search-tool and citation counts, structured-output validation state, and bounded provider error `type`, `code`, and `param`. Provider error messages, response prose, hidden reasoning, credentials, and private statement content are not retained. A failed post-send operation remains marked as possibly billable when complete usage is unavailable.

Independent public retrieval uses Node HTTPS with an approved DNS resolution permit and exactly one pinned address per request. The socket family is fixed to that pinned address because Node network-family auto-selection requests an address array from custom lookup callbacks and is incompatible with the scalar single-address pin. The retriever retains only bounded safe failure categories for destination pinning, DNS resolution, network connection, TLS validation, timeout, cancellation, and unclassified transport failures. It never persists raw socket errors, addresses, proxy details, or credentials.

When an admitted public document was successfully retrieved, fingerprinted, and grounded but a later investigative or semantic operation did not complete, the public-evidence manifest retains that provenance as `verification_unavailable`. Such an entry must carry `source_existence_and_provenance_established`, `semantic_verification_not_completed`, and `not_supported_research_finding`; it cannot support a research finding, recommendation, savings claim, or canonical/economic mutation.

## Codex interface

After separate, explicit product-owner authorization for one live evaluation, Codex runs:

```sh
npm run evaluate:fiserv-internal-live -- --profile statement-one --authorization product-owner-approved --run-id auto
```

Without the exact authorization token the runner cancels before Keychain access, run-ID allocation, or provider-capable construction and prints `Provider sends: 0`. The runner allocates a fresh three-digit run ID under `/private/tmp/ratereveal-live-internal-evaluation`, refuses collisions, executes once, and has no rerun, retry, or fallback loop.

For a separately authorized zero-send credential and preflight check, Codex uses:

```sh
npm run evaluate:fiserv-internal-live -- --mode readiness --profile statement-one --authorization product-owner-approved --run-id auto
```

Readiness mode verifies the branch, clean worktree, local/remote HEAD agreement, committed network profile, serial accessibility of both Keychain items, and provider-capability construction. It does not allocate a numbered Statement-1 run directory, construct provider ports, or execute analysis. It reports `Provider sends: 0` and clears the credential environment on exit.

For a separately authorized synthetic provider-boundary probe, Codex uses:

```sh
npm run evaluate:fiserv-internal-live -- --mode provider-readiness --profile statement-one --authorization product-owner-approved --run-id auto
```

Provider-readiness mode retains the repository/network/Keychain/preflight gates, creates no numbered Statement run directory, and sends no Statement PDF or private statement data. It performs exactly three sequential synthetic operations: one OpenRouter discovery request, one direct OpenAI investigative structured-output request, and one independent direct OpenAI semantic structured-output request. It stops on the first failure and has zero retries, no fallback, no adaptive search, and no language call. This mode requires its own explicit product-owner authorization and never continues automatically into live analysis.

The semantic provider returns only four judgment fields per occupied structural slot: verification status, effective-from date, effective-to date, and limitation codes. RateReveal snapshots the exact semantic inputs before the call and binds each validated slot locally to its immutable question, candidate, document, fingerprint, locator, investigative observation, proposed value, source-authority claim, scope, and non-mutation policy. Support identity is derived deterministically from that lineage. Model-authored identity and policy fields are absent from the strict response schema, and any extra field, missing occupied slot, populated unused slot, malformed judgment, or invalid input lineage fails closed before a support object exists. The completed locally bound support still passes through the unchanged production `validateSemanticMember(...)` and `validateSemanticSupport(...)` boundaries.

When that completed synthetic semantic member reaches `validateSemanticMember(...)`, provider-readiness retains the complete deterministic `semanticMemberIssues` array, allowlisted `semanticMismatchDimensions`, and a bounded `safeSemanticMemberProjection`. The projection contains only structured identity, authority, status, date, scope, neutral-term, limitation, admission, and financial-mutation fields from the synthetic member. It excludes response bodies, prompts, assistant prose, hidden reasoning, credentials, and headers. These diagnostics are printed only by provider-readiness, create no Statement artifact, and cannot enter internal analysis, canonical truth, RF knowledge, evidence, findings, recommendations, or impact. A non-empty issue array still fails with `provider_readiness_semantic_contract_invalid`.

For both readiness and live modes, the lifecycle before a numbered run is: authorization/profile validation → repository and network checks → serial bounded Keychain reads → zero-send capability preflight. Only a normal live mode that passes those stages acquires the allocation lock and finalizes a fresh run ID.

The project Codex permission profile enables its managed network proxy and allows exactly `openrouter.ai`, `api.openai.com`, and `merchants.fiserv.com`. The runner separately verifies its committed host profile against the fixed provider endpoints and every production authority origin. Adding a registry origin without explicit network-profile review therefore fails preflight.
