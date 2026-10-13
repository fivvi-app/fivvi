#!/usr/bin/env bash
# Whether a PR is low or high risk (ADR-016). High when it changes, adds, deletes or renames a path in
# scripts/high-risk-paths.txt, or when its issue or that issue's parent spec is labelled owner-merge. Agents merge only
# low-risk PRs (scripts/pr.sh merge); high-risk PRs go to the owner. The decision is scripts/risk.jq.
#
#   risk.sh <pr> [--json]     prints low or high with one reason per line; --json prints {risk, reasons}
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

need_cmd gh
need_cmd jq
REPO="$(repo_slug)"

# Each of these dies on a failed read: an unknown fact is never read as "not high-risk". They run in $(...), where bash
# 3.2 drops errexit, so every call is checked and every caller exits when one fails.
issue_facts() {
  local item p parent=null
  item="$(gh issue view "$1" --repo "$REPO" --json number,labels,parent \
    --jq '{number, labels: [.labels[].name], parent: (.parent.number // null)}')" || die "could not read issue #$1"
  p="$(jq -r '.parent // empty' <<<"$item")" || die "could not read issue #$1"
  if [ -n "$p" ]; then
    parent="$(gh issue view "$p" --repo "$REPO" --json number,labels --jq '{number, labels: [.labels[].name]}')" \
      || die "could not read spec #$p of issue #$1"
  fi
  jq --argjson parent "$parent" '.parent = $parent' <<<"$item" || die "could not read issue #$1"
}

# The PR's facts as the input of risk.jq: every path it touches (both sides of a rename) and its issues' labels.
risk_facts() {
  local pr="$1" files numbers issues="[]" n item
  files="$(gh api "repos/$REPO/pulls/$pr/files" --paginate --jq '.[] | .filename, (.previous_filename // empty)')" \
    || die "could not read the files of PR #$pr"
  files="$(jq -Rn '[inputs | select(. != "")] | unique' <<<"$files")" || die "could not read the files of PR #$pr"
  numbers="$(gh pr view "$pr" --repo "$REPO" --json headRefName,closingIssuesReferences \
    --jq '.closingIssuesReferences[].number, (.headRefName | capture("^[a-z]+/(?<n>[0-9]+)-").n // empty)')" \
    || die "could not read the issues of PR #$pr"
  numbers="$(sort -u <<<"$numbers")"
  for n in $numbers; do
    item="$(issue_facts "$n")" || exit 1
    issues="$(jq --argjson i "$item" '. + [$i]' <<<"$issues")" || die "could not read issue #$n"
  done
  jq -n --argjson files "$files" --argjson issues "$issues" '{files: $files, issues: $issues}'
}

pr="" json=false
while [ $# -gt 0 ]; do
  case "$1" in
    --json) json=true ;;
    *) [ -z "$pr" ] || usage; pr="$1" ;;
  esac
  shift
done
[[ "$pr" =~ ^[0-9]+$ ]] || usage

facts="$(risk_facts "$pr")" || exit 1
decision="$(jq -c --rawfile rules "$ROOT/scripts/high-risk-paths.txt" -f "$ROOT/scripts/risk.jq" <<<"$facts")" \
  || die "could not decide the risk of PR #$pr"
if $json; then echo "$decision"; else jq -r '.risk, (.reasons[] | "  \(.)")' <<<"$decision"; fi
