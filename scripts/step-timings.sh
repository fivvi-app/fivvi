#!/usr/bin/env bash
# How long each step of the running CI job took, as a table in the job summary (E002 #91). A last step of the native
# jobs, `if: always()`, so a failed or cancelled run shows where its time went. Never fails the job.
#
#   step-timings.sh ["<step name>=<minutes>" ...]
#       reads the run's jobs from the GitHub API (GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT and
#       RUNNER_NAME come from the runner; the job needs `actions: read`) and appends the table to
#       $GITHUB_STEP_SUMMARY, or prints it when that isn't set. The step still running, this one, is left out.
#       Each "<step name>=<minutes>" is the time budget (its timeout-minutes) of a step: when that step took more than
#       two thirds of it, a `::warning::` annotation says so, so a step creeping towards its cap shows before it fails
#       (E008 #519).
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

# The budgets as JSON: [{"name": ..., "minutes": ...}]. A budget that is not a whole number of minutes is a mistake in the
# workflow, not something to skip quietly.
budgets='[]'
for arg in "$@"; do
  minutes="${arg##*=}"
  [[ "$arg" == *=* && "$minutes" =~ ^[1-9][0-9]*$ ]] || usage_of "$0"
  budgets="$(jq -c --arg name "${arg%=*}" --argjson minutes "$minutes" '. + [{name: $name, minutes: $minutes}]' <<<"$budgets")"
done

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

# One ::warning:: line per budgeted step of this runner's job that took more than two thirds of its budget.
warnings() {
  jq -r --arg runner "${RUNNER_NAME:-}" --argjson budgets "$budgets" '
    def seconds: (.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601);
    def clock: "\(. / 60 | floor) min \(. % 60) s";
    [.jobs[] | select(.runner_name == $runner)] | first // empty
    | [.steps[] | select(.started_at != null and .completed_at != null)] as $steps
    | $budgets[] as $budget
    | $steps[] | select(.name == $budget.name and seconds * 3 > $budget.minutes * 60 * 2)
    | "::warning::\(.name) took \(seconds | clock) of its \($budget.minutes) min budget (more than two thirds): it nears its cap"'
}

jobs_json="$(gh api "repos/${GITHUB_REPOSITORY:?}/actions/runs/${GITHUB_RUN_ID:?}/attempts/${GITHUB_RUN_ATTEMPT:-1}/jobs?per_page=100")" \
  || { echo "step-timings: could not read the run's jobs; no table" >&2; exit 0; }
out="$(table <<<"$jobs_json")" || { echo "step-timings: could not read the job's steps; no table" >&2; exit 0; }
[ -n "$out" ] || { echo "step-timings: no job on runner '${RUNNER_NAME:-}'; no table" >&2; exit 0; }

echo "$out"
summary "$out"
warnings <<<"$jobs_json" || echo "step-timings: could not check the step budgets; no warning" >&2
exit 0
