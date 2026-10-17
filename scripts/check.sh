#!/usr/bin/env bash
# shellcheck disable=SC2317,SC2329 # check() calls the check functions by name (code differs per shellcheck version)
# The checks pr.sh runs before every push. Run from the main checkout or any worktree.
#
#   check.sh          everything: hygiene, lint, types, unit tests, static checks, build, integration and e2e tests
#   check.sh --fast   skip the integration and e2e tests
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

FAST=false
case "${1:-}" in
  --fast) FAST=true ;;
  "") ;;
  *) usage_of "$0" ;;
esac

cd "$ROOT"
FAILED=0

check() {
  local name="$1" out
  shift
  if out="$("$@" 2>&1)"; then
    echo "✓ $name"
  else
    echo "✗ $name"
    [ -z "$out" ] || printf '    %s\n' "${out//$'\n'/$'\n'    }"
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

# The contract check regenerates the Swift and Kotlin clients (Swift toolchain, Java 17+). Only an API change can make
# them drift, so it runs only when this branch touches packages/api or packages/contract; CI runs it unless turbo has a cached result.
API_PATHS='^packages/(api|contract)/'
touches_api() {
  local files
  files="$(git diff --name-only "origin/$(default_branch)...HEAD"; git status --porcelain | cut -c4-)"
  grep -E "$API_PATHS" <<<"$files" >/dev/null
}

turbo_checks() {
  local contract=--filter=!@trainer-hub/contract
  ! touches_api || contract=""
  pnpm turbo run lint typecheck test format:check build --output-logs=errors-only \
    && pnpm turbo run check ${contract:+"$contract"} --output-logs=errors-only
}

# Local Postgres for the integration tests and the e2e servers' databases (apps/web/e2e/serve.ts).
local_postgres() {
  docker info >/dev/null 2>&1 || { echo "Docker is not running — start it (Postgres for integration and e2e tests)"; return 1; }
  [ -f packages/database/.env ] || cp packages/database/.env.example packages/database/.env
  pnpm db:up >/dev/null
}

test_database_url() { sed -n 's/^DATABASE_URL=//p' packages/database/.env; }

integration_tests() {
  local_postgres || return 1
  TEST_DATABASE_URL="$(test_database_url)" pnpm turbo run test:integration --output-logs=errors-only
}

e2e_tests() {
  local_postgres || return 1
  TEST_DATABASE_URL="$(test_database_url)" E2E_PORT="$(e2e_port "$ROOT")" \
    pnpm turbo run test:e2e --output-logs=errors-only
}

api_prerequisites() {
  local missing=""
  java_ok || use_brew_java || missing="$missing java(17+)"
  command -v swift >/dev/null || missing="$missing swift"
  [ -z "$missing" ] || { echo "missing:$missing — run scripts/bootstrap.sh --api"; return 1; }
}

check "shell syntax" syntax
check "shellcheck" shellcheck_all
check "vendored skills" "$ROOT/scripts/skills.sh" check
check "commit messages" commit_messages
check "doc links" doc_links
if [ ! -d node_modules ]; then
  echo "✗ workspace: no node_modules — run scripts/bootstrap.sh"
  exit 1
fi
if touches_api; then
  java_ok || use_brew_java || true
  check "API tools for the contract check" api_prerequisites
  check "lint, types, unit tests, static checks (with the contract), build" turbo_checks
else
  check "lint, types, unit tests, static checks, build (no API change: contract check left to CI)" turbo_checks
fi
if ! $FAST; then
  check "integration tests" integration_tests
  check "e2e tests (port $(e2e_port "$ROOT"))" e2e_tests
fi

exit "$FAILED"
