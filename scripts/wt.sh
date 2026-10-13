#!/usr/bin/env bash
# Git worktrees for this repo. New worktrees go to .worktrees/<branch with / as ->.
#
#   wt.sh add  <branch> [base]   create a worktree: the existing branch, or a new one from base (default origin/main);
#                                installs dependencies and creates packages/database/.env
#   wt.sh rm   <branch>          remove the branch's worktree (the branch is kept)
#   wt.sh list                   list worktrees
#   wt.sh done <branch> [--check]  after its PR is merged: remove worktree and branches, update main
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

cmd_add() {
  [ $# -ge 1 ] && [ $# -le 2 ] || usage
  local branch="$1" dest existing
  is_branch_name "$branch" || die "branch '$branch' must be <type>/<issue>-<slug> or <type>/<slug>; type is one of: $BRANCH_TYPES"
  existing="$(worktree_of "$branch")"
  [ -z "$existing" ] || die "'$branch' is already checked out in $existing"
  dest="$(new_worktree_path "$branch")"
  [ ! -e "$dest" ] || die "${dest#"$MAIN_ROOT"/} already exists"

  git -C "$MAIN_ROOT" fetch --prune --quiet
  mkdir -p "$WORKTREES_DIR"
  if git -C "$MAIN_ROOT" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$MAIN_ROOT" worktree add --quiet "$dest" "$branch"
  elif git -C "$MAIN_ROOT" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    git -C "$MAIN_ROOT" worktree add --quiet --track -b "$branch" "$dest" "origin/$branch"
  else
    git -C "$MAIN_ROOT" worktree add --quiet --no-track -b "$branch" "$dest" "${2:-origin/$(default_branch)}"
  fi

  if [ -f "$dest/packages/database/.env.example" ] && [ ! -f "$dest/packages/database/.env" ]; then
    cp "$dest/packages/database/.env.example" "$dest/packages/database/.env"
  fi
  (cd "$dest" && pnpm install --frozen-lockfile --silent) \
    || die "worktree created, but pnpm install failed — run scripts/bootstrap.sh, then pnpm install in ${dest#"$MAIN_ROOT"/}"

  echo "✅ worktree ready: ${dest#"$MAIN_ROOT"/} (E2E_PORT $(e2e_port "$dest"))"
}

cmd_rm() {
  [ $# -eq 1 ] || usage
  local wt
  wt="$(worktree_of "$1")"
  [ -n "$wt" ] || die "no worktree has '$1' checked out"
  [ "$wt" != "$MAIN_ROOT" ] || die "'$1' is checked out in the main checkout, not in a worktree"
  git -C "$MAIN_ROOT" worktree remove "$wt"
  echo "🗑  removed ${wt#"$MAIN_ROOT"/} (branch '$1' kept)"
}

cmd_done() {
  [ $# -eq 1 ] || { [ $# -eq 2 ] && [ "$2" = --check ]; } || usage
  local branch="$1" check="${2:-}" pr state pr_head head wt default
  read -r pr state pr_head < <(gh pr list --repo "$(repo_slug)" --head "$branch" --state all \
    --json number,state,headRefOid --jq 'sort_by(.number) | last // empty | "\(.number) \(.state) \(.headRefOid)"') || true
  [ -n "${pr:-}" ] || die "no PR found for '$branch'"
  [ "$state" = MERGED ] || die "PR #$pr is $state, not merged"

  head="$(git -C "$MAIN_ROOT" rev-parse --verify --quiet "refs/heads/$branch" || true)"
  if [ -n "$head" ] && [ "$head" != "$pr_head" ]; then
    # The PR head may be ahead (GitHub's "Update branch" or a committed suggestion); that's fine, local extras are not.
    git -C "$MAIN_ROOT" cat-file -e "$pr_head^{commit}" 2>/dev/null \
      || git -C "$MAIN_ROOT" fetch --quiet origin "pull/$pr/head" 2>/dev/null || true
    git -C "$MAIN_ROOT" merge-base --is-ancestor "$head" "$pr_head" 2>/dev/null \
      || die "local '$branch' has commits that are not in PR #$pr"
  fi
  wt="$(worktree_of "$branch")"
  [ -z "$wt" ] || [ "$wt" = "$MAIN_ROOT" ] || [ -z "$(git -C "$wt" status --porcelain)" ] \
    || die "${wt#"$MAIN_ROOT"/} has uncommitted changes"
  [ -z "$check" ] || return 0

  [ -z "$wt" ] || [ "$wt" = "$MAIN_ROOT" ] || git -C "$MAIN_ROOT" worktree remove "$wt"
  default="$(default_branch)"
  git -C "$MAIN_ROOT" fetch --prune --quiet
  [ "$(git -C "$MAIN_ROOT" branch --show-current)" != "$branch" ] || git -C "$MAIN_ROOT" switch --quiet "$default"
  [ "$(git -C "$MAIN_ROOT" branch --show-current)" != "$default" ] || git -C "$MAIN_ROOT" merge --ff-only --quiet "origin/$default"
  [ -z "$head" ] || git -C "$MAIN_ROOT" branch --quiet -D "$branch"
  if git -C "$MAIN_ROOT" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    git -C "$MAIN_ROOT" push --quiet origin --delete "$branch"
  fi
  git -C "$MAIN_ROOT" worktree prune

  echo "✅ PR #$pr merged — removed '$branch'"
}

cmd_list() {
  [ $# -eq 0 ] || usage
  git -C "$MAIN_ROOT" worktree list | sed "s|$MAIN_ROOT/||"
}

case "${1:-}" in
  add)  shift; cmd_add "$@" ;;
  rm)   shift; cmd_rm "$@" ;;
  list) shift; cmd_list "$@" ;;
  done) shift; cmd_done "$@" ;;
  *)    usage ;;
esac
