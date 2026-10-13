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

issue_facts() {
  local item parent
  item="$(gh issue view "$1" --repo "$REPO" --json number,labels,parent \
    --jq '{number, labels: [.labels[].name], parent: (.parent.number // null)}')"
  parent="$(jq -r '.parent // empty' <<<"$item")"
  if [ -n "$parent" ]; then
    parent="$(gh issue view "$parent" --repo "$REPO" --json number,labels --jq '{number, labels: [.labels[].name]}')"
  fi
  jq --argjson parent "${parent:-null}" '.parent = $parent' <<<"$item"
}

# The PR's facts as the input of risk.jq: every path it touches (both sides of a rename) and its issues' labels.
risk_facts() {
  local pr="$1" files issues="[]" n
  files="$(gh api "repos/$REPO/pulls/$pr/files" --paginate --jq '.[] | .filename, (.previous_filename // empty)' \
    | jq -Rn '[inputs | select(. != "")] | unique')"
  for n in $(gh pr view "$pr" --repo "$REPO" --json headRefName,closingIssuesReferences \
      --jq '.closingIssuesReferences[].number, (.headRefName | capture("^[a-z]+/(?<n>[0-9]+)-").n // empty)' | sort -u); do
    issues="$(jq --argjson i "$(issue_facts "$n")" '. + [$i]' <<<"$issues")"
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

decision="$(risk_facts "$pr" | jq -c --rawfile rules "$ROOT/scripts/high-risk-paths.txt" -f "$ROOT/scripts/risk.jq")"
if $json; then echo "$decision"; else jq -r '.risk, (.reasons[] | "  \(.)")' <<<"$decision"; fi
