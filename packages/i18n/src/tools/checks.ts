import { locales } from '../config.ts';
import { analyze } from './analyze.ts';
import { type CatalogSet, readCatalogSet } from './catalog.ts';
import { CatalogError, renderNativeCatalogs, staleNativeCatalogs } from './generate.ts';

export const checkNames = ['parity', 'icu', 'generated'] as const;
export type CheckName = (typeof checkNames)[number];

export interface CheckResult {
  name: CheckName;
  problems: string[];
  /** One line describing what passed, for the CLI. */
  summary: string;
}

/**
 * The CI guardrails of ADR-008, run by `pnpm check` (turbo):
 * - `parity`: every key exists in every locale with the same placeholders, and key
 *   names are valid and map to unique Android resource names.
 * - `icu`: every message is valid ICU in the subset the native exporters support.
 * - `generated`: the committed native catalogs match the JSON.
 */
export async function runChecks(
  root: string,
  names: readonly CheckName[] = checkNames,
  set?: CatalogSet,
): Promise<CheckResult[]> {
  const analysis = analyze(set ?? (await readCatalogSet(root)));
  const results: CheckResult[] = [];
  for (const name of names) {
    switch (name) {
      case 'parity':
        results.push({
          name,
          problems: analysis.parity,
          summary: `${analysis.keys.length} keys in ${locales.join(', ')}`,
        });
        break;
      case 'icu':
        results.push({
          name,
          problems: analysis.icu,
          summary: `${locales.reduce((n, locale) => n + analysis.compiled[locale].size, 0)} messages`,
        });
        break;
      case 'generated': {
        let problems: string[];
        try {
          problems = await staleNativeCatalogs(root, renderNativeCatalogs(analysis));
          if (problems.length > 0) {
            problems.push('Run `pnpm --filter @trainer-hub/i18n generate` and commit the result.');
          }
        } catch (error) {
          if (!(error instanceof CatalogError)) throw error;
          problems = ['cannot generate native catalogs until the parity and icu checks pass'];
        }
        results.push({ name, problems, summary: 'native catalogs are up to date' });
        break;
      }
    }
  }
  return results;
}
