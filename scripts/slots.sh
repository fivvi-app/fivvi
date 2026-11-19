#!/usr/bin/env bash
# Machine-wide slots for the heavy jobs of a factory run (E001 #1388, WORKFLOW.md §4). The library is _slots.sh.
#
#   slots.sh run <class>[,<class>...] [--label <text>] -- <command> [args...]
#       waits for a free slot of every class, then becomes the command (exec: the same process, so its exit code and signals are
#       the command's). The slots are held by that process: they are free the moment it is gone, whatever way it ends (exit,
#       failure, TERM, Ctrl-C, SIGKILL), and the next job takes over its links. Classes: heavy (FIVVI_HEAVY_SLOTS
#       places, default 2: a build or a test suite), ios-sim (1: a booted iOS simulator), android-emu (1: an Android emulator).
#       A job without a free slot says so every minute, with the holders and their ages, and fails after
#       FIVVI_SLOT_TIMEOUT_SECONDS (default 3600). A slot whose holder is gone is taken over. The command runs with
#       FIVVI_SLOTS_HELD set, so a heavy script that another one starts does not wait for its parent's slots.
#   slots.sh status
#       every class with its places, the holders and their ages, and the stale ones.
#
# The scripts that start heavy jobs take their slots with slots_wrap (test-ios.sh, android.sh, maestro.sh); check.sh takes
# the heavy slot for its integration and e2e suites. The slots live in the main checkout's .work/slots/, shared by every
# worktree. FIVVI_SLOTS=off turns them off; CI does not use them.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$ROOT/scripts/_slots.sh"

usage() { usage_of "$0"; }

cmd_run() {
  local classes="${1:-}" label="" class
  [ -n "$classes" ] || usage
  shift
  if [ "${1:-}" = --label ]; then
    [ $# -ge 2 ] || usage
    label="$2"
    shift 2
  fi
  [ "${1:-}" = -- ] || usage
  shift
  [ $# -gt 0 ] || usage
  for class in $(tr ',' ' ' <<<"$classes"); do
    slot_limit "$class" >/dev/null || { echo "unknown slot class '$class' (one of: $SLOT_CLASSES)" >&2; exit 2; }
  done
  [ -n "$label" ] || label="$(basename "$1")"
  slot_acquire_all "$classes" "$label" || { echo "✗ $SLOT_ERROR" >&2; exit 1; }
  slot_mark_held "$classes"
  exec "$@"
}

cmd_status() {
  local class limit holders taken stale i file target line
  for class in $SLOT_CLASSES; do
    limit="$(slot_limit "$class")"
    holders="$(slot_holders "$class")"
    taken=0
    [ -z "$holders" ] || taken="$(wc -l <<<"$holders" | tr -d ' ')"
    stale=0
    i=1
    while [ "$i" -le "$limit" ]; do
      file="$SLOTS_DIR/$class/slot-$i"
      if [ -L "$file" ]; then
        target="$(readlink "$file" 2>/dev/null || true)"
        slot_holder_alive "$target" || stale=$((stale + 1))
      fi
      i=$((i + 1))
    done
    printf '%-12s %s of %s %s%s\n' "$class" "$taken" "$limit" "$([ "$taken" -ge "$limit" ] && echo "(full)" || echo "(free: $((limit - taken)))")" \
      "$([ "$stale" -eq 0 ] || echo "; $stale stale (taken over by the next job)")"
    [ -z "$holders" ] || while IFS= read -r line; do echo "  $line"; done <<<"$holders"
  done
}

case "${1:-}" in
  run) shift; cmd_run "$@" ;;
  status) [ $# -eq 1 ] || usage; cmd_status ;;
  *) usage ;;
esac
