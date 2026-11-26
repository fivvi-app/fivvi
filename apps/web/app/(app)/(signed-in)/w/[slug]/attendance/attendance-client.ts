import type { Schemas } from '@fivvi/contract';

export type Attendance = Schemas['Attendance'];
export type AttendanceParticipant = Schemas['AttendanceParticipant'];
/** What a tap sets: `booked` takes it back; *Geannuleerd* comes only from cancelling. */
export type MarkableStatus = 'booked' | 'attended' | 'no_show';

export type AttendanceResult =
  | { ok: true; attendance: Attendance }
  /** Before 30 minutes ahead of the start: nothing was stored. */
  | { ok: false; reason: 'tooEarly'; opensAt: string }
  | { ok: false; reason: 'sessionCancelled' | 'participantCancelled' }
  /** Not signed in, or no longer allowed to (another trainer now): the signed-in home knows where this person belongs. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * The state of the attendance section of a session at the moment the page was drawn (F025, the
 * rules are the API's: it sends the instant attendance opens and the session's status): a
 * cancelled session needs none, before `attendanceOpensAt` it cannot be taken yet, else it is open.
 */
export function attendanceState(
  attendance: Pick<Attendance, 'status' | 'attendanceOpensAt'>,
  now: Date,
): 'cancelled' | 'tooEarly' | 'open' {
  if (attendance.status === 'cancelled') return 'cancelled';
  return now.getTime() < Date.parse(attendance.attendanceOpensAt) ? 'tooEarly' : 'open';
}

/**
 * Sets one participant's attendance (`PUT …/participants/{clientId}/attendance`, F025 AC3). Each
 * tap carries a request ID of its own, so the API stores a retried tap once. The answer is the
 * session's participants as they are now, with the counts.
 */
export function setAttendance(
  workspaceId: string,
  sessionId: string,
  clientId: string,
  status: MarkableStatus,
  fetchFn: typeof fetch = fetch,
): Promise<AttendanceResult> {
  return send(
    `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/participants/${clientId}/attendance`,
    'PUT',
    { status, clientRequestId: crypto.randomUUID() },
    fetchFn,
  );
}

/**
 * *Iedereen aanwezig* (`POST …/participants/attended`): every participant still open becomes
 * *Aanwezig*; *Niet verschenen* and cancelled ones stay as they are.
 */
export function markEveryoneAttended(
  workspaceId: string,
  sessionId: string,
  fetchFn: typeof fetch = fetch,
): Promise<AttendanceResult> {
  return send(
    `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}/participants/attended`,
    'POST',
    { clientRequestId: crypto.randomUUID() },
    fetchFn,
  );
}

async function send(
  url: string,
  method: 'PUT' | 'POST',
  body: unknown,
  fetchFn: typeof fetch,
): Promise<AttendanceResult> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  const answer: unknown = await response.json().catch(() => null);
  if (response.status === 200) return { ok: true, attendance: answer as Attendance };
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  if (response.status === 409) {
    const { code } = (answer ?? {}) as Partial<Schemas['AttendanceRefusal']>;
    if (code === 'session_cancelled') return { ok: false, reason: 'sessionCancelled' };
    if (code === 'participant_cancelled') return { ok: false, reason: 'participantCancelled' };
  }
  if (response.status === 422) {
    const { code, opensAt } = (answer ?? {}) as Partial<Schemas['AttendanceTooEarly']>;
    if (code === 'attendance_too_early' && opensAt)
      return { ok: false, reason: 'tooEarly', opensAt };
  }
  return { ok: false, reason: 'generic' };
}
