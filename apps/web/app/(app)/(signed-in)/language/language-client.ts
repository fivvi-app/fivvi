import type { Locale } from '@fivvi/i18n';

/**
 * Stores the chosen language on the account (`PATCH /api/v1/me`, F010): every other browser and
 * app of the account shows it from its next load. The API checks the value; nothing is checked
 * here.
 */
export async function saveLanguage(
  locale: Locale,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean }> {
  try {
    const response = await fetchFn('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preferredLocale: locale }),
    });
    return { ok: response.status === 200 };
  } catch {
    return { ok: false };
  }
}
