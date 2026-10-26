#!/usr/bin/env bash
# The iOS release lane of E017 (docs/engineering/RELEASE.md), one step per command, run in this order by the `ios` job of
# .github/workflows/release.yml on a GitHub-hosted macOS runner. xcodebuild and the macOS tools only: no fastlane, no Ruby.
#
#   release-ios.sh signing   decodes the Apple Distribution certificate and the App Store provisioning profile from the
#                            environment, puts the certificate in a temporary keychain and the profile where Xcode finds
#                            it. Refuses a profile that is not an App Store profile for the bundle ID
#   release-ios.sh archive   archives the Release configuration with the build number of the run (RELEASE_BUILD_NUMBER),
#                            signed with that identity and profile, and checks the version the archive carries
#   release-ios.sh symbols   uploads the dSYMs of the archive to the Sentry `ios` project with sentry-cli, under the release
#                            name the app sends: <bundle ID>@<version>+<build>
#   release-ios.sh upload    exports the archive and uploads it to App Store Connect with the API key, where it becomes
#                            available to the internal TestFlight testers
#   release-ios.sh cleanup   deletes the temporary keychain, the profile, the certificate and the API key file. Run it with
#                            `if: always()`, so they are gone whatever failed
#
# A secret comes in through the environment of the step that needs it (IOS_DISTRIBUTION_CERTIFICATE,
# IOS_DISTRIBUTION_CERTIFICATE_PASSWORD, IOS_PROVISIONING_PROFILE, APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID,
# APP_STORE_CONNECT_API_KEY, SENTRY_AUTH_TOKEN) and is never printed: no command here is traced or echoes a value.
# RELEASE_WORK_DIR (default: under RUNNER_TEMP) holds the files of the lane, PROVISIONING_PROFILES_DIR (default: Xcode's
# folder) the profile, SENTRY_CLI the sentry-cli to run (default: the one on the PATH; the workflow names the one pinned in
# pnpm-lock.yaml).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

# The bundle ID that apps/ios/README.md records as final (checked by `pnpm test:ios`).
BUNDLE_ID=app.fivvi.pro
SCHEME=FivviPro
PROJECT="$ROOT/apps/ios/FivviPro.xcodeproj"
WORK="${RELEASE_WORK_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/fivvi-release-ios}"
PROFILES_DIR="${PROVISIONING_PROFILES_DIR:-$HOME/Library/MobileDevice/Provisioning Profiles}"
KEYCHAIN="$WORK/fivvi-release.keychain-db"
ARCHIVE="$WORK/$SCHEME.xcarchive"
STATE="$WORK/state.env"
SENTRY_PROJECT=ios

# A required variable of the environment, checked without printing it.
require() {
  [ -n "${!1:-}" ] || die "$1 is not set: the step needs the secret of the same name from the release environment (scripts/release-secrets.sh)"
}

private_dir() { [ -d "$WORK" ] || (umask 077 && mkdir -p "$WORK"); }

# Writes the file $1 from stdin, readable by this user only.
private_file() { (umask 077 && cat >"$1"); }

# A value of the decoded profile.
profile_value() { plutil -extract "$1" raw -o - "$WORK/profile.plist" 2>/dev/null; }

# The decoded certificate and profile, which only the step `signing` needs.
remove_decoded_files() { rm -f "$WORK/certificate.p12" "$WORK/profile.plist" "$WORK/profile.mobileprovision"; }

load_state() {
  [ -f "$STATE" ] || die "no signing set up: run 'release-ios.sh signing' first"
  # shellcheck source=/dev/null
  source "$STATE"
}

signing() {
  require IOS_DISTRIBUTION_CERTIFICATE
  require IOS_DISTRIBUTION_CERTIFICATE_PASSWORD
  require IOS_PROVISIONING_PROFILE
  private_dir
  on_exit remove_decoded_files

  printf '%s' "$IOS_PROVISIONING_PROFILE" | base64 --decode | private_file "$WORK/profile.mobileprovision"
  security cms -D -i "$WORK/profile.mobileprovision" | private_file "$WORK/profile.plist"
  local uuid name team application_id
  uuid="$(profile_value UUID)" || die "the provisioning profile has no UUID: is IOS_PROVISIONING_PROFILE the base64 of a .mobileprovision?"
  name="$(profile_value Name)" || die "the provisioning profile has no name"
  team="$(profile_value TeamIdentifier.0)" || die "the provisioning profile has no team"
  application_id="$(profile_value Entitlements.application-identifier)" || die "the provisioning profile has no application identifier"
  [ "$application_id" = "$team.$BUNDLE_ID" ] \
    || die "the provisioning profile is for '$application_id', not for $team.$BUNDLE_ID: create an App Store profile for the bundle ID (RELEASE.md §8)"
  # A development or ad hoc profile lists the devices it allows; an App Store profile lists none.
  ! profile_value ProvisionedDevices.0 >/dev/null \
    || die "the provisioning profile is a development or ad hoc profile: the App Store needs an App Store profile (RELEASE.md §8)"

  mkdir -p "$PROFILES_DIR"
  cp "$WORK/profile.mobileprovision" "$PROFILES_DIR/$uuid.mobileprovision"

  # A keychain of this run only, with a password nobody ever sees; the step `cleanup` deletes it.
  local password existing identities
  password="$(openssl rand -hex 24)"
  printf '%s' "$IOS_DISTRIBUTION_CERTIFICATE" | base64 --decode | private_file "$WORK/certificate.p12"
  security create-keychain -p "$password" "$KEYCHAIN"
  security set-keychain-settings -lut 21600 "$KEYCHAIN"
  security unlock-keychain -p "$password" "$KEYCHAIN"
  security import "$WORK/certificate.p12" -P "$IOS_DISTRIBUTION_CERTIFICATE_PASSWORD" -T /usr/bin/codesign \
    -T /usr/bin/security -f pkcs12 -k "$KEYCHAIN" >/dev/null \
    || die "could not import the Apple Distribution certificate: is IOS_DISTRIBUTION_CERTIFICATE the base64 of a .p12 and its password right?"
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$KEYCHAIN" >/dev/null
  # The keychain joins the search list, so codesign finds the identity; the user's own keychains stay in it.
  existing="$(security list-keychains -d user | tr -d '"')"
  # shellcheck disable=SC2086 # the list is paths without spaces; word splitting is what builds the arguments
  security list-keychains -d user -s "$KEYCHAIN" $existing
  # Into a variable first: `grep -q` closing the pipe early would fail the pipeline under pipefail.
  identities="$(security find-identity -v -p codesigning "$KEYCHAIN")"
  grep -q 'Apple Distribution' <<<"$identities" \
    || die "the certificate is not an Apple Distribution certificate (the keychain has no such identity)"

  {
    printf 'PROFILE_UUID=%q\n' "$uuid"
    printf 'PROFILE_NAME=%q\n' "$name"
    printf 'TEAM_ID=%q\n' "$team"
  } | private_file "$STATE"
  echo "✅ signing: profile '$name' for team $team, certificate in a temporary keychain"
}

# The build number of the run: a positive integer without leading zeros.
build_number() {
  local number="${RELEASE_BUILD_NUMBER:-}"
  [[ "$number" =~ ^[1-9][0-9]*$ ]] || die "RELEASE_BUILD_NUMBER is not a build number: '$number' (scripts/release.sh build-number)"
  echo "$number"
}

# The Info.plist of the app in the archive.
archived_plist() {
  local app
  app="$(find "$ARCHIVE/Products/Applications" -maxdepth 1 -name '*.app' 2>/dev/null | head -n 1)"
  [ -n "$app" ] || die "the archive has no app: $ARCHIVE"
  echo "$app/Info.plist"
}

archived_value() { plutil -extract "$1" raw -o - "$(archived_plist)" 2>/dev/null || die "the archive's Info.plist has no $1"; }

# `<bundle ID>@<version>+<build>`, Sentry's format for app releases, as the app builds it (ErrorReporting.swift), read from
# the archived app itself so the two can't differ.
release_name() { echo "$(archived_value CFBundleIdentifier)@$(archived_value CFBundleShortVersionString)+$(archived_value CFBundleVersion)"; }

archive() {
  local number
  number="$(build_number)"
  load_state
  rm -rf "$ARCHIVE"
  # Debug signing (Local.xcconfig, the team in the project) is not touched: the signing settings are given here, for this
  # archive only. Release.xcconfig has the production address, the Sentry DSN and the shared version.
  xcodebuild archive -project "$PROJECT" -scheme "$SCHEME" -configuration Release -destination generic/platform=iOS \
    -archivePath "$ARCHIVE" -clonedSourcePackagesDirPath "$ROOT/apps/ios/.build/SourcePackages" \
    CURRENT_PROJECT_VERSION="$number" CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="Apple Distribution" \
    DEVELOPMENT_TEAM="$TEAM_ID" PROVISIONING_PROFILE_SPECIFIER="$PROFILE_NAME" OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN" \
    || die "xcodebuild archive failed"
  [ "$(archived_value CFBundleVersion)" = "$number" ] \
    || die "the archive has build number $(archived_value CFBundleVersion), not $number of this run"
  [ "$(archived_value CFBundleIdentifier)" = "$BUNDLE_ID" ] \
    || die "the archive has bundle ID $(archived_value CFBundleIdentifier), not $BUNDLE_ID"
  echo "✅ archive: $(release_name)"
  summary "### iOS release" "" "Release \`$(release_name)\`, build number $number" ""
}

symbols() {
  require SENTRY_AUTH_TOKEN
  [ -d "$ARCHIVE/dSYMs" ] || die "the archive has no dSYMs: run 'release-ios.sh archive' first"
  local cli="${SENTRY_CLI:-sentry-cli}" release
  release="$(release_name)"
  "$cli" releases new --project "$SENTRY_PROJECT" "$release" || die "could not create the Sentry release $release"
  "$cli" debug-files upload --project "$SENTRY_PROJECT" "$ARCHIVE/dSYMs" || die "could not upload the dSYMs to Sentry"
  "$cli" releases finalize --project "$SENTRY_PROJECT" "$release" || die "could not finalize the Sentry release $release"
  echo "✅ symbols: dSYMs in the Sentry $SENTRY_PROJECT project, release $release"
}

# XML text of a value, for ExportOptions.plist.
xml_escape() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' <<<"$1"; }

upload() {
  require APP_STORE_CONNECT_KEY_ID
  require APP_STORE_CONNECT_ISSUER_ID
  require APP_STORE_CONNECT_API_KEY
  [ -d "$ARCHIVE" ] || die "no archive: run 'release-ios.sh archive' first"
  load_state
  local key="$WORK/AuthKey_$APP_STORE_CONNECT_KEY_ID.p8" options="$WORK/ExportOptions.plist"
  printf '%s\n' "$APP_STORE_CONNECT_API_KEY" | private_file "$key"
  # app-store-connect + upload: xcodebuild signs the export and uploads it itself, so the build reaches App Store Connect
  # in one step. Our build number stays (manageAppVersionAndBuildNumber): Xcode must not change it, or Sentry's release
  # name would not match.
  cat >"$options" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key><string>app-store-connect</string>
	<key>destination</key><string>upload</string>
	<key>signingStyle</key><string>manual</string>
	<key>signingCertificate</key><string>Apple Distribution</string>
	<key>teamID</key><string>$(xml_escape "$TEAM_ID")</string>
	<key>provisioningProfiles</key>
	<dict>
		<key>$BUNDLE_ID</key><string>$(xml_escape "$PROFILE_NAME")</string>
	</dict>
	<key>manageAppVersionAndBuildNumber</key><false/>
	<key>uploadSymbols</key><true/>
</dict>
</plist>
EOF
  xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$WORK/export" -exportOptionsPlist "$options" \
    -authenticationKeyPath "$key" -authenticationKeyID "$APP_STORE_CONNECT_KEY_ID" \
    -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID" \
    || die "the export or the upload to App Store Connect failed (RELEASE.md §6)"
  echo "✅ upload: $(release_name) is in App Store Connect"
  summary "Uploaded to App Store Connect; it reaches the internal TestFlight testers after Apple has processed it." ""
}

cleanup() {
  [ ! -e "$KEYCHAIN" ] || security delete-keychain "$KEYCHAIN" || echo "could not delete the keychain $KEYCHAIN" >&2
  if [ -f "$STATE" ]; then
    # shellcheck source=/dev/null
    source "$STATE"
    rm -f "$PROFILES_DIR/${PROFILE_UUID:-none}.mobileprovision"
  fi
  remove_decoded_files
  rm -f "$WORK/state.env" "$WORK"/AuthKey_*.p8 "$WORK/ExportOptions.plist"
  echo "✅ cleanup: temporary keychain, profile and key files deleted"
}

command="${1:-}"
[ $# -eq 0 ] || shift
[ $# -eq 0 ] || usage
case "$command" in
  signing) need_cmd base64; need_cmd openssl; signing ;;
  archive) archive ;;
  symbols) symbols ;;
  upload) upload ;;
  cleanup) cleanup ;;
  *) usage ;;
esac
