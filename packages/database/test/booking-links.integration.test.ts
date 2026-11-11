import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bookingLinks,
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type DatabaseExecutor,
  deactivateBookingLink,
  ensureStandingBookingLinks,
  findBookingLink,
  findBookingLinkSession,
  getOrCreateBookingLink,
  listBookingLinks,
  teamMembers,
  type WorkspaceScope,
} from '../src/index.ts';
import {
  addBookingLink,
  addGroupClass,
  addSession,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '../src/testing/index.ts';

// The booking links of a workspace (F037, spec #473): what the table holds the line on, and what the
// repository stores and reads as the app role. Row-level security is covered by the RLS suite,
// which has a factory for `booking_links` (`rls.integration.test.ts`).

const STANDING = [
  { scope: 'all', language: 'visitor' },
  { scope: 'group', language: 'visitor' },
] as const;
const CODE = /^[0-9a-hjkmnp-tv-z]{8}$/;

describe('F037 booking links', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 6 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  async function asTeam<T>(
    accountId: string,
    workspaceId: string,
    run: (scope: WorkspaceScope) => Promise<T>,
  ): Promise<T> {
    const entry = await createTenantScopes(() => app.db).inWorkspaceScope(
      { accountId, workspaceId, admit: () => 'team' },
      run,
    );
    if (entry.status !== 'entered') throw new Error(`Not entered: ${entry.status}`);
    return entry.value;
  }

  async function violated(insert: (db: DatabaseExecutor) => Promise<unknown>) {
    try {
      await admin.db.transaction(async (tx) => {
        await insert(tx);
        throw new Error('rollback');
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: string; constraint?: string } }).cause;
      if (cause?.code) return cause.constraint ?? cause.code;
      if ((error as Error).message !== 'rollback') throw error;
    }
    return undefined;
  }

  async function gym() {
    const workspace = await createWorkspace(admin.db);
    const john = await createAccount(admin.db, { label: 'john' });
    const johnRole = await addTeamRole(admin.db, {
      workspaceId: workspace.id,
      accountId: john.id,
      role: 'owner',
    });
    return { workspace, john, johnRole };
  }

  describe('the table', () => {
    it('makes a code of 8 characters of the unambiguous alphabet, different every time', async () => {
      const { workspace } = await gym();
      const codes: string[] = [];
      for (let index = 0; index < 20; index += 1) {
        const link = await addBookingLink(admin.db, {
          workspaceId: workspace.id,
          scope: 'all',
          language: 'en',
          deactivatedAt: new Date(),
        });
        codes.push(link.code);
      }
      for (const code of codes) expect(code).toMatch(CODE);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('a code is unique across workspaces and has the format', async () => {
      const { workspace } = await gym();
      const other = await gym();
      const first = await addBookingLink(admin.db, { workspaceId: workspace.id });
      expect(
        await violated((tx) =>
          addBookingLink(tx, { workspaceId: other.workspace.id, code: first.code }),
        ),
      ).toBe('booking_links_code_unique');
      for (const code of ['ABCDEFGH', 'abcdefg', 'abcdefghj', 'abcdefgi', 'abcdefgl', 'abcdefgo']) {
        expect(
          await violated((tx) => addBookingLink(tx, { workspaceId: workspace.id, code })),
        ).toBe('booking_links_code_format');
      }
    });

    it('a link names the target of its scope and nothing else', async () => {
      const { workspace } = await gym();
      const kracht = await addGroupClass(admin.db, { workspaceId: workspace.id });
      const date = await addSession(admin.db, {
        workspaceId: workspace.id,
        type: 'group',
        participant: false,
      });
      const insert = (values: Partial<typeof bookingLinks.$inferInsert>) =>
        violated((tx) =>
          tx.insert(bookingLinks).values({
            organizationId: workspace.id,
            scope: 'all',
            language: 'visitor',
            ...values,
          }),
        );
      expect(await insert({ scope: 'class' })).toBe('booking_links_target_matches_scope');
      expect(await insert({ scope: 'session' })).toBe('booking_links_target_matches_scope');
      expect(await insert({ scope: 'all', groupClassId: kracht.id })).toBe(
        'booking_links_target_matches_scope',
      );
      expect(await insert({ scope: 'group', sessionId: date.id })).toBe(
        'booking_links_target_matches_scope',
      );
      expect(await insert({ scope: 'class', groupClassId: kracht.id, sessionId: date.id })).toBe(
        'booking_links_target_matches_scope',
      );
      expect(await insert({ scope: 'class', groupClassId: kracht.id })).toBeUndefined();
      expect(await insert({ scope: 'session', sessionId: date.id })).toBeUndefined();
    });

    it('the class, the date and the maker are of the link’s own workspace', async () => {
      const { workspace } = await gym();
      const other = await gym();
      const theirClass = await addGroupClass(admin.db, { workspaceId: other.workspace.id });
      const theirDate = await addSession(admin.db, {
        workspaceId: other.workspace.id,
        type: 'group',
        participant: false,
      });
      expect(
        await violated((tx) =>
          addBookingLink(tx, {
            workspaceId: workspace.id,
            scope: 'class',
            groupClassId: theirClass.id,
          }),
        ),
      ).toBe('booking_links_group_class_fk');
      expect(
        await violated((tx) =>
          addBookingLink(tx, {
            workspaceId: workspace.id,
            scope: 'session',
            sessionId: theirDate.id,
          }),
        ),
      ).toBe('booking_links_session_fk');
      expect(
        await violated((tx) =>
          addBookingLink(tx, {
            workspaceId: workspace.id,
            createdByTeamMemberId: other.johnRole.id,
          }),
        ),
      ).toBe('booking_links_created_by_fk');
    });

    it('allows one active link per workspace, scope, target and language, and a new one once it is deactivated', async () => {
      const { workspace } = await gym();
      const kracht = await addGroupClass(admin.db, { workspaceId: workspace.id });
      const link = (values: Parameters<typeof addBookingLink>[1]) =>
        violated((tx) => addBookingLink(tx, values));

      // Without a target (the NULLs count as the same target)...
      await addBookingLink(admin.db, { workspaceId: workspace.id, scope: 'all', language: 'en' });
      expect(await link({ workspaceId: workspace.id, scope: 'all', language: 'en' })).toBe(
        'booking_links_active_unique',
      );
      expect(
        await link({ workspaceId: workspace.id, scope: 'all', language: 'nl' }),
      ).toBeUndefined();
      expect(
        await link({ workspaceId: workspace.id, scope: 'group', language: 'en' }),
      ).toBeUndefined();
      // ...and with one.
      await addBookingLink(admin.db, {
        workspaceId: workspace.id,
        scope: 'class',
        groupClassId: kracht.id,
        language: 'en',
      });
      expect(
        await link({
          workspaceId: workspace.id,
          scope: 'class',
          groupClassId: kracht.id,
          language: 'en',
        }),
      ).toBe('booking_links_active_unique');
      expect(
        await link({
          workspaceId: workspace.id,
          scope: 'class',
          groupClassId: kracht.id,
          language: 'visitor',
        }),
      ).toBeUndefined();
      // Another workspace has its own.
      const other = await gym();
      expect(
        await link({ workspaceId: other.workspace.id, scope: 'all', language: 'en' }),
      ).toBeUndefined();
      // A deactivated link does not count.
      await addBookingLink(admin.db, {
        workspaceId: workspace.id,
        scope: 'group',
        language: 'visitor',
        deactivatedAt: new Date(),
      });
      expect(
        await link({ workspaceId: workspace.id, scope: 'group', language: 'visitor' }),
      ).toBeUndefined();
    });

    it('keeps the link when the team member who made it is removed, and clears only the maker', async () => {
      const { workspace, johnRole } = await gym();
      const sarahAccount = await createAccount(admin.db, { label: 'sarah' });
      const sarah = await addTeamRole(admin.db, {
        workspaceId: workspace.id,
        accountId: sarahAccount.id,
      });
      const link = await addBookingLink(admin.db, {
        workspaceId: workspace.id,
        createdByTeamMemberId: sarah.id,
      });
      expect(johnRole.id).not.toBe(sarah.id);
      await admin.db.delete(teamMembers).where(eq(teamMembers.id, sarah.id));
      const [stored] = await admin.db
        .select()
        .from(bookingLinks)
        .where(eq(bookingLinks.id, link.id));
      expect(stored).toMatchObject({ organizationId: workspace.id, createdByTeamMemberId: null });
    });
  });

  describe('the repository, as the app role', () => {
    it('AC1: makes the standing links once, also for two calls at the same time', async () => {
      const { workspace, john } = await gym();
      await Promise.all([
        asTeam(john.id, workspace.id, (scope) => ensureStandingBookingLinks(scope, STANDING)),
        asTeam(john.id, workspace.id, (scope) => ensureStandingBookingLinks(scope, STANDING)),
      ]);
      await asTeam(john.id, workspace.id, (scope) => ensureStandingBookingLinks(scope, STANDING));

      const links = await asTeam(john.id, workspace.id, (scope) => listBookingLinks(scope));
      expect(links.map(({ scope, language }) => `${scope}/${language}`).sort()).toEqual([
        'all/visitor',
        'group/visitor',
      ]);
      for (const link of links) {
        expect(link.code).toMatch(CODE);
        expect(link.deactivatedAt).toBeNull();
      }
      const [stored] = await admin.db
        .select({ createdBy: bookingLinks.createdByTeamMemberId })
        .from(bookingLinks)
        .where(eq(bookingLinks.organizationId, workspace.id));
      expect(stored?.createdBy).toBeNull();
    });

    it('AC2: get-or-create returns the active link of the same scope, target and language', async () => {
      const { workspace, john, johnRole } = await gym();
      const kracht = await addGroupClass(admin.db, {
        workspaceId: workspace.id,
        nameNl: 'Kracht',
        nameEn: 'Strength',
      });
      const startsAt = new Date('2026-11-17T17:00:00Z');
      const date = await addSession(admin.db, {
        workspaceId: workspace.id,
        type: 'group',
        groupClassId: kracht.id,
        participant: false,
        startsAt,
      });
      const make = (link: Partial<Parameters<typeof getOrCreateBookingLink>[1]>) =>
        asTeam(john.id, workspace.id, (scope) =>
          getOrCreateBookingLink(scope, {
            scope: 'class',
            language: 'en',
            groupClassId: kracht.id,
            sessionId: null,
            createdByTeamMemberId: johnRole.id,
            ...link,
          }),
        );

      const first = await make({});
      expect(first.created).toBe(true);
      expect(first.link).toMatchObject({
        scope: 'class',
        language: 'en',
        groupClass: { id: kracht.id, nameNl: 'Kracht', nameEn: 'Strength' },
        session: null,
        deactivatedAt: null,
      });
      expect(first.link.code).toMatch(CODE);
      const again = await make({});
      expect(again).toEqual({ link: first.link, created: false });
      // Another language is another link.
      expect((await make({ language: 'visitor' })).link.id).not.toBe(first.link.id);

      const dateLink = await make({
        scope: 'session',
        language: 'visitor',
        groupClassId: null,
        sessionId: date.id,
      });
      expect(dateLink.created).toBe(true);
      expect(dateLink.link.session).toEqual({
        id: date.id,
        startsAt,
        groupClass: { id: kracht.id, nameNl: 'Kracht', nameEn: 'Strength' },
      });
      expect(
        (
          await make({
            scope: 'session',
            language: 'visitor',
            groupClassId: null,
            sessionId: date.id,
          })
        ).created,
      ).toBe(false);

      const [stored] = await admin.db
        .select({ createdBy: bookingLinks.createdByTeamMemberId })
        .from(bookingLinks)
        .where(eq(bookingLinks.id, first.link.id));
      expect(stored?.createdBy).toBe(johnRole.id);
    });

    it('two get-or-creates at the same time make one link', async () => {
      const { workspace, john, johnRole } = await gym();
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          asTeam(john.id, workspace.id, (scope) =>
            getOrCreateBookingLink(scope, {
              scope: 'all',
              language: 'nl',
              groupClassId: null,
              sessionId: null,
              createdByTeamMemberId: johnRole.id,
            }),
          ),
        ),
      );
      expect(new Set(results.map(({ link }) => link.id)).size).toBe(1);
      expect(results.filter(({ created }) => created)).toHaveLength(1);
    });

    it('AC7: deactivating sets the time once, and a new link for the scope gets a new code', async () => {
      const { workspace, john } = await gym();
      const kracht = await addGroupClass(admin.db, { workspaceId: workspace.id });
      const request = {
        scope: 'class',
        language: 'en',
        groupClassId: kracht.id,
        sessionId: null,
        createdByTeamMemberId: null,
      } as const;
      const { link } = await asTeam(john.id, workspace.id, (scope) =>
        getOrCreateBookingLink(scope, request),
      );

      const at = new Date('2026-11-12T09:00:00Z');
      const stopped = await asTeam(john.id, workspace.id, (scope) =>
        deactivateBookingLink(scope, link.id, at),
      );
      expect(stopped?.changed).toBe(true);
      expect(stopped?.link.deactivatedAt).toEqual(at);
      const again = await asTeam(john.id, workspace.id, (scope) =>
        deactivateBookingLink(scope, link.id, new Date('2026-11-13T09:00:00Z')),
      );
      expect(again?.changed).toBe(false);
      expect(again?.link.deactivatedAt).toEqual(at);

      const next = await asTeam(john.id, workspace.id, (scope) =>
        getOrCreateBookingLink(scope, request),
      );
      expect(next.created).toBe(true);
      expect(next.link.code).not.toBe(link.code);
      // Both are listed: the old one stays, deactivated.
      const all = await asTeam(john.id, workspace.id, (scope) => listBookingLinks(scope));
      expect(all.map(({ id }) => id).sort()).toEqual([link.id, next.link.id].sort());
    });

    it('of deactivations at the same time exactly one changes the link', async () => {
      const { workspace, john } = await gym();
      const link = await addBookingLink(admin.db, { workspaceId: workspace.id, scope: 'class' });
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          asTeam(john.id, workspace.id, (scope) =>
            deactivateBookingLink(scope, link.id, new Date('2026-11-12T09:00:00Z')),
          ),
        ),
      );
      expect(results.filter((result) => result?.changed)).toHaveLength(1);
      expect(results.every((result) => result?.link.deactivatedAt !== null)).toBe(true);
    });

    it('a link of another workspace is out of reach: nothing found, nothing deactivated', async () => {
      const { workspace, john } = await gym();
      const other = await gym();
      const theirs = await addBookingLink(admin.db, { workspaceId: other.workspace.id });
      expect(
        await asTeam(john.id, workspace.id, (scope) => findBookingLink(scope, theirs.id)),
      ).toBeUndefined();
      expect(
        await asTeam(john.id, workspace.id, (scope) =>
          deactivateBookingLink(scope, theirs.id, new Date()),
        ),
      ).toBeUndefined();
      const [stored] = await admin.db
        .select({ deactivatedAt: bookingLinks.deactivatedAt })
        .from(bookingLinks)
        .where(eq(bookingLinks.id, theirs.id));
      expect(stored?.deactivatedAt).toBeNull();
    });

    it('reads the kind and start of a session of the workspace only', async () => {
      const { workspace, john } = await gym();
      const other = await gym();
      const startsAt = new Date('2026-11-17T17:00:00Z');
      const date = await addSession(admin.db, {
        workspaceId: workspace.id,
        type: 'group',
        participant: false,
        startsAt,
      });
      const theirs = await addSession(admin.db, {
        workspaceId: other.workspace.id,
        type: 'group',
        participant: false,
      });
      expect(
        await asTeam(john.id, workspace.id, (scope) => findBookingLinkSession(scope, date.id)),
      ).toEqual({ type: 'group', startsAt });
      expect(
        await asTeam(john.id, workspace.id, (scope) => findBookingLinkSession(scope, theirs.id)),
      ).toBeUndefined();
    });
  });
});
