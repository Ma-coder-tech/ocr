# Package C dynamic-schema inventory

Baseline: Package B commit `95894841a9cb09487bbcfd26565a35ea2e1f3761`.

| Provider-schema surface before Package C | Classification | Package C treatment |
|---|---|---|
| `exactCitedFactRefs[].items.enum` generated from packet fact aliases | C — packet-specific whitelist | Replaced with the fixed `FACT` alias-token pattern. Exact issued membership remains local. |
| Hypothesis `supportingFactRefs` and `contradictingFactRefs` enums generated from packet fact/governed/charge aliases | C — packet-specific whitelist | Replaced with a fixed typed support-token pattern covering only the previously permitted fact/governed/charge classes. Exact membership and class authorization remain local. |
| Reconstruction-suspicion reference enums generated from packet fact/governed/charge aliases | C — packet-specific whitelist | Replaced with the same fixed support-token pattern; local validation remains authoritative. |
| Statement-evidence aliases present in the provider packet | C — request-local provenance tokens, but not an accepted planner-output citation class | They remain fully present in the packet and privacy-contained. They are not added to output citation fields, preserving the accepted evidence authority. |
| `issueId.const` generated from the selected packet | C — request binding that belongs locally | Replaced with a fixed identifier-shape pattern. Exact equality remains enforced by the Package B request map and existing planner validator. |
| `inputHash.const` generated from the provider packet | C — request binding that belongs locally | Replaced with the existing fixed 64-hex structural pattern. Exact equality remains locally enforced and restored to the trusted internal hash. |
| `requiredEvidenceClasses[].items.enum` generated from the packet-specific allowed subset | C — request-specific whitelist | Replaced with the complete fixed Product-domain evidence-class enum. The packet-specific allowed subset remains enforced by the existing planner validator. |
| Resolution paths, confidence levels, reconstruction recheck types | A — fixed Product-domain enums | Retained unchanged because their values are independent of the request. |
| Output schema version, inference/authority/admission/truth constants, mutation/rendering prohibitions, reconstruction authority constants, unresolved status | B — fixed output-contract consts | Retained unchanged because they encode permanent safety and authority boundaries. |
| Required object keys, array/object shape, fixed `additionalProperties: false`, fixed list bounds and text constraints | Fixed structural contract | Retained. Provider translation still removes only provider-unsupported length and maximum-item keywords; deterministic local checks preserve those constraints. |
| Issue-specific schema branches or packet-derived `required` arrays | D — unnecessary specialization | None existed; no such specialization was added. |

Package C uses one schema name and version across the full-planner and issue-grounded request builders. The provider schema contains no issued alias, merchant value, statement period, issue identifier, packet hash, reference count, or request-specific allowed-evidence subset.

The stable provider schema describes output shape and typed token syntax only. Provider-schema acceptance is not evidence admission: exact request binding, issued membership, class validation, duplicate/collision rejection, reverse mapping, and semantic validation remain deterministic local controls.
