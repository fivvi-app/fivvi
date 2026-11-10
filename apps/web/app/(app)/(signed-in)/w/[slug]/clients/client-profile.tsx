import type { Schemas } from '@fivvi/contract';
import type { Locale } from '@fivvi/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { Avatar } from '@fivvi/ui/kit/avatar';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { initials } from '../workspace-initials';
import { EditClient } from './edit-client';

/**
 * TW-02 Klantprofiel (F006): the header with the client's name and the *Overzicht* with name,
 * email address and language for emails. A client without a language of their own follows the
 * workspace's default, so the line says *Standaard (Nederlands)*, naming it. The profile's other
 * parts come with the features that own them; none shows as an empty tab. *Bewerken*
 * (TW-02, AC7) is shown to a person who may edit clients (`clients.manage`) and opens the
 * quick-add form with the client's values. `added` is the short confirmation after a quick add.
 */
export function ClientProfile({
  client,
  workspaceId,
  slug,
  canEdit,
  defaultLocale,
  added,
}: {
  client: Schemas['Client'];
  workspaceId: string;
  slug: string;
  /** The person has `clients.manage`. */
  canEdit: boolean;
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
    <main className="flex-1 px-6 pt-5 pb-10">
      <div className="grid max-w-275 content-start gap-4">
        <Link
          href={`/w/${slug}/clients` as Route}
          className="justify-self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t('title')}
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar initials={initials(client.name)} size="lg" />
          <h1 className="min-w-0 text-[22px] font-semibold tracking-tight">{client.name}</h1>
          {canEdit ? (
            <div className="ml-auto">
              <EditClient
                workspaceId={workspaceId}
                slug={slug}
                client={client}
                defaultLocale={defaultLocale}
              />
            </div>
          ) : null}
        </div>
        {added ? (
          <p
            role="status"
            className="justify-self-start rounded-lg bg-status-success-bg px-3 py-2 text-sm font-semibold text-status-success-text"
          >
            {t('profile.added', { name: client.name })}
          </p>
        ) : null}
        <section aria-labelledby="client-overview">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2 id="client-overview" className="text-[15px] font-semibold">
                  {t('profile.overview')}
                </h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">{t('profile.nameLabel')}</dt>
                <dd>{client.name}</dd>
                <dt className="text-muted-foreground">{t('profile.emailLabel')}</dt>
                <dd>{client.email}</dd>
                <dt className="text-muted-foreground">{t('profile.localeLabel')}</dt>
                <dd>{language}</dd>
              </dl>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
