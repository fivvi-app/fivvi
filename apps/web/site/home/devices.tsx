import type { Locale } from '@fivvi/i18n';
import { classes } from './classes';
import './devices.css';
import {
  type ImageSource,
  type SceneId,
  type ShotId,
  sceneSources,
  shotSources,
  shots,
  shotWidths,
  srcSet,
} from './screens';

/** The language of a screen's words: its file names say `nl` or `en`. */
export function shotLanguage(locale: Locale) {
  return locale === 'en' ? 'en' : 'nl';
}

/** The sizes the screen takes on the page, so the browser picks the smaller file when it can. */
const SIZES = {
  phone: '(max-width: 640px) 50vw, 300px',
  browser: '(max-width: 980px) 90vw, 900px',
} as const;

/**
 * A screen of the prototype: a picture in the language of the page, light or dark by the system
 * setting (no script), in two sizes. `alt` says what the screen shows; the first screens of a page
 * are loaded at once and the rest as they come near.
 */
export function Screen({
  id,
  locale,
  alt,
  priority = false,
  sizes,
  className,
}: {
  id: ShotId;
  locale: Locale;
  alt: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const sources = shotSources(id, shotLanguage(locale));
  const device = shots[id].device;
  const sizeHint = sizes ?? (device === 'browser' ? SIZES.browser : SIZES.phone);
  const [, large] = shotWidths(id);
  // The screens are captured at these proportions: the box is reserved before the file arrives.
  const [width, height] = device === 'browser' ? [1280, 800] : [393, 852];
  const light = sources.light;
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet={srcSet(sources.dark)} sizes={sizeHint} />
      <img
        src={light.find((source: ImageSource) => source.width === large)?.url}
        srcSet={srcSet(light)}
        sizes={sizeHint}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={classes('block h-full w-full', className)}
      />
    </picture>
  );
}

/** A screen in the frame of its device: a phone with its bezel, or a laptop's browser window. */
export function Device({
  id,
  locale,
  alt,
  priority,
  className,
}: {
  id: ShotId;
  locale: Locale;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  const { device } = shots[id];
  if (device === 'browser') {
    return (
      <div
        className={classes(
          'site-browser overflow-hidden rounded-[14px] bg-card shadow-xl ring-1 ring-border',
          className,
        )}
      >
        <Screen
          id={id}
          locale={locale}
          alt={alt}
          priority={priority}
          className="site-browser-shot aspect-[1280/800] object-cover object-left-top"
        />
      </div>
    );
  }
  return (
    <div
      className={classes(
        'site-phone relative flex-none bg-foreground shadow-2xl ring-4 ring-foreground sm:ring-6 dark:bg-border dark:ring-border',
        className,
      )}
      data-android={device === 'android' ? '' : undefined}
    >
      <Screen
        id={id}
        locale={locale}
        alt={alt}
        priority={priority}
        className="rounded-[inherit] object-cover"
      />
    </div>
  );
}

/**
 * A miniature scene. It stands on its own beside the words and is never a background behind
 * screens or text (owner, `DECISIONS.md` §9); its meaning is in the words next to it, so it has no
 * description of its own.
 */
export function Scene({
  id,
  priority = false,
  sizes,
  className,
}: {
  id: SceneId;
  priority?: boolean;
  sizes: string;
  className?: string;
}) {
  const sources = sceneSources(id);
  return (
    // biome-ignore lint/performance/noImgElement: the scenes are already made in two sizes (400 and 800 px), served as they are
    <img
      src={sources[sources.length - 1]?.url}
      srcSet={srcSet(sources)}
      sizes={sizes}
      alt=""
      width={800}
      height={800}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={classes('block w-full object-contain', className)}
    />
  );
}
