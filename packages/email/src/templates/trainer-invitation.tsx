import { Button, Link, Text } from 'react-email';
import { textStyle } from '../components/layout.tsx';
import type { EmailTemplate } from '../render.tsx';

export interface TrainerInvitationEmailProps {
  /** The name of the Owner who invites, as the account has it. */
  inviterName: string;
  /** The name of the workspace the person is invited to. */
  workspaceName: string;
  /** The invitation page with the token: `/invitations/{token}`. */
  url: string;
  /** When the invitation stops working. Shown as a date in the email's time zone. */
  expiresAt: Date;
}

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
 * EM-09 "{inviter} nodigt je uit voor {workspace}" / "{inviter} invited you to {workspace}"
 * (F011): one sentence, the button to the invitation page, the expiry date in the recipient's
 * language and the workspace's time zone, and the line that an unexpected email can be ignored.
 * The recipient's language is decided by the sender (`invitationLanguage` in `@fivvi/domain`).
 */
export const trainerInvitationEmail: EmailTemplate<TrainerInvitationEmailProps> = {
  id: 'trainer-invitation',
  subject: (ctx, { inviterName, workspaceName }) =>
    ctx.t('email.trainerInvitation.subject', { inviter: inviterName, workspace: workspaceName }),
  preview: (ctx, { workspaceName }) =>
    ctx.t('email.trainerInvitation.preview', { workspace: workspaceName }),
  render: (ctx, { inviterName, workspaceName, url, expiresAt }) => (
    <>
      <Text style={textStyle}>
        {ctx.t('email.trainerInvitation.intro', {
          inviter: inviterName,
          workspace: workspaceName,
        })}
      </Text>
      <Button href={url} style={buttonStyle}>
        {ctx.t('email.trainerInvitation.button')}
      </Button>
      <Text style={urlStyle}>
        <Link href={url}>{url}</Link>
      </Text>
      <Text style={textStyle}>
        {ctx.t('email.trainerInvitation.validity', {
          date: ctx.formatDateTime(expiresAt, 'dateWithYear'),
        })}
      </Text>
      <Text style={textStyle}>{ctx.t('email.trainerInvitation.ignore')}</Text>
    </>
  ),
  previewProps: {
    inviterName: 'John',
    workspaceName: 'John’s Gym',
    url: 'https://fivvi.example.com/invitations/preview-token-not-real',
    expiresAt: new Date('2026-11-12T10:00:00Z'),
  },
};
