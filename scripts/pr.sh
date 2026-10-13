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
#   pr.sh smoke [--timeout <minutes>]             smoke-check the Railway preview and record the result in the PR body
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

need_cmd gh
need_cmd jq
REPO="$(repo_slug)"
OWNER="${REPO%%/*}"
NAME="${REPO#*/}"
BRANCH="$(git branch --show-current)"
SMOKE_MARK="Railway preview smoke check"

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

unresolved_threads() {
  # shellcheck disable=SC2016 # GraphQL variables, not shell
  gh api graphql -F owner="$OWNER" -F name="$NAME" -F n="$1" -f query='
    query($owner: String!, $name: String!, $n: Int!) {
      repository(owner: $owner, name: $name) { pullRequest(number: $n) { reviewThreads(first: 100) { nodes {
        id isResolved path line comments(first: 50) { nodes { author { login } body createdAt } } } } } }
    }' --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)]'
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

cmd_wait() {
  local timeout=20 pr deadline checks failed pending
  while [ $# -gt 0 ]; do
    case "$1" in
      --timeout) timeout="${2:?}"; shift ;;
      *) usage ;;
    esac
    shift
  done
  pr="$(current_pr)"
  deadline=$(( $(date +%s) + timeout * 60 ))
  sleep 10
  while :; do
    checks="$(gh pr checks "$pr" --repo "$REPO" --json name,bucket 2>/dev/null || echo '[]')"
    failed="$(jq -r '[.[] | select(.bucket == "fail" or .bucket == "cancel") | .name] | join(", ")' <<<"$checks")"
    pending="$(jq '[.[] | select(.bucket == "pending")] | length' <<<"$checks")"
    if [ -n "$failed" ]; then echo "✗ PR #$pr checks failed: $failed"; return 1; fi
    if [ "$pending" = 0 ] && [ "$(jq length <<<"$checks")" -gt 0 ]; then
      echo "✓ PR #$pr checks passed ($(jq length <<<"$checks") checks)"; return 0
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then echo "⏱ PR #$pr: $pending checks still running after $timeout min"; return 2; fi
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

# The preview exists only when the PR touches a Railway watch pattern (docs/engineering/ENVIRONMENTS.md).
cmd_smoke() {
  local timeout=15 pr url deadline result body line
  while [ $# -gt 0 ]; do
    case "$1" in
      --timeout) timeout="${2:?}"; shift ;;
      *) usage ;;
    esac
    shift
  done
  pr="$(current_pr)"
  if ! gh pr checks "$pr" --repo "$REPO" --json name --jq '.[].name' 2>/dev/null | grep -q '^trainer-hub - web$'; then
    line="**$SMOKE_MARK:** no preview for this PR (it touches no Railway watch pattern)."
  else
    url="https://web-trainer-hub-pr-$pr.up.railway.app/api/v1/health"
    deadline=$(( $(date +%s) + timeout * 60 ))
    until result="$(curl -fsS --max-time 20 "$url" 2>/dev/null)" && jq -e '.status == "ok"' <<<"$result" >/dev/null; do
      [ "$(date +%s)" -lt "$deadline" ] || die "preview not healthy after $timeout min: $url (${result:-no response})"
      sleep 20
    done
    line="**$SMOKE_MARK:** \`curl -fsS $url\` → \`$result\` ✅"
  fi
  body="$(gh pr view "$pr" --repo "$REPO" --json body --jq .body | grep -v "^\*\*$SMOKE_MARK:\*\*" || true)"
  gh pr edit "$pr" --repo "$REPO" --body "$body"$'\n\n'"$line" >/dev/null
  echo "✅ $line"
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
  *)       usage ;;
esac
