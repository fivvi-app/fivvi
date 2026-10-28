#!/usr/bin/env bash
# shellcheck disable=SC2317,SC2329 # check() calls the check functions by name (code differs per shellcheck version)
# The checks pr.sh runs before every push. Run from the main checkout or any worktree.
#
#   check.sh          what the change can affect (#293, ADR-024): the hygiene checks always; lint, types, unit tests,
#                     static checks and build for the packages the branch changed and the packages that depend on them;
#                     the integration tests of those that have them; the web e2e tests when the web app or a package it
#                     depends on is affected; shellcheck and the root script tests when scripts, hooks or other
#                     non-package files changed. Markdown only: the hygiene checks. A change to the workspace setup
#                     (lockfile, root package.json, turbo.json, tsconfig.base.json, the shared test preset) affects
#                     everything. "Changed" is the branch since its merge base with origin/main plus the working tree.
#                     Every suite it leaves out is listed as "skipped (not affected)", with the reason.
#   check.sh --all    everything, whatever changed: hygiene, shellcheck, lint, types, unit tests, static checks, build,
#                     integration and e2e tests
#   check.sh --fast   skip the integration and e2e tests (combines with --all)
#
# At the end it prints a table of the tests each suite passed, failed and skipped and writes it as JSON to
# .work/check-summary.json (git-ignored, in this checkout). Quote that summary in reports; don't retype counts
# from the output (scripts/test-summary.sh). The decision is scripts/affected.mjs, which CI's "Detect changes" job runs too.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$ROOT/scripts/_shellcheck.sh"

FAST=false
ALL=false
for arg in "$@"; do
  case "$arg" in
    --fast) FAST=true ;;
    --all) ALL=true ;;
    *) usage_of "$0" ;;
  esac
done

cd "$ROOT"
# The pinned shellcheck (scripts/bootstrap.sh installs it) goes first on PATH, for this script and for turbo's lint:root.
use_pinned_shellcheck
warn_shellcheck_version
FAILED=0
SUMMARY_JSON="$ROOT/.work/check-summary.json"
# An early exit must not leave the summary of an earlier run behind.
rm -f "$SUMMARY_JSON"
# What every check printed, passed or failed: test-summary.sh reads the suites' counts from it.
LOG_DIR="$(mktemp -d)"
remove_log_dir() { rm -rf "$LOG_DIR"; }
on_exit remove_log_dir

# What a failed check shows. A turbo run is logged in full (the parser reads every task's counts), but only the output of
# the tasks that failed (named by "<package>#<task>:  ERROR") is shown, with turbo's footer; any other check shows all.
failure_output() {
  local prefixes
  prefixes="$(sed -nE 's/^([^[:space:]]+)#([^[:space:]]+):[[:space:]]+ERROR[[:space:]].*/\1:\2: /p' <<<"$1")"
  [ -n "$prefixes" ] || { printf '%s\n' "$1"; return; }
  awk 'NR == FNR { prefix[++n] = $0; next }
       footer || /^[^[:space:]]+#[^[:space:]]+:[[:space:]]+ERROR[[:space:]]/ { print; next }
       /^ *Tasks: / { footer = 1; print; next }
       { for (i = 1; i <= n; i++) if (index($0, prefix[i]) == 1) { print; break } }' <(printf '%s\n' "$prefixes") <(printf '%s\n' "$1")
}

check() {
  local name="$1" out rc=0
  shift
  out="$("$@" 2>&1)" || rc=$?
  printf '%s\n' "$out" >>"$LOG_DIR/output.log"
  if [ "$rc" = 0 ]; then
    echo "✓ $name"
  else
    echo "✗ $name"
    [ -z "$out" ] || { out="$(failure_output "$out")"; printf '    %s\n' "${out//$'\n'/$'\n'    }"; }
    FAILED=1
  fi
}

shell_files() { ls scripts/*.sh .githooks/*; }

syntax() {
  local f rc=0
  for f in $(shell_files); do bash -n "$f" || rc=1; done
  return "$rc"
}

shellcheck_all() {
  command -v shellcheck >/dev/null || { echo "shellcheck not found — run scripts/bootstrap.sh"; return 1; }
  # shellcheck disable=SC2046 # file names have no spaces
  shellcheck -x $(shell_files)
}

commit_messages() {
  local subject rc=0
  while IFS= read -r subject; do
    case "$subject" in Merge\ *|fixup!\ *|squash!\ *|amend!\ *|Revert\ *) continue ;; esac
    is_conventional "$subject" || { echo "not a Conventional Commit: $subject"; rc=1; }
  done < <(git log "origin/$(default_branch)..HEAD" --format=%s)
  return "$rc"
}

# Vendored skills are checked against upstream instead.
doc_links() {
  local file target rc=0
  while IFS= read -r file; do
    while IFS= read -r target; do
      target="${target%%#*}"
      [ -z "$target" ] || [ -e "$(dirname "$file")/$target" ] || { echo "$file: broken link $target"; rc=1; }
    done < <(grep -oE '\]\([^)[:space:]]+\)' "$file" | sed -E 's/^\]\((.*)\)$/\1/' | grep -vE '^[a-z]+:|^#|^<' || true)
  done < <(git ls-files '*.md' | while IFS= read -r f; do d="${f%/*}"; [ -f "$d/.upstream" ] || echo "$f"; done)
  return "$rc"
}

# The paths this branch changed: its commits since the merge base with origin/main, and the working tree (staged,
# unstaged and new files). --no-renames: a moved file is listed at the path it left too, so the package it left counts.
changed_paths() {
  git diff --no-renames --name-only "origin/$(default_branch)...HEAD"
  git diff --no-renames --name-only HEAD
  git ls-files --others --exclude-standard
}

# What the change can affect (scripts/affected.mjs, the decision CI's "Detect changes" job also uses), as JSON; the
# reasons it prints go to the output as the skips are reported.
PLAN_REASONS="$LOG_DIR/plan-reasons.txt"
PLAN_ARGS=(--json)
! $ALL || PLAN_ARGS+=(--all)
PLAN="$(changed_paths | sort -u | node "$ROOT/scripts/affected.mjs" "${PLAN_ARGS[@]}" 2>"$PLAN_REASONS")" \
  || { cat "$PLAN_REASONS"; echo "✗ scripts/affected.mjs failed"; exit 1; }
# The plan must be what affected.mjs prints (all, root, docs, e2e flags; packages, integration lists): anything else, an
# empty output or a script that changed shape, must stop the run and not quietly run only the hygiene checks.
jq -e 'type == "object" and ([.all, .root, .docs, .e2e] | all(type == "boolean")) and ([.packages, .integration] | all(type == "array"))' \
  <<<"$PLAN" >/dev/null 2>&1 \
  || { cat "$PLAN_REASONS"; echo "✗ scripts/affected.mjs printed no valid plan: ${PLAN:-nothing}"; exit 1; }
plan_flag() { jq -r ".$1" <<<"$PLAN"; }
plan_names() { jq -r ".$1[]" <<<"$PLAN"; }
plan_has() { jq -e --arg name "$2" ".$1 | index(\$name)" <<<"$PLAN" >/dev/null; }
# True when the whole workspace is affected (--all, or the workspace setup changed).
everything() { [ "$(plan_flag all)" = true ]; }

skipped() { echo "- $1: skipped (not affected)${2:+: $2}"; }

# The contract check regenerates the Swift and Kotlin clients (Swift toolchain, Java 17+). Only an API change can make
# them drift, so it runs only when this branch touches packages/api or packages/contract; CI runs it unless turbo has a cached result.
API_PATHS='^packages/(api|contract)/'
touches_api() {
  grep -E "$API_PATHS" <<<"$(changed_paths)" >/dev/null
}

# The package filters of a turbo run, for the affected packages; $1 can drop the contract package.
package_filters() {
  local name
  while IFS= read -r name; do
    { [ "$1" != without-contract ] || [ "$name" != @fivvi/contract ]; } && printf '%s\n' "--filter=$name"
  done < <(plan_names packages)
  return 0
}

turbo_checks() {
  local filters=() contract=without-contract line
  ! touches_api || contract=with-contract
  if everything; then
    local excluded=--filter=!@fivvi/contract
    [ "$contract" = without-contract ] || excluded=""
    pnpm turbo run lint typecheck test format:check build --output-logs=full \
      && pnpm turbo run check ${excluded:+"$excluded"} --output-logs=errors-only
    return
  fi
  while IFS= read -r line; do [ -z "$line" ] || filters+=("$line"); done < <(package_filters with-contract)
  if [ "${#filters[@]}" -gt 0 ]; then
    pnpm turbo run lint typecheck test format:check build "${filters[@]}" --output-logs=full || return 1
    filters=()
    while IFS= read -r line; do [ -z "$line" ] || filters+=("$line"); done < <(package_filters "$contract")
    [ "${#filters[@]}" -eq 0 ] || pnpm turbo run check "${filters[@]}" --output-logs=errors-only
  else
    # Only root files changed: the root tasks, whose cache keys are their own inputs.
    pnpm turbo run //#lint:root //#test:root //#format:check:root --output-logs=full
  fi
}

# Local Postgres for the integration tests and the e2e servers' databases (apps/web/e2e/serve.ts).
local_postgres() {
  docker info >/dev/null 2>&1 || { echo "Docker is not running — start it (Postgres for integration and e2e tests)"; return 1; }
  [ -f packages/database/.env ] || cp packages/database/.env.example packages/database/.env
  pnpm db:up >/dev/null
}

test_database_url() { sed -n 's/^DATABASE_URL=//p' packages/database/.env; }

integration_tests() {
  local filters=() name
  if ! everything; then
    while IFS= read -r name; do filters+=("--filter=$name"); done < <(plan_names integration)
  fi
  local_postgres || return 1
  TEST_DATABASE_URL="$(test_database_url)" pnpm turbo run test:integration ${filters[@]+"${filters[@]}"} --output-logs=full
}

e2e_tests() {
  local_postgres || return 1
  TEST_DATABASE_URL="$(test_database_url)" E2E_PORT="$(e2e_port "$ROOT")" \
    pnpm turbo run test:e2e --output-logs=full
}

api_prerequisites() {
  local missing=""
  java_ok || use_brew_java || missing="$missing java(17+)"
  command -v swift >/dev/null || missing="$missing swift"
  [ -z "$missing" ] || { echo "missing:$missing — run scripts/bootstrap.sh --api"; return 1; }
}

if [ ! -d node_modules ]; then
  echo "✗ workspace: no node_modules — run scripts/bootstrap.sh"
  exit 1
fi
# The cheap hygiene checks always run.
check "vendored skills" "$ROOT/scripts/skills.sh" check
check "agent definitions" "$ROOT/scripts/agents.sh" check
check "commit messages" commit_messages
check "commit emails" "$ROOT/scripts/emails.sh" commits
check "file emails" "$ROOT/scripts/emails.sh" files
check "file secrets" "$ROOT/scripts/secrets.sh" files
check "secrets in tests" node "$ROOT/scripts/secrets-in-tests.mjs"
check "doc links" doc_links
if [ "$(plan_flag root)" = true ]; then
  check "shell syntax" syntax
  check "shellcheck" shellcheck_all
else
  skipped "shell syntax, shellcheck" "no script or hook change"
fi

if everything || [ "$(plan_names packages | wc -l)" -gt 0 ] || [ "$(plan_flag root)" = true ]; then
  if touches_api; then
    java_ok || use_brew_java || true
    check "API tools for the contract check" api_prerequisites
    check "lint, types, unit tests, static checks (with the contract), build" turbo_checks
  else
    check "lint, types, unit tests, static checks, build (no API change: contract check left to CI)" turbo_checks
  fi
else
  skipped "lint, types, unit tests, static checks, build" "no package or script change"
fi

RAN_INTEGRATION=false
RAN_E2E=false
if $FAST; then
  echo "- integration and e2e tests: skipped (--fast)"
elif everything || [ "$(plan_names integration | wc -l)" -gt 0 ]; then
  RAN_INTEGRATION=true
  check "integration tests" integration_tests
else
  skipped "integration tests" "no package with integration tests is affected"
fi
if ! $FAST; then
  if [ "$(plan_flag e2e)" = true ]; then
    RAN_E2E=true
    check "e2e tests (port $(e2e_port "$ROOT"))" e2e_tests
  else
    skipped "e2e tests" "no web change"
  fi
fi

# The suites of the workspace that turbo runs tests for: the root and every package with a test script, as
# "<package>:<task>" lines. One an affected run expected but that left no output (turbo stops after the first failure) is
# listed as not-run; one the change does not affect, as "skipped (not affected)".
all_suites() {
  local file
  echo "//:test:root"
  for file in apps/*/package.json packages/*/package.json; do
    [ -f "$file" ] || continue
    jq -r '.name as $name | (.scripts // {}) | keys[] | select(. == "test" or . == "test:integration" or . == "test:e2e") | "\($name):\(.)"' "$file"
  done
}

# Whether the change affects suite $1 ("<package>:<task>").
suite_affected() {
  local package="${1%%:test*}" task="test${1#*:test}"
  case "$1" in
    //:test:root) [ "$(plan_flag root)" = true ] || everything || [ -n "$(plan_names packages)" ]; return ;;
  esac
  case "$task" in
    test) everything || plan_has packages "$package" ;;
    test:integration) $RAN_INTEGRATION && { everything || plan_has integration "$package"; } ;;
    test:e2e) $RAN_E2E ;;
  esac
}

# The suites' counts, after the checks so that a failed run shows them too.
RAN_UNIT=false
if everything || [ -n "$(plan_names packages)" ] || [ "$(plan_flag root)" = true ]; then RAN_UNIT=true; fi
test_kinds=()
! $RAN_UNIT || test_kinds+=(--run unit)
for kind in integration e2e; do
  if $FAST; then test_kinds+=(--skip "$kind"); fi
done
$FAST || ! $RAN_INTEGRATION || test_kinds+=(--run integration)
$FAST || ! $RAN_E2E || test_kinds+=(--run e2e)
while IFS= read -r suite; do
  if suite_affected "$suite"; then test_kinds+=(--expect "$suite"); else test_kinds+=(--unaffected "$suite"); fi
done < <(all_suites)
echo
"$ROOT/scripts/test-summary.sh" --json "$SUMMARY_JSON" "${test_kinds[@]}" "$LOG_DIR/output.log" \
  || { echo "✗ test summary"; FAILED=1; }

exit "$FAILED"
