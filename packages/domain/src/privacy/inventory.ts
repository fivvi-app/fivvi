import type { PrivacyDeclaration, PrivacySubject } from './registry.ts';
import {
  describeRetention,
  RETENTION_BASIS,
  type RetentionKey,
  type RetentionPeriod,
} from './retention.ts';

/** Where the generated inventory lives, relative to this file. */
export const PRIVACY_INVENTORY_PATH = '../../../../docs/engineering/PRIVACY.md';

const SUBJECTS: readonly { subject: PrivacySubject; title: string; about: string }[] = [
  {
    subject: 'client',
    title: 'Client data',
    about: 'Deleted or anonymised when a client is deleted.',
  },
  {
    subject: 'account',
    title: 'Account data',
    about: 'Deleted when a person deletes the account.',
  },
  {
    subject: 'team_member',
    title: 'Team data',
    about: 'Ends when a team member leaves a workspace or deletes the account.',
  },
  {
    subject: 'workspace',
    title: 'Workspace data',
    about: 'Deleted when a terminated workspace is purged.',
  },
];

const DELETION = {
  delete: 'Deleted',
  anonymize: 'Anonymised',
  'keep-for-law': 'Kept for the law',
} as const;

const code = (fields: readonly string[]) =>
  fields.length === 0 ? 'none' : fields.map((field) => `\`${field}\``).join(', ');

/** Table cells hold no pipe or line break. */
const cell = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');

function retentionCell(
  declaration: Extract<PrivacyDeclaration, { personal: true }>,
  retention: Record<RetentionKey, RetentionPeriod>,
): string {
  if (!declaration.retention) return 'Until deleted';
  const period = describeRetention(retention[declaration.retention]);
  return `${period} after ${RETENTION_BASIS[declaration.retention].from}`;
}

/**
 * `docs/engineering/PRIVACY.md`: which personal data Fivvi stores, per table, how it is exported
 * and deleted, and for how long. Pure: the registry and the periods come in, the document goes out.
 * `pnpm --filter @fivvi/domain generate:privacy` writes it; a test fails when the file differs.
 */
export function renderPrivacyInventory(
  registry: readonly PrivacyDeclaration[],
  retention: Record<RetentionKey, RetentionPeriod>,
): string {
  const lines: string[] = [
    '# Data inventory',
    '',
    '<!-- Generated from packages/domain/src/privacy by `pnpm --filter @fivvi/domain generate:privacy`. Do not edit by hand: a test fails when this file differs from the registry. -->',
    '',
    'Which personal data Fivvi stores, per table, how an export and a deletion treat it, and for how long it is kept. It is the source for the App Store privacy details and the Google Play data safety form (`RELEASE.md §9`). A feature that adds a table declares it in the privacy registry in the same PR ([`TESTING.md §3`](TESTING.md)).',
    '',
    'Periods come from [`retention-policy.md`](../legal/retention-policy.md) §2. A period of days counts 24 hours of UTC time, a period of months calendar months in UTC.',
  ];

  for (const { subject, title, about } of SUBJECTS) {
    const declarations = registry.filter(
      (declaration): declaration is Extract<PrivacyDeclaration, { personal: true }> =>
        declaration.personal && declaration.subject === subject,
    );
    if (declarations.length === 0) continue;
    lines.push('', `## ${title}`, '', about, '');
    lines.push('| Table | Personal data | Export carries | Deletion | Retention | Note |');
    lines.push('|---|---|---|---|---|---|');
    for (const declaration of declarations) {
      lines.push(
        `| \`${declaration.table}\` | ${code(declaration.personalData)} | ${
          declaration.export.length === 0 ? 'Not exported' : code(declaration.export)
        } | ${DELETION[declaration.onDelete]} | ${retentionCell(declaration, retention)} | ${cell(declaration.note)} |`,
      );
    }
  }

  const without = registry.filter(
    (declaration): declaration is Extract<PrivacyDeclaration, { personal: false }> =>
      !declaration.personal,
  );
  if (without.length > 0) {
    lines.push('', '## Tables without personal data', '');
    lines.push('| Table | Why |', '|---|---|');
    for (const declaration of without) {
      lines.push(`| \`${declaration.table}\` | ${cell(declaration.reason)} |`);
    }
  }

  lines.push('', '## Retention periods', '');
  lines.push('| Constant | Policy | Period |', '|---|---|---|');
  for (const key of Object.keys(retention) as RetentionKey[]) {
    lines.push(
      `| \`${key}\` | ${RETENTION_BASIS[key].policy} | ${describeRetention(retention[key])} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
