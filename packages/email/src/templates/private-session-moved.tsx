import { Text } from 'react-email';
import { textStyle } from '../components/layout.tsx';
import type { EmailContext, EmailTemplate } from '../render.tsx';

export interface PrivateSessionMovedEmailProps {
  /** The name of the workspace the session is planned at. */
  workspaceName: string;
  /** Where the session was before it moved. */
  previousStartsAt: Date;
  previousEndsAt: Date;
  /** Where it is now. */
  startsAt: Date;
  endsAt: Date;
  locationName: string;
  /** The address as one line, or `null` when the location has none. */
  locationAddress: string | null;
  /** The trainer's name, or `null` when the account has none: the line is left out. */
  trainerName: string | null;
}

/** "donderdag 24 september om 09:00": the day and the time, for the subject (a move can stay on its day). */
function dayAndTime(ctx: EmailContext, instant: Date): string {
  return ctx.t('email.privateSessionMoved.dateTime', {
    date: ctx.formatDateTime(instant, 'date'),
    time: ctx.formatDateTime(instant, 'time'),
  });
}

/**
 * EM-04 "Wijziging: je sessie is verplaatst naar {newDate}" / "Change: your session has moved to
 * {newDate}" (F020): the client's notice that a private session moved, with the old and the new
 * date and time in the body (the subject names only the new one: with both it passed 78
 * characters, F049 AC2), the location and the trainer. The dates and times are
 * in the workspace's time zone and the recipient's language, decided by the sender
 * (`confirmationLanguage` in `@fivvi/domain`). It follows EM-11, which says *afspraak* in the
 * subject only; this one says *sessie*, as the spec words it.
 */
export const privateSessionMovedEmail: EmailTemplate<PrivateSessionMovedEmailProps> = {
  id: 'private-session-moved',
  subject: (ctx, { startsAt }) =>
    ctx.t('email.privateSessionMoved.subject', { newDate: dayAndTime(ctx, startsAt) }),
  preview: (ctx, { startsAt }) =>
    ctx.t('email.privateSessionMoved.preview', { newDate: dayAndTime(ctx, startsAt) }),
  render: (
    ctx,
    {
      workspaceName,
      previousStartsAt,
      previousEndsAt,
      startsAt,
      endsAt,
      locationName,
      locationAddress,
      trainerName,
    },
  ) => (
    <>
      <Text style={textStyle}>
        {ctx.t('email.privateSessionMoved.intro', { workspace: workspaceName })}
      </Text>
      <Text style={textStyle}>
        {ctx.t('email.privateSessionMoved.previously', {
          date: ctx.formatDateTime(previousStartsAt, 'dateWithYear'),
          start: ctx.formatDateTime(previousStartsAt, 'time'),
          end: ctx.formatDateTime(previousEndsAt, 'time'),
        })}
      </Text>
      <Text style={textStyle}>
        {ctx.t('email.privateSessionMoved.now', {
          date: ctx.formatDateTime(startsAt, 'dateWithYear'),
          start: ctx.formatDateTime(startsAt, 'time'),
          end: ctx.formatDateTime(endsAt, 'time'),
        })}
      </Text>
      <Text style={textStyle}>
        {ctx.t('email.privateSession.where', {
          location: locationAddress ? `${locationName}, ${locationAddress}` : locationName,
        })}
      </Text>
      {trainerName ? (
        <Text style={textStyle}>
          {ctx.t('email.privateSession.trainer', { trainer: trainerName })}
        </Text>
      ) : null}
    </>
  ),
  frame: { kind: 'client', workspaceName: (props) => props.workspaceName },
  userContent: ['workspaceName', 'locationName', 'locationAddress', 'trainerName'],
  previewProps: {
    workspaceName: 'John’s Gym',
    previousStartsAt: new Date('2026-09-24T07:00:00Z'),
    previousEndsAt: new Date('2026-09-24T08:00:00Z'),
    startsAt: new Date('2026-09-25T08:00:00Z'),
    endsAt: new Date('2026-09-25T09:00:00Z'),
    locationName: 'John’s Gym',
    locationAddress: 'Voorbeeldstraat 1, 1234 AB Amsterdam',
    trainerName: 'Sarah',
  },
};
