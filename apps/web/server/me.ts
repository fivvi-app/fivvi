import type { ApiClient } from './api-client';
import type { Me } from './destination';

/**
 * Asks `GET /v1/me` who is signed in and where they stand (F002): their name, whether they may
 * set up a workspace and the workspaces they have a team role in. Only the sign-in cookie of the
 * page request goes along, never an `Authorization` header. `undefined` when nobody is signed in
 * (the route guard keeps that from happening, so it is a session that ended a moment ago). Any
 * other failure throws: an error page is better than sending a signed-in person to the wrong place.
 */
export async function loadMe(api: ApiClient, requestHeaders: Headers): Promise<Me | undefined> {
  const cookie = requestHeaders.get('cookie');
  const { data, response } = await api.GET('/v1/me', {
    headers: cookie ? { cookie } : {},
  });
  if (response.status === 401) return undefined;
  if (!data) throw new Error(`GET /v1/me answered ${response.status}.`);
  return data;
}
