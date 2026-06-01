import http from 'node:http';

import { validateAnalyzeRequest } from './httpValidation.js';

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

  if (request.method === 'GET' && url.pathname === '/health') {
    writeJson(response, 200, { ok: true, queue: queue.snapshot() });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/jobs') {
    writeJson(response, 200, { jobs: jobs.list(), queue: queue.snapshot() });
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
        jobs.update(job.id, { status: 'running', startedAt: new Date().toISOString() });
        try {
          const result = await analyzer({ jobId: job.id, request: validation.value, config });
          jobs.update(job.id, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            result,
          });
        } catch (error) {
          jobs.update(job.id, {
            status: 'failed',
            completedAt: new Date().toISOString(),
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
