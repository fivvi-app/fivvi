#!/usr/bin/env bash
# What became of the iOS jobs, for CI's gate "iOS" (#413) and for Release's last job (#437). GitHub's hosted macOS arm64 runners are short of capacity at
# times: a job that no runner picks up is cancelled after about 15 minutes with an empty runner_name and no step ("The
# job was not acquired by Runner of type hosted even after multiple attempts"), and `needs.<job>.result` says only
# "cancelled", like a timeout, or, since GitHub reports it so (#1268), "abandoned", which means by itself that no runner took the
# job. This reads the jobs of the run and tells the two apart, so scripts/native-gate.sh can say
# whether a part had no runner (or was cancelled before one picked it up: if nobody cancelled the run, re-queue the PR)
# or failed on a runner (a build or test failure). The two languages' tests are one matrix job, whose needs result is the aggregate of both, so their own results are read too.
#
#   ios-parts.sh <build> <tests> [<retry>]     (CI)
#       the needs.<job>.result of "iOS build", of the matrix "iOS tests" and, optionally, of "iOS build (retry)", the job
#       ci.yml runs once when "iOS build" was abandoned (#1268). Prints one part per line for
#       native-gate.sh, `iOS build=<result>`, `iOS tests (nl)=<result>` and `iOS tests (en)=<result>`:
#         build   the result it was given (labelled `iOS build (retry)` when the retry ran and did not succeed, so the gate says
#                 it was the retry), except that abandoned becomes unacquired, and cancelled becomes unacquired when
#                 the run's jobs show the build was cancelled with no runner and no step. When the retry ran (a result
#                 other than skipped), the part is the retry's result, read the same way: success when the retry built
#                 it (the first try had no runner, which is said on stderr), else unacquired or the retry's own result.
#         tests   success for both when the aggregate was success; otherwise each language's own job: unacquired when it
#                 was cancelled with no runner and no step (or the aggregate is abandoned and the job is not listed),
#                 else its conclusion; the aggregate when the job is not in
#                 the list (a matrix that never started is not listed under its language)
#         a language whose retry ran ("iOS tests (nl) (retry)", #1268) takes its part from the retry, read the same way
#       A part is turned into unacquired or into the conclusion of its own job, so this can only name a failure, never turn
#       one into a pass: the jobs of the run are read only when the build was cancelled or the tests did not succeed.
#       They come from the GitHub API (GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT; the job needs
#       `actions: read`). When they can't be read it says so on stderr, still exits 0 and prints the bare results
#       as given, `<build>` and `<tests>`, without labels: native-gate.sh then prints only its summary line and makes no
#       claim about a runner (the plain message of before #413).
#
#   ios-parts.sh retry-locales <tests>     (CI, #1268)
#       what ci.yml's job "iOS tests (retry plan)" runs: the languages of the tests that got no hosted runner (their job was
#       cancelled with no runner and no step), as a compact JSON array, `["nl"]`, `["nl","en"]` or `[]`, for the matrix of
#       "iOS tests (<locale>) (retry)". <tests> is the aggregate needs.ios-tests.result; the jobs are read only when it is
#       not success or skipped. A language that ran and failed or timed out is never listed. When the jobs can't be read it
#       says so on stderr, still exits 0 and prints `[]` (no retry: the gate then fails as it would have).
#
#   ios-parts.sh job <name> <result>     (Release, #437)
#       one job of the run: <name> is its name ("iOS tests", "iOS release") and <result> its needs.<job>.result. Prints
#       `<name>=unacquired` when the result is abandoned, or cancelled and the run's jobs show that job was cancelled with
#       no runner and no step, else `<name>=<result>`. The jobs are read only when the result is cancelled; any other
#       result is printed as given. When they can't be read it says so on stderr, still exits 0 and prints the bare <result>,
#       without a label. Release's `runners` job uses it and hands the parts to `release.sh runners`.
#       `job` as the first argument with any number of arguments but three is refused, not read as the CI form.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

if [ "${1:-}" = job ]; then
  [ $# -eq 3 ] || usage_of "$0"
elif [ "${1:-}" = retry-locales ]; then
  [ $# -eq 2 ] || usage_of "$0"
else
  [ $# -eq 2 ] || [ $# -eq 3 ] || usage_of "$0"
fi
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
  if [ "$result" = abandoned ]; then
    echo "$name: no hosted runner picked it up (abandoned)." >&2
    echo "$name=unacquired"
    exit 0
  fi
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

if [ "$1" = retry-locales ]; then
  if [ "$2" = success ] || [ "$2" = skipped ]; then
    echo '[]'
    exit 0
  fi
  if ! jobs_json="$(read_jobs)" \
    || ! locales="$(jq -c "$JQ_DEFS"'
         [("nl", "en") as $l | select(job("iOS tests (\($l))") | . != null and unacquired) | $l]
       ' <<<"$jobs_json" 2>/dev/null)"; then
    echo "could not read the run's jobs; no test pass is retried." >&2
    echo '[]'
    exit 0
  fi
  echo "$locales"
  exit 0
fi

build="$1" tests="$2" retry="${3:-skipped}"

# The build part: the retry's result when the retry ran (it runs only when the first try was abandoned), else the first
# try's. abandoned is unacquired by itself; cancelled needs the run's jobs to be told from a timeout. A retry that
# built it is reported as "iOS build" (nothing to name); one that did not keeps "(retry)" in its label, so the gate's
# error says it was the retry.
bname="iOS build" bres="$build" blabel="iOS build"
[ "$bres" != abandoned ] || bres=unacquired
if [ "$retry" != skipped ]; then
  bname="iOS build (retry)" bres="$retry"
  [ "$bres" != abandoned ] || bres=unacquired
  if [ "$bres" = success ]; then
    echo "iOS build: no hosted runner picked up the first try; the retry ran and built it." >&2
  else
    blabel="$bname"
    [ "$bres" != unacquired ] || echo "iOS build: no hosted runner picked it up after the retry either." >&2
  fi
fi

if [ "$bres" != cancelled ] && [ "$tests" = success ]; then
  printf '%s\n' "$blabel=$bres" "iOS tests (nl)=success" "iOS tests (en)=success"
  exit 0
fi

# The results as given, when the jobs can't be read.
as_given() {
  echo "could not read the run's jobs; the parts are reported as the jobs' results say (a cancelled one stays cancelled)." >&2
  printf '%s\n' "$bres" "$tests"
  exit 0
}

jobs_json="$(read_jobs)" || as_given
# A language takes its part from its retry job, "iOS tests (<locale>) (retry)", when that ran (it is skipped, or not in
# the list, when no language needed one), else from its own job.
parts="$(jq -r --arg bname "$bname" --arg blabel "$blabel" --arg build "$bres" --arg tests "$tests" "$JQ_DEFS"'
  def tests($name):
    job($name) as $job
    | if $tests == "success" or $job == null then (if $tests == "abandoned" then "unacquired" else $tests end)
      elif $job | unacquired then "unacquired"
      else ($job.conclusion // $tests) end;
  def part($name):
    job($name + " (retry)") as $retry
    | if $retry != null and $retry.conclusion != "skipped" then
        "\($name) (retry)=\(if $retry | unacquired then "unacquired" else ($retry.conclusion // "cancelled") end)"
      else "\($name)=\(tests($name))" end;
  (if $build == "cancelled" and (job($bname) | . != null and unacquired) then "unacquired" else $build end) as $b
  | "\($blabel)=\($b)", part("iOS tests (nl)"), part("iOS tests (en)")
' <<<"$jobs_json" 2>/dev/null)" || as_given

# A retry that passed is the language's part, named as the language; one that did not keeps its name.
out=""
while IFS='=' read -r name result; do
  case "$name=$result" in
    "iOS tests ("*") (retry)=success")
      name="${name% (retry)}"
      echo "$name: no hosted runner picked up the first try; the retry ran." >&2
      ;;
    "iOS tests ("*") (retry)="unacquired)
      echo "$name: no hosted runner picked it up after the retry either." >&2
      ;;
  esac
  if [ "$result" = unacquired ]; then
    echo "$name: no hosted runner picked it up, or the run was cancelled before one did (cancelled, no runner, no step)." >&2
  fi
  out+="$name=$result"$'\n'
done <<<"$parts"
printf '%s' "$out"
