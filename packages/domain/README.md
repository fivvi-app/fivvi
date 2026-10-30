# @fivvi/domain

Business rules (`docs/product/PRODUCT.md`), server-side and pure: no I/O, no framework imports, no clock of its own (a rule that needs "now" takes an injected `Clock`, `@fivvi/testing/clock`). `packages/api` calls the rules; web, iOS and Android never re-implement one (`CODING_STANDARDS.md`). Tested next to the code, through the exported interface.

```ts
import { canCreateWorkspace, slugCandidates, WORKSPACE_DEFAULTS } from '@fivvi/domain';

canCreateWorkspace({ email, signUpAllowlist, hasTeamRole }); // F002: allowlisted and no team role
for (const slug of slugCandidates("John's Gym")) {
  // 'johns-gym', 'johns-gym-2', … without the reserved words; take the first the database accepts
}
```

| Module | What | Spec |
|---|---|---|
| `src/workspaces/can-create.ts` | Who may create a workspace: on the sign-up allowlist (F001) and no team role in any workspace | F002 AC4, AC5 |
| `src/workspaces/slug.ts` | The URL name from a workspace name: transliterate, lower case, hyphens, a number when taken, reserved words skipped | F002 AC2 |
| `src/team/last-owner.ts` | A workspace keeps at least one Owner: whether a removal (F004: a role change) leaves one | F003 AC7 |
| `src/workspaces/defaults.ts` | What a new workspace starts with (`nl-NL`, `Europe/Amsterdam`) and the 80-character name limit | F002 AC2, AC3 |

Tests: `pnpm --filter @fivvi/domain test` (Vitest, `*.test.ts` next to the code).
