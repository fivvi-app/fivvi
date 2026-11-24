'use client';

import type { TrainerWordForms } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { Session } from './sessions-client';
import { TrainerDialog } from './trainer-dialog';
import { assignKind } from './trainer-dialog-model';
import type { TrainerFormClient } from './trainer-form';

/**
 * The Owner's button *Trainer toewijzen* / *Trainer vervangen* (CO-01) or *Trainer wijzigen* (the
 * private session's page), F023: it opens the trainer dialog, and once the trainer is assigned the
 * page asks the server again and says what happened. It is there only for a session the dialog
 * is offered for (`assignKind`). `startOpen` opens the dialog at once (`?assign=1`: the calendar's
 * quick view and *Aandacht nodig*).
 */
export function AssignTrainer({
  workspaceId,
  slug,
  session,
  client,
  trainerWord,
  workspaceName,
  teamMemberId,
  startOpen = false,
}: {
  workspaceId: string;
  slug: string;
  session: Session;
  client?: TrainerFormClient;
  trainerWord: TrainerWordForms;
  workspaceName: string;
  teamMemberId: string;
  startOpen?: boolean;
}) {
  const t = useTranslations('sessions.trainerDialog');
  const router = useRouter();
  const kind = assignKind(session);
  const [open, setOpen] = useState(startOpen && kind !== null);
  const [done, setDone] = useState<string | null>(null);
  // The buttons wait for the page to hydrate: a click before that would do nothing.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <>
      {kind ? (
        <Button type="button" variant="outline" disabled={!ready} onClick={() => setOpen(true)}>
          {kind === 'assign'
            ? t('titleAssign', { ...trainerWord })
            : kind === 'substitute'
              ? t('titleSubstitute', { ...trainerWord })
              : t('titleChange', { ...trainerWord })}
        </Button>
      ) : null}
      {done ? (
        <p
          role="status"
          className="rounded-lg bg-status-success-bg px-3 py-2 text-sm font-semibold text-status-success-text"
        >
          {done}
        </p>
      ) : null}
      {open ? (
        <TrainerDialog
          workspaceId={workspaceId}
          slug={slug}
          session={session}
          {...(client ? { client } : {})}
          trainerWord={trainerWord}
          workspaceName={workspaceName}
          teamMemberId={teamMemberId}
          onClose={() => setOpen(false)}
          onAssigned={({ message }) => {
            setOpen(false);
            setDone(message);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
