# Direct OpenAI provider-neutral planner — Phase 3 shadow evaluation

Mode: non-customer, non-authoritative shadow evaluation. Model: `gpt-5.2-2025-12-11`. OpenRouter disabled. Each call used a fresh transport session. Raw prompts, provider responses, and drafts were not persisted.

| Issue family | Corpus | Repeat | Result | Runtime | Input tokens | Output tokens | Cost µUSD | Latency ms | Connect ms | Headers ms | Body ms | Cleanup ms | Cleanup | Failure stage | Protected state unchanged | Offline baseline quality | Semantic repeatability | Safe errors |
|---|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---|---|
| SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 9242 | 898 | 28746 | 15243 | 420 | 14945 | 298 | 4 | CONFIRMED | NONE | yes | yes | yes | — |
| SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS | DETERMINISTIC_GOLD_SELECTION | 2 | PASSED | COMPLETED | 9242 | 1092 | 31462 | 17378 | 179 | 17107 | 271 | 4 | CONFIRMED | NONE | yes | yes | yes | — |
| QUALIFICATION_INTEGRITY_ROOT_CAUSE | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 8658 | 1061 | 30006 | 17544 | 170 | 17257 | 287 | 2 | CONFIRMED | NONE | yes | yes | yes | — |
| QUALIFICATION_INTEGRITY_ROOT_CAUSE | DETERMINISTIC_GOLD_SELECTION | 2 | PASSED | COMPLETED | 8658 | 1015 | 29362 | 16662 | 166 | 16398 | 264 | 3 | CONFIRMED | NONE | yes | yes | yes | — |
| PARTICIPANT_CONTROL_UNCERTAINTY | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 20007 | 1337 | 53731 | 18705 | 167 | 18382 | 323 | 2 | CONFIRMED | NONE | yes | yes | yes | — |
| PARTICIPANT_CONTROL_UNCERTAINTY | DETERMINISTIC_GOLD_SELECTION | 2 | PASSED | COMPLETED | 20007 | 1210 | 51953 | 22281 | 284 | 22052 | 229 | 5 | CONFIRMED | NONE | yes | yes | yes | — |
| GATEWAY_PROCESSOR_TERMINOLOGY | SYNTHETIC_NON_CUSTOMER_CONTRACT_CONTROL | 1 | PASSED | COMPLETED | 2572 | 1003 | 18543 | 16175 | 402 | 15705 | 470 | 3 | CONFIRMED | NONE | yes | yes | yes | — |
| GATEWAY_PROCESSOR_TERMINOLOGY | SYNTHETIC_NON_CUSTOMER_CONTRACT_CONTROL | 2 | PASSED | COMPLETED | 2572 | 849 | 16387 | 11877 | 287 | 11621 | 256 | 2 | CONFIRMED | NONE | yes | yes | yes | — |
| AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 3046 | 1257 | 22929 | 16995 | 555 | 16988 | 7 | 3 | CONFIRMED | NONE | yes | yes | yes | — |
| AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE | DETERMINISTIC_GOLD_SELECTION | 2 | PASSED | COMPLETED | 3046 | 1200 | 22131 | 16738 | 281 | 16577 | 161 | 3 | CONFIRMED | NONE | yes | yes | yes | — |
| COST_INCIDENCE_UNCERTAINTY | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 5081 | 1130 | 24712 | 15739 | 764 | 15452 | 287 | 1 | CONFIRMED | NONE | yes | yes | yes | — |
| COST_INCIDENCE_UNCERTAINTY | DETERMINISTIC_GOLD_SELECTION | 2 | PASSED | COMPLETED | 5081 | 1154 | 25048 | 16689 | 179 | 16462 | 227 | 1 | CONFIRMED | NONE | yes | yes | yes | — |
| CONTRACT_OFF_STATEMENT_EVIDENCE_NEED | DETERMINISTIC_GOLD_SELECTION | 1 | PASSED | COMPLETED | 19925 | 535 | 42359 | 41106 | 214 | 41001 | 105 | 4 | CONFIRMED | NONE | yes | yes | yes | — |
| CONTRACT_OFF_STATEMENT_EVIDENCE_NEED | DETERMINISTIC_GOLD_SELECTION | 2 | PASSED | COMPLETED | 19925 | 526 | 42233 | 8768 | 168 | 8491 | 277 | 2 | CONFIRMED | NONE | yes | yes | yes | — |

## Result

- Phase 3 status: **PASSED**.
- Issue-family coverage: 7/7; passed: 7; failed: 0.
- Provider calls: 14/14; retries: 0; fallback attempts: 0.
- Tokens: 137062 input / 14267 output. Estimated cost: $0.439602.
- Repeatable semantic signatures: true. Offline-baseline quality matched: true.
- Protected state unchanged: true. Transport dispatch halted: false. Customer outputs: 0. Truth mutations: 0. Source admissions: 0. Research operations: 0.
