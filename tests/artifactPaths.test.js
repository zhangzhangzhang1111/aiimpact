import assert from 'node:assert/strict';
import test from 'node:test';

import { createArtifactPaths } from '../src/artifactPaths.js';

test('createArtifactPaths places reports under /data/impact/project/project_branch_timestamp', () => {
  const paths = createArtifactPaths({
    dataRoot: '/data',
    projectName: 'Billing API',
    branch: 'feature/risk-check',
    timestamp: '20260601T120102Z',
  });

  assert.equal(paths.projectDir, '/data/impact/Billing_API');
  assert.equal(
    paths.runDir,
    '/data/impact/Billing_API/Billing_API_feature_risk-check_20260601T120102Z',
  );
  assert.equal(paths.markdownReport, `${paths.runDir}/impact-report.md`);
  assert.equal(paths.reviewReport, `${paths.runDir}/code-review.md`);
  assert.equal(paths.testChecklist, `${paths.runDir}/test-checklist.md`);
  assert.equal(paths.diffFile, `${paths.runDir}/diff.patch`);
});
