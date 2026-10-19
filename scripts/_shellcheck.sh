#!/usr/bin/env bash
# shellcheck disable=SC2034 # variables here are used by the scripts that source this file
# The one pinned shellcheck (E002 #109), read by bootstrap.sh, check.sh and the CI workflow (ci.yml sources this file).
# `pnpm lint:root` and check.sh must agree with CI on every finding, and shellcheck's findings differ per version (SC2015
# was flagged by CI's preinstalled shellcheck, not by the local 0.11.0), so every machine runs this version.
# Source _lib.sh first. Bash 3.2 compatible.
#
# To upgrade: take the version from https://github.com/koalaman/shellcheck/releases and, for every platform below, the
# SHA-256 that GitHub shows beside the release asset shellcheck-v<version>.<os>.<arch>.tar.gz (or compute it on the file);
# then fix what the new version flags.

SHELLCHECK_VERSION=0.11.0
SHELLCHECK_SHA256_darwin_aarch64=339b930feb1ea764467013cc1f72d09cd6b869ebf1013296ba9055ab2ffbd26f
SHELLCHECK_SHA256_darwin_x86_64=c2c15e08df0e8fbc374c335b230a7ee958c313fa5714817a59aa59f1aa594f51
SHELLCHECK_SHA256_linux_aarch64=68a8133197a50beb8803f8d42f9908d1af1c5540d4bb05fdfca8c1fa47decefc
SHELLCHECK_SHA256_linux_x86_64=b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6

# Downloaded once into the main checkout (git-ignored), so every worktree shares it, and cached by CI.
TOOLS_DIR="${TOOLS_DIR:-$MAIN_ROOT/.tools}"
SHELLCHECK_HOME="$TOOLS_DIR/shellcheck-$SHELLCHECK_VERSION"

# `<os>.<arch>` as the release assets name them: darwin or linux, aarch64 or x86_64.
shellcheck_platform() {
  local arch
  arch="$(uname -m)"
  [ "$arch" != arm64 ] || arch=aarch64
  echo "$(uname -s | tr '[:upper:]' '[:lower:]').$arch"
}

# The version of the shellcheck on PATH; empty when there is none.
shellcheck_version() {
  shellcheck --version 2>/dev/null | sed -n 's/^version: //p' || true
}

# Puts the pinned shellcheck, when installed, first on PATH of this process (and of what it starts, like turbo).
use_pinned_shellcheck() {
  [ -x "$SHELLCHECK_HOME/shellcheck" ] || return 0
  case ":$PATH:" in
    ":$SHELLCHECK_HOME:"*) ;;
    *) export PATH="$SHELLCHECK_HOME:$PATH" ;;
  esac
}

# Prints a warning, and still succeeds, when the shellcheck on PATH isn't the pinned one. Nothing for a missing one:
# running it reports that.
warn_shellcheck_version() {
  local have
  have="$(shellcheck_version)"
  if [ -n "$have" ] && [ "$have" != "$SHELLCHECK_VERSION" ]; then
    echo "⚠️  shellcheck $have found, CI runs $SHELLCHECK_VERSION, so a finding may show only in CI — run: scripts/bootstrap.sh"
  fi
}

# Downloads the pinned release, checks its SHA-256 and unpacks it into $SHELLCHECK_HOME. Nothing when it's there already.
# curl is the system one on macOS, which trusts the keychain, so a TLS-inspecting proxy (Zscaler) is no problem; the
# checksum is what vouches for the file.
install_shellcheck() {
  [ -x "$SHELLCHECK_HOME/shellcheck" ] && return 0
  local platform sha_var sha archive unpacked
  platform="$(shellcheck_platform)"
  sha_var="SHELLCHECK_SHA256_${platform//./_}"
  sha="${!sha_var:-}"
  [ -n "$sha" ] || { echo "no shellcheck $SHELLCHECK_VERSION for $platform (scripts/_shellcheck.sh)" >&2; return 1; }
  archive="$SHELLCHECK_HOME.tar.gz.partial"
  unpacked="$SHELLCHECK_HOME.partial"
  mkdir -p "$TOOLS_DIR"
  rm -rf "$unpacked"
  curl -fsSL --retry 3 -o "$archive" \
    "https://github.com/koalaman/shellcheck/releases/download/v$SHELLCHECK_VERSION/shellcheck-v$SHELLCHECK_VERSION.$platform.tar.gz" \
    || { rm -f "$archive"; return 1; }
  if ! echo "$sha  $archive" | shasum -a 256 -c --status; then
    rm -f "$archive"
    echo "the shellcheck $SHELLCHECK_VERSION download doesn't match its SHA-256" >&2
    return 1
  fi
  mkdir -p "$unpacked"
  tar -xzf "$archive" -C "$unpacked" --strip-components=1 "shellcheck-v$SHELLCHECK_VERSION/shellcheck" \
    || { rm -rf "$archive" "$unpacked"; return 1; }
  rm -f "$archive"
  rm -rf "$SHELLCHECK_HOME"
  mv "$unpacked" "$SHELLCHECK_HOME"
}
