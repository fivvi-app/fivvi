#!/usr/bin/env bash
# Specs, tickets and bugs as GitHub issues (docs/agents/issue-tracker.md). Bodies are Markdown; pass them with
# --body-file - and a heredoc.
#
#   issue.sh show <n>                                        fields, parent, open blockers, sub-issues and body
#   issue.sh create <spec|ticket|bug> --title <t> --body-file <f|-> [--parent <n>] [--blocked-by <n>]... [--label <l>]...
#   issue.sh update <n> [--title <t>] [--body-file <f|->]
#   issue.sh comment <n> --body-file <f|->
#   issue.sh label <n> [--add <l>]... [--remove <l>]...
#   issue.sh block <n> --by <m>                              <n> is blocked by <m>
#   issue.sh ready [--parent <n>]                            open, unassigned ready-for-agent tickets with no open blocker
#   issue.sh claim <n>                                       assign to yourself: the first write when starting a ticket
#   issue.sh close <n> [--comment <text>] [--not-planned]
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

need_cmd gh
need_cmd jq
REPO="$(repo_slug)"
FIELDS="number,title,state,labels,assignees,body,url,parent,subIssues,blockedBy"

is_number() { [[ "${1:-}" =~ ^[0-9]+$ ]] || die "not an issue number: ${1:-<missing>}"; }
view() { gh issue view "$1" --repo "$REPO" --json "${2:-$FIELDS}"; }

cmd_show() {
  [ $# -eq 1 ] || usage
  is_number "$1"
  view "$1" | jq -r '
    def ref: "#\(.number) \(.state) — \(.title)";
    "#\(.number) \(.state) — \(.title)",
    "Labels: \([.labels[].name] | join(", "))",
    "Assignees: \([.assignees[].login] | join(", "))",
    (.parent // empty | "Parent: \(ref)"),
    ([.blockedBy.nodes[] | select(.state == "OPEN")] | if length == 0 then "Blocked by: none" else "Blocked by:", (.[] | "  \(ref)") end),
    (if .subIssues.totalCount == 0 then empty else "Sub-issues:", (.subIssues.nodes[] | "  \(ref)") end),
    "URL: \(.url)",
    "",
    .body'
}

cmd_create() {
  [ $# -ge 1 ] || usage
  local kind="$1" title="" body="" body_set=false url
  local args=()
  shift
  case "$kind" in
    spec) args+=(--label "$SPEC_LABEL") ;;
    ticket) args+=(--label "$READY_LABEL") ;;
    bug) args+=(--label bug --label needs-triage) ;;
    *) usage ;;
  esac
  while [ $# -gt 0 ]; do
    case "$1" in
      --title) title="${2:?}"; shift ;;
      --body-file) body="$(read_body "${2:?}")"; body_set=true; shift ;;
      --parent) is_number "${2:-}"; args+=(--parent "$2"); shift ;;
      --blocked-by) is_number "${2:-}"; args+=(--blocked-by "$2"); shift ;;
      --label) args+=(--label "${2:?}"); shift ;;
      *) usage ;;
    esac
    shift
  done
  [ -n "$title" ] || die "--title is required"
  $body_set || die "--body-file is required"
  url="$(gh issue create --repo "$REPO" --title "$title" --body "$body" "${args[@]}")"
  echo "✅ #${url##*/} $title"
}

cmd_update() {
  [ $# -ge 1 ] || usage
  local n="$1"
  local args=()
  is_number "$n"
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --title) args+=(--title "${2:?}"); shift ;;
      --body-file) args+=(--body "$(read_body "${2:?}")"); shift ;;
      *) usage ;;
    esac
    shift
  done
  [ "${#args[@]}" -gt 0 ] || usage
  gh issue edit "$n" --repo "$REPO" "${args[@]}" >/dev/null
  echo "✅ updated #$n"
}

cmd_comment() {
  { [ $# -eq 3 ] && [ "$2" = --body-file ]; } || usage
  is_number "$1"
  gh issue comment "$1" --repo "$REPO" --body "$(read_body "$3")" >/dev/null
  echo "💬 commented on #$1"
}

cmd_label() {
  [ $# -ge 3 ] || usage
  local n="$1"
  local args=()
  is_number "$n"
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --add) args+=(--add-label "${2:?}"); shift ;;
      --remove) args+=(--remove-label "${2:?}"); shift ;;
      *) usage ;;
    esac
    shift
  done
  gh issue edit "$n" --repo "$REPO" "${args[@]}" >/dev/null
  echo "🏷  #$n: $(view "$n" labels | jq -r '[.labels[].name] | join(", ")')"
}

cmd_block() {
  { [ $# -eq 3 ] && [ "$2" = --by ]; } || usage
  is_number "$1"
  is_number "$3"
  gh issue edit "$1" --repo "$REPO" --add-blocked-by "$3" >/dev/null
  echo "⛓  #$1 is blocked by #$3"
}

# Tab-separated: number, title. Candidates are the parent's open sub-issues, or every open ready-for-agent issue.
cmd_ready() {
  local parent="" candidates n
  while [ $# -gt 0 ]; do
    case "$1" in
      --parent) is_number "${2:-}"; parent="$2"; shift ;;
      *) usage ;;
    esac
    shift
  done
  if [ -n "$parent" ]; then
    candidates="$(view "$parent" subIssues | jq -r '.subIssues.nodes[] | select(.state == "OPEN") | .number')"
  else
    candidates="$(gh issue list --repo "$REPO" --state open --label "$READY_LABEL" --limit 200 --json number --jq '.[].number')"
  fi
  for n in $candidates; do
    view "$n" | jq -r --arg ready "$READY_LABEL" --arg spec "$SPEC_LABEL" '
      [.labels[].name] as $labels
      | select(($labels | index($ready)) and ((($labels | index($spec)) | not) or .subIssues.totalCount == 0)
          and (.assignees | length == 0)
          and ([.blockedBy.nodes[] | select(.state == "OPEN")] | length == 0))
      | "\(.number)\t\(.title)"'
  done
}

cmd_claim() {
  [ $# -eq 1 ] || usage
  is_number "$1"
  gh issue edit "$1" --repo "$REPO" --add-assignee @me >/dev/null
  echo "🙋 claimed #$1"
}

cmd_close() {
  [ $# -ge 1 ] || usage
  local n="$1"
  local args=()
  is_number "$n"
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --comment) args+=(--comment "${2:?}"); shift ;;
      --not-planned) args+=(--reason "not planned") ;;
      *) usage ;;
    esac
    shift
  done
  gh issue close "$n" --repo "$REPO" ${args[@]+"${args[@]}"} >/dev/null
  echo "✅ closed #$n"
}

case "${1:-}" in
  show)    shift; cmd_show "$@" ;;
  create)  shift; cmd_create "$@" ;;
  update)  shift; cmd_update "$@" ;;
  comment) shift; cmd_comment "$@" ;;
  label)   shift; cmd_label "$@" ;;
  block)   shift; cmd_block "$@" ;;
  ready)   shift; cmd_ready "$@" ;;
  claim)   shift; cmd_claim "$@" ;;
  close)   shift; cmd_close "$@" ;;
  *)       usage ;;
esac
