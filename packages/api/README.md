# @fivvi/api

The API routes (Hono + zod-openapi), mounted by `apps/web` under `/api`. The contract is
`packages/contract/openapi.json`, generated from these routes.

## Adding a route

Every route is defined with `defineRoute(route, access)` (`src/access.ts`). The access (`public`,
`account` or `workspace` with its team roles and whether a client may call it) installs the access
middleware and is written as `x-access` in the contract. A workspace route lives under
`/v1/workspaces/{workspaceId}/…`, reads and writes business data only through the repositories of
`@fivvi/database`, and never touches a business table.

A lint rule keeps it that way (E011): `pnpm lint` fails for code in `src/` that imports a table or a raw
database handle (`createDatabase`, `Database`, `DatabaseExecutor`, …), a namespace import or `export *` of
`@fivvi/database` (also with `import()` or `require()`), `drizzle-orm`, `pg`, `@fivvi/testing`, the `seed`,
`migrate` and `testing` entries of `@fivvi/database`, or a path into `packages/database/src`.
It is the Biome plugin `lint/repository-only-imports.grit`, registered for `src/` in the root `biome.json`;
the tests of this package may use tables, as they seed and read rows directly. Every export of
`@fivvi/database` is either named in the plugin's list or in the allowed list of
`lint/repository-only-imports.test.ts` (with the reason a route may use it); a new export in neither fails
that test, so whoever adds a table, a handle or a connection opener has to say which it is.

## The isolation suite (E011)

`pnpm test` fails until every route is covered, and the suite proves that workspace A's data does not
reach, and is not changed by, anyone without a place in A.

- **Coverage** (`test/isolation/coverage.test.ts`, no database): every operation declares its access;
  a `public` operation is on the allow-list `test/isolation/public-routes.ts` (with the reason); every
  `workspace` and `account` operation has an isolation case; no case or allow-list entry names an
  operation that no longer exists. The failure names the operation.
- **The suite** (`test/isolation/routes.integration.test.ts`, real Postgres): it calls every `workspace`
  and `account` operation of the test app (the real routes of `createApp` plus the probe routes of
  `test/isolation/probe-routes.ts`, which are not in the contract; a new real route is picked up
  automatically) as the standard actors: A's owner, trainer and client, B's owner, trainer and client,
  an account with no place in A, and an anonymous caller. For each call it checks that
  - the status is the one derived from the route's `x-access` and the actor's place in the workspace
    (`401`, `404`, `403`, or success only where allowed; a record of another workspace, or of another
    client on a client route, is `404`), and a refusal is exactly its machine-readable body;
  - the response holds no id or marker of a record the actor may not see (the other workspace, another
    client);
  - no row of any workspace changed, except those a successful write may change.
- **The self-test** (`test/isolation/self-test.integration.test.ts`): a leaky probe route and a table
  without a policy, which exist only in that test, make the suite report failures.

### A new route's isolation case

Add one entry to `ISOLATION_CASES` in `test/isolation/isolation-cases.ts`, keyed by the route's
`operationId`. A case holds data only, and has no field for a status or an expectation: the status,
what a response may show and what may change come from one module, `test/isolation/expectations.ts`.

```ts
listSessions: {},                       // a route that names no record, and needs no body
getSession: {                           // a route about one record of a workspace
  seed: async (db, { workspaceId, clientId }) => ({
    session: (await addSession(db, { workspaceId, clientId })).id,   // a factory of @fivvi/database/testing
  }),
  params: { sessionId: 'session' },     // path parameter -> the seeded value
},
createSession: { body: { startsAt: '2030-01-01T10:00:00Z' } },       // a valid body (and `query: '?page=1'`)
```

`seed` runs through the privileged connection for every client of workspaces A and B, so a route
about a client's records is called with the caller's own and with another client's. Make its rows with
the factories in `@fivvi/database/testing`, so every record carries a unique id the suite can search
for. What `seed` returns is also what a successful `GET` must show: a route with path parameters must
show the record its path names, one without (a listing) every returned value the caller may see, so
give a listing a seed that returns the ids it lists. A text column that holds a `uniqueMarker`
(`label-1a2b3c4d`) is found by it too: return the marker. The suite reports a seed value it can't
find as an id or marker in a stored row, and a `GET` of a workspace whose seed returns nothing it can
look for (a too-strict policy would pass). Only an account route like `getMe` may go without a seed. A new business table also adds its entry to `isolationFactories` in the same package.
