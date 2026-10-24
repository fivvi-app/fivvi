# The records scripts/pr.sh writes in a PR body, one line each: `**<mark>:** …` (self-review, smoke check, merge gate
# refusal, high-risk agent merge). One reader for scripts/merge-gate.jq, scripts/flow.sh and scripts/pr.sh. Pure.
# Load with `include "records";` and `jq -L scripts`; a file in scripts/ includes it with `{search: "./"}`.

# The last line of a PR body (the input, a string or null) that records <mark> (bare, without the `**` and `:`), or
# null.
def record($mark):
  [(. // "") | split("\n")[] | rtrimstr("\r") | select(startswith("**\($mark):**"))] | last // null;

# The full commit SHA a record line names in backticks, or null.
def record_sha: if . == null then null else (capture("`(?<sha>[0-9a-f]{40})`").sha // null) end;

# The reasons a record line gives after its commit, `<sha>`: <reasons>, or null.
def record_reasons: if . == null then null else (capture("`[0-9a-f]{40}`: (?<reasons>.*)$").reasons // null) end;
