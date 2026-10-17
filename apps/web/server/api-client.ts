import { API_BASE_PATH } from '@trainer-hub/api';
import { createApiClient } from '@trainer-hub/contract';

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * Only names the requests: they go straight to the handler, so this origin is never resolved and
 * no request leaves the process (`.invalid` is reserved for that, RFC 6761).
 */
const IN_PROCESS_ORIGIN = 'http://api.invalid';

/**
 * The generated TypeScript client (`packages/contract`), sending its requests to `handler` in this
 * process instead of over the network: server components call the same API that `/api` serves,
 * without knowing the app's own host name, which differs per preview, production and e2e run.
 */
export function inProcessApiClient(
  handler: (request: Request) => Response | Promise<Response>,
): ApiClient {
  return createApiClient({
    baseUrl: `${IN_PROCESS_ORIGIN}${API_BASE_PATH}`,
    fetch: async (request) => await handler(request),
  });
}
