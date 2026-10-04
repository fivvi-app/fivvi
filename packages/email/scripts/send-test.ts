// Sends the hello test email through Brevo (G1 check, E006).
// Usage: pnpm email:send-test --to you@example.com [--locale nl-NL|en] [--name Anna]
//        [--time-zone Europe/Amsterdam]
// Reads BREVO_API_KEY, EMAIL_FROM_ADDRESS and EMAIL_FROM_NAME from the environment or from
// packages/email/.env (see the README). Never prints the API key.
import { parseArgs } from 'node:util';
import { defaultLocale, defaultTimeZone, isLocale, locales } from '@trainer-hub/i18n';
import {
  createBrevoTransport,
  createSendEmail,
  EmailSendError,
  helloEmail,
  readEmailConfig,
} from '../src/index.ts';

const { values } = parseArgs({
  options: {
    to: { type: 'string' },
    locale: { type: 'string', default: defaultLocale },
    name: { type: 'string' },
    'time-zone': { type: 'string', default: defaultTimeZone },
  },
});

if (!values.to) {
  console.error('Missing --to <email address>.');
  process.exit(1);
}
if (!isLocale(values.locale)) {
  console.error(`--locale must be one of: ${locales.join(', ')}.`);
  process.exit(1);
}

let config: ReturnType<typeof readEmailConfig>;
try {
  config = readEmailConfig();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
const sendEmail = createSendEmail({
  transport: createBrevoTransport({ apiKey: config.brevoApiKey }),
  sender: config.sender,
  onRetry: ({ attempt, delayMs, error }) => {
    console.warn(`Attempt ${attempt} failed (${error.message}); retrying in ${delayMs} ms.`);
  },
});

try {
  const result = await sendEmail({
    template: helloEmail,
    props: { firstName: values.name, sentAt: new Date() },
    to: { email: values.to, name: values.name },
    locale: values.locale,
    timeZone: values['time-zone'],
  });
  console.log(
    `Sent "${helloEmail.id}" (${values.locale}) to ${values.to} in ${result.attempts} attempt(s). ` +
      `Brevo message id: ${result.messageId ?? '(none: an earlier attempt was accepted)'}`,
  );
} catch (error) {
  if (error instanceof EmailSendError) {
    console.error(`Send failed after ${error.attempts} attempt(s): ${error.message}`);
    if (error.detail) console.error(`Brevo says: ${error.detail}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
