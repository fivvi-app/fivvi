#!/usr/bin/env bash
# shellcheck disable=SC2034 # variables here are used by the scripts that source this file
# Android helpers for android.sh and maestro.sh (E008). Source _lib.sh first. Bash 3.2 compatible.

ANDROID_DIR="$ROOT/apps/android"
# Keep in step with compileSdk and buildToolsVersion in apps/android/app/build.gradle.kts.
SDK_PACKAGES="platform-tools platforms;android-37.0 build-tools;37.0.0 emulator"
# The emulator for the Compose UI tests and Maestro. Google APIs images allow `adb root`, which maestro.sh needs to
# set the device language.
AVD_NAME="trainer-hub"
AVD_API=35
# GitHub's runners have 2 cores; the device profile asks for 4. The data partition can't be made smaller: on the first
# boot the emulator creates 6 GB whatever config.ini or -partition-size say, and needs 7.4 GB free for it (CI frees
# disk space before setup).
AVD_SETTINGS="hw.cpu.ncore=2"
MAESTRO_VERSION="2.11.0"
MAESTRO_HOME="$HOME/.maestro"

android_home() {
  if [ -n "${ANDROID_HOME:-}" ]; then echo "$ANDROID_HOME"
  elif [ -n "${ANDROID_SDK_ROOT:-}" ]; then echo "$ANDROID_SDK_ROOT"
  elif [ "$(uname)" = Darwin ]; then echo "$HOME/Library/Android/sdk"
  else echo "$HOME/Android/Sdk"
  fi
}

# avdmanager keeps AVDs in ~/.android/avd, but the emulator looks under XDG_CONFIG_HOME when that is set, as on GitHub's
# Ubuntu runners. Both get this location.
android_avd_home() { echo "${ANDROID_AVD_HOME:-$HOME/.android/avd}"; }

system_image() {
  local abi=x86_64
  case "$(uname -m)" in arm64|aarch64) abi=arm64-v8a ;; esac
  echo "system-images;android-$AVD_API;google_apis;$abi"
}

# Java doesn't read the macOS keychain. Behind a TLS-inspecting proxy whose CA is only in the System keychain, the SDK
# manager and Gradle can't download anything. Give Java a trust store with its own CAs plus the System keychain's.
java_trust_keychain() {
  [ "$(uname)" = Darwin ] || return 0
  local dir="$HOME/.config/trainer-hub" store cacerts certs f
  store="$dir/java-cacerts"
  if [ ! -s "$store" ] || [ /Library/Keychains/System.keychain -nt "$store" ]; then
    cacerts="$(find -L "$JAVA_HOME" -path '*/lib/security/cacerts' 2>/dev/null | head -1 || true)"
    [ -n "$cacerts" ] || return 0
    certs="$dir/keychain-certs"
    rm -rf "$certs" && mkdir -p "$certs"
    cp "$cacerts" "$store.partial" && chmod u+w "$store.partial"
    security find-certificate -a -p /Library/Keychains/System.keychain \
      | awk -v d="$certs" '/BEGIN CERTIFICATE/ { n++ } n { print > (d "/" n ".pem") }'
    for f in "$certs"/*.pem; do
      [ -e "$f" ] || continue
      keytool -importcert -noprompt -keystore "$store.partial" -storepass changeit \
        -alias "keychain-$(basename "$f" .pem)" -file "$f" >/dev/null 2>&1 || true
    done
    mv "$store.partial" "$store"
    rm -rf "$certs"
  fi
  export JAVA_TOOL_OPTIONS="-Djavax.net.ssl.trustStore=$store -Djavax.net.ssl.trustStorePassword=changeit"
}

# JDK, Android SDK and Maestro on PATH for this process.
android_env() {
  java_ok || use_brew_java || die "Java 17+ not found — run scripts/bootstrap.sh --mobile"
  [ -n "${JAVA_HOME:-}" ] || JAVA_HOME="$(java -XshowSettings:properties -version 2>&1 | sed -n 's/^ *java.home = //p')"
  export JAVA_HOME
  java_trust_keychain
  ANDROID_HOME="$(android_home)"
  [ -d "$ANDROID_HOME/platform-tools" ] || die "no Android SDK in $ANDROID_HOME — run scripts/bootstrap.sh --mobile"
  ANDROID_AVD_HOME="$(android_avd_home)"
  export ANDROID_HOME ANDROID_AVD_HOME
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$MAESTRO_HOME/bin:$PATH"
}

# This checkout's Gradle daemons have a registry of their own, so stop_gradle stops only them: never another worktree's
# build, or the daemons of the developer's IDE.
GRADLE_DAEMONS="$ANDROID_DIR/.gradle/daemons"
GRADLE_STARTED=false
gradle() {
  GRADLE_STARTED=true
  (cd "$ANDROID_DIR" && ./gradlew --console=plain "-Dorg.gradle.daemon.registry.base=$GRADLE_DAEMONS" "$@")
}

# Stops the Gradle daemons of this checkout after a run that used them, unless KEEP_DEVICE=1.
stop_gradle() {
  [ "$GRADLE_STARTED" = true ] && [ "${KEEP_DEVICE:-}" != 1 ] || return 0
  gradle --stop >/dev/null 2>&1 || true
}

avd_exists() { emulator -list-avds 2>/dev/null | grep -qx "$AVD_NAME"; }

# What the emulator itself says, for the error when it can't find the AVD.
avd_list() { emulator -list-avds 2>&1 | tail -5 | tr '\n' ' '; }

# Sets AVD_SETTINGS in the AVD's config.ini, replacing any earlier value (`key=value` or `key = value`).
configure_avd() {
  local config="$ANDROID_AVD_HOME/$AVD_NAME.avd/config.ini" setting key
  [ -f "$config" ] || return 1
  for setting in $AVD_SETTINGS; do
    key="${setting%%=*}"
    awk -v key="$key" '{ k = $0; sub(/[ \t]*=.*/, "", k) } k != key' "$config" >"$config.partial"
    echo "$setting" >>"$config.partial"
    mv "$config.partial" "$config"
  done
}

device_ready() { [ "$(adb get-state 2>/dev/null)" = device ]; }

# Seconds to wait for the emulator to boot (a cold boot on CI's KVM runners takes 1–3 minutes).
EMULATOR_BOOT_TIMEOUT="${EMULATOR_BOOT_TIMEOUT:-300}"
EMULATOR_LOG="${EMULATOR_LOG:-$ANDROID_DIR/build/emulator.log}"
EMULATOR_PID=""
# The pid of the emulator `android.sh emulator` started, for `android.sh stop` to wait on from another process.
EMULATOR_PID_FILE="${EMULATOR_PID_FILE:-$EMULATOR_LOG.pid}"
EMULATOR_STOP_TIMEOUT="${EMULATOR_STOP_TIMEOUT:-30}"

# Snapshot boot (AVD_SNAPSHOT=1, set by CI; E002 #91). The first boot of an AVD is cold and saves a snapshot of the
# booted device; CI caches the AVD with it, keyed by `android.sh avd-key`, so later runs load it in seconds. A snapshot
# that is missing, doesn't load in SNAPSHOT_BOOT_TIMEOUT or crashes the emulator is deleted and the emulator boots cold.
# Locally it stays off: every boot is cold and nothing is saved.
AVD_SNAPSHOT="${AVD_SNAPSHOT:-0}"
SNAPSHOT_NAME="default_boot"
SNAPSHOT_BOOT_TIMEOUT="${SNAPSHOT_BOOT_TIMEOUT:-90}"

avd_snapshot_dir() { echo "$ANDROID_AVD_HOME/$AVD_NAME.avd/snapshots/$SNAPSHOT_NAME"; }
snapshot_exists() { [ -f "$(avd_snapshot_dir)/snapshot.pb" ]; }

# What decides whether a cached AVD's snapshot loads: the system image and the emulator (their revisions), and the AVD
# and emulator settings. Prints the CI cache key suffix.
avd_key() {
  local home image emulator_rev image_rev
  home="$(android_home)"
  image="$(system_image)"
  emulator_rev="$(sed -n 's/^Pkg.Revision=//p' "$home/emulator/source.properties" 2>/dev/null | head -1)"
  image_rev="$(sed -n 's/^Pkg.Revision=//p' "$home/system-images/$(tr ';' '/' <<<"$image" | sed 's#^system-images/##')/source.properties" 2>/dev/null | head -1)"
  [ -n "$emulator_rev" ] && [ -n "$image_rev" ] || return 1
  echo "$(tr ';' '-' <<<"$image")-r$image_rev-emulator$emulator_rev-$(echo "$AVD_SETTINGS ${EMULATOR_FLAGS[*]}" | cksum | cut -d' ' -f1)"
}

# Fails; for an emulator this script started, with what it said, and stops it.
emulator_failed() {
  local dir="$ANDROID_AVD_HOME"
  [ -n "$EMULATOR_PID" ] || die "$1"
  while [ ! -d "$dir" ]; do dir="$(dirname "$dir")"; done
  {
    echo "error: $1. Last lines of $EMULATOR_LOG:"
    tail -n 40 "$EMULATOR_LOG" 2>/dev/null || true
    echo "emulator -accel-check: $(emulator -accel-check 2>&1 | tr '\n' ' ')"
    echo "Free space for the emulator ($ANDROID_AVD_HOME):"
    df -h "$dir" || true
  } >&2
  kill_emulator
  exit 1
}

kill_emulator() {
  [ -z "$EMULATOR_PID" ] || kill "$EMULATOR_PID" 2>/dev/null || true
  [ -z "$EMULATOR_PID" ] || wait "$EMULATOR_PID" 2>/dev/null || true
  EMULATOR_PID=""
}

# Polls instead of `adb wait-for-device`, which waits forever when the emulator never comes up. Returns 1, with the
# reason in BOOT_ERROR, when the emulator exits or doesn't boot in $1 seconds.
BOOT_ERROR=""
await_boot() {
  local timeout=$1 waited=0
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
    if [ -n "$EMULATOR_PID" ] && ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
      BOOT_ERROR="the emulator exited while booting"
      return 1
    fi
    if [ "$waited" -ge "$timeout" ]; then
      BOOT_ERROR="the emulator didn't boot in ${timeout}s"
      return 1
    fi
    sleep 2; waited=$((waited + 2))
  done
}

# The same wait for the whole EMULATOR_BOOT_TIMEOUT; fails the script, with the emulator log, when it doesn't boot.
wait_for_boot() { await_boot "$EMULATOR_BOOT_TIMEOUT" || emulator_failed "$BOOT_ERROR"; }

# Boots the AVD headless unless a device is already connected. Sets EMULATOR_STARTED so the caller can stop it.
# The flags are those of ReactiveCircus/android-emulator-runner on the same runners, plus `-accel on`: without
# hardware acceleration (KVM, or Hypervisor.Framework on macOS) the emulator fails at once instead of crawling.
EMULATOR_STARTED=false
EMULATOR_FLAGS=(-no-window -no-audio -no-boot-anim -no-metrics -accel on -gpu swiftshader_indirect -camera-back none -camera-front none)

launch_emulator() {
  emulator -avd "$AVD_NAME" "$@" "${EMULATOR_FLAGS[@]}" >"$EMULATOR_LOG" 2>&1 &
  EMULATOR_PID=$!
  echo "$EMULATOR_PID" >"$EMULATOR_PID_FILE"
  EMULATOR_STARTED=true
}

# Tries the cached snapshot; true when the emulator booted from it. Otherwise it is stopped and the snapshot deleted.
boot_from_snapshot() {
  snapshot_exists || return 1
  echo "Starting emulator $AVD_NAME from its snapshot (log: $EMULATOR_LOG, timeout ${SNAPSHOT_BOOT_TIMEOUT}s)"
  launch_emulator -snapshot "$SNAPSHOT_NAME" -no-snapshot-save
  await_boot "$SNAPSHOT_BOOT_TIMEOUT" && return 0
  echo "::warning::The emulator snapshot didn't load ($BOOT_ERROR); deleting it and booting cold. The cache keeps the old one under this key: bump avd-v1 in ci.yml to cache the new one"
  kill_emulator
  mv "$EMULATOR_LOG" "$EMULATOR_LOG.snapshot" 2>/dev/null || true
  rm -rf "$(avd_snapshot_dir)"
  return 1
}

start_emulator() {
  if device_ready; then return; fi
  avd_exists || die "no emulator '$AVD_NAME' in $ANDROID_AVD_HOME (emulator -list-avds: $(avd_list)) — run scripts/bootstrap.sh --mobile"
  mkdir -p "$(dirname "$EMULATOR_LOG")"
  local started=$SECONDS how="from its snapshot"
  if [ "$AVD_SNAPSHOT" = 1 ] && boot_from_snapshot; then
    :
  else
    how="cold"
    echo "Starting emulator $AVD_NAME (log: $EMULATOR_LOG, boot timeout ${EMULATOR_BOOT_TIMEOUT}s)"
    if [ "$AVD_SNAPSHOT" = 1 ]; then launch_emulator -no-snapshot-load -no-snapshot-save; else launch_emulator -no-snapshot; fi
    wait_for_boot
  fi
  local booted=$((SECONDS - started))
  # Unlock the screen (menu key), as android-emulator-runner does; animations make UI tests slow and flaky.
  adb shell input keyevent 82
  for setting in window_animation_scale transition_animation_scale animator_duration_scale; do
    adb shell settings put global "$setting" 0
  done
  echo "✓ Emulator booted $how in ${booted}s"
  summary "Emulator booted **$how** in **${booted}s**"
  # A cold boot with snapshots on saves the clean state for the next run (cached by CI); never fatal.
  if [ "$AVD_SNAPSHOT" = 1 ] && [ "$how" = cold ] && ! snapshot_exists; then
    adb emu avd snapshot save "$SNAPSHOT_NAME" >/dev/null 2>&1 && snapshot_exists \
      && echo "✓ Saved the emulator snapshot '$SNAPSHOT_NAME'" \
      || echo "::warning::Could not save the emulator snapshot; the next run boots cold"
  fi
}

# Kills the emulator this run started, unless KEEP_DEVICE=1.
stop_emulator() {
  if [ "$EMULATOR_STARTED" = true ] && [ "${KEEP_DEVICE:-}" != 1 ]; then adb emu kill >/dev/null 2>&1 || true; fi
}

# True while the emulator that android.sh emulator started runs, or a device is still connected.
emulator_running() {
  local pid
  if adb devices 2>/dev/null | grep -q '^emulator-'; then return 0; fi
  pid="$(cat "$EMULATOR_PID_FILE" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# Stops the emulator and returns only once it has exited (fails after EMULATOR_STOP_TIMEOUT s), so that nothing is
# still writing to the AVD when CI saves its cache. Works from another process than the one that booted it.
stop_emulator_and_wait() {
  local waited=0
  if ! emulator_running; then echo "No emulator running"; return 0; fi
  kill_emulator
  adb emu kill >/dev/null 2>&1 || true
  while emulator_running; do
    [ "$waited" -lt "$EMULATOR_STOP_TIMEOUT" ] || die "the emulator didn't exit in ${EMULATOR_STOP_TIMEOUT}s (log: $EMULATOR_LOG)"
    sleep 2; waited=$((waited + 2))
  done
  rm -f "$EMULATOR_PID_FILE"
  echo "✓ Emulator stopped in ${waited}s"
}

# What a test run started: the emulator and the Gradle daemons.
stop_android() {
  stop_emulator
  stop_gradle
}
