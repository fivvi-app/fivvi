'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { TrainerWordForms } from '@fivvi/i18n';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@fivvi/ui/components/alert-dialog';
import { Button } from '@fivvi/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fivvi/ui/components/dialog';
import { Label } from '@fivvi/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@fivvi/ui/components/native-select';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { Toast } from '@fivvi/ui/kit/toast';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { Client } from '../clients/clients-client';
import { ClientPicker } from './client-picker';
import { previewTimes } from './session-time';
import {
  type DateErrorKey,
  loadPlanningContext,
  type PlanningContext,
  planPrivateSession,
  type StartErrorKey,
} from './sessions-client';
import { useSessionFormat } from './use-session-format';
import { WhenFields, type WhenValue } from './when-fields';

const OpenNewSession = createContext<(() => void) | null>(null);

/** Opens PS-01; `null` where the person may not plan sessions (no `session.private.manage.*`). */
export function useOpenNewSession(): (() => void) | null {
  return useContext(OpenNewSession);
}

/** What the frame knows about the person and the workspace, for PS-01. */
export interface NewSessionProps {
  workspaceId: string;
  slug: string;
  /** The signed-in person's email address: their own place among the trainers is found by it. */
  email: string;
  /** Their own name as entered; none until they have one. */
  personName: string | null;
  /** The person has `session.private.manage.any`: any trainer of the workspace. Otherwise only themself. */
  forAnyTrainer: boolean;
  /** The person has `clients.manage`: PS-02 offers *+ Nieuwe klant*. */
  canAddClients: boolean;
  /** The workspace's word for the people who teach (F068), in the reader's language. */
  trainerWord: TrainerWordForms;
}

/** What a saved session shows in the snackbar. */
interface Saved {
  message: string;
  href: string;
}

/**
 * PS-01 *Nieuwe privésessie* (F020) for a workspace's frame: **+ Nieuw** → *Privésessie* opens it
 * with `useOpenNewSession`, as a panel on the right (full width on a phone). After a save the
 * panel closes and a snackbar says what was planned, with *Openen* for the session's page.
 */
export function NewSessionProvider({
  children,
  ...props
}: NewSessionProps & { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [openFn] = useState(() => () => setOpen(true));
  const [saved, setSaved] = useState<Saved | null>(null);

  // The snackbar goes by itself; *Openen* is for the moment it is there. It also goes once the
  // person is on another page (the session's own, or whichever they went to).
  const pathname = usePathname();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page ends the snackbar of the old one.
  useEffect(() => setSaved(null), [pathname]);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 15_000);
    return () => clearTimeout(timer);
  }, [saved]);

  return (
    <OpenNewSession value={openFn}>
      {children}
      {open ? (
        <NewSessionPanel
          {...props}
          close={() => setOpen(false)}
          planned={(result) => {
            setOpen(false);
            setSaved(result);
          }}
        />
      ) : null}
      <SavedSnackbar saved={saved} />
    </OpenNewSession>
  );
}

function SavedSnackbar({ saved }: { saved: Saved | null }) {
  const t = useTranslations('sessions.form');
  if (!saved) return null;
  return (
    <Toast>
      <span>{saved.message}</span>
      <Link href={saved.href as Route} className="font-bold underline underline-offset-4">
        {t('open')}
      </Link>
    </Toast>
  );
}

type Loaded =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; context: PlanningContext };

const FIRST_DURATION = 60;

function NewSessionPanel({
  workspaceId,
  slug,
  email,
  personName,
  forAnyTrainer,
  canAddClients,
  trainerWord,
  close,
  planned,
}: NewSessionProps & { close: () => void; planned: (saved: Saved) => void }) {
  const t = useTranslations('sessions.form');
  const e = useTranslations('sessions.form.errors');
  const common = useTranslations('common');
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [client, setClient] = useState<Client | null>(null);
  const [when, setWhen] = useState<WhenValue>({
    localDate: '',
    localStart: '',
    durationMinutes: FIRST_DURATION,
  });
  const [trainerId, setTrainerId] = useState('');
  const [notify, setNotify] = useState(true);
  const [required, setRequired] = useState<{
    client?: boolean;
    trainer?: boolean;
    when?: 'date' | 'start';
  }>({});
  const [apiErrors, setApiErrors] = useState<{ date?: DateErrorKey; start?: StartErrorKey }>({});
  const [formError, setFormError] = useState<'noPermission' | 'notSaved' | null>(null);
  const [pending, setPending] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const timeZone = loaded.status === 'ready' ? loaded.context.timeZone : 'Europe/Amsterdam';
  const { day, time } = useSessionFormat(timeZone);

  useEffect(() => {
    let current = true;
    void loadPlanningContext(workspaceId, { forAnyTrainer, email }).then((result) => {
      if (!current) return;
      if (!result.ok) {
        if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
        return setLoaded({ status: 'failed' });
      }
      setTrainerId(result.context.myTrainerId ?? '');
      setLoaded({ status: 'ready', context: result.context });
    });
    return () => {
      current = false;
    };
  }, [workspaceId, forAnyTrainer, email]);

  const preview = previewTimes({ ...when, timeZone, now: new Date() });
  const dirty =
    client !== null ||
    when.localDate !== '' ||
    when.localStart !== '' ||
    when.durationMinutes !== FIRST_DURATION ||
    !notify ||
    (loaded.status === 'ready' && trainerId !== (loaded.context.myTrainerId ?? ''));

  function requestClose() {
    if (dirty) setDiscarding(true);
    else close();
  }

  function change(next: WhenValue) {
    setWhen(next);
    setRequired((was) => ({ ...was, when: undefined }));
    setApiErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loaded.status !== 'ready') return;
    const missing = {
      client: client === null,
      trainer: forAnyTrainer && trainerId === '',
      when:
        when.localDate === ''
          ? ('date' as const)
          : when.localStart === ''
            ? ('start' as const)
            : undefined,
    };
    setRequired(missing);
    setFormError(null);
    setApiErrors({});
    if (!client || missing.trainer || missing.when || preview.status !== 'placed') return;
    setPending(true);
    const result = await planPrivateSession(workspaceId, {
      clientId: client.id,
      ...(forAnyTrainer ? { trainerId } : {}),
      ...when,
      notify,
    });
    if (result.ok) {
      router.refresh();
      return planned({
        message: t('saved', {
          client: client.name,
          date: day(result.session.startsAt),
          time: time(result.session.startsAt),
        }),
        href: `/w/${slug}/sessions/${result.session.id}`,
      });
    }
    setPending(false);
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'fields') {
      return setApiErrors({ date: result.date, start: result.start });
    }
    setFormError(result.reason === 'forbidden' ? 'noPermission' : 'notSaved');
  }

  const language =
    client &&
    (client.emailLocale ?? (loaded.status === 'ready' ? loaded.context.defaultLocale : 'nl-NL')) ===
      'en'
      ? t('languageEn')
      : t('languageNl');

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestClose()}>
        <DialogContent
          className="top-0 right-0 left-auto grid h-dvh max-w-none translate-x-0 translate-y-0 grid-rows-[auto_1fr_auto] gap-0 rounded-none p-5 sm:max-w-md"
          aria-describedby="new-session-description"
        >
          <form noValidate onSubmit={submit} className="contents">
            <DialogHeader className="pb-4">
              <div className="flex items-start justify-between gap-3">
                <DialogTitle className="text-lg leading-snug font-semibold">
                  {t('title')}
                </DialogTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('close')}
                  onClick={requestClose}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  >
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </Button>
              </div>
              <DialogDescription id="new-session-description">{t('description')}</DialogDescription>
            </DialogHeader>
            <div className="grid content-start gap-5 overflow-y-auto py-1 pr-1">
              {loaded.status === 'loading' ? (
                <p className="text-sm text-muted-foreground">{common('loading')}</p>
              ) : loaded.status === 'failed' ? (
                <ErrorLine>{t('loadFailed')}</ErrorLine>
              ) : (
                <>
                  <ClientPicker
                    workspaceId={workspaceId}
                    defaultLocale={loaded.context.defaultLocale}
                    canAdd={canAddClients}
                    value={client}
                    onChange={(picked) => {
                      setClient(picked);
                      setRequired((was) => ({ ...was, client: false }));
                    }}
                    error={required.client ? e('chooseClient') : undefined}
                  />
                  <WhenFields
                    idPrefix="new-session"
                    dateLabel={t('dateLabel')}
                    value={when}
                    onChange={change}
                    preview={preview}
                    errors={{ ...apiErrors, required: required.when }}
                    timeZone={timeZone}
                  />
                  {forAnyTrainer ? (
                    <div className="grid gap-1.5">
                      <Label
                        htmlFor="new-session-trainer"
                        className={required.trainer ? 'text-status-danger-fg' : undefined}
                      >
                        {t('trainerLabel', { ...trainerWord })}
                      </Label>
                      <NativeSelect
                        id="new-session-trainer"
                        name="trainerId"
                        value={trainerId}
                        className="w-full"
                        aria-invalid={required.trainer ? true : undefined}
                        onChange={(event) => {
                          setTrainerId(event.target.value);
                          setRequired((was) => ({ ...was, trainer: false }));
                        }}
                      >
                        {trainerId === '' ? (
                          <NativeSelectOption value="">
                            {t('trainerChoose', { ...trainerWord })}
                          </NativeSelectOption>
                        ) : null}
                        {loaded.context.trainers.map((trainer) => (
                          <NativeSelectOption key={trainer.id} value={trainer.id}>
                            {trainer.id === loaded.context.myTrainerId
                              ? t('trainerMe', { name: trainer.name || (personName ?? email) })
                              : trainer.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      {required.trainer ? (
                        <ErrorLine>{e('chooseTrainer', { ...trainerWord })}</ErrorLine>
                      ) : null}
                    </div>
                  ) : (
                    <div className="grid gap-1.5">
                      <span className="text-sm leading-none font-medium">
                        {t('trainerLabel', { ...trainerWord })}
                      </span>
                      <p className="text-sm">{t('trainerMe', { name: personName ?? email })}</p>
                    </div>
                  )}
                  <p className="text-sm">{t('location', { name: loaded.context.locationName })}</p>
                  {client ? (
                    <div className="grid gap-0.5">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="notify"
                          className="size-4 accent-primary"
                          checked={notify}
                          onChange={(event) => setNotify(event.target.checked)}
                        />
                        {t('notify', { client: client.name })}
                      </label>
                      <p className="pl-6 text-[13px] text-muted-foreground">
                        {t('notifyNote', { email: client.email, language })}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
              {formError ? <ErrorLine>{e(formError)}</ErrorLine> : null}
            </div>
            <DialogFooter className="-mx-5 -mb-5 mt-4 rounded-none">
              <Button type="button" variant="outline" onClick={requestClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={loaded.status !== 'ready' || pending}>
                {t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('discardTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('discardDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={close}>
              {t('discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
