#!/usr/bin/env bash
# What became of the iOS build and of the tests of one language, for CI's "iOS parts (<language>)" jobs (#413). GitHub's
# hosted macOS arm64 runners are short of capacity at times: a job that no runner picks up is cancelled after about 15
# minutes with an empty runner_name and no step ("The job was not acquired by Runner of type hosted even after multiple
# attempts"), and `needs.<job>.result` says only "cancelled", like a timeout. This reads the jobs of the run and tells
# the two apart, so the language can be tried again on a pool with other capacity (the retry job of that language in
# .github/workflows/ci.yml) and the gate (scripts/native-gate.sh) can say which kind of failure each part had.
#
#   ios-parts.sh <nl|en> [--force]
#       reads the run's jobs from the GitHub API (GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT; the
#       job needs `actions: read`) and prints, in the format of $GITHUB_OUTPUT:
#         build=   the conclusion of "iOS build" (success, failure, cancelled, skipped, ...), or unacquired
#         tests=   the same for "iOS tests (<language>)"; unacquired too when the build was, because the tests never started
#         retry=   true when the build or the tests of this language had no runner (the retry builds for itself, on the
#                  other pool), false otherwise
#       with the reason on stderr. It reads only the build and this language's job, so a language's retry never waits for
#       the other language's tests. --force reports both as unacquired and reads nothing: the run on demand
#       (workflow_dispatch input ios_retry) that proves the retry path without waiting for GitHub's capacity to run out
#       Fails, printing nothing, when the jobs can't be read: the retry never starts on a guess.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

[ $# -ge 1 ] || usage_of "$0"
LOCALE="$1"
shift
case "$LOCALE" in nl | en) ;; *) usage_of "$0" ;; esac
FORCE=false
case "${1:-}" in
  "") ;;
  --force) FORCE=true; [ $# -eq 1 ] || usage_of "$0" ;;
  *) usage_of "$0" ;;
esac
need_cmd jq

if $FORCE; then
  echo "iOS build, iOS tests ($LOCALE): forced onto the retry path (ios_retry); both are reported as unacquired." >&2
  jobs_json='{"jobs":[]}'
else
  jobs_json="$(gh api "repos/${GITHUB_REPOSITORY:?}/actions/runs/${GITHUB_RUN_ID:?}/attempts/${GITHUB_RUN_ATTEMPT:-1}/jobs?per_page=100")" \
    || die "could not read the run's jobs"
fi

out="$(jq -r --argjson force "$FORCE" --arg locale "$LOCALE" '
  # A job no hosted runner picked up: cancelled, with no runner and not one step. A job missing from the list was skipped.
  def state($name):
    ([.jobs[] | select(.name == $name)] | first) as $job
    | if $force then "unacquired"
      elif $job == null then "skipped"
      elif $job.conclusion == "cancelled" and (($job.runner_name // "") == "") and (($job.steps // []) | length) == 0
        then "unacquired"
      else ($job.conclusion // "unknown") end;
  state("iOS build") as $build
  | (if $build == "unacquired" then "unacquired" else state("iOS tests (\($locale))") end) as $tests
  | "build=\($build)", "tests=\($tests)",
    "retry=\(if $build == "unacquired" or $tests == "unacquired" then "true" else "false" end)"
' <<<"$jobs_json")" || die "could not read the run's jobs"

$FORCE || while IFS='=' read -r key value; do
  [ "$value" = unacquired ] || continue
  case "$key" in
    build) echo "iOS build: no hosted runner picked it up (cancelled, no runner, no step); the tests of $LOCALE never started, so they are retried on the other pool." >&2 ;;
    tests) grep -q '^build=unacquired$' <<<"$out" \
      || echo "iOS tests ($LOCALE): no hosted runner picked it up (cancelled, no runner, no step); retried on the other pool." >&2 ;;
  esac
done <<<"$out"
echo "$out"
