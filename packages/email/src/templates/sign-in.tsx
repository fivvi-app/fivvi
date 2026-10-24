import { Button, Link, Text } from 'react-email';
import { textStyle } from '../components/layout.tsx';
import type { EmailTemplate } from '../render.tsx';

export interface SignInEmailProps {
  /** The 6-digit sign-in code. */
  code: string;
  /** The sign-in link: the confirm step of the sign-in page, with the link token. */
  url: string;
  /** How long the code and the link work. */
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

const buttonStyle = {
  backgroundColor: '#18181b',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '16px',
  padding: '12px 20px',
  textDecoration: 'none',
} as const;

const urlStyle = {
  ...textStyle,
  fontSize: '13px',
  lineHeight: '20px',
  wordBreak: 'break-all',
} as const;

/**
 * EM-08 "Je inlogcode voor Fivvi" / "Your sign-in code for Fivvi" (F001): one email with the
 * 6-digit code and the sign-in link, which are one verification. The link points at the confirm
 * step of the sign-in page, so a scanner that opens it cannot use it up (ADR-007).
 */
export const signInEmail: EmailTemplate<SignInEmailProps> = {
  id: 'sign-in',
  subject: (ctx) => ctx.t('email.signIn.subject'),
  preview: (ctx, { code }) => ctx.t('email.signIn.preview', { code }),
  render: (ctx, { code, url, expiresInMinutes }) => (
    <>
      <Text style={textStyle}>{ctx.t('email.signIn.intro')}</Text>
      <Text style={codeStyle}>{code}</Text>
      <Text style={textStyle}>{ctx.t('email.signIn.linkIntro')}</Text>
      <Button href={url} style={buttonStyle}>
        {ctx.t('email.signIn.linkButton')}
      </Button>
      <Text style={urlStyle}>
        <Link href={url}>{url}</Link>
      </Text>
      <Text style={textStyle}>{ctx.t('email.signIn.validity', { minutes: expiresInMinutes })}</Text>
      <Text style={textStyle}>{ctx.t('email.signIn.ignore')}</Text>
    </>
  ),
  previewProps: {
    code: '482915',
    url: 'https://fivvi.example.com/login/confirm?token=preview-token-not-real',
    expiresInMinutes: 15,
  },
};
