import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('install-tools installs Linux LuaLS release artifacts and codegraph into tools/vendor', async () => {
  const script = await fs.readFile('scripts/install-tools.sh', 'utf8');

  assert.match(script, /linux-x64 linux-arm64/);
  assert.match(script, /LUALS_OFFLINE_DIR/);
  assert.match(script, /lua-language-server-\*-\$\{target\}\.tar\.gz/);
  assert.match(script, /Installing LuaLS from offline archive/);
  assert.match(script, /CODEGRAPH_OFFLINE_DIR/);
  assert.match(script, /codegraph-\$\{target\}\.tar\.gz/);
  assert.match(script, /Installing CodeGraph from offline archive/);
  assert.match(script, /tools\/vendor/);
});

test('offline Linux tool archives are committed for no-network installation', async () => {
  const archives = [
    'tools/offline/lua-language-server-3.18.2-linux-x64.tar.gz',
    'tools/offline/lua-language-server-3.18.2-linux-arm64.tar.gz',
    'tools/offline/codegraph-linux-x64.tar.gz',
    'tools/offline/codegraph-linux-arm64.tar.gz',
  ];

  for (const archive of archives) {
    const stat = await fs.stat(archive);
    assert.ok(stat.size > 1024 * 1024, `${archive} should be a real release archive`);
  }
});
