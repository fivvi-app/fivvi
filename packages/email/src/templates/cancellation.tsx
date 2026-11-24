import { emailColours } from '@fivvi/design-tokens/email-colours';
import { type TrainerWord, trainerWordForms } from '@fivvi/i18n';
import { Text } from 'react-email';
import { textStyle } from '../components/layout.tsx';
import type { EmailContext, EmailTemplate } from '../render.tsx';

export interface CancellationEmailProps {
  /** A private session, or a class date: the two variants of EM-05. */
  kind: 'private' | 'class';
  /** The name of the workspace the session or class was planned at. */
  workspaceName: string;
  /** When it was planned: shown so the client knows which one is meant. */
  startsAt: Date;
  endsAt: Date;
  locationName: string;
  /** The address as one line, or `null` when the location has none. */
  locationAddress: string | null;
  /** Private session: the trainer's name, or `null` when the account has none: the line is left out. */
  trainerName: string | null;
  /** Private session: the workspace's word for the people who teach, as it is when the email is sent (F068). */
  trainerWord: TrainerWord;
  /** Class date: the Dutch and the English name of the class; `null` for a private session. */
  className: string | null;
  classNameEn: string | null;
  /** Class date: what the Owner typed for the participants, shown as typed and never translated; `null` for none. */
  message: string | null;
}

/** The class as the recipient reads it: the English name when they read English and there is one. */
const classOf = (ctx: EmailContext, { className, classNameEn }: CancellationEmailProps) =>
  ctx.pickContent(className ?? '', classNameEn);

/** The Owner's message in a quoted block: the words as typed, line breaks kept. */
const quoteStyle = {
  ...textStyle,
  borderLeft: `3px solid ${emailColours.border}`,
  margin: '0 0 16px',
  padding: '0 0 0 12px',
  whiteSpace: 'pre-wrap',
} as const;

/**
 * EM-05, the client's notice that a booking is cancelled (F026), in two variants of one template:
 *
 * - **private session**: "Je sessie op {date} om {time} is geannuleerd" / "Your session on {date}
 *   at {time} has been cancelled", with the date, the time, the location and the trainer it had;
 *   no booking link. Says *sessie*, as EM-04 does.
 * - **class date**: "{class} op {date} gaat niet door" / "{class} on {date} is cancelled", with the
 *   class name in the reader's language, "Je boeking is geannuleerd", then, if the Owner typed one,
 *   "Bericht van {workspace}:" and the message in a quoted block, escaped and as typed, then the
 *   location. *Andere lessen bekijken* links to the client timetable once F027 exists (M5) and is
 *   left out until then.
 *
 * Neither names another participant or an email address. The dates and times are in the
 * workspace's time zone and the recipient's language, decided by the sender
 * (`confirmationLanguage` in `@fivvi/domain`).
 */
export const cancellationEmail: EmailTemplate<CancellationEmailProps> = {
  id: 'cancellation',
  subject: (ctx, props) =>
    props.kind === 'private'
      ? ctx.t('email.privateSessionCancelled.subject', {
          date: ctx.formatDateTime(props.startsAt, 'date'),
          time: ctx.formatDateTime(props.startsAt, 'time'),
        })
      : ctx.t('email.cancellation.subject', {
          class: classOf(ctx, props),
          date: ctx.formatDateTime(props.startsAt, 'date'),
        }),
  preview: (ctx, props) =>
    props.kind === 'private'
      ? ctx.t('email.privateSessionCancelled.preview', { workspace: props.workspaceName })
      : ctx.t('email.cancellation.preview', {
          class: classOf(ctx, props),
          date: ctx.formatDateTime(props.startsAt, 'date'),
          time: ctx.formatDateTime(props.startsAt, 'time'),
        }),
  render: (ctx, props) => {
    const { workspaceName, startsAt, endsAt, locationName, locationAddress } = props;
    const location = locationAddress ? `${locationName}, ${locationAddress}` : locationName;
    if (props.kind === 'class') {
      return (
        <>
          <Text style={textStyle}>
            {ctx.t('email.cancellation.intro', {
              class: classOf(ctx, props),
              date: ctx.formatDateTime(startsAt, 'dateWithYear'),
              time: ctx.formatDateTime(startsAt, 'time'),
            })}
          </Text>
          {props.message ? (
            <>
              <Text style={textStyle}>
                {ctx.t('email.cancellation.messageFrom', { workspace: workspaceName })}
              </Text>
              <Text style={quoteStyle}>{props.message}</Text>
            </>
          ) : null}
          <Text style={textStyle}>{ctx.t('email.cancellation.where', { location })}</Text>
        </>
      );
    }
    return (
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
        <Text style={textStyle}>{ctx.t('email.privateSession.where', { location })}</Text>
        {props.trainerName ? (
          <Text style={textStyle}>
            {ctx.t('email.privateSession.trainer', {
              trainer: props.trainerName,
              ...trainerWordForms(props.trainerWord, ctx.locale),
            })}
          </Text>
        ) : null}
      </>
    );
  },
  frame: { kind: 'client', workspaceName: (props) => props.workspaceName },
  // The suite fills each of these in the preview's variant (a class date), so `trainerName`, which
  // only the private-session variant shows, is left out here: its own test checks it is escaped.
  userContent: [
    'workspaceName',
    'locationName',
    'locationAddress',
    'message',
    { nl: 'className', en: 'classNameEn' },
  ],
  previewProps: {
    kind: 'class',
    workspaceName: 'John’s Gym',
    startsAt: new Date('2026-10-20T16:00:00Z'),
    endsAt: new Date('2026-10-20T17:00:00Z'),
    locationName: 'John’s Gym',
    locationAddress: 'Voorbeeldstraat 1, 1234 AB Amsterdam',
    trainerName: null,
    trainerWord: 'trainer',
    className: 'Kracht',
    classNameEn: 'Strength',
    message: 'Sarah is ziek, sorry!',
  },
};
