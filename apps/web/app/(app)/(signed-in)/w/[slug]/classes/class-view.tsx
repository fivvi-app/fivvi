'use client';

import { pickContentLanguage, type TrainerWordForms } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { Card, CardContent } from '@fivvi/ui/components/card';
import { PageShell } from '@fivvi/ui/kit/page-shell';
import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ClassSeries, GroupClass } from './classes-client';
import { useClassDialogs } from './classes-provider';
import { referenceDay, seriesEnd } from './series';

/**
 * The page of a class (`/w/{slug}/classes/{id}`, F021, the Owner): the name in the viewer's
 * language (else Dutch), the usual trainer or *Trainer nodig*, the spots and the duration, the
 * description (in the viewer's language, else Dutch), and **Op een datum plannen**.
 */
export function ClassView({
  slug,
  groupClass,
  canManage,
  series = [],
  trainerWord,
}: {
  slug: string;
  groupClass: GroupClass;
  /** The person has `class.manage`: they may put the class on a date. */
  canManage: boolean;
  /** The weekly series of the class that still run (F022, `GET …/series`): *Reeksen*. */
  series?: ClassSeries[];
  trainerWord: TrainerWordForms;
}) {
  const t = useTranslations('classes');
  const locale = useLocale();
  const format = useFormatter();
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
            {t('page.facts', {
              trainer: groupClass.defaultTrainer
                ? groupClass.defaultTrainer.name
                : t('trainerNeeded', { ...trainerWord }),
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
      {series.length > 0 ? (
        <Card>
          <CardContent className="grid gap-3 text-sm">
            <h2 className="font-semibold">{t('series.title')}</h2>
            <ul className="grid gap-2">
              {series.map((item) => (
                <li key={item.id} className="grid gap-0.5">
                  <p>
                    {t('series.line', {
                      weekday: format.dateTime(referenceDay(item.weekday), {
                        timeZone: 'UTC',
                        weekday: 'long',
                      }),
                      start: item.localStartTime,
                      end: seriesEnd(item.localStartTime, item.durationMinutes),
                      trainer: item.trainer
                        ? item.trainer.name
                        : t('trainerNeeded', { ...trainerWord }),
                      spots: t('spots', { count: item.capacity }),
                    })}
                  </p>
                  <p className="text-muted-foreground">
                    {t('series.from', {
                      date: format.dateTime(new Date(`${item.startsOn}T12:00:00Z`), {
                        timeZone: 'UTC',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      }),
                    })}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
