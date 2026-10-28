import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { escapeHtml, render } from '../../test/render';
import { NoAccess } from './home/no-access';
import { WorkspaceHome } from './w/[slug]/workspace-home';
import { WelcomeForm } from './welcome/welcome-form';

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F002 first-run pages in %s', (locale) => {
  const copy = messages[locale];

  it('AC1: TW-11 asks for the person’s name and the name of the gym or business, with the hint and the button', () => {
    const html = render(locale, <WelcomeForm askName />);

    expect(html).toContain(`<h1>${escapeHtml(copy.welcome.title)}</h1>`);
    expect(html).toMatch(
      new RegExp(
        `<label[^>]*for="person-name"[^>]*>${pattern(copy.welcome.personNameLabel)}</label>`,
      ),
    );
    expect(html).toMatch(
      new RegExp(
        `<label[^>]*for="workspace-name"[^>]*>${pattern(copy.welcome.workspaceNameLabel)}</label>`,
      ),
    );
    expect(html).toContain(escapeHtml(copy.welcome.workspaceNameHint));
    expect(html).toMatch(
      new RegExp(`<button[^>]*type="submit"[^>]*>${pattern(copy.welcome.submit)}</button>`),
    );
    expect(html).not.toContain('role="alert"');
  });

  it('AC1: TW-11 asks for the name only when the account has none', () => {
    const html = render(locale, <WelcomeForm askName={false} />);

    expect(html).not.toContain('person-name');
    expect(html).not.toContain(escapeHtml(copy.welcome.personNameLabel));
    expect(html).toContain('for="workspace-name"');
  });

  it('AC5: the no-access page says so in plain words and offers nothing to set up', () => {
    const html = render(locale, <NoAccess />);

    expect(html).toContain(`<h1>${escapeHtml(copy.noAccess.title)}</h1>`);
    expect(html).toContain(escapeHtml(copy.noAccess.body));
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
    expect(html).not.toContain(escapeHtml(copy.welcome.submit));
  });

  it('the workspace home shows the workspace’s name as its heading', () => {
    const html = render(locale, <WorkspaceHome name="John's Gym" />);

    expect(html).toContain('<h1>John&#x27;s Gym</h1>');
    expect(html).toContain(escapeHtml(copy.workspaceHome.description));
  });
});

/** A regular expression source that matches the text as React renders it in HTML. */
function pattern(text: string): string {
  return escapeHtml(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
