import type { ReactNode } from 'react';
import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from 'react-email';
import type { EmailContext, EmailMessageKey } from '../render.tsx';

// The frames of every email that is about a workspace (F049, spec #476): the client frame for a
// client, the team frame for a trainer or an owner. The sign-in email and the trainer invitation
// have no frame (ADR-019; the invitee is not on the team yet). Colours are the plain ones of
// `layout.tsx` until the design tokens reach email (#635); this file restyles nothing.

/** The client web, the one place the button of a frame may lead to. */
export const clientWebUrl = 'https://fivvi.app/';

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
  workspace: {
    color: '#18181b',
    fontSize: '20px',
    fontWeight: 700,
    lineHeight: '28px',
    margin: '0 0 16px',
  },
  button: {
    backgroundColor: '#18181b',
    borderRadius: '6px',
    color: '#ffffff',
    display: 'inline-block',
    fontSize: '16px',
    padding: '12px 20px',
    textDecoration: 'none',
  },
  hr: { borderColor: '#e4e4e7', margin: '24px 0 16px' },
  footer: { color: '#71717a', fontSize: '12px', lineHeight: '18px', margin: '0 0 8px' },
  sentWith: { color: '#71717a', fontSize: '12px', lineHeight: '18px', margin: '16px 0 0' },
  wordmark: { color: '#18181b', fontSize: '14px', fontWeight: 700 },
} as const;

/** Who the frame is for: a client of the workspace, or a member of its team. */
export type FrameKind = 'client' | 'team';

interface FrameProps {
  ctx: EmailContext;
  /** Also the document `<title>`. */
  subject: string;
  /** Inbox preview line. */
  preview: string;
  /** The workspace the email is about, as the owner typed it. */
  workspaceName: string;
  /** The label of the one primary button. */
  buttonLabel: EmailMessageKey;
  /** The page on the client web the button opens, relative to `https://fivvi.app/`. */
  buttonPath: string;
  children: ReactNode;
}

function Frame({
  kind,
  ctx,
  subject,
  preview,
  workspaceName,
  buttonLabel,
  buttonPath,
  children,
}: FrameProps & { kind: FrameKind }) {
  const workspace = { workspace: workspaceName };
  return (
    <Html lang={ctx.lang}>
      <Head>
        <title>{subject}</title>
      </Head>
      <Preview useTitleTag={false}>{preview}</Preview>
      <Body lang={ctx.lang} style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.workspace}>{workspaceName}</Text>
          <Section>{children}</Section>
          <Section style={{ margin: '24px 0 0' }}>
            <Button href={new URL(buttonPath, clientWebUrl).href} style={styles.button}>
              {ctx.t(buttonLabel)}
            </Button>
          </Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            {ctx.t(
              kind === 'client' ? 'email.frame.clientReason' : 'email.frame.teamReason',
              workspace,
            )}
          </Text>
          <Text style={styles.footer}>{ctx.t('email.frame.questions', workspace)}</Text>
          <Text style={styles.sentWith}>
            <span style={styles.wordmark}>{ctx.t('email.frame.wordmark')}</span>
            {' · '}
            {ctx.t('email.frame.sentWith')}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/** The frame of an email to a client: "Je krijgt deze e-mail omdat je klant bent bij {workspace}." */
export function ClientEmailLayout(props: FrameProps) {
  return <Frame kind="client" {...props} />;
}

/** The frame of an email to a trainer or an owner: "… omdat je in het team van {workspace} zit." */
export function TeamEmailLayout(props: FrameProps) {
  return <Frame kind="team" {...props} />;
}
