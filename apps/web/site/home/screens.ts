/**
 * The images of the site's pages (F064): the real screens of the prototype and the miniature scenes,
 * as the responsive WebP files in `public/site-images`. A screen exists in Dutch and English,
 * light and dark, because its words and colours differ; the page picks the language, the browser
 * picks the mode (`prefers-color-scheme`), so the page stays static. `publish-shots.cjs` in
 * `docs/design/website` makes the files, and `screens.test.ts` fails when one is missing. The home page
 * and the four audience pages share them, and a screen is published only when a page uses it.
 */
import type { MessageKey } from '@fivvi/i18n';

export type ShotDevice = 'phone' | 'android' | 'browser';

type ScreenKey =
  Extract<MessageKey, `site.home.screens.${string}`> extends `site.home.screens.${infer K}`
    ? K
    : never;

/** Every screen: its device frame and the catalog key of its description (`site.home.screens`). */
export const shots = {
  'pro-today-gym': { device: 'phone', alt: 'proTodayGym' },
  'pro-today-solo': { device: 'phone', alt: 'proTodaySolo' },
  'pro-today-pilates': { device: 'phone', alt: 'proTodayPilates' },
  'pro-today-android': { device: 'android', alt: 'proTodayAndroid' },
  'pro-client': { device: 'phone', alt: 'proClient' },
  'pro-log': { device: 'phone', alt: 'proLog' },
  'app-home': { device: 'phone', alt: 'appHome' },
  'app-book': { device: 'phone', alt: 'appBook' },
  'app-credit': { device: 'phone', alt: 'appCredit' },
  'app-android': { device: 'android', alt: 'appAndroid' },
  'cw-timetable': { device: 'phone', alt: 'cwTimetable' },
  'web-dashboard': { device: 'browser', alt: 'webDashboard' },
  'web-class-pilates': { device: 'browser', alt: 'webClassPilates' },
  'web-agenda': { device: 'browser', alt: 'webAgenda' },
  // The audience pages' screens (#639).
  'pro-today-yoga': { device: 'phone', alt: 'proTodayYoga' },
  'pro-class-pilates': { device: 'phone', alt: 'proClassPilates' },
  'pro-class-yoga': { device: 'phone', alt: 'proClassYoga' },
  'pro-session': { device: 'phone', alt: 'proSession' },
  'pro-duo': { device: 'phone', alt: 'proDuo' },
  'pro-share': { device: 'phone', alt: 'proShare' },
  'app-confirm': { device: 'phone', alt: 'appConfirm' },
  'app-self': { device: 'phone', alt: 'appSelf' },
  'app-studios': { device: 'phone', alt: 'appStudios' },
  'app-renew': { device: 'phone', alt: 'appRenew' },
  'cw-waitlist': { device: 'phone', alt: 'cwWaitlist' },
  'cw-waitlist-pilates': { device: 'phone', alt: 'cwWaitlistPilates' },
  'cw-waitlist-yoga': { device: 'phone', alt: 'cwWaitlistYoga' },
  'web-class-yoga': { device: 'browser', alt: 'webClassYoga' },
  'web-join-pilates': { device: 'browser', alt: 'webJoinPilates' },
  'web-join-yoga': { device: 'browser', alt: 'webJoinYoga' },
  'web-client': { device: 'browser', alt: 'webClient' },
  'web-class': { device: 'browser', alt: 'webClass' },
  'web-trainers': { device: 'browser', alt: 'webTrainers' },
  'web-offers': { device: 'browser', alt: 'webOffers' },
  'web-payments': { device: 'browser', alt: 'webPayments' },
} as const satisfies Record<string, { device: ShotDevice; alt: ScreenKey }>;

export type ShotId = keyof typeof shots;
export const SHOT_IDS = Object.keys(shots) as ShotId[];

/** The widths a screen is published in: a phone 320 and 640 px, a laptop screen 640 and 1280 px. */
export function shotWidths(id: ShotId): readonly [number, number] {
  return shots[id].device === 'browser' ? [640, 1280] : [320, 640];
}

export interface ImageSource {
  url: string;
  width: number;
}

export type ShotLanguage = 'nl' | 'en';

/** The files of a screen in a language, per colour mode, smallest first. */
export function shotSources(
  id: ShotId,
  language: ShotLanguage,
): Record<'light' | 'dark', ImageSource[]> {
  const files = (mode: 'light' | 'dark') =>
    shotWidths(id).map((width) => ({
      url: `/site-images/shots/${id}-${language}-${mode}-${width}.webp`,
      width,
    }));
  return { light: files('light'), dark: files('dark') };
}

/** The miniature scenes: one per audience, and yoga for the studio page. */
export const SCENES = { gym: true, pilates: true, yoga: true, pt: true, client: true } as const;
export type SceneId = keyof typeof SCENES;

/** The WebP files of a scene, 400 and 800 px wide, for a browser that lacks AVIF. */
export function sceneSources(id: SceneId): ImageSource[] {
  return [400, 800].map((width) => ({ url: `/site-images/scenes/${id}-${width}.webp`, width }));
}

/**
 * The AVIF files of a scene, 400, 600 and 800 px wide (`publish-scenes.cjs`). A phone shows the
 * miniature 300 px wide at a pixel ratio of about 2, so the 600 px one is the one it needs.
 */
export function sceneAvifSources(id: SceneId): ImageSource[] {
  return [400, 600, 800].map((width) => ({
    url: `/site-images/scenes/${id}-${width}.avif`,
    width,
  }));
}

/** A `srcset` value of sources. */
export function srcSet(sources: readonly ImageSource[]): string {
  return sources.map(({ url, width }) => `${url} ${width}w`).join(', ');
}
