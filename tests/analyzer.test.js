import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { analyzeProject } from '../src/analyzer.js';

const execFileAsync = promisify(execFile);

test('analyzeProject clones a git repo, diffs against base commit, and writes artifacts', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'linuxaiimpact-analyzer-'));
  const repo = path.join(tmp, 'repo');
  const dataRoot = path.join(tmp, 'data');
  await fs.mkdir(repo, { recursive: true });
  await git(repo, ['init', '-b', 'main']);
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(repo, 'src', 'main.lua'),
    'local billing = {}\n\nfunction billing.reconcile(order)\n  return order.id\nend\n\nreturn billing\n',
  );
  await fs.writeFile(
    path.join(repo, 'src', 'risk.cpp'),
    '#include <string>\n\nint calculateRisk(int value) {\n  return value;\n}\n',
  );
  await fs.mkdir(path.join(repo, '.aiimpact'), { recursive: true });
  await fs.writeFile(path.join(repo, '.aiimpact', 'business.md'), '# Billing\norders are critical\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'base']);
  const { stdout: baseCommit } = await git(repo, ['rev-parse', 'HEAD']);

  await fs.writeFile(
    path.join(repo, 'src', 'main.lua'),
    'local billing = {}\n\nfunction billing.reconcile(order)\n  if not order then return nil end\n  return order.id\nend\n\nreturn billing\n',
  );
  await fs.writeFile(
    path.join(repo, 'src', 'risk.cpp'),
    '#include <string>\n\nint calculateRisk(int value) {\n  return value + 1;\n}\n',
  );
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'change risk']);

  const result = await analyzeProject({
    jobId: 'job_test',
    request: {
      projectName: 'billing',
      gitUrl: repo,
      branch: 'main',
      baseCommit: baseCommit.trim(),
    },
    config: {
      dataRoot,
      knowledgeDir: path.join(tmp, 'knowledge'),
      standardsDir: path.resolve('standards'),
      ai: { profiles: { offline: { provider: 'offline' } }, defaultProfile: 'offline' },
    },
  });

  const summary = JSON.parse(await fs.readFile(result.summaryJson, 'utf8'));
  const impact = await fs.readFile(result.impactReport, 'utf8');
  const review = await fs.readFile(result.reviewReport, 'utf8');
  const checklist = await fs.readFile(result.testChecklist, 'utf8');

  assert.equal(summary.request.projectName, 'billing');
  assert.deepEqual(summary.languages.sort(), ['c/c++', 'lua']);
  assert.match(impact, /## 6\. 业务影响面结论/);
  assert.match(review, /## 1\. 语言与标准/);
  assert.match(checklist, /## 4\. 上线验证/);
});

function git(cwd, args) {
  return execFileAsync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', ...args], {
    cwd,
  });
}
