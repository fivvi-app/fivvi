import { describe, expect, it, vi } from 'vitest';
import { inviteTrainer, resendInvitation, withdrawInvitation } from './invitations-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

const invitation = {
  id: 'i1',
  name: 'Lisa',
  email: 'lisa@example.com',
  emailLocale: null,
  sentAt: '2026-11-14T10:00:00.000Z',
  expiresAt: '2026-11-21T10:00:00.000Z',
};

describe('F011 TW-06 invitations client', () => {
  describe('inviteTrainer', () => {
    it('AC1: posts the name and the address, and leaves a default language out', async () => {
      const fetchFn = reply(201, invitation);

      const result = await inviteTrainer(
        'w1',
        { name: ' Lisa ', email: ' lisa@example.com ', emailLocale: '' },
        fetchFn,
      );

      expect(result).toEqual({ ok: true, invitation });
      const [url, init] = fetchFn.mock.calls[0] ?? [];
      expect(url).toBe('/api/v1/workspaces/w1/trainer-invitations');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ name: 'Lisa', email: 'lisa@example.com' });
    });

    it('AC2: sends the language the Owner picked', async () => {
      const fetchFn = reply(201, invitation);

      await inviteTrainer(
        'w1',
        { name: 'Lisa', email: 'lisa@example.com', emailLocale: 'en' },
        fetchFn,
      );

      expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
        name: 'Lisa',
        email: 'lisa@example.com',
        emailLocale: 'en',
      });
    });

    it('refuses a blank name or address before any request', async () => {
      const fetchFn = reply(201, invitation);

      expect(await inviteTrainer('w1', { name: ' ', email: '', emailLocale: '' }, fetchFn)).toEqual(
        {
          ok: false,
          reason: 'fields',
          name: 'nameRequired',
          email: 'emailRequired',
        },
      );
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('AC8: a 409 already_on_team is its own answer', async () => {
      expect(
        await inviteTrainer(
          'w1',
          { name: 'Sarah', email: 'sarah@example.com', emailLocale: '' },
          reply(409, { code: 'already_on_team' }),
        ),
      ).toEqual({ ok: false, reason: 'alreadyOnTeam' });
    });

    it('AC8: a 409 invitation_pending names the invitation that can be sent again', async () => {
      expect(
        await inviteTrainer(
          'w1',
          { name: 'Lisa', email: 'lisa@example.com', emailLocale: '' },
          reply(409, { code: 'invitation_pending', invitationId: 'i1' }),
        ),
      ).toEqual({ ok: false, reason: 'alreadyInvited', invitationId: 'i1' });
    });

    it('AC10: a 429 means the day is full', async () => {
      expect(
        await inviteTrainer(
          'w1',
          { name: 'Lisa', email: 'lisa@example.com', emailLocale: '' },
          reply(429, { code: 'too_many_invitations' }),
        ),
      ).toEqual({ ok: false, reason: 'tooMany' });
    });

    it('words the fields the API refused', async () => {
      const refused = reply(400, {
        issues: [
          { path: 'name', code: 'too_big' },
          { path: 'email', code: 'invalid_format' },
        ],
      });

      expect(
        await inviteTrainer('w1', { name: 'L', email: 'lisa@', emailLocale: '' }, refused),
      ).toEqual({ ok: false, reason: 'fields', name: 'nameTooLong', email: 'emailInvalid' });
    });

    it.each([401, 403, 404])(
      'AC9: a %s means this person may not invite (any more)',
      async (status) => {
        expect(
          await inviteTrainer(
            'w1',
            { name: 'Lisa', email: 'lisa@example.com', emailLocale: '' },
            reply(status),
          ),
        ).toEqual({ ok: false, reason: 'home' });
      },
    );

    it('a failed send and no connection are their own failures', async () => {
      const input = { name: 'Lisa', email: 'lisa@example.com', emailLocale: '' as const };
      expect(await inviteTrainer('w1', input, reply(500))).toEqual({
        ok: false,
        reason: 'generic',
      });
      expect(
        await inviteTrainer(
          'w1',
          input,
          vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline'))),
        ),
      ).toEqual({ ok: false, reason: 'noConnection' });
    });
  });

  describe('resendInvitation', () => {
    it('AC7: posts to the resend route of the invitation', async () => {
      const fetchFn = reply(200, invitation);

      expect(await resendInvitation('w1', 'i1', fetchFn)).toEqual({ ok: true });
      const [url, init] = fetchFn.mock.calls[0] ?? [];
      expect(url).toBe('/api/v1/workspaces/w1/trainer-invitations/i1/resend');
      expect(init?.method).toBe('POST');
    });

    it('a 404 means the invitation is gone; 401 and 403 send the person home', async () => {
      expect(await resendInvitation('w1', 'i1', reply(404))).toEqual({ ok: false, reason: 'gone' });
      for (const status of [401, 403]) {
        expect(await resendInvitation('w1', 'i1', reply(status))).toEqual({
          ok: false,
          reason: 'home',
        });
      }
    });

    it('any other answer and no connection fail', async () => {
      expect(await resendInvitation('w1', 'i1', reply(500))).toEqual({
        ok: false,
        reason: 'generic',
      });
      expect(
        await resendInvitation(
          'w1',
          'i1',
          vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline'))),
        ),
      ).toEqual({ ok: false, reason: 'noConnection' });
    });
  });

  describe('withdrawInvitation', () => {
    it('AC7: deletes the invitation', async () => {
      const fetchFn = vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(null, { status: 204 })),
      );

      expect(await withdrawInvitation('w1', 'i1', fetchFn)).toEqual({ ok: true });
      const [url, init] = fetchFn.mock.calls[0] ?? [];
      expect(url).toBe('/api/v1/workspaces/w1/trainer-invitations/i1');
      expect(init?.method).toBe('DELETE');
    });

    it('a 404 means the invitation is gone; 401 and 403 send the person home', async () => {
      expect(await withdrawInvitation('w1', 'i1', reply(404))).toEqual({
        ok: false,
        reason: 'gone',
      });
      expect(await withdrawInvitation('w1', 'i1', reply(403))).toEqual({
        ok: false,
        reason: 'home',
      });
    });

    it('any other answer fails', async () => {
      expect(await withdrawInvitation('w1', 'i1', reply(500))).toEqual({
        ok: false,
        reason: 'generic',
      });
    });
  });
});
