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

/** Sends through Brevo (ADR-009): used while `LETTERMINT_API_TOKEN` is not set. */
export interface BrevoEmailConfig {
  /** The From address and name. Brevo only sends from a verified sender. */
  sender: EmailAddress;
  /** Brevo API key (`xkeysib-…`). A secret: never log it. */
  brevoApiKey: string;
  /**
   * Where to send the requests instead of Brevo's own API, from `BREVO_API_URL`. Set by e2e
   * runs that point it at a fake Brevo server; absent everywhere else.
   */
  brevoApiUrl?: string;
  lettermint?: undefined;
}

/** Sends through Lettermint (ADR-028): used as soon as `LETTERMINT_API_TOKEN` is set. */
export interface LettermintEmailConfig {
  /** The From address and name. Lettermint only sends from a verified domain. */
  sender: EmailAddress;
  lettermint: LettermintConfig;
  brevoApiKey?: undefined;
  brevoApiUrl?: undefined;
}

export type EmailConfig = BrevoEmailConfig | LettermintEmailConfig;

// Deliberately loose: the provider validates the address; this only catches a wrong variable.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reads the email settings from the environment. With `LETTERMINT_API_TOKEN` set, email goes
 * through Lettermint and needs both route variables; without it, through Brevo (ADR-028).
 * The sender lives in config, not code, because it changes when the own domain arrives.
 * Error messages never include the token or the API key.
 */
export function readEmailConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): EmailConfig {
  const lettermintToken = env.LETTERMINT_API_TOKEN?.trim();
  const brevoApiKey = env.BREVO_API_KEY?.trim();
  const routeSignIn = env.LETTERMINT_ROUTE_SIGN_IN?.trim();
  const routeMail = env.LETTERMINT_ROUTE_MAIL?.trim();
  const address = env.EMAIL_FROM_ADDRESS?.trim();
  const name = env.EMAIL_FROM_NAME?.trim();
  const missing = (
    lettermintToken
      ? [
          !routeSignIn && 'LETTERMINT_ROUTE_SIGN_IN',
          !routeMail && 'LETTERMINT_ROUTE_MAIL',
          !address && 'EMAIL_FROM_ADDRESS',
          !name && 'EMAIL_FROM_NAME',
        ]
      : [
          !brevoApiKey && 'BREVO_API_KEY',
          !address && 'EMAIL_FROM_ADDRESS',
          !name && 'EMAIL_FROM_NAME',
        ]
  ).filter(Boolean);
  if (missing.length > 0 || !address || !name) {
    throw new Error(
      `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set. For local development, see "Configuration" in packages/email/README.md.`,
    );
  }
  if (!EMAIL.test(address)) {
    throw new Error('EMAIL_FROM_ADDRESS is not an email address.');
  }

  if (lettermintToken && routeSignIn && routeMail) {
    const apiUrl = env.LETTERMINT_API_URL?.trim();
    if (apiUrl && !URL.canParse(apiUrl)) {
      throw new Error('LETTERMINT_API_URL is not a URL.');
    }
    return {
      sender: { email: address, name },
      lettermint: {
        apiToken: lettermintToken,
        routes: { signIn: routeSignIn, mail: routeMail },
        ...(apiUrl && { apiUrl }),
      },
    };
  }

  const brevoApiUrl = env.BREVO_API_URL?.trim();
  if (brevoApiUrl && !URL.canParse(brevoApiUrl)) {
    throw new Error('BREVO_API_URL is not a URL.');
  }
  if (!brevoApiKey) throw new Error('BREVO_API_KEY is not set.');
  return { sender: { email: address, name }, brevoApiKey, ...(brevoApiUrl && { brevoApiUrl }) };
}
