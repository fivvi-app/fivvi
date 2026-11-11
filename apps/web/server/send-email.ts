import { createEnvironmentSendEmail, type SendEmail } from '@fivvi/email';
import { recordEmailSent } from './email-sent';
import { productEvents } from './product-events';

/**
 * The `sendEmail` of the web server (sign-in, the API's senders): sent through the provider of the
 * environment (packages/email), each accepted send recorded as the product event `email_sent`.
 */
export function sendEmail(): SendEmail {
  return createEnvironmentSendEmail({ onSent: recordEmailSent(productEvents) });
}
