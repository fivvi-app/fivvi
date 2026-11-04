#!/usr/bin/env bash
# What became of the iOS jobs, for CI's gate "iOS" (#413) and for Release's last job (#437). GitHub's hosted macOS arm64 runners are short of capacity at
# times: a job that no runner picks up is cancelled after about 15 minutes with an empty runner_name and no step ("The
# job was not acquired by Runner of type hosted even after multiple attempts"), and `needs.<job>.result` says only
# "cancelled", like a timeout. This reads the jobs of the run and tells the two apart, so scripts/native-gate.sh can say
# whether a part had no runner (or was cancelled before one picked it up: if nobody cancelled the run, re-queue the PR)
# or failed on a runner (a build or test failure). The two languages' tests are one matrix job, whose needs result is the aggregate of both, so their own results are read too.
#
#   ios-parts.sh <build> <tests>     (CI)
#       the needs.<job>.result of "iOS build" and of the matrix "iOS tests". Prints one part per line for
#       native-gate.sh, `iOS build=<result>`, `iOS tests (nl)=<result>` and `iOS tests (en)=<result>`:
#         build   the result it was given, except that cancelled becomes unacquired when the run's jobs show the build was
#                 cancelled with no runner and no step
#         tests   success for both when the aggregate was success; otherwise each language's own job: unacquired when it
#                 was cancelled with no runner and no step, else its conclusion; the aggregate when the job is not in
#                 the list (a matrix that never started is not listed under its language)
#       A part is turned into unacquired or into the conclusion of its own job, so this can only name a failure, never turn
#       one into a pass: the jobs of the run are read only when the build was cancelled or the tests did not succeed.
#       They come from the GitHub API (GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT; the job needs
#       `actions: read`). When they can't be read it says so on stderr, still exits 0 and prints the bare results
#       as given, `<build>` and `<tests>`, without labels: native-gate.sh then prints only its summary line and makes no
#       claim about a runner (the plain message of before #413).
#
#   ios-parts.sh job <name> <result>     (Release, #437)
#       one job of the run: <name> is its name ("iOS tests", "iOS release") and <result> its needs.<job>.result. Prints
#       `<name>=unacquired` when the result is cancelled and the run's jobs show that job was cancelled with no runner
#       and no step, else `<name>=<result>`. The jobs are read only when the result is cancelled; any other result is
#       printed as given. When they can't be read it says so on stderr, still exits 0 and prints the bare <result>,
#       without a label. Release's `runners` job uses it and hands the parts to `release.sh runners`.
#       Only exactly three arguments with `job` first take this form; `ios-parts.sh job x` is the CI form.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

[ $# -eq 2 ] || { [ $# -eq 3 ] && [ "$1" = job ]; } || usage_of "$0"
need_cmd jq

# The jobs of this run and attempt, from the GitHub API.
read_jobs() {
  gh api "repos/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}/attempts/${GITHUB_RUN_ATTEMPT:-1}/jobs?per_page=100" 2>/dev/null
}

# jq definitions shared by both forms. A job no hosted runner picked up: cancelled, with no runner and not one step.
# shellcheck disable=SC2016 # jq code, not shell
JQ_DEFS='
  def unacquired: .conclusion == "cancelled" and ((.runner_name // "") == "") and ((.steps // []) | length) == 0;
  def job($name): [.jobs[] | select(.name == $name)] | first;
'

if [ $# -eq 3 ] && [ "$1" = job ]; then
  name="$2" result="$3"
  if [ "$result" != cancelled ]; then
    echo "$name=$result"
    exit 0
  fi
  if ! jobs_json="$(read_jobs)" \
    || ! label="$(jq -r --arg name "$name" "$JQ_DEFS"'
         job($name) as $job | if $job != null and ($job | unacquired) then "unacquired" else "cancelled" end
       ' <<<"$jobs_json" 2>/dev/null)"; then
    echo "could not read the run's jobs; $name is reported as its result says (a cancelled one stays cancelled)." >&2
    echo "$result"
    exit 0
  fi
  if [ "$label" = unacquired ]; then
    echo "$name: no hosted runner picked it up, or the run was cancelled before one did (cancelled, no runner, no step)." >&2
  fi
  echo "$name=$label"
  exit 0
fi

build="$1" tests="$2"

if [ "$build" != cancelled ] && [ "$tests" = success ]; then
  printf '%s\n' "iOS build=$build" "iOS tests (nl)=success" "iOS tests (en)=success"
  exit 0
fi

# The results as given, when the jobs can't be read.
as_given() {
  echo "could not read the run's jobs; the parts are reported as the jobs' results say (a cancelled one stays cancelled)." >&2
  printf '%s\n' "$build" "$tests"
  exit 0
}

jobs_json="$(read_jobs)" || as_given
parts="$(jq -r --arg build "$build" --arg tests "$tests" "$JQ_DEFS"'
  def tests($name):
    job($name) as $job
    | if $tests == "success" or $job == null then $tests
      elif $job | unacquired then "unacquired"
      else ($job.conclusion // $tests) end;
  (if $build == "cancelled" and (job("iOS build") | . != null and unacquired) then "unacquired" else $build end) as $b
  | "iOS build=\($b)", "iOS tests (nl)=\(tests("iOS tests (nl)"))", "iOS tests (en)=\(tests("iOS tests (en)"))"
' <<<"$jobs_json" 2>/dev/null)" || as_given

while IFS='=' read -r name result; do
  if [ "$result" = unacquired ]; then
    echo "$name: no hosted runner picked it up, or the run was cancelled before one did (cancelled, no runner, no step)." >&2
  fi
done <<<"$parts"
echo "$parts"
