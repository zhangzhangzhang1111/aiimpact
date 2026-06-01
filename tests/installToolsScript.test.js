import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('install-tools installs Linux LuaLS release artifacts and codegraph into tools/vendor', async () => {
  const script = await fs.readFile('scripts/install-tools.sh', 'utf8');

  assert.match(script, /linux-x64 linux-arm64/);
  assert.match(script, /LuaLS\/lua-language-server\/releases\/download/);
  assert.match(script, /CODEGRAPH_OFFLINE_DIR/);
  assert.match(script, /codegraph-\$\{target\}\.tar\.gz/);
  assert.match(script, /tar -xzf "\$\{offline_archive\}"/);
  assert.match(script, /tools\/vendor/);
});
