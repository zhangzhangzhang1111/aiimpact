import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

import { validateAnalyzeRequest } from './httpValidation.js';

const PUBLIC_DIR = path.resolve('public');
const STATIC_ROUTES = new Map([
  ['/', { file: 'index.html', contentType: 'text/html; charset=utf-8' }],
  ['/app.js', { file: 'app.js', contentType: 'text/javascript; charset=utf-8' }],
  ['/styles.css', { file: 'styles.css', contentType: 'text/css; charset=utf-8' }],
  ['/favicon.svg', { file: 'favicon.svg', contentType: 'image/svg+xml' }],
]);

const ARTIFACT_CONTENT_TYPES = {
  impactReport: 'text/markdown; charset=utf-8',
  reviewReport: 'text/markdown; charset=utf-8',
  testChecklist: 'text/markdown; charset=utf-8',
  diffFile: 'text/plain; charset=utf-8',
  callGraphFile: 'application/json; charset=utf-8',
  summaryJson: 'application/json; charset=utf-8',
};

export function createHttpServer({ queue, jobs, analyzer, config }) {
  return http.createServer(async (request, response) => {
    try {
      await routeRequest({ request, response, queue, jobs, analyzer, config });
    } catch (error) {
      writeJson(response, 500, {
        error: 'internal_error',
        message: error.message,
      });
    }
  });
}

async function routeRequest({ request, response, queue, jobs, analyzer, config }) {
  const url = new URL(request.url, 'http://127.0.0.1');

  if (request.method === 'GET' && STATIC_ROUTES.has(url.pathname)) {
    await serveStatic(response, STATIC_ROUTES.get(url.pathname));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    writeJson(response, 200, { ok: true, queue: queue.snapshot() });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/jobs') {
    writeJson(response, 200, { jobs: jobs.list(), queue: queue.snapshot() });
    return;
  }

  const artifactMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/artifacts\/([a-zA-Z0-9]+)$/);
  if (request.method === 'GET' && artifactMatch) {
    await serveArtifact(response, jobs, artifactMatch[1], artifactMatch[2]);
    return;
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (request.method === 'GET' && jobMatch) {
    const job = jobs.get(jobMatch[1]);
    if (!job) {
      writeJson(response, 404, { error: 'not_found', message: 'job not found' });
      return;
    }
    writeJson(response, 200, job);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/analyze') {
    const body = await readJson(request);
    const validation = validateAnalyzeRequest(body);
    if (!validation.valid) {
      writeJson(response, 400, { error: 'invalid_request', errors: validation.errors });
      return;
    }

    const job = jobs.create(validation.value);
    queue
      .enqueue(async () => {
        const progress = (patch) => updateProgress(jobs, job.id, patch);
        jobs.update(job.id, {
          status: 'running',
          startedAt: new Date().toISOString(),
          progress: createProgressPatch({ stage: 'running', message: '分析任务已开始', percent: 5 }),
        });
        try {
          const result = await analyzer({ jobId: job.id, request: validation.value, config, progress });
          jobs.update(job.id, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            progress: createProgressPatch({ stage: 'completed', message: '分析完成', percent: 100 }, jobs.get(job.id)?.progress),
            result,
          });
        } catch (error) {
          jobs.update(job.id, {
            status: 'failed',
            completedAt: new Date().toISOString(),
            progress: createProgressPatch({ stage: 'failed', message: error.message, percent: 100 }, jobs.get(job.id)?.progress),
            error: error.stack || error.message,
          });
        }
      })
      .catch((error) => {
        jobs.update(job.id, { status: 'failed', error: error.stack || error.message });
      });

    writeJson(response, 202, {
      jobId: job.id,
      status: job.status,
      statusUrl: `/api/jobs/${job.id}`,
      queue: queue.snapshot(),
    });
    return;
  }

  writeJson(response, 404, { error: 'not_found', message: 'route not found' });
}

async function serveStatic(response, route) {
  try {
    const content = await fs.readFile(path.join(PUBLIC_DIR, route.file));
    response.writeHead(200, { 'content-type': route.contentType });
    response.end(content);
  } catch {
    writeJson(response, 404, { error: 'not_found', message: 'static asset not found' });
  }
}

async function serveArtifact(response, jobs, jobId, artifactName) {
  const job = jobs.get(jobId);
  const artifactPath = job?.result?.[artifactName];
  const contentType = ARTIFACT_CONTENT_TYPES[artifactName];
  if (!job || !artifactPath || !contentType) {
    writeJson(response, 404, { error: 'not_found', message: 'artifact not found' });
    return;
  }
  try {
    const content = await fs.readFile(artifactPath);
    response.writeHead(200, { 'content-type': contentType });
    response.end(content);
  } catch (error) {
    writeJson(response, 404, { error: 'not_found', message: error.message });
  }
}

function updateProgress(jobs, jobId, patch) {
  const current = jobs.get(jobId)?.progress;
  jobs.update(jobId, { progress: createProgressPatch(patch, current) });
}

function createProgressPatch(patch, current = {}) {
  const event = {
    stage: patch.stage || current.stage || 'running',
    message: patch.message || current.message || '',
    percent: Number.isFinite(patch.percent) ? patch.percent : current.percent || 0,
    at: new Date().toISOString(),
  };
  return {
    stage: event.stage,
    message: event.message,
    percent: event.percent,
    history: [...(current.history || []), event],
  };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body, null, 2));
}
