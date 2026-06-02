import path from 'node:path';

import { runCommand } from './shell.js';
import { buildStaticCallGraph } from './staticCallGraph.js';

export async function collectCallGraph({ repoDir, changedFunctions, languages, filesByLanguage, options = {} }) {
  const depth = Number.isInteger(options.depth) && options.depth > 0 ? options.depth : 2;
  const results = [];

  if (languages.includes('lua')) {
    results.push(await runLuaLsAdapter({ repoDir, changedFunctions, files: filesByLanguage.lua || [] }));
  }

  const nonLuaLanguages = languages.filter((language) => language !== 'lua');
  if (nonLuaLanguages.length > 0) {
    results.push(await runCodeGraphAdapter({ repoDir, changedFunctions, languages: nonLuaLanguages }));
  }

  const staticGraph = await buildStaticCallGraph({ repoDir, changedFunctions, depth, options });
  return {
    depth,
    tools: results,
    entries: mergeGraphEntries(results.flatMap((item) => item.entries || []), staticGraph),
  };
}

async function runLuaLsAdapter({ repoDir, changedFunctions, files }) {
  const luaSymbols = changedFunctions.filter((item) => item.language === 'lua');
  const binary = process.env.LUALS_BIN || path.resolve('tools/vendor/bin/lua-language-server');
  try {
    const version = await runCommand(binary, ['--version'], { cwd: repoDir, allowFailure: true });
    return {
      tool: 'LuaLS adapter',
      status: version.code === 0 ? 'available' : 'unavailable',
      reason:
        version.code === 0
          ? `lua-language-server responded: ${(version.stdout || version.stderr).trim()}`
          : version.stderr || version.stdout || 'lua-language-server returned a non-zero status',
      files,
      entries: luaSymbols.map((symbol) => ({
        ...symbol,
        callers: [],
        callees: [],
        source: 'luals-adapter',
      })),
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
  const binary = process.env.CODEGRAPH_BIN || path.resolve('tools/vendor/bin/codegraph');
  try {
    const init = await runCommand(binary, ['init', '-i'], { cwd: repoDir, allowFailure: true });
    if (init.code !== 0) {
      return {
        tool: 'codegraph adapter',
        status: 'unavailable',
        reason: init.stderr || init.stdout || 'codegraph init -i failed',
        languages,
        entries: [],
      };
    }
    const status = await runCommand(binary, ['status'], { cwd: repoDir, allowFailure: true });
    return {
      tool: 'codegraph adapter',
      status: status.code === 0 ? 'available' : 'unavailable',
      reason: status.code === 0 ? 'codegraph initialized and responded' : status.stderr || status.stdout,
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
