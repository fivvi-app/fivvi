#!/usr/bin/env bash
# The pipeline switch (ADR-034, ADR-035): .github/pipeline.json says how CI, the review and the factory run.
#
#   ci       lean    as `fast`, and the integration tests (test:integration) run in the nightly run and on demand only,
#                    not on PRs, merge groups and pushes (ADR-035); the merge queue still runs lint, types, unit tests,
#                    the static checks and the build
#            fast    no UI tests on PRs and merge groups (unit-only native tests, no Maestro, no Playwright); the UI
#                    tests run in the nightly run of ci.yml
#            full    every UI test on every PR and merge group, as before ADR-034 (tag pipeline-full-2026-11-18)
#   review   split   the reviewer runs the standards axis on each low-risk PR, the spec axis once per merged slice and
#                    once per finished spec (docs/agents/build.md)
#            per-pr  both code-review axes on every PR, as before ADR-034
#   builders N       a positive integer: the most builders (tickets or slices in flight) the factory runs at once.
#                    1 is one ticket at a time: the next starts after the previous PR merged (ADR-035); 4 is as before
#
#   pipeline.sh get ci|review|builders   prints the setting
#   pipeline.sh ui-tests --event <event>   prints true or false: whether a run of that GitHub event (github.event_name) runs
#                    the UI tests: true with `ci: full`, and with `ci: fast` or `lean` for schedule (the nightly run) and
#                    workflow_dispatch only. The one place that rule lives: CI (Detect changes and the Quarantine jobs) asks it.
#   pipeline.sh integration-tests --event <event>   prints true or false: whether a run of that event runs the integration
#                    tests: true with `ci: full` and `fast` on every event, and with `ci: lean` for schedule and
#                    workflow_dispatch only. CI (Detect changes) asks it; Checks (Linux) adds test:integration only when true.
#
# It fails closed: a missing file, a missing key or an unknown value is an error, never read as a default. Changing the
# file is an owner-only change (.github is core guardrails).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

FILE="${FIVVI_PIPELINE_FILE:-$ROOT/.github/pipeline.json}"

cmd_get() {
  local key="$1" allowed="" value
  case "$key" in
    ci) allowed="lean fast full" ;;
    review) allowed="split per-pr" ;;
    builders) ;;
    *) die "unknown setting '$key' (ci, review or builders)" ;;
  esac
  need_cmd jq
  [ -f "$FILE" ] || die "no $FILE"
  if [ "$key" = builders ]; then
    # A JSON number, printed as jq prints it: 1.5, 0, -1 and 1e+30 all fail the pattern below.
    value="$(jq -er '.builders | numbers | tostring' "$FILE" 2>/dev/null)" || die "$FILE has no 'builders' setting"
    [[ "$value" =~ ^[1-9][0-9]{0,5}$ ]] || die "$FILE: 'builders' is '$value' (allowed: a positive whole number, at most 999999)"
    printf '%s\n' "$value"
    return
  fi
  value="$(jq -er --arg k "$key" '.[$k] | strings' "$FILE" 2>/dev/null)" || die "$FILE has no '$key' setting"
  case " $allowed " in
    *" $value "*) printf '%s\n' "$value" ;;
    *) die "$FILE: '$key' is '$value' (allowed: ${allowed// /, })" ;;
  esac
}

cmd_ui_tests() {
  local event="$1" mode
  [ -n "$event" ] || usage
  mode="$(cmd_get ci)" || exit 1
  case "$mode:$event" in
    full:* | fast:schedule | fast:workflow_dispatch | lean:schedule | lean:workflow_dispatch) echo true ;;
    *) echo false ;;
  esac
}

cmd_integration_tests() {
  local event="$1" mode
  [ -n "$event" ] || usage
  mode="$(cmd_get ci)" || exit 1
  case "$mode:$event" in
    full:* | fast:* | lean:schedule | lean:workflow_dispatch) echo true ;;
    *) echo false ;;
  esac
}

case "${1:-}" in
  get) [ $# -eq 2 ] || usage; cmd_get "$2" ;;
  ui-tests) [ $# -eq 3 ] && [ "$2" = --event ] || usage; cmd_ui_tests "$3" ;;
  integration-tests) [ $# -eq 3 ] && [ "$2" = --event ] || usage; cmd_integration_tests "$3" ;;
  *) usage ;;
esac
