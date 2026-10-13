# The phase of an issue and the next step, decided from the facts flow.sh collects. Pure: no I/O.
# Input: {number, title, state, labels, assignees, me, has_criteria, described,
#         parent: null|{number, title, state, open, total}, blockers: [{number, title}],
#         children: [{number, title, state, labels, assignees, blocked}],
#         branches: [{name, local, worktree, dirty, pr: null|{number, state, draft, review, failing, threads, age_days}}]}
# Output: {phase, next, hint}

def has($l): (.labels | index($l)) != null;
def open: .state == "OPEN";

def code_phase:
  if .pr == null then {phase: "in-progress", rank: 0}
  elif .pr.state == "MERGED" then {phase: "merged", rank: 5}
  elif .pr.state == "CLOSED" then {phase: "abandoned", rank: -1}
  elif .pr.draft then {phase: "draft-pr", rank: 1}
  elif .pr.failing > 0 or .pr.review == "CHANGES_REQUESTED" or .pr.threads > 0 then {phase: "changes-requested", rank: 1}
  elif .pr.review == "APPROVED" then {phase: "approved", rank: 4}
  else {phase: "in-review", rank: 3}
  end;

def code_next($n):
  {
    "in-progress": "Build it in its worktree (implementer), self-review (two reviewers), then scripts/pr.sh create from the worktree.",
    "draft-pr": "Finish checks and self-review, then scripts/pr.sh ready from the worktree.",
    "changes-requested": "Fix what is open: scripts/pr.sh status and scripts/pr.sh threads in the worktree, fix with an implementer, push with scripts/pr.sh create, reply with scripts/pr.sh reply.",
    "in-review": "Waiting for the owner's review. Nothing to do.",
    "approved": "Approved. The owner merges it on GitHub; then scripts/flow.sh finish \($n).",
    "merged": "scripts/flow.sh finish \($n)",
    "abandoned": "The PR was closed without merging. Ask the user what to do."
  }[.];

def ready_children:
  [.children[] | select(open and has("ready-for-agent") and (has("spec") | not)
    and (.assignees | length == 0) and (.blocked | not)) | .number];

def features_hint:
  if has("spec") and (.children | length) == 0 then "This spec is its own ticket: set its FEATURES.md status to IMPLEMENTED (NL/EN ✅) in this PR."
  elif .parent == null or has("spec") then ""
  elif .parent.open == 1 and open then "Last open ticket of #\(.parent.number): set its FEATURES.md status to IMPLEMENTED (NL/EN ✅) in this PR."
  elif .parent.open == .parent.total then "First ticket of #\(.parent.number): set its FEATURES.md status to IN PROGRESS in this PR."
  else ""
  end;

def ticket_phase($n):
  if has("ready-for-agent") and .has_criteria then {phase: "ready", next: "scripts/flow.sh start \($n)"}
  elif has("ready-for-agent") then
    {phase: "needs-refinement", next: "Labelled ready-for-agent but it has no ## Acceptance criteria. Add them with the user: scripts/issue.sh update \($n) --body-file -."}
  else
    {phase: "needs-refinement", next: "Make it self-contained with ## Acceptance criteria (grilling with the user), scripts/issue.sh update \($n) --body-file -, then scripts/issue.sh label \($n) --add ready-for-agent (or ready-for-human)."}
  end;

. as $f
| $f.number as $n
| ([$f.branches[] | code_phase + {name}] | sort_by(.rank)) as $code
| (if ($f.branches | length) > 0
      and (($f | open) or any($f.branches[]; .local or .worktree != null) or any($f.branches[]; .pr.state == "OPEN"))
   then {phase: $code[0].phase, next: ($code[0].phase | code_next($n))}
   elif ($f | open | not) then {phase: "done", next: "Nothing to do."}
   elif ($f.blockers | length) > 0 then
     {phase: "blocked", next: "Wait for \([$f.blockers[] | "#\(.number)"] | join(", ")) to be done."}
   elif ($f | has("spec")) or ($f.children | length) > 0 then
     if ($f.children | length) == 0 and ($f | has("ready-for-agent")) then
       $f | ticket_phase($n)
     elif ($f.children | length) == 0 then
       if ($f | has("needs-triage")) or ($f.described | not) then
         {phase: "needs-spec", next: "Grill the owner (grill-with-docs), then rewrite it with to-spec: scripts/issue.sh update \($n) --body-file -."}
       else
         {phase: "needs-tickets", next: "Split it with to-tickets: scripts/issue.sh create ticket --parent \($n) [--blocked-by <n>]..."}
       end
     elif ([$f.children[] | select(open)] | length) == 0 then
       {phase: "complete", next: "All \($f.children | length) tickets are done. Check FEATURES.md shows it IMPLEMENTED, then scripts/issue.sh close \($n)."}
     else
       ($f | ready_children) as $ready
       | {phase: "building",
          next: "\([$f.children[] | select(open)] | length) of \($f.children | length) tickets open. Ready now: \(if ($ready | length) == 0 then "none" else [$ready[] | "#\(.)"] | join(" ") end). Build each with scripts/flow.sh start <n>, at most three at a time; refine tickets without ready-for-agent first."}
     end
   elif ($f.assignees | length) > 0 and ($f.assignees | index($f.me) | not) then
     {phase: "taken", next: "Assigned to \($f.assignees | join(", ")). Leave it unless the user says otherwise."}
   elif $f | has("ready-for-human") then
     {phase: "human", next: "Needs the owner or another human. Help without code (research, questions, a prototype)."}
   else
     $f | ticket_phase($n)
   end)
| . + {hint: (if .phase | IN("ready", "in-progress") then ($f | features_hint) else "" end)}
