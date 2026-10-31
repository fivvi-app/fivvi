import type { Schemas } from '@fivvi/contract';
import type { Locale } from '@fivvi/i18n';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * TW-02 Klantprofiel (F006): the header with the client's name and the *Overzicht* with name,
 * email address and language for emails. A client without a language of their own follows the
 * workspace's default, so the line says *Standaard (Nederlands)*, naming it. This is the plain
 * profile; editing and the profile's other parts come with F006's next web ticket and the features
 * that own them. `added` is the short confirmation after a quick add.
 */
export function ClientProfile({
  client,
  slug,
  defaultLocale,
  added,
}: {
  client: Schemas['Client'];
  slug: string;
  /** The workspace's default communication language. */
  defaultLocale: Locale;
  added: boolean;
}) {
  const t = useTranslations('clients');
  const names = useTranslations('clients.languageNames');
  const form = useTranslations('clients.addDialog');
  const language =
    client.emailLocale === 'nl-NL'
      ? form('localeNl')
      : client.emailLocale === 'en'
        ? form('localeEn')
        : form('localeDefault', { language: names(defaultLocale === 'nl-NL' ? 'nl' : 'en') });
  return (
    <main className="flex flex-1 justify-center p-4">
      <div className="grid w-full max-w-3xl content-start gap-4">
        <Link href={`/w/${slug}/clients` as Route} className="underline">
          {t('title')}
        </Link>
        <h1 className="font-display text-2xl font-semibold">{client.name}</h1>
        {added ? <p role="status">{t('profile.added', { name: client.name })}</p> : null}
        <section aria-labelledby="client-overview" className="grid gap-2">
          <h2 id="client-overview" className="text-lg font-medium">
            {t('profile.overview')}
          </h2>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">{t('profile.nameLabel')}</dt>
              <dd>{client.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('profile.emailLabel')}</dt>
              <dd>{client.email ?? t('profile.noEmail')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('profile.localeLabel')}</dt>
              <dd>{language}</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
