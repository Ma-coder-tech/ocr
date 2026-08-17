import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => fs.readFileSync(path.resolve(file), "utf8");

describe("Preview job platform boundary", () => {
  it("keeps the extended function lifetime on the fail-closed Preview entrypoint", () => {
    expect(source("api/index.ts")).not.toContain("maxDuration");
    expect(source("api/preview-jobs.ts")).toContain("export const maxDuration = 800");
    expect(source("src/server.ts")).toMatch(/previewJobApp[\s\S]*previewAsyncJobExecutionEnabled/);
  });

  it("redirects only Preview uploads and leaves the normal queue path intact", () => {
    const server = source("src/server.ts");
    expect(server).toMatch(/pathname === "\/api\/jobs"[\s\S]*previewAsyncJobExecutionEnabled\(\)[\s\S]*statusCode = 307/);
    expect(server).toMatch(/if \(options\.previewBackground\)[\s\S]*schedulePreviewJobExecution[\s\S]*else \{\s*enqueueJob\(job\.id\)/);
  });

  it("never places raw PDFs, parsed documents, or file paths in shared cache", () => {
    const execution = source("src/previewJobExecution.ts");
    expect(execution).toContain("FORBIDDEN_PUBLIC_PAYLOAD_KEYS");
    expect(execution).toContain("createCipheriv(\"aes-256-gcm\"");
    expect(execution).not.toMatch(/cache\.set\([^\n]*finalPath/);
  });
});
