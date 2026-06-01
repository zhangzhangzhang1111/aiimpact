# Offline Tool Archives

This directory is intended to contain all Linux release archives required for a network-restricted container.

Included archive names:

- `lua-language-server-3.18.2-linux-x64.tar.gz`
- `lua-language-server-3.18.2-linux-arm64.tar.gz`
- `codegraph-linux-x64.tar.gz`
- `codegraph-linux-arm64.tar.gz`

The installer extracts the matching archive for the current Linux architecture into `tools/vendor/` and links:

```text
tools/vendor/bin/lua-language-server
tools/vendor/bin/codegraph
```
