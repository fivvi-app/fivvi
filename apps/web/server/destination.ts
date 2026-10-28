import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { Schemas } from '@fivvi/contract';

/** What `GET /v1/me` tells that decides where a person goes (F002). */
export type Me = Schemas['MeResponse'];

/** Where the signed-in home sends a person. */
export type Destination =
  | { to: 'workspace'; slug: string }
  | { to: 'welcome' }
  | { to: 'no-access' };

/**
 * The signed-in home's decision (F002, spec #170), from what the API says and nothing else: the
 * rule who may create a workspace lives in `packages/domain`, behind `canCreateWorkspace`. A
 * workspace first; none and allowed to create one: TW-11; neither: the no-access page. The
 * first workspace by name stands in for "the last one used", which F012 adds with the switcher.
 */
export function destinationOf({
  canCreateWorkspace,
  workspaces,
}: Pick<Me, 'canCreateWorkspace' | 'workspaces'>): Destination {
  const [first] = workspaces;
  if (first) return { to: 'workspace', slug: first.slug };
  return canCreateWorkspace ? { to: 'welcome' } : { to: 'no-access' };
}

/** The page of a destination. The no-access page is shown by the signed-in home itself. */
export function pathOf(destination: Destination): string {
  switch (destination.to) {
    case 'workspace':
      return `/w/${destination.slug}`;
    case 'welcome':
      return '/welcome';
    case 'no-access':
      return SIGNED_IN_HOME;
  }
}
