# RateReveal Runtime Intelligence Policy Amendment v0.4

**Status:** Frozen product-owner-approved amendment
**Identity:** `frozen_product_model_runtime_policy_amendment_v0_4`
**Approved:** 2026-08-31
**Amends:** Runtime Intelligence Policy Amendment v0.3

## 1. Purpose and preserved authority

This amendment replaces lifetime emergency-ceiling admission as the ordinary recovery gate with an eligibility-driven, continuously replenishing operational allowance. It changes dispatch permission and scheduling only. It does not change evidence admission, semantic authority, materiality, analytical completion, financial truth, RF governance, provider authorization, qualified-public-read behavior, reconciliation, or customer-report authority.

Historical usage, failures, no-progress history, evidence, research outcomes, and operation identities remain permanent. Replenishment never resets or deletes them.

## 2. No mandatory epoch

Operational recovery has no fixed mandatory epoch boundary. A healthy AnalysisRun proceeds continuously while its exact work remains semantically authorized and operational admission remains available. A paused run becomes eligible at the earliest instant when all applicable gates admit execution:

1. the exact claim/work authorization is still current;
2. provider cooldown has expired;
3. the bound provider and configuration are ready;
4. sufficient replenished operational allowance is available; and
5. no reconciliation-required or exceptional operational hold applies.

The resulting `nextEligibleAt` is an operational scheduling fact. It is not evidence, claim resolution, diminishing returns, safe unresolved status, or analytical completion.

## 3. Continuously replenishing allowance

RateReveal may use bounded token-bucket or equivalently continuous allowance accounting for provider calls, retrieved bytes, active execution time, concurrency, and spend/resource dimensions supported by the runtime. Capacity and replenishment renew permission to dispatch; all historical consumption remains durably and cumulatively recorded.

Burst capacity, replenishment rates, concurrency, jitter, timeout, and ordinary cooldown values are deployment calibration. They are not product semantics. Replenishment cannot make work eligible unless the existing semantic controller independently and currently authorizes that exact work, and it cannot turn unchanged unsuccessful evidence into analytical progress.

## 4. Provider cooldown and readiness

When a provider supplies a valid `Retry-After`, RateReveal respects it. Otherwise, retry-eligible transient failures may use short bounded exponential backoff with deployment-calibrated jitter. A new attempt remains separately identified and cumulatively accounted.

Authentication, account, model, authorization, credential, and configuration failures do not enter an indefinite timed retry loop. They wait for the relevant non-secret provider-readiness/configuration identity to change, after which all semantic and operational gates are revalidated before any send.

Provider cooldown and allowance are independent. The effective eligibility time is the latest applicable gate, not a coarse global period.

## 5. Durable automatic wake-up

The existing durable AnalysisRun recovery intent stores its exact binding, typed wait gate, and `nextEligibleAt`. A long-lived worker schedules the earliest due intent. On restart, it reconstructs the same current gate from durable operation, resource, recovery-event, and configuration lineage. Leases and compare-and-swap transitions ensure that one due intent is claimed once; a live adaptive-cycle lease prevents another worker from taking ownership.

Ordinary recovery requires no human action. Every resumed send revalidates current continuation authority, plan and semantic bindings, provider readiness, allowance, reconciliation state, and lease ownership.

## 6. Exceptional runaway hold

A separate, larger aggregate emergency guard may pause automatic execution across long periods when historical consumption indicates runaway behavior, pathological looping, or extraordinary spend/resource exposure. This hold does not erase usage, resolve work, or assert analytical completion. The AnalysisRun remains operationally stopped with its unresolved claims preserved until an authorized operational configuration/release condition changes.

The aggregate thresholds are deployment safeguards, not correctness thresholds. They must be materially separate from ordinary burst/replenishment calibration.

## 7. Completion and unchanged behavior

Operational allowance exhaustion, cooldown, provider unavailability, retry exhaustion, waiting, or renewed allowance never establishes analytical completion. Completion remains governed only by Runtime Policy Amendment v0.2's semantic rule: continue while material, legitimately resolvable uncertainty remains and useful progress is being made; stop when the trustworthy answer is complete or further work cannot materially improve it.

Runtime Policy Amendment v0.3 remains unchanged for qualified public reads. Unqualified possible-send ambiguity remains reconciliation-required. This amendment authorizes no new provider, evidence class, RF knowledge, benchmark, savings, business-type, customer-report, or statement-family behavior.

## 8. Integrity and future change

This Markdown artifact is immutable at its frozen identity. Its integrity lock records its byte count and SHA-256 digest, its exact v0.3 parent, and the Frozen Product Model baseline. Further semantic change requires another separately approved versioned amendment and traceability update.
