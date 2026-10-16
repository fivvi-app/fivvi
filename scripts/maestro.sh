#!/usr/bin/env bash
# The Maestro flows in e2e/maestro against the local stack, once per catalog locale (E008, TESTING.md §7.2).
#
#   maestro.sh android   start Postgres (migrated and seeded) and the web server on E2E_PORT, install the debug app on
#                        the emulator (booted for the run when none is connected), then run every flow with the
#                        emulator's language set to nl-NL and to en (pnpm test:maestro; CI job Android)
#   maestro.sh ios       the same on the newest iPhone simulator (IOS_SIMULATOR="iPhone 17" picks one by name): builds
#                        the Debug app for it against the web server, then runs every flow with the simulator's language
#                        set to nl-NL and to en (local only, to save macOS CI minutes)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$(dirname "${BASH_SOURCE[0]}")/_android.sh"
source "$(dirname "${BASH_SOURCE[0]}")/_ios.sh"

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
  pnpm turbo run build --filter=@trainer-hub/web --output-logs=errors-only
  mkdir -p "$REPORTS"
  (cd apps/web && PORT="$PORT" HOSTNAME=127.0.0.1 exec node --env-file=../../packages/database/.env \
    .next/standalone/apps/web/server.js) >"$REPORTS/web.log" 2>&1 &
  SERVER_PID=$!
  local waited=0
  until curl -fsS "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1; do
    [ "$waited" -lt 60 ] || die "the web server didn't start on port $PORT (log: e2e/maestro/build/web.log)"
    sleep 1; waited=$((waited + 1))
  done
}

# Root on the Google APIs emulator image, so the device language can be changed without a reboot: a framework restart.
set_device_locale() {
  adb shell "setprop persist.sys.locale $1; setprop sys.boot_completed 0; setprop ctl.restart zygote"
  wait_for_boot
}

cleanup() {
  [ -z "$SERVER_PID" ] || kill "$SERVER_PID" 2>/dev/null || true
  if [ -n "$DEVICE_LOCALE" ] && [ "$EMULATOR_STARTED" = false ]; then set_device_locale "$DEVICE_LOCALE" || true; fi
  stop_emulator
}

cmd_android() {
  [ $# -eq 0 ] || usage
  android_env
  command -v maestro >/dev/null || die "Maestro not found — run scripts/bootstrap.sh --mobile"
  cd "$ROOT"
  trap cleanup EXIT
  start_stack
  start_emulator
  adb root >/dev/null
  wait_for_boot
  DEVICE_LOCALE="$(adb shell getprop persist.sys.locale | tr -d '\r')"
  [ -n "$DEVICE_LOCALE" ] || DEVICE_LOCALE="$(adb shell getprop ro.product.locale | tr -d '\r')"
  gradle installDebug "-Ptrainerhub.apiBaseUrl=http://10.0.2.2:$PORT/api/"

  local locale failed=""
  for locale in $LOCALES; do
    echo "Maestro on Android in $locale"
    set_device_locale "$locale"
    maestro test "$ROOT/e2e/maestro" --env "HELLO_TITLE=$(catalog "$locale" hello.title)" \
      --format junit --output "$REPORTS/android-$locale.xml" --test-output-dir "$REPORTS/android-$locale" \
      || failed="$failed $locale"
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
  xcrun simctl boot "$SIMULATOR"
  xcrun simctl bootstatus "$SIMULATOR" >/dev/null
}

cleanup_ios() {
  [ -z "$SERVER_PID" ] || kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$SIMULATOR_SETTINGS" ] && [ -f "$SIMULATOR_SETTINGS" ] || return 0
  xcrun simctl spawn "$SIMULATOR" defaults import -g "$SIMULATOR_SETTINGS" || true
  rm -f "$SIMULATOR_SETTINGS"
  restart_simulator || true
}

cmd_ios() {
  [ $# -eq 0 ] || usage
  use_xcode || die "Xcode not found — run scripts/bootstrap.sh --mobile"
  java_ok || use_brew_java || die "Java 17+ not found (Maestro needs it) — run scripts/bootstrap.sh --mobile"
  [ -x "$MAESTRO_HOME/bin/maestro" ] || die "Maestro not found — run scripts/bootstrap.sh --mobile"
  export PATH="$MAESTRO_HOME/bin:$PATH"
  cd "$ROOT"
  SIMULATOR="$(ios_simulator)"
  [ -n "$SIMULATOR" ] || die "no iPhone simulator${IOS_SIMULATOR:+ named $IOS_SIMULATOR} — run scripts/bootstrap.sh --mobile"
  trap cleanup_ios EXIT
  start_stack
  xcrun simctl boot "$SIMULATOR" 2>/dev/null || true
  xcrun simctl bootstatus "$SIMULATOR" >/dev/null
  mkdir -p "$REPORTS"
  SIMULATOR_SETTINGS="$REPORTS/simulator-global-defaults.plist"
  xcrun simctl spawn "$SIMULATOR" defaults export -g "$SIMULATOR_SETTINGS"

  # The Debug app with the API on this run's port; the simulator reaches the Mac as localhost.
  echo "Building the iOS app for simulator $SIMULATOR"
  (cd "$IOS_DIR" && xcodebuild build -project TrainerHub.xcodeproj -scheme TrainerHub -configuration Debug \
    -destination "id=$SIMULATOR" -clonedSourcePackagesDirPath .build/SourcePackages \
    -derivedDataPath .build/MaestroDerivedData -quiet CODE_SIGNING_ALLOWED=NO \
    "TRAINER_HUB_API_BASE_URL=http://localhost:$PORT/api")
  xcrun simctl install "$SIMULATOR" "$IOS_DIR/.build/MaestroDerivedData/Build/Products/Debug-iphonesimulator/TrainerHub.app"

  local locale failed=""
  for locale in $LOCALES; do
    echo "Maestro on iOS in $locale"
    set_simulator_locale "$locale"
    maestro --device "$SIMULATOR" test "$ROOT/e2e/maestro" --env "HELLO_TITLE=$(catalog "$locale" hello.title)" \
      --format junit --output "$REPORTS/ios-$locale.xml" --test-output-dir "$REPORTS/ios-$locale" \
      || failed="$failed $locale"
  done
  [ -z "$failed" ] || die "Maestro failed on iOS in:$failed (reports: e2e/maestro/build)"
}

case "${1:-}" in
  android) shift; cmd_android "$@" ;;
  ios) shift; cmd_ios "$@" ;;
  *) usage ;;
esac
