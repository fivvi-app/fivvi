#!/usr/bin/env bash
# Keep personal and work email addresses out of this public repo. An allowlist, so nothing here names an address.
#
#   emails.sh commits         every commit of origin/<default>..HEAD: author, committer and Co-authored-by are GitHub noreply addresses
#   emails.sh hook <file>     the same for the commit being made, with its message in <file> (.githooks/commit-msg)
#   emails.sh files           tracked and new files hold only allowlisted addresses (scripts/email-allowlist.txt)
#   emails.sh identity        set the repo-local user.email to the noreply address of the gh user, unless it already is one
#
# Findings name the commit or file and line, never the address.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

ALLOWLIST="$ROOT/scripts/email-allowlist.txt"
EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}'

# Problems found in one commit: "<what> <role> is not a GitHub noreply address". $1 is the commit label, then the
# author, the committer and the message follow as $2, $3 and on stdin.
commit_problems() {
  local label="$1" author="$2" committer="$3" email rc=0
  is_noreply_email "$author" || { echo "$label: author is not a GitHub noreply address" >&2; rc=1; }
  is_noreply_email "$committer" || { echo "$label: committer is not a GitHub noreply address" >&2; rc=1; }
  while IFS= read -r email; do
    is_noreply_email "$email" || { echo "$label: Co-authored-by is not a GitHub noreply address" >&2; rc=1; }
  done < <(coauthor_emails)
  return "$rc"
}

# Ends a check with the one fix hint when it found problems ($1 is its status).
finish() {
  [ "$1" = 0 ] || echo "  fix: $NOREPLY_HINT" >&2
  return "$1"
}

commits() {
  local base sha rc=0
  base="origin/$(default_branch)"
  git rev-parse --verify --quiet "$base" >/dev/null \
    || { echo "✗ $base not found, so the branch's commits are unknown — run: git fetch origin" >&2; return 1; }
  while IFS= read -r sha; do
    git log -1 --format=%B "$sha" \
      | commit_problems "$(git rev-parse --short "$sha")" "$(git log -1 --format=%ae "$sha")" "$(git log -1 --format=%ce "$sha")" \
      || rc=1
  done < <(git log "$base..HEAD" --format=%H)
  finish "$rc"
}

# The commit-msg hook: the identities git will use, and the Co-authored-by trailers of the message in $1.
hook() {
  local author committer rc=0
  author="$(ident_email "$(git var GIT_AUTHOR_IDENT 2>/dev/null || true)")"
  committer="$(ident_email "$(git var GIT_COMMITTER_IDENT 2>/dev/null || true)")"
  commit_problems "✗ this commit" "$author" "$committer" <"$1" || rc=1
  finish "$rc"
}

# The allowlist, read once: address and domain patterns in ADDRESS_ENTRIES (matched case-insensitively), path globs in
# SKIP_PATHS (matched as written).
ADDRESS_ENTRIES=()
SKIP_PATHS=()
trim() {
  local text="${1#"${1%%[![:space:]]*}"}"
  echo "${text%"${text##*[![:space:]]}"}"
}

load_allowlist() {
  local line
  while IFS= read -r line; do
    line="$(trim "${line%%#*}")"
    case "$line" in
      "") ;;
      path:*) SKIP_PATHS+=("$(trim "${line#path:}")") ;;
      *) ADDRESS_ENTRIES+=("$line") ;;
    esac
  done <"$ALLOWLIST"
}

# An entry with an @ matches the whole address, any other entry the domain; * matches anything, dots included.
email_allowed() { nocase address_listed "$1"; }
address_listed() {
  local address="$1" domain="${1#*@}" entry
  is_noreply_email "$address" && return 0
  for entry in "${ADDRESS_ENTRIES[@]}"; do
    # shellcheck disable=SC2254 # the entry is a glob on purpose
    case "$entry" in
      *@*) case "$address" in $entry) return 0 ;; esac ;;
      *) case "$domain" in $entry) return 0 ;; esac ;;
    esac
  done
  return 1
}

# Retina image names such as icon@2x.png look like addresses.
is_asset_name() { nocase asset_match "$1"; }
asset_match() { [[ "$1" =~ @[0-9]+x\.(png|jpe?g|gif|webp|svg)$ ]]; }

path_skipped() {
  local entry
  for entry in ${SKIP_PATHS[@]+"${SKIP_PATHS[@]}"}; do
    # shellcheck disable=SC2254 # the entry is a glob on purpose
    case "$1" in $entry) return 0 ;; esac
  done
  return 1
}

files() {
  local row path rest line address rc=0
  load_allowlist
  while IFS= read -r row; do
    path="${row%%:*}"
    rest="${row#*:}"
    line="${rest%%:*}"
    address="${rest#*:}"
    path_skipped "$path" && continue
    is_asset_name "$address" && continue
    email_allowed "$address" || { echo "$path:$line: email address outside the allowlist" >&2; rc=1; }
  done < <(git ls-files -z --cached --others --exclude-standard | xargs -0 grep -IHnoE "$EMAIL_RE" 2>/dev/null || true)
  [ "$rc" = 0 ] || echo "  fix: remove it, or use an example.com address; scripts/email-allowlist.txt lists what is allowed" >&2
  return "$rc"
}

identity() {
  local current noreply
  current="$(git -C "$MAIN_ROOT" config --local user.email 2>/dev/null || true)"
  [ -n "$current" ] && is_noreply_email "$current" && return 0
  noreply="$(gh api user --jq 'select(.id and .login) | "\(.id)+\(.login)@users.noreply.github.com"' 2>/dev/null)" || noreply=""
  if [ -z "$noreply" ] || ! is_noreply_email "$noreply"; then
    echo "✗ could not read your GitHub user — run gh auth login and re-run, or set it yourself: $NOREPLY_HINT" >&2
    return 1
  fi
  git -C "$MAIN_ROOT" config --local user.email "$noreply"
  echo "✓ git user.email in this repo is now $noreply"
}

case "${1:-}" in
  commits) commits ;;
  hook) [ -n "${2:-}" ] || usage_of "$0"; hook "$2" ;;
  files) files ;;
  identity) identity ;;
  *) usage_of "$0" ;;
esac
