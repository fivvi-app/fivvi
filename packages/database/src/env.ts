export interface DatabaseConfig {
  /** A `postgres://` or `postgresql://` connection string. Contains a password: never log it. */
  url: string;
  /** Maximum number of pooled connections. */
  maxConnections?: number;
}

const PROTOCOLS = new Set(['postgres:', 'postgresql:']);

/**
 * Reads the connection settings from the environment (`DATABASE_URL`).
 * Error messages never include the URL, because it contains the password.
 */
export function readDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. For local development, copy packages/database/.env.example to .env.',
    );
  }
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }
  if (!PROTOCOLS.has(protocol)) {
    throw new Error('DATABASE_URL must start with postgres:// or postgresql://.');
  }
  return { url };
}
