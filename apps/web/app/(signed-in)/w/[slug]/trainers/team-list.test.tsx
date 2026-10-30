import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../../test/render';
import { TeamList } from './team-list';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const john = { id: 't1', name: 'John', email: 'john@example.com', role: 'owner' } as const;
const sarah = { id: 't2', name: 'Sarah', email: 'sarah@example.com', role: 'trainer' } as const;

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F003 TW-06 Trainers in %s', (locale) => {
  const copy = messages[locale];
  const list = (members: Parameters<typeof TeamList>[0]['members']) =>
    render(locale, <TeamList workspaceId="w1" workspaceName="John's Gym" members={members} />);

  it('AC2: shows each person with name, email address and role label, in the order given', () => {
    const html = list([john, sarah]);

    expect(html).toMatch(new RegExp(`<h1[^>]*>${escapeHtml(copy.team.title)}</h1>`));
    expect(html).toMatch(
      new RegExp(
        `John</td><td[^>]*>john@example.com</td><td[^>]*>${copy.roles.owner}</td>.*Sarah</td><td[^>]*>sarah@example.com</td><td[^>]*>${copy.roles.trainer}</td>`,
      ),
    );
  });

  it('AC4: a Trainer row has the remove action, and there is no add button', () => {
    const html = list([john, sarah]);

    expect(html.match(new RegExp(escapeHtml(copy.team.remove), 'g'))).toHaveLength(1);
    expect(html).not.toMatch(/<a[^>]*>/);
  });

  it('AC7: the last Owner row offers no remove action', () => {
    const html = list([john]);

    expect(html).not.toContain(escapeHtml(copy.team.remove));
  });

  it('falls back to the email address for a person without a name', () => {
    const html = list([john, { ...sarah, name: '' }]);

    expect(html.match(/sarah@example\.com/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('the copy has none of the forbidden words', () => {
    expect(JSON.stringify(copy.team)).not.toMatch(/\b(lid|leden|member|membership)\b/i);
  });
});
