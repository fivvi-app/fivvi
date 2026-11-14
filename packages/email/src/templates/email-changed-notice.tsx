import { Text } from 'react-email';
import { textStyle } from '../components/layout.tsx';
import type { EmailTemplate } from '../render.tsx';

/**
 * EM-35 "Het e-mailadres van je Fivvi-account is gewijzigd" / "The email address of your Fivvi
 * account has been changed" (F005, spec #610): the notice to the OLD address after a confirmed
 * change, in the sign-in email's minimal layout. It has no props, no link and no button, so nothing
 * in it can undo the change, and it does not name the new address; it says what to do if the
 * change was not theirs.
 */
export const emailChangedNoticeEmail: EmailTemplate<Record<string, never>> = {
  id: 'email-changed-notice',
  subject: (ctx) => ctx.t('email.emailChanged.subject'),
  preview: (ctx) => ctx.t('email.emailChanged.preview'),
  render: (ctx) => (
    <>
      <Text style={textStyle}>{ctx.t('email.emailChanged.intro')}</Text>
      <Text style={textStyle}>{ctx.t('email.emailChanged.fine')}</Text>
      <Text style={textStyle}>{ctx.t('email.emailChanged.notYou')}</Text>
    </>
  ),
  userContent: [],
  previewProps: {},
};
