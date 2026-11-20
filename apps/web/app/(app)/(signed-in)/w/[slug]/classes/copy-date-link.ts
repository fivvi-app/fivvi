import { createBookingLink, type Refused } from '../booking-links/booking-links-client';

/**
 * The short link of one class date, in the visitor's language (the API's `booking_link.copy`, F037
 * AC8): the same call gets the link and, the first time, makes it. The Owner and the Trainers may.
 */
export async function copyDateLink(
  workspaceId: string,
  sessionId: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; url: string } | Refused> {
  const made = await createBookingLink(
    workspaceId,
    { scope: 'session', language: 'visitor', sessionId },
    fetchFn,
  );
  return made.ok ? { ok: true, url: made.link.url } : made;
}

/**
 * The short link of a class date, put on the clipboard (F037 AC8). Where the browser has clipboard
 * items (Chrome, Safari, Firefox) the request runs inside the item, so the copy still belongs to
 * the click that started it (Safari refuses a write that comes after a network wait); elsewhere the
 * link is asked for first and then written. `copy` says the clipboard refused.
 */
export async function copyDateLinkToClipboard(
  workspaceId: string,
  sessionId: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; url: string } | Refused | { ok: false; reason: 'copy' }> {
  type Answer = Awaited<ReturnType<typeof copyDateLink>>;
  const asked: { answer?: Answer } = {};
  const ask = async () => {
    asked.answer = await copyDateLink(workspaceId, sessionId, fetchFn);
    return asked.answer;
  };
  let copied = false;
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        'text/plain': ask().then((answer) => {
          if (!answer.ok) throw new Error(answer.reason);
          return new Blob([answer.url], { type: 'text/plain' });
        }),
      });
      await navigator.clipboard.write([item]);
      copied = true;
    } else {
      const answer = await ask();
      if (answer.ok) {
        await navigator.clipboard.writeText(answer.url);
        copied = true;
      }
    }
  } catch {
    // Either the request was refused (said below) or the clipboard refused.
  }
  const { answer } = asked;
  if (answer && !answer.ok) return answer;
  return answer?.ok && copied ? answer : { ok: false, reason: 'copy' };
}

/**
 * Whether a class date has **Boekingslink kopiëren** (CO-01, F037): a class date that is still
 * scheduled and has not started. Never a cancelled or past date, and never a private session
 * (`PRODUCT.md §15`, §17). The API refuses the same dates; this keeps the button off them.
 */
export function offersBookingLink(
  session: { type: string; status: string; startsAt: string },
  now: Date,
): boolean {
  return (
    session.type === 'group' && session.status === 'scheduled' && new Date(session.startsAt) > now
  );
}
