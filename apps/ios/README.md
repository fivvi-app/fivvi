# Trainer Hub for iOS

The native iOS app (ADR-003): Swift 6 with strict concurrency, SwiftUI, iOS 17 and up, iPhone. For now it has one screen, *Hello*, which proves every layer is connected (E008, spec #34). It is the template for every later iOS screen.

```bash
scripts/bootstrap.sh --mobile   # once: checks Xcode and an iPhone simulator, installs the pinned SwiftLint
pnpm dev                        # the API, for running the app in the simulator
open apps/ios/TrainerHub.xcodeproj
pnpm test:ios                   # what the iOS CI job runs
```

## Layout

| Path | What |
|---|---|
| `TrainerHub.xcodeproj` | Xcode project with folder-synchronized groups: a file added to one of the folders below is in its target, no project generator. Shared scheme `TrainerHub` |
| `TrainerHub/` | The app target. `App/` (entry point, configuration), `Hello/` (the screen and its view model), `Language/` (interface language), `Strings/` (catalog lookup) |
| `TrainerHubTests/` | Unit tests (XCTest), hosted in the app |
| `TrainerHubUITests/` | UI tests (XCUITest) |
| `TrainerHub.xctestplan` | Runs every test twice: `nl` (region NL) and `en` (region GB), time zone Europe/Amsterdam (`TESTING.md §7.2`) |
| `Config/` | Per-configuration settings: `Debug.xcconfig` / `Release.xcconfig` and their Info.plist files |
| `lint/fixtures/` | Files that must fail SwiftLint (not in any target) |
| `.build/` | Build output, resolved packages and SwiftLint (git-ignored) |

**Dependencies** (Swift packages, pinned in `TrainerHub.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`): the generated API client `TrainerHubAPI` from [`packages/contract/swift`](../../packages/contract/README.md) as a local package, and Apple's `swift-openapi-runtime` and `swift-openapi-urlsession` for its URLSession transport. Never hand-write API calls: change the contract and regenerate.

**Strings:** `Localizable.xcstrings` and `InfoPlist.xcstrings` are referenced in place from [`packages/i18n/generated/ios`](../../packages/i18n/README.md#native-apps-e008), never copied or edited. The development region is `nl`; the localizations are `nl` and `en`. The display name under the icon, `CFBundleDisplayName`, comes from `app.name` through `InfoPlist.xcstrings`. String extraction is off (`SWIFT_EMIT_LOC_STRINGS = NO`), so Xcode never writes to the generated catalogs.

## A screen

`Hello/` is the pattern for every screen:

- A view model (`@Observable`, `@MainActor`) with a few states (`loading`, `loaded(greeting:)`, `failed`). It depends on the generated client's `APIProtocol`, which is the test seam: tests pass a stub, the app passes `Client` with `URLSessionTransport`. No hand-written wrapper.
- The view switches on the state and reads every text from `Catalog`, by `StringKey` or by a key the API sent. A key that isn't in the catalog is a failure, never a raw key on screen.
- Text uses Dynamic Type styles and wraps (`fixedSize(horizontal: false, vertical: true)` inside a `ScrollView`); buttons keep a 44 pt touch target; the screen's title has the header trait.
- Platform default colours until the token theme (#57).
- Accessibility identifiers name the elements for tests, with the same values as the Android test tags so one Maestro flow drives both apps: `hello.greeting`, `hello.loading`, `hello.error`, `hello.retry`.

## Language

The app picks its interface language itself, by ADR-017's rule, and uses it for the screen and for the `locale` it sends to the API (`Language/InterfaceLanguage.swift`, mirroring `resolveInterfaceLanguage()` in `packages/i18n`):

1. The per-app language from iOS Settings (stored as `AppleLanguages` in the app's own defaults domain).
2. The first supported language in the device's preferred list (`Locale.preferredLanguages`): any `nl-*` is `nl-NL`, any `en-*` is `en`.
3. English.

`Catalog` reads that language's `nl.lproj` or `en.lproj` directly. iOS's own choice (`Bundle.preferredLocalizations`) can't decide it: the source language is Dutch, so a German-only phone would get Dutch. Format dates and numbers with `Catalog.formattingLocale`, which the hello screen puts in SwiftUI's environment: `en` formats as `en-GB` (`packages/i18n/README.md`).

## Configuration

| | Debug | Release |
|---|---|---|
| API base URL (`TRAINER_HUB_API_BASE_URL`) | `http://localhost:3000/api`, the local dev server as the simulator sees it | The production API over HTTPS, set in `Config/Release.xcconfig` |
| Plain HTTP | Allowed to local hosts only: App Transport Security's local-networking exception (`Config/Info-Debug.plist`) | Not allowed: `Config/Info.plist` has no App Transport Security exception; `pnpm test:ios` checks this |

To run a Debug build against a preview environment or the dev server on your Mac from a phone on the LAN, create `Config/Local.xcconfig` (git-ignored) with e.g. `TRAINER_HUB_API_BASE_URL = https:/$()/<preview-domain>/api` (`//` starts a comment in an xcconfig, hence `$()`). Debug builds also accept `-TrainerHubAPIBaseURL <url>` as a launch argument; the UI tests use it.

**Identifiers:** bundle ID `nl.trainerhub.app` (provisional until the first store upload, E017). **Signing:** none in the repo. CI builds for the simulator without signing; for a real-device Debug run, choose your own Apple team under *Signing & Capabilities* in Xcode and don't commit it.

## Tests

`pnpm test:ios` (`scripts/test-ios.sh`) runs, in order, exactly what the `iOS` CI job runs:

1. SwiftLint with `--strict` on the app and its tests.
2. SwiftLint on `lint/fixtures/LiteralText.swift`, which must fail on exactly the lines marked `// expect: no_literal_text`.
3. The configurations: Debug's committed base URL is the local dev server (`http://localhost:3000/api`); Release has an `https://…/api` base URL and no App Transport Security exception.
4. A simulator build without signing, then the test plan: unit and UI tests, each in `nl` and `en`, on the newest iPhone simulator, or in a worktree on the worktree's own copy of it (`IOS_SIMULATOR="iPhone 17"` picks one by name; cleanup and `KEEP_DEVICE=1` in `TESTING.md §7.2`). Results go to `.build/TestResults.xcresult`.

- **Unit tests** (`TrainerHubTests/`): the view model against `StubAPI`, a stub of `APIProtocol` that records the requested locale; the language rule with the same cases as `packages/i18n/src/locale.test.ts`; the configuration.
- **UI tests** (`TrainerHubUITests/`): the app against `StubServer`, an HTTP server in the test runner, so a test controls the answer (greeting, error, or holding it to keep the spinner on screen) and asserts the requested `locale`. `HelloScreen.launch` sets the device languages (`-AppleLanguages`), the per-app language (a Debug-only launch argument, because UI tests can't change iOS Settings) and the text size.
- Expected copy is read from the generated catalog compiled into the test bundle (`TestCatalog`), never hard-coded. Each test-plan configuration also sets `TRAINER_HUB_TEST_LANGUAGE`; tests take the expected language from it, so a configuration whose language doesn't reach the app fails instead of testing the other language twice.
- Accessibility: `test_E008_AC7_largestTextSizeWraps` runs Xcode's accessibility audit (clipped text, Dynamic Type, hit regions) at the largest text size.

Name tests after the spec's acceptance criteria: `test_E008_AC4_retryLoadsGreeting` (`TESTING.md §5.1`).

## No hard-coded text

Every user-facing string comes from `packages/i18n` (`AGENTS.md`). SwiftLint's custom rule `no_literal_text` (`.swiftlint.yml`) fails on a string literal in `Text`, `Button`, `Label`, `Toggle`, `TextField`, `SecureField` or `Link`, and in `.navigationTitle` or an accessibility label, hint or value, and names the file and line. Pass a `String` from `Catalog` instead. The rule can't see literals passed through variables or other initialisers; review those by hand.

SwiftLint is pinned by version and SHA-256 in `scripts/_ios.sh` and downloaded to `.build/` on first use.
