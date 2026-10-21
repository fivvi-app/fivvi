#!/usr/bin/env bash
# Install or check everything this repo's scripts and checks need, then install the workspace. Safe to re-run.
#
#   bootstrap.sh            everything for day-to-day work
#   bootstrap.sh --api      also Java 17+ and the Swift toolchain, needed to change the API (pnpm generate:contract)
#   bootstrap.sh --mobile   also the native app toolchains: Xcode, an iPhone simulator and SwiftLint (pnpm test:ios),
#                           and the JDK, the Android SDK and emulator, and Maestro (pnpm test:android, pnpm test:maestro)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$ROOT/scripts/_ios.sh"
source "$ROOT/scripts/_shellcheck.sh"

case "${1:-}" in
  --api | --mobile | "") ;;
  *) usage_of "$0" ;;
esac

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

# The iOS app (apps/ios): Xcode with an iPhone simulator, and the pinned SwiftLint (scripts/_ios.sh).
install_ios_tools() {
  local preset="${DEVELOPER_DIR:-}"
  if [ -n "$preset" ] && ! use_xcode; then
    warn "DEVELOPER_DIR=$preset is not a usable Xcode — unset it or point it at an installed Xcode"
    return 1
  fi
  if ! use_xcode; then
    warn "Xcode not found — install it from the App Store, then run: sudo xcode-select -s /Applications/Xcode.app"
    return 1
  fi
  [ -z "$preset" ] && [ -n "${DEVELOPER_DIR:-}" ] \
    && echo "ℹ️  xcode-select points at the Command Line Tools; the iOS scripts use $DEVELOPER_DIR. To make it the default: sudo xcode-select -s /Applications/Xcode.app"
  xcodebuild -checkFirstLaunchStatus || warn "Xcode isn't set up yet — run: sudo xcodebuild -runFirstLaunch"
  [ -n "$(ios_simulator)" ] || warn "no iPhone simulator — install the iOS platform: xcodebuild -downloadPlatform iOS"
  install_swiftlint || warn "could not install SwiftLint $SWIFTLINT_VERSION (scripts/_ios.sh)"
}

need jq jq || true
ensure_shellcheck || warn "could not install shellcheck $SHELLCHECK_VERSION (scripts/_shellcheck.sh)"
need gh gh || true
gh auth status >/dev/null 2>&1 || warn "not logged in to GitHub — run: gh auth login"
command -v docker >/dev/null || warn "Docker not found — install Docker Desktop (Postgres for integration tests)"
if [ "${1:-}" = --api ]; then
  xcode-select -p >/dev/null 2>&1 || warn "Swift toolchain not found — run: xcode-select --install"
  install_java
fi
if [ "${1:-}" = --mobile ]; then
  install_ios_tools || true
  "$ROOT/scripts/android.sh" setup || warn "the Android toolchain is incomplete (see above)"
fi

git -C "$MAIN_ROOT" config core.hooksPath .githooks
"$ROOT/scripts/emails.sh" identity || warn "commits need a GitHub noreply user.email (AGENTS.md)"
mkdir -p "$WORKTREES_DIR" "$NOTES_DIR"

install_node || { warn "Node or pnpm missing — fix the above and re-run this script"; exit 1; }
(cd "$ROOT" && pnpm install --frozen-lockfile && pnpm --filter @fivvi/web exec playwright install chromium --only-shell) \
  || { warn "workspace install failed"; exit 1; }
[ -f "$ROOT/packages/database/.env" ] || cp "$ROOT/packages/database/.env.example" "$ROOT/packages/database/.env"

if [ "$WARN" = 0 ]; then echo "✅ ready"; else echo "Fix the warnings above, then re-run scripts/bootstrap.sh"; fi
