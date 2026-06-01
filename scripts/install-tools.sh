#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="${ROOT_DIR}/tools/vendor"
BIN_DIR="${VENDOR_DIR}/bin"
DOWNLOAD_DIR="${VENDOR_DIR}/downloads"
CODEGRAPH_OFFLINE_DIR="${CODEGRAPH_OFFLINE_DIR:-${ROOT_DIR}/tools/offline}"
mkdir -p "${VENDOR_DIR}" "${BIN_DIR}" "${DOWNLOAD_DIR}"

if [ "${SKIP_TOOL_INSTALL:-0}" = "1" ]; then
  echo "Skipping external tool install because SKIP_TOOL_INSTALL=1."
  exit 0
fi

OS="$(uname -s)"
if [ "${OS}" != "Linux" ]; then
  echo "Skipping Linux tool bundles on non-Linux host (${OS})."
  exit 0
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need_cmd curl
need_cmd tar
need_cmd node

resolve_luals_version() {
  if [ -n "${LUALS_VERSION:-}" ]; then
    printf '%s\n' "${LUALS_VERSION}"
    return
  fi
  node -e "const r=await fetch('https://api.github.com/repos/LuaLS/lua-language-server/releases/latest').then(x=>x.json()); if(!r.tag_name) throw new Error('failed to resolve LuaLS latest release'); console.log(r.tag_name);"
}

download_luals_asset() {
  local version="$1"
  local target="$2"
  local archive="lua-language-server-${version}-${target}.tar.gz"
  local url="https://github.com/LuaLS/lua-language-server/releases/download/${version}/${archive}"
  local dest="${VENDOR_DIR}/lua-language-server/${target}"

  if [ -x "${dest}/bin/lua-language-server" ]; then
    echo "LuaLS ${version} ${target} already installed."
    return
  fi

  echo "Installing LuaLS ${version} ${target}..."
  rm -rf "${dest}"
  mkdir -p "${dest}"
  curl -fsSL "${url}" -o "${DOWNLOAD_DIR}/${archive}"
  tar -xzf "${DOWNLOAD_DIR}/${archive}" -C "${dest}"
}

install_luals() {
  local version
  version="$(resolve_luals_version)"

  # Keep both Linux release artifacts locally so a cloned repo can be used in
  # x64 and arm64 Linux containers with the same installer behavior.
  local targets="${LUALS_LINUX_TARGETS:-linux-x64 linux-arm64}"
  for target in ${targets}; do
    download_luals_asset "${version}" "${target}"
  done

  local machine
  machine="$(uname -m)"
  local current_target
  case "${machine}" in
    x86_64|amd64) current_target="linux-x64" ;;
    arm64|aarch64) current_target="linux-arm64" ;;
    *)
      echo "Unsupported Linux architecture for LuaLS: ${machine}" >&2
      exit 1
      ;;
  esac

  ln -sf "${VENDOR_DIR}/lua-language-server/${current_target}/bin/lua-language-server" "${BIN_DIR}/lua-language-server"
  "${BIN_DIR}/lua-language-server" --version >/dev/null 2>&1 || true
}

install_codegraph() {
  if [ -x "${BIN_DIR}/codegraph" ]; then
    echo "CodeGraph already installed."
    return
  fi

  local machine target
  machine="$(uname -m)"
  case "${machine}" in
    x86_64|amd64) target="linux-x64" ;;
    arm64|aarch64) target="linux-arm64" ;;
    *)
      echo "Unsupported Linux architecture for CodeGraph: ${machine}" >&2
      exit 1
      ;;
  esac

  local offline_archive="${CODEGRAPH_OFFLINE_DIR}/codegraph-${target}.tar.gz"
  local dest="${VENDOR_DIR}/codegraph/${target}"
  if [ -f "${offline_archive}" ]; then
    echo "Installing CodeGraph from offline archive: ${offline_archive}"
    rm -rf "${dest}"
    mkdir -p "${dest}"
    tar -xzf "${offline_archive}" -C "${dest}" --strip-components=1
    ln -sf "${dest}/bin/codegraph" "${BIN_DIR}/codegraph"
    return
  fi

  echo "Installing CodeGraph standalone bundle from GitHub release..."
  local version archive url
  version="${CODEGRAPH_VERSION:-}"
  if [ -z "${version}" ]; then
    version="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/colbymchenry/codegraph/releases/latest" | sed -n 's#.*/releases/tag/##p')"
  fi
  if [ -z "${version}" ]; then
    echo "Could not resolve CodeGraph version. Provide ${offline_archive} or set CODEGRAPH_VERSION." >&2
    exit 1
  fi
  case "${version}" in v*) ;; *) version="v${version}" ;; esac
  archive="codegraph-${target}.tar.gz"
  url="https://github.com/colbymchenry/codegraph/releases/download/${version}/${archive}"
  rm -rf "${dest}"
  mkdir -p "${dest}"
  curl -fsSL "${url}" -o "${DOWNLOAD_DIR}/${archive}"
  tar -xzf "${DOWNLOAD_DIR}/${archive}" -C "${dest}" --strip-components=1
  ln -sf "${dest}/bin/codegraph" "${BIN_DIR}/codegraph"
}

install_luals
install_codegraph

echo "External tools are installed under ${VENDOR_DIR}."
echo "Add to PATH when running manually: export PATH=\"${BIN_DIR}:\$PATH\""
