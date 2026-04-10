import "dotenv/config";
import express from "express";
import multer from "multer";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { createJob, getJob, listEvents } from "./store.js";
import { enqueueJob } from "./worker.js";

export const app = express();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const isVercel = Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);
const dataRoot = isVercel ? path.join("/tmp", "ocr-data") : path.resolve("data");
const uploadDir = path.join(dataRoot, "uploads");
const fileRetentionHours = Math.max(1, Number(process.env.FILE_RETENTION_HOURS ?? 72));

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".csv" || ext === ".pdf") {
      cb(null, true);
      return;
    }
    cb(new Error("Only CSV and PDF files are supported"));
  },
});

app.use(express.json());
app.use(express.static(path.resolve("public")));

app.get("/report/:id", (_req, res) => {
  res.sendFile(path.resolve("public/report.html"));
});

app.post("/api/jobs", upload.single("file"), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Missing file upload" });
    return;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const type = ext === ".csv" ? "csv" : ext === ".pdf" ? "pdf" : null;
  if (!type) {
    res.status(400).json({ error: "Unsupported file type" });
    return;
  }

  const finalName = `${file.filename}${ext}`;
  const finalPath = path.join(uploadDir, finalName);
  await fs.rename(file.path, finalPath);

  const job = createJob({
    fileName: file.originalname,
    filePath: finalPath,
    fileType: type,
  });

  enqueueJob(job.id);

  res.status(201).json({ jobId: job.id });
}));

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({
    id: job.id,
    fileName: job.fileName,
    status: job.status,
    progress: job.progress,
    error: job.error,
    summary: job.summary,
  });
});

app.get("/api/jobs/:id/events", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({ events: listEvents(job.id) });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, uploadDir });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Unknown server error";
  const status = message.includes("Only CSV and PDF files are supported") ? 400 : 500;
  console.error("[upload-error]", message);
  res.status(status).json({ error: message });
});

async function cleanupOldFiles(dir: string, retentionHours: number): Promise<void> {
  const cutoffMs = Date.now() - retentionHours * 60 * 60 * 1000;
  const entries = await fs.readdir(dir, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile()) return;
      const filePath = path.join(dir, entry.name);
      try {
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < cutoffMs) {
          await fs.unlink(filePath);
        }
      } catch (error) {
        console.warn("[cleanup-skip]", filePath, error instanceof Error ? error.message : error);
      }
    }),
  );
}

async function start(): Promise<void> {
  console.log(`[startup] host=${host} port=${port}`);
  await fs.mkdir(uploadDir, { recursive: true });
  console.log(`[startup] ensured dir: ${uploadDir}`);
  await cleanupOldFiles(uploadDir, fileRetentionHours);
  console.log(`[startup] cleanup complete (retention=${fileRetentionHours}h)`);

  const server = app.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}`);
  });
  server.on("error", (error) => {
    console.error("[listen-error]", error);
    process.exit(1);
  });
}

if (!process.env.VERCEL) {
  start().catch((error) => {
    console.error("[startup-error]", error);
    process.exit(1);
  });
}

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

export default app;
