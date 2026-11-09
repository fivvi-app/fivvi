'use client';

import type { Locale } from '@fivvi/i18n';
import { Dialog } from '@fivvi/ui/components/dialog';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { ClientFormDialogContent } from './client-form-dialog';
import { addClient } from './clients-client';

const OpenAddClient = createContext<(() => void) | null>(null);

/** Opens the quick-add dialog; `null` where the person may not add clients (no `clients.manage`). */
export function useOpenAddClient(): (() => void) | null {
  return useContext(OpenAddClient);
}

/**
 * The quick-add dialog of a workspace's frame (TW-01, F006): one dialog for the *Klant toevoegen*
 * button of the list and for **+ Nieuw** → *Klant* in the top bar, opened with `useOpenAddClient`.
 */
export function AddClientProvider({
  workspaceId,
  slug,
  defaultLocale,
  children,
}: {
  workspaceId: string;
  slug: string;
  /** The workspace's default communication language, named in the *Standaard (…)* option. */
  defaultLocale: Locale;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [openFn] = useState(() => () => setOpen(true));
  return (
    <OpenAddClient value={openFn}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <AddClientDialogContent
            workspaceId={workspaceId}
            slug={slug}
            defaultLocale={defaultLocale}
            close={() => setOpen(false)}
          />
        ) : null}
      </Dialog>
    </OpenAddClient>
  );
}

/** The add form: empty, and after an add the dialog closes and the new profile opens with a short confirmation. */
function AddClientDialogContent({
  workspaceId,
  slug,
  defaultLocale,
  close,
}: {
  workspaceId: string;
  slug: string;
  defaultLocale: Locale;
  close: () => void;
}) {
  const t = useTranslations('clients.addDialog');
  const router = useRouter();
  return (
    <ClientFormDialogContent
      workspaceId={workspaceId}
      slug={slug}
      defaultLocale={defaultLocale}
      initial={{ name: '', email: '', emailLocale: '' }}
      title={t('title')}
      description={t('description')}
      submitLabel={t('submit')}
      save={(input) => addClient(workspaceId, input)}
      saved={(client) => {
        close();
        router.push(`/w/${slug}/clients/${client.id}?added=1` as Route);
      }}
      close={close}
    />
  );
}
