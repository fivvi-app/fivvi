# @fivvi/domain

Business rules (`docs/product/PRODUCT.md`), pure and decided on the server: no I/O, no framework imports, no clock of its own (a rule that needs "now" takes an injected `Clock`, `@fivvi/testing/clock`). The one exception is the import dry-run CLI (`src/import/cli.ts` and `src/import/workspace-fixtures.ts`, E015 spec #478): a dev tool that reads a file and talks to a scratch database on the local Postgres; no rule imports from them and `src/index.ts` does not export them. `packages/api` calls the rules; web, iOS and Android never re-implement one (`CODING_STANDARDS.md`). The one thing a client may run is a rule that has no I/O and needs no server state, to tell the person what the server will decide before they save: the web session forms (F020) import two files on their own paths, `@fivvi/domain/zoned-time` (where a typed date and start land, whether the start is skipped or repeated; the API still decides and has the last word) and `@fivvi/domain/private-session-durations` (the lengths a form lists). They are `package.json` exports (`./zoned-time`, `./private-session-durations`) with no imports of their own, so the browser bundle takes nothing else of the package. Add another such export only for a pure file like these, and never import `@fivvi/domain` itself in a client component. Tested next to the code, through the exported interface.

```ts
import { canCreateWorkspace, slugCandidates, WORKSPACE_DEFAULTS } from '@fivvi/domain';

canCreateWorkspace({ email, signUpAllowlist }); // F002, F012: on the sign-up allowlist
for (const slug of slugCandidates("John's Gym")) {
  // 'johns-gym', 'johns-gym-2', … without the reserved words; take the first the database accepts
}
```

## Modules

The code is in `src/`, one folder per area:

| Folder | Area |
|---|---|
| `src/workspaces/` | Creating a workspace, its URL name, its defaults, the join link |
| `src/team/` | The team of a workspace: the last Owner, trainer invitations, the trainer profile |
| `src/clients/` | A new and an edited client |
| `src/locations/` | A location's address and the default location |
| `src/scheduling/` | Private sessions, group classes, weekly series, wall-clock time and the calendar rules |
| `src/commerce/` | Offers, the agreement's clock, invoice arithmetic, numbers and details |
| `src/payments/` | The payment and refund engine: the provider port, the ledgers, status rules; `testing/` has the test doubles |
| `src/privacy/` | The privacy registry, retention, the access log and the deletion log |
| `src/import/` | The importer of the data import |
| `src/permissions/` | The permission matrix |

**This README does not list modules.** A module describes itself at the top of its file, in two comment lines:
`// Module:` (what it decides, in the words of the domain) and `// Spec:` (the feature and acceptance criteria it
implements, such as `F020 AC4`). A folder that is one module as a whole (`src/import/`, `src/payments/testing/`) has
a `README.md` of its own with the same two lines, `Module:` and `Spec:`. A new module adds its two lines to its own
file and **never a row here**; two domain tickets in flight then never edit the same line (E001 #1270). Add a line to the folder table only
for a new folder.

Find a module, or the module of a spec, with:

```bash
grep -rnE -A1 '^(// )?Module:' packages/domain/src                        # every module and what it is for
grep -rnE --include='*.ts' --include='README.md' '^(// )?Spec:.*F022' packages/domain/src   # the files of a spec or criterion
```


### Import dry-run

```bash
IMPORT_DRY_RUN_DATABASE_URL=postgres://fivvi:fake-local-db-password@localhost:5432/fivvi \
  pnpm --filter @fivvi/domain import:dry-run --file <path> --workspace-fixture johns-gym
```

Loads the named synthetic workspace (`johns-gym`, or `johns-gym-existing-client`) into a scratch database it creates on the local Postgres (`pnpm db:up`) and drops afterwards, runs the check and the plan on the file and prints counts, and the type, sheet and row of each problem: never a name, email address, column name or cell value. Without `IMPORT_DRY_RUN_DATABASE_URL` it uses `TEST_DATABASE_URL`; a server that isn't on localhost is refused without echoing the URL. `--file` is one `.xlsx`, or one `.csv` per sheet (the sheet is the file name after the last dot: `clients.csv`, `import-sample.clients.csv`; repeat `--file`). Exit code 0 when the file can be imported, 1 when it has an error, 2 when it can't run or the file is refused. The synthetic sample is in `packages/testing/fixtures/` (`@fivvi/testing/import-sample`).

Tests: `pnpm --filter @fivvi/domain test` (Vitest, `*.test.ts` next to the code); `pnpm --filter @fivvi/domain test:integration` runs the CLI and the database ledger (`test/payment-ledger.integration.test.ts`: `paymentLedger` of `packages/database` against `ledgerContract`, and the description limit equal to the table's) against the local Postgres.
