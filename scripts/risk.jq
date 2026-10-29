# How risky a PR is (ADR-016, ADR-021), from the facts scripts/risk.sh collects. Pure: no I/O.
#   low    no high-risk path and no label.
#   high   only agent-queueable reasons: a path of a group the rules file declares `@agent-queue <group>`, or the
#          owner-merge label. Agents may add it to the merge queue when the whole merge gate holds.
#   owner  at least one owner-only reason: a path of any other group, or the owner-only label. Only the owner queues it.
# Input:  {files: [path], issues: [{number, labels, parent: null|{number, labels}}], patches: {path: patch|null}}
# patches: the patch (the PR files API's `patch`) of each modified file under docs/product/. Optional; a file with no
#          patch here is read as one whose patch is missing. A ROADMAP.md or FEATURES.md whose patch only moves status
#          forward (scripts/status-only.jq) has no product-docs reason; every other file decides as the rules say.
# $rules: the text of scripts/high-risk-paths.txt
# Output: {risk: "low"|"high"|"owner", reasons: [string]}; reasons lists every reason, owner-only ones included.
#         With `--argjson detail true` it also has owner_reasons: just the owner-only ones (scripts/risk.sh --detail).

include "status-only" {search: "./"};
include "high-risk-rules" {search: "./"};

# A glob as a regex: `*` stays within one segment; `/x` is anchored at the root; a match covers everything below it.
def glob_regex:
  (if startswith("/") then "^" else "(^|/)" end) as $start
  | ltrimstr("/") | gsub("(?<c>[.+?^${}()|\\[\\]\\\\])"; "\\\(.c)") | gsub("\\*"; "[^/]*")
  | "\($start)\(.)(/|$)";

# Labels are compared without regard to case, and a labels field that isn't a list is an error: a label that could be
# missed would lower the risk.
def labelled($l):
  (.labels | if type == "array" then map(ascii_downcase) else error("labels is not a list: \(tojson)") end)
  | index($l) != null;

def excepted($file; $group):
  any(excepts[]; .group == $group and (.pattern | glob_regex as $re | $file | test($re; "i")));

# A file whose patch only moves status forward (ROADMAP.md, FEATURES.md) has no product-docs reason.
def status_only_docs($file; $group; $patches):
  $group == "product-docs" and status_only($file; $patches[$file]);

# A file can match rules of several groups (docs/decisions/ADR-007-authentication.md is auth and product-docs). Every
# matching group counts, once each (its first pattern), so an agent-queueable rule never hides an owner-only one.
def matching($file; $patches):
  reduce (rules[] | select(.pattern | glob_regex as $re | $file | test($re; "i"))
                  | select(excepted($file; .group) | not)
                  | select(status_only_docs($file; .group; $patches) | not)) as $r
    ([]; if any(.[]; .group == $r.group) then . else . + [$r] end);

# A reason for a label an issue or its spec carries: owner-merge is agent-queueable, owner-only is not.
def label_reasons($subject):
  (select(labelled("owner-merge")) | {text: "\($subject) is labelled owner-merge", owner: false}),
  (select(labelled("owner-only")) | {text: "\($subject) is labelled owner-only", owner: true});

# Each reason is {text, owner}: owner is true for an owner-only reason.
queue_groups as $queue
| excepts as $excepts # not used below: reading it validates every @except line up front, even when no file matches one
| (.patches // {}) as $patches
| [.files[] as $file
    | matching($file; $patches)[] | . as $rule
    | {text: "\($file): \($rule.group) (\($rule.pattern))", owner: ($queue | index($rule.group) | not)}]
  + [.issues[] | .number as $n
      | label_reasons("#\($n)"),
        (.parent // empty | label_reasons("spec #\(.number) of #\($n)"))]
| {risk: (if length == 0 then "low" elif any(.[]; .owner) then "owner" else "high" end), reasons: map(.text)}
  + (if $ARGS.named.detail == true then {owner_reasons: [.[] | select(.owner) | .text]} else {} end)
