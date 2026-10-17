#!/usr/bin/env bash
# How long each step of the running CI job took, as a table in the job summary (E002 #91). A last step of the native
# jobs, `if: always()`, so a failed or cancelled run shows where its time went. Never fails the job.
#
#   step-timings.sh
#       reads the run's jobs from the GitHub API (GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT and
#       RUNNER_NAME come from the runner; the job needs `actions: read`) and appends the table to
#       $GITHUB_STEP_SUMMARY, or prints it when that isn't set. The step still running, this one, is left out.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
[ $# -eq 0 ] || usage_of "$0"

table() {
  jq -r --arg runner "${RUNNER_NAME:-}" '
    def seconds: (.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601);
    def clock: "\(. / 60 | floor) min \(. % 60) s";
    [.jobs[] | select(.runner_name == $runner)] | first // empty
    | . as $job
    | [.steps[] | select(.started_at != null and .completed_at != null)] as $steps
    | "### Step durations: \($job.name)\n",
      "| Step | Duration |",
      "|---|--:|",
      ($steps[] | "| \(.name) | \(seconds | clock) |"),
      "| **Total** | **\([$steps[] | seconds] | add // 0 | clock)** |"'
}

jobs_json="$(gh api "repos/${GITHUB_REPOSITORY:?}/actions/runs/${GITHUB_RUN_ID:?}/attempts/${GITHUB_RUN_ATTEMPT:-1}/jobs?per_page=100")" \
  || { echo "step-timings: could not read the run's jobs; no table" >&2; exit 0; }
out="$(table <<<"$jobs_json")" || { echo "step-timings: could not read the job's steps; no table" >&2; exit 0; }
[ -n "$out" ] || { echo "step-timings: no job on runner '${RUNNER_NAME:-}'; no table" >&2; exit 0; }

echo "$out"
summary "$out"
