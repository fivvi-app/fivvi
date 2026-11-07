import type { Locale } from '@fivvi/i18n';
import { PillButton } from '@fivvi/ui/kit/pill-button';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { linksTo } from '../navigation';
import { builtPages, type SitePage, sitePagePath } from '../routes';
import { siteText } from '../text';
import {
  AudienceArt,
  AudienceCopy,
  AudienceHero,
  AudienceStage,
  AudienceSwitch,
  type AudienceView,
} from './audience-hero';
import { type AudienceId, audienceIds, audiences } from './audiences';
import { classes } from './classes';
import { Device, Scene } from './devices';
import { type PlatformGroup, PlatformSwitch } from './platform-switch';
import { CHAIN_STEPS, sampleBalance } from './sample-booking';
import { SampleBooking, type SampleBookingLabels } from './sample-booking-card';
import { SHOT_IDS, type ShotId, shots } from './screens';

type Built = readonly SitePage[];

/** The six cards of the platforms band, as named in `site.home.platforms.items`. */
type PlatformItem =
  | 'proIphone'
  | 'proAndroid'
  | 'proLaptop'
  | 'clientIphone'
  | 'clientAndroid'
  | 'clientBrowser';

const container = 'mx-auto w-full max-w-295 px-[clamp(16px,4vw,40px)]';

/** The description of every screen, in the language of the page. */
function screenAlts(locale: Locale): Record<ShotId, string> {
  const t = siteText(locale);
  return Object.fromEntries(
    SHOT_IDS.map((id) => [id, t(`site.home.screens.${shots[id].alt}`)]),
  ) as Record<ShotId, string>;
}

/** A band of the page: an eyebrow, a heading and its lead, then what the band shows. */
function Band({
  eyebrow,
  heading,
  lead,
  children,
}: {
  eyebrow: string;
  heading: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section className="pt-[clamp(56px,8vw,104px)]">
      <div className={container}>
        <p className="text-[15px] font-semibold text-accent-text">{eyebrow}</p>
        <h2 className="mt-1 text-[clamp(34px,5vw,56px)] leading-[1.05] font-bold tracking-[-0.028em] text-balance">
          {heading}
        </h2>
        {lead ? (
          <p className="mt-3.5 max-w-[34em] text-[clamp(19px,2vw,22px)] leading-[1.38] text-pretty text-muted-foreground">
            {lead}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

/**
 * The top of the page: the headline with the miniature beside it, the *I am* switch, the line for
 * the audience it picks and the screens below. The text is the page's own; the switch changes the
 * miniature, the line and the screens (`AudienceHero`).
 */
export function Hero({ locale, built = builtPages }: { locale: Locale; built?: Built }) {
  const t = siteText(locale);
  const views: AudienceView[] = audienceIds.map((id) => {
    const [link] = linksTo([audiences[id].page], locale, built);
    return {
      id,
      label: t(`site.home.iAm.${id}`),
      short: t(`site.home.audience.${id}.short`),
      link: link ? { href: link.href, label: t('site.home.seeFor') } : undefined,
    };
  });
  return (
    <div className={`${container} pt-[clamp(32px,4.4vw,56px)]`}>
      <AudienceHero locale={locale} views={views} alts={screenAlts(locale)}>
        <div className="grid grid-cols-1 items-center gap-[clamp(20px,4vw,56px)] min-[761px]:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
          <div>
            <h1 className="max-w-[14em] text-[clamp(50px,7vw,92px)] leading-[0.98] font-bold tracking-[-0.042em] text-balance">
              {t('site.home.headline')}{' '}
              <em className="font-bold text-muted-foreground not-italic">
                {t('site.home.headlineRest')}
              </em>
            </h1>
            <p className="mt-5.5 max-w-[34em] text-[clamp(19px,2vw,22px)] leading-[1.38] text-muted-foreground text-pretty">
              {t('site.home.lead')}
            </p>
            <StatusLine>{t('site.home.status')}</StatusLine>
            <AudienceSwitch label={t('site.home.iAm.label')} />
          </div>
          <AudienceArt />
        </div>
        <AudienceCopy />
        <AudienceStage />
      </AudienceHero>
    </div>
  );
}

/** The line every page carries: Fivvi is being built with its first gym (#611 AC19). */
function StatusLine({ children }: { children: string }) {
  return (
    <p className="mt-4 flex max-w-[44em] items-baseline gap-2.5 text-[15px] leading-[1.35] text-secondary-foreground">
      <span
        aria-hidden="true"
        className="size-2 flex-none -translate-y-px rounded-full bg-primary"
      />
      {children}
    </p>
  );
}

/** "Your business lives in five places": the five tools, and Fivvi's one row beside the real screen. */
export function OnePlace({ locale }: { locale: Locale }) {
  const t = siteText(locale);
  const tools = ['calendar', 'documents', 'invoices', 'messages', 'app'] as const;
  return (
    <Band
      eyebrow={t('site.home.onePlace.eyebrow')}
      heading={t('site.home.onePlace.heading')}
      lead={t('site.home.onePlace.lead')}
    >
      <div className="mt-9 grid grid-cols-1 items-center gap-[clamp(24px,5vw,64px)] min-[821px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <ul className="divide-y divide-border overflow-hidden rounded-card bg-card">
          {tools.map((tool) => (
            <li key={tool} className="flex items-center gap-3 px-5 py-3.75 text-muted-foreground">
              <s className="decoration-muted-foreground">{t(`site.home.onePlace.${tool}`)}</s>
              <span className="ml-auto text-[15px] font-medium">
                {t('site.home.onePlace.inFivvi')}
              </span>
            </li>
          ))}
          <li className="flex items-center gap-3 px-5 py-3.75 font-semibold text-foreground">
            <span>{t('site.home.onePlace.fivvi')}</span>
            <span className="ml-auto text-[15px] font-medium text-accent-text">
              {t('site.home.onePlace.everything')}
            </span>
          </li>
        </ul>
        <Device id="web-agenda" locale={locale} alt={t('site.home.screens.webAgenda')} />
      </div>
    </Band>
  );
}

/** "One booking. Everything adds up": the steps and the class to book, in `SampleBooking`. */
export function Chain({ locale }: { locale: Locale }) {
  const t = siteText(locale);
  const card: SampleBookingLabels = {
    title: t('site.home.chain.card.title'),
    className: t('site.home.chain.card.class'),
    time: t('site.home.chain.card.time'),
    when: t('site.home.chain.card.when'),
    left: t('site.home.chain.card.left'),
    planned: t('site.home.chain.card.planned'),
    used: t('site.home.chain.card.used'),
    book: t('site.home.chain.card.book'),
    confirm: t('site.home.chain.card.confirm'),
    back: t('site.home.chain.card.back'),
    attend: t('site.home.chain.card.attend'),
    again: t('site.home.chain.card.again'),
    confirmTitle: t('site.home.chain.card.confirmTitle'),
    confirmBody: t('site.home.chain.card.confirmBody', { left: sampleBalance('booked').left }),
    say: {
      idle: t('site.home.chain.card.say0', { count: sampleBalance('idle').left }),
      booked: t('site.home.chain.card.say1'),
      attended: t('site.home.chain.card.say2'),
    },
    statusDone: t('site.home.chain.statusDone'),
    statusLive: t('site.home.chain.statusLive'),
  };
  const steps = CHAIN_STEPS.map((id) => ({
    id,
    title: t(`site.home.chain.steps.${id}.title`),
    text: t(`site.home.chain.steps.${id}.text`),
  }));
  return (
    <Band
      eyebrow={t('site.home.chain.eyebrow')}
      heading={t('site.home.chain.heading')}
      lead={t('site.home.chain.lead')}
    >
      <SampleBooking steps={steps} labels={card} />
    </Band>
  );
}

/** The four audiences as cards with their miniature; a card links to its page once that page exists. */
export function ForWhom({ locale, built = builtPages }: { locale: Locale; built?: Built }) {
  const t = siteText(locale);
  return (
    <Band
      eyebrow={t('site.home.forWhom.eyebrow')}
      heading={t('site.home.forWhom.heading')}
      lead={t('site.home.forWhom.lead')}
    >
      <ul className="mt-9 grid grid-cols-1 gap-3.5 min-[461px]:grid-cols-2 min-[981px]:grid-cols-4">
        {audienceIds.map((id) => (
          <li key={id} className="flex">
            <AudienceCard id={id} locale={locale} built={built} />
          </li>
        ))}
      </ul>
    </Band>
  );
}

function AudienceCard({ id, locale, built }: { id: AudienceId; locale: Locale; built: Built }) {
  const t = siteText(locale);
  const page = audiences[id].page;
  const body = (
    <>
      <Scene
        id={audiences[id].scene}
        sizes="(max-width: 460px) 90vw, (max-width: 980px) 45vw, 280px"
        className="aspect-[4/3] pt-3"
      />
      <div className="flex flex-1 flex-col gap-1.5 px-4.5 pt-4.5 pb-5">
        <h3 className="text-[21px] leading-[1.15] font-bold tracking-[-0.015em]">
          {t(`site.home.audience.${id}.cardTitle`)}
        </h3>
        <p className="flex-1 text-[15px] leading-[1.35] text-muted-foreground">
          {t(`site.home.audience.${id}.short`)}
        </p>
        {built.includes(page) ? (
          <span className="mt-2 inline-flex items-center gap-1.5 text-[15px] font-semibold text-accent-text">
            {t('site.home.forWhom.readDay')} <span aria-hidden="true">→</span>
          </span>
        ) : null}
      </div>
    </>
  );
  const card = 'flex w-full flex-col overflow-hidden rounded-card bg-card';
  return built.includes(page) ? (
    <Link
      href={sitePagePath(page, locale)}
      className={classes(
        card,
        'transition-transform motion-safe:hover:-translate-y-0.75 motion-reduce:transition-none',
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={card}>{body}</div>
  );
}

/** What owners and trainers use, and what clients use, each on iPhone, Android and in the browser. */
export function Platforms({ locale }: { locale: Locale }) {
  const t = siteText(locale);
  const alts = screenAlts(locale);
  const card = (shot: ShotId, key: PlatformItem, wide = false) => ({
    shot,
    title: t(`site.home.platforms.items.${key}.title`),
    text: t(`site.home.platforms.items.${key}.text`),
    alt: alts[shot],
    wide,
  });

  const groups: PlatformGroup[] = [
    {
      id: 'owners',
      name: t('site.home.platforms.owners'),
      cards: [
        card('pro-today-gym', 'proIphone'),
        card('pro-today-android', 'proAndroid'),
        card('web-dashboard', 'proLaptop', true),
      ],
    },
    {
      id: 'clients',
      name: t('site.home.platforms.clients'),
      cards: [
        card('app-home', 'clientIphone'),
        card('app-android', 'clientAndroid'),
        card('cw-timetable', 'clientBrowser'),
      ],
    },
  ];
  return (
    <Band
      eyebrow={t('site.home.platforms.eyebrow')}
      heading={t('site.home.platforms.heading')}
      lead={t('site.home.platforms.lead')}
    >
      <PlatformSwitch
        label={`${t('site.home.platforms.owners')} / ${t('site.home.platforms.clients')}`}
        groups={groups}
        locale={locale}
      />
    </Band>
  );
}

const promiseKeys = ['money', 'cash', 'notes', 'amounts', 'noApp', 'languages'] as const;

/** The six things an owner can count on. */
export function Promises({ locale }: { locale: Locale }) {
  const t = siteText(locale);
  return (
    <Band eyebrow={t('site.home.promises.eyebrow')} heading={t('site.home.promises.heading')}>
      <ul className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-card bg-border min-[721px]:grid-cols-2">
        {promiseKeys.map((key) => (
          <li key={key} className="bg-card px-6 py-5">
            <b className="block leading-tight font-semibold">
              {t(`site.home.promises.items.${key}.title`)}
            </b>
            <span className="mt-0.75 block text-[15px] leading-[1.35] text-muted-foreground">
              {t(`site.home.promises.items.${key}.text`)}
            </span>
          </li>
        ))}
      </ul>
    </Band>
  );
}

/**
 * The closing call to action. *Plan een demo* and *Bekijk de prijzen* appear once their pages
 * exist, so no button goes to a 404; the words stay.
 */
export function Cta({ locale, built = builtPages }: { locale: Locale; built?: Built }) {
  const t = siteText(locale);
  const [demo] = linksTo(['demo'], locale, built);
  const [pricing] = linksTo(['pricing'], locale, built);
  const buttons = demo || pricing;
  return (
    <div className={`${container} mt-[clamp(56px,8vw,104px)]`}>
      <div
        className={classes(
          'grid grid-cols-1 items-center gap-[clamp(20px,4vw,56px)] rounded-card bg-card p-[clamp(28px,5vw,64px)]',
          buttons && 'min-[761px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]',
        )}
      >
        <div>
          <h2 className="text-[clamp(32px,4.4vw,52px)] leading-[1.04] font-bold tracking-[-0.028em] text-balance">
            {t('site.home.cta.heading')}
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground">{t('site.home.cta.text')}</p>
        </div>
        {buttons ? (
          <div className="grid gap-2.5">
            {demo ? (
              <PillButton asChild>
                <Link href={demo.href}>{t(demo.labelKey)}</Link>
              </PillButton>
            ) : null}
            {pricing ? (
              <PillButton asChild variant="tonal">
                <Link href={pricing.href}>{t('site.home.cta.pricing')}</Link>
              </PillButton>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="mt-5 text-sm text-muted-foreground">{t('site.home.fictional')}</p>
    </div>
  );
}
