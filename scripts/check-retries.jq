# A cancelled job that has a retry job (ci.yml, #1268): when GitHub has no macOS runner for "iOS build" within 15
# minutes it cancels the job and "iOS build (retry)" builds once more; a cancelled test pass has its own retry the same
# way ("iOS tests (nl)", "iOS tests (nl) (retry)"). The cancelled job is then no failure, so scripts/pr.sh wait and
# scripts/merge-gate.jq (which pr.sh ready and merge use) read their checks through this one definition (#1384). Pure.
# Load with `include "check-retries";` and `jq -L scripts`; a file in scripts/ includes it with `{search: "./"}`.

# The name of the retry job of the job (the input, its name).
def retry_name: "\(.) (retry)";

# The checks (the input, [{name, state, ...}], state "pass", "skip", "pending", "cancel" or "fail"), with every
# cancelled job read by its retry job: a retry that passed makes it "pass", one that is pending makes it "pending",
# and it stays "cancel" when the retry failed, was cancelled or skipped, or when there is no retry job at all.
def settle_retries:
  . as $checks
  | map(. as $check
    | if .state != "cancel" then .
      else
        ([$checks[] | select(.name == ($check.name | retry_name)) | .state] | first) as $retry
        | if $retry == "pass" or $retry == "pending" then .state = $retry else . end
      end);
