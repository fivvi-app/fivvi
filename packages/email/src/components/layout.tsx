import type { ReactNode } from 'react';
import { Body, Container, Head, Hr, Html, Preview, Section, Text } from 'react-email';
import type { EmailContext } from '../render.tsx';

// Plain inline styles until the design tokens exist (E007). Email clients ignore most CSS,
// so keep it to fonts, colours and spacing.
const styles = {
  body: {
    backgroundColor: '#f4f4f5',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    margin: 0,
    padding: '24px 0',
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    maxWidth: '560px',
    padding: '32px',
  },
  hr: { borderColor: '#e4e4e7', margin: '24px 0 16px' },
  footer: { color: '#71717a', fontSize: '12px', lineHeight: '18px', margin: 0 },
} as const;

export const textStyle = { color: '#18181b', fontSize: '16px', lineHeight: '24px' } as const;

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
