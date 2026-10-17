import { currentLocale } from '../i18n/current-locale';
import { apiClient } from '../server/api';
import { loadGreeting } from '../server/greeting';
import { Hello } from './hello';

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const [{ name }, locale] = await Promise.all([searchParams, currentLocale()]);
  const greeting = await loadGreeting(apiClient, locale);
  return <Hello greeting={greeting} firstName={typeof name === 'string' ? name.trim() : ''} />;
}
