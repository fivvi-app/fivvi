// Sends the hello test email through Lettermint (G1 check, E006, ADR-028).
// Usage: pnpm email:send-test --to you@example.com [--locale nl-NL|en] [--name Anna]
//        [--time-zone Europe/Amsterdam]
// Reads the Lettermint variables (see the README) from the environment or from
// packages/email/.env. Never prints the token.
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  defaultLocale,
  defaultTimeZone,
  isLocale,
  locales,
  resolveCommunicationLanguage,
} from '@fivvi/i18n';
import {
  createConfiguredTransport,
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
  transport: createConfiguredTransport(config),
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
    locale: resolveCommunicationLanguage({
      recipientPreference: values.locale,
      workspaceDefault: defaultLocale,
    }),
    timeZone: values['time-zone'],
    event: randomUUID(),
  });
  console.log(
    `Sent "${helloEmail.id}" (${values.locale}) to ${values.to} in ${result.attempts} attempt(s). ` +
      `Lettermint message id: ${result.messageId ?? '(none: an earlier attempt was accepted)'}`,
  );
} catch (error) {
  if (error instanceof EmailSendError) {
    console.error(`Send failed after ${error.attempts} attempt(s): ${error.message}`);
    if (error.detail) console.error(`Lettermint says: ${error.detail}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
