#!/usr/bin/env bash
# The steps of a release run that every platform shares (E017, docs/engineering/RELEASE.md). .github/workflows/release.yml
# calls them, so what a run refuses and numbers is tested (scripts/test/release.test.mjs) and not written into the workflow.
#
#   release.sh guard               refuses a run that is not the first attempt of a hand-started run (workflow_dispatch)
#                                  on refs/heads/main. The first step of every job of a release run, before any step that
#                                  reads a secret
#   release.sh build-number        prints the build number of this run, the same for every platform of the run: the run
#                                  number plus a fixed offset (CFBundleVersion and versionCode). A re-run is refused
#   release.sh tests ios|android   runs the native suites of the platform on this commit, in both locales, as TESTING.md §7
#                                  requires: pnpm test:ios; pnpm test:android, then pnpm test:maestro. Stops at the first
#                                  failure; a job that needs this one never starts, so nothing is uploaded
#
# Reads GITHUB_EVENT_NAME, GITHUB_REF, GITHUB_RUN_NUMBER and GITHUB_RUN_ATTEMPT, which GitHub Actions sets.
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
  case "${1:-}" in
    ios) suite pnpm test:ios ;;
    android)
      suite pnpm test:android
      suite pnpm test:maestro
      ;;
    *) usage ;;
  esac
}

command="${1:-}"
[ $# -eq 0 ] || shift
cd "$ROOT"
case "$command" in
  guard) [ $# -eq 0 ] || usage; guard ;;
  build-number) [ $# -eq 0 ] || usage; build_number ;;
  tests) [ $# -eq 1 ] || usage; tests "$1" ;;
  *) usage ;;
esac
