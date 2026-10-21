import { unitConfig } from '@fivvi/testing/vitest';

// Playwright specs in e2e/ are excluded by the preset; they run with `pnpm test:e2e`.
export default unitConfig();
