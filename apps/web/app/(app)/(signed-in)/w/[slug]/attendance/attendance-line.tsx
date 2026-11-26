import type { Schemas } from '@fivvi/contract';
import { useTranslations } from 'next-intl';

type Item = Schemas['WorkspaceCalendarSession'];

/**
 * "Aanwezigheid: {status}" of a block of the Agenda (WC-05's quick view and WC-04's status column,
 * F025): a class date shows the summary "5 aanwezig · 1 niet verschenen · 1 open" once something is
 * recorded or it waits for attendance; a private session that waits for attendance says "Nog niet
 * ingevuld", and one that was filled in says *Aanwezig* or *Niet verschenen*. Everything comes from
 * the `attendance` counts of the read model, so a week of blocks costs no request of its own. A
 * cancelled session shows nothing.
 */
export function AttendanceLine({ item, as: Tag }: { item: Item; as: 'li' | 'span' }) {
  const t = useTranslations('attendance');
  if (item.status === 'cancelled') return null;
  const { attended = 0, noShow = 0, open = 0 } = item.attendance ?? {};
  let shown: string | undefined;
  if (item.type === 'group') {
    if (attended + noShow > 0 || item.attendanceOpen) {
      shown = t('summary', { attended, noShow, open });
    }
  } else if (item.attendanceOpen) {
    shown = t('notFilledIn');
  } else if (item.type === 'private' && open === 0) {
    if (attended > 0 && noShow === 0) shown = t('status.attended');
    else if (noShow > 0 && attended === 0) shown = t('status.noShow');
  }
  if (!shown) return null;
  return <Tag>{t('line', { status: shown })}</Tag>;
}
