import type { EmailAddress } from './transport.ts';

export interface EmailConfig {
  /** The From address and name. Brevo only sends from a verified sender. */
  sender: EmailAddress;
  /** Brevo API key (`xkeysib-…`). A secret: never log it. */
  brevoApiKey: string;
  /**
   * Where to send the requests instead of Brevo's own API, from `BREVO_API_URL`. Set by e2e
   * runs that point it at a fake Brevo server; absent everywhere else.
   */
  brevoApiUrl?: string;
}

// Deliberately loose: Brevo validates the address; this only catches a wrong variable.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reads the email settings from the environment. The sender lives in config, not code,
 * because it changes when the own domain arrives (before M5, ADR-009).
 * Error messages never include the API key.
 */
export function readEmailConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): EmailConfig {
  const brevoApiKey = env.BREVO_API_KEY?.trim();
  const address = env.EMAIL_FROM_ADDRESS?.trim();
  const name = env.EMAIL_FROM_NAME?.trim();
  const missing = [
    !brevoApiKey && 'BREVO_API_KEY',
    !address && 'EMAIL_FROM_ADDRESS',
    !name && 'EMAIL_FROM_NAME',
  ].filter(Boolean);
  if (!brevoApiKey || !address || !name) {
    throw new Error(
      `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set. For local development, see "Configuration" in packages/email/README.md.`,
    );
  }
  if (!EMAIL.test(address)) {
    throw new Error('EMAIL_FROM_ADDRESS is not an email address.');
  }
  const brevoApiUrl = env.BREVO_API_URL?.trim();
  if (brevoApiUrl && !URL.canParse(brevoApiUrl)) {
    throw new Error('BREVO_API_URL is not a URL.');
  }
  return { sender: { email: address, name }, brevoApiKey, ...(brevoApiUrl && { brevoApiUrl }) };
}
