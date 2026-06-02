import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DEPTH = 2;

export async function buildStaticCallGraph({ repoDir, changedFunctions, depth = DEFAULT_DEPTH, options = {} }) {
  const entries = [];
  const maxNodes = options.maxNodes || 80;
  const codeContextLines = options.codeContextLines || 20;
  const fileCache = new Map();

  for (const fn of changedFunctions) {
    const source = await readSource(repoDir, fn.file);
    const parsedFunctions = parseFunctions(source, fn.file, fn.language, codeContextLines);
    fileCache.set(fn.file, { source, parsedFunctions });

    const graph = buildTwoWayGraph({
      root: fn,
      parsedFunctions,
      depth,
      maxNodes,
    });

    entries.push({
      symbol: fn.symbol,
      file: fn.file,
      language: fn.language,
      lineHint: fn.lineHint,
      depth,
      callers: graph.callers,
      callees: graph.callees,
      nodes: graph.nodes,
      relationships: graph.relationships,
      source: 'static-fallback',
    });
  }
  return entries;
}

async function readSource(repoDir, filePath) {
  try {
    return await fs.readFile(path.join(repoDir, filePath), 'utf8');
  } catch {
    return '';
  }
}

function buildTwoWayGraph({ root, parsedFunctions, depth, maxNodes }) {
  const bySymbol = new Map(parsedFunctions.map((fn) => [fn.symbol, fn]));
  const bySimple = new Map(parsedFunctions.map((fn) => [simpleName(fn.symbol), fn]));
  const rootFunction = bySymbol.get(root.symbol) || bySimple.get(simpleName(root.symbol)) || fallbackFunction(root);
  const nodes = [];
  const relationships = [];
  const queue = [{ fn: rootFunction, depth: 0, direction: 'root' }];
  const visited = new Set();

  while (queue.length > 0 && nodes.length < maxNodes) {
    const current = queue.shift();
    const key = `${current.fn.file}:${current.fn.symbol}:${current.direction}`;
    if (visited.has(key)) continue;
    visited.add(key);

    nodes.push({
      symbol: current.fn.symbol,
      file: current.fn.file,
      language: root.language,
      lineStart: current.fn.lineStart,
      lineEnd: current.fn.lineEnd,
      depth: current.depth,
      direction: current.direction,
      code: current.fn.code,
    });

    if (current.depth >= depth) continue;

    for (const callee of findCalleeFunctions(current.fn, parsedFunctions)) {
      relationships.push({
        from: current.fn.symbol,
        to: callee.symbol,
        depth: current.depth + 1,
        direction: 'callee',
      });
      queue.push({ fn: callee, depth: current.depth + 1, direction: 'callee' });
    }

    for (const caller of findCallerFunctions(current.fn, parsedFunctions)) {
      relationships.push({
        from: caller.symbol,
        to: current.fn.symbol,
        depth: current.depth + 1,
        direction: 'caller',
      });
      queue.push({ fn: caller, depth: current.depth + 1, direction: 'caller' });
    }
  }

  return {
    nodes: dedupeNodes(nodes),
    relationships: dedupeRelationships(relationships),
    callers: relationships
      .filter((relationship) => relationship.direction === 'caller')
      .map((relationship) => ({ symbol: relationship.from, depth: relationship.depth })),
    callees: relationships
      .filter((relationship) => relationship.direction === 'callee')
      .map((relationship) => relationship.to),
  };
}

function parseFunctions(source, filePath, language, codeContextLines) {
  if (!source) return [];
  if (language === 'lua') return parseLuaFunctions(source, filePath, codeContextLines);
  if (language === 'c/c++') return parseCFunctions(source, filePath, codeContextLines);
  return [];
}

function parseLuaFunctions(source, filePath, codeContextLines) {
  const lines = source.split(/\r?\n/);
  const functions = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const symbol =
      line.match(/^\s*function\s+([a-zA-Z_][\w.:]*)\s*\(/)?.[1] ||
      line.match(/^\s*local\s+function\s+([a-zA-Z_][\w]*)\s*\(/)?.[1] ||
      line.match(/^\s*([a-zA-Z_][\w.:]*)\s*=\s*function\s*\(/)?.[1];
    if (!symbol) continue;

    const end = findLuaFunctionEnd(lines, index);
    functions.push(createParsedFunction({ filePath, symbol, lines, start: index, end, codeContextLines }));
  }

  return functions;
}

function parseCFunctions(source, filePath, codeContextLines) {
  const lines = source.split(/\r?\n/);
  const functions = [];
  const signatureRegex = /^\s*(?:[\w:*&<>~,]+\s+)+([~a-zA-Z_][\w:]*)\s*\([^;]*\)\s*(?:const\s*)?\{/;

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(signatureRegex);
    if (!match) continue;
    const symbol = match[1].split('::').pop();
    const end = findBraceFunctionEnd(lines, index);
    functions.push(createParsedFunction({ filePath, symbol, lines, start: index, end, codeContextLines }));
  }

  return functions;
}

function createParsedFunction({ filePath, symbol, lines, start, end, codeContextLines }) {
  const boundedEnd = Math.min(end, start + codeContextLines - 1);
  const code = lines.slice(start, boundedEnd + 1).join('\n');
  return {
    symbol,
    file: filePath,
    lineStart: start + 1,
    lineEnd: end + 1,
    body: lines.slice(start, end + 1).join('\n'),
    code,
  };
}

function findLuaFunctionEnd(lines, start) {
  let nested = 0;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^(local\s+)?function\b/.test(line) && index !== start) nested += 1;
    if (line === 'end') {
      if (nested === 0) return index;
      nested -= 1;
    }
  }
  return Math.min(lines.length - 1, start + 20);
}

function findBraceFunctionEnd(lines, start) {
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    for (const char of lines[index]) {
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
    }
    if (depth === 0 && index > start) return index;
  }
  return Math.min(lines.length - 1, start + 20);
}

function findCalleeFunctions(fn, parsedFunctions) {
  const calls = findLikelyCallees(fn.body);
  return parsedFunctions.filter((candidate) => {
    if (candidate.symbol === fn.symbol) return false;
    return calls.has(candidate.symbol) || calls.has(simpleName(candidate.symbol));
  });
}

function findCallerFunctions(fn, parsedFunctions) {
  const targetNames = new Set([fn.symbol, simpleName(fn.symbol)]);
  return parsedFunctions.filter((candidate) => {
    if (candidate.symbol === fn.symbol) return false;
    const calls = findLikelyCallees(candidate.body);
    return Array.from(targetNames).some((name) => calls.has(name));
  });
}

function findLikelyCallees(source) {
  const calls = new Set();
  const callRegex = /([a-zA-Z_][\w.:]*)\s*\(/g;
  for (const match of source.matchAll(callRegex)) {
    const name = match[1];
    if (!['if', 'for', 'while', 'switch', 'return', 'function'].includes(name)) {
      calls.add(name);
      calls.add(simpleName(name));
    }
  }
  return calls;
}

function simpleName(symbol) {
  return String(symbol || '').split(/[.:]/).pop();
}

function fallbackFunction(root) {
  return {
    symbol: root.symbol,
    file: root.file,
    lineStart: root.lineHint,
    lineEnd: root.lineHint,
    body: '',
    code: '',
  };
}

function dedupeNodes(nodes) {
  const seen = new Set();
  return nodes.filter((node) => {
    const key = `${node.file}:${node.symbol}:${node.depth}:${node.direction}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeRelationships(relationships) {
  const seen = new Set();
  return relationships.filter((relationship) => {
    const key = `${relationship.from}->${relationship.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
