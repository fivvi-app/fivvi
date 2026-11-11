export {
  type ActiveEntry,
  type AnyEmailTemplate,
  type CatalogCheckInput,
  type CatalogEntry,
  catalog,
  catalogIdOf,
  checkCatalog,
  type EmailAudience,
  type InternalEntry,
  internalCatalog,
  type OwnerFeature,
  type ReservedEntry,
  type RetiredEntry,
  templates,
} from './catalog.ts';
export {
  type EmailConfig,
  type LettermintConfig,
  type LettermintRoutes,
  readEmailConfig,
} from './config.ts';
export type { DemoBusinessKind, DemoRequestMail, DemoTrainerCount } from './demo-request-mail.ts';
export {
  createDemoRequestSender,
  type DemoRequestSenderOptions,
} from './demo-request-sender.ts';
export {
  createEnvironmentSendEmail,
  type EnvironmentSendEmailOptions,
  isProductionEnvironment,
} from './environment.ts';
export { emailIdempotencyKey } from './idempotency-key.ts';
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
  type EmailFrame,
  type EmailMessageKey,
  type EmailTemplate,
  type RenderedEmail,
  renderEmail,
  type UserContentProp,
} from './render.tsx';
export { defaultRetryPolicy, type RetryPolicy } from './retry.ts';
export {
  type CreateSendEmailOptions,
  createSendEmail,
  type RetryEvent,
  type SendEmail,
  type SendEmailOptions,
  type SendEmailResult,
  type SentEvent,
} from './send.ts';
export {
  type DemoRequestEmailProps,
  demoRequestEmail,
  type EmailChangeCodeEmailProps,
  emailChangeCodeEmail,
  type HelloEmailProps,
  helloEmail,
  type PrivateSessionEmailProps,
  type PrivateSessionMovedEmailProps,
  privateSessionEmail,
  privateSessionMovedEmail,
  type SignInEmailProps,
  signInEmail,
  type TrainerInvitationEmailProps,
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
