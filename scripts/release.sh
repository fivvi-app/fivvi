#!/usr/bin/env bash
# The steps of a release run that every platform shares (E017, docs/engineering/RELEASE.md). .github/workflows/release.yml
# calls them, so what a run refuses and numbers is tested (scripts/test/release.test.mjs) and not written into the workflow.
#
#   release.sh guard               refuses a run that is not the first attempt of a hand-started run (workflow_dispatch)
#                                  on refs/heads/main. The first step of every job of a release run, before any step that
#                                  reads a secret
#   release.sh build-number        prints the build number of this run, the same for every platform of the run: the run
#                                  number plus a fixed offset (CFBundleVersion and versionCode). A re-run is refused
#   release.sh tests ios <nl|en>   the iOS suite of one locale on this commit: pnpm test:ios build (SwiftLint, checks and the
#                                  build for testing), then pnpm test:ios test <locale> --retry-failed: a failed UI test is
#                                  retried once, on the same simulator, and the run passes when it passes then (#1433; CI never
#                                  retries a failed test, test-ios.sh has the rules). The workflow runs it once per locale,
#                                  each in a job of its own like CI's `iOS tests (nl)` and `(en)`, because both locales on one
#                                  simulator no longer fit the job's timeout (E017). The locale is required: no caller runs
#                                  both at once any more
#   release.sh tests android       the Android unit and Compose UI tests on this commit: pnpm test:android (ktlint and the
#                                  checks, the build, the unit tests in nl-NL and en, the release bundle and the Compose UI
#                                  tests on an emulator). The workflow runs it in its own job, like CI's `Android tests`
#   release.sh tests android-maestro  the Android Maestro flows in nl-NL and en on this commit: pnpm test:maestro. The
#                                  workflow runs it in a job of its own, like CI's `Android Maestro`, next to the one above:
#                                  both suites on one emulator in one job outgrew the job's timeout (E017). TESTING.md §7
#                                  requires both platforms in nl and en. Each stops at its first failure; a job that needs
#                                  these never starts, so nothing is uploaded
#   release.sh runners <part>...   the last job of a run (#437). The parts are the lines of `ios-parts.sh job`, `<job>=<result>`,
#                                  for "iOS tests (nl)", "iOS tests (en)" and "iOS release". Says, as an error and in the run's summary, that a job
#                                  got no GitHub-hosted macOS runner (`<job>=unacquired`: cancelled with no runner and no
#                                  step), so nothing ran and a new run is the remedy, not a timeout or a test failure. Exits 1
#                                  then; otherwise prints one plain line and exits 0, and says nothing about runners for a
#                                  bare result (the jobs could not be read) or any other result
#
# Reads GITHUB_EVENT_NAME, GITHUB_REF, GITHUB_RUN_NUMBER and GITHUB_RUN_ATTEMPT, which GitHub Actions sets, and appends to
# the file GITHUB_STEP_SUMMARY names, when it is set (`runners`).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

# Added to the run number. Above every build uploaded by hand before the first run, so the first run's number is higher
# than any of them; never lower it, and raise it when a build uploaded by hand has a higher number, or when the workflow
# file is renamed or replaced, which restarts the run number at 1 (RELEASE.md §6).
BUILD_NUMBER_OFFSET=100
RELEASE_REF=refs/heads/main

guard() {
  [ "${GITHUB_EVENT_NAME:-}" = workflow_dispatch ] \
    || die "a release run is started by hand (workflow_dispatch), not by '${GITHUB_EVENT_NAME:-}'"
  [ "${GITHUB_REF:-}" = "$RELEASE_REF" ] \
    || die "a release run starts from main, not from '${GITHUB_REF:-}': nothing was built or uploaded"
  # A re-run keeps the run number, so it would build a number that the first attempt may already have uploaded.
  [ "${GITHUB_RUN_ATTEMPT:-1}" = 1 ] \
    || die "this is attempt ${GITHUB_RUN_ATTEMPT} of the run: start a new run, which gets the next build number (RELEASE.md §6)"
}

build_number() {
  guard
  local number="${GITHUB_RUN_NUMBER:-}"
  [[ "$number" =~ ^[1-9][0-9]*$ ]] || die "GITHUB_RUN_NUMBER is not a run number: '$number'"
  echo $((number + BUILD_NUMBER_OFFSET))
}

# Runs a command of a native suite and fails with its name.
suite() {
  echo "▶ $*" >&2
  "$@" || die "the native suite failed: $* — nothing is built or uploaded"
}

tests() {
  case "$1" in
    ios)
      [ $# -eq 2 ] || usage
      [ "$2" = nl ] || [ "$2" = en ] || usage
      suite pnpm test:ios build
      suite pnpm test:ios test "$2" --retry-failed
      ;;
    android)
      [ $# -eq 1 ] || usage
      suite pnpm test:android
      ;;
    android-maestro)
      [ $# -eq 1 ] || usage
      suite pnpm test:maestro
      ;;
    *) usage ;;
  esac
}

# A job that no hosted macOS runner picked up reads as a failed build in the run, so the error says what happened (#437).
# $1 is the job's name, $2 what is left of the run for that job, $3 an extra clause and $4 a hedge for the job that waits
# for approval, which also ends cancelled with no runner when the owner cancels the run.
no_runner() {
  local message="$1 got no GitHub-hosted macOS runner$4; $2; start a new Release run (not Re-run)$3"
  echo "::error::$message"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$message" >>"$GITHUB_STEP_SUMMARY"; fi
}

runners() {
  local part missing=0
  for part in "$@"; do
    case "$part" in
      "iOS tests (nl)=unacquired" | "iOS tests (en)=unacquired")
        no_runner "${part%=*}" "nothing was built or uploaded" "" ""
        missing=1
        ;;
      "iOS release=unacquired")
        no_runner "iOS release" "nothing was signed or uploaded for iOS" "; an Android build of this run may already be out, so the new run can leave Android off" " (if nobody cancelled the run)"
        missing=1
        ;;
    esac
  done
  [ "$missing" = 0 ] || exit 1
  echo "No iOS job reported a missing GitHub-hosted macOS runner."
}

command="${1:-}"
[ $# -eq 0 ] || shift
cd "$ROOT"
case "$command" in
  guard) [ $# -eq 0 ] || usage; guard ;;
  build-number) [ $# -eq 0 ] || usage; build_number ;;
  tests) [ $# -ge 1 ] || usage; tests "$@" ;;
  runners) [ $# -ge 1 ] || usage; runners "$@" ;;
  *) usage ;;
esac
