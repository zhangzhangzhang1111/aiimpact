import assert from 'node:assert/strict';
import test from 'node:test';

import { AnalysisQueue } from '../src/queue.js';

test('AnalysisQueue runs at most two jobs concurrently and drains queued jobs', async () => {
  const queue = new AnalysisQueue({ concurrency: 2 });
  let active = 0;
  let maxActive = 0;
  const completed = [];

  const jobs = Array.from({ length: 5 }, (_, index) =>
    queue.enqueue(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 25));
      completed.push(index);
      active -= 1;
      return index;
    }),
  );

  const results = await Promise.all(jobs);

  assert.deepEqual(results.sort(), [0, 1, 2, 3, 4]);
  assert.equal(maxActive, 2);
  assert.deepEqual(completed.sort(), [0, 1, 2, 3, 4]);
});
