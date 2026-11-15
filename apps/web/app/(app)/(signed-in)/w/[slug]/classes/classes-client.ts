import type { Schemas } from '@fivvi/contract';
import { GROUP_CLASS_LIMITS as LIMITS } from '@fivvi/domain/group-class-limits';

export type GroupClass = Schemas['GroupClass'];
export type Session = Schemas['Session'];
export type Trainer = Schemas['Trainer'];

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
export type DateErrorKey = 'invalidDate';
export type StartErrorKey = 'timeDoesNotExist' | 'invalidTime';
/** The `classes.edit.errors.*` keys of CO-04's end. */
export type EndErrorKey = 'endBeforeStart' | 'timeDoesNotExist' | 'invalidTime';

/** The refusals every call shares. */
type Refused =
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
  | { ok: true; session: Session }
  | {
      ok: false;
      reason: 'fields';
      date?: DateErrorKey;
      start?: StartErrorKey;
      capacity?: 'capacityInvalid';
    }
  | Refused;

export type EditDateResult =
  | { ok: true; session: Session }
  /** `class_date_changed`: someone changed the date first; `session` is the date as it is now. */
  | { ok: false; reason: 'conflict'; session: Session }
  | {
      ok: false;
      reason: 'fields';
      start?: StartErrorKey;
      end?: EndErrorKey;
      capacity?: 'capacityInvalid';
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
  const answered = await send(
    'POST',
    `/api/v1/workspaces/${workspaceId}/group-classes/${classId}/dates`,
    body,
    fetchFn,
  );
  if ('failed' in answered) return answered.failed;
  if (answered.status === 201) {
    const session = answered.body as Session | null;
    if (!session?.id) return { ok: false, reason: 'generic' };
    return { ok: true, session };
  }
  if (answered.status === 400) {
    const refused: Extract<ScheduleResult, { reason: 'fields' }> = { ok: false, reason: 'fields' };
    for (const { path, code } of issuesOf(answered.body)) {
      if (path === 'localDate') refused.date = 'invalidDate';
      if (path === 'localStart') {
        refused.start = code === 'time_does_not_exist' ? 'timeDoesNotExist' : 'invalidTime';
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
  const answered = await send(
    'PATCH',
    `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}`,
    body,
    fetchFn,
  );
  if ('failed' in answered) return answered.failed;
  if (answered.status === 200) {
    const session = answered.body as Session | null;
    if (!session?.id) return { ok: false, reason: 'generic' };
    return { ok: true, session };
  }
  if (answered.status === 409) {
    const conflict = answered.body as Schemas['ClassDateChanged'] | null;
    if (!conflict?.session) return { ok: false, reason: 'generic' };
    return { ok: false, reason: 'conflict', session: conflict.session };
  }
  if (answered.status === 400) {
    const refused: Extract<EditDateResult, { reason: 'fields' }> = { ok: false, reason: 'fields' };
    for (const { path, code } of issuesOf(answered.body)) {
      if (path === 'localStart') {
        refused.start = code === 'time_does_not_exist' ? 'timeDoesNotExist' : 'invalidTime';
      }
      if (path === 'localEnd') {
        refused.end =
          code === 'end_before_start'
            ? 'endBeforeStart'
            : code === 'time_does_not_exist'
              ? 'timeDoesNotExist'
              : 'invalidTime';
      }
      if (path === 'capacity') refused.capacity = 'capacityInvalid';
    }
    if (refused.start || refused.end || refused.capacity) return refused;
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
}

export type ScheduleContextResult =
  | { ok: true; context: ScheduleContext }
  | { ok: false; reason: 'home' | 'failed' };

/**
 * Reads what the scheduling form shows: the time zone (`GET …/workspaces/{id}`), the default
 * location (`GET …/locations`), the trainers (`GET …/trainers`) and the classes
 * (`GET …/group-classes`).
 */
export async function loadScheduleContext(
  workspaceId: string,
  fetchFn: typeof fetch = fetch,
): Promise<ScheduleContextResult> {
  const base = `/api/v1/workspaces/${workspaceId}`;
  try {
    const answers = await Promise.all([
      fetchFn(base),
      fetchFn(`${base}/locations`),
      fetchFn(`${base}/trainers`),
      fetchFn(`${base}/group-classes`),
    ]);
    if (answers.some(({ status }) => [401, 403, 404].includes(status))) {
      return { ok: false, reason: 'home' };
    }
    if (answers.some(({ status }) => status !== 200)) return { ok: false, reason: 'failed' };
    const [workspace, locations, trainers, classes] = answers as [
      Response,
      Response,
      Response,
      Response,
    ];
    const { timeZone } = (await workspace.json()) as Schemas['Workspace'];
    const places = (await locations.json()) as Schemas['Location'][];
    const location = places.find(({ isDefault }) => isDefault) ?? places[0];
    if (!timeZone || !location) return { ok: false, reason: 'failed' };
    return {
      ok: true,
      context: {
        timeZone,
        locationName: location.name,
        trainers: (await trainers.json()) as Trainer[],
        classes: (await classes.json()) as GroupClass[],
      },
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
