#!/usr/bin/env bash
# Which native CI jobs (iOS, Android) a change needs, for CI's "Detect changes" job (.github/workflows/ci.yml). A
# script, so the decision is tested (scripts/test/scripts.test.mjs) instead of living untested in the workflow.
#
#   native-jobs.sh [--event <github event>] [--run-native]
#       reads the changed paths on stdin and prints ios=true|false and android=true|false (the format of
#       $GITHUB_OUTPUT), with the reason on stderr. A job runs when its project exists and a path it depends on
#       changed, on a push to main too: main then writes the caches (Gradle, the AVD snapshot, DerivedData) that every PR
#       and every merge group reads (a merge group's own caches are read by nobody else), so a push to main is not
#       skipped (E002 #242). A path ending in .md (the READMEs under apps/ios and apps/android) never counts: documentation
#       can't break a native build, because no native build or test reads a Markdown file (the README-vs-ID checks run
#       on Linux in scripts/test/app-ids.test.mjs, which also fails when a native source reads one). A change that
#       touches no such path (docs, ci.yml, _lib.sh) runs neither.
#       --event workflow_dispatch and --run-native (the PR's run-native label) run both, whatever changed.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

# Each native job: the app, its generated inputs (the committed client, string catalogs, design tokens), the version both apps share
# (apps/Version.xcconfig) and its own scripts. The client is the committed generated one, packages/contract/swift for iOS
# and packages/contract/kotlin for Android, not every path under packages/contract/: a change to the API's TypeScript
# side that leaves both clients as they are builds nothing new, and one that should have changed them fails the contract
# drift check in Checks (Linux) (#293). Shared
# files (.github/workflows/ci.yml, scripts/_lib.sh, this list) don't run them on their own. Android also runs the
# Maestro flows in e2e/maestro, which read their sign-in code from the fake Brevo server (apps/web/e2e/fake-brevo.ts)
# out of the sign-in email (EM-08, packages/email/src/templates/sign-in.tsx).
IOS_PATHS='^(apps/ios|packages/contract/swift|packages/i18n/generated/ios|packages/design-tokens/FivviDesignTokens)/|^apps/Version\.xcconfig$|^scripts/(test-ios|_ios)\.sh$'
ANDROID_PATHS='^(apps/android|packages/contract/kotlin|packages/i18n/generated/android|packages/design-tokens/kotlin|e2e/maestro)/|^apps/Version\.xcconfig$|^apps/web/e2e/fake-brevo\.ts$|^packages/email/src/templates/sign-in\.tsx$|^packages/email/src/environment\.ts$|^packages/database/src/(scripts/)?reset-rate-limits\.ts$|^scripts/(android|_android|maestro)\.sh$'

EVENT=""
FORCE=false
while [ $# -gt 0 ]; do
  case "$1" in
    --event) EVENT="${2:?}"; shift ;;
    --run-native) FORCE=true ;;
    *) usage ;;
  esac
  shift
done
[ "$EVENT" != workflow_dispatch ] || FORCE=true
# Markdown never counts as a native change, wherever it sits; --run-native and workflow_dispatch still run both.
CHANGED="$(grep -vE '\.md$' || true)"

# decide <job> <project dir> <path regex>
decide() {
  local run=false
  if [ ! -d "$ROOT/$2" ]; then
    echo "$1: $2 does not exist yet, skipping." >&2
  elif $FORCE; then
    run=true
    echo "$1: run on demand (workflow_dispatch or the run-native label), running." >&2
  elif grep -qE "$3" <<<"$CHANGED"; then
    run=true
    echo "$1: relevant changes, running." >&2
  else
    echo "$1: no relevant changes, skipping." >&2
  fi
  echo "$1=$run"
}

decide ios apps/ios "$IOS_PATHS"
decide android apps/android "$ANDROID_PATHS"
