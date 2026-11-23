import { type TrainerWord, trainerWordForms } from '@fivvi/i18n';
import { Text } from 'react-email';
import { textStyle } from '../components/layout.tsx';
import type { EmailTemplate } from '../render.tsx';

export interface PrivateSessionCancelledEmailProps {
  /** The name of the workspace the session was planned at. */
  workspaceName: string;
  /** When the session was planned: it is shown so the client knows which one is meant. */
  startsAt: Date;
  endsAt: Date;
  locationName: string;
  /** The address as one line, or `null` when the location has none. */
  locationAddress: string | null;
  /** The trainer's name, or `null` when the account has none: the line is left out. */
  trainerName: string | null;
  /** The workspace's word for the people who teach, as it is when the email is sent (F068). */
  trainerWord: TrainerWord;
}

/**
 * EM-05, the private-session variant: "Je sessie op {date} om {time} is geannuleerd" / "Your
 * session on {date} at {time} has been cancelled" (F026): the client's notice that a private session
 * is cancelled, with the date, the time, the location and the trainer it had. It names no other
 * participant (a duo's second client is not mentioned) and no email address, and has no booking
 * link (the class variant's link to the timetable waits for F027). The dates and times are in the
 * workspace's time zone and the recipient's language, decided by the sender (`confirmationLanguage`
 * in `@fivvi/domain`). Says *sessie*, as EM-04 does.
 */
export const privateSessionCancelledEmail: EmailTemplate<PrivateSessionCancelledEmailProps> = {
  id: 'private-session-cancelled',
  subject: (ctx, { startsAt }) =>
    ctx.t('email.privateSessionCancelled.subject', {
      date: ctx.formatDateTime(startsAt, 'date'),
      time: ctx.formatDateTime(startsAt, 'time'),
    }),
  preview: (ctx, { workspaceName }) =>
    ctx.t('email.privateSessionCancelled.preview', { workspace: workspaceName }),
  render: (
    ctx,
    { workspaceName, startsAt, endsAt, locationName, locationAddress, trainerName, trainerWord },
  ) => (
    <>
      <Text style={textStyle}>
        {ctx.t('email.privateSessionCancelled.intro', { workspace: workspaceName })}
      </Text>
      <Text style={textStyle}>
        {ctx.t('email.privateSessionCancelled.when', {
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
          {ctx.t('email.privateSession.trainer', {
            trainer: trainerName,
            ...trainerWordForms(trainerWord, ctx.locale),
          })}
        </Text>
      ) : null}
    </>
  ),
  frame: { kind: 'client', workspaceName: (props) => props.workspaceName },
  userContent: ['workspaceName', 'locationName', 'locationAddress', 'trainerName'],
  previewProps: {
    workspaceName: 'John’s Gym',
    startsAt: new Date('2026-09-24T07:00:00Z'),
    endsAt: new Date('2026-09-24T08:00:00Z'),
    locationName: 'John’s Gym',
    locationAddress: 'Voorbeeldstraat 1, 1234 AB Amsterdam',
    trainerName: 'Sarah',
    trainerWord: 'trainer',
  },
};
