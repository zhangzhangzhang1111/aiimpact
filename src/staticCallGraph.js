import fs from 'node:fs/promises';
import path from 'node:path';

export async function buildStaticCallGraph({ repoDir, changedFunctions }) {
  const entries = [];
  for (const fn of changedFunctions) {
    const absolute = path.join(repoDir, fn.file);
    let source = '';
    try {
      source = await fs.readFile(absolute, 'utf8');
    } catch {
      source = '';
    }

    entries.push({
      symbol: fn.symbol,
      file: fn.file,
      language: fn.language,
      lineHint: fn.lineHint,
      callers: source ? findTextReferences(source, fn.symbol) : [],
      callees: source ? findLikelyCallees(source, fn.language) : [],
      source: 'static-fallback',
    });
  }
  return entries;
}

function findTextReferences(source, symbol) {
  const simple = symbol.split(/[.:]/).pop();
  const lines = source.split(/\r?\n/);
  return lines
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter((item) => item.text.includes(symbol) || item.text.includes(`${simple}(`))
    .slice(0, 20);
}

function findLikelyCallees(source, language) {
  const calls = new Set();
  const callRegex = language === 'lua' ? /([a-zA-Z_][\w.:]*)\s*\(/g : /([a-zA-Z_][\w:]*)\s*\(/g;
  for (const match of source.matchAll(callRegex)) {
    const name = match[1];
    if (!['if', 'for', 'while', 'switch', 'return', 'function'].includes(name)) {
      calls.add(name);
    }
  }
  return Array.from(calls).slice(0, 50);
}
