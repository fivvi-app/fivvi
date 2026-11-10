#!/usr/bin/env bash
# shellcheck disable=SC2329 # finish() and what it calls run from the EXIT trap that on_exit sets
# The restore drill (E016, spec #479): proves that a Postgres backup restores, as one repeatable script. THE OWNER RUNS IT;
# agents never run it against Railway (docs/agents/tools.md, role-mapping.md D8).
#
#   restore-drill.sh --environment <development|production> [--at <RFC3339>] [--keep-scratch]
#                    [--source-url-env <VAR>] [--who <name>]
#
#   --environment    The environment whose `postgres` service is restored. Nothing else is accepted.
#   --at             The point in time to restore to: RFC 3339 with its offset, not in the future. Without it the
#                    drill picks the point itself: it writes the `before` marker, waits, takes the point, waits, writes
#                    the `after` marker, and restores to the point. A marker cannot be written in the past, so with
#                    --at both markers are written now and the drill proves the restore predates both.
#   --keep-scratch   Do not remove the scratch service, so a scratch `web` can be pointed at it (AC8, the steps are in
#                    docs/engineering/restore-drills.md). The script then prints how to remove it.
#   --source-url-env The environment variable that holds the connection URL of the source database (default
#                    RESTORE_DRILL_SOURCE_URL), exported in the shell and never given as an argument.
#   --who            Who runs the drill, for the drill-log row (default: owner).
#
# What it does, in order: refuses anything but the two environments and a time in the future, before it touches anything;
# writes the markers into a drill table of the source; restores into a new service `postgres-drill-<date>` with
# `railway postgres pitr restore`; waits until the restored database answers; checks that the marker before the point is
# there and the one after is not; compares the row count of every table with the source (allowing the rows changed after
# the point); removes the scratch service and the drill table with its markers, also after a failed check or a failed
# restore; prints the result as counts only and a line to paste as a row in the drill log. It exits non-zero on any
# failed check, or when a part of the cleanup failed.
#
# Its output holds environment, times, durations, service and table names and counts: no row value and no connection URL.
# What `railway` prints is not shown. Re-applying the deletion log (E014) is added by a later ticket.
#
# Knobs (seconds): RESTORE_DRILL_SETTLE (wait around the point, default 30), RESTORE_DRILL_WAIT (how long the restored
# database may take to answer, default 900), RESTORE_DRILL_INTERVAL (between two attempts, default 10),
# RESTORE_DRILL_PROJECT (the Railway project, default the project of tools.md).
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

ENVIRONMENT=""
AT=""
AT_GIVEN=0
KEEP=0
SOURCE_VAR="RESTORE_DRILL_SOURCE_URL"
WHO="owner"
SETTLE="${RESTORE_DRILL_SETTLE:-30}"
WAIT="${RESTORE_DRILL_WAIT:-900}"
INTERVAL="${RESTORE_DRILL_INTERVAL:-10}"
PROJECT="${RESTORE_DRILL_PROJECT:-5ac2d844-191a-4671-9632-50b66817f648}"
RESTORED_VAR="RESTORE_DRILL_RESTORED_URL"

while [ $# -gt 0 ]; do
  case "$1" in
    --environment) [ $# -ge 2 ] || usage; ENVIRONMENT="$2"; shift 2 ;;
    --at) [ $# -ge 2 ] || usage; AT="$2"; AT_GIVEN=1; shift 2 ;;
    --source-url-env) [ $# -ge 2 ] || usage; SOURCE_VAR="$2"; shift 2 ;;
    --who) [ $# -ge 2 ] || usage; WHO="$2"; shift 2 ;;
    --keep-scratch) KEEP=1; shift ;;
    *) usage ;;
  esac
done

# The same shape as the helper accepts (packages/database/src/restore-cli.ts): an offset is required, because a time
# without one would be read in the local time zone. Prints the time as whole seconds since the epoch.
epoch_of() {
  node -e '
    const value = process.argv[1];
    const rfc3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;
    const time = rfc3339.test(value) ? Date.parse(value) : NaN;
    if (Number.isNaN(time)) process.exit(1);
    console.log(Math.floor(time / 1000));
  ' "$1"
}

iso_of() { node -p 'new Date(Number(process.argv[1]) * 1000).toISOString().replace(/\.\d+Z$/, "Z")' "$1"; }

# --- Refusals: nothing is touched before these hold --------------------------------------------------------------------

case "$ENVIRONMENT" in
  development | production) ;;
  *) die "--environment must be development or production" ;;
esac
[[ "$SOURCE_VAR" =~ ^[A-Z][A-Z0-9_]*$ ]] || die "--source-url-env must be an upper-case variable name"
[ "$SOURCE_VAR" != "$RESTORED_VAR" ] || die "--source-url-env cannot be $RESTORED_VAR, the script's own variable"
for number in "$SETTLE" "$WAIT" "$INTERVAL"; do
  [[ "$number" =~ ^[0-9]+$ ]] || die "RESTORE_DRILL_SETTLE, _WAIT and _INTERVAL are whole seconds"
done
NOW="$(date -u +%s)"
if [ "$AT_GIVEN" = 1 ]; then
  POINT_EPOCH="$(epoch_of "$AT")" || die "--at must be an RFC 3339 time with its offset, e.g. 2026-11-10T09:00:00Z"
  [ "$POINT_EPOCH" -le "$NOW" ] || die "--at is in the future; a restore goes back to a point that has passed"
  MODE="chosen"
else
  MODE="markers"
fi
need_cmd railway
need_cmd node
[ -n "$(printenv "$SOURCE_VAR")" ] || die "$SOURCE_VAR is not set (or not exported): the connection URL of the $ENVIRONMENT database"

# --- State and cleanup -------------------------------------------------------------------------------------------------

DATE_STAMP="$(date -u +%Y%m%d-%H%M)"
SCRATCH="postgres-drill-$DATE_STAMP"
DRILL_DATE="$(date -u +%F)"
STARTED="$SECONDS"
RESTORE_SECONDS=0
MARKERS_OUT=""
MARKERS_RC=2
POINT=""
MARKERS_TOUCHED=0
SCRATCH_REQUESTED=0
RESULT_RC=0
FAILURE=""
CHECKED_TABLES=0
MATCHED_TABLES=0
CLEANUP_NOTES=()

say() { printf '%s\n' "$*"; }

# The restore helper of packages/database: drill markers and row counts. It names a database by the variable that holds
# its URL, and prints names and numbers only.
helper() { (cd "$ROOT/packages/database" && node src/scripts/restore.ts "$@"); }

# Railway for the project and environment of the drill. Nothing it prints is shown: a response can hold a connection URL.
rail() { railway "$@" --project "$PROJECT" --environment "$ENVIRONMENT"; }

duration_text() { printf '%sm %ss' "$(($1 / 60))" "$(($1 % 60))"; }

fail() {
  [ -n "$FAILURE" ] || FAILURE="$1"
  RESULT_RC=1
  say "FAILED: $1"
}

cleanup() {
  local rc=0
  if [ "$MARKERS_TOUCHED" = 1 ]; then
    if helper markers remove --database-url-env "$SOURCE_VAR" >/dev/null 2>&1; then
      CLEANUP_NOTES+=("drill table and markers removed from $ENVIRONMENT")
    else
      CLEANUP_NOTES+=("COULD NOT remove the drill table ($ENVIRONMENT): run 'restore.ts markers remove --database-url-env $SOURCE_VAR' in packages/database")
      rc=1
    fi
  fi
  if [ "$SCRATCH_REQUESTED" = 1 ]; then
    if [ "$KEEP" = 1 ]; then
      CLEANUP_NOTES+=("scratch service $SCRATCH KEPT; remove it with: railway service delete --service $SCRATCH --environment $ENVIRONMENT --project $PROJECT --yes")
    elif rail service delete --service "$SCRATCH" --yes >/dev/null 2>&1; then
      CLEANUP_NOTES+=("scratch service $SCRATCH removed")
    else
      CLEANUP_NOTES+=("COULD NOT remove scratch service $SCRATCH (it may never have been created): check 'railway service list' and delete it by hand")
      rc=1
    fi
  fi
  return "$rc"
}

finish() {
  local code="$RESULT_RC" total outcome elapsed note
  cleanup || code=1
  total=$((SECONDS - STARTED))
  say ""
  say "Restore drill: environment $ENVIRONMENT, point ${POINT:-not reached}, total $(duration_text "$total"), restore $(duration_text "$RESTORE_SECONDS")"
  for note in "${CLEANUP_NOTES[@]+"${CLEANUP_NOTES[@]}"}"; do [ -z "$note" ] || say "Cleanup: $note"; done
  if [ "$code" = 0 ]; then outcome="passed"; else outcome="failed${FAILURE:+ ($FAILURE)}"; fi
  say "Result: $outcome"
  say "Drill log row:"
  elapsed="$(duration_text "$RESTORE_SECONDS")"
  say "| $DRILL_DATE | $ENVIRONMENT | ${POINT:--} | $elapsed | $MATCHED_TABLES of $CHECKED_TABLES tables | $WHO | $outcome |"
  exit "$code"
}
on_exit finish

# --- The drill ---------------------------------------------------------------------------------------------------------

write_markers() {
  MARKERS_TOUCHED=1
  if [ "$MODE" = markers ]; then
    # The point sits between the two markers: it is taken once the `before` marker is committed (rounded up to the next
    # whole second, which is later than the marker's own time), and the `after` marker is written once it has passed.
    # The clock is this machine's, the markers' time is the database's; $SETTLE leaves room for the difference.
    helper markers write --kind before --at "$(iso_of "$(date -u +%s)")" --database-url-env "$SOURCE_VAR" || return 1
    POINT="$(iso_of "$(($(date -u +%s) + 1))")"
    sleep $((SETTLE + 1))
    helper markers write --kind after --at "$POINT" --database-url-env "$SOURCE_VAR" || return 1
    sleep "$SETTLE" # the write-ahead log up to the point reaches the archive before the restore asks for the point
  else
    POINT="$(iso_of "$POINT_EPOCH")"
    helper markers write --kind before --at "$(iso_of "$(date -u +%s)")" --database-url-env "$SOURCE_VAR" || return 1
    helper markers write --kind after --at "$(iso_of "$(date -u +%s)")" --database-url-env "$SOURCE_VAR" || return 1
  fi
}

restored_url() {
  local json
  json="$(rail variable list --service "$SCRATCH" --json 2>/dev/null)" || return 1
  printf '%s' "$json" | node -e '
    let text = "";
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => {
      try {
        const url = JSON.parse(text).DATABASE_PUBLIC_URL;
        if (typeof url === "string" && url !== "") process.stdout.write(url);
        else process.exit(1);
      } catch {
        process.exit(1);
      }
    });
  '
}

restore_into_scratch() {
  local started="$SECONDS"
  SCRATCH_REQUESTED=1
  rail postgres pitr restore --service postgres --at "$POINT" --new-service-name "$SCRATCH" --yes >/dev/null 2>&1 \
    || { RESTORE_SECONDS=$((SECONDS - started)); return 1; }
  # Healthy: the restored database answers. The helper exits 0 or 1 when it connected, and 2 when it could not.
  local deadline=$((SECONDS + WAIT)) url rc
  while :; do
    if url="$(restored_url)"; then
      export "$RESTORED_VAR=$url"
      rc=0
      MARKERS_OUT="$(helper markers check --database-url-env "$RESTORED_VAR" 2>&1)" || rc=$?
      if [ "$rc" = 0 ] || [ "$rc" = 1 ]; then
        MARKERS_RC="$rc"
        RESTORE_SECONDS=$((SECONDS - started))
        return 0
      fi
    fi
    [ "$SECONDS" -lt "$deadline" ] || { RESTORE_SECONDS=$((SECONDS - started)); return 2; }
    sleep "$INTERVAL"
  done
}

# The markers were read when the restored database first answered (restore_into_scratch).
check_markers() {
  local out="$MARKERS_OUT" rc="$MARKERS_RC"
  if [ "$MODE" = markers ]; then
    say "$(printf '%s\n' "$out" | grep -E '^(Marker|Markers)')"
    [ "$rc" = 0 ]
  else
    # Both markers were written after the chosen point, so a restore to it holds neither.
    say "Marker before the point: $(printf '%s' "$out" | grep -q 'before the point: found' && echo 'found (unexpected)' || echo 'absent (expected)')."
    say "Marker after the point: $(printf '%s' "$out" | grep -q 'after the point: found' && echo 'found (unexpected)' || echo 'absent (expected)')."
    ! printf '%s' "$out" | grep -q 'the point: found'
  fi
}

compare_counts() {
  local out rc=0
  out="$(helper counts --source-url-env "$SOURCE_VAR" --restored-url-env "$RESTORED_VAR" --at "$POINT" \
    --source-name "$ENVIRONMENT" --restored-name "$SCRATCH" 2>&1)" || rc=$?
  say "$out"
  # The helper prints one line per table after the heading and the column names.
  CHECKED_TABLES="$(printf '%s\n' "$out" | grep -cE '^[A-Za-z0-9_]+\.[A-Za-z0-9_]+ \| ')" || true
  MATCHED_TABLES="$(printf '%s\n' "$out" | grep -cE ' \| (match|within-changes)$')" || true
  [ "$rc" = 0 ]
}

if [ "$MODE" = markers ]; then plan="point between the markers"; else plan="point $AT"; fi
say "Restore drill: environment $ENVIRONMENT, scratch service $SCRATCH, $plan"

write_markers || { fail "writing the markers"; exit "$RESULT_RC"; }
say "Point in time: $POINT"
restore_status=0
restore_into_scratch || restore_status=$?
case "$restore_status" in
  0) say "Restore: the scratch service answered after $(duration_text "$RESTORE_SECONDS")." ;;
  1) fail "the restore"; exit "$RESULT_RC" ;;
  *) fail "the scratch service did not answer in time"; exit "$RESULT_RC" ;;
esac
check_markers || fail "the markers"
compare_counts || fail "the row counts"
exit "$RESULT_RC"
