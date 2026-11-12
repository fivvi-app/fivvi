import type { Schemas } from '@fivvi/contract';

/** What `GET /v1/me` lists per workspace (the permission matrix of F004), for component tests. */
export type Capabilities = Schemas['MyWorkspace']['capabilities'];

export const OWNER: Capabilities = [
  'workspace.manage',
  'team.view',
  'team.manage',
  'trainers.view',
  'clients.view',
  'clients.manage',
  'location.read',
  'settings.manage',
  'join_link.view',
  'join_link.renew',
];

export const TRAINER: Capabilities = [
  'trainers.view',
  'clients.view',
  'clients.manage',
  'location.read',
  'join_link.view',
];
