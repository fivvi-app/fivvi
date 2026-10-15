// Usage: node lint/cli.ts [--root <repo root>]
import path from 'node:path';
import { parseArgs } from 'node:util';
import { checkRawColours, scope } from './no-raw-colours.ts';

const { values } = parseArgs({ options: { root: { type: 'string' } } });
const root = path.resolve(values.root ?? path.resolve(import.meta.dirname, '../../..'));
const { files, rawColours } = await checkRawColours(root);

if (rawColours.length === 0) {
  console.log(`✓ no raw colours: scanned ${files} file(s) in ${scope.join(', ')}`);
} else {
  console.error(
    `✗ no raw colours: ${rawColours.length} raw colour(s). Use a token class or variable instead (packages/ui/README.md)`,
  );
  for (const { file, line, column, value } of rawColours) {
    console.error(`  - ${file}:${line}:${column} ${value}`);
  }
  process.exitCode = 1;
}
