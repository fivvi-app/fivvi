import { describe, expect, it, vi } from 'vitest';
import {
  createClass,
  editClassDate,
  editClassSeries,
  loadKeptDates,
  loadScheduleContext,
  loadTrainers,
  scheduleClassDate,
  validateClass,
} from './classes-client';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

const filled = {
  nameNl: 'Kracht',
  nameEn: 'Strength',
  descriptionNl: 'Een stevige les.',
  descriptionEn: '',
  trainerId: 't1',
  capacity: '8',
  durationMinutes: '60',
};

const stored = {
  id: 'c1',
  nameNl: 'Kracht',
  nameEn: 'Strength',
  descriptionNl: 'Een stevige les.',
  descriptionEn: null,
  capacity: 8,
  durationMinutes: 60,
  defaultTrainer: { id: 't1', name: 'Sarah' },
};

const session = {
  id: 's1',
  type: 'group',
  status: 'scheduled',
  startsAt: '2026-10-06T16:00:00.000Z',
  endsAt: '2026-10-06T17:00:00.000Z',
  timeZone: 'Europe/Amsterdam',
  capacity: 8,
  version: 1,
  location: { id: 'l1', name: "John's Gym", type: 'organization_location', isDefault: true },
  participants: [],
};

const conflict = {
  sessionId: '00000000-0000-4000-8000-000000000001',
  type: 'private' as const,
  startsAt: '2026-12-01T09:00:00.000Z',
  endsAt: '2026-12-01T10:00:00.000Z',
  displayName: 'Sam Voorbeeld',
  displayNameEn: null,
};

describe('F021 TW-03 classes client', () => {
  describe('validateClass', () => {
    it('AC2: refuses an empty Dutch name, a capacity of 0 or 101 and a duration of 7 minutes, each on its field', () => {
      expect(validateClass({ ...filled, nameNl: ' ' })).toEqual({ nameNl: 'nameRequired' });
      expect(validateClass({ ...filled, capacity: '0' })).toEqual({ capacity: 'capacityInvalid' });
      expect(validateClass({ ...filled, capacity: '101' })).toEqual({
        capacity: 'capacityInvalid',
      });
      expect(validateClass({ ...filled, capacity: '' })).toEqual({ capacity: 'capacityInvalid' });
      expect(validateClass({ ...filled, durationMinutes: '7' })).toEqual({
        durationMinutes: 'durationInvalid',
      });
      expect(validateClass({ ...filled, durationMinutes: '62' })).toEqual({
        durationMinutes: 'durationInvalid',
      });
    });

    it('AC2: all four refusals show at once, one message per field', () => {
      expect(
        validateClass({ ...filled, nameNl: '', capacity: '101', durationMinutes: '7' }),
      ).toEqual({
        nameNl: 'nameRequired',
        capacity: 'capacityInvalid',
        durationMinutes: 'durationInvalid',
      });
    });

    it('refuses a name over 80 and a description over 500 characters', () => {
      expect(
        validateClass({
          ...filled,
          nameNl: 'a'.repeat(81),
          nameEn: 'b'.repeat(81),
          descriptionNl: 'c'.repeat(501),
          descriptionEn: 'd'.repeat(501),
        }),
      ).toEqual({
        nameNl: 'nameTooLong',
        nameEn: 'nameTooLong',
        descriptionNl: 'descriptionTooLong',
        descriptionEn: 'descriptionTooLong',
      });
    });

    it('accepts the limits themselves', () => {
      expect(validateClass({ ...filled, capacity: '1', durationMinutes: '15' })).toEqual({});
      expect(validateClass({ ...filled, capacity: '100', durationMinutes: '240' })).toEqual({});
    });
  });

  describe('createClass', () => {
    it('AC1: posts the texts trimmed, a blank English text left out and no trainer for Trainer nodig', async () => {
      const fetchFn = reply(201, { groupClass: stored });

      const result = await createClass(
        'w1',
        { ...filled, nameNl: ' Kracht ', descriptionEn: ' ', trainerId: '' },
        fetchFn,
      );

      expect(result).toEqual({ ok: true, groupClass: stored });
      const [url, init] = fetchFn.mock.calls[0] ?? [];
      expect(url).toBe('/api/v1/workspaces/w1/group-classes');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        nameNl: 'Kracht',
        nameEn: 'Strength',
        descriptionNl: 'Een stevige les.',
        trainerId: null,
        capacity: 8,
        durationMinutes: 60,
      });
    });

    it('sends the trainer chosen', async () => {
      const fetchFn = reply(201, { groupClass: stored });
      await createClass('w1', filled, fetchFn);
      expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body)).trainerId).toBe('t1');
    });

    it('AC2: refuses the invalid input before any request', async () => {
      const fetchFn = reply(201, { groupClass: stored });

      expect(await createClass('w1', { ...filled, capacity: '0' }, fetchFn)).toEqual({
        ok: false,
        reason: 'fields',
        errors: { capacity: 'capacityInvalid' },
      });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("AC2: words the API's 400 under the field it names", async () => {
      const fetchFn = reply(400, {
        code: 'validation_failed',
        issues: [
          { path: 'nameNl', code: 'too_small' },
          { path: 'descriptionEn', code: 'too_big' },
          { path: 'capacity', code: 'too_big' },
          { path: 'durationMinutes', code: 'not_multiple_of' },
        ],
      });

      expect(await createClass('w1', filled, fetchFn)).toEqual({
        ok: false,
        reason: 'fields',
        errors: {
          nameNl: 'nameRequired',
          descriptionEn: 'descriptionTooLong',
          capacity: 'capacityInvalid',
          durationMinutes: 'durationInvalid',
        },
      });
    });

    it.each([
      [401, 'home'],
      [403, 'forbidden'],
      [500, 'generic'],
    ])('answers %i as %s', async (status, reason) => {
      expect(await createClass('w1', filled, reply(status))).toEqual({ ok: false, reason });
    });

    it('says when there is no connection', async () => {
      const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
      expect(await createClass('w1', filled, fetchFn)).toEqual({
        ok: false,
        reason: 'noConnection',
      });
    });
  });

  describe('scheduleClassDate', () => {
    it('AC3: posts the date, the start, the trainer and the capacity of the form', async () => {
      const fetchFn = reply(201, session);

      const result = await scheduleClassDate(
        'w1',
        'c1',
        { localDate: '2026-10-06', localStart: '18:00', trainerId: 't1', capacity: '8' },
        fetchFn,
      );

      expect(result).toEqual({ ok: true, session });
      const [url, init] = fetchFn.mock.calls[0] ?? [];
      expect(url).toBe('/api/v1/workspaces/w1/group-classes/c1/dates');
      expect(JSON.parse(String(init?.body))).toEqual({
        localDate: '2026-10-06',
        localStart: '18:00',
        trainerId: 't1',
        capacity: 8,
      });
    });

    it('AC5: Trainer nodig is sent as no trainer', async () => {
      const fetchFn = reply(201, session);
      await scheduleClassDate(
        'w1',
        'c1',
        { localDate: '2026-10-06', localStart: '18:00', trainerId: '', capacity: '8' },
        fetchFn,
      );
      expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body)).trainerId).toBeNull();
    });

    it('words a skipped start (daylight saving time) under the start', async () => {
      const fetchFn = reply(400, {
        code: 'validation_failed',
        issues: [{ path: 'localStart', code: 'time_does_not_exist' }],
      });
      expect(
        await scheduleClassDate(
          'w1',
          'c1',
          { localDate: '2027-03-28', localStart: '02:30', trainerId: '', capacity: '8' },
          fetchFn,
        ),
      ).toEqual({ ok: false, reason: 'fields', start: 'timeDoesNotExist' });
    });

    it('words an invalid date and a capacity the API refused', async () => {
      const fetchFn = reply(400, {
        code: 'validation_failed',
        issues: [
          { path: 'localDate', code: 'invalid_date' },
          { path: 'capacity', code: 'too_big' },
        ],
      });
      expect(
        await scheduleClassDate(
          'w1',
          'c1',
          { localDate: '2026-02-30', localStart: '18:00', trainerId: '', capacity: '8' },
          fetchFn,
        ),
      ).toEqual({ ok: false, reason: 'fields', date: 'invalidDate', capacity: 'capacityInvalid' });
    });

    it('refuses a capacity outside 1 to 100 before any request', async () => {
      const fetchFn = reply(201, session);
      expect(
        await scheduleClassDate(
          'w1',
          'c1',
          { localDate: '2026-10-06', localStart: '18:00', trainerId: '', capacity: '101' },
          fetchFn,
        ),
      ).toEqual({ ok: false, reason: 'fields', capacity: 'capacityInvalid' });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it.each([
      [401, 'home'],
      [403, 'forbidden'],
      [404, 'generic'],
    ])('answers %i as %s', async (status, reason) => {
      expect(
        await scheduleClassDate(
          'w1',
          'c1',
          { localDate: '2026-10-06', localStart: '18:00', trainerId: '', capacity: '8' },
          reply(status),
        ),
      ).toEqual({ ok: false, reason });
    });

    it('F023 AC5: a trainer_conflict 409 hands the overlapping sessions to the form (PS-07)', async () => {
      expect(
        await scheduleClassDate(
          'w1',
          'c1',
          { localDate: '2026-12-01', localStart: '10:00', trainerId: 't1', capacity: '8' },
          reply(409, { code: 'trainer_conflict', conflicts: [conflict] }),
        ),
      ).toEqual({ ok: false, reason: 'trainerConflict', conflicts: [conflict] });
    });

    it('F023 AC5: Toch opslaan sends the same date again with allowConflicts', async () => {
      const fetchFn = reply(201, session);
      const input = {
        localDate: '2026-12-01',
        localStart: '10:00',
        trainerId: 't1',
        capacity: '8',
      };

      await scheduleClassDate('w1', 'c1', { ...input, allowConflicts: true }, fetchFn);
      await scheduleClassDate('w1', 'c1', input, fetchFn);

      expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
        allowConflicts: true,
      });
      expect(JSON.parse(String(fetchFn.mock.calls[1]?.[1]?.body))).not.toHaveProperty(
        'allowConflicts',
      );
    });
  });

  describe('editClassDate', () => {
    const input = { version: 1, localStart: '18:30', localEnd: '19:30', capacity: '10' };

    it('AC4: patches the date with its version, the start, the end and the capacity', async () => {
      const fetchFn = reply(200, { ...session, version: 2, capacity: 10 });

      const result = await editClassDate('w1', 's1', input, fetchFn);

      expect(result).toEqual({ ok: true, session: { ...session, version: 2, capacity: 10 } });
      const [url, init] = fetchFn.mock.calls[0] ?? [];
      expect(url).toBe('/api/v1/workspaces/w1/sessions/s1');
      expect(init?.method).toBe('PATCH');
      expect(JSON.parse(String(init?.body))).toEqual({
        version: 1,
        localStart: '18:30',
        localEnd: '19:30',
        capacity: 10,
      });
    });

    it('AC4: an end that is not after the start is the end-before-start message, from the API', async () => {
      const fetchFn = reply(400, {
        code: 'validation_failed',
        issues: [{ path: 'localEnd', code: 'end_before_start' }],
      });
      expect(await editClassDate('w1', 's1', input, fetchFn)).toEqual({
        ok: false,
        reason: 'fields',
        end: 'endBeforeStart',
      });
    });

    it('AC4: words an end before the start without asking the API when both are typed', async () => {
      const fetchFn = reply(200, session);
      expect(
        await editClassDate(
          'w1',
          's1',
          { ...input, localStart: '19:00', localEnd: '18:00' },
          fetchFn,
        ),
      ).toEqual({ ok: false, reason: 'fields', end: 'endBeforeStart' });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('words a skipped start or end under that field', async () => {
      const fetchFn = reply(400, {
        code: 'validation_failed',
        issues: [
          { path: 'localStart', code: 'time_does_not_exist' },
          { path: 'localEnd', code: 'invalid_time' },
        ],
      });
      expect(await editClassDate('w1', 's1', input, fetchFn)).toEqual({
        ok: false,
        reason: 'fields',
        start: 'timeDoesNotExist',
        end: 'invalidTime',
      });
    });

    it('a 409 comes back with the date as it is now', async () => {
      const current = { ...session, version: 3 };
      expect(
        await editClassDate(
          'w1',
          's1',
          input,
          reply(409, { code: 'class_date_changed', session: current }),
        ),
      ).toEqual({ ok: false, reason: 'conflict', session: current });
    });

    it('F023 AC5: a trainer_conflict 409 hands the overlapping sessions to the form, never as a changed date', async () => {
      // Even an answer that carried a date must not be taken for "someone changed the date first".
      expect(
        await editClassDate(
          'w1',
          's1',
          input,
          reply(409, { code: 'trainer_conflict', conflicts: [conflict] }),
        ),
      ).toEqual({ ok: false, reason: 'trainerConflict', conflicts: [conflict] });
      expect(
        await editClassDate(
          'w1',
          's1',
          input,
          reply(409, {
            code: 'trainer_conflict',
            conflicts: [conflict],
            session: { ...session, version: 3 },
          }),
        ),
      ).toEqual({ ok: false, reason: 'trainerConflict', conflicts: [conflict] });
    });

    it('F023 AC5: Toch opslaan sends the same change again with allowConflicts, on the same version', async () => {
      const fetchFn = reply(200, { ...session, version: 2 });

      await editClassDate('w1', 's1', { ...input, allowConflicts: true }, fetchFn);

      expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
        version: 1,
        allowConflicts: true,
      });
    });

    it('refuses a capacity outside 1 to 100 before any request', async () => {
      const fetchFn = reply(200, session);
      expect(await editClassDate('w1', 's1', { ...input, capacity: '0' }, fetchFn)).toEqual({
        ok: false,
        reason: 'fields',
        capacity: 'capacityInvalid',
      });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it.each([
      [401, 'home'],
      [403, 'forbidden'],
      [500, 'generic'],
    ])('answers %i as %s', async (status, reason) => {
      expect(await editClassDate('w1', 's1', input, reply(status))).toEqual({
        ok: false,
        reason,
      });
    });
  });

  describe('loadScheduleContext', () => {
    const answers = (overrides: Record<string, Response> = {}) =>
      vi.fn<typeof fetch>((url) => {
        const path = String(url);
        const key = Object.keys(overrides).find((suffix) => path.endsWith(suffix));
        if (key) return Promise.resolve(overrides[key] as Response);
        if (path.endsWith('/locations')) {
          return Promise.resolve(
            Response.json([
              { id: 'l2', name: 'Elders', isDefault: false },
              { id: 'l1', name: "John's Gym", isDefault: true },
            ]),
          );
        }
        if (path.endsWith('/trainers')) {
          // Two trainers with the same name: only the team-member ID tells them apart.
          return Promise.resolve(
            Response.json([
              { id: 't1', name: 'Sarah' },
              { id: 't2', name: 'Sarah' },
            ]),
          );
        }
        if (path.endsWith('/group-classes')) return Promise.resolve(Response.json([stored]));
        return Promise.resolve(Response.json({ timeZone: 'Europe/Amsterdam' }));
      });

    it('reads the time zone, the default location, the trainers and the classes', async () => {
      expect(await loadScheduleContext('w1', 'm-nobody', answers())).toEqual({
        ok: true,
        context: {
          timeZone: 'Europe/Amsterdam',
          locationName: "John's Gym",
          trainers: [
            { id: 't1', name: 'Sarah' },
            { id: 't2', name: 'Sarah' },
          ],
          classes: [stored],
          myTrainerId: null,
        },
      });
    });

    it('F020 #1414 AC2: finds the signed-in trainer by their team-member ID, not by name', async () => {
      expect(await loadScheduleContext('w1', 't1', answers())).toMatchObject({
        ok: true,
        context: { myTrainerId: 't1' },
      });
      // The namesake is someone else: the other Sarah is not taken for the first.
      expect(await loadScheduleContext('w1', 't2', answers())).toMatchObject({
        ok: true,
        context: { myTrainerId: 't2' },
      });
    });

    it('F023 AC6: a person on the team who is no trainer is no trainer here', async () => {
      const found = await loadScheduleContext('w1', 't9', answers());
      expect(found).toMatchObject({ ok: true, context: { myTrainerId: null } });
    });

    it('F020 #1414 AC3: asks for no team list: nothing is matched by email', async () => {
      const fetchFn = answers();
      await loadScheduleContext('w1', 't1', fetchFn);
      expect(fetchFn.mock.calls.map(([url]) => String(url))).not.toContain(
        '/api/v1/workspaces/w1/team-members',
      );
    });

    it('sends a person the API does not know to the signed-in home', async () => {
      expect(
        await loadScheduleContext(
          'w1',
          't1',
          answers({ '/trainers': new Response('{}', { status: 403 }) }),
        ),
      ).toEqual({ ok: false, reason: 'home' });
    });

    it('fails when an answer is not a success', async () => {
      expect(
        await loadScheduleContext(
          'w1',
          't1',
          answers({ '/locations': new Response('{}', { status: 500 }) }),
        ),
      ).toEqual({ ok: false, reason: 'failed' });
    });
  });

  describe('loadTrainers', () => {
    it('reads only the trainers, whatever else the workspace has', async () => {
      const fetchFn = reply(200, [{ id: 't1', name: 'Sarah' }]);
      expect(await loadTrainers('w1', fetchFn)).toEqual({
        ok: true,
        trainers: [{ id: 't1', name: 'Sarah' }],
      });
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(String(fetchFn.mock.calls[0]?.[0])).toBe('/api/v1/workspaces/w1/trainers');
    });

    it('sends a person the API does not know to the signed-in home', async () => {
      expect(await loadTrainers('w1', reply(403))).toEqual({ ok: false, reason: 'home' });
    });

    it('fails when the answer is not a success', async () => {
      expect(await loadTrainers('w1', reply(500))).toEqual({ ok: false, reason: 'failed' });
    });
  });

  describe('F022 the weekly series', () => {
    const when = { localDate: '2026-10-06', localStart: '18:00', trainerId: 't1', capacity: '8' };

    it('AC1: a weekly repeat sends repeat weekly and returns how many dates were added', async () => {
      const fetchFn = reply(201, { ...session, datesAdded: 12 });

      const result = await scheduleClassDate('w1', 'c1', { ...when, repeat: 'weekly' }, fetchFn);

      expect(result).toEqual({ ok: true, session: { ...session, datesAdded: 12 }, datesAdded: 12 });
      expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
        repeat: 'weekly',
      });
    });

    it('AC1: Niet herhalen sends no repeat and adds no count', async () => {
      const fetchFn = reply(201, session);

      const result = await scheduleClassDate('w1', 'c1', { ...when, repeat: 'none' }, fetchFn);

      expect(result).toMatchObject({ ok: true });
      expect(result).not.toHaveProperty('datesAdded');
      expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).not.toHaveProperty('repeat');
    });

    it('AC7: the refused date of a weekly class comes with the skipped start, so the message names it', async () => {
      const fetchFn = reply(400, {
        code: 'validation_failed',
        issues: [{ path: 'localStart', code: 'time_does_not_exist', date: '2027-03-28' }],
      });

      expect(await scheduleClassDate('w1', 'c1', { ...when, repeat: 'weekly' }, fetchFn)).toEqual({
        ok: false,
        reason: 'fields',
        start: 'timeDoesNotExist',
        startDate: '2027-03-28',
      });
    });

    it('a date before today is worded on the date', async () => {
      const fetchFn = reply(400, {
        code: 'validation_failed',
        issues: [{ path: 'localDate', code: 'date_in_past' }],
      });

      expect(await scheduleClassDate('w1', 'c1', { ...when, repeat: 'weekly' }, fetchFn)).toEqual({
        ok: false,
        reason: 'fields',
        date: 'dateInPast',
      });
    });

    it('AC5: Deze en volgende lessen sends scope following and returns how many dates kept their own changes', async () => {
      const fetchFn = reply(200, { ...session, version: 2, keptDates: 1 });

      const result = await editClassDate(
        'w1',
        's1',
        { version: 1, localStart: '18:00', localEnd: '19:00', capacity: '10', scope: 'following' },
        fetchFn,
      );

      expect(result).toEqual({
        ok: true,
        session: { ...session, version: 2, keptDates: 1 },
        keptDates: 1,
      });
      expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
        scope: 'following',
      });
    });

    describe('loadKeptDates (CO-04, before saving)', () => {
      it('AC5: reads how many dates from this one on keep their own changes, from the API alone', async () => {
        const fetchFn = reply(200, { keptDates: 1 });

        expect(await loadKeptDates('w1', 's1', fetchFn)).toEqual({ ok: true, keptDates: 1 });

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
          '/api/v1/workspaces/w1/sessions/s1/kept-dates',
        );
      });

      it('AC5: says nothing when the count cannot be read: a refusal, a date in no series or no connection', async () => {
        expect(await loadKeptDates('w1', 's1', reply(403))).toEqual({ ok: false });
        expect(await loadKeptDates('w1', 's1', reply(400))).toEqual({ ok: false });
        expect(await loadKeptDates('w1', 's1', reply(200, {}))).toEqual({ ok: false });
        expect(
          await loadKeptDates(
            'w1',
            's1',
            vi.fn<typeof fetch>(() => Promise.reject(new Error('offline'))),
          ),
        ).toEqual({ ok: false });
      });
    });

    it('AC4: Alleen deze les sends no scope and reports no kept dates', async () => {
      const fetchFn = reply(200, { ...session, version: 2 });

      const result = await editClassDate(
        'w1',
        's1',
        { version: 1, localStart: '18:30', localEnd: '19:30', capacity: '8', scope: 'this' },
        fetchFn,
      );

      expect(result).not.toHaveProperty('keptDates');
      expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).not.toHaveProperty('scope');
    });

    it('AC7: a series change that would reach a skipped start names the date, and a past date is worded', async () => {
      const skipped = reply(400, {
        code: 'validation_failed',
        issues: [{ path: 'localStart', code: 'time_does_not_exist', date: '2027-03-28' }],
      });
      expect(
        await editClassDate(
          'w1',
          's1',
          { version: 1, localStart: '02:30', localEnd: '03:30', capacity: '8', scope: 'following' },
          skipped,
        ),
      ).toEqual({
        ok: false,
        reason: 'fields',
        start: 'timeDoesNotExist',
        startDate: '2027-03-28',
      });

      const past = reply(400, {
        code: 'validation_failed',
        issues: [{ path: 'scope', code: 'date_in_past' }],
      });
      expect(
        await editClassDate(
          'w1',
          's1',
          { version: 1, localStart: '18:00', localEnd: '19:00', capacity: '8', scope: 'following' },
          past,
        ),
      ).toEqual({ ok: false, reason: 'fields', scope: 'dateInPast' });
    });
  });

  describe('F022 Reeks wijzigen (#1523)', () => {
    const running = {
      id: 'r1',
      groupClassId: 'c1',
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
      weekday: 'TU',
      localStartTime: '19:00',
      durationMinutes: 60,
      timeZone: 'Europe/Amsterdam',
      trainer: { id: 't1', name: 'Sarah' },
      capacity: 8,
      startsOn: '2026-10-06',
      materializedUntil: '2026-12-22',
      version: 2,
    };
    const input = {
      version: 1,
      localStart: '19:00',
      localEnd: '20:00',
      capacity: '8',
      trainerId: 't1',
    };

    it('AC1: sends the start, the length from start and end, the capacity and the trainer to the series route', async () => {
      const fetchFn = reply(200, { ...running, keptDates: 1 });

      const result = await editClassSeries('w1', 'c1', 'r1', input, fetchFn);

      expect(result).toEqual({ ok: true, series: { ...running, keptDates: 1 }, keptDates: 1 });
      expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
        '/api/v1/workspaces/w1/group-classes/c1/series/r1',
      );
      expect(fetchFn.mock.calls[0]?.[1]?.method).toBe('PATCH');
      expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({
        version: 1,
        localStartTime: '19:00',
        durationMinutes: 60,
        capacity: 8,
        trainerId: 't1',
      });
    });

    it('Trainer nodig is trainerId null, and Toch opslaan sends allowConflicts', async () => {
      const fetchFn = reply(200, { ...running, keptDates: 0 });

      await editClassSeries(
        'w1',
        'c1',
        'r1',
        { ...input, trainerId: '', allowConflicts: true },
        fetchFn,
      );

      expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toMatchObject({
        trainerId: null,
        allowConflicts: true,
      });
    });

    it('refuses a capacity outside 1 to 100 and an end that is the start, before any request', async () => {
      const fetchFn = reply(200, running);

      expect(await editClassSeries('w1', 'c1', 'r1', { ...input, capacity: '0' }, fetchFn)).toEqual(
        {
          ok: false,
          reason: 'fields',
          capacity: 'capacityInvalid',
        },
      );
      expect(
        await editClassSeries('w1', 'c1', 'r1', { ...input, localEnd: '19:00' }, fetchFn),
      ).toEqual({ ok: false, reason: 'fields', end: 'endBeforeStart' });
      expect(
        await editClassSeries('w1', 'c1', 'r1', { ...input, localStart: '' }, fetchFn),
      ).toEqual({ ok: false, reason: 'fields', start: 'invalidTime' });
      expect(await editClassSeries('w1', 'c1', 'r1', { ...input, localEnd: '' }, fetchFn)).toEqual({
        ok: false,
        reason: 'fields',
        end: 'invalidTime',
      });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('AC1: a 409 series_changed comes back with the series as it is now', async () => {
      expect(
        await editClassSeries(
          'w1',
          'c1',
          'r1',
          input,
          reply(409, { code: 'series_changed', series: running }),
        ),
      ).toEqual({ ok: false, reason: 'conflict', series: running });
    });

    it('a 409 trainer_conflict hands the overlapping sessions to the form (PS-07)', async () => {
      expect(
        await editClassSeries(
          'w1',
          'c1',
          'r1',
          input,
          reply(409, { code: 'trainer_conflict', conflicts: [conflict] }),
        ),
      ).toEqual({ ok: false, reason: 'trainerConflict', conflicts: [conflict] });
    });

    it('words a skipped start with the date, a length that is no step and a series without dates', async () => {
      const skipped = reply(400, {
        code: 'validation_failed',
        issues: [{ path: 'localStartTime', code: 'time_does_not_exist', date: '2027-03-28' }],
      });
      expect(await editClassSeries('w1', 'c1', 'r1', input, skipped)).toEqual({
        ok: false,
        reason: 'fields',
        start: 'timeDoesNotExist',
        startDate: '2027-03-28',
      });
      const duration = reply(400, {
        code: 'validation_failed',
        issues: [{ path: 'durationMinutes', code: 'invalid_duration' }],
      });
      expect(await editClassSeries('w1', 'c1', 'r1', input, duration)).toEqual({
        ok: false,
        reason: 'fields',
        end: 'invalidDuration',
      });
      const none = reply(400, {
        code: 'validation_failed',
        issues: [{ path: 'seriesId', code: 'no_upcoming_dates' }],
      });
      expect(await editClassSeries('w1', 'c1', 'r1', input, none)).toEqual({
        ok: false,
        reason: 'fields',
        noUpcomingDates: true,
      });
      const capacity = reply(400, {
        code: 'validation_failed',
        issues: [{ path: 'capacity', code: 'invalid_capacity' }],
      });
      expect(await editClassSeries('w1', 'c1', 'r1', input, capacity)).toEqual({
        ok: false,
        reason: 'fields',
        capacity: 'capacityInvalid',
      });
      const time = reply(400, {
        code: 'validation_failed',
        issues: [{ path: 'localStartTime', code: 'invalid_time' }],
      });
      expect(await editClassSeries('w1', 'c1', 'r1', input, time)).toEqual({
        ok: false,
        reason: 'fields',
        start: 'invalidTime',
      });
    });

    it.each([
      [401, 'home'],
      [403, 'forbidden'],
      [500, 'generic'],
    ])('answers %i as %s', async (status, reason) => {
      expect(await editClassSeries('w1', 'c1', 'r1', input, reply(status))).toEqual({
        ok: false,
        reason,
      });
    });
  });
});
