import { pgTable } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns.ts';
import { workspacePolicy } from './tenant-policies.ts';

/**
 * A workspace: a gym or an independent trainer's business, the root of tenant isolation
 * (ADR-006, `GLOSSARY.md`). Every business table points at it with `organization_id`.
 *
 * Only `id` and timestamps for now; F002 adds the name, the default communication language, the
 * time zone and the settings. It is filtered on `id` instead of `organization_id`, so it is not
 * made with `businessTable`. Forced RLS is in a migration, as for every table.
 */
export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    ...timestamps(),
  },
  (table) => [workspacePolicy('organizations', table.id)],
);

export type Organization = typeof organizations.$inferSelect;
