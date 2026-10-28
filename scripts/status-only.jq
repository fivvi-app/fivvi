# Whether a change to docs/product/ROADMAP.md or docs/product/FEATURES.md only moves status forward (spec #292, "Status-only
# rule (risk)"). scripts/risk.jq drops the product-docs reason of such a file; every other change to them stays owner-only.
# Pure: no I/O. Load with `include "status-only";` and `jq -L scripts`; a file in scripts/ includes it with
# `{search: "./"}`.
#
# The input of each decision is the file's patch, the `patch` field of the PR files API: hunks of ' ' context, '-'
# removed and '+' added lines. A missing patch, or one that is not whole, is never status-only (fail closed): the files
# API leaves the patch out of a large diff, so every hunk must hold exactly the number of lines its header counts. A
# patch that changes nothing is not status-only either.
#
#   roadmap_status_only($patch)   every removed line has an added line that is the same checklist item with `[ ]`
#                                 turned into `[x]` (and at most a trailing ` (#262)` or ` (#262, #282)` appended), and
#                                 no other line changes.
#   features_status_only($patch)  every changed line is a row of an existing ID in a feature table (9 cells) or an
#                                 enabler table (5 cells); the ID is unchanged except for gaining a link to its spec
#                                 issue; Status moves forward along the lifecycle; NL and EN only go from ⬜ to ✅;
#                                 the Feature (Enabler) and Notes cells change only in a row that becomes IMPLEMENTED;
#                                 Priority, Milestone, Depends on and Spec never change; no row is added or removed;
#                                 nothing outside those rows changes.
#   status_only($path; $patch)    the rule of the file at $path (docs/product/ROADMAP.md or FEATURES.md); false for any
#                                 other path.

def lifecycle: ["IDEA", "PLANNED", "DESIGNED", "IN PROGRESS", "IN REVIEW", "IMPLEMENTED", "RELEASED"];

# The hunk header `@@ -a[,b] +c[,d] @@`: the line counts b and d are 1 when left out. null for any other line.
def header:
  [capture("^@@ -[0-9]+(,(?<b>[0-9]+))? \\+[0-9]+(,(?<d>[0-9]+))? @@")]
  | first // null
  | if . == null then null else {old: ((.b // "1") | tonumber), new: ((.d // "1") | tonumber)} end;

# The hunks of a patch, each {old, new, lines}, or null when the patch is missing, has a line outside a hunk or of an
# unknown kind, or has a hunk with fewer or more lines than its header counts. A blank line counts as context.
def hunks:
  if type != "string" or . == "" then null
  else
    (split("\n") | if last == "" then .[:-1] else . end) as $lines
    | reduce $lines[] as $l ({hunks: [], ok: true};
        if .ok | not then .
        elif $l | startswith("@@ ") then
          ($l | header) as $h
          | if $h == null then .ok = false else .hunks += [$h + {lines: []}] end
        elif (.hunks | length) == 0 then .ok = false
        elif $l | startswith("\\") then .
        elif ($l == "") or ($l[:1] | IN(" ", "-", "+")) then .hunks[-1].lines += [$l]
        else .ok = false end)
    | if .ok and (.hunks | length) > 0
         and all(.hunks[]; ([.lines[] | select(.[:1] != "+")] | length) == .old
                           and ([.lines[] | select(.[:1] != "-")] | length) == .new)
      then .hunks else null end
  end;

# The runs of changed lines of hunks (the input): [{removed: [text], added: [text]}], the lines without their +/-.
def blocks:
  [.[] | .lines
    | reduce .[] as $l ({blocks: [], cur: null};
        if $l[:1] | IN("-", "+") then
          (.cur //= {removed: [], added: []})
          | if $l[:1] == "-" then .cur.removed += [$l[1:]] else .cur.added += [$l[1:]] end
        elif .cur != null then .blocks += [.cur] | .cur = null
        else . end)
    | if .cur != null then .blocks + [.cur] else .blocks end]
  | add // [];

# The changed blocks of a patch (the input), or null when it is not whole or changes nothing.
def changes:
  hunks | if . == null then null else blocks | if length == 0 then null else . end end;

# The tick may also append a trailing issue or PR reference, as the PR that did the work names itself: ` (#262)` or
# ` (#262, #282)`. Any other appended text is a change of the item.
def tick($old; $new):
  ($old | [capture("^(?<pre>\\s*[-*] )\\[ \\](?<rest>.*)$")] | first) as $m
  | $m != null
    and ("\($m.pre)[x]\($m.rest)" as $ticked
         | ($new | startswith($ticked))
           and ($new[$ticked | length:] | test("^( \\(#[0-9]+(, #[0-9]+)*\\))?$")));

def roadmap_status_only($patch):
  ($patch | changes) as $blocks
  | $blocks != null
    and all($blocks[]; (.removed | length) == (.added | length)
                       and ([range(0; .removed | length) as $i | tick(.removed[$i]; .added[$i])] | all));

# The cells of a registry table row, or null for any other line.
def cells:
  if startswith("| ") and endswith(" |") then .[2:-2] | split(" | ") else null end;

# The ID of a cell: plain (F002) or linked to a spec issue ([F002](https://github.com/<owner>/<repo>/issues/<n>)).
def cell_id:
  [capture("^(\\[(?<id>[FE][0-9]{3})\\]\\(https://github\\.com/[^/ )]+/[^/ )]+/issues/[0-9]+\\)|(?<plain>[FE][0-9]{3}))$")]
  | first | if . == null then null else .id // .plain end;

def id_ok($o; $n):
  ($o | cell_id) as $oid
  | ($n | cell_id) as $nid
  | $oid != null and $oid == $nid
    and ($o == $n or ($o == $oid and $n != $oid));

def tick_ok($o; $n): $o == $n or ($o == "⬜" and $n == "✅");

# A changed row (old and new, each a string) of a feature table or an enabler table.
def row_ok($old; $new):
  ($old | cells) as $o
  | ($new | cells) as $n
  | if $o == null or $n == null or ($o | length) != ($n | length) or ($o | length | IN(9, 5) | not) then false
    else
      (lifecycle | index($o[2])) as $from
      | (lifecycle | index($n[2])) as $to
      | ($n[2] == "IMPLEMENTED" and $o[2] != "IMPLEMENTED") as $final
      | id_ok($o[0]; $n[0])
        and (($o[0] | cell_id) | startswith(if ($o | length) == 9 then "F" else "E" end))
        and $from != null and $to != null and $to >= $from
        and ($final or $o[1] == $n[1])
        and (if ($o | length) == 9
             then $o[3] == $n[3] and $o[4] == $n[4] and $o[5] == $n[5] and tick_ok($o[6]; $n[6])
                  and tick_ok($o[7]; $n[7]) and $o[8] == $n[8]
             else $o[3] == $n[3] and ($final or $o[4] == $n[4]) end)
    end;

def features_status_only($patch):
  ($patch | changes) as $blocks
  | $blocks != null
    and all($blocks[]; (.removed | length) == (.added | length)
                       and ([range(0; .removed | length) as $i | row_ok(.removed[$i]; .added[$i])] | all));

def status_only($path; $patch):
  if $path == "docs/product/ROADMAP.md" then roadmap_status_only($patch)
  elif $path == "docs/product/FEATURES.md" then features_status_only($patch)
  else false end;
