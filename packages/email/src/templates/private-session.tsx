import { Text } from 'react-email';
import { textStyle } from '../components/layout.tsx';
import type { EmailTemplate } from '../render.tsx';

export interface PrivateSessionEmailProps {
  /** The name of the workspace the session is planned at. */
  workspaceName: string;
  startsAt: Date;
  endsAt: Date;
  locationName: string;
  /** The address as one line, or `null` when the location has none. */
  locationAddress: string | null;
  /** The trainer's name, or `null` when the account has none: the line is left out. */
  trainerName: string | null;
}

/**
 * EM-11 "Nieuwe afspraak: {date} om {time}" / "New appointment: {date} at {time}" (F020): the
 * client's confirmation of a private session, with the date, the time, the location and the
 * trainer. "Afspraak" is the subject only (the glossary: the UI says *privésessie*); the date and
 * the times are in the workspace's time zone and the recipient's language, decided by the sender
 * (`confirmationLanguage` in `@fivvi/domain`).
 */
export const privateSessionEmail: EmailTemplate<PrivateSessionEmailProps> = {
  id: 'private-session',
  subject: (ctx, { startsAt }) =>
    ctx.t('email.privateSession.subject', {
      date: ctx.formatDateTime(startsAt, 'date'),
      time: ctx.formatDateTime(startsAt, 'time'),
    }),
  preview: (ctx, { startsAt }) =>
    ctx.t('email.privateSession.preview', {
      date: ctx.formatDateTime(startsAt, 'date'),
      time: ctx.formatDateTime(startsAt, 'time'),
    }),
  render: (
    ctx,
    { workspaceName, startsAt, endsAt, locationName, locationAddress, trainerName },
  ) => (
    <>
      <Text style={textStyle}>
        {ctx.t('email.privateSession.intro', { workspace: workspaceName })}
      </Text>
      <Text style={textStyle}>
        {ctx.t('email.privateSession.when', {
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
  previewProps: {
    workspaceName: 'John’s Gym',
    startsAt: new Date('2026-09-24T07:00:00Z'),
    endsAt: new Date('2026-09-24T08:00:00Z'),
    locationName: 'John’s Gym',
    locationAddress: 'Voorbeeldstraat 1, 1234 AB Amsterdam',
    trainerName: 'Sarah',
  },
};
