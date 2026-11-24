'use client';

import type { Locale } from '@fivvi/i18n';
import { type ReactNode, useState } from 'react';
import { CancelSession } from './cancel-session';
import { RescheduleSession } from './reschedule-session';
import type { Session } from './sessions-client';

/**
 * The buttons of the session page that open a dialog of their own: *Verplaatsen* (PS-05) and
 * *Annuleren* (PS-06, F026). They share one place because PS-06's nudge "Al een ander moment
 * voorgesteld?" closes itself and opens PS-05 for the same session. `children` are the other
 * actions of the row.
 */
export function SessionActions({
  workspaceId,
  session,
  client,
  defaultLocale,
  ownSession,
  canMove,
  canCancel,
  startMoving,
  startCancelling,
  children,
}: {
  workspaceId: string;
  session: Session;
  client: { id: string; name: string; email: string; emailLocale: Locale | null };
  defaultLocale: Locale;
  ownSession: boolean;
  /** The person has `session.private.manage.own` or `.any`. */
  canMove: boolean;
  /** The person may cancel this session: the Owner any, a Trainer their own (`session.private.cancel.*`). */
  canCancel: boolean;
  /** PS-05 opens at once (`?move=1`). */
  startMoving: boolean;
  /** PS-06 opens at once (`?cancel=1`: the calendar's quick view). */
  startCancelling: boolean;
  children?: ReactNode;
}) {
  const cancelled = session.status === 'cancelled';
  const [moving, setMoving] = useState(startMoving);
  const [cancelling, setCancelling] = useState(startCancelling && canCancel && !cancelled);
  return (
    <>
      {canMove && !cancelled ? (
        <RescheduleSession
          workspaceId={workspaceId}
          session={session}
          client={client}
          defaultLocale={defaultLocale}
          ownSession={ownSession}
          open={moving}
          onOpenChange={setMoving}
        />
      ) : null}
      {children}
      {canCancel ? (
        <CancelSession
          workspaceId={workspaceId}
          session={session}
          client={client}
          defaultLocale={defaultLocale}
          open={cancelling}
          onOpenChange={setCancelling}
          onReschedule={() => setMoving(true)}
        />
      ) : null}
    </>
  );
}
