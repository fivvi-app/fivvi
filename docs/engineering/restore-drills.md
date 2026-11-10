# Restore drills

The drill log of the backups (E016, spec [#479](https://github.com/fivvi-app/fivvi/issues/479)): one row per run of [`scripts/restore-drill.sh`](../../scripts/restore-drill.sh), and the steps the owner follows. A backup counts only when a restore of it has worked, and this is where that is shown. What the backups promise is in [ENVIRONMENTS.md §8](ENVIRONMENTS.md#8-backups).

**The owner runs the drill; agents never do** ([tools.md](../agents/tools.md#what-needs-the-owner), [role-mapping.md](../legal/role-mapping.md) D8). Agents build and test the script against a fake `railway` and a local Postgres with synthetic data. The script prints counts only, so its output can be pasted in an issue or shared with an agent.

## Frequency

From [ENVIRONMENTS.md §8](ENVIRONMENTS.md#8-backups):

- On `development`, before G4.
- On `production`, right after the upgrade to Railway Pro (G4), when the daily scheduled backup is on.
- Then every 3 months, and after every major Postgres upgrade.

## Run a drill

1. Check that PITR is on for the environment: `railway postgres pitr status -p $P -e <environment> -s postgres` (`P=5ac2d844-191a-4671-9632-50b66817f648`).
2. Put the connection URL of the environment's `postgres` service in your shell without printing it or leaving it in the history: `read -rs RESTORE_DRILL_SOURCE_URL` (paste the `DATABASE_PUBLIC_URL` of the service from the Railway dashboard, press Return), then `export RESTORE_DRILL_SOURCE_URL`. The script reads the URL from this variable; it is never an argument. Close the shell afterwards.
3. Run the drill from your worktree or the main checkout:

   ```bash
   scripts/restore-drill.sh --environment development --who <your name>
   ```

   Without `--at` the drill picks the point itself, between two markers it writes into the source (about a minute of waiting, plus the restore). With `--at <RFC3339>` (a time that has passed, e.g. `2026-11-10T09:00:00Z`) it restores to that time (inside the PITR window), and the check is that neither marker is in the restored database, as both were written after it.
4. It restores into a new service `postgres-drill-<date>-<time>`, waits until the restored database answers, checks the markers, compares the row count of every table with the source, and removes the scratch service, the drill table and its markers. It exits non-zero on a failed check or a failed cleanup.
5. Copy the last line it prints (the row under "Drill log row:") into the table below, and fill in anything the script cannot know. For a failed run, add the row as well, with its result, and open an issue.
6. If the script says it could not remove something ("COULD NOT remove"), do it by hand as the line says, and check with `railway service list -e <environment>` that no `postgres-drill-*` service is left: a scratch service costs money.
7. On `development`, do the web health check below (AC8) at least once before G4.

What it prints: the environment, the times and durations, the table names with their counts in the source and in the restored database, and the result. It prints no row value and no connection URL, and nothing that `railway` printed.

Not run yet against Railway: the first drill on `development` confirms the commands (`railway postgres pitr restore --new-service-name`, `railway variable list`, `railway service delete`) and the variable it reads the restored URL from (`DATABASE_PUBLIC_URL` of the new service). If one differs, fix the script and this document in the same change. Restoring from a scheduled backup (`railway postgres pitr backup restore`) is not part of the script yet: its restore may not create a new service, and it needs Pro (G4).

## Health check of a scratch `web` (AC8)

After a drill on `development`, `GET /api/v1/health` of a `web` pointed at the restored service must answer 200 ([ENVIRONMENTS.md](ENVIRONMENTS.md)). The script can keep the scratch Postgres for this: it is an explicit choice, `--keep-scratch`, and the script then prints the command that removes it.

1. Run the drill with the choice to keep the scratch service: `scripts/restore-drill.sh --environment development --keep-scratch --who <your name>`. Note the service name it prints (`postgres-drill-…`).
2. In the Railway dashboard, `development` environment, add a service `web-drill` from the same repository and branch as `web`, with the same build settings. Copy the variables of `web` to it, except that `APP_DATABASE_URL` (and `DATABASE_URL`, if `web` has it) points at the scratch Postgres: reuse the user, password and database of `web`'s, with the host and port of the scratch service's private domain. Roles live in the cluster, so the restored database has `fivvi_app` with the same password.
3. Deploy `web-drill`, then open `https://<its domain>/api/v1/health`: it must answer 200. Write down the status code and the time to the first answer.
4. Remove both services, the scratch web first: `railway service delete --service web-drill --environment development --yes`, then the command the drill printed for the scratch Postgres. Check with `railway service list -e development` that neither is left.
5. Write in the row's Result: `passed, health 200`.

This procedure is written, not yet followed; the first run corrects it.

## Drill log

One row per run, newest last. The script prints the row. "Counts matched" is the tables whose count matched the source (or differed by no more than the rows changed after the point) of the tables compared. Result is `passed`, or `failed (<what>)` with the issue that follows.

| Date | Environment | Point in time | Restore duration | Counts matched | Run by | Result |
|---|---|---|---|---|---|---|
