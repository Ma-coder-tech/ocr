import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { createJob, getJob, listEvents } from "./store.js";
import { enqueueJob } from "./worker.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const isVercel = Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);
const dataRoot = isVercel ? path.join("/tmp", "ocr-data") : path.resolve("data");
const uploadDir = path.join(dataRoot, "uploads");
const reportDir = path.join(dataRoot, "reports");

function asyncHandler(
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>,
): express.RequestHandler {
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

app.get("/api/jobs/:id/download", (req, res) => {
  const job = getJob(req.params.id);
  if (!job || !job.reportPath) {
    res.status(404).json({ error: "Report not available" });
    return;
  }

  res.download(job.reportPath, `fee-analysis-${job.id}.pdf`);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, uploadDir, reportDir });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unknown server error";
  const status = message.includes("Only CSV and PDF files are supported") ? 400 : 500;
  console.error("[upload-error]", message);
  res.status(status).json({ error: message });
});

async function start(): Promise<void> {
  console.log(`[startup] host=${host} port=${port}`);
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.mkdir(reportDir, { recursive: true });
  console.log(`[startup] ensured dirs: ${uploadDir}, ${reportDir}`);

  const server = app.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}`);
  });
  server.on("error", (error) => {
    console.error("[listen-error]", error);
    process.exit(1);
  });
}

start().catch((error) => {
  console.error("[startup-error]", error);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
