# Provider-neutral shadow planner — bounded requalification

Mode: bounded non-customer live requalification. Deadline: 60000 ms per call. Reasoning: `none`; verbosity: `low`. Raw prompts, provider responses, and drafts were not persisted.

| Adapter | Pinned model | Stage | Result | Runtime | Input tokens | Output tokens | Cost µUSD | Latency ms | Protected state unchanged | Cross-request replay rejected | Safe errors |
|---|---|---|---|---|---:|---:|---:|---:|---|---|---|
| OPENAI_DIRECT | gpt-5.2-2025-12-11 | SCHEMA_CONTROL | FAILED | SAFETY_BLOCKED | 1802 | 1312 | 21522 | 19288 | yes | — | shadow_planner_required_evidence_class_invalid |
| OPENAI_DIRECT | gpt-5.2-2025-12-11 | ADVERSARIAL_REFERENCE_CONTROL | SKIPPED | — | 0 | 0 | 0 | 0 | yes | — | — |
| OPENAI_DIRECT | gpt-5.2-2025-12-11 | GOLD_CONTROL | SKIPPED | — | 0 | 0 | 0 | 0 | yes | — | — |
| OPENROUTER | openai/gpt-5.2 | SCHEMA_CONTROL | FAILED | UNAVAILABLE | 0 | 0 | 0 | 0 | yes | — | shadow_planner_openrouter_model_or_endpoint_rejected |
| OPENROUTER | openai/gpt-5.2 | ADVERSARIAL_REFERENCE_CONTROL | SKIPPED | — | 0 | 0 | 0 | 0 | yes | — | — |
| OPENROUTER | openai/gpt-5.2 | GOLD_CONTROL | SKIPPED | — | 0 | 0 | 0 | 0 | yes | — | — |

## Result

- Qualified adapters: none.
- Rejected adapters: openai-direct-responses-v1, openrouter-chat-completions-v1.
- Provider calls: 2; maximum permitted was six across two independent adapters.
- Retries: 0. Automatic provider fallback: disabled.
- Protected state unchanged: true. Customer outputs: 0. Truth mutations: 0.
