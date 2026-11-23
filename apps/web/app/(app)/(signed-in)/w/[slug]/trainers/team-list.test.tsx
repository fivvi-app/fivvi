import { locales, messages, trainerWordForms } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../../../test/render';
import { TeamList } from './team-list';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const john = { id: 't1', name: 'John', email: 'john@example.com', role: 'owner' } as const;
const sarah = { id: 't2', name: 'Sarah', email: 'sarah@example.com', role: 'trainer' } as const;

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F003 TW-06 Trainers in %s', (locale) => {
  const copy = messages[locale];
  const list = (
    members: Parameters<typeof TeamList>[0]['members'],
    canManage = true,
    trainerIds: readonly string[] = [],
  ) =>
    render(
      locale,
      <TeamList
        workspaceId="w1"
        workspaceName="John's Gym"
        members={members}
        canManage={canManage}
        trainerIds={trainerIds}
        currentEmail="john@example.com"
        trainerWord={trainerWordForms('trainer', locale)}
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
        `John(?:</span>)+</td><td[^>]*>john@example.com</td><td[^>]*>(?:<div[^>]*>)?${copy.roles.owner}(?:</div>)?</td>.*Sarah(?:</span>)+</td><td[^>]*>sarah@example.com</td>`,
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

  it('AC4: a Trainer row has the remove action, and a person who can not invite has no add button', () => {
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

  /** The badge of a row: the kit's pill after the role of the person. */
  const badges = (html: string) =>
    html.match(
      new RegExp(`<span[^>]*data-slot="status-pill"[^>]*>${copy.team.badge.trainer}</span>`, 'g'),
    );

  it('AC7: a trainer badge on each team member with a trainer profile, not on an Owner who does not train', () => {
    const joan = { ...john, id: 't3', name: 'Joan', email: 'joan@example.com' };

    const html = list([john, joan, sarah], true, ['t1', 't2']);

    expect(badges(html)).toHaveLength(2);
    expect(html).toMatch(
      new RegExp(
        `John(?:</span>)+</td>.*?${copy.roles.owner}.*?<span[^>]*data-slot="status-pill"[^>]*>${copy.team.badge.trainer}</span>.*?Joan(?:</span>)+</td>`,
      ),
    );
    expect(html).toMatch(
      /Joan(?:<\/span>)+<\/td>(?:(?!data-slot="status-pill").)*?Sarah(?:<\/span>)+<\/td>/,
    );
  });

  it('AC7: with nobody training there is no badge', () => {
    expect(badges(list([john, sarah]))).toBeNull();
  });

  it('E020 AC15: the team is one card with the kit’s avatar before each name, the initials drawn from data-initials', () => {
    const html = list([
      john,
      { ...sarah, name: 'Sarah de Vries' },
      { ...sarah, id: 't4', name: '' },
    ]);

    expect(html).toMatch(/<div[^>]*data-slot="card"[^>]*>\s*<div[^>]*><table/);
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html).toMatch(/<span[^>]*data-slot="avatar"[^>]*data-initials="JO"[^>]*><\/span>/);
    expect(html).toMatch(/<span[^>]*data-slot="avatar"[^>]*data-initials="SD"[^>]*><\/span>/);
    // Without a name the initials come from the address, as the name does.
    expect(html).toMatch(/<span[^>]*data-slot="avatar"[^>]*data-initials="SA"[^>]*><\/span>/);
    // Said by the name beside it, not by the avatar: it is hidden from screen readers.
    expect(html.match(/data-slot="avatar"[^>]*aria-hidden="true"/g)).toHaveLength(3);
  });

  it('E020 AC15: the column headings are the quiet line, and the page is the trainer web page with the 20px heading', () => {
    const html = list([john, sarah]);

    expect(html).toMatch(/<main[^>]*data-slot="page-shell"/);
    expect(html).toMatch(/<h1[^>]*class="[^"]*text-xl[^"]*tracking-tight[^"]*"/);
    expect(html).toMatch(/<th[^>]*scope="col"[^>]*class="[^"]*text-muted-foreground[^"]*"/);
  });

  describe('F011 invitations', () => {
    const lisa = {
      id: 'i1',
      name: 'Lisa',
      email: 'lisa@example.com',
      emailLocale: null,
      sentAt: '2026-11-14T10:00:00.000Z',
      expiresAt: '2026-11-21T10:00:00.000Z',
    } as const;
    const owner = (invitations: readonly (typeof lisa)[] = [lisa]) =>
      render(
        locale,
        <TeamList
          workspaceId="w1"
          workspaceName="John's Gym"
          members={[john, sarah]}
          canManage
          trainerIds={[]}
          currentEmail="john@example.com"
          trainerWord={trainerWordForms('trainer', locale)}
          canInvite
          invitations={invitations}
          defaultLocale="nl-NL"
          timeZone="Europe/Amsterdam"
        />,
      );
    const button = (label: string) =>
      new RegExp(
        `<button[^>]*type="button"[^>]*>${escapeHtml(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</button>`,
      );

    it('AC1: the Owner has the invite button at the top, beside the heading', () => {
      const html = owner([]);

      expect(html).toMatch(
        new RegExp(
          `<h1[^>]*>${escapeHtml(copy.team.title)}</h1>.*?<button[^>]*>${copy.team.invite.title}</button>`,
        ),
      );
    });

    it('AC1: a pending invitation is a row with the name, the address, Uitgenodigd and the date', () => {
      const html = owner();

      expect(html).toMatch(
        new RegExp(
          `Lisa(?:</span>)+</td><td[^>]*>lisa@example.com</td><td[^>]*>.*?${copy.roles.trainer}.*?<span[^>]*data-slot="status-pill"[^>]*>${copy.team.invitations.status}</span>.*?>\\p{L}+,? \\d{1,2} \\p{L}+\\.? 2026</span>`,
          'u',
        ),
      );
    });

    it('AC7: its row has Opnieuw sturen and Intrekken, and the team rows keep theirs', () => {
      const html = owner();

      expect(html).toMatch(button(copy.team.invitations.sendAgain));
      expect(html).toMatch(button(copy.team.invitations.withdraw));
      expect(html.match(new RegExp(escapeHtml(copy.team.remove), 'g'))).toHaveLength(1);
    });

    it('AC9: without team.invite there is no invite button and no pending row', () => {
      const html = list([john, sarah]);

      expect(html).not.toContain(copy.team.invite.title);
      expect(html).not.toContain(copy.team.invitations.status);
    });

    it('the withdraw question and the invite dialog are closed until asked for', () => {
      const html = owner();

      expect(html).not.toContain(copy.team.invitations.withdrawDialog.title);
      expect(html).not.toContain(escapeHtml(copy.team.invite.description));
    });
  });

  it('the copy has none of the forbidden words', () => {
    expect(JSON.stringify(copy.team)).not.toMatch(/\b(lid|leden|member|membership)\b/i);
  });
});
