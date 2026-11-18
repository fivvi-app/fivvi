#!/usr/bin/env bash
# The report of the nightly run of CI (ADR-034): when a job of the scheduled run of .github/workflows/ci.yml failed or was
# cancelled, this opens a bug issue titled `Nightly UI tests failed` (labels bug and ready-for-agent), or, when an open
# issue with that title exists, comments on it. The factory builds it before the other tickets.
#
#   nightly-report.sh        reads the environment of the job "Nightly report":
#       NEEDS              JSON of the `needs` context (`toJSON(needs)`): the result of every other job, by job id
#       GITHUB_REPOSITORY  owner/name
#       GITHUB_RUN_ID      the run, whose jobs are read for their names (the job needs `actions: read`)
#       GITHUB_SERVER_URL  https://github.com (default)
#       GH_TOKEN           the job's token, with `issues: write`
#   Does nothing, and calls no gh, when every job passed or was skipped. A job counts as failed when its result is `failure`,
#   `cancelled` or `abandoned`. The failing jobs are named as the run's jobs are (`iOS tests (nl)`); when the run's jobs can't
#   be read it falls back to the job ids of NEEDS. The text holds the run's address, the names of the failing jobs and an
#   acceptance criterion, and nothing else: no log, no user data.
#
# The issue has the `## Acceptance criteria` checklist the factory builds against; a comment on the open issue has the run and
# the failing jobs of that night only.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

[ $# -eq 0 ] || usage_of "$0"
need_cmd gh
need_cmd jq

TITLE='Nightly UI tests failed'
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
RUN_ID="${GITHUB_RUN_ID:?GITHUB_RUN_ID is not set}"
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/$REPO/actions/runs/$RUN_ID"
NEEDS="${NEEDS:?NEEDS is not set (toJSON(needs))}"

failed_ids="$(jq -r '[to_entries[] | select(.value.result == "failure" or .value.result == "cancelled" or .value.result == "abandoned") | .key] | sort | .[]' <<<"$NEEDS")" \
  || die "NEEDS is not JSON"
if [ -z "$failed_ids" ]; then
  echo "The nightly run passed: nothing to report."
  exit 0
fi

# The names of the jobs that ended badly, from the run itself (a matrix leg has a name of its own); the ids when that read fails.
failed_names="$(gh api "repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100" --paginate \
  --jq '.jobs[] | select(.conclusion == "failure" or .conclusion == "cancelled" or .conclusion == "timed_out") | .name' 2>/dev/null | sort -u)" || failed_names=""
if [ -z "$failed_names" ]; then
  echo "Could not read the names of the jobs of run $RUN_ID; naming the job ids." >&2
  failed_names="$failed_ids"
fi
jobs_list=""
while IFS= read -r name; do
  jobs_list+="${jobs_list:+$'\n'}- $name"
done <<<"$failed_names"

run_section="The nightly run of \`ci.yml\` on \`main\` failed: $RUN_URL

Failing jobs:

$jobs_list"
issue_body="$run_section

## Acceptance criteria

- [ ] The nightly run of ci.yml passes on main"

open_number="$(gh issue list --repo "$REPO" --state open --search "\"$TITLE\" in:title" --limit 100 --json number,title \
  --jq "[.[] | select(.title == \"$TITLE\")] | sort_by(.number) | first | .number // empty")" \
  || die "could not list the open issues"

if [ -n "$open_number" ]; then
  gh issue comment "$open_number" --repo "$REPO" --body "$run_section" >/dev/null
  echo "Commented on #$open_number: $RUN_URL"
else
  url="$(gh issue create --repo "$REPO" --title "$TITLE" --label bug --label ready-for-agent --body "$issue_body")"
  echo "Opened $url: $RUN_URL"
fi
