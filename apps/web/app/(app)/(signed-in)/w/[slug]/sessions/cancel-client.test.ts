import { describe, expect, it, vi } from 'vitest';
import { cancelClassDate, cancelPrivateSession, loadCancelPreview } from './cancel-client';

// F026 (spec #462, tickets #559, #560): the calls PS-06 and CO-03 make. The API decides every rule;
// these tests say what is sent and how each answer is read.
const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

const session = { id: 's1', type: 'private', status: 'cancelled', version: 2 };

describe('F026 AC1: cancelling a private session', () => {
  it('posts who cancels, whether to email and the version seen to the cancel route', async () => {
    const fetchFn = reply(200, { session, clientsNotified: 0 });

    const result = await cancelPrivateSession(
      'w1',
      's1',
      { initiator: 'client', notify: false, version: 1 },
      fetchFn,
    );

    expect(result).toEqual({ ok: true, session, clientsNotified: 0 });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/sessions/s1/cancel');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      initiator: 'client',
      notify: false,
      version: 1,
    });
  });

  it('reads a 409 as the session as it is now, with who changed it', async () => {
    const changed = reply(409, {
      code: 'session_changed',
      session,
      changedBy: { name: 'Sarah' },
    });
    expect(
      await cancelPrivateSession(
        'w1',
        's1',
        { initiator: 'workspace', notify: true, version: 1 },
        changed,
      ),
    ).toEqual({
      ok: false,
      reason: 'conflict',
      code: 'session_changed',
      session,
      changedBy: 'Sarah',
    });
    const cancelled = reply(409, { code: 'session_cancelled', session });
    expect(
      await cancelPrivateSession(
        'w1',
        's1',
        { initiator: 'workspace', notify: true, version: 1 },
        cancelled,
      ),
    ).toEqual({ ok: false, reason: 'conflict', code: 'session_cancelled', session });
  });

  it('AC5: reads 403 as forbidden, 401 as home, a lost connection and any other answer as such', async () => {
    const input = { initiator: 'client' as const, notify: false, version: 1 };
    expect(await cancelPrivateSession('w1', 's1', input, reply(403))).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await cancelPrivateSession('w1', 's1', input, reply(401))).toEqual({
      ok: false,
      reason: 'home',
    });
    expect(await cancelPrivateSession('w1', 's1', input, reply(500))).toEqual({
      ok: false,
      reason: 'generic',
    });
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(await cancelPrivateSession('w1', 's1', input, offline)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });
});

describe('F026 AC6, AC7: cancelling a class date', () => {
  const counts = { datesCancelled: 1, datesRemoved: 0, participantsNotified: 3 };

  it('posts the scope, the message and the version to the cancel-class route', async () => {
    const fetchFn = reply(200, { session, ...counts });

    const result = await cancelClassDate(
      'w1',
      's1',
      { scope: 'this', message: 'Sarah is ziek, sorry!', version: 4 },
      fetchFn,
    );

    expect(result).toEqual({ ok: true, session, ...counts });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/sessions/s1/cancel-class');
    expect(JSON.parse(String(init?.body))).toEqual({
      scope: 'this',
      message: 'Sarah is ziek, sorry!',
      version: 4,
    });
  });

  it('AC9: leaves a blank message out', async () => {
    const fetchFn = reply(200, { session, ...counts });
    await cancelClassDate('w1', 's1', { scope: 'following', message: '  ', version: 4 }, fetchFn);
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
      scope: 'following',
      version: 4,
    });
  });

  it('reads a 409 as the date as it is now; 403 as forbidden', async () => {
    const input = { scope: 'this' as const, version: 4 };
    expect(
      await cancelClassDate('w1', 's1', input, reply(409, { code: 'session_cancelled', session })),
    ).toEqual({ ok: false, reason: 'conflict', code: 'session_cancelled', session });
    expect(await cancelClassDate('w1', 's1', input, reply(403))).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });
});

describe('F026 AC6, AC8: the preview of CO-03', () => {
  const preview = {
    sessionId: 's1',
    started: false,
    inSeries: true,
    thisDate: {
      datesCancelled: 1,
      datesRemoved: 0,
      datesWithEmails: 1,
      participants: 3,
      emails: 3,
    },
  };

  it('reads what cancelling reaches, without storing anything', async () => {
    const fetchFn = reply(200, preview);

    const result = await loadCancelPreview('w1', 's1', fetchFn);

    expect(result).toEqual({ ok: true, preview });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/sessions/s1/cancel-preview');
    expect(init?.method).toBeUndefined();
  });

  it('says when the date is cancelled already, or the person has no right to it', async () => {
    expect(await loadCancelPreview('w1', 's1', reply(409, { code: 'session_cancelled' }))).toEqual({
      ok: false,
      reason: 'cancelled',
    });
    expect(await loadCancelPreview('w1', 's1', reply(403))).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await loadCancelPreview('w1', 's1', reply(500))).toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});
