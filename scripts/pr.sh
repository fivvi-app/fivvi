#!/usr/bin/env bash
# Pull requests for the current worktree's branch. Run inside the worktree.
#
#   pr.sh check                                   run scripts/check.sh (create runs it too)
#   pr.sh create [--title <t>] [--body-file <f|->] [--ready] [--full] [--no-check]
#                                                 check, push, then open a draft PR (or update the open one, changing only
#                                                 what you pass); a new PR's title defaults to the issue title, its body
#                                                 gets "Closes #<issue>" (one for each ticket of a slice, flow.sh start
#                                                 --slice, ADR-033; it warns, and still pushes, when the branch changes more
#                                                 than about 1,500 lines), or "Refs #<issue>" for a spec that closes through
#                                                 its tickets (labelled spec or with sub-issues, and not built as its
#                                                 own ticket; flow.sh status says when it is complete); a body that
#                                                 closes such a spec is refused (#509). Every push runs scripts/check.sh --fast, the checks
#                                                 the change can affect without the integration and e2e tests, which run
#                                                 in CI or in the nightly run, as .github/pipeline.json says (ci: fast,
#                                                 lean; ADR-033, ADR-034, ADR-035); --full runs check.sh --all, everything
#   pr.sh ready                                   mark the draft ready for review, only when for the head commit every
#                                                 CI check passed (the merge gate's rule), the clean review is recorded
#                                                 (pr.sh reviewed) and so is the smoke check (pr.sh smoke); else names
#                                                 what is missing
#   pr.sh ship [--timeout <minutes>]              wait, smoke and ready in order, stopping at the first failure with its
#                                                 exit code; records nothing itself (run pr.sh reviewed before it); then
#                                                 prints the step durations of the native jobs (iOS, Android) that ran
#   pr.sh status                                  state, review, checks and open threads
#   pr.sh wait [--timeout <minutes>]              wait for CI: exit 0 passed, 1 failed, 2 still running at the timeout
#                                                 (default 40 minutes, 165 once an iOS or Android check exists)
#   pr.sh threads                                 open review threads with their ids
#   pr.sh reply <thread-id> (--body <md>|--body-file <f|->) [--resolve]
#   pr.sh smoke [--timeout <minutes>]             smoke-check the Railway preview and record the result for the PR's head
#                                                 commit in the PR body; the head has a preview when Railway's
#                                                 `<project> - web` status on it is not a skipped deploy (preview_of). A
#                                                 preview without a deployment of the head commit (Railway skipped it after
#                                                 a failed first CI run) is redeployed with the railway CLI, only in the
#                                                 PR's own environment, <project>-pr-<n>. Without
#                                                 the CLI, a preview whose status is success is only
#                                                 health-checked; otherwise smoke fails with a hint
#   pr.sh reviewed [--should-fix <n>] [--axes standards|both]
#                                                 always pass --axes standards when the reviewer's verdict says
#                                                 (standards), also with --should-fix; the default records both axes
#                                                 record in the PR body that both reviewers (standards and spec) found
#                                                 nothing to fix on the PR's head commit; local HEAD must be that commit.
#                                                 --axes standards (ADR-034): the reviewer ran the standards axis only (and
#                                                 the acceptance-criterion to test check), which counts only while
#                                                 `pipeline.sh get review` says split and for a PR scripts/risk.sh calls
#                                                 low; the record says "(standards only)"; otherwise it is refused. The
#                                                 default, both, is the record of both axes
#                                                 --should-fix <n>: the reviewer's last verdict is clean with n should-fix
#                                                 findings left (review by risk, ADR-033 item 5, until pilot setup); only
#                                                 for a PR scripts/risk.sh calls low, they go to the notes file as
#                                                 follow-ups; a high-risk or owner-only PR is refused
#   pr.sh refreshed                               after a refresh of a conflicting PR (#1274, work skill, Refresh) was
#                                                 pushed: record `🔄 **Refreshed:** merged main at <sha>` in the PR body,
#                                                 <sha> being origin/main, which must be merged into the branch (an
#                                                 ancestor of HEAD) and HEAD the PR's head commit with nothing uncommitted;
#                                                 a line is added, never replaced (scripts/usage.mjs counts them), and the
#                                                 same line is not written twice
#   pr.sh merge [<pr>] [--after <bug>]            add a low-risk or high-risk (agent-queueable) PR to the merge queue
#                                                 (ADR-018, ADR-021), which squash-merges it after testing it on the
#                                                 latest main, only when every condition of the merge gate holds
#                                                 (ADR-016); a high-risk PR is first recorded in the PR body with its
#                                                 reasons; an owner-only PR is never queued; otherwise queue
#                                                 nothing, record the refusal for the head commit in the PR body, print
#                                                 why and exit 1: the PR stays for the owner. Never --auto or --admin;
#                                                 the queued commit is recorded in the PR body. With `merge: direct`
#                                                 in .github/pipeline.json (ADR-035) there is no queue: after the same
#                                                 gate it squash-merges the PR itself (--match-head-commit), says so
#                                                 when GitHub refuses because the PR is behind main (then the Refresh
#                                                 steps), warns when the setting and GitHub's queue disagree, and
#                                                 refuses --after. <pr> defaults to the
#                                                 open PR of the current branch. A commit the queue removed is refused,
#                                                 except with --after <bug> (ADR-025): the same commit is queued once
#                                                 more when <bug> blocks the PR's issue, was closed as completed after
#                                                 the removal and the commit was not re-queued after a fix before; the
#                                                 re-queue is recorded in the PR body first. No merge of main, no push
#   pr.sh refusal <pr>                            the last refusal recorded in the PR body as {sha, reasons}, or null
#   pr.sh queue <pr>                              the merge queue state as {state, position, reason, removed_at, requeued}:
#                                                 state is "queued", "removed" (GitHub took the PR out of the queue,
#                                                 reason says why, removed_at when, and no commit was pushed after that)
#                                                 or null; requeued whether the head commit was already re-queued after
#                                                 a fix (pr.sh merge --after)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

need_cmd gh
need_cmd jq
REPO="$(repo_slug)"
OWNER="${REPO%%/*}"
NAME="${REPO#*/}"
BRANCH="$(git branch --show-current)"
# The records pr.sh writes in the PR body (read back by scripts/records.jq); scripts/merge-gate.jq gets the marks from
# here, and scripts/flow.sh reads refusals with pr.sh refusal.
SMOKE_MARK="Railway preview smoke check"
REVIEW_MARK="Self-review"
REFUSAL_MARK="Merge gate"
NO_PREVIEW="no preview for this PR"
# Railway: the project (named fivvi; its id is RAILWAY_PROJECT_ID in _lib.sh), the web service of its preview, and the only
# environments pr.sh smoke may touch, `<project>-pr-<n>` (preview_env). Railway names the commit status of the web preview
# `<project> - <service>`.
RAILWAY_PROJECT_NAME="fivvi"
RAILWAY_SERVICE="web"
# Railway's commit status for the web preview, and how its description starts when Railway skipped the deploy because
# the PR touches no watch pattern (the status is then green, but there is no preview).
PREVIEW_CHECK="$RAILWAY_PROJECT_NAME - $RAILWAY_SERVICE"
PREVIEW_SKIPPED="No deployment needed"
# How long wait waits for CI, in minutes. The native jobs get longer: a passing iOS run can take, by the timeouts in
# ci.yml (the "iOS tests" comment), Detect changes 5 + iOS build 12 + iOS tests 44 + the gate job 2 = 63 min, and Android
# the same by its own (5 + 20 + 30 + 2). A run with no native job ends with the longer Linux chain: Checks (Linux), 25 min
# by its timeout (#1490: a full uncached run) and needing no other job, or, in a run with UI tests (ci: full,
# workflow_dispatch, the nightly run), Detect changes 5 + E2E (Linux) 30 = 35 min; 40 outlasts both. When no runner takes the
# iOS build or a test pass (#1268), each is tried once more and each try may wait 15 min for a runner: 154 min (the comment
# above ios-build-retry); 165 outlasts all, so wait does not give up on a run that still passes.
WAIT_MINUTES=40
WAIT_MINUTES_NATIVE=165
# The gates are the required checks iOS and Android; their parts (iOS build, iOS tests (nl), Android Maestro, ...) start with the
# same word (#293).
NATIVE_JOBS=(iOS Android)

open_pr() { gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number --jq '.[0].number // empty'; }
current_pr() {
  local pr
  pr="$(open_pr)"
  [ -n "$pr" ] || die "no open PR for branch '$BRANCH' — run scripts/pr.sh create"
  echo "$pr"
}

# run_check [--all|--fast] [<why>]: scripts/check.sh for the change's affected set, with --fast without the integration
# and e2e tests (run in CI or in the nightly run per .github/pipeline.json, ADR-033, ADR-034, ADR-035), or with --all for everything, announcing which ran and why.
run_check() {
  local flag="" mode=affected
  case "${1:-}" in
    --all) flag=--all; mode=full; shift ;;
    --fast) flag=--fast; mode=fast; shift ;;
  esac
  echo "🔎 ${mode} checks${1:+: $1}"
  (cd "$(git rev-parse --show-toplevel)" && scripts/check.sh ${flag:+"$flag"}) || die "checks failed — fix them before opening or updating a PR"
}

cmd_check() {
  [ $# -eq 0 ] || usage
  run_check "scripts/check.sh"
}

# After a ticket PR is pushed: its owner-only reasons and where they belong (spec #292, split owner-only edits). Only a
# branch with an issue is a ticket PR; a PR of its own for guarded edits has none. Never fails the push: a risk that
# cannot be read is only reported.
report_owner_only() {
  local pr="$1" decision reasons
  decision="$("$ROOT/scripts/risk.sh" "$pr" --json --detail 2>/dev/null)" \
    || { echo "⚠ could not read the risk of PR #$pr: run scripts/risk.sh $pr"; return 0; }
  reasons="$(jq -r 'select(.risk == "owner") | .owner_reasons[] | "  - \(.)"' <<<"$decision")" \
    || { echo "⚠ could not read the risk of PR #$pr: run scripts/risk.sh $pr"; return 0; }
  [ -n "$reasons" ] || return 0
  echo "🔒 PR #$pr is owner-only, so the owner reviews and queues all of it. Owner-only reasons:"
  echo "$reasons"
  echo "   Move the edits the ticket does not need in this commit to a PR of their own (a chore/ branch, blocked by nothing), so"
  echo "   this PR can be queued by an agent; note it in the notes file. If the ticket cannot work without the guarded"
  echo "   change, that PR goes first and this one waits on it. See docs/agents/build.md, Owner-only edits."
}

# Whether issue $1 closes through its tickets rather than through a PR (#509); the rule is closes_through_tickets in
# scripts/closing.jq, which scripts/flow-phase.jq shares. Dies when the issue can't be read: a spec must never get
# "Closes" by mistake. A missing field counts as none.
issue_closes_through_tickets() {
  local out
  out="$(gh issue view "$1" --repo "$REPO" --json labels,subIssues)" || die "could not read issue #$1"
  jq -e -L "$ROOT/scripts" 'include "closing";
    {labels: [.labels[]?.name],
     children: [range(0; (.subIssues.totalCount // (.subIssues.nodes // [] | length) // 0))]}
    | closes_through_tickets' <<<"$out" >/dev/null
}

# Whether the text on stdin closes issue $1 when its PR merges: every keyword GitHub knows (close, closes, closed, fix,
# fixes, fixed, resolve, resolves, resolved; any case; an optional colon) before #n, <owner>/<repo>#n or the issue URL.
body_closes_issue() {
  local repo_re="${REPO//./[.]}"
  grep -qiE "(^|[^[:alnum:]])(close[sd]?|fix(e[sd])?|resolve[sd]?):?[[:space:]]+(${repo_re}#|https://github[.]com/${repo_re}/issues/|#)$1([^0-9]|$)"
}

# The lines the branch changes against the default branch, added plus deleted (binary files count 0); empty when git
# cannot tell (no origin/<default>).
changed_lines() {
  local stat
  stat="$(git diff --numstat "origin/$(default_branch)...HEAD" 2>/dev/null)" || return 0
  awk '$1 ~ /^[0-9]+$/ { n += $1 + $2 } END { print n + 0 }' <<<"$stat"
}

# A PR that grew past about 1,500 changed lines (ADR-033): warn, never refuse.
SLICE_MAX_LINES=1500
warn_if_large() {
  local lines
  lines="$(changed_lines)"
  [ -n "$lines" ] && [ "$lines" -gt "$SLICE_MAX_LINES" ] || return 0
  echo "⚠ this branch changes $lines lines, more than about 1,500: a big PR is hard to review (ADR-033). Keep it if the slice" >&2
  echo "  is one piece of work; otherwise leave the last tickets of the slice for a PR of their own. The push goes on." >&2
}

cmd_create() {
  local title="" body="" body_set=false draft=true check=true full=false issue existing slice closes t
  while [ $# -gt 0 ]; do
    case "$1" in
      --title) title="${2:?}"; shift ;;
      --body-file) body="$(read_body "${2:?}")"; body_set=true; shift ;;
      --ready) draft=false ;;
      --full) full=true ;;
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
  if [ -n "$issue" ] && { [ -z "$existing" ] || $body_set; }; then
    slice="$(slice_tickets "$issue")"
    if [ -n "$slice" ]; then
      # A platform slice closes every one of its tickets (ADR-033).
      closes=""
      for t in $slice; do
        body_closes_issue "$t" <<<"$body" || closes="${closes:+$closes$'\n'}Closes #$t"
      done
      [ -z "$closes" ] || body="${body:+$body$'\n\n'}$closes"
    elif issue_closes_through_tickets "$issue"; then
      # A spec closes through its tickets (flow.sh status: complete, then issue.sh close), never through a PR (#509).
      ! body_closes_issue "$issue" <<<"$body" \
        || die "spec #$issue closes through its tickets, not a PR: write Refs #$issue"
      grep -qiE "(^|[^[:alnum:]])refs #$issue([^0-9]|$)" <<<"$body" || body="${body:+$body$'\n\n'}Refs #$issue"
    elif ! body_closes_issue "$issue" <<<"$body"; then
      body="${body:+$body$'\n\n'}Closes #$issue"
    fi
  fi

  if $check; then
    if $full; then run_check --all "--full"
    elif [ -z "$existing" ]; then run_check --fast "first push of the branch; the integration and e2e tests run in CI or in the nightly run, as .github/pipeline.json says (ADR-034, ADR-035)"
    else run_check --fast "follow-up push to PR #$existing; CI is still the gate on this commit; --full runs everything here too"
    fi
  fi
  warn_if_large
  local out
  out="$(git push --quiet -u origin HEAD 2>&1)" || { echo "$out" >&2; die "push failed"; }

  if [ -n "$existing" ]; then
    local args=()
    [ -z "$title" ] || args+=(--title "$title")
    ! $body_set || args+=(--body "$body")
    [ "${#args[@]}" -eq 0 ] || gh pr edit "$existing" --repo "$REPO" "${args[@]}" >/dev/null
    echo "↻ pushed to PR #$existing: $(gh pr view "$existing" --repo "$REPO" --json url --jq .url)"
    [ -z "$issue" ] || report_owner_only "$existing"
    return
  fi
  local args=(--repo "$REPO" --base "$(default_branch)" --head "$BRANCH" --title "$title" --body "$body")
  ! $draft || args+=(--draft)
  local url
  url="$(gh pr create "${args[@]}")"
  echo "✅ PR $url ($($draft && echo draft || echo ready))"
  [ -z "$issue" ] || report_owner_only "${url##*/}"
}

# Conditions of the merge gate that must hold before a draft is published (decided by scripts/merge-gate.jq, so there is
# one rule): the checks passed on the head commit, the clean review and the smoke check are recorded for it.
READY_CONDITIONS=("checks passed" "self-review clean" "preview smoke-checked")

cmd_ready() {
  [ $# -eq 0 ] || usage
  local pr facts decision missing out risk
  pr="$(current_pr)"
  facts="$(pr_facts "$pr")" || exit 1
  # The facts of the other conditions (risk, threads) are not asked here: their conditions are not read. Except the risk
  # of a PR whose review record covers the standards axis only (ADR-034): that record counts for a low-risk PR alone.
  risk='{"risk": "low", "reasons": []}'
  if jq -e --arg mark "$REVIEW_MARK" '.pr.body | split("\n")
      | any(startswith("**\($mark):**") and contains("(standards only)"))' <<<"$facts" >/dev/null; then
    risk="$("$ROOT/scripts/risk.sh" "$pr" --json)" || die "could not decide the risk of PR #$pr; nothing changed"
  fi
  decision="$(jq -c --arg review_mark "$REVIEW_MARK" --arg smoke_mark "$SMOKE_MARK" --arg no_preview "$NO_PREVIEW" \
    -f "$ROOT/scripts/merge-gate.jq" <<<"$(jq --argjson risk "$risk" '. + {risk: $risk, threads: 0}' <<<"$facts")")" \
    || die "could not decide whether PR #$pr is ready; nothing changed"
  missing="$(jq -r --argjson names "$(printf '%s\n' "${READY_CONDITIONS[@]}" | jq -R . | jq -sc .)" '
    [.conditions[] | select(.name | IN($names[])) | select(.ok | not) | "\(.name) (\(.detail))"] | join("; ")' <<<"$decision")"
  [ -z "$missing" ] || die "PR #$pr is not ready for review: $missing"
  out="$(gh pr ready "$pr" --repo "$REPO" 2>&1)" || die "$out"
  echo "✅ PR #$pr ready for review"
}

# The native jobs' steps with their durations, from the CI run of the PR's head commit. Best effort: never fails, and
# says on stderr why it printed nothing or less. A skipped job prints nothing (#121); a native job that ended without a
# timed step (cancelled, timed out) prints one line saying so.
native_durations() {
  local head run jobs out
  head="$(head_of "$1" 2>/dev/null)" || { echo "could not read the head of PR #$1; no step durations" >&2; return 0; }
  run="$(gh run list --repo "$REPO" --workflow CI --commit "$head" --limit 1 --json databaseId \
    --jq '.[0].databaseId // empty' 2>/dev/null)" || { echo "could not list the CI runs; no step durations" >&2; return 0; }
  [ -n "$run" ] || { echo "no CI run for ${head:0:7}; no step durations" >&2; return 0; }
  jobs="$(gh api "repos/$REPO/actions/runs/$run/jobs?per_page=100" 2>/dev/null)" \
    || { echo "could not read the jobs of CI run $run; no step durations" >&2; return 0; }
  jq -e . >/dev/null 2>&1 <<<"$jobs" \
    || { echo "could not parse the jobs of CI run $run; no step durations" >&2; return 0; }
  out="$(jq -r --argjson native "$(printf '%s\n' "${NATIVE_JOBS[@]}" | jq -R . | jq -sc .)" '
    def seconds: (.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601);
    def clock: "\(. / 60 | floor) min \(. % 60) s";
    .jobs[]? | select(.name as $n | $native | any(. as $j | $n == $j or ($n | startswith($j + " ")))) | . as $job
    | [(.steps // [])[] | select(.started_at != null and .completed_at != null)] as $steps
    | if ($steps | length) > 0 then
        "", "Step durations: \($job.name)",
        ($steps[] | "  \(seconds | clock)  \(.name)"),
        "  \([$steps[] | seconds] | add // 0 | clock)  Total"
      elif $job.conclusion == "skipped" then empty
      else "", "Step durations: \($job.name): no step timings (\($job.conclusion // $job.status // "unknown"))"
      end' <<<"$jobs" 2>/dev/null)" \
    || { [ -z "$out" ] || echo "$out"; echo "could not read a step's timestamps; step durations may be cut off" >&2; return 0; }
  [ -z "$out" ] || echo "$out"
}

# wait, smoke, ready in order, each as its own pr.sh run so a failing step (set -e inside it) ends it with its own exit
# code, which ship returns at once. Records nothing itself: pr.sh reviewed stays the reviewer's verdict to record.
cmd_ship() {
  local pr rc=0 step
  { [ $# -eq 0 ] || { [ $# -eq 2 ] && [ "$1" = --timeout ]; }; } || usage
  pr="$(current_pr)"
  for step in wait smoke ready; do
    echo "▶ pr.sh $step"
    if [ "$step" = wait ]; then "$0" wait "$@" || rc=$?; else "$0" "$step" || rc=$?; fi
    [ "$rc" -eq 0 ] || break
  done
  native_durations "$pr"
  return "$rc"
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
  queue_state "$pr" | jq -r 'if .merged then "Merge queue: merged"
    elif .queued then "Merge queue: queued (position \(.position))"
    elif .removed then "Merge queue: removed (\(.reason // "no reason given")); look at the merge_group run of its queue branch"
    else "Merge queue: not queued" end'
}

# Waits for the CI workflow run of the PR's head commit (.github/workflows/ci.yml), not for whatever checks exist yet:
# right after a push, the jobs behind "Detect changes" don't exist, so "nothing pending" is not "passed". The timeout is
# $WAIT_MINUTES, or $WAIT_MINUTES_NATIVE once a native check is among the checks and not skipped: the gate (iOS, Android)
# or one of its parts, a name that starts with the gate and a space (iOS build, iOS tests (nl), Android Maestro). The
# parts are listed while they run, the gate only once they are all done (#416). The gates are required checks, so they
# exist, skipped, in most PRs; --timeout fixes the limit. A cancelled job (no macOS runner took it, #1268) does not fail
# the wait when its retry job passed or still runs (scripts/check-retries.jq, #1384).
cmd_wait() {
  local timeout="" limit="$WAIT_MINUTES" pr head start run checks settled failed native job
  while [ $# -gt 0 ]; do
    case "$1" in
      --timeout) timeout="${2:?}"; shift ;;
      *) usage ;;
    esac
    shift
  done
  pr="$(current_pr)"
  head="$(gh pr view "$pr" --repo "$REPO" --json headRefOid --jq .headRefOid)"
  start="$(date +%s)"
  [ -z "$timeout" ] || limit="$timeout"
  echo "⏳ PR #$pr: waiting up to $limit min for CI on ${head:0:7}"
  while :; do
    run="$(gh run list --repo "$REPO" --workflow CI --commit "$head" --limit 1 --json status,conclusion \
      --jq '.[0] // {} | "\(.status // "") \(.conclusion // "")"')"
    checks="$(gh pr checks "$pr" --repo "$REPO" --json name,bucket 2>/dev/null || true)"
    # A cancelled job is read by its retry job (scripts/check-retries.jq, #1384): no failure when the retry passed or runs.
    # A jq error (a file that does not load) fails the wait: it must not read as "no check failed".
    settled="$(jq -L "$ROOT/scripts" -c 'include "check-retries";
      [.[]? | {name, state: (if .bucket == "skipping" then "skip" else .bucket end)}] | settle_retries
      | {total: length, pending: ([.[] | select(.state == "pending")] | length),
        failed: [.[] | select(.state == "fail" or .state == "cancel") | .name] | join(", ")}' <<<"${checks:-[]}")" \
      || die "could not read the checks of PR #$pr"
    failed="$(jq -r .failed <<<"$settled")"
    if [ -z "$timeout" ] && [ "$limit" -lt "$WAIT_MINUTES_NATIVE" ]; then
      native=""
      for job in "${NATIVE_JOBS[@]}"; do
        ! jq -e --arg job "$job" 'any(.[]?; (.name == $job or (.name | startswith($job + " "))) and .bucket != "skipping")' <<<"${checks:-[]}" >/dev/null 2>&1 || native="${native:+$native, }$job"
      done
      if [ -n "$native" ]; then
        limit="$WAIT_MINUTES_NATIVE"
        echo "⏳ $native run: waiting up to $limit min for CI"
      fi
    fi
    if [ -n "$failed" ]; then echo "✗ PR #$pr checks failed: $failed"; return 1; fi
    case "$run" in
      "completed success") echo "✓ PR #$pr: CI passed on ${head:0:7}"; return 0 ;;
      completed\ *)
        # GitHub concludes a whole run "failure" when a job was cancelled and its retry passed, with no failed job
        # (#1384): the settled checks decide then, once there are checks and none is failing, cancelled or pending.
        if jq -e '.total > 0 and .pending == 0' <<<"$settled" >/dev/null; then
          echo "✓ PR #$pr: CI passed on ${head:0:7} (run ${run#completed }, every check passed or was retried)"; return 0
        fi
        echo "✗ PR #$pr: CI ${run#completed } on ${head:0:7}"; return 1 ;;
    esac
    if [ "$(date +%s)" -ge $(( start + limit * 60 )) ]; then
      run="${run% *}"
      echo "⏱ PR #$pr: CI ${run:-not started} after $limit min"
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

# Whether commit $1 has a Railway preview, the one definition pr.sh smoke and the merge gate use: yes, no, or pending
# (Railway is still deploying). Yes when the latest $PREVIEW_CHECK status on the commit is not a skipped deploy; no when
# there is no such status or Railway skipped the deploy. Dies when the statuses can't all be read: never a guessed "no".
preview_of() {
  local sha="$1"
  web_status_of "$sha" | jq -r --arg skipped "$PREVIEW_SKIPPED" '
    if . == null then "no"
    elif .state == "pending" then "pending"
    elif (.description // "") | startswith($skipped) then "no"
    else "yes" end'
}

# The latest $PREVIEW_CHECK status of commit $1 as JSON, or null when there is none. Dies when the statuses can't all
# be read.
web_status_of() {
  local sha="$1" combined
  combined="$(gh api "repos/$REPO/commits/$sha/status?per_page=100")" \
    || die "could not read the statuses of ${sha:0:7}"
  # The combined status holds the latest status per context; more contexts than one page means some are unread.
  jq -c --arg check "$PREVIEW_CHECK" '
    if (.statuses | type) != "array" or .total_count != (.statuses | length) then error("unread statuses")
    else [.statuses[] | select(.context == $check)] | first end' <<<"$combined" 2>/dev/null \
    || die "could not read the statuses of ${sha:0:7}"
}

# Records a result in the PR body as one line, **<mark>:** …, replacing the previous one. scripts/merge-gate.jq reads it.
record() {
  local pr="$1" mark="$2" line="$3" body
  body="$(gh pr view "$pr" --repo "$REPO" --json body --jq .body)" \
    || die "could not read the body of PR #$pr; nothing recorded"
  # The previous record goes, except a re-queue after a fix (ADR-025): it is the audit line that allows one re-queue per
  # commit, and it stays next to the "added to the merge queue" line.
  body="$(awk -v mark="**$mark:**" -v keep="**$mark:** re-queued" 'index($0, mark) != 1 || index($0, keep) == 1' <<<"$body")" \
    || die "could not update the body of PR #$pr"
  # Checked here: a caller that runs record under `||` has errexit off, and would print the line as recorded.
  gh pr edit "$pr" --repo "$REPO" --body "${body:+$body$'\n\n'}$line" >/dev/null \
    || die "could not update the body of PR #$pr; nothing recorded"
  echo "📝 $line"
}

# The name of the Railway environment of PR $1, `<project>-pr-<n>`: the only one pr.sh smoke may touch. It is built
# from the PR number and the project name alone, never taken from an argument, so production and development are out
# of reach.
preview_env() {
  [[ "$1" =~ ^[0-9]+$ ]] || die "not a PR number: '$1'"
  echo "$RAILWAY_PROJECT_NAME-pr-$1"
}

# The Railway CLI against the web service of the PR's own preview environment (preview_env).
# <list|redeploy>: the deployments as JSON, or redeploy from the branch's latest commit.
railway_preview() {
  local pr="$1" action="$2" env
  env="$(preview_env "$pr")" || exit 1
  case "$action" in
    list) railway deployment list -p "$RAILWAY_PROJECT_ID" -e "$env" -s "$RAILWAY_SERVICE" --json ;;
    redeploy) railway deployment redeploy -p "$RAILWAY_PROJECT_ID" -e "$env" -s "$RAILWAY_SERVICE" --from-source -y ;;
    *) die "unknown railway action '$action'" ;;
  esac
}

railway_ready() { command -v railway >/dev/null && railway whoami >/dev/null 2>&1; }

# What to do when only the Railway CLI could tell, or fix, whether the PR's preview was deployed for the head commit.
railway_hint_text() {
  echo "needs the Railway CLI (not installed or not logged in): install it and run 'railway login', or redeploy the preview in the Railway dashboard ($(preview_env "$1") → $RAILWAY_SERVICE → Redeploy)"
}
railway_hint() { die "the preview of PR #$1 $(railway_hint_text "$1"); nothing recorded"; }

# The state of the PR preview's deployment of commit $2: none (no deployment of it), skipped (Railway skipped it, as
# after a failed first CI run: it is never deployed by a later green run), or the status of the latest other one.
head_deployment() {
  local out
  out="$(railway_preview "$1" list)" || die "could not list the deployments of $(preview_env "$1"); nothing recorded"
  jq -r --arg sha "$2" '[.[] | select(.meta.commitHash == $sha)] as $mine
    | if $mine == [] then "none"
      elif any($mine[]; .status != "SKIPPED") then ([$mine[] | select(.status != "SKIPPED")] | first | .status)
      else "skipped" end' <<<"$out" || die "could not read the deployments of $(preview_env "$1"); nothing recorded"
}

# Redeploys the preview from the branch's latest commit, then waits (within $3) until it is deployed.
redeploy_preview() {
  local pr="$1" head="$2" deadline="$3" out state
  echo "↻ no deployment of ${head:0:7} in $(preview_env "$pr"): redeploying it from source"
  out="$(railway_preview "$pr" redeploy 2>&1)" || die "redeploy of $(preview_env "$pr") failed: $out"
  while :; do
    state="$(head_deployment "$pr" "$head")"
    case "$state" in
      SUCCESS) return 0 ;;
      FAILED|CRASHED|REMOVED) die "the redeployed preview of ${head:0:7} is $state; nothing recorded" ;;
    esac
    [ "$(date +%s)" -lt "$deadline" ] || die "the redeployed preview of ${head:0:7} is still $state after the timeout; nothing recorded"
    sleep 20
  done
}

# The preview exists only when the PR touches a Railway watch pattern (docs/engineering/ENVIRONMENTS.md); preview_of
# decides. While Railway is still deploying, it waits (within the timeout) before it decides. A preview Railway skipped
# for the head commit (it waits for CI, and a failed first run means it is never deployed) is redeployed.
cmd_smoke() {
  local timeout=15 pr head preview url deadline result line redeploy=false
  while [ $# -gt 0 ]; do
    case "$1" in
      --timeout) timeout="${2:?}"; shift ;;
      *) usage ;;
    esac
    shift
  done
  pr="$(current_pr)"
  head="$(head_of "$pr")" || die "could not read the head commit of PR #$pr; nothing recorded"
  deadline=$(( $(date +%s) + timeout * 60 ))
  while :; do
    preview="$(preview_of "$head")" || die "nothing recorded on PR #$pr"
    case "$preview" in
      yes)
        # With the CLI, find a skipped deployment and redeploy it. Without it, a successful status is trusted and the
        # health check decides; a failed one is a deploy that only the CLI (or the dashboard) can redo.
        if railway_ready; then
          case "$(head_deployment "$pr" "$head")" in none|skipped) redeploy=true ;; esac
        elif [ "$(web_status_of "$head" | jq -r '.state // ""')" != success ]; then
          railway_hint "$pr"
        fi
        break ;;
      pending)
        # Still deploying, unless Railway skipped this commit and waits for nothing; without the CLI, just wait.
        if railway_ready && [ "$(head_deployment "$pr" "$head")" = skipped ]; then redeploy=true; break; fi ;;
      *) break ;;
    esac
    [ "$(date +%s)" -lt "$deadline" ] \
      || die "the preview of ${head:0:7} is still deploying after $timeout min; nothing recorded$(
        railway_ready || echo ". Railway may have skipped it (failed first CI run): it $(railway_hint_text "$pr")")"
    sleep 20
  done
  ! $redeploy || redeploy_preview "$pr" "$head" "$deadline"
  if [ "$preview" = no ]; then
    line="**$SMOKE_MARK:** on \`$head\`: $NO_PREVIEW (it touches no Railway watch pattern)."
  else
    url="https://$RAILWAY_SERVICE-$(preview_env "$pr").up.railway.app/api/v1/health"
    until result="$(curl -fsS --max-time 20 "$url" 2>/dev/null)" && jq -e '.status == "ok"' <<<"$result" >/dev/null; do
      [ "$(date +%s)" -lt "$deadline" ] || die "preview not healthy after $timeout min: $url (${result:-no response})"
      sleep 20
    done
    line="**$SMOKE_MARK:** on \`$head\`: \`curl -fsS $url\` → \`${result}\` ✅"
  fi
  record "$pr" "$SMOKE_MARK" "$line"
}

# Run only when both reviewers report no must-fix finding, and no should-fix finding either unless the PR is low-risk
# (review by risk, ADR-033 item 5, until pilot setup): --should-fix <n> says n of them are left, as follow-ups in the
# notes file. The record says so, and the merge gate refuses it for a PR that is not low-risk then. A later push makes the
# record stale.
cmd_reviewed() {
  local should_fix=0 pr head local_head risk suffix="" axes=both setting reviewers="standards and spec reviewers" axes_note=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --should-fix) [[ "${2:-}" =~ ^[0-9]+$ ]] || usage; should_fix=$((10#$2)); shift ;;
      --axes) case "${2:-}" in standards | both) axes="$2" ;; *) usage ;; esac; shift ;;
      *) usage ;;
    esac
    shift
  done
  pr="$(current_pr)"
  [ -z "$(git status --porcelain)" ] || die "uncommitted changes: the reviewers did not see what is on the PR"
  head="$(head_of "$pr")"
  local_head="$(git rev-parse HEAD)"
  [ "$local_head" = "$head" ] \
    || die "local HEAD ${local_head:0:7} is not the PR head ${head:0:7}: push with scripts/pr.sh create, then review again"
  if [ "$axes" = standards ]; then
    # ADR-034: the standards axis alone is enough only while review is split and for a low-risk PR (the merge gate decides
    # the same again); refused here, so no record is written that the gate would refuse.
    setting="$(review_setting)"
    [ "$setting" = split ] \
      || die "the standards axis only counts while review is split (pipeline.sh get review says ${setting:-nothing}): run both axes"
    risk="$("$ROOT/scripts/risk.sh" "$pr" --json)" || die "could not decide the risk of PR #$pr; nothing recorded"
    [ "$(jq -r .risk <<<"$risk")" = low ] \
      || die "PR #$pr is not low-risk: the standards axis only counts for a low-risk PR; run both axes (standards and spec), then review again"
    reviewers="standards reviewer"
    axes_note=" (standards only)"
  fi
  if [ "$should_fix" -gt 0 ]; then
    risk="$("$ROOT/scripts/risk.sh" "$pr" --json)" || die "could not decide the risk of PR #$pr; nothing recorded"
    case "$(jq -r .risk <<<"$risk")" in
      low) ;;
      high) die "PR #$pr is high-risk: its review is clean only without should-fix findings; fix them, then review again" ;;
      owner) die "PR #$pr is owner-only: its review is clean only without should-fix findings; fix them, then review again" ;;
      *) die "the risk of PR #$pr is unknown: its review is clean only without should-fix findings" ;;
    esac
    if [ "$should_fix" -eq 1 ]; then
      suffix=" (low risk: 1 should-fix finding left as a follow-up, ADR-033)"
    else
      suffix=" (low risk: $should_fix should-fix findings left as follow-ups, ADR-033)"
    fi
  fi
  record "$pr" "$REVIEW_MARK" "**$REVIEW_MARK:** $reviewers clean on \`$head\`$axes_note ✅$suffix"
}

# The record of a refresh (#1274): origin/main was merged into the branch that is the PR's head. It is a line of its own
# (🔄 **Refreshed:** …), added after the others and never replacing one, so every refresh of a PR stays countable.
REFRESH_MARK="Refreshed"
cmd_refreshed() {
  [ $# -eq 0 ] || usage
  local pr head local_head main body line
  pr="$(current_pr)"
  [ -z "$(git status --porcelain)" ] || die "uncommitted changes: commit the merge and push it first (scripts/pr.sh create)"
  head="$(head_of "$pr")"
  local_head="$(git rev-parse HEAD)"
  [ "$local_head" = "$head" ] \
    || die "local HEAD ${local_head:0:7} is not the PR head ${head:0:7}: push with scripts/pr.sh create first"
  main="$(git rev-parse --verify --quiet "origin/$(default_branch)^{commit}")" \
    || die "origin/$(default_branch) is unknown here: git fetch origin, merge it, push, then run this again"
  git merge-base --is-ancestor "$main" HEAD \
    || die "origin/$(default_branch) (${main:0:7}) is not merged into this branch: merge it (git merge origin/$(default_branch)), push, then run this again"
  line="🔄 **$REFRESH_MARK:** merged main at \`$main\`"
  body="$(gh pr view "$pr" --repo "$REPO" --json body --jq .body)" || die "could not read the body of PR #$pr; nothing recorded"
  if grep -qxF "$line" <<<"$body"; then
    echo "📝 already recorded: $line"
    return 0
  fi
  gh pr edit "$pr" --repo "$REPO" --body "${body:+$body$'\n\n'}$line" >/dev/null \
    || die "could not update the body of PR #$pr; nothing recorded"
  echo "📝 $line"
}

# What `pipeline.sh get merge` says (ADR-035): queue or direct; empty when it can't be read, which is no opinion: pr.sh merge
# then goes by what GitHub has.
merge_setting() { "$ROOT/scripts/pipeline.sh" get merge 2>/dev/null || true; }

# What `pipeline.sh get review` says (ADR-034): split or per-pr; empty when it can't be read, which the merge gate reads as
# unknown, so a standards-only review record never counts then.
review_setting() { "$ROOT/scripts/pipeline.sh" get review 2>/dev/null || true; }

# The facts of scripts/merge-gate.jq that pr.sh ready reads too: the PR, its checks on the head commit, the required
# checks and whether the head has a preview. Required checks come from .github/rulesets/main.json in this worktree, the
# file scripts/github-settings.sh applies to GitHub. Dies when a fact can't be read, so nobody decides on a guess.
pr_facts() {
  local pr="$1" view head preview required
  view="$(gh pr view "$pr" --repo "$REPO" --json number,state,isDraft,baseRefName,headRefName,headRefOid,body,statusCheckRollup)" \
    || die "could not read PR #$pr"
  head="$(jq -r .headRefOid <<<"$view")" || die "could not read PR #$pr"
  preview="$(preview_of "$head")" || exit 1
  required="$(jq '[.rules[] | select(.type == "required_status_checks")
    | .parameters.required_status_checks[].context]' "$ROOT/.github/rulesets/main.json")" \
    || die "could not read the required checks from .github/rulesets/main.json"
  jq --arg base "$(default_branch)" --argjson required "$required" --arg preview "$preview" \
    --arg review_setting "$(review_setting)" '{
    head: .headRefOid, branch: .headRefName, default_branch: $base,
    pr: {number, state, draft: .isDraft, base: .baseRefName, body: (.body // "")},
    required: $required, checks: (.statusCheckRollup // []), preview: $preview, review_setting: $review_setting}' <<<"$view"
}

# All the facts of the merge gate: pr_facts and what only a merge needs (threads, risk, whether the queue removed it, and
# for pr.sh merge the PR's node ID and whether its base branch has a merge queue). Not whether the branch is behind
# main: the merge queue tests every PR on the latest main (ADR-018).
merge_facts() {
  local pr="$1" facts threads risk queue
  facts="$(pr_facts "$pr")" || exit 1
  threads="$(unresolved_threads "$pr")" || exit 1
  risk="$("$ROOT/scripts/risk.sh" "$pr" --json)" || die "could not decide the risk of PR #$pr"
  queue="$(queue_state "$pr")" || exit 1
  jq --argjson threads "$(jq length <<<"$threads")" --argjson risk "$risk" --argjson queue "$queue" \
    '. + {risk: $risk, threads: $threads, queue_removed: $queue.removed, queue_removed_at: $queue.removed_at,
      requeued: $queue.requeued, pr_id: $queue.id, queue_enabled: $queue.queue_enabled}' <<<"$facts"
}

# Where a PR is in the merge queue, from GitHub, as JSON {id, queue_enabled, merged, queued, position, auto_merge, removed,
# reason, removed_at, requeued}: id is the PR's node ID, queue_enabled whether its base branch has a merge queue,
# removed_at when the queue removed it (the event's createdAt, null unless removed), requeued whether the head commit was
# re-queued after a fix (pr.sh merge --after, ADR-025): the PR body records it, or, as the body can be replaced
# (pr.sh create --body-file), the timeline holds two removals after the head commit, a fact GitHub keeps. A PR
# is removed when the queue took it out (its last queue event on the timeline) after the head commit was made: a commit
# pushed after the removal makes it stale, and a later removal (the owner queued the new commit) counts again. This reads
# the event's time and the head commit's committedDate, not the **Merge queue:** record, which names only what an agent
# queued. A commit pushed while the PR is queued makes GitHub remove it, with the removal after that commit's
# committedDate: it shows as removed and the gate refuses it (fails closed); the owner decides.
# The timeline window is the last 20 events, enough: removals after the head commit are the newest events, so a window
# full of events after the head commit holds at least two removals (an add is followed by at most one removal), and a
# re-queue cannot be missed.
# Times are compared as UTC instants (GitHub's dates have a Z or an offset), not as text.
queue_state() {
  local out
  # shellcheck disable=SC2016 # GraphQL variables, not shell
  out="$(gh api graphql -F owner="$OWNER" -F name="$NAME" -F n="$1" -f query='
    query($owner: String!, $name: String!, $n: Int!) {
      repository(owner: $owner, name: $name) { pullRequest(number: $n) {
        id state isMergeQueueEnabled headRefOid body commits(last: 1) { nodes { commit { committedDate } } } isInMergeQueue mergeQueueEntry { state position } autoMergeRequest { enabledAt }
        timelineItems(last: 20, itemTypes: [ADDED_TO_MERGE_QUEUE_EVENT, REMOVED_FROM_MERGE_QUEUE_EVENT]) {
          nodes { __typename ... on RemovedFromMergeQueueEvent { reason createdAt } } } } }
    }')" || die "could not read the merge queue state of PR #$1"
  jq -L "$ROOT/scripts" --arg mark "$QUEUE_MARK" 'include "records";
    def utc: instant // error("unreadable time");
    .data.repository.pullRequest as $p
    | if $p == null then error("no such PR") else . end
    | ($p.timelineItems.nodes | last) as $last
    | ($p.commits.nodes | last | .commit.committedDate | utc) as $committed
    | {id: $p.id, queue_enabled: $p.isMergeQueueEnabled, merged: ($p.state == "MERGED"), queued: $p.isInMergeQueue, position: $p.mergeQueueEntry.position,
       auto_merge: ($p.autoMergeRequest != null),
       removed: ($p.state == "OPEN" and ($p.isInMergeQueue | not)
         and $last.__typename == "RemovedFromMergeQueueEvent" and ($last.createdAt | utc) >= $committed),
       reason: $last.reason, removed_at: $last.createdAt,
       requeued: (($p.body | requeued_after_fix($mark; $p.headRefOid))
         or ([$p.timelineItems.nodes[] | select(.__typename == "RemovedFromMergeQueueEvent" and (.createdAt | utc) >= $committed)]
             | length >= 2))}
    | .reason = (if .removed then .reason else null end)
    | .removed_at = (if .removed then .removed_at else null end)' <<<"$out" \
    || die "could not read the merge queue state of PR #$1"
}

cmd_queue() {
  { [ $# -eq 1 ] && [[ "$1" =~ ^[0-9]+$ ]]; } || usage
  queue_state "$1" | jq -c '{state: (if .queued then "queued" elif .removed then "removed" else null end),
    position: (if .queued then .position else null end), reason, removed_at, requeued}'
}

# What `pr.sh merge --after <bug>` needs to know about bug $2 for PR $1's facts, with the issue $3 the PR closes (empty
# when its branch names none): the facts plus after {bug, issue, blocks, state, state_reason, closed_at}, where blocks is
# whether the bug is among the issue's blockers. gh issue view does not show the state reason or the closing time of an
# issue, so this reads GraphQL. Dies when anything is unreadable or incomplete (more than 100 blockers), so the gate
# never decides on a guess.
after_facts() {
  local facts="$1" bug="$2" issue="$3" out what="#$2" vars=(-F "bug=$2") part=""
  if [ -n "$issue" ]; then
    what="#$bug and the blockers of #$issue"
    vars+=(-F "n=$issue")
    # shellcheck disable=SC2016 # GraphQL variables, not shell
    part='issue: issue(number: $n) { blockedBy(first: 100) { totalCount nodes { number } } }'
  fi
  # shellcheck disable=SC2016 # GraphQL variables, not shell
  out="$(gh api graphql -F owner="$OWNER" -F name="$NAME" "${vars[@]}" -f query='
    query($owner: String!, $name: String!, $bug: Int!'"${issue:+, \$n: Int!}"') {
      repository(owner: $owner, name: $name) {
        bug: issue(number: $bug) { state stateReason closedAt } '"$part"'
      }
    }')" || die "could not read $what; nothing queued"
  jq -c --argjson after "$(jq -c --argjson bug "$bug" --argjson issue "${issue:-null}" '
    .data.repository as $r
    | if $r.bug == null then error("no such issue")
      elif $issue != null and ($r.issue.blockedBy.totalCount != ($r.issue.blockedBy.nodes | length)) then error("unread blockers")
      else {bug: $bug, issue: $issue,
            blocks: ($issue != null and ([$r.issue.blockedBy.nodes[].number] | index($bug)) != null),
            state: $r.bug.state, state_reason: $r.bug.stateReason, closed_at: $r.bug.closedAt} end' <<<"$out")" \
    '. + {after: $after}' <<<"$facts" || die "could not read $what; nothing queued"
}

# Takes the record line $2 (when there is one) out of the body of PR $1 again, after the PR could not be queued: a
# re-queue that did not happen must not use up the one re-queue of the commit (ADR-025). An enqueue error can be unclear
# (a timeout while GitHub did queue the PR), so the line stays unless the queue state confirms the PR is neither queued
# nor merged. Best effort; says so when it can't.
drop_record() {
  local pr="$1" line="$2" body state
  [ -n "$line" ] || return 0
  if ! state="$(queue_state "$pr")" || jq -e '.queued or .merged' <<<"$state" >/dev/null; then
    echo "⚠  PR #$pr may be queued or merged: kept the re-queue record '$line' in its body" >&2
    return 0
  fi
  body="$(gh pr view "$pr" --repo "$REPO" --json body --jq .body)" \
    && body="$(awk -v line="$line" '$0 != line' <<<"$body")" \
    && gh pr edit "$pr" --repo "$REPO" --body "$body" >/dev/null \
    || echo "⚠  could not take the re-queue record out of the body of PR #$pr: remove the line '$line' by hand to try again" >&2
}

# Adds a low-risk or high-risk (agent-queueable) PR that passes the whole merge gate to the merge queue, which tests it
# on top of the latest main and squash-merges it (ADR-018). On a branch with a merge queue, `gh pr merge` always asks
# for auto-merge (whatever the flags), which the repo doesn't allow and agents never use, so the PR is enqueued with
# GraphQL's enqueuePullRequest. A branch without a queue is squash-merged with `gh pr merge`. Should auto-merge ever be
# on afterwards, turn it off again.
cmd_merge() {
  local pr="" after="" facts decision head branch issue out failed state attempt reasons requeue_line="" setting
  while [ $# -gt 0 ]; do
    case "$1" in
      --after) { [ -z "$after" ] && [[ "${2:-}" =~ ^[0-9]+$ ]]; } || usage; after="$2"; shift ;;
      *) { [ -z "$pr" ] && [[ "$1" =~ ^[0-9]+$ ]]; } || usage; pr="$1" ;;
    esac
    shift
  done
  setting="$(merge_setting)"
  if [ -n "$after" ] && [ "$setting" = direct ]; then
    die "--after re-queues a PR in the merge queue (ADR-025), and .github/pipeline.json says merge: direct (ADR-035): there is no merge queue. Fix the cause in the PR, push, and run pr.sh merge again; nothing queued"
  fi
  [ -n "$pr" ] || pr="$(current_pr)"
  if ! facts="$(merge_facts "$pr")" || [ -z "$facts" ]; then
    die "could not read the facts of PR #$pr; nothing queued"
  fi
  # The switch and GitHub should agree (ADR-035): when they don't, the owner has not applied the ruleset yet
  # (scripts/github-settings.sh apply). Go by what GitHub has.
  if [ "$setting" = direct ] && jq -e .queue_enabled <<<"$facts" >/dev/null; then
    echo "⚠  .github/pipeline.json says merge: direct, but $(default_branch) still has a merge queue: the ruleset is not applied yet (scripts/github-settings.sh apply); going by GitHub: adding PR #$pr to the queue" >&2
  elif [ "$setting" = queue ] && ! jq -e .queue_enabled <<<"$facts" >/dev/null; then
    echo "⚠  .github/pipeline.json says merge: queue, but $(default_branch) has no merge queue: the ruleset is not applied yet (scripts/github-settings.sh apply); going by GitHub: squash-merging PR #$pr" >&2
  fi
  branch="$(jq -r .branch <<<"$facts")"
  issue="$(branch_issue "$branch")"
  if [ -n "$after" ]; then
    facts="$(after_facts "$facts" "$after" "$issue")" || exit 1
  fi
  decision="$(jq -c --arg review_mark "$REVIEW_MARK" --arg smoke_mark "$SMOKE_MARK" --arg no_preview "$NO_PREVIEW" \
    -f "$ROOT/scripts/merge-gate.jq" <<<"$facts")" \
    || die "could not decide the merge gate of PR #$pr; nothing queued"
  jq -r '.conditions[] | "\(if .ok then "✓" else "✗" end) \(.name): \(.detail)"' <<<"$decision"
  head="$(jq -r .head <<<"$facts")"
  if ! jq -e .merge <<<"$decision" >/dev/null; then
    failed="$(jq -r '[.conditions[] | select(.ok | not) | .name] | join(", ")' <<<"$decision")"
    # A refusal for the head commit makes the PR wait on the owner (flow.sh); a new push makes it stale.
    record "$pr" "$REFUSAL_MARK" "**$REFUSAL_MARK:** refused on \`$head\`: $(jq -r \
      '[.conditions[] | select(.ok | not) | "\(.name) (\(.detail))"] | join("; ")' <<<"$decision")"
    die "PR #$pr stays for the owner: $failed; nothing queued"
  fi

  # The owner reads afterwards what an agent merged and why it counted as high-risk (ADR-021): record it before
  # queueing, and queue nothing when it can't be recorded (record dies).
  if [ "$(jq -r .risk.risk <<<"$facts")" = high ]; then
    reasons="$(jq -r '.risk.reasons | join("; ")' <<<"$facts")" \
      || die "could not read the risk reasons of PR #$pr; nothing queued"
    record "$pr" "$HIGH_RISK_MARK" "**$HIGH_RISK_MARK:** \`$head\`: $reasons"
  fi

  # The audit of a re-queue after a fix (ADR-025) comes before the queueing, like the high-risk record: it is what stops a
  # second re-queue of the commit, so queue nothing when it can't be recorded.
  if [ -n "$after" ]; then
    requeue_line="**$QUEUE_MARK:** re-queued \`$head\` after #$after fixed the check that removed it"
    record "$pr" "$QUEUE_MARK" "$requeue_line"
  fi
  if jq -e .queue_enabled <<<"$facts" >/dev/null; then
    # shellcheck disable=SC2016 # GraphQL variables, not shell
    out="$(gh api graphql -f id="$(jq -r .pr_id <<<"$facts")" -f head="$head" -f query='
      mutation($id: ID!, $head: GitObjectID!) {
        enqueuePullRequest(input: {pullRequestId: $id, expectedHeadOid: $head}) { mergeQueueEntry { position } }
      }' 2>&1)" || { drop_record "$pr" "$requeue_line"; die "could not add PR #$pr to the merge queue: $out"; }
  else
    out="$(gh pr merge "$pr" --repo "$REPO" --squash --match-head-commit "$head" 2>&1)" || {
      drop_record "$pr" "$requeue_line"
      # With no merge queue the ruleset requires the branch to be up to date with main (ADR-035): say so when that is the reason.
      if [ "$(gh pr view "$pr" --repo "$REPO" --json mergeStateStatus --jq .mergeStateStatus 2>/dev/null || true)" = BEHIND ]; then
        die "PR #$pr is behind $(default_branch), and the ruleset needs the branch up to date with it (no merge queue, ADR-035): Refresh it (work skill, **Refresh**): merge origin/$(default_branch) into the branch, scripts/check.sh --fast, review the merge, scripts/pr.sh create and ship (new records for the new head commit), wait for CI with scripts/pr.sh wait, then run pr.sh merge again. GitHub said: $out"
      fi
      die "merge failed: $out"
    }
  fi
  # The queue answers at once; look a few times in case GitHub is slow to show it.
  for attempt in 1 2 3; do
    state="$(queue_state "$pr")" || die "GitHub took PR #$pr, but its state can't be read: check it on GitHub"
    if jq -e .merged <<<"$state" >/dev/null; then
      # No merge queue on the branch (the ruleset isn't applied yet): GitHub merged it at once.
      echo "✅ PR #$pr squash-merged"
      if gh api --method DELETE "repos/$REPO/git/refs/heads/$branch" >/dev/null 2>&1; then
        echo "🗑  deleted '$branch' on GitHub"
      else
        echo "⚠  could not delete '$branch' on GitHub; flow.sh finish removes it"
      fi
      echo "Next: scripts/flow.sh finish ${issue:-<issue>} from the main checkout"
      return 0
    elif jq -e .queued <<<"$state" >/dev/null; then
      # The record is the audit trail of what an agent queued (removals are read from the timeline). The branch stays:
      # deleting the head branch of a queued PR closes it; flow.sh finish removes it after the merge.
      (record "$pr" "$QUEUE_MARK" "**$QUEUE_MARK:** added to the merge queue on \`$head\`") \
        || echo "⚠  could not record the queued commit in the PR body"
      echo "✅ PR #$pr added to the merge queue (position $(jq -r .position <<<"$state"))"
      echo "GitHub tests it on the latest $(default_branch) and squash-merges it when the checks pass; if it removes the PR, flow.sh status shows why."
      echo "Next: scripts/flow.sh status ${issue:-<issue>}; once GitHub merged it, scripts/flow.sh finish ${issue:-<issue>} from the main checkout"
      return 0
    elif jq -e .auto_merge <<<"$state" >/dev/null; then
      gh pr merge "$pr" --repo "$REPO" --disable-auto >/dev/null 2>&1 \
        || die "auto-merge is on for PR #$pr, which is not in the merge queue, and auto-merge is still on: turn it off on GitHub; nothing queued"
      die "auto-merge is on for PR #$pr, which is not in the merge queue; turned it off, nothing queued"
    fi
    [ "$attempt" -eq 3 ] || sleep 2
  done
  die "GitHub took PR #$pr, but it is neither in the merge queue nor merged: check it on GitHub"
}

cmd_refusal() {
  { [ $# -eq 1 ] && [[ "$1" =~ ^[0-9]+$ ]]; } || usage
  local body
  body="$(gh pr view "$1" --repo "$REPO" --json body --jq .body)" || die "could not read the body of PR #$1"
  jq -n -L "$ROOT/scripts" --arg mark "$REFUSAL_MARK" --arg body "$body" 'include "records";
    $body | record($mark)
    | if . == null then null else {sha: record_sha, reasons: (record_reasons // .)} end'
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
  refreshed) shift; cmd_refreshed "$@" ;;
  merge)   shift; cmd_merge "$@" ;;
  refusal) shift; cmd_refusal "$@" ;;
  queue)   shift; cmd_queue "$@" ;;
  ship)    shift; cmd_ship "$@" ;;
  *)       usage ;;
esac
