'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { TrainerWordForms } from '@fivvi/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@fivvi/ui/components/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { HandoverForm } from './handover-form';
import { handedOverCount } from './handover-model';
import {
  type FutureSessions,
  type Handover,
  removeWithHandover,
} from './remove-team-member-client';

/**
 * The removal dialog for a person who has sessions coming (TW-06, F023 AC9, AC9a, AC10, AC18):
 * the same title and words as F003's plain dialog, then `HandoverForm`. *Overdragen en verwijderen*
 * hands the sessions over and removes the person in one request (one transaction at the API).
 * When the counts changed meanwhile (409 `has_future_sessions` again) the dialog shows the new
 * ones and the Owner decides again. `done` gets the done text.
 */
export function HandoverDialog({
  workspaceId,
  member,
  initialFuture,
  trainers,
  trainerWord,
  workspaceName,
  onClose,
  done,
}: {
  workspaceId: string;
  member: { id: string; name: string };
  initialFuture: FutureSessions;
  /** The trainers of the workspace except the person who goes. */
  trainers: readonly { id: string; name: string }[];
  trainerWord: TrainerWordForms;
  workspaceName: string;
  onClose: () => void;
  /** The person was removed: the done text, and the page asks the server again. */
  done: (message: string) => void;
}) {
  const t = useTranslations('team');
  const handover = useTranslations('team.handover');
  const [future, setFuture] = useState(initialFuture);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(choice: Handover) {
    setPending(true);
    setMessage(null);
    const result = await removeWithHandover(workspaceId, member.id, choice);
    setPending(false);
    if (result.ok) {
      const changed = result.handover;
      const cancelled = changed?.nextTwoWeeks.privateCancelled ?? 0;
      const moved = changed ? handedOverCount(changed) : 0;
      return done(
        [
          t('removed', { name: member.name }),
          moved > 0 ? handover('done', { count: moved }) : undefined,
          cancelled > 0 ? handover('doneCancelled', { count: cancelled }) : undefined,
        ]
          .filter((part): part is string => part !== undefined)
          .join(' '),
      );
    }
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'hasFutureSessions') setFuture(result.future);
    setMessage(t(`errors.${result.reason === 'noConnection' ? 'noConnection' : 'generic'}`));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent
        aria-describedby="handover-description"
        className="gap-0 rounded-[14px] p-5.5 sm:max-w-md"
      >
        <div className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg leading-snug font-semibold">
              {t('removeDialog.title', { name: member.name })}
            </DialogTitle>
            <DialogDescription id="handover-description">
              {t('removeDialog.body', {
                name: member.name,
                workspace: workspaceName,
                ...trainerWord,
              })}
            </DialogDescription>
          </DialogHeader>
          <HandoverForm
            // New counts start the form again: the choices were about other sessions.
            key={JSON.stringify([future.nextTwoWeeks, future.later])}
            member={member}
            future={future}
            trainers={trainers}
            trainerWord={trainerWord}
            message={message}
            pending={pending}
            onSubmit={(choice) => void submit(choice)}
            onCancel={onClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
