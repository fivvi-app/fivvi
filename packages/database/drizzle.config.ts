import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` only reads the schema; it never connects to a database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  strict: true,
  verbose: true,
});
