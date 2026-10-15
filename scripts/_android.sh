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
# Sized for GitHub's runners (2 cores, about 6 GB free disk): the device's defaults want 4 cores and a data partition
# that doesn't fit. 3G holds the app, the test APKs and Maestro's driver.
AVD_SETTINGS="disk.dataPartition.size=3G hw.cpu.ncore=2"
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

gradle() { (cd "$ANDROID_DIR" && ./gradlew --console=plain "$@"); }

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

# Fails; for an emulator this script started, with what it said, and stops it.
emulator_failed() {
  [ -n "$EMULATOR_PID" ] || die "$1"
  {
    echo "error: $1. Last lines of $EMULATOR_LOG:"
    tail -n 40 "$EMULATOR_LOG" 2>/dev/null || true
    echo "emulator -accel-check: $(emulator -accel-check 2>&1 | tr '\n' ' ')"
  } >&2
  kill "$EMULATOR_PID" 2>/dev/null || true
  wait "$EMULATOR_PID" 2>/dev/null || true
  exit 1
}

# Polls instead of `adb wait-for-device`, which waits forever when the emulator never comes up.
wait_for_boot() {
  local waited=0
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
    if [ -n "$EMULATOR_PID" ] && ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
      emulator_failed "the emulator exited while booting"
    fi
    [ "$waited" -lt "$EMULATOR_BOOT_TIMEOUT" ] || emulator_failed "the emulator didn't boot in ${EMULATOR_BOOT_TIMEOUT}s"
    sleep 2; waited=$((waited + 2))
  done
}

# Boots the AVD headless unless a device is already connected. Sets EMULATOR_STARTED so the caller can stop it.
# The flags are those of ReactiveCircus/android-emulator-runner on the same runners, plus `-accel on`: without
# hardware acceleration (KVM, or Hypervisor.Framework on macOS) the emulator fails at once instead of crawling.
EMULATOR_STARTED=false
start_emulator() {
  if device_ready; then return; fi
  avd_exists || die "no emulator '$AVD_NAME' in $ANDROID_AVD_HOME (emulator -list-avds: $(avd_list)) — run scripts/bootstrap.sh --mobile"
  mkdir -p "$(dirname "$EMULATOR_LOG")"
  echo "Starting emulator $AVD_NAME (log: $EMULATOR_LOG, boot timeout ${EMULATOR_BOOT_TIMEOUT}s)"
  emulator -avd "$AVD_NAME" -no-window -no-audio -no-boot-anim -no-snapshot -no-metrics -accel on \
    -gpu swiftshader_indirect -camera-back none -camera-front none >"$EMULATOR_LOG" 2>&1 &
  EMULATOR_PID=$!
  EMULATOR_STARTED=true
  wait_for_boot
  # Unlock the screen (menu key), as android-emulator-runner does; animations make UI tests slow and flaky.
  adb shell input keyevent 82
  for setting in window_animation_scale transition_animation_scale animator_duration_scale; do
    adb shell settings put global "$setting" 0
  done
}

stop_emulator() {
  if [ "$EMULATOR_STARTED" = true ]; then adb emu kill >/dev/null 2>&1 || true; fi
}
