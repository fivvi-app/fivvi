#!/usr/bin/env bash
# The Android release lane of E017 (docs/engineering/RELEASE.md), one step per command, run in this order by the `android`
# job of .github/workflows/release.yml on a GitHub-hosted Linux runner. Gradle, keytool and sentry-cli, and a small script
# for the Play Developer API (scripts/play-publish.mjs): no fastlane, no Ruby, no Gradle plugin for Play.
#
#   release-android.sh sdk       installs the SDK platform and build tools the release build needs (no emulator: the
#                                suites ran in the test job) and accepts their licences
#   release-android.sh signing   decodes the upload keystore from the environment to a private file outside the repo and
#                                checks that it opens and holds the key alias. Run it before `bundle`
#   release-android.sh bundle    builds the release App Bundle with the build number of the run (RELEASE_BUILD_NUMBER),
#                                signed with the upload key (Gradle reads the keystore path and the passwords from the
#                                environment), checks its signature and keeps it, alone, in a folder the workflow uploads
#                                as an artifact: for the owner's first upload by hand, which Google's API can't do. The
#                                signed bundle holds a certificate, no secret
#   release-android.sh symbols   uploads the R8 mapping to the Sentry `android` project with sentry-cli, under the release
#                                name the app sends: <application ID>@<version>+<build>. Without a mapping (minification
#                                is off) it is skipped, says so and needs no token. SENTRY_AUTH_TOKEN is an organisation
#                                auth token (it carries the organisation and the region; the commands pass no --org or --url)
#   release-android.sh publish   publishes the bundle of this run to the Play internal testing track
#                                (scripts/play-publish.mjs)
#   release-android.sh cleanup   deletes the keystore and the state. Run it with `if: always()`, so they are gone whatever
#                                failed
#
# A secret comes in through the environment of the step that needs it (ANDROID_UPLOAD_KEYSTORE,
# ANDROID_UPLOAD_KEYSTORE_PASSWORD, ANDROID_UPLOAD_KEY_ALIAS, ANDROID_UPLOAD_KEY_PASSWORD, PLAY_SERVICE_ACCOUNT_JSON,
# SENTRY_AUTH_TOKEN) and is never printed: no command here is traced or echoes a value, and a password reaches keytool and
# Gradle through the environment, not a command line. RELEASE_WORK_DIR (default: under RUNNER_TEMP) holds the files of the
# lane, RELEASE_ANDROID_DIR the Android project (default apps/android; tests give a stand-in), SENTRY_CLI the sentry-cli to
# run (default: the one on the PATH; the workflow names the one pinned in pnpm-lock.yaml).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

# The application ID that apps/android/README.md records as final (checked by `pnpm test:android`).
APPLICATION_ID=app.fivvi.pro
ANDROID_DIR="${RELEASE_ANDROID_DIR:-$ROOT/apps/android}"
WORK="${RELEASE_WORK_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/fivvi-release-android}"
KEYSTORE="$WORK/upload.jks"
BUNDLE_DIR="$WORK/bundle"
BUILT_BUNDLE="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
MAPPING_DIR="$ANDROID_DIR/app/build/outputs/mapping/release"
MAPPING="$MAPPING_DIR/mapping.txt"
SENTRY_PROJECT=android
# What the release build compiles against; keep in step with compileSdk and buildToolsVersion in app/build.gradle.kts
# (scripts/test/release-android.test.mjs checks it).
SDK_PACKAGES=("platforms;android-37.0" "build-tools;37.0.0")

# A required variable of the environment, checked without printing it.
require() {
  [ -n "${!1:-}" ] || die "$1 is not set: the step needs the secret of the same name from the release environment (scripts/release-secrets.sh)"
}

private_dir() { [ -d "$WORK" ] || (umask 077 && mkdir -p "$WORK"); }

# Writes the file $1 from stdin, readable by this user only.
private_file() { (umask 077 && cat >"$1"); }

# The build number of the run: a positive integer without leading zeros, one that Google Play takes as a versionCode.
build_number() {
  local number="${RELEASE_BUILD_NUMBER:-}"
  [[ "$number" =~ ^[1-9][0-9]*$ ]] && [ "${#number}" -le 10 ] && [ "$number" -le 2100000000 ] \
    || die "RELEASE_BUILD_NUMBER is not a build number from 1 to 2100000000: '$number' (scripts/release.sh build-number)"
  echo "$number"
}

# The version both apps share (apps/Version.xcconfig), which Gradle reads for versionName.
app_version() {
  local version
  version="$(sed -nE 's/^[[:space:]]*MARKETING_VERSION[[:space:]]*=[[:space:]]*([^[:space:]]+)[[:space:]]*$/\1/p' "$ANDROID_DIR/../Version.xcconfig")"
  [ -n "$version" ] || die "apps/Version.xcconfig has no MARKETING_VERSION"
  echo "$version"
}

# `<application ID>@<version>+<version code>`, Sentry's format for app releases, as the app builds it (Observability.kt).
release_name() { echo "$APPLICATION_ID@$(app_version)+$(build_number)"; }

# The bundle of this run, in the folder the artifact is taken from.
bundle_file() { echo "$BUNDLE_DIR/fivvi-pro-$(app_version)-$(build_number).aab"; }

sdk() {
  local sdkmanager
  sdkmanager="$(command -v sdkmanager 2>/dev/null || true)"
  [ -n "$sdkmanager" ] || sdkmanager="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}/cmdline-tools/latest/bin/sdkmanager"
  [ -x "$sdkmanager" ] || die "sdkmanager not found: the runner image has the Android SDK command-line tools on the PATH"
  # `yes` answers the licence questions; read through a process substitution so that its SIGPIPE can't fail the step.
  "$sdkmanager" --licenses < <(yes) >/dev/null || die "could not accept the SDK licences"
  "$sdkmanager" --install "${SDK_PACKAGES[@]}" >/dev/null || die "could not install the Android SDK packages: ${SDK_PACKAGES[*]}"
  echo "✅ sdk: ${SDK_PACKAGES[*]}"
}

# True once `signing` has checked the keystore; until then the script ending, for any reason, deletes it.
SIGNING_OK=false
drop_unchecked_keystore() { [ "$SIGNING_OK" = true ] || rm -f "$KEYSTORE"; }

signing() {
  require ANDROID_UPLOAD_KEYSTORE
  require ANDROID_UPLOAD_KEYSTORE_PASSWORD
  require ANDROID_UPLOAD_KEY_ALIAS
  require ANDROID_UPLOAD_KEY_PASSWORD
  need_cmd base64
  need_cmd keytool
  private_dir
  # Whatever fails from here on, the keystore does not stay behind.
  on_exit drop_unchecked_keystore
  printf '%s' "$ANDROID_UPLOAD_KEYSTORE" | base64 --decode | private_file "$KEYSTORE" \
    || die "ANDROID_UPLOAD_KEYSTORE is not base64"
  # The passwords reach keytool through the environment, not its command line.
  keytool -list -keystore "$KEYSTORE" -alias "$ANDROID_UPLOAD_KEY_ALIAS" -storepass:env ANDROID_UPLOAD_KEYSTORE_PASSWORD >/dev/null 2>&1 \
    || die "the upload keystore does not open with ANDROID_UPLOAD_KEYSTORE_PASSWORD or has no key with the alias ANDROID_UPLOAD_KEY_ALIAS: run scripts/release-secrets.sh android again (RELEASE.md §6)"
  SIGNING_OK=true
  echo "✅ signing: the upload keystore opens and holds the key"
}

bundle() {
  local number version file
  number="$(build_number)"
  version="$(app_version)"
  [ -f "$KEYSTORE" ] || die "no upload keystore: run 'release-android.sh signing' first"
  require ANDROID_UPLOAD_KEYSTORE_PASSWORD
  require ANDROID_UPLOAD_KEY_ALIAS
  require ANDROID_UPLOAD_KEY_PASSWORD
  need_cmd jarsigner
  # Nothing of an earlier build may pass for this one: not its bundle, not its mapping.
  rm -rf "$BUNDLE_DIR" "$BUILT_BUNDLE" "$MAPPING_DIR"
  # The release signing configuration (app/build.gradle.kts) reads the keystore path and the passwords from these.
  (cd "$ANDROID_DIR" && ANDROID_UPLOAD_KEYSTORE_FILE="$KEYSTORE" ./gradlew --console=plain :app:bundleRelease \
    "-Pfivvi.buildNumber=$number") || die "the Gradle release build failed"
  [ -f "$BUILT_BUNDLE" ] || die "the build made no App Bundle: $BUILT_BUNDLE"
  file="$(bundle_file)"
  mkdir -p "$BUNDLE_DIR"
  cp "$BUILT_BUNDLE" "$file"
  # Into a variable first: `grep -q` closing the pipe early would fail the pipeline under pipefail.
  local verified
  verified="$(jarsigner -verify "$file" 2>&1 || true)"
  if ! grep -q 'jar verified' <<<"$verified"; then
    rm -f "$file"
    die "the App Bundle is not signed with the upload key (jarsigner: $(head -n 1 <<<"$verified"))"
  fi
  echo "✅ bundle: $(basename "$file"), signed, version $version build $number"
  summary "### Android release" "" "Release \`$(release_name)\`, build number $number" ""
}

symbols() {
  [ -f "$(bundle_file)" ] || die "no App Bundle of this run: run 'release-android.sh bundle' first"
  if [ ! -f "$MAPPING" ]; then
    echo "⏭  symbols: skipped, the release build is not minified (no R8 mapping file), so there is nothing to upload"
    summary "R8 mapping: skipped, the release build is not minified." ""
    return 0
  fi
  require SENTRY_AUTH_TOKEN
  local cli="${SENTRY_CLI:-sentry-cli}" release
  release="$(release_name)"
  "$cli" releases new --project "$SENTRY_PROJECT" "$release" || die "could not create the Sentry release $release"
  "$cli" upload-proguard --project "$SENTRY_PROJECT" "$MAPPING" || die "could not upload the R8 mapping to Sentry"
  "$cli" releases finalize --project "$SENTRY_PROJECT" "$release" || die "could not finalize the Sentry release $release"
  echo "✅ symbols: R8 mapping in the Sentry $SENTRY_PROJECT project, release $release"
}

publish() {
  require PLAY_SERVICE_ACCOUNT_JSON
  need_cmd node
  local number file
  number="$(build_number)"
  file="$(bundle_file)"
  [ -f "$file" ] || die "no App Bundle of this run to publish ($(basename "$file")): run 'release-android.sh bundle' first"
  node "$ROOT/scripts/play-publish.mjs" "$file" "$APPLICATION_ID" "$number" "$(app_version) ($number)" \
    || die "the upload to Play internal testing failed (RELEASE.md §6)"
  summary "Published to the Play internal testing track; testers get it from the Play Store after Google has processed it." ""
}

cleanup() {
  rm -f "$KEYSTORE"
  echo "✅ cleanup: the upload keystore is deleted"
}

command="${1:-}"
[ $# -eq 0 ] || shift
[ $# -eq 0 ] || usage
case "$command" in
  sdk) sdk ;;
  signing) signing ;;
  bundle) bundle ;;
  symbols) symbols ;;
  publish) publish ;;
  cleanup) cleanup ;;
  *) usage ;;
esac
