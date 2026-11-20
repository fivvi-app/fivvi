#!/usr/bin/env bash
# shellcheck disable=SC2034 # variables here are used by the scripts that source this file
# Machine-wide slots for the heavy jobs of a factory run (E001 #1388). Sourced after _lib.sh; Bash 3.2 compatible.
#
# A factory run builds up to 4 tickets at once, and each builder starts its own heavy jobs: simulators, emulators, Gradle and
# xcodebuild builds, the integration and e2e suites. Nothing limited them across the worktrees, the load average reached 250-700
# on a 10-core Mac, and tests hit their watchdogs. A slot is one place to run one heavy job; a class is a pool of them:
#
#   heavy         FIVVI_HEAVY_SLOTS places (default 2): a job that loads the machine (a build, a test suite)
#   ios-sim       1 place: a booted iOS simulator (about 250 processes each)
#   android-emu   1 place: a running Android emulator
#
# A slot is held while the job runs, not while a device stays up. Three things go past it: KEEP_DEVICE=1 leaves the simulator or
# emulator running after the job (and so its slot) ended, `IOS_PARALLEL=1` of test-ios.sh boots two simulators on its one
# ios-sim slot, and `android.sh emulator` (the emulator for a dev session) takes no slot. Don't combine them with other jobs.
#
# The slots are symbolic links in the main checkout's .work/slots/<class>/ (shared by every worktree; FIVVI_SLOTS_DIR moves
# them). A link is taken with `ln -s`, which fails when it exists, in one step, so two jobs can't take the same slot. Its target
# is "pid|epoch|start time of the pid|label" of the holder. A slot whose holder is gone (no such process, or a process that
# started later than the holder did: the pid was reused after a kill -9) is stale and taken over; each job only removes the
# link it read, and the one race left is two jobs taking over the same stale slot at the same moment.
#
#   FIVVI_HEAVY_SLOTS             places of the heavy class (default 2)
#   FIVVI_SLOT_TIMEOUT_SECONDS    how long a job waits for a slot (default 3600)
#   FIVVI_SLOT_POLL_SECONDS       how often it looks again (default 5)
#   FIVVI_SLOTS=off               no slots at all (slots_wrap does nothing; CI sets CI, which does the same: one job per runner)

SLOTS_DIR="${FIVVI_SLOTS_DIR:-$MAIN_ROOT/.work/slots}"
SLOT_CLASSES="heavy ios-sim android-emu"
# The slots this process holds, as "<class>/<file>" lines.
SLOTS_OWN=""
SLOT_ERROR=""

slot_limit() {
  case "$1" in
    heavy) echo "${FIVVI_HEAVY_SLOTS:-2}" ;;
    ios-sim | android-emu) echo 1 ;;
    *) return 1 ;;
  esac
}

# The start time of a process, as ps prints it in the C locale ("Mon Nov 17 18:23:00 2026"), or nothing when it does not run.
# Always the C locale: under nl_NL ps prints "ma 17 nov. 18:23:00 2026", and jobs of two locales would take each other's slots.
slot_pid_started() { LC_ALL=C ps -p "$1" -o lstart= 2>/dev/null | sed -E 's/^ +//; s/ +$//' || true; }

# Whether the holder in a slot link's target ($1) still runs.
slot_holder_alive() {
  local pid _epoch started _label now
  IFS='|' read -r pid _epoch started _label <<<"$1"
  case "$pid" in '' | *[!0-9]*) return 1 ;; esac
  now="$(slot_pid_started "$pid")"
  [ -n "$now" ] || return 1
  case "$(ps -p "$pid" -o stat= 2>/dev/null)" in *Z*) return 1 ;; esac
  [ -z "$started" ] || [ "$started" = "$now" ]
}

# "pid 123 (label, 12 min)" for every live holder of a class, on one line each.
slot_holders() {
  local class="$1" file target pid epoch _started label now
  now="$(date +%s)"
  for file in "$SLOTS_DIR/$class"/slot-*; do
    [ -L "$file" ] || continue
    target="$(readlink "$file" 2>/dev/null || true)"
    slot_holder_alive "$target" || continue
    IFS='|' read -r pid epoch _started label <<<"$target"
    echo "pid $pid (${label:-no label}, $(((now - ${epoch:-$now}) / 60)) min)"
  done
}

# slot_acquire <class> <label>: waits for a free slot of the class and holds it; fails with SLOT_ERROR set after the timeout.
slot_acquire() {
  local class="$1" label="$2" limit dir i file target current takeovers=0 started waited_at
  local timeout="${FIVVI_SLOT_TIMEOUT_SECONDS:-3600}" poll="${FIVVI_SLOT_POLL_SECONDS:-5}"
  limit="$(slot_limit "$class")" || { SLOT_ERROR="unknown slot class '$class' (one of: $SLOT_CLASSES)"; return 1; }
  dir="$SLOTS_DIR/$class"
  mkdir -p "$dir" || { SLOT_ERROR="could not create $dir"; return 1; }
  started=$SECONDS
  waited_at=-60
  while :; do
    i=1
    while [ "$i" -le "$limit" ]; do
      file="$dir/slot-$i"
      target="$$|$(date +%s)|$(slot_pid_started "$$")|$label"
      if ln -sn "$target" "$file" 2>/dev/null; then
        SLOTS_OWN="$SLOTS_OWN
$class/slot-$i"
        return 0
      fi
      current="$(readlink "$file" 2>/dev/null || true)"
      if [ -z "$current" ]; then
        # ln failed, and nothing is there: the folder is not writable (or the slot is not a link). Not worth waiting for.
        takeovers=$((takeovers + 1))
        if [ "$takeovers" -gt 3 ]; then
          SLOT_ERROR="could not take a $class slot: ln -s failed in $dir 3 times (is it writable?). Delete $dir and run this again."
          return 1
        fi
        [ -L "$file" ] || [ ! -e "$file" ] || rm -rf "$file"
        continue
      fi
      if ! slot_holder_alive "$current"; then
        # A stale slot: remove the link we read (not a newer one) and try this slot again.
        [ "$(readlink "$file" 2>/dev/null || true)" != "$current" ] || rm -f "$file"
        continue
      fi
      i=$((i + 1))
    done
    takeovers=0
    if [ $((SECONDS - started)) -ge "$timeout" ]; then
      SLOT_ERROR="no $class slot free after $((SECONDS - started)) s (all $limit are held: $(slot_holders "$class" | paste -sd ';' - | sed 's/;/; /g')). Run this again later, raise FIVVI_SLOT_TIMEOUT_SECONDS, or stop a holder; scripts/slots.sh status lists them. If none of them runs, delete $dir."
      return 1
    fi
    if [ $((SECONDS - waited_at)) -ge 60 ]; then
      echo "… waiting for a $class slot ($limit places, all held; $((SECONDS - started)) s so far): $(slot_holders "$class" | paste -sd ';' - | sed 's/;/; /g'). A few heavy jobs at a time keep the machine from timing out tests (#1388)" >&2
      waited_at=$SECONDS
    fi
    sleep "$poll"
  done
}

# slot_release_all: gives back every slot this process holds, and only those (a link another process took over stays).
slot_release_all() {
  local entry
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    case "$(readlink "$SLOTS_DIR/$entry" 2>/dev/null || true)" in "$$|"*) rm -f "$SLOTS_DIR/$entry" ;; esac
  done <<<"$SLOTS_OWN"
  SLOTS_OWN=""
}

# Whether class $1 is in the comma separated list $2.
slot_in_list() { case ",$2," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

# slot_acquire_all <classes> <label>: the classes (comma separated) a job needs, minus those a parent job holds already
# (FIVVI_SLOTS_HELD). The device classes come first and heavy last: a job waiting for the one simulator holds no heavy slot
# meanwhile, so it does not keep a build from running.
slot_acquire_all() {
  local classes="$1" label="$2" class
  for class in android-emu ios-sim heavy; do
    slot_in_list "$class" "$classes" || continue
    ! slot_in_list "$class" "${FIVVI_SLOTS_HELD:-}" || continue
    slot_acquire "$class" "$label" || return 1
  done
}

# Whether this job takes slots at all: not with FIVVI_SLOTS=off, and not on CI (one job per runner).
slots_enabled() { [ "${FIVVI_SLOTS:-on}" != off ] && [ -z "${CI:-}" ]; }

# slot_mark_held <classes>: FIVVI_SLOTS_HELD, for what this process starts, names the classes this process (or a parent) holds.
slot_mark_held() {
  local class
  for class in $(tr ',' ' ' <<<"$1"); do
    slot_in_list "$class" "${FIVVI_SLOTS_HELD:-}" || FIVVI_SLOTS_HELD="${FIVVI_SLOTS_HELD:+$FIVVI_SLOTS_HELD,}$class"
  done
  export FIVVI_SLOTS_HELD
}

# slots_take <classes> <label>: slot_acquire_all when the slots are on; for a script that holds a slot for part of its run
# (check.sh) and gives it back with slot_release_all. Fails with SLOT_ERROR set after the timeout.
slots_take() { ! slots_enabled || slot_acquire_all "$1" "$2"; }

# slots_wrap <classes> <script> [args...]: for a script, near its top: takes the slots for the whole run of the script, waiting for
# them, and fails the script when none is free in time. The holder is the script's own process, so a slot is free again the moment
# the process is gone, however it ends (it exits, fails, is killed with TERM or INT or with SIGKILL): no trap to run, none of the
# script's own traps to clash with, and the next job takes over the link a gone holder leaves. Does nothing when the slots are off
# or a parent job holds the classes already (FIVVI_SLOTS_HELD). Sets FIVVI_SLOTS_HELD for what the script starts.
slots_wrap() {
  local classes="$1"
  shift
  slots_enabled || return 0
  slot_acquire_all "$classes" "$(basename "$1")${2:+ $2} ($(basename "$ROOT"))" || { echo "✗ $SLOT_ERROR" >&2; exit 1; }
  slot_mark_held "$classes"
}
