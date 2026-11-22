'use client';

import { Button } from '@fivvi/ui/components/button';
import { useTranslations } from 'next-intl';
import { useClassDialogs } from '../classes/classes-provider';
import { useOpenNewSession } from '../sessions/new-private-session';

/**
 * What the empty day offers (WC-01): *+ Privésessie* (PS-01) for a person who may plan private
 * sessions and *+ Groepsles* (F021's *Op een datum plannen*) for the Owner, the same two actions
 * as the empty week of the Agenda. Each is there only when the frame gives its dialog. The
 * welcome of a new workspace (`welcome`, #1544) offers the same two as *Groepsles toevoegen* and
 * *Privésessie toevoegen*.
 */
export function EmptyDayActions({ welcome = false }: { welcome?: boolean }) {
  const calendar = useTranslations('workspaceCalendar');
  const dashboard = useTranslations('workspaceDashboard');
  const openNewSession = useOpenNewSession();
  const openSchedule = useClassDialogs()?.openSchedule;
  if (!openNewSession && !openSchedule) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {openNewSession ? (
        <Button type="button" variant="outline" onClick={() => openNewSession()}>
          {welcome ? dashboard('addPrivate') : calendar('newPrivate')}
        </Button>
      ) : null}
      {openSchedule ? (
        <Button type="button" variant="outline" onClick={() => openSchedule()}>
          {welcome ? dashboard('addGroup') : calendar('newGroup')}
        </Button>
      ) : null}
    </div>
  );
}
