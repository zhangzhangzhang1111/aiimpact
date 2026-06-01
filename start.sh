#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
NODE_VERSION="$(node -v 2>/dev/null || echo missing)"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "Node.js >= 22.18.0 is required. Current: ${NODE_VERSION}" >&2
  exit 1
fi

DATA_ROOT="${DATA_ROOT:-/data}"
mkdir -p "${DATA_ROOT}/impact"
bash scripts/install-tools.sh
export PATH="${ROOT_DIR}/tools/vendor/bin:${PATH}"
export LUALS_BIN="${LUALS_BIN:-${ROOT_DIR}/tools/vendor/bin/lua-language-server}"
export CODEGRAPH_BIN="${CODEGRAPH_BIN:-${ROOT_DIR}/tools/vendor/bin/codegraph}"

exec npm start
