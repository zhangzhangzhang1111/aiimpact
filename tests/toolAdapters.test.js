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

test('collectCallGraph uses configured bundled tool binaries', async () => {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'linuxaiimpact-adapters-bin-'));
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), 'linuxaiimpact-bin-'));
  const lualsBin = path.join(binDir, 'lua-language-server');
  const codegraphBin = path.join(binDir, 'codegraph');
  await fs.writeFile(lualsBin, '#!/usr/bin/env sh\necho "LuaLS fake 1.0"\n');
  await fs.writeFile(codegraphBin, '#!/usr/bin/env sh\necho "codegraph fake status"\n');
  await fs.chmod(lualsBin, 0o755);
  await fs.chmod(codegraphBin, 0o755);

  const previousLuaLs = process.env.LUALS_BIN;
  const previousCodeGraph = process.env.CODEGRAPH_BIN;
  process.env.LUALS_BIN = lualsBin;
  process.env.CODEGRAPH_BIN = codegraphBin;
  try {
    const result = await collectCallGraph({
      repoDir,
      languages: ['lua', 'c/c++'],
      filesByLanguage: { lua: ['main.lua'], 'c/c++': ['risk.cpp'] },
      changedFunctions: [
        { file: 'main.lua', symbol: 'billing.reconcile', language: 'lua', lineHint: 1 },
        { file: 'risk.cpp', symbol: 'calculateRisk', language: 'c/c++', lineHint: 1 },
      ],
    });

    assert.equal(result.tools[0].status, 'available');
    assert.match(result.tools[0].reason, /LuaLS fake 1\.0/);
    assert.equal(result.tools[1].status, 'available');
  } finally {
    restoreEnv('LUALS_BIN', previousLuaLs);
    restoreEnv('CODEGRAPH_BIN', previousCodeGraph);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
