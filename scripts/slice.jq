# The platform slice of a spec (ADR-033 item 2): which platform a ticket is for, and which tickets of one platform
# build together in one PR. Pure. Load with `include "slice";` and `jq -L scripts`.

# The platform of a ticket (input: {title, labels: [name]}): backend, web, ios, android, or null when it names none or
# two. A single platform label (backend, web, ios or android) decides; otherwise the title, the way tickets are named
# today: "Fivvi Pro iOS: …", "Fivvi Android: …", "Android: …" (iOS and Android); "Web: …", "Client web: …", "Public web: …" and
# "Foundation: … on the client web" (web); "… (API, domain)", "… through the API", "Owner invoices API: …",
# "(DB, domain)", "(domain, cron)" (backend). iOS and Android win over web and backend: "Fivvi iOS: … (API)" is iOS.
def platform:
  ["backend", "web", "ios", "android"] as $names
  | ([.labels[]? | select(. as $l | $names | index($l))]) as $tagged
  | (.title | sub("^\\[[A-Za-z0-9]+\\] *"; "")) as $t
  | ($t | test("\\biOS\\b")) as $ios
  | ($t | test("\\bAndroid\\b")) as $android
  | if ($tagged | length) == 1 then $tagged[0]
    elif $ios and $android then null
    elif $ios then "ios"
    elif $android then "android"
    elif ($t | test("^web:"; "i")) or ($t | test("\\b(client|trainer|team|public) web\\b"; "i")) then "web"
    elif $t | test("\\b(API|DB|domain|cron)\\b") then "backend"
    else null
    end;

# The tickets of one platform that build together (input: [{number, title, labels, blockers: [number]}], blockers the
# open ones): up to $max, lowest number first; a ticket joins when every one of its blockers is already in the slice, so
# an unblocked ticket always may and a ticket blocked only inside the slice follows its blockers. Returns the numbers
# in the order they joined, the first of them is the one the branch is named after.
def pick($want; $max):
  [.[] | select(platform == $want)] | sort_by(.number) as $candidates
  | def step:
      . as $picked
      | if ($picked | length) >= $max then $picked
        else ([$candidates[]
               | select(.number as $n | $picked | index($n) | not)
               | select(all(.blockers[]; . as $b | $picked | index($b) != null))] | first) as $next
          | if $next == null then $picked else ($picked + [$next.number]) | step end
        end;
    [] | step;
