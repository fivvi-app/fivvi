# Runbooks

What to do when something breaks, written as steps so nobody improvises under pressure (E016, spec [#479](https://github.com/fivvi-app/fivvi/issues/479)). Each runbook has a trigger, numbered steps with who does each one, the commands, and how to tell it is over. The alerts they start from are in [OBSERVABILITY.md §7](OBSERVABILITY.md#7-alerts). Backups, their promises and their checks are in [ENVIRONMENTS.md §8](ENVIRONMENTS.md#8-backups).

Written here: 1 incident response, 2 personal-data breach, 3 rollback and fix-forward, 8 support access, 9 provider retention settings. The restore (4), email (5), wrong-booking (6) and payment (7) runbooks are added to this document by their own tickets.

## Who does what

- **Owner:** the owner of Fivvi, who runs production. Only the owner has the Railway, Sentry, PostHog, UptimeRobot and Lettermint logins ([tools.md](../agents/tools.md#what-needs-the-owner)), and only the owner changes `production`.
- **Agent:** a coding agent on the owner's Mac. It prepares changes in a worktree and a PR, and reads what [tools.md](../agents/tools.md#rules) allows. It never reads or sets a variable value, never reads production data, runtime logs or HTTP logs of `production`, and never changes `production` or `development` (D8, [role-mapping.md](../legal/role-mapping.md)). Where a step needs something an agent may not do, the owner does it and gives the agent only what carries no personal data: a count, a route template, an error type, a release SHA, a deployment id.
- **Gym owner:** the Owner of the pilot gym's workspace. They decide what their gym does about a breach, and they are told what they need to know (steps below). In these runbooks "the gym" is the pilot gym; later workspaces follow the same steps.

Commands take `-p`, `-e` and `-s` as [tools.md](../agents/tools.md#rules) says. Set the project once per shell:

```bash
P=5ac2d844-191a-4671-9632-50b66817f648
```

The health check is public and returns no data, so anyone may run it. The production address is in [ENVIRONMENTS.md §1](ENVIRONMENTS.md#1-environments):

```bash
curl -fsS https://web-production-d3fe2.up.railway.app/api/v1/health
```

## 1. Incident response

**Trigger.** An UptimeRobot email (the health check or `/` is down), a Sentry alert (a new error in `web`, a failed or missed `cron` run), the Railway usage alert, a message from the gym ("I can't sign in"), or a notice on [Railway's status page](https://status.railway.com). The alerts and where each one lands are in [OBSERVABILITY.md §7](OBSERVABILITY.md#7-alerts).

**Severity.** Decide it in the first minutes; change it later when you learn more.

| Severity | It means | Examples | Tell the gym |
|---|---|---|---|
| 1 | The gym cannot work, or data may be lost or exposed | The health check fails for more than 10 minutes; nobody can sign in or book; the database is gone or wrong; one workspace saw another's data (also run [runbook 2](#2-personal-data-breach)) | The owner, **by phone or WhatsApp within 1 hour** of confirming it |
| 2 | Something important is broken but the gym can work around it | Emails do not arrive; the `cron` fails or misses runs; one screen or flow fails; slow responses | The owner, by email |
| 3 | Small or cosmetic, or one person is affected | One client's problem, a wrong label, a single error with no pattern | The owner, by email; reply to support within 2 working days |

The phone and email rules are the proposal accepted for this cut (`docs/legal/open-questions.md` Q14: support at `support@fivvi.app` and the business phone number, reply within 2 working days). A breach has its own deadlines in runbook 2.

**Steps.**

1. **Owner. Confirm it.** Open the alert. Run the health check (above) and look at [Railway's status page](https://status.railway.com): if Railway has an incident, the cause is outside Fivvi, so go to step 5 and wait. Write the time (UTC) and what you saw in the incident note (step 8).
2. **Owner. Look at the services.** The state of each deployment, newest first (the status is `SUCCESS`, `FAILED`, `CRASHED`, `SLEEPING` for an idle `web`, which is normal):

   ```bash
   railway deployment list -p $P -e production -s web --json
   ```

   ```bash
   railway deployment list -p $P -e production -s cron --json
   ```

3. **Owner. Find the cause.** Read the Sentry issue (the route template, the error type, the release): it is scrubbed of personal data ([OBSERVABILITY.md §2](OBSERVABILITY.md#2-scrubbing-rules)). For the `cron`, the tags `cron.task` and `cron.run_id` and the table `job_runs` say what failed ([OBSERVABILITY.md §6](OBSERVABILITY.md#62-reading-job_runs)). Runtime logs of `production` can hold real data, so only the owner reads them, and never pastes them to an agent or an issue:

   ```bash
   railway logs -p $P -e production -s web -d -n 200
   ```

   **Agent (when asked).** Reads the deployment list and the build log of a deployment, which `tools.md` allows on `production`, and the commit history, to find the change that did it:

   ```bash
   railway logs -p $P -e production -s web -b -n 200 <deployment-id>
   ```

   ```bash
   git log --oneline -20
   ```

4. **Owner. Stop the damage.** A bad release: roll back ([runbook 3](#3-rollback-and-fix-forward)). A bad migration, a lost or wrong row, or a leak: stop and run [runbook 2](#2-personal-data-breach) first. A secret that may have leaked: rotate it ([ENVIRONMENTS.md §7](ENVIRONMENTS.md#7-variables), the owner's steps there). A provider is down: wait, and tell the gym what they cannot do.
5. **Owner. Tell the gym** in the way the severity table says, in plain words: what does not work, since when, what they can do meanwhile (for a class, the trainer's own list), when you will write again. Never put a name, an email address or note content in the message. Write again when it is fixed.
6. **Agent (when asked). Fix forward.** In a worktree, on a `fix/<slug>` branch with a test that fails first (`scripts/wt.sh add fix/<slug>`), then `scripts/pr.sh create`. The PR goes through the normal review and the merge queue ([WORKFLOW.md](WORKFLOW.md)); `main` deploys to `production` after CI.
7. **Owner. Check that it is over** (below).
8. **Owner. Write the incident note** (below), and add the change to the runbook or the alerts if they let you down.

**It is over when** the health check answers 200 and UptimeRobot is green again, the Sentry issue has no new events on the fixed release, the `cron` has checked in `ok` on its next run (the monitor `cron` is green, [OBSERVABILITY.md §6.3](OBSERVABILITY.md#63-the-sentry-cron-monitor)), the gym has been told it is fixed, and the incident note exists.

**The post-incident note** is a file `docs/pilot/incident-<YYYY-MM-DD>-<slug>.md`, written by the owner or by an agent from the facts the owner gives it, in a PR. It holds: the severity; the times (UTC) it started, was found, was fixed and the gym was told; what happened and why; what we did; what we change so it does not happen again (a test, an alert, a step in a runbook), each as an issue; and the lessons. **No personal data:** categories and counts only. **Nothing that identifies a gym, a workspace slug or a person:** this repository is public, so name a workspace only by an opaque reference.

## 2. Personal-data breach

**Trigger.** Personal data of a workspace may have been seen, changed, lost or taken by someone who should not have it: a workspace sees another's data, a secret or backup leaked, an account was taken over, a database was exposed, an email went to the wrong person, a device with access was lost, or a provider tells us about one. Also when you are not sure: treat it as a breach until step 3 says it is not. The processor agreement ([Artikel 6](../legal/verwerkersovereenkomst.md#artikel-6-datalekken), [Article 6](../legal/verwerkersovereenkomst.md#article-6-data-breaches)) sets the deadlines:

- **48 hours:** Fivvi, as processor, tells the gym **without undue delay and at the latest within 48 hours after Fivvi discovered it** (art. 6(1); `docs/legal/open-questions.md` Q7 keeps the 48 hours). Discovered means the moment the owner knows or reasonably suspects.
- **72 hours:** the gym, as controller, decides whether to notify the Autoriteit Persoonsgegevens and the people concerned, and has **72 hours** for the notice to the authority (GDPR art. 33; art. 6(3) and (4): we help, we do not notify the authority or the people ourselves unless the law makes us). Tell the gym early: its 72 hours start when the gym knows.

Do not wait for the 48 hours. Every hour counts for the gym.

**Steps.**

1. **Owner. Start the clock.** Write the time (UTC) you discovered it, in the incident note (runbook 1, step 8) and in the register row (step 8 below). Treat it as severity 1 and follow [runbook 1](#1-incident-response) in parallel.
2. **Owner. Contain.** Stop more data from leaving, without deleting evidence:
   - A bad release: roll back `web` and `cron` ([runbook 3](#3-rollback-and-fix-forward)).
   - A leaked secret: rotate it. For the database roles, set a new value without printing it and redeploy `web` so the release step updates the role ([ENVIRONMENTS.md §7](ENVIRONMENTS.md#7-variables)), for example for the app role:

     ```bash
     openssl rand -hex 24 | railway variable set APP_DATABASE_PASSWORD --stdin --skip-deploys -p $P --service web --environment production
     ```

     ```bash
     railway redeploy -p $P -e production -s web -y
     ```

     Rotating `BETTER_AUTH_SECRET` signs everyone out and voids pending sign-in emails; a leaked provider token (Lettermint, Sentry, PostHog) is rotated in that provider's dashboard and then set in `production` the same way. The owner does all of this; an agent never reads or sets a value.
   - An account taken over: remove the access in the provider's dashboard.
   - Stop sign-ups or the whole service while you investigate: in the Railway dashboard, for `web` in `production`.
3. **Owner. Assess.** Answer the questions that article 6(2) says the notice contains, as far as known now, from counts and categories (never by reading the data; if the only way to know is to look, that is [runbook 8](#8-support-access)):
   - What is the nature of the breach (exposed, changed, lost, taken)?
   - Which categories of data and roughly how many people and records? Are **notes** involved (they may hold health data, article 13)? Are payment details? Are children?
   - What are the likely consequences for the people?
   - What have we done, and what do we propose?
   - Who is the contact person (the owner)?

   An **agent** may help with the technical cause: which commit or configuration did it, from the code, the git history and the build logs. It does not look at the affected data.
4. **Owner. Tell the gym** by phone or WhatsApp, then in writing by email to the controller's contact address (in the processor agreement, [Bijlage 1](../legal/verwerkersovereenkomst.md#bijlage-1-beschrijving-van-de-verwerking)), **as soon as you suspect it and within 48 hours at the latest**, even if the facts are incomplete: send what you know now and the rest as soon as you have it. The email holds the five points of step 3. An agent may draft it from the answers of step 3, with example values only.
5. **Gym owner. Decides and notifies.** The gym decides whether it notifies the Autoriteit Persoonsgegevens ([Meldloket datalekken](https://datalekken.autoriteitpersoonsgegevens.nl/)) within **72 hours** of knowing, and whether it tells the people concerned. The owner answers the gym's questions, quickly, in writing, and gives it the facts it needs for the form. Do not tell the people concerned or the authority yourself.
6. **Owner and agent. Fix and prevent.** Fix the cause forward with a test that fails first ([runbook 1](#1-incident-response), step 6). If data was changed or lost, the restore runbook applies (added by its own ticket) with [ENVIRONMENTS.md §8](ENVIRONMENTS.md#8-backups).
7. **Owner. Keep the facts.** Record the dates and times (UTC) of discovery, of telling the gym and of every message, and what the gym decided. Do not delete logs that show what happened.
8. **Owner. Add a row to the [breach register](../pilot/breach-register.md)** (art. 6(5)), also for a breach that needed no notice, with the measures taken. Link the incident note. The register is in a public repository: a row holds only the date, an opaque reference and the category, and **nothing that identifies a gym, workspace or person**. Rows removed later stay in git history.

**It is over when** the cause is fixed and deployed, nothing more is leaking, the gym has had the written notice and everything it asked for, the register row is complete and closed, and the incident note lists what we change.

## 3. Rollback and fix-forward

**Trigger.** A release made production worse: the health check fails after a deploy, errors start on the new release in Sentry, or a feature that worked stopped working. Use it for `web` and for `cron`. For a migration that is wrong, do not roll back the data: fix forward. The rules behind this are in [ENVIRONMENTS.md §5](ENVIRONMENTS.md#5-migrations) and [§6](ENVIRONMENTS.md#6-rollback).

**Steps (an application release).**

1. **Owner. List the deployments** of the service, newest first, and pick the last one that was `SUCCESS` before the bad one. The **agent** may read the same list (status only):

   ```bash
   railway deployment list -p $P -e production -s web --json
   ```

   Use `-s cron` for the `cron`.
2. **Owner. Roll back.** In the Railway dashboard: the service's *Deployments*, the earlier successful deployment, *Rollback*. Or by id:

   ```bash
   railway api 'mutation { deploymentRollback(id: "<deployment-id>") }'
   ```

   A rollback runs the old image **without its pre-deploy step** and does not undo migrations, which is why every migration must work with the code already deployed ([ENVIRONMENTS.md §5](ENVIRONMENTS.md#5-migrations)). The `cron` does not migrate.
3. **Owner. Check it:** the health check (above), the new deployment's status in the list, UptimeRobot green. For the `cron`, wait for its next run (every 5 minutes) and see the Sentry monitor `cron` go `ok` ([OBSERVABILITY.md §6.3](OBSERVABILITY.md#63-the-sentry-cron-monitor)).
4. **Agent (when asked). Revert the change on `main`** with a PR, so that the next deploy does not bring it back. Find the squash commit of the change in `git log` (`main` has only squash commits), then in a worktree:

   ```bash
   scripts/wt.sh add fix/revert-<slug>
   ```

   ```bash
   git revert <squash-commit>
   ```

   Then `scripts/pr.sh create`; the PR goes through review and the merge queue like any other.
5. **Owner. Tell the gym** if it noticed, as runbook 1 says, and write the incident note if the severity was 1 or 2.

**Steps (a migration).** The database is fixed forward, never rolled back by hand.

1. **A migration that fails** fails the deploy, and the previous deployment keeps serving: no rollback is needed. **Agent:** fix it with a new migration (or a corrected one that has not been applied anywhere) in a PR.
2. **A migration that was applied but the code is wrong:** roll back the application as above (the old code works with the new schema, because migrations are backwards-compatible), then **agent:** fix forward with a new migration and code in a PR. A destructive change goes expand, migrate, contract over separate releases.
3. **Data was lost or damaged:** restoring a backup is the last resort ([ENVIRONMENTS.md §8](ENVIRONMENTS.md#8-backups)); the restore runbook is added by its own ticket. If personal data may be involved, run [runbook 2](#2-personal-data-breach) too.

**Configuration.** A wrong `.railway/railway.ts` is reverted in a PR and applied again by the owner ([ENVIRONMENTS.md §3](ENVIRONMENTS.md#3-infrastructure-as-code)); an agent may run `railway config plan` on `development` to see what would change, and never `railway config apply` unless the owner asks ([tools.md](../agents/tools.md#rules)).

**It is over when** the health check is 200 on the rolled-back deployment, the errors have stopped, the revert PR is merged and its deploy is healthy, and `railway config plan` shows no drift if the configuration changed.

## 8. Support access

**Trigger.** A support request or an incident where the answer is in the gym's data and cannot be found any other way: "my client's booking is gone", an error that only one workspace gets. The operator may look at a workspace's data **only** when a support request or an incident needs it, **at the gym's request or with its knowledge**, and it is **logged** ([role-mapping.md](../legal/role-mapping.md) §6.5, W11). **Agents never do it** (D8): an agent works on synthetic data and on what the owner tells it that carries no personal data.

**Steps.**

1. **Owner. Try the other ways first.** Ask the gym owner to look in their own screens, or to share their screen with you. Check Sentry (scrubbed), the `cron` records (`job_runs`) and a reproduction on `development` with synthetic data. Most questions end here, with no access.
2. **Owner. Get the gym's request or make sure it knows.** A support email from the gym is the request. For an incident, tell the gym what you need to look at and why before you look, or as soon as you can if it cannot wait; say so in the log row.
3. **Owner. Write the row first** in the [support access log](../pilot/support-access-log.md): the date and time (UTC), an opaque reference (a number you keep in your own records, never the workspace slug or name), why in a category, how the gym knew, and what kind of data you will look at. **Nothing that identifies a gym, a workspace, a person or a client goes in the log**: this repository is public.
4. **Owner. Look at the least you need.** Postgres has no public address, so the owner reads data through the Railway dashboard, the `postgres` service of `production`, its *Data* tab, with `select` queries only. Count first, then select only the columns and rows you need; never export a table or copy data out of the dashboard. **Note content only when there is no other way** (it may be health data, art. 13 of the processor agreement): say in the log why, and look only at the one note. Do not run `railway connect` or open a shell in a service for this.
5. **Owner. Share nothing that is personal.** To get help from an agent, describe the problem in words, counts and ids of nothing real: "bookings of one day show the wrong time zone", not the rows.
6. **Owner. Close the row** with the time you stopped and whether note content was viewed. Answer the gym in writing: what you found and what you changed. If you changed data, do it through the product's own paths where there are any; a hand edit is a migration or a fix in a PR, not a session in the dashboard.
7. **Gym owner.** Can ask for the rows about its workspace at any time; send the rows that carry the reference you keep for its workspace, from the log, without the other rows.

**It is over when** the question is answered, the log row is complete, and nothing was copied out of production.

## 9. Provider retention settings

**Trigger.** Pilot setup (before real data), every quarter (with the restore drill), and whenever a provider or a plan changes. These are the values the retention policy promises ([retention-policy.md](../legal/retention-policy.md) R13, R15, R16, R17, R18; I5: the retention at providers is set to the values and recorded here). The privacy policy stays true only while they hold.

**Steps.** All of them are the owner's: the logins are the owner's ([tools.md](../agents/tools.md#what-needs-the-owner)) and no agent reads a setting here.

1. **Owner. Open the place** in the table for the provider, in the provider's dashboard.
2. **Owner. Read the value** that is set now.
3. **Owner. Set it** if it is not the value to set. Where a provider fixes a value and it cannot be set, record the value it shows.
4. **Owner. Check it against the policy.** If a fixed value is over the policy, write the exception in `retention-policy.md` (it has one for Lettermint).
5. **Owner. Write the date and the value you saw** in *Last checked*, in a PR.
6. Repeat for every row of the table.

| Provider | Policy | Value to set | Where it is set | Last checked (owner fills in) |
|---|---|---|---|---|
| Sentry (errors, R15) | at most 90 days | 90 days or less: the shortest the plan allows | Sentry, the organisation's settings: the plan's event retention; the server-side scrubber and "Prevent storing of IP addresses" on ([OBSERVABILITY.md §1](OBSERVABILITY.md#1-error-reporting)) | not yet checked |
| PostHog (events and page views, R17) | 12 months | 12 months | PostHog EU project settings: data retention | not yet checked |
| Lettermint (delivery logs, R18) | at most 30 days | Fixed by Lettermint, not settable: 28 days for message content, recipients, metadata and events (within R18), 90 days for analytics events (over it: the recorded exception in R18). "Hide email content" **on** for the sign-in route | Lettermint dashboard: the route's settings for "Hide email content"; retention is Lettermint's ([sub-processors.md](../legal/sub-processors.md)) | not yet checked |
| Railway logs (application and hosting logs, R13) | at most 30 days (or the plan's, if shorter) | The plan's own: not a setting. Read the retention of the current plan on Railway's plan page and write it here; it must be 30 days or less | Railway, the workspace's plan page; recorded here | not yet checked |
| Backups (R16) | at most 30 days | Fixed by Railway, not settable: point-in-time recovery keeps the last 4 full backups, roughly 4 weeks ([Railway: point-in-time recovery](https://docs.railway.com/volumes/point-in-time-recovery)). The owner checks that this stays within 30 days and records what the dashboard shows. Scheduled backups, from G4, are daily or weekly only, never monthly: Railway keeps daily backups 6 days, weekly 27 and monthly 89 ([Railway: backups](https://docs.railway.com/volumes/backups)), so a monthly schedule would break the 30 days | Railway dashboard, the `postgres` service's backups, by the owner; the backup commands and values are set out in [ENVIRONMENTS.md §8, Backups](ENVIRONMENTS.md#8-backups) | not yet checked |

**It is over when** every row has a date and a value the owner saw, a value over the policy has its exception written in `retention-policy.md` (by the owner, `docs/legal/` is the owner's), and the privacy policy still says what is true.
