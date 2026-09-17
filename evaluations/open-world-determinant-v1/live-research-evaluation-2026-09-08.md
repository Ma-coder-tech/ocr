# Open-World Determinant v1 — controlled live research evaluation

Date: 2026-09-08

Status: evaluation-only; no governed admission

Approved statement: `fsv-gold-nov-2024` (`Nov_2024_Statement.pdf`)

## Execution controls

- Exactly two bounded research attempts were executed, one per approved fee.
- Each attempt returned at most two discovery candidates.
- Automatic retries and fallback providers were disabled.
- OpenAI Responses requests used `store: false`.
- Provider-bound statement context was limited to processor name, statement year, statement role, and the two fee labels with all numeric terms redacted. Retrieved public-source excerpts were the only additional content sent.
- Merchant identity, account numbers, canonical financial amounts, the whole statement, and canonical D1-D4 conclusions were not sent.
- Semantic verification requiring non-authorized structured determinant fields was kept local and returned unsupported for this evaluation.

Provider accounting recorded seven Responses API calls: two bounded web-search requests, one two-fee statement-context investigation, and four retrieved-document investigations. The two web-search responses contained four provider `web_search_call` records in aggregate even though each request set `max_tool_calls: 1`; this is retained as a transparent provider-accounting observation rather than treated as four RateReveal research attempts.

## Fee results

### Monthly Advantage Fee MCVDB

The determinant ladder escalated because exact identity, family/economic layer, price controller, and the intended assessed population were not established.

Discovery returned:

- `https://www.ccrta.org/wp-content/uploads/2023/09/Addendum-No.-1.pdf` — unavailable during retrieval (HTTP 429) and not usable.
- `https://www.scribd.com/document/977727479/Adobe-Acrobat-Sign-Agreement-Unsigned` — retrieved, but source-inapplicable.

AI research proposed only low-confidence hypotheses: “Monthly Advantage” may be a proprietary processor/acquirer/reseller program or bundled service; `MCVDB` may be an internal multi-brand/population abbreviation; and competing network pass-through, account-maintenance, or other service interpretations remain possible. No source established the exact identity, owner, controller, unit, population, or published price.

Result: no governed D1, D2, D3, or D4 change; no confidence change. The hypotheses were retained only as competing interpretations. Source quality failed the admission threshold, so `S4_SOURCE_QUALITY_FAILURE` is the appropriate stopping result for this pass.

### Batch Settlement Fee

The determinant ladder escalated because the exact identity and billed unit/population remained unresolved even though existing admitted knowledge already supported family `F6`, acquiring-commercial layer, and action class `N3`.

Discovery returned:

- `https://merchants.fiserv.com/content/dam/firstdata/au/en/documents/Gateway_Virtual_Terminal_User_Guide.pdf` — retrieved official Fiserv material, but wrong geography/context and source-inapplicable.
- `https://merchants.fiserv.com/content/dam/s7/firstdata/us/en/article_listing/FirstData_ULWebinarl.pptx.pdf` — retrieved official Fiserv material, but it did not define or price the fee and was source-inapplicable.

AI research proposed that the label likely concerns closing, submitting, or settling transaction batches and is more consistent with processor/acquirer/gateway/platform pricing than interchange. It also preserved the central competing mechanics: per settled batch, per underlying transaction, or a statement-system count of fee events. The retrieved material did not resolve those alternatives.

Result: no governed D1, D2, D3, or D4 change; no confidence change. The research sharpened the unresolved mechanic and follow-up request but did not improve the evidence tier. `S4_SOURCE_QUALITY_FAILURE` is the appropriate stopping result for this pass.

## Safety and authority result

- Candidate-only analyst contributions added: 2.
- Governed/admitted research resolutions before: 0; after: 0.
- Reusable knowledge self-admitted: no.
- Governed D1-D4 rows changed: 0.
- Governed confidence rows changed: 0.
- Governed knowledge-authority fingerprint changed: no.
- Canonical financial fingerprint before, after, and in the rebuilt report: `568968da58d41d4092e86161cbf9997620422b1bf6c375bca5fc89fd7a27c445`.

This evaluation therefore demonstrates a useful negative result: live research can add candidate interpretations and a better investigation path without converting weak search results into facts, changing canonical statement truth, or self-admitting reusable knowledge.
