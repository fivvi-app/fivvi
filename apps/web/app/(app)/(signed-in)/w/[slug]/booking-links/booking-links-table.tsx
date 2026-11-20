'use client';

import { pickContentLanguage } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { StatusPill } from '@fivvi/ui/kit/status-pill';
import { useLocale, useTranslations } from 'next-intl';
import { useSessionFormat } from '../sessions/use-session-format';
import type { BookingLink } from './booking-links-client';

const head = 'px-4.5 py-2 text-start text-[13px] font-medium text-muted-foreground';
const cell = 'px-4.5 py-2.5 align-middle';

/** What a link opens, in words: *Alle boekingen*, *Les: Kracht*, *Les op di 17 nov: Kracht*. */
function Scope({ link }: { link: BookingLink }) {
  const t = useTranslations('bookingLinks.scope');
  const locale = useLocale();
  const { day } = useSessionFormat(link.date?.timeZone ?? 'Europe/Amsterdam');
  const named = (names: { nameNl: string; nameEn: string | null }) =>
    pickContentLanguage(locale, names.nameNl, names.nameEn);
  if (link.scope === 'class' && link.groupClass) {
    return <>{t('class', { class: named(link.groupClass) })}</>;
  }
  if (link.scope === 'session' && link.date?.groupClass) {
    return (
      <>{t('session', { date: day(link.date.startsAt), class: named(link.date.groupClass) })}</>
    );
  }
  return <>{t(link.scope === 'group' ? 'group' : 'all')}</>;
}

/**
 * The table of booking links on TW-07 (F037): *Wat*, *Taal van de pagina*, the short URL and, for
 * the active links, the status with **Link kopiëren** and, for the Owner, **Deactiveren**. The
 * deactivated links are listed dimmed and without actions (`inactive`). The links are in the
 * API's order. The buttons wait for the page to hydrate: a click before that would do nothing.
 */
export function BookingLinksTable({
  links,
  inactive = false,
  ready,
  canManage,
  copy,
  deactivate,
}: {
  links: readonly BookingLink[];
  inactive?: boolean;
  ready: boolean;
  canManage: boolean;
  copy: (url: string) => void;
  deactivate: (link: BookingLink) => void;
}) {
  const t = useTranslations('bookingLinks');
  return (
    // A phone scrolls the table sideways; the scroller is a tab stop so a keyboard can scroll it too.
    <div
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable (WCAG 2.1.1)
      tabIndex={0}
      className="overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <table className="w-full text-start text-sm">
        <thead>
          <tr className="border-b">
            <th scope="col" className={head}>
              {t('columns.what')}
            </th>
            <th scope="col" className={head}>
              {t('columns.language')}
            </th>
            <th scope="col" className={head}>
              {t('columns.link')}
            </th>
            {inactive ? null : (
              <>
                <th scope="col" className={head}>
                  {t('columns.status')}
                </th>
                <th scope="col" className={head}>
                  <span className="sr-only">{t('columns.actions')}</span>
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr
              key={link.id}
              data-state={inactive ? 'inactive' : 'active'}
              className={`border-b last:border-b-0 ${inactive ? 'text-muted-foreground' : ''}`}
            >
              <td className={`${cell} font-medium`}>
                <Scope link={link} />
              </td>
              <td className={cell}>{t(`language.${link.language}`)}</td>
              <td className={cell}>
                <code className="text-[13px] whitespace-nowrap">{link.url}</code>
              </td>
              {inactive ? null : (
                <>
                  <td className={cell}>
                    <StatusPill tone="success">{t('status.active')}</StatusPill>
                  </td>
                  <td className={cell}>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!ready}
                        onClick={() => copy(link.url)}
                      >
                        {t('copy')}
                      </Button>
                      {canManage ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!ready}
                          onClick={() => deactivate(link)}
                        >
                          {t('deactivate')}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
