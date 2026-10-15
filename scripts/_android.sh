#!/usr/bin/env bash
# shellcheck disable=SC2034 # variables here are used by the scripts that source this file
# Android helpers for android.sh and maestro.sh (E008). Source _lib.sh first. Bash 3.2 compatible.

ANDROID_DIR="$ROOT/apps/android"
APP_ID="nl.trainerhub.app"
# Keep in step with compileSdk and buildToolsVersion in apps/android/app/build.gradle.kts.
SDK_PACKAGES="platform-tools platforms;android-37.0 build-tools;37.0.0 emulator"
# The emulator for the Compose UI tests and Maestro. Google APIs images allow `adb root`, which maestro.sh needs to
# set the device language.
AVD_NAME="trainer-hub"
AVD_API=35
MAESTRO_VERSION="2.11.0"
MAESTRO_HOME="$HOME/.maestro"

android_home() {
  if [ -n "${ANDROID_HOME:-}" ]; then echo "$ANDROID_HOME"
  elif [ -n "${ANDROID_SDK_ROOT:-}" ]; then echo "$ANDROID_SDK_ROOT"
  elif [ "$(uname)" = Darwin ]; then echo "$HOME/Library/Android/sdk"
  else echo "$HOME/Android/Sdk"
  fi
}

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
    cacerts="$(find -L "$JAVA_HOME" -path '*/lib/security/cacerts' | head -1)"
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
  export ANDROID_HOME
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$MAESTRO_HOME/bin:$PATH"
}

gradle() { (cd "$ANDROID_DIR" && ./gradlew --console=plain "$@"); }

device_ready() { [ "$(adb get-state 2>/dev/null)" = device ]; }

wait_for_boot() {
  local waited=0
  adb wait-for-device
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
    [ "$waited" -lt 600 ] || die "the emulator didn't finish booting in 10 minutes"
    sleep 2; waited=$((waited + 2))
  done
}

# Boots the AVD headless unless a device is already connected. Sets EMULATOR_STARTED so the caller can stop it.
EMULATOR_STARTED=false
start_emulator() {
  if device_ready; then return; fi
  emulator -list-avds 2>/dev/null | grep -qx "$AVD_NAME" || die "no emulator '$AVD_NAME' — run scripts/bootstrap.sh --mobile"
  mkdir -p "$ANDROID_DIR/build"
  echo "Starting emulator $AVD_NAME (log: apps/android/build/emulator.log)"
  emulator -avd "$AVD_NAME" -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect \
    -camera-back none -camera-front none >"$ANDROID_DIR/build/emulator.log" 2>&1 &
  EMULATOR_STARTED=true
  wait_for_boot
  # Animations make UI tests slow and flaky.
  for setting in window_animation_scale transition_animation_scale animator_duration_scale; do
    adb shell settings put global "$setting" 0
  done
}

stop_emulator() {
  if [ "$EMULATOR_STARTED" = true ]; then adb emu kill >/dev/null 2>&1 || true; fi
}
