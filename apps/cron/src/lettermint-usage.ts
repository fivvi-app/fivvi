import type { ErrorReporter } from '@fivvi/observability';

/** Lettermint's Team API (ADR-028). Tests point `apiUrl` elsewhere. */
export const lettermintTeamApiUrl = 'https://api.lettermint.co/v1';

/** From this share of the plan's included volume on, the owner is warned (R14, ADR-028). */
export const USAGE_ALERT_PERCENT = 70;

const TIMEOUT_MS = 10_000;

/** A usage warning, reported to Sentry as a `warning`; the numbers are in its message. */
export class LettermintUsageWarning extends Error {
  override name = 'LettermintUsageWarning';
}

export interface LettermintUsageOptions {
  /** `LETTERMINT_TEAM_TOKEN`: a read-only Team API token. Unset or empty skips the check. */
  teamToken: string | undefined;
  errorReporter: Pick<ErrorReporter, 'captureError'>;
  log: (message: string) => void;
  /** Default: `lettermintTeamApiUrl`. */
  apiUrl?: string;
  /** Injected in tests. Default: the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Warns before Lettermint's monthly limit stops sign-in emails (R14, ADR-028): Free stops hard
 * at 300 a month for the whole team. Reads the plan's included volume (`GET /team`) and this
 * month's usage (`GET /team/usage`), and reports a warning to Sentry at 70% or more of it.
 * The cron runs daily, so that is one report a day while usage stays above the line.
 *
 * Never throws: a failing Team API call is reported once and the other daily jobs go on.
 * Without a team token (every environment but production) it does nothing, quietly.
 */
export async function checkLettermintUsage({
  teamToken,
  errorReporter,
  log,
  apiUrl = lettermintTeamApiUrl,
  fetch: fetchFn = fetch,
}: LettermintUsageOptions): Promise<void> {
  if (!teamToken) return;
  try {
    const get = (path: string) => getJson(fetchFn, `${apiUrl}${path}`, teamToken);
    const [team, usage] = await Promise.all([get('/team'), get('/team/usage')]);
    const included = positiveInteger(field(team, 'included_volume'));
    const used = nonNegativeInteger(field(field(usage, 'current_period'), 'usage'));
    if (included === undefined || used === undefined) {
      throw new Error('lettermint: unexpected Team API response');
    }

    const percent = Math.floor((used * 100) / included);
    const summary = `Lettermint usage is ${used} of ${included} emails this month (${percent}%)`;
    if (percent >= USAGE_ALERT_PERCENT) {
      errorReporter.captureError(new LettermintUsageWarning(summary), { level: 'warning' });
    } else {
      log(`${summary.replace(' is ', ': ')}.`);
    }
  } catch (error) {
    errorReporter.captureError(error);
  }
}

/** The message holds only the status and code, never the token or the response text. */
async function getJson(fetchFn: typeof fetch, url: string, teamToken: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      headers: { accept: 'application/json', authorization: `Bearer ${teamToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
    throw new Error(`lettermint: ${timedOut ? 'request timed out' : 'network error'}`, { cause });
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const code = field(field(body, 'error'), 'code');
    throw new Error(
      `lettermint: HTTP ${response.status}${typeof code === 'string' ? ` ${code}` : ''}`,
    );
  }
  return body;
}

function field(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[name]
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const number = nonNegativeInteger(value);
  return number === undefined || number === 0 ? undefined : number;
}
