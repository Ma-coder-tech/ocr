# Direct OpenAI provider-neutral planner — Phase 3 shadow evaluation

Mode: non-customer, non-authoritative shadow evaluation. Model: `gpt-5.2-2025-12-11`. OpenRouter disabled. Raw prompts, provider responses, and drafts were not persisted.

| Issue family | Corpus | Repeat | Result | Runtime | Input tokens | Output tokens | Cost µUSD | Latency ms | Protected state unchanged | Offline baseline quality | Semantic repeatability | Safe errors |
|---|---|---:|---|---|---:|---:|---:|---:|---|---|---|---|
| SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 9046 | 1107 | 31329 | 22406 | yes | yes | yes | — |
| SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS | DETERMINISTIC_GOLD_SELECTION | 2 | PASSED | COMPLETED | 9046 | 1188 | 32463 | 20913 | yes | yes | yes | — |
| QUALIFICATION_INTEGRITY_ROOT_CAUSE | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 8462 | 1148 | 30881 | 19754 | yes | yes | yes | — |
| QUALIFICATION_INTEGRITY_ROOT_CAUSE | DETERMINISTIC_GOLD_SELECTION | 2 | PASSED | COMPLETED | 8462 | 1260 | 32449 | 21380 | yes | yes | yes | — |
| PARTICIPANT_CONTROL_UNCERTAINTY | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 19811 | 1260 | 52310 | 20541 | yes | yes | NO | — |
| PARTICIPANT_CONTROL_UNCERTAINTY | DETERMINISTIC_GOLD_SELECTION | 2 | FAILED | UNAVAILABLE | 0 | 0 | 0 | 0 | yes | — | NO | shadow_planner_provider_timeout |
| GATEWAY_PROCESSOR_TERMINOLOGY | SYNTHETIC_NON_CUSTOMER_CONTRACT_CONTROL | 1 | PASSED | COMPLETED | 2376 | 952 | 17486 | 15764 | yes | yes | NO | — |
| GATEWAY_PROCESSOR_TERMINOLOGY | SYNTHETIC_NON_CUSTOMER_CONTRACT_CONTROL | 2 | FAILED | UNAVAILABLE | 0 | 0 | 0 | 0 | yes | — | NO | shadow_planner_provider_timeout |
| AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 2850 | 1394 | 24504 | 21908 | yes | yes | NO | — |
| AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE | DETERMINISTIC_GOLD_SELECTION | 2 | FAILED | UNAVAILABLE | 0 | 0 | 0 | 0 | yes | — | NO | shadow_planner_provider_timeout |
| COST_INCIDENCE_UNCERTAINTY | DETERMINISTIC_GOLD_SELECTION | 1 | FAILED | UNAVAILABLE | 0 | 0 | 0 | 0 | yes | — | — | shadow_planner_provider_network_failed |
| COST_INCIDENCE_UNCERTAINTY | DETERMINISTIC_GOLD_SELECTION | 2 | SKIPPED | — | 0 | 0 | 0 | 0 | yes | — | — | — |
| CONTRACT_OFF_STATEMENT_EVIDENCE_NEED | DETERMINISTIC_GOLD_SELECTION | 1 | FAILED | UNAVAILABLE | 0 | 0 | 0 | 0 | yes | — | — | shadow_planner_provider_network_failed |
| CONTRACT_OFF_STATEMENT_EVIDENCE_NEED | DETERMINISTIC_GOLD_SELECTION | 2 | SKIPPED | — | 0 | 0 | 0 | 0 | yes | — | — | — |

## Result

- Phase 3 status: **FAILED**.
- Issue-family coverage: 7/7; passed: 2; failed: 5.
- Provider calls: 12/14; retries: 0; fallback attempts: 0.
- Tokens: 60053 input / 8309 output. Estimated cost: $0.221422.
- Repeatable semantic signatures: false. Offline-baseline quality matched: false.
- Protected state unchanged: true. Customer outputs: 0. Truth mutations: 0. Source admissions: 0. Research operations: 0.
