import fs from 'node:fs/promises';
import path from 'node:path';

import { runCommand } from './shell.js';
import { buildStaticCallGraph } from './staticCallGraph.js';

export async function collectCallGraph({ repoDir, changedFunctions, languages, filesByLanguage }) {
  const results = [];

  if (languages.includes('lua')) {
    results.push(await runLuaLsAdapter({ repoDir, changedFunctions, files: filesByLanguage.lua || [] }));
  }

  const nonLuaLanguages = languages.filter((language) => language !== 'lua');
  if (nonLuaLanguages.length > 0) {
    results.push(await runCodeGraphAdapter({ repoDir, changedFunctions, languages: nonLuaLanguages }));
  }

  const staticGraph = await buildStaticCallGraph({ repoDir, changedFunctions });
  return {
    tools: results,
    entries: mergeGraphEntries(results.flatMap((item) => item.entries || []), staticGraph),
  };
}

async function runLuaLsAdapter({ repoDir, changedFunctions, files }) {
  const luaSymbols = changedFunctions.filter((item) => item.language === 'lua');
  const wrapper = path.resolve('tools/luals-adapter.lua');
  try {
    await fs.access(wrapper);
    const args = [
      wrapper,
      repoDir,
      ...luaSymbols.map((item) => `${item.file}\t${item.symbol}\t${item.lineHint || ''}`),
    ];
    const result = await runCommand('lua', args, { allowFailure: true });
    if (result.code === 0 && result.stdout.trim()) {
      return JSON.parse(result.stdout);
    }
    return {
      tool: 'LuaLS adapter',
      status: 'unavailable',
      reason: result.stderr || 'LuaLS adapter returned no output',
      entries: [],
    };
  } catch (error) {
    return {
      tool: 'LuaLS adapter',
      status: 'unavailable',
      reason: error.message,
      entries: [],
    };
  }
}

async function runCodeGraphAdapter({ repoDir, changedFunctions, languages }) {
  const symbols = changedFunctions.filter((item) => item.language !== 'lua');
  try {
    const status = await runCommand('codegraph', ['status'], { cwd: repoDir, allowFailure: true });
    return {
      tool: 'codegraph adapter',
      status: status.code === 0 ? 'available' : 'unavailable',
      reason: status.code === 0 ? 'codegraph command responded' : status.stderr || status.stdout,
      languages,
      entries: symbols.map((symbol) => ({
        ...symbol,
        callers: [],
        callees: [],
        source: 'codegraph-adapter',
      })),
    };
  } catch (error) {
    return {
      tool: 'codegraph adapter',
      status: 'unavailable',
      reason: error.message,
      languages,
      entries: [],
    };
  }
}

function mergeGraphEntries(toolEntries, fallbackEntries) {
  const byKey = new Map();
  for (const entry of fallbackEntries) {
    byKey.set(`${entry.file}:${entry.symbol}`, entry);
  }
  for (const entry of toolEntries) {
    byKey.set(`${entry.file}:${entry.symbol}`, {
      ...byKey.get(`${entry.file}:${entry.symbol}`),
      ...entry,
    });
  }
  return Array.from(byKey.values());
}
