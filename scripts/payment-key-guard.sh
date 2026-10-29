#!/usr/bin/env bash
# The check that the setup of a payment-provider key calls before it stores the key in production (spec #292 AC17,
# ADR-023). Payment code is agent-queueable only while payments run in the provider's test mode, so a live key must not
# reach production while scripts/high-risk-paths.txt still declares `@agent-queue billing`: remove that line first (in
# its own owner PR), then set the key.
#
#   payment-key-guard.sh < key     the key is read from stdin, never as an argument: it would show in the process list
#
# Mollie API keys start with `live_` or `test_`. A test key passes. A live key passes only when the `@agent-queue
# billing` line is gone (read as scripts/risk.jq reads it). Anything else is refused. The key is never printed.
# FIVVI_HIGH_RISK_PATHS names another list (for the tests).
#
# This is a backstop. Gyms connect their own Mollie account by OAuth (ADR-020), so production may never hold a `live_`
# key of ours; the real control is the pilot-setup checklist (ROADMAP.md §7): remove the line before payments go live.
#
# No setup of a payment secret exists yet (the pilot's Mollie account is connected at pilot setup, ROADMAP.md §7): the
# setup that comes with M11 must pipe the key through this script before it stores it.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

[ $# -eq 0 ] || usage_of "$0"

LIST="${FIVVI_HIGH_RISK_PATHS:-$ROOT/scripts/high-risk-paths.txt}"
KEY_RE='^(live|test)_[A-Za-z0-9]{16,}$'

KEY=""
IFS= read -r KEY || true
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"

[[ "$KEY" =~ $KEY_RE ]] || die "not a Mollie API key (it starts with live_ or test_): refused"

if [[ "$KEY" == test_* ]]; then
  echo "test-mode key: fine"
  exit 0
fi

[ -r "$LIST" ] || die "cannot read $LIST, so I cannot tell whether payments may go live: refused"
# The list is read by the parser risk.jq uses (scripts/high-risk-rules.jq), so a comment or spacing on the line, or a
# list that parser rejects, cannot make the guard and the risk rules disagree. A list that does not parse is refused.
need_cmd jq
LINE="$(jq -n -r -L "$ROOT/scripts" --rawfile rules "$LIST" 'include "high-risk-rules";
  queue_groups as $queue
  | if ($queue | index("billing")) then [lines[] | select(.queue == "billing") | .line] | first else empty end')" \
  || die "cannot parse $LIST, so I cannot tell whether payments may go live: refused"
if [ -n "$LINE" ]; then
  die "this is a live payment-provider key, and payment code is still agent-queueable. First remove the line \`@agent-queue billing\` (line $LINE of scripts/high-risk-paths.txt) in a PR of its own, then set the key"
fi
echo "live key: allowed, the billing line is gone"
