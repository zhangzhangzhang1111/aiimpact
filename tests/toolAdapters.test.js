import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectCallGraph } from '../src/toolAdapters.js';

test('collectCallGraph uses internal LuaLS and codegraph adapters without legacy transport naming', async () => {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'linuxaiimpact-adapters-'));
  const result = await collectCallGraph({
    repoDir,
    languages: ['lua', 'c/c++'],
    filesByLanguage: { lua: ['main.lua'], 'c/c++': ['risk.cpp'] },
    changedFunctions: [
      { file: 'main.lua', symbol: 'billing.reconcile', language: 'lua', lineHint: 1 },
      { file: 'risk.cpp', symbol: 'calculateRisk', language: 'c/c++', lineHint: 1 },
    ],
  });

  const toolNames = result.tools.map((tool) => tool.tool);
  assert.deepEqual(toolNames, ['LuaLS adapter', 'codegraph adapter']);
  assert.equal(result.tools.every((tool) => tool.tool.endsWith('adapter')), true);
});
