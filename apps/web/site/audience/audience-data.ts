import type { Stage } from '../home/audiences';
import type { SceneId, ShotId } from '../home/screens';

/** The four audience pages, in the order of the header. Their names are the catalog's keys under `site.audience`. */
export const audiencePageIds = ['gyms', 'studios', 'personalTrainers', 'clients'] as const;
export type AudiencePageId = (typeof audiencePageIds)[number];

/** The two kinds of studio the Studios page switches between. */
export const kinds = ['pilates', 'yoga'] as const;
export type Kind = (typeof kinds)[number];

/** A value that is the same for every kind of studio, or one for each. */
export type ByKind<T> = T | Record<Kind, T>;

function isPerKind<T>(value: ByKind<T>): value is Record<Kind, T> {
  return typeof value === 'object' && value !== null && 'pilates' in value && 'yoga' in value;
}

/** The value for a kind of studio. */
export function forKind<T>(value: ByKind<T>, kind: Kind): T {
  return isPerKind(value) ? value[kind] : value;
}

/**
 * The colour of a moment's bar, as the calendar of the product has them: private sessions, group
 * classes, what is done, and the accent.
 */
export type MomentColour = 'private' | 'group' | 'success' | 'accent';

export interface Moment {
  /** The moment's key under `site.audience.<page>.moments`. */
  id: string;
  /** The clock time that opens the card; a way to tell the day, not a feature (`DECISIONS.md` §9). */
  time: string;
  colour: MomentColour;
  /** The real screen that answers the moment's question. */
  shot: ByKind<ShotId>;
  /** The chips under the answer: keys under the moment's `ticks`. Each says what the screen shows. */
  ticks: readonly ('a' | 'b')[];
}

export interface AudiencePageData {
  /** The miniature beside the headline: it stands on its own and is never a background. */
  scene: ByKind<SceneId>;
  /** The screens under the headline: a laptop and a phone on one top and bottom edge, or three phones. */
  stage: ByKind<Stage>;
  /** The working day, in the order of the clock. */
  moments: readonly Moment[];
}

/**
 * What each audience page tells (`DECISIONS.md` §9, the website design's `content.js`): one working
 * day of problems the visitor recognises, each answered by a real screen of the prototype.
 */
export const audiencePages: Record<AudiencePageId, AudiencePageData> = {
  gyms: {
    scene: 'gym',
    stage: { kind: 'mix', web: 'web-agenda', phone: 'pro-today-gym' },
    moments: [
      { id: 'crew', time: '07:00', colour: 'private', shot: 'pro-today-gym', ticks: ['a', 'b'] },
      { id: 'attention', time: '09:00', colour: 'accent', shot: 'web-dashboard', ticks: ['a'] },
      { id: 'team', time: '11:00', colour: 'group', shot: 'web-trainers', ticks: ['a', 'b'] },
      { id: 'substitute', time: '14:00', colour: 'group', shot: 'web-class', ticks: ['a', 'b'] },
      { id: 'offers', time: '16:00', colour: 'success', shot: 'web-offers', ticks: ['a', 'b'] },
      { id: 'payments', time: '18:00', colour: 'private', shot: 'web-payments', ticks: ['a', 'b'] },
      { id: 'renewal', time: '21:00', colour: 'accent', shot: 'web-client', ticks: ['a'] },
    ],
  },
  studios: {
    scene: { pilates: 'pilates', yoga: 'yoga' },
    stage: {
      pilates: { kind: 'mix', web: 'web-class-pilates', phone: 'pro-today-pilates' },
      yoga: { kind: 'mix', web: 'web-class-yoga', phone: 'pro-today-yoga' },
    },
    moments: [
      {
        id: 'waitlist',
        time: '06:45',
        colour: 'group',
        shot: { pilates: 'cw-waitlist-pilates', yoga: 'cw-waitlist-yoga' },
        ticks: ['a', 'b'],
      },
      { id: 'credits', time: '09:00', colour: 'success', shot: 'app-credit', ticks: ['a', 'b'] },
      {
        id: 'substitute',
        time: '10:30',
        colour: 'group',
        shot: { pilates: 'web-class-pilates', yoga: 'web-class-yoga' },
        ticks: ['a'],
      },
      {
        id: 'level',
        time: '12:00',
        colour: 'private',
        shot: { pilates: 'pro-class-pilates', yoga: 'pro-class-yoga' },
        ticks: ['a', 'b'],
      },
      {
        id: 'word',
        time: '15:00',
        colour: 'accent',
        shot: { pilates: 'pro-today-pilates', yoga: 'pro-today-yoga' },
        ticks: ['a'],
      },
      {
        id: 'poster',
        time: '19:00',
        colour: 'success',
        shot: { pilates: 'web-join-pilates', yoga: 'web-join-yoga' },
        ticks: ['a', 'b'],
      },
    ],
  },
  personalTrainers: {
    scene: 'pt',
    stage: { kind: 'row', phones: ['pro-today-solo', 'pro-log', 'pro-client'] },
    moments: [
      { id: 'today', time: '07:00', colour: 'private', shot: 'pro-today-solo', ticks: ['a'] },
      { id: 'last', time: '07:25', colour: 'private', shot: 'pro-client', ticks: ['a'] },
      { id: 'log', time: '07:30', colour: 'success', shot: 'pro-log', ticks: ['a', 'b'] },
      { id: 'credits', time: '08:30', colour: 'accent', shot: 'pro-session', ticks: ['a', 'b'] },
      { id: 'duo', time: '09:15', colour: 'group', shot: 'pro-duo', ticks: ['a'] },
      { id: 'share', time: '09:20', colour: 'success', shot: 'pro-share', ticks: ['a'] },
    ],
  },
  clients: {
    scene: 'client',
    stage: { kind: 'row', phones: ['app-home', 'app-book', 'app-credit'] },
    moments: [
      { id: 'book', time: '08:10', colour: 'group', shot: 'app-book', ticks: ['a'] },
      { id: 'confirm', time: '08:11', colour: 'accent', shot: 'app-confirm', ticks: ['a'] },
      { id: 'waitlist', time: '12:30', colour: 'group', shot: 'cw-waitlist', ticks: ['a'] },
      { id: 'week', time: '18:30', colour: 'success', shot: 'app-home', ticks: ['a'] },
      { id: 'self', time: '20:00', colour: 'private', shot: 'app-self', ticks: ['a'] },
      { id: 'studios', time: '21:00', colour: 'group', shot: 'app-studios', ticks: ['a'] },
      { id: 'renew', time: '22:00', colour: 'accent', shot: 'app-renew', ticks: ['a'] },
    ],
  },
};
