import type { Schemas } from '@fivvi/contract';
import { describe, expect, it, vi } from 'vitest';
import { attendanceState, markEveryoneAttended, setAttendance } from './attendance-client';

const attendance: Schemas['Attendance'] = {
  sessionId: 's1',
  type: 'private',
  status: 'scheduled',
  attendanceOpensAt: '2026-09-22T06:30:00.000Z',
  canTakeAttendance: true,
  participants: [{ clientId: 'c1', name: 'Anna de Vries', status: 'attended' }],
  summary: { attended: 1, noShow: 0, open: 0, cancelled: 0 },
};

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

describe('F025 attendance on the web: the client of the routes', () => {
  it('AC3: sets one participant through the route of this site, with a request ID of its own', async () => {
    const fetchFn = reply(200, attendance);

    const result = await setAttendance('w1', 's1', 'c1', 'attended', fetchFn);

    expect(result).toEqual({ ok: true, attendance });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/sessions/s1/participants/c1/attendance');
    expect(init?.method).toBe('PUT');
    const body = JSON.parse(String(init?.body)) as { status: string; clientRequestId: string };
    expect(body.status).toBe('attended');
    expect(body.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    // The web does not name itself: the API reads the source from the cookie (the apps send `surface`).
    expect(body).not.toHaveProperty('surface');
  });

  it('AC5: too early comes back with the time attendance opens', async () => {
    const fetchFn = reply(422, {
      code: 'attendance_too_early',
      opensAt: '2026-09-22T15:30:00.000Z',
    });

    expect(await setAttendance('w1', 's1', 'c1', 'attended', fetchFn)).toEqual({
      ok: false,
      reason: 'tooEarly',
      opensAt: '2026-09-22T15:30:00.000Z',
    });
  });

  it('AC6: a cancelled session and a cancelled participant are told apart', async () => {
    expect(
      await setAttendance('w1', 's1', 'c1', 'attended', reply(409, { code: 'session_cancelled' })),
    ).toEqual({ ok: false, reason: 'sessionCancelled' });
    expect(
      await setAttendance(
        'w1',
        's1',
        'c1',
        'attended',
        reply(409, { code: 'participant_cancelled' }),
      ),
    ).toEqual({ ok: false, reason: 'participantCancelled' });
  });

  it('AC7: a person who may not, or who is no longer signed in, goes home; the rest is a generic failure', async () => {
    for (const status of [401, 403, 404]) {
      expect(await setAttendance('w1', 's1', 'c1', 'no_show', reply(status))).toEqual({
        ok: false,
        reason: 'home',
      });
    }
    expect(await setAttendance('w1', 's1', 'c1', 'no_show', reply(500))).toEqual({
      ok: false,
      reason: 'generic',
    });
  });

  it('a request that cannot reach the server is no connection', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));

    expect(await setAttendance('w1', 's1', 'c1', 'booked', fetchFn)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
    expect(await markEveryoneAttended('w1', 's1', fetchFn)).toEqual({
      ok: false,
      reason: 'noConnection',
    });
  });

  it('Iedereen aanwezig: posts to the bulk route and answers the participants as they are now', async () => {
    const fetchFn = reply(200, attendance);

    expect(await markEveryoneAttended('w1', 's1', fetchFn)).toEqual({ ok: true, attendance });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/workspaces/w1/sessions/s1/participants/attended');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it('AC5, AC6: the state of the section follows the session and the clock the page was drawn at', () => {
    const at = (iso: string) => new Date(iso);
    expect(attendanceState(attendance, at('2026-09-22T06:29:59.000Z'))).toBe('tooEarly');
    expect(attendanceState(attendance, at('2026-09-22T06:30:00.000Z'))).toBe('open');
    expect(
      attendanceState({ ...attendance, status: 'cancelled' }, at('2026-09-22T06:00:00.000Z')),
    ).toBe('cancelled');
  });
});
