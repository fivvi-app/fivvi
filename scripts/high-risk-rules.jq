# Reads the rules file scripts/high-risk-paths.txt (the text in $rules): its lines, path rules, `@agent-queue` groups and
# `@except` carve-outs. One parser for everything that must agree on what the file says: the risk of a PR
# (scripts/risk.jq) and the payment key guard (scripts/payment-key-guard.sh). Pure: no I/O.

# A line that isn't exactly <group> <pattern>, `@agent-queue <group>` or `@except <group> <pattern>` is an error, never
# a rule that is silently dropped.
def lines:
  [$rules | split("\n") | to_entries[] | (.key + 1) as $line
    | .value | sub("#.*$"; "") | [splits("\\s+")] | map(select(. != "")) | select(length > 0)
    | if length == 2 and .[0] == "@agent-queue" and (.[1] | startswith("@") | not) then {queue: .[1], line: $line}
      elif length == 3 and .[0] == "@except" and (.[1] | startswith("@") | not) then {except: .[1], pattern: .[2]}
      elif length == 2 and (.[0] | startswith("@") | not) then {group: .[0], pattern: .[1]}
      else error("malformed rule on line \($line) of scripts/high-risk-paths.txt: \(join(" "))") end];

def rules: [lines[] | select(.group != null)];

# The groups agents may queue (ADR-021). A declared group without a path rule is an error: the file would claim a group
# that matches nothing, so it fails closed. Any group not declared here is owner-only.
def queue_groups:
  rules as $rules
  | [lines[] | select(.queue != null) | .queue]
  | map(. as $g | if any($rules[]; .group == $g) then $g
      else error("agent-queue group '\($g)' has no path rule in scripts/high-risk-paths.txt") end);

# The carve-outs: a file matching `@except <group> <pattern>` is skipped by every rule of that group, so a path below a
# broad owner-only rule (/scripts) can belong to another group (tooling) while a new path stays under the broad rule. A
# carve-out of a group without a path rule is an error, like a queue line.
def excepts:
  rules as $rules
  | [lines[] | select(.except != null)]
  | map(. as $e | if any($rules[]; .group == $e.except) then {group: .except, pattern: .pattern}
      else error("@except group '\($e.except)' has no path rule in scripts/high-risk-paths.txt") end);
