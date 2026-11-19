#!/usr/bin/env bash
# The iOS apps' checks, the same steps as the `iOS` CI job (E008). `pnpm test:ios` runs this.
#
# There are two apps (E017 #503): Fivvi Pro (`FivviPro.xcodeproj`, scheme and test plan `FivviPro`, bundle ID
# `app.fivvi.pro`) and the client app Fivvi (`Fivvi.xcodeproj`, scheme and test plan `Fivvi`, bundle ID `app.fivvi`). Every
# check below runs for each of them, and each has its own test run and result bundle (`TestResults-<locale>.xcresult` for
# Fivvi Pro, `TestResults-Fivvi-<locale>.xcresult` for Fivvi) from one build in one DerivedData. A failure in either app
# fails the script, and the other app's tests still run.
#
#   test-ios.sh   SwiftLint and its fixtures (literal text, colours, direct Sentry calls, also in apps/ios/Packages, the
#                 code both apps share), the Debug and Release
#                 configurations (Release's API address over HTTPS and not a placeholder, its Sentry DSN in the EU
#                 region, no export compliance question, the version both apps share, the final bundle ID, Info.plists
#                 in Xcode's form), the Swift package
#                 allowlist, that every UI test runs in at least one test-plan configuration, that Xcode's string
#                 catalog sync leaves the generated catalogs unchanged, then one build-for-testing and one run of the
#                 unit and UI tests in nl and en without building again (one result bundle, both locales), on the newest
#                 iPhone simulator, in a worktree its own copy (IOS_SIMULATOR="iPhone 17" picks one by name). Both
#                 locales run on one simulator here (two on one 3-core machine were slower; CI runs the two languages in two
#                 jobs, each on its own runner and simulator, see `test-ios.sh test` below);
#                 IOS_PARALLEL=1 runs one run per locale at the same time on two. Prints the durations of its steps, the
#                 build timing summary and the slowest tests per locale (also in the job summary on CI); when tests fail, the names and
#                 messages of the failed tests from the result bundle (#290). Shuts down the
#                 simulators it booted when it ends, unless KEEP_DEVICE=1
#
#   test-ios.sh [--unit-only]    the unit tests of both apps only (ADR-034): the build and every check above stay, the tests run
#                                nl and en one after the other on one simulator, each with -skip-testing:<app>UITests, so no UI
#                                test target runs. Builders run it while the UI tests run in the nightly run of CI; `pnpm
#                                test:ios` without it still runs everything. It wins over IOS_UI_LOCALES. The check that every UI
#                                test runs in a test-plan configuration still runs
#
#   test-ios.sh build            the same checks and the one build-for-testing, then packs the test bundle (the .xctestrun
#                                and the build products) into apps/ios/.build/ios-test-bundle.tar; runs no test. CI's
#                                `iOS build` job (#293)
#   test-ios.sh test <nl|en> [--bundle <file>] [--retry-failed] [--shard <part>/<of>] [--unit-only]
#                                unpacks that bundle (--bundle <file> names another) and runs the test plan's
#                                configuration for one language, unit and UI tests, without building, on its own
#                                simulator. CI's four `iOS tests` jobs run it in parallel, each language in two parts
#                                (`--shard`), from the artifact of the build job; CI never retries a failed test, so a
#                                flaky one stays visible and is quarantined (TESTING.md §8). The options come in either
#                                order.
#                                --shard <part>/<of> (CI passes it, #1447) runs only part <part> of <of> of that language's
#                                tests: the test classes are dealt out by their number of tests (UI tests weigh ten times a
#                                unit test) from xcodebuild's own enumeration, every class to exactly one part, so the parts
#                                together run every test once. The run says which classes it runs, and fails when it ran
#                                fewer tests than they have. Its result bundle is TestResults-<locale>-<part>of<of>.xcresult.
#                                Not with --retry-failed or --unit-only. Without it the run is the whole language (as Release
#                                runs it)
#                                --unit-only (ADR-034: part 1 of the `iOS tests` jobs passes it while .github/pipeline.json
#                                says `ci: fast`; the nightly run and `ci: full` run the parts without it) leaves out the UI
#                                test target: -skip-testing:<app>UITests, the unit tests only
#                                --retry-failed (only `release.sh tests ios` passes it, #1433) retries the failed UI tests
#                                once when the run fails: on the same simulator, with -only-testing: for each of them, the
#                                same configuration and allowances, into TestResults-<locale>-retry.xcresult, within
#                                IOS_RETRY_DEADLINE. The run passes when every one of them ran and passed in the retry, and a
#                                test that passed only then is reported as flaky (a ::warning:: and the job summary). No retry
#                                when a test that failed is not a UI test (unit tests are never retried), when more than 3 UI
#                                tests failed (a break, not a flake), when the run hit its deadline, or when the failed tests
#                                can't be read from the result bundle
#
#   IOS_SIM_SETTLE  seconds the simulator of `test` is up before its first test, default 150, counted from the start of its
#                   boot (the unpack of the bundle runs meanwhile). In the single job the simulator booted during the
#                   build and was minutes old at the first test; booted right before it, the one UI test that rotates the
#                   device failed in both jobs on CI (#293). 0 doesn't wait, nor does a simulator that was already booted
#   IOS_RETRY_DEADLINE  seconds the retry of `test --retry-failed` may run, default 600: up to 3 UI tests take about a
#                   minute each (the slowest take 80 s on a runner), with the start of the run and a margin. It has its
#                   own grace (IOS_TEST_DEADLINE_GRACE); release.yml's `ios-tests` timeout holds the first run and this
#   IOS_UI_LOCALES  the locales whose UI tests run, default "nl en" (what `pnpm test:ios` does). The unit tests always run
#                   in both. CI does not set it any more (#293): its two `iOS tests` jobs run every test in both languages on
#                   every push. With "nl", the nl run is everything in nl and a second run is the unit tests in en, one
#                   result bundle per locale (E002 #242)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$ROOT/scripts/_ios.sh"
source "$ROOT/scripts/_slots.sh"
SLOT_MODE="${1:-}"
MODE=all
ONLY_LOCALE=""
BUNDLE_FILE=""
RETRY_FAILED=false
SHARD_PART=""
SHARD_OF=""
UNIT_ONLY=false
case "${1:-}" in
  "") ;;
  --unit-only) UNIT_ONLY=true; [ $# -eq 1 ] || usage_of "$0" ;;
  build) MODE=build; [ $# -eq 1 ] || usage_of "$0" ;;
  test)
    MODE='test'
    ONLY_LOCALE="${2:-}"
    [ "$ONLY_LOCALE" = nl ] || [ "$ONLY_LOCALE" = en ] || usage_of "$0"
    shift 2
    while [ $# -gt 0 ]; do
      case "$1" in
        --bundle) [ $# -ge 2 ] || usage_of "$0"; BUNDLE_FILE="$2"; shift ;;
        --retry-failed) RETRY_FAILED=true ;;
        --shard)
          [ $# -ge 2 ] && [[ "$2" =~ ^([1-9][0-9]*)/([1-9][0-9]*)$ ]] || usage_of "$0"
          SHARD_PART="${BASH_REMATCH[1]}" SHARD_OF="${BASH_REMATCH[2]}"
          [ "$SHARD_PART" -le "$SHARD_OF" ] || usage_of "$0"
          shift ;;
        --unit-only) UNIT_ONLY=true ;;
        *) usage_of "$0" ;;
      esac
      shift
    done
    # A retry names the failed tests of a whole run; a part of one has no such run to be shown complete against.
    ! $RETRY_FAILED || [ -z "$SHARD_OF" ] || die "--shard and --retry-failed don't go together"
    # --unit-only has no UI tests to deal out: CI runs it in part 1 and leaves part 2 without a step.
    ! $UNIT_ONLY || [ -z "$SHARD_OF" ] || die "--shard and --unit-only don't go together"
    ;;
  *) usage_of "$0" ;;
esac

# A heavy job, and with a simulator a booted one: machine-wide slots (E001 #1388), taken in this process after the arguments are
# checked, so a wrong call fails at once instead of waiting for a slot.
slots_wrap "$([ "$SLOT_MODE" = build ] && echo heavy || echo heavy,ios-sim)" "$0" ${SLOT_MODE:+"$SLOT_MODE"}

need_cmd jq
LOCALES="nl en"
# The locales whose UI tests run (an empty value is the default: both).
UI_LOCALES="${IOS_UI_LOCALES:-$LOCALES}"
[ -n "$(tr -d ' ' <<<"$UI_LOCALES")" ] || die "IOS_UI_LOCALES is empty; use $LOCALES (or one of them)"
for locale in $UI_LOCALES; do
  [[ " $LOCALES " == *" $locale "* ]] || die "IOS_UI_LOCALES: '$locale' is not one of: $LOCALES"
done
# --unit-only (ADR-034): no locale runs its UI tests.
if $UNIT_ONLY; then UI_LOCALES=""; fi
in_ui_locales() { [[ " $UI_LOCALES " == *" $1 "* ]]; }
all_ui=true
for locale in $LOCALES; do in_ui_locales "$locale" || all_ui=false; done
use_xcode || die "Xcode not found — run scripts/bootstrap.sh --mobile"
[ "$MODE" = test ] || install_swiftlint || die "could not install SwiftLint — run scripts/bootstrap.sh --mobile"
cd "$IOS_DIR"

# The apps, each with its project, scheme, test plan and UI test target named after it. `use_app <app>` makes it the one
# the functions below act on. The final bundle ID of each is a literal here, as in Android's BuildInfoTest; that the README
# records the same ID is checked by scripts/test/app-ids.test.mjs, so a README edit is not a native change.
# Every Xcode project in apps/ios is an app: Fivvi Pro first, then the others by name (today Fivvi).
APPS="FivviPro"
for project in "$IOS_DIR"/*.xcodeproj; do
  name="$(basename "$project" .xcodeproj)"
  [ "$name" = FivviPro ] || APPS="$APPS $name"
done
APP=""
APP_WORD="" APP_NOTE="" APP_TESTS="" APP_UNIT="" APP_IOS="" APP_TIME="" APP_LOG_SUFFIX=""
FINAL_BUNDLE_ID=""
RESULT_STEM=""
use_app() { # <app>
  APP=$1
  # How the messages name the app: Fivvi Pro's read as they did when it was the only app, the others name themselves.
  if [ "$APP" = FivviPro ]; then
    APP_WORD="" APP_NOTE="" APP_TESTS="Tests" APP_UNIT="Unit" APP_IOS="iOS" APP_TIME="Test" APP_LOG_SUFFIX=""
  else
    APP_WORD=" $APP" APP_NOTE=" ($APP)" APP_TESTS="$APP tests" APP_UNIT="$APP unit" APP_IOS="$APP" APP_TIME="$APP test" APP_LOG_SUFFIX="-$APP"
  fi
  case "$APP" in
    FivviPro) FINAL_BUNDLE_ID=app.fivvi.pro; RESULT_STEM=TestResults ;;
    Fivvi) FINAL_BUNDLE_ID=app.fivvi; RESULT_STEM=TestResults-Fivvi ;;
    *) die "unknown iOS app '$APP'; use one of: $APPS" ;;
  esac
}
use_app FivviPro

# Every line of a fixture marked `// expect: <rule>` must fail SwiftLint with that rule, naming the file and line; no
# other line may fail with it. `lint_fixture` lints the fixture by path; `fixture_lines_match` compares a fixture with the
# output of a lint run that may cover more files.
fixture_lines_match() {
  local fixture=$1 rule=$2 out=$3 expected actual
  expected="$(grep -n "// expect: $rule\$" "$fixture" | cut -d: -f1)"
  actual="$(grep "($rule)" <<<"$out" | grep -oE "$(basename "$fixture"):[0-9]+" | cut -d: -f2 | sort -nu)"
  [ "$expected" = "$actual" ] && return
  echo "$fixture: expected $rule on lines $(echo "$expected" | xargs), got $(echo "$actual" | xargs):"
  echo "$out"
  return 1
}

lint_fixture() {
  local fixture=$1 rule=$2 out
  if out="$("$SWIFTLINT" lint --strict --quiet "$fixture" 2>&1)"; then
    echo "SwiftLint passed $fixture, which breaks $rule"
    return 1
  fi
  fixture_lines_match "$fixture" "$rule" "$out"
}

# E017 #500: the lint rules apply to the code both apps share (apps/ios/Packages), not only to the app target. Each fixture
# is copied into a package target folder as a throwaway probe, and the configuration's own lint (`included:` in
# .swiftlint.yml, no path given: SwiftLint ignores `included:` for a path it is given) must flag it: the literal-text,
# colour, Sentry and glass-imitation rules in FivviUI, and in FivviObservability, the one target that may import Sentry,
# the Sentry rule must not fire (a literal text line there proves the config does lint that folder). The probes are removed on exit.
PACKAGE_PROBES=""
lint_packages() {
  local sources=Packages/FivviShared/Sources ui observability out rc=0
  ui="$sources/FivviUI"
  observability="$sources/FivviObservability"
  [ -d "$ui" ] && [ -d "$observability" ] || { echo "$ui and $observability must exist"; return 1; }
  PACKAGE_PROBES="$ui/ZzProbe*.swift $observability/ZzProbe*.swift"
  # shellcheck disable=SC2016 # expanded when the trap runs
  on_exit 'rm -f $PACKAGE_PROBES'
  cp lint/fixtures/LiteralText.swift "$ui/ZzProbeLiteralText.swift"
  cp lint/fixtures/ColourLiteral.swift "$ui/ZzProbeColourLiteral.swift"
  cp lint/fixtures/DirectSentry.swift "$ui/ZzProbeDirectSentry.swift"
  cp lint/fixtures/GlassImitation.swift "$ui/ZzProbeGlassImitation.swift"
  { sed 's# // expect: .*$##' lint/fixtures/DirectSentry.swift; echo 'let probe = Text("x") // expect: no_literal_text'; } \
    >"$observability/ZzProbeSentry.swift"
  out="$("$SWIFTLINT" lint --strict --quiet 2>&1 || true)"
  fixture_lines_match "$ui/ZzProbeLiteralText.swift" no_literal_text "$out" || rc=1
  fixture_lines_match "$ui/ZzProbeColourLiteral.swift" no_colour_literal "$out" || rc=1
  fixture_lines_match "$ui/ZzProbeDirectSentry.swift" no_direct_sentry "$out" || rc=1
  fixture_lines_match "$ui/ZzProbeGlassImitation.swift" no_glass_imitation "$out" || rc=1
  fixture_lines_match "$observability/ZzProbeSentry.swift" no_literal_text "$out" || rc=1
  if grep -F ZzProbeSentry.swift <<<"$out" | grep -q "(no_direct_sentry)"; then
    echo "SwiftLint flags the Sentry import in FivviObservability, the one target that may have it:"
    echo "$out"
    rc=1
  fi
  # shellcheck disable=SC2086 # the probe paths, split on purpose
  rm -f $PACKAGE_PROBES
  ON_EXIT=""
  return "$rc"
}

# Debug's committed defaults are the local dev server and no Sentry DSN, so Debug builds, tests and CI send nothing to
# Sentry (a developer's Config/Local.xcconfig may override both; CI has none).
debug_configuration() {
  local url dsn
  url="$(sed -nE 's/^FIVVI_API_BASE_URL = //p' Config/Debug.xcconfig)"
  # shellcheck disable=SC2016 # the xcconfig's literal `$()`, which keeps `//` from starting a comment
  [ "$url" = 'http:/$()/localhost:3000/api' ] \
    || { echo "Config/Debug.xcconfig: base URL is not the local dev server: $url"; return 1; }
  # Every setting of the DSN, also indented or conditional (`FIVVI_SENTRY_DSN[sdk=…] = …`), must be empty.
  dsn="$(sed -nE 's/^[[:space:]]*FIVVI_SENTRY_DSN[^=]*=[[:space:]]*//p' Config/Debug.xcconfig | tr -d '[:space:]')"
  [ -z "$dsn" ] \
    || { echo "Config/Debug.xcconfig: FIVVI_SENTRY_DSN must stay empty; set it in Local.xcconfig"; return 1; }
}

# E017 AC5: the production API over HTTPS, on a real host: a dotted name, not the reserved `.invalid` placeholder, with
# the `/api` mount.
production_base_url() {
  local url=$1 host
  [[ "$url" =~ ^https://([A-Za-z0-9-]+\.)+[A-Za-z0-9-]+/api/?$ ]] || return 1
  host="${url#https://}"
  [[ "${host%%/*}" != *.invalid ]]
}

# production_base_url must refuse an empty, a plain-HTTP, a `.invalid` and a host-less address, and take the real one.
production_base_url_fixtures() {
  local url rc=0
  for url in "" "http://production.fivvi.app/api" "https://production.fivvi.invalid/api" "https:///api" "https://localhost/api"; do
    ! production_base_url "$url" || { echo "E017 AC5: production_base_url accepted '$url'"; rc=1; }
  done
  production_base_url "https://production.fivvi.app/api" || { echo "E017 AC5: production_base_url refused a real address"; rc=1; }
  return "$rc"
}

# The settings an Xcode configuration of the app resolves to, with any build settings given after it (as `xcodebuild`
# takes them on its command line). It resolves the Swift packages, so it uses the cached .build/SourcePackages like the
# build does (without it, it cloned them all again: 71 s of CI's first run, #105). Reading the xcconfig instead would not
# show what the project's configuration really resolves to.
build_settings() {
  local configuration=$1
  shift
  xcodebuild -project "$APP.xcodeproj" -target "$APP" -configuration "$configuration" -showBuildSettings \
    -clonedSourcePackagesDirPath .build/SourcePackages "$@"
}

# A setting's value in the target's block of the output. Xcode first echoes the settings given on the command line
# ("Build settings from command line:"), which says nothing about what the target resolves to, so only the block "Build
# settings for action build and target <the app>:" counts.
setting_of() {
  awk -v key="$1" -v target="$APP" '
    $0 == "Build settings for action build and target " target ":" { in_target = 1; next }
    /^Build settings / { in_target = 0 }
    in_target && $1 == key && $2 == "=" { sub(/^[[:space:]]*[^[:space:]]+ = /, ""); print; exit }
  ' <<<"$2"
}

# The one place that reads apps/Version.xcconfig here: a setting of the file both apps take their version from.
shared_setting() {
  sed -nE "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*([^[:space:]]+)[[:space:]]*\$/\1/p" "$ROOT/apps/Version.xcconfig"
}

# E017 AC4 and AC8: a configuration resolves the version of apps/Version.xcconfig (the one Android reads), the default
# build number 1 and the final bundle ID of the app (`use_app`), a literal there as in Android's BuildInfoTest.
version_and_identifier() {
  local settings=$1 shared default version number id rc=0
  shared="$(shared_setting MARKETING_VERSION)"
  default="$(shared_setting CURRENT_PROJECT_VERSION)"
  version="$(setting_of MARKETING_VERSION "$settings")"
  number="$(setting_of CURRENT_PROJECT_VERSION "$settings")"
  id="$(setting_of PRODUCT_BUNDLE_IDENTIFIER "$settings")"
  [[ "$shared" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "apps/Version.xcconfig: MARKETING_VERSION is not <major>.<minor>.<patch>: '$shared'"; rc=1; }
  [ "$version" = "$shared" ] \
    || { echo "E017 AC4: the app's version is '$version', not '$shared' of apps/Version.xcconfig, which Android reads"; rc=1; }
  [ "$default" = 1 ] && [ "$number" = "$default" ] \
    || { echo "E017 AC4: the default build number is '$number' ('$default' in apps/Version.xcconfig), not 1"; rc=1; }
  [ "$id" = "$FINAL_BUNDLE_ID" ] \
    || { echo "E017 AC8: bundle ID '$id' is not the final ID '$FINAL_BUNDLE_ID'"; rc=1; }
  return "$rc"
}

# E017 AC4: a release run passes its build number from outside (`xcodebuild CURRENT_PROJECT_VERSION=<n>`); a number other
# than the default must come through to the Release configuration (it is CFBundleVersion).
build_number_from_outside() {
  local number
  number="$(setting_of CURRENT_PROJECT_VERSION "$(build_settings Release CURRENT_PROJECT_VERSION=42)")"
  [ "$number" = 42 ] \
    || { echo "E017 AC4: CURRENT_PROJECT_VERSION=42 on the command line resolves to '$number', not 42"; return 1; }
}

# Release talks HTTPS to the production API only: no App Transport Security exception in its Info.plist, and the app
# declares that it uses no non-exempt encryption, so App Store Connect asks no export compliance question per build
# (E017 AC1). It reports to the Sentry `ios` project in the EU region: its DSN's host is `<org>.ingest.de.sentry.io`.
release_configuration() {
  local settings url dsn plist
  settings="$(build_settings Release)"
  url="$(setting_of FIVVI_API_BASE_URL "$settings")"
  dsn="$(setting_of FIVVI_SENTRY_DSN "$settings")"
  plist="$(setting_of INFOPLIST_FILE "$settings")"
  production_base_url "$url" || { echo "E017 AC5: Release base URL is not https://<real host>/api: '$url'"; return 1; }
  [[ "$dsn" =~ ^https://[^@/]+@[a-z0-9]+\.ingest\.de\.sentry\.io/[0-9]+$ ]] \
    || { echo "Release Sentry DSN is not https://<key>@<org>.ingest.de.sentry.io/<project> (EU region): $dsn"; return 1; }
  grep -qE '^ *FIVVI_SENTRY_ENVIRONMENT = production$' <<<"$settings" \
    || { echo "Release does not report to Sentry as environment production"; return 1; }
  if plutil -extract NSAppTransportSecurity raw -o - "$plist" >/dev/null 2>&1; then
    echo "$plist has NSAppTransportSecurity: plain HTTP is for Debug only"
    return 1
  fi
  [ "$(plutil -extract ITSAppUsesNonExemptEncryption raw -o - "$plist" 2>/dev/null)" = false ] \
    || { echo "E017 AC1: $plist must set ITSAppUsesNonExemptEncryption to NO (HTTPS only, no own encryption)"; return 1; }
  version_and_identifier "$settings"
}

# Every remote Swift package the app resolves is on this list. The app has no analytics SDK (PostHog or other): product
# events are captured server-side (E009, OBSERVABILITY.md §1 "iOS"). Adding a package means adding it here, in review.
swift_packages() {
  local allowed resolved unexpected
  allowed='sentry-cocoa swift-collections swift-http-types swift-openapi-runtime swift-openapi-urlsession'
  resolved="$(jq -er '.pins[].identity' "$APP.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved")" \
    || { echo "could not read the Swift packages from Package.resolved"; return 1; }
  unexpected="$(grep -vxF -f <(tr ' ' '\n' <<<"$allowed") <<<"$resolved" || true)"
  [ -z "$unexpected" ] || { echo "Swift packages not on the allowlist in scripts/test-ios.sh: $unexpected"; return 1; }
}

# Which UI tests each configuration of the test plan skips (FIVVI_SKIP_TESTS, see TestPlanSkips.swift), as
# `<configuration> <Class/test_name>` lines.
plan_skips() {
  jq -r '.configurations[] | .name as $config
    | (.options.environmentVariableEntries // [])[] | select(.key == "FIVVI_SKIP_TESTS") | .value
    | split(",")[] | gsub("^\\s+|\\s+$"; "") | select(. != "") | "\($config) \(.)"' "$APP.xctestplan" | sort -u
}

# `Class/test_name` of every test of the UI test target.
ui_tests() {
  find "${APP}UITests" -name '*.swift' -exec awk '
    FNR == 1 { class = "" }
    /^[[:space:]]*((private|fileprivate|internal|public|open|final)[[:space:]]+)*class[[:space:]]+[A-Za-z0-9_]+/ \
      && !/class[[:space:]]+(func|var|let)[[:space:]]/ {
      name = $0; sub(/^.*class[[:space:]]+/, "", name); sub(/[^A-Za-z0-9_].*$/, "", name); class = name }
    /^[[:space:]]*func[[:space:]]+test[A-Za-z0-9_]*\(/ {
      name = $0; sub(/^.*func[[:space:]]+/, "", name); sub(/\(.*$/, "", name); print class "/" name }' {} + | sort -u
}

# The text-dependent UI tests run in every configuration (nl and en); the others the test plan skips in some of them
# (apps/ios/README.md, "Which tests run in which locale"). A UI test the plan skips in every configuration would run
# nowhere, and a name that is no UI test (renamed, deleted) is a skip that does nothing. Only HomeUITests acts on the
# list. The plan's own `skippedTests` and `selectedTests`, which Xcode writes when a test is unticked, apply to every
# configuration, so they are refused: a test would run in no configuration without this check seeing it.
test_plan_coverage() {
  local tests skips configs rc=0 test skip filtered
  filtered="$(jq -r '.testTargets[] | .target.name as $target | ["skippedTests", "selectedTests"][] as $key
    | select((.[$key] // []) | length > 0) | "\($target) \($key)"' "$APP.xctestplan")"
  while read -r skip; do
    [ -n "$skip" ] || continue
    echo "$APP.xctestplan: ${skip% *} has ${skip#* }, which applies to every configuration; skip tests per configuration in FIVVI_SKIP_TESTS"
    rc=1
  done <<<"$filtered"
  tests="$(ui_tests)"
  skips="$(plan_skips)"
  configs="$(jq '.configurations | length' "$APP.xctestplan")"
  [ -n "$tests" ] || { echo "found no UI tests in ${APP}UITests"; return 1; }
  while read -r skip; do
    [ -n "$skip" ] || continue
    grep -qxF "$skip" <<<"$tests" || { echo "$APP.xctestplan skips $skip, which is not a UI test"; rc=1; continue; }
    [[ "$skip" == HomeUITests/* ]] \
      || { echo "$APP.xctestplan skips $skip, but only HomeUITests acts on FIVVI_SKIP_TESTS"; rc=1; }
  done <<<"$(cut -d' ' -f2 <<<"$skips" | sort -u)"
  for test in $tests; do
    [ "$(grep -cE " $test\$" <<<"$skips")" -lt "$configs" ] \
      || { echo "$test is skipped in every configuration of $APP.xctestplan: it runs in no configuration"; rc=1; }
  done
  return "$rc"
}

# Xcode rewrites a property list in its own form, keys sorted (plutil's), when it touches one; commit them that way
# (#95).
plists_in_xcode_form() {
  local plist rc=0
  for plist in Config/*.plist; do
    plutil -convert xml1 -o - "$plist" | cmp -s - "$plist" \
      || { echo "$plist is not in Xcode's form; run: plutil -convert xml1 apps/ios/$plist"; rc=1; }
  done
  return "$rc"
}

# Xcode's string catalog sync, which every Xcode build and -exportLocalizations run, adds the strings a catalog lacks
# (Info.plist keys such as CFBundleName) and rewrites it. The generated catalogs must already have them, or a build
# changes tracked files (#95). A catalog the sync changed is restored, also when the run is interrupted.
CATALOGS=("$ROOT"/packages/i18n/generated/ios/*.xcstrings "$ROOT"/packages/i18n/generated/ios/client/*.xcstrings)
CATALOGS_BEFORE=.build/catalogs-before
# The name a catalog is saved under: its path below packages/i18n/generated/ios, with the slash made a dash (the client
# app's InfoPlist.xcstrings is in `client/`).
catalog_key() { local path=${1#"$ROOT/packages/i18n/generated/ios/"}; echo "${path//\//-}"; }

# Puts the catalogs back as they were and shows what the sync changed; fails if it changed any.
restore_catalogs() {
  local catalog saved rc=0
  for catalog in "${CATALOGS[@]}"; do
    saved="$CATALOGS_BEFORE/$(catalog_key "$catalog")"
    cmp -s "$saved" "$catalog" && continue
    echo "Xcode's catalog sync changes ${catalog#"$ROOT"/}: generate what it adds (packages/i18n/src/tools/xcstrings.ts)"
    diff -u "$saved" "$catalog" || true
    cp "$saved" "$catalog"
    rc=1
  done
  return "$rc"
}

catalog_sync() {
  local rc=0 catalog app
  rm -rf "$CATALOGS_BEFORE"
  mkdir -p "$CATALOGS_BEFORE"
  for catalog in "${CATALOGS[@]}"; do cp "$catalog" "$CATALOGS_BEFORE/$(catalog_key "$catalog")"; done
  on_exit 'restore_catalogs || true'
  for app in $APPS; do
    use_app "$app"
    xcodebuild -exportLocalizations -project "$APP.xcodeproj" -scheme "$APP" \
      -localizationPath ".build/Localizations-$APP" -exportLanguage nl -exportLanguage en \
      -clonedSourcePackagesDirPath .build/SourcePackages -derivedDataPath .build/DerivedData -quiet \
      || { echo "xcodebuild -exportLocalizations failed for $APP"; rc=1; }
  done
  ON_EXIT=""
  restore_catalogs || rc=1
  return "$rc"
}

if [ "$MODE" != test ]; then
  step "SwiftLint"
  "$SWIFTLINT" lint --strict --quiet
  step "SwiftLint rejects literal text, colours, imitated glass and direct Sentry calls (lint/fixtures)"
  lint_fixture lint/fixtures/LiteralText.swift no_literal_text
  lint_fixture lint/fixtures/ColourLiteral.swift no_colour_literal
  lint_fixture lint/fixtures/GlassImitation.swift no_glass_imitation
  lint_fixture lint/fixtures/DirectSentry.swift no_direct_sentry
  step "SwiftLint's rules cover the shared packages (apps/ios/Packages)"
  lint_packages
  step "Every UI test runs in at least one test-plan configuration"
  for app in $APPS; do use_app "$app"; test_plan_coverage; done
  step "Debug and Release configurations"
  debug_configuration
  production_base_url_fixtures
  for app in $APPS; do
    use_app "$app"
    release_configuration
    version_and_identifier "$(build_settings Debug)"
    build_number_from_outside
  done
  plists_in_xcode_form
  step "Swift packages (no analytics SDK)"
  for app in $APPS; do use_app "$app"; swift_packages; done
  step "Xcode's string catalog sync leaves the generated catalogs unchanged"
  catalog_sync
fi

# Both apps are built into one DerivedData, so the Swift packages they share are built once.
BUILD_ARGS=()
build_args() {
  BUILD_ARGS=(-project "$APP.xcodeproj" -scheme "$APP" -testPlan "$APP"
    -clonedSourcePackagesDirPath .build/SourcePackages -derivedDataPath .build/DerivedData)
}

# Builds the apps and their tests, one app after the other, for the simulator $1; the build log of each goes to
# .build/build-for-testing.log (Fivvi Pro) or .build/build-for-testing-<app>.log (the others), its timing summary to the
# output and the job summary. Build/Products is restored
# from CI's cache, so an .xctestrun left by an earlier build (a renamed scheme or test plan) is deleted first: afterwards
# exactly one .xctestrun of each app remains, named after its scheme and test plan (`<app>_<app>_<sdk>.xctestrun`).
PRODUCTS=.build/DerivedData/Build/Products
XCTESTRUN=""
build_for_testing() {
  local app
  rm -f "$PRODUCTS"/*.xctestrun
  for app in $APPS; do
    use_app "$app"
    build_app_for_testing "$1" || return 1
  done
}

# Finds the one .xctestrun of the app (`use_app`) in the products and makes it XCTESTRUN.
find_xctestrun() {
  local all found strays
  all="$(find "$PRODUCTS" -maxdepth 1 -name '*.xctestrun')"
  found="$(grep -E "/${APP}[_.][^/]*$" <<<"$all" || true)"
  # One file per app, and no other: a file of a renamed scheme or test plan is a mistake, not something to pick from.
  strays="$(grep -vE "/($(tr ' ' '|' <<<"$APPS"))[_.][^/]*$" <<<"$all" || true)"
  { [ -n "$found" ] && [ "$(wc -l <<<"$found")" -eq 1 ] && [ -z "$strays" ]; } \
    || { echo "expected exactly one .xctestrun for $APP (and none for any other app) in $PRODUCTS, found: $(tr '\n' ' ' <<<"${all:-none}")"; return 1; }
  XCTESTRUN="$found"
}

build_app_for_testing() {
  local log=".build/build-for-testing${APP_LOG_SUFFIX}.log" timing
  build_args
  if ! xcodebuild build-for-testing "${BUILD_ARGS[@]}" -destination "id=$1" -showBuildTimingSummary >"$log" 2>&1; then
    tail -n 300 "$log"
    return 1
  fi
  find_xctestrun || return 1
  timing="$(sed -n '/^Build Timing Summary/,$p' "$log" | head -n 40)"
  [ -z "$timing" ] || { echo "$timing"; summary "### iOS build timing$APP_NOTE" "" '```' "$timing" '```' ""; }
}

# Runs the test plan on simulator $1 without building, both configurations (nl and en) in one run: the simulator is
# prepared and the app installed once, and the one result bundle has each locale's results. With a locale in $2, runs
# only that locale's configuration, into a bundle of its own, and without the UI tests when the locale isn't one of
# IOS_UI_LOCALES.
# The result bundle of the app (`use_app`) for a locale, or for both ("nl-en") without one.
result_bundle() { echo ".build/$RESULT_STEM-${1:-nl-en}.xcresult"; }
# A test that hangs fails after this many seconds instead of stalling the job until its timeout (#305). The slowest
# tests take 39 s locally (about twice that on a runner), so 2 minutes leaves clear headroom; XCTest rounds the
# allowances up to whole minutes and never lets a test run past the maximum.
TEST_ALLOWANCE=120
TEST_ALLOWANCE_MAX=180
# The allowance only covers a stall inside a test method. A stall before the first test (the runner installs or
# bootstraps) or between tests is not one, so a run that is still going after this many seconds is interrupted (#305).
# SIGINT is meant to let xcodebuild wind down and write its result bundle; that is not verified (a local try with
# Xcode 27.1 left no bundle and xcodebuild still running after 90 s), so after the grace it is killed and the run
# fails either way, with or without a bundle. The deadline counts from the launch of xcodebuild, after the simulator
# boot and settle. A healthy run takes 11-17 minutes of xcodebuild (#393: up to 1032 s; the CI step, with the settle,
# up to 1252 s); the CI job's own timeout (44 minutes = 2640 s) stays above the deadline (2100 s) plus the grace (60 s)
# and the 310 s the job spends outside the deadline (boot and settle, other steps, the reports and the upload), with
# 170 s to spare. IOS_TEST_DEADLINE and IOS_TEST_DEADLINE_GRACE override them (the tests of
# this script use short ones).
TEST_DEADLINE=${IOS_TEST_DEADLINE:-2100}
TEST_DEADLINE_GRACE=${IOS_TEST_DEADLINE_GRACE:-60}

# Runs test-without-building on simulator $1 into the result bundle $2 with the extra xcodebuild arguments that follow, and
# interrupts it after $3 seconds (then the grace); $4 names what ran, for the message. RUN_TIMED_OUT says whether it was.
RUN_TIMED_OUT=false
run_xcodebuild() { # <simulator> <bundle> <deadline seconds> <what> [xcodebuild argument...]
  local udid=$1 bundle=$2 limit=$3 what=$4 pid status=0 timed_out=false deadline
  shift 4
  deadline=$((SECONDS + limit))
  RUN_TIMED_OUT=false
  # A background job of a script starts with SIGINT ignored, so perl puts the default back before it execs xcodebuild.
  perl -e '$SIG{INT} = "DEFAULT"; exec @ARGV or die "exec $ARGV[0]: $!"' -- \
    xcodebuild test-without-building -xctestrun "$XCTESTRUN" -destination "id=$udid" "$@" \
    -resultBundlePath "$bundle" -quiet \
    -test-timeouts-enabled YES -default-test-execution-time-allowance "$TEST_ALLOWANCE" \
    -maximum-test-execution-time-allowance "$TEST_ALLOWANCE_MAX" &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "::error::The $what ran past the deadline of $limit s and were interrupted (#305)"
      kill -INT "$pid" 2>/dev/null || true
      deadline=$((SECONDS + TEST_DEADLINE_GRACE))
      while kill -0 "$pid" 2>/dev/null && [ "$SECONDS" -lt "$deadline" ]; do sleep 1; done
      ! kill -0 "$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
      timed_out=true
      break
    fi
    sleep 1
  done
  wait "$pid" || status=$?
  RUN_TIMED_OUT=$timed_out
  # Whatever the exit status of the interrupted xcodebuild, a run that hit the deadline fails.
  ! $timed_out || return 1
  return "$status"
}

# The arguments that select the tests of one locale's run: its test-plan configuration, and without the UI tests when the
# locale isn't one of IOS_UI_LOCALES. Set in CONFIG_ARGS, for the run and for the count of the tests it runs.
CONFIG_ARGS=()
config_args() { # <locale>
  CONFIG_ARGS=(-only-test-configuration "$1")
  in_ui_locales "$1" || CONFIG_ARGS+=("-skip-testing:${APP}UITests")
}

# The part of the language's tests that `test --shard` runs (#1447): its -only-testing: arguments, how many tests they
# select, and the name its result bundle and messages carry. Empty for a run of the whole language.
SHARD_ARGS=()
SHARD_TESTS=""
RESULT_NAME=""
RESULT_LABEL=""
run_tests() {
  local only=() bundle
  bundle="$(result_bundle)"
  if [ -n "${2:-}" ]; then
    config_args "$2"
    only=("${CONFIG_ARGS[@]}")
    [ "${#SHARD_ARGS[@]}" -eq 0 ] || only+=("${SHARD_ARGS[@]}")
    bundle="$(result_bundle "${RESULT_NAME:-$2}")"
  fi
  run_xcodebuild "$1" "$bundle" "$TEST_DEADLINE" "${APP_WORD# }${APP_WORD:+ }${RESULT_LABEL:-${2:-nl and en}} tests" ${only[@]+"${only[@]}"}
}

# E017 #1433: the retry of `test <locale> --retry-failed`. Only the failed UI tests (the target <app>UITests), once, and
# only when at most RETRY_MAX_TESTS of them failed: more is a break, not a flake. Its own deadline, and the grace.
RETRY_DEADLINE=${IOS_RETRY_DEADLINE:-600}
RETRY_MAX_TESTS=3
# Before a retry the first run is shown to be complete, by counting the tests its configuration has: xcodebuild
# enumerates them in about 20 s (it starts the test host without running a test), and this deadline, and the grace, stop
# an enumeration that hangs.
ENUMERATE_DEADLINE=${IOS_ENUMERATE_DEADLINE:-120}

# The number of tests that the run of locale $2 on simulator $1 has (what its -only-test-configuration and -skip-testing
# select), counted by xcodebuild's own enumeration, which reads the .xctestrun like the run does. Nothing when it can't.
enumerated_test_count() { # <simulator> <locale>
  local out=".build/TestEnumeration-$APP-$2.json" bundle=".build/TestEnumeration-$APP-$2.xcresult" count=""
  config_args "$2"
  rm -rf "$out" "$bundle"
  # The enumeration writes a result bundle of its own, which is never read: it is not the run's.
  if run_xcodebuild "$1" "$bundle" "$ENUMERATE_DEADLINE" "$2 test enumeration" "${CONFIG_ARGS[@]}" \
    -enumerate-tests -test-enumeration-style flat -test-enumeration-format json -test-enumeration-output-path "$out" >&2; then
    count="$(jq -r '[.values[]?.enabledTests[]? | select(.identifier | strings | split("/") | length >= 3)] | length' "$out" 2>/dev/null || true)"
  fi
  rm -rf "$out" "$bundle"
  [[ "$count" =~ ^[0-9]+$ ]] && [ "$count" -gt 0 ] && echo "$count"
  return 0
}

# #1447: `test <locale> --shard <part>/<of>`. Enumerates the tests of the locale's configuration on simulator $1 (as the
# count above does; once more when the first try gives nothing, because a run that can't say which tests are its own
# must not guess), asks shard_plan which classes are this part's, and sets SHARD_ARGS and SHARD_TESTS. Fails, saying
# why, when the part has no test: it is then never run as the whole language.
select_shard() { # <simulator> <locale>
  local out=".build/TestEnumeration-$2.json" bundle=".build/TestEnumeration-$2.xcresult" plan="" attempt classes class
  config_args "$2"
  for attempt in 1 2; do
    rm -rf "$out" "$bundle"
    if run_xcodebuild "$1" "$bundle" "$ENUMERATE_DEADLINE" "$2 test enumeration" "${CONFIG_ARGS[@]}" \
      -enumerate-tests -test-enumeration-style flat -test-enumeration-format json -test-enumeration-output-path "$out" >&2; then
      plan="$(shard_plan "$out" "$SHARD_PART" "$SHARD_OF")"
    fi
    [ -z "$plan" ] || break
    echo "::warning::The tests of the $2 configuration could not be enumerated (try $attempt of 2)"
  done
  rm -rf "$out" "$bundle"
  [ -n "$plan" ] || { echo "::error::The tests of the $2 configuration cannot be enumerated, so part $SHARD_PART of $SHARD_OF can't be chosen"; return 1; }
  SHARD_TESTS="$(jq -r '.tests' <<<"$plan")"
  classes="$(jq -r '.classes | join(" ")' <<<"$plan")"
  [ "$SHARD_TESTS" -gt 0 ] && [ -n "$classes" ] || { echo "::error::Part $SHARD_PART of $SHARD_OF of the $2 tests has no test"; return 1; }
  SHARD_ARGS=()
  for class in $classes; do SHARD_ARGS+=("-only-testing:$class"); done
  echo "Part $SHARD_PART of $SHARD_OF of the $2 tests: $SHARD_TESTS tests in $(wc -w <<<"$classes" | tr -d ' ') classes: $classes"
  summary "### iOS tests in $2, part $SHARD_PART of $SHARD_OF$APP_NOTE" "" "$SHARD_TESTS tests in these classes: $classes" ""
}

# Whether the run of a part into the result bundle $1 ran every test of its classes (#1447): the summary's total is the
# number of tests select_shard counted. A bundle that can't be counted is not shown to be complete. Prints why not, returns 1.
shard_complete() { # <bundle>
  local counts failed total
  counts="$(run_counts "$1")"
  [ -n "$counts" ] || { echo "the counts of the tests cannot be read from $1, so the part is not shown to be complete"; return 1; }
  IFS=$'\t' read -r failed total <<<"$counts"
  [ "$total" = "$SHARD_TESTS" ] || { echo "the part ran $total tests of the $SHARD_TESTS of its classes: it did not run them all"; return 1; }
}

# Whether the first run of locale $2 on simulator $1, with $3 failed tests listed, ran everything: its summary's failed
# count is the $3 the reader found, and its total is the number of tests the configuration has. A run that aborts for a
# reason that is no test (a lost connection to the test runner, a bundle that never started its tests) lists one failure
# and never ran the rest, and that must not pass on the retry of the one failure. Prints why not, and returns 1.
first_run_complete() { # <simulator> <locale> <listed failed tests>
  local counts failed total expected
  counts="$(run_counts "$(result_bundle "$2")")"
  if [ -z "$counts" ]; then
    echo "the counts of the tests cannot be read from $(result_bundle "$2")"
    return 1
  fi
  IFS=$'\t' read -r failed total <<<"$counts"
  if [ "$failed" != "$3" ]; then
    echo "the summary counts $failed failed tests and the reader found $3, so a failure is not accounted for"
    return 1
  fi
  expected="$(enumerated_test_count "$1" "$2")"
  if [ -z "$expected" ]; then
    echo "the tests of the $2 configuration cannot be enumerated, so the run is not shown to be complete"
    return 1
  fi
  if [ "$total" != "$expected" ]; then
    echo "the $2 run has $total tests of the $expected its configuration has: it did not run them all"
    return 1
  fi
}

# Retries the failed UI tests of the run of locale $2 on simulator $1, once. Returns 0 when every one of them ran and passed
# in the retry (each is reported as flaky), 1 otherwise: with no retry, when the failed tests are not all UI tests or are
# too many, when the run hit its deadline or the failed tests can't be read; and when the retry fails or leaves one out.
retry_failed_ui_tests() { # <simulator> <locale>
  local udid=$1 locale=$2 first retry
  first="$(result_bundle "$2")"
  retry=".build/$RESULT_STEM-$2-retry.xcresult"
  local rows reason kind id message ids="" others="" count=0 only=() outcomes result problems="" status=0 flaky=""
  if $RUN_TIMED_OUT; then
    echo "Not retrying: the $locale run hit its deadline, which is a stall and not a flaky test (#305)"
    return 1
  fi
  rows="$(failed_test_rows "$first" "${APP}UITests")"
  if [ -z "$rows" ]; then
    echo "Not retrying: the failed tests cannot be read from $first"
    return 1
  fi
  while IFS=$'\t' read -r kind id message; do
    if [ "$kind" = ui ]; then
      ids="$ids $id"
      count=$((count + 1))
    else
      others="$others $id"
    fi
  done <<<"$rows"
  if [ -n "$others" ]; then
    echo "Not retrying: not a UI test, and only UI tests are retried (TESTING.md §8):$others"
    return 1
  fi
  if [ "$count" -gt "$RETRY_MAX_TESTS" ]; then
    echo "Not retrying: $count UI tests failed, more than the $RETRY_MAX_TESTS a retry covers; that is a break, not a flaky test"
    return 1
  fi
  if ! reason="$(first_run_complete "$udid" "$locale" "$count")"; then
    echo "Not retrying: $reason"
    return 1
  fi
  for id in $ids; do only+=("-only-testing:${APP}UITests/$id"); done
  step "Retry the failed$APP_WORD UI tests in $locale (simulator $udid)"
  echo "Retrying $count failed UI test(s) once in $locale:$ids"
  rm -rf "$retry"
  run_xcodebuild "$udid" "$retry" "$RETRY_DEADLINE" "$locale retried tests" -only-test-configuration "$locale" "${only[@]}" \
    || status=$?
  outcomes="$(ui_test_outcomes "$retry" "${APP}UITests")"
  for id in $ids; do
    result="$(awk -F'\t' -v id="$id" '$1 == id { print $2; exit }' <<<"$outcomes")"
    case "$result" in
      Passed) ;;
      "") problems="$problems"$'\n'"  $id: did not run in the retry" ;;
      *) problems="$problems"$'\n'"  $id: did not pass in the retry ($result)" ;;
    esac
  done
  if [ -n "$problems" ] || [ "$status" != 0 ]; then
    [ "$status" = 0 ] || echo "::error::xcodebuild failed in the retry of the $locale tests (exit $status)"
    [ -z "$problems" ] || echo "::error::The retry of the failed UI tests in $locale did not pass:$problems"
    report_failed "$retry" "$locale (retry)"
    return 1
  fi
  while IFS=$'\t' read -r kind id message; do
    echo "::warning::flaky: $id ($locale) failed in the first run and passed on its retry (#1433): ${message:0:500}"
    flaky="${flaky:+$flaky$'\n'}- \`$id\`: ${message:0:500}"
  done <<<"$rows"
  summary "### iOS tests that passed only on a retry in $locale$APP_NOTE" "" \
    "Each failed in the first run and passed on its retry: file a bug for each and quarantine it (TESTING.md §8)." \
    "$flaky" ""
}

# Runs nl on simulator $1 and en on simulator $2 at the same time, each with its output in a log, shown when it ends.
test_locales_in_parallel() {
  local status=0 nl_pid en_pid locale
  run_tests "$1" nl >".build/test-$APP-nl.log" 2>&1 &
  nl_pid=$!
  run_tests "$2" en >".build/test-$APP-en.log" 2>&1 &
  en_pid=$!
  wait "$nl_pid" || status=1
  wait "$en_pid" || status=1
  for locale in $LOCALES; do
    echo "::group::$APP_TESTS in $locale"
    cat ".build/test-$APP-$locale.log"
    echo "::endgroup::"
  done
  return $status
}

# What the report needs to know when the run ends: the simulators to shut down and delete.
ios_cleanup() {
  report_steps || true
  stop_simulator || true
  delete_extra_simulator
}

# The test bundle of the build job: what test-without-building needs, packed so that file modes survive the artifact
# upload (a zip of the files would drop the executable bit of the app and the test runner).
BUNDLE_TAR=.build/ios-test-bundle.tar
pack_bundle() {
  tar -cf "$BUNDLE_TAR" -C .build/DerivedData/Build Products
  echo "Packed $(basename "$BUNDLE_TAR") ($(du -h "$BUNDLE_TAR" | cut -f1))"
}

# Unpacks the bundle of the build job in place of Build/Products and checks that it has the .xctestrun of each app.
unpack_bundle() {
  local file=${BUNDLE_FILE:-$BUNDLE_TAR} app
  [ -f "$file" ] || die "no test bundle at $file — run scripts/test-ios.sh build first (or pass --bundle <file>)"
  rm -rf .build/DerivedData/Build/Products
  mkdir -p .build/DerivedData/Build
  tar -xf "$file" -C .build/DerivedData/Build
  for app in $APPS; do
    use_app "$app"
    find_xctestrun || die "the test bundle has no usable .xctestrun for $APP"
  done
}

# The slowest tests and, when a run failed, the failed tests of the result bundle $1 in locale $2 (also in the job summary).
report_slowest() { # <bundle> <locale>
  local rows
  rows="$(slowest_tests "$1" 10 "$2")"
  [ -z "$rows" ] || {
    echo "Slowest$APP_WORD tests in $2 (seconds):"
    echo "$rows" | sed 's/^| /  /; s/ | / /; s/ |$//'
    summary "### Slowest iOS tests in $2$APP_NOTE" "" "| Test | Seconds |" "|---|--:|" "$rows" ""
  }
  rows="$(slowest_classes "$1" 10 "$2")"
  [ -z "$rows" ] || {
    echo "$APP_TIME time by class in $2 (tests, seconds; the first row is all of them):"
    echo "$rows" | sed 's/^| /  /; s/ | / /g; s/ |$//'
    summary "### iOS test time by class in $2$APP_NOTE" "" "| Class | Tests | Seconds |" "|---|--:|--:|" "$rows" ""
  }
}

# How much of the deadline the run of the tests used, once the run ended (#1389): a run creeps towards its deadline as
# tests are added (the en and nl steps of #1389 went from 1340 s to 1650 s in a day), and the interruption of #305 is
# then the first sign. Above TEST_BUDGET_PERCENT of the deadline (TESTING.md §7.2) the run passes but warns, so the
# next PR can speed the suite up or split it before a slow runner pushes a run over. Nothing when the run is not
# timed (TEST_ELAPSED is set after the run of one locale).
TEST_BUDGET_PERCENT=${IOS_TEST_BUDGET_PERCENT:-85}
report_budget() { # <locale>
  [ -n "${TEST_ELAPSED:-}" ] || return 0
  local percent=$((TEST_ELAPSED * 100 / TEST_DEADLINE)) line
  line="The${APP_WORD} $1 tests ran $TEST_ELAPSED s of the $TEST_DEADLINE s deadline ($percent %)"
  echo "$line"
  summary "### iOS test budget in $1$APP_NOTE" "" "$line" ""
  if [ "$percent" -gt "$TEST_BUDGET_PERCENT" ]; then
    echo "::warning::$line, over the $TEST_BUDGET_PERCENT % that a run on a typical runner may use; a slower runner pushes it past the deadline (#1389): speed the suite up or split it (TESTING.md §7.2)"
  fi
}

# What failed, by name: `xcodebuild -quiet` only says TEST EXECUTE FAILED (#290). Once per result bundle, with the
# locale when there is a bundle per locale (as the slowest tests above).
report_failed() { # <bundle> [locale]
  local rows
  rows="$(failed_tests "$1")"
  [ -z "$rows" ] || {
    echo "Failed tests${2:+ in $2}:"
    echo "  ${rows//$'\n'/$'\n  '}"
    summary "### Failed$APP_WORD iOS tests${2:+ in $2}" "" '```' "$rows" '```' ""
  }
}

# The UI tests that started the app again, as `::warning::` lines (GitHub shows them as annotations) and in the job
# summary: a test that only passes on a retry is reported as flaky (#388, TESTING.md §8). Once per result bundle.
report_flaky() { # <bundle>
  local rows
  rows="$(flaky_tests "$1" "${APP}UITests")"
  [ -z "$rows" ] || {
    echo "$rows"
    summary "### Flaky$APP_WORD iOS tests" "" "$(sed -e 's/^::warning:://' -e 's/^/- /' <<<"$rows")" ""
  }
}

udid="$(ios_simulator)"
[ -n "$udid" ] || die "no iPhone simulator${IOS_SIMULATOR:+ named $IOS_SIMULATOR} — run scripts/bootstrap.sh --mobile"
# on_exit holds one command: catalog_sync's restore ran and cleared it above, so this doesn't replace a live one.
on_exit 'ios_cleanup'
mkdir -p .build

if [ "$MODE" = build ]; then
  # No simulator boots: nothing runs. The build needs one only as its destination.
  step "Build for testing (simulator $udid)"
  build_for_testing "$udid"
  step "Pack the test bundle"
  pack_bundle
  echo "✓ iOS build"
  exit 0
fi

# The run of one locale of the app (`use_app`) from the bundle of the build job: its tests and the reports on them. Returns
# 1 when a test failed, also when its retry (`--retry-failed`) did not make it pass.
test_one_locale() { # <simulator>
  local tests=0 tests_started bundle reason
  # The result bundle and the name of the run: the language, and the part of it when `--shard` says so (#1447).
  RESULT_NAME="$ONLY_LOCALE" RESULT_LABEL="$ONLY_LOCALE" SHARD_ARGS=() SHARD_TESTS=""
  if [ -n "$SHARD_OF" ]; then
    RESULT_NAME="$ONLY_LOCALE-${SHARD_PART}of$SHARD_OF"
    RESULT_LABEL="$ONLY_LOCALE, part $SHARD_PART of $SHARD_OF"
  fi
  bundle="$(result_bundle "$RESULT_NAME")"
  rm -rf "$bundle" ".build/$RESULT_STEM-$ONLY_LOCALE-retry.xcresult"
  if [ -n "$SHARD_OF" ]; then
    step "Choose the$APP_WORD tests of part $SHARD_PART of $SHARD_OF in $ONLY_LOCALE (simulator $1)"
    select_shard "$1" "$ONLY_LOCALE" || return 1
  fi
  if $UNIT_ONLY; then
    step "$APP_UNIT tests in $RESULT_LABEL (--unit-only) (simulator $1)"
  else
    step "$APP_UNIT and UI tests in $RESULT_LABEL (simulator $1)"
  fi
  tests_started=$SECONDS
  run_tests "$1" "$ONLY_LOCALE" || tests=1
  TEST_ELAPSED=$((SECONDS - tests_started))
  report_slowest "$bundle" "$ONLY_LOCALE"
  report_budget "$RESULT_LABEL"
  report_flaky "$bundle"
  if [ -n "$SHARD_OF" ] && ! $RUN_TIMED_OUT; then
    if ! reason="$(shard_complete "$bundle")"; then
      echo "::error::The$APP_WORD $RESULT_LABEL run is not complete: $reason"
      tests=1
    fi
  fi
  if [ "$tests" != 0 ]; then
    report_failed "$bundle" "$RESULT_LABEL"
    if $RETRY_FAILED && retry_failed_ui_tests "$1" "$ONLY_LOCALE"; then
      echo "✓ $APP_IOS tests in $ONLY_LOCALE (the failed UI tests passed on their retry)"
      return 0
    fi
    return 1
  fi
  echo "✓ $APP_IOS tests in $RESULT_LABEL"
}

if [ "$MODE" = test ]; then
  # One language from the bundle of the build job, on a simulator of its own, for each app, one after the other. The
  # simulator boots first and settles while the bundle is unpacked, as it did while the app built in the single job: a
  # simulator that starts the first test right after its boot failed the one test that rotates the device in both jobs
  # (#293). A failing app doesn't stop the next one.
  step "Boot the simulator (simulator $udid)"
  start_boot "$udid"
  booted_at=$SECONDS
  step "Unpack the test bundle"
  unpack_bundle
  step "Wait for the simulator to settle"
  await_boots || die "a simulator did not boot"
  settle_left=$((${IOS_SIM_SETTLE:-150} - (SECONDS - booted_at)))
  # A simulator that was already booted (a reused device, KEEP_DEVICE=1) has settled: BOOTED_SIMULATOR holds only the ones this run booted.
  case " $BOOTED_SIMULATOR " in *" $udid "*) ;; *) settle_left=0 ;; esac
  if [ "$settle_left" -gt 0 ]; then
    echo "The simulator has been up for $((SECONDS - booted_at)) s; waiting $settle_left s more (IOS_SIM_SETTLE)"
    sleep "$settle_left"
  fi
  failed_apps=""
  for app in $APPS; do
    use_app "$app"
    find_xctestrun || die "the test bundle has no usable .xctestrun for $APP"
    test_one_locale "$udid" || failed_apps="$failed_apps $APP"
  done
  [ -z "$failed_apps" ] || { echo "iOS tests failed in $ONLY_LOCALE${SHARD_OF:+, part $SHARD_PART of $SHARD_OF,} for:$failed_apps"; exit 1; }
  echo "✓ iOS tests in ${RESULT_LABEL:-$ONLY_LOCALE}"
  exit 0
fi

parallel=false
[ "${IOS_PARALLEL:-0}" != 1 ] || parallel=true
if $parallel; then create_extra_simulator || die "could not create a second simulator"; fi
extra="$EXTRA_SIMULATOR"

# The run of both locales of the app (`use_app`) on the simulator $1 (and $2 when the locales run at the same time), and the
# reports on it. Returns 1 when a test failed.
test_all_locales() { # <simulator> [second simulator]
  local tests=0 per_locale=$parallel locale bundle
  # One bundle per locale when the locales run at the same time or with different tests.
  $all_ui || per_locale=true
  if $parallel; then
    if $UNIT_ONLY; then ui_note=", no UI tests (--unit-only)"; elif ! $all_ui; then ui_note=", UI tests in ${UI_LOCALES// / and } only"; fi
    step "$APP_UNIT and UI tests in nl and en at the same time${ui_note:-} (simulators $1 and $2)"
    test_locales_in_parallel "$1" "$2" || tests=1
  elif $all_ui; then
    step "$APP_UNIT and UI tests in nl and en (simulator $1)"
    run_tests "$1" || tests=1
  else
    # The UI tests of the other locale are skipped: one run per locale, one after the other (a failing run doesn't stop
    # the next), each with its own result bundle.
    if $UNIT_ONLY; then
      step "$APP_UNIT tests in nl and en, no UI tests (--unit-only) (simulator $1)"
    else
      step "$APP_UNIT tests in nl and en, UI tests in ${UI_LOCALES// / and } only (simulator $1)"
    fi
    for locale in $LOCALES; do run_tests "$1" "$locale" || tests=1; done
  fi
  for locale in $LOCALES; do
    bundle="$(result_bundle)"
    ! $per_locale || bundle="$(result_bundle "$locale")"
    report_slowest "$bundle" "$locale"
    ! $per_locale || report_flaky "$bundle"
  done
  $per_locale || report_flaky "$(result_bundle)"
  if [ "$tests" != 0 ]; then
    if $per_locale; then
      for locale in $LOCALES; do report_failed "$(result_bundle "$locale")" "$locale"; done
    else
      report_failed "$(result_bundle)"
    fi
    return 1
  fi
}

# The simulators boot while the apps build.
rm -rf .build/TestResults*.xcresult
start_boot "$udid"
[ -z "$extra" ] || start_boot "$extra"
step "Build for testing (simulator $udid)"
build_for_testing "$udid"
await_boots || die "a simulator did not boot"
failed_apps=""
for app in $APPS; do
  use_app "$app"
  find_xctestrun || die "the build has no usable .xctestrun for $APP"
  test_all_locales "$udid" "$extra" || failed_apps="$failed_apps $APP"
done
[ -z "$failed_apps" ] || { echo "iOS tests failed for:$failed_apps"; exit 1; }
echo "✓ iOS"
