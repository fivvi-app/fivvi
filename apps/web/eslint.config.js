import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig } from 'eslint/config';
import base from '../../eslint.config.js';

export default defineConfig(nextCoreWebVitals, base, {
  settings: {
    next: { rootDir: import.meta.dirname },
  },
});
