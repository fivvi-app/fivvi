import { Button } from '@trainer-hub/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@trainer-hub/ui/components/card';
import { Input } from '@trainer-hub/ui/components/input';
import { Label } from '@trainer-hub/ui/components/label';
import { useTranslations } from 'next-intl';
import type { Greeting } from '../server/greeting';

/**
 * The hello page. The heading is the greeting the API sent, as a catalog key, or the error when
 * it couldn't be loaded. The form sends the first name back as `?name=`, which loads the
 * greeting again; an empty name greets nobody.
 */
export function Hello({ greeting, firstName }: { greeting: Greeting; firstName: string }) {
  const t = useTranslations('hello');
  const catalog = useTranslations();
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {greeting.status === 'loaded' ? (
            <CardTitle className="font-display">
              <h1>{catalog(greeting.key)}</h1>
            </CardTitle>
          ) : (
            <p role="alert">{t('error')}</p>
          )}
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        {firstName ? (
          <CardContent>
            <p role="status">{t('formGreeting', { name: firstName })}</p>
          </CardContent>
        ) : null}
        <form className="grid gap-(--card-spacing)">
          <CardContent className="grid gap-2">
            <Label htmlFor="first-name">{t('firstNameLabel')}</Label>
            <Input id="first-name" name="name" autoComplete="given-name" defaultValue={firstName} />
          </CardContent>
          <CardFooter>
            <Button type="submit">{t('continue')}</Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
