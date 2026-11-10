import { unitConfig } from '@fivvi/testing/vitest';

// Unit tests only. The rules do no I/O; the import dry-run CLI (`src/import/cli.ts`) does, and its
// test runs in `vitest.integration.config.ts` against the local Postgres.
export default unitConfig();
