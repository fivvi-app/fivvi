#!/usr/bin/env bash
# The result of a native check in CI (#293): the gate job behind the required check names "iOS" and "Android", which
# need their parts (a build job and test jobs). The ruleset names the gate, so it never changes while the parts do.
#
#   native-gate.sh <name> <true|false> <part>...
#       <name>   the check this gate reports: iOS or Android
#       true|false  the native decision of "Detect changes" (scripts/native-jobs.sh) for it
#       <part>...  one per job the gate needs: [<label>=]<result>[:<retry>]
#           <result>  success, failure, cancelled or skipped (GitHub's needs.*.result), or unacquired: no hosted runner
#                     picked the job up, so no step ran (scripts/ios-parts.sh finds that out, #413)
#           <retry>   the result of the retry of that part on a pool with other capacity; read only for unacquired. Several
#                     (the build is retried once per language) are joined with +, as success+failure: all must succeed
#       Passes when the decision is false (the parts were skipped, the check passes as skipped) or every part succeeded,
#       or had no runner and its retry succeeded. Otherwise fails, naming the parts that did not: a part that failed,
#       was cancelled or never ran fails the check. The error says for each part whether no runner picked it up (and
#       what the retry did) or a runner ran it and it failed, was cancelled (a timeout, or a person) or never ran.
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
# One line per part that did not succeed in $reasons, one per part that passed on its retry in $retried.
bad=() reasons="" retried="" index=0
for part in "$@"; do
  index=$((index + 1))
  label="part $index" value="$part"
  case "$part" in *=*) label="${part%%=*}" value="${part#*=}" ;; esac
  result="${value%%:*}" retry=""
  case "$value" in *:*) retry="${value#*:}" ;; esac
  case "$result" in
    success) continue ;;
    unacquired)
      # More than one retry (the build, retried once per language): all of them must pass.
      all_passed=true
      IFS='+' read -ra retry_results <<<"$retry"
      [ "${#retry_results[@]}" -gt 0 ] || all_passed=false
      for retry_result in ${retry_results[@]+"${retry_results[@]}"}; do
        [ "$retry_result" = success ] || all_passed=false
      done
      if $all_passed; then
        retried+="$name: $label: no runner picked it up; the retry passed."$'\n'
        continue
      fi
      case "$retry" in
        failure) reasons+="$label: no runner picked it up, and the retry failed (build or test failure on the retry)."$'\n' ;;
        *) reasons+="$label: no runner picked it up, and the retry did not pass (${retry:-no result})."$'\n' ;;
      esac
      ;;
    failure) reasons+="$label: failed on a runner ($result): a build or test failure."$'\n' ;;
    cancelled) reasons+="$label: cancelled on a runner (a timeout, or a person cancelled the run)."$'\n' ;;
    skipped) reasons+="$label: did not run ($result): the part before it did not succeed."$'\n' ;;
    *) reasons+="$label: ended as $result, not success."$'\n' ;;
  esac
  bad+=("$part")
done
printf '%s' "$retried"
if [ "${#bad[@]}" -gt 0 ]; then
  echo "::error::$name failed: ${#bad[@]} of $# parts did not succeed (${bad[*]})"
  while IFS= read -r line; do
    [ -z "$line" ] || echo "::error::$line"
  done <<<"$reasons"
  exit 1
fi
echo "$name: every part succeeded."
