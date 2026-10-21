import createClient, { type ClientOptions } from 'openapi-fetch';
import type { components, paths } from './generated/schema.ts';

export type { components, operations, paths } from './generated/schema.ts';

export type Schemas = components['schemas'];

/**
 * Typed client for the Fivvi API, generated from openapi.json.
 * `baseUrl` includes the mount path, e.g. `https://example.com/api`.
 */
export function createApiClient(options: ClientOptions & { baseUrl: string }) {
  return createClient<paths>(options);
}
