'use client';

import { pickContentLanguage, type TrainerWordForms } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { Card, CardContent } from '@fivvi/ui/components/card';
import { PageShell } from '@fivvi/ui/kit/page-shell';
import type { Route } from 'next';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { GroupClass } from './classes-client';
import { useClassDialogs } from './classes-provider';

/**
 * The page of a class (`/w/{slug}/classes/{id}`, F021, the Owner): the name in the viewer's
 * language (else Dutch), the usual trainer or *Trainer nodig*, the spots and the duration, the
 * description (in the viewer's language, else Dutch), and **Op een datum plannen**.
 */
export function ClassView({
  slug,
  groupClass,
  canManage,
  trainerWord,
}: {
  slug: string;
  groupClass: GroupClass;
  /** The person has `class.manage`: they may put the class on a date. */
  canManage: boolean;
  trainerWord: TrainerWordForms;
}) {
  const t = useTranslations('classes');
  const locale = useLocale();
  const dialogs = useClassDialogs();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const description = pickContentLanguage(
    locale,
    groupClass.descriptionNl,
    groupClass.descriptionEn,
  );

  return (
    <PageShell>
      <Link
        href={`/w/${slug}/classes` as Route}
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        {t('page.back')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold tracking-tight">
          {pickContentLanguage(locale, groupClass.nameNl, groupClass.nameEn)}
        </h1>
        {canManage && dialogs ? (
          <Button
            type="button"
            disabled={!ready}
            onClick={() => dialogs.openSchedule(groupClass.id)}
          >
            {t('page.schedule')}
          </Button>
        ) : null}
      </div>
      <Card>
        <CardContent className="grid gap-3 text-sm">
          <p>
            {groupClass.defaultTrainer
              ? groupClass.defaultTrainer.name
              : t('trainerNeeded', { ...trainerWord })}
            {' · '}
            {t('page.facts', {
              spots: t('spots', { count: groupClass.capacity }),
              duration: t('minutes', { minutes: groupClass.durationMinutes }),
            })}
          </p>
          <div className="grid gap-1">
            <h2 className="font-semibold">{t('page.descriptionTitle')}</h2>
            {description ? (
              <p className="whitespace-pre-line">{description}</p>
            ) : (
              <p className="text-muted-foreground">{t('page.noDescription')}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
