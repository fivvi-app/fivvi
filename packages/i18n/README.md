# @trainer-hub/i18n

The single source of every user-facing string (ADR-008). `nl-NL.json` and `en.json` hold ICU MessageFormat messages. The web reads them through next-intl; iOS and Android get catalogs generated from them. Terminology and tone: [`GLOSSARY.md`](GLOSSARY.md).

| File | What |
|---|---|
| `nl-NL.json`, `en.json` | The catalogs. Dutch is the source language and the final fallback |
| `comments.json` | Optional translator context per key (`"hello.greeting": "…"`), passed on to both native catalogs |
| `generated/ios/Localizable.xcstrings` | iOS String Catalog. **Generated, never edit** |
| `generated/android/values*/strings.xml` | Android resources (`values/` = nl-NL, `values-en/` = en). **Generated, never edit** |
| `src/index.ts` | Runtime exports: `locales`, `defaultLocale`, `messages`, `MessageKey`, `formattingLocales`, `dateTimeFormats`, `resolveLocale` |
| `src/tools/` | Checks and exporters (Node only) |
| `lint/no-hard-coded-jsx-text.grit` | Biome plugin that fails on literal text in JSX |

## Adding or changing a string

1. Add the key to **both** `nl-NL.json` and `en.json`, following `GLOSSARY.md §6`. Add context to `comments.json` when the string is ambiguous.
2. `pnpm --filter @trainer-hub/i18n generate` and commit the regenerated `generated/` files.
3. `pnpm check` must pass.

**Keys** are dot paths grouped by screen or feature: `hello.title`, `notFound.body`, `booking.spotsAvailable`. Every segment is lowerCamelCase (`[a-z][a-zA-Z0-9]*`) and every key has at least two segments. Name keys after the English glossary term (`GLOSSARY.md §6.3`). The same key is used on iOS (`"hello.title"`); Android turns it into snake_case (`hello_title`, `not_found_body`).

## Supported ICU

The exporters only accept ICU that maps cleanly to Apple and Android formats, and the `icu` check fails on anything else:

| ICU | Web | iOS (`.xcstrings`) | Android |
|---|---|---|---|
| `{name}` | as is | `%1$@` | `%1$s` |
| `{count, plural, one {# …} other {# …}}` | as is | substitution `%1$#@count@`, `#` → `%arg`, `formatSpecifier` `lld` | `<plurals>`, `#` → `%1$d` |
| Literal `%` | as is | `%%` in strings with placeholders | `%%` in strings with placeholders; `formatted="false"` otherwise |
| `''`, `'{'` (ICU quoting) | as is | unescaped | unescaped, then escaped for aapt2 (`\'`, `\"`, `\\`, `&amp;`, …) |

- **Placeholder positions follow the alphabetical order of their names**, not the order in the sentence: `{time} … {date}` is `%2$@ … %1$@`. Rewording a translation never changes a native call site. Both locales must use the same placeholders (`parity` check).
- **At most one plural per message**, cardinal, with exactly the locale's categories (`one` and `other` for nl and en). Android selects one item for the whole string, so the text around the plural is repeated in every item.
- **Not supported:** `=0` / `=1` exact selectors (Android ignores them in nl and en; use a separate key such as `hello.noSessionsToday` and choose in code), `select`, `selectordinal`, `offset`, nested plurals, `{n, number}`, `{d, date}`, `{t, time}` and rich-text tags.

## Dates, times and numbers

Format in code, in the workspace time zone, and pass the result as a plain placeholder (`GLOSSARY.md §3.1`). `dateTimeFormats` holds the shared options:

```ts
t('hello.nextSession', {
  date: format.dateTime(start, 'date'), // dinsdag 22 september · Tuesday 22 September
  time: format.dateTime(start, 'time'), // 18:00
});
```

The `en` catalog formats as **`en-GB`** (`formattingLocales`), so English gets day-month order and 24-hour time. Native apps must apply the same mapping when they build their formatters.

## Locales

`resolveLocale()` implements the order used on every platform: explicit user choice → stored preference → workspace default → device/browser → `nl-NL`. Any `nl-*` tag matches `nl-NL`, any `en-*` tag matches `en`.

## Web

`apps/web` uses next-intl without locale routing. `apps/web/i18n/request.ts` resolves the locale from the `NEXT_LOCALE` cookie, then `Accept-Language`, and runs next-intl on the formatting locale (`nl-NL` or `en-GB`, also used for `<html lang>`). Keys are typed: `useTranslations('hello')('title')` compiles, a missing key doesn't.

The `no-hard-coded-jsx-text` Biome plugin (registered in `apps/web/biome.json`) fails on literal text in JSX children, string and template literals rendered as children, and literals in `alt`, `title`, `placeholder`, `label` and user-facing `aria-*` attributes. It doesn't see strings outside JSX (e.g. `metadata`, custom component props or values passed through variables); review those by hand.

## Native apps (E008)

- **iOS:** add `generated/ios/Localizable.xcstrings` to the app target by reference, with `nl` as the development region. Keys are marked `extractionState: manual`, so Xcode keeps them.
- **Android:** add `packages/i18n/generated/android` as a resource directory (`sourceSets.main.res.srcDirs`).
- Both still need their own no-hard-coded-strings rules (SwiftLint / ktlint, ADR-008).

## Checks

`pnpm check` (turbo) runs `node src/cli.ts check` in this package. Run one check with `pnpm --filter @trainer-hub/i18n check:parity`, `check:icu` or `check:generated`.

| Check | Fails when |
|---|---|
| `parity` | A key exists in one locale only, the locales use different placeholders, a key name is invalid, two keys map to the same Android name, or `comments.json` names an unknown key |
| `icu` | A message doesn't parse, or uses ICU the exporters can't convert (see above) |
| `generated` | A file in `generated/` differs from what the generator writes, is missing, or shouldn't exist |
