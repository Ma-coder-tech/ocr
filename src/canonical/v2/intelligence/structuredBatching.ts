import type { StructuredBatchRequest, StructuredBatchResponse } from "./intelligenceTypes.js";

type Identified = { itemId: string };

export function partitionStructuredItems<T extends Identified>(params: {
  runId: string;
  stageCode: string;
  schemaVersion: string;
  reservationIds: string[];
  items: readonly T[];
  maximumItemsPerBatch: number;
  maximumOutputTokens: number;
}): Array<StructuredBatchRequest<T>> {
  if (!Number.isInteger(params.maximumItemsPerBatch) || params.maximumItemsPerBatch < 1) throw new Error("invalid_structured_batch_limit");
  const ids = params.items.map((item) => item.itemId);
  if (new Set(ids).size !== ids.length || ids.some((id) => !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(id))) {
    throw new Error("invalid_or_duplicate_structured_item_identity");
  }
  const batches: Array<StructuredBatchRequest<T>> = [];
  for (let offset = 0; offset < params.items.length; offset += params.maximumItemsPerBatch) {
    const items = params.items.slice(offset, offset + params.maximumItemsPerBatch);
    const batchNumber = batches.length + 1;
    const reservationId = params.reservationIds[batches.length];
    if (!reservationId) throw new Error("missing_structured_batch_reservation");
    batches.push({
      batchId: `${params.runId}:${params.stageCode}:batch-${String(batchNumber).padStart(2, "0")}`,
      attemptId: `${params.runId}:${params.stageCode}:attempt-${String(batchNumber).padStart(2, "0")}`,
      schemaVersion: params.schemaVersion,
      expectedItemIds: items.map((item) => item.itemId),
      reservationId,
      maximumOutputTokens: params.maximumOutputTokens,
      logicalAttempt: 1,
      items: [...items],
      untrustedContentPolicy: "data_only_no_instructions",
    });
  }
  return batches;
}

export function validateStructuredBatchResponse<T extends Identified>(
  request: StructuredBatchRequest<Identified>,
  response: StructuredBatchResponse<T>,
): string[] {
  const issues: string[] = [];
  if (response.batchId !== request.batchId) issues.push("structured_batch_id_mismatch");
  if (response.attemptId !== request.attemptId) issues.push("structured_attempt_id_mismatch");
  if (response.schemaVersion !== request.schemaVersion) issues.push("structured_schema_version_mismatch");
  if (!Array.isArray(response.items)) return [...issues, "structured_items_malformed"];
  const returned = response.items.map((item) => item?.itemId);
  const expected = request.expectedItemIds;
  if (returned.some((id) => typeof id !== "string")) issues.push("structured_item_id_malformed");
  if (new Set(returned).size !== returned.length) issues.push("structured_duplicate_item_id");
  if (expected.some((id) => !returned.includes(id))) issues.push("structured_missing_item_id");
  if (returned.some((id) => !expected.includes(id))) issues.push("structured_unknown_or_cross_batch_item_id");
  if (returned.length !== expected.length) issues.push("structured_membership_count_mismatch");
  if (response.reportedOutputTokens !== null && (!Number.isInteger(response.reportedOutputTokens) || response.reportedOutputTokens < 0)) {
    issues.push("structured_invalid_token_usage");
  }
  if (response.reportedOutputTokens !== null && response.reportedOutputTokens > request.maximumOutputTokens) issues.push("structured_output_token_limit_exceeded");
  return [...new Set(issues)];
}

export function validateGlobalStructuredCoverage(expectedItemIds: readonly string[], acceptedItemIds: readonly string[]): string[] {
  const issues: string[] = [];
  if (new Set(expectedItemIds).size !== expectedItemIds.length) issues.push("global_expected_identity_duplicate");
  if (new Set(acceptedItemIds).size !== acceptedItemIds.length) issues.push("global_accepted_identity_duplicate");
  if (expectedItemIds.some((id) => !acceptedItemIds.includes(id))) issues.push("global_identity_coverage_missing");
  if (acceptedItemIds.some((id) => !expectedItemIds.includes(id))) issues.push("global_identity_coverage_unknown");
  return issues;
}
