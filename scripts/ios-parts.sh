#!/usr/bin/env bash
# What became of the parts of the iOS check, for CI's "iOS parts" job (#413). GitHub's hosted macOS arm64 runners are
# short of capacity at times: a job that no runner picks up is cancelled after about 15 minutes with an empty
# runner_name and no step ("The job was not acquired by Runner of type hosted even after multiple attempts"), and
# `needs.<job>.result` says only "cancelled", like a timeout. This reads the jobs of the run and tells the two apart, so
# the part can be tried again on a pool with other capacity (the retry job in .github/workflows/ci.yml) and the gate
# (scripts/native-gate.sh) can say which kind of failure each part had.
#
#   ios-parts.sh [--force]
#       reads the run's jobs from the GitHub API (GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT; the
#       job needs `actions: read`) and prints, in the format of $GITHUB_OUTPUT:
#         build=, nl=, en=   success, failure, cancelled, skipped, ... (the job's conclusion), or unacquired
#         locales=           the languages to retry, a JSON array: the unacquired ones; both when the build had no
#                            runner, because the tests never started. The retry builds for itself, on the other pool
#       with the reason on stderr. --force reports every part as unacquired and reads nothing: the run on demand
#       (workflow_dispatch input ios_retry) that proves the retry path without waiting for GitHub's capacity to run out
#       Fails, printing nothing, when the jobs can't be read: the retry never starts on a guess.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

FORCE=false
case "${1:-}" in
  "") ;;
  --force) FORCE=true; [ $# -eq 1 ] || usage_of "$0" ;;
  *) usage_of "$0" ;;
esac
need_cmd jq

if $FORCE; then
  echo "iOS build, iOS tests: forced onto the retry path (ios_retry); every part is reported as unacquired." >&2
  jobs_json='{"jobs":[]}'
else
  jobs_json="$(gh api "repos/${GITHUB_REPOSITORY:?}/actions/runs/${GITHUB_RUN_ID:?}/attempts/${GITHUB_RUN_ATTEMPT:-1}/jobs?per_page=100")" \
    || die "could not read the run's jobs"
fi

out="$(jq -r --argjson force "$FORCE" '
  # A job no hosted runner picked up: cancelled, with no runner and not one step. A job missing from the list was skipped
  # (a skipped matrix job keeps its unexpanded name).
  def state($name):
    ([.jobs[] | select(.name == $name)] | first) as $job
    | if $force then "unacquired"
      elif $job == null then "skipped"
      elif $job.conclusion == "cancelled" and (($job.runner_name // "") == "") and (($job.steps // []) | length) == 0
        then "unacquired"
      else ($job.conclusion // "unknown") end;
  state("iOS build") as $build
  | (if $build == "unacquired" then "unacquired" else state("iOS tests (nl)") end) as $nl
  | (if $build == "unacquired" then "unacquired" else state("iOS tests (en)") end) as $en
  | "build=\($build)", "nl=\($nl)", "en=\($en)",
    "locales=\([["nl", $nl], ["en", $en]] | map(select(.[1] == "unacquired") | .[0]) | tojson)"
' <<<"$jobs_json")" || die "could not read the run's jobs"

$FORCE || while IFS='=' read -r key value; do
  [ "$value" = unacquired ] || continue
  case "$key" in
    build) echo "iOS build: no hosted runner picked it up (cancelled, no runner, no step); its tests never started, so both languages are retried on the other pool." >&2 ;;
    nl | en) grep -q '^build=unacquired$' <<<"$out" \
      || echo "iOS tests ($key): no hosted runner picked it up (cancelled, no runner, no step); retried on the other pool." >&2 ;;
  esac
done <<<"$out"
echo "$out"
