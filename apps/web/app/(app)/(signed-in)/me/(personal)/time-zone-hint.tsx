'use client';

import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';

const noSubscription = () => () => undefined;

/**
 * Whether the browser's time zone differs from the one the personal pages show times in. Only the
 * name is compared: a zone with the same offset still is not Dutch time, and the hint costs
 * nothing when it is shown by mistake.
 */
export function needsTimeZoneHint(browserZone: string, zone: string): boolean {
  return browserZone !== zone;
}

/**
 * "Tijden in Nederlandse tijd" (F013 AC14): the personal scope shows times in Amsterdam time, and
 * when the browser is in another zone this says so, so a trainer abroad is not confused by their
 * own clock. On the server, and until the page hydrates, the browser's zone is taken to be Dutch,
 * so the hint appears only where it is true.
 */
export function TimeZoneHint({ zone }: { zone: string }) {
  const t = useTranslations('personal');
  const browserZone = useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => zone,
  );
  if (!needsTimeZoneHint(browserZone, zone)) return null;
  return <p className="text-sm text-muted-foreground">{t('timeZoneHint')}</p>;
}
