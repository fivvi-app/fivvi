# How risky a PR is (ADR-016, ADR-021), from the facts scripts/risk.sh collects. Pure: no I/O.
#   low    no high-risk path and no label.
#   high   only agent-queueable reasons: a path of a group the rules file declares `@agent-queue <group>`, or the
#          owner-merge label. Agents may add it to the merge queue when the whole merge gate holds.
#   owner  at least one owner-only reason: a path of any other group, or the owner-only label. Only the owner queues it.
# Input:  {files: [path], issues: [{number, labels, parent: null|{number, labels}}]}
# $rules: the text of scripts/high-risk-paths.txt
# Output: {risk: "low"|"high"|"owner", reasons: [string]}; reasons lists every reason, owner-only ones included.

# A line that isn't exactly <group> <pattern> or `@agent-queue <group>` is an error, never a rule that is silently
# dropped.
def lines:
  [$rules | split("\n") | to_entries[] | (.key + 1) as $line
    | .value | sub("#.*$"; "") | [splits("\\s+")] | map(select(. != "")) | select(length > 0)
    | if length == 2 and .[0] == "@agent-queue" and (.[1] | startswith("@") | not) then {queue: .[1]}
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

# A glob as a regex: `*` stays within one segment; `/x` is anchored at the root; a match covers everything below it.
def glob_regex:
  (if startswith("/") then "^" else "(^|/)" end) as $start
  | ltrimstr("/") | gsub("(?<c>[.+?^${}()|\\[\\]\\\\])"; "\\\(.c)") | gsub("\\*"; "[^/]*")
  | "\($start)\(.)(/|$)";

def labelled($l): (.labels | index($l)) != null;

# A file can match rules of several groups (docs/decisions/ADR-007-authentication.md is auth and product-docs). Every
# matching group counts, once each (its first pattern), so an agent-queueable rule never hides an owner-only one.
def matching($file):
  reduce (rules[] | select(.pattern | glob_regex as $re | $file | test($re; "i"))) as $r
    ([]; if any(.[]; .group == $r.group) then . else . + [$r] end);

# A reason for a label an issue or its spec carries: owner-merge is agent-queueable, owner-only is not.
def label_reasons($subject):
  (select(labelled("owner-merge")) | {text: "\($subject) is labelled owner-merge", owner: false}),
  (select(labelled("owner-only")) | {text: "\($subject) is labelled owner-only", owner: true});

# Each reason is {text, owner}: owner is true for an owner-only reason.
queue_groups as $queue
| [.files[] as $file
    | matching($file)[] | . as $rule
    | {text: "\($file): \($rule.group) (\($rule.pattern))", owner: ($queue | index($rule.group) | not)}]
  + [.issues[] | .number as $n
      | label_reasons("#\($n)"),
        (.parent // empty | label_reasons("spec #\(.number) of #\($n)"))]
| {risk: (if length == 0 then "low" elif any(.[]; .owner) then "owner" else "high" end), reasons: map(.text)}
