# Tools on the owner's machine

Agents run on the owner's Mac, where `railway`, `gh`, `xcrun devicectl` and `adb` are already logged in or installed. Use them; don't ask the owner to click through a dashboard or to copy logs out. Environments and rollback: [ENVIRONMENTS.md](../engineering/ENVIRONMENTS.md). No real data in AI context: [role-mapping.md](../legal/role-mapping.md) D8.

## Rules

| Allowed | Not allowed |
|---|---|
| Read status and build logs of `production`; any logs of `development` and PR previews | Reading or printing variable values: no `railway variables`, `railway variable list`, `--show-values` or `--decrypt-variables`. Never read or set production values. Also no `railway run` or `railway shell` (they inject every variable value into a process), `railway connect` (a `psql` session on any environment, production included) or `railway ssh` (a shell in a running service): they expose secrets or production data |
| Redeploy **PR previews** (`fivvi-pr-<n>`) | Redeploying, rolling back or changing `production` or `development` |
| `railway config plan` on `development` or `production` (read-only, values redacted) | `railway config apply`, except when the owner asks for it: `development` first, never a PR environment (the order of environments and the owner's steps are in [ENVIRONMENTS.md §3](../engineering/ENVIRONMENTS.md); link as in the plan row under **Railway**, not as in §3) |
| Devices and emulators that hold synthetic data only | Screenshots, or a screen dump, of anything that could show real data. Prefer text (`uiautomator`) over screenshots |
| `gh` for Actions logs and artifacts; `scripts/issue.sh` and `scripts/pr.sh` for issues and PRs ([issue-tracker.md](issue-tracker.md)) | Runtime, HTTP and network logs of `production` (`railway logs --http`, `--network`, `--dns`, or `-d` on production): they can hold real data (D8), so they go through the owner |

Pass `-p`, `-e` and `-s` on every command that takes them; `environment list` takes no `-p`. `config plan|apply` take none of them: they act on the linked environment, so link your own worktree first (the plan row below).

- The CLI finds a link by walking up from the current directory, and so does `railway unlink`. Worktrees sit under the owner's checkout, which the owner may have linked (ENVIRONMENTS.md §3). So link only your worktree's root, run `plan` only if the link succeeded, and unlink only when your worktree has its own entry, whatever `plan` exited with. Unlink before `wt.sh remove`. Never `railway link` anywhere else.
- `RAILWAY_PROJECT_ID` and `RAILWAY_ENVIRONMENT_ID` don't replace the link: `.railway/railway.ts` then gets no environment name and refuses, as it refuses anything but `development` and `production`.

## Railway

`railway` CLI, logged in as the owner. Project `5ac2d844-191a-4671-9632-50b66817f648`; environments `production`, `development` and `fivvi-pr-<n>`; services `web`, `cron`, `postgres`. Set `P=5ac2d844-191a-4671-9632-50b66817f648`.

| Job | Command |
|---|---|
| Deployments of a service, newest first, with ids and status | `railway deployment list -p $P -e fivvi-pr-<n> -s web --json` |
| Build log of a deployment | `railway logs -p $P -e fivvi-pr-<n> -s web -b -n 200 <deployment-id>` |
| Deploy (runtime) log (not on `production`) | `railway logs -p $P -e fivvi-pr-<n> -s web -d -n 200 <deployment-id>` |
| Only errors | add `-f '@level:error'` |
| Redeploy a **PR preview** from the PR branch (`scripts/pr.sh` runs the same command in `railway_preview`; **not yet run** against real Railway: no PR was open, only `--help` was checked) | `railway deployment redeploy -p $P -e fivvi-pr-<n> -s web --from-source -y` |
| Preview what `.railway/railway.ts` would change, from your worktree (checked against `development` with CLI 5.62.1 on 20 October 2026) | `railway link -p $P -e development && railway config plan --detailed-exit-code` (exit 0 = up to date, 2 = changes pending), then, whatever its exit code, `jq -e --arg d "$PWD" '.projects[$d]' ~/.railway/config.json > /dev/null && railway unlink -y` |

- Without a deployment id, `railway logs` takes the latest successful deployment. Always pass `-n`: without it the command streams until stopped.
- A PR preview exists only while its PR is open, so list deployments right after CI is green. A docs-only PR has none ([ENVIRONMENTS.md §4](../engineering/ENVIRONMENTS.md)).
- `web` sleeps when idle: status `SLEEPING` is normal, not a failure. A `SKIPPED` deployment is Railway skipping a commit: `scripts/pr.sh` reads a head commit whose deployments are all `SKIPPED` as skipped after a failed first CI run, which a later green run never deploys. A watch-path skip (nothing under the watched paths changed) is different: it deploys nothing, and Railway posts the `fivvi - web` status "No deployment needed" ([ENVIRONMENTS.md §4](../engineering/ENVIRONMENTS.md)).
- `scripts/pr.sh ship` (its `smoke` step) redeploys a preview that has no deployment of the head commit (none, or only `SKIPPED` ones), in `fivvi-pr-<n>` only; that is the normal way. The raw `railway deployment redeploy` is the fallback for what smoke doesn't redeploy: a build that failed for a reason outside the PR, and a changed build-time variable.

## GitHub

`repos/{owner}/{repo}` is filled in by `gh` from the checkout's remote, so nothing here names the owner.

**Who `gh` and `git` are.** In Claude Code, `gh` and `git` run as the GitHub App `fivvi-claude[bot]`, not as the owner: its activity (commits, PRs, comments) is distinct from the owner's. The App has no admin rights, so it reads and writes what the scripts need (issues, PRs, checks, rulesets) but cannot change repo settings. Codex, Copilot and the owner's own terminal are not touched: they keep the owner's `gh` login. Because Codex and Copilot share that login, the AI disclaimer logic in `flow.sh` stays.

- **Wiring** is per checkout, in the git-ignored `.claude/settings.local.json` of the main checkout. The owner runs it once, from the main checkout: `node scripts/agent-identity.mjs setup --assignee <your GitHub login>`, and starts a new Claude Code session. It adds a `SessionStart` hook that exports a fresh `GH_TOKEN` before each Bash command, and an `env` block: `FIVVI_ASSIGNEE`, `GH_TOKEN` set to an invalid value (the hook's export overrides it), `GIT_TERMINAL_PROMPT=0` and empty `GIT_ASKPASS` and `SSH_ASKPASS` (see **Fails closed**), the bot as git author and committer (`GIT_CONFIG_*`, which a `-c user.email=…` still beats), and the script as git's only credential helper for `github.com` (the empty `credential.https://github.com.helper` resets the owner's stored login). `setup` keeps every other key and is idempotent; it refuses a file that already sets one of those env keys, and `--settings <path>` without a path is an error. Without `--settings` it runs only from a folder of this checkout. **Undo:** `node scripts/agent-identity.mjs setup --remove`, which removes exactly what `setup` added, and nothing from a file it never wired.
- **`FIVVI_ASSIGNEE`** stands in for "who you are" in `flow.sh` (`me()`, `next`), `issue.sh claim` and `usage.mjs`: a bot cannot be assigned issues and `gh api user` is refused for an App token, so issues are assigned to the owner's login. Unset, the scripts behave as before.
- **Fails closed.** When no token can be minted, `GH_TOKEN` is set to the invalid value `fivvi-claude-token-unavailable`, so `gh` gets a 401. An empty `GH_TOKEN` would make `gh` fall back to the owner's admin login in its keyring. `git` has no other credential source for `github.com` either: the helper is the only one, `GIT_TERMINAL_PROMPT=0` rules out a terminal prompt, and the empty `GIT_ASKPASS` and `SSH_ASKPASS` rule out an askpass program (also one set by `core.askPass`), so it fails instead of using the owner's stored login or asking anywhere. Fix the cause: `node scripts/agent-identity.mjs token >/dev/null` prints a one-line reason on stderr, and never a key or token (without `>/dev/null` it prints the token itself).
- **The key and the config** stay outside the repo: `~/.config/fivvi-claude/app.json` (`app_id`, `slug`, `owner`, `keychain_service`, `installation_id`; plus `token.json`, a cache, mode 0600) and the private key in the login Keychain (account `fivvi-claude`, service `keychain_service`, value: the PEM in base64). Tokens last an hour, are cached and reused while more than 10 minutes remain, and are narrowed to this repository.
- **Stays with the owner:** changing repo settings and rulesets (`scripts/github-settings.sh`, the repo's Settings pages), the App's own settings and permissions, and rotating the key: generate a new key on the App's page, replace the Keychain item, delete the old key there and delete `token.json`.

| Job | Command |
|---|---|
| Log of one CI job | `gh api --allow-escape-sequences repos/{owner}/{repo}/actions/jobs/<job-id>/logs` |
| Job ids of a run | `gh run view <run-id> --json jobs --jq '.jobs[] \| "\(.databaseId) \(.name)"'` |
| Artifacts of a run | `gh api repos/{owner}/{repo}/actions/runs/<run-id>/artifacts --jq '.artifacts[].name'` |
| Download an artifact | `gh run download <run-id> -n <name> -D <dir>` (a temp dir outside the repo) |

## iPhone

`scripts/ios-device.sh [nl|en]` builds the Debug app, installs it on the paired iPhone and launches it, in the given language. It signs with `DEVELOPMENT_TEAM` and calls the API in `FIVVI_API_BASE_URL`, both from `apps/ios/Config/Local.xcconfig` ([iOS README](../../apps/ios/README.md)). That file is git-ignored, so a worktree has none: link the main checkout's (`ln -s <main checkout>/apps/ios/Config/Local.xcconfig apps/ios/Config/Local.xcconfig`) and remove the link when done.

| Job | Command |
|---|---|
| List devices | `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun devicectl list devices --timeout 30` |
| Build, install, launch (**not yet run** to the end: it stopped at "no paired iPhone") | `scripts/ios-device.sh en` |

- `scripts/_ios.sh` sets `DEVELOPER_DIR` for the scripts; set it yourself for a direct `xcrun devicectl`, because `xcode-select` may point at the Command Line Tools. Always pass `--timeout`: without it `devicectl` can hang.
- Point the app at a PR preview or the dev server, never at production, and use synthetic data only.
- The script stops with `no paired iPhone` when the phone is asleep, off the network or unplugged, and with `the iPhone is locked` when locked: that needs the owner.

## Android

Run every Android tool after `android_env`, which puts the JDK, `adb` and the emulator on `PATH` and gives Java the keychain's CAs:

```bash
bash -c 'source scripts/_lib.sh && source scripts/_android.sh && android_env && <command>'
```

| Job | `<command>` |
|---|---|
| Connected devices | `adb devices` |
| Install the Debug app | `gradle installDebug -Pfivvi.apiBaseUrl=https://<preview-domain>/api/` |
| Launch | `adb shell am start -n app.fivvi.pro/.MainActivity` |
| Per-app language | `adb shell cmd locale set-app-locales app.fivvi.pro --locales nl-NL` (`en` for English), then launch again |
| Stop the app | `adb shell am force-stop app.fivvi.pro` |

With no device connected, boot the emulator headless with `scripts/android.sh emulator` (no wrapper needed) and end it with `scripts/android.sh stop`. Use `gradle` (a function in `_android.sh`) rather than `./gradlew`: it keeps the daemons of this worktree apart. End with `gradle --stop` unless the next run follows soon.

## Reading the screen as text

On the iPhone you can't; on Android and the emulator, dump the UI tree instead of taking a screenshot:

```bash
adb shell uiautomator dump /sdcard/x.xml
adb shell cat /sdcard/x.xml | grep -o 'text="[^"]*"' | grep -v 'text=""'
adb shell rm /sdcard/x.xml
```

Wait a few seconds after `am start` before dumping. Delete the file even when the grep fails. Dump only a device that holds synthetic data.

## What needs the owner

| Needs the owner | Why |
|---|---|
| Logins and re-login (`railway login`, `gh auth`, Apple, Google, Sentry, PostHog, UptimeRobot, Brevo) | Accounts are the owner's |
| Billing, plans, the spending alert | Money |
| Account and dashboard settings: PR environments, base environment, domains, monitors, alerts | Not in `.railway/railway.ts` ([ENVIRONMENTS.md §3](../engineering/ENVIRONMENTS.md)) |
| Variable values of `production` and `development`, and the check of the Postgres password in [ENVIRONMENTS.md §7](../engineering/ENVIRONMENTS.md) | Secrets. Agents never read them |
| Unlocking, waking, plugging in or trusting a physical phone; Developer Mode | Physical |
| `railway config apply`, unless the owner has asked an agent to run it | Changes the shared environments |

Stop and say what you need; don't work around it.
