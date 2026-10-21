import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import type { Greeting } from '../server/greeting';
import { escapeHtml, render } from '../test/render';
import { Hello } from './hello';
import NotFound from './not-found';

/** What `GET /v1/hello` answers with the migrated hello row. */
const helloTitle: Greeting = { status: 'loaded', key: 'hello.title' };

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('E005 web pages in %s', (locale) => {
  it('renders the translated hello title on the home page', () => {
    expect(render(locale, <Hello greeting={helloTitle} firstName="" />)).toContain(
      `<h1>${messages[locale].hello.title}</h1>`,
    );
  });

  it('renders the translated not-found page', () => {
    const { title, body } = messages[locale].notFound;
    expect(render(locale, <NotFound />)).toBe(
      `<main><h1>${title}</h1><p>${escapeHtml(body)}</p></main>`,
    );
  });
});

describe.each(locales)('E007 hello page in %s', (locale) => {
  it('labels the first-name form with catalog copy', () => {
    const { description, firstNameLabel, continue: submit } = messages[locale].hello;
    const html = render(locale, <Hello greeting={helloTitle} firstName="" />);
    expect(html).toContain(`>${escapeHtml(description)}</div>`);
    expect(html).toMatch(
      new RegExp(`<label[^>]*for="first-name"[^>]*>${htmlPattern(firstNameLabel)}</label>`),
    );
    expect(html).toMatch(
      new RegExp(`<button[^>]*type="submit"[^>]*>${htmlPattern(submit)}</button>`),
    );
    expect(html).not.toContain('role="status"');
  });

  it('greets the first name sent by the form', () => {
    const greeting = messages[locale].hello.formGreeting.replace('{name}', 'Sam');
    expect(render(locale, <Hello greeting={helloTitle} firstName="Sam" />)).toContain(
      `<p role="status">${escapeHtml(greeting)}</p>`,
    );
  });
});

describe.each(locales)('E018 hello page greeting in %s (#94)', (locale) => {
  it('renders the key the API sent as the heading, not a fixed key', () => {
    const html = render(
      locale,
      <Hello greeting={{ status: 'loaded', key: 'notFound.title' }} firstName="" />,
    );

    expect(html).toContain(`<h1>${messages[locale].notFound.title}</h1>`);
    expect(html).not.toContain(messages[locale].hello.title);
    expect(html).not.toContain('role="alert"');
  });

  it('shows the translated error instead of a heading when the greeting failed', () => {
    const html = render(locale, <Hello greeting={{ status: 'failed' }} firstName="" />);

    expect(html).toContain(`<p role="alert">${escapeHtml(messages[locale].hello.error)}</p>`);
    expect(html).not.toContain('<h1');
    // The form still works, and sending it loads the page, and the greeting, again.
    expect(html).toContain('for="first-name"');
  });
});

/** A regular expression source that matches the text as React renders it in HTML. */
function htmlPattern(text: string): string {
  return escapeHtml(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
