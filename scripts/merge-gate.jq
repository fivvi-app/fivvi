# Whether an agent may merge a PR (ADR-016, decision 3), from the facts scripts/pr.sh merge collects. Pure: no I/O.
# Input:  {head, default_branch, pr: {number, state, draft, base, body}, risk: {risk, reasons},
#          required: [check name], checks: [statusCheckRollup entry], behind, threads}
# Output: {merge, conditions: [{name, ok, detail}]}; merge only when every condition holds.

def short: .[:7];
def ok_result: IN("SUCCESS", "SKIPPED", "NEUTRAL");
def pending_result: IN("PENDING", "EXPECTED");

# One entry per check: CheckRuns report status and conclusion, commit statuses (Railway) a state.
def results:
  [.checks[] | {name: (.name // .context),
    result: (if .__typename == "StatusContext" then .state
             elif .status != "COMPLETED" then "PENDING"
             else .conclusion end)}];

# The last line of the PR body that records <mark> (`**<mark>:** …`, written by pr.sh), or null.
def record($mark):
  [.pr.body | split("\n")[] | rtrimstr("\r") | select(startswith("**\($mark):**"))] | last // null;
def record_sha: if . == null then null else (capture("`(?<sha>[0-9a-f]{40})`").sha // null) end;

def checks_passed:
  .head as $head
  | results as $results
  | ([$results[] | select(.result | ok_result | not) | select(.result | pending_result | not) | .name]) as $failing
  | ([$results[] | select(.result | pending_result) | .name]) as $pending
  | ([.required[] as $r | select([$results[].name] | index($r) | not) | $r]) as $missing
  | {name: "checks passed", ok: ($failing + $pending + $missing | length == 0),
     detail: ([(if $failing != [] then "failing: \($failing | join(", "))" else empty end),
               (if $pending != [] then "pending: \($pending | join(", "))" else empty end),
               (if $missing != [] then "missing: \($missing | join(", "))" else empty end)]
              | if . == [] then "\($results | length) checks passed on \($head | short)" else join("; ") end)};

def on_head($what; $line):
  ($line | record_sha) as $sha
  | if $line == null then {ok: false, detail: "no \($what) record in the PR body"}
    elif $sha != .head then {ok: false, detail: "the \($what) record is for \($sha // "no commit" | short), not the head \(.head | short)"}
    else {ok: true, detail: "recorded for \(.head | short)"}
    end;

. as $f
| [
    {name: "low-risk", ok: (.risk.risk == "low"),
     detail: (if .risk.risk == "low" then "no high-risk path or owner-merge label"
              else "high-risk: \(.risk.reasons | join("; "))" end)},
    checks_passed,
    {name: "self-review clean"} + on_head("self-review"; $f | record("Self-review")),
    {name: "preview smoke-checked"} + (
      if ([results[] | select(.name == "trainer-hub - web")] | length) == 0 then {ok: true, detail: "no preview"}
      else ($f | record("Railway preview smoke check")) as $line
        | on_head("smoke check"; $line)
        | if .ok and ($line | contains("✅") | not) then {ok: false, detail: "the smoke check did not pass"} else . end
      end),
    {name: "up to date", ok: (.behind == 0),
     detail: (if .behind == 0 then "up to date with \(.default_branch)" else "\(.behind) commits behind \(.default_branch)" end)},
    {name: "no open threads", ok: (.threads == 0), detail: "\(.threads) unresolved review threads"},
    {name: "ready for review", ok: (.pr.state == "OPEN" and (.pr.draft | not) and .pr.base == .default_branch),
     detail: (if .pr.state != "OPEN" then "the PR is \(.pr.state)" elif .pr.draft then "the PR is a draft"
              elif .pr.base != .default_branch then "the PR targets \(.pr.base), not \(.default_branch)"
              else "open, ready for review, targets \(.default_branch)" end)}
  ]
| {merge: all(.[]; .ok), conditions: .}
