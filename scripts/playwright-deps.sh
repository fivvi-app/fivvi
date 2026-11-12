#!/usr/bin/env bash
# The OS packages Chromium needs for the web e2e tests (E2E (Linux) in ci.yml), installed with apt through Playwright.
# apt reaches the Ubuntu mirror over the runner's network, which now and then cannot resolve it ("Temporary failure
# resolving 'azure.archive.ubuntu.com'", #1311) and failed the job before any test ran. The same install is tried again
# after a pause; only a failure that stays fails the job.
#
#   playwright-deps.sh
#       PLAYWRIGHT_DEPS_ATTEMPTS  tries in total (default 4, a positive whole number)
#       PLAYWRIGHT_DEPS_DELAY     seconds to wait before the next try, times the number of tries so far (default 15)
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

[ $# -eq 0 ] || usage_of "$0"
attempts="${PLAYWRIGHT_DEPS_ATTEMPTS:-4}"
delay="${PLAYWRIGHT_DEPS_DELAY:-15}"
[[ "$attempts" =~ ^[1-9][0-9]*$ ]] || die "PLAYWRIGHT_DEPS_ATTEMPTS must be a positive whole number, not '$attempts'"
[[ "$delay" =~ ^[0-9]+$ ]] || die "PLAYWRIGHT_DEPS_DELAY must be a whole number of seconds, not '$delay'"

status=0
for ((try = 1; try <= attempts; try++)); do
  pnpm --filter @fivvi/web exec playwright install-deps chromium && exit 0
  status=$?
  if [ "$try" -lt "$attempts" ]; then
    echo "playwright-deps: attempt $try of $attempts failed (status $status); trying again in $((delay * try)) s." >&2
    sleep "$((delay * try))"
  fi
done
echo "playwright-deps: still failing after $attempts attempts (status $status)." >&2
exit "$status"
