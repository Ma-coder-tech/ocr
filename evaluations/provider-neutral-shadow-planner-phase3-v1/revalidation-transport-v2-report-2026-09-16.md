# Direct OpenAI provider-neutral planner — Phase 3 shadow evaluation

Mode: non-customer, non-authoritative shadow evaluation. Model: `gpt-5.2-2025-12-11`. OpenRouter disabled. Each call used a fresh transport session. Raw prompts, provider responses, and drafts were not persisted.

| Issue family | Corpus | Repeat | Result | Runtime | Input tokens | Output tokens | Cost µUSD | Latency ms | Connect ms | Headers ms | Body ms | Cleanup ms | Cleanup | Failure stage | Protected state unchanged | Offline baseline quality | Semantic repeatability | Safe errors |
|---|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---|---|
| SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 9046 | 1223 | 32953 | 21982 | 330 | 21715 | 267 | 9 | CONFIRMED | NONE | yes | yes | yes | — |
| SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS | DETERMINISTIC_GOLD_SELECTION | 2 | PASSED | COMPLETED | 9046 | 936 | 28935 | 14061 | 185 | 13799 | 262 | 2 | CONFIRMED | NONE | yes | yes | yes | — |
| QUALIFICATION_INTEGRITY_ROOT_CAUSE | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 8462 | 952 | 28137 | 15574 | 195 | 15342 | 232 | 2 | CONFIRMED | NONE | yes | yes | NO | — |
| QUALIFICATION_INTEGRITY_ROOT_CAUSE | DETERMINISTIC_GOLD_SELECTION | 2 | FAILED | SAFETY_BLOCKED | 8462 | 996 | 28753 | 15179 | 164 | 14919 | 260 | 21 | CONFIRMED | NONE | yes | — | NO | shadow_planner_forbidden_conclusion |
| PARTICIPANT_CONTROL_UNCERTAINTY | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 19811 | 1266 | 52394 | 17766 | 173 | 17506 | 260 | 14 | CONFIRMED | NONE | yes | yes | yes | — |
| PARTICIPANT_CONTROL_UNCERTAINTY | DETERMINISTIC_GOLD_SELECTION | 2 | PASSED | COMPLETED | 19811 | 1428 | 54662 | 19560 | 388 | 19290 | 270 | 4 | CONFIRMED | NONE | yes | yes | yes | — |
| GATEWAY_PROCESSOR_TERMINOLOGY | SYNTHETIC_NON_CUSTOMER_CONTRACT_CONTROL | 1 | PASSED | COMPLETED | 2376 | 985 | 17948 | 13019 | 166 | 12756 | 263 | 2 | CONFIRMED | NONE | yes | yes | yes | — |
| GATEWAY_PROCESSOR_TERMINOLOGY | SYNTHETIC_NON_CUSTOMER_CONTRACT_CONTROL | 2 | PASSED | COMPLETED | 2376 | 974 | 17794 | 13784 | 170 | 13512 | 272 | 2 | CONFIRMED | NONE | yes | yes | yes | — |
| AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 2850 | 944 | 18204 | 12804 | 170 | 12534 | 270 | 4 | CONFIRMED | NONE | yes | yes | yes | — |
| AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE | DETERMINISTIC_GOLD_SELECTION | 2 | PASSED | COMPLETED | 2850 | 1282 | 22936 | 19196 | 165 | 18942 | 254 | 2 | CONFIRMED | NONE | yes | yes | yes | — |
| COST_INCIDENCE_UNCERTAINTY | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 4885 | 1104 | 24005 | 15610 | 478 | 15609 | 1 | 2 | CONFIRMED | NONE | yes | yes | yes | — |
| COST_INCIDENCE_UNCERTAINTY | DETERMINISTIC_GOLD_SELECTION | 2 | PASSED | COMPLETED | 4885 | 1275 | 26399 | 20089 | 175 | 20087 | 2 | 1 | CONFIRMED | NONE | yes | yes | yes | — |
| CONTRACT_OFF_STATEMENT_EVIDENCE_NEED | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 19729 | 501 | 41540 | 7717 | 228 | 7573 | 144 | 1 | CONFIRMED | NONE | yes | yes | yes | — |
| CONTRACT_OFF_STATEMENT_EVIDENCE_NEED | DETERMINISTIC_GOLD_SELECTION | 2 | PASSED | COMPLETED | 19729 | 477 | 41204 | 8196 | 168 | 7978 | 218 | 2 | CONFIRMED | NONE | yes | yes | yes | — |

## Result

- Phase 3 status: **FAILED**.
- Issue-family coverage: 7/7; passed: 6; failed: 1.
- Provider calls: 14/14; retries: 0; fallback attempts: 0.
- Tokens: 134318 input / 14343 output. Estimated cost: $0.435864.
- Repeatable semantic signatures: false. Offline-baseline quality matched: false.
- Protected state unchanged: true. Transport dispatch halted: false. Customer outputs: 0. Truth mutations: 0. Source admissions: 0. Research operations: 0.
