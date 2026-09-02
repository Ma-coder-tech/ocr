# RateReveal Runtime Intelligence Policy Amendment v0.2

**Status:** Normative product-policy amendment.
**Approved:** 2026-08-26.
**Amends:** `RateReveal_Runtime_Intelligence_Policy_v0_1.md`.
**Scope:** Production Runtime Intelligence Policy only. This amendment does not authorize runtime implementation or alter the Frozen Product Model originals.

## 1. Precedence and preservation

This document is a narrow overlay on Runtime Intelligence Policy v0.1. It supersedes only the conflicting text identified in Section 2. Every other provision of Runtime Intelligence Policy v0.1 remains controlling, including all deterministic-truth, evidence-admission, degradation, safety, knowledge, and report-authority boundaries.

If a v0.1 provision can be read consistently with this amendment, it is preserved. If a conflict is unavoidable, this amendment controls only to the minimum extent necessary to resolve that conflict.

The frozen Markdown files remain immutable. This amendment is not part of the frozen v0.1 byte identity and must never be used to rewrite those originals.

## 2. Exact supersession register

| v0.1 location | Conflicting v0.1 rule | v0.2 disposition |
|---|---|---|
| Part I §2, first sentence and the following “Do not send when unnecessary” list | Mandatory minimum structured context and an apparent categorical exclusion of full identity, MID/account values, raw statement text, or unrelated pages from approved AI-provider requests | Superseded for approved AI-provider context by §3. Complete statement and analysis context are permitted when useful. Purpose-shaped context remains encouraged, but redaction, sanitization, stripping, or data minimization is not a prerequisite. |
| Part IV §11, the normal “no more than four” initial-question target when treated as a permanent production ceiling | A fixed question count can define production completeness | Superseded for production by §§7–8. The existing four-question profile may remain an evaluation/deployment profile, but it is not a permanent product invariant or completeness definition. |
| Part V §12, `global_wall_time_budget_ms`, and the statement that a run without the v0.1 fixed-form budget is invalid | A single fixed global wall-time budget is mandatory production correctness state | Superseded only to the extent it makes fixed wall time or a permanently fixed numeric envelope a production completeness gate. Explicit operation, claim, resource, and cost accounting remains mandatory under §8. |
| Part V §13, all numeric default ceilings and the requirement to stop before the configured product budget is exhausted | Evaluation-era numeric defaults and wall-time exhaustion can operate as production correctness cutoffs | Withdrawn as permanent production semantics. Existing values may remain bounded evaluation or operational profiles. Production stopping is governed by §§7–9. |
| Part VI §15 items 5–8 | Search, candidate, retrieval, per-stage-timeout, or global-wall-time exhaustion always proves the question should stop as analytically complete | Superseded by §§7–9. Normal work allocation may be extended when material uncertainty remains legitimately resolvable and progress is useful. A true emergency ceiling still stops execution as an operational degradation event. |
| Part VI §16, the one-second/adaptive-search formulation when treated as a permanent retry/refinement count | Only one additional search can ever be legitimate | Superseded as a permanent production number. Diminishing-return logic and explicit justification are preserved; bounded retries and progress-aware extensions are governed by §8. |
| Part XIV §35 items 4–5 | One adaptive-search shape and global-budget expiry are permanent product acceptance semantics | Superseded only as fixed production limits. Tests must instead prove explicit justification, bounded operations, safe emergency degradation, unresolved preservation, and no false completeness claim. |
| Part XV §36, “candidate/search limits within approved product ceilings,” and §37, review triggered by materially expanding selected-question limits | Fixed candidate/search/question ceilings are normative economics/product invariants | Superseded for ordinary operational tuning under standing policy. Operational limits may change without changing the economics model, provided §§7–10 and all preserved safety/admission rules continue to hold. |

The following nearby v0.1 rules are expressly **not** superseded:

- Part I §1 untrusted-content protections;
- Part I §2 privacy-preserving provider options when available and privacy-safe diagnostic persistence;
- Parts II–III deterministic-first, admitted-knowledge-first, materiality, and public-research eligibility;
- Part V §14 attribution-safe parallelism;
- Part VI §15 items 1–4 and 9, diminishing-return meaning, and safe unresolved completion;
- Parts VII–XI retrieval safety, locator grounding, semantic admission, structured-output validation, canonical aggregate ownership, knowledge-candidate isolation, conflict refusal, and degradation;
- Part XII §30 diagnostic restrictions, including the prohibition on persisting raw prompts, provider prose, raw statement text, identity, private URLs, or secrets in diagnostic records;
- Part XIII latency measurement and early completion;
- Part XIV adversarial safety outcomes and the requirement that AI/research never mutate financial truth;
- Part XV policy review for changes to authority, automatic promotion, fail-closed admission, or report suppression;
- Part XVI the definition of successful trustworthy intelligence.

## 3. Approved AI-provider context

An approved AI provider may receive the complete merchant statement and complete AnalysisRun context when useful for accurate work. Permitted context includes, as applicable:

- the original PDF or file;
- merchant identity and business name;
- MID, account, and other statement identifiers;
- raw extracted statement text, tables, and rows;
- amounts, rates, totals, transaction counts, and fee inventory;
- notices and layout evidence;
- canonical facts and deterministic reconciliation state;
- unresolved claims and prior analysis state;
- any other relevant merchant-analysis information.

Approved-provider use does not require redaction, sanitization, content stripping, or a special zero-retention guarantee as a prerequisite. Provider approval, access control, transport security, applicable legal/commercial controls, and purpose limitation remain system responsibilities.

Purpose-shaped context is still encouraged when it improves accuracy, latency, cost, or context quality. Purpose shaping chooses the most useful context for an operation; it is not a mandatory privacy-redaction boundary. The original PDF should be available where layout, OCR, tables, or visual evidence matter.

More context gives a model more information, not more authority. Provider output remains subordinate to deterministic financial truth, source evidence, typed contracts, local validation, and final RateReveal admission.

## 4. Public search remains a separate boundary

Permission to provide full context to an approved AI provider is not permission to place private statement information into public web queries.

The required boundary is:

```text
full AnalysisRun context
→ typed SearchIntent
→ local query validation and compilation
→ approved public query
→ search execution
```

SearchIntent and the compiled query must contain only the public concepts needed to discover relevant evidence. MID/account identifiers, merchant identity, unrelated private statement information, private URLs, and secrets must not be included unless a separately approved product policy makes a specific public disclosure lawful and necessary. No such exception is approved by this amendment.

Search results, snippets, pages, and retrieved documents remain untrusted data under v0.1 Part I §1.

## 5. Same-model investigation and semantic verification

Investigation and semantic verification may use the same approved provider and the same model.

They must remain separate stateless operations with different purposes, input contracts, and structured outputs. Before verification:

1. freeze the candidate claim and its source/evidence identity;
2. invoke verification independently;
3. do not provide the investigator’s rationale, confidence, hidden reasoning, or persuasive framing as material for the verifier to endorse;
4. require the verifier to evaluate source identity, locator support, authority, period, scope, applicability, limitations, and claim meaning under its own contract;
5. run deterministic RateReveal validation and admission after verification.

Two calls to the same model do not constitute two evidence sources, do not increase source authority, and do not by themselves strengthen a claim. Correlated model error remains possible. Final claim admission is deterministic in RateReveal and remains bounded by v0.1 §21 and the Payments Knowledge Library.

Different-provider or different-model verification may be evaluated later, but it is not a current production requirement.

## 6. Standing provider authorization

Production does not require product-owner approval for each merchant statement. Approved providers and models operate under standing system-level policy.

Provider, model, version, and routing choices may change operationally without changing RateReveal’s economics model. Operational changes must remain within approved provider governance and must preserve typed contracts, audit receipts, local validation, deterministic authority boundaries, and safe degradation.

Changing a provider or model cannot expand what AI is authorized to decide.

## 7. Adaptive runtime completion rule

The production completion rule is:

> Continue while material, legitimately resolvable uncertainty remains and useful progress is being made. Stop immediately when the trustworthy answer is complete or further work cannot materially improve it.

A simple statement must finish quickly when little work is required. A genuinely difficult statement may run materially longer while additional work is still producing useful evidence. Five minutes, fifteen minutes, or any other arbitrary wall-clock value must not define analytical completeness.

Completeness is semantic, not temporal. A run is complete only when the trustworthy supported answer is complete or all remaining work is immaterial, not legitimately resolvable, unsafe, unavailable, or subject to diminishing returns.

## 8. Adaptive work budgeting requirements

Every production AnalysisRun must maintain an explicit, auditable work ledger that enforces all of the following semantics without freezing permanent numeric values in this foundation amendment:

### 8.1 Per-operation boundedness

Each search, retrieval, parse, investigation, verification, structured-output packet, and retry is individually abortable and bounded. No individual operation may wait or consume resources indefinitely.

### 8.2 Claim-level work allocation

Work is allocated to typed unresolved claims, not to a statement-wide quota alone. Allocation records the claim, its current state, requested operation, evidence objective, expected decision effect, reservation, consumption, and outcome.

### 8.3 Materiality

Work proceeds only when a different supported answer could materially change economic interpretation, evidence permission, actionability, report permission, or a material unresolved classification. Raw row count and available budget do not create materiality.

### 8.4 Evidence objective

Every operation has a stated evidence objective and required authority/scope. Open-ended “research more” work is invalid.

### 8.5 Progress-aware extensions

Additional work may be authorized when prior work produced concrete, relevant progress toward the evidence objective and the remaining gap is legitimately resolvable. Extensions must be recorded and bounded; they are not automatic.

### 8.6 Diminishing-return stopping

Stop a claim when repeated work no longer improves source authority, locator coverage, period/scope fit, semantic support, or decision permission enough to justify the next operation.

### 8.7 Bounded retries

Retries require a typed retryable failure or a justified refinement. Retry loops are bounded per operation and cumulatively accounted. Rejected attempts never enter admitted output.

### 8.8 Early completion

Do not consume available work merely because it is available. Complete as soon as all material claims are supported to their permitted ceiling or safely unresolved.

### 8.9 Resource and cost accounting

Track elapsed time, provider/model, calls, tokens or equivalent usage, retrieval bytes/documents, retries, concurrency, reservations, consumption, remaining operational allowance, and stop/degradation reason at a privacy-safe level.

### 8.10 Emergency circuit breakers

Maintain operational ceilings for hung calls, runaway execution, excessive retries, uncontrolled spending, excessive resource consumption, and provider/system instability. Circuit breakers may be numeric and deployment-specific. They are safety controls, not product definitions of completeness.

## 9. Emergency ceiling behavior

When an emergency ceiling is hit:

- stop or isolate the affected operation/run safely;
- classify the event as operational degradation, not analytical completion;
- preserve all previously proven deterministic and admitted output;
- expose every affected material claim as explicitly unresolved with the relevant operational reason;
- do not infer support, non-support, immateriality, or completeness from elapsed time or resource exhaustion;
- retain enough privacy-safe accounting for diagnosis and retry policy;
- allow a truthful partial report when preserved upstream permissions permit it.

## 10. Preserved authority and safety ceilings

Nothing in this amendment weakens or supersedes:

- source truth and deterministic financial truth;
- RA Gold expected and forbidden outcomes;
- RB financial populations, direction, identity, and reconciliation;
- RC independent pricing axes, population scope, activity gates, evidence-bound components, and noncanonical summaries;
- RD economic-charge identity, ownership/control positive-identification, independent roles, direction, exclusions, and cost-stack boundaries;
- RE counterfactual, controllability, recurrence, overlap, recommendation, impact, and savings gates;
- RF claim scope, tenant/account boundaries, effective dating, evidence requirements, deterministic specificity, conflict refusal, supersession, and human knowledge-promotion rules;
- RG independent public retrieval, source identity, fingerprints, locators, applicability, semantic admission, and failure preservation;
- untrusted-document and prompt-injection protections;
- canonical non-mutation by AI or research;
- RH evidence, actionability, customer-language, impact, comparison, and report-permission ceilings;
- safe unresolved completion.

Gold fixtures and tests remain correctness oracles. They are not runtime product configuration, question registries, provider instructions, or production source admissions.

## 11. Foundation-package implementation boundary

This amendment is normative only. It does not redesign `AnalysisRun`, change provider payloads, implement adaptive scheduling, alter existing evaluation budgets, admit dynamic sources, connect RF or RG to production uploads, change Report V1/V2 customer truth, or authorize provider calls.

Until a later approved implementation package connects this amendment, existing RG fixed budgets and timing profiles remain evaluation/operational behavior only and must not be represented as the final production completeness policy.
