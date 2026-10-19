#!/usr/bin/env bash
# The test counts of a check run, from the logs turbo printed (E002 #112): a table on stdout and, with --json, a file.
# check.sh calls it at the end, so a builder quotes the numbers instead of retyping them from long output.
#
#   test-summary.sh [--json FILE] [--run KIND]... [--skip KIND]... LOG...
#       reads the suites' counts from the LOGs (root tests, each package's unit, integration and e2e tests). Prints
#       a table of passed, failed and skipped tests per suite and writes the same as JSON to FILE.
#       --run KIND   the KIND (unit, integration or e2e) was run; with no counts in the logs it is listed as no-results
#       --skip KIND  the KIND was left out of this run (check.sh --fast); it is listed as skipped
#       --expect SUITE  the workspace has this suite ("@trainer-hub/ui:test"); with no output in the logs it is listed
#                       as not-run, e.g. when turbo stopped after another task failed
#       Suite status: pass, fail, skipped, not-run or no-results. See test-summary.jq for the log format it reads.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
need_cmd jq

JSON=""
RUN='[]'
SKIP='[]'
EXPECT='[]'
while [ $# -gt 0 ]; do
  case "$1" in
    --json) [ $# -ge 2 ] || usage_of "$0"; JSON="$2"; shift 2 ;;
    --run) [ $# -ge 2 ] || usage_of "$0"; RUN="$(jq -c --arg k "$2" '. + [$k]' <<<"$RUN")"; shift 2 ;;
    --skip) [ $# -ge 2 ] || usage_of "$0"; SKIP="$(jq -c --arg k "$2" '. + [$k]' <<<"$SKIP")"; shift 2 ;;
    --expect) [ $# -ge 2 ] || usage_of "$0"; EXPECT="$(jq -c --arg k "$2" '. + [$k]' <<<"$EXPECT")"; shift 2 ;;
    -*) usage_of "$0" ;;
    *) break ;;
  esac
done
[ $# -gt 0 ] || usage_of "$0"

summary_json="$(cat "$@" | jq -R -s --argjson run "$RUN" --argjson skip "$SKIP" --argjson expect "$EXPECT" -f "$(dirname "${BASH_SOURCE[0]}")/test-summary.jq")" \
  || die "could not read the test counts"

if [ -n "$JSON" ]; then
  mkdir -p "$(dirname "$JSON")"
  printf '%s\n' "$summary_json" >"$JSON"
fi

jq -r '
  def count: if . == null then "-" else tostring end;
  (.suites[] | [.name, .status, (.passed | count), (.failed | count), (.skipped | count)] | @tsv),
  (["total", "", (.total.passed | tostring), (.total.failed | tostring), (.total.skipped | tostring)] | @tsv)' <<<"$summary_json" \
  | awk -F'\t' 'BEGIN { printf "%-34s %-10s %7s %7s %7s\n", "tests", "status", "passed", "failed", "skipped" }
                { printf "%-34s %-10s %7s %7s %7s\n", $1, $2, $3, $4, $5 }'
[ -z "$JSON" ] || echo "(also in ${JSON#"$ROOT"/})"
