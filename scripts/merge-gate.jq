# Whether an agent may merge a PR (ADR-016, decision 3), from the facts scripts/pr.sh merge collects. Pure: no I/O.
# Input:  {head, default_branch, pr: {number, state, draft, base, body}, risk: {risk, reasons},
#          required: [check name], checks: [statusCheckRollup entry], preview, queue_removed, threads}
# preview: whether the head commit has a Railway preview, "yes", "no" or "pending" (pr.sh preview_of, the definition
# pr.sh smoke uses too; the checks can't tell: Railway's status is green also when it skipped the deploy).
# queue_removed: whether the merge queue removed the head commit (pr.sh queue_state); only the owner queues it again.
# $review_mark, $smoke_mark: the marks of the records pr.sh writes in the PR body (`**<mark>:** …`).
# $no_preview: what pr.sh smoke records when there is no preview.
# There is no "up to date with main" condition: the merge queue tests every PR on top of the latest main (ADR-018).
# Output: {merge, conditions: [{name, ok, detail}]}; merge only when every condition holds. A missing fact fails:
# a head that isn't a full commit SHA, no required checks, an unknown preview, or a record that names no commit.

def short: .[:7];
def is_sha: type == "string" and test("^[0-9a-f]{40}$");
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

def checks_on_head:
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

def checks_passed:
  if .head | is_sha | not then {name: "checks passed", ok: false, detail: "the head commit is unknown"}
  elif (.required | length) == 0 then {name: "checks passed", ok: false, detail: "no required checks to check"}
  else checks_on_head
  end;

def on_head($what; $line):
  ($line | record_sha) as $sha
  | if $line == null then {ok: false, detail: "no \($what) record in the PR body"}
    elif .head | is_sha | not then {ok: false, detail: "the head commit is unknown"}
    elif $sha == null then {ok: false, detail: "the \($what) record names no commit"}
    elif $sha != .head then {ok: false, detail: "the \($what) record is for \($sha | short), not the head \(.head | short)"}
    else {ok: true, detail: "recorded for \(.head | short)"}
    end;

. as $f
| [
    {name: "low-risk", ok: (.risk.risk == "low"),
     detail: (if .risk.risk == "low" then "no high-risk path or owner-merge label"
              else "high-risk: \(.risk.reasons | join("; "))" end)},
    checks_passed,
    {name: "self-review clean"} + on_head("self-review"; $f | record($review_mark)),
    {name: "preview smoke-checked"} + (
      ($f | record($smoke_mark)) as $line
      | if $f.preview | IN("yes", "no", "pending") | not then {ok: false, detail: "whether the PR has a preview is unknown"}
        elif $f.preview == "pending" then {ok: false, detail: "the preview of \($f.head | short) is still deploying"}
        else on_head("smoke check"; $line) end
      | if .ok | not then .
        elif $line | contains("✅") then .
        elif $f.preview == "yes" then {ok: false, detail: "the PR has a preview, but the smoke check record says it has none"}
        elif $line | contains($no_preview) then {ok: true, detail: "no preview, recorded for \($f.head | short)"}
        else {ok: false, detail: "the smoke check did not pass"}
        end),
    {name: "no open threads", ok: (.threads == 0), detail: "\(.threads) unresolved review threads"},
    {name: "ready for review", ok: (.pr.state == "OPEN" and (.pr.draft | not) and .pr.base == .default_branch),
     detail: (if .pr.state != "OPEN" then "the PR is \(.pr.state)" elif .pr.draft then "the PR is a draft"
              elif .pr.base != .default_branch then "the PR targets \(.pr.base), not \(.default_branch)"
              else "open, ready for review, targets \(.default_branch)" end)},
    {name: "not removed from the queue", ok: (.queue_removed == false),
     detail: (if .queue_removed == false then "the merge queue has not removed \(.head | short)"
              elif .queue_removed == true then "GitHub removed \(.head | short) from the merge queue: the owner decides, or fix it and push"
              else "whether the merge queue removed the head commit is unknown" end)}
  ]
| {merge: all(.[]; .ok), conditions: .}
