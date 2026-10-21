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
  [ "$dir" = "$MAIN_ROOT" ] || echo "Fivvi $(basename "$dir")"
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

# The simulators this run booted (space-separated UDIDs), which stop_simulator shuts down; empty when they were already
# booted.
BOOTED_SIMULATOR=""

simulator_booted() {
  xcrun simctl list devices --json \
    | jq -e --arg udid "$1" '[.devices[][] | select(.udid == $udid and .state == "Booted")] | length > 0' >/dev/null
}

# Boots simulator $1 unless it's already booted, and waits until it has.
boot_simulator() {
  simulator_booted "$1" || BOOTED_SIMULATOR="$BOOTED_SIMULATOR $1"
  xcrun simctl bootstatus "$1" -b >/dev/null
}

# Starts booting simulator $1 in the background, so the boot overlaps a build; await_boots waits for every one started.
BOOT_JOBS=""
start_boot() {
  simulator_booted "$1" || BOOTED_SIMULATOR="$BOOTED_SIMULATOR $1"
  xcrun simctl bootstatus "$1" -b >/dev/null &
  BOOT_JOBS="$BOOT_JOBS $!"
}

await_boots() {
  local pid jobs="$BOOT_JOBS"
  BOOT_JOBS=""
  for pid in $jobs; do wait "$pid" || return 1; done
}

# Shuts down the simulators this run booted, unless KEEP_DEVICE=1. Fails when they stay running.
stop_simulator() {
  local udid pid
  [ -n "$BOOTED_SIMULATOR" ] && [ "${KEEP_DEVICE:-}" != 1 ] || return 1
  for pid in $BOOT_JOBS; do kill "$pid" 2>/dev/null || true; done
  for udid in $BOOTED_SIMULATOR; do xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true; done
}

# A second simulator, the same model as the one tests run on by default, for the parallel run of both locales
# (delete_extra_simulator deletes it). Sets EXTRA_SIMULATOR to its UDID, so call it without a command substitution.
EXTRA_SIMULATOR=""
create_extra_simulator() {
  local type runtime
  read -r _ type runtime <<<"$(iphone_simulator "${IOS_SIMULATOR:-}")"
  [ -n "$type" ] || return 1
  EXTRA_SIMULATOR="$(xcrun simctl create "Fivvi parallel $$" "$type" "$runtime")"
}

delete_extra_simulator() {
  [ -n "$EXTRA_SIMULATOR" ] || return 0
  xcrun simctl shutdown "$EXTRA_SIMULATOR" >/dev/null 2>&1 || true
  xcrun simctl delete "$EXTRA_SIMULATOR" >/dev/null 2>&1 || true
  EXTRA_SIMULATOR=""
}

# Steps with their durations: `step <name>` ends the one running and starts the next; report_steps prints the table
# (and adds it to the job summary on CI).
STEP_NAMES=()
STEP_SECONDS=()
STEP_CURRENT=""
STEP_STARTED=0

end_step() {
  [ -n "$STEP_CURRENT" ] || return 0
  STEP_NAMES+=("$STEP_CURRENT")
  STEP_SECONDS+=("$((SECONDS - STEP_STARTED))")
  STEP_CURRENT=""
}

step() {
  end_step
  STEP_CURRENT="$1"
  STEP_STARTED=$SECONDS
  echo "▶ $1"
}

report_steps() {
  local i total=0 rows=""
  end_step
  [ "${#STEP_NAMES[@]}" -gt 0 ] || return 0
  echo
  echo "Step durations:"
  for i in "${!STEP_NAMES[@]}"; do
    printf '  %5s s  %s\n' "${STEP_SECONDS[$i]}" "${STEP_NAMES[$i]}"
    rows="$rows| ${STEP_NAMES[$i]} | ${STEP_SECONDS[$i]} s |"$'\n'
    total=$((total + STEP_SECONDS[i]))
  done
  printf '  %5s s  Total\n' "$total"
  summary "### iOS steps" "" "| Step | Duration |" "|---|--:|" "${rows%$'\n'}" "| **Total** | **$total s** |" ""
}

# The slowest tests of the result bundle $1 as table rows (`| test | seconds |`), at most $2, in the test-plan
# configuration $3. A bundle of both configurations has each test's time per configuration; a bundle of one has no
# configuration nodes, and its tests count for $3. Nothing when the bundle can't be read: a report never fails the run.
slowest_tests() {
  xcrun xcresulttool get test-results tests --path "$1" 2>/dev/null | jq -r --argjson n "$2" --arg config "$3" '
    [.. | objects | select(.nodeType? == "Test Case") | . as $test
      | [(.children // [])[] | select(.nodeType == "Test Plan Configuration")] as $configs
      | (if $configs == [] then [$test] else [$configs[] | select(.name == $config)] end)[]
      | {id: $test.nodeIdentifier, seconds: .durationInSeconds} | select(.seconds != null)]
    | sort_by(-.seconds) | .[:$n][]
    | "| \(.id) | \(.seconds * 10 | round / 10) |"' 2>/dev/null || true
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
