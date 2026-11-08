/** What a JSON `POST` to the sign-in API came back with, before a client words it. */
export type PostResult =
  | { ok: true; body: unknown }
  /** `code` is the API's error code (never its English `message`); `status` is the HTTP status. */
  | { ok: false; reason: 'response'; status: number; code: unknown }
  | { ok: false; reason: 'noConnection' };

/**
 * Posts `body` as JSON. The sign-in clients word every failure themselves from the error code,
 * so a failed response is reduced to its status and `code`.
 */
export async function postJson(
  url: string,
  body: unknown,
  fetchFn: typeof fetch,
): Promise<PostResult> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  const parsed: unknown = await response.json().catch(() => null);
  if (response.ok) return { ok: true, body: parsed };
  const code = (parsed as { code?: unknown } | null)?.code;
  return { ok: false, reason: 'response', status: response.status, code };
}
