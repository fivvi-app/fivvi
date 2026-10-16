#!/usr/bin/env bash
# shellcheck disable=SC2034 # variables here are used by the scripts that source this file
# iOS helpers for test-ios.sh and bootstrap.sh --mobile (E008). Source after _lib.sh.

IOS_DIR="$ROOT/apps/ios"

# SwiftLint is pinned by version and SHA-256, like the contract's generators, and kept in apps/ios/.build (git-ignored).
SWIFTLINT_VERSION=0.65.1
SWIFTLINT_SHA256=c1e429b0599cf1b516f369a2d9ec04eaf0e436f3c12b637df8851fa52ff694d0
SWIFTLINT="$IOS_DIR/.build/swiftlint-$SWIFTLINT_VERSION/swiftlint"

xcode_ok() { xcrun simctl help >/dev/null 2>&1 && xcodebuild -version >/dev/null 2>&1; }

# A DEVELOPER_DIR that is set (CI pins an Xcode with it) must work: never swap in another Xcode. Otherwise xcode-select
# may point at the Command Line Tools, which have no simulator; use /Applications/Xcode.app for this process then.
use_xcode() {
  if [ -n "${DEVELOPER_DIR:-}" ]; then
    xcode_ok && return
    echo "DEVELOPER_DIR=$DEVELOPER_DIR is not a usable Xcode (xcodebuild and simctl)" >&2
    return 1
  fi
  xcode_ok && return
  [ -d /Applications/Xcode.app ] || return 1
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  xcode_ok
}

install_swiftlint() {
  [ -x "$SWIFTLINT" ] && return
  local dir zip
  dir="$(dirname "$SWIFTLINT")"
  zip="$dir.zip.partial"
  mkdir -p "$(dirname "$dir")"
  curl -fsSL --retry 3 -o "$zip" \
    "https://github.com/realm/SwiftLint/releases/download/$SWIFTLINT_VERSION/portable_swiftlint.zip" \
    || { rm -f "$zip"; return 1; }
  if ! echo "$SWIFTLINT_SHA256  $zip" | shasum -a 256 -c --status; then
    rm -f "$zip"
    echo "the SwiftLint $SWIFTLINT_VERSION download doesn't match its SHA-256" >&2
    return 1
  fi
  unzip -q -o "$zip" swiftlint -d "$dir" && rm -f "$zip"
}

# `<udid> <device type> <runtime>` of the first iPhone simulator on the newest iOS runtime, or of the newest one named $1.
# Empty if none.
iphone_simulator() {
  xcrun simctl list devices available --json | jq -r --arg name "$1" '
    [.devices | to_entries[] | select(.key | test("SimRuntime\\.iOS-")) | .key as $runtime
      | ($runtime | capture("iOS-(?<v>[0-9-]+)$").v | split("-") | map(tonumber)) as $version
      | .value[] | select(if $name == "" then .name | startswith("iPhone") else .name == $name end)
      | {version: $version, udid, type: .deviceTypeIdentifier, runtime: $runtime}]
    | (map(.version) | max) as $newest | map(select(.version == $newest)) | first // empty
    | "\(.udid) \(.type) \(.runtime)"'
}

# The simulator of the worktree in $1 (default: this checkout), so parallel worktrees never install over each other's
# runs. Empty for the main checkout, which (like CI) uses the newest iPhone. scripts/wt.sh done deletes it.
worktree_simulator_name() {
  local dir="${1:-$ROOT}"
  [ "$dir" = "$MAIN_ROOT" ] || echo "Trainer Hub $(basename "$dir")"
}

# UDID of the simulator to test on: the one named $IOS_SIMULATOR; else this worktree's own, created as a copy of the
# newest iPhone when missing; else (the main checkout) the newest iPhone. Empty if none.
ios_simulator() {
  local own="" udid type runtime
  [ -n "${IOS_SIMULATOR:-}" ] || own="$(worktree_simulator_name)"
  if [ -n "$own" ] && [ -z "$(iphone_simulator "$own")" ]; then
    read -r udid type runtime <<<"$(iphone_simulator "")"
    [ -n "$udid" ] || return 0
    echo "Creating simulator '$own' ($type, $runtime)" >&2
    xcrun simctl create "$own" "$type" "$runtime" >/dev/null
  fi
  read -r udid _ <<<"$(iphone_simulator "${IOS_SIMULATOR:-$own}")"
  echo "$udid"
}

# The simulator this run booted, which stop_simulator shuts down; empty when it was already booted.
BOOTED_SIMULATOR=""

simulator_booted() {
  xcrun simctl list devices --json \
    | jq -e --arg udid "$1" '[.devices[][] | select(.udid == $udid and .state == "Booted")] | length > 0' >/dev/null
}

# Boots simulator $1 unless it's already booted, and waits until it has.
boot_simulator() {
  simulator_booted "$1" || BOOTED_SIMULATOR="$1"
  xcrun simctl bootstatus "$1" -b >/dev/null
}

# Shuts down the simulator this run booted, unless KEEP_DEVICE=1. Fails when the simulator stays running.
stop_simulator() {
  [ -n "$BOOTED_SIMULATOR" ] && [ "${KEEP_DEVICE:-}" != 1 ] || return 1
  xcrun simctl shutdown "$BOOTED_SIMULATOR" >/dev/null 2>&1 || true
}

# Deletes the simulator of the worktree in $1; nothing on a machine without Xcode.
delete_worktree_simulator() {
  local name udid
  name="$(worktree_simulator_name "$1")"
  [ -n "$name" ] && use_xcode 2>/dev/null || return 0
  for udid in $(xcrun simctl list devices --json | jq -r --arg name "$name" '.devices[][] | select(.name == $name) | .udid'); do
    xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true
    if xcrun simctl delete "$udid"; then echo "🗑  deleted simulator '$name'"; fi
  done
}
