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

# Whether file $2 has the SHA-256 $1. macOS has shasum; a minimal Linux may have only sha256sum.
sha256_matches() {
  if command -v shasum >/dev/null; then
    echo "$1  $2" | shasum -a 256 -c --status
  else
    echo "$1  $2" | sha256sum -c --status
  fi
}

# Downloads the pinned release into the directory $1, checks its SHA-256 and unpacks the binary there.
download_shellcheck() {
  local platform sha_var sha
  platform="$(shellcheck_platform)"
  sha_var="SHELLCHECK_SHA256_${platform//./_}"
  sha="${!sha_var:-}"
  [ -n "$sha" ] || { echo "no shellcheck $SHELLCHECK_VERSION for $platform (scripts/_shellcheck.sh)" >&2; return 1; }
  curl -fsSL --retry 3 -o "$1/release.tar.gz" \
    "https://github.com/koalaman/shellcheck/releases/download/v$SHELLCHECK_VERSION/shellcheck-v$SHELLCHECK_VERSION.$platform.tar.gz" \
    || return 1
  sha256_matches "$sha" "$1/release.tar.gz" \
    || { echo "the shellcheck $SHELLCHECK_VERSION download doesn't match its SHA-256" >&2; return 1; }
  tar -xzf "$1/release.tar.gz" -C "$1" --strip-components=1 "shellcheck-v$SHELLCHECK_VERSION/shellcheck"
}

# Installs the pinned release into $SHELLCHECK_HOME. Nothing when it's there already. Safe to run twice at once (two
# worktrees): each works in its own temporary directory inside $TOOLS_DIR and renames the binary into place, which never
# shows a half-written file; when the other install was first, its binary stays.
# curl is the system one on macOS, which trusts the keychain, so a TLS-inspecting proxy (Zscaler) is no problem; the
# checksum is what vouches for the file.
install_shellcheck() {
  [ -x "$SHELLCHECK_HOME/shellcheck" ] && return 0
  local tmp rc=0
  mkdir -p "$TOOLS_DIR"
  tmp="$(mktemp -d "$TOOLS_DIR/.shellcheck.XXXXXX")" || return 1
  download_shellcheck "$tmp" || rc=$?
  if [ "$rc" = 0 ]; then
    mkdir -p "$SHELLCHECK_HOME"
    [ -x "$SHELLCHECK_HOME/shellcheck" ] \
      || mv "$tmp/shellcheck" "$SHELLCHECK_HOME/shellcheck" \
      || [ -x "$SHELLCHECK_HOME/shellcheck" ] \
      || rc=1
  fi
  rm -rf "$tmp"
  return "$rc"
}

# What bootstrap.sh does: the pinned shellcheck first on PATH, installed unless the shellcheck on PATH is that version.
ensure_shellcheck() {
  use_pinned_shellcheck
  [ "$(shellcheck_version)" = "$SHELLCHECK_VERSION" ] && return 0
  install_shellcheck && use_pinned_shellcheck
}
