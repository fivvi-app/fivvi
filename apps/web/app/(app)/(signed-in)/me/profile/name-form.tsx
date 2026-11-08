'use client';

import { SIGN_IN_PAGE } from '@fivvi/auth/return-path';
import { Button } from '@fivvi/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { Input } from '@fivvi/ui/components/input';
import { Label } from '@fivvi/ui/components/label';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { type NameErrorKey, saveName } from './save-name-client';

/**
 * The name and email address of TW-09 (F005): the name is editable with *Save*, the email address
 * is read-only text. Nothing is checked here: the API's answer words the field error, and a
 * refused name stays as typed. After a save the page asks the server again, so the sidebar footer
 * and every other page show the new name.
 */
export function NameForm({ name, email }: { name: string | null; email: string }) {
  const t = useTranslations('myProfile');
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
    const result = await saveName(typeof value === 'string' ? value : '');
    setPending(false);
    if (result.ok) {
      setSaved(true);
      return router.refresh();
    }
    if (result.reason === 'signedOut') return window.location.replace(SIGN_IN_PAGE);
    if (result.reason === 'name') return setError(result.error);
    setFailure(result.reason);
  }

  const nameError = error ? t(`errors.${error}`) : null;
  const failureMessage = failure ? t(`errors.${failure}`) : null;

  return (
    <Card>
      <form noValidate onSubmit={submit} className="grid gap-(--card-spacing)">
        <CardHeader>
          <CardTitle>
            <h2>{t('detailsTitle')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="person-name">{t('nameLabel')}</Label>
            <Input
              id="person-name"
              name="name"
              defaultValue={name ?? ''}
              autoComplete="name"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'person-name-error' : undefined}
            />
            {nameError ? (
              <p id="person-name-error" role="alert" className="text-status-danger-fg">
                {nameError}
              </p>
            ) : null}
          </div>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">{t('emailLabel')}</dt>
              <dd>{email}</dd>
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
  );
}
