import assert from 'node:assert/strict';
import test from 'node:test';

import { detectLanguages, extractChangedFunctions, parseNameStatus } from '../src/diffParser.js';

test('detectLanguages maps lua and c family files from changed paths', () => {
  const result = detectLanguages(['src/main.lua', 'native/foo.cpp', 'native/foo.h', 'README.md']);

  assert.deepEqual(result.languages.sort(), ['c/c++', 'lua']);
  assert.deepEqual(result.filesByLanguage.lua, ['src/main.lua']);
  assert.deepEqual(result.filesByLanguage['c/c++'], ['native/foo.cpp', 'native/foo.h']);
});

test('parseNameStatus extracts changed file paths from git name-status output', () => {
  const result = parseNameStatus('M\tsrc/main.lua\nA\tnative/foo.cpp\nR100\told.c\tnew.c\n');

  assert.deepEqual(result.map((item) => item.path), ['src/main.lua', 'native/foo.cpp', 'new.c']);
  assert.equal(result[2].status, 'R100');
});

test('extractChangedFunctions finds hunk-level lua and c family functions', () => {
  const diff = [
    'diff --git a/src/main.lua b/src/main.lua',
    '+++ b/src/main.lua',
    '@@ -10,6 +10,7 @@ function billing.reconcile(order)',
    '+  return order.id',
    'diff --git a/native/foo.cpp b/native/foo.cpp',
    '+++ b/native/foo.cpp',
    '@@ -22,6 +22,7 @@ int calculateRisk(int value) {',
    '+  return value + 1;',
  ].join('\n');

  const functions = extractChangedFunctions(diff);

  assert.deepEqual(functions, [
    { file: 'src/main.lua', symbol: 'billing.reconcile', language: 'lua', lineHint: 10 },
    { file: 'native/foo.cpp', symbol: 'calculateRisk', language: 'c/c++', lineHint: 22 },
  ]);
});
