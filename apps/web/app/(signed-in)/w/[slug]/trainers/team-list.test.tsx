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
  const list = (members: Parameters<typeof TeamList>[0]['members'], canManage = true) =>
    render(
      locale,
      <TeamList
        workspaceId="w1"
        workspaceName="John's Gym"
        members={members}
        canManage={canManage}
        currentEmail="john@example.com"
      />,
    );
  /** The role menu of a person: the select named after them, with its options and the chosen one. */
  const menuOf = (html: string, name: string) =>
    html.match(
      new RegExp(
        `<select[^>]*aria-label="${escapeHtml(copy.team.roleMenu.replace('{name}', name))}"[^>]*>.*?</select>`,
      ),
    )?.[0];

  it('AC2: shows each person with name, email address and role label, in the order given', () => {
    const html = list([john, sarah]);

    expect(html).toMatch(new RegExp(`<h1[^>]*>${escapeHtml(copy.team.title)}</h1>`));
    // John is the last Owner: a plain label. Sarah's role is in her menu (below).
    expect(html).toMatch(
      new RegExp(
        `John</td><td[^>]*>john@example.com</td><td[^>]*>${copy.roles.owner}</td>.*Sarah</td><td[^>]*>sarah@example.com</td>`,
      ),
    );
  });

  it('F004 AC4: a Trainer row has the role menu with Owner and Trainer, her role chosen', () => {
    const menu = menuOf(list([john, sarah]), 'Sarah');

    expect(menu).toBeDefined();
    expect(menu).toMatch(new RegExp(`<option[^>]*value="owner"[^>]*>${copy.roles.owner}</option>`));
    expect(menu).toMatch(
      new RegExp(`<option[^>]*value="trainer"[^>]*selected[^>]*>${copy.roles.trainer}</option>`),
    );
  });

  it('F004 AC5: the last Owner has no role menu, so making them a Trainer is not offered', () => {
    const html = list([john, sarah]);

    expect(menuOf(html, 'John')).toBeUndefined();
    expect(html.match(/<select/g)).toHaveLength(1);
  });

  it('F004 AC5: with two Owners both rows have the role menu', () => {
    const html = list([john, { ...john, id: 't3', name: 'Joan', email: 'joan@example.com' }]);

    expect(menuOf(html, 'John')).toMatch(/value="owner"[^>]*selected/);
    expect(menuOf(html, 'Joan')).toMatch(/value="owner"[^>]*selected/);
  });

  it('F004 AC9: without team.manage nobody has a role menu or a remove action', () => {
    const html = list(
      [john, { ...john, id: 't3', name: 'Joan', email: 'joan@example.com' }, sarah],
      false,
    );

    expect(html).not.toContain('<select');
    expect(html).not.toContain('<button');
    expect(html).toContain(copy.roles.trainer);
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

  it('with two Owners, both rows have the remove action', () => {
    const html = list([john, { ...john, id: 't3', name: 'Joan', email: 'joan@example.com' }]);

    expect(html.match(new RegExp(escapeHtml(copy.team.remove), 'g'))).toHaveLength(2);
  });

  it('falls back to the email address for a person without a name', () => {
    const html = list([john, { ...sarah, name: '' }]);

    expect(html.match(/sarah@example\.com/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('the copy has none of the forbidden words', () => {
    expect(JSON.stringify(copy.team)).not.toMatch(/\b(lid|leden|member|membership)\b/i);
  });
});
