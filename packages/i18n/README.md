# @fivvi/i18n

The single source of every user-facing string (ADR-008). `nl-NL.json` and `en.json` hold ICU MessageFormat messages. The web reads them through next-intl; iOS and Android get catalogs generated from them. Terminology and tone: [`GLOSSARY.md`](GLOSSARY.md).

| File | What |
|---|---|
| `nl-NL.json`, `en.json` | The catalogs. Dutch is the source language (`defaultLocale`); it is not the fallback for unsupported languages |
| `comments.json` | Optional translator context per key (`"hello.greeting": "…"`), passed on to both native catalogs |
| `generated/ios/Localizable.xcstrings` | iOS String Catalog. **Generated, never edit** |
| `generated/ios/InfoPlist.xcstrings` | iOS Info.plist strings: `CFBundleDisplayName` and `CFBundleName` from `app.name`, in nl and en. **Generated, never edit** |
| `generated/android/values*/strings.xml` | Android resources (`values/` = nl-NL, `values-en/` = en). **Generated, never edit** |
| `src/index.ts` | Runtime exports: `locales`, `defaultLocale`, `messages`, `MessageKey`, `formattingLocales`, `dateTimeFormats`, `resolveInterfaceLanguage`, `resolveCommunicationLanguage`, `resolveSignInCommunicationLanguage` |
| `src/tools/` | Checks and exporters (Node only) |
| `lint/no-hard-coded-jsx-text.grit` | Biome plugin that fails on literal text in JSX |

## Adding or changing a string

1. Add the key to **both** `nl-NL.json` and `en.json`, following `GLOSSARY.md §6`. Add context to `comments.json` when the string is ambiguous.
2. `pnpm --filter @fivvi/i18n generate` and commit the regenerated `generated/` files.
3. `pnpm check` must pass.

**Email copy** goes under the `email` namespace (`email.hello.subject`). It follows the same rules and checks, but the native exporters leave `email.*` out (`serverOnlyNamespaces` in `src/config.ts`), because only `packages/email` renders it.

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

Two languages, two orders ([ADR-017](../../docs/decisions/ADR-017-language-policy.md)). Web and the API resolve with these functions, and callers of `sendEmail` in `packages/email` must resolve its `locale` with `resolveCommunicationLanguage()`; the native apps mirror them with tests named after the same cases. No platform lets its resource fallback decide the language: that would give Dutch, the source language.

- **Interface language** (`resolveInterfaceLanguage()`): what a screen shows and the `locale` it sends to the API. Explicit choice (the language switch, or the OS per-app language) → stored preference → a booking link's fixed language → the first supported device/browser language, in the user's order → `en`. An empty or entirely unsupported list gives `en`. `[fr-FR, nl-BE]` gives `nl-NL`; `[de-DE, en-GB, nl-NL]` gives `en`.
- **Communication language** (`resolveCommunicationLanguage()`): the language of an email or other message. The recipient's stored preference → the workspace's default communication language. The workspace default never decides the interface language.
- **Sign-in email language** (`resolveSignInCommunicationLanguage()`, [ADR-019](../../docs/decisions/ADR-019-sign-in-communication-language.md)): an email outside a workspace has no workspace default. The recipient's stored preference → the interface language of the page that asked for the email (so itself falling back to the browser language, then `en`). The first sign-in that creates an account stores that language on it.

Any `nl-*` tag matches `nl-NL`, any `en-*` tag matches `en`, and unsupported values are skipped. The stored preference comes with F010 (M2) and booking-link languages with M6; callers pass what they have.

## Web

`apps/web` uses next-intl without locale routing. `apps/web/i18n/request.ts` resolves the interface language from the `NEXT_LOCALE` cookie, then `Accept-Language`, then `en`; for a signed-in browser the route guard (`apps/web/proxy.ts`) first rewrites that cookie to the language stored on the account (F010), and runs next-intl on the formatting locale (`nl-NL` or `en-GB`, also used for `<html lang>`). Keys are typed: `useTranslations('hello')('title')` compiles, a missing key doesn't.

The `no-hard-coded-jsx-text` Biome plugin (registered in `apps/web/biome.json`) fails on literal text in JSX children, string and template literals rendered as children, and literals in `alt`, `title`, `placeholder`, `label` and user-facing `aria-*` attributes. It doesn't see strings outside JSX (e.g. `metadata`, custom component props or values passed through variables); review those by hand.

## Native apps (E008)

- **iOS:** add `generated/ios/Localizable.xcstrings` and `generated/ios/InfoPlist.xcstrings` to the app target by reference, with `nl` as the development region. Keys are marked `extractionState: manual`, so Xcode keeps them. The display name under the app icon comes from `app.name` through `InfoPlist.xcstrings`; the generator fails when `app.name` is missing. `InfoPlist.xcstrings` also has every other localizable key of the app's Info.plist (`CFBundleName`, from `app.name` too): Xcode's string catalog sync adds a missing one on a build and rewrites the file, which `pnpm test:ios` fails on ([`apps/ios/README.md`](../../apps/ios/README.md#layout)).
- **Android:** add `packages/i18n/generated/android` as a resource directory (`sourceSets.main.res.srcDirs`). The app label is `@string/app_name`.
- No hard-coded strings: on iOS, SwiftLint's `no_literal_text` rule rejects a string literal in `Text`, `Button`, `Label` and similar views ([`apps/ios/README.md`](../../apps/ios/README.md#no-hard-coded-text)); on Android, ktlint's `fivvi:no-literal-text` rule rejects one in a Compose `Text` ([`apps/android/README.md`](../../apps/android/README.md#rules)).
- Both pick the interface language themselves, from the OS per-app language and the raw preferred-language list, as `resolveInterfaceLanguage()` does (see [Locales](#locales)). The bundle's resolved language can't be the input: it falls back to the Dutch source resources.

## Checks

`pnpm check` (turbo) runs `node src/cli.ts check` in this package. Run one check with `pnpm --filter @fivvi/i18n check:parity`, `check:icu` or `check:generated`.

| Check | Fails when |
|---|---|
| `parity` | A key exists in one locale only, the locales use different placeholders, a key name is invalid, two keys map to the same Android name, or `comments.json` names an unknown key |
| `icu` | A message doesn't parse, or uses ICU the exporters can't convert (see above) |
| `generated` | A file in `generated/` differs from what the generator writes, is missing, or shouldn't exist |
