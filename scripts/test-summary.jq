# The test counts of a check run, read from the logs turbo prints. Pure: no I/O.
# Input: the lines of the logs (jq --raw-input --slurp), the --run and --skip kinds as $run and $skip.
# Output: {suites: [{name, kind, status, passed, failed, skipped}], total: {passed, failed, skipped}}
#
# turbo puts "<package>:<task>: " before every line of a task, so the log of the whole run tells the suites apart:
#   //:test:root                  the root tests (node:test)              kind unit, named "root"
#   <package>:test                a package's unit tests (vitest)         kind unit, named after the package
#   <package>:test:integration    its integration tests (vitest)          kind integration, "<package> integration"
#   <package>:test:e2e            its e2e tests (Playwright)              kind e2e, "<package> e2e"
# status is pass, fail, skipped (the kind was left out of this run) or no-results (the kind ran but printed no counts,
# e.g. Docker was not running). A suite that failed before it printed counts has status fail and null counts.

def kind_of: if . == "test:integration" then "integration" elif . == "test:e2e" then "e2e" else "unit" end;

# One line of a task's output: its counts so far. Each runner prints its counts on a few lines near the end.
def count($task; $text):
  if $task == "test:root" then
    # node:test: "ℹ pass 6", "ℹ fail 1", "ℹ cancelled 2", "ℹ skipped 0", "ℹ todo 1". Cancelled tests failed and todo
    # tests did not run, so they are summed with fail and skipped in entry.
    ($text | capture("^ℹ (?<what>pass|fail|cancelled|skipped|todo) (?<n>[0-9]+)$")) as $m
    | {(if $m.what == "pass" then "passed" else $m.what end): ($m.n | tonumber)}
  elif $task == "test:e2e" then
    # Playwright: "  12 passed (3.2s)", "  1 skipped", "  2 failed", "  1 flaky". A flaky test passed on a retry; it is
    # summed with passed in entry.
    ($text | capture("^\\s+(?<n>[0-9]+) (?<what>passed|flaky|failed|interrupted|skipped|did not run)\\b")) as $m
    | ($m.n | tonumber) as $n
    | if $m.what == "passed" then {passed: $n}
      elif $m.what == "flaky" then {flaky: $n}
      elif $m.what == "skipped" or $m.what == "did not run" then {skipped: $n}
      else {failed: $n}
      end
  else
    # vitest: "      Tests  1 failed | 34 passed | 1 skipped (36)"
    ($text | capture("^\\s*Tests\\s+(?<body>.*)\\([0-9]+\\)\\s*$")) as $m
    | [$m.body | scan("([0-9]+) (failed|passed|skipped|todo)") | {what: .[1], n: (.[0] | tonumber)}]
    | {passed: ([.[] | select(.what == "passed") | .n] | add // 0),
       failed: ([.[] | select(.what == "failed") | .n] | add // 0),
       skipped: ([.[] | select(.what == "skipped" or .what == "todo") | .n] | add // 0)}
  end;

def pkg_name: sub("^@[^/]+/"; "") | if . == "//" then "root" else . end;

def empty_counts: {passed: null, failed: null, skipped: null};

def entry($s):
  ($s.task | kind_of) as $kind
  | ($s.pkg | pkg_name) as $name
  | (($s.fail // 0) + ($s.cancelled // 0) + ($s.failed // 0)) as $failed
  | {name: (if $kind == "unit" then $name else "\($name) \($kind)" end), kind: $kind,
     status: (if $s.error or $failed > 0 then "fail" elif $s.seen then "pass" else "no-results" end)}
    + (if $s.seen then {passed: (($s.passed // 0) + ($s.flaky // 0)), failed: $failed, skipped: (($s.skipped // 0) + ($s.todo // 0))}
       else empty_counts end);

def first_match(f): [f] | first;

[split("\n")[] | gsub("\u001b\\[[0-9;]*[A-Za-z]"; "") | sub("\r$"; "")] as $lines
| (reduce $lines[] as $line ({};
    first_match($line | capture("^(?<pkg>\\S+?)#(?<task>test(:root|:integration|:e2e)?):\\s+ERROR\\s")) as $e
    | if $e then .["\($e.pkg)|\($e.task)"] += {pkg: $e.pkg, task: $e.task, error: true}
      else
        first_match($line | capture("^(?<pkg>\\S+?):(?<task>test(:root|:integration|:e2e)?): ?(?<text>.*)$")) as $t
        | if $t then
            (first_match(count($t.task; $t.text)) // {}) as $c
            | .["\($t.pkg)|\($t.task)"] |= ((. // {}) + {pkg: $t.pkg, task: $t.task} + (if $c == {} then {} else {seen: true} + $c end))
          else . end
      end))
  as $tasks
| [$tasks | to_entries[] | entry(.value)] as $found
| ($found | map(.kind)) as $kinds
| ($found
   + [$run[] | select(. as $k | ($kinds | any(. == $k)) | not) | {name: ., kind: ., status: "no-results"} + empty_counts]
   + [$skip[] | {name: ., kind: ., status: "skipped"} + empty_counts])
| sort_by([({unit: 0, integration: 1, e2e: 2}[.kind]), (.name != "root"), .name]) as $suites
| {suites: $suites,
   total: {passed: ([$suites[].passed // 0] | add // 0),
           failed: ([$suites[].failed // 0] | add // 0),
           skipped: ([$suites[].skipped // 0] | add // 0)}}
