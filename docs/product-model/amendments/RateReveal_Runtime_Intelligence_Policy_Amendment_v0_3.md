# RateReveal Runtime Intelligence Policy Amendment v0.3

**Status:** Frozen product-owner-approved amendment  
**Identity:** `frozen_product_model_runtime_policy_amendment_v0_3`  
**Approved:** 2026-08-31  
**Amends:** Runtime Intelligence Policy Amendment v0.2  

## 1. Purpose and preserved authority

This amendment creates one narrow recovery exception for a qualified anonymous public-document read. It does not change evidence admission, semantic authority, materiality, analytical completion, financial truth, RF governance, provider authorization, or customer-report authority. Runtime Policy Amendment v0.2 remains authoritative except where this amendment expressly narrows the treatment of after-send ambiguity for the operation class defined below.

Historical operations keep their recorded meaning. The exception applies only when an operation durably binds and validates the v1 qualified-public-read contract before its first send.

## 2. Qualified public-read contract

An operation is a `qualified_public_read_v1` only when all of the following are true:

1. the operation is independent retrieval of supported public content;
2. the method is exactly `GET` over HTTPS;
3. the request has no body;
4. it is anonymous and sends no Authorization header, cookie, credential, API key, password, token, private key, signed private access material, or other authentication material;
5. the URL and outbound request contain no merchant-private statement or account data;
6. destination resolution, public-address validation, DNS-rebinding protection, address pinning, byte limits, content validation, and abort handling remain enforced;
7. redirects require a new independently validated destination authorization and are never a hidden hop;
8. no retrieved bytes, document, evidence, semantic claim, or canonical state is admitted until the ordinary deterministic retrieval and evidence gates succeed; and
9. the immutable operation input records the exact normalized URL and every qualification assertion above.

A label, caller assertion, operation kind, or provider output cannot qualify a request. The final local send boundary must validate the complete contract. Any missing, corrupt, contradictory, or inapplicable field fails closed and retains the ordinary v0.2 no-blind-resend behavior.

## 3. After-send transport ambiguity

When a qualified public read times out, is cancelled after send, loses its connection, receives a partial response, or otherwise ends without a complete deterministic response:

- preserve the original attempt durably as `public_read_transport_outcome_unknown`;
- preserve its send state, exact safe reason, transport milestones, bytes observed, resource use, operation input, and attempt identity;
- do not convert the attempt to `not_sent`, deterministic source unavailability, evidence, or analytical completion;
- do not create the run-wide reconciliation barrier solely from that qualified read; and
- a new separately identified attempt may be authorized under bounded operational recovery.

This exception recognizes that repeating the qualified request is a new read attempt, not reconciliation of an unknown merchant-facing or provider-execution side effect. Every unqualified after-send operation remains `indeterminate_after_send` and reconciliation-required under v0.2.

## 4. Bounded recovery and candidate continuation

Recovery attempts are individually abortable, durably identified, restart-safe, concurrency-safe, and cumulatively accounted. A new attempt receives fresh destination authorization and may select another currently approved address for the same normalized HTTPS origin. It may not silently change method, origin, URL identity, authority claim, evidence objective, privacy class, or content/admission rules.

Attempt counts, timeouts, delays, address-selection rotation, and total transport ceilings are deployment calibration. They must be bounded and recorded, but no numeric value establishes evidence, source inapplicability, diminishing returns, safe unresolved status, or analytical completion.

After configured recovery for one candidate is unavailable, RateReveal may continue to another legitimate candidate for the same exact claim. The failed source remains transport-unavailable for that attempt lineage only. It does not resolve the claim, transfer a semantic conclusion, suppress other sources, or invalidate independently proven truth.

## 5. Settled retrieval outcomes

An observed HTTP response, redirect, unsupported or malformed document, byte/content rejection, or other deterministic document-admission result is a settled retrieval outcome. Examples include 404, 410, 401, 403, redirects, and settled transient HTTP responses. These results:

- preserve their exact safe diagnostic and admission reason;
- do not create possible-send ambiguity or a reconciliation barrier;
- may be replayed only under the existing exact transport/document replay contract;
- may inform later operational scheduling when explicitly typed, but do not establish claim truth; and
- permit research to continue to other legitimate candidates where useful.

Redirect destinations still require fresh authorization. A deterministic response is not permission to weaken HTTPS, privacy, authority, applicability, fingerprint, scope, period, or semantic-support gates.

## 6. Timing and completion separation

Socket-inactivity, phase, total-attempt, retry, and resource ceilings are operational safeguards. They are configuration, not product definitions of correctness. The semantic completion rule in v0.2 §§7–9 remains unchanged: RateReveal continues only while material legitimately resolvable uncertainty remains and useful progress is being made, and stops only when the trustworthy answer is complete or further work cannot materially improve it.

Exhausted public-read recovery or unavailable sources may leave the affected claim unresolved. They never create affirmative evidence or analytical completion by themselves.

## 7. Explicitly unchanged behavior

The v0.2 no-blind-resend and reconciliation rule remains unchanged for AI calls, provider/search calls, authenticated or credential-bearing retrieval, non-GET methods, requests with bodies, merchant-private URLs or payloads, hidden redirects, and every operation that fails the qualified-public-read contract. This amendment does not authorize a secondary retrieval provider, browser execution, RF promotion, benchmark or savings work, customer-report cutover, or any broader evidence permission.

## 8. Integrity and future change

This Markdown artifact is immutable at its frozen identity. Its integrity lock records the byte count and SHA-256 digest, the exact v0.2 parent, and the Frozen Product Model baseline. Further semantic changes require another separately approved versioned amendment and traceability update.
