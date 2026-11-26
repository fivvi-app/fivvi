'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { Button } from '@fivvi/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { SuccessLine } from '@fivvi/ui/kit/success-line';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useSessionFormat } from '../sessions/use-session-format';
import {
  type Attendance,
  type AttendanceParticipant,
  type AttendanceResult,
  attendanceState,
  type MarkableStatus,
  markEveryoneAttended,
  setAttendance,
} from './attendance-client';

/** The three states a tap sets, in the order of the radio group: *Geboekt · Aanwezig · Niet verschenen*. */
const CHOICES = [
  { status: 'booked', key: 'booked' },
  { status: 'attended', key: 'attended' },
  { status: 'no_show', key: 'noShow' },
] as const satisfies readonly { status: MarkableStatus; key: string }[];

/**
 * Attendance of a session on the web (F025): CO-06 on CO-01 for a class date and the section of
 * the private session page. Per participant a radio group *Geboekt · Aanwezig · Niet verschenen*
 * (the arrow keys change it) that saves as it changes, with *Opgeslagen* in the row; for a class
 * date the summary "5 aanwezig · 1 niet verschenen · 1 open" above it and *Iedereen aanwezig* in
 * the header. Before the API's `attendanceOpensAt` the radios are disabled with "Aanwezigheid kun
 * je invullen vanaf {time}."; a cancelled session shows "… geannuleerd. Aanwezigheid is niet
 * nodig." and nothing to tap; a cancelled participant is listed as *Geannuleerd* and stays so.
 * Every rule is the API's (who, when, what): this screen words its answers. Participants are
 * names and statuses only.
 */
export function AttendanceSection({
  workspaceId,
  sessionId,
  kind,
  timeZone,
  initial,
  now,
}: {
  workspaceId: string;
  sessionId: string;
  kind: 'private' | 'group';
  timeZone: string;
  /** `GET …/participants` as the page read it. */
  initial: Attendance;
  /** The moment the page was drawn, an ISO instant: before or after `attendanceOpensAt`. */
  now: string;
}) {
  const t = useTranslations('attendance');
  const router = useRouter();
  const when = useSessionFormat(timeZone);
  const [data, setData] = useState(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ clientId?: string; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  // A tap before the page hydrates would only tick the radio and save nothing.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  // The server renders again (`router.refresh`) with a new `initial`: show what it says.
  useEffect(() => setData(initial), [initial]);

  const state = attendanceState(data, new Date(now));
  const cancelledText = kind === 'group' ? t('cancelledClass') : t('cancelledSession');
  const open = state === 'open' && data.canTakeAttendance;
  const places = data.participants.filter(({ status }) => status !== 'cancelled');

  /** Words a refusal; one that says the page is out of date asks the server again. */
  function refused(result: Extract<AttendanceResult, { ok: false }>, clientId?: string) {
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'sessionCancelled' || result.reason === 'tooEarly') router.refresh();
    const message =
      result.reason === 'tooEarly'
        ? t('tooEarly', { time: when.time(result.opensAt) })
        : result.reason === 'sessionCancelled'
          ? cancelledText
          : result.reason === 'participantCancelled'
            ? t('errors.participantCancelled')
            : t(`errors.${result.reason}`);
    setFailure({ ...(clientId ? { clientId } : {}), message });
  }

  async function choose(participant: AttendanceParticipant, status: MarkableStatus) {
    // One save at a time; the group stays enabled, so the keyboard focus stays on the choice.
    if (pending || participant.status === status) return;
    const before = data;
    setData({
      ...data,
      participants: data.participants.map((one) =>
        one.clientId === participant.clientId ? { ...one, status } : one,
      ),
    });
    setPending(true);
    setFailure(null);
    setSaved(null);
    const result = await setAttendance(workspaceId, sessionId, participant.clientId, status);
    setPending(false);
    if (result.ok) {
      setData(result.attendance);
      return setSaved(participant.clientId);
    }
    setData(before);
    refused(result, participant.clientId);
  }

  async function everyone() {
    if (pending) return;
    setPending(true);
    setFailure(null);
    setSaved(null);
    const result = await markEveryoneAttended(workspaceId, sessionId);
    setPending(false);
    if (result.ok) return setData(result.attendance);
    refused(result);
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>
          <h2 className="text-[15px] font-semibold">
            {kind === 'group' ? `${t('participants')} · ${t('title')}` : t('title')}
          </h2>
        </CardTitle>
        {kind === 'group' && open && places.length > 0 ? (
          <Button variant="outline" disabled={!ready} onClick={everyone}>
            {t('everyone')}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        {state === 'cancelled' ? (
          <p className="text-sm font-semibold">{cancelledText}</p>
        ) : (
          <>
            {kind === 'group' ? (
              <p role="status" className="text-sm font-medium">
                {t('summary', {
                  attended: data.summary.attended,
                  noShow: data.summary.noShow,
                  open: data.summary.open,
                })}
              </p>
            ) : null}
            {state === 'tooEarly' ? (
              <p className="text-sm text-muted-foreground">
                {t('tooEarly', { time: when.time(data.attendanceOpensAt) })}
              </p>
            ) : null}
            <ul className="grid gap-2">
              {data.participants.map((participant) => (
                <li
                  key={participant.clientId}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
                >
                  <span className="min-w-0 text-sm font-medium">{participant.name}</span>
                  {participant.status === 'cancelled' ? (
                    <span className="text-sm text-muted-foreground">{t('status.cancelled')}</span>
                  ) : (
                    <fieldset
                      disabled={!ready || !open}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <legend className="sr-only">
                        {t('groupLabel', { name: participant.name })}
                      </legend>
                      <span className="flex overflow-hidden rounded-[10px] border border-border">
                        {CHOICES.map(({ status, key }) => (
                          <label
                            key={status}
                            className="relative flex min-h-11 cursor-pointer items-center border-s px-3 text-sm first:border-s-0 has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:disabled]:cursor-default has-[:disabled]:opacity-60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
                          >
                            <input
                              type="radio"
                              name={`attendance-${participant.clientId}`}
                              value={status}
                              checked={participant.status === status}
                              onChange={() => choose(participant, status)}
                              className="sr-only"
                            />
                            {t(`status.${key}`)}
                          </label>
                        ))}
                      </span>
                      {saved === participant.clientId ? (
                        <SuccessLine>{t('saved')}</SuccessLine>
                      ) : null}
                    </fieldset>
                  )}
                  {failure?.clientId === participant.clientId ? (
                    <ErrorLine className="basis-full">{failure.message}</ErrorLine>
                  ) : null}
                </li>
              ))}
            </ul>
            {failure && !failure.clientId ? <ErrorLine>{failure.message}</ErrorLine> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
