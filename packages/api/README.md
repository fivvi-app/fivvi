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

Work that must happen only once the request has committed (an email to a client, a product event) is queued with `c.get('afterCommit')(task)` (F020, `src/access.ts`): the tasks run in order after the commit and before the response is returned, are dropped when the request fails (`400` and up, or an error) and so rolled back, and a task that throws is reported to error tracking without changing the answer. The trainer invitation (F011) still sends inside the transaction, because it fails the request when the email can not be sent; a confirmation that must not undo what was stored (EM-11) goes after the commit.

Business rules are not written in a route: the route calls `@fivvi/domain` (for example `canCreateWorkspace`, `slugCandidates`). A refusal that is a business rule and not the access (`POST /v1/workspaces`: not on the sign-up allowlist) is a route middleware that runs after the access and before the body's validation, so a refused caller gets `403` whatever it sent. Declare a `security` list once as a typed constant when a route has two schemes and a body (`SIGNED_IN` in `src/routes/workspaces.ts`): written inline, TypeScript loses the route's request types.

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

A route that creates the caller's workspace (`POST /v1/workspaces`, F002) says so in its case (`createsWorkspace: true`). Its business rule is the sign-up allowlist alone (F012: an account that has a workspace may create another), so every signed-in account succeeds (the harness's allowlist is `@example.com`), and a successful call may add exactly one workspace of the caller's own, whose rows the suite then lets through and counts among the caller's places for the calls after it.

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

A route that takes a record in its body, not in its path (`createPrivateSession`, F020, names the client), gives `body` as a function of the seeded values: `body: (values) => ({ clientId: values.client, … })`. It is called once per call, with the values of the workspace and client the call is for, and makes the suite treat the route as one that names a record. Where the route needs more of the workspace than the case seeds (everyone on the team training), the seed makes it, right before the calls.

`seed` runs through the privileged connection for every client of workspaces A and B, so a route
about a client's records is called with the caller's own and with another client's. Make its rows with
the factories in `@fivvi/database/testing`, so every record carries a unique id the suite can search
for. What `seed` returns is also what a successful `GET` must show: a route with path parameters must
show the record its path names, one without (a listing) every returned value the caller may see, so
give a listing a seed that returns the ids it lists. A text column that holds a `uniqueMarker`
(`label-1a2b3c4d`) is found by it too: return the marker. The suite reports a seed value it can't
find as an id or marker in a stored row, and a `GET` of a workspace whose seed returns nothing it can
look for (a too-strict policy would pass). Only an account route like `getMe` may go without a seed. A route with method `DELETE` consumes its record, so the suite calls `seed` again before each of its calls. A new business table also adds its entry to `isolationFactories` in the same package.

A read that reads no stored record (the address lookup, whose answer comes from PDOK, F015) says `readsNoRecords: true` in its case instead of seeding one. The flag excuses only the check that a `GET` shows a seeded record: a case with both a flag and a `seed` is a failure, and the status, the refusals, the markers of other workspaces and the rows that change are checked as for any route.

## The address lookup (F015)

`GET /v1/workspaces/{workspaceId}/address-lookup` (Owner, `settings.manage`) answers the street and city of a postcode, house number and optional addition. The code is in `src/address-lookup/`: an `AddressLookup` interface, the PDOK adapter (Locatieserver v3.1 free search, 3 seconds, no retry, no key), an in-memory fake, a one-day cache on the normalized query, and `createAddressLookup(env)`, which picks one: PDOK in the production environment or with `ADDRESS_LOOKUP=pdok`, the fake everywhere else (CI, e2e, previews). The adapter sends the postcode, house number and addition only, and nothing is logged, reported or sent as a product event. The rate limit (60 per workspace per hour, `429`) is `ApiDependencies.consumeRateLimit`, over the sign-in's counters in Postgres, outside the request's transaction so a refused request still counts. The adapter's tests read recorded answers from `test/fixtures/pdok/` and never use the network; to record one again, call the URL of `pdok.ts` once with `curl` for a public address and save the body.

## The demo request (F064)

`POST /v1/demo-requests` is the public website's demo form (spec #611, `src/routes/demo-requests.ts`): public, rate limited and honeypotted. A valid request sends one email to Fivvi's support address through `ApiDependencies.sendDemoRequest` (`createDemoRequestSender` of `@fivvi/email`, wired in `apps/web/server/api.ts`) and answers `202`. It stores nothing and logs nothing about the visitor, and sends no email to the visitor, so it cannot be used to mail someone else. The `website` field is the honeypot: a request that fills it gets the same `202` and sends nothing. The limits are `ApiDependencies.consumeRateLimit`: 5 per client IP address per hour and 60 for everyone, `429`. The address comes from `X-Real-IP` as for sign-in, through `ApiDependencies.clientAddressKey` (`clientAddressKey` of `@fivvi/auth`): a keyed hash (HMAC with `BETTER_AUTH_SECRET`, its own purpose) with IPv6 grouped by /64, so the counter table holds no address and one IPv6 host gets one limit; where a proxy always sets the header (`NODE_ENV=production`), a request without a usable address shares one bucket, elsewhere it has no per-address limit. Expired counters are deleted after counting (`ApiDependencies.deleteExpiredRateLimits`), and a limited request logs which limit and nothing else. A send that fails is `503`, reported to Sentry without the request body.
