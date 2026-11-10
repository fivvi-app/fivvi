'use client';

import type { Locale } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { Dialog } from '@fivvi/ui/components/dialog';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ClientFormDialogContent } from './client-form-dialog';
import { type Client, updateClient } from './clients-client';

/**
 * *Bewerken* of the profile (TW-02, F006 AC7) and the dialog it opens: the quick-add form with the
 * client's values and *Opslaan*, with the same fields, messages and duplicate offer. A save closes
 * the dialog, shows *Opgeslagen.* and reads the profile again, so the page shows what the API now
 * holds. A failed save keeps the input in the open dialog.
 */
export function EditClient({
  workspaceId,
  slug,
  client,
  defaultLocale,
}: {
  workspaceId: string;
  slug: string;
  client: Client;
  /** The workspace's default communication language, named in the *Standaard (…)* option. */
  defaultLocale: Locale;
}) {
  const t = useTranslations('clients.profile');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  // The button waits for the page to hydrate: a click before that would do nothing.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={!ready}
        onClick={() => {
          setSaved(false);
          setOpen(true);
        }}
      >
        {t('edit')}
      </Button>
      {saved ? (
        <p
          role="status"
          className="rounded-lg bg-status-success-bg px-3 py-1.5 text-sm font-semibold text-status-success-text"
        >
          {t('saved')}
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <ClientFormDialogContent
            workspaceId={workspaceId}
            slug={slug}
            defaultLocale={defaultLocale}
            initial={{
              name: client.name,
              email: client.email,
              emailLocale: client.emailLocale ?? '',
            }}
            title={t('editTitle')}
            submitLabel={t('save')}
            save={(input) => updateClient(workspaceId, client, input)}
            saved={() => {
              setOpen(false);
              setSaved(true);
              // Without `?added=1`, which belongs to the add this page was opened by.
              router.replace(`/w/${slug}/clients/${client.id}` as Route);
              router.refresh();
            }}
            close={() => setOpen(false)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
