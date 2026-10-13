import { cp } from 'node:fs/promises';

// `next build` with `output: 'standalone'` leaves the client assets out of the standalone
// server. Copying them in makes `pnpm start` (and the e2e tests) serve exactly what the
// Docker image serves in production (E003).
await cp('.next/static', '.next/standalone/apps/web/.next/static', {
  recursive: true,
  force: true,
});
