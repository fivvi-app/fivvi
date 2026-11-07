import type { SceneId, ShotId } from './screens';

/** The four kinds of visitor the *I am* switch offers, in order. */
export const audienceIds = ['gym', 'studio', 'pt', 'client'] as const;
export type AudienceId = (typeof audienceIds)[number];

/**
 * The screens shown under the switch: a laptop and a phone sharing one top and bottom edge, or
 * three phones in a row.
 */
export type Stage =
  | { kind: 'mix'; web: ShotId; phone: ShotId }
  | { kind: 'row'; phones: readonly [ShotId, ShotId, ShotId] };

export interface Audience {
  /** The page that tells this audience's day; its link appears once the page exists. */
  page: 'gyms' | 'studios' | 'personalTrainers' | 'clients';
  /** The miniature that stands next to the headline and on the audience's card. */
  scene: SceneId;
  stage: Stage;
}

/** What the home page shows for each audience (`DECISIONS.md` §9). */
export const audiences: Record<AudienceId, Audience> = {
  gym: {
    page: 'gyms',
    scene: 'gym',
    stage: { kind: 'mix', web: 'web-dashboard', phone: 'pro-today-gym' },
  },
  studio: {
    page: 'studios',
    scene: 'pilates',
    stage: { kind: 'mix', web: 'web-class-pilates', phone: 'pro-today-pilates' },
  },
  pt: {
    page: 'personalTrainers',
    scene: 'pt',
    stage: { kind: 'row', phones: ['pro-today-solo', 'pro-log', 'pro-client'] },
  },
  client: {
    page: 'clients',
    scene: 'client',
    stage: { kind: 'row', phones: ['app-home', 'app-book', 'app-credit'] },
  },
};
