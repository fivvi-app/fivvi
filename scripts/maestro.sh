#!/usr/bin/env bash
# The Maestro flows in e2e/maestro against the local stack, once per catalog locale (E008, TESTING.md §7.2).
#
#   maestro.sh android   start Postgres (migrated and seeded) and the web server on E2E_PORT, install the debug app on
#                        the emulator (booted for the run when none is connected), then run every flow with the
#                        emulator's language set to nl-NL and to en, each once Android has settled after the change
#                        (pnpm test:maestro; CI job Android)
#   maestro.sh ios       the same on the worktree's own simulator, or the newest iPhone in the main checkout
#                        (IOS_SIMULATOR="iPhone 17" picks one by name): builds the Debug app for it against the web
#                        server, then runs every flow with the simulator's language set to nl-NL and to en (local only,
#                        to save macOS CI minutes)
#
# Before the first flow, the web server has answered GET /api/v1/hello, the app's first request, in both locales.
# When it ends, also on failure or Ctrl-C, it stops the emulator or simulator it booted and its Gradle daemons;
# KEEP_DEVICE=1 leaves them running for the next run. On an emulator it didn't boot, it restores the language and the
# error dialog setting.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$(dirname "${BASH_SOURCE[0]}")/_android.sh"

usage() { usage_of "$0"; }

LOCALES="nl-NL en"
PORT="${E2E_PORT:-$(e2e_port "$ROOT")}"
REPORTS="$ROOT/e2e/maestro/build"
SERVER_PID=""
DEVICE_LOCALE=""
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

# The catalog text of a dotted key, e.g. `catalog en hello.title`: what the screen should show.
catalog() {
  node -e 'const [file, key] = process.argv.slice(1);
    console.log(key.split(".").reduce((o, k) => o[k], JSON.parse(require("fs").readFileSync(file, "utf8"))))' \
    "$ROOT/packages/i18n/$1.json" "$2"
}

start_stack() {
  docker info >/dev/null 2>&1 || die "Docker is not running — start it (Postgres for the local stack)"
  [ -f packages/database/.env ] || cp packages/database/.env.example packages/database/.env
  pnpm db:up >/dev/null
  pnpm db:migrate >/dev/null
  pnpm db:seed >/dev/null
  pnpm turbo run build --filter=@fivvi/web --output-logs=errors-only
  mkdir -p "$REPORTS"
  (cd apps/web && PORT="$PORT" HOSTNAME=127.0.0.1 exec node --env-file=../../packages/database/.env \
    .next/standalone/apps/web/server.js) >"$REPORTS/web.log" 2>&1 &
  SERVER_PID=$!
  local waited=0
  until curl -fsS "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1; do
    [ "$waited" -lt 60 ] || die "the web server didn't start on port $PORT (log: e2e/maestro/build/web.log)"
    sleep 1; waited=$((waited + 1))
  done
  warm_up_hello
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

# Root on the Google APIs emulator image, so the device language can be changed without a reboot: a framework restart.
set_device_locale() {
  adb shell "setprop persist.sys.locale $1; setprop sys.boot_completed 0; setprop ctl.restart zygote"
  wait_for_boot
}

# After a framework restart Android delivers BOOT_COMPLETED to every app again, which takes a minute or more on CI's 2
# cores. A flow that started during it once found System UI not responding, its dialog over the app (#89).
settle_device() { adb shell am wait-for-broadcast-idle >/dev/null; }

# A System UI that stops responding while Android settles would still show its dialog over the app; with error dialogs
# hidden, Android restarts System UI instead. Applies at once. ERROR_DIALOGS keeps the device's own value (null: unset).
ERROR_DIALOGS=""
hide_error_dialogs() {
  ERROR_DIALOGS="$(adb shell settings get global hide_error_dialogs | tr -d '\r')"
  adb shell settings put global hide_error_dialogs 1
}

restore_error_dialogs() {
  case "$ERROR_DIALOGS" in
    "") ;;
    null) adb shell settings delete global hide_error_dialogs >/dev/null ;;
    *) adb shell settings put global hide_error_dialogs "$ERROR_DIALOGS" ;;
  esac
}

# After a failed run of the flows in locale $1: Ctrl-C stops the whole run (Maestro, a JVM, exits 130 on it, so bash
# doesn't see the signal itself); any other failure goes on to the next locale.
stopped_or_failed() {
  local status=$?
  [ "$status" -ne 130 ] || exit 130
  failed="$failed $1"
}

cleanup() {
  [ -z "$SERVER_PID" ] || kill "$SERVER_PID" 2>/dev/null || true
  if [ "$EMULATOR_STARTED" = false ]; then
    # In this order: Android writes settings to disk a moment later, and the framework restart would lose the write.
    [ -z "$DEVICE_LOCALE" ] || set_device_locale "$DEVICE_LOCALE" || true
    restore_error_dialogs || true
  fi
  stop_android
}

cmd_android() {
  [ $# -eq 0 ] || usage
  android_env
  command -v maestro >/dev/null || die "Maestro not found — run scripts/bootstrap.sh --mobile"
  cd "$ROOT"
  on_exit cleanup
  start_stack
  start_emulator
  adb root >/dev/null
  wait_for_boot
  DEVICE_LOCALE="$(adb shell getprop persist.sys.locale | tr -d '\r')"
  [ -n "$DEVICE_LOCALE" ] || DEVICE_LOCALE="$(adb shell getprop ro.product.locale | tr -d '\r')"
  hide_error_dialogs
  gradle installDebug "-Pfivvi.apiBaseUrl=http://10.0.2.2:$PORT/api/"

  local locale failed=""
  for locale in $LOCALES; do
    echo "Maestro on Android in $locale"
    set_device_locale "$locale"
    settle_device
    maestro test "$ROOT/e2e/maestro" --env "HELLO_TITLE=$(catalog "$locale" hello.title)" \
      --format junit --output "$REPORTS/android-$locale.xml" --test-output-dir "$REPORTS/android-$locale" \
      || stopped_or_failed "$locale"
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
  [ -z "$SERVER_PID" ] || kill "$SERVER_PID" 2>/dev/null || true
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
    -derivedDataPath .build/MaestroDerivedData -quiet CODE_SIGNING_ALLOWED=NO \
    "FIVVI_API_BASE_URL=http://localhost:$PORT/api")
  xcrun simctl install "$SIMULATOR" "$IOS_DIR/.build/MaestroDerivedData/Build/Products/Debug-iphonesimulator/FivviPro.app"

  local locale failed=""
  for locale in $LOCALES; do
    echo "Maestro on iOS in $locale"
    set_simulator_locale "$locale"
    maestro --device "$SIMULATOR" test "$ROOT/e2e/maestro" --env "HELLO_TITLE=$(catalog "$locale" hello.title)" \
      --format junit --output "$REPORTS/ios-$locale.xml" --test-output-dir "$REPORTS/ios-$locale" \
      || stopped_or_failed "$locale"
  done
  [ -z "$failed" ] || die "Maestro failed on iOS in:$failed (reports: e2e/maestro/build)"
}

case "${1:-}" in
  android) shift; cmd_android "$@" ;;
  ios) shift; cmd_ios "$@" ;;
  *) usage ;;
esac
