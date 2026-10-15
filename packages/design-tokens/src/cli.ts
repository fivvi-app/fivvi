// Usage: node src/cli.ts generate | check [generated|contrast]… [--root <dir>]
import path from 'node:path';
import { parseArgs } from 'node:util';
import { writeOutputs } from './build.ts';
import { type CheckName, checkNames, runChecks } from './check.ts';
import { readTokenSource, TokenSourceError } from './source.ts';

const packageRoot = path.resolve(import.meta.dirname, '..');
const usage = 'Usage: node src/cli.ts generate | check [generated|contrast]… [--root <dir>]';

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
      for (const file of await writeOutputs(root, await readTokenSource(root))) {
        console.log(`wrote ${file}`);
      }
      return 0;
    } catch (error) {
      if (!(error instanceof TokenSourceError)) throw error;
      console.error(error.message);
      return 1;
    }
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
        console.log(`✓ design-tokens ${result.name}: ${result.summary}`);
      } else {
        failed = true;
        console.error(`✗ design-tokens ${result.name}: ${result.problems.length} problem(s)`);
        for (const problem of result.problems) console.error(`  - ${problem}`);
      }
    }
    return failed ? 1 : 0;
  }

  console.error(usage);
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
