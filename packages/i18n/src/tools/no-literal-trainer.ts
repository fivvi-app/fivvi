import { locales } from '../config.ts';
import type { Analysis } from './analyze.ts';
import { catalogFile } from './catalog.ts';
import type { Body, Part } from './icu.ts';
import {
  type AllowedForGood,
  type AllowedForNow,
  type AllowedNotTheRole,
  MOVES_WITH_TICKETS,
  type TrainerAllowlist,
} from './no-literal-trainer-allowlist.ts';

/** The words of the choices live here, so they say *trainer* by definition. */
const WORD_DEFINITIONS = 'trainerWord.';

const LITERAL_TRAINER = /trainer/i;

/**
 * The `no-literal-trainer` check (F068, spec #588, AC6, AC12): a catalog message names the
 * role with the workspace's word, never *trainer* literally, unless it is on the allowlist.
 * Only the text of a message counts; a placeholder called `{trainer}` is a person's name.
 */
export function literalTrainerProblems(
  analysis: Pick<Analysis, 'compiled'>,
  allowlist: TrainerAllowlist,
): string[] {
  const problems: string[] = [];
  const found = new Map<string, string[]>();
  for (const locale of locales) {
    for (const [key, message] of analysis.compiled[locale]) {
      if (key.startsWith(WORD_DEFINITIONS) || !saysTrainer(message.body)) continue;
      found.set(key, [...(found.get(key) ?? []), catalogFile(locale)]);
    }
  }
  const keys = new Set(found.keys());
  for (const [key, files] of found) {
    if (!allowlist.some((entry) => covers(entry, key))) {
      problems.push(
        `${files.join(' and ')}: "${key}" says "trainer" literally; use the workspace's word ({word}, {words}, {Word}, {Words}, {aWord}, {AWord}; see trainerWordForms), or add the key to src/tools/no-literal-trainer-allowlist.ts with a reason`,
      );
    }
  }

  const seen = new Set<string>();
  for (const entry of allowlist) {
    const name = entryName(entry);
    if (seen.has(name)) problems.push(`allowlist entry "${name}" is listed twice`);
    seen.add(name);
    if (entry.reason.trim() === '') problems.push(`allowlist entry "${name}" has no reason`);
    if ('key' in entry && !(MOVES_WITH_TICKETS as readonly number[]).includes(entry.movesWith)) {
      problems.push(
        `allowlist entry "${name}" moves with #${entry.movesWith}, which is not a ticket of spec #588 (${MOVES_WITH_TICKETS.map((n) => `#${n}`).join(', ')})`,
      );
    }
    if (![...keys].some((key) => covers(entry, key))) {
      problems.push(
        `allowlist entry "${name}" no longer says trainer; remove it from src/tools/no-literal-trainer-allowlist.ts`,
      );
    }
  }
  return problems;
}

type Entry = AllowedForGood | AllowedForNow | AllowedNotTheRole;

function entryName(entry: Entry): string {
  if ('prefix' in entry) return entry.prefix;
  return 'exactKey' in entry ? entry.exactKey : entry.key;
}

function covers(entry: Entry, key: string): boolean {
  if ('prefix' in entry) return key.startsWith(entry.prefix);
  return key === entryName(entry);
}

function saysTrainer(body: Body): boolean {
  const lists: Part[][] =
    body.kind === 'simple'
      ? [body.parts]
      : [body.before, ...Object.values(body.branches), body.after];
  return lists.some((parts) =>
    parts.some((part) => part.type === 'text' && LITERAL_TRAINER.test(part.value)),
  );
}
