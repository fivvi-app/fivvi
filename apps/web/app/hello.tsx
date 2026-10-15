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

/** The hello page. The form sends the first name back as `?name=`; an empty name greets nobody. */
export function Hello({ firstName }: { firstName: string }) {
  const t = useTranslations('hello');
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>{t('title')}</h1>
          </CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        {firstName ? (
          <CardContent>
            <p role="status">{t('greeting', { name: firstName })}</p>
          </CardContent>
        ) : null}
        <form className="grid gap-(--card-spacing)">
          <CardContent className="grid gap-2">
            <Label htmlFor="first-name">{t('firstNameLabel')}</Label>
            <Input id="first-name" name="name" autoComplete="given-name" defaultValue={firstName} />
          </CardContent>
          <CardFooter>
            <Button type="submit">{t('greet')}</Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
