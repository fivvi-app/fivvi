import type { Schemas } from '@fivvi/contract';
import { addDays, localDateOf } from '@fivvi/domain/zoned-time';

export type BookingLink = Schemas['BookingLink'];
export type CreateBookingLink = Pick<Schemas['CreateBookingLinkRequest'], 'scope' | 'language'> & {
  groupClassId?: string;
  sessionId?: string;
};

/** Why a call did not go through, in the words the screens use. */
export type Refused =
  /** Not signed in: the signed-in home knows where this person belongs. */
  | { ok: false; reason: 'home' }
  /** The person may not do this (any more). */
  | { ok: false; reason: 'forbidden' }
  | { ok: false; reason: 'noConnection' | 'generic' };

function refusal(status: number): Refused {
  if (status === 401) return { ok: false, reason: 'home' };
  if (status === 403) return { ok: false, reason: 'forbidden' };
  return { ok: false, reason: 'generic' };
}

async function call(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch,
): Promise<{ status: number; body: unknown } | { failed: Refused }> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch {
    return { failed: { ok: false, reason: 'noConnection' } };
  }
  return { status: response.status, body: await response.json().catch(() => null) };
}

const linksUrl = (workspaceId: string) => `/api/v1/workspaces/${workspaceId}/booking-links`;

const isLink = (body: unknown): body is BookingLink =>
  typeof (body as BookingLink | null)?.id === 'string' &&
  typeof (body as BookingLink).url === 'string';

/**
 * The booking links of the workspace (`GET /api/v1/workspaces/{workspaceId}/booking-links`, F037),
 * in the API's order: the standing links first, then the others, the deactivated ones last. The
 * page reads them again after a change, so it shows what the API holds.
 */
export async function listBookingLinks(
  workspaceId: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; links: BookingLink[] } | Refused> {
  const answered = await call(linksUrl(workspaceId), { method: 'GET' }, fetchFn);
  if ('failed' in answered) return answered.failed;
  if (answered.status !== 200) return refusal(answered.status);
  const links = (answered.body as { links?: unknown } | null)?.links;
  return Array.isArray(links)
    ? { ok: true, links: links as BookingLink[] }
    : { ok: false, reason: 'generic' };
}

/**
 * Gets or makes a booking link (`POST …/booking-links`, F037 AC2): `201` is a new link, `200` the
 * active link of the same scope, target and language that already existed. The API decides who
 * may make which link; a `403` is `forbidden`.
 */
export async function createBookingLink(
  workspaceId: string,
  input: CreateBookingLink,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; link: BookingLink; created: boolean } | Refused> {
  const answered = await call(
    linksUrl(workspaceId),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    fetchFn,
  );
  if ('failed' in answered) return answered.failed;
  if ((answered.status !== 200 && answered.status !== 201) || !isLink(answered.body)) {
    return refusal(answered.status);
  }
  return { ok: true, link: answered.body, created: answered.status === 201 };
}

/** Stops a link for good (`POST …/booking-links/{linkId}/deactivate`, the Owner, F037 AC7). */
export async function deactivateBookingLink(
  workspaceId: string,
  linkId: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; link: BookingLink } | Refused> {
  const answered = await call(
    `${linksUrl(workspaceId)}/${linkId}/deactivate`,
    { method: 'POST' },
    fetchFn,
  );
  if ('failed' in answered) return answered.failed;
  if (answered.status !== 200 || !isLink(answered.body)) return refusal(answered.status);
  return { ok: true, link: answered.body };
}

/** A date of a class the *Eén les op een datum* picker offers. */
export interface ClassDate {
  id: string;
  /** The start, a UTC instant. */
  startsAt: string;
  /** The workspace's time zone: the date is written in it. */
  timeZone: string;
}

/** The longest range the calendar read answers: more than 42 days is a `400` (`range_too_long`). */
const RANGE_DAYS = 42;
/** The calendar holds a class's dates 12 weeks ahead (F022): two windows of its longest range reach them. */
const WINDOWS = 2;

/**
 * The upcoming dates of one class, for the **Eén les op een datum** picker (F037, #1519): the
 * workspace calendar (`GET …/calendar`, `groupClassId`, cancelled dates left out) from today on the
 * workspace's wall clock, in as many windows as the 12 weeks need (a window is 42 days at most), then
 * the dates that have not begun, in time order. The API decides what a date is; this only asks.
 */
export async function listClassDates(
  workspaceId: string,
  groupClassId: string,
  timeZone: string,
  fetchFn: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<{ ok: true; dates: ClassDate[] } | Refused> {
  const today = localDateOf(now, timeZone);
  const windows = Array.from({ length: WINDOWS }, (_, index) => ({
    from: addDays(today, index * RANGE_DAYS),
    to: addDays(today, (index + 1) * RANGE_DAYS - 1),
  }));
  const answers = await Promise.all(
    windows.map(({ from, to }) =>
      call(
        `/api/v1/workspaces/${workspaceId}/calendar?${new URLSearchParams({
          from,
          to,
          groupClassId,
          includeCancelled: 'false',
        })}`,
        { method: 'GET' },
        fetchFn,
      ),
    ),
  );
  const dates: ClassDate[] = [];
  for (const answered of answers) {
    if ('failed' in answered) return answered.failed;
    if (answered.status !== 200) return refusal(answered.status);
    const items = (answered.body as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) return { ok: false, reason: 'generic' };
    for (const {
      id,
      status,
      startsAt,
      timeZone: zone,
    } of items as Schemas['WorkspaceCalendarSession'][]) {
      if (status === 'scheduled' && Date.parse(startsAt) > now.getTime()) {
        dates.push({ id, startsAt, timeZone: zone });
      }
    }
  }
  return { ok: true, dates };
}
