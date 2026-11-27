import { Text } from 'react-email';
import { textStyle } from '../components/layout.tsx';
import type { EmailContext, EmailTemplate } from '../render.tsx';

export interface SubstitutionEmailProps {
  /** The name of the workspace the class belongs to. */
  workspaceName: string;
  /** The workspace's URL name and the class date's ID: the button opens `/w/{slug}/sessions/{id}`. */
  workspaceSlug: string;
  sessionId: string;
  /** The Dutch and the English name of the class. */
  className: string;
  classNameEn: string | null;
  startsAt: Date;
  endsAt: Date;
  /** Where the class is held, as one line: the location's name and address. */
  location: string;
  /** The name of the trainer the person covers for, or `null` when the account has none: the line is left out. */
  originalName: string | null;
}

/** The class as the recipient reads it: the English name when they read English and there is one. */
const classOf = (ctx: EmailContext, { className, classNameEn }: SubstitutionEmailProps) =>
  ctx.pickContent(className, classNameEn);

/**
 * EM-10 "Je valt in: {class} op {date}" / "You're covering: {class} on {date}" (F024, spec #461):
 * the notice to the trainer who covers one class date for another. The class, the date, the time,
 * the location, "je valt in voor {original}" / "you're covering for {original}", the workspace and
 * a button *In Fivvi bekijken* / *View in Fivvi* to the class date. It names no participant and no
 * email address. The date and times are in the workspace's time zone and the substitute's
 * language, decided by the sender (`substitutionLanguage` in `@fivvi/domain`).
 */
export const substitutionEmail: EmailTemplate<SubstitutionEmailProps> = {
  id: 'substitution',
  subject: (ctx, props) =>
    ctx.t('email.substitution.subject', {
      class: classOf(ctx, props),
      date: ctx.formatDateTime(props.startsAt, 'date'),
    }),
  preview: (ctx, props) =>
    ctx.t('email.substitution.preview', {
      class: classOf(ctx, props),
      date: ctx.formatDateTime(props.startsAt, 'date'),
      start: ctx.formatDateTime(props.startsAt, 'time'),
    }),
  render: (ctx, props) => {
    const { workspaceName, startsAt, endsAt, location, originalName } = props;
    return (
      <>
        <Text style={textStyle}>
          {originalName
            ? ctx.t('email.substitution.intro', {
                class: classOf(ctx, props),
                workspace: workspaceName,
                original: originalName,
              })
            : ctx.t('email.substitution.introNoOriginal', {
                class: classOf(ctx, props),
                workspace: workspaceName,
              })}
        </Text>
        <Text style={textStyle}>
          {ctx.t('email.substitution.when', {
            date: ctx.formatDateTime(startsAt, 'dateWithYear'),
            start: ctx.formatDateTime(startsAt, 'time'),
            end: ctx.formatDateTime(endsAt, 'time'),
          })}
        </Text>
        <Text style={textStyle}>{ctx.t('email.substitution.where', { location })}</Text>
      </>
    );
  },
  frame: {
    kind: 'team',
    workspaceName: (props) => props.workspaceName,
    buttonLabel: 'email.substitution.button',
    buttonPath: (props) =>
      `w/${encodeURIComponent(props.workspaceSlug)}/sessions/${encodeURIComponent(props.sessionId)}`,
  },
  userContent: [
    'workspaceName',
    'location',
    'originalName',
    { nl: 'className', en: 'classNameEn' },
  ],
  previewProps: {
    workspaceName: 'John’s Gym',
    workspaceSlug: 'johns-gym',
    sessionId: '00000000-0000-4000-8000-000000000001',
    className: 'Kracht',
    classNameEn: 'Strength',
    startsAt: new Date('2026-10-20T16:00:00Z'),
    endsAt: new Date('2026-10-20T17:00:00Z'),
    location: 'John’s Gym, Voorbeeldstraat 1, 1234 AB Amsterdam',
    originalName: 'Sarah',
  },
};
