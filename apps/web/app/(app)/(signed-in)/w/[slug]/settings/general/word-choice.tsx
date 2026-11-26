'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { TrainerWord } from '@fivvi/i18n';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@fivvi/ui/components/card';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { SuccessLine } from '@fivvi/ui/kit/success-line';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { setTrainerWord } from './trainer-word-client';

/** One of the four choices as the reader sees it: its singular and its plural in their language. */
export interface WordOption {
  value: TrainerWord;
  /** The singular with a capital start, e.g. *Instructeur*. */
  word: string;
  /** The plural, e.g. *instructeurs*. */
  words: string;
}

/**
 * TW-08, Settings → General → Woordkeuze (F068, Owner only): what the workspace calls the people
 * who teach, one of four words, each shown as its singular and plural in the reader's language
 * (the prototype's *Woordkeuze* card). A choice is saved as it is made, with no button, like the
 * prototype; it is a card of its own, so saving it changes nothing else in General (AC11). After
 * a save the page asks the server again, so the next screen says the new word.
 */
export function WordChoice({
  workspaceId,
  workspaceName,
  current,
  options,
}: {
  workspaceId: string;
  workspaceName: string;
  current: TrainerWord;
  options: readonly WordOption[];
}) {
  const t = useTranslations('settingsWording');
  const router = useRouter();
  const titleId = useId();
  const helpId = useId();
  const [selected, setSelected] = useState(current);
  const [failure, setFailure] = useState<'noConnection' | 'generic' | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  // A choice before the page hydrates would only tick the radio and save nothing.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  async function choose(choice: TrainerWord) {
    // One save at a time; the group stays enabled, so the keyboard focus stays on the choice.
    if (pending) return;
    const before = selected;
    setSelected(choice);
    setPending(true);
    setFailure(null);
    setSaved(false);
    const result = await setTrainerWord(workspaceId, choice);
    setPending(false);
    if (result.ok) {
      setSaved(true);
      return router.refresh();
    }
    // Not allowed (any more): the signed-in home knows where this person belongs.
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    setSelected(before);
    setFailure(result.reason);
  }

  const failureMessage = failure ? t(`errors.${failure}`) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id={titleId} className="text-[15px] font-semibold">
            {t('title')}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <fieldset
          aria-labelledby={titleId}
          aria-describedby={helpId}
          disabled={!ready}
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {options.map(({ value, word, words }) => (
            <label
              key={value}
              className="grid cursor-pointer gap-0.5 rounded-[10px] border border-border bg-card px-3 py-2.5 text-left text-foreground has-[:checked]:border-foreground has-[:checked]:ring-1 has-[:checked]:ring-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-default"
            >
              <input
                type="radio"
                name="trainerWord"
                value={value}
                checked={selected === value}
                onChange={() => choose(value)}
                className="sr-only"
              />
              <b className="text-sm font-semibold">{word}</b>
              <span className="text-xs text-muted-foreground">{words}</span>
            </label>
          ))}
        </fieldset>
        <CardDescription id={helpId} className="text-[13px]">
          {t('help', { workspace: workspaceName })}
        </CardDescription>
        {failureMessage ? <ErrorLine>{failureMessage}</ErrorLine> : null}
        {saved ? <SuccessLine>{t('saved')}</SuccessLine> : null}
      </CardContent>
    </Card>
  );
}
