# Whether a PR is low or high risk (ADR-016), from the facts scripts/risk.sh collects. Pure: no I/O.
# Input:  {files: [path], issues: [{number, labels, parent: null|{number, labels}}]}
# $rules: the text of scripts/high-risk-paths.txt
# Output: {risk: "low"|"high", reasons: [string]}

def rules:
  [$rules | split("\n")[] | sub("#.*$"; "") | [splits("\\s+")] | map(select(. != ""))
    | select(length == 2) | {group: .[0], pattern: .[1]}];

# A glob as a regex: `*` stays within one segment; `/x` is anchored at the root; a match covers everything below it.
def glob_regex:
  (if startswith("/") then "^" else "(^|/)" end) as $start
  | ltrimstr("/") | gsub("(?<c>[.+?^${}()|\\[\\]\\\\])"; "\\\(.c)") | gsub("\\*"; "[^/]*")
  | "\($start)\(.)(/|$)";

def owner_merge: (.labels | index("owner-merge")) != null;

rules as $patterns
| [.files[] as $file
    | ($patterns | map(select(.pattern | glob_regex as $re | $file | test($re; "i"))) | first) as $rule
    | select($rule != null)
    | "\($file): \($rule.group) (\($rule.pattern))"]
  + [.issues[] | .number as $n
      | (select(owner_merge) | "#\($n) is labelled owner-merge"),
        (.parent // empty | select(owner_merge) | "spec #\(.number) of #\($n) is labelled owner-merge")]
| {risk: (if length == 0 then "low" else "high" end), reasons: .}
