import type { Locale } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { builtPages, type SitePage } from '../routes';
import { pageCopy, pageSeo } from '../seo';
import { siteText } from '../text';
import { ContactCta } from './contact-cta';
import { FaqHeading, FaqList } from './faq-list';
import { InfoPage, PageHead } from './page-head';

const INCLUDED = ['calendar', 'memberships', 'pro', 'client', 'workouts'] as const;

/** The title and description of the pricing page in a language (unique per page, AC12). */
export function pricingMetadata(locale: Locale): Metadata {
  return pageSeo('pricing', locale, pageCopy('pricing', locale));
}

/**
 * The pricing page (F064, AC4): Fivvi is free during the pilot, Mollie charges per payment, amounts
 * are in euros, and 60 days' notice before Fivvi charges (terms A4). Mollie asks for a price on the
 * site (`DECISIONS.md` §9). All of it is in the HTML, without JavaScript.
 */
export function PricingPage({
  locale,
  built = builtPages,
}: {
  locale: Locale;
  built?: readonly SitePage[];
}) {
  const t = siteText(locale);
  return (
    <InfoPage>
      <PageHead
        eyebrow={t('site.pricing.eyebrow')}
        headline={t('site.pricing.headline')}
        lead={t('site.pricing.lead')}
        status={t('site.home.status')}
      />
      <section
        aria-labelledby="plan"
        className="mt-9 grid items-center gap-6 rounded-card bg-card p-[clamp(24px,4vw,44px)] md:grid-cols-2 md:gap-16"
      >
        <div>
          <h2 id="plan" className="text-[19px] font-bold tracking-[-0.01em]">
            {t('site.pricing.planName')}
          </h2>
          <p className="numeric mt-2.5 text-[clamp(64px,9vw,112px)] leading-none font-extrabold tracking-[-0.03em]">
            {t('site.pricing.price')}
          </p>
          <p className="mt-1.5 text-muted-foreground">{t('site.pricing.period')}</p>
        </div>
        <ul aria-label={t('site.pricing.includedLabel')} className="grid gap-2.5">
          {INCLUDED.map((item) => (
            <li
              key={item}
              className="flex gap-2.5 text-[17px] leading-snug text-secondary-foreground"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 h-2 w-3.5 flex-none -rotate-45 border-b-2 border-l-2 border-status-success-solid"
              />
              {t(`site.pricing.included.${item}`)}
            </li>
          ))}
        </ul>
      </section>
      <FaqHeading>{t('site.pricing.goodToKnow')}</FaqHeading>
      <FaqList
        columns={3}
        items={(['payments', 'clients', 'later'] as const).map((key) => ({
          question: t(`site.pricing.${key}.question`),
          answer: t(`site.pricing.${key}.answer`),
        }))}
      />
      <p className="mt-3.5 text-sm leading-snug text-muted-foreground">
        {t('site.pricing.currency')}
      </p>
      <ContactCta
        locale={locale}
        built={built}
        copy={{
          heading: t('site.cta.heading'),
          text: t('site.cta.text'),
          demo: t('site.cta.demo'),
        }}
      />
    </InfoPage>
  );
}
