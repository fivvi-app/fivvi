'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { Button } from '@fivvi/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@fivvi/ui/components/card';
import { Input } from '@fivvi/ui/components/input';
import { Label } from '@fivvi/ui/components/label';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { type NameErrorKey, renameWorkspace } from './rename-workspace-client';

/**
 * TW-08, Settings → General (F002, Owner only): the workspace name with *Save*, and the URL name
 * and time zone as read-only text (owner decision 2). Nothing is checked here: the API's answer
 * words the field error, and a refused name stays as typed. After a save the page asks the server
 * again, so the sidebar and every other page show the new name.
 */
export function GeneralForm({
  workspaceId,
  name,
  slug,
  timeZone,
}: {
  workspaceId: string;
  name: string;
  slug: string;
  timeZone: string;
}) {
  const t = useTranslations('settingsGeneral');
  const router = useRouter();
  const [error, setError] = useState<NameErrorKey | null>(null);
  const [failure, setFailure] = useState<'noConnection' | 'generic' | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  // The button waits for the page to hydrate: a click before that would submit the form natively.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('name');
    setPending(true);
    setError(null);
    setFailure(null);
    setSaved(false);
    const result = await renameWorkspace(workspaceId, typeof value === 'string' ? value : '');
    setPending(false);
    if (result.ok) {
      setSaved(true);
      return router.refresh();
    }
    // Not allowed (any more): the signed-in home knows where this person belongs.
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'name') return setError(result.error);
    setFailure(result.reason);
  }

  const nameError = error ? t(`errors.${error}`) : null;
  const failureMessage = failure ? t(`errors.${failure}`) : null;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <form noValidate onSubmit={submit} className="grid gap-(--card-spacing)">
          <CardHeader>
            <CardTitle className="font-display">
              <h1>{t('title')}</h1>
            </CardTitle>
            <CardDescription>{name}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="workspace-name">{t('nameLabel')}</Label>
              <Input
                id="workspace-name"
                name="name"
                defaultValue={name}
                autoComplete="organization"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? 'workspace-name-error' : undefined}
              />
              {nameError ? (
                <p id="workspace-name-error" role="alert" className="text-status-danger-fg">
                  {nameError}
                </p>
              ) : null}
            </div>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">{t('urlNameLabel')}</dt>
                <dd>{slug}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('timeZoneLabel')}</dt>
                <dd>{timeZone}</dd>
              </div>
            </dl>
            {failureMessage ? (
              <p role="alert" className="text-status-danger-fg">
                {failureMessage}
              </p>
            ) : null}
            {saved ? <p role="status">{t('saved')}</p> : null}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={!ready || pending}>
              {t('save')}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
