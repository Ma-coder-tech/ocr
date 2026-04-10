import { randomUUID } from "node:crypto";
import { Job, JobEvent, JobStatus } from "./types.js";

const jobs = new Map<string, Job>();
const MAX_IN_MEMORY_JOBS = Math.max(50, Number(process.env.MAX_IN_MEMORY_JOBS ?? 500));
const TERMINAL_JOB_RETENTION_HOURS = Math.max(1, Number(process.env.TERMINAL_JOB_RETENTION_HOURS ?? 24));

function isTerminal(status: JobStatus): boolean {
  return status === "completed" || status === "failed";
}

function pruneJobs(): void {
  const cutoffMs = Date.now() - TERMINAL_JOB_RETENTION_HOURS * 60 * 60 * 1000;

  for (const [id, job] of jobs) {
    if (!isTerminal(job.status)) continue;
    const updatedAtMs = new Date(job.updatedAt).getTime();
    if (Number.isFinite(updatedAtMs) && updatedAtMs < cutoffMs) {
      jobs.delete(id);
    }
  }

  if (jobs.size <= MAX_IN_MEMORY_JOBS) return;

  for (const [id, job] of jobs) {
    if (jobs.size <= MAX_IN_MEMORY_JOBS) break;
    if (isTerminal(job.status)) {
      jobs.delete(id);
    }
  }

  while (jobs.size > MAX_IN_MEMORY_JOBS) {
    const oldest = jobs.keys().next().value as string | undefined;
    if (!oldest) break;
    jobs.delete(oldest);
  }
}

export function createJob(input: {
  fileName: string;
  filePath: string;
  fileType: "csv" | "pdf";
}): Job {
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    fileName: input.fileName,
    filePath: input.filePath,
    fileType: input.fileType,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    progress: 0,
    events: [
      {
        at: now,
        stage: "queued",
        message: "Job queued",
      },
    ],
  };

  jobs.set(job.id, job);
  pruneJobs();
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function listEvents(id: string): JobEvent[] {
  const job = jobs.get(id);
  return job?.events ?? [];
}

export function updateJob(
  id: string,
  patch: Partial<Pick<Job, "status" | "progress" | "error" | "summary">>,
  message?: string,
): Job {
  const job = jobs.get(id);
  if (!job) {
    throw new Error(`Job ${id} not found`);
  }

  const next: Job = {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  if (message && next.status) {
    next.events = [
      ...next.events,
      {
        at: next.updatedAt,
        stage: next.status,
        message,
      },
    ];
  }

  jobs.set(id, next);
  pruneJobs();
  return next;
}

export function failJob(id: string, error: string): Job {
  return updateJob(id, { status: "failed", progress: 100, error }, error);
}

export function stageUpdate(id: string, status: JobStatus, progress: number, message: string): Job {
  return updateJob(id, { status, progress }, message);
}
