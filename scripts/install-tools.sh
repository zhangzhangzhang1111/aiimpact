#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="${ROOT_DIR}/tools/vendor"
mkdir -p "${VENDOR_DIR}"

if [ "${INSTALL_TOOLS:-0}" != "1" ]; then
  echo "Skipping external tool clone. Set INSTALL_TOOLS=1 to clone LuaLS and codegraph."
  exit 0
fi

if [ ! -d "${VENDOR_DIR}/lua-language-server/.git" ]; then
  git clone --depth 1 https://github.com/LuaLS/lua-language-server.git "${VENDOR_DIR}/lua-language-server"
fi

if [ ! -d "${VENDOR_DIR}/codegraph/.git" ]; then
  git clone --depth 1 https://github.com/colbymchenry/codegraph.git "${VENDOR_DIR}/codegraph"
fi

echo "External tools are present under ${VENDOR_DIR}."
