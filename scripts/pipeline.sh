#!/usr/bin/env bash
# The pipeline switch (ADR-034): .github/pipeline.json says how CI and the review run.
#
#   ci       fast    no UI tests on PRs and merge groups (unit-only native tests, no Maestro, no Playwright); the UI
#                    tests run in the nightly run of ci.yml
#            full    every UI test on every PR and merge group, as before ADR-034 (tag pipeline-full-2026-11-18)
#   review   split   the reviewer runs the standards axis on each low-risk PR, the spec axis once per merged slice and
#                    once per finished spec (docs/agents/build.md)
#            per-pr  both code-review axes on every PR, as before ADR-034
#
#   pipeline.sh get ci|review   prints the setting
#
# It fails closed: a missing file, a missing key or an unknown value is an error, never read as a default. Changing the
# file is an owner-only change (.github is core guardrails).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

FILE="${FIVVI_PIPELINE_FILE:-$ROOT/.github/pipeline.json}"

[ "${1:-}" = get ] && [ $# -eq 2 ] || usage
key="$2"
case "$key" in
  ci) allowed="fast full" ;;
  review) allowed="split per-pr" ;;
  *) die "unknown setting '$key' (ci or review)" ;;
esac

need_cmd jq
[ -f "$FILE" ] || die "no $FILE"
value="$(jq -er --arg k "$key" '.[$k] | strings' "$FILE" 2>/dev/null)" || die "$FILE has no '$key' setting"
case " $allowed " in
  *" $value "*) printf '%s\n' "$value" ;;
  *) die "$FILE: '$key' is '$value' (allowed: ${allowed// /, })" ;;
esac
