import type { Schemas } from '@fivvi/contract';
import { GROUP_CLASS_LIMITS as LIMITS } from '@fivvi/domain/group-class-limits';
import { type TrainerConflictRefusal, trainerConflict } from '../sessions/sessions-client';
import { minutesBetween } from './series';

export type GroupClass = Schemas['GroupClass'];
export type Session = Schemas['Session'];
export type Trainer = Schemas['Trainer'];
export type ClassSeries = Schemas['ClassSeries'];

/** The fields of the class form (TW-03) that can be refused. */
export type ClassField =
  | 'nameNl'
  | 'nameEn'
  | 'descriptionNl'
  | 'descriptionEn'
  | 'capacity'
  | 'durationMinutes';

/** The `classes.form.errors.*` key that words a refused field. */
export type ClassFieldError =
  | 'nameRequired'
  | 'nameTooLong'
  | 'descriptionTooLong'
  | 'capacityInvalid'
  | 'durationInvalid';

/** What the person typed in the class form: texts and numbers as strings, the trainer's ID or `''` for *Trainer nodig*. */
export interface ClassInput {
  nameNl: string;
  nameEn: string;
  descriptionNl: string;
  descriptionEn: string;
  trainerId: string;
  capacity: string;
  durationMinutes: string;
}

/** The `classes.schedule.errors.*` keys of the scheduling form's date, start and capacity. */
export type DateErrorKey = 'invalidDate' | 'dateInPast';
export type StartErrorKey = 'timeDoesNotExist' | 'invalidTime';
/** The `classes.edit.errors.*` keys of CO-04's end. */
export type EndErrorKey = 'endBeforeStart' | 'timeDoesNotExist' | 'invalidTime' | 'invalidDuration';
/** The `classes.edit.errors.*` key of *Wijzigen voor*: a date before today is not changed (F022). */
export type ScopeErrorKey = 'dateInPast';

/** The refusals every call shares. */
type Refused =
  /** The trainer already has something then (`409` `trainer_conflict`, PS-07): `Toch opslaan` resends. */
  | TrainerConflictRefusal
  /** The person may not do this (any more). */
  | { ok: false; reason: 'forbidden' }
  /** Not signed in: the signed-in home knows where this person belongs. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

export type CreateClassResult =
  | { ok: true; groupClass: GroupClass }
  | { ok: false; reason: 'fields'; errors: Partial<Record<ClassField, ClassFieldError>> }
  | Refused;

export type ScheduleResult =
  | {
      ok: true;
      session: Session;
      /** How many dates a weekly repeat made (12); absent for one date. */
      datesAdded?: number;
    }
  | {
      ok: false;
      reason: 'fields';
      date?: DateErrorKey;
      start?: StartErrorKey;
      /** The date a skipped start belongs to, for a weekly class: the first one the clocks skip. */
      startDate?: string;
      capacity?: 'capacityInvalid';
    }
  | Refused;

export type EditDateResult =
  | {
      ok: true;
      session: Session;
      /** With *Deze en volgende lessen*: how many dates kept their own changes (F022). */
      keptDates?: number;
    }
  /** `class_date_changed`: someone changed the date first; `session` is the date as it is now. */
  | { ok: false; reason: 'conflict'; session: Session }
  | {
      ok: false;
      reason: 'fields';
      start?: StartErrorKey;
      /** The date a skipped start belongs to, when the change reaches more than one date. */
      startDate?: string;
      end?: EndErrorKey;
      capacity?: 'capacityInvalid';
      scope?: ScopeErrorKey;
    }
  | Refused;

export type EditSeriesResult =
  | {
      ok: true;
      /** The series as it now runs (a series split at its first date that hasn't started has a new ID). */
      series: ClassSeries;
      /** How many dates kept their own changes (CO-04). */
      keptDates: number;
    }
  /** `series_changed`: someone changed the series first; `series` is the series as it is now. */
  | { ok: false; reason: 'conflict'; series: ClassSeries }
  | {
      ok: false;
      reason: 'fields';
      start?: StartErrorKey;
      /** The date a skipped start belongs to: the first one the clocks skip. */
      startDate?: string;
      end?: 'endBeforeStart' | 'invalidDuration' | 'invalidTime';
      capacity?: 'capacityInvalid';
      /** `no_upcoming_dates`: the series has no date left to change. */
      noUpcomingDates?: true;
    }
  | Refused;

const trimmed = (text: string) => text.trim();

/** A number typed in a field; `NaN` for anything that is not a whole number. */
function whole(text: string): number {
  return /^\s*\d+\s*$/.test(text) ? Number(text) : Number.NaN;
}

function validCapacity(text: string): boolean {
  const capacity = whole(text);
  return capacity >= LIMITS.capacity.min && capacity <= LIMITS.capacity.max;
}

/**
 * What the class form refuses before anything is sent (F021 AC2): an empty Dutch name, texts over
 * their limits, a capacity outside 1 to 100 and a duration outside 15 to 240 minutes in steps of 5.
 * One message per field. The API refuses the same values; its answer is worded the same way.
 */
export function validateClass(input: ClassInput): Partial<Record<ClassField, ClassFieldError>> {
  const errors: Partial<Record<ClassField, ClassFieldError>> = {};
  if (trimmed(input.nameNl) === '') errors.nameNl = 'nameRequired';
  else if (trimmed(input.nameNl).length > LIMITS.nameMaxLength) errors.nameNl = 'nameTooLong';
  if (trimmed(input.nameEn).length > LIMITS.nameMaxLength) errors.nameEn = 'nameTooLong';
  if (trimmed(input.descriptionNl).length > LIMITS.descriptionMaxLength) {
    errors.descriptionNl = 'descriptionTooLong';
  }
  if (trimmed(input.descriptionEn).length > LIMITS.descriptionMaxLength) {
    errors.descriptionEn = 'descriptionTooLong';
  }
  if (!validCapacity(input.capacity)) errors.capacity = 'capacityInvalid';
  const duration = whole(input.durationMinutes);
  if (
    !(duration >= LIMITS.duration.min && duration <= LIMITS.duration.max) ||
    duration % LIMITS.duration.step !== 0
  ) {
    errors.durationMinutes = 'durationInvalid';
  }
  return errors;
}

/** The words for an answer that was not a success and not a refused field. */
function refusal(status: number): Refused {
  if (status === 401) return { ok: false, reason: 'home' };
  if (status === 403) return { ok: false, reason: 'forbidden' };
  return { ok: false, reason: 'generic' };
}

async function send(
  method: 'POST' | 'PATCH',
  url: string,
  body: unknown,
  fetchFn: typeof fetch,
): Promise<{ status: number; body: unknown } | { failed: Refused }> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { failed: { ok: false, reason: 'noConnection' } };
  }
  return { status: response.status, body: await response.json().catch(() => null) };
}

const issuesOf = (body: unknown) => (body as Schemas['ValidationError'] | null)?.issues ?? [];

/** The key that words a refused field of the class form, from the API's issue code. */
function classFieldError(field: ClassField, code: string): ClassFieldError {
  if (field === 'nameNl') return code === 'too_small' ? 'nameRequired' : 'nameTooLong';
  if (field === 'nameEn') return 'nameTooLong';
  if (field === 'descriptionNl' || field === 'descriptionEn') return 'descriptionTooLong';
  return field === 'capacity' ? 'capacityInvalid' : 'durationInvalid';
}

const CLASS_FIELDS: readonly string[] = [
  'nameNl',
  'nameEn',
  'descriptionNl',
  'descriptionEn',
  'capacity',
  'durationMinutes',
];

/**
 * Creates a class (`POST /api/v1/workspaces/{workspaceId}/group-classes`, F021 AC1, AC2). A blank
 * text is left out, *Trainer nodig* is `trainerId: null`. The refusals of AC2 are found before the
 * request; the API's own 400 is worded under the field it names.
 */
export async function createClass(
  workspaceId: string,
  input: ClassInput,
  fetchFn: typeof fetch = fetch,
): Promise<CreateClassResult> {
  const errors = validateClass(input);
  if (Object.keys(errors).length > 0) return { ok: false, reason: 'fields', errors };
  const body: Schemas['CreateGroupClassRequest'] = {
    nameNl: trimmed(input.nameNl),
    trainerId: input.trainerId === '' ? null : input.trainerId,
    capacity: whole(input.capacity),
    durationMinutes: whole(input.durationMinutes),
  };
  if (trimmed(input.nameEn) !== '') body.nameEn = trimmed(input.nameEn);
  if (trimmed(input.descriptionNl) !== '') body.descriptionNl = trimmed(input.descriptionNl);
  if (trimmed(input.descriptionEn) !== '') body.descriptionEn = trimmed(input.descriptionEn);
  const answered = await send(
    'POST',
    `/api/v1/workspaces/${workspaceId}/group-classes`,
    body,
    fetchFn,
  );
  if ('failed' in answered) return answered.failed;
  if (answered.status === 201) {
    const created = answered.body as Schemas['CreatedGroupClass'] | null;
    if (!created?.groupClass) return { ok: false, reason: 'generic' };
    return { ok: true, groupClass: created.groupClass };
  }
  if (answered.status === 400) {
    const refused: Partial<Record<ClassField, ClassFieldError>> = {};
    for (const { path, code } of issuesOf(answered.body)) {
      if (CLASS_FIELDS.includes(path))
        refused[path as ClassField] = classFieldError(path as ClassField, code);
    }
    if (Object.keys(refused).length > 0) return { ok: false, reason: 'fields', errors: refused };
  }
  return refusal(answered.status);
}

/** What the person typed to put a class on a date. */
export interface ScheduleInput {
  /** The date in the workspace's time zone: `YYYY-MM-DD`. */
  localDate: string;
  /** The start in the workspace's time zone: `HH:mm`. */
  localStart: string;
  /** The trainer of this date, or `''` for *Trainer nodig*. */
  trainerId: string;
  capacity: string;
  /** *Herhalen* (F022): `weekly` makes a weekly series from this date; `none` (the default) one date. */
  repeat?: 'none' | 'weekly';
  /** *Toch opslaan* (PS-07): save although the trainer has something then. */
  allowConflicts?: boolean;
}

/**
 * Puts a class on a date (`POST …/group-classes/{classId}/dates`, F021 AC3, AC5). The form sends
 * the trainer and the capacity it shows (prefilled from the class), so the date is what the person
 * saw. A start the clocks skip comes back as `time_does_not_exist`.
 */
export async function scheduleClassDate(
  workspaceId: string,
  classId: string,
  input: ScheduleInput,
  fetchFn: typeof fetch = fetch,
): Promise<ScheduleResult> {
  if (!validCapacity(input.capacity)) {
    return { ok: false, reason: 'fields', capacity: 'capacityInvalid' };
  }
  const body: Schemas['ScheduleGroupClassDateRequest'] = {
    localDate: input.localDate,
    localStart: input.localStart,
    trainerId: input.trainerId === '' ? null : input.trainerId,
    capacity: whole(input.capacity),
  };
  if (input.repeat === 'weekly') body.repeat = 'weekly';
  if (input.allowConflicts) body.allowConflicts = true;
  const answered = await send(
    'POST',
    `/api/v1/workspaces/${workspaceId}/group-classes/${classId}/dates`,
    body,
    fetchFn,
  );
  if ('failed' in answered) return answered.failed;
  if (answered.status === 409) return trainerConflict(answered.body);
  if (answered.status === 201) {
    const session = answered.body as Schemas['ScheduledClassDate'] | null;
    if (!session?.id) return { ok: false, reason: 'generic' };
    return session.datesAdded === undefined
      ? { ok: true, session }
      : { ok: true, session, datesAdded: session.datesAdded };
  }
  if (answered.status === 400) {
    const refused: Extract<ScheduleResult, { reason: 'fields' }> = { ok: false, reason: 'fields' };
    for (const { path, code, date } of issuesOf(answered.body)) {
      if (path === 'localDate')
        refused.date = code === 'date_in_past' ? 'dateInPast' : 'invalidDate';
      if (path === 'localStart') {
        refused.start = code === 'time_does_not_exist' ? 'timeDoesNotExist' : 'invalidTime';
        if (date) refused.startDate = date;
      }
      if (path === 'capacity') refused.capacity = 'capacityInvalid';
    }
    if (refused.date || refused.start || refused.capacity) return refused;
  }
  return refusal(answered.status);
}

/** What the person typed to change one date (CO-04). */
export interface EditDateInput {
  /** The `version` of the date the person saw. */
  version: number;
  localStart: string;
  localEnd: string;
  capacity: string;
  /** *Wijzigen voor* (F022): `this` (the default) changes this date, `following` the series from it on. */
  scope?: 'this' | 'following';
  /** *Toch opslaan* (PS-07): save although the trainer has something then. */
  allowConflicts?: boolean;
}

/**
 * Changes one date of a class (`PATCH …/sessions/{sessionId}`, F021 AC4): the start, the end and
 * the capacity of this date only. `version` is the one the person saw; a 409 comes back with the
 * date as it is now. An end that is not after the start is refused before the request, with the
 * API's own refusal worded the same way.
 */
export async function editClassDate(
  workspaceId: string,
  sessionId: string,
  input: EditDateInput,
  fetchFn: typeof fetch = fetch,
): Promise<EditDateResult> {
  if (!validCapacity(input.capacity)) {
    return { ok: false, reason: 'fields', capacity: 'capacityInvalid' };
  }
  // The same day: wall-clock `HH:mm` compares as text.
  if (input.localStart !== '' && input.localEnd !== '' && input.localEnd <= input.localStart) {
    return { ok: false, reason: 'fields', end: 'endBeforeStart' };
  }
  const body: Schemas['UpdateGroupClassDateRequest'] = {
    version: input.version,
    localStart: input.localStart,
    localEnd: input.localEnd,
    capacity: whole(input.capacity),
  };
  if (input.scope === 'following') body.scope = 'following';
  if (input.allowConflicts) body.allowConflicts = true;
  const answered = await send(
    'PATCH',
    `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}`,
    body,
    fetchFn,
  );
  if ('failed' in answered) return answered.failed;
  if (answered.status === 200) {
    const session = answered.body as Schemas['UpdatedClassDate'] | null;
    if (!session?.id) return { ok: false, reason: 'generic' };
    return session.keptDates === undefined
      ? { ok: true, session }
      : { ok: true, session, keptDates: session.keptDates };
  }
  if (answered.status === 409) {
    const conflict = answered.body as Schemas['UpdateGroupClassDateRefusal'] | null;
    // `trainer_conflict` lists overlapping sessions and is no changed date: it is PS-07's warning.
    if (conflict?.code === 'trainer_conflict') return trainerConflict(conflict);
    if (!conflict?.session) return { ok: false, reason: 'generic' };
    return { ok: false, reason: 'conflict', session: conflict.session };
  }
  if (answered.status === 400) {
    const refused: Extract<EditDateResult, { reason: 'fields' }> = { ok: false, reason: 'fields' };
    for (const { path, code, date } of issuesOf(answered.body)) {
      if (path === 'localStart') {
        refused.start = code === 'time_does_not_exist' ? 'timeDoesNotExist' : 'invalidTime';
        if (date) refused.startDate = date;
      }
      if (path === 'localEnd') {
        refused.end =
          code === 'end_before_start'
            ? 'endBeforeStart'
            : code === 'time_does_not_exist'
              ? 'timeDoesNotExist'
              : code === 'invalid_duration'
                ? 'invalidDuration'
                : 'invalidTime';
      }
      if (path === 'capacity') refused.capacity = 'capacityInvalid';
      if (path === 'scope' && code === 'date_in_past') refused.scope = 'dateInPast';
    }
    if (refused.start || refused.end || refused.capacity || refused.scope) return refused;
  }
  return refusal(answered.status);
}

/**
 * How many dates from this one on keep their own changes (`GET …/sessions/{sessionId}/kept-dates`,
 * F022, CO-04): said before *Opslaan* when *Deze en volgende lessen* is chosen. Only the API counts;
 * a count that cannot be read says nothing and the save still tells it afterwards.
 */
export async function loadKeptDates(
  workspaceId: string,
  sessionId: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; keptDates: number } | { ok: false }> {
  try {
    const answer = await fetchFn(
      `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/kept-dates`,
    );
    if (answer.status !== 200) return { ok: false };
    const { keptDates } = (await answer.json()) as Partial<Schemas['KeptClassDates']>;
    return typeof keptDates === 'number' ? { ok: true, keptDates } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/** What the person typed to change a whole series (F022, *Reeks wijzigen*). */
export interface EditSeriesInput {
  /** The `version` of the series the person saw. */
  version: number;
  /** The start of every date, `HH:mm`. */
  localStart: string;
  /** The end of every date, `HH:mm`: the API takes the length, which is the minutes from the start. */
  localEnd: string;
  capacity: string;
  /** The trainer of every date, or `''` for *Trainer nodig*. */
  trainerId: string;
  /** *Toch opslaan* (PS-07): save although the trainer has something then. */
  allowConflicts?: boolean;
}

/**
 * Changes a whole series (`PATCH …/group-classes/{classId}/series/{seriesId}`, F022, CO-04): the
 * API applies the change from the series' first date that hasn't started, so the web finds no date.
 * The length is the minutes from the typed start to the typed end; a capacity outside 1 to 100 and
 * an end that is the start are refused before the request, the API's own refusals are worded the
 * same way.
 */
export async function editClassSeries(
  workspaceId: string,
  classId: string,
  seriesId: string,
  input: EditSeriesInput,
  fetchFn: typeof fetch = fetch,
): Promise<EditSeriesResult> {
  if (!validCapacity(input.capacity)) {
    return { ok: false, reason: 'fields', capacity: 'capacityInvalid' };
  }
  const durationMinutes = minutesBetween(input.localStart, input.localEnd);
  if (durationMinutes === null) {
    // A start or an end that is no time is worded under its field; an end that is the start, under the end.
    const clock = /^\d{2}:\d{2}$/;
    if (!clock.test(input.localStart)) return { ok: false, reason: 'fields', start: 'invalidTime' };
    return {
      ok: false,
      reason: 'fields',
      end: clock.test(input.localEnd) ? 'endBeforeStart' : 'invalidTime',
    };
  }
  const body: Schemas['UpdateClassSeriesRequest'] = {
    version: input.version,
    localStartTime: input.localStart,
    durationMinutes,
    capacity: whole(input.capacity),
    trainerId: input.trainerId === '' ? null : input.trainerId,
  };
  if (input.allowConflicts) body.allowConflicts = true;
  const answered = await send(
    'PATCH',
    `/api/v1/workspaces/${workspaceId}/group-classes/${classId}/series/${seriesId}`,
    body,
    fetchFn,
  );
  if ('failed' in answered) return answered.failed;
  if (answered.status === 200) {
    const series = answered.body as Schemas['UpdatedClassSeries'] | null;
    if (!series?.id) return { ok: false, reason: 'generic' };
    return { ok: true, series, keptDates: series.keptDates };
  }
  if (answered.status === 409) {
    const refused = answered.body as Schemas['UpdateClassSeriesRefusal'] | null;
    if (refused?.code === 'trainer_conflict') return trainerConflict(refused);
    if (!refused?.series) return { ok: false, reason: 'generic' };
    return { ok: false, reason: 'conflict', series: refused.series };
  }
  if (answered.status === 400) {
    const refused: Extract<EditSeriesResult, { reason: 'fields' }> = {
      ok: false,
      reason: 'fields',
    };
    for (const { path, code, date } of issuesOf(answered.body)) {
      if (path === 'localStartTime') {
        refused.start = code === 'time_does_not_exist' ? 'timeDoesNotExist' : 'invalidTime';
        if (date) refused.startDate = date;
      }
      if (path === 'durationMinutes') refused.end = 'invalidDuration';
      if (path === 'capacity') refused.capacity = 'capacityInvalid';
      if (path === 'seriesId' && code === 'no_upcoming_dates') refused.noUpcomingDates = true;
    }
    if (refused.start || refused.end || refused.capacity || refused.noUpcomingDates) return refused;
  }
  return refusal(answered.status);
}

/** What the scheduling form needs to know around its fields. */
export interface ScheduleContext {
  /** The workspace's IANA time zone: the date and the start are typed in it. */
  timeZone: string;
  /** The name of the location every new date takes (F016). */
  locationName: string;
  /** Every trainer of the workspace. */
  trainers: Trainer[];
  /** Every class of the workspace, by name. */
  classes: GroupClass[];
  /** The signed-in person's own team-member ID, when they train here; `null` otherwise. */
  myTrainerId: string | null;
}

export type ScheduleContextResult =
  | { ok: true; context: ScheduleContext }
  | { ok: false; reason: 'home' | 'failed' };

/**
 * Reads what the scheduling form shows: the time zone (`GET …/workspaces/{id}`), the default
 * location (`GET …/locations`), the trainers (`GET …/trainers`) and the classes
 * (`GET …/group-classes`), and the signed-in person's own place among the trainers: the one whose
 * ID is their own team-member ID (`teamMemberId` of `GET /v1/me`; PS-07 words their own overlap as
 * "Je hebt dan al iets").
 */
export async function loadScheduleContext(
  workspaceId: string,
  teamMemberId: string,
  fetchFn: typeof fetch = fetch,
): Promise<ScheduleContextResult> {
  const base = `/api/v1/workspaces/${workspaceId}`;
  try {
    const [workspace, locations, trainers, classes] = await Promise.all([
      fetchFn(base),
      fetchFn(`${base}/locations`),
      fetchFn(`${base}/trainers`),
      fetchFn(`${base}/group-classes`),
    ]);
    const answers = [workspace, locations, trainers, classes];
    if (answers.some(({ status }) => [401, 403, 404].includes(status))) {
      return { ok: false, reason: 'home' };
    }
    if (answers.some(({ status }) => status !== 200)) return { ok: false, reason: 'failed' };
    const { timeZone } = (await workspace.json()) as Schemas['Workspace'];
    const places = (await locations.json()) as Schemas['Location'][];
    const location = places.find(({ isDefault }) => isDefault) ?? places[0];
    if (!timeZone || !location) return { ok: false, reason: 'failed' };
    const trainerList = (await trainers.json()) as Trainer[];
    return {
      ok: true,
      context: {
        timeZone,
        locationName: location.name,
        trainers: trainerList,
        classes: (await classes.json()) as GroupClass[],
        myTrainerId: trainerList.find(({ id }) => id === teamMemberId)?.id ?? null,
      },
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export type TrainersResult =
  | { ok: true; trainers: Trainer[] }
  | { ok: false; reason: 'home' | 'failed' };

/** Reads the workspace's trainers (`GET …/trainers`), for the form of a new class. */
export async function loadTrainers(
  workspaceId: string,
  fetchFn: typeof fetch = fetch,
): Promise<TrainersResult> {
  try {
    const answer = await fetchFn(`/api/v1/workspaces/${workspaceId}/trainers`);
    if ([401, 403, 404].includes(answer.status)) return { ok: false, reason: 'home' };
    if (answer.status !== 200) return { ok: false, reason: 'failed' };
    return { ok: true, trainers: (await answer.json()) as Trainer[] };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
