// A fake `railway` CLI for the restore drill's tests (E016, scripts/restore-drill.sh). It records every call and
// simulates the three commands the drill uses against a local Postgres. It never reaches Railway.
//
//   postgres pitr restore --at <time> --new-service-name <name> ...   "restores": a copy of the source database
//                                                                     as it was at the time
//   variable list --service <name> --json                             the connection URL of the restored database
//   service delete --service <name> ...                               drops the restored database
//
// Every call fails (3) when its input is not closed: the real CLI may wait for a prompt there.
//
// Settings, all from the environment of the test:
//   FAKE_RAILWAY_LOG           file that gets one JSON line (the arguments) per call
//   FAKE_RAILWAY_SERVER_URL    the local Postgres server (a maintenance connection)
//   FAKE_RAILWAY_SOURCE_DB     the database the restore copies
//   FAKE_RAILWAY_RESTORED_DB   the name of the restored database
//   FAKE_RAILWAY_MODE          ok | restore-fails | never-healthy | wrong-point | extra-table | delete-fails
import { appendFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import pg from 'pg';

const env = process.env;
const args = process.argv.slice(2);
appendFileSync(env.FAKE_RAILWAY_LOG, `${JSON.stringify(args)}\n`);

const mode = env.FAKE_RAILWAY_MODE ?? 'ok';
const created = `${env.FAKE_RAILWAY_LOG}.restored`;
const option = (name) => args[args.indexOf(name) + 1];
const quote = (name) => `"${name.replace(/"/g, '""')}"`;
const urlOf = (name) => {
  const url = new URL(env.FAKE_RAILWAY_SERVER_URL);
  url.pathname = `/${name}`;
  return url.toString();
};

async function connect(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

const command = args.slice(0, 3).join(' ');

// The real CLI may wait for a prompt on its input (a 2FA code, a confirmation) that nobody sees: the drill must
// hand it a closed input, which ends at once. An open one (a pipe or a terminal) does not.
const inputClosed = await new Promise((resolve) => {
  process.stdin.on('end', () => resolve(true));
  process.stdin.resume();
  setTimeout(() => resolve(false), 1500);
});
if (!inputClosed) {
  console.error('fake railway: waiting for input');
  process.exit(3);
}

if (command === 'postgres pitr restore') {
  if (mode === 'restore-fails') {
    // What a real failure may print: the drill must not show it.
    console.error(
      'fake railway: restore failed zzq-secret-detail postgres://user:zzq-password@host/db',
    );
    process.exit(1);
  }
  const point = option('--at');
  // What the drill's test asks about the order of events: the `before` marker of the source, as it is when the
  // restore is asked for (the database's own clock, as the markers' written_at is).
  const source = await connect(urlOf(env.FAKE_RAILWAY_SOURCE_DB));
  try {
    const { rows } = await source.query(
      `select point, written_at from restore_drill_markers where kind = 'before'`,
    );
    writeFileSync(
      `${env.FAKE_RAILWAY_LOG}.before`,
      JSON.stringify({
        point,
        markerPoint: rows[0]?.point.toISOString() ?? null,
        writtenAt: rows[0]?.written_at.toISOString() ?? null,
      }),
    );
  } finally {
    await source.end();
  }
  const server = await connect(env.FAKE_RAILWAY_SERVER_URL);
  try {
    await server.query(
      `CREATE DATABASE ${quote(env.FAKE_RAILWAY_RESTORED_DB)} TEMPLATE ${quote(env.FAKE_RAILWAY_SOURCE_DB)} STRATEGY FILE_COPY`,
    );
  } finally {
    await server.end();
  }
  writeFileSync(created, option('--new-service-name'));
  const restored = await connect(urlOf(env.FAKE_RAILWAY_RESTORED_DB));
  try {
    // A restore to a point has none of what was written after it.
    if (mode !== 'wrong-point') {
      await restored.query('delete from restore_drill_markers where written_at > $1::timestamptz', [
        point,
      ]);
    }
    if (mode === 'extra-table') await restored.query('create table restore_extra (id int)');
  } finally {
    await restored.end();
  }
  process.exit(0);
}

if (args[0] === 'variable') {
  if (mode === 'never-healthy' || !existsSync(created)) process.exit(1);
  console.log(
    JSON.stringify({
      DATABASE_PUBLIC_URL: urlOf(env.FAKE_RAILWAY_RESTORED_DB),
      SOME_TOKEN: 'zzq-fake-token',
    }),
  );
  process.exit(0);
}

if (args[0] === 'service' && args[1] === 'delete') {
  if (mode === 'delete-fails' || !existsSync(created)) process.exit(1);
  const server = await connect(env.FAKE_RAILWAY_SERVER_URL);
  try {
    await server.query(
      `DROP DATABASE IF EXISTS ${quote(env.FAKE_RAILWAY_RESTORED_DB)} WITH (FORCE)`,
    );
  } finally {
    await server.end();
  }
  rmSync(created);
  process.exit(0);
}

console.error('fake railway: unknown command');
process.exit(2);
