#!/usr/bin/env bash
# The iOS app's checks, the same steps as the `iOS` CI job (E008). `pnpm test:ios` runs this.
#
#   test-ios.sh   SwiftLint and its fixtures (literal text, colours, direct Sentry calls), the Debug and Release
#                 configurations (Release's Sentry DSN in the EU region), the Swift package allowlist, then one
#                 build-for-testing and the unit and UI tests in nl and en without building again, on the newest iPhone
#                 simulator, in a worktree its own copy (IOS_SIMULATOR="iPhone 17" picks one by name). The locales run
#                 one after the other, or at the same time on two simulators on CI (CI is set) or with IOS_PARALLEL=1
#                 (IOS_PARALLEL=0 turns it off). Prints the durations of its steps, the build timing summary and the
#                 slowest tests (also in the job summary on CI). Shuts down the simulators it booted when it ends,
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

# Debug's committed defaults are the local dev server and no Sentry DSN, so Debug builds, tests and CI send nothing to
# Sentry (a developer's Config/Local.xcconfig may override both; CI has none).
debug_configuration() {
  local url dsn
  url="$(sed -nE 's/^TRAINER_HUB_API_BASE_URL = //p' Config/Debug.xcconfig)"
  # shellcheck disable=SC2016 # the xcconfig's literal `$()`, which keeps `//` from starting a comment
  [ "$url" = 'http:/$()/localhost:3000/api' ] \
    || { echo "Config/Debug.xcconfig: base URL is not the local dev server: $url"; return 1; }
  # Every setting of the DSN, also indented or conditional (`TRAINER_HUB_SENTRY_DSN[sdk=…] = …`), must be empty.
  dsn="$(sed -nE 's/^[[:space:]]*TRAINER_HUB_SENTRY_DSN[^=]*=[[:space:]]*//p' Config/Debug.xcconfig | tr -d '[:space:]')"
  [ -z "$dsn" ] \
    || { echo "Config/Debug.xcconfig: TRAINER_HUB_SENTRY_DSN must stay empty; set it in Local.xcconfig"; return 1; }
}

# Release talks HTTPS to the production API only: no App Transport Security exception in its Info.plist. It reports to
# the Sentry `ios` project in the EU region: its DSN's host is `<org>.ingest.de.sentry.io`.
release_configuration() {
  local settings url dsn plist
  settings="$(xcodebuild -project TrainerHub.xcodeproj -target TrainerHub -configuration Release -showBuildSettings)"
  url="$(sed -nE 's/^ *TRAINER_HUB_API_BASE_URL = //p' <<<"$settings")"
  dsn="$(sed -nE 's/^ *TRAINER_HUB_SENTRY_DSN = //p' <<<"$settings")"
  plist="$(sed -nE 's/^ *INFOPLIST_FILE = //p' <<<"$settings")"
  [[ "$url" == https://?*/api ]] || { echo "Release API base URL is not https://<host>/api: $url"; return 1; }
  [[ "$dsn" =~ ^https://[^@/]+@[a-z0-9]+\.ingest\.de\.sentry\.io/[0-9]+$ ]] \
    || { echo "Release Sentry DSN is not https://<key>@<org>.ingest.de.sentry.io/<project> (EU region): $dsn"; return 1; }
  grep -qE '^ *TRAINER_HUB_SENTRY_ENVIRONMENT = production$' <<<"$settings" \
    || { echo "Release does not report to Sentry as environment production"; return 1; }
  if plutil -extract NSAppTransportSecurity raw -o - "$plist" >/dev/null 2>&1; then
    echo "$plist has NSAppTransportSecurity: plain HTTP is for Debug only"
    return 1
  fi
}

# Every remote Swift package the app resolves is on this list. The app has no analytics SDK (PostHog or other): product
# events are captured server-side (E009, OBSERVABILITY.md §1 "iOS"). Adding a package means adding it here, in review.
swift_packages() {
  local allowed resolved unexpected
  allowed='sentry-cocoa swift-collections swift-http-types swift-openapi-runtime swift-openapi-urlsession'
  resolved="$(jq -er '.pins[].identity' TrainerHub.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved)" \
    || { echo "could not read the Swift packages from Package.resolved"; return 1; }
  unexpected="$(grep -vxF -f <(tr ' ' '\n' <<<"$allowed") <<<"$resolved" || true)"
  [ -z "$unexpected" ] || { echo "Swift packages not on the allowlist in scripts/test-ios.sh: $unexpected"; return 1; }
}

step "SwiftLint"
"$SWIFTLINT" lint --strict --quiet
step "SwiftLint rejects literal text, colours and direct Sentry calls (lint/fixtures)"
lint_fixture lint/fixtures/LiteralText.swift no_literal_text
lint_fixture lint/fixtures/ColourLiteral.swift no_colour_literal
lint_fixture lint/fixtures/DirectSentry.swift no_direct_sentry
step "Debug and Release configurations"
debug_configuration
release_configuration
step "Swift packages (no analytics SDK)"
swift_packages

LOCALES="nl en"
BUILD_ARGS=(-project TrainerHub.xcodeproj -scheme TrainerHub -testPlan TrainerHub
  -clonedSourcePackagesDirPath .build/SourcePackages -derivedDataPath .build/DerivedData)

# Builds the app and its tests once, for the simulator $1; the build log goes to .build/build-for-testing.log and its
# timing summary to the output and the job summary.
build_for_testing() {
  local log=.build/build-for-testing.log timing
  if ! xcodebuild build-for-testing "${BUILD_ARGS[@]}" -destination "id=$1" -showBuildTimingSummary CODE_SIGNING_ALLOWED=NO >"$log" 2>&1; then
    tail -n 300 "$log"
    return 1
  fi
  timing="$(sed -n '/^Build Timing Summary/,$p' "$log" | head -n 40)"
  [ -z "$timing" ] || { echo "$timing"; summary "### iOS build timing" "" '```' "$timing" '```' ""; }
}

# Runs one locale's configuration of the test plan on simulator $2 without building, into its own result bundle.
test_locale() {
  local xctestrun
  xctestrun="$(find .build/DerivedData/Build/Products -maxdepth 1 -name '*.xctestrun' | head -n 1)"
  [ -n "$xctestrun" ] || { echo "no .xctestrun in .build/DerivedData/Build/Products"; return 1; }
  xcodebuild test-without-building -xctestrun "$xctestrun" -destination "id=$2" -only-test-configuration "$1" \
    -resultBundlePath ".build/TestResults-$1.xcresult" -quiet
}

# Runs nl on simulator $1 and en on simulator $2 at the same time, each with its output in a log, shown when it ends.
test_locales_in_parallel() {
  local status=0 nl_pid en_pid locale
  test_locale nl "$1" >.build/test-nl.log 2>&1 &
  nl_pid=$!
  test_locale en "$2" >.build/test-en.log 2>&1 &
  en_pid=$!
  wait "$nl_pid" || status=1
  wait "$en_pid" || status=1
  for locale in $LOCALES; do
    echo "::group::Tests in $locale"
    cat ".build/test-$locale.log"
    echo "::endgroup::"
  done
  return $status
}

test_locales_in_turn() {
  local status=0 locale
  for locale in $LOCALES; do
    test_locale "$locale" "$1" || status=1
  done
  return $status
}

# What the report needs to know when the run ends: the simulators to shut down and delete.
ios_cleanup() {
  report_steps || true
  stop_simulator || true
  delete_extra_simulator
}

udid="$(ios_simulator)"
[ -n "$udid" ] || die "no iPhone simulator${IOS_SIMULATOR:+ named $IOS_SIMULATOR} — run scripts/bootstrap.sh --mobile"
on_exit 'ios_cleanup'
parallel=false
[ "${IOS_PARALLEL:-${CI:+1}}" != 1 ] || parallel=true
if $parallel; then create_extra_simulator || die "could not create a second simulator"; fi
extra="$EXTRA_SIMULATOR"

# The simulators boot while the app builds.
mkdir -p .build
rm -rf .build/TestResults*.xcresult
start_boot "$udid"
[ -z "$extra" ] || start_boot "$extra"
step "Build for testing (simulator $udid)"
build_for_testing "$udid"
await_boots || die "a simulator did not boot"
tests=0
if $parallel; then
  step "Unit and UI tests in nl and en at the same time (simulators $udid and $extra)"
  test_locales_in_parallel "$udid" "$extra" || tests=1
else
  step "Unit and UI tests in nl and en (simulator $udid)"
  test_locales_in_turn "$udid" || tests=1
fi
for locale in $LOCALES; do
  rows="$(slowest_tests ".build/TestResults-$locale.xcresult" 10)"
  [ -z "$rows" ] || {
    echo "Slowest tests in $locale (seconds):"
    echo "$rows" | sed 's/^| /  /; s/ | / /; s/ |$//'
    summary "### Slowest iOS tests in $locale" "" "| Test | Seconds |" "|---|--:|" "$rows" ""
  }
done
[ "$tests" = 0 ] || exit 1
echo "✓ iOS"
