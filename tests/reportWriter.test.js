import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createArtifactPaths } from '../src/artifactPaths.js';
import { writeReports } from '../src/reportWriter.js';

test('writeReports emits stable impact, test, and review template sections', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'linuxaiimpact-report-'));
  const paths = createArtifactPaths({
    dataRoot: tmp,
    projectName: 'demo',
    branch: 'main',
    timestamp: '20260601T010203Z',
  });
  const context = {
    request: {
      projectName: 'demo',
      branch: 'main',
      baseCommit: 'abc123',
    },
    headCommit: 'def456',
    languages: ['lua', 'c/c++'],
    diff: 'diff --git a/a.lua b/a.lua\n',
    changedFiles: [{ status: 'M', path: 'a.lua' }],
    changedFunctions: [{ file: 'a.lua', symbol: 'a.run', language: 'lua', lineHint: 1 }],
    knowledge: [{ source: 'repository:.aiimpact/business.md', content: 'orders are critical' }],
    standards: [{ language: 'lua', source: 'standards/lua.md', content: 'check nil' }],
    callGraph: { tools: [], entries: [] },
  };
  const agentOutputs = {
    diffSummary: 'diff summary',
    callGraphSummary: 'call graph',
    knowledgeImpact: 'business impact',
    testChecklist: 'tests',
    codeReview: 'review',
  };

  await writeReports({ paths, context, agentOutputs });

  const impact = await fs.readFile(paths.markdownReport, 'utf8');
  const tests = await fs.readFile(paths.testChecklist, 'utf8');
  const review = await fs.readFile(paths.reviewReport, 'utf8');

  assert.match(impact, /## 1\. 基本信息/);
  assert.match(impact, /## 3\. 影响追踪矩阵/);
  assert.match(impact, /## 7\. 非功能与运行风险/);
  assert.match(impact, /## 10\. 待确认事项与签署/);
  assert.match(tests, /## 1\. 测试计划标识与范围/);
  assert.match(tests, /## 4\. 测试设计矩阵/);
  assert.match(tests, /## 7\. 准入、暂停、恢复与退出准则/);
  assert.match(tests, /## 10\. 覆盖追踪与审批/);
  assert.match(review, /## 1\. 语言与标准/);
  assert.match(review, /## 5\. 审核结论与放行条件/);
});
