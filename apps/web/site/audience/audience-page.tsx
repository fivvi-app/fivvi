import type { Locale } from '@fivvi/i18n';
import { Fragment, type ReactNode } from 'react';
import { classes } from '../home/classes';
import { Device, Scene, StageScreens } from '../home/devices';
import { Cta, container, Promises, screenAlts } from '../home/sections';
import { builtPages, type SitePage } from '../routes';
import { StatusLine } from '../status-line';
import { isMessageKey, siteText } from '../text';
import {
  type AudiencePageId,
  audiencePages,
  forKind,
  type Kind,
  kinds,
  type Moment,
  type MomentColour,
} from './audience-data';
import { KindPanel, KindProvider, KindSwitch } from './kind-switch';

export { audienceMetadata } from './audience-metadata';

/** The colour of a moment's bar, and the 7% of it behind the screen, in both modes. */
const barColour: Record<MomentColour, string> = {
  private: 'bg-session-private-solid',
  group: 'bg-session-group-solid',
  success: 'bg-status-success-solid',
  accent: 'bg-primary',
};
const screenTint: Record<MomentColour, string> = {
  private: 'bg-session-private-solid/7',
  group: 'bg-session-group-solid/7',
  success: 'bg-status-success-solid/7',
  accent: 'bg-primary/7',
};

const h2 = 'text-[clamp(34px,5vw,56px)] leading-[1.05] font-bold tracking-[-0.028em] text-balance';

/**
 * One audience page (F064 AC2, `DECISIONS.md` §9): the headline beside its miniature with the
 * screens below it, the three problems the visitor recognises, one working day as cards (a time, a
 * question, an answer and the real screen that shows it), the promises and the closing call to
 * action. The Studios page holds a day for pilates and one for yoga, and a switch between them.
 * All text is in the HTML without script; only the switch is a client component. A page that does
 * not exist yet is not linked (`built`).
 */
export function AudiencePage({
  page,
  locale,
  built = builtPages,
}: {
  page: AudiencePageId;
  locale: Locale;
  built?: readonly SitePage[];
}) {
  const t = siteText(locale);
  const data = audiencePages[page];
  const text = `site.audience.${page}` as const;
  const alts = screenAlts(locale);
  const studio = page === 'studios';
  const Frame = studio ? KindProvider : Fragment;

  /** What depends on the kind of studio, once per kind on the Studios page and once on the others. */
  const perKind = (render: (kind: Kind) => ReactNode, className?: string) =>
    studio ? (
      kinds.map((kind) => (
        <KindPanel key={kind} kind={kind} className={className}>
          {render(kind)}
        </KindPanel>
      ))
    ) : (
      <div className={className}>{render('pilates')}</div>
    );

  /** The words of the page's moments: the studio's word for its trainer and the number of spots. */
  const wordsOf = (kind: Kind): Record<string, string> =>
    studio
      ? {
          who: t(`site.audience.studios.words.${kind}.who`),
          spots: t(`site.audience.studios.words.${kind}.spots`),
        }
      : {};

  return (
    <Frame>
      <div className={`${container} pt-[clamp(32px,4.4vw,56px)]`}>
        <div className="grid grid-cols-1 items-center gap-[clamp(20px,4vw,56px)] min-[761px]:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
          <div>
            <p className="text-[15px] font-semibold text-accent-text">{t(`${text}.eyebrow`)}</p>
            <h1 className="mt-2 max-w-[13em] text-[clamp(42px,6vw,76px)] leading-none font-bold tracking-[-0.036em] text-balance">
              {t(`${text}.headline`)}
            </h1>
            <p className="mt-4.5 max-w-[34em] text-[clamp(19px,2vw,22px)] leading-[1.38] text-pretty text-muted-foreground">
              {t(`${text}.lead`)}
            </p>
            <StatusLine>{t('site.home.status')}</StatusLine>
            {studio ? (
              <KindSwitch
                label={t('site.audience.studios.kind.label')}
                options={kinds.map((kind) => ({
                  kind,
                  label: t(`site.audience.studios.kind.${kind}`),
                }))}
              />
            ) : null}
          </div>
          <div className="mx-auto w-full max-w-75 md:max-w-none">
            {perKind((kind) => (
              <Scene
                id={forKind(data.scene, kind)}
                priority={kind === 'pilates'}
                sizes="(max-width: 760px) 300px, 400px"
                className="aspect-square"
              />
            ))}
          </div>
        </div>
        <div className="site-stage mt-6.5">
          {perKind((kind) => (
            <StageScreens stage={forKind(data.stage, kind)} locale={locale} alts={alts} />
          ))}
        </div>
      </div>

      <section className="pt-[clamp(20px,4vw,48px)]">
        <div className={container}>
          <h2 className={h2}>{t('site.audience.recognise')}</h2>
          <ul className="mt-8 grid grid-cols-1 gap-3.5 min-[761px]:grid-cols-3">
            {(['one', 'two', 'three'] as const).map((pain) => (
              <li
                key={pain}
                className="rounded-card bg-card px-5 py-4.5 text-[19px] leading-[1.28] font-semibold tracking-[-0.01em] text-pretty min-[761px]:p-5.5"
              >
                {t(`${text}.pains.${pain}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="pt-[clamp(56px,8vw,104px)]">
        <div className={container}>
          <h2 className="text-[15px] font-semibold text-accent-text">
            {t('site.audience.dayEyebrow')}
          </h2>
          <p className="mt-1.5 max-w-[34em] text-[clamp(19px,2vw,22px)] leading-[1.38] font-medium text-pretty text-foreground">
            {t('site.audience.dayLead')}
          </p>
          {perKind(
            (kind) =>
              data.moments.map((moment) => (
                <MomentCard
                  key={moment.id}
                  moment={moment}
                  textKey={text}
                  kind={kind}
                  locale={locale}
                  alts={alts}
                  words={wordsOf(kind)}
                />
              )),
            'mt-9 grid gap-3.5',
          )}
        </div>
      </section>

      <Promises locale={locale} />
      <Cta locale={locale} built={built} />
    </Frame>
  );
}

/**
 * One moment of the day: a time and a coloured bar, the question, the answer, the ticks and the
 * real screen. A web screen gets the wider column, since a laptop needs the room.
 */
function MomentCard({
  moment,
  textKey,
  kind,
  locale,
  alts,
  words,
}: {
  moment: Moment;
  textKey: `site.audience.${AudiencePageId}`;
  kind: Kind;
  locale: Locale;
  alts: ReturnType<typeof screenAlts>;
  words: Record<string, string>;
}) {
  const t = siteText(locale);
  /** A text of this moment; the key is built from the page and the moment, and checked here. */
  const say = (part: string) => {
    const key = `${textKey}.moments.${moment.id}.${part}`;
    if (!isMessageKey(key)) throw new Error(`No text ${key}`);
    return t(key, words);
  };
  const shot = forKind(moment.shot, kind);
  const web = shot.startsWith('web-');
  return (
    <article
      data-wide={web ? '' : undefined}
      className={classes(
        'grid overflow-hidden rounded-card bg-card min-[821px]:min-h-115',
        web ? 'min-[821px]:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]' : 'min-[821px]:grid-cols-2',
      )}
    >
      <div className="grid grid-cols-[auto_4px_minmax(0,1fr)] content-start gap-x-4 p-[clamp(22px,3.4vw,44px)]">
        <span className="numeric text-[clamp(20px,2.4vw,27px)] leading-[1.15] font-extrabold">
          {moment.time}
        </span>
        <span
          aria-hidden="true"
          className={classes('self-stretch rounded-xs', barColour[moment.colour])}
        />
        <div className="min-w-0">
          <h3 className="text-[clamp(23px,2.8vw,33px)] leading-[1.12] font-bold tracking-[-0.022em] text-balance">
            {say('question')}
          </h3>
          <p className="mt-3.5 text-pretty text-secondary-foreground">{say('answer')}</p>
          <ul className="mt-3.5 grid gap-2">
            {moment.ticks.map((tick) => (
              <li
                key={tick}
                className="grid grid-cols-[18px_1fr] gap-2 text-[15px] leading-[1.35] text-muted-foreground"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2 w-3.5 -rotate-45 border-b-2 border-l-2 border-status-success-solid"
                />
                {say(`ticks.${tick}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div
        className={classes(
          '@container relative flex min-h-90 max-h-105 items-start overflow-hidden pt-10 min-[821px]:min-h-105 min-[821px]:max-h-140',
          screenTint[moment.colour],
          web ? 'justify-start pl-4.5 min-[821px]:pl-8' : 'justify-center',
        )}
      >
        <Device
          id={shot}
          locale={locale}
          alt={alts[shot]}
          className={
            web
              ? 'w-170 max-w-none flex-none min-[821px]:w-[clamp(760px,66vw,920px)]'
              : '[--phone-w:min(76cqw,300px)]'
          }
        />
      </div>
    </article>
  );
}
