'use client';

import { Card, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { LanguageOptions } from '../../language/language-options';

/**
 * The *Taal* / *Language* row of TW-09 My profile (F010), the same choice as in the user menu
 * (`LanguageOptions`), grouped under its heading.
 */
export function LanguageRow() {
  const profile = useTranslations('profile');
  // The buttons wait for the page to hydrate: a click before that would be lost.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="language-row-title" className="text-[15px] font-semibold">
            {profile('language')}
          </h2>
        </CardTitle>
      </CardHeader>
      <div className="grid gap-1 px-(--card-spacing)">
        <LanguageOptions labelledBy="language-row-title" disabled={!ready} />
      </div>
    </Card>
  );
}
