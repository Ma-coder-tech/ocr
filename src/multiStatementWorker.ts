import {
  appendMultiStatementJobEvent,
  listRunnableMultiStatementJobs,
  updateMultiStatementJobStatus,
} from "./multiStatementStore.js";
import { processMultiStatementAnalysisJob } from "./multiStatementOrchestrator.js";

const queue = new Set<string>();
let busy = false;
let tickScheduled = false;

function scheduleTick(): void {
  if (tickScheduled) return;
  tickScheduled = true;
  setTimeout(() => {
    tickScheduled = false;
    void tick();
  }, 0);
}

export function enqueueMultiStatementJob(jobId: string): void {
  queue.add(jobId);
  scheduleTick();
}

export function hydrateRunnableMultiStatementJobs(): void {
  for (const job of listRunnableMultiStatementJobs()) {
    queue.add(job.id);
    appendMultiStatementJobEvent({
      multiStatementJobId: job.id,
      stage: "job_resumed",
      message: "Multi-statement job resumed after server startup.",
    });
  }
  scheduleTick();
}

async function tick(): Promise<void> {
  if (busy) return;
  const next = queue.values().next().value as string | undefined;
  if (!next) return;

  queue.delete(next);
  busy = true;
  try {
    await processMultiStatementAnalysisJob(next, { narrative: { enabled: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateMultiStatementJobStatus(
      next,
      { status: "failed", error: message },
      message,
    );
    appendMultiStatementJobEvent({
      multiStatementJobId: next,
      stage: "job_failed",
      message,
    });
  } finally {
    busy = false;
    void tick();
  }
}
