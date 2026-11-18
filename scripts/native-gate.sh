#!/usr/bin/env bash
# The result of a native check in CI (#293): the gate job behind the required check names "iOS" and "Android", which
# need their parts (a build job and test jobs). The ruleset names the gate, so it never changes while the parts do.
#
#   native-gate.sh [--skip-ok <label>]... <name> <true|false> <part>...
#       --skip-ok <label>  (ADR-034) a part with that label that is `skipped` counts as a success, because ci.yml skipped it on
#                  purpose (the Maestro job when the run has no UI tests). Only the part with that label, only `skipped`:
#                  every other result of it, and every other part, is judged as before. ci.yml passes it only when "Detect
#                  changes" says `ui_tests` is `false`; without it a skipped part fails the gate
#       <name>   the check this gate reports: iOS or Android
#       true|false  the native decision of "Detect changes" (scripts/native-jobs.sh) for it
#       <part>...  one per job the gate needs: [<label>=]<result>
#           <result>  success, failure, cancelled, skipped or abandoned (GitHub's needs.*.result; abandoned is a job no hosted
#                     runner took, #1268), or unacquired: no hosted runner picked the job up, so no step ran
#                     (scripts/ios-parts.sh finds that out, #413)
#       Passes when the decision is false (the parts were skipped, the check passes as skipped) or every part succeeded;
#       fails, naming the parts that did not, otherwise: a part that failed, was cancelled or never ran fails the check.
#       The error says for each labelled part whether no runner picked it up (nothing ran, or the run was cancelled before
#       one did: if nobody cancelled it, re-queuing the PR is enough)
#       or a runner ran it and it failed, was cancelled (a timeout, or a person) or never ran. A part without a label
#       (Android's) is named by its result only.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

skip_ok=()
while [ "${1:-}" = --skip-ok ]; do
  [ $# -ge 2 ] || usage_of "$0"
  skip_ok+=("$2")
  shift 2
done
[ $# -ge 3 ] || usage_of "$0"
name="$1" decision="$2"
shift 2
case "$decision" in true|false) ;; *) usage_of "$0" ;; esac

if [ "$decision" = false ]; then
  echo "$name: skipped, nothing it builds from changed."
  exit 0
fi
# One line per labelled part that did not succeed in $reasons.
bad=() reasons=""
for part in "$@"; do
  label="" result="$part"
  case "$part" in *=*) label="${part%%=*}" result="${part#*=}" ;; esac
  [ "$result" = success ] && continue
  if [ "$result" = skipped ] && [ -n "$label" ] && [[ " ${skip_ok[*]:-} " == *" $label "* ]]; then
    echo "$label: skipped on purpose (no UI tests in this run), counts as a success."
    continue
  fi
  bad+=("$part")
  [ -n "$label" ] || continue
  case "$result" in
    unacquired|abandoned) reasons+="$label: no hosted runner picked it up, or the run was cancelled before one did, so nothing ran (GitHub's capacity, not a build or test failure, #413). If nobody cancelled the run, re-queue the PR."$'\n' ;;
    failure) reasons+="$label: failed on a runner ($result): a build or test failure."$'\n' ;;
    cancelled) reasons+="$label: cancelled on a runner (a timeout, or a person cancelled the run)."$'\n' ;;
    skipped) reasons+="$label: did not run ($result): the part before it did not succeed."$'\n' ;;
    *) reasons+="$label: ended as $result, not success."$'\n' ;;
  esac
done
if [ "${#bad[@]}" -gt 0 ]; then
  echo "::error::$name failed: ${#bad[@]} of $# parts did not succeed (${bad[*]})"
  while IFS= read -r line; do
    [ -z "$line" ] || echo "::error::$line"
  done <<<"$reasons"
  exit 1
fi
echo "$name: every part succeeded."
