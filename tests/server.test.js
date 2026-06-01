import assert from 'node:assert/strict';
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

async function waitFor(predicate) {
  const started = Date.now();
  while (Date.now() - started < 1000) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('condition was not met in time');
}
