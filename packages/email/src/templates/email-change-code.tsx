import { Text } from 'react-email';
import { textStyle } from '../components/layout.tsx';
import type { EmailTemplate } from '../render.tsx';

export interface EmailChangeCodeEmailProps {
  /** The 6-digit code that confirms the new address. */
  code: string;
  /** How long the code works. */
  expiresInMinutes: number;
}

const codeStyle = {
  ...textStyle,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '32px',
  fontWeight: 700,
  letterSpacing: '6px',
  lineHeight: '40px',
} as const;

/**
 * EM-34 "Je code om je e-mailadres te wijzigen" / "Your code to change your email address"
 * (F005, spec #610; F033 reuses it): the 6-digit code that confirms a new address, in the sign-in
 * email's minimal layout. Sent to the new address only. It has no link: the code is typed in the
 * profile, so nothing in the email can change an address by itself.
 */
export const emailChangeCodeEmail: EmailTemplate<EmailChangeCodeEmailProps> = {
  id: 'email-change-code',
  subject: (ctx) => ctx.t('email.emailChangeCode.subject'),
  preview: (ctx, { code }) => ctx.t('email.emailChangeCode.preview', { code }),
  render: (ctx, { code, expiresInMinutes }) => (
    <>
      <Text style={textStyle}>{ctx.t('email.emailChangeCode.intro')}</Text>
      <Text style={codeStyle}>{code}</Text>
      <Text style={textStyle}>
        {ctx.t('email.emailChangeCode.validity', { minutes: expiresInMinutes })}
      </Text>
      <Text style={textStyle}>{ctx.t('email.emailChangeCode.ignore')}</Text>
    </>
  ),
  userContent: [],
  previewProps: { code: '482915', expiresInMinutes: 15 },
};
