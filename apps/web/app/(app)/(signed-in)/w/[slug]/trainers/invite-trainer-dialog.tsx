'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { Locale, TrainerWordForms } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fivvi/ui/components/dialog';
import { Label } from '@fivvi/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@fivvi/ui/components/native-select';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { Field } from '@fivvi/ui/kit/field';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import {
  type InviteEmailErrorKey,
  type InviteNameErrorKey,
  inviteTrainer,
  resendInvitation,
} from './invitations-client';

type FormLocale = 'nl-NL' | 'en' | '';

/** What the dialog says it refused: a field, or that the address is on the team or invited. */
type Refusal =
  | { kind: 'onTeam' }
  | { kind: 'invited'; invitationId: string }
  | { kind: 'failed'; key: 'tooMany' | 'notSent' };

/**
 * The invite dialog of TW-06 (F011): *Naam*, *E-mailadres* and *Taal van de e-mail* (the
 * workspace default named, *Nederlands*, *English*), *Versturen* and *Annuleren*. A blank field is
 * refused before anything is sent, the rest by the API; a refused or failed form keeps what was
 * typed. An address that is on the team says so by name and sends nothing (AC8); one with a
 * pending invitation offers *Opnieuw sturen* for that invitation instead of making a second one.
 * `done` runs with the line to confirm once an invitation went out or was sent again.
 * `teamNames` are the names of the team by address, to say whom the address belongs to.
 */
export function InviteTrainerDialogContent({
  workspaceId,
  defaultLocale,
  trainerWord,
  teamNames,
  done,
}: {
  workspaceId: string;
  /** The workspace's default communication language, named in the first option. */
  defaultLocale: Locale;
  /** The workspace's word for the people who teach (F068), in the reader's language. */
  trainerWord: TrainerWordForms;
  /** The team members' names, by lower-cased address. */
  teamNames: ReadonlyMap<string, string>;
  done: (confirmation: string) => void;
}) {
  const t = useTranslations('team.invite');
  const sent = useTranslations('team.invitations');
  const names = useTranslations('clients.languageNames');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailLocale, setEmailLocale] = useState<FormLocale>('');
  const [nameError, setNameError] = useState<InviteNameErrorKey | null>(null);
  const [emailError, setEmailError] = useState<InviteEmailErrorKey | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  /** Not allowed (any more): the signed-in home knows where this person belongs. */
  const goHome = () => window.location.replace(SIGNED_IN_HOME);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNameError(null);
    setEmailError(null);
    setRefusal(null);
    const result = await inviteTrainer(workspaceId, { name, email, emailLocale });
    if (result.ok) return done(t('sent', { name: result.invitation.name }));
    setPending(false);
    if (result.reason === 'home') return goHome();
    if (result.reason === 'fields') {
      setNameError(result.name ?? null);
      setEmailError(result.email ?? null);
      return;
    }
    if (result.reason === 'alreadyOnTeam') return setRefusal({ kind: 'onTeam' });
    if (result.reason === 'alreadyInvited') {
      return setRefusal({ kind: 'invited', invitationId: result.invitationId });
    }
    setRefusal({ kind: 'failed', key: result.reason === 'tooMany' ? 'tooMany' : 'notSent' });
  }

  async function sendAgain(invitationId: string) {
    setPending(true);
    setRefusal(null);
    const result = await resendInvitation(workspaceId, invitationId);
    if (result.ok) return done(sent('sentAgain'));
    setPending(false);
    if (result.reason === 'home') return goHome();
    setRefusal({ kind: 'failed', key: 'notSent' });
  }

  const emailMessage = emailError
    ? t(`errors.${emailError}`)
    : refusal?.kind === 'onTeam'
      ? t('alreadyOnTeam', { name: teamNames.get(email.trim().toLowerCase()) ?? name.trim() })
      : refusal?.kind === 'invited'
        ? t('alreadyInvited')
        : undefined;

  return (
    <DialogContent
      aria-describedby="invite-trainer-description"
      className="gap-0 rounded-[14px] p-5.5 sm:max-w-115"
    >
      <form noValidate onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug font-semibold">
            {t('title', { ...trainerWord })}
          </DialogTitle>
          <DialogDescription id="invite-trainer-description">{t('description')}</DialogDescription>
        </DialogHeader>
        <Field
          id="invite-trainer-name"
          name="name"
          label={t('nameLabel')}
          value={name}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
          error={nameError ? t(`errors.${nameError}`) : undefined}
        />
        <div className="grid gap-2">
          <Field
            id="invite-trainer-email"
            name="email"
            type="email"
            label={t('emailLabel')}
            value={email}
            autoComplete="off"
            onChange={(event) => setEmail(event.target.value)}
            error={emailMessage}
          />
          {refusal?.kind === 'invited' ? (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void sendAgain(refusal.invitationId)}
              >
                {t('sendAgain')}
              </Button>
            </div>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="invite-trainer-locale">{t('localeLabel')}</Label>
          <NativeSelect
            id="invite-trainer-locale"
            name="emailLocale"
            value={emailLocale}
            className="w-full"
            onChange={(event) => setEmailLocale(event.target.value as FormLocale)}
          >
            <NativeSelectOption value="">
              {t('localeDefault', { language: names(defaultLocale === 'nl-NL' ? 'nl' : 'en') })}
            </NativeSelectOption>
            <NativeSelectOption value="nl-NL">{t('localeNl')}</NativeSelectOption>
            <NativeSelectOption value="en">{t('localeEn')}</NativeSelectOption>
          </NativeSelect>
        </div>
        {refusal?.kind === 'failed' ? <ErrorLine>{t(`errors.${refusal.key}`)}</ErrorLine> : null}
        <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button type="submit" disabled={!ready || pending}>
            {t('submit')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
