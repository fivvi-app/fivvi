'use client';

import type { TrainerWordForms } from '@fivvi/i18n';
import { Dialog } from '@fivvi/ui/components/dialog';
import { Toast } from '@fivvi/ui/kit/toast';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { NewClassDialogContent } from './class-form';
import { ScheduleDialogContent } from './schedule-dialog';

/** What the frame knows about the workspace, for the class dialogs. */
export interface ClassesProps {
  workspaceId: string;
  slug: string;
  /** The signed-in person's own team-member ID in the workspace: their place among the trainers. */
  teamMemberId: string;
  /** The workspace's word for the people who teach (F068), in the reader's language. */
  trainerWord: TrainerWordForms;
}

/** What the screens of a person who manages classes can open. */
export interface ClassDialogs {
  /** *Nieuwe les* (TW-03). */
  openNewClass: () => void;
  /** *Op een datum plannen*: for one class, or asking for the class first. */
  openSchedule: (classId?: string) => void;
}

const Dialogs = createContext<ClassDialogs | null>(null);

/** The dialogs of the classes; `null` where the person may not manage classes (no `class.manage`). */
export function useClassDialogs(): ClassDialogs | null {
  return useContext(Dialogs);
}

type Open = { dialog: 'class'; thenSchedule: boolean } | { dialog: 'schedule'; classId?: string };

/**
 * The class dialogs of a workspace's frame (F021): *Nieuwe les*, and *Op een datum plannen* from a
 * class's page or from **+ Nieuw** → *Groepsles*. A new class made from the scheduling dialog goes
 * on to scheduling that class. After a save the dialog closes and a snackbar says what was done; a
 * scheduled date opens CO-01.
 */
export function ClassesProvider({
  children,
  workspaceId,
  slug,
  teamMemberId,
  trainerWord,
}: ClassesProps & { children: ReactNode }) {
  const t = useTranslations('classes');
  const router = useRouter();
  const [open, setOpen] = useState<Open | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dialogs = useMemo<ClassDialogs>(
    () => ({
      openNewClass: () => setOpen({ dialog: 'class', thenSchedule: false }),
      openSchedule: (classId) => setOpen({ dialog: 'schedule', ...(classId ? { classId } : {}) }),
    }),
    [],
  );

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 8_000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <Dialogs value={dialogs}>
      {children}
      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        {open?.dialog === 'class' ? (
          <NewClassDialogContent
            workspaceId={workspaceId}
            trainerWord={trainerWord}
            saved={(groupClass) => {
              setMessage(t('form.saved'));
              router.refresh();
              setOpen(open.thenSchedule ? { dialog: 'schedule', classId: groupClass.id } : null);
            }}
          />
        ) : open?.dialog === 'schedule' ? (
          <ScheduleDialogContent
            // A new dialog for each class, so the form starts from that class.
            key={open.classId ?? 'ask'}
            workspaceId={workspaceId}
            teamMemberId={teamMemberId}
            {...(open.classId ? { classId: open.classId } : {})}
            trainerWord={trainerWord}
            {...(open.classId
              ? {}
              : { newClass: () => setOpen({ dialog: 'class', thenSchedule: true }) })}
            scheduled={(session) => {
              setOpen(null);
              setMessage(t('schedule.saved'));
              router.push(`/w/${slug}/classes/${session.groupClass?.id}/${session.id}` as Route);
            }}
          />
        ) : null}
      </Dialog>
      {message ? <Toast>{message}</Toast> : null}
    </Dialogs>
  );
}
