import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { bookingLinks, groupClasses, sessions } from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';

// The booking links of a workspace (F037, spec #473), through a workspace scope: the short links
// `/l/{code}` that open the client timetable on a scope. The rules (who may make which link, the
// format of a code and URL, where a link leads, the order of the list) are in `packages/domain`;
// these functions store and read what the rules decided. A link's scope, target and language are
// written once and never changed: the only update here is the deactivation. The code is made by the
// database (`new_booking_link_code()`), never by the caller, and is never logged.

export type BookingLinkScopeName = (typeof bookingLinks.scope.enumValues)[number];
export type BookingLinkLanguageName = (typeof bookingLinks.language.enumValues)[number];

/** A class by name: Dutch always, English when the Owner wrote one. */
export interface BookingLinkClassView {
  readonly id: string;
  readonly nameNl: string;
  readonly nameEn: string | null;
}

/** A booking link as the team sees it, with the labels of its target. */
export interface BookingLinkView {
  readonly id: string;
  readonly code: string;
  readonly scope: BookingLinkScopeName;
  readonly language: BookingLinkLanguageName;
  readonly createdAt: Date;
  /** `null` while the link is active. */
  readonly deactivatedAt: Date | null;
  /** The class of a `class` link; `null` for the other scopes. */
  readonly groupClass: BookingLinkClassView | null;
  /** The class date of a `session` link, with its class; `null` for the other scopes. */
  readonly session: {
    readonly id: string;
    /** A UTC instant. */
    readonly startsAt: Date;
    readonly groupClass: BookingLinkClassView;
  } | null;
}

/** What a link is made of: the scope, the one target it names (or none) and the language. */
export interface NewBookingLink {
  readonly scope: BookingLinkScopeName;
  readonly language: BookingLinkLanguageName;
  /** Set for a `class` link, `null` otherwise. */
  readonly groupClassId: string | null;
  /** Set for a `session` link, `null` otherwise. */
  readonly sessionId: string | null;
  /** The team-member record of the person who makes it; `null` for the standing links. */
  readonly createdByTeamMemberId: string | null;
}

const sessionClass = alias(groupClasses, 'session_class');

function viewsQuery(scope: WorkspaceScope) {
  return executorOf(scope)
    .select({
      id: bookingLinks.id,
      code: bookingLinks.code,
      scope: bookingLinks.scope,
      language: bookingLinks.language,
      createdAt: bookingLinks.createdAt,
      deactivatedAt: bookingLinks.deactivatedAt,
      classId: groupClasses.id,
      classNameNl: groupClasses.nameNl,
      classNameEn: groupClasses.nameEn,
      sessionId: sessions.id,
      sessionStartsAt: sessions.startsAt,
      sessionClassId: sessionClass.id,
      sessionClassNameNl: sessionClass.nameNl,
      sessionClassNameEn: sessionClass.nameEn,
    })
    .from(bookingLinks)
    .leftJoin(
      groupClasses,
      and(
        eq(groupClasses.organizationId, bookingLinks.organizationId),
        eq(groupClasses.id, bookingLinks.groupClassId),
      ),
    )
    .leftJoin(
      sessions,
      and(
        eq(sessions.organizationId, bookingLinks.organizationId),
        eq(sessions.id, bookingLinks.sessionId),
      ),
    )
    .leftJoin(
      sessionClass,
      and(
        eq(sessionClass.organizationId, sessions.organizationId),
        eq(sessionClass.id, sessions.groupClassId),
      ),
    );
}

type Row = Awaited<ReturnType<typeof viewsQuery>>[number];

function viewOf(row: Row): BookingLinkView {
  return {
    id: row.id,
    code: row.code,
    scope: row.scope,
    language: row.language,
    createdAt: row.createdAt,
    deactivatedAt: row.deactivatedAt,
    groupClass:
      row.classId === null || row.classNameNl === null
        ? null
        : { id: row.classId, nameNl: row.classNameNl, nameEn: row.classNameEn },
    session:
      row.sessionId === null ||
      row.sessionStartsAt === null ||
      row.sessionClassId === null ||
      row.sessionClassNameNl === null
        ? null
        : {
            id: row.sessionId,
            startsAt: row.sessionStartsAt,
            groupClass: {
              id: row.sessionClassId,
              nameNl: row.sessionClassNameNl,
              nameEn: row.sessionClassNameEn,
            },
          },
  };
}

/** Every link of the scope's workspace, active and deactivated, in no particular order (the domain sorts them). */
export async function listBookingLinks(scope: WorkspaceScope): Promise<BookingLinkView[]> {
  const rows = await viewsQuery(scope).where(eq(bookingLinks.organizationId, scope.workspaceId));
  return rows.map(viewOf);
}

/** One link of the scope's workspace; `undefined` when the workspace has no such link. */
export async function findBookingLink(
  scope: WorkspaceScope,
  linkId: string,
): Promise<BookingLinkView | undefined> {
  const [row] = await viewsQuery(scope)
    .where(and(eq(bookingLinks.organizationId, scope.workspaceId), eq(bookingLinks.id, linkId)))
    .limit(1);
  return row ? viewOf(row) : undefined;
}

/** The facts of a class date that decide whether it may have a link: kind, status and start. */
export interface BookingLinkSessionFacts {
  readonly type: (typeof sessions.type.enumValues)[number];
  readonly startsAt: Date;
}

/** The kind and start of a session of the scope's workspace; `undefined` when it has no such session. */
export async function findBookingLinkSession(
  scope: WorkspaceScope,
  sessionId: string,
): Promise<BookingLinkSessionFacts | undefined> {
  const [row] = await executorOf(scope)
    .select({ type: sessions.type, startsAt: sessions.startsAt })
    .from(sessions)
    .where(and(eq(sessions.organizationId, scope.workspaceId), eq(sessions.id, sessionId)))
    .limit(1);
  return row;
}

/** The condition "this workspace's active link for this scope, target and language". */
function activeLinkOf(scope: WorkspaceScope, link: NewBookingLink): SQL | undefined {
  return and(
    eq(bookingLinks.organizationId, scope.workspaceId),
    eq(bookingLinks.scope, link.scope),
    eq(bookingLinks.language, link.language),
    link.groupClassId === null
      ? isNull(bookingLinks.groupClassId)
      : eq(bookingLinks.groupClassId, link.groupClassId),
    link.sessionId === null
      ? isNull(bookingLinks.sessionId)
      : eq(bookingLinks.sessionId, link.sessionId),
    isNull(bookingLinks.deactivatedAt),
  );
}

/** How often a code that is already taken (a 1-in-10^12 event) is drawn again before the request fails. */
const CODE_ATTEMPTS = 5;

/**
 * The active link of the scope's workspace for this scope, target and language, made if there is
 * none (get-or-create). Two requests at the same time make one link: the partial unique index lets
 * the second `INSERT … ON CONFLICT DO NOTHING` wait for the first and then do nothing. A code that
 * collides with another workspace's (invisible here) does nothing either, and is drawn again.
 * The caller has decided the account may and that the target is the workspace's.
 */
export async function getOrCreateBookingLink(
  scope: WorkspaceScope,
  link: NewBookingLink,
): Promise<{ link: BookingLinkView; created: boolean }> {
  const db = executorOf(scope);
  const present = async () => {
    const [existing] = await db
      .select({ id: bookingLinks.id })
      .from(bookingLinks)
      .where(activeLinkOf(scope, link));
    return existing;
  };
  const stored = async (id: string, created: boolean) => {
    const view = await findBookingLink(scope, id);
    if (!view) throw new Error('The booking link was not found after it was stored.');
    return { link: view, created };
  };
  const already = await present();
  if (already) return stored(already.id, false);
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const [inserted] = await db
      .insert(bookingLinks)
      .values({
        organizationId: scope.workspaceId,
        scope: link.scope,
        language: link.language,
        groupClassId: link.groupClassId,
        sessionId: link.sessionId,
        createdByTeamMemberId: link.createdByTeamMemberId,
      })
      .onConflictDoNothing()
      .returning({ id: bookingLinks.id });
    if (inserted) return stored(inserted.id, true);
    // Nothing was inserted: the same link was made meanwhile (read it), or the code was taken.
    const meanwhile = await present();
    if (meanwhile) return stored(meanwhile.id, false);
  }
  throw new Error('No free booking link code was drawn.');
}

/**
 * Makes the standing links the workspace lacks: for each scope and language of `standing` an active
 * link, if there is none. Idempotent, also for two calls at the same time. Made by the system
 * (`created_by` empty). A standing link that was deactivated is made anew, with a new code.
 */
export async function ensureStandingBookingLinks(
  scope: WorkspaceScope,
  standing: readonly Pick<NewBookingLink, 'scope' | 'language'>[],
): Promise<void> {
  for (const { scope: linkScope, language } of standing) {
    await getOrCreateBookingLink(scope, {
      scope: linkScope,
      language,
      groupClassId: null,
      sessionId: null,
      createdByTeamMemberId: null,
    });
  }
}

/**
 * Stops a link of the scope's workspace at `at`, for good, and returns it; `undefined` when the
 * workspace has no such link. A link that is already deactivated keeps its first time: doing it
 * again changes nothing.
 */
export async function deactivateBookingLink(
  scope: WorkspaceScope,
  linkId: string,
  at: Date,
): Promise<BookingLinkView | undefined> {
  await executorOf(scope)
    .update(bookingLinks)
    .set({ deactivatedAt: at })
    .where(
      and(
        eq(bookingLinks.organizationId, scope.workspaceId),
        eq(bookingLinks.id, linkId),
        isNull(bookingLinks.deactivatedAt),
      ),
    );
  return findBookingLink(scope, linkId);
}
