import type { EmailConfig } from './config.ts';
import { createLettermintTransport } from './lettermint.ts';
import type { EmailTransport } from './transport.ts';

/** The transport of the configured provider: Lettermint (ADR-028). */
export function createConfiguredTransport(
  config: EmailConfig,
  options: { fetch?: typeof fetch } = {},
): EmailTransport {
  return createLettermintTransport({
    apiToken: config.lettermint.apiToken,
    routes: config.lettermint.routes,
    apiUrl: config.lettermint.apiUrl,
    fetch: options.fetch,
  });
}
