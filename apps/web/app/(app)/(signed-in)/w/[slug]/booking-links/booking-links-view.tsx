'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
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
import { Card, CardAction, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { Dialog } from '@fivvi/ui/components/dialog';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { PageShell } from '@fivvi/ui/kit/page-shell';
import { Toast } from '@fivvi/ui/kit/toast';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import type { GroupClass } from '../classes/classes-client';
import { JoinLinkCard } from '../join-link/join-link-card';
import { type BookingLink, deactivateBookingLink, listBookingLinks } from './booking-links-client';
import { BookingLinksTable } from './booking-links-table';
import { NewBookingLinkContent } from './new-booking-link-dialog';

/**
 * TW-07 *Boekingslinks* (`/w/{slug}/booking-links`, F037; F029's *Aanmeldlink* page): the join-link
 * card at the top for a person who may see it, then the workspace's booking links. The Owner
 * (`canManage`) makes more with **Nieuwe boekingslink** and stops one with **Deactiveren**, which
 * asks first; a Trainer copies and is told that the links can't be changed. Everything the person
 * is told goes to one snackbar, announced politely; after a change the list is read again, so the
 * page shows what the API holds. The QR codes join this page with F038.
 */
export function BookingLinksView({
  workspaceId,
  join,
  links: initial,
  classes,
  canManage,
}: {
  workspaceId: string;
  /** The join-link card: given to a person with `join_link.view`. */
  join: { url: string; canRenew: boolean } | null;
  /** The workspace's links as `GET …/booking-links` gives them. */
  links: readonly BookingLink[];
  /** The classes the *Eén les* picker offers; the Owner's. */
  classes: readonly GroupClass[];
  /** The person has `booking_link.manage`. */
  canManage: boolean;
}) {
  const t = useTranslations('bookingLinks');
  const headingId = useId();
  const [links, setLinks] = useState<readonly BookingLink[]>(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<
    'copy' | 'noConnection' | 'generic' | 'noPermission' | null
  >(null);
  const [making, setMaking] = useState(false);
  const [stopping, setStopping] = useState<BookingLink | null>(null);
  const [pending, setPending] = useState(false);
  // The buttons wait for the page to hydrate: a click before that would do nothing.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const active = links.filter((link) => link.active);
  const inactive = links.filter((link) => !link.active);

  async function reload() {
    const result = await listBookingLinks(workspaceId);
    if (result.ok) setLinks(result.links);
  }

  /** A call was refused: the signed-in home knows where this person belongs, the rest is said in words. */
  function refused(reason: 'home' | 'forbidden' | 'noConnection' | 'generic') {
    if (reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    setFailure(reason === 'forbidden' ? 'noPermission' : reason);
  }

  async function copy(url: string) {
    setFailure(null);
    try {
      await navigator.clipboard.writeText(url);
      setNotice(t('copied'));
    } catch {
      setFailure('copy');
    }
  }

  async function stop() {
    if (!stopping) return;
    setPending(true);
    setFailure(null);
    const result = await deactivateBookingLink(workspaceId, stopping.id);
    setPending(false);
    setStopping(null);
    if (!result.ok) return refused(result.reason);
    setNotice(t('deactivated'));
    await reload();
  }

  return (
    <PageShell>
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
      {failure ? <ErrorLine>{t(`errors.${failure}`)}</ErrorLine> : null}
      {join ? (
        <JoinLinkCard
          workspaceId={workspaceId}
          url={join.url}
          canRenew={join.canRenew}
          onNotice={setNotice}
        />
      ) : null}
      <Card role="region" aria-labelledby={headingId}>
        <CardHeader>
          <CardTitle>
            <h2 id={headingId} className="text-[15px] font-semibold">
              {t('title')}
            </h2>
          </CardTitle>
          {canManage ? (
            <CardAction>
              <Button type="button" disabled={!ready} onClick={() => setMaking(true)}>
                {t('new.open')}
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <div className="grid gap-1 px-(--card-spacing)">
          <p>{t('body')}</p>
          {canManage ? null : <p className="text-muted-foreground">{t('trainerNote')}</p>}
        </div>
        <BookingLinksTable
          links={active}
          ready={ready}
          canManage={canManage}
          copy={(url) => void copy(url)}
          deactivate={setStopping}
        />
        {inactive.length > 0 ? (
          <div className="grid gap-1">
            <h3 className="px-4.5 pt-2 text-[13px] font-semibold">{t('inactiveHeading')}</h3>
            <BookingLinksTable
              links={inactive}
              inactive
              ready={ready}
              canManage={false}
              copy={() => {}}
              deactivate={() => {}}
            />
          </div>
        ) : null}
      </Card>
      <Dialog open={making} onOpenChange={setMaking}>
        {making ? (
          <NewBookingLinkContent
            workspaceId={workspaceId}
            classes={classes}
            created={() => void reload()}
            forbidden={() => {
              setMaking(false);
              refused('forbidden');
            }}
            signedOut={() => refused('home')}
          />
        ) : null}
      </Dialog>
      <AlertDialog open={stopping !== null} onOpenChange={(open) => !open && setStopping(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deactivateDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deactivateDialog.body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('deactivateDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                void stop();
              }}
            >
              {t('deactivateDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {notice ? <Toast>{notice}</Toast> : null}
    </PageShell>
  );
}
