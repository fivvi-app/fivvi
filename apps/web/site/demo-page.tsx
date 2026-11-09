import type { Locale } from '@fivvi/i18n';
import Link from 'next/link';
import { DemoForm, type DemoFormCopy } from './demo-form';
import { supportEmail } from './info/contact';
import { builtPages, type SitePage, sitePagePath } from './routes';
import { StatusLine } from './status-line';
import { siteText } from './text';

const STEPS = ['tell', 'show', 'fit'] as const;

/**
 * The demo page (F064, ticket #641): what the 30 minutes are, and the request form. The page is
 * static, with all its text in the HTML; only the form is a client component (`DemoForm`), which
 * posts to the API. `built` is the pages that exist: the links to the privacy policy and the
 * clients page are left out until they do, so no link is a 404.
 */
export function DemoPage({
  locale,
  built = builtPages,
}: {
  locale: Locale;
  built?: readonly SitePage[];
}) {
  const t = siteText(locale);
  const copy: DemoFormCopy = {
    label: t('site.demo.form.label'),
    name: t('site.demo.form.name'),
    email: t('site.demo.form.email'),
    business: t('site.demo.form.business'),
    businessOptions: {
      gym: t('site.demo.form.businessGym'),
      studio: t('site.demo.form.businessStudio'),
      'personal-trainer': t('site.demo.form.businessPersonalTrainer'),
    },
    trainers: t('site.demo.form.trainers'),
    trainerOptions: {
      one: t('site.demo.form.trainersOne'),
      'two-to-four': t('site.demo.form.trainersTwoToFour'),
      'five-or-more': t('site.demo.form.trainersFiveOrMore'),
    },
    message: t('site.demo.form.message'),
    send: t('site.demo.form.send'),
    sending: t('site.demo.form.sending'),
    note: t('site.demo.form.note'),
    privacyLink: t('site.demo.form.privacyLink'),
    sent: t('site.demo.form.sent'),
    errors: {
      nameRequired: t('site.demo.errors.nameRequired'),
      nameTooLong: t('site.demo.errors.nameTooLong'),
      emailInvalid: t('site.demo.errors.emailInvalid'),
      messageTooLong: t('site.demo.errors.messageTooLong'),
      rateLimited: t('site.demo.errors.rateLimited', { email: supportEmail }),
      noConnection: t('site.demo.errors.noConnection'),
      failed: t('site.demo.errors.failed', { email: supportEmail }),
    },
  };
  const privacyHref = built.includes('privacy') ? sitePagePath('privacy', locale) : undefined;
  const clientsHref = built.includes('clients') ? sitePagePath('clients', locale) : undefined;

  return (
    <div className="mx-auto w-full max-w-295 px-[clamp(16px,4vw,40px)] pt-[clamp(32px,4.4vw,56px)] pb-16">
      <p className="text-[15px] font-semibold text-accent-text">{t('site.demo.eyebrow')}</p>
      <h1 className="mt-2 max-w-[14em] text-[clamp(40px,6vw,72px)] leading-[1] font-bold tracking-[-0.04em] text-balance">
        {t('site.demo.headline')}
      </h1>
      <p className="mt-5 max-w-[34em] text-[clamp(19px,2vw,22px)] leading-[1.38] text-muted-foreground text-pretty">
        {t('site.demo.lead')}
      </p>
      <StatusLine>{t('site.home.status')}</StatusLine>

      <div className="mt-9 grid items-start gap-3.5 md:grid-cols-2">
        <ol className="grid divide-y divide-border overflow-hidden rounded-card bg-card">
          {STEPS.map((step, index) => (
            <li key={step} className="grid grid-cols-[34px_1fr] px-5.5 py-4.5">
              <span
                aria-hidden="true"
                className="numeric text-[19px] font-extrabold text-accent-text"
              >
                {index + 1}
              </span>
              <div>
                <b className="font-semibold">{t(`site.demo.steps.${step}.title`)}</b>
                <span className="mt-0.5 block text-[15px] leading-[1.4] text-muted-foreground text-pretty">
                  {t(`site.demo.steps.${step}.body`)}
                </span>
              </div>
            </li>
          ))}
        </ol>
        <DemoForm locale={locale} copy={copy} privacyHref={privacyHref} />
      </div>

      <p className="mt-4.5 text-sm leading-[1.4] text-muted-foreground">
        {clientsHref ? (
          <Link href={clientsHref} prefetch={false} className="underline underline-offset-2">
            {t('site.demo.form.client')}
          </Link>
        ) : (
          t('site.demo.form.client')
        )}
      </p>
    </div>
  );
}
