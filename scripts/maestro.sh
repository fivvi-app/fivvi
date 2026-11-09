#!/usr/bin/env bash
# The Maestro flows in e2e/maestro against the local stack, once per catalog locale (E008, TESTING.md §7.2).
#
#   maestro.sh android [--apk [<file>]]   start Postgres (migrated and seeded), the fake Lettermint server (the one of the web e2e, on E2E_PORT +
#                        2000) and the web server on E2E_PORT, install the debug app on
#                        the emulator (booted for the run when none is connected), then run every flow with the
#                        emulator's language set to nl-NL and to en, each once Android has settled after the change
#                        (pnpm test:maestro; CI job Android Maestro). --apk installs the app built by
#                        android.sh maestro-apk (default: apps/android/build/maestro/app-debug.apk, or <file>) instead of
#                        building it with Gradle, so CI's Maestro job runs the APK of its build job (#293)
#   maestro.sh ios       the same on the worktree's own simulator, or the newest iPhone in the main checkout
#                        (IOS_SIMULATOR="iPhone 17" picks one by name): builds the Debug app for it against the web
#                        server, then runs every flow with the simulator's language set to nl-NL and to en (local only,
#                        to save macOS CI minutes)
#
# The app starts on its sign-in (F001), so the flows sign in as the seeded owner@example.com: the web server sends its
# emails to the fake Lettermint server, and the flows read the newest sign-in code from it (`GET /emails?to=`), so no real
# inbox is involved. Several flows sign in as the same seeded address, and 3 emails per address in 15 minutes would stop
# the fourth, or the second run. So the sign-in rate limits are cleared before each locale's run (`maestro test
# e2e/maestro`, one Maestro process for all its flows: a new one per flow made CI's emulator drop its adb connection, #363)
# and, while it runs, every MAESTRO_CLEAR_EVERY seconds (default 20, shorter than one flow) by a background loop that stops
# when the run ends, also on failure or Ctrl-C. Maestro reads e2e/maestro/config.yaml to pick the flows.
#
# Before the first flow, the web server has answered GET /api/v1/hello, the app's first request, in both locales.
# When it ends, also on failure or Ctrl-C, it stops the emulator or simulator it booted and its Gradle daemons;
# KEEP_DEVICE=1 leaves them running for the next run. On an emulator it didn't boot, it restores the language and the
# error dialog setting, also when it had to relaunch that emulator (#584) and stops the relaunched one.
#
# CI's emulator now and then lost its adb connection (#373): the host's adb server dropped it for about half a second
# ("device offline", then "device 'emulator-5554' not found"), which fails the flow that happens to start in that window,
# or the setprop of the next language switch. adbd itself keeps running (one pid in every log), so no restart is to blame:
# the drop comes while the device is busy, right after the framework restart of a language switch and while Maestro
# starts its driver. The runner therefore (1) waits after every switch until the host's adb server sees the device and
# it answers several probes in a row, reconnecting an offline device, and (2) re-runs once, and says so, the flows that
# failed with that exact transport error (ADB_DROP_ERROR below), never a flow that failed an assertion.
#
# Once (run 42015816516, #584) the emulator did not come back at all from the framework restart of the switch to en: no
# device for 300 s, no emulator process left. The switch therefore waits LOCALE_BOOT_TIMEOUT seconds for Android to boot
# again, and if it doesn't relaunches the emulator once, cold, sets it up again and repeats the switch. A second failure
# fails the run. No flow is re-run for it, and none has started when it happens.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$(dirname "${BASH_SOURCE[0]}")/_android.sh"

usage() { usage_of "$0"; }

LOCALES="nl-NL en"
PORT="${E2E_PORT:-$(e2e_port "$ROOT")}"
REPORTS="$ROOT/e2e/maestro/build"
SERVER_PID=""
LETTERMINT_PID=""
LETTERMINT_PORT=$((PORT + 2000))
CLEAR_EVERY="${MAESTRO_CLEAR_EVERY:-20}"
CLEARER_PID=""
CLEARER_LOG=""
DEVICE_LOCALE=""
# Whether this run booted the emulator it started with (EMULATOR_STARTED is also true after a relaunch of one it did not
# boot, #584): cleanup restores the language and the error dialog setting on an emulator it did not boot.
DEVICE_BOOTED_BY_US=false
# True from a language switch the emulator did not come back from until the relaunch is set up (or for good when that
# fails): the device is gone, so cleanup restores nothing on it instead of waiting DEVICE_READY_TIMEOUT for it (#584).
DEVICE_LOST=false
# Seconds Android gets to write a setting to disk (it does so a moment after the change) before the emulator is stopped.
SETTINGS_WRITE_WAIT="${SETTINGS_WRITE_WAIT:-5}"
# Seconds to wait for the device to be usable again, and the number of probes (one a second) in a row it must answer.
DEVICE_READY_TIMEOUT="${DEVICE_READY_TIMEOUT:-120}"
DEVICE_STABLE_PROBES="${DEVICE_STABLE_PROBES:-5}"
# Seconds Android gets to boot again after the framework restart of a language switch (it takes a minute or so on CI's 2
# cores); past that the emulator is relaunched, once (#584). The boot of that relaunch has EMULATOR_BOOT_TIMEOUT.
LOCALE_BOOT_TIMEOUT="${LOCALE_BOOT_TIMEOUT:-150}"
# True once the emulator was relaunched after a language switch: a second failure fails the run.
EMULATOR_RECOVERED=false
# Set to a function that makes the device usable again (Android: wait_for_device_ready) before a flow is re-run.
DEVICE_RECOVER=""
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

# The catalog text of a dotted key, e.g. `catalog en hello.title`: what the screen should show. Fails, with the key and
# the locale on stderr, when the key is missing or is not a text (a renamed leaf would otherwise print "undefined").
catalog() {
  # shellcheck disable=SC2016 # the `${key}` is a JavaScript template literal, not shell
  node -e 'const [file, key, locale] = process.argv.slice(1);
    const text = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), JSON.parse(require("fs").readFileSync(file, "utf8")));
    if (typeof text !== "string") {
      console.error(`catalog key ${key} is not a text in locale ${locale}`);
      process.exit(1);
    }
    console.log(text)' \
    "$ROOT/packages/i18n/$1.json" "$2" "$1"
}

# Adds `--env <name>=<catalog text of key $3 in locale $2>` to FLOW_ENV; fails when the catalog has no such key.
add_catalog_env() {
  local text
  text="$(catalog "$2" "$3")" || return 1
  FLOW_ENV+=(--env "$1=$text")
}

# The values every flow gets (--env; a flow's own env default would win over them, so the flows have none): the texts the
# screens show in locale $1, and where the flows read the sign-in emails (the host: Maestro runs there on both platforms).
# Fails, rather than giving a flow an empty text, when the catalog lacks a key (each lookup is checked on its own: an
# array assignment would only report the last one).
FLOW_ENV=()
set_flow_env() {
  local other="nl-NL"
  [ "$1" != "nl-NL" ] || other="en"
  FLOW_ENV=()
  add_catalog_env SIGN_IN_SEND_CODE "$1" signIn.sendCode || return 1
  add_catalog_env HELLO_TITLE "$1" hello.title || return 1
  add_catalog_env HOME_SET_UP_ON_WEB "$1" home.setUpOnWeb || return 1
  add_catalog_env ROLE_OWNER "$1" roles.owner || return 1
  add_catalog_env ROLE_TRAINER "$1" roles.trainer || return 1
  add_catalog_env PROFILE_WORKSPACES_TITLE "$1" myProfile.workspacesTitle || return 1
  add_catalog_env SIGN_OUT_LABEL "$1" signOut.label || return 1
  add_catalog_env PROFILE_LANGUAGE_THIS "$1" profile.language || return 1
  add_catalog_env PROFILE_LANGUAGE_OTHER "$other" profile.language || return 1
  FLOW_ENV+=(
    --env "DEVICE_LANGUAGE=$1"
    --env "LANGUAGE_THIS=$1"
    --env "LANGUAGE_OTHER=$other"
    --env "LETTERMINT_URL=http://localhost:$LETTERMINT_PORT"
  )
}

start_stack() {
  docker info >/dev/null 2>&1 || die "Docker is not running — start it (Postgres for the local stack)"
  [ -f packages/database/.env ] || cp packages/database/.env.example packages/database/.env
  pnpm db:up >/dev/null
  pnpm db:migrate >/dev/null
  pnpm db:seed >/dev/null
  pnpm turbo run build --filter=@fivvi/web --output-logs=errors-only
  mkdir -p "$REPORTS"
  # The fake Lettermint server of the web e2e (apps/web/e2e/fake-lettermint.ts): it keeps the emails the web server sends.
  (cd apps/web && PORT="$LETTERMINT_PORT" exec node e2e/fake-lettermint.ts) >"$REPORTS/lettermint.log" 2>&1 &
  LETTERMINT_PID=$!
  wait_for "http://localhost:$LETTERMINT_PORT/" "the fake Lettermint server" "lettermint.log"
  # Every value is synthetic: the fake Lettermint server accepts any token. EMAIL_SEND_EXAMPLE_DOMAIN=1 sends @example.com mail,
  # the seeded owner@example.com, through Lettermint (here the fake server) instead of writing it to the log (packages/email);
  # the server isn't the production environment, which would also tag Sentry and PostHog as production.
  local auth_url="http://127.0.0.1:$PORT"
  (cd apps/web && PORT="$PORT" HOSTNAME=127.0.0.1 \
    EMAIL_SEND_EXAMPLE_DOMAIN=1 \
    BETTER_AUTH_SECRET=maestro-secret-that-is-at-least-thirty-two-characters-long \
    BETTER_AUTH_URL="$auth_url" \
    LETTERMINT_API_URL="http://localhost:$LETTERMINT_PORT/v1/send" LETTERMINT_API_TOKEN=maestro-synthetic-lettermint-token \
    LETTERMINT_ROUTE_SIGN_IN=maestro-sign-in LETTERMINT_ROUTE_MAIL=maestro-mail \
    EMAIL_FROM_ADDRESS=noreply@fivvi.maestro.test EMAIL_FROM_NAME=Fivvi \
    SIGN_UP_ALLOWED_EMAILS=@example.com \
    exec node --env-file=../../packages/database/.env .next/standalone/apps/web/server.js) >"$REPORTS/web.log" 2>&1 &
  SERVER_PID=$!
  wait_for "http://127.0.0.1:$PORT/api/v1/health" "the web server on port $PORT" "web.log"
  warm_up_hello
}

# Waits up to 60 s for GET $1 to answer; $2 names what it is, $3 is its log in e2e/maestro/build.
wait_for() {
  local waited=0
  until curl -fsS "$1" >/dev/null 2>&1; do
    [ "$waited" -lt 60 ] || die "$2 didn't start (log: e2e/maestro/build/$3)"
    sleep 1; waited=$((waited + 1))
  done
}

# Stops the web server and the fake Lettermint server, and waits until they are gone.
stop_stack() {
  local pid
  for pid in "$SERVER_PID" "$LETTERMINT_PID"; do
    [ -z "$pid" ] || kill "$pid" 2>/dev/null || true
    [ -z "$pid" ] || wait "$pid" 2>/dev/null || true
  done
}

# The sign-in rate limits (F001) count in the database: 3 emails per address in 15 minutes, and one shared bucket for
# the requests without a client IP address (the app's, here). Clear them, so a flow isn't limited by an earlier run. The
# script refuses a database that isn't on localhost (TESTING.md §5.3).
clear_rate_limits() {
  pnpm db:reset-rate-limits >/dev/null || die "clearing the sign-in rate limits failed"
}

# The app's first screen asks GET /api/v1/hello?locale=<its language>. Ask it once per locale before the first flow,
# so no flow waits on the server's first request, and stop here, not 20 s into a flow, when it doesn't answer (#89).
warm_up_hello() {
  local locale url
  for locale in $LOCALES; do
    url="http://127.0.0.1:$PORT/api/v1/hello?locale=$locale"
    curl -fsS --max-time 60 "$url" >/dev/null 2>&1 \
      || die "GET $url failed (log: e2e/maestro/build/web.log)"
  done
}

# True when the host's adb server lists the device as online, Android has booted and the package manager answers.
device_answers() {
  [ "$(adb get-state 2>/dev/null | tr -d '\r')" = device ] || return 1
  [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] || return 1
  adb shell pm path android >/dev/null 2>&1
}

# Returns once the device has answered DEVICE_STABLE_PROBES probes in a row (a drop of the adb connection resets the
# count), or fails once DEVICE_READY_TIMEOUT seconds (the clock, $SECONDS, not the passes: a slow adb call counts) have
# passed. An offline device is reconnected (`adb reconnect offline`); a device the adb server doesn't list (yet) is
# waited for. Never kills the script itself: cleanup calls it too.
wait_for_device_ready() {
  local started=$SECONDS steady=0 state
  while [ "$steady" -lt "$DEVICE_STABLE_PROBES" ]; do
    if device_answers; then
      steady=$((steady + 1))
    else
      steady=0
      state="$(adb get-state 2>&1 | tr -d '\r' || true)"
      case "$state" in
        *offline*) echo "maestro.sh: the device is offline; reconnecting it"; adb reconnect offline >/dev/null 2>&1 || true ;;
      esac
    fi
    [ "$steady" -lt "$DEVICE_STABLE_PROBES" ] || break
    if [ "$((SECONDS - started))" -ge "$DEVICE_READY_TIMEOUT" ]; then
      echo "maestro.sh: the device is not ready after ${DEVICE_READY_TIMEOUT}s (adb get-state: ${state:-device})" >&2
      return 1
    fi
    sleep 1
  done
}

# `adb root` restarts adbd as root, and the host's adb server can lose the transport while it does: "unable to connect for
# root: closed" or "device offline" (#373). Then the device is waited for and root is asked once more; any other error, or
# a second failure, fails the script. After it adbd has restarted, so wait until the device is online and answering.
root_device() {
  local out
  if ! out="$(adb root 2>&1)"; then
    case "$out" in
      *"unable to connect for root: closed"*|*"device offline"*) ;;
      *) echo "$out" >&2; die "adb root failed" ;;
    esac
    echo "maestro.sh: adb root lost the connection to the device ($out); waiting for the device and trying once more"
    wait_for_device_ready || die "the device did not come back after adb root failed"
    out="$(adb root 2>&1)" || { echo "$out" >&2; die "adb root failed twice"; }
  fi
  wait_for_device_ready || die "the device did not come back after adb root"
}

# Root on the Google APIs emulator image, so the device language can be changed without a reboot: a framework restart.
# The device must be online first (the adb connection may have dropped when the last Maestro run ended, #373), and after
# the restart it must boot and then stay online. Returns 1, never exits, when it doesn't: the emulator once did not come
# back from the restart at all (#584), and switch_device_locale then relaunches it.
set_device_locale() {
  wait_for_device_ready || return 1
  adb shell "setprop persist.sys.locale $1; setprop sys.boot_completed 0; setprop ctl.restart zygote"
  await_boot "$LOCALE_BOOT_TIMEOUT" || { echo "maestro.sh: $BOOT_ERROR after the switch to $1 (${LOCALE_BOOT_TIMEOUT}s)" >&2; return 1; }
  wait_for_device_ready
}

# Waits until the emulator that did not come back has exited: asks it to (`adb emu kill`), then ends the process, the one
# this script started or the one android.sh emulator recorded in EMULATOR_PID_FILE, even a hung one.
STALE_EMULATOR_WAIT="${STALE_EMULATOR_WAIT:-10}"
stop_stale_emulator() {
  local pid="$EMULATOR_PID" signal started
  # Only the pid file of an emulator another process started (CI's step of its own), and only while the pid is still an
  # emulator: a pid left over from an earlier run may belong to any process by now.
  if [ -z "$pid" ]; then
    pid="$(cat "$EMULATOR_PID_FILE" 2>/dev/null || true)"
    case "$(ps -p "${pid:-0}" -o command= 2>/dev/null || true)" in *emulator*|*qemu*) ;; *) pid="" ;; esac
  fi
  adb emu kill >/dev/null 2>&1 || true
  for signal in "" TERM KILL; do
    if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then break; fi
    [ -z "$signal" ] || kill "-$signal" "$pid" 2>/dev/null || true
    started=$SECONDS
    while kill -0 "$pid" 2>/dev/null && [ "$((SECONDS - started))" -lt "$STALE_EMULATOR_WAIT" ]; do sleep 0.1; done
  done
  [ -z "$EMULATOR_PID" ] || wait "$EMULATOR_PID" 2>/dev/null || true
  EMULATOR_PID=""
  rm -f "$EMULATOR_PID_FILE"
}

# The debug app of the run: the APK of the build job, or the Gradle build installed for the web server's address.
install_app() {
  if [ -n "$APK" ]; then adb install -r -t "$APK"
  else gradle installDebug "-Pfivvi.apiBaseUrl=http://10.0.2.2:$PORT/api/"
  fi
}

# The one bounded recovery of #584: the emulator did not boot again after a language switch (CI run 42015816516: no device
# for 300 s, the process gone). Boots the AVD again, cold: a snapshot would only bring back the state before the switch,
# and a framework restart that went wrong is not worth another try. The new emulator is this script's, so cleanup stops
# it. Then the device is set up as at the start of the run. A failure to boot fails the script with the emulator log.
recover_emulator() {
  EMULATOR_RECOVERED=true
  echo "maestro.sh: the emulator did not come back after the language switch; relaunching it once, cold"
  stop_stale_emulator
  mkdir -p "$(dirname "$EMULATOR_LOG")"
  launch_cold
  wait_for_boot
  adb shell input keyevent 82
  root_device
  hide_error_dialogs
  install_app # the crash may have lost the app
  wait_for_device_ready || die "the relaunched emulator is not ready"
}

# Sets the device language; when the emulator does not come back from it, relaunches it once (recover_emulator) and sets
# the language again. Whole flows are never re-run for it.
switch_device_locale() {
  set_device_locale "$1" && return 0
  DEVICE_LOST=true
  [ "$EMULATOR_RECOVERED" = false ] || die "the emulator did not come back after the language switch to $1, even after it was relaunched"
  recover_emulator
  set_device_locale "$1" || die "the emulator did not come back after the language switch to $1, even after it was relaunched"
  DEVICE_LOST=false
}

# After a framework restart Android delivers BOOT_COMPLETED to every app again, which takes a minute or more on CI's 2
# cores. A flow that started during it once found System UI not responding, its dialog over the app (#89). And the
# adb connection of a device that busy has dropped for half a second just as Maestro started (#373): wait until the
# device is online and answering again, also after the broadcasts have settled.
settle_device() {
  adb shell am wait-for-broadcast-idle >/dev/null || {
    echo "maestro.sh: waiting for Android to settle failed; waiting for the device and trying once more"
    wait_for_device_ready && adb shell am wait-for-broadcast-idle >/dev/null
  }
  wait_for_device_ready
}

# A System UI that stops responding while Android settles would still show its dialog over the app; with error dialogs
# hidden, Android restarts System UI instead. Applies at once. ERROR_DIALOGS keeps the device's own value (null: unset).
ERROR_DIALOGS=""
hide_error_dialogs() {
  # Only the first time: after a relaunch (recover_emulator) the setting is already ours.
  [ -n "$ERROR_DIALOGS" ] || ERROR_DIALOGS="$(adb shell settings get global hide_error_dialogs | tr -d '\r')"
  adb shell settings put global hide_error_dialogs 1
}

restore_error_dialogs() {
  case "$ERROR_DIALOGS" in
    "") ;;
    null) adb shell settings delete global hide_error_dialogs >/dev/null ;;
    *) adb shell settings put global hide_error_dialogs "$ERROR_DIALOGS" ;;
  esac
}

# Clears the sign-in rate limits now and every $CLEAR_EVERY seconds in the background, until stop_clearing. A flow that
# signs in as the seeded address would otherwise be the fourth in 15 minutes. A clear that fails in the background is
# logged to stderr, and stop_clearing fails when none of them ever worked. The loop sleeps with /bin/sleep (the tests put
# a fake sleep in PATH) and ends at once on TERM, not after the sleep.
start_clearing() {
  clear_rate_limits
  CLEARER_LOG="$(mktemp "${TMPDIR:-/tmp}/maestro-clearing.XXXXXX")" || die "no temporary file for the rate limit clearing"
  (
    nap=""
    trap '[ -z "$nap" ] || kill "$nap" 2>/dev/null; exit 0' TERM
    while :; do
      /bin/sleep "$CLEAR_EVERY" &
      nap=$!
      wait "$nap" || true
      if output="$(pnpm db:reset-rate-limits 2>&1)"; then
        echo ok >>"$CLEARER_LOG"
      else
        echo fail >>"$CLEARER_LOG"
        echo "maestro.sh: clearing the sign-in rate limits failed (the run goes on): $output" >&2
      fi
    done
  ) &
  CLEARER_PID=$!
}

# Stops the loop and waits until it is gone; fails when it tried to clear and never succeeded. Safe to call twice.
stop_clearing() {
  local status=0
  if [ -n "$CLEARER_PID" ]; then
    kill "$CLEARER_PID" 2>/dev/null || true
    wait "$CLEARER_PID" 2>/dev/null || true
    CLEARER_PID=""
    if [ -s "$CLEARER_LOG" ] && ! grep -q '^ok$' "$CLEARER_LOG"; then
      echo "maestro.sh: the sign-in rate limits were never cleared during the run" >&2
      status=1
    fi
    rm -f "$CLEARER_LOG"
  fi
  return "$status"
}

# The one error a flow may be re-run for: the adb server's answer when the connection to the emulator has dropped
# (#373). A flow that failed otherwise (an assertion, a missing element) is never re-run. A flow that fails right after it,
# when Maestro's driver has lost its adb forward (DeviceServerDiedException), is the same drop.
ADB_DROP_ERROR='Command failed \(host:transport:[^)]*\): device offline'
ADB_DROP_AFTERMATH='DeviceServerDiedException'

# `adb_dropped_flows <junit report> <test output dir>`: prints the flow files of the report's failed flows, one per line,
# when every failed flow is an adb drop, decided from the failure itself: its junit text shows ADB_DROP_ERROR, or
# ADB_DROP_AFTERMATH (a flow that starts after the drop only reports the dead driver; at least one flow must show the
# error itself). Only when that text is exactly `Unknown error` (Maestro's text for a transport error that has no message)
# is the flow's Maestro log read instead. Any other failure text (an assertion, a missing element) is not a drop,
# whatever its log says: a log also holds the steps that are `optional`. A flow without a `file` attribute can't be re-run,
# so it counts as not dropped.
# Prints nothing and fails when there is no failed flow or one of them failed otherwise.
adb_dropped_flows() {
  # shellcheck disable=SC2016 # JavaScript
  node -e 'const fs = require("fs"), path = require("path");
    const [report, dir, drop, aftermath] = process.argv.slice(1);
    const unescape = (text) => text.replace(/&quot;/g, "\"").replace(/&apos;/g, "\x27").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const logs = [];
    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === "maestro.log" && path.basename(path.dirname(full)) === "logs") logs.push(full);
      }
    };
    if (fs.existsSync(dir)) walk(dir);
    const failed = [...fs.readFileSync(report, "utf8").matchAll(/<testcase\b([^>]*)>\s*<failure[^>]*>([\s\S]*?)<\/failure>/g)].map((m) => {
      const attr = (name) => unescape((m[1].match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1] || "");
      return { name: attr("name"), file: attr("file"), message: unescape(m[2]).trim() };
    });
    const drops = new RegExp(drop), aftermaths = new RegExp(aftermath);
    let exact = 0;
    for (const flow of failed) {
      if (!flow.file) process.exit(1);
      const text = flow.message === "Unknown error"
        ? logs.filter((log) => path.basename(path.dirname(path.dirname(log))) === flow.name).map((log) => fs.readFileSync(log, "utf8")).join("\n")
        : flow.message;
      if (drops.test(text)) exact++;
      else if (!aftermaths.test(text)) process.exit(1);
    }
    if (failed.length === 0 || exact === 0) process.exit(1);
    console.log(failed.map((flow) => flow.file).join("\n"))' \
    "$1" "$2" "$ADB_DROP_ERROR" "$ADB_DROP_AFTERMATH"
}

# `run_locale <locale> <report> <maestro command...>`: one `maestro test` for all flows of the locale, with the rate limits
# cleared around it. A failing flow fails the locale (the status), and the run goes on to the next. Flows that failed only
# because the adb connection dropped (adb_dropped_flows) are re-run once, after the device is usable again; the run says so,
# and the second run's report is next to the first (<report>-retry). Flows that pass only on that re-run are reported as
# flaky (TESTING.md §3): a line naming them, and on CI (CI set) a GitHub warning annotation. Ctrl-C stops the whole
# run (Maestro, a JVM, exits 130 on it, so bash doesn't see the signal itself).
run_locale() {
  local locale="$1" report="$2" status=0 flows file flaky
  local -a files=()
  shift 2
  # Both die: this runs as `run_locale … || failed=…`, where set -e is off, and a run without its texts is worthless.
  set_flow_env "$locale" || die "the i18n catalog lacks a text the $locale flows need (packages/i18n)"
  start_clearing
  "$@" test "$ROOT/e2e/maestro" "${FLOW_ENV[@]}" \
    --format junit --output "$REPORTS/$report.xml" --test-output-dir "$REPORTS/$report" || status=$?
  if [ "$status" -ne 0 ] && [ "$status" -ne 130 ] && [ -f "$REPORTS/$report.xml" ] \
    && flows="$(adb_dropped_flows "$REPORTS/$report.xml" "$REPORTS/$report")"; then
    while IFS= read -r file; do files+=("$ROOT/$file"); done <<<"$flows"
    echo "maestro.sh: the adb connection dropped (device offline) in ${#files[@]} flow(s) in $locale; re-running them once:$(printf ' %s' "${files[@]#"$ROOT"/}")"
    status=0
    if [ -z "$DEVICE_RECOVER" ] || "$DEVICE_RECOVER"; then
      "$@" test "${files[@]}" "${FLOW_ENV[@]}" \
        --format junit --output "$REPORTS/$report-retry.xml" --test-output-dir "$REPORTS/$report-retry" || status=$?
      if [ "$status" -eq 0 ]; then
        flaky="flaky: ${#files[@]} flow(s) in $locale failed with a dropped adb connection and passed on the re-run:$(printf ' %s' "${files[@]#"$ROOT"/}")"
        echo "maestro.sh: $flaky"
        [ -z "${CI:-}" ] || echo "::warning title=Flaky Maestro flows::$flaky"
      fi
    else
      status=1
    fi
  fi
  stop_clearing || [ "$status" -ne 0 ] || status=1
  [ "$status" -ne 130 ] || exit 130
  return "$status"
}

cleanup() {
  stop_clearing || true
  stop_stack
  # Also on an emulator relaunched by recover_emulator, which stop_android then stops: the AVD keeps its userdata.
  # Nothing to restore on a device that is gone (a failed relaunch, or a second failed switch).
  if [ "$DEVICE_BOOTED_BY_US" = false ] && [ "$DEVICE_LOST" = false ]; then
    # In this order: Android writes settings to disk a moment later, and the framework restart would lose the write.
    [ -z "$DEVICE_LOCALE" ] || set_device_locale "$DEVICE_LOCALE" || true
    restore_error_dialogs || true
    # An emulator stopped next (EMULATOR_STARTED: a relaunched one) must not be killed before that write: the AVD keeps its
    # userdata, and a lost write would leave the setting on for the next run. (The language restore waited for the boot.)
    [ "$EMULATOR_STARTED" != true ] || sleep "$SETTINGS_WRITE_WAIT"
  fi
  stop_android
}

# The APK installed by --apk, installed again on an emulator relaunched after a language switch (empty: built by Gradle).
APK=""

cmd_android() {
  local apk=""
  case "${1:-}" in
    "") ;;
    --apk) apk="${2:-$MAESTRO_APK}"; [ $# -le 2 ] || usage ;;
    *) usage ;;
  esac
  android_env
  command -v maestro >/dev/null || die "Maestro not found — run scripts/bootstrap.sh --mobile"
  cd "$ROOT"
  on_exit cleanup
  start_stack
  start_emulator
  DEVICE_BOOTED_BY_US=$EMULATOR_STARTED
  root_device
  wait_for_boot
  DEVICE_LOCALE="$(adb shell getprop persist.sys.locale | tr -d '\r')"
  [ -n "$DEVICE_LOCALE" ] || DEVICE_LOCALE="$(adb shell getprop ro.product.locale | tr -d '\r')"
  hide_error_dialogs
  DEVICE_RECOVER=wait_for_device_ready
  if [ -n "$apk" ]; then
    [ -f "$apk" ] || die "no APK at $apk — run scripts/android.sh maestro-apk first"
    APK="$apk"
  fi
  install_app

  local locale failed=""
  for locale in $LOCALES; do
    echo "Maestro on Android in $locale"
    switch_device_locale "$locale"
    settle_device
    run_locale "$locale" "android-$locale" maestro || failed="$failed $locale"
  done
  [ -z "$failed" ] || die "Maestro failed in:$failed (reports: e2e/maestro/build)"
}

# The simulator's own language list and region, set like Settings does; they apply after a restart.
SIMULATOR=""
SIMULATOR_SETTINGS=""
set_simulator_locale() {
  local language="$1" region
  case "$1" in nl-NL) region=nl_NL ;; *) region=en_GB ;; esac
  xcrun simctl spawn "$SIMULATOR" defaults write -g AppleLanguages -array "$language"
  xcrun simctl spawn "$SIMULATOR" defaults write -g AppleLocale -string "$region"
  restart_simulator
}

restart_simulator() {
  xcrun simctl shutdown "$SIMULATOR" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$SIMULATOR" -b >/dev/null
}

cleanup_ios() {
  stop_clearing || true
  stop_stack
  if [ -n "$SIMULATOR_SETTINGS" ] && [ -f "$SIMULATOR_SETTINGS" ]; then
    xcrun simctl spawn "$SIMULATOR" defaults import -g "$SIMULATOR_SETTINGS" || true
    rm -f "$SIMULATOR_SETTINGS"
    # The restored settings apply after a restart, or on the next boot of a simulator that stop_simulator shuts down.
    stop_simulator || restart_simulator || true
  else
    stop_simulator || true
  fi
}

cmd_ios() {
  [ $# -eq 0 ] || usage
  # Only here, so the Android job (maestro.sh android) doesn't depend on the iOS helpers.
  source "$ROOT/scripts/_ios.sh"
  use_xcode || die "Xcode not found — run scripts/bootstrap.sh --mobile"
  java_ok || use_brew_java || die "Java 17+ not found (Maestro needs it) — run scripts/bootstrap.sh --mobile"
  [ -x "$MAESTRO_HOME/bin/maestro" ] || die "Maestro not found — run scripts/bootstrap.sh --mobile"
  export PATH="$MAESTRO_HOME/bin:$PATH"
  cd "$ROOT"
  SIMULATOR="$(ios_simulator)"
  [ -n "$SIMULATOR" ] || die "no iPhone simulator${IOS_SIMULATOR:+ named $IOS_SIMULATOR} — run scripts/bootstrap.sh --mobile"
  on_exit cleanup_ios
  start_stack
  boot_simulator "$SIMULATOR"
  mkdir -p "$REPORTS"
  SIMULATOR_SETTINGS="$REPORTS/simulator-global-defaults.plist"
  xcrun simctl spawn "$SIMULATOR" defaults export -g "$SIMULATOR_SETTINGS"

  # The Debug app with the API on this run's port; the simulator reaches the Mac as localhost.
  echo "Building the iOS app for simulator $SIMULATOR"
  (cd "$IOS_DIR" && xcodebuild build -project FivviPro.xcodeproj -scheme FivviPro -configuration Debug \
    -destination "id=$SIMULATOR" -clonedSourcePackagesDirPath .build/SourcePackages \
    -derivedDataPath .build/MaestroDerivedData -quiet \
    "FIVVI_API_BASE_URL=http://localhost:$PORT/api")
  xcrun simctl install "$SIMULATOR" "$IOS_DIR/.build/MaestroDerivedData/Build/Products/Debug-iphonesimulator/FivviPro.app"

  local locale failed=""
  for locale in $LOCALES; do
    echo "Maestro on iOS in $locale"
    set_simulator_locale "$locale"
    run_locale "$locale" "ios-$locale" maestro --device "$SIMULATOR" || failed="$failed $locale"
  done
  [ -z "$failed" ] || die "Maestro failed on iOS in:$failed (reports: e2e/maestro/build)"
}

case "${1:-}" in
  android) shift; cmd_android "$@" ;;
  ios) shift; cmd_ios "$@" ;;
  *) usage ;;
esac
