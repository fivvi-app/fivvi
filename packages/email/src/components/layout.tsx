import { emailColours } from '@fivvi/design-tokens/email-colours';
import type { ReactNode } from 'react';
import { Body, Container, Head, Hr, Html, Preview, Section, Text } from 'react-email';
import type { EmailContext } from '../render.tsx';

// Plain inline styles. Email clients ignore most CSS, so keep it to fonts, colours and spacing.
// Every colour is a generated design token (`@fivvi/design-tokens/email-colours`, E020 AC16): no
// colour is written here, so the accent follows the tokens.
const styles = {
  body: {
    backgroundColor: emailColours.canvas,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    margin: 0,
    padding: '24px 0',
  },
  container: {
    backgroundColor: emailColours.surface,
    borderRadius: '8px',
    maxWidth: '560px',
    padding: '32px',
  },
  hr: { borderColor: emailColours.border, margin: '24px 0 16px' },
  footer: { color: emailColours.secondaryText, fontSize: '12px', lineHeight: '18px', margin: 0 },
} as const;

export const textStyle = {
  color: emailColours.text,
  fontSize: '16px',
  lineHeight: '24px',
} as const;

/** A link in the text: the accent as text, which the token pairs hold at 4.5:1 on the card. */
export const linkStyle = { color: emailColours.link } as const;

/** The one primary button of an email: the accent fill with the on-accent label. */
export const buttonStyle = {
  backgroundColor: emailColours.accent,
  borderRadius: '6px',
  color: emailColours.onAccent,
  display: 'inline-block',
  fontSize: '16px',
  padding: '12px 20px',
  textDecoration: 'none',
} as const;

interface EmailLayoutProps {
  ctx: EmailContext;
  /** Also the document `<title>`, which some clients show. */
  subject: string;
  /** Inbox preview line, shown next to the subject. Hidden in the email itself. */
  preview: string;
  children: ReactNode;
}

/** The shell every email shares: language, preview line, card and footer. */
export function EmailLayout({ ctx, subject, preview, children }: EmailLayoutProps) {
  return (
    <Html lang={ctx.lang}>
      <Head>
        <title>{subject}</title>
      </Head>
      <Preview useTitleTag={false}>{preview}</Preview>
      <Body lang={ctx.lang} style={styles.body}>
        <Container style={styles.container}>
          <Section>{children}</Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>{ctx.t('email.layout.footer')}</Text>
        </Container>
      </Body>
    </Html>
  );
}
