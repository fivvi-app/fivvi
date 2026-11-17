import type { Locale } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { type BusinessDetails, business as fivviBusiness, shown } from '../business';
import { builtPages, type SitePage } from '../routes';
import { pageCopy, pageSeo } from '../seo';
import { siteText } from '../text';
import { privacyEmail, supportEmail } from './contact';
import { ContactCta } from './contact-cta';
import { FaqHeading, FaqList } from './faq-list';
import { InfoPage, PageHead } from './page-head';

const CLIENT_QUESTIONS = ['join', 'noCode', 'cancel', 'invoices', 'deleteAccount'] as const;
const OWNER_QUESTIONS = ['payments', 'mollie', 'devices', 'data'] as const;

/** The title and description of the help page in a language (unique per page, AC12). */
export function supportMetadata(locale: Locale): Metadata {
  return pageSeo('support', locale, pageCopy('support', locale));
}

/**
 * The help and contact page (F064, AC8, AC9): the trade name, the support and privacy addresses, the
 * way to the demo form, and the frequently asked questions for clients and for owners and trainers.
 * Deleting an account is asked for by email here; it links to no page for it until #477 builds one.
 */
export function SupportPage({
  locale,
  business = fivviBusiness,
  built = builtPages,
}: {
  locale: Locale;
  business?: BusinessDetails;
  built?: readonly SitePage[];
}) {
  const t = siteText(locale);
  const tradeName = shown(business.tradeName);
  const rows = [
    { label: t('site.support.email'), value: supportEmail },
    { label: t('site.support.privacy'), value: privacyEmail },
  ];
  const address = { address: privacyEmail };
  return (
    <InfoPage>
      <PageHead
        eyebrow={t('site.support.eyebrow')}
        headline={t('site.support.headline')}
        lead={t('site.support.lead')}
        status={t('site.home.status')}
      />
      <section
        aria-labelledby="contact"
        className="mt-8 rounded-card bg-card p-[clamp(22px,3vw,30px)]"
      >
        <h2 id="contact" className="text-xl font-bold tracking-[-0.015em]">
          {t('site.support.contactHeading')}
        </h2>
        {tradeName ? (
          <p className="mt-1.5 font-semibold">{t('site.footer.tradeName', { name: tradeName })}</p>
        ) : null}
        <dl className="mt-3.5 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {rows.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 font-semibold [overflow-wrap:anywhere]">
                <a href={`mailto:${value}`} className="text-accent-text underline">
                  {value}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <FaqHeading>{t('site.support.clientsHeading')}</FaqHeading>
      <FaqList
        items={CLIENT_QUESTIONS.map((key) => ({
          question: t(`site.support.clientFaq.${key}.question`),
          answer: t(`site.support.clientFaq.${key}.answer`, address),
        }))}
      />
      <FaqHeading>{t('site.support.ownersHeading')}</FaqHeading>
      <FaqList
        items={OWNER_QUESTIONS.map((key) => ({
          question: t(`site.support.ownerFaq.${key}.question`),
          answer: t(`site.support.ownerFaq.${key}.answer`),
        }))}
      />
      <ContactCta
        locale={locale}
        built={built}
        copy={{
          heading: t('site.cta.heading'),
          text: t('site.cta.text'),
          demo: t('site.cta.demo'),
          pricing: t('site.cta.pricing'),
        }}
      />
    </InfoPage>
  );
}
