#!/usr/bin/env bash
# The result of a native check in CI (#293): the gate job behind the required check names "iOS" and "Android", which
# need their parts (a build job and test jobs). The ruleset names the gate, so it never changes while the parts do.
#
#   native-gate.sh <name> <true|false> <result>...
#       <name>   the check this gate reports: iOS or Android
#       true|false  the native decision of "Detect changes" (scripts/native-jobs.sh) for it
#       <result>...  the result of every job the gate needs (GitHub's needs.*.result: success, failure, cancelled, skipped)
#       Passes when the decision is false (the parts were skipped, the check passes as skipped) or every part succeeded;
#       fails, naming the parts that did not, otherwise: a part that failed, was cancelled or never ran fails the check.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

[ $# -ge 3 ] || usage_of "$0"
name="$1" decision="$2"
shift 2
case "$decision" in true|false) ;; *) usage_of "$0" ;; esac

if [ "$decision" = false ]; then
  echo "$name: skipped, nothing it builds from changed."
  exit 0
fi
bad=()
for result in "$@"; do
  [ "$result" = success ] || bad+=("$result")
done
if [ "${#bad[@]}" -gt 0 ]; then
  echo "::error::$name failed: ${#bad[@]} of $# parts did not succeed (${bad[*]})"
  exit 1
fi
echo "$name: every part succeeded."
