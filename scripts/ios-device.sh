#!/usr/bin/env bash
# Runs the Debug app on a real iPhone (E008): builds it, installs it and launches it. The signing team and the API come
# from apps/ios/Config/Local.xcconfig (git-ignored): DEVELOPMENT_TEAM and TRAINER_HUB_API_BASE_URL (apps/ios/README.md).
#
#   ios-device.sh [nl|en]   on the paired iPhone (by cable, or on the same network once paired); IOS_DEVICE=<udid>
#                           picks one of several. With nl or en, launches the app in that device language
#                           (-AppleLanguages)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
source "$ROOT/scripts/_ios.sh"

language=""
case "$#:${1:-}" in
  0:) ;;
  1:nl | 1:en) language="$1" ;;
  *) usage_of "$0" ;;
esac

LOCAL_XCCONFIG=apps/ios/Config/Local.xcconfig

# The value of setting $1 in Local.xcconfig, without a trailing comment; empty when it isn't set there.
local_setting() {
  [ -f "$ROOT/$LOCAL_XCCONFIG" ] || return 0
  sed -nE "s#^[[:space:]]*$1[[:space:]]*=[[:space:]]*##p" "$ROOT/$LOCAL_XCCONFIG" \
    | sed -E 's#[[:space:]]*//.*$##; s#[[:space:]]+$##' | tail -n 1
}

# `<udid> <name>` of every iPhone paired with this Mac, one per line.
paired_iphones() {
  xcrun devicectl list devices --quiet --json-output - | jq -r '.result.devices[]
    | select(.hardwareProperties.reality == "physical" and .hardwareProperties.deviceType == "iPhone"
      and .connectionProperties.pairingState == "paired")
    | "\(.hardwareProperties.udid) \(.deviceProperties.name)"'
}

# `xcrun devicectl device …`, quiet unless it fails. A locked iPhone gets its own message.
device() {
  local out
  out="$(xcrun devicectl device "$@" 2>&1)" && return
  echo "$out" >&2
  if grep -qi 'unlocked' <<<"$out"; then die "the iPhone is locked: unlock $name and run scripts/ios-device.sh again"; fi
  die "devicectl device $1 $2 failed on $name"
}

team="$(local_setting DEVELOPMENT_TEAM)"
[ -n "$team" ] || die "no signing team: add \`DEVELOPMENT_TEAM = <your Apple team ID>\` to $LOCAL_XCCONFIG (git-ignored, apps/ios/README.md)"
api="$(local_setting TRAINER_HUB_API_BASE_URL)"
if [ -z "$api" ]; then
  echo "warning: no TRAINER_HUB_API_BASE_URL in $LOCAL_XCCONFIG: the app calls localhost, which on a phone is the phone itself" >&2
fi

need_cmd jq
use_xcode || die "Xcode not found — run scripts/bootstrap.sh --mobile"

phones="$(paired_iphones)"
[ -n "$phones" ] || die "no paired iPhone: connect it with a cable, unlock it, tap Trust, and turn on Developer Mode (Settings › Privacy & Security)"
if [ -n "${IOS_DEVICE:-}" ]; then
  phone="$(awk -v udid="$IOS_DEVICE" '$1 == udid' <<<"$phones")"
  [ -n "$phone" ] || die "IOS_DEVICE=$IOS_DEVICE is not a paired iPhone; paired:"$'\n'"$phones"
elif [ "$(grep -c . <<<"$phones")" -gt 1 ]; then
  die "several paired iPhones; pick one with IOS_DEVICE=<udid>:"$'\n'"$phones"
else
  phone="$phones"
fi
udid="${phone%% *}"
name="${phone#* }"

cd "$IOS_DIR"
# shellcheck disable=SC2016 # the xcconfig's literal `$()`, which keeps `//` from starting a comment
echo "▶ Build the Debug app for $name ($udid), team $team, API ${api:-localhost}" | sed 's#\$()##g'
xcodebuild -project TrainerHub.xcodeproj -scheme TrainerHub -configuration Debug -destination "id=$udid" \
  -clonedSourcePackagesDirPath .build/SourcePackages -derivedDataPath .build/DerivedData -allowProvisioningUpdates \
  -quiet build
app="$IOS_DIR/.build/DerivedData/Build/Products/Debug-iphoneos/TrainerHub.app"
bundle_id="$(plutil -extract CFBundleIdentifier raw -o - "$app/Info.plist")"

echo "▶ Install on $name"
device install app --device "$udid" "$app"
echo "▶ Launch $bundle_id${language:+ in $language}"
if [ -n "$language" ]; then
  device process launch --device "$udid" --terminate-existing "$bundle_id" -- -AppleLanguages "($language)"
else
  device process launch --device "$udid" --terminate-existing "$bundle_id"
fi
echo "✓ Trainer Hub runs on $name"
