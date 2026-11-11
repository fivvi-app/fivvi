import { Fragment, type ReactNode } from 'react';
import { Link, Text } from 'react-email';
import { textStyle } from '../components/layout.tsx';
import type { DemoBusinessKind, DemoRequestMail, DemoTrainerCount } from '../demo-request-mail.ts';
import type { EmailContext, EmailTemplate } from '../render.tsx';

export type DemoRequestEmailProps = DemoRequestMail;

const labelStyle = { ...textStyle, fontWeight: 600, margin: 0 } as const;
const valueStyle = { ...textStyle, margin: '0 0 12px' } as const;

function businessLabel(ctx: EmailContext, kind: DemoBusinessKind): string {
  switch (kind) {
    case 'gym':
      return ctx.t('email.demoRequest.business.gym');
    case 'studio':
      return ctx.t('email.demoRequest.business.studio');
    case 'personal-trainer':
      return ctx.t('email.demoRequest.business.personalTrainer');
  }
}

function trainersLabel(ctx: EmailContext, count: DemoTrainerCount): string {
  switch (count) {
    case 'one':
      return ctx.t('email.demoRequest.trainers.one');
    case 'two-to-four':
      return ctx.t('email.demoRequest.trainers.twoToFour');
    case 'five-or-more':
      return ctx.t('email.demoRequest.trainers.fiveOrMore');
  }
}

/** A label over its value, as two short paragraphs. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <Text style={labelStyle}>{label}</Text>
      <Text style={valueStyle}>{children}</Text>
    </>
  );
}

/** The visitor's lines in order, with a line break between them. */
function Lines({ text }: { text: string }) {
  return text.split(/\r?\n/).map((line, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of text lines, never reordered
    <Fragment key={index}>
      {index > 0 ? <br /> : null}
      {line}
    </Fragment>
  ));
}

/**
 * The demo request (F064, spec #611): one email to Fivvi's own support address for each valid
 * request of the website's demo form, in the owner's language (Dutch). It lists the visitor's
 * answers and the language of the page they used, so the answer goes out in that language. The
 * visitor's address is a link to write to: the email is sent from Fivvi, so replying to it does
 * not reach the visitor. The visitor's words are text, never markup (React escapes them).
 */
export const demoRequestEmail: EmailTemplate<DemoRequestEmailProps> = {
  id: 'demo-request',
  subject: (ctx, { name }) => ctx.t('email.demoRequest.subject', { name }),
  preview: (ctx, { businessKind, trainerCount }) =>
    ctx.t('email.demoRequest.preview', {
      business: businessLabel(ctx, businessKind),
      trainers: trainersLabel(ctx, trainerCount),
    }),
  render: (ctx, { name, email, businessKind, trainerCount, message, locale }) => (
    <>
      <Text style={textStyle}>{ctx.t('email.demoRequest.intro')}</Text>
      <Row label={ctx.t('email.demoRequest.nameLabel')}>{name}</Row>
      <Row label={ctx.t('email.demoRequest.emailLabel')}>
        <Link href={`mailto:${email}`}>{email}</Link>
      </Row>
      <Row label={ctx.t('email.demoRequest.businessLabel')}>{businessLabel(ctx, businessKind)}</Row>
      <Row label={ctx.t('email.demoRequest.trainersLabel')}>{trainersLabel(ctx, trainerCount)}</Row>
      <Row label={ctx.t('email.demoRequest.languageLabel')}>
        {locale === 'en'
          ? ctx.t('email.demoRequest.languageEn')
          : ctx.t('email.demoRequest.languageNl')}
      </Row>
      {message ? (
        <Row label={ctx.t('email.demoRequest.messageLabel')}>
          <Lines text={message} />
        </Row>
      ) : null}
      <Text style={textStyle}>{ctx.t('email.demoRequest.reply')}</Text>
    </>
  ),
  userContent: ['name', 'email', 'message'],
  previewProps: {
    name: 'Anna de Vries',
    email: 'anna@example.com',
    businessKind: 'studio',
    trainerCount: 'two-to-four',
    message: 'Ik wil graag de roosters en de credits zien.',
    locale: 'nl-NL',
  },
};
