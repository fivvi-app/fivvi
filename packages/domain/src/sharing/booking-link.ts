import { hasCapability, type Role } from '../permissions/matrix.ts';

// Booking links (F037, spec #473): the short links `{app address}/l/{code}` that open the client
// timetable on a scope (all bookings, group classes, one class, one class on a date) in a page
// language. This is the rules of them: the format of a code, the URL, which request names what,
// who may make which link, where a link lands and in what order a workspace lists them. Pure; the
// code itself is made in the database (`new_booking_link_code()`, from Postgres's CSPRNG, as the
// join code is) and the routes' access comes from the permission matrix. Open Gym is out until
// F034 to F036 (`PRODUCT.md §53`).

/**
 * Crockford's base32 in lower case: digits and letters without i, l, o and u, so a code read aloud
 * or typed from a poster is not mistaken.
 */
export const BOOKING_LINK_CODE_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** The length of a code, in characters of `BOOKING_LINK_CODE_ALPHABET`. */
export const BOOKING_LINK_CODE_LENGTH = 8;

/** What a link opens: everything, the group classes, one class, one class on a date. */
export const BOOKING_LINK_SCOPES = ['all', 'group', 'class', 'session'] as const;
export type BookingLinkScope = (typeof BOOKING_LINK_SCOPES)[number];

/** The page language of a link: the visitor's own, or always Dutch or English (ADR-017). */
export const BOOKING_LINK_LANGUAGES = ['visitor', 'nl', 'en'] as const;
export type BookingLinkLanguage = (typeof BOOKING_LINK_LANGUAGES)[number];

/** The links every workspace has: *Alle boekingen* and *Groepslessen*, in the visitor's language. */
export const STANDING_BOOKING_LINKS: readonly {
  readonly scope: BookingLinkScope;
  readonly language: BookingLinkLanguage;
}[] = [
  { scope: 'all', language: 'visitor' },
  { scope: 'group', language: 'visitor' },
];

/** The full short URL of a code, on the address the app is served at. */
export function bookingLinkUrl(appBaseUrl: string, code: string): string {
  return `${appBaseUrl.replace(/\/+$/, '')}/l/${code}`;
}

export interface BookingLinkRequest {
  readonly scope: BookingLinkScope;
  readonly language: BookingLinkLanguage;
  readonly groupClassId?: string | undefined;
  readonly sessionId?: string | undefined;
}

export type BookingLinkRequestCheck =
  | {
      readonly outcome: 'ok';
      readonly target: { readonly groupClassId: string | null; readonly sessionId: string | null };
    }
  | {
      readonly outcome: 'refused';
      readonly issues: readonly {
        readonly path: 'groupClassId' | 'sessionId';
        readonly code: 'required' | 'not_allowed';
      }[];
    };

/** A class link names its class, a date link its date, the others no target; nothing else is accepted. */
export function checkBookingLinkRequest(request: BookingLinkRequest): BookingLinkRequestCheck {
  const wantsClass = request.scope === 'class';
  const wantsSession = request.scope === 'session';
  const issues: { path: 'groupClassId' | 'sessionId'; code: 'required' | 'not_allowed' }[] = [];
  if (wantsClass && !request.groupClassId) issues.push({ path: 'groupClassId', code: 'required' });
  if (!wantsClass && request.groupClassId)
    issues.push({ path: 'groupClassId', code: 'not_allowed' });
  if (wantsSession && !request.sessionId) issues.push({ path: 'sessionId', code: 'required' });
  if (!wantsSession && request.sessionId) issues.push({ path: 'sessionId', code: 'not_allowed' });
  if (issues.length > 0) return { outcome: 'refused', issues };
  return {
    outcome: 'ok',
    target: {
      groupClassId: wantsClass ? (request.groupClassId ?? null) : null,
      sessionId: wantsSession ? (request.sessionId ?? null) : null,
    },
  };
}

/**
 * Whether a team role may make this link (`booking_link.manage`, `booking_link.copy`, F004): the
 * Owner makes any; a Trainer only copies, which makes (get-or-create) the link of a class date in
 * the visitor's language. A role with neither is refused.
 */
export function decideBookingLinkCreate(
  role: Role,
  request: Pick<BookingLinkRequest, 'scope' | 'language'>,
): 'allowed' | 'forbidden' {
  if (hasCapability(role, 'booking_link.manage')) return 'allowed';
  if (
    hasCapability(role, 'booking_link.copy') &&
    request.scope === 'session' &&
    request.language === 'visitor'
  ) {
    return 'allowed';
  }
  return 'forbidden';
}

/**
 * Whether a session may have a link of its own: only a class date (`group`), never a private
 * session (`PRODUCT.md §15`, §17) or an Open Gym slot (out until F034 to F036), and not one that
 * has started or passed.
 */
export function decideBookingLinkSession(
  session: { readonly type: 'private' | 'group' | 'open_gym'; readonly startsAt: Date },
  now: Date,
): 'ok' | 'not-a-class-date' | 'passed' {
  if (session.type !== 'group') return 'not-a-class-date';
  return session.startsAt.getTime() > now.getTime() ? 'ok' : 'passed';
}

/** A link as stored, what resolving needs. A link's scope, target and language are fixed for good (QE07). */
export interface BookingLink {
  readonly code: string;
  readonly scope: BookingLinkScope;
  readonly groupClassId: string | null;
  readonly sessionId: string | null;
  readonly language: BookingLinkLanguage;
  readonly deactivatedAt: Date | null;
}

export type BookingLinkResolution =
  /** No such code: says nothing about any workspace. */
  | { readonly outcome: 'unknown' }
  /** The link was deactivated: the workspace is named so the page can offer its timetable. */
  | { readonly outcome: 'inactive'; readonly workspaceSlug: string }
  | {
      readonly outcome: 'active';
      readonly workspaceSlug: string;
      /** The timetable path the link lands on (F027's scopes). */
      readonly path: string;
      readonly language: BookingLinkLanguage;
    };

/**
 * Where a link leads. It reads the link and nothing of its target: a class date that is cancelled
 * later still resolves to the same path, and the timetable says it does not take place. It never
 * decides access; the timetable's own gate does (F027).
 */
export function resolveBookingLink(
  found: { readonly link: BookingLink; readonly workspaceSlug: string } | undefined,
): BookingLinkResolution {
  if (!found) return { outcome: 'unknown' };
  const { link, workspaceSlug } = found;
  if (link.deactivatedAt !== null) return { outcome: 'inactive', workspaceSlug };
  const book = `/book/${workspaceSlug}`;
  const path = {
    all: book,
    group: `${book}/classes`,
    class: `${book}/classes/${link.groupClassId}`,
    session: `${book}/s/${link.sessionId}`,
  }[link.scope];
  return { outcome: 'active', workspaceSlug, path, language: link.language };
}

interface Sortable {
  readonly scope: BookingLinkScope;
  readonly language: BookingLinkLanguage;
  readonly deactivatedAt: Date | null;
  readonly createdAt: Date;
  readonly code: string;
}

const STANDING_ORDER: readonly string[] = STANDING_BOOKING_LINKS.map(
  ({ scope, language }) => `${scope}/${language}`,
);

/**
 * The order of a workspace's list: active links first, the standing links ahead of the others (all
 * bookings, then group classes), the rest by the time they were made, then the deactivated ones.
 */
export function sortBookingLinks<T extends Sortable>(links: readonly T[]): T[] {
  const rank = (link: T) => {
    const standing = STANDING_ORDER.indexOf(`${link.scope}/${link.language}`);
    if (link.deactivatedAt !== null) return STANDING_ORDER.length + 1;
    return standing === -1 ? STANDING_ORDER.length : standing;
  };
  return [...links].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.code.localeCompare(b.code),
  );
}
