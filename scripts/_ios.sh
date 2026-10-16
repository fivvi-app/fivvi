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

# UDID of the first iPhone simulator on the newest iOS runtime, or of the one named $IOS_SIMULATOR. Empty if none.
ios_simulator() {
  xcrun simctl list devices available --json | jq -r --arg name "${IOS_SIMULATOR:-}" '
    [.devices | to_entries[] | select(.key | test("SimRuntime\\.iOS-"))
      | (.key | capture("iOS-(?<v>[0-9-]+)$").v | split("-") | map(tonumber)) as $version
      | .value[] | select(if $name == "" then .name | startswith("iPhone") else .name == $name end)
      | {version: $version, udid}]
    | (map(.version) | max) as $newest | map(select(.version == $newest)) | first | .udid // empty'
}
