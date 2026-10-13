#!/usr/bin/env bash
# Vendor Matt Pocock's skills into .agents/skills, pinned in .agents/skills.yaml. Copilot and Codex read
# .agents/skills; Claude Code reads the same folder through the .claude/skills symlink. Each vendored skill has a
# .upstream marker; skills without one (work) are ours. Never edit vendored skills: adapt them in docs/agents/.
#
#   skills.sh sync     install the pinned skills, remove vendored skills no longer listed
#   skills.sh check    fail if vendored skills differ from the pinned ref
#   skills.sh update   pin the latest upstream commit, then sync
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() { sed -n '6,8p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

SKILLS_CONFIG="$ROOT/.agents/skills.yaml"
SKILLS_DIR="$ROOT/.agents/skills"
LICENSE_FILE="$ROOT/.agents/LICENSE.mattpocock-skills"
MARKER=".upstream"

config() { sed -nE "s/^$1:[[:space:]]*'?([^'#]*[^'#[:space:]])'?.*$/\\1/p" "$SKILLS_CONFIG"; }

listed() {
  awk '
    /^skills:/ { in_list = 1; next }
    in_list && /^[ \t]*-/ { sub(/^[ \t]*-[ \t]*/, ""); sub(/[ \t]+#.*$/, ""); print; next }
    in_list && /^[^ \t]/ { in_list = 0 }
  ' "$SKILLS_CONFIG"
}

vendored() {
  local marker
  for marker in "$SKILLS_DIR"/*/"$MARKER"; do
    [ -f "$marker" ] && basename "$(dirname "$marker")"
  done
}

is_listed() { listed | awk -v n="$1" -F/ '$NF == n { found = 1 } END { exit !found }'; }

UPSTREAM=""
fetch_upstream() {
  UPSTREAM="$(mktemp -d)"
  trap 'rm -rf "$UPSTREAM"' EXIT
  git -C "$UPSTREAM" init --quiet
  git -C "$UPSTREAM" fetch --quiet --depth 1 "$SOURCE" "$REF"
  git -C "$UPSTREAM" checkout --quiet FETCH_HEAD
}

# Renders every listed skill into an empty dest_root, or fails before writing anything if one is missing upstream.
render() {
  local dest_root="$1" path name
  while read -r path; do
    [ -f "$UPSTREAM/skills/$path/SKILL.md" ] || die "skills/$path not found upstream at $REF — fix .agents/skills.yaml"
  done < <(listed)
  mkdir -p "$dest_root"
  while read -r path; do
    name="$(basename "$path")"
    [ ! -e "$dest_root/$name" ] || die "two listed skills are named '$name'"
    cp -R "$UPSTREAM/skills/$path" "$dest_root/$name"
    printf '%s\n%s\nskills/%s\n' "$SOURCE" "$REF" "$path" > "$dest_root/$name/$MARKER"
  done < <(listed)
  cp "$UPSTREAM/LICENSE" "$dest_root/.license"
}

# Renders into a temp dir first and swaps in only when everything rendered, so a failure leaves .agents/skills as it was.
cmd_sync() {
  local name staged
  fetch_upstream
  for name in $(listed | xargs -n1 basename); do
    [ ! -d "$SKILLS_DIR/$name" ] || [ -f "$SKILLS_DIR/$name/$MARKER" ] || die "'$name' is one of ours; it can't be vendored too"
  done
  staged="$UPSTREAM/.staged"
  render "$staged"
  for name in $(vendored); do
    is_listed "$name" || { rm -rf "${SKILLS_DIR:?}/$name"; echo "🗑  removed $name"; }
  done
  for name in $(listed | xargs -n1 basename); do
    rm -rf "${SKILLS_DIR:?}/$name"
    mv "$staged/$name" "$SKILLS_DIR/$name"
  done
  mv "$staged/.license" "$LICENSE_FILE"
  echo "✅ $(listed | wc -l | tr -d ' ') skills at ${REF:0:12}"
}

cmd_check() {
  local expected name drift=false
  fetch_upstream
  expected="$UPSTREAM/.expected"
  render "$expected"
  for name in $({ listed | xargs -n1 basename; vendored; } | sort -u); do
    diff -rq "$expected/$name" "$SKILLS_DIR/$name" >/dev/null 2>&1 || { echo "✗ $name"; drift=true; }
  done
  cmp -s "$expected/.license" "$LICENSE_FILE" || { echo "✗ licence"; drift=true; }
  ! $drift || die "vendored skills differ from $REF — run scripts/skills.sh sync (never edit them by hand)"
  echo "✅ vendored skills match ${REF:0:12}"
}

cmd_update() {
  local latest tmp
  latest="$(git ls-remote "$SOURCE" HEAD | cut -f1)"
  [ -n "$latest" ] || die "could not resolve HEAD of $SOURCE"
  REF="$latest"
  cmd_sync
  tmp="$(mktemp)"
  sed -E "s/^ref:.*/ref: '$latest'/" "$SKILLS_CONFIG" > "$tmp" && mv "$tmp" "$SKILLS_CONFIG"
}

SOURCE="$(config source)"
REF="$(config ref)"
[ -n "$SOURCE" ] && [ -n "$REF" ] || die "source and ref must be set in .agents/skills.yaml"

case "${1:-}" in
  sync)   cmd_sync ;;
  check)  cmd_check ;;
  update) cmd_update ;;
  *)      usage ;;
esac
