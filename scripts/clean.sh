#!/usr/bin/env bash
# Cleans up what finished work leaves behind (#668). Safe to run again; it never removes a worktree with uncommitted
# changes or with commits that are neither pushed nor merged: those are listed under "Left for you" with the reason.
#
#   clean.sh [--dry-run]    --dry-run prints what it would remove and removes nothing
#
# Removes:
#   - the worktrees of merged PRs, through `flow.sh finish <n>` (branch with an issue) or `wt.sh done <branch>`, so
#     their checks still apply, and the worktrees of closed PRs whose branch is pushed and clean, through `wt.sh rm`
#     (the branch stays); worktrees of open PRs and of branches without a PR stay
#   - folders in .worktrees/ that are not worktrees (after `git worktree prune`)
#   - `Fivvi <name>` simulators without their worktree, and `Fivvi parallel <pid>` simulators whose process is gone
#   - Xcode DerivedData folders whose WorkspacePath (info.plist) is inside this repository and no longer exists
#   - turbo cache entries (.turbo/cache of the main checkout) not used for 7 days; FIVVI_TURBO_CACHE_DAYS changes that
# It ends with what it removed and roughly how much space that freed. `flow.sh finish` runs it at the end and the
# Factory (work skill) at the start of every run. FIVVI_DERIVED_DATA changes the DerivedData folder (default
# ~/Library/Developer/Xcode/DerivedData); `gh`, `git` and `xcrun` are taken from PATH.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$(dirname "${BASH_SOURCE[0]}")/_ios.sh"

usage() { usage_of "$0"; }

DRY=false
case "$#:${1:-}" in
  0:) ;;
  1:--dry-run) DRY=true ;;
  *) usage ;;
esac
need_cmd gh
need_cmd jq
need_cmd git

TURBO_DAYS="${FIVVI_TURBO_CACHE_DAYS:-7}"
[[ "$TURBO_DAYS" =~ ^[1-9][0-9]*$ ]] || die "FIVVI_TURBO_CACHE_DAYS must be a positive integer, not '$TURBO_DAYS'"
DERIVED_DATA="${FIVVI_DERIVED_DATA:-$HOME/Library/Developer/Xcode/DerivedData}"

if $DRY; then VERB="would remove"; else VERB="removed"; fi
REMOVED=0
FREED_KB=0
LEFT=""

human_kb() {
  awk -v k="$1" 'BEGIN {
    if (k >= 1048576) printf "%.1f GB", k / 1048576
    else if (k >= 1024) printf "%.1f MB", k / 1024
    else printf "%d KB", k }'
}

# Disk usage in KB of a file or folder; 0 when it is not there.
size_kb() { du -sk "$1" 2>/dev/null | awk '{ print $1 + 0 }' | grep . || echo 0; }

# Records and prints a removal: $1 what, $2 its size in KB, $3 how many items it counts for (default 1).
removal() {
  REMOVED=$((REMOVED + ${3:-1}))
  FREED_KB=$((FREED_KB + $2))
  echo "$VERB $1 ($(human_kb "$2"))"
}

# Records something that is left for the owner: $1 what, $2 why.
leave() { LEFT+="- $1: $2"$'\n'; }

# The path and the last PR state of a branch: `<number> <state>`; empty without a PR. Fails when gh does.
latest_pr() {
  gh pr list --repo "$(repo_slug)" --head "$1" --state all --json number,state \
    --jq 'sort_by(.number) | last // empty | "\(.number) \(.state)"' </dev/null
}

clean_merged() {
  local wt="$1" branch="$2" rel="$3" pr="$4" msg size n
  if ! msg="$("$ROOT/scripts/wt.sh" "done" "$branch" --check 2>&1 >/dev/null </dev/null)"; then
    leave "$rel ($branch)" "$(tail -n 1 <<<"$msg" | sed 's/^error: //')"
    return 0
  fi
  size="$(size_kb "$wt")"
  if ! $DRY; then
    n="$(branch_issue "$branch")"
    if [ -n "$n" ]; then
      msg="$(FIVVI_CLEANING=1 "$ROOT/scripts/flow.sh" finish "$n" 2>&1 </dev/null)" \
        || { leave "$rel ($branch)" "flow.sh finish $n failed: $(tail -n 1 <<<"$msg" | sed 's/^error: //')"; return 0; }
    else
      msg="$("$ROOT/scripts/wt.sh" "done" "$branch" 2>&1 </dev/null)" \
        || { leave "$rel ($branch)" "wt.sh done failed: $(tail -n 1 <<<"$msg" | sed 's/^error: //')"; return 0; }
    fi
  fi
  removal "$rel ($branch: PR #$pr merged)" "$size"
}

clean_closed() {
  local wt="$1" branch="$2" rel="$3" pr="$4" head size msg
  if [ -n "$(git -C "$wt" status --porcelain </dev/null)" ]; then
    leave "$rel ($branch)" "PR #$pr is closed, but the worktree has uncommitted changes"
    return 0
  fi
  head="$(git -C "$MAIN_ROOT" rev-parse --verify --quiet "refs/heads/$branch" || true)"
  if [ -n "$head" ] \
    && ! git -C "$MAIN_ROOT" merge-base --is-ancestor "$head" "refs/remotes/origin/$branch" 2>/dev/null \
    && ! git -C "$MAIN_ROOT" merge-base --is-ancestor "$head" "refs/remotes/origin/$(default_branch)" 2>/dev/null; then
    leave "$rel ($branch)" "PR #$pr is closed, but the branch has commits that are not pushed"
    return 0
  fi
  size="$(size_kb "$wt")"
  if ! $DRY; then
    msg="$("$ROOT/scripts/wt.sh" rm "$branch" 2>&1 </dev/null)" \
      || { leave "$rel ($branch)" "wt.sh rm failed: $(tail -n 1 <<<"$msg" | sed 's/^error: //')"; return 0; }
  fi
  removal "$rel ($branch: PR #$pr closed, branch kept)" "$size"
}

clean_worktrees() {
  local wt branch rel line pr state
  while IFS=$'\t' read -r -u 3 wt branch; do
    [ -n "$wt" ] && [ -d "$wt" ] || continue
    rel="${wt#"$MAIN_ROOT"/}"
    case "$ROOT/" in "$wt/"*) echo "kept $rel (this script runs from it)"; continue ;; esac
    if ! line="$(latest_pr "$branch")"; then
      leave "$rel ($branch)" "could not read its PR"
      continue
    fi
    if [ -z "$line" ]; then echo "kept $rel (no PR)"; continue; fi
    read -r pr state <<<"$line"
    case "$state" in
      MERGED) clean_merged "$wt" "$branch" "$rel" "$pr" ;;
      CLOSED) clean_closed "$wt" "$branch" "$rel" "$pr" ;;
      *) echo "kept $rel (PR #$pr is open)" ;;
    esac
  done 3< <(registered_worktrees)
}

clean_strays() {
  local registered dir rel
  [ -d "$WORKTREES_DIR" ] || return 0
  registered="$(git -C "$MAIN_ROOT" worktree list --porcelain | sed -n 's/^worktree //p')"
  for dir in "$WORKTREES_DIR"/*; do
    [ -d "$dir" ] && [ ! -L "$dir" ] || continue
    ! grep -qxF "$dir" <<<"$registered" || continue
    rel="${dir#"$MAIN_ROOT"/}"
    if [ -d "$dir/.git" ]; then
      leave "$rel" "not a worktree of this repository, but a repository of its own"
      continue
    fi
    removal "$rel (not a worktree)" "$(size_kb "$dir")"
    $DRY || rm -rf "$dir"
  done
}

clean_simulators() {
  local names udid name data rest pid size
  use_xcode 2>/dev/null || return 0
  names="$(git -C "$MAIN_ROOT" worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r wt; do basename "$wt"; done)"
  while IFS=$'\t' read -r -u 3 udid name data; do
    [ -n "$udid" ] || continue
    rest="${name#Fivvi }"
    if [[ "$rest" =~ ^parallel\ ([0-9]+)$ ]]; then
      pid="${BASH_REMATCH[1]}"
      ! ps -p "$pid" >/dev/null 2>&1 || continue
    else
      ! grep -qxF "$rest" <<<"$names" || continue
    fi
    size=0
    [ -z "$data" ] || size="$(size_kb "$data")"
    if ! $DRY; then
      xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true
      xcrun simctl delete "$udid" >/dev/null 2>&1 || { leave "simulator '$name'" "could not delete it"; continue; }
    fi
    removal "simulator '$name'" "$size"
  done 3< <(xcrun simctl list devices --json 2>/dev/null | jq -r \
    '.devices[][] | select(.name | startswith("Fivvi ")) | [.udid, .name, (.dataPath // "")] | @tsv' || true)
}

# The WorkspacePath of a DerivedData info.plist (XML, or binary on a Mac).
plist_workspace() {
  { if head -c 6 "$1" | grep -q bplist && command -v plutil >/dev/null; then plutil -convert xml1 -o - "$1"; else cat "$1"; fi; } \
    2>/dev/null | tr -d '\n' \
    | sed -n 's#.*<key>WorkspacePath</key>[[:space:]]*<string>\([^<]*\)</string>.*#\1#p'
}

clean_derived_data() {
  local dir workspace
  [ -d "$DERIVED_DATA" ] || return 0
  for dir in "$DERIVED_DATA"/*; do
    [ -d "$dir" ] && [ -f "$dir/info.plist" ] || continue
    workspace="$(plist_workspace "$dir/info.plist")"
    case "$workspace" in "$MAIN_ROOT"/*) ;; *) continue ;; esac
    [ ! -e "$workspace" ] || continue
    removal "$dir (workspace is gone)" "$(size_kb "$dir")"
    $DRY || rm -rf "$dir"
  done
}

clean_turbo() {
  local dir="$MAIN_ROOT/.turbo/cache" mins plan files entries kb
  [ -d "$dir" ] || return 0
  mins=$((TURBO_DAYS * 1440))
  # An entry is the files of one hash (<hash>.tar.zst, <hash>-meta.json, ...); it stays when any of them was used lately.
  plan="$({ find "$dir" -type f \( -mmin "-$mins" -o -amin "-$mins" \) | sed 's/^/R\t/'; find "$dir" -type f | sed 's/^/A\t/'; } \
    | awk -F'\t' '
      function key(p,  b) { b = p; sub(/.*\//, "", b); sub(/(-meta\.json|-manifest\.json|\.tar\.zst)$/, "", b); return b }
      $1 == "R" { recent[key($2)] = 1; next }
      { all[++n] = $2 }
      END { for (i = 1; i <= n; i++) { k = key(all[i]); if (!(k in recent)) { print "F\t" all[i]; if (!(k in seen)) { seen[k] = 1; print "E\t" k } } } }')"
  [ -n "$plan" ] || return 0
  files="$(sed -n 's/^F\t//p' <<<"$plan")"
  entries="$(grep -c '^E' <<<"$plan" || true)"
  kb="$(tr '\n' '\0' <<<"$files" | xargs -0 du -k 2>/dev/null | awk '{ s += $1 } END { print s + 0 }')"
  if ! $DRY; then tr '\n' '\0' <<<"$files" | xargs -0 rm -f; fi
  removal "turbo cache: $entries $([ "$entries" = 1 ] && echo entry || echo entries) not used for $TURBO_DAYS days" "$kb" "$entries"
}

git -C "$MAIN_ROOT" fetch --prune --quiet 2>/dev/null </dev/null || true
$DRY || git -C "$MAIN_ROOT" worktree prune
clean_worktrees
clean_strays
clean_simulators
clean_derived_data
clean_turbo

if [ -n "$LEFT" ]; then
  echo "== Left for you"
  printf '%s' "$LEFT"
fi
ITEMS="$REMOVED items"
[ "$REMOVED" -ne 1 ] || ITEMS="1 item"
if [ "$REMOVED" -eq 0 ]; then
  echo "Nothing to remove."
elif $DRY; then
  echo "Dry run: would remove $ITEMS. Would free about $(human_kb "$FREED_KB")."
else
  echo "Removed $ITEMS, freed about $(human_kb "$FREED_KB")."
fi
