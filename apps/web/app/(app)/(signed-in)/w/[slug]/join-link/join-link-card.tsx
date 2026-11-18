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
import { Card, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { PageShell } from '@fivvi/ui/kit/page-shell';
import { SuccessLine } from '@fivvi/ui/kit/success-line';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { renewJoinLink } from './renew-join-link-client';

/** The URL to show: the renewed one only while the server still gives the URL it replaced. */
export function shownJoinLink(renewal: { from: string; to: string } | null, url: string): string {
  return renewal && renewal.from === url ? renewal.to : url;
}

/**
 * The Aanmeldlink page (F029; a person with `join_link.view`, the Owner and the Trainers): the
 * workspace's one join link with **Link kopiëren**, and, for a person with `join_link.renew` (the
 * Owner), **Vernieuwen**, which asks first because the old link and its QR codes stop working. The
 * new URL shows at once; the page asks the server again and, when its value arrives, shows what the
 * API holds. The QR code, its poster and the booking links join this page in M6 (F038, F037).
 */
export function JoinLinkCard({
  workspaceId,
  url,
  canRenew,
}: {
  workspaceId: string;
  /** The join link in full, as `GET /v1/workspaces/{workspaceId}/join-link` gives it. */
  url: string;
  /** Whether the API lists `join_link.renew` for this person in this workspace. */
  canRenew: boolean;
}) {
  const t = useTranslations('joinLink');
  const router = useRouter();
  // The URL a renewal gave, and the server value it replaced: once the refreshed page brings a
  // different `url`, the server value is shown.
  const [renewal, setRenewal] = useState<{ from: string; to: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<'copy' | 'noConnection' | 'generic' | null>(null);
  const [pending, setPending] = useState(false);
  // The buttons wait for the page to hydrate: a click before that would do nothing.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  const shown = shownJoinLink(renewal, url);

  async function copy() {
    setNotice(null);
    setFailure(null);
    try {
      await navigator.clipboard.writeText(shown);
      setNotice(t('copied'));
    } catch {
      setFailure('copy');
    }
  }

  async function renew() {
    setPending(true);
    setNotice(null);
    setFailure(null);
    const result = await renewJoinLink(workspaceId);
    setPending(false);
    setAsking(false);
    if (result.ok) {
      setRenewal({ from: url, to: result.url });
      setNotice(t('renewed'));
      return router.refresh();
    }
    // Not allowed (any more): the signed-in home knows where this person belongs.
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    setFailure(result.reason);
  }

  return (
    <PageShell>
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
      {notice ? <SuccessLine>{notice}</SuccessLine> : null}
      {failure ? <ErrorLine>{t(`errors.${failure}`)}</ErrorLine> : null}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>
            <h2 className="text-[15px] font-semibold">{t('title')}</h2>
          </CardTitle>
        </CardHeader>
        <div className="grid gap-3 px-(--card-spacing)">
          <p>{t('body')}</p>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
            <code data-testid="join-link-url" className="min-w-0 flex-1 break-all text-[13px]">
              {shown}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!ready}
              onClick={() => void copy()}
            >
              {t('copy')}
            </Button>
          </div>
          {canRenew ? (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!ready || pending}
                onClick={() => setAsking(true)}
              >
                {t('renew')}
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('renewDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('renewDialog.body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('renewDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                void renew();
              }}
            >
              {t('renewDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
