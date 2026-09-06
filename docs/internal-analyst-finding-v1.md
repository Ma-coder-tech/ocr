# Internal Analyst Finding v1

Status: implemented for internal evaluation only. It has no customer-report or production authority.

## Boundary

`buildInternalAnalystFindingV1` consumes an already-built canonical statement analysis, deterministic pricing-model evidence, governed statement context, optional merchant context, and optional research contributions. It never writes back to canonical analysis. A fingerprint over identity, financial facts, fee ledger, reconciliation evidence, and the version manifest is checked before and after every run.

The finding keeps identity, category, mechanic, collector, beneficiary, rule setter, underlying price setter, merchant-facing price controller, arithmetic, pricing model/population, reasonableness, negotiability, behavioral influence, waivability, contractual compliance, uncertainty, materiality, and merchant action as separate claims. Each claim has a discrete confidence class and evidence basis.

## One knowledge authority

`GovernedPaymentKnowledgeAuthority` is the only reusable knowledge interface used by this milestone. It currently exposes:

- the qualified fee-semantics catalog and Fiserv alias pack for identity/mechanic/participant claims;
- Product-approved, owned, dated, versioned E5 professional norms for commercial judgments; and
- an explicit research-admission boundary.

The legacy fee catalog is retrieval-only, and the older `feeKnowledge` system is research transport—not an independent truth source. This is an adapter/facade convergence step; durable migration of all admitted knowledge into the canonical V2 knowledge store remains future work.

Material unresolved or competing fee identities are automatically converted into a bounded internal research queue. That queue reuses the existing `feeKnowledge` search/retrieval machinery only as transport. Before queueing, legacy deterministic category, ownership, contract-control, confidence, and actionability assertions are neutralized so they cannot become research premises. The report builder does not make network calls; a separate controlled research run consumes selected questions, and results remain leads until the admission gate accepts independent evidence and analyst review.

## Evidence and safety gates

- E1 statement facts and exact rational arithmetic remain deterministic.
- E3/E4 published sources and qualified knowledge can support semantic claims.
- E5 norms are always labeled professional industry judgment, never official network fact. Every band has owner, source fingerprint, review date, version, and 12-month expiry.
- E8 AI-only output remains a candidate or competing interpretation. An AI-assisted research contribution can resolve a semantic claim only when it also has non-AI evidence, source references, a review date, and an auditable admission decision carrying reviewer identity, document fingerprint, and evidence-locator hash.
- Unresolved material questions are actively queued, with a deterministic search-call cap, while already admitted resolutions are removed from the queue.
- AI/research cannot change amounts, fee membership, reconciliation, pricing-model evidence, or canonical truth.
- Commercial reasonableness is withheld without supported vertical and risk context.
- Processor markup is not fabricated where interchange or the relevant population is not exposed.
- Contract compliance is `contract_required` without merchant-specific documents. Ordinary requests for itemization, review, reduction, configuration help, or waiver do not require the agreement.
- The artifact is single-period: it does not infer recurrence or annual savings.

## Evaluation

Run `npm run evaluate:internal-analyst-finding`. The harness uses three real supported Fiserv gold PDFs and checks the eight Product acceptance examples plus the no-fabricated-markup gate. Tests live in `test/canonical/internalAnalystFindingV1.test.ts`.
