import { Text } from 'react-email';
import { textStyle } from '../components/layout.tsx';
import type { EmailTemplate } from '../render.tsx';

/**
 * EM-36 "Iemand wilde dit e-mailadres voor een ander Fivvi-account gebruiken" / "Someone wanted to
 * use this email address for another Fivvi account" (F005, spec #610): goes to an address that
 * already has an account when someone asks for a code to change the address of another account to
 * it, instead of the code (EM-34), so the answer to the person asking gives nothing away. It
 * names no one, has no code, link or button, and says nothing was changed or merged.
 */
export const emailChangeTakenNoticeEmail: EmailTemplate<Record<string, never>> = {
  id: 'email-change-taken-notice',
  subject: (ctx) => ctx.t('email.emailChangeTaken.subject'),
  preview: (ctx) => ctx.t('email.emailChangeTaken.preview'),
  render: (ctx) => (
    <>
      <Text style={textStyle}>{ctx.t('email.emailChangeTaken.intro')}</Text>
      <Text style={textStyle}>{ctx.t('email.emailChangeTaken.unchanged')}</Text>
      <Text style={textStyle}>{ctx.t('email.emailChangeTaken.ignore')}</Text>
    </>
  ),
  userContent: [],
  previewProps: {},
};
