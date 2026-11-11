import { createEnvironmentSendEmail, type SendEmail } from '@fivvi/email';
import { recordEmailSent } from './email-sent';
import { errorReporter } from './error-reporter';
import { productEvents } from './product-events';

/**
 * The `sendEmail` of the web server (sign-in, the API's senders): sent through the provider of the
 * environment (packages/email), each accepted send recorded as the product event `email_sent`.
 * A failure of that recording is reported, and does not fail a send that was delivered.
 */
export function sendEmail(): SendEmail {
  return createEnvironmentSendEmail({
    onSent: recordEmailSent(productEvents),
    onSentError: (error) => errorReporter.captureError(error),
  });
}
