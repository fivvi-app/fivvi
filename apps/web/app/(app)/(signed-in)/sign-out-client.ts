/**
 * Signs this browser out: Better Auth ends the sign-in session of the cookie the request carries
 * and clears the cookie. Other browsers keep their own sessions (AC12).
 */
export async function signOut(fetchFn: typeof fetch = fetch): Promise<{ ok: boolean }> {
  try {
    const response = await fetchFn('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
}
