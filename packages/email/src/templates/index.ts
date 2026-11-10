import { demoRequestEmail } from './demo-request.tsx';
import { emailChangeCodeEmail } from './email-change-code.tsx';
import { helloEmail } from './hello.tsx';
import { privateSessionEmail } from './private-session.tsx';
import { signInEmail } from './sign-in.tsx';
import { trainerInvitationEmail } from './trainer-invitation.tsx';

export { type DemoRequestEmailProps, demoRequestEmail } from './demo-request.tsx';
export { type EmailChangeCodeEmailProps, emailChangeCodeEmail } from './email-change-code.tsx';
export { type HelloEmailProps, helloEmail } from './hello.tsx';
export { type PrivateSessionEmailProps, privateSessionEmail } from './private-session.tsx';
export { type SignInEmailProps, signInEmail } from './sign-in.tsx';
export {
  type TrainerInvitationEmailProps,
  trainerInvitationEmail,
} from './trainer-invitation.tsx';

/** Every template, for the preview script and the render tests. Add new templates here. */
export const templates = [
  helloEmail,
  signInEmail,
  trainerInvitationEmail,
  privateSessionEmail,
  demoRequestEmail,
  emailChangeCodeEmail,
] as const;
