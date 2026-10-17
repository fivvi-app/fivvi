#!/usr/bin/env bash
# Run one Codex sub-run on a model tier and print its final message. `work` uses it under Codex for the builder (and a
# mechanic that commits), because a native Codex role can't change the sandbox, and as the fallback when the project's
# roles aren't loaded (the repository isn't trusted in ~/.codex/config.toml). The model and reasoning effort of each tier
# come from .agents/agents/tiers.json (high: Sol, mid: Terra, small: Luna). -m and -c are session flags, so they beat
# .codex/config.toml. See docs/agents/codex-model-tiers.md.
#
# The high tier reviews and runs read-only. The mid and small tiers run in `workspace-write` and, in a linked worktree,
# may also write that worktree's git dir and the branch storage in the shared git dir (objects, refs/heads and its
# reflogs), so that they can commit; never hooks, config or the rest of .git. Never `danger-full-access`.
#
#   codex-agent.sh <high|mid|small> <dir> <prompt-file|->
#
# Set CODEX_BIN to run another codex binary (the tests use a fake one).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

[ $# -eq 3 ] || usage_of "$0"
TIER="$1"
DIR="$2"
PROMPT="$3"
CODEX="${CODEX_BIN:-codex}"
TIERS="$ROOT/.agents/agents/tiers.json"

need_cmd jq
need_cmd "$CODEX"
MODEL="$(jq -r --arg t "$TIER" '.[$t].codex.model // empty' "$TIERS")"
EFFORT="$(jq -r --arg t "$TIER" '.[$t].codex.effort // empty' "$TIERS")"
[ -n "$MODEL" ] && [ -n "$EFFORT" ] || die "unknown tier: $TIER (high, mid or small)"
[ -d "$DIR" ] || die "folder not found: $DIR"
[ "$PROMPT" = - ] || [ -f "$PROMPT" ] || die "prompt file not found: $PROMPT"

quote() { jq -Rn --arg v "$1" '$v'; }

# A linked worktree keeps its index and HEAD in a git dir of its own, but its objects and branches in the shared one.
git_write_roots() {
  local git_dir common path
  git_dir="$(git -C "$DIR" rev-parse --absolute-git-dir)"
  common="$(git -C "$DIR" rev-parse --path-format=absolute --git-common-dir)"
  [ "$git_dir" != "$common" ] || return 0
  for path in "$git_dir" "$common/objects" "$common/refs/heads" "$common/logs/refs/heads"; do
    printf '%s="write", ' "$(quote "$path")"
  done
}

ARGS=(exec -m "$MODEL" -c "model_reasoning_effort=\"$EFFORT\"" -C "$DIR")
if [ "$TIER" = high ]; then
  ARGS+=(-s read-only)
else
  ROOTS="$(git_write_roots)"
  if [ -n "$ROOTS" ]; then
    ARGS+=(-c 'default_permissions="agent"' -c "permissions.agent={extends=\":workspace\", filesystem={${ROOTS%, }}}")
  else
    ARGS+=(-s workspace-write)
  fi
fi

if [ "$PROMPT" = - ]; then
  "$CODEX" "${ARGS[@]}" -
else
  "$CODEX" "${ARGS[@]}" - < "$PROMPT"
fi
