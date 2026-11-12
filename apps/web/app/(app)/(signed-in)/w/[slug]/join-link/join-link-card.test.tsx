import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../../../test/render';
import { JoinLinkCard, shownJoinLink } from './join-link-card';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const URL_OF_THE_LINK = 'https://fivvi.app/j/7KQ2M9XA';

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F029 the Aanmeldlink page in %s', (locale) => {
  const copy = messages[locale];
  const card = (canRenew: boolean) =>
    render(locale, <JoinLinkCard workspaceId="w1" url={URL_OF_THE_LINK} canRenew={canRenew} />);

  it('AC7: shows the title, the explanation, the URL and Link kopiëren', () => {
    const html = card(false);

    expect(html).toMatch(new RegExp(`<h1[^>]*>${escapeHtml(copy.joinLink.title)}</h1>`));
    expect(html).toContain(escapeHtml(copy.joinLink.body));
    expect(html).toMatch(new RegExp(`<code[^>]*>${URL_OF_THE_LINK}</code>`));
    expect(html).toMatch(new RegExp(`<button[^>]*>${escapeHtml(copy.joinLink.copy)}</button>`));
  });

  it('AC7: the card carries the title as an h2 under the one h1', () => {
    const html = card(false);

    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<h2[^>]*>${escapeHtml(copy.joinLink.title)}</h2>`));
  });

  it('AC7: a Trainer (no join_link.renew) has no Vernieuwen', () => {
    expect(card(false)).not.toContain(escapeHtml(copy.joinLink.renew));
  });

  it('AC6: the Owner has Vernieuwen, and no dialog is open before it is chosen', () => {
    const html = card(true);

    expect(html).toMatch(new RegExp(`<button[^>]*>${escapeHtml(copy.joinLink.renew)}</button>`));
    expect(html).not.toContain(escapeHtml(copy.joinLink.renewDialog.title));
    expect(html).not.toContain(escapeHtml(copy.joinLink.copied));
  });
});

describe('F029 the URL the card shows after a renewal', () => {
  const renewal = { from: 'https://fivvi.app/j/OLDOLD11', to: 'https://fivvi.app/j/NEWNEW22' };

  it('AC6: shows the renewed URL while the server still gives the one it replaced', () => {
    expect(shownJoinLink(renewal, renewal.from)).toBe(renewal.to);
  });

  it('AC6: a re-render with a new server url shows the server value, not the renewal', () => {
    expect(shownJoinLink(renewal, 'https://fivvi.app/j/SERVER33')).toBe(
      'https://fivvi.app/j/SERVER33',
    );
  });

  it('AC7: without a renewal the server url is shown', () => {
    expect(shownJoinLink(null, URL_OF_THE_LINK)).toBe(URL_OF_THE_LINK);
  });
});
