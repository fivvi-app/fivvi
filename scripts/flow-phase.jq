# The phase of an issue and the next step, decided from the facts flow.sh collects. Pure: no I/O.
# Input: {number, title, state, labels, assignees, me, has_criteria, described, answered,
#         parent: null|{number, title, state, labels, open, total}, blockers: [{number, title}],
#         children: [{number, title, state, labels, assignees, blocked}],
#         branches: [{name, local, worktree, dirty,
#                     pr: null|{number, state, draft, review, failing, threads, age_days, risk, risk_reasons,
#                               head, refusal: null|{sha, reasons}}}]}
# risk is "low", "high" or null (unknown) for an open PR (scripts/risk.sh). refusal is the last refusal of the merge
# gate recorded on the PR (scripts/pr.sh refusal); it holds only for the head commit it names. answered is true when
# there is a comment and the newest is not a triage note, i.e. someone replied to the needs-info question.
# Output: {phase, next, hint}

def has($l): (.labels | index($l)) != null;
def open: .state == "OPEN";
# Only a spec needs the owner's approval before its tickets are cut and built (ADR-016).
def unapproved_spec: has("spec") and (has("spec-approved") | not);

def refused: .refusal != null and .refusal.sha != null and .refusal.sha == .head;

def code_phase:
  if .pr == null then {phase: "in-progress", rank: 0}
  elif .pr.state == "MERGED" then {phase: "merged", rank: 5}
  elif .pr.state == "CLOSED" then {phase: "abandoned", rank: -1}
  elif .pr.draft then {phase: "draft-pr", rank: 1}
  elif .pr.failing > 0 or .pr.review == "CHANGES_REQUESTED" or .pr.threads > 0 then {phase: "changes-requested", rank: 1}
  elif .pr.risk == "low" and (.pr | refused) then {phase: "merge-refused", rank: 3}
  elif .pr.risk == "low" then {phase: "ready-to-merge", rank: 4}
  elif .pr.review == "APPROVED" then {phase: "approved", rank: 4}
  else {phase: "in-review", rank: 3}
  end;

def owner_review:
  if .risk == "high" then "High-risk (\(.risk_reasons // [] | join("; "))): the owner reviews"
  else "Risk unknown: the owner reviews" end;

# Input: {phase, pr} of the least advanced branch.
def code_next($n):
  {
    "in-progress": "Build it in its worktree with the implement skill (docs/agents/build.md), then scripts/pr.sh create from the worktree.",
    "draft-pr": "Finish checks and code-review (scripts/pr.sh reviewed), then scripts/pr.sh ready from the worktree.",
    "changes-requested": "Fix what is open: scripts/pr.sh status and scripts/pr.sh threads in the worktree, fix with the implement skill, push with scripts/pr.sh create, reply with scripts/pr.sh reply.",
    "ready-to-merge": "Low-risk: scripts/pr.sh merge in the worktree. It merges only when the whole merge gate holds; otherwise the PR stays for the owner. Then scripts/flow.sh finish \($n).",
    "merge-refused": "The merge gate refused it on \(.pr.head[:7]): \(.pr.refusal.reasons). The owner decides, or fix it and push (scripts/pr.sh create), which makes the refusal stale. Report and stop; never retry the merge on this commit.",
    "in-review": "\(.pr | owner_review) and merges it. Nothing to do.",
    "approved": "Approved. \(.pr | owner_review | sub(": the owner reviews"; "")): the owner merges it on GitHub; then scripts/flow.sh finish \($n).",
    "merged": "scripts/flow.sh finish \($n)",
    "abandoned": "The PR was closed without merging. Ask the user what to do."
  }[.phase];

def ready_children:
  [.children[] | select(open and has("ready-for-agent") and (has("spec") | not)
    and (.assignees | length == 0) and (.blocked | not)) | .number];

# A ticket PR changes only its FEATURES.md row's Status; only the spec's last one rewrites the summary.
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
| ([$f.branches[] | code_phase + {name, pr}] | sort_by(.rank)) as $code
# A needs-info question holds the issue, whatever its code, blockers or other labels say; merged work still gets
# cleaned up.
| (if ($f | open) and ($f | has("needs-info")) and ($code[0].phase != "merged") then
     if $f.answered then {phase: "answered", next: "The question on the issue was answered. Run the triage skill on it again with the answer."}
     else {phase: "waiting", next: "Waiting for the owner to answer the question on the issue (needs-info). Report and stop."} end
   elif ($f.branches | length) > 0
      and (($f | open) or any($f.branches[]; .local or .worktree != null) or any($f.branches[]; .pr.state == "OPEN"))
   then {phase: $code[0].phase, next: ($code[0] | code_next($n))}
   elif ($f | open | not) then {phase: "done", next: "Nothing to do."}
   elif ($f.blockers | length) > 0 then
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
       {phase: "needs-tickets", next: "Split it with to-tickets: scripts/issue.sh create ticket --parent \($n) [--blocked-by <n>]..."}
     else
       ($f | ready_children) as $ready
       | {phase: "building",
          next: "\([$f.children[] | select(open)] | length) of \($f.children | length) tickets open. Ready now: \(if ($ready | length) == 0 then "none" else [$ready[] | "#\(.)"] | join(" ") end). Build each with scripts/flow.sh start <n>, at most three at a time; triage tickets without ready-for-agent first."}
     end
   elif ($f.assignees | length) > 0 and ($f.assignees | index($f.me) | not) then
     {phase: "taken", next: "Assigned to \($f.assignees | join(", ")). Leave it unless the user says otherwise."}
   elif $f | has("ready-for-human") then
     {phase: "human", next: "Needs the owner or another human. Help without code (research, questions, a prototype)."}
   else
     $f | ticket_phase($n)
   end)
| . + {hint: (if .phase | IN("ready", "in-progress") then ($f | features_hint) else "" end)}
