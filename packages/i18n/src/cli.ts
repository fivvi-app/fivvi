// Usage: node src/cli.ts generate | sort | check [parity|icu|generated|no-literal-trainer|sorted]… [--root <dir>]
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readCatalogSet } from './tools/catalog.ts';
import { type CheckName, checkNames, runChecks } from './tools/checks.ts';
import { CatalogError, writeNativeCatalogs } from './tools/generate.ts';
import { writeSortedCatalogs } from './tools/sort.ts';

const packageRoot = path.resolve(import.meta.dirname, '..');

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { root: { type: 'string' } },
  });
  const root = path.resolve(values.root ?? packageRoot);
  const [command, ...rest] = positionals;

  if (command === 'generate') {
    try {
      const files = await writeNativeCatalogs(root);
      for (const file of files) console.log(`wrote ${file}`);
      return 0;
    } catch (error) {
      if (!(error instanceof CatalogError)) throw error;
      console.error(error.message);
      return 1;
    }
  }

  if (command === 'sort') {
    for (const file of await writeSortedCatalogs(root, await readCatalogSet(root))) {
      console.log(`sorted ${file}`);
    }
    return 0;
  }

  if (command === 'check') {
    const unknown = rest.filter((name) => !(checkNames as readonly string[]).includes(name));
    if (unknown.length > 0) {
      console.error(`Unknown check(s): ${unknown.join(', ')}. Use: ${checkNames.join(', ')}`);
      return 2;
    }
    const names = rest.length > 0 ? (rest as CheckName[]) : checkNames;
    let failed = false;
    for (const result of await runChecks(root, names)) {
      if (result.problems.length === 0) {
        console.log(`✓ i18n ${result.name}: ${result.summary}`);
      } else {
        failed = true;
        console.error(`✗ i18n ${result.name}: ${result.problems.length} problem(s)`);
        for (const problem of result.problems) console.error(`  - ${problem}`);
      }
    }
    return failed ? 1 : 0;
  }

  console.error(
    'Usage: node src/cli.ts generate | sort | check [parity|icu|generated|no-literal-trainer|sorted]… [--root <dir>]',
  );
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
