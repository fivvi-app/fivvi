import { helloEmail } from './hello.tsx';
import { signInEmail } from './sign-in.tsx';
import { trainerInvitationEmail } from './trainer-invitation.tsx';

export { type HelloEmailProps, helloEmail } from './hello.tsx';
export { type SignInEmailProps, signInEmail } from './sign-in.tsx';
export {
  type TrainerInvitationEmailProps,
  trainerInvitationEmail,
} from './trainer-invitation.tsx';

/** Every template, for the preview script and the render tests. Add new templates here. */
export const templates = [helloEmail, signInEmail, trainerInvitationEmail] as const;
