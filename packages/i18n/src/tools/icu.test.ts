import { describe, expect, it } from 'vitest';
import { compileMessage } from './icu.ts';

const errorsOf = (source: string) => {
  const result = compileMessage(source, 'nl-NL');
  return result.ok ? [] : result.errors;
};

describe('E005 ICU subset for native export', () => {
  it('compiles text and placeholders, with arguments sorted by name', () => {
    expect(compileMessage('Om {time} op {date}', 'nl-NL')).toEqual({
      ok: true,
      message: {
        body: {
          kind: 'simple',
          parts: [
            { type: 'text', value: 'Om ' },
            { type: 'arg', name: 'time' },
            { type: 'text', value: ' op ' },
            { type: 'arg', name: 'date' },
          ],
        },
        args: [
          { name: 'date', type: 'string' },
          { name: 'time', type: 'string' },
        ],
      },
    });
  });

  it('compiles one plural with text around it; the plural count is an integer', () => {
    const result = compileMessage('Nog {n, plural, one {# plek} other {# plekken}}!', 'nl-NL');
    expect(result).toEqual({
      ok: true,
      message: {
        body: {
          kind: 'plural',
          arg: 'n',
          before: [{ type: 'text', value: 'Nog ' }],
          branches: {
            one: [{ type: 'count' }, { type: 'text', value: ' plek' }],
            other: [{ type: 'count' }, { type: 'text', value: ' plekken' }],
          },
          after: [{ type: 'text', value: '!' }],
        },
        args: [{ name: 'n', type: 'integer' }],
      },
    });
  });

  it('treats # outside a plural and ICU-quoted braces as text', () => {
    const result = compileMessage("Les #3 '{'x'}' is Anna''s", 'nl-NL');
    expect(result.ok && result.message.body).toEqual({
      kind: 'simple',
      parts: [{ type: 'text', value: "Les #3 {x} is Anna's" }],
    });
  });

  it.each([
    ['unclosed argument', 'Hoi {name', /invalid ICU syntax/],
    ['plural without other', '{n, plural, one {#}}', /MISSING_OTHER_CLAUSE/],
    ['plural without one', '{n, plural, other {#}}', /missing the "one" branch required for nl-NL/],
    ['category the locale lacks', '{n, plural, one {#} few {#} other {#}}', /"few" does not exist/],
    ['exact selector', '{n, plural, =0 {Vol} one {#} other {#}}', /exact plural selector "=0"/],
    ['plural offset', '{n, plural, offset:1 one {#} other {#}}', /offset/],
    [
      'two plurals',
      '{a, plural, one {#} other {#}} {b, plural, one {#} other {#}}',
      /only one plural/,
    ],
    ['nested plural', '{a, plural, one {{b, plural, one {#} other {#}}} other {#}}', /nested/],
    ['select', '{g, select, a {x} other {y}}', /select is not supported/],
    ['selectordinal', '{n, selectordinal, one {#st} other {#th}}', /selectordinal/],
    ['number', '{n, number}', /number formatting/],
    ['date', '{d, date, short}', /date formatting/],
    ['time', '{t, time}', /time formatting/],
    ['rich text', 'Lees <b>dit</b>', /rich-text tags/],
  ])('rejects %s', (_name, source, error) => {
    expect(errorsOf(source)).toContainEqual(expect.stringMatching(error));
  });
});
