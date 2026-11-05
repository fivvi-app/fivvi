# @fivvi/domain

Business rules (`docs/product/PRODUCT.md`), server-side and pure: no I/O, no framework imports, no clock of its own (a rule that needs "now" takes an injected `Clock`, `@fivvi/testing/clock`). `packages/api` calls the rules; web, iOS and Android never re-implement one (`CODING_STANDARDS.md`). Tested next to the code, through the exported interface.

```ts
import { canCreateWorkspace, slugCandidates, WORKSPACE_DEFAULTS } from '@fivvi/domain';

canCreateWorkspace({ email, signUpAllowlist }); // F002, F012: on the sign-up allowlist
for (const slug of slugCandidates("John's Gym")) {
  // 'johns-gym', 'johns-gym-2', … without the reserved words; take the first the database accepts
}
```

| Module | What | Spec |
|---|---|---|
| `src/workspaces/can-create.ts` | Who may create a workspace: on the sign-up allowlist (F001) alone, also with a workspace already (F012) | F002 AC5, F012 AC8, AC9 |
| `src/workspaces/slug.ts` | The URL name from a workspace name: transliterate, lower case, hyphens, a number when taken, reserved words skipped | F002 AC2 |
| `src/team/last-owner.ts` | A workspace keeps at least one Owner: whether a removal (F004: a role change) leaves one | F003 AC7 |
| `src/team/trainer-invitation.ts` | Inviting a trainer: valid for 7 days, 20 invitations a day, one pending per address, not for someone on the team, and the language of the email (chosen, then the address's account, then the workspace default) | F011 AC1, AC2, AC8, AC10 |
| `src/clients/new-client.ts` | A new client: the email address stored lower case, whether it is a duplicate of a client of the workspace, and which account it is linked to | F006 AC2–AC4, AC9 |
| `src/clients/edit-client.ts` | An edited client: whether the new email address is a duplicate of another client of the workspace, and which account the link follows | F006 AC7, AC8 |
| `src/locations/address.ts` | A location's address: the Dutch postcode normalized to `1234 AB`, the house number of one to five digits, all or nothing | F015 AC15 |
| `src/locations/default-location.ts` | The location types of `PRODUCT.md §12`, the 120-character name limit and `defaultLocation(workspace)`, the one location every session takes | F015, F016 |
| `src/workspaces/defaults.ts` | What a new workspace starts with (`nl-NL`, `Europe/Amsterdam`) and the 80-character name limit | F002 AC2, AC3 |

Tests: `pnpm --filter @fivvi/domain test` (Vitest, `*.test.ts` next to the code).
