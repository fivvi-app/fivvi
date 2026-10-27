import { parseArgs } from 'node:util';
import { readAppRolePassword } from '../env.ts';
import { openPrivilegedDatabase } from '../privileged.ts';
import { release } from '../release.ts';
import { isProductionEnvironment } from '../seed.ts';

// Pre-deploy command on Railway (docs/engineering/ENVIRONMENTS.md): `release.ts [--seed]`.
// The privileged connection (DATABASE_URL) is only for this step, on the allow-list of
// privileged.ts (E011, AC17).
const { values } = parseArgs({ options: { seed: { type: 'boolean', default: false } } });

const { db, close } = openPrivilegedDatabase('release');
try {
  await release(db, {
    seed: values.seed,
    production: isProductionEnvironment(),
    appRolePassword: readAppRolePassword(),
  });
} finally {
  await close();
}
