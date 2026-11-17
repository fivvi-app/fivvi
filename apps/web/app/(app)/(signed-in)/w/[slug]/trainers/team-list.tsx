'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { Schemas } from '@fivvi/contract';
import type { Locale } from '@fivvi/i18n';
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
import { Card } from '@fivvi/ui/components/card';
import { Dialog } from '@fivvi/ui/components/dialog';
import { NativeSelect, NativeSelectOption } from '@fivvi/ui/components/native-select';
import { Avatar } from '@fivvi/ui/kit/avatar';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { PageShell } from '@fivvi/ui/kit/page-shell';
import { StatusPill } from '@fivvi/ui/kit/status-pill';
import { SuccessLine } from '@fivvi/ui/kit/success-line';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { initials } from '../workspace-initials';
import { changeTeamMemberRole } from './change-role-client';
import { resendInvitation, type TrainerInvitation, withdrawInvitation } from './invitations-client';
import { InviteTrainerDialogContent } from './invite-trainer-dialog';
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
 * neither the menu nor the action (F003 AC7, F004 AC5). With `team.invite` (the Owner, F011) the
 * page has the button *Trainer uitnodigen* and lists the pending invitations under the team, each
 * as *Uitgenodigd* with the date it was sent and the row actions *Opnieuw sturen* and *Intrekken*
 * (which asks first). After a change the page asks the server again, so the list is what the API
 * holds.
 * A team member who trains here (F005: every Trainer, and an Owner who also trains) has the
 * trainer badge next to their role. "You" is the row with the address of the signed-in account.
 */
export function TeamList({
  workspaceId,
  workspaceName,
  members,
  canManage,
  trainerIds,
  currentEmail,
  canInvite = false,
  invitations = [],
  defaultLocale = 'nl-NL',
  timeZone = 'Europe/Amsterdam',
}: {
  workspaceId: string;
  workspaceName: string;
  members: readonly TeamMember[];
  /** Whether the API lists `team.manage` for this person in this workspace. */
  canManage: boolean;
  /** The team-member IDs of the people who train here (`GET …/trainers`, F005). */
  trainerIds: readonly string[];
  /** The address the signed-in account signs in with. */
  currentEmail: string;
  /** Whether the API lists `team.invite` for this person in this workspace (F011). */
  canInvite?: boolean;
  /** The pending invitations (`GET …/trainer-invitations`); empty for a person who can't invite. */
  invitations?: readonly TrainerInvitation[];
  /** The workspace's default language, named in the invite dialog's language menu. */
  defaultLocale?: Locale;
  /** The workspace's time zone, which the dates of the invitations are shown in. */
  timeZone?: string;
}) {
  const t = useTranslations('team');
  const roles = useTranslations('roles');
  const format = useFormatter();
  const router = useRouter();
  const [asking, setAsking] = useState<Question | null>(null);
  const [withdrawing, setWithdrawing] = useState<TrainerInvitation | null>(null);
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<'noConnection' | 'generic' | 'lastOwner' | 'gone' | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  // The buttons wait for the page to hydrate: a click before that would do nothing.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  const trainers = new Set(trainerIds);
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
    setWithdrawing(null);
    if (result.ok) {
      setNotice(done);
      return router.refresh();
    }
    // Not allowed (any more): the signed-in home knows where this person belongs.
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    setFailure(result.reason);
    // Someone else changed the team first: show what the API holds now.
    if (result.reason === 'lastOwner' || result.reason === 'gone') router.refresh();
  }

  const sendAgain = (invitation: TrainerInvitation) =>
    run(() => resendInvitation(workspaceId, invitation.id), t('invitations.sentAgain'));

  const withdraw = (invitation: TrainerInvitation) =>
    run(
      () => withdrawInvitation(workspaceId, invitation.id),
      t('invitations.withdrawn', { name: invitation.name }),
    );

  /** The invite dialog went through: show what it says and ask the server for the new list. */
  function invited(confirmation: string) {
    setInviting(false);
    setFailure(null);
    setNotice(confirmation);
    router.refresh();
  }

  const teamNames = new Map(
    members.map((member) => [member.email.toLowerCase(), displayName(member)]),
  );

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

  const head = 'px-4.5 py-2 text-start text-[13px] font-medium text-muted-foreground';
  const cell = 'px-4.5 py-2.5';

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        {canInvite ? (
          <Button type="button" disabled={!ready} onClick={() => setInviting(true)}>
            {t('invite.title')}
          </Button>
        ) : null}
      </div>
      {notice ? <SuccessLine>{notice}</SuccessLine> : null}
      {failure ? (
        <ErrorLine>
          {failure === 'gone'
            ? t('invitations.gone')
            : t(`errors.${failure}`, { workspace: workspaceName })}
        </ErrorLine>
      ) : null}
      <Card className="gap-0 py-0">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className={head}>
                  {t('nameColumn')}
                </th>
                <th scope="col" className={head}>
                  {t('emailColumn')}
                </th>
                <th scope="col" className={head}>
                  {t('roleColumn')}
                </th>
                <th scope="col" className={head}>
                  <span className="sr-only">{t('actionsColumn')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b last:border-b-0 hover:bg-muted/60">
                  <td className={cell}>
                    <span className="inline-flex items-center gap-2.5">
                      <Avatar initials={initials(displayName(member))} />
                      <span className="font-semibold">{displayName(member)}</span>
                    </span>
                  </td>
                  <td className={cell}>{member.email}</td>
                  <td className={cell}>
                    <div className="flex flex-wrap items-center gap-2">
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
                      {trainers.has(member.id) ? (
                        <StatusPill>{t('badge.trainer')}</StatusPill>
                      ) : null}
                    </div>
                  </td>
                  <td className={`${cell} text-end`}>
                    {canManage && !(member.role === 'owner' && owners <= 1) ? (
                      <Button
                        type="button"
                        variant="ghost"
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
              {invitations.map((invitation) => (
                <tr key={invitation.id} className="border-b last:border-b-0 hover:bg-muted/60">
                  <td className={cell}>
                    <span className="inline-flex items-center gap-2.5">
                      <Avatar initials={initials(invitation.name)} />
                      <span className="font-semibold text-muted-foreground">{invitation.name}</span>
                    </span>
                  </td>
                  <td className={cell}>{invitation.email}</td>
                  <td className={cell}>
                    <div className="flex flex-wrap items-center gap-2">
                      {roles('trainer')}
                      <StatusPill>{t('invitations.status')}</StatusPill>
                      <span className="text-muted-foreground">
                        {format.dateTime(new Date(invitation.sentAt), 'dateWithYear', { timeZone })}
                      </span>
                    </div>
                  </td>
                  <td className={`${cell} text-end`}>
                    {canInvite ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!ready || pending}
                          onClick={() => void sendAgain(invitation)}
                        >
                          {t('invitations.sendAgain')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!ready || pending}
                          onClick={() => setWithdrawing(invitation)}
                        >
                          {t('invitations.withdraw')}
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
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
      <AlertDialog
        open={withdrawing !== null}
        onOpenChange={(open) => !open && setWithdrawing(null)}
      >
        {withdrawing ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('invitations.withdrawDialog.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('invitations.withdrawDialog.body', { email: withdrawing.email })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('invitations.withdrawDialog.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault();
                  void withdraw(withdrawing);
                }}
              >
                {t('invitations.withdrawDialog.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
      {canInvite ? (
        <Dialog open={inviting} onOpenChange={setInviting}>
          {inviting ? (
            <InviteTrainerDialogContent
              workspaceId={workspaceId}
              defaultLocale={defaultLocale}
              teamNames={teamNames}
              done={invited}
            />
          ) : null}
        </Dialog>
      ) : null}
    </PageShell>
  );
}
