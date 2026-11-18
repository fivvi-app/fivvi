#!/usr/bin/env bash
# The spec review of ADR-034 (review: split): the map the `reviewer` checks a merged slice or a finished spec against, and
# the record of its verdicts. See docs/agents/build.md, **Spec review**.
#
#   spec-review.sh map <spec> [--json]      from GitHub, every acceptance criterion of the spec and of each of its
#                                           sub-issues (tickets and bugs), the sub-issue that owns it, its state, the PR
#                                           that closed it with its squash-merge commit and changed files. Markdown, or
#                                           JSON with --json. Fails rather than print a partial map
#   spec-review.sh record <spec> (--slice <pr> | --final) clean|not-clean [--findings <n>]
#                                           append a line to .work/spec-<spec>/spec-review.md (git-ignored, in the main
#                                           checkout): the time, the scope (a slice or ticket PR, or the final review),
#                                           the verdict, the findings and the SHA of origin/main. A not-clean verdict
#                                           names at least one finding
#   spec-review.sh status <spec>            exit 0 and `covered` when the last final record is clean and newer than the
#                                           spec's last merged PR; exit 1 and `not covered: <why>` otherwise; exit 2, and
#                                           nothing on stdout, when GitHub or the record can't be read (flow.sh turns
#                                           that into an error, never into "covered")
#
# FIVVI_NOW (ISO-8601 UTC) replaces the clock, for tests.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

need_cmd gh
need_cmd jq
REPO="$(repo_slug)"
[ -n "$REPO" ] || die "could not read the GitHub repository from the origin remote"
OWNER="${REPO%%/*}"
NAME="${REPO#*/}"

is_number() { [[ "${1:-}" =~ ^[0-9]+$ ]] || die "not an issue number: ${1:-<missing>}"; }
record_file() { echo "$NOTES_DIR/spec-$1/spec-review.md"; }

# Acceptance criteria of an issue body (the input, a string or null): the checklist items under its
# `## Acceptance criteria` heading, up to the next heading of the same or a higher level. Pure; the ids are built by the
# caller. Load with `jq -L scripts`.
CRITERIA_JQ='
def criteria:
  (. // "" | split("\n") | map(rtrimstr("\r"))) as $lines
  | reduce $lines[] as $l ({level: 0, items: []};
      if ($l | test("^#{1,6}\\s*acceptance criteria\\b"; "i")) then .level = ($l | capture("^(?<h>#+)").h | length)
      elif ($l | test("^#{1,6}\\s")) then (if ($l | capture("^(?<h>#+)").h | length) <= .level then .level = 0 else . end)
      elif .level > 0 and ($l | test("^\\s*[-*] \\[[ xX]\\]\\s")) then
        .items += [{checked: ($l | test("^\\s*[-*] \\[[xX]\\]")), text: ($l | sub("^\\s*[-*] \\[[ xX]\\]\\s*"; ""))}]
      else . end)
  | .items;
def numbered($prefix): to_entries | map(.value + {id: "\($prefix)\(.key + 1)"});
'

# The map of spec $1 as JSON, from one GraphQL read. Dies when the read fails or is incomplete (more sub-issues than it
# returns).
read_map() {
  local out
  # shellcheck disable=SC2016 # GraphQL variables, not shell
  out="$(gh api graphql -F owner="$OWNER" -F name="$NAME" -F n="$1" -f query='
    query($owner: String!, $name: String!, $n: Int!) {
      repository(owner: $owner, name: $name) { issue(number: $n) {
        number title state url body
        subIssues(first: 100) { totalCount nodes {
          number title state url body
          timelineItems(last: 10, itemTypes: [CLOSED_EVENT]) { nodes { ... on ClosedEvent { closer {
            __typename ... on PullRequest {
              number title url merged mergedAt mergeCommit { oid }
              files(first: 100) { totalCount nodes { path } } } } } } } } } } }
    }')" || die "could not read #$1 and its sub-issues from GitHub"
  jq -c -L "$ROOT/scripts" "include \"records\"; $CRITERIA_JQ"'
    .data.repository.issue as $i
    | if $i == null then error("no such issue")
      elif $i.subIssues.totalCount != ($i.subIssues.nodes | length) then error("not all \($i.subIssues.totalCount) sub-issues were read")
      else {
        spec: {number: $i.number, title: $i.title, state: $i.state, url: $i.url,
               criteria: ($i.body | criteria | numbered("S"))},
        tickets: [$i.subIssues.nodes[] | . as $t
          | ([$t.timelineItems.nodes[].closer | select(. != null and .__typename == "PullRequest" and .merged == true)] | last) as $pr
          | {number, title, state, url,
             criteria: ($t.body | criteria | numbered("#\($t.number).")),
             pr: (if $pr == null then null else {number: $pr.number, title: $pr.title, url: $pr.url,
                  merged_at: $pr.mergedAt, commit: $pr.mergeCommit.oid,
                  files: [$pr.files.nodes[].path], files_total: $pr.files.totalCount} end)}]
      } | . + {last_merged_at: ([.tickets[].pr | select(. != null) | .merged_at] | max_by(instant))}
      end' <<<"$out" || die "could not read #$1 and its sub-issues from GitHub"
}

cmd_map() {
  [ $# -ge 1 ] || usage
  local n="$1" json=false map
  is_number "$n"
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --json) json=true ;;
      *) usage ;;
    esac
    shift
  done
  map="$(read_map "$n")" || exit 1
  if $json; then
    jq . <<<"$map"
    return
  fi
  jq -r '
    def short: .[:7];
    def line($c): "- **\($c.id)** \(if $c.checked then "[x]" else "[ ]" end) \($c.text)";
    "# Spec review map: #\(.spec.number) \(.spec.title) (\(.spec.state))",
    "",
    "Every acceptance criterion with the ticket that owns it, that ticket'"'"'s state, the PR that closed it and the squash commit and files of that PR. `git blame` a failing line to its commit, then to its ticket here.",
    "",
    "## Spec #\(.spec.number): its own acceptance criteria (owned by no ticket; the final review covers them)",
    (if (.spec.criteria | length) == 0 then "(none)" else (.spec.criteria[] | line(.)) end),
    (.tickets[] as $t
      | "",
        "## #\($t.number) \($t.title) — \($t.state)",
        (if $t.pr != null then
           "Closed by PR #\($t.pr.number) \($t.pr.title), squash commit \($t.pr.commit), merged \($t.pr.merged_at)",
           "Files (\(if $t.pr.files_total > ($t.pr.files | length) then "\($t.pr.files | length) of \($t.pr.files_total) files" else "\($t.pr.files | length) files" end)): \($t.pr.files | join(", "))"
         elif $t.state == "OPEN" then "Open: no PR has closed it yet"
         else "Closed, no merged PR closed it" end),
        "Acceptance criteria:",
        (if ($t.criteria | length) == 0 then "(none)" else ($t.criteria[] | line(.) + " (\($t.state))") end))' <<<"$map"
}

# The time for a record: FIVVI_NOW, or the clock.
now_iso() {
  if [ -n "${FIVVI_NOW+x}" ]; then
    [[ "$FIVVI_NOW" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || die "FIVVI_NOW is not a UTC time like 2026-11-18T12:00:00Z: '$FIVVI_NOW'"
    echo "$FIVVI_NOW"
  else
    date -u +%Y-%m-%dT%H:%M:%SZ
  fi
}

cmd_record() {
  [ $# -ge 1 ] || usage
  local n="$1" scope="" verdict="" findings="" main sha branch
  is_number "$n"
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --slice) [ -z "$scope" ] && [[ "${2:-}" =~ ^[0-9]+$ ]] || usage; scope="slice PR #$2"; shift ;;
      --final) [ -z "$scope" ] || usage; scope="final" ;;
      --findings) [[ "${2:-}" =~ ^[0-9]+$ ]] || usage; findings=$((10#$2)); shift ;;
      clean | not-clean) [ -z "$verdict" ] || usage; verdict="$1" ;;
      *) usage ;;
    esac
    shift
  done
  [ -n "$scope" ] && [ -n "$verdict" ] || usage
  if [ "$verdict" = clean ]; then
    [ -z "$findings" ] || [ "$findings" -eq 0 ] || die "a clean review has no findings: record it as not-clean with --findings <n>"
    findings=0
  else
    [ -n "$findings" ] && [ "$findings" -gt 0 ] || die "a not-clean review names its findings: add --findings <n> (at least 1)"
  fi
  # The SHA the review covered: the latest origin/<default branch>, fetched now; a stale one is a warning, not an error.
  branch="$(default_branch)"
  git -C "$MAIN_ROOT" fetch --quiet origin "$branch" 2>/dev/null || echo "warning: could not fetch origin/$branch; recording the one this checkout has" >&2
  sha="$(git -C "$MAIN_ROOT" rev-parse --verify "origin/$branch^{commit}" 2>/dev/null)" || die "no origin/$branch in $MAIN_ROOT"
  main="$(record_file "$n")"
  mkdir -p "$(dirname "$main")"
  [ -f "$main" ] || printf '# Spec review #%s\n\n' "$n" >"$main"
  printf -- '- %s | %s | %s | findings %s | origin/%s %s\n' "$(now_iso)" "$scope" "$verdict" "$findings" "$branch" "$sha" >>"$main"
  echo "📝 #$n $scope: $verdict (findings $findings) on origin/$branch ${sha:0:7}"
}

# Exit codes of status: 0 covered, 1 not covered, 2 an error. Reads GitHub for the spec's last merged PR and the record
# file for its final reviews.
cmd_status() {
  [ $# -eq 1 ] || usage
  local n="$1" map file verdict
  is_number "$n"
  map="$(read_map "$n")" || exit 2
  file="$(record_file "$n")"
  verdict="$( { [ ! -f "$file" ] || cat "$file"; } | jq -r -R -s -L "$ROOT/scripts" --argjson map "$map" 'include "records";
    ([split("\n")[]
      | capture("^- (?<time>\\S+) \\| final \\| (?<verdict>clean|not-clean) \\| findings (?<n>[0-9]+) \\| origin/\\S+ (?<sha>[0-9a-f]{40})$")
      | select(.time | instant != null)] | last) as $last
    | ([$map.tickets[].pr | select(. != null)] | max_by(.merged_at | instant)) as $merged
    | if $last == null then "not covered: no final spec review is recorded for #\($map.spec.number)"
      elif $last.verdict != "clean" then "not covered: the last final spec review (\($last.time)) was not clean"
      elif $merged != null and ($merged.merged_at | instant) >= ($last.time | instant) then
        "not covered: PR #\($merged.number) merged after the last clean final spec review (\($last.time))"
      else "covered" end' 2>/dev/null)" || exit 2
  [ -n "$verdict" ] || exit 2
  echo "$verdict"
  [ "$verdict" = covered ]
}

case "${1:-}" in
  map)    shift; cmd_map "$@" ;;
  record) shift; cmd_record "$@" ;;
  status) shift; cmd_status "$@" ;;
  *)      usage ;;
esac
