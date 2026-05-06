import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createJob, getJob, listEvents } from './store.js';
import { enqueueJob } from './worker.js';
import { isBusinessTypeId } from './businessTypes.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
const dataRoot = path.resolve('data');
const uploadDir = path.join(dataRoot, 'uploads');
const publicDir = path.resolve('public');

await fs.mkdir(uploadDir, { recursive: true });

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, contentType, body) {
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function toPublicReportSummary(summary) {
  if (!summary) return undefined;
  return {
    businessType: summary.businessType,
    processorName: summary.processorName,
    sourceType: summary.sourceType,
    statementPeriod: summary.statementPeriod,
    executiveSummary: summary.executiveSummary,
    totalVolume: summary.totalVolume,
    totalFees: summary.totalFees,
    estimatedMonthlyVolume: summary.estimatedMonthlyVolume,
    estimatedMonthlyFees: summary.estimatedMonthlyFees,
    effectiveRate: summary.effectiveRate,
    benchmark: summary.benchmark,
    confidence: summary.confidence,
    dataQuality: summary.dataQuality,
  };
}

async function readPublicFile(filePath) {
  return await fs.readFile(filePath, 'utf8');
}

async function handleCreateJob(req, res) {
  const request = new Request(`http://${req.headers.host ?? `${host}:${port}`}${req.url ?? '/api/jobs'}`, {
    method: req.method,
    headers: req.headers,
    body: req,
    duplex: 'half',
  });

  let form;
  try {
    form = await request.formData();
  } catch {
    json(res, 400, { error: 'We could not read that upload. Please try again with a PDF statement file.' });
    return;
  }

  const businessType = typeof form.get('businessType') === 'string' ? form.get('businessType') : '';
  if (!isBusinessTypeId(businessType)) {
    json(res, 400, { error: 'Please select your business type above before uploading.' });
    return;
  }

  const file = form.get('file');
  if (!file || typeof file !== 'object' || typeof file.name !== 'string' || typeof file.arrayBuffer !== 'function') {
    json(res, 400, { error: 'Missing file upload' });
    return;
  }

  const ext = path.extname(file.name).toLowerCase();
  if (ext !== '.pdf') {
    json(res, 400, { error: "This file isn't a PDF. Please download your statement as a PDF from your processor's portal and try again." });
    return;
  }

  if (typeof file.size === 'number' && file.size > 20 * 1024 * 1024) {
    json(res, 400, { error: 'This file is too large (over 20 MB). Try downloading a single monthly statement rather than a combined document.' });
    return;
  }

  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  const finalPath = path.join(uploadDir, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(finalPath, bytes);

  const job = createJob({
    fileName: file.name,
    filePath: finalPath,
    fileType: 'pdf',
    businessType,
  });

  enqueueJob(job.id);
  json(res, 201, { jobId: job.id });
}

const server = http.createServer(async (req, res) => {
  try {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`);
    const pathname = url.pathname;

    if (method === 'GET' && pathname === '/health') {
      json(res, 200, { ok: true, uploadDir });
      return;
    }

    if (method === 'POST' && pathname === '/api/jobs') {
      await handleCreateJob(req, res);
      return;
    }

    if (method === 'GET' && /^\/api\/jobs\/[^/]+$/.test(pathname)) {
      const jobId = pathname.split('/').pop();
      const job = getJob(jobId);
      if (!job) {
        json(res, 404, { error: 'Job not found' });
        return;
      }
      json(res, 200, {
        id: job.id,
        fileName: job.fileName,
        businessType: job.businessType,
        status: job.status,
        progress: job.progress,
        error: job.error,
        summary: toPublicReportSummary(job.summary),
      });
      return;
    }

    if (method === 'GET' && /^\/api\/jobs\/[^/]+\/events$/.test(pathname)) {
      const jobId = pathname.split('/')[3];
      const job = getJob(jobId);
      if (!job) {
        json(res, 404, { error: 'Job not found' });
        return;
      }
      json(res, 200, { events: listEvents(job.id) });
      return;
    }

    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      sendText(res, 200, 'text/html; charset=utf-8', await readPublicFile(path.join(publicDir, 'index.html')));
      return;
    }

    if (method === 'GET' && pathname.startsWith('/report/')) {
      sendText(res, 200, 'text/html; charset=utf-8', await readPublicFile(path.join(publicDir, 'report.html')));
      return;
    }

    const staticPath = path.join(publicDir, pathname.replace(/^\/+/, ''));
    if (method === 'GET' && staticPath.startsWith(publicDir)) {
      try {
        const file = await fs.readFile(staticPath);
        const contentType = staticPath.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : staticPath.endsWith('.js')
            ? 'application/javascript; charset=utf-8'
            : staticPath.endsWith('.css')
              ? 'text/css; charset=utf-8'
              : 'application/octet-stream';
        res.writeHead(200, { 'content-type': contentType, 'content-length': file.byteLength });
        res.end(file);
        return;
      } catch {}
    }

    sendText(res, 404, 'text/plain; charset=utf-8', 'Not found');
  } catch (error) {
    console.error('[dev-lite-server]', error);
    json(res, 500, { error: error instanceof Error ? error.message : 'Unknown server error' });
  }
});

server.listen(port, host, () => {
  console.log(`FeeClear dev server running on http://${host}:${port}`);
});
