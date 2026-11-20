'use client';

import { pickContentLanguage, type TrainerWordForms } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { Card } from '@fivvi/ui/components/card';
import { PageShell } from '@fivvi/ui/kit/page-shell';
import type { Route } from 'next';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { GroupClass } from './classes-client';
import { useClassDialogs } from './classes-provider';

/**
 * TW-03 *Lessen* (F021, the Owner): the workspace's classes by name, each row with the name in the
 * viewer's language (else Dutch), a link to the class's page, the usual trainer or *Trainer nodig*,
 * the spots and the duration. **Nieuwe les** opens the class form; without classes the page says
 * so. The API gives the classes sorted by Dutch name.
 */
export function ClassList({
  slug,
  classes,
  trainerWord,
}: {
  slug: string;
  classes: readonly GroupClass[];
  trainerWord: TrainerWordForms;
}) {
  const t = useTranslations('classes');
  const locale = useLocale();
  const dialogs = useClassDialogs();
  // The button waits for the page to hydrate: a click before that would do nothing.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const head = 'px-4.5 py-2 text-start text-[13px] font-medium text-muted-foreground';
  const cell = 'px-4.5 py-2.5';

  return (
    <PageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        {dialogs ? (
          <Button type="button" disabled={!ready} onClick={dialogs.openNewClass}>
            {t('new')}
          </Button>
        ) : null}
      </div>
      {classes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <Card className="gap-0 py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b">
                  <th scope="col" className={head}>
                    {t('nameColumn')}
                  </th>
                  <th scope="col" className={head}>
                    {t('trainerColumn', { ...trainerWord })}
                  </th>
                  <th scope="col" className={head}>
                    {t('spotsColumn')}
                  </th>
                  <th scope="col" className={head}>
                    {t('durationColumn')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {classes.map((groupClass) => (
                  <tr key={groupClass.id} className="border-b last:border-b-0 hover:bg-muted/60">
                    <td className={cell}>
                      <Link
                        href={`/w/${slug}/classes/${groupClass.id}` as Route}
                        className="font-semibold underline-offset-4 hover:underline"
                      >
                        {pickContentLanguage(locale, groupClass.nameNl, groupClass.nameEn)}
                      </Link>
                    </td>
                    <td className={cell}>
                      {groupClass.defaultTrainer
                        ? groupClass.defaultTrainer.name
                        : t('trainerNeeded', { ...trainerWord })}
                    </td>
                    <td className={cell}>{t('spots', { count: groupClass.capacity })}</td>
                    <td className={cell}>
                      {t('minutes', { minutes: groupClass.durationMinutes })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageShell>
  );
}
