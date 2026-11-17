import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from './analyze.ts';
import { readCatalogSet } from './catalog.ts';
import { runChecks } from './checks.ts';
import { literalTrainerProblems } from './no-literal-trainer.ts';
import {
  type AllowedForGood,
  type AllowedForNow,
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
    const forNow: AllowedForNow = {
      key: 'team.title',
      movesWith: 746,
      reason: 'moves with #746: the Trainers page',
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

    it('lets an entry for now cover exactly its key', () => {
      const messages = { 'team.title': 'Trainers', 'team.other': 'Trainers' };
      expect(problemsFor(messages, messages, [forNow])).toEqual([
        expect.stringContaining('"team.other"'),
      ]);
    });

    it('fails on an entry that no message needs any more, so the ticket takes it off', () => {
      const messages = { 'team.title': 'Instructeurs' };
      expect(problemsFor(messages, messages, [forNow])).toEqual([
        expect.stringContaining('"team.title" no longer says trainer'),
      ]);
    });

    it('fails on an entry without a reason, or twice', () => {
      const messages = { 'team.title': 'Trainers' };
      expect(problemsFor(messages, messages, [{ ...forNow, reason: ' ' }])).toEqual([
        expect.stringContaining('reason'),
      ]);
      expect(problemsFor(messages, messages, [forNow, forNow])).toEqual([
        expect.stringContaining('twice'),
      ]);
    });

    it('fails on an entry for now that does not name a ticket of spec #588', () => {
      const messages = { 'team.title': 'Trainers' };
      const stray = { ...forNow, movesWith: 12 } as unknown as AllowedForNow;
      expect(problemsFor(messages, messages, [stray])).toEqual([expect.stringContaining('#588')]);
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

    it('gives every other entry the ticket of #588 that removes it, and a reason that says so', () => {
      const forNow = trainerAllowlist.filter((entry): entry is AllowedForNow => 'key' in entry);
      expect(forNow.length).toBeGreaterThan(0);
      for (const entry of forNow) {
        expect(entry.reason, entry.key).toContain(`moves with #${entry.movesWith}`);
        expect([746, 747, 748, 749, 750, 751], entry.key).toContain(entry.movesWith);
      }
    });

    it('allows words that are not the role only by exact key, each naming the equipment', () => {
      const notTheRole = trainerAllowlist.filter(
        (entry): entry is AllowedNotTheRole => 'exactKey' in entry,
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
