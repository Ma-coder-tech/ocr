import { randomUUID } from "node:crypto";
import { Job, JobEvent, JobStatus } from "./types.js";

const jobs = new Map<string, Job>();

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
  patch: Partial<Pick<Job, "status" | "progress" | "error" | "reportPath" | "summary">>,
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
  return next;
}

export function failJob(id: string, error: string): Job {
  return updateJob(id, { status: "failed", progress: 100, error }, error);
}

export function stageUpdate(id: string, status: JobStatus, progress: number, message: string): Job {
  return updateJob(id, { status, progress }, message);
}
