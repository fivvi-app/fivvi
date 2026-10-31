# The records scripts/pr.sh writes in a PR body, one line each: `**<mark>:** …` (self-review, smoke check, merge gate
# refusal, high-risk agent merge). One reader for scripts/merge-gate.jq, scripts/flow.sh and scripts/pr.sh. Pure.
# Load with `include "records";` and `jq -L scripts`; a file in scripts/ includes it with `{search: "./"}`.

# The last line of a PR body (the input, a string or null) that records <mark> (bare, without the `**` and `:`), or
# null.
def record($mark):
  [(. // "") | split("\n")[] | rtrimstr("\r") | select(startswith("**\($mark):**"))] | last // null;

# The commit a record line names in backticks, as a regex pattern with the named group sha.
def sha_pattern: "`(?<sha>[0-9a-f]{40})`";

# Capture group $name of $re in a record line (the input, a string or null), or null.
def captured($re; $name): if . == null then null else (capture($re)[$name] // null) end;

# The full commit SHA a record line names in backticks, or null.
def record_sha: captured(sha_pattern; "sha");

# The reasons a record line gives after its commit, `<sha>`: <reasons>, or null.
def record_reasons: captured("\(sha_pattern): (?<reasons>.*)$"; "reasons");

# Whether the PR body (the input, a string or null) records that commit $sha was re-queued after a fix (scripts/pr.sh
# merge --after, ADR-025): a line `**<mark>:** re-queued `<sha>` …`. Once per commit: this is what stops a second one.
def requeued_after_fix($mark; $sha):
  $sha != null and ([(. // "") | split("\n")[] | rtrimstr("\r")
    | select(startswith("**\($mark):** re-queued `\($sha)`"))] | length > 0);

# GitHub's time (2026-10-31T10:00:00Z, with optional fractional seconds, or an offset such as +02:00) as UTC seconds, or
# null for anything else: an unreadable time never passes. The one definition of scripts/merge-gate.jq,
# scripts/flow-phase.jq and scripts/pr.sh, which compare times as instants, not as text.
def instant:
  if type != "string" then null
  else
    ([capture("^(?<t>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})(?:\\.[0-9]+)?(?<z>Z|[+-][0-9]{2}:[0-9]{2})$")] | .[0]) as $m
    | if $m == null then null
      else try ($m.t + "Z" | fromdateiso8601
                - (if $m.z == "Z" then 0
                   else (if $m.z[0:1] == "-" then -1 else 1 end) * (($m.z[1:3] | tonumber) * 3600 + ($m.z[4:6] | tonumber) * 60) end))
           catch null
      end
  end;
