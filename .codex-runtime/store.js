import { randomUUID } from "node:crypto";
const jobs = new Map();
const MAX_IN_MEMORY_JOBS = Math.max(50, Number(process.env.MAX_IN_MEMORY_JOBS ?? 500));
const TERMINAL_JOB_RETENTION_HOURS = Math.max(1, Number(process.env.TERMINAL_JOB_RETENTION_HOURS ?? 24));
function isTerminal(status) {
    return status === "completed" || status === "failed";
}
function pruneJobs() {
    const cutoffMs = Date.now() - TERMINAL_JOB_RETENTION_HOURS * 60 * 60 * 1000;
    for (const [id, job] of jobs) {
        if (!isTerminal(job.status))
            continue;
        const updatedAtMs = new Date(job.updatedAt).getTime();
        if (Number.isFinite(updatedAtMs) && updatedAtMs < cutoffMs) {
            jobs.delete(id);
        }
    }
    if (jobs.size <= MAX_IN_MEMORY_JOBS)
        return;
    for (const [id, job] of jobs) {
        if (jobs.size <= MAX_IN_MEMORY_JOBS)
            break;
        if (isTerminal(job.status)) {
            jobs.delete(id);
        }
    }
    while (jobs.size > MAX_IN_MEMORY_JOBS) {
        const oldest = jobs.keys().next().value;
        if (!oldest)
            break;
        jobs.delete(oldest);
    }
}
export function createJob(input) {
    const now = new Date().toISOString();
    const job = {
        id: randomUUID(),
        fileName: input.fileName,
        filePath: input.filePath,
        fileType: input.fileType,
        businessType: input.businessType,
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
export function getJob(id) {
    return jobs.get(id);
}
export function listEvents(id) {
    const job = jobs.get(id);
    return job?.events ?? [];
}
export function updateJob(id, patch, message) {
    const job = jobs.get(id);
    if (!job) {
        throw new Error(`Job ${id} not found`);
    }
    const next = {
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
export function failJob(id, error) {
    return updateJob(id, { status: "failed", progress: 100, error }, error);
}
export function stageUpdate(id, status, progress, message) {
    return updateJob(id, { status, progress }, message);
}
