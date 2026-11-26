import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { messages } from '../index.ts';
import { analyze } from './analyze.ts';
import { readCatalogSet } from './catalog.ts';
import { runChecks } from './checks.ts';
import { literalTrainerProblems } from './no-literal-trainer.ts';
import {
  type AllowedForGood,
  type AllowedForGoodKey,
  type AllowedNotTheRole,
  type TrainerAllowlist,
  trainerAllowlist,
} from './no-literal-trainer-allowlist.ts';
import { catalogSet } from './testing.ts';

const packageRoot = path.resolve(import.meta.dirname, '../..');

const NO_ALLOWLIST: TrainerAllowlist = [];
const problemsFor = (
  nl: Record<string, string>,
  en: Record<string, string>,
  allowlist: TrainerAllowlist = NO_ALLOWLIST,
) => literalTrainerProblems(analyze(catalogSet(nl, en)), allowlist);

describe('F068 no-literal-trainer check', () => {
  describe('AC6: a new literal fails', () => {
    it('fails on a message that says trainer, in either language, naming the key and file', () => {
      expect(
        problemsFor(
          { 'bookings.title': 'Boekingen', 'bookings.who': 'Je trainer' },
          { 'bookings.title': 'Bookings', 'bookings.who': 'Your coach' },
        ),
      ).toEqual([expect.stringContaining('"bookings.who"')]);
      expect(
        problemsFor({ 'bookings.who': 'Je coach' }, { 'bookings.who': 'Your trainer' }),
      ).toEqual([expect.stringContaining('en.json')]);
    });

    it('fails on a capital, a plural and a compound', () => {
      const messages = {
        'a.one': 'Trainer',
        'a.two': 'Trainers',
        'a.three': 'Trainersnotities',
      };
      expect(problemsFor(messages, messages)).toHaveLength(3);
    });

    it('tells the author what to do instead', () => {
      const [problem] = problemsFor({ 'a.b': 'Je trainer' }, { 'a.b': 'Your trainer' });
      expect(problem).toContain('{word}');
      expect(problem).toContain('no-literal-trainer-allowlist.ts');
    });

    it('lets a person’s name placeholder called {trainer} through', () => {
      const messages = { 'a.b': 'Met {trainer}' };
      expect(problemsFor(messages, messages)).toEqual([]);
    });

    it('lets the workspace’s word through, and the words of the catalog that define it', () => {
      expect(
        problemsFor(
          { 'a.b': '{Words} van {workspace}', 'trainerWord.trainer.word': 'trainer' },
          { 'a.b': '{Words} of {workspace}', 'trainerWord.trainer.word': 'trainer' },
        ),
      ).toEqual([]);
    });

    it('passes a message in a plural branch only when it has no literal', () => {
      const nl = { 'a.b': '{n, plural, one {# trainer} other {# docenten}}' };
      const en = { 'a.b': '{n, plural, one {# teacher} other {# teachers}}' };
      expect(problemsFor(nl, en)).toEqual([expect.stringContaining('nl-NL.json')]);
    });
  });

  describe('the allowlist', () => {
    const forGood: AllowedForGood = {
      prefix: 'site.',
      scope: 'website',
      reason: 'The public website’s copy is out of scope (spec #588).',
    };
    const forGoodKey: AllowedForGoodKey = {
      exactKey: 'myProfile.trainerRole',
      scope: 'no-workspace',
      reason: 'Mijn profiel lists the workspaces of one person, so it has no one word.',
    };

    it('lets an entry for good cover every key under its prefix', () => {
      const messages = { 'site.home.a': 'Voor trainers', 'site.home.b': 'Trainer' };
      expect(problemsFor(messages, messages, [forGood])).toEqual([]);
    });

    it('lets an entry for a word that is not the role cover exactly its key, whatever the ticket', () => {
      const notTheRole: AllowedNotTheRole = {
        exactKey: 'exercises.names.elliptical',
        scope: 'not-the-role',
        reason: 'Equipment: a crosstrainer is a machine, not a person.',
      };
      const messages = {
        'exercises.names.elliptical': 'Crosstrainer',
        'exercises.names.other': 'Crosstrainer',
      };
      expect(problemsFor(messages, messages, [notTheRole])).toEqual([
        expect.stringContaining('"exercises.names.other"'),
      ]);
      expect(
        problemsFor(messages, messages, [
          notTheRole,
          { ...notTheRole, exactKey: 'exercises.names.other' },
        ]),
      ).toEqual([]);
    });

    it('fails on an entry for a word that is not the role when it has no reason, is listed twice or is no longer needed', () => {
      const notTheRole: AllowedNotTheRole = {
        exactKey: 'a.b',
        scope: 'not-the-role',
        reason: 'Equipment.',
      };
      const messages = { 'a.b': 'Crosstrainer' };
      expect(problemsFor(messages, messages, [{ ...notTheRole, reason: ' ' }])).toEqual([
        expect.stringContaining('reason'),
      ]);
      expect(problemsFor(messages, messages, [notTheRole, notTheRole])).toEqual([
        expect.stringContaining('twice'),
      ]);
      expect(problemsFor({ 'a.b': 'Elliptical' }, { 'a.b': 'Elliptical' }, [notTheRole])).toEqual([
        expect.stringContaining('"a.b" no longer says trainer'),
      ]);
    });

    it('lets an entry for a screen with no workspace cover exactly its key', () => {
      const messages = { 'myProfile.trainerRole': 'Trainer', 'myProfile.other': 'Trainer' };
      expect(problemsFor(messages, messages, [forGoodKey])).toEqual([
        expect.stringContaining('"myProfile.other"'),
      ]);
    });

    it('fails on an entry that no message needs any more', () => {
      const messages = { 'myProfile.trainerRole': '{Word}' };
      expect(problemsFor(messages, messages, [forGoodKey])).toEqual([
        expect.stringContaining('"myProfile.trainerRole" no longer says trainer'),
      ]);
    });

    it('fails on an entry without a reason, or twice', () => {
      const messages = { 'myProfile.trainerRole': 'Trainer' };
      expect(problemsFor(messages, messages, [{ ...forGoodKey, reason: ' ' }])).toEqual([
        expect.stringContaining('reason'),
      ]);
      expect(problemsFor(messages, messages, [forGoodKey, forGoodKey])).toEqual([
        expect.stringContaining('twice'),
      ]);
    });

    it('has no kind of entry that is temporary: nothing says it moves with a ticket', () => {
      const messages = { 'team.title': 'Trainers' };
      const temporary = {
        key: 'team.title',
        movesWith: 746,
        reason: 'moves with #746: the Trainers page',
      } as unknown as TrainerAllowlist[number];
      expect(problemsFor(messages, messages, [temporary])).toEqual(
        expect.arrayContaining([expect.stringContaining('"team.title" says "trainer" literally')]),
      );
    });
  });

  describe('AC12: the committed allowlist', () => {
    it('names for good only screens with no workspace and the public website', () => {
      const forGood = trainerAllowlist.filter(
        (entry): entry is AllowedForGood => 'prefix' in entry,
      );
      expect(forGood.map((entry) => [entry.prefix, entry.scope])).toEqual([
        ['noWorkspace.', 'no-workspace'],
        ['site.', 'website'],
        ['email.demoRequest.', 'no-workspace'],
      ]);
    });

    it('names for good one key of a screen with no workspace: the role in Mijn profiel', () => {
      const forGoodKeys = trainerAllowlist.filter(
        (entry): entry is AllowedForGoodKey =>
          'exactKey' in entry && entry.scope === 'no-workspace',
      );
      expect(forGoodKeys.map((entry) => entry.exactKey)).toEqual(['myProfile.trainerRole']);
    });

    it('has no temporary entry: every entry is for a screen with no workspace, the website or a word that is not the role', () => {
      for (const entry of trainerAllowlist) {
        expect(['no-workspace', 'website', 'not-the-role'], JSON.stringify(entry)).toContain(
          entry.scope,
        );
        expect(entry, JSON.stringify(entry)).not.toHaveProperty('movesWith');
      }
    });

    it('has no old role label: roles.trainer is in neither catalog, and nothing else replaced it by name', () => {
      for (const locale of ['nl-NL', 'en'] as const) {
        expect(messages[locale].roles).not.toHaveProperty('trainer');
        expect(messages[locale].roles).toHaveProperty('trainerLabel');
      }
    });

    it('allows words that are not the role only by exact key, each naming the equipment', () => {
      const notTheRole = trainerAllowlist.filter(
        (entry): entry is AllowedNotTheRole =>
          'exactKey' in entry && entry.scope === 'not-the-role',
      );
      expect(notTheRole.map((entry) => entry.exactKey)).toEqual([
        'exercises.names.stationaryBike',
        'exercises.names.elliptical',
      ]);
      for (const entry of notTheRole) expect(entry.scope).toBe('not-the-role');
    });

    it('has a reason on every entry', () => {
      for (const entry of trainerAllowlist) expect(entry.reason.trim()).not.toBe('');
    });
  });

  it('passes on the committed catalogs', async () => {
    const set = await readCatalogSet(packageRoot);
    const [result] = await runChecks(packageRoot, ['no-literal-trainer'], { set });
    expect(result?.problems).toEqual([]);
  });

  it('runs with `pnpm check` and fails there on a new literal', async () => {
    const set = await readCatalogSet(packageRoot);
    (set.messages.en as Record<string, Record<string, string>>).roles = {
      ...(set.messages.en as Record<string, Record<string, string>>).roles,
      brandNew: 'Your trainer',
    };
    const results = await runChecks(packageRoot, undefined, { set });
    expect(results.map((result) => result.name)).toContain('no-literal-trainer');
    expect(results.find((result) => result.name === 'no-literal-trainer')?.problems).toEqual([
      expect.stringContaining('"roles.brandNew"'),
    ]);
  });
});
