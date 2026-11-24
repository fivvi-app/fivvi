'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { TrainerWordForms } from '@fivvi/i18n';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '../sessions/sessions-client';
import { loadAssignSubject } from '../sessions/trainer-assignment-client';
import { type TrainerAssigned, TrainerDialog } from '../sessions/trainer-dialog';
import type { TrainerFormClient } from '../sessions/trainer-form';

/**
 * WC-03 (F023): the trainer dialog opened by dragging a block to another trainer's column. The
 * calendar holds the block, not the session: this reads the session (and a private session's
 * client, for the email box) and opens CO-02 (a class date) or *Trainer wijzigen* (a private
 * session) with the trainer of that column chosen. Nothing changes until the Owner saves; *Annuleren*
 * leaves the block where it was. When the session can't be read, `failed` says so.
 */
export function CalendarAssign({
  workspaceId,
  slug,
  sessionId,
  trainerId,
  trainerWord,
  workspaceName,
  teamMemberId,
  onClose,
  onAssigned,
  failed,
}: {
  workspaceId: string;
  slug: string;
  sessionId: string;
  /** The team-member ID of the column the block was dropped on. */
  trainerId: string;
  trainerWord: TrainerWordForms;
  workspaceName: string;
  teamMemberId: string;
  onClose: () => void;
  onAssigned: (assigned: TrainerAssigned) => void;
  failed: () => void;
}) {
  // The latest `failed`, without running the read again when the caller makes a new function.
  const failedRef = useRef(failed);
  failedRef.current = failed;
  const [subject, setSubject] = useState<{ session: Session; client?: TrainerFormClient } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    void loadAssignSubject(workspaceId, sessionId).then((result) => {
      if (!active) return;
      if (result.ok) return setSubject(result);
      if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
      failedRef.current();
    });
    return () => {
      active = false;
    };
  }, [workspaceId, sessionId]);

  if (!subject) return null;
  return (
    <TrainerDialog
      workspaceId={workspaceId}
      slug={slug}
      session={subject.session}
      {...(subject.client ? { client: subject.client } : {})}
      trainerWord={trainerWord}
      workspaceName={workspaceName}
      teamMemberId={teamMemberId}
      initialTrainerId={trainerId}
      onClose={onClose}
      onAssigned={onAssigned}
    />
  );
}
