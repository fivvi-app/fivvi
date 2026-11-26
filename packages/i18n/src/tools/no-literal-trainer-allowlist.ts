/**
 * The messages that may still say *trainer* literally (F068, spec #588). Every other message
 * names the role with the workspace's word (`{word}`, `{Word}`, … see `trainerWordForms`),
 * and the `no-literal-trainer` check fails on a new literal. No entry is temporary: the
 * rollout is over, and the check alone keeps a new string from saying *trainer*.
 *
 * Every entry gives its reason, in one of three kinds:
 * - **For good, a prefix**: a screen with no workspace, which can't know one word (sign-in,
 *   the apps' no-workspace screen, Fivvi's own team emails about a visitor with no workspace),
 *   and the public website's copy, which is out of scope. Covers every key under its prefix.
 * - **For good, one key**: a message on a screen with no workspace that sits in a namespace
 *   other screens share (*Mijn profiel* lists the workspaces of one person, each with a
 *   role). Covers exactly one key.
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

export interface AllowedForGoodKey {
  /** Exactly this key; another key with the same text still fails. */
  exactKey: string;
  scope: 'no-workspace';
  reason: string;
}

export interface AllowedNotTheRole {
  /** Exactly this key; another key with the same text still fails. */
  exactKey: string;
  scope: 'not-the-role';
  /** Says what the word means instead, e.g. "equipment: …". */
  reason: string;
}

export type TrainerAllowlist = readonly (AllowedForGood | AllowedForGoodKey | AllowedNotTheRole)[];

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
  {
    exactKey: 'myProfile.trainerRole',
    scope: 'no-workspace',
    reason:
      'The role label of a Trainer in the web Mijn profiel, which lists the workspaces of one person, each with the role there, so it has no one workspace and no one word (spec #588, AC12).',
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
