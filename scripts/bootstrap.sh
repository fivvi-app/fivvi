#!/usr/bin/env bash
# Install or check everything this repo's scripts and checks need, then install the workspace. Safe to re-run.
#
#   bootstrap.sh         everything for day-to-day work
#   bootstrap.sh --api   also Java 17+ and the Swift toolchain, needed to change the API (pnpm generate:contract)
#   bootstrap.sh --mobile  also the native app toolchains: the JDK, the Android SDK and emulator, and Maestro (E008)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

WARN=0
warn() { echo "⚠️  $*"; WARN=1; }

need() {
  command -v "$1" >/dev/null && return
  command -v brew >/dev/null || { warn "$1 not found — install it: brew install $2"; return 1; }
  brew install "$2" || { warn "could not install $2"; return 1; }
}

# The contract check runs openapi-generator on Java 17+ (packages/contract/README.md).
install_java() {
  java_ok && return
  use_brew_java && return
  if command -v brew >/dev/null && brew install openjdk@21 && use_brew_java; then return; fi
  warn "Java 17+ not found — install it: brew install openjdk@21"
}

install_node() {
  local want nvm_sh="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  want="$(cat "$ROOT/.nvmrc")"
  if [ "$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')" != "$want" ]; then
    [ -s "$nvm_sh" ] || { warn "Node $want needed (.nvmrc) — install nvm or Node $want"; return 1; }
    # shellcheck disable=SC1090
    source "$nvm_sh" && nvm install "$want" >/dev/null && nvm use "$want" >/dev/null || return 1
  fi
  pnpm --version >/dev/null 2>&1 \
    || npm install --global --ignore-scripts "$(node -p "require('$ROOT/package.json').packageManager")" || return 1
}

need jq jq || true
need shellcheck shellcheck || true
need gh gh || true
gh auth status >/dev/null 2>&1 || warn "not logged in to GitHub — run: gh auth login"
command -v docker >/dev/null || warn "Docker not found — install Docker Desktop (Postgres for integration tests)"
if [ "${1:-}" = --api ]; then
  xcode-select -p >/dev/null 2>&1 || warn "Swift toolchain not found — run: xcode-select --install"
  install_java
fi
if [ "${1:-}" = --mobile ]; then
  "$ROOT/scripts/android.sh" setup || warn "the Android toolchain is incomplete (see above)"
fi

git -C "$MAIN_ROOT" config core.hooksPath .githooks
mkdir -p "$WORKTREES_DIR" "$NOTES_DIR"

install_node || { warn "Node or pnpm missing — fix the above and re-run this script"; exit 1; }
(cd "$ROOT" && pnpm install --frozen-lockfile && pnpm --filter @trainer-hub/web exec playwright install chromium --only-shell) \
  || { warn "workspace install failed"; exit 1; }
[ -f "$ROOT/packages/database/.env" ] || cp "$ROOT/packages/database/.env.example" "$ROOT/packages/database/.env"

if [ "$WARN" = 0 ]; then echo "✅ ready"; else echo "Fix the warnings above, then re-run scripts/bootstrap.sh"; fi
