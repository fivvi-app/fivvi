#!/usr/bin/env bash
# shellcheck disable=SC2034 # variables here are used by the scripts that source this file
# Shared helpers for scripts/*.sh. Bash 3.2 compatible (macOS default).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
# Agent sessions run in worktrees; the main checkout holds the shared .worktrees/ and .work/ folders.
MAIN_ROOT="$(dirname "$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)")"
WORKTREES_DIR="$MAIN_ROOT/.worktrees"
NOTES_DIR="$MAIN_ROOT/.work"

# Branches: <type>/<issue>-<slug> for ticket work, <type>/<slug> without an issue (WORKFLOW.md §2).
BRANCH_TYPES="feature fix chore docs"
BRANCH_RE="^($(tr ' ' '|' <<<"$BRANCH_TYPES"))/([0-9]+-)?[a-z0-9][a-z0-9-]*$"
# Commits and PR squash titles: Conventional Commits, scope is the feature or enabler ID: feat(F031): …
COMMIT_TYPES="feat fix refactor chore docs build test revert perf ci style"
COMMIT_RE="^($(tr ' ' '|' <<<"$COMMIT_TYPES"))(\([A-Za-z0-9_-]+\))?!?: [^[:space:]]"

READY_LABEL="ready-for-agent"
HUMAN_LABEL="ready-for-human"
SPEC_LABEL="spec"
# The owner approved the spec: its tickets may be cut and built (ADR-016). A material change removes it.
APPROVED_LABEL="spec-approved"
# The PRs of this issue, or of every ticket of this spec, go to the owner to merge (ADR-016).
OWNER_MERGE_LABEL="owner-merge"

die() { echo "error: $*" >&2; exit 1; }

# Prints the comment block at the top of a script (after the shebang and any shellcheck directives) and exits.
usage_of() {
  awk 'NR == 1 || /^# shellcheck / { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$1" >&2
  exit 1
}

need_cmd() { command -v "$1" >/dev/null || die "$1 not found — run scripts/bootstrap.sh"; }

# Runs the command $1 once when the script ends: when it passes or fails, and on Ctrl-C (INT) or kill (TERM). A signal
# that arrives while the script is already exiting, or a second Ctrl-C, doesn't cut it short.
ON_EXIT=""
on_exit() {
  ON_EXIT="$1"
  trap run_on_exit EXIT
  trap 'run_on_exit; exit 130' INT
  trap 'run_on_exit; exit 143' TERM
}

run_on_exit() {
  local command="$ON_EXIT"
  ON_EXIT=""
  trap '' INT TERM
  eval "$command"
}

# Appends the lines in $@ to the job summary on GitHub Actions; does nothing elsewhere.
summary() {
  [ -z "${GITHUB_STEP_SUMMARY:-}" ] || printf '%s\n' "$@" >>"$GITHUB_STEP_SUMMARY"
  return 0
}

default_branch() {
  local ref
  ref="$(git -C "$MAIN_ROOT" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)" || ref="origin/main"
  echo "${ref#origin/}"
}

# owner/name of the GitHub repo, from the origin remote.
repo_slug() {
  git -C "$MAIN_ROOT" remote get-url origin | sed -E 's#^(git@github\.com:|https://([^@/]+@)?github\.com/)##; s#\.git$##'
}

# The worktree that has <branch> checked out (.worktrees/, an editor's own folder or the main checkout); empty if none.
worktree_of() {
  git -C "$MAIN_ROOT" worktree list --porcelain \
    | awk -v b="refs/heads/$1" '/^worktree / { path = substr($0, 10) } $0 == "branch " b { print path; exit }'
}

new_worktree_path() { echo "$WORKTREES_DIR/$(echo "$1" | tr '/' '-')"; }

branch_issue() { echo "$1" | sed -nE 's#^[a-z]+/([0-9]+)-.*#\1#p'; }
is_branch_name() { [[ "$1" =~ $BRANCH_RE ]]; }
is_conventional() { [[ "$1" =~ $COMMIT_RE ]] && [ "${#1}" -le 100 ]; }

# Commits carry only GitHub noreply addresses: <id>+<login>@users.noreply.github.com, or noreply@github.com (the web
# UI and Copilot). The guard is an allowlist, so no script or file has to name an address it forbids (emails.sh).
NOREPLY_HINT="git config --local user.email <id>+<login>@users.noreply.github.com"
is_noreply_email() {
  local email
  email="$(tr '[:upper:]' '[:lower:]' <<<"$1")"
  [[ "$email" =~ ^[^@[:space:]]+@users\.noreply\.github\.com$ ]] || [ "$email" = noreply@github.com ]
}

# The address in a git identity ("Name <address> 1700000000 +0100", as git var prints it), or on a trailer line.
ident_email() { sed -nE 's/^[^<]*<([^>]*)>.*$/\1/p' <<<"$1"; }

# The addresses of the Co-authored-by trailers in the commit message on stdin.
coauthor_emails() { sed -nE 's/^[[:space:]]*[Cc][Oo]-[Aa][Uu][Tt][Hh][Oo][Rr][Ee][Dd]-[Bb][Yy]:.*<([^>]*)>.*$/\1/p'; }

# A stable Playwright port per checkout, so parallel worktrees never test each other's server (AGENTS.md).
e2e_port() {
  local dir="${1:-$ROOT}"
  if [ "$dir" = "$MAIN_ROOT" ]; then echo 3100; return; fi
  echo $(( 3200 + $(printf '%s' "$dir" | cksum | cut -d' ' -f1) % 700 ))
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | LC_ALL=C sed -E 's/\[[^]]*\]//g; s/[^a-z0-9]+/-/g; s/^-+//' | cut -c1-40 | sed -E 's/-+$//'
}

java_ok() { command -v java >/dev/null && java -version >/dev/null 2>&1; }

# Homebrew's OpenJDK is keg-only; put it on PATH for this process when java isn't there yet.
use_brew_java() {
  local home
  command -v brew >/dev/null || return 1
  home="$(brew --prefix openjdk@21 2>/dev/null)" && [ -x "$home/bin/java" ] || return 1
  export PATH="$home/bin:$PATH" JAVA_HOME="$home"
  java_ok
}

read_body() {
  case "$1" in
    -) cat ;;
    *) cat "$1" ;;
  esac
}
