#!/usr/bin/env bash
# Keep keys and tokens out of this public repo (E017 AC7). Dependency-free, over tracked and new files (not ignored ones).
#
#   secrets.sh files     no file named *.p12, *.p8, *.jks, *.keystore or *.mobileprovision, and no private-key block
#                        (PEM), AWS access key ID, GitHub token or Slack token inside a file
#
# Findings name the file and line, never the value. A file that has to stay is listed with a reason in
# scripts/secret-allowlist.txt (it lifts both checks for that path).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

ALLOWLIST="$ROOT/scripts/secret-allowlist.txt"
KEY_FILE_NAME_RE='\.(p12|p8|jks|keystore|mobileprovision)$'
# One pattern per kind of key material; each is written so that it does not match its own source text.
KINDS=("PEM private key" "AWS access key ID" "GitHub token" "Slack token")
PATTERNS=(
  '-----BEGIN ([A-Z0-9]+ )*PRIVATE KEY'
  '(^|[^A-Za-z0-9])AKIA[0-9A-Z]{16}([^A-Za-z0-9]|$)'
  '(^|[^A-Za-z0-9_])(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})'
  '(^|[^A-Za-z0-9])xox[abprs]-[A-Za-z0-9-]{10,}'
)

# The allowlist, read once: path globs in ALLOWED, each with a reason after "|". An entry without one is itself a finding.
ALLOWED=()
allowlist_problems=0
load_allowlist() {
  local line glob reason n=0
  while IFS= read -r line; do
    n=$((n + 1))
    line="${line%%#*}"
    [[ "$line" == *[![:space:]]* ]] || continue
    glob="${line%%|*}"
    reason="${line#*|}"
    [ "$reason" != "$line" ] || reason=""
    glob="$(echo "$glob" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
    if [ -z "$(echo "$reason" | tr -d '[:space:]')" ]; then
      echo "scripts/secret-allowlist.txt:$n: entry without a reason (glob | why it is not a secret)" >&2
      allowlist_problems=1
    else
      ALLOWED+=("$glob")
    fi
  done <"$ALLOWLIST"
}

path_allowed() {
  local entry
  for entry in ${ALLOWED[@]+"${ALLOWED[@]}"}; do
    # shellcheck disable=SC2254 # the entry is a glob on purpose
    case "$1" in $entry) return 0 ;; esac
  done
  return 1
}

files() {
  local rc=0 path name i row line
  load_allowlist
  rc=$allowlist_problems
  while IFS= read -r -d '' path; do
    path_allowed "$path" && continue
    name="$(printf '%s' "${path##*/}" | tr '[:upper:]' '[:lower:]')"
    if [[ "$name" =~ $KEY_FILE_NAME_RE ]]; then
      echo "$path: key or certificate file in the repo" >&2
      rc=1
    fi
  done < <(git ls-files -z --cached --others --exclude-standard)
  for i in "${!PATTERNS[@]}"; do
    while IFS= read -r row; do
      path="${row%%:*}"
      line="${row#*:}"
      line="${line%%:*}"
      path_allowed "$path" && continue
      echo "$path:$line: ${KINDS[$i]}" >&2
      rc=1
    done < <(git ls-files -z --cached --others --exclude-standard | xargs -0 grep -IHnoE -e "${PATTERNS[$i]}" 2>/dev/null | cut -d: -f1,2 | sort -u || true)
  done
  [ "$rc" = 0 ] || echo "  fix: keep keys, certificates and tokens out of the repo (docs/engineering/RELEASE.md); scripts/secret-allowlist.txt lists the files that are fine, each with a reason" >&2
  return "$rc"
}

case "${1:-}" in
  files) [ $# -eq 1 ] || usage_of "$0"; files ;;
  *) usage_of "$0" ;;
esac
