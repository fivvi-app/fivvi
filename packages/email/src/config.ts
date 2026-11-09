import type { EmailAddress } from './transport.ts';

/** The Lettermint settings (ADR-028), set when `LETTERMINT_API_TOKEN` is. */
export interface LettermintConfig {
  /** The project token (`x-lettermint-token`). A secret: never log it. */
  apiToken: string;
  /** Lettermint route slugs, one per kind of mail. The owner creates them per environment. */
  routes: LettermintRoutes;
  /**
   * Where to send the requests instead of Lettermint's own API, from `LETTERMINT_API_URL`.
   * For tests; absent everywhere else.
   */
  apiUrl?: string;
}

export interface LettermintRoutes {
  /** The route of sign-in emails (`LETTERMINT_ROUTE_SIGN_IN`). */
  signIn: string;
  /** The route of every other email (`LETTERMINT_ROUTE_MAIL`). */
  mail: string;
}

/** The email settings (ADR-028): where to send from and how to reach Lettermint. */
export interface EmailConfig {
  /** The From address and name. Lettermint only sends from a verified domain. */
  sender: EmailAddress;
  lettermint: LettermintConfig;
}

// Deliberately loose: the provider validates the address; this only catches a wrong variable.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reads the email settings from the environment (ADR-028): the Lettermint token and both route
 * variables, and the sender. The sender lives in config, not code, because it changes when the own
 * domain arrives. Error messages never include the token.
 */
export function readEmailConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): EmailConfig {
  const apiToken = env.LETTERMINT_API_TOKEN?.trim();
  const routeSignIn = env.LETTERMINT_ROUTE_SIGN_IN?.trim();
  const routeMail = env.LETTERMINT_ROUTE_MAIL?.trim();
  const address = env.EMAIL_FROM_ADDRESS?.trim();
  const name = env.EMAIL_FROM_NAME?.trim();

  if (!apiToken || !routeSignIn || !routeMail || !address || !name) {
    throw notSet([
      !apiToken && 'LETTERMINT_API_TOKEN',
      !routeSignIn && 'LETTERMINT_ROUTE_SIGN_IN',
      !routeMail && 'LETTERMINT_ROUTE_MAIL',
      !address && 'EMAIL_FROM_ADDRESS',
      !name && 'EMAIL_FROM_NAME',
    ]);
  }
  const sender = senderOf(address, name);
  const apiUrl = env.LETTERMINT_API_URL?.trim();
  if (apiUrl && !URL.canParse(apiUrl)) {
    throw new Error('LETTERMINT_API_URL is not a URL.');
  }
  return {
    sender,
    lettermint: {
      apiToken,
      routes: { signIn: routeSignIn, mail: routeMail },
      ...(apiUrl && { apiUrl }),
    },
  };
}

function notSet(names: (string | false)[]): Error {
  const missing = names.filter(Boolean);
  return new Error(
    `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set. For local development, see "Configuration" in packages/email/README.md.`,
  );
}

function senderOf(address: string, name: string): EmailAddress {
  if (!EMAIL.test(address)) {
    throw new Error('EMAIL_FROM_ADDRESS is not an email address.');
  }
  return { email: address, name };
}
