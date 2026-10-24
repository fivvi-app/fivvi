import { parseArgs } from 'node:util';
import { createDatabaseFromEnv } from '../client.ts';
import { release } from '../release.ts';
import { isProductionEnvironment } from '../seed.ts';

// Pre-deploy command on Railway (docs/engineering/ENVIRONMENTS.md): `release.ts [--seed]`.
const { values } = parseArgs({ options: { seed: { type: 'boolean', default: false } } });

const { db, close } = createDatabaseFromEnv();
try {
  await release(db, { seed: values.seed, production: isProductionEnvironment() });
} finally {
  await close();
}
