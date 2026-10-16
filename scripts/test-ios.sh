#!/usr/bin/env bash
# The iOS app's checks, the same steps as the `iOS` CI job (E008). `pnpm test:ios` runs this.
#
#   test-ios.sh   SwiftLint and its fixtures (literal text, colours, direct Sentry calls), the Debug and Release
#                 configurations, the Swift package allowlist, then the unit and UI tests in nl and en on the newest
#                 iPhone simulator (IOS_SIMULATOR="iPhone 17" picks one by name)
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

# Debug's committed defaults are the local dev server and no Sentry DSN, so Debug builds, tests and CI send nothing to
# Sentry (a developer's Config/Local.xcconfig may override both; CI has none).
debug_configuration() {
  local url dsn
  url="$(sed -nE 's/^TRAINER_HUB_API_BASE_URL = //p' Config/Debug.xcconfig)"
  # shellcheck disable=SC2016 # the xcconfig's literal `$()`, which keeps `//` from starting a comment
  [ "$url" = 'http:/$()/localhost:3000/api' ] \
    || { echo "Config/Debug.xcconfig: base URL is not the local dev server: $url"; return 1; }
  dsn="$(sed -nE 's/^TRAINER_HUB_SENTRY_DSN =//p' Config/Debug.xcconfig)"
  [ -z "${dsn// /}" ] \
    || { echo "Config/Debug.xcconfig: TRAINER_HUB_SENTRY_DSN must stay empty; set it in Local.xcconfig"; return 1; }
}

# Release talks HTTPS to the production API only: no App Transport Security exception in its Info.plist.
release_configuration() {
  local settings url plist
  settings="$(xcodebuild -project TrainerHub.xcodeproj -target TrainerHub -configuration Release -showBuildSettings)"
  url="$(sed -nE 's/^ *TRAINER_HUB_API_BASE_URL = //p' <<<"$settings")"
  plist="$(sed -nE 's/^ *INFOPLIST_FILE = //p' <<<"$settings")"
  [[ "$url" == https://?*/api ]] || { echo "Release API base URL is not https://<host>/api: $url"; return 1; }
  grep -qE '^ *TRAINER_HUB_SENTRY_ENVIRONMENT = production$' <<<"$settings" \
    || { echo "Release does not report to Sentry as environment production"; return 1; }
  if plutil -extract NSAppTransportSecurity raw -o - "$plist" >/dev/null 2>&1; then
    echo "$plist has NSAppTransportSecurity: plain HTTP is for Debug only"
    return 1
  fi
}

# Every remote Swift package the app resolves is on this list. The app has no analytics SDK (PostHog or other): product
# events are captured server-side (E009, OBSERVABILITY.md §6). Adding a package means adding it here, in review.
swift_packages() {
  local allowed unexpected
  allowed='sentry-cocoa swift-collections swift-http-types swift-openapi-runtime swift-openapi-urlsession'
  unexpected="$(jq -r '.pins[].identity' TrainerHub.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved \
    | grep -vxF -f <(tr ' ' '\n' <<<"$allowed") || true)"
  [ -z "$unexpected" ] || { echo "Swift packages not on the allowlist in scripts/test-ios.sh: $unexpected"; return 1; }
}

echo "▶ SwiftLint"
"$SWIFTLINT" lint --strict --quiet
echo "▶ SwiftLint rejects literal text, colours and direct Sentry calls (lint/fixtures)"
lint_fixture lint/fixtures/LiteralText.swift no_literal_text
lint_fixture lint/fixtures/ColourLiteral.swift no_colour_literal
lint_fixture lint/fixtures/DirectSentry.swift no_direct_sentry
echo "▶ Debug and Release configurations"
debug_configuration
release_configuration
echo "▶ Swift packages (no analytics SDK)"
swift_packages

udid="$(ios_simulator)"
[ -n "$udid" ] || die "no iPhone simulator${IOS_SIMULATOR:+ named $IOS_SIMULATOR} — run scripts/bootstrap.sh --mobile"
echo "▶ Build without signing, unit and UI tests in nl and en (simulator $udid)"
rm -rf .build/TestResults.xcresult
xcodebuild test -project TrainerHub.xcodeproj -scheme TrainerHub -testPlan TrainerHub -destination "id=$udid" \
  -clonedSourcePackagesDirPath .build/SourcePackages -derivedDataPath .build/DerivedData \
  -resultBundlePath .build/TestResults.xcresult -quiet CODE_SIGNING_ALLOWED=NO
echo "✓ iOS"
