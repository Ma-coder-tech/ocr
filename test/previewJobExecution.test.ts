import { describe, expect, it } from "vitest";
import {
  createPreviewJobAccessKey,
  previewAsyncJobExecutionEnabled,
  readPreviewJobPayload,
  schedulePreviewJobExecution,
  type PreviewJobPlatform,
} from "../src/previewJobExecution.js";

function fakePlatform() {
  const values = new Map<string, unknown>();
  let background: Promise<unknown> | null = null;
  const platform: PreviewJobPlatform = {
    cache: {
      get: async (key) => values.get(key) ?? null,
      set: async (key, value) => {
        values.set(key, value);
      },
    },
    waitUntil: (promise) => {
      background = promise;
    },
  };
  return { platform, values, background: () => background };
}

describe("Preview asynchronous job execution", () => {
  const env = { VERCEL_ENV: "preview", VERCEL_DEPLOYMENT_ID: "deployment_test" } as NodeJS.ProcessEnv;

  it("acknowledges after the encrypted queued snapshot and finishes in waitUntil", async () => {
    const fake = fakePlatform();
    const accessKey = createPreviewJobAccessKey();
    let finish!: (value: Record<string, unknown>) => void;
    const finalPayload = new Promise<Record<string, unknown>>((resolve) => {
      finish = resolve;
    });

    await schedulePreviewJobExecution({
      jobId: "job_1",
      accessKey,
      initialPayload: { id: "job_1", status: "queued", progress: 0 },
      run: () => finalPayload,
      env,
      platform: fake.platform,
    });

    expect(fake.background()).toBeInstanceOf(Promise);
    expect([...fake.values.values()][0]).not.toContain("queued");
    await expect(readPreviewJobPayload({ jobId: "job_1", accessKey, env, platform: fake.platform })).resolves.toMatchObject({
      status: "queued",
    });

    finish({ id: "job_1", status: "completed", progress: 100, productionReportV2: { experience: "complete" } });
    await fake.background();
    await expect(readPreviewJobPayload({ jobId: "job_1", accessKey, env, platform: fake.platform })).resolves.toMatchObject({
      status: "completed",
      productionReportV2: { experience: "complete" },
    });
  });

  it("fails closed for a missing or incorrect access capability", async () => {
    const fake = fakePlatform();
    const accessKey = createPreviewJobAccessKey();
    await schedulePreviewJobExecution({
      jobId: "job_2",
      accessKey,
      initialPayload: { id: "job_2", status: "queued" },
      run: async () => ({ id: "job_2", status: "completed" }),
      env,
      platform: fake.platform,
    });

    await expect(readPreviewJobPayload({
      jobId: "job_2",
      accessKey: createPreviewJobAccessKey(),
      env,
      platform: fake.platform,
    })).resolves.toBeNull();
  });

  it("rejects raw statement material before scheduling background work", async () => {
    const fake = fakePlatform();
    await expect(schedulePreviewJobExecution({
      jobId: "job_3",
      accessKey: createPreviewJobAccessKey(),
      initialPayload: { id: "job_3", rawStatement: "merchant statement contents" },
      run: async () => ({ id: "job_3", status: "completed" }),
      env,
      platform: fake.platform,
    })).rejects.toThrow("preview_job_payload_privacy_rejected");
    expect(fake.background()).toBeNull();
  });

  it("is disabled outside Vercel Preview", () => {
    expect(previewAsyncJobExecutionEnabled({ VERCEL_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(previewAsyncJobExecutionEnabled(env)).toBe(true);
  });
});
