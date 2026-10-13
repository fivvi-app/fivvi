#!/usr/bin/env bash
# Where an issue is in the flow, and the mechanical steps between phases. The `work` skill drives this.
#
#   flow.sh status <n>                      facts, phase and next step for an issue
#   flow.sh facts <n>                       the facts as JSON (input of scripts/flow-phase.jq)
#   flow.sh next                            your open issues with their phase, the open specs, the ready tickets, then
#                                           what waits on the owner: specs to approve, high-risk PRs, needs-info questions
#   flow.sh start <n> [--type <t>] [--force]  claim a ready ticket and create its <type>/<n>-<slug> worktree and notes;
#                                           refuses when 3 tickets are already in progress (--force to override)
#   flow.sh finish <n>                      after its PR is merged: remove worktree and branches, close the issue,
#                                           report what the spec needs next
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

need_cmd gh
need_cmd jq
REPO="$(repo_slug)"
OWNER="${REPO%%/*}"
NAME="${REPO#*/}"
PHASE_JQ="$ROOT/scripts/flow-phase.jq"
WIP_LIMIT=3

is_number() { [[ "${1:-}" =~ ^[0-9]+$ ]] || die "not an issue number: ${1:-<missing>}"; }

ME=""
me() { [ -n "$ME" ] || ME="$(gh api user --jq .login)"; echo "$ME"; }

FETCHED=false
fetch_once() {
  $FETCHED && return
  git -C "$MAIN_ROOT" fetch --prune --quiet 2>/dev/null || true
  FETCHED=true
}

# Every local or remote <type>/<n>-* branch.
issue_branches() {
  fetch_once
  git -C "$MAIN_ROOT" for-each-ref --format='%(refname)' "refs/heads/*/$1-*" "refs/remotes/origin/*/$1-*" \
    | sed -E 's#^refs/(heads|remotes/origin)/##' | grep -E "^[a-z]+/$1-" | sort -u || true
}

pr_facts() {
  local branch="$1" pr number threads risk
  pr="$(gh pr list --repo "$REPO" --head "$branch" --state all \
    --json number,state,isDraft,reviewDecision,statusCheckRollup,url,createdAt --jq 'sort_by(.number) | last // empty')"
  [ -n "$pr" ] || { echo null; return; }
  number="$(jq -r .number <<<"$pr")"
  threads=0 risk=null
  if [ "$(jq -r .state <<<"$pr")" = OPEN ]; then
    risk="$("$ROOT/scripts/risk.sh" "$number" --json 2>/dev/null)" || risk=null
    # shellcheck disable=SC2016 # GraphQL variables, not shell
    threads="$(gh api graphql -F owner="$OWNER" -F name="$NAME" -F n="$number" -f query='
      query($owner: String!, $name: String!, $n: Int!) {
        repository(owner: $owner, name: $name) { pullRequest(number: $n) { reviewThreads(first: 100) { nodes { isResolved } } } }
      }' --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)] | length')"
  fi
  # GitHub reports unfinished conclusions and a missing review as "", not null.
  jq --argjson threads "$threads" --argjson risk "$risk" 'def value(f): [f[] | select(. != null and . != "")] | first // "";
    {
    number, state, url, draft: .isDraft, threads: $threads, risk: $risk.risk, risk_reasons: ($risk.reasons // []),
    review: (if (.reviewDecision // "") == "" then null else .reviewDecision end),
    failing: [.statusCheckRollup[]? | select(value([.conclusion, .state])
      | IN("FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"))] | length,
    pending: [.statusCheckRollup[]? | select(value([.conclusion, .state]) == ""
      or (.state // "" | IN("PENDING", "EXPECTED")))] | length,
    age_days: ((now - (.createdAt | fromdateiso8601)) / 86400 | floor)}' <<<"$pr"
}

branch_facts() {
  local branch="$1" local_ref=false wt dirty=0 ahead ref
  wt="$(worktree_of "$branch")"
  ref="origin/$branch"
  if git -C "$MAIN_ROOT" show-ref --verify --quiet "refs/heads/$branch"; then local_ref=true; ref="$branch"; fi
  [ -z "$wt" ] || dirty="$(git -C "$wt" status --porcelain | wc -l | tr -d ' ')"
  ahead="$(git -C "$MAIN_ROOT" rev-list --count "origin/$(default_branch)..$ref" 2>/dev/null || echo null)"
  jq -n --arg name "$branch" --argjson local "$local_ref" --arg wt "${wt#"$MAIN_ROOT"/}" --argjson dirty "$dirty" \
    --argjson ahead "$ahead" --argjson pr "$(pr_facts "$branch")" \
    '{name: $name, local: $local, worktree: (if $wt == "" then null else $wt end), dirty: $dirty, ahead: $ahead, pr: $pr}'
}

child_facts() {
  gh issue view "$1" --repo "$REPO" --json number,title,state,labels,assignees,blockedBy --jq '{number, title, state,
    labels: [.labels[].name], assignees: [.assignees[].login],
    blocked: ([.blockedBy.nodes[] | select(.state == "OPEN")] | length > 0)}'
}

facts() {
  local n="$1" item parent=null children="[]" branches="[]" child branch p
  item="$(gh issue view "$n" --repo "$REPO" --json number,title,state,labels,assignees,body,parent,subIssues,blockedBy)"
  for child in $(jq -r '.subIssues.nodes[].number' <<<"$item"); do
    children="$(jq --argjson c "$(child_facts "$child")" '. + [$c]' <<<"$children")"
  done
  p="$(jq -r '.parent.number // empty' <<<"$item")"
  if [ -n "$p" ]; then
    parent="$(gh issue view "$p" --repo "$REPO" --json number,title,state,labels,subIssues --jq '{number, title, state,
      labels: [.labels[].name], open: ([.subIssues.nodes[] | select(.state == "OPEN")] | length),
      total: .subIssues.totalCount}')"
  fi
  for branch in $(issue_branches "$n"); do
    branches="$(jq --argjson b "$(branch_facts "$branch")" '. + [$b]' <<<"$branches")"
  done
  jq --arg me "$(me)" --argjson parent "$parent" --argjson children "$children" --argjson branches "$branches" '{
    number, title, state, me: $me,
    labels: [.labels[].name], assignees: [.assignees[].login],
    described: ((.body // "") | gsub("\\s"; "") | length > 0),
    has_criteria: ((.body // "") | test("(^|\\n)#+\\s*acceptance criteria|(^|\\n)\\s*- \\[[ x]\\]"; "i")),
    parent: $parent, children: $children, branches: $branches,
    blockers: [.blockedBy.nodes[] | select(.state == "OPEN") | {number, title}]}' <<<"$item"
}

render() {
  jq -r --arg notes "$2" --argjson d "$(jq -f "$PHASE_JQ" <<<"$1")" '
    def ref: "#\(.number) \(.state) — \(.title)";
    "#\(.number) \(.state) — \(.title)",
    "Labels: \(.labels | join(", "))",
    "Assignees: \(.assignees | join(", "))",
    (.parent // empty | "Parent: \(ref) · \(.open) of \(.total) tickets open"),
    (if (.blockers | length) == 0 then "Blocked by: none" else "Blocked by:", (.blockers[] | "  #\(.number) — \(.title)") end),
    (if (.children | length) == 0 then empty else "Tickets:",
      (.children[] | "  \(ref)\(if (.labels | length) > 0 then " [\(.labels | join(", "))]" else "" end)\(if (.assignees | length) > 0 then " (\(.assignees | join(", ")))" else "" end)\(if .blocked then " ⛓" else "" end)") end),
    (.branches[] | "Branch: \(.name)\(if .ahead != null then " · \(.ahead) ahead of main" else "" end)\(if .worktree then " · worktree \(.worktree) · \(if .dirty == 0 then "clean" else "\(.dirty) uncommitted" end)" else "" end)",
      (.pr // empty | "PR: #\(.number) \(.state)\(if .draft then " draft" else "" end) · \(.age_days) days old · failing checks \(.failing) · pending \(.pending) · open threads \(.threads) · review \(.review // "none")\(if .risk then " · \(.risk)-risk" else "" end) · \(.url)",
        (.risk_reasons[]? | "  high-risk: \(.)"))),
    (if $notes != "" then "Notes: \($notes)" else empty end),
    "Phase: \($d.phase)",
    "Next: \($d.next)",
    (if $d.hint != "" then "Hint: \($d.hint)" else empty end)' <<<"$1"
}

notes_of() { [ ! -f "$NOTES_DIR/$1/notes.md" ] || echo "$NOTES_DIR/$1/notes.md"; }

cmd_status() {
  [ $# -eq 1 ] || usage
  is_number "$1"
  render "$(facts "$1")" "$(notes_of "$1")"
}

cmd_facts() {
  [ $# -eq 1 ] || usage
  is_number "$1"
  facts "$1"
}

cmd_next() {
  [ $# -eq 0 ] || usage
  local n f
  echo "== Assigned to you"
  local mine
  mine="$(gh issue list --repo "$REPO" --assignee @me --state open --json number --jq '.[].number')"
  [ -n "$mine" ] || echo "(none)"
  for n in $mine; do
    f="$(facts "$n")"
    echo "#$n $(jq -r .title <<<"$f") → $(jq -r .phase <<<"$(jq -f "$PHASE_JQ" <<<"$f")")"
  done
  echo "== Open specs"
  local specs
  specs="$(gh issue list --repo "$REPO" --label "$SPEC_LABEL" --state open --limit 200 \
    --json number,title,labels,subIssuesSummary)"
  jq -r 'if length == 0 then "(none)" else .[] | "#\(.number) \(.title) — \(.subIssuesSummary.completed) of \(.subIssuesSummary.total) tickets done" end' <<<"$specs"
  echo "== Ready for an agent"
  "$ROOT/scripts/issue.sh" ready | awk -F'\t' '{ print "#" $1 " " $2 }' | grep . || echo "(none)"
  echo "== Waiting on the owner"
  owner_items "$specs" | grep . || echo "(none)"
}

# Specs without approval, ready high-risk PRs (scripts/risk.sh) and needs-info questions.
owner_items() {
  local pr title risk
  jq -r --arg approved "$APPROVED_LABEL" '.[] | select([.labels[].name] | index($approved) | not)
    | "Approve spec #\(.number) \(.title) (add \($approved))"' <<<"$1"
  while IFS=$'\t' read -r pr title; do
    [ -n "$pr" ] || continue
    risk="$("$ROOT/scripts/risk.sh" "$pr" --json)" || risk='{"risk": "high", "reasons": ["risk unknown"]}'
    jq -r --arg pr "$pr" --arg title "$title" \
      'select(.risk == "high") | "Merge PR #\($pr) \($title) (high-risk: \(.reasons[:3] | join("; "))\(if (.reasons | length) > 3 then "; +\(.reasons | length - 3) more" else "" end))"' <<<"$risk"
  done < <(gh pr list --repo "$REPO" --state open --limit 100 --json number,title,isDraft \
    --jq '.[] | select(.isDraft | not) | [.number, .title] | @tsv')
  gh issue list --repo "$REPO" --label needs-info --state open --limit 100 --json number,title \
    --jq '.[] | "Answer #\(.number) \(.title) (needs-info)"'
}

tickets_in_progress() {
  git -C "$MAIN_ROOT" worktree list --porcelain \
    | sed -nE 's#^branch refs/heads/([a-z]+/[0-9]+-.*)$#\1#p' | wc -l | tr -d ' '
}

cmd_start() {
  local n="" type="" force=false f d phase branch wt title
  while [ $# -gt 0 ]; do
    case "$1" in
      --type) type="${2:?}"; shift ;;
      --force) force=true ;;
      *) [ -z "$n" ] || usage; n="$1" ;;
    esac
    shift
  done
  is_number "$n"
  f="$(facts "$n")"
  d="$(jq -f "$PHASE_JQ" <<<"$f")"
  phase="$(jq -r .phase <<<"$d")"
  case "$phase" in
    ready|in-progress) ;;
    taken) die "#$n: $(jq -r .next <<<"$d")" ;;
    *) $force || die "#$n is '$phase', not ready: $(jq -r .next <<<"$d") (pass --force to start anyway)" ;;
  esac

  branch="$(jq -r '.branches[0].name // empty' <<<"$f")"
  if [ -z "$branch" ]; then
    if [ "$(tickets_in_progress)" -ge "$WIP_LIMIT" ] && ! $force; then
      die "$WIP_LIMIT tickets are already in progress (scripts/wt.sh list); finish one first, or pass --force"
    fi
    title="$(jq -r .title <<<"$f")"
    if [ -z "$type" ]; then
      if jq -e '.labels | index("bug")' <<<"$f" >/dev/null; then type=fix
      elif [[ "$title" =~ ^\[E[0-9]+\] ]]; then type=chore
      else type=feature
      fi
    fi
    case " $BRANCH_TYPES " in *" $type "*) ;; *) die "--type must be one of: $BRANCH_TYPES" ;; esac
    branch="$type/$n-$(slugify "$title")"
  fi

  jq -e --arg me "$(me)" '.assignees | index($me)' <<<"$f" >/dev/null || "$ROOT/scripts/issue.sh" claim "$n"
  mkdir -p "$NOTES_DIR/$n"
  [ -f "$NOTES_DIR/$n/notes.md" ] || printf '# #%s %s\n' "$n" "$(jq -r .title <<<"$f")" > "$NOTES_DIR/$n/notes.md"
  wt="$(worktree_of "$branch")"
  if [ -n "$wt" ]; then echo "↻ worktree exists: ${wt#"$MAIN_ROOT"/}"; else "$ROOT/scripts/wt.sh" add "$branch"; wt="$(worktree_of "$branch")"; fi
  echo "Worktree: $wt"
  echo "Notes: $NOTES_DIR/$n/notes.md"
  echo "E2E_PORT: $(e2e_port "$wt")"
  [ "$(jq -r .hint <<<"$d")" = "" ] || echo "Hint: $(jq -r .hint <<<"$d")"
}

cmd_finish() {
  [ $# -eq 1 ] || usage
  is_number "$1"
  local n="$1" f branch wt pr parent
  f="$(facts "$n")"
  [ "$(jq '.branches | length' <<<"$f")" -gt 0 ] || die "#$n has no branches"
  jq -e '[.branches[].pr.state] | all(. == "MERGED")' <<<"$f" >/dev/null || die "#$n: not every branch has a merged PR"

  for branch in $(jq -r '.branches[].name' <<<"$f"); do
    wt="$(worktree_of "$branch")"
    if [ -n "$wt" ] && [ "$wt" != "$MAIN_ROOT" ]; then
      case "$ROOT/" in "$wt/"*) die "run flow.sh finish from the main checkout, not from $branch's worktree" ;; esac
    fi
    "$ROOT/scripts/wt.sh" "done" "$branch" --check
  done
  for branch in $(jq -r '.branches[].name' <<<"$f"); do "$ROOT/scripts/wt.sh" "done" "$branch"; done

  if [ "$(gh issue view "$n" --repo "$REPO" --json state --jq .state)" = OPEN ]; then
    pr="$(jq -r '[.branches[].pr.url] | join(", ")' <<<"$f")"
    "$ROOT/scripts/issue.sh" close "$n" --comment "Done in $pr."
  fi
  rm -rf "${NOTES_DIR:?}/$n"
  echo "✅ #$n done"

  parent="$(jq -r '.parent.number // empty' <<<"$f")"
  [ -n "$parent" ] || return 0
  f="$(facts "$parent")"
  echo "Spec #$parent: $(jq -r .phase <<<"$(jq -f "$PHASE_JQ" <<<"$f")") — $(jq -r .next <<<"$(jq -f "$PHASE_JQ" <<<"$f")")"
}

case "${1:-}" in
  status) shift; cmd_status "$@" ;;
  facts)  shift; cmd_facts "$@" ;;
  next)   shift; cmd_next "$@" ;;
  start)  shift; cmd_start "$@" ;;
  finish) shift; cmd_finish "$@" ;;
  *) usage ;;
esac
