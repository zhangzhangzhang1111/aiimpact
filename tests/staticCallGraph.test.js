import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildStaticCallGraph } from '../src/staticCallGraph.js';

test('buildStaticCallGraph defaults to two layers and includes function code snippets', async () => {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'linuxaiimpact-static-'));
  await fs.mkdir(path.join(repoDir, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(repoDir, 'src', 'main.lua'),
    [
      'local billing = {}',
      '',
      'function billing.reconcile(order)',
      '  local risk = calculateRisk(order)',
      '  return persistOrder(risk)',
      'end',
      '',
      'function calculateRisk(order)',
      '  return normalizeRisk(order.score)',
      'end',
      '',
      'function normalizeRisk(score)',
      '  return score or 0',
      'end',
      '',
      'function persistOrder(risk)',
      '  return risk',
      'end',
    ].join('\n'),
  );

  const [entry] = await buildStaticCallGraph({
    repoDir,
    changedFunctions: [
      {
        file: 'src/main.lua',
        symbol: 'billing.reconcile',
        language: 'lua',
        lineHint: 3,
      },
    ],
  });

  assert.equal(entry.depth, 2);
  assert.equal(entry.nodes.find((node) => node.symbol === 'billing.reconcile').depth, 0);
  assert.equal(entry.nodes.find((node) => node.symbol === 'calculateRisk').depth, 1);
  assert.equal(entry.nodes.find((node) => node.symbol === 'normalizeRisk').depth, 2);
  assert.match(entry.nodes.find((node) => node.symbol === 'calculateRisk').code, /function calculateRisk/);
  assert.deepEqual(
    entry.relationships.map((relationship) => `${relationship.from}->${relationship.to}`).sort(),
    ['billing.reconcile->calculateRisk', 'billing.reconcile->persistOrder', 'calculateRisk->normalizeRisk'],
  );
});
