import { Img, Link, Text } from 'react-email';
import { describe, expect, it } from 'vitest';
import type { EmailTemplate } from './render.tsx';
import {
  checkContent,
  checkLinks,
  checkRendering,
  checkUrl,
  maxSubjectLength,
  messageArguments,
} from './template-checks.ts';

// F049 (#719): the checks of the catalog suite, tested against templates that break each rule on
// purpose. `catalog.test.ts` runs the same checks on every real template.
interface Props {
  name: string;
  nameEn: string | null;
  url: string;
}

const goodProps: Props = { name: 'Anna', nameEn: null, url: 'https://fivvi.app/home' };

/** A well-behaved template; each test overrides one part. */
const good: EmailTemplate<Props> = {
  id: 'checks-test',
  subject: (ctx) => ctx.t('email.hello.subject'),
  preview: (ctx) => ctx.t('email.hello.preview'),
  render: (ctx, { name, url }) => (
    <>
      <Text>{ctx.t('email.hello.greeting', { firstName: name })}</Text>
      <Link href={url}>{ctx.t('email.frame.button')}</Link>
    </>
  ),
  userContent: ['name'],
  previewProps: goodProps,
};

const leakedKey = 'email.hello.body';
const leakedPlaceholder = '{firstName}';
const unrelatedText = 'unrelated';

const withTemplate = (override: Partial<EmailTemplate<Props>>): EmailTemplate<Props> => ({
  ...good,
  ...override,
});

describe('AC2: checkRendering', () => {
  it('passes a template that renders from catalog keys in both languages', async () => {
    expect(await checkRendering(good)).toEqual([]);
  });

  it('reports a subject over the limit, in the language where it is too long', async () => {
    expect(maxSubjectLength).toBe(78);
    const long = withTemplate({
      subject: (ctx) => `${ctx.t('email.hello.subject')} ${'x'.repeat(maxSubjectLength)}`,
    });
    const problems = await checkRendering(long);
    expect(problems).toEqual([
      expect.stringMatching(/nl-NL.*subject.*78/),
      expect.stringMatching(/en.*subject.*78/),
    ]);
  });

  it('accepts a subject of exactly 78 characters', async () => {
    const exact = withTemplate({
      subject: (ctx) => {
        const base = ctx.t('email.hello.subject');
        return base + 'x'.repeat(maxSubjectLength - base.length);
      },
    });
    expect(await checkRendering(exact)).toEqual([]);
  });

  it('reports a subject or a preview line that is literal text, not a catalog key', async () => {
    const literalSubject = withTemplate({ subject: () => 'Literal subject' });
    expect((await checkRendering(literalSubject)).join('\n')).toMatch(
      /nl-NL: the subject asks for no catalog key/,
    );
    const literalPreview = withTemplate({ preview: () => 'Literal preview' });
    const problems = (await checkRendering(literalPreview)).join('\n');
    expect(problems).toMatch(/nl-NL: the preview asks for no catalog key/);
    expect(problems).toMatch(/en: the preview asks for no catalog key/);
  });

  it('reports a template that cannot render (a missing key or placeholder)', async () => {
    const broken = withTemplate({
      render: (ctx) => <Text>{ctx.t('email.hello.greeting')}</Text>,
    });
    const problems = await checkRendering(broken);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/nl-NL.*does not render/);
  });

  it('reports an empty subject', async () => {
    const empty = withTemplate({ subject: () => '  ' });
    expect((await checkRendering(empty)).join('\n')).toMatch(/subject is empty/);
  });

  it('reports a template that uses different keys per language', async () => {
    const uneven = withTemplate({
      render: (ctx, { name }) =>
        ctx.locale === 'en' ? (
          <Text>{ctx.t('email.hello.greeting', { firstName: name })}</Text>
        ) : (
          <Text>{ctx.t('email.hello.body')}</Text>
        ),
    });
    expect((await checkRendering(uneven)).join('\n')).toMatch(/different keys.*email\.hello\./);
  });

  it('reports a template that leaves a key or a placeholder in the output', async () => {
    const leaky = withTemplate({
      render: () => (
        <>
          <Text>{leakedKey}</Text>
          <Text>{leakedPlaceholder}</Text>
        </>
      ),
    });
    expect((await checkRendering(leaky)).join('\n')).toMatch(/unformatted/);
  });
});

describe('AC2: messageArguments', () => {
  it('lists the placeholders of a message, including those inside a plural', () => {
    expect(
      messageArguments('Hoi {name}, je hebt {count, plural, one {# les} other {# lessen}}'),
    ).toEqual(['count', 'name']);
    expect(messageArguments('geen placeholders')).toEqual([]);
    expect(messageArguments('{b} {a} {b}')).toEqual(['a', 'b']);
  });

  it('does not take the text of a plural branch for a placeholder', () => {
    expect(messageArguments('{n, plural, one {item} other {items}}')).toEqual(['n']);
  });
});

// Built, not typed: the file-email scan reads `user@host` in a test as an email address.
const withCredentials = Object.assign(new URL('https://fivvi.app/home'), { username: 'user' }).href;

describe('AC5: checkUrl', () => {
  it.each([
    'https://fivvi.app/home',
    'https://fivvi.app/bookings?week=2026-39',
    'https://fivvi.app/login/confirm?token=abc',
  ])('accepts %s', (url) => {
    expect(checkUrl(url, { allowMailto: false })).toBeUndefined();
  });

  it.each([
    ['http://fivvi.app/home', /https/],
    ['https://example.com/home', /fivvi\.app/],
    ['https://www.fivvi.app/home', /fivvi\.app/],
    ['https://fivvi.app.evil.example/home', /fivvi\.app/],
    [withCredentials, /credentials/],
    ['https://fivvi.app:8443/home', /port/],
    ['//fivvi.app/home', /relative|absolute/],
    ['/home', /relative|absolute/],
    ['https://fivvi.app/home?utm_source=mail', /tracking/],
    ['https://fivvi.app/home?redirect=https://fivvi.app', /redirect/],
    ['https://fivvi.app/out?url=%2Fhome', /redirect/],
    ['https://fivvi.app/home?next=https%3A%2F%2Fexample.com', /another address/],
    ['https://fivvi.app/click/abc123', /tracker/],
    ['https://fivvi.app/track/open.gif', /tracker/],
    ['https://fivvi.app/r/abc', /tracker/],
    ['javascript:alert(1)', /scheme|https/],
    ['tel:+31612345678', /scheme|https/],
  ])('rejects %s', (url, reason) => {
    expect(checkUrl(url, { allowMailto: false })).toMatch(reason);
  });

  it('allows a mailto link only where asked', () => {
    expect(checkUrl('mailto:anna@example.com', { allowMailto: true })).toBeUndefined();
    expect(checkUrl('mailto:anna@example.com', { allowMailto: false })).toMatch(/mailto/);
  });
});

describe('AC5: checkLinks', () => {
  it('passes a template whose links all go to fivvi.app', async () => {
    expect(await checkLinks(good, { allowMailto: false })).toEqual([]);
  });

  it('reports a link to another host, in the HTML and in the text', async () => {
    const away = withTemplate({ previewProps: { ...goodProps, url: 'https://example.com/x' } });
    const problems = await checkLinks(away, { allowMailto: false });
    expect(problems.length).toBeGreaterThanOrEqual(4);
    expect(problems.join('\n')).toMatch(/html/);
    expect(problems.join('\n')).toMatch(/text/);
  });

  it('reports a link that goes through a tracker', async () => {
    const tracked = withTemplate({
      previewProps: { ...goodProps, url: 'https://fivvi.app/home?utm_campaign=a&utm_medium=b' },
    });
    expect((await checkLinks(tracked, { allowMailto: false })).join('\n')).toMatch(/tracking/);
  });

  it('reports a tracking pixel, a script and a remote stylesheet', async () => {
    const pixel = withTemplate({
      render: () => <Img src="https://fivvi.app/p.gif" width="1" height="1" alt="" />,
    });
    expect((await checkLinks(pixel, { allowMailto: false })).join('\n')).toMatch(/pixel/);

    const bigImage = withTemplate({
      render: () => <Img src="https://fivvi.app/logo.png" width="200" height="40" alt="" />,
    });
    expect(await checkLinks(bigImage, { allowMailto: false })).toEqual([]);

    const remoteImage = withTemplate({
      render: () => <Img src="https://cdn.example.com/logo.png" width="200" height="40" alt="" />,
    });
    expect((await checkLinks(remoteImage, { allowMailto: false })).join('\n')).toMatch(
      /fivvi\.app/,
    );
  });

  it('reports a mailto link unless it is allowed', async () => {
    const mail = withTemplate({
      previewProps: { ...goodProps, url: 'mailto:anna@example.com' },
    });
    expect((await checkLinks(mail, { allowMailto: false })).join('\n')).toMatch(/mailto/);
    expect(await checkLinks(mail, { allowMailto: true })).toEqual([]);
  });
});

describe('AC6: checkContent', () => {
  it('passes a template that shows user content as typed', async () => {
    expect(await checkContent(good)).toEqual([]);
  });

  it('reports content that reaches the HTML unescaped', async () => {
    const unsafe = withTemplate({
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the test needs a template that does not escape
      render: (_ctx, { name }) => <div dangerouslySetInnerHTML={{ __html: name }} />,
    });
    expect((await checkContent(unsafe)).join('\n')).toMatch(/not escaped/);
  });

  it('reports content that is not shown at all', async () => {
    const hidden = withTemplate({ render: () => <Text>{unrelatedText}</Text> });
    expect((await checkContent(hidden)).join('\n')).toMatch(/not shown/);
  });

  it('reports content that is changed on the way (translated or reformatted)', async () => {
    const changed = withTemplate({
      render: (ctx, { name }) => <Text>{ctx.locale === 'en' ? name.toUpperCase() : name}</Text>,
    });
    expect((await checkContent(changed)).join('\n')).toMatch(/as typed/);
  });

  it('checks a name with a Dutch and an English text by the content-language rule', async () => {
    const named = withTemplate({
      render: (ctx, { name, nameEn }) => <Text>{ctx.pickContent(name, nameEn)}</Text>,
      userContent: [{ nl: 'name', en: 'nameEn' }],
    });
    expect(await checkContent(named)).toEqual([]);
  });

  it('reports a name that ignores the English text, or shows both', async () => {
    const dutchOnly = withTemplate({
      render: (_ctx, { name }) => <Text>{name}</Text>,
      userContent: [{ nl: 'name', en: 'nameEn' }],
    });
    expect((await checkContent(dutchOnly)).join('\n')).toMatch(/en.*English/);

    const both = withTemplate({
      render: (_ctx, { name, nameEn }) => (
        <Text>
          {name} {nameEn}
        </Text>
      ),
      userContent: [{ nl: 'name', en: 'nameEn' }],
    });
    expect((await checkContent(both)).join('\n')).toMatch(/nl-NL.*English/);
  });
});
