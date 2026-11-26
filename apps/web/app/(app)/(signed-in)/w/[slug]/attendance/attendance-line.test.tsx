import type { Schemas } from '@fivvi/contract';
import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { escapeHtml, render } from '../../../../../../test/render';
import { AttendanceLine } from './attendance-line';

type Item = Schemas['WorkspaceCalendarSession'];

const base: Item = {
  id: 's-anna',
  type: 'private',
  status: 'scheduled',
  startsAt: '2026-09-22T07:00:00.000Z',
  endsAt: '2026-09-22T08:00:00.000Z',
  timeZone: 'Europe/Amsterdam',
  capacity: 1,
  version: 1,
  location: {
    id: 'l1',
    name: "John's Gym",
    type: 'organization_location',
    address: null,
    isDefault: true,
  },
  clientName: 'Anna de Vries',
  clients: [{ clientId: 'c-anna', name: 'Anna de Vries' }],
};
const kracht: Item = {
  ...base,
  id: 's-kracht',
  type: 'group',
  capacity: 8,
  booked: 7,
  className: 'Kracht',
  clientName: undefined,
  clients: undefined,
};

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F025 AC3: "Aanwezigheid: {status}" on the calendar in %s', (locale) => {
  const copy = messages[locale].attendance;
  const line = (item: Item) => render(locale, <AttendanceLine item={item} as="span" />);

  it('a class shows the summary of its participants once something is recorded', () => {
    const html = line({ ...kracht, attendance: { attended: 5, noShow: 1, open: 1, cancelled: 0 } });

    expect(html).toContain(
      escapeHtml(
        copy.line.replace(
          '{status}',
          copy.summary.replace('{attended}', '5').replace('{noShow}', '1').replace('{open}', '1'),
        ),
      ),
    );
  });

  it('a class that waits for attendance says so even before anyone is marked', () => {
    const html = line({
      ...kracht,
      attendanceOpen: true,
      attendance: { attended: 0, noShow: 0, open: 7, cancelled: 0 },
    });

    expect(html).toContain(
      escapeHtml(
        copy.line.replace(
          '{status}',
          copy.summary.replace('{attended}', '0').replace('{noShow}', '0').replace('{open}', '7'),
        ),
      ),
    );
  });

  it('a class nobody is marked at yet, or a class without participants, shows no line', () => {
    expect(line({ ...kracht, attendance: { attended: 0, noShow: 0, open: 7, cancelled: 0 } })).toBe(
      '',
    );
    expect(
      line({ ...kracht, booked: 0, attendance: { attended: 0, noShow: 0, open: 0, cancelled: 0 } }),
    ).toBe('');
  });

  it('a private session that waits for attendance says it is not filled in yet', () => {
    expect(line({ ...base, attendanceOpen: true })).toContain(
      escapeHtml(copy.line.replace('{status}', copy.notFilledIn)),
    );
  });

  it('a private session says Aanwezig or Niet verschenen from its summary, with no request of its own', () => {
    const attended = { attended: 1, noShow: 0, open: 0, cancelled: 0 };
    const noShow = { attended: 0, noShow: 1, open: 0, cancelled: 0 };
    const said = (word: string) => escapeHtml(copy.line.replace('{status}', word));

    expect(line({ ...base, attendance: attended })).toContain(said(copy.status.attended));
    expect(line({ ...base, attendance: noShow })).toContain(said(copy.status.noShow));
  });

  it('a private session still booked, or one whose place was cancelled, shows no status', () => {
    expect(line({ ...base, attendance: { attended: 0, noShow: 0, open: 1, cancelled: 0 } })).toBe(
      '',
    );
    expect(line({ ...base, attendance: { attended: 0, noShow: 0, open: 0, cancelled: 1 } })).toBe(
      '',
    );
    expect(line(base)).toBe('');
  });

  it('a cancelled session shows no attendance', () => {
    expect(line({ ...base, status: 'cancelled', attendanceOpen: true })).toBe('');
  });
});
