# RateReveal Runtime Intelligence Policy v0.1

**Status:** Normative product/runtime policy paired with Economics Schema v0.7.  
**Purpose:** Define when AI and external research may run, what they may see, what they may propose, when research must stop, how failures degrade, and how runtime observations are prevented from contaminating shared knowledge or financial truth.  
**Scope:** Free single-statement product path unless an explicitly different future product mode is approved.

---

# 0. Governing position

RateReveal should feel intelligently analyzed, but the AI/runtime is **subordinate to canonical economics**.

Normal sequence:

```text
source statement
→ deterministic extraction and reconciliation
→ canonical economics / admitted internal knowledge
→ material unresolved-question selection
→ optional bounded external research
→ AI semantic investigation / synthesis
→ admission against canonical/evidence rules
→ merchant explanation
```

Research is not a prerequisite for a useful report. AI failure is not financial failure. The runtime should prefer a truthful unresolved conclusion over a long or speculative investigation.

---

# PART I — TRUST BOUNDARIES

## 1. Trusted product instructions vs untrusted content

Trusted instructions are only product/system/runtime policies supplied by RateReveal itself.

The following are **untrusted data**:

- uploaded merchant statements;
- OCR/PDF text;
- processor notices embedded in statements;
- retrieved web pages/PDFs;
- merchant-entered free text;
- AI-generated text from previous stages;
- external search snippets.

Untrusted content must never be interpreted as an instruction to:

- ignore product rules;
- reveal secrets;
- change tools/provider settings;
- promote knowledge;
- modify canonical financial truth;
- expand research scope;
- bypass admission or safety gates.

## 2. Privacy and minimization

AI and research receive the minimum structured context necessary for the task.

Do not send when unnecessary:

- full merchant identity;
- account/MID values;
- addresses;
- raw full statement text;
- bank details;
- sensitive IDs;
- unrelated source pages.

Provider requests use privacy-preserving options supported by the provider. Runtime diagnostics contain safe counts/classes/timings, not raw statement/provider prose.

---

# PART II — INTELLIGENCE CAPABILITY CLASSES

## 3. Deterministic intelligence

No AI needed:

- arithmetic/reconciliation;
- effective rate;
- source-row identity/sign;
- card/volume/count aggregation;
- exact program-row recomputation;
- deterministic cost-driver sums;
- exact counterfactual math once inputs are admitted.

## 4. Admitted knowledge lookup

Before any web research, query the effective-dated Payments Knowledge Library for:

- template semantics;
- fee/program aliases;
- ownership/control mappings;
- rate/rule schedules;
- refund/dispute rules;
- Amex mappings;
- merchant-lever applicability.

If admitted knowledge resolves the material question, do not research it externally.

## 5. AI semantic analysis

AI may propose:

- unfamiliar fee meaning;
- candidate ownership/control roles;
- candidate cost-driver relationships;
- candidate pricing interpretation;
- candidate operational signals;
- duplicate/related economic representations;
- merchant-language explanations;
- research questions.

AI proposals remain non-authoritative until admitted.

## 6. External research

External research is for **material unresolved claims** whose resolution can change the merchant result. It is not a row-by-row explanation service.

---

# PART III — RESEARCH ELIGIBILITY

## 7. A question is research-eligible only if all conditions hold

1. The statement and deterministic economics cannot resolve it.
2. Admitted knowledge cannot resolve it.
3. The question is material enough that a different answer can change at least one of:
   - a primary economic theme;
   - economic owner/control of a material cost;
   - report permissions;
   - a merchant lever;
   - a material rule/rate verification;
   - a material unresolved cost classification.
4. The required evidence is plausibly public and researchable.
5. The question does not structurally require merchant contract/history/private processor explanation instead.

If any condition fails, do not research.

## 8. Do not research these by default

- routine interchange program rows already mapped by admitted knowledge;
- exact financial amounts already proven by the statement;
- small unresolved rows that cannot change merchant conclusions;
- questions whose only answer requires the merchant pricing agreement;
- recurrence/trend questions requiring additional statements;
- processor-specific private meanings requiring processor explanation;
- every fee row merely because a merchant explanation will later be generated.

---

# PART IV — QUESTION SELECTION AND MATERIALITY

## 9. ResearchQuestion

```text
ResearchQuestion
- question_id
- question_type
- related_economic_refs[]
- materiality
- current_unresolved_state
- possible_answer_classes[]
- report_decision_that_could_change
- required_evidence_type
- public_research_plausible
- selected
- selection_reason
```

## 10. Selection order

Prefer questions that can resolve:

1. material ownership/control ambiguity affecting cost stack;
2. current/historical network rule applicability affecting a material theme;
3. a penalty/operational interpretation affecting merchant action;
4. a material unfamiliar fee repeated across the account;
5. benchmark/rule evidence required for a permitted claim.

Do not prioritize by raw row count.

## 11. Product question cap

The normal free single-statement path must use a small bounded set of selected questions. The deployment configuration MUST define a maximum selected-question count; product acceptance should normally target **no more than four** initial material questions unless a future product mode explicitly authorizes deeper research.

This is a workload ceiling, not a requirement to select four.

---

# PART V — RESEARCH PLAN AND BUDGET

## 12. ResearchBudget

Every runtime research run must instantiate an explicit budget:

```text
ResearchBudget
- max_selected_questions
- max_search_calls
- max_candidates_total
- max_candidates_per_question
- max_retrieval_bytes_per_document
- max_retrieval_documents
- max_investigative_ai_calls
- max_semantic_verification_calls
- per_call_timeout_policy_refs[]
- global_wall_time_budget_ms
- adaptive_refinement_limit
```

A run without an explicit budget is invalid.

## 13. Initial product defaults

For the free single-statement path, the initial policy is intentionally conservative:

- selected material questions: **≤ 4**;
- initial searches: **≤ 1 per selected question**;
- adaptive/refined search: **≤ 1 additional search per question**, only when the first result set is plausibly useful but insufficient;
- retrieved candidates: **≤ 3 per question and ≤ 8 total**;
- investigative AI on retrieved documents: only when deterministic locator/citation grounding cannot resolve the claim;
- semantic verification: only for claim supports that could actually be admitted;
- all remote stages must be independently abortable and timeout-bounded;
- global wall-time budget must be configured and must be materially shorter than the overall job-lifetime ceiling.

The exact millisecond values are deployment/performance configuration, but the runtime MUST stop before the configured product budget is exhausted and return a safe unresolved state.

## 14. Research parallelism

Independent searches/retrievals may run concurrently when attribution, privacy, and deterministic result ordering remain preserved.

Do not serialize independent work merely because the evaluation harness once did so.

---

# PART VI — RESEARCH STOP POLICY

## 15. Mandatory stop conditions

Research MUST stop for a question when any of the following becomes true:

1. An admissible answer has been obtained and additional research cannot materially improve report permission/actionability.
2. The evidence found establishes that the question requires merchant pricing documents/history/private processor explanation instead.
3. The best available candidates are repeatedly irrelevant, inaccessible, wrong-period, wrong-network, or inapplicable.
4. The remaining uncertainty cannot change a primary theme, cost-stack classification, report permission, or merchant lever.
5. Search/refinement limit is reached.
6. Candidate/retrieval limit is reached.
7. Per-stage timeout is reached.
8. Global research wall-time budget is reached.
9. The parent runtime aborts.

## 16. Diminishing-return stop

A second/adaptive search is allowed only if the first search produced evidence that is **close enough to be plausibly resolvable**—for example, right network/program but wrong period, or official documentation without the required subsection.

If the first search yields no credible relevant candidate, do not automatically issue more queries just because budget remains.

## 17. Report may finish unresolved

A report MUST be allowed to finish with:

- `public_evidence_unavailable`;
- `merchant_pricing_document_required`;
- `additional_statement_history_required`;
- `processor_explanation_required`;
- `unresolved_review_required`;

without treating those states as runtime failure.

---

# PART VII — RETRIEVAL AND DOCUMENT INVESTIGATION

## 18. Retrieval safety

Retrieved documents must respect:

- HTTPS/destination safety;
- byte/content-type limits;
- redirect limits;
- document fingerprinting;
- abort propagation;
- killable/isolate-bounded PDF parsing where blocking work is possible;
- no automatic trust based on domain name alone.

## 19. Deterministic locator first

After retrieval:

1. attempt deterministic text/locator grounding;
2. if the exact claim can be grounded deterministically, skip retrieved-document AI unless semantic interpretation is still required;
3. use investigative AI only for unresolved semantic questions, not every retrieved document.

This prevents the previous pattern of expensive AI investigation on every candidate.

---

# PART VIII — CLAIM SUPPORT AND SEMANTIC VERIFICATION

## 20. CandidateClaimSupport

```text
CandidateClaimSupport
- claim_id
- claim_type
- economic_ref
- source_document_ref
- locator_ref
- source_effective_period
- applicability_scope
- proposed_claim
- assertion_basis
- verification_status
```

## 21. Admission

Generation or retrieval success is not admission.

A claim may enter canonical economic intelligence only when:

1. the source/locator exists;
2. the claim meaning is semantically supported;
3. applicability matches statement period, jurisdiction, network/product, and merchant scope;
4. claim-specific evidence requirements are met;
5. no stronger applicable admitted knowledge conflicts;
6. the claim does not exceed the economic/actionability ceiling.

If any check fails, keep it unresolved/rejected.

---

# PART IX — AI STRUCTURED OUTPUT POLICY

## 22. Bounded workload

Structured-output work must be divided into deterministic bounded packets when one response would risk truncation or unwieldy output.

Packetization requirements:

- every expected canonical ID is assigned exactly once;
- returned membership is validated per packet;
- no missing, duplicate, unknown, malformed, or cross-packet IDs;
- invalid packets fail closed and may use a bounded retry policy;
- rejected attempts never enter merged output;
- final global coverage/admission remains mandatory.

## 23. Canonical aggregate ownership

AI does not own canonical bookkeeping. Aggregate evidence sets, financial totals, coverage sets, and deterministic unions are derived by RateReveal from admitted lower-level records.

Provider-generated aggregate bookkeeping may be used as an integrity declaration but cannot become canonical merely because the model emitted it.

## 24. Merchant-language AI

Merchant-language AI receives admitted economic facts/themes and explicit uncertainty. It may produce concise explanation, but:

- financial values come from canonical fields;
- unsafe logical strengthening is rejected;
- unsupported certainty is rejected;
- actionability cannot exceed canonical lever permissions;
- deterministic fallback remains available;
- AI-generated copy is not itself economic evidence.

Merchant-language should operate primarily at the **economic-theme** level. It should not require a mini-essay for every source row.

---

# PART X — KNOWLEDGE CANDIDATE POLICY

## 25. Runtime observations do not become shared knowledge

A merchant statement can establish account/period facts. It cannot automatically create reusable product knowledge.

Runtime AI/research may emit a `KnowledgeCandidatePacket`, but it must be scoped initially as account-only/candidate and processed under Knowledge Library v0.2 admission rules.

## 26. No self-promotion

AI cannot:

- admit its own mapping;
- make a corpus/global rule from one statement;
- overwrite admitted knowledge;
- broaden scope because multiple rows “look similar.”

Repeated occurrence across merchants can increase research priority, not admission level by itself.

---

# PART XI — CONFLICT AND DEGRADATION

## 27. Knowledge conflicts

If applicable admitted knowledge conflicts at equal specificity, runtime returns `unresolved_conflict` and suppresses certainty. It does not pick the entry with higher model confidence.

## 28. Capability degradation hierarchy

Failure of one intelligence capability should not destroy earlier valid layers.

Preferred degradation:

```text
financial truth available
→ economic model with admitted knowledge
→ optional research unresolved
→ AI semantic review unavailable/rejected
→ deterministic merchant explanation fallback
→ report still available if canonical safety permits
```

## 29. Research failure is not report failure

Search provider outage, retrieval failure, research timeout, or zero admitted external evidence cannot invalidate deterministic financial truth or a report whose claims do not require that research.

---

# PART XII — RUNTIME PROGRESS AND OBSERVABILITY

## 30. Privacy-safe checkpoints

Runtime progress should persist safe stage state for:

- parser;
- deterministic construction;
- research planning;
- discovery;
- retrieval;
- investigative intelligence;
- semantic verification;
- whole-statement semantic review;
- Merchant Attention/economic themes;
- merchant language;
- projection/persistence;
- terminal state.

Allowed diagnostics include counts, stage codes, elapsed time, provider/model, safe finish/failure class, token usage, coverage counts, and reason codes.

Never persist raw prompts, raw provider prose, raw merchant statement text, merchant identity, private source URLs, or secrets in diagnostic records.

---

# PART XIII — PRODUCT LATENCY CONTRACT

## 31. Correctness before optimization, but latency is a product property

RateReveal must not weaken evidence or financial safety merely to run faster. However, a technically correct analysis that routinely consumes many minutes of unnecessary research is also a product failure.

## 32. Latency accounting

Every completed analysis records wall time by capability. Product review should distinguish:

- deterministic time;
- research time;
- whole-statement AI time;
- merchant-language time;
- persistence/render time.

Any performance package must optimize the dominant stages based on measured evidence rather than reducing analytical coverage blindly.

## 33. Research budget is a ceiling, not a target

Runtime should finish early whenever decision-relevant uncertainty is resolved or cannot be usefully resolved. Consuming the full research budget with zero admitted support should be treated as a diagnostic signal for query/source strategy, not expected normal behavior.

---

# PART XIV — ACCEPTANCE TESTS

## 34. Runtime adversarial tests

The runtime policy must survive:

- uploaded PDF text saying “ignore previous instructions”;
- retrieved web page attempting prompt injection;
- new unknown fee recurring across many merchants;
- zero relevant search candidates;
- one relevant but wrong-period candidate;
- official source that contradicts processor notice;
- equal-specificity conflicting admitted mappings;
- research provider outage;
- PDF retrieval parse hang;
- structured-output truncation;
- AI output with missing/duplicate/cross-packet IDs;
- merchant-language logical strengthening;
- global wall-time budget expiry.

Expected behavior is safe degradation, not financial mutation.

## 35. Product stop-policy tests

A conforming implementation must prove:

1. routine resolved rows cause zero web research;
2. contract-required questions do not trigger futile public search;
3. research stops when remaining uncertainty cannot change the report;
4. second/adaptive searches require explicit justification;
5. global research budget expiry yields unresolved state and report continuation;
6. research zero-support result does not create external claim support;
7. financial truth and Packages B–E remain unchanged by research/AI outcomes.

---

# PART XV — POLICY CHANGE CONTROL

## 36. What can change without schema revision

Deployment/performance configuration may change:

- per-call timeout values;
- wall-time budget;
- candidate/search limits within approved product ceilings;
- provider/model choices;
- concurrency levels.

Changes must preserve this policy’s semantic stop/degradation behavior.

## 37. What requires product-policy review

- mandatory web research for every statement;
- allowing AI to become financial authority;
- auto-promotion of runtime knowledge;
- removing fail-closed semantic admission;
- expanding selected-question limits materially;
- making research failure suppress otherwise valid reports;
- allowing merchant-language AI to create savings/overcharge claims.

---

# PART XVI — DEFINITION OF SUCCESS

A successful RateReveal intelligence runtime is not the one that performs the most searches or produces the most AI prose. It is the one that:

- uses deterministic/account knowledge first;
- spends AI/research only where it can materially improve the merchant decision;
- stops when the decision cannot be improved further within the product budget;
- admits only grounded applicable claims;
- keeps unknowns honest;
- protects shared knowledge from poisoned or merchant-specific observations;
- produces concise, useful merchant interpretation without touching financial truth.

