import { helloEmail } from './hello.tsx';
import { privateSessionMovedEmail } from './private-session-moved.tsx';
import { privateSessionEmail } from './private-session.tsx';
import { signInEmail } from './sign-in.tsx';
import { trainerInvitationEmail } from './trainer-invitation.tsx';

export { type HelloEmailProps, helloEmail } from './hello.tsx';
export {
  type PrivateSessionMovedEmailProps,
  privateSessionMovedEmail,
} from './private-session-moved.tsx';
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
  privateSessionMovedEmail,
] as const;
