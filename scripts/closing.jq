# How an issue is closed (#509). One reader for scripts/flow-phase.jq (the phase of an issue) and scripts/pr.sh (the
# keyword a PR body gets). Pure. Load with `include "closing";` and `jq -L scripts`; a file in scripts/ includes it
# with `{search: "./"}`.

# Whether an issue closes through its tickets (the input: {labels: [name], children: [..]}) rather than through a PR:
# it is labelled spec or has sub-issues, and is not a spec built as its own ticket (no sub-issues, ready-for-agent).
def closes_through_tickets:
  (.labels | index("spec") != null) as $spec
  | (.labels | index("ready-for-agent") != null) as $ready
  | (.children | length) as $kids
  | ($spec or $kids > 0) and ($kids > 0 or ($ready | not));
