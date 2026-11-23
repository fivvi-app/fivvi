import { type TrainerWord, trainerWordForms } from '@fivvi/i18n';
import { Text } from 'react-email';
import { textStyle } from '../components/layout.tsx';
import type { EmailContext, EmailTemplate } from '../render.tsx';

/** One date the new trainer takes over: when it is and, only if it is held elsewhere, where. */
export interface TrainerChangeEmailDate {
  startsAt: Date;
  endsAt: Date;
  /** The place as one line, only for a date held somewhere other than `location`. */
  elsewhere?: string;
}

export interface TrainerChangeEmailProps {
  /** The name of the workspace the session or class belongs to. */
  workspaceName: string;
  /** A private session, or a class (one or more of its dates). */
  kind: 'private' | 'class';
  /** The Dutch and the English name of the class; `null` for a private session. */
  className: string | null;
  classNameEn: string | null;
  /** Where the dates are held, as one line: the location's name and address. */
  location: string;
  /** The affected dates, soonest first; at least one. A private session has one. */
  dates: readonly TrainerChangeEmailDate[];
  /** The new trainer's name, or `null` when the account has none: the line is left out. */
  trainerName: string | null;
  /** The workspace's word for the people who teach, as it is when the email is sent (F068). */
  trainerWord: TrainerWord;
}

/** The class as the recipient reads it: the English name when they read English and there is one. */
const classOf = (ctx: EmailContext, { className, classNameEn }: TrainerChangeEmailProps) =>
  ctx.pickContent(className ?? '', classNameEn);

/** The values every message here shares: the workspace's word for the role in the reader's language. */
const wordOf = (ctx: EmailContext, { trainerWord }: TrainerChangeEmailProps) =>
  trainerWordForms(trainerWord, ctx.locale);

/**
 * EM-13 "Andere trainer: je sessie op {date}" / "New trainer: your session on {date}" (F023, owner
 * decision of 4 November 2026): the client's notice that the trainer of their private session, or
 * of the class dates they are booked on, changed. A private session names its date; a class names
 * the class and its date, or, when several dates changed (*Deze en alle volgende lessen*), the first
 * date and every date below, so each participant gets one email. It names the new trainer and
 * nothing else about the team: no email address, no other participant. F024 sends the same email
 * for a substitution. The dates and times are in the workspace's time zone and the recipient's
 * language, decided by the sender (`confirmationLanguage` in `@fivvi/domain`). The role is the
 * workspace's word (F068), so the subject says "Andere instructeur" for a workspace that uses it (F068: no message says *trainer* literally).
 */
export const trainerChangeEmail: EmailTemplate<TrainerChangeEmailProps> = {
  id: 'trainer-change',
  subject: (ctx, props) => {
    const first = props.dates[0];
    const date = first ? ctx.formatDateTime(first.startsAt, 'date') : '';
    const key =
      props.kind === 'private'
        ? 'email.trainerChange.privateSubject'
        : props.dates.length > 1
          ? 'email.trainerChange.classDatesSubject'
          : 'email.trainerChange.classSubject';
    return ctx.t(key, { class: classOf(ctx, props), date, ...wordOf(ctx, props) });
  },
  preview: (ctx, props) => {
    const first = props.dates[0];
    const date = first ? ctx.formatDateTime(first.startsAt, 'date') : '';
    const key =
      props.kind === 'private'
        ? 'email.trainerChange.privatePreview'
        : props.dates.length > 1
          ? 'email.trainerChange.classDatesPreview'
          : 'email.trainerChange.classPreview';
    return ctx.t(key, { class: classOf(ctx, props), date, ...wordOf(ctx, props) });
  },
  render: (ctx, props) => {
    const { workspaceName, kind, location, dates, trainerName } = props;
    const several = dates.length > 1;
    const when = (date: TrainerChangeEmailDate) => ({
      date: ctx.formatDateTime(date.startsAt, 'dateWithYear'),
      start: ctx.formatDateTime(date.startsAt, 'time'),
      end: ctx.formatDateTime(date.endsAt, 'time'),
    });
    return (
      <>
        <Text style={textStyle}>
          {ctx.t(
            kind === 'private'
              ? 'email.trainerChange.privateIntro'
              : 'email.trainerChange.classIntro',
            { workspace: workspaceName, class: classOf(ctx, props), ...wordOf(ctx, props) },
          )}
        </Text>
        {several ? (
          <>
            <Text style={textStyle}>{ctx.t('email.trainerChange.datesIntro')}</Text>
            {dates.map((date) => (
              <Text key={date.startsAt.toISOString()} style={textStyle}>
                {date.elsewhere
                  ? ctx.t('email.trainerChange.dateElsewhere', {
                      ...when(date),
                      location: date.elsewhere,
                    })
                  : ctx.t('email.trainerChange.dateLine', when(date))}
              </Text>
            ))}
          </>
        ) : (
          dates.map((date) => (
            <Text key={date.startsAt.toISOString()} style={textStyle}>
              {ctx.t('email.trainerChange.when', when(date))}
            </Text>
          ))
        )}
        <Text style={textStyle}>{ctx.t('email.trainerChange.where', { location })}</Text>
        {trainerName ? (
          <Text style={textStyle}>
            {ctx.t('email.trainerChange.trainerNow', { trainer: trainerName })}
          </Text>
        ) : null}
        <Text style={textStyle}>{ctx.t('email.trainerChange.nothingElse')}</Text>
      </>
    );
  },
  frame: { kind: 'client', workspaceName: (props) => props.workspaceName },
  userContent: ['workspaceName', 'location', 'trainerName', { nl: 'className', en: 'classNameEn' }],
  previewProps: {
    workspaceName: 'John’s Gym',
    kind: 'class',
    className: 'Kracht',
    classNameEn: 'Strength',
    location: 'John’s Gym, Voorbeeldstraat 1, 1234 AB Amsterdam',
    dates: [
      {
        startsAt: new Date('2026-10-13T16:00:00Z'),
        endsAt: new Date('2026-10-13T17:00:00Z'),
      },
      {
        startsAt: new Date('2026-10-20T16:00:00Z'),
        endsAt: new Date('2026-10-20T17:00:00Z'),
      },
    ],
    trainerName: 'Tom',
    trainerWord: 'trainer',
  },
};
