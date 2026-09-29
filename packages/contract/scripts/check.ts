// Fails when openapi.json or a generated client doesn't match the current API routes.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTRACT_ROOT, findDrift, GENERATED_PATHS, generateAll } from './pipeline.ts';

const fresh = await mkdtemp(join(tmpdir(), 'contract-check-'));
try {
  await generateAll(fresh, (step) => console.log(`Checking ${step}…`));
  const drift = await findDrift(fresh, CONTRACT_ROOT, Object.values(GENERATED_PATHS));
  if (drift.length > 0) {
    console.error('\nThe contract is stale. These generated files differ from the API routes:');
    for (const { path, kind } of drift) console.error(`  ${kind.padEnd(10)} ${path}`);
    console.error('\nRun `pnpm generate:contract` and commit the result.');
    process.exitCode = 1;
  } else {
    console.log('Contract and clients are up to date.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await rm(fresh, { recursive: true, force: true });
}
