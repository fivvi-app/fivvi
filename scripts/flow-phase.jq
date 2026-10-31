# The phase of an issue and the next step, decided from the facts flow.sh collects. Pure: no I/O.
# Input: {number, title, state, labels, assignees, me, has_criteria, described, answered,
#         parent: null|{number, title, state, labels, open, total}, blockers: [{number, title}],
#         fixed_blockers: [{number, title, closed_at}],
#         children: [{number, title, state, labels, assignees, blocked}],
#         branches: [{name, local, worktree, dirty,
#                     pr: null|{number, state, draft, review, failing, threads, age_days, risk, risk_reasons,
#                               head, refusal: null|{sha, reasons},
#                               queue: null|{state: null|"queued"|"removed", position, reason, removed_at, requeued}}}]}
# risk is "low", "high", "owner" or null (unknown) for an open PR (scripts/risk.sh, ADR-021): an agent merges low and
# high; owner (owner-only) and unknown wait for the owner. refusal is the last refusal of the merge
# gate recorded on the PR (scripts/pr.sh refusal); it holds only for the head commit it names. queue is the PR's place
# in the merge queue (scripts/pr.sh queue, ADR-018): "queued" while GitHub tests and merges it, "removed" when GitHub
# took it out (the combined commit failed or timed out) and the branch has not been pushed to since, at removed_at;
# requeued is whether the head commit was already re-queued after a fix (the record pr.sh merge --after writes, ADR-025).
# blockers are the open blockers of the issue; fixed_blockers (read only for an issue whose PR was removed; absent means
# none) the blockers closed as completed. A removed PR with an open blocker waits for its fix (waiting-fix); once a
# blocker was closed as completed after the removal, it is re-queued once (requeue). answered is true
# when there is a comment and the newest is not a triage note, i.e. someone replied to the needs-info question.
# Output: {phase, next, hint}, and bug (the number of the fixed blocker to re-queue after) in the phase requeue

def has($l): (.labels | index($l)) != null;
def open: .state == "OPEN";
# Only a spec needs the owner's approval before its tickets are cut and built (ADR-016).
def unapproved_spec: has("spec") and (has("spec-approved") | not);

def refused: .refusal != null and .refusal.sha != null and .refusal.sha == .head;
def queue_state: .queue.state? // null;

def instant: sub("\\.[0-9]+"; "") | fromdateiso8601;

# The blocker closed as completed last, after the removal at $at, or null: the bug whose fix the removed PR waited for.
def fix_after($f; $at):
  if $at == null then null
  else [($f.fixed_blockers // [])[] | select(.closed_at != null and (.closed_at | instant) > ($at | instant))]
       | sort_by(.closed_at | instant) | last
  end;

# A removed PR (ADR-025): waiting for the bug that blocks its issue, re-queued once that bug is fixed, or, when nothing
# of the kind is on record (or its commit was already re-queued after a fix), left to the report and the owner.
def removed_phase($f):
  (.queue.requeued // false) as $requeued
  | fix_after($f; .queue.removed_at // null) as $fix
  | if $requeued then {phase: "queue-removed", rank: 3}
    elif ($f.blockers | length) > 0 then {phase: "waiting-fix", rank: 3, blockers: [$f.blockers[].number]}
    elif $fix != null then {phase: "requeue", rank: 3, bug: $fix.number}
    else {phase: "queue-removed", rank: 3}
    end;

def code_phase($f):
  if .pr == null then {phase: "in-progress", rank: 0}
  elif .pr.state == "MERGED" then {phase: "merged", rank: 5}
  elif .pr.state == "CLOSED" then {phase: "abandoned", rank: -1}
  elif .pr.draft then {phase: "draft-pr", rank: 1}
  elif (.pr | queue_state) == "queued" then {phase: "queued", rank: 4}
  elif .pr.failing > 0 or .pr.review == "CHANGES_REQUESTED" or .pr.threads > 0 then {phase: "changes-requested", rank: 1}
  elif (.pr | queue_state) == "removed" then (.pr | removed_phase($f))
  elif (.pr.risk | IN("low", "high")) and (.pr | refused) then {phase: "merge-refused", rank: 3}
  elif .pr.risk | IN("low", "high") then {phase: "ready-to-merge", rank: 4}
  elif .pr.review == "APPROVED" then {phase: "approved", rank: 4}
  else {phase: "in-review", rank: 3}
  end;

def owner_review:
  if .risk == "owner" then "Owner-only (\(.risk_reasons // [] | join("; "))): the owner reviews"
  else "Risk unknown: the owner reviews" end;

def merge_next($n):
  (if .pr.risk == "high" then "High-risk (\(.pr.risk_reasons // [] | join("; "))): scripts/pr.sh merge in the worktree. It records the high-risk merge in the PR body and adds the PR to the merge queue"
   else "Low-risk: scripts/pr.sh merge in the worktree. It adds the PR to the merge queue" end)
  + " only when the whole merge gate holds; otherwise the PR stays for the owner. Then scripts/flow.sh status \($n) until GitHub has merged it, and scripts/flow.sh finish \($n).";

# Input: {phase, pr, blockers, bug} of the least advanced branch (blockers: the open ones, bug: the one closed last, as
# a number, for a removed PR).
def code_next($n):
  {
    "in-progress": "Build it in its worktree with the implement skill (docs/agents/build.md), then scripts/pr.sh create from the worktree.",
    "draft-pr": "Finish checks and code-review (scripts/pr.sh reviewed), then scripts/pr.sh ready from the worktree.",
    "changes-requested": "Fix what is open: scripts/pr.sh status and scripts/pr.sh threads in the worktree, fix with the implement skill, push with scripts/pr.sh create, reply with scripts/pr.sh reply.",
    "ready-to-merge": merge_next($n),
    "queued": "In the merge queue (position \(.pr.queue.position // "?")): GitHub tests it on the latest main and squash-merges it. Nothing to do: scripts/flow.sh status \($n) shows when it is merged, then scripts/flow.sh finish \($n). Never queue it again, and never use --auto or --admin.",
    "queue-removed": (
      if .pr.queue.requeued // false then
        "GitHub removed it from the merge queue again (\(.pr.queue.reason // "no reason given")), after it was already re-queued once after a fix (ADR-025). Read the merge_group run (gh run list --event merge_group) and report it. The owner decides, or fix a cause in this PR and push (scripts/pr.sh create), which makes the removal stale. Report and stop; never queue the same commit again."
      else
        "GitHub removed it from the merge queue (\(.pr.queue.reason // "no reason given")): the commit tested on the latest main failed a check or timed out. Read the merge_group run of its queue branch (gh run list --event merge_group). A cause in this PR: fix it and push (scripts/pr.sh create), which makes the removal stale, then review, smoke and scripts/pr.sh merge again. A cause outside it (the failing check also fails on main or on other PRs, a flaky test, a stalled or timed-out job): file a bug for the check (scripts/issue.sh create bug ... --label ready-for-agent, with the run ids, the failing test and error, and ## Acceptance criteria) or find the open one that covers it, link it with scripts/issue.sh block \($n) --by <bug>, and build the bug first. Once the bug is closed as completed, this PR is re-queued with scripts/pr.sh merge <pr> --after <bug> (ADR-025). A removal with no fix in code to wait for: report and stop, the owner decides. Never queue the same commit again yourself, except with pr.sh merge --after <bug>."
      end),
    "waiting-fix": "Wait for \([(.blockers // [])[] | "#\(.)"] | join(", ")), which fixes the check that removed it from the merge queue (\(.pr.queue.reason // "no reason given")). Nothing to do on this PR: build the bug (it is ready work), then scripts/flow.sh status \($n) shows the next step. Never queue the same commit again yourself.",
    "requeue": "scripts/pr.sh merge \(.pr.number) --after \(.bug): #\(.bug) was closed as completed after the queue removed \(.pr.head[:7]) (\(.pr.queue.reason // "no reason given")). It queues the same commit once more, with no push and no merge of main, when the whole merge gate holds; the queue tests it on the latest main, which has the fix. Then scripts/flow.sh status \($n) until GitHub has merged it, and scripts/flow.sh finish \($n). If the queue removes it again, report it and stop: the owner decides.",
    "merge-refused": "The merge gate refused it on \(.pr.head[:7]): \(.pr.refusal.reasons). The owner decides, or fix it and push (scripts/pr.sh create), which makes the refusal stale. Report and stop; never retry the merge on this commit.",
    "in-review": "\(.pr | owner_review) and adds it to the merge queue. Nothing to do.",
    "approved": "Approved. \(.pr | owner_review | sub(": the owner reviews"; "")): the owner adds it to the merge queue on GitHub; then scripts/flow.sh finish \($n).",
    "merged": "scripts/flow.sh finish \($n)",
    "abandoned": "The PR was closed without merging. Ask the user what to do."
  }[.phase];

# An approved, described spec that is cut into tickets or about to be. Its open blockers (another spec) do not hold the
# spec back: the tickets are cut now, each with blocking edges of its own, and once they exist the spec follows their
# state, so a ready ticket is built (#292, early tickets).
def awaiting_tickets:
  has("spec") and has("spec-approved") and (has("ready-for-agent") | not)
  and (has("needs-triage") | not) and .described;

def ready_children:
  [.children[] | select(open and has("ready-for-agent") and (has("spec") | not)
    and (.assignees | length == 0) and (.blocked | not)) | .number];

# A ticket PR changes only its FEATURES.md row's Status; only the PR that completes the spec rewrites the summary.
def features_hint:
  def implemented: "in FEATURES.md, set its row's Status to IMPLEMENTED (NL/EN ✅) and write its final one-line summary in this PR. Change nothing else in the row.";
  # Tickets run in parallel, so the PR that completes the spec may not have started as its last open ticket.
  def unless_last: "If this PR completes the spec instead, \(implemented) Progress lives in the spec's tickets.";
  if has("spec") and (.children | length) == 0 then "This spec is its own ticket: \(implemented)"
  elif .parent == null or has("spec") then ""
  elif .parent.open == 1 and open then "Last open ticket of #\(.parent.number): \(implemented)"
  elif .parent.open == .parent.total then "First ticket of #\(.parent.number): in FEATURES.md, change only its row's Status, to IN PROGRESS, in this PR. \(unless_last)"
  else "Ticket of #\(.parent.number): leave FEATURES.md unchanged. \(unless_last)"
  end;

def ticket_phase($n):
  if .parent != null and (.parent | unapproved_spec) then
    {phase: "needs-approval", next: "Its spec #\(.parent.number) waits for the owner to approve it (the spec-approved label). Report and stop."}
  elif has("ready-for-agent") and .has_criteria then {phase: "ready", next: "scripts/flow.sh start \($n)"}
  elif has("ready-for-agent") then
    {phase: "needs-refinement", next: "Labelled ready-for-agent but it has no ## Acceptance criteria. Triage it again to add them: scripts/issue.sh update \($n) --body-file -."}
  else
    {phase: "needs-refinement", next: "Triage it: agent-ready gets an agent brief with ## Acceptance criteria (scripts/issue.sh update \($n) --body-file -) and ready-for-agent; questions for the owner get needs-info and a triage comment; work only the owner can do gets ready-for-human."}
  end;

. as $f
| $f.number as $n
| ([$f.branches[] | code_phase($f) + {name, pr}] | sort_by(.rank)) as $code
# A needs-info question holds the issue, whatever its code, blockers or other labels say; merged work still gets
# cleaned up.
| (if ($f | open) and ($f | has("needs-info")) and ($code[0].phase != "merged") then
     if $f.answered then {phase: "answered", next: "The question on the issue was answered. Run the triage skill on it again with the answer."}
     else {phase: "waiting", next: "Waiting for the owner to answer the question on the issue (needs-info). Report and stop."} end
   elif ($f.branches | length) > 0
      and (($f | open) or any($f.branches[]; .local or .worktree != null) or any($f.branches[]; .pr.state == "OPEN"))
   then {phase: $code[0].phase, next: ($code[0] | code_next($n))}
        + (if $code[0].bug != null then {bug: $code[0].bug} else {} end)
   elif ($f | open | not) then {phase: "done", next: "Nothing to do."}
   elif ($f.blockers | length) > 0 and ($f | awaiting_tickets | not) then
     {phase: "blocked", next: "Wait for \([$f.blockers[] | "#\(.number)"] | join(", ")) to be done."}
   elif ($f | has("spec")) or ($f.children | length) > 0 then
     if ($f.children | length) > 0 and ([$f.children[] | select(open)] | length) == 0 then
       {phase: "complete", next: "All \($f.children | length) tickets are done. Check FEATURES.md shows it IMPLEMENTED, then scripts/issue.sh close \($n)."}
     elif ($f.children | length) == 0 and ($f | has("ready-for-agent") | not)
       and (($f | has("needs-triage")) or ($f.described | not)) then
       {phase: "needs-spec", next: "Grill the owner (grill-with-docs), then rewrite it with to-spec: scripts/issue.sh update \($n) --body-file -."}
     elif $f | unapproved_spec then
       {phase: "needs-approval", next: "The owner reviews the spec on GitHub and approves it with the spec-approved label. Report and stop."}
     elif ($f.children | length) == 0 and ($f | has("ready-for-agent")) then
       $f | ticket_phase($n)
     elif ($f.children | length) == 0 then
       {phase: "needs-tickets",
        next: ("Split it with to-tickets: scripts/issue.sh create ticket --parent \($n) [--blocked-by <n>]..."
               + (if ($f.blockers | length) == 0 then ""
                  else ". It waits for \([$f.blockers[] | "#\(.number)"] | join(", ")), which does not hold its tickets back: give each ticket --blocked-by the tickets of \([$f.blockers[] | "#\(.number)"] | join(", ")) it needs, or by that spec itself when those tickets do not exist yet" end))}
     else
       ($f | ready_children) as $ready
       | {phase: "building",
          next: "\([$f.children[] | select(open)] | length) of \($f.children | length) tickets open. Ready now: \(if ($ready | length) == 0 then "none" else [$ready[] | "#\(.)"] | join(" ") end). Build each with scripts/flow.sh start <n> (no fixed limit; two tickets that change the same files go one after the other); triage tickets without ready-for-agent first."}
     end
   elif ($f.assignees | length) > 0 and ($f.assignees | index($f.me) | not) then
     {phase: "taken", next: "Assigned to \($f.assignees | join(", ")). Leave it unless the user says otherwise."}
   elif $f | has("ready-for-human") then
     {phase: "human", next: "Needs the owner or another human. Help without code (research, questions, a prototype)."}
   else
     $f | ticket_phase($n)
   end)
| . + {hint: (if .phase | IN("ready", "in-progress") then ($f | features_hint) else "" end)}
