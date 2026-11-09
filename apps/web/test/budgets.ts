// The speed and search budgets of the public website (F064 AC15): what they are, which address they
// run against, and the summary of a run that goes on the PR. It lives outside `e2e/` so a unit test
// covers it; the spec (`e2e/site-budgets.spec.ts`) measures, the reporter
// (`e2e/budgets-reporter.ts`) prints.

/** The budgets of AC15: the largest contentful paint, in milliseconds ... */
export const MAX_LCP_MS = 2500;
/** ... and the layout shift. SEO and accessibility must score 100, and the images must pass their audits. */
export const MAX_CLS = 0.1;

/** The annotation a budget test leaves for the reporter: its type, and a `BudgetRow` as JSON. */
export const BUDGET_ROW_ANNOTATION = 'AC15 budget row';

/** What one page measured, in one colour scheme and one language. */
export interface BudgetRow {
  locale: string;
  scheme: 'light' | 'dark';
  path: string;
  lcpMs: number;
  cls: number;
  /** 0 to 1, as Lighthouse scores a category. */
  seo: number;
  accessibility: number;
  /** The image audits that did not pass. */
  imageFindings: string[];
  /** How many runs the page needed to get its best (the best counts). */
  attempts: number;
  /** The LCP of every run of the page, in order: the spread behind the best one. */
  runsLcpMs: number[];
  /** The `benchmarkIndex` Lighthouse measured on the host during the counted run. */
  benchmarkIndex: number;
  /** The `cpuSlowdownMultiplier` the run used (calibrated to the host). */
  cpuSlowdownMultiplier: number;
}

/**
 * The address of a deployed site to measure instead of the local build (`BUDGETS_BASE_URL`), as an
 * origin, or `undefined` for the local run. An address that is not an http(s) URL throws: a typo
 * must not turn into a run against the local build that looks like one against the preview.
 */
export function budgetsTarget(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`BUDGETS_BASE_URL is not an address: "${text}" (use https://host)`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`BUDGETS_BASE_URL must be an http(s) address, not "${text}"`);
  }
  return url.origin;
}

/** The budgets a page is over, by name; a number that is missing counts as over. */
export function budgetFailures(row: BudgetRow): string[] {
  const failures: string[] = [];
  if (!(row.lcpMs < MAX_LCP_MS)) failures.push('LCP');
  if (!(row.cls < MAX_CLS)) failures.push('CLS');
  if (row.seo !== 1) failures.push('SEO');
  if (row.accessibility !== 1) failures.push('accessibility');
  if (row.imageFindings.length > 0) failures.push('images');
  return failures;
}

function range(values: number[], digits: number): string {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const text = (value: number) =>
    digits === 0 ? String(Math.round(value)) : value.toFixed(digits);
  return text(low) === text(high) ? text(low) : `${text(low)} to ${text(high)}`;
}

/**
 * The result of a run as Markdown, short enough to paste on the PR as a comment: one line per page
 * and colour scheme with LCP, CLS, SEO, accessibility and the verdict, and the host's
 * `benchmarkIndex` and the CPU multiplier it was calibrated to.
 */
export function summarizeBudgets({
  target,
  rows,
}: {
  target: string | undefined;
  rows: readonly BudgetRow[];
}): string {
  const over = rows.filter((row) => budgetFailures(row).length > 0).length;
  const verdict =
    over === 0 ? `all ${rows.length} within budget` : `${over} of ${rows.length} over budget`;
  const lines = [
    `**Speed and search budgets (F064 AC15)**: ${verdict}`,
    '',
    `Measured on ${target ?? 'the local build'}, as at go-live (the \`noindex\` switch shown off), ` +
      `with Lighthouse's phone profile (Moto G Power, slow 4G, simulated). Budgets: LCP < ${MAX_LCP_MS / 1000} s, ` +
      `CLS < ${MAX_CLS}, SEO 100, accessibility 100, images sized and in a modern format.`,
  ];
  if (rows.length > 0) {
    lines.push(
      `Host: benchmarkIndex ${range(
        rows.map((row) => row.benchmarkIndex),
        0,
      )}, cpuSlowdownMultiplier ${range(
        rows.map((row) => row.cpuSlowdownMultiplier),
        1,
      )} (Lighthouse's calibration; the best of up to 3 runs counts).`,
    );
  }
  lines.push(
    '',
    '| Page | Scheme | LCP | CLS | SEO | Accessibility | Result |',
    '|---|---|---|---|---|---|---|',
  );
  for (const row of rows) {
    const failures = budgetFailures(row);
    lines.push(
      `| ${row.path} | ${row.scheme} | ${Math.round(row.lcpMs)} ms${row.attempts > 1 ? ` (best of ${row.attempts})` : ''} | ${row.cls.toFixed(3)} | ` +
        `${Math.round(row.seo * 100)} | ${Math.round(row.accessibility * 100)} | ` +
        `${failures.length === 0 ? 'pass' : `fail (${failures.join(', ')})`} |`,
    );
  }
  return lines.join('\n');
}

/**
 * Which of the two consistent states a budgets target is in, from what it serves: the
 * `X-Robots-Tag` of a site page and its `robots.txt`. A server that is not production (the local
 * build, every preview) says `noindex` and disallows everything; production sends no header and
 * allows the site. A target that is neither, or half of each, is `inconsistent`, and the spec fails
 * on it instead of measuring a view that no environment serves. `expected` holds the two files as
 * the site writes them (`robotsFile(robotsTxt(...))`).
 */
export function serverEnvironment(
  observed: { robotsTag: string | null; robotsTxt: string },
  expected: { nonProduction: string; production: string },
): 'non-production' | 'production' | 'inconsistent' {
  if (observed.robotsTag === null) {
    return observed.robotsTxt === expected.production ? 'production' : 'inconsistent';
  }
  return /noindex/.test(observed.robotsTag) && observed.robotsTxt === expected.nonProduction
    ? 'non-production'
    : 'inconsistent';
}
