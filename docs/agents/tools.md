# Tools on the owner's machine

Agents run on the owner's Mac, where `railway`, `gh`, `xcrun devicectl` and `adb` are already logged in or installed. Use them; don't ask the owner to click through a dashboard or to copy logs out. Environments and rollback: [ENVIRONMENTS.md](../engineering/ENVIRONMENTS.md). No real data in AI context: [role-mapping.md](../legal/role-mapping.md) D8.

## Rules

| Allowed | Not allowed |
|---|---|
| Read status, deploy logs and build logs in any environment | Reading or printing variable values: no `railway variables`, `railway variable list`, `--show-values` or `--decrypt-variables`. Never read or set production values |
| Redeploy **PR previews** (`trainer-hub-pr-<n>`) | Redeploying, rolling back or changing `production` or `development` |
| `railway config plan` on any environment (read-only, values redacted) | `railway config apply`, except when the owner asks for it, as in [ENVIRONMENTS.md §3](../engineering/ENVIRONMENTS.md): `development` first, never a PR environment |
| Devices and emulators that hold synthetic data only | Screenshots, or a screen dump, of anything that could show real data. Prefer text (`uiautomator`) over screenshots |
| `gh` for issues, PRs, Actions logs and artifacts, within the push and merge rules of `AGENTS.md` | Pasting production runtime or HTTP logs into a ticket or PR. Read them only to find an error; if they hold personal data, stop and quote none of it |

Pass `-p`, `-e` and `-s` on every `railway` command; don't `railway link` (it changes the owner's linked environment, which `config plan|apply` and `railway logs` default to).

## Railway

`railway` CLI, logged in as the owner. Project `5ac2d844-191a-4671-9632-50b66817f648`; environments `production`, `development` and `trainer-hub-pr-<n>`; services `web`, `cron`, `postgres`. Set `P=5ac2d844-191a-4671-9632-50b66817f648`.

| Job | Command |
|---|---|
| Deployments of a service, newest first, with ids and status | `railway deployment list -p $P -e trainer-hub-pr-<n> -s web --json` |
| Build log of a deployment | `railway logs -p $P -e trainer-hub-pr-<n> -s web -b -n 200 <deployment-id>` |
| Deploy (runtime) log | `railway logs -p $P -e trainer-hub-pr-<n> -s web -d -n 200 <deployment-id>` |
| Only errors | add `-f '@level:error'` |
| Redeploy a **PR preview** from the PR branch | `railway deployment redeploy -p $P -e trainer-hub-pr-<n> -s web --from-source -y` |
| Preview what `.railway/railway.ts` would change | `railway config plan --environment development --detailed-exit-code` (exit 0 = up to date, 2 = changes pending) |

- Without a deployment id, `railway logs` takes the latest successful deployment. Always pass `-n`: without it the command streams until stopped.
- A PR preview exists only while its PR is open, so list deployments right after CI is green. A docs-only PR has none ([ENVIRONMENTS.md §4](../engineering/ENVIRONMENTS.md)).
- `web` sleeps when idle: status `SLEEPING` is normal, not a failure. `SKIPPED` means the watch paths didn't change.
- Redeploy a preview when its build failed for a reason outside the PR, or after the owner changed a build-time variable. Never redeploy `development` or `production`.

## GitHub

`gh` with a repo admin token.

| Job | Command |
|---|---|
| Log of one CI job | `gh api --allow-escape-sequences repos/thekeyvan/trainer-hub/actions/jobs/<job-id>/logs` |
| Job ids of a run | `gh run view <run-id> -R thekeyvan/trainer-hub --json jobs --jq '.jobs[] \| "\(.databaseId) \(.name)"'` |
| Artifacts of a run | `gh api repos/thekeyvan/trainer-hub/actions/runs/<run-id>/artifacts --jq '.artifacts[].name'` |
| Download an artifact | `gh run download <run-id> -R thekeyvan/trainer-hub -n <name> -D <dir>` (a temp dir outside the repo) |

## iPhone

`scripts/ios-device.sh [nl|en]` builds the Debug app, installs it on the paired iPhone and launches it, in the given language. It signs with `DEVELOPMENT_TEAM` and calls the API in `TRAINER_HUB_API_BASE_URL`, both from `apps/ios/Config/Local.xcconfig` ([iOS README](../../apps/ios/README.md)). That file is git-ignored, so a worktree has none: link the main checkout's (`ln -s <main checkout>/apps/ios/Config/Local.xcconfig apps/ios/Config/Local.xcconfig`) and remove the link when done.

| Job | Command |
|---|---|
| List devices | `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun devicectl list devices --timeout 30` |
| Build, install, launch | `scripts/ios-device.sh en` |

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
| Install the Debug app | `gradle installDebug -Ptrainerhub.apiBaseUrl=https://<preview-domain>/api/` |
| Launch | `adb shell am start -n nl.trainerhub.app/.MainActivity` |
| Per-app language | `adb shell cmd locale set-app-locales nl.trainerhub.app --locales nl-NL` (`en` for English), then launch again |
| Stop the app | `adb shell am force-stop nl.trainerhub.app` |

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
