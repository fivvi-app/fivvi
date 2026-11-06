export { type BrevoTransportOptions, createBrevoTransport } from './brevo.ts';
export {
  type BrevoEmailConfig,
  type EmailConfig,
  type LettermintConfig,
  type LettermintEmailConfig,
  type LettermintRoutes,
  readEmailConfig,
} from './config.ts';
export {
  createEnvironmentSendEmail,
  type EnvironmentSendEmailOptions,
  isProductionEnvironment,
} from './environment.ts';
export {
  createLettermintTransport,
  type LettermintTransportOptions,
} from './lettermint.ts';
export { createLogTransport } from './log.ts';
export { type CapturedEmail, createMemoryTransport, type MemoryTransport } from './memory.ts';
export type {
  PrivateSessionMail,
  PrivateSessionMailAddress,
} from './private-session-mail.ts';
export {
  createPrivateSessionSender,
  type PrivateSessionSenderOptions,
} from './private-session-sender.ts';
export { createConfiguredTransport } from './provider.ts';
export {
  createEmailContext,
  type EmailContext,
  type EmailMessageKey,
  type EmailTemplate,
  type RenderedEmail,
  renderEmail,
} from './render.tsx';
export { defaultRetryPolicy, type RetryPolicy } from './retry.ts';
export {
  type CreateSendEmailOptions,
  createSendEmail,
  type RetryEvent,
  type SendEmail,
  type SendEmailOptions,
  type SendEmailResult,
} from './send.ts';
export {
  type HelloEmailProps,
  helloEmail,
  type PrivateSessionEmailProps,
  type PrivateSessionMovedEmailProps,
  privateSessionEmail,
  privateSessionMovedEmail,
  type SignInEmailProps,
  signInEmail,
  type TrainerInvitationEmailProps,
  templates,
  trainerInvitationEmail,
} from './templates/index.ts';
export type { TrainerInvitationMail } from './trainer-invitation-mail.ts';
export {
  createTrainerInvitationSender,
  type TrainerInvitationSenderOptions,
} from './trainer-invitation-sender.ts';
export {
  type EmailAddress,
  EmailSendError,
  type EmailTransport,
  type OutgoingEmail,
  type SentEmail,
} from './transport.ts';
