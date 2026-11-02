import { readEmailConfig } from './config.ts';
import { createLogTransport } from './log.ts';
import { createConfiguredTransport } from './provider.ts';
import { createSendEmail, type SendEmail } from './send.ts';
import type { EmailAddress, EmailTransport } from './transport.ts';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Whether this is the `production` Railway environment (ENVIRONMENTS.md). Anything else is not:
 * local, the shared `development` environment and every `pr-<number>` preview. The same rule
 * as the Sentry environment tag in `packages/observability`.
 */
export function isProductionEnvironment(env: Env = process.env): boolean {
  return env.RAILWAY_ENVIRONMENT_NAME?.trim() === 'production';
}

/**
 * `EMAIL_SEND_EXAMPLE_DOMAIN=1`: outside production, `@example.com` mail goes through the provider like
 * any other address. Set only by the Maestro run (`scripts/maestro.sh`), whose Brevo is a fake
 * server it reads the sign-in codes from. Only the value `1` turns it on.
 */
function sendsExampleDomain(env: Env): boolean {
  return env.EMAIL_SEND_EXAMPLE_DOMAIN?.trim() === '1';
}

/** Only the reserved example domain itself, never a lookalike such as `notexample.com`. */
function isExampleAddress(address: string): boolean {
  return address.trim().toLowerCase().endsWith('@example.com');
}

/** Used outside production while no sender is configured: only `@example.com` mail is logged. */
const FALLBACK_SENDER: EmailAddress = { email: 'noreply@example.com', name: 'Fivvi' };

export interface EnvironmentSendEmailOptions {
  /** Default: `process.env`. */
  env?: Env;
  /** The provider's HTTP client. Injected in tests. */
  fetch?: typeof fetch;
  /** Where logged emails go. Default: `console.info`. */
  log?: (line: string) => void;
}

/**
 * The `sendEmail` the server uses (ADR-009, ADR-028, F001):
 *
 * - **Production** always sends through the provider, whatever the address, and never logs an
 *   email.
 * - **Outside production**, mail to an `@example.com` address is written to the server log,
 *   code and link included, so agents can sign in on a preview without an inbox. Mail to any
 *   other address goes through the provider. `EMAIL_SEND_EXAMPLE_DOMAIN=1` sends `@example.com`
 *   mail through it too, for e2e runs with a fake Brevo server.
 *
 * The provider is Lettermint as soon as `LETTERMINT_API_TOKEN` is set (with
 * `LETTERMINT_ROUTE_SIGN_IN`, `LETTERMINT_ROUTE_MAIL`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`),
 * otherwise Brevo (`BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` and, for e2e runs with
 * a fake Brevo server, `BREVO_API_URL`). Outside production the variables may be missing while
 * only `@example.com` mail is sent; production without them throws.
 */
export function createEnvironmentSendEmail(options: EnvironmentSendEmailOptions = {}): SendEmail {
  const { env = process.env, fetch: fetchFn, log } = options;
  const production = isProductionEnvironment(env);
  const logExampleMail = !production && !sendsExampleDomain(env);

  const config = production ? readEmailConfig(env) : tryReadEmailConfig(env);
  const logTransport = createLogTransport(log);
  const provider = () =>
    createConfiguredTransport(config ?? readEmailConfig(env), { fetch: fetchFn });

  let providerTransport: EmailTransport | undefined;
  const transport: EmailTransport = {
    name: 'environment',
    send(email) {
      if (logExampleMail && isExampleAddress(email.to.email)) return logTransport.send(email);
      providerTransport ??= provider();
      return providerTransport.send(email);
    },
  };
  return createSendEmail({ transport, sender: config?.sender ?? FALLBACK_SENDER });
}

function tryReadEmailConfig(env: Env) {
  try {
    return readEmailConfig(env);
  } catch {
    return undefined;
  }
}
