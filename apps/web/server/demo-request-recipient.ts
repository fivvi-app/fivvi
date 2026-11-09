import { type EmailAddress, isProductionEnvironment } from '@fivvi/email';
import { supportEmail } from '../site/info/contact';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Where the demo requests of the website go (F064). Only the `production` environment sends them to
 * the real support address. Everywhere else (local, `development`, every preview) the address is
 * `@example.com`, which the email layer writes to the server log instead of sending
 * (`createEnvironmentSendEmail`), so a preview can never send real mail. `DEMO_REQUEST_TO` points a
 * test server at a fake mailbox (the e2e run's fake Lettermint server); production ignores it
 * (ENVIRONMENTS.md §7).
 */
export function demoRequestRecipient(env: Env = process.env): EmailAddress {
  if (isProductionEnvironment(env)) return { email: supportEmail, name: 'Fivvi support' };
  const override = env.DEMO_REQUEST_TO?.trim();
  return { email: override || 'demo-requests@example.com', name: 'Fivvi support' };
}
