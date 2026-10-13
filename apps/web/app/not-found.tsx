import { useTranslations } from 'next-intl';

// Replaces Next.js's built-in 404, which has hard-coded English copy.
export default function NotFound() {
  const t = useTranslations('notFound');
  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('body')}</p>
    </main>
  );
}
