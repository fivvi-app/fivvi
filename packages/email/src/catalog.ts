import type { EmailMessageKey, EmailTemplate } from './render.tsx';
import { demoRequestEmail } from './templates/demo-request.tsx';
import { emailChangeCodeEmail } from './templates/email-change-code.tsx';
import { helloEmail } from './templates/hello.tsx';
import { privateSessionEmail } from './templates/private-session.tsx';
import { privateSessionMovedEmail } from './templates/private-session-moved.tsx';
import { signInEmail } from './templates/sign-in.tsx';
import { trainerInvitationEmail } from './templates/trainer-invitation.tsx';

/**
 * The email catalog (F049, spec #476): every transactional email Fivvi sends, by ID. It is the
 * single list the docs, the checks and the preview read, and the only way to a template: `templates`
 * below is derived from it, and `catalog.test.ts` fails when a file under `src/templates/` is
 * missing here. See the README for how a feature registers its email.
 */

/** `F031`, `E006`: the feature that builds and sends the email. */
export type OwnerFeature = `${'F' | 'E'}${number}`;

export type EmailAudience =
  | 'client'
  | 'trainer'
  | 'owner'
  | 'invited-trainer'
  /** Anyone signing in (EM-08): there is no workspace. */
  | 'anyone'
  /** The person who changes the address of their account (EM-34): the new address only. */
  | 'account-holder';

/** A template of any props type, as the catalog, the preview and the render tests hold them. */
export type AnyEmailTemplate = EmailTemplate<unknown>;

/** The type erasure in one place: the props type is the template's own business. */
function register<Props>(template: EmailTemplate<Props>): AnyEmailTemplate {
  return template as AnyEmailTemplate;
}

interface EntryBase {
  /** `EM-02`. IDs are never reused; M6, M9 and M11 continue from EM-24. */
  id: `EM-${number}`;
  /** One line for readers of the catalog, when the ID alone is not enough. */
  note?: string;
}

/** The template exists and is sent. */
export interface ActiveEntry extends EntryBase {
  status: 'active';
  audience: EmailAudience;
  /** The features that build and send it, the first one being the one whose code sends it. */
  owner: readonly [OwnerFeature, ...OwnerFeature[]];
  /** Keys in both catalogs, one per subject the template can use. */
  subjectKeys: readonly [EmailMessageKey, ...EmailMessageKey[]];
  template: AnyEmailTemplate;
}

/**
 * Not built yet. The owner feature's ticket that adds the template adds the keys to the catalogs,
 * registers the template here and sets the entry to `active`. `subjectKeys` are the planned keys.
 */
export interface ReservedEntry extends EntryBase {
  status: 'reserved';
  audience: EmailAudience;
  owner: readonly [OwnerFeature, ...OwnerFeature[]];
  subjectKeys: readonly [string, ...string[]];
}

/** No longer sent; the ID stays taken. */
export interface RetiredEntry extends EntryBase {
  status: 'retired';
  /** Why, with the decision: `ADR-026`. */
  reason: string;
}

export type CatalogEntry = ActiveEntry | ReservedEntry | RetiredEntry;

/** An email that goes to no client, trainer or owner, so it has no EM ID. */
export interface InternalEntry {
  /** The template's `id`. */
  key: string;
  status: 'active';
  audience: 'internal';
  owner: readonly [OwnerFeature, ...OwnerFeature[]];
  subjectKeys: readonly [EmailMessageKey, ...EmailMessageKey[]];
  template: AnyEmailTemplate;
  note?: string;
}

/** Every email by ID: EM-01 … EM-23 of the spec's M5 table, then the later ones that exist. */
export const catalog: readonly CatalogEntry[] = [
  {
    id: 'EM-01',
    status: 'retired',
    reason: 'ADR-026',
    note: 'The hold confirmation, replaced by booking at once.',
  },
  {
    id: 'EM-02',
    status: 'reserved',
    audience: 'client',
    owner: ['F031', 'F062', 'F028'],
    subjectKeys: ['email.bookingConfirmed.subject'],
    note: 'A booking is made, also from the waitlist or by the team.',
  },
  {
    id: 'EM-03',
    status: 'reserved',
    audience: 'client',
    owner: ['F031', 'F028'],
    subjectKeys: ['email.bookingCancelled.subject', 'email.bookingCancelledByTeam.subject'],
    note: 'The client cancels; the variant "door {workspace}" when the team removes them.',
  },
  {
    id: 'EM-04',
    status: 'active',
    audience: 'client',
    owner: ['F020', 'F031'],
    subjectKeys: ['email.privateSessionMoved.subject'],
    template: register(privateSessionMovedEmail),
    note: 'A private session moves (F020). F031 adds the class variant.',
  },
  {
    id: 'EM-05',
    status: 'reserved',
    audience: 'client',
    owner: ['F026'],
    subjectKeys: ['email.classCancelled.subject', 'email.privateSessionCancelled.subject'],
    note: 'A class date or a private session is cancelled.',
  },
  {
    id: 'EM-06',
    status: 'reserved',
    audience: 'trainer',
    owner: ['F050'],
    subjectKeys: ['email.trainerBookingNew.subject'],
    note: 'A client books or moves up.',
  },
  {
    id: 'EM-07',
    status: 'reserved',
    audience: 'trainer',
    owner: ['F050'],
    subjectKeys: ['email.trainerBookingCancelled.subject'],
    note: 'A client cancels a booking.',
  },
  {
    id: 'EM-08',
    status: 'active',
    audience: 'anyone',
    owner: ['F001'],
    subjectKeys: ['email.signIn.subject'],
    template: register(signInEmail),
    note: 'The sign-in email: its own minimal layout, no workspace (ADR-019).',
  },
  {
    id: 'EM-09',
    status: 'active',
    audience: 'invited-trainer',
    owner: ['F011'],
    subjectKeys: ['email.trainerInvitation.subject'],
    template: register(trainerInvitationEmail),
  },
  {
    id: 'EM-10',
    status: 'reserved',
    audience: 'trainer',
    owner: ['F024'],
    subjectKeys: ['email.substitution.subject'],
    note: 'The trainer who covers a class.',
  },
  {
    id: 'EM-11',
    status: 'active',
    audience: 'client',
    owner: ['F020'],
    subjectKeys: ['email.privateSession.subject'],
    template: register(privateSessionEmail),
    note: 'A private session is planned.',
  },
  {
    id: 'EM-12',
    status: 'reserved',
    audience: 'client',
    owner: ['F045'],
    subjectKeys: ['email.workoutShared.subject'],
    note: 'A workout is shared (M7).',
  },
  {
    id: 'EM-13',
    status: 'reserved',
    audience: 'client',
    owner: ['F023', 'F024'],
    subjectKeys: [
      'email.trainerChangedPrivateSession.subject',
      'email.trainerChangedClass.subject',
    ],
    note: 'A trainer change or a substitution. F023 uses this ID, not one of its own.',
  },
  {
    id: 'EM-14',
    status: 'reserved',
    audience: 'client',
    owner: ['F032'],
    subjectKeys: ['email.clientInvitation.subject'],
  },
  {
    id: 'EM-15',
    status: 'reserved',
    audience: 'owner',
    owner: ['F029'],
    subjectKeys: ['email.joinRequestReceived.subject'],
  },
  {
    id: 'EM-16',
    status: 'reserved',
    audience: 'client',
    owner: ['F029'],
    subjectKeys: ['email.joinRequestDeclined.subject'],
  },
  {
    id: 'EM-17',
    status: 'reserved',
    audience: 'client',
    owner: ['F029'],
    subjectKeys: ['email.joinRequestApproved.subject'],
  },
  {
    id: 'EM-18',
    status: 'reserved',
    audience: 'client',
    owner: ['F062'],
    subjectKeys: ['email.waitlistJoined.subject'],
  },
  {
    id: 'EM-19',
    status: 'reserved',
    audience: 'client',
    owner: ['F062'],
    subjectKeys: ['email.waitlistNoSpot.subject'],
  },
  {
    id: 'EM-20',
    status: 'reserved',
    audience: 'client',
    owner: ['F062'],
    subjectKeys: ['email.waitlistRemoved.subject'],
    note: 'Taken off the waitlist, with the reason. Stays reserved for M11.',
  },
  {
    id: 'EM-21',
    status: 'reserved',
    audience: 'trainer',
    owner: ['F033'],
    subjectKeys: ['email.cancelRequest.subject'],
  },
  {
    id: 'EM-22',
    status: 'reserved',
    audience: 'client',
    owner: ['F033'],
    subjectKeys: ['email.cancelRequestKept.subject'],
  },
  {
    id: 'EM-23',
    status: 'reserved',
    audience: 'client',
    owner: ['F032'],
    subjectKeys: ['email.clientRemoved.subject'],
  },
  {
    id: 'EM-34',
    status: 'active',
    audience: 'account-holder',
    owner: ['F005', 'F033'],
    subjectKeys: ['email.emailChangeCode.subject'],
    template: register(emailChangeCodeEmail),
    note: 'The code that confirms a new address, sent to that address only.',
  },
];

/** Emails with no EM ID: they go to Fivvi itself or to a developer, never to a client, trainer or owner. */
export const internalCatalog: readonly InternalEntry[] = [
  {
    key: 'demo-request',
    status: 'active',
    audience: 'internal',
    owner: ['F064'],
    subjectKeys: ['email.demoRequest.subject'],
    template: register(demoRequestEmail),
    note: "The website demo request, to Fivvi's own support address.",
  },
  {
    key: 'hello',
    status: 'active',
    audience: 'internal',
    owner: ['E006'],
    subjectKeys: ['email.hello.subject'],
    template: register(helloEmail),
    note: 'The developer sample behind `pnpm email:send-test`.',
  },
];

/** Every template, for the preview script and the render tests: found through the catalog only. */
export const templates: readonly AnyEmailTemplate[] = [
  ...catalog.flatMap((entry) => (entry.status === 'active' ? [entry.template] : [])),
  ...internalCatalog.map((entry) => entry.template),
];

/**
 * The catalog ID a template is sent under: `EM-11` for a catalog email, the entry's `key` for an
 * internal one (`demo-request`). `undefined` for a template that is not in the catalog.
 */
export function catalogIdOf(templateId: string): string | undefined {
  for (const entry of catalog) {
    if (entry.status === 'active' && entry.template.id === templateId) return entry.id;
  }
  return internalCatalog.find((entry) => entry.template.id === templateId)?.key;
}

export interface CatalogCheckInput {
  catalog: readonly CatalogEntry[];
  internalCatalog: readonly InternalEntry[];
  /** The templates found as files under `src/templates/`. */
  templatesOnDisk: readonly AnyEmailTemplate[];
}

/**
 * What is wrong with the catalog, one sentence per problem; empty when it is sound. A template on
 * disk that is not in the catalog, an `active` entry without a template, a `reserved` or `retired`
 * entry that has one, two entries with the same ID and one template under two entries all count.
 */
export function checkCatalog({
  catalog: entries,
  internalCatalog: internal,
  templatesOnDisk,
}: CatalogCheckInput): string[] {
  const problems: string[] = [];

  const seenIds = new Set<string>();
  for (const entry of entries) {
    if (seenIds.has(entry.id)) problems.push(`${entry.id} is in the catalog twice`);
    seenIds.add(entry.id);
  }
  const seenKeys = new Set<string>();
  for (const entry of internal) {
    if (seenKeys.has(entry.key))
      problems.push(`internal entry ${entry.key} is in the catalog twice`);
    seenKeys.add(entry.key);
  }

  const registered: AnyEmailTemplate[] = [];
  for (const entry of entries) {
    const template = (entry as { template?: AnyEmailTemplate }).template;
    if (entry.status === 'active') {
      if (!template) problems.push(`${entry.id} is active but has no template`);
    } else if (template) {
      problems.push(`${entry.id} is ${entry.status} but has a template: set it to active`);
    }
    if (template) registered.push(template);
  }
  for (const entry of internal) {
    if (!entry.template) problems.push(`internal entry ${entry.key} has no template`);
    else registered.push(entry.template);
  }

  const seenTemplates = new Set<AnyEmailTemplate>();
  for (const template of registered) {
    if (seenTemplates.has(template)) {
      problems.push(`template ${template.id} is registered under two entries`);
    }
    seenTemplates.add(template);
  }
  for (const template of templatesOnDisk) {
    if (!seenTemplates.has(template)) {
      problems.push(`template ${template.id} exists but is not in the catalog`);
    }
  }
  return problems;
}
