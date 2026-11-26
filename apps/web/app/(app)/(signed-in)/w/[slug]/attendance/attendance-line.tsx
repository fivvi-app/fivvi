'use client';

import type { Schemas } from '@fivvi/contract';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { getAttendance } from './attendance-client';

type Item = Schemas['WorkspaceCalendarSession'];

/**
 * "Aanwezigheid: {status}" of a block of the Agenda (WC-05's quick view and WC-04's status column,
 * F025): a class date shows the summary "5 aanwezig · 1 niet verschenen · 1 open" once something is
 * recorded or it waits for attendance (the read model has the counts); a private session that
 * waits for attendance says "Nog niet ingevuld", and one that started and was filled in says
 * *Aanwezig* or *Niet verschenen*. The read model carries no single status, so that word is read
 * from `GET …/participants` when the block is drawn, only for a private session that has started
 * and is not waiting. A cancelled session shows nothing.
 */
export function AttendanceLine({
  item,
  workspaceId,
  as: Tag,
}: {
  item: Item;
  workspaceId: string;
  as: 'li' | 'span';
}) {
  const t = useTranslations('attendance');
  const [status, setStatus] = useState<'attended' | 'no_show' | null>(null);
  const privateAndFilled =
    item.type === 'private' && item.status === 'scheduled' && !item.attendanceOpen;

  useEffect(() => {
    // Not yet started: nothing to show, and nothing the API would have.
    if (!privateAndFilled || Date.parse(item.startsAt) > Date.now()) return;
    let current = true;
    void getAttendance(workspaceId, item.id).then((attendance) => {
      if (!current || !attendance) return;
      const statuses = new Set(
        attendance.participants
          .filter((one) => one.status !== 'cancelled')
          .map((one) => one.status),
      );
      const [only] = [...statuses];
      if (statuses.size === 1 && (only === 'attended' || only === 'no_show')) setStatus(only);
    });
    return () => {
      current = false;
    };
  }, [privateAndFilled, item.id, item.startsAt, workspaceId]);

  if (item.status === 'cancelled') return null;
  let shown: string | undefined;
  if (item.type === 'group') {
    const { attended = 0, noShow = 0, open = 0 } = item.attendance ?? {};
    if (attended + noShow > 0 || item.attendanceOpen) {
      shown = t('summary', { attended, noShow, open });
    }
  } else if (item.attendanceOpen) {
    shown = t('notFilledIn');
  } else if (status) {
    shown = t(`status.${status === 'attended' ? 'attended' : 'noShow'}`);
  }
  if (!shown) return null;
  return <Tag>{t('line', { status: shown })}</Tag>;
}
