import type { Locale } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { pageCopy, pageSeo } from '../seo';
import { siteText } from '../text';
import { InfoPage, PageHead } from './page-head';
import { subProcessors } from './sub-processors';

/** The title and description of the sub-processors page in a language (unique per page, AC12). */
export function subProcessorsMetadata(locale: Locale): Metadata {
  return pageSeo('subProcessors', locale, pageCopy('subProcessors', locale));
}

/**
 * The sub-processors page (F064, AC11): every service that processes data for Fivvi, what it is for
 * and where it stores, and Mollie's separate role. The full legal list is
 * `docs/legal/sub-processors.md`.
 */
export function SubProcessorsPage({ locale }: { locale: Locale }) {
  const t = siteText(locale);
  return (
    <InfoPage>
      <PageHead
        headline={t('site.subProcessors.headline')}
        lead={t('site.subProcessors.lead')}
        status={t('site.home.status')}
      />
      <div className="mt-7 overflow-x-auto rounded-card bg-card">
        <table className="w-full border-collapse text-[15px] leading-snug">
          <caption className="sr-only">{t('site.subProcessors.listLabel')}</caption>
          <thead>
            <tr>
              {(['service', 'purposeColumn', 'storage'] as const).map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-5 pt-3.5 pb-2 text-left text-[13px] font-semibold text-muted-foreground"
                >
                  {t(`site.subProcessors.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subProcessors.map(({ name, purpose, region }) => (
              <tr key={name}>
                <th
                  scope="row"
                  className="border-t border-border px-5 py-3 text-left align-top font-semibold whitespace-nowrap"
                >
                  {name}
                </th>
                <td className="border-t border-border px-5 py-3 align-top">
                  {t(`site.subProcessors.purpose.${purpose}`)}
                </td>
                <td className="border-t border-border px-5 py-3 align-top">
                  {t(`site.subProcessors.region.${region}`)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section aria-labelledby="mollie" className="mt-3.5 max-w-[60em] rounded-card bg-card p-5.5">
        <h2 id="mollie" className="text-[17px] font-semibold">
          {t('site.subProcessors.mollieHeading')}
        </h2>
        <p className="mt-1.5 text-[15px] leading-[1.4] text-muted-foreground text-pretty">
          {t('site.subProcessors.mollie')}
        </p>
      </section>
    </InfoPage>
  );
}
