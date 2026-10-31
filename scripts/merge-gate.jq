# Whether an agent may merge a PR (ADR-016, decision 3; ADR-021), from the facts scripts/pr.sh merge collects.
# Pure: no I/O.
# Input:  {head, default_branch, pr: {number, state, draft, base, body}, risk: {risk: low|high|owner, reasons},
#          required: [check name], checks: [statusCheckRollup entry], preview, queue_removed, queue_removed_at, requeued,
#          after: null|{bug, issue, blocks, state, state_reason, closed_at}, threads}
# preview: whether the head commit has a Railway preview, "yes", "no" or "pending" (pr.sh preview_of, the definition
# pr.sh smoke uses too; the checks can't tell: Railway's status is green also when it skipped the deploy).
# queue_removed: whether the merge queue removed the head commit (pr.sh queue_state), at queue_removed_at. Only the owner
# queues it again, except after a fix (ADR-025): `pr.sh merge --after <bug>` passes `after`, what it read of <bug> among
# the blockers of the issue the PR closes (blocks: whether it is one; issue: that issue), and requeued, whether the PR
# body already records a re-queue of the head commit after a fix. The condition then also passes when <bug> blocks the
# issue, was closed as completed after the removal, and the head commit was not re-queued after a fix before.
# $review_mark, $smoke_mark: the marks of the records pr.sh writes in the PR body (`**<mark>:** …`).
# $no_preview: what pr.sh smoke records when there is no preview.
# The first condition is "not owner-only": low and high pass, owner (and an unknown risk) fails (ADR-021).
# There is no "up to date with main" condition: the merge queue tests every PR on top of the latest main (ADR-018).
# Output: {merge, conditions: [{name, ok, detail}]}; merge only when every condition holds. A missing fact fails:
# a head that isn't a full commit SHA, no required checks, an unknown preview, or a record that names no commit.

include "records" {search: "./"};

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

# The condition "not removed from the queue" of a commit the queue removed, when pr.sh merge was given --after <bug>.
# Every failed condition is named, so the refusal says what to fix.
def requeue_after:
  (.head | short) as $head
  | .after as $a
  | ($a.bug | tostring) as $bug
  | [ (if $a.state != "CLOSED" then "#\($bug) is not closed"
       elif $a.state_reason != "COMPLETED" then "#\($bug) was not closed as completed"
       else empty end),
      (if ($a.issue | type) != "number" then "the PR closes no issue for #\($bug) to block"
       elif $a.blocks != true then "#\($bug) does not block #\($a.issue)"
       else empty end),
      (if ($a.closed_at | instant) == null or (.queue_removed_at | instant) == null then
         "when #\($bug) was closed, or when the queue removed \($head), is unknown"
       elif ($a.closed_at | instant) <= (.queue_removed_at | instant) then
         "#\($bug) was closed before the queue removed \($head)"
       else empty end),
      (if .requeued == false then empty
       elif .requeued == true then "\($head) was already re-queued once after a fix: the owner decides"
       else "whether \($head) was re-queued after a fix before is unknown" end)
    ]
  | if length == 0 then {ok: true, detail: "GitHub removed \($head) from the merge queue; it is re-queued after #\($bug) fixed the check that removed it"}
    else {ok: false, detail: "--after #\($bug): \(join("; "))"} end;

def not_removed:
  if .queue_removed == false then
    {ok: (.after == null),
     detail: (if .after == null then "the merge queue has not removed \(.head | short)"
              else "the merge queue has not removed \(.head | short): there is nothing to re-queue, merge without --after" end)}
  elif .queue_removed == true then
    if (.after | type) == "object" and (.after.bug | type) == "number" then requeue_after
    else {ok: false, detail: "GitHub removed \(.head | short) from the merge queue: the owner decides, or fix it and push, or, when the cause was outside the PR and a bug that blocks its issue is fixed, pr.sh merge --after <bug> (ADR-025)"} end
  else {ok: false, detail: "whether the merge queue removed the head commit is unknown"}
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
    {name: "not owner-only", ok: (.risk.risk | IN("low", "high")),
     detail: (if .risk.risk == "low" then "no high-risk path or label"
              elif .risk.risk == "high" then "high-risk, agent-queueable: \(.risk.reasons | join("; "))"
              elif .risk.risk == "owner" then "owner-only: \(.risk.reasons | join("; "))"
              else "the risk is unknown: the owner decides" end)},
    checks_passed,
    {name: "self-review clean"} + on_head("self-review"; $f.pr.body | record($review_mark)),
    {name: "preview smoke-checked"} + (
      ($f.pr.body | record($smoke_mark)) as $line
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
    {name: "not removed from the queue"} + not_removed
  ]
| {merge: all(.[]; .ok), conditions: .}
