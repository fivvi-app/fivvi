import { createBrevoTransport } from './brevo.ts';
import type { EmailConfig } from './config.ts';
import { createLettermintTransport } from './lettermint.ts';
import type { EmailTransport } from './transport.ts';

/**
 * The transport of the configured provider: Lettermint when `readEmailConfig` found its token,
 * Brevo otherwise (ADR-028).
 */
export function createConfiguredTransport(
  config: EmailConfig,
  options: { fetch?: typeof fetch } = {},
): EmailTransport {
  if (config.lettermint) {
    return createLettermintTransport({
      apiToken: config.lettermint.apiToken,
      routes: config.lettermint.routes,
      apiUrl: config.lettermint.apiUrl,
      fetch: options.fetch,
    });
  }
  return createBrevoTransport({
    apiKey: config.brevoApiKey,
    apiUrl: config.brevoApiUrl,
    fetch: options.fetch,
  });
}
