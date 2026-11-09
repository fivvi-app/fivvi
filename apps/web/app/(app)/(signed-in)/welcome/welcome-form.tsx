'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { Button } from '@fivvi/ui/components/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { Field } from '@fivvi/ui/kit/field';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { GatePage } from '../../gate-page';
import {
  type CreateWorkspaceResult,
  createWorkspace,
  type Fields,
} from './create-workspace-client';

/**
 * TW-11: the one first-run screen (F002). Two fields and one button; the person's name only when
 * the account has none (`askName`). Nothing is checked here: the API's answer words every field
 * error, and a refused field keeps what was typed. Landing in the new workspace is a full page
 * load, so the page is asked for again with everything the sign-in and the create changed.
 */
export function WelcomeForm({ askName }: { askName: boolean }) {
  const t = useTranslations('welcome');
  const [fields, setFields] = useState<Fields>({});
  const [failure, setFailure] = useState<'noConnection' | 'generic' | null>(null);
  const [pending, setPending] = useState(false);
  // The button waits for the page to hydrate: a click before that would submit the form natively
  // and reload the page, and a value typed before it would be lost.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setFields({});
    setFailure(null);
    const result = await createWorkspace({
      name: text(form, 'name'),
      ...(askName ? { personName: text(form, 'personName') } : {}),
    });
    if (result.ok) return window.location.replace(`/w/${result.slug}`);
    setPending(false);
    show(result);
  }

  function show(result: Exclude<CreateWorkspaceResult, { ok: true }>) {
    // Not allowed (any more) or not signed in: the signed-in home knows where this person belongs.
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'fields') return setFields(result.fields);
    setFailure(result.reason);
  }

  const personNameError = fields.personName ? t(`errors.${fields.personName}`) : null;
  const nameError = fields.name ? t(`errors.${fields.name}`) : null;

  return (
    <GatePage>
      <form noValidate onSubmit={submit} className="grid gap-(--card-spacing)">
        <CardHeader>
          <CardTitle className="text-[22px] leading-tight font-semibold">
            <h1>{t('title')}</h1>
          </CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {askName ? (
            <Field
              id="person-name"
              name="personName"
              autoComplete="name"
              label={t('personNameLabel')}
              error={personNameError}
            />
          ) : null}
          <Field
            id="workspace-name"
            name="name"
            autoComplete="organization"
            label={t('workspaceNameLabel')}
            hint={t('workspaceNameHint')}
            error={nameError}
          />
          {failure ? <ErrorLine id="welcome-error">{t(`errors.${failure}`)}</ErrorLine> : null}
          <Button type="submit" disabled={!ready || pending} className="w-full">
            {t('submit')}
          </Button>
        </CardContent>
      </form>
    </GatePage>
  );
}

/** What was typed in the form's field `name`, as typed: the API trims it and judges it. */
function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
