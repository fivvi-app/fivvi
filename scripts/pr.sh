#!/usr/bin/env bash
# Pull requests for the current worktree's branch. Run inside the worktree.
#
#   pr.sh check                                   run scripts/check.sh (create runs it too)
#   pr.sh create [--title <t>] [--body-file <f|->] [--ready] [--no-check]
#                                                 check, push, then open a draft PR (or update the open one, changing only
#                                                 what you pass); a new PR's title defaults to the issue title, its body
#                                                 gets "Closes #<issue>"
#   pr.sh ready                                   mark the draft ready for review
#   pr.sh status                                  state, review, checks and open threads
#   pr.sh wait [--timeout <minutes>]              wait for CI: exit 0 passed, 1 failed, 2 still running at the timeout
#   pr.sh threads                                 open review threads with their ids
#   pr.sh reply <thread-id> (--body <md>|--body-file <f|->) [--resolve]
#   pr.sh smoke [--timeout <minutes>]             smoke-check the Railway preview and record the result for the PR's head
#                                                 commit in the PR body
#   pr.sh reviewed                                record in the PR body that both reviewers (standards and spec) found
#                                                 nothing to fix on the PR's head commit; local HEAD must be that commit
#   pr.sh merge                                   squash-merge a low-risk PR and delete its branch, only when every
#                                                 condition of the merge gate holds (ADR-016); otherwise merge nothing,
#                                                 print why and exit 1: the PR stays for the owner
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

need_cmd gh
need_cmd jq
REPO="$(repo_slug)"
OWNER="${REPO%%/*}"
NAME="${REPO#*/}"
BRANCH="$(git branch --show-current)"
# The records pr.sh writes in the PR body and the preview's check name; scripts/merge-gate.jq gets them from here.
SMOKE_MARK="Railway preview smoke check"
REVIEW_MARK="Self-review"
PREVIEW_CHECK="trainer-hub - web"
NO_PREVIEW="no preview for this PR"

open_pr() { gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number --jq '.[0].number // empty'; }
current_pr() {
  local pr
  pr="$(open_pr)"
  [ -n "$pr" ] || die "no open PR for branch '$BRANCH' — run scripts/pr.sh create"
  echo "$pr"
}

cmd_check() {
  [ $# -eq 0 ] || usage
  echo "🔎 scripts/check.sh"
  (cd "$(git rev-parse --show-toplevel)" && scripts/check.sh) || die "checks failed — fix them before opening or updating a PR"
}

cmd_create() {
  local title="" body="" body_set=false draft=true check=true issue existing
  while [ $# -gt 0 ]; do
    case "$1" in
      --title) title="${2:?}"; shift ;;
      --body-file) body="$(read_body "${2:?}")"; body_set=true; shift ;;
      --ready) draft=false ;;
      --no-check) check=false ;;
      *) usage ;;
    esac
    shift
  done

  [ "$BRANCH" != "$(default_branch)" ] || die "on the default branch — work in a worktree (scripts/flow.sh start or scripts/wt.sh add)"
  is_branch_name "$BRANCH" || die "branch '$BRANCH' must be <type>/<issue>-<slug> or <type>/<slug>"
  [ -z "$(git status --porcelain)" ] || die "uncommitted changes"
  issue="$(branch_issue "$BRANCH")"
  existing="$(open_pr)"
  if [ -z "$title" ] && [ -z "$existing" ]; then
    [ -n "$issue" ] || die "branch has no issue number: pass --title"
    title="$(gh issue view "$issue" --repo "$REPO" --json title --jq .title)"
  fi
  if [ -n "$issue" ] && ! grep -qiE "^(closes|fixes|resolves) #$issue([^0-9]|$)" <<<"$body"; then
    body="${body:+$body$'\n\n'}Closes #$issue"
  fi

  ! $check || cmd_check
  local out
  out="$(git push --quiet -u origin HEAD 2>&1)" || { echo "$out" >&2; die "push failed"; }

  if [ -n "$existing" ]; then
    local args=()
    [ -z "$title" ] || args+=(--title "$title")
    ! $body_set || args+=(--body "$body")
    [ "${#args[@]}" -eq 0 ] || gh pr edit "$existing" --repo "$REPO" "${args[@]}" >/dev/null
    echo "↻ pushed to PR #$existing: $(gh pr view "$existing" --repo "$REPO" --json url --jq .url)"
    return
  fi
  local args=(--repo "$REPO" --base "$(default_branch)" --head "$BRANCH" --title "$title" --body "$body")
  ! $draft || args+=(--draft)
  echo "✅ PR $(gh pr create "${args[@]}") ($($draft && echo draft || echo ready))"
}

cmd_ready() {
  [ $# -eq 0 ] || usage
  local pr
  pr="$(current_pr)"
  local out
  out="$(gh pr ready "$pr" --repo "$REPO" 2>&1)" || die "$out"
  echo "✅ PR #$pr ready for review"
}

# Dies when the threads can't all be read: more than 100 counts as unknown, never as resolved.
unresolved_threads() {
  local out
  # shellcheck disable=SC2016 # GraphQL variables, not shell
  out="$(gh api graphql -F owner="$OWNER" -F name="$NAME" -F n="$1" -f query='
    query($owner: String!, $name: String!, $n: Int!) {
      repository(owner: $owner, name: $name) { pullRequest(number: $n) { reviewThreads(first: 100) {
        pageInfo { hasNextPage } nodes {
        id isResolved path line comments(first: 50) { nodes { author { login } body createdAt } } } } } }
    }')" || die "could not read the review threads of PR #$1"
  out="$(jq '.data.repository.pullRequest.reviewThreads' <<<"$out")" || die "could not read the review threads of PR #$1"
  [ "$(jq -r '.pageInfo.hasNextPage' <<<"$out")" = false ] \
    || die "PR #$1 has more than 100 review threads (or their count is unknown): resolve them on GitHub"
  jq '[.nodes[] | select(.isResolved | not)]' <<<"$out"
}

cmd_status() {
  [ $# -eq 0 ] || usage
  local pr
  pr="$(current_pr)"
  gh pr view "$pr" --repo "$REPO" --json number,title,state,isDraft,reviewDecision,mergeStateStatus,url,statusCheckRollup \
    | jq -r --argjson threads "$(unresolved_threads "$pr" | jq length)" '
      "PR #\(.number) \(.state)\(if .isDraft then " (draft)" else "" end) — \(.title)",
      "URL: \(.url)",
      def value(f): [f[] | select(. != null and . != "")] | first // "?";
      "Review: \(value([.reviewDecision]) | if . == "?" then "none" else . end) · merge state: \(.mergeStateStatus)",
      "Checks: \([.statusCheckRollup[]? | "\(.name // .context): \(value([.conclusion, .state, .status]))"] | join("; "))",
      "Open threads: \($threads)"'
}

# Waits for the CI workflow run of the PR's head commit (.github/workflows/ci.yml), not for whatever checks exist yet:
# right after a push, the jobs behind "Detect changes" don't exist, so "nothing pending" is not "passed".
cmd_wait() {
  local timeout=20 pr head deadline run failed
  while [ $# -gt 0 ]; do
    case "$1" in
      --timeout) timeout="${2:?}"; shift ;;
      *) usage ;;
    esac
    shift
  done
  pr="$(current_pr)"
  head="$(gh pr view "$pr" --repo "$REPO" --json headRefOid --jq .headRefOid)"
  deadline=$(( $(date +%s) + timeout * 60 ))
  while :; do
    run="$(gh run list --repo "$REPO" --workflow CI --commit "$head" --limit 1 --json status,conclusion \
      --jq '.[0] // {} | "\(.status // "") \(.conclusion // "")"')"
    failed="$(gh pr checks "$pr" --repo "$REPO" --json name,bucket \
      --jq '[.[] | select(.bucket == "fail" or .bucket == "cancel") | .name] | join(", ")' 2>/dev/null || true)"
    if [ -n "$failed" ]; then echo "✗ PR #$pr checks failed: $failed"; return 1; fi
    case "$run" in
      "completed success") echo "✓ PR #$pr: CI passed on ${head:0:7}"; return 0 ;;
      completed\ *) echo "✗ PR #$pr: CI ${run#completed } on ${head:0:7}"; return 1 ;;
    esac
    if [ "$(date +%s)" -ge "$deadline" ]; then
      run="${run% *}"
      echo "⏱ PR #$pr: CI ${run:-not started} after $timeout min"
      return 2
    fi
    sleep 30
  done
}

cmd_threads() {
  [ $# -eq 0 ] || usage
  unresolved_threads "$(current_pr)" | jq -r '
    if length == 0 then "No open threads." else .[] |
      "### Thread \(.id) · \(.path // "general")\(if .line then ":\(.line)" else "" end)",
      (.comments.nodes[] | "**\(.author.login)** (\(.createdAt[:16])): \(.body)"),
      ""
    end'
}

cmd_reply() {
  [ $# -ge 1 ] || usage
  local thread="$1" body="" resolve=false
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --body) body="${2:?}"; shift ;;
      --body-file) body="$(read_body "${2:?}")"; shift ;;
      --resolve) resolve=true ;;
      *) usage ;;
    esac
    shift
  done
  [ -n "$body" ] || die "empty reply"
  # shellcheck disable=SC2016 # GraphQL variables, not shell
  gh api graphql -F thread="$thread" -F body="$body" -f query='
    mutation($thread: ID!, $body: String!) {
      addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $thread, body: $body}) { comment { id } }
    }' >/dev/null
  if $resolve; then
    # shellcheck disable=SC2016 # GraphQL variables, not shell
    gh api graphql -F thread="$thread" -f query='
      mutation($thread: ID!) { resolveReviewThread(input: {threadId: $thread}) { thread { isResolved } } }' >/dev/null
  fi
  echo "💬 replied to thread $thread$($resolve && echo " (resolved)")"
}

head_of() { gh pr view "$1" --repo "$REPO" --json headRefOid --jq .headRefOid; }

# Records a result in the PR body as one line, **<mark>:** …, replacing the previous one. scripts/merge-gate.jq reads it.
record() {
  local pr="$1" mark="$2" line="$3" body
  body="$(gh pr view "$pr" --repo "$REPO" --json body --jq .body)" \
    || die "could not read the body of PR #$pr; nothing recorded"
  # grep exits 1 when no line is left (the body was only the old record); that's fine, a failure (2) isn't.
  body="$(grep -v "^\*\*$mark:\*\*" <<<"$body")" || [ $? -eq 1 ] || die "could not update the body of PR #$pr"
  gh pr edit "$pr" --repo "$REPO" --body "${body:+$body$'\n\n'}$line" >/dev/null
  echo "✅ $line"
}

# The preview exists only when the PR touches a Railway watch pattern (docs/engineering/ENVIRONMENTS.md).
cmd_smoke() {
  local timeout=15 pr head url deadline result line
  while [ $# -gt 0 ]; do
    case "$1" in
      --timeout) timeout="${2:?}"; shift ;;
      *) usage ;;
    esac
    shift
  done
  pr="$(current_pr)"
  head="$(head_of "$pr")"
  if ! gh pr checks "$pr" --repo "$REPO" --json name --jq '.[].name' 2>/dev/null | grep -qFx "$PREVIEW_CHECK"; then
    line="**$SMOKE_MARK:** on \`$head\`: $NO_PREVIEW (it touches no Railway watch pattern)."
  else
    url="https://web-trainer-hub-pr-$pr.up.railway.app/api/v1/health"
    deadline=$(( $(date +%s) + timeout * 60 ))
    until result="$(curl -fsS --max-time 20 "$url" 2>/dev/null)" && jq -e '.status == "ok"' <<<"$result" >/dev/null; do
      [ "$(date +%s)" -lt "$deadline" ] || die "preview not healthy after $timeout min: $url (${result:-no response})"
      sleep 20
    done
    line="**$SMOKE_MARK:** on \`$head\`: \`curl -fsS $url\` → \`$result\` ✅"
  fi
  record "$pr" "$SMOKE_MARK" "$line"
}

# Run only when both reviewers report no must-fix or should-fix finding. A later push makes the record stale.
cmd_reviewed() {
  [ $# -eq 0 ] || usage
  local pr head local_head
  pr="$(current_pr)"
  [ -z "$(git status --porcelain)" ] || die "uncommitted changes: the reviewers did not see what is on the PR"
  head="$(head_of "$pr")"
  local_head="$(git rev-parse HEAD)"
  [ "$local_head" = "$head" ] \
    || die "local HEAD ${local_head:0:7} is not the PR head ${head:0:7}: push with scripts/pr.sh create, then review again"
  record "$pr" "$REVIEW_MARK" "**$REVIEW_MARK:** standards and spec reviewers clean on \`$head\` ✅"
}

# The facts of scripts/merge-gate.jq. Required checks come from .github/rulesets/main.json in this worktree, the file
# scripts/github-settings.sh applies to GitHub. Dies when a fact can't be read, so the gate never decides on a guess.
merge_facts() {
  local pr="$1" view head base behind threads risk required
  view="$(gh pr view "$pr" --repo "$REPO" --json number,state,isDraft,baseRefName,headRefName,headRefOid,body,statusCheckRollup)" \
    || die "could not read PR #$pr"
  head="$(jq -r .headRefOid <<<"$view")" || die "could not read PR #$pr"
  base="$(default_branch)"
  behind="$(gh api "repos/$REPO/compare/$base...$head" --jq .behind_by)" || die "could not compare ${head:0:7} with $base"
  threads="$(unresolved_threads "$pr")" || exit 1
  risk="$("$ROOT/scripts/risk.sh" "$pr" --json)" || die "could not decide the risk of PR #$pr"
  required="$(jq '[.rules[] | select(.type == "required_status_checks")
    | .parameters.required_status_checks[].context]' "$ROOT/.github/rulesets/main.json")" \
    || die "could not read the required checks from .github/rulesets/main.json"
  jq --arg base "$base" --argjson behind "$behind" --argjson threads "$(jq length <<<"$threads")" \
    --argjson risk "$risk" --argjson required "$required" '{
    head: .headRefOid, branch: .headRefName, default_branch: $base,
    pr: {number, state, draft: .isDraft, base: .baseRefName, body: (.body // "")},
    risk: $risk, required: $required, checks: (.statusCheckRollup // []), behind: $behind, threads: $threads}' <<<"$view"
}

cmd_merge() {
  [ $# -eq 0 ] || usage
  local pr facts decision head branch issue out
  pr="$(current_pr)"
  facts="$(merge_facts "$pr")" && [ -n "$facts" ] || die "could not read the facts of PR #$pr; nothing merged"
  decision="$(jq -c --arg review_mark "$REVIEW_MARK" --arg smoke_mark "$SMOKE_MARK" --arg preview_check "$PREVIEW_CHECK" \
    --arg no_preview "$NO_PREVIEW" -f "$ROOT/scripts/merge-gate.jq" <<<"$facts")" \
    || die "could not decide the merge gate of PR #$pr; nothing merged"
  jq -r '.conditions[] | "\(if .ok then "✓" else "✗" end) \(.name): \(.detail)"' <<<"$decision"
  jq -e .merge <<<"$decision" >/dev/null \
    || die "PR #$pr stays for the owner: $(jq -r '[.conditions[] | select(.ok | not) | .name] | join(", ")' <<<"$decision")"

  head="$(jq -r .head <<<"$facts")"
  branch="$(jq -r .branch <<<"$facts")"
  out="$(gh pr merge "$pr" --repo "$REPO" --squash --match-head-commit "$head" 2>&1)" || die "merge failed: $out"
  echo "✅ PR #$pr squash-merged"
  if gh api --method DELETE "repos/$REPO/git/refs/heads/$branch" >/dev/null 2>&1; then
    echo "🗑  deleted '$branch' on GitHub"
  else
    echo "⚠  could not delete '$branch' on GitHub; flow.sh finish removes it"
  fi
  issue="$(branch_issue "$branch")"
  echo "Next: scripts/flow.sh finish ${issue:-<issue>} from the main checkout"
}

case "${1:-}" in
  check)   shift; cmd_check "$@" ;;
  create)  shift; cmd_create "$@" ;;
  ready)   shift; cmd_ready "$@" ;;
  status)  shift; cmd_status "$@" ;;
  wait)    shift; cmd_wait "$@" ;;
  threads) shift; cmd_threads "$@" ;;
  reply)   shift; cmd_reply "$@" ;;
  smoke)   shift; cmd_smoke "$@" ;;
  reviewed) shift; cmd_reviewed "$@" ;;
  merge)   shift; cmd_merge "$@" ;;
  *)       usage ;;
esac
