'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { Schemas } from '@fivvi/contract';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@fivvi/ui/components/alert-dialog';
import { Button } from '@fivvi/ui/components/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { removeTeamMember } from './remove-team-member-client';

type TeamMember = Schemas['TeamMember'];

/** What the page calls a person: their name, or the address they sign in with when they have none. */
const displayName = (member: TeamMember) => member.name || member.email;

/**
 * TW-06 Trainers (F003, Owner only): the team in one list, in the order the API gives (sorted by
 * name). A Trainer row has the row action *Remove from team*, which asks for confirmation in a
 * dialog that repeats the person's name; the last Owner's row has none (AC7), and there is no
 * add button (invitations are F011). After a removal the page asks the server again, so the list
 * is what the API holds, and the confirmation names the person.
 */
export function TeamList({
  workspaceId,
  workspaceName,
  members,
}: {
  workspaceId: string;
  workspaceName: string;
  members: readonly TeamMember[];
}) {
  const t = useTranslations('team');
  const roles = useTranslations('roles');
  const router = useRouter();
  const [asking, setAsking] = useState<TeamMember | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);
  const [failure, setFailure] = useState<'noConnection' | 'generic' | null>(null);
  const [pending, setPending] = useState(false);
  // The buttons wait for the page to hydrate: a click before that would do nothing.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  const owners = members.filter(({ role }) => role === 'owner').length;

  async function confirm(member: TeamMember) {
    setPending(true);
    setFailure(null);
    setRemoved(null);
    const result = await removeTeamMember(workspaceId, member.id);
    setPending(false);
    setAsking(null);
    if (result.ok) {
      setRemoved(displayName(member));
      return router.refresh();
    }
    // Not allowed (any more): the signed-in home knows where this person belongs.
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    setFailure(result.reason);
  }

  return (
    <main className="flex flex-1 justify-center p-4">
      <div className="grid w-full max-w-3xl content-start gap-4">
        <h1 className="font-display text-2xl font-semibold">{t('title')}</h1>
        {removed ? <p role="status">{t('removed', { name: removed })}</p> : null}
        {failure ? (
          <p role="alert" className="text-status-danger-fg">
            {t(`errors.${failure}`)}
          </p>
        ) : null}
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b text-start">
              <th scope="col" className="p-2 text-start font-medium">
                {t('nameColumn')}
              </th>
              <th scope="col" className="p-2 text-start font-medium">
                {t('emailColumn')}
              </th>
              <th scope="col" className="p-2 text-start font-medium">
                {t('roleColumn')}
              </th>
              <th scope="col" className="p-2 text-start font-medium">
                <span className="sr-only">{t('actionsColumn')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b">
                <td className="p-2">{displayName(member)}</td>
                <td className="p-2">{member.email}</td>
                <td className="p-2">{roles(member.role)}</td>
                <td className="p-2 text-end">
                  {member.role === 'owner' && owners <= 1 ? null : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!ready || pending}
                      onClick={() => setAsking(member)}
                    >
                      {t('remove')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        {asking ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('removeDialog.title', { name: displayName(asking) })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('removeDialog.body', { name: displayName(asking), workspace: workspaceName })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('removeDialog.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault();
                  void confirm(asking);
                }}
              >
                {t('removeDialog.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </main>
  );
}
