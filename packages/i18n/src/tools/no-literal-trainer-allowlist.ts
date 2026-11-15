/**
 * The messages that may still say *trainer* literally (F068, spec #588). Every other message
 * names the role with the workspace's word (`{word}`, `{Word}`, … see `trainerWordForms`),
 * and the `no-literal-trainer` check fails on a new literal.
 *
 * Every entry gives its reason, in one of three kinds:
 * - **For good**: a screen with no workspace, which can't know one word (sign-in, *Mijn profiel*,
 *   the apps' no-workspace screen, rows from several workspaces together, Fivvi's own team
 *   emails about a visitor with no workspace), and the public website's copy, which is out of
 *   scope. Covers every key under its prefix.
 * - **For now**: a string that said *trainer* before the word existed. It moves with the #588
 *   ticket that switches its callers, and that ticket takes the entry off (the check fails on
 *   an entry no message needs any more). Covers exactly one key.
 * - **Not the role**: a message whose text contains *trainer* but doesn't mean the role (the
 *   equipment *crosstrainer*, *hometrainer*). Covers exactly one key, never a prefix, and
 *   stays as long as the message says it (the check still fails on an entry no message needs).
 */
export interface AllowedForGood {
  /** Every key that starts with this, e.g. `site.`. */
  prefix: string;
  scope: 'no-workspace' | 'website';
  reason: string;
}

/** The tickets of spec #588 that switch callers to the word, and #751 which removes the old role label. */
export const MOVES_WITH_TICKETS = [746, 747, 748, 749, 750, 751] as const;
export type MovesWithTicket = (typeof MOVES_WITH_TICKETS)[number];

export interface AllowedForNow {
  key: string;
  /** The ticket that switches the callers of this message and takes the entry off. */
  movesWith: MovesWithTicket;
  /** Starts with "moves with #<ticket>". */
  reason: string;
}

export interface AllowedNotTheRole {
  /** Exactly this key; another key with the same text still fails. */
  exactKey: string;
  scope: 'not-the-role';
  /** Says what the word means instead, e.g. "equipment: …". */
  reason: string;
}

export type TrainerAllowlist = readonly (AllowedForGood | AllowedForNow | AllowedNotTheRole)[];

export const trainerAllowlist: TrainerAllowlist = [
  // For good.
  {
    prefix: 'noWorkspace.',
    scope: 'no-workspace',
    reason:
      'The apps’ screen of an account with no workspace has no workspace, so no word to use (spec #588, AC12).',
  },
  {
    prefix: 'site.',
    scope: 'website',
    reason:
      'The public website’s copy is out of scope (spec #588) and talks about trainers in general.',
  },
  {
    prefix: 'email.demoRequest.',
    scope: 'no-workspace',
    reason:
      'The demo request is an email to Fivvi’s own team, sent from the public website about a visitor who has no workspace yet, so there is no word to use.',
  },

  // For now: #746, the trainer web.
  {
    key: 'workspaceNav.trainers',
    movesWith: 746,
    reason: 'moves with #746: the sidebar entry of the trainer web.',
  },
  {
    key: 'team.title',
    movesWith: 746,
    reason: 'moves with #746: the title of the Trainers page.',
  },
  {
    key: 'team.removeDialog.body',
    movesWith: 746,
    reason: 'moves with #746: the remove-from-team dialog of the Trainers page.',
  },
  {
    key: 'team.stepDownDialog.title',
    movesWith: 746,
    reason: 'moves with #746: the step-down dialog of the Trainers page.',
  },
  {
    key: 'team.stepDownDialog.confirm',
    movesWith: 746,
    reason: 'moves with #746: the step-down dialog of the Trainers page.',
  },
  {
    key: 'team.roleChanged.trainer',
    movesWith: 746,
    reason: 'moves with #746: the confirmation after a role change on the Trainers page.',
  },
  {
    key: 'team.badge.trainer',
    movesWith: 746,
    reason: 'moves with #746: the badge on the Trainers page.',
  },
  {
    key: 'dataImport.problems.trainerUnknown',
    movesWith: 751,
    reason:
      'moves with #751: the import’s problem is resolved in packages/domain/src/import/messages.ts and no web, email or app ticket names the import, so the last ticket moves it to the word.',
  },

  // For now: the old role label, which the web (#746), iOS (#748) and Android (#749) leave for
  // `roles.trainerLabel` one by one, and which #751 removes.
  {
    key: 'roles.trainer',
    movesWith: 751,
    reason:
      'moves with #751: the old role label; #746, #748 and #749 move their callers to roles.trainerLabel, #751 removes it.',
  },

  // Not the role: the word is part of the name of a piece of equipment.
  {
    exactKey: 'exercises.names.stationaryBike',
    scope: 'not-the-role',
    reason:
      'Equipment: "hometrainer" is the exercise bike, not a person; the owner approved the name in the starting library (spec #1296, row 119).',
  },
  {
    exactKey: 'exercises.names.elliptical',
    scope: 'not-the-role',
    reason:
      'Equipment: "Crosstrainer" is the elliptical machine, not a person; the owner approved the name in the starting library (spec #1296, row 121).',
  },
];
