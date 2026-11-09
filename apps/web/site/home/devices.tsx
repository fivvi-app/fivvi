import type { Locale } from '@fivvi/i18n';
import type { Stage } from './audiences';
import { classes } from './classes';
import './devices.css';
import {
  type ImageSource,
  type SceneId,
  type ShotId,
  sceneAvifSources,
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
 * setting (no script), in two sizes. `alt` says what the screen shows. A screen is always lazy and
 * low in fetch priority, so even those in the first screen start after the page's miniature (AC15,
 * LCP). Its width and height stay set, so the box is there before the file.
 */
export function Screen({
  id,
  locale,
  alt,
  sizes,
  className,
}: {
  id: ShotId;
  locale: Locale;
  alt: string;
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
        loading="lazy"
        fetchPriority="low"
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
  sizes,
  className,
}: {
  id: ShotId;
  locale: Locale;
  alt: string;
  sizes?: string;
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
          sizes={sizes}
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
        sizes={sizes}
        className="rounded-[inherit] object-cover"
      />
    </div>
  );
}

/**
 * The width a phone of the stage's row of three has, as `devices.css` sets it: two of them fit on a
 * phone, so each is half the width less the page's padding and the gap, and 300 px at most
 * elsewhere. With a looser guess (half the screen) a phone would fetch the large file where the
 * small one is sharp enough, three times in a row (AC15).
 *
 * Keep it in step with `.site-stage-row .site-phone` in `devices.css`: that file sets the width, this
 * one tells the browser about it before the CSS is there, and neither can read the other.
 */
const ROW_SIZES = '(max-width: 639px) calc((100vw - 2 * clamp(16px, 4vw, 40px) - 14px) / 2), 300px';

/**
 * A miniature scene, in AVIF for the browsers that take it and WebP for the rest, in sizes for the
 * screen. It stands on its own beside the words and is never a background behind screens or text
 * (owner, `DECISIONS.md` §9); its meaning is in the words next to it, so it has no description of
 * its own.
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
    <picture>
      <source type="image/avif" srcSet={srcSet(sceneAvifSources(id))} sizes={sizes} />
      <img
        src={sources[sources.length - 1]?.url}
        srcSet={srcSet(sources)}
        sizes={sizes}
        alt=""
        width={800}
        height={800}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={classes('block w-full object-contain', className)}
      />
    </picture>
  );
}

/**
 * The screens under a headline: a laptop and a phone sharing one top and bottom edge, or three
 * phones in a row (`devices.css`). Put it in a `.site-stage`, which is the size container. They are
 * all lazy: the miniature beside the headline is the page's largest picture on a phone, and the
 * screens under it must not compete with it for the connection (AC15, LCP).
 */
export function StageScreens({
  stage,
  locale,
  alts,
  className,
}: {
  stage: Stage;
  locale: Locale;
  alts: Record<ShotId, string>;
  className?: string;
}) {
  if (stage.kind === 'mix') {
    return (
      <div className={classes('site-stage-mix', className)}>
        <Device id={stage.web} locale={locale} alt={alts[stage.web]} />
        <div className="site-stage-cell">
          <Device id={stage.phone} locale={locale} alt={alts[stage.phone]} />
        </div>
      </div>
    );
  }
  return (
    <div className={classes('site-stage-row', className)}>
      {stage.phones.map((id) => (
        <Device key={id} id={id} locale={locale} alt={alts[id]} sizes={ROW_SIZES} />
      ))}
    </div>
  );
}
