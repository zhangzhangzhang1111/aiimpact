# Offline Tool Archives

Put offline release archives here before building or running in a network-restricted Linux container.

Supported CodeGraph archive names:

- `codegraph-linux-x64.tar.gz`
- `codegraph-linux-arm64.tar.gz`

The installer extracts the matching archive into `tools/vendor/codegraph/<target>/` and links:

```text
tools/vendor/bin/codegraph
```

LuaLS currently downloads release archives during `start.sh`; if you need fully offline LuaLS too, pre-populate `tools/vendor/lua-language-server/linux-x64/` and `tools/vendor/lua-language-server/linux-arm64/` with the extracted LuaLS release directories, including `bin/lua-language-server`.
