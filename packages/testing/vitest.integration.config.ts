import { integrationConfig } from './src/vitest.ts';

export default integrationConfig({
  test: { globalSetup: ['./test/global-setup.ts'] },
});
