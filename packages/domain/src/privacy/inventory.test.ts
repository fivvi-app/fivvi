import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRIVACY_INVENTORY_PATH, renderPrivacyInventory } from './inventory.ts';
import { PRIVACY_REGISTRY, type PrivacyDeclaration } from './registry.ts';
import { RETENTION } from './retention.ts';

const NEW_TABLE: PrivacyDeclaration = {
  table: 'f099_workout_logs',
  personal: true,
  subject: 'client',
  personalData: ['weight_kg'],
  export: ['weight_kg'],
  onDelete: 'delete',
  retention: 'TRASH',
  note: 'A test table.',
};

describe('E014 AC25: the data inventory is generated from the registry', () => {
  it('AC25: PRIVACY.md matches the registry', () => {
    const committed = readFileSync(new URL(PRIVACY_INVENTORY_PATH, import.meta.url), 'utf8');
    // Out of date? Run `pnpm --filter @fivvi/domain generate:privacy` and commit the file.
    expect(committed).toBe(renderPrivacyInventory(PRIVACY_REGISTRY, RETENTION));
  });

  it('differs when a table is added to the registry', () => {
    expect(renderPrivacyInventory([...PRIVACY_REGISTRY, NEW_TABLE], RETENTION)).not.toBe(
      renderPrivacyInventory(PRIVACY_REGISTRY, RETENTION),
    );
  });

  it('differs when a retention period changes by one line', () => {
    expect(
      renderPrivacyInventory(PRIVACY_REGISTRY, {
        ...RETENTION,
        TRASH: { unit: 'days', amount: 31 },
      }),
    ).not.toBe(renderPrivacyInventory(PRIVACY_REGISTRY, RETENTION));
  });

  it('lists every table with its subject, personal data, export, deletion and retention', () => {
    const text = renderPrivacyInventory([...PRIVACY_REGISTRY, NEW_TABLE], RETENTION);
    expect(text).toContain(
      '| `f099_workout_logs` | `weight_kg` | `weight_kg` | Deleted | 30 days after the client was moved to the trash |',
    );
    expect(text).toContain('## Client data');
    expect(text).toContain('## Account data');
    expect(text).toContain('## Team data');
    expect(text).toContain('## Workspace data');
  });

  it('says that a table is not exported, and keeps a row without the link to the person as anonymised', () => {
    const text = renderPrivacyInventory(PRIVACY_REGISTRY, RETENTION);
    expect(text).toMatch(/\| `auth_users` \|.*\| Not exported \| Deleted \|/);
    expect(text).toMatch(/\| `session_participants` \|.*\| Anonymised \|/);
  });

  it('lists the tables without personal data with the reason', () => {
    const text = renderPrivacyInventory(PRIVACY_REGISTRY, RETENTION);
    expect(text).toContain('## Tables without personal data');
    expect(text).toMatch(/\| `job_runs` \|/);
    expect(text).toMatch(/\| `system_greetings` \|/);
  });

  it('lists the retention periods with their policy rule', () => {
    const text = renderPrivacyInventory(PRIVACY_REGISTRY, RETENTION);
    expect(text).toContain('| `INVOICE` | R21 | 7 years after the end of the year |');
    expect(text).toContain('| `SIGN_IN_TOKEN_AFTER_EXPIRY` | R2 | 24 hours |');
  });
});
