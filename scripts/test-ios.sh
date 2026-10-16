#!/usr/bin/env bash
# The iOS app's checks, the same steps as the `iOS` CI job (E008). `pnpm test:ios` runs this.
#
#   test-ios.sh   SwiftLint and its fixtures (literal text, colours), the Debug and Release configurations, then the
#                 unit and UI tests in nl and en on the newest iPhone simulator, in a worktree its own copy
#                 (IOS_SIMULATOR="iPhone 17" picks one by name); shuts down the simulator it booted when it ends,
#                 unless KEEP_DEVICE=1
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$ROOT/scripts/_ios.sh"
[ $# -eq 0 ] || usage_of "$0"

need_cmd jq
use_xcode || die "Xcode not found — run scripts/bootstrap.sh --mobile"
install_swiftlint || die "could not install SwiftLint — run scripts/bootstrap.sh --mobile"
cd "$IOS_DIR"

# Every line of a fixture marked `// expect: <rule>` must fail SwiftLint with that rule, naming the file and line; no
# other line may fail with it.
lint_fixture() {
  local fixture=$1 rule=$2 out expected actual
  if out="$("$SWIFTLINT" lint --strict --quiet "$fixture" 2>&1)"; then
    echo "SwiftLint passed $fixture, which breaks $rule"
    return 1
  fi
  expected="$(grep -n "// expect: $rule\$" "$fixture" | cut -d: -f1)"
  actual="$(grep "($rule)" <<<"$out" | grep -oE "$(basename "$fixture"):[0-9]+" | cut -d: -f2 | sort -nu)"
  [ "$expected" = "$actual" ] && return
  echo "$fixture: expected $rule on lines $(echo "$expected" | xargs), got $(echo "$actual" | xargs):"
  echo "$out"
  return 1
}

# Debug's committed default is the local dev server (a developer's Config/Local.xcconfig may override it; CI has none).
debug_configuration() {
  local url
  url="$(sed -nE 's/^TRAINER_HUB_API_BASE_URL = //p' Config/Debug.xcconfig)"
  # shellcheck disable=SC2016 # the xcconfig's literal `$()`, which keeps `//` from starting a comment
  [ "$url" = 'http:/$()/localhost:3000/api' ] \
    || { echo "Config/Debug.xcconfig: base URL is not the local dev server: $url"; return 1; }
}

# Release talks HTTPS to the production API only: no App Transport Security exception in its Info.plist.
release_configuration() {
  local settings url plist
  settings="$(xcodebuild -project TrainerHub.xcodeproj -target TrainerHub -configuration Release -showBuildSettings)"
  url="$(sed -nE 's/^ *TRAINER_HUB_API_BASE_URL = //p' <<<"$settings")"
  plist="$(sed -nE 's/^ *INFOPLIST_FILE = //p' <<<"$settings")"
  [[ "$url" == https://?*/api ]] || { echo "Release API base URL is not https://<host>/api: $url"; return 1; }
  if plutil -extract NSAppTransportSecurity raw -o - "$plist" >/dev/null 2>&1; then
    echo "$plist has NSAppTransportSecurity: plain HTTP is for Debug only"
    return 1
  fi
}

echo "▶ SwiftLint"
"$SWIFTLINT" lint --strict --quiet
echo "▶ SwiftLint rejects literal text and colours (lint/fixtures)"
lint_fixture lint/fixtures/LiteralText.swift no_literal_text
lint_fixture lint/fixtures/ColourLiteral.swift no_colour_literal
echo "▶ Debug and Release configurations"
debug_configuration
release_configuration

udid="$(ios_simulator)"
[ -n "$udid" ] || die "no iPhone simulator${IOS_SIMULATOR:+ named $IOS_SIMULATOR} — run scripts/bootstrap.sh --mobile"
on_exit 'stop_simulator || true'
boot_simulator "$udid"
echo "▶ Build without signing, unit and UI tests in nl and en (simulator $udid)"
rm -rf .build/TestResults.xcresult
xcodebuild test -project TrainerHub.xcodeproj -scheme TrainerHub -testPlan TrainerHub -destination "id=$udid" \
  -clonedSourcePackagesDirPath .build/SourcePackages -derivedDataPath .build/DerivedData \
  -resultBundlePath .build/TestResults.xcresult -quiet CODE_SIGNING_ALLOWED=NO
echo "✓ iOS"
