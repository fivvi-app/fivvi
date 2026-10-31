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
import { NativeSelect, NativeSelectOption } from '@fivvi/ui/components/native-select';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { changeTeamMemberRole } from './change-role-client';
import { removeTeamMember } from './remove-team-member-client';

type TeamMember = Schemas['TeamMember'];
type Role = TeamMember['role'];

/** The roles of the menu, in the order the glossary lists them. */
const ROLES = ['owner', 'trainer'] as const satisfies readonly Role[];

/** The copy of each question, in the `team` catalog. */
const DIALOGS = {
  remove: 'removeDialog',
  makeOwner: 'makeOwnerDialog',
  stepDown: 'stepDownDialog',
} as const;

/** What the person is asked to confirm: leaving the team, making someone Owner, or stepping down. */
type Question = { kind: 'remove' | 'makeOwner' | 'stepDown'; member: TeamMember };

/** What the page calls a person: their name, or the address they sign in with when they have none. */
const displayName = (member: TeamMember) => member.name || member.email;

/**
 * TW-06 Trainers (F003, F004; a person with `team.view`): the team in one list, in the order the
 * API gives (sorted by name). With `team.manage` each row has the role menu *Rol: Eigenaar /
 * Trainer* and the row action *Remove from team*. Making someone Owner asks once, and so does
 * making yourself a Trainer; making another Owner a Trainer asks nothing. The last Owner's row has
 * neither the menu nor the action (F003 AC7, F004 AC5), and there is no add button (invitations
 * are F011). After a change the page asks the server again, so the list is what the API holds.
 * "You" is the row with the address of the signed-in account.
 */
export function TeamList({
  workspaceId,
  workspaceName,
  members,
  canManage,
  currentEmail,
}: {
  workspaceId: string;
  workspaceName: string;
  members: readonly TeamMember[];
  /** Whether the API lists `team.manage` for this person in this workspace. */
  canManage: boolean;
  /** The address the signed-in account signs in with. */
  currentEmail: string;
}) {
  const t = useTranslations('team');
  const roles = useTranslations('roles');
  const router = useRouter();
  const [asking, setAsking] = useState<Question | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<'noConnection' | 'generic' | 'lastOwner' | null>(null);
  const [pending, setPending] = useState(false);
  // The buttons wait for the page to hydrate: a click before that would do nothing.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  const owners = members.filter(({ role }) => role === 'owner').length;

  const isYou = (member: TeamMember) => member.email.toLowerCase() === currentEmail.toLowerCase();

  async function run(
    action: () => Promise<
      { ok: true } | { ok: false; reason: NonNullable<typeof failure> | 'home' }
    >,
    done: string,
  ) {
    setPending(true);
    setFailure(null);
    setNotice(null);
    const result = await action();
    setPending(false);
    setAsking(null);
    if (result.ok) {
      setNotice(done);
      return router.refresh();
    }
    // Not allowed (any more): the signed-in home knows where this person belongs.
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    setFailure(result.reason);
    // Someone else changed the team first: show what the API holds now.
    if (result.reason === 'lastOwner') router.refresh();
  }

  const remove = (member: TeamMember) =>
    run(
      () => removeTeamMember(workspaceId, member.id),
      t('removed', { name: displayName(member) }),
    );

  const changeRole = (member: TeamMember, role: Role) =>
    run(
      () => changeTeamMemberRole(workspaceId, member.id, role),
      t(`roleChanged.${role}`, { name: displayName(member) }),
    );

  /** The menu applies a change to a Trainer at once, and asks first for the two that need it. */
  function chooseRole(member: TeamMember, role: Role) {
    if (role === member.role) return;
    if (role === 'owner') return setAsking({ kind: 'makeOwner', member });
    if (isYou(member)) return setAsking({ kind: 'stepDown', member });
    void changeRole(member, role);
  }

  function confirm({ kind, member }: Question) {
    if (kind === 'remove') return remove(member);
    return changeRole(member, kind === 'makeOwner' ? 'owner' : 'trainer');
  }

  return (
    <main className="flex flex-1 justify-center p-4">
      <div className="grid w-full max-w-3xl content-start gap-4">
        <h1 className="font-display text-2xl font-semibold">{t('title')}</h1>
        {notice ? <p role="status">{notice}</p> : null}
        {failure ? (
          <p role="alert" className="text-status-danger-fg">
            {t(`errors.${failure}`, { workspace: workspaceName })}
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
                <td className="p-2">
                  {canManage && !(member.role === 'owner' && owners <= 1) ? (
                    <NativeSelect
                      aria-label={t('roleMenu', { name: displayName(member) })}
                      value={member.role}
                      disabled={!ready || pending}
                      onChange={(event) => chooseRole(member, event.target.value as Role)}
                    >
                      {ROLES.map((role) => (
                        <NativeSelectOption key={role} value={role}>
                          {roles(role)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  ) : (
                    roles(member.role)
                  )}
                </td>
                <td className="p-2 text-end">
                  {canManage && !(member.role === 'owner' && owners <= 1) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!ready || pending}
                      onClick={() => setAsking({ kind: 'remove', member })}
                    >
                      {t('remove')}
                    </Button>
                  ) : null}
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
                {t(`${DIALOGS[asking.kind]}.title`, { name: displayName(asking.member) })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t(`${DIALOGS[asking.kind]}.body`, {
                  name: displayName(asking.member),
                  workspace: workspaceName,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t(`${DIALOGS[asking.kind]}.cancel`)}</AlertDialogCancel>
              <AlertDialogAction
                variant={asking.kind === 'remove' ? 'destructive' : 'default'}
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault();
                  void confirm(asking);
                }}
              >
                {t(`${DIALOGS[asking.kind]}.confirm`)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </main>
  );
}
