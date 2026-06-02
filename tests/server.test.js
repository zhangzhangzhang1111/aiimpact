import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createHttpServer } from '../src/server.js';
import { AnalysisQueue } from '../src/queue.js';
import { JobStore } from '../src/jobStore.js';

test('server validates analyze requests', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo' }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.deepEqual(body.errors, ['gitUrl is required', 'branch is required', 'baseCommit is required']);
  } finally {
    await closeServer(server);
  }
});

test('server creates queued analysis jobs and exposes job status', async () => {
  const jobs = new JobStore();
  const { server, baseUrl } = await startTestServer({
    jobs,
    analyzer: async ({ request }) => ({ ok: true, projectName: request.projectName }),
  });

  try {
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectName: 'demo',
        gitUrl: 'https://example.com/demo.git',
        branch: 'main',
        baseCommit: 'abc123',
      }),
    });

    assert.equal(response.status, 202);
    const accepted = await response.json();
    assert.match(accepted.jobId, /^job_/);

    await waitFor(() => jobs.get(accepted.jobId)?.status === 'completed');

    const statusResponse = await fetch(`${baseUrl}/api/jobs/${accepted.jobId}`);
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.equal(status.status, 'completed');
    assert.deepEqual(status.result, { ok: true, projectName: 'demo' });
  } finally {
    await closeServer(server);
  }
});

test('server serves the web console page', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const body = await response.text();
    assert.match(body, /AI Impact Console/);
    assert.match(body, /分析任务/);
  } finally {
    await closeServer(server);
  }
});

test('server records analyzer progress updates on the job', async () => {
  const jobs = new JobStore();
  const { server, baseUrl } = await startTestServer({
    jobs,
    analyzer: async ({ progress }) => {
      progress({ stage: 'git_diff', message: '正在获取 git diff', percent: 30 });
      return { ok: true };
    },
  });

  try {
    const response = await postAnalyze(baseUrl);
    const accepted = await response.json();

    await waitFor(() => jobs.get(accepted.jobId)?.status === 'completed');

    const job = jobs.get(accepted.jobId);
    assert.equal(job.progress.stage, 'completed');
    assert.equal(job.progress.percent, 100);
    assert.equal(job.progress.history.some((item) => item.stage === 'git_diff'), true);
  } finally {
    await closeServer(server);
  }
});

test('server exposes completed artifact file content by logical artifact name', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'linuxaiimpact-artifact-api-'));
  const artifact = path.join(tmp, 'impact-report.md');
  await fs.writeFile(artifact, '# impact\n\nreport body\n', 'utf8');
  const jobs = new JobStore();
  const job = jobs.create({ projectName: 'demo' });
  jobs.update(job.id, {
    status: 'completed',
    result: {
      impactReport: artifact,
    },
  });
  const { server, baseUrl } = await startTestServer({ jobs });

  try {
    const response = await fetch(`${baseUrl}/api/jobs/${job.id}/artifacts/impactReport`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/markdown/);
    assert.equal(await response.text(), '# impact\n\nreport body\n');
  } finally {
    await closeServer(server);
  }
});

async function startTestServer(overrides = {}) {
  const server = createHttpServer({
    queue: overrides.queue || new AnalysisQueue({ concurrency: 2 }),
    jobs: overrides.jobs || new JobStore(),
    analyzer: overrides.analyzer || (async () => ({})),
    config: { dataRoot: '/tmp/linuxaiimpact-test' },
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function postAnalyze(baseUrl) {
  return fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectName: 'demo',
      gitUrl: 'https://example.com/demo.git',
      branch: 'main',
      baseCommit: 'abc123',
    }),
  });
}

async function waitFor(predicate) {
  const started = Date.now();
  while (Date.now() - started < 1000) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('condition was not met in time');
}
