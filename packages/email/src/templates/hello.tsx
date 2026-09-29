import { Text } from 'react-email';
import { textStyle } from '../components/layout.tsx';
import type { EmailTemplate } from '../render.tsx';

export interface HelloEmailProps {
  /** The recipient's first name, as entered. Without it the greeting has no name. */
  firstName?: string;
  /** When the email was sent. Shown in the recipient's time zone. */
  sentAt: Date;
}

/**
 * Test email for G1: proves that a localized email reaches the inbox (E006).
 * Sent with `pnpm email:send-test`, never to clients.
 */
export const helloEmail: EmailTemplate<HelloEmailProps> = {
  id: 'hello',
  subject: (ctx) => ctx.t('email.hello.subject'),
  preview: (ctx) => ctx.t('email.hello.preview'),
  render: (ctx, { firstName, sentAt }) => (
    <>
      <Text style={textStyle}>
        {firstName
          ? ctx.t('email.hello.greeting', { firstName })
          : ctx.t('email.hello.greetingWithoutName')}
      </Text>
      <Text style={textStyle}>{ctx.t('email.hello.body')}</Text>
      <Text style={textStyle}>
        {ctx.t('email.hello.sentAt', {
          date: ctx.formatDateTime(sentAt, 'dateWithYear'),
          time: ctx.formatDateTime(sentAt, 'time'),
        })}
      </Text>
    </>
  ),
  previewProps: {
    firstName: 'Anna',
    sentAt: new Date('2026-09-22T16:00:00Z'),
  },
};
