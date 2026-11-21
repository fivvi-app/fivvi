import type { Schemas } from '@fivvi/contract';
import { locales, messages, trainerWordForms } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../../../test/render';
import { BookingLinksView } from './booking-links-view';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

type BookingLink = Schemas['BookingLink'];

const kracht = { id: 'c1', nameNl: 'Kracht', nameEn: 'Strength' };
const base = {
  active: true,
  deactivatedAt: null,
  createdAt: '2026-11-10T09:00:00.000Z',
  groupClass: null,
  date: null,
  language: 'visitor',
} satisfies Partial<BookingLink>;

const all: BookingLink = {
  ...base,
  id: 'l1',
  url: 'https://fivvi.app/l/a81k3m2x',
  scope: 'all',
};
const group: BookingLink = {
  ...base,
  id: 'l2',
  url: 'https://fivvi.app/l/g42m7p9q',
  scope: 'group',
};
const oneClass: BookingLink = {
  ...base,
  id: 'l3',
  url: 'https://fivvi.app/l/k77p4c8d',
  scope: 'class',
  language: 'en',
  groupClass: kracht,
};
// Tuesday 17 November 2026, 18:00 in Amsterdam.
const oneDate: BookingLink = {
  ...base,
  id: 'l4',
  url: 'https://fivvi.app/l/d19x6h2w',
  scope: 'session',
  date: {
    id: 's1',
    startsAt: '2026-11-17T17:00:00.000Z',
    timeZone: 'Europe/Amsterdam',
    groupClass: kracht,
  },
};
const stopped: BookingLink = {
  ...oneClass,
  id: 'l5',
  url: 'https://fivvi.app/l/o11d5e7r',
  language: 'nl',
  active: false,
  deactivatedAt: '2026-11-12T09:00:00.000Z',
};

const JOIN_URL = 'https://fivvi.app/j/7KQ2M9XA';

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F037 TW-07 Boekingslinks in %s', (locale) => {
  const copy = messages[locale].bookingLinks;
  const view = (canManage: boolean, links: BookingLink[] = [all, group, oneClass, oneDate]) =>
    render(
      locale,
      <BookingLinksView
        workspaceId="w1"
        join={{ url: JOIN_URL, canRenew: canManage }}
        links={links}
        classes={[
          {
            id: 'c1',
            nameNl: 'Kracht',
            nameEn: 'Strength',
            descriptionNl: null,
            descriptionEn: null,
            capacity: 8,
            durationMinutes: 60,
          },
        ]}
        canManage={canManage}
        trainerWord={trainerWordForms('trainer', locale)}
      />,
    );
  const className = locale === 'en' ? 'Strength' : 'Kracht';
  // Known-good literals for Tuesday 17 November in the workspace's time zone.
  const writtenDate = locale === 'en' ? 'Tue 17 Nov' : 'di 17 nov';

  it('AC1: shows the join link with its URL under the one h1, then the booking links with theirs', () => {
    const html = view(true);

    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${escapeHtml(copy.title)}</h1>`));
    expect(html).toMatch(new RegExp(`<code[^>]*>${JOIN_URL}</code>`));
    expect(html).toContain(escapeHtml(copy.body));
    for (const { url } of [all, group]) {
      expect(html).toMatch(new RegExp(`<code[^>]*>${url}</code>`));
    }
    // Join link first, the standing links before the others.
    expect(html.indexOf(JOIN_URL)).toBeLessThan(html.indexOf(all.url));
    expect(html.indexOf(all.url)).toBeLessThan(html.indexOf(group.url));
    expect(html.indexOf(group.url)).toBeLessThan(html.indexOf(oneClass.url));
  });

  it('AC1: the standing links read Alle boekingen and Groepslessen with the visitor’s language, and have Link kopiëren', () => {
    const html = view(false, [all, group]);

    expect(html).toContain(escapeHtml(copy.scope.all));
    expect(html).toContain(escapeHtml(copy.scope.group));
    expect(html.match(new RegExp(escapeHtml(copy.language.visitor), 'g'))).toHaveLength(2);
    // The join link's button, one per booking link.
    expect(html.match(new RegExp(`>${escapeHtml(copy.copy)}<`, 'g'))).toHaveLength(3);
    // Open Gym is out of the MVP (PRODUCT.md §53).
    expect(html).not.toContain('Open Gym');
  });

  it('AC2: a class link and a class-date link read as the spec words them, in the viewer’s language and the workspace’s time zone', () => {
    const html = view(true);

    expect(html).toContain(escapeHtml(copy.scope.class.replace('{class}', className)));
    expect(html).toContain(escapeHtml(copy.language.en));
    expect(html).toContain(
      escapeHtml(copy.scope.session.replace('{date}', writtenDate).replace('{class}', className)),
    );
  });

  it('AC7: a deactivated link is listed under Niet actief, dimmed, without actions', () => {
    const html = view(true, [all, group, stopped]);

    const inactive = html.slice(html.indexOf(`>${escapeHtml(copy.inactiveHeading)}</h3>`));
    expect(inactive).toContain(stopped.url);
    expect(inactive).toContain(escapeHtml(copy.language.nl));
    expect(inactive).not.toContain(`>${escapeHtml(copy.copy)}<`);
    expect(inactive).not.toContain(`>${escapeHtml(copy.deactivate)}<`);
    // No heading for the list without deactivated links.
    expect(view(true)).not.toContain(`>${escapeHtml(copy.inactiveHeading)}</h3>`);
  });

  it('AC2: the Owner has Nieuwe boekingslink and Deactiveren on each active link', () => {
    const html = view(true);

    expect(html).toMatch(new RegExp(`<button[^>]*>[^<]*${escapeHtml(copy.new.open)}</button>`));
    expect(html.match(new RegExp(`>${escapeHtml(copy.deactivate)}<`, 'g'))).toHaveLength(4);
    expect(html).not.toContain(
      escapeHtml(copy.trainerNote.replace('{Words}', trainerWordForms('trainer', locale).Words)),
    );
  });

  it('AC9: a Trainer sees the links with Link kopiëren, the note, and no Nieuwe boekingslink or Deactiveren', () => {
    const html = view(false);

    expect(html).toContain(
      escapeHtml(copy.trainerNote.replace('{Words}', trainerWordForms('trainer', locale).Words)),
    );
    expect(html).not.toContain(escapeHtml(copy.new.open));
    expect(html).not.toContain(`>${escapeHtml(copy.deactivate)}<`);
    expect(html.match(new RegExp(`>${escapeHtml(copy.copy)}<`, 'g'))).toHaveLength(5);
    // A Trainer has no Vernieuwen (F029).
    expect(html).not.toContain(escapeHtml(messages[locale].joinLink.renew));
  });

  it('shows the booking links without a join-link card for a person who may not see it', () => {
    const html = render(
      locale,
      <BookingLinksView
        workspaceId="w1"
        join={null}
        links={[all]}
        classes={[]}
        canManage={false}
        trainerWord={trainerWordForms('trainer', locale)}
      />,
    );

    expect(html).not.toContain(JOIN_URL);
    expect(html).toContain(all.url);
  });
});
