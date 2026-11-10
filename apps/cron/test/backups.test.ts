import { readFileSync } from 'node:fs';
import { createRailwayContext, project } from 'railway/iac';
import { describe, expect, it } from 'vitest';
import program from '../../../.railway/railway.ts';

// E016 AC1: the backups written down in ENVIRONMENTS.md §8 and the backup settings declared in
// `.railway/railway.ts` say the same. The doc table says, per setting, whether it lives in the
// config as code or is set by the owner with the CLI; this test holds the file to that claim.

const root = new URL('../../../', import.meta.url);
const environmentsDoc = readFileSync(new URL('docs/engineering/ENVIRONMENTS.md', root), 'utf8');
const railwayFile = readFileSync(new URL('.railway/railway.ts', root), 'utf8');

/** The text of "## 8. Backups", up to the next "## " heading. */
function backupsSection(): string {
  const start = environmentsDoc.indexOf('\n## 8. Backups');
  expect(start, 'ENVIRONMENTS.md has a "## 8. Backups" section').toBeGreaterThan(-1);
  const rest = environmentsDoc.slice(start + 1);
  const next = rest.indexOf('\n## ', 1);
  return next === -1 ? rest : rest.slice(0, next);
}

interface SettingRow {
  setting: string;
  production: string;
  where: string;
  check: string;
}

/** The rows of the settings table: `| Setting | Production | Where it lives | Check |`. */
function settingRows(): SettingRow[] {
  const lines = backupsSection().split('\n');
  const header = lines.findIndex((l) => /^\|\s*Setting\s*\|/.test(l));
  expect(header, 'the §8 settings table has a header row').toBeGreaterThan(-1);
  const rows: SettingRow[] = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const cells = line
      .slice(1, line.lastIndexOf('|'))
      .split(/(?<!\\)\|/)
      .map((c) => c.trim());
    const [setting = '', production = '', where = '', check = ''] = cells;
    rows.push({ setting, production, where, check });
  }
  return rows;
}

/** The backup settings found in the JSON of a Railway definition. */
function backupSettingsIn(json: string): Set<string> {
  const declared = new Set<string>();
  if (/pitr|point.in.time/i.test(json)) declared.add('PITR');
  for (const match of json.matchAll(/"backupSchedules":\[([^\]]*)\]/g)) {
    // A daily schedule is the documented setting; any other one is a setting the table doesn't know.
    for (const kind of (match[1] ?? '').match(/"[A-Z_]+"/g) ?? []) {
      declared.add(kind === '"DAILY"' ? 'Daily scheduled backup' : `Backup schedule ${kind}`);
    }
  }
  return declared;
}

/** Every backup setting the Railway config declares in an environment. */
async function declaredBackupSettings(environment: string): Promise<Set<string>> {
  const definition = await program(createRailwayContext({ environment }), project);
  return backupSettingsIn(JSON.stringify(definition.resources));
}

const READ_ONLY_COMMANDS = [
  /^railway postgres pitr status /,
  /^railway postgres pitr backup list /,
  /^railway postgres pitr schedule list /,
  /^railway bucket (list|info) /,
  /^railway config plan( |$)/,
];
const FORBIDDEN = /variable|--show-values|decrypt|\bssh\b|\bconnect\b|\brun\b|\bshell\b|\bapply\b/;

describe('E016 backups in ENVIRONMENTS.md §8 and .railway/railway.ts', () => {
  it('AC1: PITR and backups are configured as documented', async () => {
    const rows = settingRows();
    const documented = new Set(
      rows.filter((r) => /^config as code/i.test(r.where)).map((r) => r.setting),
    );

    for (const environment of ['production', 'development']) {
      const declared = await declaredBackupSettings(environment);
      expect(
        [...declared].sort(),
        `${environment}: settings declared in .railway/railway.ts vs. documented as "config as code"`,
      ).toEqual([...documented].sort());
    }

    // When nothing can be declared, the file says so, so a reader doesn't look for it.
    if (documented.size === 0) {
      expect(railwayFile).toMatch(/Backups: .*no .*(setting|field)/is);
    }
  });

  it('AC1: any backup schedule in the file counts as declared, not only a daily one', () => {
    const schedule = (...kinds: string[]) =>
      JSON.stringify({ volumeMounts: [{ backupSchedules: kinds }] });
    expect([...backupSettingsIn(schedule())]).toEqual([]);
    expect([...backupSettingsIn(schedule('DAILY'))]).toEqual(['Daily scheduled backup']);
    for (const kind of ['WEEKLY', 'MONTHLY']) {
      const declared = backupSettingsIn(schedule(kind));
      expect(declared.size, `${kind} is a declared backup setting`).toBeGreaterThan(0);
      expect(declared.has('Daily scheduled backup'), `${kind} is not the daily backup`).toBe(false);
    }
  });

  it('AC1: production states PITR, the daily backup, the window, retention and where they live', () => {
    const rows = settingRows();
    const byName = (name: string) => rows.find((r) => r.setting.toLowerCase().includes(name));

    const pitr = byName('point-in-time recovery');
    expect(pitr?.production, 'PITR is enabled by the owner, dated once #161 is done').toMatch(
      /#161/,
    );
    expect(byName('pitr window')?.production).toMatch(/4 weeks/);
    expect(byName('daily scheduled backup')?.production).toMatch(/G4/);
    // R16: backups are kept 30 days at most.
    const retention = byName('retention')?.production ?? '';
    const days = [...retention.matchAll(/(\d+) days/g)].map((m) => Number(m[1]));
    expect(days.length, 'retention is stated in days').toBeGreaterThan(0);
    for (const d of days) expect(d).toBeLessThanOrEqual(30);
    expect(byName('location')?.production).toMatch(/Amsterdam/);
  });

  it('AC1: every setting says where it lives and how to read it with a read-only railway command', () => {
    const rows = settingRows();
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const row of rows) {
      expect(row.where, `${row.setting}: where it lives`).toMatch(
        /^(config as code|set by the owner with the CLI|fixed by railway)/i,
      );
      const command = /`(railway [^`]+)`/.exec(row.check)?.[1];
      expect(
        command,
        `${row.setting}: a railway command that shows its current value`,
      ).toBeTruthy();
      expect(
        READ_ONLY_COMMANDS.some((re) => re.test(command ?? '')),
        `${row.setting}: ${command} is a read-only command`,
      ).toBe(true);
      expect(command, `${row.setting}: ${command} reads no variables or secrets`).not.toMatch(
        FORBIDDEN,
      );
      if (!command?.startsWith('railway config plan')) {
        expect(command, `${row.setting}: names the production environment`).toMatch(
          /-e production/,
        );
      }
    }
  });

  it('AC1: the recovery point, recovery time and drill frequency are written down', () => {
    const section = backupsSection();
    expect(section).toMatch(/RPO[^\n]*5 minutes[^\n]*24 hours/);
    expect(section).toMatch(/RTO[^\n]*2 hours/);
    expect(section).toMatch(/Drill[^\n]*development[^\n]*production[^\n]*3 months/i);
    expect(section).toMatch(/only copies|only copy/i);
  });
});
