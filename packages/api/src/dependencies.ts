/** What the API needs from the outside world. apps/web wires the real ones; tests pass fakes. */
export interface ApiDependencies {
  /** Resolves when Postgres answers a trivial query; rejects otherwise. */
  pingDatabase(): Promise<void>;
}

/**
 * For code that only needs the routes, not a running API: the OpenAPI document and tests of
 * routes without dependencies. The health check reports the database as unavailable.
 */
export const NO_DEPENDENCIES: ApiDependencies = {
  pingDatabase: () => Promise.reject(new Error('No database configured.')),
};
