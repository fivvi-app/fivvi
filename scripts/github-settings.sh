#!/usr/bin/env bash
# The GitHub settings the factory relies on (ADR-016), applied from versioned files. Idempotent: run it again after
# changing a file. Needs a token with admin rights on the repo.
#
#   github-settings.sh apply      the ruleset for main (.github/rulesets/main.json), then the merge settings and the
#                                 labels in .github/repo-settings.json
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { usage_of "$0"; }

need_cmd gh
need_cmd jq
REPO="$(repo_slug)"
RULESET="$ROOT/.github/rulesets/main.json"
SETTINGS="$ROOT/.github/repo-settings.json"

apply_ruleset() {
  local name id
  name="$(jq -r .name "$RULESET")"
  id="$(gh api "repos/$REPO/rulesets" | jq -r --arg name "$name" '[.[] | select(.name == $name)][0].id // empty')"
  if [ -n "$id" ]; then
    gh api --method PUT "repos/$REPO/rulesets/$id" --input "$RULESET" >/dev/null
    echo "✅ ruleset '$name' updated"
  else
    gh api --method POST "repos/$REPO/rulesets" --input "$RULESET" >/dev/null
    echo "✅ ruleset '$name' created"
  fi
}

apply_merge_settings() {
  jq .merge "$SETTINGS" | gh api --method PATCH "repos/$REPO" --input - >/dev/null
  echo "✅ merge settings: $(jq -r '.merge | to_entries | map("\(.key)=\(.value)") | join(", ")' "$SETTINGS")"
}

apply_labels() {
  local name color description
  while IFS=$'\t' read -r name color description; do
    gh label create "$name" --repo "$REPO" --color "$color" --description "$description" --force >/dev/null
    echo "🏷  label $name"
  done < <(jq -r '.labels[] | [.name, .color, .description] | @tsv' "$SETTINGS")
}

case "${1:-}" in
  apply) [ $# -eq 1 ] || usage; apply_ruleset; apply_merge_settings; apply_labels ;;
  *) usage ;;
esac
