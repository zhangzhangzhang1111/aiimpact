import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAnalyzeRequest } from '../src/httpValidation.js';

test('validateAnalyzeRequest requires projectName, gitUrl, branch, and baseCommit', () => {
  assert.deepEqual(validateAnalyzeRequest({}).errors, [
    'projectName is required',
    'gitUrl is required',
    'branch is required',
    'baseCommit is required',
  ]);
});

test('validateAnalyzeRequest accepts the required analyze payload', () => {
  const result = validateAnalyzeRequest({
    projectName: 'demo',
    gitUrl: 'https://example.com/demo.git',
    branch: 'main',
    baseCommit: 'abc123',
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});
