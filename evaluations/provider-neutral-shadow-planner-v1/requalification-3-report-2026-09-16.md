# Provider-neutral shadow planner — bounded requalification

Mode: bounded non-customer live requalification. Deadline: 60000 ms per call. Reasoning: `none`; verbosity: `low`. Raw prompts, provider responses, and drafts were not persisted.

| Adapter | Pinned model | Stage | Result | Runtime | Input tokens | Output tokens | Cost µUSD | Latency ms | Protected state unchanged | Cross-request replay rejected | Safe errors |
|---|---|---|---|---|---:|---:|---:|---:|---|---|---|
| OPENAI_DIRECT | gpt-5.2-2025-12-11 | SCHEMA_CONTROL | PASSED | COMPLETED | 2072 | 1026 | 17990 | 17136 | yes | — | — |
| OPENAI_DIRECT | gpt-5.2-2025-12-11 | ADVERSARIAL_REFERENCE_CONTROL | PASSED | COMPLETED | 2092 | 817 | 15099 | 11853 | yes | yes | — |
| OPENAI_DIRECT | gpt-5.2-2025-12-11 | GOLD_CONTROL | PASSED | COMPLETED | 2282 | 1240 | 21354 | 17125 | yes | — | — |
| OPENROUTER | openai/gpt-5.2 | SCHEMA_CONTROL | FAILED | SAFETY_BLOCKED | 2072 | 1161 | 19880 | 20487 | yes | — | alternativeHypotheses[0]_epistemic_boundary_incomplete, alternativeHypotheses[1]_epistemic_boundary_incomplete |
| OPENROUTER | openai/gpt-5.2 | ADVERSARIAL_REFERENCE_CONTROL | SKIPPED | — | 0 | 0 | 0 | 0 | yes | — | — |
| OPENROUTER | openai/gpt-5.2 | GOLD_CONTROL | SKIPPED | — | 0 | 0 | 0 | 0 | yes | — | — |

## Result

- Qualified adapters: openai-direct-responses-v1.
- Rejected adapters: openrouter-responses-v1.
- Provider calls: 4; maximum permitted was six across two independent adapters.
- Retries: 0. Automatic provider fallback: disabled.
- Protected state unchanged: true. Customer outputs: 0. Truth mutations: 0.
