import { describe, expect, it } from 'vitest';
import type { Locale } from '../config.ts';
import { analyze } from './analyze.ts';
import { renderStringsXml } from './android.ts';
import { CatalogError, renderNativeCatalogs } from './generate.ts';
import { catalogSet } from './testing.ts';
import { renderInfoPlistXcstrings, renderXcstrings } from './xcstrings.ts';

type FlatMessages = Record<string, string>;

function analysisOf(nl: FlatMessages, en: FlatMessages = nl, comments = {}) {
  const analysis = analyze(catalogSet(nl, en, comments));
  expect([...analysis.parity, ...analysis.icu]).toEqual([]);
  return analysis;
}

/** The body of `<resources>` without the header, one trimmed line per entry. */
function android(nl: FlatMessages, en: FlatMessages = nl, locale: Locale = 'nl-NL', comments = {}) {
  const xml = renderStringsXml(analysisOf(nl, en, comments), locale);
  return xml
    .split('\n')
    .slice(3, -2)
    .map((line) => line.trim());
}

interface XcLocalization {
  stringUnit: { state: string; value: string };
  substitutions?: Record<
    string,
    {
      argNum: number;
      formatSpecifier: string;
      variations: { plural: Record<string, { stringUnit: { value: string } }> };
    }
  >;
}

interface XcCatalog {
  sourceLanguage: string;
  version: string;
  strings: Record<
    string,
    { comment?: string; extractionState: string; localizations: Record<string, XcLocalization> }
  >;
}

function xcstrings(nl: FlatMessages, en: FlatMessages = nl, comments = {}): XcCatalog {
  return JSON.parse(renderXcstrings(analysisOf(nl, en, comments)));
}

describe('E005 Android strings.xml exporter', () => {
  it('writes plain strings with snake_case resource names in key order', () => {
    expect(android({ 'notFound.title': 'Pagina niet gevonden', 'hello.title': 'Welkom' })).toEqual([
      '<string name="hello_title">Welkom</string>',
      '<string name="not_found_title">Pagina niet gevonden</string>',
    ]);
  });

  it('writes the locale header and valid XML shell', () => {
    const xml = renderStringsXml(analysisOf({ 'a.b': 'x' }), 'en');
    expect(xml).toMatch(
      /^<\?xml version="1\.0" encoding="utf-8"\?>\n<!-- Generated .* en\.json\. /,
    );
    expect(xml).toMatch(/<resources>\n.*\n<\/resources>\n$/s);
  });

  describe('plurals', () => {
    it('maps each plural category to an item and # to an integer placeholder', () => {
      expect(
        android({
          'hello.sessionsToday':
            '{count, plural, one {Je hebt vandaag # sessie.} other {Je hebt vandaag # sessies.}}',
        }),
      ).toEqual([
        '<plurals name="hello_sessions_today">',
        '<item quantity="one">Je hebt vandaag %1$d sessie.</item>',
        '<item quantity="other">Je hebt vandaag %1$d sessies.</item>',
        '</plurals>',
      ]);
    });

    it('repeats the text around the plural in every item', () => {
      expect(
        android({
          'class.spots': '{name}: nog {count, plural, one {# plek} other {# plekken}} vrij',
        }),
      ).toEqual([
        '<plurals name="class_spots">',
        '<item quantity="one">%2$s: nog %1$d plek vrij</item>',
        '<item quantity="other">%2$s: nog %1$d plekken vrij</item>',
        '</plurals>',
      ]);
    });

    it('supports placeholders inside the branches and the count used as a plain placeholder', () => {
      expect(
        android({
          'class.spots':
            '{count, plural, one {{count} plek bij {trainer}} other {# plekken bij {trainer}}}',
        }),
      ).toEqual([
        '<plurals name="class_spots">',
        '<item quantity="one">%1$d plek bij %2$s</item>',
        '<item quantity="other">%1$d plekken bij %2$s</item>',
        '</plurals>',
      ]);
    });
  });

  describe('placeholders', () => {
    it('numbers arguments by name, so both locales use the same positions whatever the word order', () => {
      const nl = { 'hello.next': 'Om {time} op {date}' };
      const en = { 'hello.next': 'On {date} at {time}' };
      expect(android(nl, en, 'nl-NL')).toEqual([
        '<string name="hello_next">Om %2$s op %1$s</string>',
      ]);
      expect(android(nl, en, 'en')).toEqual(['<string name="hello_next">On %1$s at %2$s</string>']);
    });
  });

  describe('escaping', () => {
    it.each([
      ['apostrophe', "Anna's agenda", "Anna\\'s agenda"],
      ['double quote', 'Zeg "hoi"', 'Zeg \\"hoi\\"'],
      ['backslash', 'a\\b', 'a\\\\b'],
      ['XML characters', 'A & B < 3 > 2', 'A &amp; B &lt; 3 &gt; 2'],
      ['newline and tab', 'Regel 1\nRegel 2\tx', 'Regel 1\\nRegel 2\\tx'],
      ['leading @', '@trainer', '\\@trainer'],
      ['leading ?', '?vraag', '\\?vraag'],
      ['@ elsewhere', 'mail@example.com', 'mail@example.com'],
      ['spaces aapt2 would collapse', ' a  b ', '\\u0020a \\u0020b\\u0020'],
      ['non-ASCII', 'Privé… 62,5 kg × 8', 'Privé… 62,5 kg × 8'],
    ])('escapes %s', (_name, source, expected) => {
      expect(android({ 'x.y': source })).toEqual([`<string name="x_y">${expected}</string>`]);
    });

    it('unescapes ICU quoting before escaping for Android', () => {
      expect(android({ 'x.y': "It''s '{'literal'}'" })).toEqual([
        `<string name="x_y">It\\'s {literal}</string>`,
      ]);
    });

    it('keeps % literal and marks the string unformatted when it has no arguments', () => {
      expect(android({ 'x.y': '50% korting, 100% zeker' })).toEqual([
        '<string name="x_y" formatted="false">50% korting, 100% zeker</string>',
      ]);
    });

    it('doubles % in strings with arguments and in plurals', () => {
      expect(
        android({
          'x.y': '{name} krijgt 50% korting',
          'x.z': '{n, plural, one {# keer 10%} other {# keer 10%}}',
        }),
      ).toEqual([
        '<string name="x_y">%1$s krijgt 50%% korting</string>',
        '<plurals name="x_z">',
        '<item quantity="one">%1$d keer 10%%</item>',
        '<item quantity="other">%1$d keer 10%%</item>',
        '</plurals>',
      ]);
    });
  });

  it('adds translator comments to the source locale only, without breaking the XML comment', () => {
    const comments = { 'x.y': 'Button -- dismisses the dialog' };
    expect(android({ 'x.y': 'Annuleren' }, { 'x.y': 'Cancel' }, 'nl-NL', comments)).toEqual([
      '<!-- Button - - dismisses the dialog -->',
      '<string name="x_y">Annuleren</string>',
    ]);
    expect(android({ 'x.y': 'Annuleren' }, { 'x.y': 'Cancel' }, 'en', comments)).toEqual([
      '<string name="x_y">Cancel</string>',
    ]);
  });
});

describe('E005 iOS String Catalog exporter', () => {
  it('writes a catalog with nl as source language, en and nl localizations and manual keys', () => {
    const catalog = xcstrings({ 'hello.title': 'Welkom' }, { 'hello.title': 'Welcome' });
    expect(catalog.sourceLanguage).toBe('nl');
    expect(catalog.version).toBe('1.0');
    expect(catalog.strings['hello.title']).toEqual({
      extractionState: 'manual',
      localizations: {
        en: { stringUnit: { state: 'translated', value: 'Welcome' } },
        nl: { stringUnit: { state: 'translated', value: 'Welkom' } },
      },
    });
  });

  it("uses Xcode's JSON layout", () => {
    const text = renderXcstrings(analysisOf({ 'a.b': 'x' }));
    expect(text).toMatch(/^\{\n {2}"sourceLanguage" : "nl",\n {2}"strings" : \{\n/);
    expect(text.endsWith('\n  "version" : "1.0"\n}\n')).toBe(true);
  });

  describe('plurals', () => {
    it('maps a plural to a substitution with one variation per category and # to %arg', () => {
      const catalog = xcstrings(
        { 'hello.sessionsToday': '{count, plural, one {# sessie} other {# sessies}} vandaag' },
        { 'hello.sessionsToday': '{count, plural, one {# session} other {# sessions}} today' },
      );
      expect(catalog.strings['hello.sessionsToday']?.localizations.nl).toEqual({
        stringUnit: { state: 'translated', value: '%1$#@count@ vandaag' },
        substitutions: {
          count: {
            argNum: 1,
            formatSpecifier: 'lld',
            variations: {
              plural: {
                one: { stringUnit: { state: 'translated', value: '%arg sessie' } },
                other: { stringUnit: { state: 'translated', value: '%arg sessies' } },
              },
            },
          },
        },
      });
    });

    it('keeps other placeholders positional, inside and outside the branches', () => {
      const catalog = xcstrings({
        'class.spots':
          '{trainer}: {count, plural, one {{count} plek bij {trainer}} other {# plekken bij {trainer}}}',
      });
      const nl = catalog.strings['class.spots']?.localizations.nl;
      expect(nl?.stringUnit.value).toBe('%2$@: %1$#@count@');
      expect(nl?.substitutions?.count?.argNum).toBe(1);
      expect(nl?.substitutions?.count?.variations.plural.one?.stringUnit.value).toBe(
        '%arg plek bij %2$@',
      );
      expect(nl?.substitutions?.count?.variations.plural.other?.stringUnit.value).toBe(
        '%arg plekken bij %2$@',
      );
    });
  });

  describe('placeholders', () => {
    it('numbers arguments by name, so both locales use the same positions whatever the word order', () => {
      const catalog = xcstrings(
        { 'hello.next': 'Om {time} op {date}' },
        { 'hello.next': 'On {date} at {time}' },
      );
      const localizations = catalog.strings['hello.next']?.localizations;
      expect(localizations?.nl?.stringUnit.value).toBe('Om %2$@ op %1$@');
      expect(localizations?.en?.stringUnit.value).toBe('On %1$@ at %2$@');
    });
  });

  describe('escaping', () => {
    it('keeps % literal when the string has no arguments', () => {
      const catalog = xcstrings({ 'x.y': '100% zeker' });
      expect(catalog.strings['x.y']?.localizations.nl?.stringUnit.value).toBe('100% zeker');
    });

    it('doubles % when the string has arguments, including plural variations', () => {
      const catalog = xcstrings({
        'x.y': '{name} krijgt 50% korting',
        'x.z': '{n, plural, one {# keer 10%} other {# keer 10%}}',
      });
      expect(catalog.strings['x.y']?.localizations.nl?.stringUnit.value).toBe(
        '%1$@ krijgt 50%% korting',
      );
      expect(
        catalog.strings['x.z']?.localizations.nl?.substitutions?.n?.variations.plural.one
          ?.stringUnit.value,
      ).toBe('%arg keer 10%%');
    });

    it('round-trips quotes, backslashes, newlines and ICU quoting through the JSON', () => {
      const catalog = xcstrings({ 'x.y': "Zeg \"hoi\" \\ Anna's '{'x'}'\nregel 2" });
      expect(catalog.strings['x.y']?.localizations.nl?.stringUnit.value).toBe(
        'Zeg "hoi" \\ Anna\'s {x}\nregel 2',
      );
    });
  });

  it('passes translator comments on', () => {
    const catalog = xcstrings(
      { 'x.y': 'Annuleren' },
      { 'x.y': 'Cancel' },
      {
        'x.y': 'Dismisses the dialog',
      },
    );
    expect(catalog.strings['x.y']?.comment).toBe('Dismisses the dialog');
  });
});

describe('E008 iOS InfoPlist String Catalog exporter', () => {
  const nl = { 'app.name': 'Sportapp', 'hello.title': 'Welkom' };
  const en = { 'app.name': 'Sports app', 'hello.title': 'Welcome' };

  function infoPlist(comments = {}): XcCatalog {
    return JSON.parse(renderInfoPlistXcstrings(analysisOf(nl, en, comments)));
  }

  const appName = {
    extractionState: 'manual',
    localizations: {
      en: { stringUnit: { state: 'translated', value: 'Sports app' } },
      nl: { stringUnit: { state: 'translated', value: 'Sportapp' } },
    },
  };

  // Xcode's string catalog sync (an Xcode build, `xcodebuild -exportLocalizations`) adds every localizable key of the
  // app's Info.plist that the catalog lacks, as an `extracted_with_value` entry with only the source language: a
  // tracked file changes on every build. A `manual` entry with both languages is one Xcode leaves alone.
  it('AC8, #95: writes CFBundleDisplayName and CFBundleName from app.name in nl and en, and nothing else', () => {
    const catalog = infoPlist();
    expect(catalog.sourceLanguage).toBe('nl');
    expect(catalog.version).toBe('1.0');
    expect(catalog.strings).toEqual({ CFBundleDisplayName: appName, CFBundleName: appName });
  });

  it("#95: uses Xcode's JSON layout, keys sorted as Xcode writes them", () => {
    const text = renderInfoPlistXcstrings(analysisOf(nl, en));
    expect(text).toMatch(/^\{\n {2}"sourceLanguage" : "nl",\n {2}"strings" : \{\n/);
    expect(text).toMatch(
      /\n {4}"CFBundleDisplayName" : \{\n[\s\S]*\n {4}\},\n {4}"CFBundleName" : \{\n/,
    );
    expect(text.endsWith('\n  "version" : "1.0"\n}\n')).toBe(true);
  });

  it("passes app.name's translator comment on", () => {
    const catalog = infoPlist({ 'app.name': 'Name under the app icon' });
    expect(catalog.strings.CFBundleDisplayName?.comment).toBe('Name under the app icon');
    expect(catalog.strings.CFBundleName?.comment).toBe('Name under the app icon');
  });

  it('is written as generated/ios/InfoPlist.xcstrings next to the other native catalogs', () => {
    const files = renderNativeCatalogs(analysisOf(nl, en));
    expect([...files.keys()]).toEqual([
      'generated/ios/Localizable.xcstrings',
      'generated/ios/InfoPlist.xcstrings',
      'generated/android/values/strings.xml',
      'generated/android/values-en/strings.xml',
    ]);
    expect(files.get('generated/ios/InfoPlist.xcstrings')).toBe(
      renderInfoPlistXcstrings(analysisOf(nl, en)),
    );
  });

  it('refuses to render the native catalogs without app.name', () => {
    expect(() =>
      renderNativeCatalogs(analysisOf({ 'hello.title': 'Welkom' }, { 'hello.title': 'Welcome' })),
    ).toThrow(
      new CatalogError([
        '"app.name" is missing: it is the native app name (iOS CFBundleDisplayName and CFBundleName, Android app label)',
      ]),
    );
  });
});

describe('E006 server-only namespaces', () => {
  const nl = {
    'app.name': 'Fivvi',
    'hello.title': 'Welkom',
    'email.hello.subject': 'Testbericht',
  };
  const en = {
    'app.name': 'Fivvi',
    'hello.title': 'Welcome',
    'email.hello.subject': 'Test message',
  };

  it('leaves email keys out of the iOS and Android catalogs', () => {
    const files = renderNativeCatalogs(analysisOf(nl, en));
    expect(files.size).toBe(4);
    for (const [file, content] of files) {
      if (!file.endsWith('InfoPlist.xcstrings')) expect(content, file).toContain('Wel');
      expect(content, file).not.toContain('Test');
      expect(content, file).not.toContain('email');
    }
  });

  it('still checks email keys for parity', () => {
    const analysis = analyze(catalogSet(nl, { 'app.name': 'Fivvi', 'hello.title': 'Welcome' }));
    expect(analysis.parity).toEqual([
      '"email.hello.subject" is in nl-NL.json but missing from en.json',
    ]);
  });
});
